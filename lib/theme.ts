// Apple Vision Pro inspired theme
export const colors = {
  primary: '#4A90D9',
  primaryDark: '#3A7BC8',
  primaryLight: 'rgba(74,144,217,0.15)',
  primaryGlow: 'rgba(74,144,217,0.25)',
  secondary: '#6B7B8D',
  accent: '#4FC3F7',
  accentGlow: 'rgba(79,195,247,0.15)',
  success: '#4CAF50',
  successGlow: 'rgba(76,175,80,0.12)',
  successBg: 'rgba(76,175,80,0.08)',
  warning: '#FF9800',
  warningGlow: 'rgba(255,152,0,0.12)',
  warningBg: 'rgba(255,152,0,0.08)',
  danger: '#E53935',
  dangerGlow: 'rgba(229,57,53,0.12)',
  dangerBg: 'rgba(229,57,53,0.08)',
  glass: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.1)',
  glassLight: 'rgba(255,255,255,0.04)',
  glassMedium: 'rgba(255,255,255,0.08)',
  glassHeavy: 'rgba(255,255,255,0.14)',
  bgStart: '#0D1117',
  bgMid: '#161B22',
  bgEnd: '#1C2128',
  text: '#E6EDF3',
  textSecondary: 'rgba(230,237,243,0.6)',
  textTertiary: 'rgba(230,237,243,0.35)',
  textMuted: 'rgba(230,237,243,0.2)',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.04)',
  borderActive: 'rgba(74,144,217,0.5)',
  tabBg: 'rgba(13,17,23,0.92)',
  tabActive: '#4A90D9',
  tabInactive: 'rgba(230,237,243,0.35)',
  currency: '₹',
};

export const gradients = {
  background: ['#0D1117', '#161B22', '#1C2128'] as string[],
  card: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'] as string[],
  primary: ['#4A90D9', '#5BA0E6'] as string[],
  success: ['#4CAF50', '#66BB6A'] as string[],
  danger: ['#E53935', '#EF5350'] as string[],
  accent: ['#4FC3F7', '#4A90D9'] as string[],
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40,
};

export const borderRadius = {
  sm: 8, md: 14, lg: 20, xl: 28, full: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, color: '#E6EDF3' },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3, color: '#E6EDF3' },
  h3: { fontSize: 17, fontWeight: '600' as const, color: '#E6EDF3' },
  body: { fontSize: 15, fontWeight: '400' as const, color: 'rgba(230,237,243,0.8)' },
  caption: { fontSize: 12, fontWeight: '400' as const, color: 'rgba(230,237,243,0.5)' },
  label: { fontSize: 12, fontWeight: '500' as const, color: 'rgba(230,237,243,0.5)', letterSpacing: 0.5, textTransform: 'uppercase' as const },
};

export const glassStyle = {
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  borderRadius: 16,
};

export const shadows = {
  glow: { shadowColor: '#4A90D9', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  soft: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
};

export function formatINR(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `₹${amount < 0 ? '-' : ''}${formatted}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}