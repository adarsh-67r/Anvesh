import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { ScreenHeader } from "../../components/Sidebar";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Status = "mastered" | "available" | "locked";
type GraphNode = {
  id: string;
  label: string;
  prerequisites: string[];
  mastery_score: number;
  status: Status;
  video_count: number;
};

const STATUS = {
  mastered: { label: "Mastered", icon: "check-circle" as const, fg: colors.tertiaryDark, bg: colors.tertiaryLight, border: colors.tertiary },
  available: { label: "Ready", icon: "play-circle" as const, fg: colors.primary, bg: colors.surfaceWhite, border: colors.primary },
  locked: { label: "Locked", icon: "lock" as const, fg: colors.textMuted, bg: colors.locked, border: colors.border },
};

/** Level = length of the longest prerequisite chain below a skill (foundations are level 0). */
function levelsOf(nodes: GraphNode[]): GraphNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const level = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0; // cycles are rejected server-side; guard anyway
    seen.add(id);
    const prereqs = byId.get(id)?.prerequisites.filter((p) => byId.has(p)) ?? [];
    const l = prereqs.length ? 1 + Math.max(...prereqs.map((p) => level(p, seen))) : 0;
    memo.set(id, l);
    return l;
  };
  const tiers: GraphNode[][] = [];
  for (const n of nodes) (tiers[level(n.id, new Set())] ??= []).push(n);
  return tiers.filter(Boolean);
}

export default function PathScreen() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setNodes(await api.get<GraphNode[]>("/api/recommend/graph").catch(() => []));
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tiers = useMemo(() => levelsOf(nodes), [nodes]);
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const count = (s: Status) => nodes.filter((n) => n.status === s).length;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScreenHeader
        title="My Path"
        subtitle={`${count("mastered")} of ${nodes.length} skills mastered`}
        right={
          <TouchableOpacity onPress={() => router.push("/add-content")} accessibilityLabel="Add a topic" hitSlop={8}>
            <MaterialIcons name="playlist-add" size={28} color={colors.primary} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            colors={[colors.primary]}
          />
        }
      >
        {nodes.length > 0 && (
          <View style={styles.legend}>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <View key={s} style={styles.legendItem}>
                <MaterialIcons name={STATUS[s].icon} size={16} color={STATUS[s].border} />
                <Text style={styles.legendText}>{STATUS[s].label} · {count(s)}</Text>
              </View>
            ))}
          </View>
        )}

        {!loaded && (
          <View style={{ gap: spacing.sm }} accessibilityLabel="Loading">
            <Skeleton height={14} width="30%" />
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={78} radius={radii.xl} />)}
          </View>
        )}

        {loaded && nodes.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="account-tree" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Your path is empty</Text>
            <Text style={styles.emptyText}>Add a YouTube playlist as a topic, then link topics with prerequisites to build your map.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/add-content")}>
              <Text style={styles.emptyBtnText}>Add topic</Text>
            </TouchableOpacity>
          </View>
        )}

        {tiers.map((tier, i) => (
          <View key={i}>
            {/* tiers cascade in, top to bottom */}
            {i > 0 && (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />
                <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.borderMuted} />
              </View>
            )}
            <Text style={styles.levelLabel}>{i === 0 ? "FOUNDATIONS" : `LEVEL ${i}`}</Text>
            {tier.map((n, j) => {
              const st = STATUS[n.status];
              const missing = n.prerequisites.filter((p) => nodes.find((x) => x.id === p)?.status !== "mastered");
              return (
                <Animated.View key={n.id} entering={enter(tiers.slice(0, i).reduce((a, t) => a + t.length, 0) + j)}>
                <PressableScale
                  scaleTo={0.98}
                  style={[styles.node, { backgroundColor: st.bg, borderColor: st.border }]}
                  onPress={() => router.push(`/skill/${n.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.label}, ${st.label}, ${Math.round(n.mastery_score * 100)} percent`}
                >
                  <MaterialIcons name={st.icon} size={24} color={st.border} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.nodeTitle, n.status === "locked" && { color: colors.textSecondary }]} numberOfLines={2}>
                      {n.label}
                    </Text>
                    {n.status === "locked" && missing.length > 0 ? (
                      <Text style={styles.nodeMeta} numberOfLines={2}>Needs: {missing.map(labelOf).join(", ")}</Text>
                    ) : (
                      <View style={styles.nodeBarRow}>
                        <ProgressBar value={n.mastery_score} color={st.border} track="rgba(148,163,184,0.25)" delay={300} style={{ flex: 1 }} />
                        <Text style={styles.nodeMeta}>{Math.round(n.mastery_score * 100)}% mastery</Text>
                      </View>
                    )}
                    {n.video_count > 0 && <Text style={styles.nodeLessons}>{n.video_count} lessons</Text>}
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
                </PressableScale>
                </Animated.View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { ...typography.labelMd, color: colors.textSecondary },
  levelLabel: { ...typography.labelSm, color: colors.textSecondary, letterSpacing: 1.2, marginBottom: spacing.sm },
  connector: { alignItems: "center", marginVertical: spacing.xs },
  connectorLine: { width: 2, height: 16, backgroundColor: colors.borderMuted },
  node: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  nodeTitle: { ...typography.titleMd, color: colors.text },
  nodeBarRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  nodeMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  nodeLessons: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: 80, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.headlineSm, color: colors.text },
  emptyText: { ...typography.bodyMd, color: colors.textSecondary, textAlign: "center" },
  emptyBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radii.full },
  emptyBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
