import { createContext, useCallback, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useAuth } from "../lib/auth";
import { colors, radii, spacing, typography } from "../lib/theme";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/learn", label: "My Path", icon: "account-tree" },
  { href: "/cards", label: "Review", icon: "style" },
  { href: "/chat", label: "AI Tutor", icon: "smart-toy" },
  { href: "/pomodoro", label: "Focus Timer", icon: "timer" },
  { href: "/todos", label: "Tasks", icon: "checklist" },
  { href: "/profile", label: "Study Groups", icon: "groups" },
  { href: "/add-content", label: "Add Topic", icon: "playlist-add" },
];

const SidebarContext = createContext<{ open: () => void }>({ open: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const open = useCallback(() => setVisible(true), []);

  const go = (href: string) => {
    setVisible(false);
    if (href !== pathname) router.navigate(href as Href);
  };

  return (
    <SidebarContext.Provider value={{ open }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <SafeAreaView style={styles.panel} edges={["top", "bottom", "left"]}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <MaterialIcons name="explore" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.brandText}>Anvesh</Text>
            </View>

            <View style={styles.items}>
              {ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <TouchableOpacity
                    key={item.href}
                    style={[styles.item, active && styles.itemActive]}
                    onPress={() => go(item.href)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <MaterialIcons name={item.icon} size={22} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.footer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.name || "S").charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>{user?.name || "Student"}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  setVisible(false);
                  await logout();
                  router.replace("/(auth)/login");
                }}
                accessibilityLabel="Log out"
                hitSlop={8}
              >
                <MaterialIcons name="logout" size={22} color={colors.error} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <Pressable style={{ flex: 1 }} onPress={() => setVisible(false)} accessibilityLabel="Close menu" />
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
  overlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  panel: { width: 280, maxWidth: "82%", backgroundColor: colors.surfaceWhite, paddingHorizontal: spacing.md },
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
  items: { flex: 1, gap: 2 },
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
