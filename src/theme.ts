import { DarkTheme, type Theme } from 'expo-router';

export const colors = {
  bg: '#0E0E12',
  surface: '#18181F',
  surfaceAlt: '#22222B',
  border: '#2E2E3A',
  text: '#F2F2F5',
  textDim: '#9A9AAB',
  accent: '#FF5C7A',
  accentDim: '#5A2532',
  danger: '#FF4D4D',
  success: '#4CD290',
  warning: '#FFB547',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

// Hauteur minimale des zones tactiles (au-dessus des 44/48 pt recommandés).
export const touch = 52;

export const radius = { sm: 8, md: 12, lg: 20 };

export const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};
