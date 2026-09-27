import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { TrailSummary } from "../../lib/trails";
import { ScreenHeader } from "../../components/Sidebar";
import { PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

export default function TrailsScreen() {
  const [trails, setTrails] = useState<TrailSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setTrails(await api.get<TrailSummary[]>("/api/trails").catch(() => []));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Trails"
        subtitle="Your learning paths from YouTube"
        right={
          <TouchableOpacity onPress={() => router.push("/trail/new")} accessibilityLabel="New trail" hitSlop={8}>
            <MaterialIcons name="add" size={28} color={colors.primary} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {trails === null && [0, 1].map((i) => <Skeleton key={i} height={132} radius={radii.xl} style={{ marginBottom: spacing.md }} />)}

        {trails?.length === 0 && (
          <Animated.View entering={enter(0)} style={styles.empty}>
            <MaterialIcons name="route" size={52} color={colors.primary} />
            <Text style={styles.emptyTitle}>Start your first trail</Text>
            <Text style={styles.emptyText}>Paste a YouTube playlist. Anvesh splits it into topics, quizzes you on what the lectures teach, and picks what to study next.</Text>
            <PressableScale style={styles.primaryBtn} onPress={() => router.push("/trail/new")}>
              <Text style={styles.primaryBtnText}>New trail</Text>
            </PressableScale>
          </Animated.View>
        )}

        {trails?.map((t, i) => (
          <Animated.View key={t.id} entering={enter(i)}>
            <PressableScale style={styles.card} onPress={() => router.push(`/trail/${t.id}`)} scaleTo={0.98}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}><MaterialIcons name="route" size={22} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.cardMeta}>
                    {t.source_count} {t.source_count === 1 ? "source" : "sources"} · {t.topic_count} topics
                    {t.importing ? " · importing…" : ""}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
              </View>
              <ProgressBar value={t.topic_count ? t.mastered_count / t.topic_count : 0} color={colors.tertiary} delay={200 + i * 80} style={{ marginTop: spacing.md }} />
              <Text style={styles.cardMeta}>{t.mastered_count} of {t.topic_count} topics done</Text>
              {t.next_topic && <Text style={styles.next} numberOfLines={1}>Next: {t.next_topic.label}</Text>}
            </PressableScale>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIcon: { width: 40, height: 40, borderRadius: radii.lg, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...typography.headlineSm, color: colors.text },
  cardMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 4 },
  next: { ...typography.labelLg, color: colors.primary, marginTop: spacing.sm },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: 80, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.headlineSm, color: colors.text },
  emptyText: { ...typography.bodyMd, color: colors.textSecondary, textAlign: "center" },
  primaryBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radii.full },
  primaryBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
