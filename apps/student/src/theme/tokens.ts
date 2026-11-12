/** Design tokens taken from the approved Bodhin screens (navy + gold on ivory). */
export const palette = {
  ivory: '#FBF7F0',
  ivoryDeep: '#F5ECDD',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F5F9',
  ink: '#0E1B33',
  inkSoft: '#3A465C',
  muted: '#6B7486',
  border: '#E4E8EF',
  borderStrong: '#CBD3DF',
  success: '#15803D',
  successBg: '#E8F6EC',
  danger: '#D93A3F',
  dangerBg: '#FDECEC',
  warning: '#B7791F',
  warningBg: '#FDF3E1',
  info: '#1D5FD0',
  infoBg: '#E9F0FD',
  live: '#E5383B',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

/** Minimum touch target (Apple 44pt / Material 48dp). We use 52 for primary actions. */
export const touch = { min: 48, primary: 54 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
};

/** Max content width so web/tablet layouts don't stretch phone screens edge-to-edge. */
export const layout = { authMaxWidth: 440, contentMaxWidth: 720 } as const;
