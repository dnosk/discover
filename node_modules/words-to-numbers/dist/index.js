'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

exports.wordsToNumbers = wordsToNumbers;

var _itsSet = require('its-set');

var _itsSet2 = _interopRequireDefault(_itsSet);

var _cljFuzzy = require('clj-fuzzy');

var _cljFuzzy2 = _interopRequireDefault(_cljFuzzy);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// inpired by this answer on stackoverflow: http://stackoverflow.com/a/12014376 by http://stackoverflow.com/users/631193/javaandcsharp and thanks to @Greg Hewgill for the original, written in Python.

var COUNT = {
  zero: 0,
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};

var MAGNITUDE = {
  hundred: 100,
  thousand: 1000,
  million: 1000000,
  billion: 1000000000,
  trillion: 1000000000000,
  quadrillion: 1000000000000000,
  quintillion: 1000000000000000000,
  sextillion: 1000000000000000000000,
  septillion: 1000000000000000000000000,
  octillion: 1000000000000000000000000000,
  nonillion: 1000000000000000000000000000000,
  decillion: 1000000000000000000000000000000000
};

var NUMBER_WORDS = (0, _keys2.default)(COUNT).concat((0, _keys2.default)(MAGNITUDE)).concat(['and', 'point']);

var clean = function clean(word) {
  return word.replace(',', '');
};

var extractNumberRegions = function extractNumberRegions(words) {
  var reduced = words.map(function (word) {
    return NUMBER_WORDS.indexOf(clean(word)) > -1;
  }).reduce(function (acc, isNumberWord, i) {
    if (isNumberWord) {
      if (!(0, _itsSet2.default)(acc.start)) acc.start = i;
    } else if ((0, _itsSet2.default)(acc.start)) {
      acc.regions.push({ start: acc.start, end: i - 1 });
      acc.start = null;
    }
    return acc;
  }, { regions: [], start: null });
  return reduced.start === 0 && !reduced.regions.length ? 'whole' : reduced.regions;
};

var convertWordsToDecimal = function convertWordsToDecimal(words) {
  return words.map(function (word) {
    return COUNT[word];
  }).join('');
};

var convertWordsToNonDecimal = function convertWordsToNonDecimal(words) {
  var reduced = words.reduce(function (acc, word) {
    var cleanWord = clean(word);
    if (cleanWord === 'and') return acc;
    if ((0, _itsSet2.default)(acc.count)) {
      if ((0, _itsSet2.default)(COUNT[cleanWord])) {
        acc.extra += COUNT[acc.count];
        acc.count = cleanWord;
      } else {
        acc.pairs.push({ count: acc.count, magnitude: cleanWord });
        acc.count = null;
      }
    } else {
      acc.count = cleanWord;
    }
    return acc;
  }, { pairs: [], count: null, extra: 0 });

  return reduced.pairs.reduce(function (acc, pair) {
    return acc + COUNT[pair.count] * MAGNITUDE[pair.magnitude];
  }, COUNT[reduced.count] || 0) + reduced.extra;
};

var convertWordsToNumber = function convertWordsToNumber(words) {
  var pointIndex = words.indexOf('point');
  if (pointIndex > -1) {
    var numberWords = words.slice(0, pointIndex);
    var decimalWords = words.slice(pointIndex + 1);
    return parseFloat(convertWordsToNonDecimal(numberWords) + '.' + convertWordsToDecimal(decimalWords));
  }
  return convertWordsToNonDecimal(words);
};

var fuzzyMatch = function fuzzyMatch(word) {
  return NUMBER_WORDS.map(function (numberWord) {
    return {
      word: numberWord,
      score: _cljFuzzy2.default.metrics.jaro(numberWord, word)
    };
  }).reduce(function (acc, stat) {
    return !(0, _itsSet2.default)(acc.score) || stat.score > acc.score ? stat : acc;
  }, {}).word;
};

function wordsToNumbers(text, options) {
  var opts = (0, _assign2.default)({ fuzzy: false }, options);
  var words = text.toString().split(/[\s-]+/);
  if (opts.fuzzy) words = words.map(function (word) {
    return fuzzyMatch(word);
  });
  var regions = extractNumberRegions(words);

  if (regions === 'whole') return convertWordsToNumber(words);
  if (!regions.length) return null;

  var removedWordsCount = 0;
  return regions.map(function (region) {
    return convertWordsToNumber(words.slice(region.start, region.end + 1));
  }).reduce(function (acc, replacedRegion, i) {
    var removeCount = regions[i].end - regions[i].start + 1;
    var result = acc.slice(0);
    result.splice(regions[i].start - removedWordsCount, removeCount, replacedRegion);
    removedWordsCount += removeCount - 1;
    return result;
  }, words).join(' ');
}

exports.default = wordsToNumbers;