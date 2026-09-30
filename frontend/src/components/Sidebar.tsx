import { createContext, useCallback, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeInLeft, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useAuth } from "../lib/auth";
import { colors, radii, spacing, typography } from "../lib/theme";
import { feedback, isSoundOn, setSoundOn } from "../lib/feedback";
import { AccentContext, SPACES, allowedPath, consoleFor, setLearning, useSpace, type Space } from "../lib/workspace";

const PANEL = 280;
const CLOSE_MS = 200;
const DOCKED_MIN = 1024; // wide web screens keep the menu open beside the page

type IconName = ComponentProps<typeof MaterialIcons>["name"];
type Item = { href: string; label: string; icon: IconName; section?: string };

const MENUS: Record<Space, Item[]> = {
  learn: [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/competencies", label: "My Competencies", icon: "insights" },
    { href: "/courses", label: "Learning Path", icon: "school" },
    { href: "/assessments", label: "Assessments", icon: "quiz" },
    { href: "/chat", label: "AI Assistant", icon: "smart-toy" },
    { href: "/pomodoro", label: "Focus Timer", icon: "timer", section: "More" },
  ],
  trainer: [
    { href: "/", label: "Overview", icon: "space-dashboard" },
    { href: "/studio", label: "Question Studio", icon: "auto-awesome", section: "Content" },
    { href: "/question-bank", label: "Question Bank", icon: "inventory-2" },
  ],
  admin: [
    { href: "/", label: "Overview", icon: "space-dashboard" },
    { href: "/admin", label: "Workforce Gaps", icon: "insights", section: "Analytics" },
    { href: "/admin-training", label: "Training Effectiveness", icon: "trending-up" },
    { href: "/admin-catalogue", label: "Course Catalogue", icon: "library-books", section: "Manage" },
    { href: "/framework", label: "Competency Framework", icon: "account-tree" },
    { href: "/admin-users", label: "Users & Roles", icon: "manage-accounts" },
  ],
};

const SidebarContext = createContext<{ open: () => void; docked: boolean }>({ open: () => {}, docked: false });

