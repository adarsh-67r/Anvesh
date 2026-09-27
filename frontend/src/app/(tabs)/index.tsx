import { useCallback, useState, type ComponentProps } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { api, StudyStatus } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ScreenHeader } from "../../components/Sidebar";
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
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>STUDY NEXT</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{hero.label}</Text>
            <Text style={styles.heroWhy}>{whyThis(hero)}</Text>
            <View style={styles.heroBar}>
              <View style={[styles.heroBarFill, { width: `${pct(hero.mastery_score)}%` }]} />
            </View>
            <View style={styles.heroFooter}>
              <Text style={styles.heroMeta}>
                {pct(hero.mastery_score)}% mastered{hero.videos.length ? ` · ${hero.videos.length} lessons` : ""}
              </Text>
              <TouchableOpacity
                style={styles.heroBtn}
                onPress={() => router.push(`/skill/${hero.skill_id}`)}
                accessibilityRole="button"
              >
                <Text style={styles.heroBtnText}>{hero.mastery_score > 0 ? "Continue" : "Start"}</Text>
                <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : loaded ? (
          <View style={[styles.hero, styles.heroEmpty]}>
            <MaterialIcons name={graph.length ? "emoji-events" : "playlist-add"} size={32} color="#FFFFFF" />
            <Text style={styles.heroTitle}>{graph.length ? "Everything available is mastered" : "Add your first topic"}</Text>
            <Text style={styles.heroWhy}>
              {graph.length
                ? "Add a new topic or review your flashcards to stay sharp."
                : "Paste a YouTube playlist and Anvesh builds your learning path."}
            </Text>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push("/add-content")}>
              <Text style={styles.heroBtnText}>Add topic</Text>
              <MaterialIcons name="add" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Other recommendations */}
        {upNext.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Up next</Text>
            {upNext.map((r) => (
              <TouchableOpacity key={r.skill_id} style={styles.row} onPress={() => router.push(`/skill/${r.skill_id}`)}>
                <View style={styles.rowIcon}>
                  <MaterialIcons name="bolt" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.label}</Text>
                  <Text style={styles.rowMeta}>{pct(r.mastery_score)}% mastered</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {loaded && (
        <>
        {/* Today's tools, each one tap away */}
        <Text style={styles.sectionTitle}>Today</Text>
        <View style={styles.tiles}>
          {tiles.map((t) => (
            <TouchableOpacity key={t.label} style={[styles.tile, { backgroundColor: t.bg }]} onPress={() => router.push(t.href)}>
              <MaterialIcons name={t.icon} size={20} color={t.tint} />
              <Text style={[styles.tileValue, { color: t.tint }]}>{t.value}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Progress */}
        <TouchableOpacity style={styles.progressCard} onPress={() => router.push("/learn")}>
          <View style={{ flex: 1 }}>
            <Text style={styles.progressTitle}>Your path</Text>
            <Text style={styles.progressMeta}>
              {mastered} of {graph.length} skills mastered
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: graph.length ? `${(mastered / graph.length) * 100}%` : "0%" }]} />
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
        </TouchableOpacity>

        </>
        )}

        {atRisk && (
          <View style={styles.riskCard}>
            <MaterialIcons name="warning-amber" size={20} color={colors.error} />
            <Text style={styles.riskText}>
              You haven&apos;t studied in a while. A short focus session today keeps your progress from slipping.
            </Text>
          </View>
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
  },
  heroEmpty: { alignItems: "flex-start" },
  heroEyebrow: { ...typography.labelSm, color: "rgba(255,255,255,0.75)", letterSpacing: 1.5 },
  heroTitle: { ...typography.headlineLg, color: "#FFFFFF" },
  heroWhy: { ...typography.bodyMd, color: "rgba(255,255,255,0.85)" },
  heroBar: { height: 6, borderRadius: radii.full, backgroundColor: "rgba(255,255,255,0.25)", marginTop: spacing.sm, overflow: "hidden" },
  heroBarFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: radii.full },
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
  tile: { flex: 1, borderRadius: radii.xl, padding: spacing.md, gap: 2, minHeight: 110 },
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
  progressBar: { height: 6, borderRadius: radii.full, backgroundColor: colors.locked, marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radii.full, backgroundColor: colors.tertiary },
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
