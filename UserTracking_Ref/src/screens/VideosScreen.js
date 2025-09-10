import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

const teluguTrendingVideos = [
  { id: 'tollywood_trailers', title: 'Tollywood Movie Trailers', url: 'https://www.youtube.com/embed/videoseries?list=PLbpi6ZahtOH5252IVoG0P_UqQhxM8srnB&si=bPYrClnTqefypLgK' }, // Updated with user's playlist ID
  { id: 'telugu_comedy', title: 'Telugu Comedy Scenes', url: 'https://www.youtube.com/embed/videoseries?list=PLbpi6ZahtOH5252IVoG0P_UqQhxM8srnB&si=bPYrClnTqefypLgK' }, // Placeholder for a YouTube playlist of comedy
  { id: 'telugu_devotional', title: 'Telugu Devotional Songs', url: 'https://www.youtube.com/embed/videoseries?list=PLbpi6ZahtOH5252IVoG0P_UqQhxM8srnB&si=bPYrClnTqefypLgK' }, // Placeholder for a YouTube playlist of devotional songs
  { id: 'telugu_news', title: 'Telugu News Updates', url: 'https://www.youtube.com/embed/videoseries?list=PLbpi6ZahtOH5252IVoG0P_UqQhxM8srnB&si=bPYrClnTqefypLgK' }, // Placeholder for a YouTube playlist of news
  { id: 'telugu_interviews', title: 'Telugu Celebrity Interviews', url: 'https://www.youtube.com/embed/videoseries?list=PLbpi6ZahtOH5252IVoG0P_UqQhxM8srnB&si=bPYrClnTqefypLgK' }, // Placeholder for a YouTube playlist of interviews
];

export default function VideosScreen() {
  const [selectedVideoUrl, setSelectedVideoUrl] = useState(null);

  const renderVideoTile = ({ item }) => (
    <TouchableOpacity 
      style={styles.tile}
      onPress={() => setSelectedVideoUrl(item.url)}
    >
      <Text style={styles.tileText}>{item.title}</Text>
    </TouchableOpacity>
  );

  if (selectedVideoUrl) {
    return (
      <View style={styles.webviewContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedVideoUrl(null)}>
          <Text style={styles.backButtonText}>← Back to Videos</Text>
        </TouchableOpacity>
        <WebView
          source={{ uri: selectedVideoUrl }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          mediaPlaybackRequiresUserAction={false}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Top Trending Telugu Videos</Text>
      <FlatList
        data={teluguTrendingVideos}
        renderItem={renderVideoTile}
        keyExtractor={(item) => item.id}
        numColumns={2} // Display in 2 columns for a tile view
        contentContainerStyle={styles.gridContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1C1C1E',
  },
  gridContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    margin: 10,
    width: (width / 2) - 30, // Two columns with some margin
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tileText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
  webviewContainer: {
    flex: 1,
    width: '100%',
  },
  webview: {
    flex: 1,
  },
  backButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    margin: 10,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});