function Nav({ onGo, onLogout }: { onGo: (href: string) => void; onLogout: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const space = useSpace(user?.role);
  const home = consoleFor(user?.role);
  const theme = SPACES[space];
  const [sound, setSound] = useState(isSoundOn());

  return (
    <>
      <View style={styles.brand}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandText}>Anvesh</Text>
          <Text style={[styles.spaceLabel, { color: theme.accent }]}>{theme.label.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView style={styles.items} contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
        {MENUS[space].map((item, i) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
          return (
            <Animated.View key={item.href} entering={FadeInLeft.delay(60 + Math.min(i, 8) * 30).springify().damping(18)}>
              {item.section && <Text style={styles.section}>{item.section}</Text>}
              <TouchableOpacity
                style={[styles.item, active && { backgroundColor: theme.tint }]}
                onPress={() => onGo(item.href)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <MaterialIcons name={item.icon} size={22} color={active ? theme.accent : colors.textSecondary} />
                <Text style={[styles.itemText, active && { color: theme.accent }]}>{item.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>

      {home !== "learn" && (
        <TouchableOpacity
          style={[styles.switch, { borderColor: (space === "learn" ? SPACES[home] : SPACES.learn).accent + "40" }]}
          onPress={() => { setLearning(space !== "learn"); onGo("/"); }}
          accessibilityRole="button"
        >
          <MaterialIcons name="swap-horiz" size={20} color={(space === "learn" ? SPACES[home] : SPACES.learn).accent} />
          <Text style={[styles.switchText, { color: (space === "learn" ? SPACES[home] : SPACES.learn).accent }]}>
            {space === "learn" ? `Back to ${SPACES[home].label}` : "Switch to my learning"}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.soundRow}>
        <MaterialIcons name={sound ? "volume-up" : "volume-off"} size={22} color={colors.textSecondary} />
        <Text style={[styles.itemText, { flex: 1 }]}>Sounds</Text>
        <Switch
          value={sound}
          onValueChange={(on) => { setSound(on); setSoundOn(on); }}
          trackColor={{ true: theme.accent, false: colors.borderMuted }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Sound effects"
        />
      </View>

      <View style={styles.footer}>
        <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
          <Text style={[styles.avatarText, { color: theme.accent }]}>{(user?.name || "S").charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>{user?.name || "Official"}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={onLogout} accessibilityLabel="Log out" hitSlop={8}>
          <MaterialIcons name="logout" size={22} color={colors.error} />
        </TouchableOpacity>
      </View>
    </>
  );
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const docked = !!user && width >= DOCKED_MIN;
  const p = useSharedValue(0);

  const space = useSpace(user?.role);
  const allowed = allowedPath(pathname, user?.role);
  // Console pages are off-limits to other roles (and to signed-out visitors); send them home instead of showing an error.
  useEffect(() => {
    if (!loading && !allowed) router.replace(user ? "/" : "/(auth)/login");
  }, [allowed, loading, user]);

  const open = useCallback(() => { setVisible(true); feedback.tap(); }, []);
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

  const navigate = (href: string) => { if (href !== pathname) router.navigate(href as Href); };
  const go = (href: string) => {
    feedback.tap();
    if (docked) return navigate(href);
    close(() => navigate(href));
  };
  const signOut = async () => {
    setLearning(false);
    await logout();
    router.replace("/(auth)/login");
  };

  // Don't even mount a page the role can't use (the redirect above takes them home).
  const page = <AccentContext.Provider value={SPACES[space].accent}>{allowed ? children : null}</AccentContext.Provider>;
  return (
    <SidebarContext.Provider value={{ open, docked }}>
      {docked ? (
        <View style={styles.dockedRow}>
          <SafeAreaView style={styles.dockedPanel} edges={["top", "bottom", "left"]}>
            <Nav onGo={go} onLogout={signOut} />
          </SafeAreaView>
          <View style={{ flex: 1 }}>{page}</View>
        </View>
      ) : page}
      {!docked && (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
          <View style={styles.overlay}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
              <Pressable style={{ flex: 1 }} onPress={() => close()} accessibilityLabel="Close menu" />
            </Animated.View>
            <Animated.View style={[styles.panelWrap, panelStyle]}>
              <SafeAreaView style={styles.panel} edges={["top", "bottom", "left"]}>
                <Nav onGo={go} onLogout={() => close(signOut)} />
              </SafeAreaView>
            </Animated.View>
          </View>
        </Modal>
      )}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { open, docked } = useSidebar();
  return (
    <View style={[styles.header, docked && styles.headerDocked]}>
      {!docked && (
        <TouchableOpacity onPress={open} style={styles.menuBtn} accessibilityLabel="Open menu" hitSlop={8}>
          <MaterialIcons name="menu" size={26} color={colors.text} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, docked && styles.headerTitleDocked]} numberOfLines={1}>{title}</Text>
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
  dockedRow: { flex: 1, flexDirection: "row", backgroundColor: colors.surface },
  dockedPanel: { width: 272, backgroundColor: colors.surfaceWhite, paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  soundRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  logo: { width: 38, height: 38, borderRadius: radii.lg, backgroundColor: colors.primary },
  brandText: { ...typography.headlineSm, lineHeight: 22, color: colors.text },
  spaceLabel: { ...typography.labelSm, letterSpacing: 1 },
  items: { flex: 1 },
  section: { ...typography.labelMd, color: colors.textMuted, textTransform: "uppercase", marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: spacing.md },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 11, borderRadius: radii.lg },
  itemText: { ...typography.titleMd, fontSize: 14, color: colors.text },
  switch: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radii.lg, borderWidth: 1, borderStyle: "dashed", marginBottom: spacing.sm,
  },
  switchText: { ...typography.labelLg },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  avatarText: { ...typography.titleMd },
  userName: { ...typography.titleMd, color: colors.text },
  userEmail: { ...typography.bodySm, color: colors.textSecondary },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  headerDocked: { paddingTop: spacing.lg, width: "100%", maxWidth: 1100 + spacing.md * 2, alignSelf: "center" }, // lines up with Page's content column
  menuBtn: { padding: 4 },
  headerTitle: { ...typography.headlineMd, color: colors.text },
  headerTitleDocked: { ...typography.headlineLg },
  headerSubtitle: { ...typography.bodySm, color: colors.textSecondary },
});
