import React, { useState, useEffect, useRef, memo } from 'react';
import { View, StyleSheet, PanResponder, Animated, Text } from 'react-native';
import { supabase } from '../services/supabaseClient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Svg, { Path } from 'react-native-svg';

const HEADER_OFFSET = 120; // A constant for the header height to prevent overlap

// Memoized Cursor component for performance
const Cursor = memo(({ position, name }) => (
  <Animated.View style={[styles.cursor, { transform: position.getTranslateTransform() }]}>
    <Icon name="navigation" size={24} color="#007AFF" style={styles.cursorIcon} />
    <Text style={styles.cursorLabel}>{name}</Text>
  </Animated.View>
));

// Helper to convert points to an SVG path string
const pointsToPath = (points) => {
  if (points.length < 1) return '';
  return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
};

export default function RealtimeCollaboration({ user, userProfile }) {
  // State for all completed paths from all users
  const [paths, setPaths] = useState({});
  // State for the path currently being drawn by the local user
  const [myCurrentPath, setMyCurrentPath] = useState([]);
  
  // Refs for animated values and Supabase channel
  const myCursorPos = useRef(new Animated.ValueXY({ x: -100, y: -100 })).current;
  const remoteCursors = useRef({}).current; // Using a ref to update positions without re-rendering
  const [remoteCursorsForRender, setRemoteCursorsForRender] = useState({});
  const channelRef = useRef(null);
  const currentPathId = useRef(null);

  useEffect(() => {
    if (!user) return;

    const channelName = 'global-collaboration-canvas'; // Generic channel name, not tied to a group
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    channelRef.current = channel;

    const setupChannel = () => {
      channel
        .on('broadcast', { event: 'cursor-pos' }, ({ payload }) => {
          if (!remoteCursors[payload.userId]) {
            remoteCursors[payload.userId] = { 
              position: new Animated.ValueXY({ x: payload.x, y: payload.y }),
              name: payload.name 
            };
            setRemoteCursorsForRender({...remoteCursors});
          } else {
            remoteCursors[payload.userId].position.setValue({ x: payload.x, y: payload.y });
          }
        })
        .on('broadcast', { event: 'path-complete' }, ({ payload }) => {
            setPaths(current => ({ ...current, [payload.pathId]: payload.points }));
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') console.log(`Subscribed to ${channelName}`);
        });
    };

    setupChannel();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [user]); // Dependency array no longer includes selectedGroup

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        currentPathId.current = `${user.id}-${Date.now()}`;
        const point = { x: gestureState.x0, y: gestureState.y0 - HEADER_OFFSET };
        setMyCurrentPath([point]);
      },
      onPanResponderMove: (evt, gestureState) => {
        const { moveX, moveY } = gestureState;
        const correctedY = moveY - HEADER_OFFSET;

        myCursorPos.setValue({ x: moveX, y: correctedY });
        const newPoint = { x: moveX, y: correctedY };
        setMyCurrentPath(current => [...current, newPoint]);

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast', event: 'cursor-pos', 
                payload: { userId: user.id, name: userProfile?.name || user.email, x: moveX, y: correctedY },
            });
        }
      },
      onPanResponderRelease: () => {
        myCursorPos.setValue({ x: -100, y: -100 });
        if (myCurrentPath.length > 0) {
            // Add the final path to the main state
            setPaths(current => ({ ...current, [currentPathId.current]: myCurrentPath }));
            // Broadcast the completed path to others
            if (channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast', event: 'path-complete', 
                    payload: { pathId: currentPathId.current, points: myCurrentPath },
                });
            }
        }
        // Clear the temporary path
        setMyCurrentPath([]);
        currentPathId.current = null;
      },
    })
  ).current;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Svg style={styles.drawingSurface} {...panResponder.panHandlers}>
        {/* Render completed paths from all users */}
        {Object.entries(paths).map(([pathId, points]) => (
          <Path key={pathId} d={pointsToPath(points)} stroke="#333" strokeWidth={3} fill="none" />
        ))}
        {/* Render current user's drawing in real-time */}
        {myCurrentPath.length > 0 && (
            <Path d={pointsToPath(myCurrentPath)} stroke="red" strokeWidth={3} fill="none" />
        )}
      </Svg>
      {/* Cursors are rendered on top of the Svg canvas but do not capture touch events. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Cursor position={myCursorPos} name={userProfile?.name || 'You'} />
        {Object.entries(remoteCursorsForRender).map(([userId, { position, name }]) => (
          <Cursor key={userId} position={position} name={name} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    marginTop: HEADER_OFFSET, // Use the constant for the margin
  },
  drawingSurface: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cursor: {
    position: 'absolute',
    alignItems: 'center',
  },
  cursorIcon: {
    transform: [{ rotate: '45deg' }],
  },
  cursorLabel: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 12,
    marginTop: 4,
  },
});
