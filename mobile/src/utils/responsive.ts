import {useWindowDimensions} from 'react-native';
import {MAX_CONTENT_WIDTH} from '../theme';

/**
 * Reactive layout info. Re-renders on rotation, split-screen (Android 7+),
 * iPad Slide Over, etc.
 */
export function useResponsive() {
  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
  const horizontalInset = Math.max((width - contentWidth) / 2, 0);
  return {
    width,
    height,
    isLandscape,
    isTablet,
    contentWidth,
    horizontalInset,
    /** columns for icon grids (trending topics, categories) */
    gridColumns: contentWidth >= 560 ? 7 : contentWidth >= 400 ? 5 : 4,
  };
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(n);
}
