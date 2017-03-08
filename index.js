var Botkit = require('botkit');
var fs = require('fs');
var url = require('url');
var wordsToNumbers = require('words-to-numbers').wordsToNumbers;
var firebase = require('firebase').initializeApp({
	apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
    databaseURL: process.env.DATABASE_URL,
    storageBucket: process.env.STORAGE_BUCKET
});
var controller = Botkit.facebookbot({
    access_token: process.env.PAGE_ACCESS_TOKEN,
    verify_token: process.env.VERIFY_TOKEN
});

var bot = controller.spawn({
});

var date = new Date()
var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
var currentDate = monthNames[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear()
var currentMonday = formatMondayDate(date)

function formatMondayDate(date) {
	return monthNames[getMonday(date).getMonth()] + ' ' + getMonday(date).getDate() + ', ' + getMonday(date).getFullYear()
}

function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day == 0 ? -6:1);
  return new Date(d.setDate(diff));
}

var SpotifyWebApi = require('spotify-web-api-node');
var spotifyApi = new SpotifyWebApi({
	clientId : process.env.SPOTIFY_CLIENT_ID,
	clientSecret : process.env.SPOTIFY_CLIENT_SECRET,
  	redirectUri : process.env.SPOTIFY_REDIRECT_URI
});

function signIntoSpotify(message) {
	setupSpotifyCredentials(message.user, function(authorizeURL) {
		var attachment = {
			'type': 'template',
				'payload': {
				'template_type': 'generic',
				'elements': [{
					'title': 'Sign into Spotify',
					'image_url': 'https://discover-messenger.herokuapp.com/default.jpg',
					'subtitle': "Let's start the music exploration",
					'buttons': [{
						'type': 'web_url',
						'url': authorizeURL,
						'title': 'Sign in'
					}]
				}]
			}
		};

	    bot.reply(message, {
	        attachment: attachment
	    });
	});
}

function setupSpotifyCredentials(state, callback) {
	var scopes = [
		'user-read-email',
		'user-top-read',
		'playlist-read-private',
		'playlist-read-collaborative',
		'playlist-modify-public',
		'playlist-modify-private'
	],
	redirectUri = process.env.SPOTIFY_REDIRECT_URI,
	clientId = process.env.SPOTIFY_CLIENT_ID,
	state = state;
	 
	var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
	callback(authorizeURL)
}

function spotifyRefreshToken(userId) {
	var ref = firebase.database().ref('/users/messenger/' + userId)
	ref.once('value', function(data) {
		var spotifyId = data.val().spotify.id
		var accessToken = data.val().spotify.accessToken
		var refreshToken = data.val().spotify.refreshToken

		spotifyApi.setAccessToken(accessToken)
		spotifyApi.setRefreshToken(refreshToken)
		spotifyApi.refreshAccessToken()
		.then(function(data) {
			console.log('The access token has been refreshed!');
			var accessToken = data.body.access_token
			
			var spotify = {
				accessToken: accessToken
		    };
		    firebase.database().ref('/users/messenger/' + userId + '/spotify/').update(spotify, function(err) {
			    if (err) {
			        bot.say({
						text: 'We hit an astroid error :( ' + err,
				        channel: userId
					})
			    } else {
			        console.log(userId + ' accessToken was updated in Firebase')
			        getUserPlaylists(accessToken, userId, spotifyId)
			    }
			});
		}, function(err) {
			console.log('Could not refresh access token', err);
		});
	});
}

function getUserPlaylists(accessToken, userId, spotifyId) {
	var api = new SpotifyWebApi({
		accessToken: accessToken
    });
	api.getUserPlaylists(spotifyId)
	.then(function(data) {
		var playlists = []
		data.body.items.map(function(playlist) {
			if (playlist.owner.id == 'spotifydiscover' || (playlist.owner.id == 'spotify' && playlist.name == 'Release Radar')) {
				var image = ((playlist.images.length > 0) ? playlist.images[0].url : 'https://discover-messenger.herokuapp.com/default.jpg')

				var metadata = {
					apiURL: playlist.tracks.href,
					id: playlist.id,
					image: image,
					ownerId: playlist.owner.id,
					title: playlist.name,
					url: playlist.external_urls.spotify,
					updated: date.getTime()
				}
				playlists.push(metadata)
			}
        })
        getPlaylist(api, userId, playlists)
	}, function(err) {
		console.log('Could not grab Spotify data', err);
	});
}

