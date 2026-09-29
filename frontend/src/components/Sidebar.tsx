import { createContext, useCallback, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Animated, { Easing, FadeInLeft, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useAuth } from "../lib/auth";
import { colors, radii, spacing, typography } from "../lib/theme";
import { feedback, isSoundOn, setSoundOn } from "../lib/feedback";

const PANEL = 280;
const CLOSE_MS = 200;

type IconName = ComponentProps<typeof MaterialIcons>["name"];

type Item = { href: string; label: string; icon: IconName };

const LEARN: Item[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/competencies", label: "My Competencies", icon: "insights" },
  { href: "/courses", label: "Learning Path", icon: "school" },
  { href: "/assessments", label: "Assessments", icon: "quiz" },
  { href: "/chat", label: "AI Assistant", icon: "smart-toy" },
];
const TRAINER: Item[] = [{ href: "/studio", label: "Question Studio", icon: "auto-awesome" }];
const ADMIN: Item[] = [
  { href: "/admin", label: "Organisation", icon: "domain" },
  { href: "/admin-users", label: "Users & Roles", icon: "manage-accounts" },
];
const EXTRAS: Item[] = [
  { href: "/trails", label: "Video Courses", icon: "route" },
  { href: "/today", label: "Study Today", icon: "today" },
  { href: "/cards", label: "Review", icon: "style" },
  { href: "/pomodoro", label: "Focus Timer", icon: "timer" },
  { href: "/todos", label: "Tasks", icon: "checklist" },
  { href: "/profile", label: "Study Groups", icon: "groups" },
];

function itemsFor(role: string | undefined): Item[] {
  return [
    ...LEARN,
    ...(role === "trainer" || role === "admin" ? TRAINER : []),
    ...(role === "admin" ? ADMIN : []),
    ...EXTRAS,
  ];
}

const SidebarContext = createContext<{ open: () => void }>({ open: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [sound, setSound] = useState(isSoundOn());
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const p = useSharedValue(0);

  const open = useCallback(() => { setSound(isSoundOn()); setVisible(true); feedback.tap(); }, []);
  useEffect(() => {
    if (visible) p.set(withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [visible, p]);
  // Slide out first, then unmount the modal.
  const close = (after?: () => void) => {
    p.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }));
    setTimeout(() => { setVisible(false); after?.(); }, CLOSE_MS);
  };

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value - 1) * PANEL }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: p.value }));

  const go = (href: string) => {
    feedback.tap();
    close();
    if (href !== pathname) router.navigate(href as Href);
  };

  return (
    <SidebarContext.Provider value={{ open }}>
      {children}
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
        <View style={styles.overlay}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={() => close()} accessibilityLabel="Close menu" />
          </Animated.View>
          <Animated.View style={[styles.panelWrap, panelStyle]}>
          <SafeAreaView style={styles.panel} edges={["top", "bottom", "left"]}>
            <View style={styles.brand}>
              <Image source={require("../../assets/icon.png")} style={styles.logo} />
              <Text style={styles.brandText}>Anvesh</Text>
            </View>

            <ScrollView style={styles.items} contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
              {itemsFor(user?.role).map((item, i) => {
                const active = pathname === item.href;
                return (
                  <Animated.View key={item.href} entering={FadeInLeft.delay(80 + Math.min(i, 8) * 35).springify().damping(18)}>
                  {item === EXTRAS[0] && <Text style={styles.section}>More</Text>}
                  <TouchableOpacity
                    style={[styles.item, active && styles.itemActive]}
                    onPress={() => go(item.href)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <MaterialIcons name={item.icon} size={22} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </ScrollView>

            <View style={styles.soundRow}>
              <MaterialIcons name={sound ? "volume-up" : "volume-off"} size={22} color={colors.textSecondary} />
              <Text style={[styles.itemText, { flex: 1 }]}>Sounds</Text>
              <Switch
                value={sound}
                onValueChange={(on) => { setSound(on); setSoundOn(on); }}
                trackColor={{ true: colors.primary, false: colors.borderMuted }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Sound effects"
              />
            </View>

            <View style={styles.footer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.name || "S").charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>{user?.name || "Official"}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
              </View>
              <TouchableOpacity
                onPress={() => close(async () => {
                  await logout();
                  router.replace("/(auth)/login");
                })}
                accessibilityLabel="Log out"
                hitSlop={8}
              >
                <MaterialIcons name="logout" size={22} color={colors.error} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { open } = useSidebar();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={open} style={styles.menuBtn} accessibilityLabel="Open menu" hitSlop={8}>
        <MaterialIcons name="menu" size={26} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  dim: { backgroundColor: "rgba(15, 23, 42, 0.45)" },
  panelWrap: { position: "absolute", left: 0, top: 0, bottom: 0, width: PANEL, maxWidth: "82%" },
  panel: { flex: 1, backgroundColor: colors.surfaceWhite, paddingHorizontal: spacing.md, borderTopRightRadius: radii.xxl, borderBottomRightRadius: radii.xxl },
  soundRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { ...typography.headlineMd, color: colors.primary },
  items: { flex: 1 },
  section: { ...typography.labelMd, color: colors.textMuted, textTransform: "uppercase", marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: spacing.md },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.lg,
  },
  itemActive: { backgroundColor: colors.primaryLight },
  itemText: { ...typography.titleMd, color: colors.text },
  itemTextActive: { color: colors.primary },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.titleMd, color: colors.primary },
  userName: { ...typography.titleMd, color: colors.text },
  userEmail: { ...typography.bodySm, color: colors.textSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  menuBtn: { padding: 4 },
  headerTitle: { ...typography.headlineMd, color: colors.text },
  headerSubtitle: { ...typography.bodySm, color: colors.textSecondary },
});
