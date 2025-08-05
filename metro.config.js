const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add platform-specific resolver
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Add resolver for react-native-maps on web
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Add resolver for native modules on web
config.resolver.alias = {
  ...config.resolver.alias,
  'react-native-maps': 'react-native-maps/lib/index.js',
};

module.exports = config; 