import { useContext, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenHeader } from "./Sidebar";
import { PressableScale, enter } from "./Motion";
import { colors, radii, spacing, typography } from "../lib/theme";
import { levelText } from "../lib/skills";
import { AccentContext } from "../lib/workspace";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

/** Standard screen: header, pull-to-refresh, content capped at a readable width on web. */
export function Page({ title, subtitle, right, children, onRefresh, refreshing = false }: {
  title: string; subtitle?: string; right?: ReactNode; children: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <ScreenHeader title={title} subtitle={subtitle} right={right} />
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
      >
        <View style={s.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style, index = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; index?: number }) {
  return <Animated.View entering={enter(index)} style={[s.card, style]}>{children}</Animated.View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Stat({ label, value, icon, tint = colors.primary }: { label: string; value: string; icon: IconName; tint?: string }) {
  return (
    <View style={s.stat}>
      <View style={[s.statIcon, { backgroundColor: tint + "1A" }]}>
        <MaterialIcons name={icon} size={20} color={tint} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

/** Current level (0-5) as a filled bar with a tick at the role's required level. */
export function LevelBar({ current, required, color = colors.primary }: { current: number; required: number; color?: string }) {
  const met = required > 0 && current >= required;
  return (
    <View style={s.levelTrack} accessibilityLabel={`Level ${levelText(current)} of 5, required ${required}`}>
      <View style={[s.levelFill, { width: `${(Math.min(current, 5) / 5) * 100}%`, backgroundColor: met ? colors.tertiary : color }]} />
      {required > 0 && <View style={[s.levelMark, { left: `${(required / 5) * 100}%` }]} />}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const accent = useContext(AccentContext);
  const body = (
    <View style={[s.chip, active && { backgroundColor: accent, borderColor: accent }]}>
      {icon && <MaterialIcons name={icon} size={15} color={active ? "#FFFFFF" : colors.textSecondary} />}
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </View>
  );
  return onPress ? <PressableScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}>{body}</PressableScale> : body;
}

export function Badge({ label, tint = colors.textSecondary }: { label: string; tint?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: tint + "1A" }]}>
      <Text style={[s.badgeText, { color: tint }]}>{label}</Text>
    </View>
  );
}

export function Button({ label, onPress, icon, kind = "primary", disabled, busy, accent }: {
  label: string; onPress: () => void; icon?: IconName; kind?: "primary" | "secondary" | "danger" | "light"; disabled?: boolean; busy?: boolean;
  accent?: string; // a console's colour instead of the brand indigo
}) {
  const ctx = useContext(AccentContext);
  const a = accent ?? ctx;
  const fg = kind === "primary" ? "#FFFFFF" : kind === "danger" ? colors.error : a;
  const bg = kind === "primary" ? { backgroundColor: a } : kind === "danger" ? s.btnDanger : kind === "light" ? s.btnLight
    : { backgroundColor: a === colors.primary ? colors.primaryLight : a + "1A" };
  return (
    <PressableScale
      onPress={disabled || busy ? undefined : onPress}
      style={[s.btn, bg, (disabled || busy) && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy) }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <MaterialIcons name={icon} size={18} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </PressableScale>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={s.empty}>
      <MaterialIcons name={icon} size={36} color={colors.textMuted} />
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action}
    </View>
  );
}

/** The big coloured banner at the top of each console's home. */
export function Hero({ eyebrow, value, body, accent, children }: {
  eyebrow: string; value?: string; body?: string; accent?: string; children?: ReactNode;
}) {
  const ctx = useContext(AccentContext);
  accent ??= ctx;
  return (
    <Animated.View entering={enter(0)} style={[s.hero, { backgroundColor: accent }]}>
      <Text style={s.heroEyebrow}>{eyebrow}</Text>
      <View style={s.heroRow}>
        {value ? <Text style={s.heroValue}>{value}</Text> : null}
        {body ? <Text style={[s.heroBody, { flex: 1 }]}>{body}</Text> : null}
      </View>
      {children}
    </Animated.View>
  );
}

/** A labelled 0-100% bar. */
export function PercentBar({ label, value, sub, color = colors.primary }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <View style={s.pctRow}>
      <View style={[shared.row, { justifyContent: "space-between" }]}>
        <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{label}</Text>
        <Text style={shared.muted}>{value}%{sub ? ` · ${sub}` : ""}</Text>
      </View>
      <View style={s.pctTrack}><View style={[s.pctFill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

export function SampleNote() {
  return (
    <View style={s.note}>
      <MaterialIcons name="info-outline" size={16} color={colors.secondaryDark} />
      <Text style={s.noteText}>
        Sample catalogue. iGOT Karmayogi and NSSTA data plug in through the catalogue connector once API access is granted.
      </Text>
    </View>
  );
}

export const shared = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  muted: { ...typography.bodySm, color: colors.textSecondary },
  title: { ...typography.titleMd, color: colors.text },
  body: { ...typography.bodyMd, color: colors.text },
  error: { ...typography.bodyMd, color: colors.error },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl * 2 },
  inner: { width: "100%", maxWidth: 1100, alignSelf: "center", gap: spacing.md },
  card: { backgroundColor: colors.surfaceWhite, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  sectionTitle: { ...typography.headlineSm, color: colors.text },
  stat: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.surfaceWhite, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { ...typography.headlineMd, color: colors.text },
  statLabel: { ...typography.bodySm, color: colors.textSecondary },
  levelTrack: { height: 8, borderRadius: 4, backgroundColor: colors.locked, overflow: "visible", justifyContent: "center" },
  levelFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4 },
  levelMark: { position: "absolute", width: 3, height: 16, marginLeft: -1.5, borderRadius: 2, backgroundColor: colors.text },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  chipText: { ...typography.labelLg, color: colors.textSecondary },
  chipTextActive: { color: "#FFFFFF" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full, alignSelf: "flex-start" },
  badgeText: { ...typography.labelSm, letterSpacing: 0.3 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radii.full },
  btnLight: { backgroundColor: "#FFFFFF" }, // on a coloured hero
  btnDanger: { backgroundColor: colors.errorLight },
  btnText: { ...typography.labelLg },
  empty: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.titleMd, color: colors.text, textAlign: "center" },
  emptyBody: { ...typography.bodyMd, color: colors.textSecondary, textAlign: "center", maxWidth: 420 },
  hero: { borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.sm },
  heroEyebrow: { ...typography.labelSm, color: "rgba(255,255,255,0.8)", letterSpacing: 1.2 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  heroValue: { ...typography.displayLg, fontSize: 52, lineHeight: 58, color: "#FFFFFF" },
  heroBody: { ...typography.bodyLg, color: "rgba(255,255,255,0.92)", minWidth: 200 },
  pctRow: { gap: 6, paddingVertical: 4 },
  pctTrack: { height: 8, borderRadius: 4, backgroundColor: colors.locked, overflow: "hidden" },
  pctFill: { height: 8, borderRadius: 4 },
  note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.secondaryLight, borderRadius: radii.lg, padding: spacing.sm },
  noteText: { ...typography.bodySm, color: colors.secondaryDark, flex: 1 },
});
