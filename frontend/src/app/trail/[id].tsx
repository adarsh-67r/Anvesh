import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import { TopicStatus, TrailDetail, errorDetail, levelsOf } from "../../lib/trails";
import { PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

const STATUS: Record<TopicStatus, { label: string; icon: "check-circle" | "done-all" | "play-circle" | "lock"; fg: string; bg: string; border: string }> = {
  mastered: { label: "Mastered", icon: "check-circle", fg: colors.tertiaryDark, bg: colors.tertiaryLight, border: colors.tertiary },
  covered: { label: "Covered", icon: "done-all", fg: colors.tertiaryDark, bg: colors.surfaceWhite, border: colors.tertiary },
  available: { label: "Ready", icon: "play-circle", fg: colors.primary, bg: colors.surfaceWhite, border: colors.primary },
  locked: { label: "Locked", icon: "lock", fg: colors.textMuted, bg: colors.locked, border: colors.border },
};

export default function TrailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trail, setTrail] = useState<TrailDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    try { setTrail(await api.get<TrailDetail>(`/api/trails/${id}`)); } catch { router.back(); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const importing = trail?.sources.some((s) => s.status === "importing") ?? false;
  useEffect(() => {
    if (!importing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [importing, load]);

  const tiers = useMemo(() => levelsOf(trail?.topics ?? []), [trail]);
  const labelOf = (tid: string) => trail?.topics.find((n) => n.id === tid)?.label ?? tid;
  const done = trail?.topics.filter((n) => n.status === "mastered" || n.status === "covered").length ?? 0;

  const addSource = async () => {
    if (!url.trim()) return;
    try {
      await api.post(`/api/trails/${id}/sources`, { url: url.trim() });
      setUrl("");
      setAdding(false);
      load();
    } catch (e) {
      Alert.alert("Could not add", errorDetail(e, "Check the link and try again."));
    }
  };

  const sourceAction = async (sid: string, action: "retry" | "rebuild") => {
    await api.post(`/api/trails/${id}/sources/${sid}/${action}`, {}).catch(() => {});
    load();
  };

  const remove = () =>
    Alert.alert("Delete trail?", "Your progress on its topics is kept if you add the same playlists again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/api/trails/${id}`).catch(() => {}); router.back(); } },
    ]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle} numberOfLines={1}>{trail?.title ?? "Trail"}</Text>
          {trail && <Text style={styles.topMeta}>{done} of {trail.topics.length} topics done</Text>}
        </View>
        <TouchableOpacity onPress={remove} accessibilityLabel="Delete trail" hitSlop={8}>
          <MaterialIcons name="delete-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {!trail && [0, 1, 2].map((i) => <Skeleton key={i} height={78} radius={radii.xl} style={{ marginBottom: spacing.sm }} />)}

        {trail && trail.topics.length > 0 && <ProgressBar value={done / trail.topics.length} color={colors.tertiary} height={8} style={{ marginBottom: spacing.md }} />}

        {tiers.map((tier, i) => (
          <View key={i}>
            {i > 0 && (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />
                <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.borderMuted} />
              </View>
            )}
            <Text style={styles.levelLabel}>{i === 0 ? "FOUNDATIONS" : `LEVEL ${i}`}</Text>
            {tier.map((n, j) => {
              const st = STATUS[n.status];
              const missing = n.prerequisites.filter((p) => !["mastered", "covered"].includes(trail!.topics.find((x) => x.id === p)?.status ?? ""));
              return (
                <Animated.View key={n.id} entering={enter(tiers.slice(0, i).reduce((a, t) => a + t.length, 0) + j)}>
                  <PressableScale
                    scaleTo={0.98}
                    style={[styles.node, { backgroundColor: st.bg, borderColor: st.border }]}
                    onPress={() => router.push(`/skill/${n.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n.label}, ${st.label}, ${Math.round(n.mastery_score * 100)} percent mastery`}
                  >
                    <MaterialIcons name={st.icon} size={24} color={st.border} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nodeTitle, n.status === "locked" && { color: colors.textSecondary }]} numberOfLines={2}>{n.label}</Text>
                      {n.status === "locked" && missing.length > 0 ? (
                        <Text style={styles.nodeMeta} numberOfLines={2}>Needs: {missing.map(labelOf).join(", ")}</Text>
                      ) : (
                        <View style={styles.nodeBarRow}>
                          <ProgressBar value={n.mastery_score} color={st.border} track="rgba(148,163,184,0.25)" delay={300} style={{ flex: 1 }} />
                          <Text style={styles.nodeMeta}>{Math.round(n.mastery_score * 100)}% mastery</Text>
                        </View>
                      )}
                      <Text style={styles.nodeLessons}>
                        {n.video_count} lessons
                        {n.equivalents.length ? ` · also in ${n.equivalents[0].source_title ?? n.equivalents[0].label}` : ""}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>
        ))}

        {trail && (
          <View style={styles.sources}>
            <View style={styles.sourcesHead}>
              <Text style={styles.sectionTitle}>Sources</Text>
              {!adding && (
                <TouchableOpacity onPress={() => setAdding(true)} accessibilityLabel="Add source" hitSlop={8}>
                  <MaterialIcons name="add" size={26} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            {trail.sources.map((s) => (
              <View key={s.id} style={styles.source}>
                <MaterialIcons name={s.kind === "playlist" ? "playlist-play" : "smart-display"} size={22} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceTitle} numberOfLines={2}>{s.title || s.url}</Text>
                  <Text style={[styles.nodeMeta, s.status === "failed" && { color: colors.error }]}>
                    {s.status === "importing" ? "Building topics…" : s.status === "failed" ? s.error || "Import failed" : `${s.topic_count} topics`}
                  </Text>
                </View>
                {s.status === "failed" && <TouchableOpacity onPress={() => sourceAction(s.id, "retry")}><Text style={styles.link}>Retry</Text></TouchableOpacity>}
                {s.status === "ready" && <TouchableOpacity onPress={() => sourceAction(s.id, "rebuild")} accessibilityLabel="Rebuild topics"><MaterialIcons name="refresh" size={22} color={colors.primary} /></TouchableOpacity>}
              </View>
            ))}
            {adding && (
              <View style={{ gap: spacing.sm }}>
                <TextInput style={styles.input} placeholder="YouTube playlist or video link" placeholderTextColor={colors.textMuted} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <PressableScale style={[styles.smallBtn, { backgroundColor: colors.locked }]} onPress={() => setAdding(false)}><Text style={[styles.smallBtnText, { color: colors.textSecondary }]}>Cancel</Text></PressableScale>
                  <PressableScale style={styles.smallBtn} onPress={addSource}><Text style={styles.smallBtnText}>Add</Text></PressableScale>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topTitle: { ...typography.headlineMd, color: colors.text },
  topMeta: { ...typography.bodySm, color: colors.textSecondary },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  levelLabel: { ...typography.labelSm, color: colors.textSecondary, letterSpacing: 1.2, marginBottom: spacing.sm },
  connector: { alignItems: "center", marginVertical: spacing.xs },
  connectorLine: { width: 2, height: 16, backgroundColor: colors.borderMuted },
  node: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1.5, borderRadius: radii.xl, padding: spacing.md, marginBottom: spacing.sm },
  nodeTitle: { ...typography.titleMd, color: colors.text },
  nodeBarRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  nodeMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  nodeLessons: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  sources: { marginTop: spacing.lg, gap: spacing.sm },
  sourcesHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { ...typography.headlineSm, color: colors.text },
  source: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  sourceTitle: { ...typography.bodyMd, color: colors.text },
  link: { ...typography.labelLg, color: colors.primary },
  input: { height: 44, borderWidth: 1.5, borderColor: colors.borderMuted, borderRadius: radii.lg, paddingHorizontal: spacing.md, ...typography.bodyMd, color: colors.text, backgroundColor: colors.surfaceWhite },
  smallBtn: { flex: 1, height: 44, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  smallBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
