import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

let WebView;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const UniversalWebView = React.forwardRef(({ source, onMessage, style, ...props }, ref) => {
  if (Platform.OS === 'web') {
    // Web implementation using iframe
    const htmlContent = source.html;
    
    // On web, we listen to the standard window message event
    React.useEffect(() => {
      const handleWebMessage = (event) => {
        if (onMessage && event.data) {
          // Wrap the web event to match the native event structure
          onMessage({
            nativeEvent: {
              data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
            }
          });
        }
      };

      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }, [onMessage]);

    return (
      <View key="web-view-container" style={[styles.container, style]}>
        <iframe
          id="universal-webview-iframe"
          ref={ref}
          srcDoc={htmlContent}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="web-view"
          {...props}
        />
      </View>
    );
  }

  // Native implementation
  return (
    <WebView
      ref={ref}
      source={source}
      onMessage={onMessage}
      style={style}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default UniversalWebView;
