import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  Platform,
  StatusBar,
  SafeAreaView,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { FontAwesome as Icon } from '@expo/vector-icons';

/**
 * Universal Full-Screen Media & Image Viewer
 * Features:
 * - Full image view in all scenarios (resizeMode="contain", no clipping)
 * - Responsive left/right scrolling via:
 *   1. Smooth Touch/Swipe Gestures (PanResponder & native horizontal ScrollView)
 *   2. Large, prominent floating Left (<) & Right (>) navigation buttons
 *   3. Interactive bottom thumbnail carousel with active indicator & auto-centering
 *   4. Web keyboard arrow navigation (ArrowLeft, ArrowRight, Escape)
 *   5. Mouse wheel & trackpad horizontal scroll support
 * - Cyclic navigation (wrap around first <-> last seamlessly)
 * - 1x / 2x / 3x zoom toggle with pan protection
 * - Video playback support with native controls
 * - Per-item dynamic title and subtitle badge
 * - Image loading indicator & graceful error fallback
 */
const FullScreenImageViewer = ({
  visible = false,
  mediaList = [],
  initialIndex = 0,
  onClose,
  title,
}) => {
  const windowDims = useWindowDimensions();
  const screenWidth = windowDims.width || Dimensions.get('window').width || 360;
  const screenHeight = windowDims.height || Dimensions.get('window').height || 640;

  // Viewport dimensions for carousel area (between header and thumbnail bar)
  const [viewportWidth, setViewportWidth] = useState(screenWidth);
  const [viewportHeight, setViewportHeight] = useState(screenHeight - 140);
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const [imageLoadingMap, setImageLoadingMap] = useState({});
  const [imageErrorMap, setImageErrorMap] = useState({});
  const [zoomScale, setZoomScale] = useState(1);

  const mainScrollRef = useRef(null);
  const thumbnailScrollRef = useRef(null);
  const currentIndexRef = useRef(initialIndex || 0);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef(null);
  const lastWheelTime = useRef(0);

  // Normalize media items into { id, uri, type: 'image' | 'video', title, subtitle }
  const normalizedMedia = useMemo(() => {
    if (!mediaList || !Array.isArray(mediaList)) return [];
    return mediaList
      .map((item, idx) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const isVid = !!item.match(/\.(mp4|mov|webm|m4v|avi)($|\?)/i);
          return {
            id: `media-str-${idx}-${item}`,
            uri: item,
            type: isVid ? 'video' : 'image',
            title: null,
            subtitle: null,
          };
        }
        const uri = item.uri || item.url || item.media_url || item.file_url || item.image_url;
        if (!uri) return null;
        const type = (item.type || item.media_type || item.file_type || '').toLowerCase();
        const isVid = type.includes('video') || !!uri.match(/\.(mp4|mov|webm|m4v|avi)($|\?)/i);
        return {
          id: item.id ? String(item.id) : `media-obj-${idx}-${uri}`,
          uri,
          type: isVid ? 'video' : 'image',
          title: item.title || item.name || item.product_name || item.label || null,
          subtitle: item.subtitle || (item.price || item.amount ? `₹${item.amount || item.price}` : null),
        };
      })
      .filter(Boolean);
  }, [mediaList]);

  const totalCount = normalizedMedia.length;

  // Keep currentIndexRef synchronized
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Helper to reliably scroll the main ScrollView across platforms
  const scrollCarouselTo = useCallback((x, animated = true) => {
    if (!mainScrollRef.current) return;
    try {
      if (typeof mainScrollRef.current.scrollTo === 'function') {
        mainScrollRef.current.scrollTo({ x, animated });
      }
      if (Platform.OS === 'web') {
        const node = mainScrollRef.current.getScrollableNode
          ? mainScrollRef.current.getScrollableNode()
          : mainScrollRef.current;
        if (node) {
          if (animated && typeof node.scrollTo === 'function') {
            node.scrollTo({ left: x, behavior: 'smooth' });
          } else {
            node.scrollLeft = x;
          }
        }
      }
    } catch (err) {
      console.warn('scrollCarouselTo error:', err);
    }
  }, []);

  // Center thumbnail item in thumbnail bar
  const centerThumbnail = useCallback((index) => {
    if (thumbnailScrollRef.current && totalCount > 1) {
      const thumbWidth = 66; // 56 width + 10 gap
      const scrollOffset = Math.max(0, index * thumbWidth - viewportWidth / 2 + thumbWidth / 2);
      if (typeof thumbnailScrollRef.current.scrollTo === 'function') {
        thumbnailScrollRef.current.scrollTo({ x: scrollOffset, animated: true });
      }
    }
  }, [totalCount, viewportWidth]);

  // Navigate to specific index
  const goToIndex = useCallback(
    (index, animated = true) => {
      if (totalCount === 0) return;
      let safeIdx = index;
      // Cyclic wrap-around
      if (safeIdx < 0) safeIdx = totalCount - 1;
      if (safeIdx >= totalCount) safeIdx = 0;

      setCurrentIndex(safeIdx);
      currentIndexRef.current = safeIdx;
      setZoomScale(1);

      // Flag programmatic scroll so intermediate onScroll events don't overwrite index
      isProgrammaticScroll.current = true;
      if (programmaticScrollTimer.current) {
        clearTimeout(programmaticScrollTimer.current);
      }
      programmaticScrollTimer.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 400);

      scrollCarouselTo(safeIdx * viewportWidth, animated);
      centerThumbnail(safeIdx);
    },
    [totalCount, viewportWidth, scrollCarouselTo, centerThumbnail]
  );

  const handlePrev = useCallback(() => {
    if (totalCount <= 1) return;
    const prevIdx = currentIndexRef.current > 0 ? currentIndexRef.current - 1 : totalCount - 1;
    goToIndex(prevIdx);
  }, [totalCount, goToIndex]);

  const handleNext = useCallback(() => {
    if (totalCount <= 1) return;
    const nextIdx = currentIndexRef.current < totalCount - 1 ? currentIndexRef.current + 1 : 0;
    goToIndex(nextIdx);
  }, [totalCount, goToIndex]);

  // Cycle zoom: 1x -> 2x -> 3x -> 1x
  const toggleZoom = useCallback(() => {
    setZoomScale((prev) => {
      if (prev === 1) return 2;
      if (prev === 2) return 3;
      return 1;
    });
  }, []);

  // PanResponder to enable smooth swipe gestures across Web, iOS, and Android
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // If zoomed, allow panning around the image rather than changing slides
          if (zoomScale > 1) return false;
          if (totalCount <= 1) return false;
          // Capture predominant horizontal swipe gestures
          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
          return isHorizontal && Math.abs(gestureState.dx) > 12;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (zoomScale > 1 || totalCount <= 1) return;
          const { dx, vx } = gestureState;
          if (dx < -35 || vx < -0.25) {
            handleNext();
          } else if (dx > 35 || vx > 0.25) {
            handlePrev();
          }
        },
      }),
    [zoomScale, totalCount, handleNext, handlePrev]
  );

  // Handle native scroll completion (momentum scroll end)
  const handleMomentumScrollEnd = useCallback(
    (e) => {
      if (isProgrammaticScroll.current) return;
      const offsetX = e.nativeEvent?.contentOffset?.x ?? 0;
      if (viewportWidth <= 0) return;
      const newIdx = Math.round(offsetX / viewportWidth);
      const safeIdx = Math.min(Math.max(0, newIdx), totalCount - 1);
      if (safeIdx !== currentIndexRef.current) {
        setCurrentIndex(safeIdx);
        currentIndexRef.current = safeIdx;
        setZoomScale(1);
        centerThumbnail(safeIdx);
      }
    },
    [viewportWidth, totalCount, centerThumbnail]
  );

  // Synchronize when modal opens or initialIndex changes
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && totalCount > 0) {
      const safeIdx = Math.min(Math.max(0, initialIndex || 0), totalCount - 1);
      setCurrentIndex(safeIdx);
      currentIndexRef.current = safeIdx;
      setZoomScale(1);

      const timer = setTimeout(() => {
        scrollCarouselTo(safeIdx * viewportWidth, false);
        centerThumbnail(safeIdx);
      }, 50);

      prevVisibleRef.current = visible;
      return () => clearTimeout(timer);
    }
    prevVisibleRef.current = visible;
  }, [visible, initialIndex, totalCount, viewportWidth, scrollCarouselTo, centerThumbnail]);

  // Handle initialIndex update while already visible
  const prevInitialIndexRef = useRef(initialIndex);
  useEffect(() => {
    if (visible && prevInitialIndexRef.current !== initialIndex) {
      prevInitialIndexRef.current = initialIndex;
      goToIndex(initialIndex, false);
    }
  }, [visible, initialIndex, goToIndex]);

  // Keep scroll aligned when viewport dimensions change (rotation, resize)
  useEffect(() => {
    if (windowDims.width && windowDims.height) {
      const timer = setTimeout(() => {
        scrollCarouselTo(currentIndexRef.current * viewportWidth, false);
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [windowDims.width, windowDims.height, viewportWidth, scrollCarouselTo]);

  // Web Keyboard & Mouse Wheel navigation
  useEffect(() => {
    if (Platform.OS === 'web' && visible && typeof window !== 'undefined') {
      const handleKeyDown = (e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onClose?.();
        }
      };

      const handleWheel = (e) => {
        const now = Date.now();
        if (now - lastWheelTime.current < 250) return;
        const delta = Math.abs(e.deltaX) > 10 ? e.deltaX : (Math.abs(e.deltaY) > 10 ? e.deltaY : 0);
        if (delta > 20) {
          lastWheelTime.current = now;
          handleNext();
        } else if (delta < -20) {
          lastWheelTime.current = now;
          handlePrev();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('wheel', handleWheel, { passive: true });

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('wheel', handleWheel);
      };
    }
  }, [visible, handlePrev, handleNext, onClose]);

  if (!visible) return null;

  const currentMedia = normalizedMedia[currentIndex] || normalizedMedia[0];
  const activeTitle = currentMedia?.title || title || 'Full Screen View';
  const activeSubtitle = currentMedia?.subtitle || null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <View style={styles.headerInfo}>
              {totalCount > 1 && (
                <View style={styles.counterBadge}>
                  <Text style={styles.counterText}>
                    {currentIndex + 1} / {totalCount}
                  </Text>
                </View>
              )}
              <View style={styles.headerTitleWrap}>
                {activeTitle ? (
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {activeTitle}
                  </Text>
                ) : null}
                {activeSubtitle ? (
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {activeSubtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.headerActions}>
              {/* Zoom Button (for images) */}
              {currentMedia?.type !== 'video' && (
                <TouchableOpacity
                  style={[styles.actionButton, zoomScale > 1 && styles.actionButtonActive]}
                  onPress={toggleZoom}
                  activeOpacity={0.8}
                  accessibilityLabel="Toggle zoom level"
                >
                  <Icon
                    name={zoomScale > 1 ? 'search-minus' : 'search-plus'}
                    size={15}
                    color="#FFFFFF"
                  />
                  <Text style={styles.zoomButtonText}>{zoomScale}x</Text>
                </TouchableOpacity>
              )}

              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityLabel="Close full screen view"
              >
                <Icon name="times" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Carousel Slide Area */}
          {totalCount === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="image" size={54} color="#475569" />
              <Text style={styles.emptyText}>No image available to display</Text>
            </View>
          ) : (
            <View
              style={styles.carouselWrapper}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) {
                  setViewportWidth(width);
                  setViewportHeight(height);
                }
              }}
              {...panResponder.panHandlers}
            >
              {/* Horizontal Paging ScrollView */}
              <ScrollView
                ref={mainScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                scrollEventThrottle={16}
                scrollEnabled={zoomScale === 1}
                contentContainerStyle={styles.scrollContentContainer}
                style={styles.mainScrollView}
              >
                {normalizedMedia.map((item, index) => {
                  const isCurrent = index === currentIndex;
                  const isVideo = item.type === 'video';
                  const hasError = imageErrorMap[item.id];

                  return (
                    <View
                      key={item.id || `slide-${index}`}
                      style={[
                        styles.slide,
                        {
                          width: viewportWidth,
                          height: viewportHeight,
                        },
                      ]}
                    >
                      {isVideo ? (
                        <View style={styles.mediaFrame}>
                          <Video
                            source={{ uri: item.uri }}
                            style={styles.fullMedia}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay={isCurrent}
                            isLooping
                          />
                        </View>
                      ) : (
                        <View style={styles.mediaFrame}>
                          {imageLoadingMap[item.id] && !hasError && (
                            <View style={styles.mediaLoader}>
                              <ActivityIndicator size="large" color="#38BDF8" />
                            </View>
                          )}
                          {hasError ? (
                            <View style={styles.errorFrame}>
                              <Icon name="exclamation-triangle" size={42} color="#F59E0B" />
                              <Text style={styles.errorText}>Unable to load image</Text>
                            </View>
                          ) : (
                            <Image
                              source={{ uri: item.uri }}
                              style={[
                                styles.fullMedia,
                                isCurrent && zoomScale > 1
                                  ? { transform: [{ scale: zoomScale }] }
                                  : null,
                              ]}
                              resizeMode="contain"
                              onLoadStart={() =>
                                setImageLoadingMap((prev) => ({ ...prev, [item.id]: true }))
                              }
                              onLoadEnd={() =>
                                setImageLoadingMap((prev) => ({ ...prev, [item.id]: false }))
                              }
                              onError={() => {
                                setImageLoadingMap((prev) => ({ ...prev, [item.id]: false }));
                                setImageErrorMap((prev) => ({ ...prev, [item.id]: true }));
                              }}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Left Arrow Button (<) */}
              {totalCount > 1 && (
                <TouchableOpacity
                  style={[styles.navArrow, styles.navArrowLeft]}
                  onPress={handlePrev}
                  activeOpacity={0.85}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  accessibilityLabel="Previous image"
                >
                  <Icon name="chevron-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              )}

              {/* Right Arrow Button (>) */}
              {totalCount > 1 && (
                <TouchableOpacity
                  style={[styles.navArrow, styles.navArrowRight]}
                  onPress={handleNext}
                  activeOpacity={0.85}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  accessibilityLabel="Next image"
                >
                  <Icon name="chevron-right" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Bottom Thumbnails Strip */}
          {totalCount > 1 && (
            <View style={styles.bottomBar}>
              <ScrollView
                ref={thumbnailScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailScrollContent}
              >
                {normalizedMedia.map((m, idx) => {
                  const isActive = idx === currentIndex;
                  const isVid = m.type === 'video';

                  return (
                    <TouchableOpacity
                      key={`thumb-${m.id || idx}`}
                      style={[styles.thumbnailWrap, isActive && styles.thumbnailWrapActive]}
                      onPress={() => goToIndex(idx)}
                      activeOpacity={0.8}
                      accessibilityLabel={`View media ${idx + 1}`}
                    >
                      {isVid ? (
                        <View style={styles.thumbnailVideoPlaceholder}>
                          <Icon name="play" size={12} color="#FFFFFF" />
                        </View>
                      ) : (
                        <Image
                          source={{ uri: m.uri }}
                          style={styles.thumbnailImage}
                          resizeMode="cover"
                        />
                      )}
                      {isActive && <View style={styles.thumbnailActiveIndicator} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    zIndex: 40,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  counterBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 10,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    gap: 5,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  actionButtonActive: {
    backgroundColor: '#0284C7',
  },
  zoomButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  carouselWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          cursor: 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }
      : {}),
  },
  mainScrollView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  scrollContentContainer: {
    alignItems: 'center',
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaFrame: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    padding: 4,
  },
  fullMedia: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web'
      ? {
          userSelect: 'none',
        }
      : {}),
  },
  mediaLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  errorFrame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
          userSelect: 'none',
        }
      : {}),
  },
  navArrowLeft: {
    left: 16,
  },
  navArrowRight: {
    right: 16,
  },
  bottomBar: {
    height: 76,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    zIndex: 40,
  },
  thumbnailScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  thumbnailWrap: {
    width: 54,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#1E293B',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  thumbnailWrapActive: {
    borderColor: '#38BDF8',
    transform: [{ scale: 1.08 }],
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailVideoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailActiveIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#38BDF8',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default FullScreenImageViewer;
