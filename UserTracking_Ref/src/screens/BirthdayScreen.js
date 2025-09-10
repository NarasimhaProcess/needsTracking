import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';

export default function BirthdayScreen() {
  const birthdaySites = [
    { name: '123Greetings.com', url: 'https://www.123greetings.com/' },
    { name: 'RiverSongs.com', url: 'https://www.riversongs.com/' },
    { name: 'MyNameArt.com', url: 'https://www.mynameart.com/' },
    { name: 'Etsy (Digital Cards)', url: 'https://www.etsy.com/market/digital_birthday_cards' },
    { name: 'E-Greetings (Gov. of India)', url: 'https://egreetings.gov.in/' },
    { name: 'Giftcart.com', url: 'https://www.giftcart.com/' },
    { name: 'FNP (Ferns N Petals)', url: 'https://www.fnp.com/' },
    { name: 'IGP.com (Indian Gifts Portal)', url: 'https://www.igp.com/' },
    { name: 'Giftsmyntra.com', url: 'https://www.giftsmyntra.com/' },
    { name: 'Giftacrossindia.com', url: 'https://www.giftacrossindia.com/' },
    { name: 'Floraindia', url: 'https://www.floraindia.com/' },
    { name: 'Indiagift.in', url: 'https://www.indiagift.in/' },
    { name: 'PropShop24', url: 'https://propshop24.com/' },
    { name: 'The Playful Indian', url: 'https://theplayfulindian.com/' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Birthday Wishes Resources</Text>
      {birthdaySites.map((site, index) => (
        <TouchableOpacity key={index} style={styles.linkButton} onPress={() => Linking.openURL(site.url)}>
          <Text style={styles.linkText}>{site.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  linkButton: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});