function getPlaylist(api, userId, metadata) {
	var playlists = []
	var count = 0;
	for(var i = 0; i < metadata.length; i++) {
	    (function(index) {
	    	api.getPlaylist(metadata[index].ownerId, metadata[index].id)
			.then(function(data) {
				var tracks = []
				data.body.tracks.items.map(function(item) {
					var artists = []
					item.track.artists.map(function(artist){artists.push(artist.name)});
					tracks.push({
						artist: artists.join(', '),
						image: item.track.album.images[0].url,
						name: item.track.name,
						previewURL: item.track.preview_url,
						url: item.track.external_urls.spotify
					})
				})
				var metadataPlaylist = metadata[index]
				metadataPlaylist[currentMonday] = tracks
				playlists.push(metadataPlaylist)

				count++;
	            if (count > metadata.length - 1) saveNewWeekToFirebase(userId, playlists);
			}, function(err) {
				console.log('Something went wrong!', err);
			});
	    }(i));
	}
}

function saveNewWeekToFirebase(userId, playlists) {
    var attachmentElements = []
    for(var i = 0; i < playlists.length; i++) {
		var playlistURL = 'https://discover-messenger.herokuapp.com/playlist?'
		playlistURL += 'userId=' + userId
		playlistURL += '&playlistId=' + playlists[i].id
		playlistURL += '&formattedDate=' + currentMonday

    	attachmentElements.push({
			'title': playlists[i].title,
			'image_url': playlists[i].image,
			'subtitle': currentMonday,
			'buttons': [
				{
					'type': 'web_url',
					'url': playlists[i].url,
					'title': 'Open in Spotify'
				},
				{
					'type': 'web_url',
					'url': playlistURL,
					'title': 'Skim the Song List'
				}
			]
		})

		firebase.database().ref('/users/messenger/' + userId + '/spotify/playlists/' + i).update(playlists[i], function(err) {
		    if (err) {
		        bot.say({
					text: 'We hit an astroid error :( ' + err,
			        channel: userId
				})
		    } else {
		        console.log(userId + ' playlist was updated in Firebase')
		    }
		});
    }

    var attachment = {
		'type': 'template',
		'payload': {
			'template_type': 'generic',
			'elements': attachmentElements,
		}
	};
    bot.say({
        attachment: attachment,
		channel: userId
    });
}

