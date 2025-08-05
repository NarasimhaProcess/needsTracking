import React from 'react';
import { View, Text, Button } from 'react-native';
import { supabase } from '../services/supabase';

const AccountScreen = ({ route }) => {
  const { session } = route.params;

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Welcome!</Text>
      <Text>{session.user.email}</Text>
      <Button title="Logout" onPress={() => supabase.auth.signOut()} />
    </View>
  );
};

export default AccountScreen;
