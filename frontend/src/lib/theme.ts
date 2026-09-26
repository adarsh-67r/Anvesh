export const colors = {
  primary: "#4F46E5",
  primaryLight: "#EEF2FF",
  primaryDark: "#3525CD",
  secondary: "#0EA5E9",
  secondaryLight: "#E0F2FE",
  secondaryDark: "#0369A1",
  tertiary: "#10B981",
  tertiaryLight: "#D1FAE5",
  tertiaryDark: "#065F46",
  error: "#BA1A1A",
  errorLight: "#FFDAD6",
  surface: "#F8FAFC",
  surfaceWhite: "#FFFFFF",
  border: "#E2E8F0",
  borderMuted: "#CBD5E1",
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  locked: "#F1F5F9",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

export const fonts = {
  regular: { fontFamily: "PlusJakartaSans_400Regular" },
  medium: { fontFamily: "PlusJakartaSans_500Medium" },
  semibold: { fontFamily: "PlusJakartaSans_600SemiBold" },
  bold: { fontFamily: "PlusJakartaSans_700Bold" },
  extrabold: { fontFamily: "PlusJakartaSans_800ExtraBold" },
} as const;

export const typography = {
  displayLg: { fontSize: 40, lineHeight: 48, ...fonts.extrabold, letterSpacing: -1.2 },
  headlineLg: { fontSize: 26, lineHeight: 34, ...fonts.bold, letterSpacing: -0.5 },
  headlineMd: { fontSize: 22, lineHeight: 30, ...fonts.bold, letterSpacing: -0.2 },
  headlineSm: { fontSize: 18, lineHeight: 26, ...fonts.semibold },
  titleMd: { fontSize: 16, lineHeight: 24, ...fonts.semibold },
  bodyLg: { fontSize: 16, lineHeight: 26, ...fonts.regular },
  bodyMd: { fontSize: 14, lineHeight: 22, ...fonts.regular },
  bodySm: { fontSize: 12, lineHeight: 18, ...fonts.medium },
  labelLg: { fontSize: 14, lineHeight: 20, ...fonts.bold, letterSpacing: 0.14 },
  labelMd: { fontSize: 12, lineHeight: 16, ...fonts.bold, letterSpacing: 0.24 },
  labelSm: { fontSize: 10, lineHeight: 14, ...fonts.extrabold, letterSpacing: 0.4 },
} as const;
