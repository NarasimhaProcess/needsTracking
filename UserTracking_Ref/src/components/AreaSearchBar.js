import React, { useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';

export default function AreaSearchBar({ areas, onAreaSelect, selectedAreaName }) {
  const [query, setQuery] = useState(selectedAreaName || '');
  const [suggestions, setSuggestions] = useState([]);

  const handleInputChange = (text) => {
    setQuery(text);
    if (text) {
      const filteredAreas = areas.filter(area =>
        area.area_name.toLowerCase().includes(text.toLowerCase())
      );
      setSuggestions(filteredAreas);
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectArea = (area) => {
    setQuery(area.area_name);
    setSuggestions([]);
    onAreaSelect(area.id, area.area_name);
  };

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Search Area..."
        value={query}
        onChangeText={handleInputChange}
      />
      <FlatList
        style={[styles.suggestionsList, suggestions.length === 0 && { height: 0 }]} // Hide when no suggestions
        data={suggestions}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.suggestionItem}
            onPress={() => handleSelectArea(item)}
          >
            <Text>{item.area_name}</Text>
          </TouchableOpacity>
        )}
        keyboardShouldPersistTaps="always" // Keep keyboard open
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  suggestionsList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
});
