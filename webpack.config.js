const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // Add fallbacks for native modules that cause issues on web
  config.resolve.fallback = {
    ...config.resolve.fallback,
    'react-native/Libraries/Utilities/codegenNativeCommands': false,
    'react-native/Libraries/Components/View/ReactNativeStyleAttributes': false,
    'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter': false,
    'react-native/Libraries/vendor/emitter/EventEmitter': false,
    'react-native/Libraries/vendor/emitter/EventSubscriptionVendor': false,
    'react-native/Libraries/EventEmitter/NativeEventEmitter': false,
  };

  return config;
}; 