import { useCallback, useState, type ComponentProps } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { api, StudyStatus } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ScreenHeader } from "../../components/Sidebar";
import { Drift, PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Recommendation = {
  skill_id: string;
  label: string;
  mastery_score: number;
  reason: string;
  prerequisites: string[];
  videos: { id: string; title: string; url: string }[];
};
type GraphNode = { id: string; label: string; status: "mastered" | "available" | "locked" };
type Todo = { id: string; is_done: boolean };
type DropoutRisk = { risk_score: number; risk_level: string };
type IconName = ComponentProps<typeof MaterialIcons>["name"];

const pct = (x: number) => Math.round(x * 100);

function whyThis(r: Recommendation): string {
  if (r.mastery_score > 0) return `You're ${pct(r.mastery_score)}% there. Keep the streak going.`;
  if (r.prerequisites.length) return "You've mastered its prerequisites, so it's ready for you.";
  return "A foundation skill. The best place to start.";
}

export default function TodayScreen() {
  const { user } = useAuth();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [graph, setGraph] = useState<GraphNode[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [dueCards, setDueCards] = useState(0);
  const [study, setStudy] = useState<StudyStatus | null>(null);
  const [dropout, setDropout] = useState<DropoutRisk | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [r, g, t, c, s, d] = await Promise.all([
      api.get<Recommendation[]>("/api/recommend/next?limit=3").catch(() => []),
      api.get<GraphNode[]>("/api/recommend/graph").catch(() => []),
      api.get<Todo[]>("/api/todos").catch(() => []),
      api.get<unknown[]>("/api/flashcards/due").catch(() => []),
      api.get<StudyStatus>("/api/game/status").catch(() => null),
      api.get<DropoutRisk>("/api/recommend/dropout-risk").catch(() => null),
    ]);
    setRecs(r);
    setGraph(g);
    setTodos(t);
    setDueCards(c.length);
    setStudy(s);
    setDropout(d);
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hero = recs[0];
  const upNext = recs.slice(1);
  const mastered = graph.filter((n) => n.status === "mastered").length;
  const openTasks = todos.filter((t) => !t.is_done).length;
  const minutesLeft = study ? Math.max(0, study.required_minutes - study.study_minutes) : null;
  const firstName = (user?.name || "").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
  const atRisk = dropout && !dropout.risk_level.toLowerCase().includes("low");

  const tiles: { icon: IconName; value: string; label: string; href: Href; tint: string; bg: string }[] = [
    { icon: "style", value: String(dueCards), label: dueCards === 1 ? "card to review" : "cards to review", href: "/cards", tint: colors.secondaryDark, bg: colors.secondaryLight },
    {
      icon: study?.unlocked ? "lock-open" : "timer",
      value: study?.unlocked ? "Open" : `${minutesLeft ?? "–"}m`,
      label: study?.unlocked ? "quiz games" : "focus to unlock quiz",
      href: "/pomodoro",
      tint: colors.primary,
      bg: colors.primaryLight,
    },
    { icon: "checklist", value: String(openTasks), label: openTasks === 1 ? "task open" : "tasks open", href: "/todos", tint: colors.tertiaryDark, bg: colors.tertiaryLight },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScreenHeader title={firstName ? `Hi, ${firstName}` : "Today"} subtitle={today} />
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
        {/* Hero: the recommendation engine's pick */}
        {hero ? (
          <Animated.View entering={enter(0)} style={styles.hero}>
            <Drift style={[styles.blob, { width: 180, height: 180, top: -60, right: -50 }]} />
            <Drift style={[styles.blob, { width: 90, height: 90, bottom: -30, right: 70, opacity: 0.08 }]} range={20} duration={6500} />
            <Text style={styles.heroEyebrow}>STUDY NEXT</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{hero.label}</Text>
            <Text style={styles.heroWhy}>{whyThis(hero)}</Text>
            <ProgressBar value={hero.mastery_score} color="#FFFFFF" track="rgba(255,255,255,0.25)" delay={250} style={{ marginTop: spacing.sm }} />
            <View style={styles.heroFooter}>
              <Text style={styles.heroMeta}>
                {pct(hero.mastery_score)}% mastered{hero.videos.length ? ` · ${hero.videos.length} lessons` : ""}
              </Text>
              <PressableScale
                style={styles.heroBtn}
                onPress={() => router.push(`/skill/${hero.skill_id}`)}
                accessibilityRole="button"
              >
                <Text style={styles.heroBtnText}>{hero.mastery_score > 0 ? "Continue" : "Start"}</Text>
                <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
              </PressableScale>
            </View>
          </Animated.View>
        ) : loaded ? (
          <Animated.View entering={enter(0)} style={[styles.hero, styles.heroEmpty]}>
            <Drift style={[styles.blob, { width: 180, height: 180, top: -60, right: -50 }]} />
            <MaterialIcons name={graph.length ? "emoji-events" : "playlist-add"} size={32} color="#FFFFFF" />
            <Text style={styles.heroTitle}>{graph.length ? "Everything available is mastered" : "Add your first topic"}</Text>
            <Text style={styles.heroWhy}>
              {graph.length
                ? "Add a new topic or review your flashcards to stay sharp."
                : "Paste a YouTube playlist and Anvesh builds your learning path."}
            </Text>
            <PressableScale style={styles.heroBtn} onPress={() => router.push("/add-content")}>
              <Text style={styles.heroBtnText}>Add topic</Text>
              <MaterialIcons name="add" size={18} color={colors.primary} />
            </PressableScale>
          </Animated.View>
        ) : (
          <View style={{ gap: spacing.sm }} accessibilityLabel="Loading">
            <Skeleton height={196} radius={radii.xxl} />
            <Skeleton height={20} width="40%" style={{ marginTop: spacing.lg }} />
            <Skeleton height={68} radius={radii.xl} />
            <Skeleton height={68} radius={radii.xl} />
          </View>
        )}

        {/* Other recommendations */}
        {upNext.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Up next</Text>
            {upNext.map((r, i) => (
              <Animated.View key={r.skill_id} entering={enter(i + 1)}>
              <PressableScale style={styles.row} onPress={() => router.push(`/skill/${r.skill_id}`)} scaleTo={0.98}>
                <View style={styles.rowIcon}>
                  <MaterialIcons name="bolt" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.label}</Text>
                  <Text style={styles.rowMeta}>{pct(r.mastery_score)}% mastered</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
              </PressableScale>
              </Animated.View>
            ))}
          </>
        )}

        {loaded && (
        <>
        {/* Today's tools, each one tap away */}
        <Text style={styles.sectionTitle}>Today</Text>
        <View style={styles.tiles}>
          {tiles.map((t, i) => (
            <Animated.View key={t.label} entering={enter(i + 3)} style={{ flex: 1 }}>
            <PressableScale style={[styles.tile, { backgroundColor: t.bg }]} onPress={() => router.push(t.href)}>
              <MaterialIcons name={t.icon} size={20} color={t.tint} />
              <Text style={[styles.tileValue, { color: t.tint }]}>{t.value}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </PressableScale>
            </Animated.View>
          ))}
        </View>

        {/* Progress */}
        <Animated.View entering={enter(6)}>
        <PressableScale style={styles.progressCard} onPress={() => router.push("/learn")} scaleTo={0.98}>
          <View style={{ flex: 1 }}>
            <Text style={styles.progressTitle}>Your path</Text>
            <Text style={styles.progressMeta}>
              {mastered} of {graph.length} skills mastered
            </Text>
            <ProgressBar value={graph.length ? mastered / graph.length : 0} color={colors.tertiary} delay={500} style={{ marginTop: spacing.sm }} />
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
        </PressableScale>
        </Animated.View>

        </>
        )}

        {atRisk && (
          <Animated.View entering={enter(7)} style={styles.riskCard}>
            <MaterialIcons name="warning-amber" size={20} color={colors.error} />
            <Text style={styles.riskText}>
              You haven&apos;t studied in a while. A short focus session today keeps your progress from slipping.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radii.xxl,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: "hidden",
  },
  blob: { position: "absolute", borderRadius: 999, backgroundColor: "#FFFFFF", opacity: 0.12 },
  heroEmpty: { alignItems: "flex-start" },
  heroEyebrow: { ...typography.labelSm, color: "rgba(255,255,255,0.75)", letterSpacing: 1.5 },
  heroTitle: { ...typography.headlineLg, color: "#FFFFFF" },
  heroWhy: { ...typography.bodyMd, color: "rgba(255,255,255,0.85)" },
  heroFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  heroMeta: { ...typography.bodySm, color: "rgba(255,255,255,0.85)" },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.full,
    marginTop: spacing.xs,
  },
  heroBtnText: { ...typography.labelLg, color: colors.primary },
  sectionTitle: { ...typography.headlineSm, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { ...typography.titleMd, color: colors.text },
  rowMeta: { ...typography.bodySm, color: colors.textSecondary },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: { borderRadius: radii.xl, padding: spacing.md, gap: 2, minHeight: 110 },
  tileValue: { ...typography.headlineMd, marginTop: spacing.xs },
  tileLabel: { ...typography.bodySm, color: colors.textSecondary },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  progressTitle: { ...typography.titleMd, color: colors.text },
  progressMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  riskCard: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.errorLight,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  riskText: { ...typography.bodyMd, color: colors.error, flex: 1 },
});
