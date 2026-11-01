import React, {useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Video from 'react-native-video';
import {mediaUrl} from '../config';
import {colors, font, spacing, weight} from '../theme';
import {Icon} from './ui';

export interface VideoPlayerProps {
  uri: string;
  poster?: string | null;
  paused: boolean;
  muted?: boolean;
  repeat?: boolean;
  resizeMode?: 'cover' | 'contain';
  /** Mount the native player (false = poster only, saves memory in long feeds). */
  mount?: boolean;
  /** Show a big play icon while paused by the user. */
  showPausedIcon?: boolean;
  style?: StyleProp<ViewStyle>;
  onLoad?: (durationSec: number) => void;
}

/**
 * react-native-video 5.2.1 (AVPlayer on iOS, ExoPlayer 2.13 on Android) with
 * poster-until-first-frame, buffering spinner and error + retry.
 */
export function VideoPlayer({
  uri,
  poster,
  paused,
  muted = false,
  repeat = true,
  resizeMode = 'cover',
  mount = true,
  showPausedIcon,
  style,
  onLoad,
}: VideoPlayerProps) {
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = mediaUrl(uri);
  const posterSrc = mediaUrl(poster);

  return (
    <View style={[styles.container, style]}>
      {mount && src && !error ? (
        <Video
          key={attempt}
          source={{uri: src}}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          paused={paused}
          muted={muted}
          repeat={repeat}
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
          useTextureView
          hideShutterView
          progressUpdateInterval={1000}
          bufferConfig={{
            minBufferMs: 2500,
            maxBufferMs: 15000,
            bufferForPlaybackMs: 1000,
            bufferForPlaybackAfterRebufferMs: 2000,
          }}
          onLoad={d => {
            setReady(true);
            setBuffering(false);
            onLoad?.(d.duration);
          }}
          onReadyForDisplay={() => setReady(true)}
          onBuffer={({isBuffering}) => setBuffering(isBuffering)}
          onError={() => {
            setError(true);
            setBuffering(false);
          }}
        />
      ) : null}

      {posterSrc && (!ready || !mount || error) ? (
        <Image
          source={{uri: posterSrc}}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
        />
      ) : null}

      {mount && !error && !paused && (buffering || !ready) ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      ) : null}

      {showPausedIcon && paused && !error ? (
        <View style={styles.center} pointerEvents="none">
          <View style={styles.playBadge}>
            <Icon name="play" size={40} color={colors.white} />
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.center}>
          <Icon name="alert-circle-outline" size={36} color={colors.white} />
          <Text style={styles.errorText}>
            This video can't be played right now.
          </Text>
          <Pressable
            onPress={() => {
              setError(false);
              setReady(false);
              setBuffering(true);
              setAttempt(a => a + 1);
            }}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Retry video">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {backgroundColor: '#100C28', overflow: 'hidden'},
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 5,
  },
  errorText: {
    color: colors.white,
    fontSize: font.md,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  retry: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  retryText: {color: colors.white, fontWeight: weight.semibold},
});