controller.setupWebserver(process.env.PORT,function(err,webserver) {
	controller.createWebhookEndpoints(controller.webserver, bot, function() {
	    console.log('This bot is online!!!');
	});

	webserver.get('/default.jpg', function(req, res) {
		var request = url.parse(req.url, true);
		var action = request.pathname;

		if (action == '/default.jpg') {
			var img = fs.readFileSync('./default.jpg');
			res.writeHead(200, {'Content-Type': 'image/jpg' });
			res.end(img, 'binary');
		}
	})

	webserver.get('/', function(req, res) {
	  	res.redirect('http://m.me/spotifydiscoverweekly')
	});

	webserver.get('/preview', function(req, res) {
		res.redirect('http://m.me/spotifydiscoverweekly')

		var userId = req.query.userId
		var previewURL = decodeURIComponent(req.query.previewURL)

		var attachment = {
			'type': 'audio',
			'payload': {
				'url': previewURL
			}
		};

		bot.say({
			attachment: attachment,
		    channel: userId
		})
	})

	webserver.get('/playlist', function(req, res) {
		res.redirect('http://m.me/spotifydiscoverweekly')

		var userId = req.query.userId
		var playlistId = req.query.playlistId
		var formattedDate = req.query.formattedDate

		var ref = firebase.database().ref('/users/messenger/' + userId + '/spotify/playlists')
		ref.once('value', function(data) {
		    data.val().map(function(playlist) {
		    	if (playlist.id == playlistId) {
		    		var attachmentElements = []
					playlist[formattedDate].map(function(track) {
						var previewURL = 'https://discover-messenger.herokuapp.com/preview?'
						previewURL += 'userId=' + userId
						previewURL += '&previewURL=' + encodeURIComponent(track.previewURL)

						attachmentElements.push({
							'title': track.name,
							'image_url': track.image,
							'subtitle': track.artist,
							'buttons': [
								{
									'type': 'web_url',
									'url': track.url,
									'title': 'Open in Spotify'
								},
								{
									'type': 'web_url',
									'url': previewURL,
									'title': '30 Second Preview'
								}
							]
						})
					})

					// TODO: refactor this later on

					var attachment = {
						'type': 'template',
						'payload': {
							'template_type': 'generic',
							'elements': attachmentElements.slice(0,5)
						}
					};

					bot.say({
						attachment: attachment,
					    channel: userId
					})

					attachment = {
						'type': 'template',
						'payload': {
							'template_type': 'generic',
							'elements': attachmentElements.slice(6,11)
						}
					};

					bot.say({
						attachment: attachment,
					    channel: userId
					})

					attachment = {
						'type': 'template',
						'payload': {
							'template_type': 'generic',
							'elements': attachmentElements.slice(12,17)
						}
					};

					bot.say({
						attachment: attachment,
					    channel: userId
					})

					if (attachmentElements.length < 24) {
						attachment = {
							'type': 'template',
							'payload': {
								'template_type': 'generic',
								'elements': attachmentElements.slice(18, (attachmentElements - 1))
							}
						};

						bot.say({
							attachment: attachment,
						    channel: userId
						})
					} else {
						attachment = {
							'type': 'template',
							'payload': {
								'template_type': 'generic',
								'elements': attachmentElements.slice(18,23)
							}
						};

						bot.say({
							attachment: attachment,
						    channel: userId
						})

						attachment = {
							'type': 'template',
							'payload': {
								'template_type': 'generic',
								'elements': attachmentElements.slice(24, (attachmentElements.length - 1))
							}
						};

						bot.say({
							attachment: attachment,
						    channel: userId
						})
					}
		    	}
		    })
		});
  	})

	webserver.get('/spotify/callback', function(req, res) {
		res.redirect('http://m.me/spotifydiscoverweekly')

		var code = req.query.code
  		var state = req.query.state

		if (req.query.error) {
			bot.say({
				text: 'Error signing in: ' + req.query.error,
		        channel: state
			})
		} else {
	  		var accessToken
	  		var refreshToken

			bot.say({
				text: 'You have succesfully signed in!',
		        channel: state
			})

		  	spotifyApi.authorizationCodeGrant(code)
		  	.then(function(data) {
		  		accessToken = data.body.access_token
		  		refreshToken = data.body.refresh_token
		 
			    spotifyApi.setAccessToken(accessToken)
			    spotifyApi.setRefreshToken(refreshToken)

			    return spotifyApi.getMe();
			}, function(err) {
		    	bot.say({
					text: 'We hit an astroid error :( ' + req.query.error,
			        channel: state
				})
		  	})
			.then(function(data) {
				var displayName = data.body.display_name
				var email = data.body.email
				var spotifyId = data.body.id

			    var user = {
			    	channel: state,
			    	spotify: {
						accessToken: accessToken,
			    		displayName: displayName,
			    		email: email,
			    		id: spotifyId,
			    		refreshToken: refreshToken
				    },
			    	started: date.getTime()
			    };
				firebase.database().ref('/users/messenger/' + state).update(user, function(err) {
				    if (err) {
				        bot.say({
							text: 'We hit an astroid error :( ' + err,
					        channel: state
						})
				    } else {
				        console.log(state + ' was added to Firebase')
				        getUserPlaylists(accessToken, state, spotifyId)
				    }
				});
			}, function(err) {
		    	bot.say({
					text: 'We hit an astroid error :( ' + req.query.error,
			        channel: state
				})
		  	})
		}
	});
});

controller.on('facebook_optin', function(bot, message) {
    bot.reply(message, "Welcome to Discover! To get started we need to hook up Spotify. Say 'sign in' and prepare to blast off into deep music space :D");
});

controller.hears(['hello', 'hi', 'hey', 'start', 'what do i do'], 'message_received', function(bot, message) {
    bot.reply(message, "Hello! Let's get started with Spotify by saying 'sign in.' 'Say 'commands' if you want more help.");
});

