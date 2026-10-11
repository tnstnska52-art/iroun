const { getDefaultConfig } = require('expo/metro-config');
require('./scripts/manifest-observer.cjs').install();

module.exports = getDefaultConfig(__dirname);
