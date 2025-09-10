
import React, { useRef } from 'react';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';

const AstrologyWebviewScreen = () => {
  const webViewRef = useRef(null);

  const panchangamScrollScript = `
    const element = document.getElementById('panchangam-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  `;

  useFocusEffect(
    React.useCallback(() => {
      if (webViewRef.current) {
        // Inject JavaScript to scroll to the section when the screen is focused
        webViewRef.current.injectJavaScript(panchangamScrollScript);
      }
    }, [])
  );

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: 'https://www.nemaniastrology.com/' }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
    />
  );
};

export default AstrologyWebviewScreen;
