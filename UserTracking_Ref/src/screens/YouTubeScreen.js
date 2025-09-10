import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// Replace with your actual YouTube Data API Key
const YOUTUBE_API_KEY = 'AIzaSyDT7fBeh0HN2DCw2ikxupzdb6W67OGQrss'; 

const YouTubeScreen = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('today top news telugu'); // Initialize with default search

  useEffect(() => {
    fetchVideos(searchQuery);
  }, []);

  const fetchVideos = async (query) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}&maxResults=10`
      );
      const data = await response.json();

      if (data.items) {
        setVideos(data.items);
      } else if (data.error) {
        Alert.alert('YouTube API Error', data.error.message);
        console.error('YouTube API Error:', data.error);
      }
    } catch (error) {
      Alert.alert('Network Error', 'Failed to fetch YouTube videos.');
      console.error('Error fetching YouTube videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchVideos(searchQuery);
  };

  const renderVideoItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.videoItem}
      onPress={() => setSelectedVideoId(item.id.videoId)}
    >
      <Text style={styles.videoTitle}>{item.snippet.title}</Text>
      <Text style={styles.videoChannel}>{item.snippet.channelTitle}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading videos...</Text>
      </View>
    );
  }

  if (selectedVideoId) {
    return (
      <View style={styles.webviewContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedVideoId(null)}>
          <Text style={styles.backButtonText}>← Back to Videos</Text>
        </TouchableOpacity>
        <WebView
          source={{ uri: `https://www.youtube.com/embed/${selectedVideoId}` }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search YouTube videos..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Latest News Videos</Text>
      <FlatList
        data={videos}
        renderItem={renderVideoItem}
        keyExtractor={(item) => item.id.videoId}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingTop: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginRight: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1C1C1E',
  },
  listContainer: {
    paddingHorizontal: 10,
  },
  videoItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 5,
  },
  videoChannel: {
    fontSize: 14,
    color: '#8E8E93',
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

export default YouTubeScreen;