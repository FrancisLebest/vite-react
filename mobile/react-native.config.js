/**
 * React Native CLI configuration (autolinking).
 *
 * react-native-video 5.2.1 ships two Android implementations. The default one
 * (`android/`) depends on a JitPack-only artifact (Android-ScalableVideoView)
 * and forces abiFilters. We link the bundled ExoPlayer implementation instead,
 * whose dependencies (ExoPlayer 2.13.3, AndroidX, OkHttp) resolve from
 * google() / mavenCentral(). See patches/react-native-video+5.2.1.patch.
 */
module.exports = {
  dependencies: {
    'react-native-video': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-video/android-exoplayer',
        },
      },
    },
  },
};
