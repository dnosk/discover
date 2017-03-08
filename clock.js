var index = require('./index.js');
var today = new Date();
if (today.getDay() == 1) {
	index.discoverWeeklyUpdate()
}
