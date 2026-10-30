// ZAPFIT design tokens — parity with mobile (Material3 seed) + server web.
// Mobile: ColorScheme.fromSeed(seedColor) / dark #5EADEB, light #1976D2.
// PC shell maps them onto Tailwind surfaces so all three clients look as one.

export const SEED = {
  dark: '#5EADEB',
  light: '#1976D2',
};

export const SURFACE = {
  dark: {
    app: '#101418', // M3-ish neutral, was #121212
    container: '#1A2027',
    card: 'rgba(26, 32, 39, 0.85)',
    border: 'rgba(255,255,255,0.08)',
    text: '#E8EEF4',
    textSecondary: '#93A1B3',
  },
  light: {
    app: '#F4F6FA',
    container: '#FFFFFF',
    card: 'rgba(255,255,255,0.9)',
    border: 'rgba(15,23,42,0.08)',
    text: '#0F172A',
    textSecondary: '#64748B',
  },
};

// 5 primary tabs mirror mobile bottom nav; everything else is secondary.
export const PRIMARY_TABS = ['followers', 'rides', 'plan', 'health', 'settings'];

export function withAlpha(hex, alpha) {
  // hex #RRGGBB + alpha 0..1 -> rgba() string for inline styles
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
