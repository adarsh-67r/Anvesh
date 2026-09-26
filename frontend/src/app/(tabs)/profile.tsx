import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Group = { id: string; name: string; invite_code: string; member_count?: number };
type SharedDeck = { id: string; shared_by: string; cards: { front: string; back: string }[] };

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [decks, setDecks] = useState<SharedDeck[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadDecks = async (groupId: string) => {
    if (expandedGroup === groupId) { setExpandedGroup(null); return; }
    setExpandedGroup(groupId);
    try { setDecks(await api.get<SharedDeck[]>(`/api/groups/${groupId}/decks`)); } catch { setDecks([]); }
  };

  const load = useCallback(async () => {
    try {
      setGroups(await api.get<Group[]>("/api/groups"));
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const joinGroup = async () => {
    if (!inviteCode.trim()) return;
    try {
      await api.post("/api/groups/join", { invite_code: inviteCode.trim() });
      setInviteCode("");
      setShowJoin(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.post("/api/groups", { name: newGroupName.trim() });
      setNewGroupName("");
      setShowCreate(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === "web") {
      if (!confirm("Log out?")) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert("Log Out", "Are you sure?", [
          { text: "Cancel", style: "cancel", onPress: () => resolve() },
          { text: "Log Out", style: "destructive", onPress: async () => { await logout(); router.replace("/(auth)/login"); resolve(); } },
        ]);
      });
    }
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {/* Profile Header */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.userName}>{user?.name || "Student"}</Text>
          <Text style={styles.userEmail}>{user?.email || ""}</Text>
        </View>

        {/* Study Groups */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Study Groups ({groups.length})</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity onPress={() => setShowJoin(!showJoin)}>
              <MaterialIcons name="group-add" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreate(!showCreate)}>
              <MaterialIcons name="add-circle" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {showJoin && (
          <View style={styles.inlineForm}>
            <TextInput
              style={styles.inlineInput}
              placeholder="Enter invite code"
              placeholderTextColor={colors.textMuted}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.inlineBtn} onPress={joinGroup}>
              <Text style={styles.inlineBtnText}>Join</Text>
            </TouchableOpacity>
          </View>
        )}

        {showCreate && (
          <View style={styles.inlineForm}>
            <TextInput
              style={styles.inlineInput}
              placeholder="Group name"
              placeholderTextColor={colors.textMuted}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <TouchableOpacity style={styles.inlineBtn} onPress={createGroup}>
              <Text style={styles.inlineBtnText}>Create</Text>
            </TouchableOpacity>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.id}>
            <TouchableOpacity style={styles.groupCard} onPress={() => loadDecks(g.id)} activeOpacity={0.7}>
              <View style={styles.groupIcon}>
                <MaterialIcons name="groups" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{g.name}</Text>
                <Text style={styles.groupCode}>
                  {g.member_count ? `${g.member_count} members • ` : ""}Code: {g.invite_code}
                </Text>
              </View>
              <TouchableOpacity style={styles.copyBtn} onPress={() => copyCode(g.invite_code)}>
                <MaterialIcons name={copied === g.invite_code ? "check" : "content-copy"} size={18} color={copied === g.invite_code ? colors.tertiary : colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
            {expandedGroup === g.id && (
              <View style={styles.decksSection}>
                <Text style={styles.decksTitle}>Shared Decks ({decks.length})</Text>
                {decks.length === 0 && <Text style={styles.emptyText}>No shared decks yet</Text>}
                {decks.map((d) => (
                  <View key={d.id} style={styles.deckCard}>
                    <MaterialIcons name="style" size={20} color={colors.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deckName}>{d.cards.length} cards</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {groups.length === 0 && (
          <Text style={styles.emptyText}>No study groups yet. Create one or join with an invite code!</Text>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.locked,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  userName: { ...typography.headlineMd, color: colors.text },
  userEmail: { ...typography.bodyMd, color: colors.textSecondary },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.headlineSm, color: colors.text },
  inlineForm: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  inlineInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.text,
  },
  inlineBtn: {
    height: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    justifyContent: "center",
  },
  inlineBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  groupName: { ...typography.titleMd, color: colors.text },
  groupCode: { ...typography.bodySm, color: colors.textSecondary },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  decksSection: { paddingLeft: spacing.md, marginBottom: spacing.sm },
  decksTitle: { ...typography.labelMd, color: colors.textSecondary, marginBottom: spacing.xs },
  deckCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deckName: { ...typography.bodySm, color: colors.text },
  emptyText: { ...typography.bodyMd, color: colors.textMuted, textAlign: "center", marginVertical: spacing.lg },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.errorLight,
  },
  logoutText: { ...typography.labelLg, color: colors.error },
});
