import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

const teluguNewspapers = [
  { id: 'eenadu', name: 'Eenadu', url: 'https://www.eenadu.net/' },
  { id: 'sakshi', name: 'Sakshi', url: 'https://www.sakshi.com/' },
  { id: 'andhrajyothy', name: 'Andhra Jyothy', url: 'https://www.andhrajyothy.com/' },
  { id: 'namasthetelangaana', name: 'Namasthe Telangana', url: 'https://www.namasthetelangaana.com/' },
  { id: 'vaartha', name: 'Vaartha', url: 'https://www.vaartha.com/' },
];

export default function NewsPaperScreen() {
  console.log('NewsPaperScreen rendered');
  const [selectedNewspaperUrl, setSelectedNewspaperUrl] = useState(null);

  const renderNewspaperTile = ({ item }) => {
    console.log('Rendering newspaper tile:', item.name);
    return (
      <TouchableOpacity 
        style={styles.tile}
        onPress={() => {
          console.log('Newspaper selected:', item.name, item.url);
          setSelectedNewspaperUrl(item.url);
        }}
      >
        <Text style={styles.tileText}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  if (selectedNewspaperUrl) {
    return (
      <View style={styles.webviewContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedNewspaperUrl(null)}>
          <Text style={styles.backButtonText}>← Back to Newspapers</Text>
        </TouchableOpacity>
        <WebView
          source={{ uri: selectedNewspaperUrl }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Telugu Newspapers</Text>
      <FlatList
        data={teluguNewspapers}
        renderItem={renderNewspaperTile}
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