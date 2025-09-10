import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, TouchableOpacity, ScrollView, Platform, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';
import styles from './CustomerStyles';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AddTransactionScreen({ user, userProfile, navigation }) {
  const [areas, setAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [amount, setAmount] = useState('');
  const [amountType, setAmountType] = useState('Cash');
  const [upiScreenshot, setUpiScreenshot] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionDate, setTransactionDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    async function fetchAreas() {
      if (!user?.id) return;
      const { data: userGroups, error: userGroupsError } = await supabase
        .from('user_groups')
        .select('group_id')
        .eq('user_id', user.id);
      if (userGroupsError) {
        console.error('Error fetching user groups:', userGroupsError);
        return;
      }
      const groupIds = userGroups.map(ug => ug.group_id);
      if (groupIds.length === 0) {
        setAreas([]);
        return;
      }
      const { data: groupAreas, error: groupAreasError } = await supabase
        .from('group_areas')
        .select('area_master (id, area_name)')
        .in('group_id', groupIds);
      if (groupAreasError) {
        console.error('Error fetching group areas:', groupAreasError);
        return;
      }
      const fetchedAreas = groupAreas.map(ga => ga.area_master).filter(Boolean);
      setAreas(fetchedAreas);
    }
    fetchAreas();
  }, [user]);

  useEffect(() => {
    async function fetchCustomers() {
      if (!selectedArea) {
        setCustomers([]);
        return;
      }
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, book_no')
        .eq('area_id', selectedArea);
      if (error) {
        console.error('Error fetching customers:', error);
      } else {
        setCustomers(data);
      }
    }
    fetchCustomers();
  }, [selectedArea]);

  const handleImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled) {
      setUpiScreenshot(result.assets[0]);
    }
  };

  const uploadTransactionImage = async (uri, customerId, mimeType) => {
    try {
      const fileExt = mimeType.split('/')[1];
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 100000)}.${fileExt}`;
      const filePath = `transactions/${customerId}/${fileName}`;
      const fileData = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileBuffer = Buffer.from(fileData, 'base64');
      const { data, error } = await supabase.storage
        .from('locationtracker')
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });
      if (error) {
        Alert.alert('Error', 'Failed to upload UPI image: ' + error.message);
        return null;
      }
      const { data: urlData } = supabase.storage.from('locationtracker').getPublicUrl(filePath);
      return urlData?.publicUrl;
    } catch (error) {
      Alert.alert('Error', 'Failed to upload UPI image: ' + error.message);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!selectedArea || !selectedCustomer || !amount || !amountType) {
      Alert.alert('Missing Fields', 'Please fill out all fields.');
      setIsSubmitting(false);
      return;
    }

    if (amountType === 'UPI' && !upiScreenshot) {
      Alert.alert('Missing Screenshot', 'Please upload a UPI screenshot.');
      setIsSubmitting(false);
      return;
    }

    let upiImageUrl = null;
    if (amountType === 'UPI' && upiScreenshot) {
      upiImageUrl = await uploadTransactionImage(upiScreenshot.uri, selectedCustomer, upiScreenshot.mimeType || 'image/jpeg');
      if (!upiImageUrl) {
        setIsSubmitting(false);
        return;
      }
    }

    const { error } = await supabase.from('transactions').insert({
      customer_id: selectedCustomer,
      user_id: user.id,
      amount: amount,
      transaction_type: 'repayment',
      payment_mode: amountType,
      upi_image: upiImageUrl,
      transaction_date: transactionDate.toISOString().split('T')[0],
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Transaction added successfully!');
      navigation.goBack();
    }

    setIsSubmitting(false);
  };

  const onDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || transactionDate;
    setShowDatePicker(Platform.OS === 'ios');
    setTransactionDate(currentDate);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.modalTitle}>Add Transaction</Text>

      <Text style={styles.formLabel}>Area</Text>
      <Picker
        selectedValue={selectedArea}
        onValueChange={(itemValue) => setSelectedArea(itemValue)}
        style={styles.formPicker}
      >
        <Picker.Item label="Select Area" value="" />
        {areas.map((area) => (
          <Picker.Item key={area.id} label={area.area_name} value={area.id} />
        ))}
      </Picker>

      <Text style={styles.formLabel}>Customer (Card No - Name)</Text>
      <Picker
        selectedValue={selectedCustomer}
        onValueChange={(itemValue) => setSelectedCustomer(itemValue)}
        style={styles.formPicker}
        enabled={!!selectedArea}
      >
        <Picker.Item label="Select Customer" value="" />
        {customers.map((customer) => (
          <Picker.Item key={customer.id} label={`${customer.book_no} - ${customer.name}`} value={customer.id} />
        ))}
      </Picker>

      <Text style={styles.formLabel}>Amount</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        style={styles.input}
        keyboardType="numeric"
        placeholder="Enter Amount"
      />

      <Text style={styles.formLabel}>Amount Type</Text>
      <Picker
        selectedValue={amountType}
        onValueChange={(itemValue) => setAmountType(itemValue)}
        style={styles.formPicker}
      >
        <Picker.Item label="Cash" value="Cash" />
        <Picker.Item label="UPI" value="UPI" />
      </Picker>

      {amountType === 'UPI' && (
        <View>
          <Button title="Upload UPI Screenshot" onPress={handleImagePick} />
          {upiScreenshot && <Image source={{ uri: upiScreenshot.uri }} style={{ width: 100, height: 100, marginVertical: 10 }} />}
        </View>
      )}

      <Text style={styles.formLabel}>Transaction Date</Text>
      <TouchableOpacity onPress={() => setShowDatePicker(true)}>
        <Text style={styles.input}>{transactionDate.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          testID="dateTimePicker"
          value={transactionDate}
          mode="date"
          is24Hour={true}
          display="default"
          onChange={onDateChange}
        />
      )}

      <Button title={isSubmitting ? 'Submitting...' : 'Submit'} onPress={handleSubmit} disabled={isSubmitting} />
    </ScrollView>
  );
}
