import React, { useState, useEffect, useRef, memo } from 'react';
import { View, StyleSheet, PanResponder, Animated, Text } from 'react-native';
import { supabase } from '../services/supabaseClient';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Memoize the Cursor component so it only re-renders when its props change.
// This is important for performance with multiple cursors.
const Cursor = memo(({ position, name }) => (
  <Animated.View style={[styles.cursor, { transform: position.getTranslateTransform() }]}>
    <Icon name="navigation" size={24} color="#007AFF" style={styles.cursorIcon} />
    <Text style={styles.cursorLabel}>{name}</Text>
  </Animated.View>
));

export default function RealtimeCursorDisplay({ user }) {
  // remoteCursors will now store the Animated.ValueXY instances directly.
  const [remoteCursors, setRemoteCursors] = useState({});
  const myCursorPos = useRef(new Animated.ValueXY({ x: -100, y: -100 })).current;
  const channelRef = useRef(null);
  const myInstanceId = useRef(Date.now() + Math.random()).current;

  // Use a ref to store remote cursor data to update animations without re-rendering.
  const remoteCursorsRef = useRef({});

  // This is a bit of a hack to get userProfile, ideally it should be passed as a prop.
  const [userProfile, setUserProfile] = useState({ name: '' });

  useEffect(() => {
    const channelName = 'cursor-channel';
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });
    channelRef.current = channel;

    const fetchProfile = async () => {
      if (user) {
        const { data } = await supabase.from('profiles').select('name').eq('id', user.id).single();
        setUserProfile(data || { name: user.email });
      }
    };
    fetchProfile();

    channel
      .on('broadcast', { event: 'cursor-pos' }, ({ payload }) => {
        if (payload.instanceId === myInstanceId) {
          return; // Ignore messages from our own instance
        }

        const { userId, x, y, name } = payload;
        const existingCursor = remoteCursorsRef.current[userId];

        if (existingCursor) {
          // If cursor exists, just update its position.
          existingCursor.position.setValue({ x, y });
        } else {
          // If it's a new cursor, create a new animated value and update the state.
          remoteCursorsRef.current[userId] = {
            position: new Animated.ValueXY({ x, y }),
            name: name,
          };
          // Trigger a re-render to add the new cursor to the DOM.
          setRemoteCursors({ ...remoteCursorsRef.current });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Successfully subscribed to channel: ${channelName}`);
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, myInstanceId]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        const { moveX, moveY } = gestureState;
        // Update our own cursor's animated position directly.
        myCursorPos.setValue({ x: moveX, y: moveY });

        // Broadcast our position on move
        if (channelRef.current && user && userProfile.name) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'cursor-pos',
            payload: {
              userId: user.id,
              instanceId: myInstanceId,
              name: userProfile.name,
              x: moveX,
              y: moveY,
            },
          });
        }
      },
      onPanResponderRelease: () => {
        // Move cursor off-screen when touch is released
        myCursorPos.setValue({ x: -100, y: -100 });
      },
    })
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Render our own cursor */}
      <Cursor position={myCursorPos} name={userProfile.name || 'You'} />

      {/* Render cursors for other users */}
      {Object.entries(remoteCursors).map(([userId, { position, name }]) => (
        <Cursor key={userId} position={position} name={name} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    zIndex: 100, // Ensure it's on top
    pointerEvents: 'auto', // Make sure it can capture touch events
  },
  cursor: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cursorIcon: {
    transform: [{ rotate: '45deg' }],
  },
  cursorLabel: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    fontSize: 12,
    marginTop: 8,
    fontWeight: 'bold',
  },
});
