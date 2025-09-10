import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';

export default function MarriageScreen() {
  const marriageSites = [
    { name: 'Indiatimes', url: 'https://timesofindia.indiatimes.com/life-style/relationships/love-sex/100-best-wedding-wishes-messages-and-quotes-for-wedding-cards/photostory/99760000.cms' },
    { name: 'FNP Venues', url: 'https://www.fnpvenues.com/blog/indian-wedding-quotes-wishes-messages/' },
    { name: 'IndianShelf', url: 'https://www.indianshelf.in/blog/wedding-wishes-for-cards/' },
    { name: 'Nestasia', url: 'https://nestasia.in/blogs/nestasia-blog/70-wedding-and-marriage-wishes-for-newlywed-couples' },
    // AI-powered tools (as discussed, these are mostly proprietary but can generate content)
    { name: 'YesChat.ai Wedding Wisher', url: 'https://yeschat.ai/gpts/wedding-wisher' },
    { name: 'Easy-Peasy.AI (Wedding Invite Generator)', url: 'https://easy-peasy.ai/ai-tools/wedding-invite-message-generator' },
    { name: 'LogicBalls AI Wedding Invite Message Generator', url: 'https://www.logicballs.com/tools/wedding-invite-message-generator' },
    { name: 'Rephrasely AI Wedding Message Generator', url: 'https://rephrasely.com/ai-wedding-message-generator-tool/' },
    { name: 'VidDay (Wedding Idea Generator)', url: 'https://www.vidday.com/wedding-idea-generator/' },
    { name: 'Sider', url: 'https://sider.ai/' },
    { name: 'Typli.ai (Wedding Vow Generator)', url: 'https://typli.ai/wedding-vow-generator/' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Marriage Wishes Resources</Text>
      {marriageSites.map((site, index) => (
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