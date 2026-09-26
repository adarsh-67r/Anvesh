import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { Link, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type GraphNode = {
  id: string;
  label: string;
  depth: number;
  subject: string;
  grade: string;
  prerequisites: string[];
  mastery_score: number;
  is_mastered: boolean;
  status: "mastered" | "available" | "locked";
};

const STATUS_CONFIG = {
  mastered: { bg: colors.tertiaryLight, border: "#A7F3D0", icon: "check-circle" as const, iconColor: colors.tertiary },
  available: { bg: colors.surfaceWhite, border: colors.secondary, icon: "bolt" as const, iconColor: colors.secondary },
  locked: { bg: colors.locked, border: colors.borderMuted, icon: "lock" as const, iconColor: colors.textMuted },
};

export default function LearnScreen() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "mastered" | "available" | "locked">("all");

  const load = useCallback(async () => {
    try {
      const data = await api.get<GraphNode[]>("/api/recommend/graph");
      setNodes(data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === "all" ? nodes : nodes.filter((n) => n.status === filter);
  const counts = {
    mastered: nodes.filter((n) => n.status === "mastered").length,
    available: nodes.filter((n) => n.status === "available").length,
    locked: nodes.filter((n) => n.status === "locked").length,
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Skill Graph</Text>
        <Text style={styles.subtitle}>Prerequisites & Roadmap</Text>
      </View>

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
        {(["all", "mastered", "available", "locked"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && styles.pillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, filter === f && styles.pillTextActive]}>
              {f === "all" ? `All (${nodes.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f]})`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {filtered.map((node) => {
          const cfg = STATUS_CONFIG[node.status];
          const card = (
            <View
              key={node.id}
              style={[styles.nodeCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
            >
              <View style={styles.nodeHeader}>
                <MaterialIcons name={cfg.icon} size={22} color={cfg.iconColor} />
                <Text style={[styles.nodeLabel, node.status === "locked" && styles.lockedText]} numberOfLines={1}>
                  {node.label}
                </Text>
                <Text style={styles.nodeMastery}>
                  {Math.round(node.mastery_score * 100)}%
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.round(node.mastery_score * 100)}%`,
                      backgroundColor: node.status === "mastered" ? colors.tertiary : colors.secondary,
                    },
                  ]}
                />
              </View>
              {node.subject ? (
                <Text style={styles.nodeMeta}>{node.subject} • {node.grade}</Text>
              ) : null}
            </View>
          );

          if (node.status === "locked") return card;
          return (
            <Link href={`/skill/${node.id}`} key={node.id} asChild>
              <TouchableOpacity activeOpacity={0.7}>{card}</TouchableOpacity>
            </Link>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleRow: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { ...typography.headlineLg, color: colors.text },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary },
  filterRow: { marginTop: spacing.md, marginBottom: spacing.sm, maxHeight: 40 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.labelMd, color: colors.textSecondary },
  pillTextActive: { color: "#FFFFFF" },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  nodeCard: {
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  nodeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  nodeLabel: { ...typography.titleMd, color: colors.text, flex: 1 },
  lockedText: { color: colors.textMuted },
  nodeMastery: { ...typography.labelLg, color: colors.textSecondary },
  progressBarBg: { height: 8, backgroundColor: colors.border, borderRadius: radii.full },
  progressBarFill: { height: 8, borderRadius: radii.full },
  nodeMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs },
});