controller.hears(['command', 'commands', 'actions', 'help'], 'message_received', function(bot, message) {
    bot.reply(message, "Some common commands that you can use are 'sign in', 'current week', '1 week ago', 'cookies', 'who are you', 'feedback'");
});

controller.hears(['feedback'], 'message_received', function(bot, message) {
    bot.reply(message, 'We would love to hear your feedback! Email hello@parallel.fm and we will respond shortly :D');
});

controller.hears(['identify yourself', 'who are you', 'what is your name'], 'message_received', function(bot, message) {
    bot.reply(message, "I am Discover Weekly's bot made by The Parallel team. Check out my sister bot on https://parallel.fm to listen to music together.");
});

controller.hears(['log in', 'sign in', 'start'], 'message_received', function(bot, message) {
	signIntoSpotify(message)
});

controller.hears(['check', 'this week', 'current week', 'discover weekly', 'week ago', 'weeks ago'], 'message_received', function(bot, message) {
	var text = message.text
	if (wordsToNumbers(text)) {
		text = wordsToNumbers(text);
	}
	var pattern = /\d+/;
	var match = text.match(pattern);

	var days = 0
	if (match) {
		var days = (match[0]) * 7;
	}
		
	var previousDate = new Date();
	previousDate.setDate(previousDate.getDate() - days);
	var formattedDate = formatMondayDate(previousDate)

	var ref = firebase.database().ref('/users/messenger/' + message.user + '/spotify/playlists')
	ref.once('value', function(data) {
		if (!data.exists()) {
			bot.reply(message, "Looks like we do not have any weeks saved from " + message.text);
		} else {
			var attachmentElements = []
		    data.val().map(function(playlist) {
				if (playlist[formattedDate]) {
					var playlistURL = 'https://discover-messenger.herokuapp.com/playlist?'
					playlistURL += 'userId=' + message.user
					playlistURL += '&playlistId=' + playlist.id
					playlistURL += '&formattedDate=' + formattedDate

					attachmentElements.push({
						'title': playlist.title,
						'image_url': playlist.image,
						'subtitle': formattedDate,
						'buttons': [
							{
								'type': 'web_url',
								'url': playlist.url,
								'title': 'Open in Spotify'
							},
							{
								'type': 'web_url',
								'url': playlistURL,
								'title': 'Skim the Song List'
							}
						]
					})
				}
			})

			if (attachmentElements.length == 0) {
				bot.reply(message, "Looks like we do not have any weeks saved from " + message.text);
			} else {
				var attachment = {
					'type': 'template',
					'payload': {
						'template_type': 'generic',
						'elements': attachmentElements,
					}
				};
			    bot.reply(message, {
			        attachment: attachment
			    });
			}				
		}
	});
});

controller.hears(['cookies'], 'message_received', function(bot, message) {
    bot.startConversation(message, function(err, convo) {
        convo.say('Did someone say cookies!?!!');
        convo.ask('What is your favorite type of cookie?', function(response, convo) {
            convo.say('Golly, I love ' + response.text + ' too!!!');
            convo.next();
        });
    });
});

controller.hears('test', 'message_received', function(bot, message) {
    var attachment = {
        'type':'template',
        'payload':{
            'template_type':'generic',
            'elements':[
                {
                    'title':'Chocolate Cookie',
                    'image_url':'http://cookies.com/cookie.png',
                    'subtitle':'A delicious chocolate cookie',
                    'buttons':[
                        {
                        'type':'postback',
                        'title':'Eat Cookie',
                        'payload':'chocolate'
                        }
                    ]
                },
            ]
        }
    };

    bot.reply(message, {
        attachment: attachment,
    });
});

controller.on('facebook_postback', function(bot, message) {
    if (message.payload == 'chocolate') {
        bot.reply(message, 'You ate the chocolate cookie!')
    }
});

module.exports = {
  	discoverWeeklyUpdate: function() {
		var ref = firebase.database().ref('/users/messenger/')
		ref.once('value', function(data) {
			if (data.exists()) {
				Object.keys(data.val()).forEach(function (userId) {
				    spotifyRefreshToken(userId)
				});
			} else {
			    console.log('Something went wrong with discoverWeeklyUpdate()')
			}
		});
	}
};