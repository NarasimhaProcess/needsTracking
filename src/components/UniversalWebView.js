import React, { useImperativeHandle, useRef, useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';

let WebView;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('Could not require react-native-webview:', e);
  }
}

const UniversalWebView = React.forwardRef(({ source, onMessage, style, ...props }, ref) => {
  const iframeRef = useRef(null);
  const nativeWebviewRef = useRef(null);

  useImperativeHandle(ref, () => ({
    postMessage: (data) => {
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        if (Platform.OS === 'web') {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(payload, '*');
          }
        } else {
          if (nativeWebviewRef.current && nativeWebviewRef.current.postMessage) {
            nativeWebviewRef.current.postMessage(payload);
          }
        }
      } catch (err) {
        console.warn('UniversalWebView postMessage error:', err);
      }
    },
    injectJavaScript: (script) => {
      try {
        if (Platform.OS === 'web') {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'EVAL_SCRIPT', script }, '*');
          }
        } else {
          if (nativeWebviewRef.current && nativeWebviewRef.current.injectJavaScript) {
            nativeWebviewRef.current.injectJavaScript(script);
          }
        }
      } catch (err) {
        console.warn('UniversalWebView injectJavaScript error:', err);
      }
    },
    reload: () => {
      if (Platform.OS === 'web' && iframeRef.current) {
        const src = iframeRef.current.srcdoc;
        iframeRef.current.srcdoc = src;
      } else if (nativeWebviewRef.current && nativeWebviewRef.current.reload) {
        nativeWebviewRef.current.reload();
      }
    },
  }));

  if (Platform.OS === 'web') {
    const htmlContent = source?.html || '';

    useEffect(() => {
      const handleWebMessage = (event) => {
        if (onMessage && event && event.data !== undefined) {
          onMessage({
            nativeEvent: {
              data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
            },
            data: event.data
          });
        }
      };

      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }, [onMessage]);

    return (
      <View style={[styles.container, style]}>
        <iframe
          id="universal-webview-iframe"
          ref={iframeRef}
          srcDoc={htmlContent}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="universal-map-view"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          {...props}
        />
      </View>
    );
  }

  // Native implementation
  return (
    <WebView
      ref={nativeWebviewRef}
      source={source}
      onMessage={onMessage}
      style={style}
      originWhitelist={['*']}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      mixedContentMode="always"
      allowFileAccess={true}
      allowUniversalAccessFromFileURLs={true}
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

