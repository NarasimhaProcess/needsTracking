import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, PermissionsAndroid, Alert } from 'react-native';
import { RTCView, RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import { supabase } from '../services/supabaseClient';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function VideoCallScreen({ route, navigation }) {
  const { selectedGroup, user } = route.params;
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const peerConnectionRef = useRef({}); // Store peer connections by user ID
  const channelRef = useRef(null);

  const myUserId = user.id;

  useEffect(() => {
    if (!selectedGroup || !myUserId) {
      Alert.alert('Error', 'Group or user not available for call.');
      navigation.goBack();
      return;
    }

    const channelName = `webrtc-group-${selectedGroup.id}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    // --- WebRTC Signaling --- //
    channel.on('broadcast', { event: 'webrtc-offer' }, async ({ payload }) => {
      const { senderId, offer } = payload;
      if (senderId === myUserId) return; // Ignore own messages
      console.log(`Received offer from ${senderId}`);
      const pc = getOrCreatePeerConnection(senderId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send({
        type: 'broadcast', event: 'webrtc-answer', payload: { senderId: myUserId, receiverId: senderId, answer },
      });
    });

    channel.on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
      const { senderId, receiverId, answer } = payload;
      if (receiverId !== myUserId) return; // Only for me
      console.log(`Received answer from ${senderId}`);
      const pc = getOrCreatePeerConnection(senderId);
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    channel.on('broadcast', { event: 'webrtc-ice-candidate' }, async ({ payload }) => {
      const { senderId, candidate } = payload;
      if (senderId === myUserId) return; // Ignore own messages
      console.log(`Received ICE candidate from ${senderId}`);
      const pc = getOrCreatePeerConnection(senderId);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding received ICE candidate', e);
      }
    });

    channel.on('broadcast', { event: 'webrtc-hangup' }, ({ payload }) => {
      const { senderId } = payload;
      console.log(`User ${senderId} hung up.`);
      removePeerConnection(senderId);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to WebRTC channel: ${channelName}`);
        await startLocalStream();
        // After subscribing and getting local stream, signal presence
        channel.send({
          type: 'broadcast', event: 'webrtc-join', payload: { userId: myUserId },
        });
      }
    });

    return () => {
      // Cleanup on unmount
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      Object.values(peerConnectionRef.current).forEach(pc => pc.close());
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setLocalStream(null);
      setRemoteStreams({});
      peerConnectionRef.current = {};
    };
  }, [selectedGroup, myUserId]);

  const getOrCreatePeerConnection = (peerId) => {
    if (!peerConnectionRef.current[peerId]) {
      const pc = new RTCPeerConnection(configuration);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          channelRef.current?.send({
            type: 'broadcast', event: 'webrtc-ice-candidate', payload: { senderId: myUserId, candidate: event.candidate },
          });
        }
      };

      pc.onaddstream = (event) => {
        console.log(`Remote stream added from ${peerId}`);
        setRemoteStreams(prev => ({ ...prev, [peerId]: event.stream }));
      };

      pc.onremovestream = (event) => {
        console.log(`Remote stream removed from ${peerId}`);
        setRemoteStreams(prev => {
          const newStreams = { ...prev };
          delete newStreams[peerId];
          return newStreams;
        });
      };

      pc.oniceconnectionstatechange = (event) => {
        console.log(`ICE connection state for ${peerId}: ${pc.iceConnectionState}`);
      };

      if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      }

      peerConnectionRef.current[peerId] = pc;
    }
    return peerConnectionRef.current[peerId];
  };

  const removePeerConnection = (peerId) => {
    if (peerConnectionRef.current[peerId]) {
      peerConnectionRef.current[peerId].close();
      delete peerConnectionRef.current[peerId];
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[peerId];
        return newStreams;
      });
    }
  };

  const startLocalStream = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    }
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' },
      });
      setLocalStream(stream);
    } catch (error) {
      console.error('Error starting local stream:', error);
      Alert.alert('Error', 'Could not access camera/microphone.');
    }
  };

  const createOffer = async (peerId) => {
    const pc = getOrCreatePeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current?.send({
      type: 'broadcast', event: 'webrtc-offer', payload: { senderId: myUserId, offer },
    });
  };

  const hangUp = () => {
    Object.values(peerConnectionRef.current).forEach(pc => pc.close());
    peerConnectionRef.current = {};
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    channelRef.current?.send({
      type: 'broadcast', event: 'webrtc-hangup', payload: { senderId: myUserId },
    });
    supabase.removeChannel(channelRef.current);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Video Call: {selectedGroup?.name}</Text>
      <View style={styles.videoContainer}>
        {localStream && (
          <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit='cover' />
        )}
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <RTCView key={peerId} streamURL={stream.toURL()} style={styles.remoteVideo} objectFit='cover' />
        ))}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.button} onPress={hangUp}>
          <Text style={styles.buttonText}>Hang Up</Text>
        </TouchableOpacity>
        {/* Add buttons for inviting specific users if needed */}
        {/* For simplicity, this example assumes all users in the group join the same call */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  videoContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  localVideo: {
    width: 150,
    height: 150,
    backgroundColor: 'black',
    margin: 5,
    borderRadius: 10,
  },
  remoteVideo: {
    width: 150,
    height: 150,
    backgroundColor: 'black',
    margin: 5,
    borderRadius: 10,
  },
  controls: {
    flexDirection: 'row',
    marginTop: 20,
  },
  button: {
    backgroundColor: 'red',
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
