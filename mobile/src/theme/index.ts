import {Dimensions, PixelRatio, Platform} from 'react-native';

export const colors = {
  primary: '#3B1FA8',
  primaryDark: '#2A1580',
  primaryLight: '#5B3FD6',
  primarySoft: '#EEEAFB',
  primaryTint: '#F6F4FD',
  background: '#FFFFFF',
  surface: '#F7F6FC',
  border: '#E8E6F2',
  text: '#16142B',
  textSecondary: '#6B6880',
  textMuted: '#9A97AD',
  white: '#FFFFFF',
  black: '#000000',
  danger: '#E5484D',
  success: '#2FB36B',
  overlay: 'rgba(16, 12, 40, 0.55)',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

// Design was drawn on a ~375pt wide phone. We scale font sizes moderately so
// that text stays readable on small Android 7 devices and does not explode on tablets.
const BASE_WIDTH = 375;
const {width: SCREEN_WIDTH} = Dimensions.get('window');
const shortSide = Math.min(SCREEN_WIDTH, Dimensions.get('window').height);

export function moderateScale(size: number, factor = 0.35): number {
  const ratio = Math.min(Math.max(shortSide / BASE_WIDTH, 0.85), 1.35);
  return PixelRatio.roundToNearestPixel(size + (size * ratio - size) * factor);
}

export const font = {
  xs: moderateScale(11),
  sm: moderateScale(12),
  md: moderateScale(14),
  lg: moderateScale(16),
  xl: moderateScale(18),
  xxl: moderateScale(22),
  title: moderateScale(26),
};

export const weight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#2A1580',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  default: {elevation: 2},
});

/** Max width for content columns so layouts stay readable on tablets / landscape. */
export const MAX_CONTENT_WIDTH = 680;
