export interface Palette {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primarySoft: string;
  primaryTint: string;
  background: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** text/icons on primary or on media */
  onPrimary: string;
  white: string;
  black: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  /** dark translucent background drawn over videos/images */
  scrim: string;
  scrimLight: string;
  /** background behind full-screen media */
  media: string;
  onMediaMuted: string;
  waveform: string;
  bookmarkOnMedia: string;
  shadow: string;
  /** chart series colours */
  chart: string[];
}

export const lightColors: Palette = {
  primary: '#3B1FA8',
  primaryDark: '#2A1580',
  primaryLight: '#5B3FD6',
  primarySoft: '#EEEAFB',
  primaryTint: '#F6F4FD',
  background: '#FFFFFF',
  surface: '#F7F6FC',
  card: '#FFFFFF',
  border: '#E8E6F2',
  text: '#16142B',
  textSecondary: '#6B6880',
  textMuted: '#9A97AD',
  onPrimary: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  success: '#2FB36B',
  warning: '#B26A00',
  warningSoft: '#FFF4E0',
  overlay: 'rgba(16, 12, 40, 0.55)',
  scrim: 'rgba(0, 0, 0, 0.45)',
  scrimLight: 'rgba(0, 0, 0, 0)',
  media: '#100C28',
  onMediaMuted: 'rgba(255, 255, 255, 0.8)',
  waveform: '#CFC6F3',
  bookmarkOnMedia: '#FFD54A',
  shadow: '#2A1580',
  chart: ['#3B1FA8', '#2FB36B', '#E5484D', '#F5A524', '#0EA5E9'],
};

export const darkColors: Palette = {
  primary: '#8B74F2',
  primaryDark: '#5B3FD6',
  primaryLight: '#A996FF',
  primarySoft: '#2A2450',
  primaryTint: '#1C1838',
  background: '#0E0C1D',
  surface: '#1A1730',
  card: '#16142B',
  border: '#2E2A4A',
  text: '#F1EFFA',
  textSecondary: '#B6B2CC',
  textMuted: '#8A86A3',
  onPrimary: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  danger: '#FF6B6F',
  dangerSoft: '#3A1D24',
  success: '#45C985',
  warning: '#FFB547',
  warningSoft: '#3A2C14',
  overlay: 'rgba(0, 0, 0, 0.65)',
  scrim: 'rgba(0, 0, 0, 0.5)',
  scrimLight: 'rgba(0, 0, 0, 0)',
  media: '#000000',
  onMediaMuted: 'rgba(255, 255, 255, 0.8)',
  waveform: '#4A4275',
  bookmarkOnMedia: '#FFD54A',
  shadow: '#000000',
  chart: ['#A996FF', '#45C985', '#FF6B6F', '#FFB547', '#38BDF8'],
};

