import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { supabase, supabaseUrl } from '../services/supabaseClient'; // Import supabaseUrl
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import * as tus from 'tus-js-client';

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const GlobalChatAndPresence = ({ user, userProfile, selectedGroup, setSelectedGroup, accessToken }) => {
  const [groupUsers, setGroupUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [uploading, setUploading] = useState(false);
  const chatChannelRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (!selectedGroup || !user) {
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
      setMessages([]);
      setGroupUsers([]);
      return;
    }

    const channel = supabase.channel(`group-${selectedGroup.id}`, {
      config: {
        presence: { key: user.id },
      },
    });
    chatChannelRef.current = channel;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:sender_id(email, name)')
        .eq('group_id', selectedGroup.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) console.error('Error fetching messages:', error);
      else setMessages(data);
    };

    fetchMessages();

    const messageSubscription = channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        setGroupUsers(Object.values(newState).flat());
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${selectedGroup.id}` },
        (payload) => {
          setMessages((currentMessages) => [...currentMessages, payload.new]);
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id, username: userProfile.name || user.email });
        }
      });

    return () => {
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
      }
    };
  }, [selectedGroup, user, userProfile]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleMediaPick = async (useCamera) => {
    const permissionRequester = useCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permissionRequester();
    if (status !== 'granted') {
      Alert.alert('Permission required', `Sorry, we need ${useCamera ? 'camera' : 'camera roll'} permissions to make this work!`);
      return;
    }

    const pickerFunction = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    let result = await pickerFunction({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      if (result.assets[0].fileSize > MAX_FILE_SIZE_BYTES) {
        Alert.alert('File Too Large', `Please select a file smaller than ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }
      setSelectedMedia(result.assets[0]);
    }
  };

  const insertMessageRecord = async (mediaUrl = null) => {
    const messagePayload = {
      text: newMessage.trim(),
      sender_id: user.id,
      sender_email: user.email || 'Anonymous',
      group_id: selectedGroup.id,
      image_url: mediaUrl,
    };

    const { error } = await supabase.from('messages').insert([messagePayload]);
    setUploading(false);
    if (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Could not send the message.');
    } else {
      setNewMessage('');
      setSelectedMedia(null);
    }
  }

  const sendMessage = async () => {
    if ((!newMessage.trim() && !selectedMedia) || !selectedGroup || !user) {
      return;
    }
    setUploading(true);

    if (!selectedMedia) {
      await insertMessageRecord();
      return;
    }

    if (!accessToken) {
        Alert.alert('Authentication Error', 'Your session has expired. Please restart the app.');
        setUploading(false);
        return;
    }

    if (selectedMedia.fileSize > MAX_FILE_SIZE_BYTES) {
      Alert.alert('File Too Large', `Cannot upload files larger than ${MAX_FILE_SIZE_MB}MB.`);
      setUploading(false);
      setSelectedMedia(null);
      return;
    }

    const file = selectedMedia;
    const fileExt = file.fileName.split('.').pop();
    const fileName = `${user.id}_${Date.now()}.${fileExt}`;
    const contentType = file.mimeType ?? (file.type === 'video' ? `video/${fileExt}` : `image/${fileExt}`);

    try {
      const response = await fetch(file.uri);
      const blob = await response.blob();

      console.log("Starting TUS upload with token:", accessToken); // DIAGNOSTIC LOG

      const upload = new tus.Upload(blob, {
        endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-upsert': 'true',
        },
        metadata: {
          bucketName: 'chat_media',
          objectName: fileName,
          contentType: contentType,
        },
        onError: function (error) {
          console.error('TUS Error:', error);
          Alert.alert('Upload Failed', `An error occurred during upload: ${error.message}`);
          setUploading(false);
        },
        onSuccess: function () {
          const { data: urlData } = supabase.storage.from('chat_media').getPublicUrl(fileName);
          insertMessageRecord(urlData.publicUrl);
        },
      });

      upload.start();

    } catch (error) {
      console.error('Error starting upload:', error);
      Alert.alert('Upload Failed', 'Could not prepare the file for upload.');
      setUploading(false);
    }
  };

  const isVideo = (url) => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };

  const filteredGroups = userProfile?.groups?.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const renderMediaMessage = (item) => {
    if (!item.image_url) return null;

    if (isVideo(item.image_url)) {
      return (
        <Video
          source={{ uri: item.image_url }}
          rate={1.0}
          volume={1.0}
          isMuted={false}
          resizeMode="contain"
          useNativeControls
          style={styles.chatVideo}
        />
      );
    }
    return <Image source={{ uri: item.image_url }} style={styles.chatImage} />;
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={[styles.groupSelectionContainer, { top: 70 }]}>
        <TextInput style={styles.searchInput} placeholder="Search groups..." value={searchQuery} onChangeText={setSearchQuery} />
        <Text style={styles.sectionTitle}>Your Groups:</Text>
        {filteredGroups.length > 0 ? (
            <FlatList
              data={filteredGroups}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.groupButton, selectedGroup?.id === item.id && styles.selectedGroupButton]} onPress={() => setSelectedGroup(item)}>
                  <Text style={styles.groupButtonText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              horizontal
            />
        ) : (
            <Text style={styles.noGroupsText}>You are not a member of any groups.</Text>
        )}

        {selectedGroup && (
          <View style={styles.selectedGroupInfo}>
            <Text style={styles.sectionTitle}>Users in {selectedGroup.name} ({groupUsers.length} online):</Text>
            <FlatList data={groupUsers} keyExtractor={(item) => item.user_id} renderItem={({ item }) => <View style={styles.userItem}><Text style={styles.userName}>{item.username}</Text></View>} horizontal />
          </View>
        )}
      </View>

      {selectedGroup ? (
        <View style={[styles.chatWindow, { top: 70 }]}>
            <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item }) => (
                <View style={[styles.messageBubble, item.sender_id === user.id ? styles.sentMessageBubble : styles.receivedMessageBubble]}>
                <Text style={item.sender_id === user.id ? styles.sentMessageSender : styles.messageSender}>{item.sender?.name || item.sender_email || 'Anonymous'}:</Text>
                {item.text ? <Text style={item.sender_id === user.id ? styles.sentMessageText : styles.messageText}>{item.text}</Text> : null}
                {renderMediaMessage(item)}
                </View>
            )}
            />
            {selectedMedia && (
            <View style={styles.previewContainer}>
                <Image source={{ uri: selectedMedia.uri }} style={styles.previewImage} />
                <TouchableOpacity onPress={() => setSelectedMedia(null)} style={styles.removePreviewButton}><Text style={styles.removePreviewText}>X</Text></TouchableOpacity>
            </View>
            )}
            <View style={styles.inputContainer}>
            <TouchableOpacity onPress={() => handleMediaPick(false)} style={styles.attachButton}><Text style={styles.attachButtonText}>📁</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleMediaPick(true)} style={styles.attachButton}><Text style={styles.attachButtonText}>📷</Text></TouchableOpacity>
            <TextInput style={styles.textInput} value={newMessage} onChangeText={setNewMessage} placeholder="Type message..." />
            {uploading ? <ActivityIndicator /> : <Button title="Send" onPress={sendMessage} />}
            </View>
        </View>
      ) : (
        <View style={[styles.chatWindow, styles.chatDisabled, { top: 70 }]}>
            <Text style={styles.noGroupsText}>Select a group to start chatting.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
    container: { flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
    groupSelectionContainer: { position: 'absolute', left: 10, right: 10, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 10, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5, zIndex: 1000 },
    searchInput: { height: 40, borderColor: '#ccc', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, marginBottom: 10, backgroundColor: '#fff' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 5, color: '#333' },
    noGroupsText: { color: '#8E8E93', fontStyle: 'italic' },
    groupButton: { backgroundColor: '#007AFF', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, marginRight: 10, marginBottom: 5 },
    selectedGroupButton: { backgroundColor: '#0056b3' },
    groupButtonText: { color: 'white', fontWeight: 'bold' },
    selectedGroupInfo: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
    userItem: { backgroundColor: '#f0f0f0', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 15, marginRight: 10 },
    userName: { fontSize: 12, color: '#333' },
    chatWindow: { position: 'absolute', right: 10, bottom: 10, width: 320, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5, zIndex: 999, padding: 10, justifyContent: 'flex-end' },
    chatDisabled: { justifyContent: 'center', alignItems: 'center' },
    messageBubble: { backgroundColor: '#e0e0e0', borderRadius: 8, padding: 8, marginBottom: 5, alignSelf: 'flex-start', maxWidth: '95%' },
    sentMessageBubble: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
    receivedMessageBubble: { alignSelf: 'flex-start', backgroundColor: '#e0e0e0' },
    messageSender: { fontWeight: 'bold', marginBottom: 2, color: '#333' },
    sentMessageSender: { fontWeight: 'bold', marginBottom: 2, color: 'white' },
    messageText: { color: '#333' },
    sentMessageText: { color: 'white' },
    chatImage: { width: 220, height: 220, borderRadius: 8, marginTop: 5 },
    chatVideo: { width: 220, height: 220, borderRadius: 8, marginTop: 5, backgroundColor: '#000' },
    previewContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    previewImage: { width: 50, height: 50, borderRadius: 8, marginRight: 10 },
    removePreviewButton: { backgroundColor: 'red', borderRadius: 15, width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
    removePreviewText: { color: 'white', fontWeight: 'bold' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 10 },
    attachButton: { padding: 10, marginRight: 5, backgroundColor: '#007AFF', borderRadius: 5 },
    attachButtonText: { color: 'white', fontSize: 18 },
    textInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 8, marginRight: 10, color: '#333' },
});

export default GlobalChatAndPresence;
