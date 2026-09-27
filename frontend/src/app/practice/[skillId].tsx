import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp, SlideInRight, SlideOutLeft, ZoomIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";
import { AnswerFx, Confetti, CountUp, PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { feedback } from "../../lib/feedback";
import { fmtTs } from "../../lib/trails";

type Question = {
  id: string;
  text: string;
  options: string[];
  answer: string;
  explanation: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  lesson_index: number | null;
  timestamp_sec: number | null;
};
type Practice = { skill?: { id: string; label: string }; method: "captions" | "gemini" | "titles"; questions: Question[] };
type AnswerResult = { mastery_score: number; is_mastered: boolean };
type Rec = { skill_id: string; label: string };

const pct = (x: number) => Math.round(x * 100);

export default function PracticeScreen() {
  const { skillId, lesson, mode } = useLocalSearchParams<{ skillId: string; lesson?: string; mode?: string }>();
  const [data, setData] = useState<Practice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [startMastery, setStartMastery] = useState(0);
  const [mastery, setMastery] = useState<AnswerResult | null>(null);
  const [done, setDone] = useState(false);
  const [next, setNext] = useState<Rec | null>(null);
  const shownAt = useRef(Date.now());
  const [preparing, setPreparing] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    setIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setDone(false);
    setMastery(null);
    setPreparing(null);
    const path = lesson ? `/api/topics/${skillId}/lessons/${lesson}/check` : `/api/game/practice/${skillId}`;
    const fetchReady = async (): Promise<Practice> => {
      for (;;) {
        const res = await api.get<Practice & { status?: string; progress?: string }>(path);
        if (!res.status) return res;
        if (res.status === "failed") throw new Error(JSON.stringify({ detail: "Could not read the lectures right now. Try again shortly." }));
        if (!alive.current) throw new Error("{}");
        setPreparing(res.progress || "");
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    try {
      const [p, m] = await Promise.all([
        fetchReady(),
        api.get<{ mastery_score: number }>(`/api/recommend/mastery/${skillId}`).catch(() => ({ mastery_score: 0 })),
      ]);
      setStartMastery(m.mastery_score);
      setData(p);
      shownAt.current = Date.now();
    } catch (e: any) {
      const detail = (() => { try { return JSON.parse(e.message).detail as string; } catch { return ""; } })();
      setError(detail || "Could not load practice questions. Check your connection and try again.");
    }
  }, [skillId, lesson]);

  useEffect(() => { load(); }, [load]);

  const q = data?.questions[idx];

  const choose = async (option: string) => {
    if (!q || picked) return;
    setPicked(option);
    const correct = option === q.answer;
    if (correct) setCorrectCount((n) => n + 1);
    if (correct) feedback.correct(); else feedback.wrong();
    try {
      const res = await api.post<AnswerResult>("/api/recommend/answer", {
        skill_id: skillId,
        correct,
        question_id: q.id,
        response_time_ms: Date.now() - shownAt.current,
      });
      setMastery(res);
    } catch {}
  };

  const advance = async () => {
    if (!data) return;
    if (idx < data.questions.length - 1) {
      setIdx((i) => i + 1);
      setPicked(null);
      shownAt.current = Date.now();
      return;
    }
    setDone(true);
    const final = correctCount / data.questions.length;
    if (final >= 0.7 || mastery?.is_mastered) feedback.celebrate();
    const recs = await api.get<Rec[]>("/api/recommend/next?limit=3").catch(() => []);
    setNext(recs.find((r) => r.skill_id !== skillId) ?? null);
  };

  const header = (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close practice" hitSlop={8}>
        <MaterialIcons name="close" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.topTitle} numberOfLines={1}>{mode === "testout" ? "Test out" : lesson ? "Quick check" : data?.skill?.label ?? "Practice"}</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {header}
        <View style={styles.center}>
          <MaterialIcons name="cloud-off" size={48} color={colors.textMuted} />
          <Text style={styles.centerText}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={load}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {header}
        <View style={styles.body} accessibilityLabel="Preparing questions">
          <Animated.View entering={FadeIn} style={styles.preparing}>
            <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
            <Text style={styles.preparingText}>{preparing !== null ? "Reading the lectures…" : "Preparing questions for you…"}</Text>
          </Animated.View>
          {preparing ? <Text style={styles.preparingSub}>{preparing}</Text> : null}
          <Skeleton height={22} width="85%" />
          <Skeleton height={22} width="60%" style={{ marginBottom: spacing.md }} />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={56} radius={radii.lg} style={{ marginBottom: spacing.sm }} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    const total = data.questions.length;
    const after = mastery?.mastery_score ?? startMastery;
    const delta = pct(after) - pct(startMastery);
    const great = correctCount / total >= 0.7 || !!mastery?.is_mastered;
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {header}
        <ScrollView contentContainerStyle={styles.summary}>
          <Animated.View entering={ZoomIn.springify().damping(9)} style={[styles.trophy, { backgroundColor: great ? colors.tertiaryLight : colors.primaryLight }]}>
            <MaterialIcons name={great ? "emoji-events" : "trending-up"} size={56} color={great ? colors.tertiary : colors.primary} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(150)} style={styles.summaryScore}>{correctCount} / {total} correct</Animated.Text>

          <Animated.View entering={FadeInDown.delay(300)} style={styles.masteryCard}>
            <Text style={styles.masteryCaption}>MASTERY</Text>
            <View style={styles.masteryRow}>
              <Text style={styles.masteryFrom}>{pct(startMastery)}%</Text>
              <MaterialIcons name="arrow-forward" size={20} color={colors.textSecondary} />
              <CountUp from={pct(startMastery)} to={pct(after)} delay={600} duration={1200} format={(n) => `${Math.round(n)}%`} style={styles.masteryTo} />
              <Animated.View entering={ZoomIn.delay(1700).springify()} style={[styles.deltaPill, { backgroundColor: delta >= 0 ? colors.tertiaryLight : colors.errorLight }]}>
                <Text style={[styles.delta, { color: delta >= 0 ? colors.tertiaryDark : colors.error }]}>
                  {delta >= 0 ? `+${delta}` : delta}
                </Text>
              </Animated.View>
            </View>
            <ProgressBar from={startMastery} value={after} delay={600} duration={1200} height={10} color={mastery?.is_mastered ? colors.tertiary : colors.primary} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(1800)} style={styles.centerText}>
            {mastery?.is_mastered ? "Skill mastered! New skills may have unlocked." : "Mastery updates with every answer you give."}
          </Animated.Text>

          {next && (
            <Animated.View entering={FadeInUp.delay(2000).springify().damping(16)} style={{ alignSelf: "stretch" }}>
              <PressableScale style={styles.nextCard} onPress={() => router.replace(`/skill/${next.skill_id}`)} scaleTo={0.98}>
                <Text style={styles.nextEyebrow}>RECOMMENDED NEXT</Text>
                <Text style={styles.nextTitle} numberOfLines={2}>{next.label}</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" style={{ alignSelf: "flex-end" }} />
              </PressableScale>
            </Animated.View>
          )}
          <Animated.View entering={FadeIn.delay(2200)} style={{ alignSelf: "stretch", gap: spacing.sm }}>
            <PressableScale style={styles.secondaryBtn} onPress={load}>
              <Text style={styles.secondaryBtnText}>Practice again</Text>
            </PressableScale>
            <PressableScale style={styles.secondaryBtn} onPress={() => router.back()}>
              <Text style={styles.secondaryBtnText}>Back to skill</Text>
            </PressableScale>
          </Animated.View>
        </ScrollView>
        {great && <Confetti />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {header}
      <ProgressBar value={(idx + (picked ? 1 : 0)) / data.questions.length} duration={450} style={{ marginHorizontal: spacing.md }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View key={idx} entering={SlideInRight.springify().damping(20)} exiting={SlideOutLeft.duration(180)}>
        {idx === 0 && data.method === "titles" && (
          <Text style={styles.titlesNote}>These questions come from lesson titles; the lectures couldn&apos;t be read yet.</Text>
        )}
        <Text style={styles.counter}>Question {idx + 1} of {data.questions.length}</Text>
        <Text style={styles.question}>{q?.text}</Text>

        {q?.options.map((opt, i) => {
          const isAnswer = opt === q.answer;
          const isPicked = opt === picked;
          const state = !picked ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
          return (
            <Animated.View key={opt} entering={enter(i + 1)}>
            <AnswerFx state={state}>
            <TouchableOpacity
              style={[styles.option, styles[`opt_${state}`]]}
              onPress={() => choose(opt)}
              disabled={!!picked}
              accessibilityRole="button"
              accessibilityState={{ selected: isPicked }}
            >
              <Text style={[styles.optionText, state === "right" && { color: colors.tertiaryDark }, state === "wrong" && { color: colors.error }]}>
                {opt}
              </Text>
              {state === "right" && <MaterialIcons name="check-circle" size={22} color={colors.tertiary} />}
              {state === "wrong" && <MaterialIcons name="cancel" size={22} color={colors.error} />}
            </TouchableOpacity>
            </AnswerFx>
            </Animated.View>
          );
        })}

        {picked && (
          <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.feedback, { borderColor: picked === q?.answer ? colors.tertiary : colors.error }]}>
            <Text style={[styles.feedbackTitle, { color: picked === q?.answer ? colors.tertiaryDark : colors.error }]}>
              {picked === q?.answer ? "Correct!" : "Not quite"}
            </Text>
            {q?.explanation ? <Text style={styles.feedbackText}>{q.explanation}</Text> : null}
            {picked !== q?.answer && q?.lesson_id && (
              <PressableScale style={styles.watchBtn} onPress={() => router.push(`/lecture/${q.lesson_id}${q.timestamp_sec != null ? `?t=${q.timestamp_sec}` : ""}`)}>
                <MaterialIcons name="replay" size={18} color={colors.primary} />
                <Text style={styles.watchText}>
                  Watch again · Lesson {q.lesson_index}{q.timestamp_sec != null ? ` at ${fmtTs(q.timestamp_sec)}` : ""}
                </Text>
              </PressableScale>
            )}
          </Animated.View>
        )}
        </Animated.View>
      </ScrollView>

      {picked && (
        <Animated.View entering={FadeInUp.springify().damping(18)} style={styles.footer}>
          <PressableScale style={styles.primaryBtn} onPress={advance}>
            <Text style={styles.primaryBtnText}>{idx < data.questions.length - 1 ? "Next question" : "See results"}</Text>
          </PressableScale>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  topTitle: { ...typography.titleMd, color: colors.text, flex: 1, textAlign: "center", marginHorizontal: spacing.sm },
  preparing: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.md },
  preparingText: { ...typography.labelLg, color: colors.primary },
  preparingSub: { ...typography.bodySm, color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.md },
  titlesNote: { ...typography.bodySm, color: colors.textSecondary, backgroundColor: colors.locked, borderRadius: radii.md, padding: spacing.sm },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  watchText: { ...typography.labelMd, color: colors.primary },
  body: { padding: spacing.md, paddingBottom: spacing.xl },
  counter: { ...typography.labelMd, color: colors.textSecondary, marginTop: spacing.sm },
  question: { ...typography.headlineMd, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.lg },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 56,
  },
  opt_idle: { borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  opt_right: { borderColor: colors.tertiary, backgroundColor: colors.tertiaryLight },
  opt_wrong: { borderColor: colors.error, backgroundColor: colors.errorLight },
  opt_dim: { borderColor: colors.border, backgroundColor: colors.surfaceWhite, opacity: 0.5 },
  optionText: { ...typography.bodyLg, color: colors.text, flex: 1 },
  feedback: { borderLeftWidth: 4, backgroundColor: colors.surfaceWhite, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.sm },
  feedbackTitle: { ...typography.titleMd },
  feedbackText: { ...typography.bodyMd, color: colors.textSecondary, marginTop: spacing.xs },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceWhite },
  primaryBtn: { height: 52, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", alignSelf: "stretch", paddingHorizontal: spacing.lg },
  primaryBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  secondaryBtn: { height: 48, borderRadius: radii.full, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  secondaryBtnText: { ...typography.labelLg, color: colors.primary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  centerText: { ...typography.bodyMd, color: colors.textSecondary, textAlign: "center" },
  summary: { padding: spacing.lg, alignItems: "center", gap: spacing.md },
  summaryScore: { ...typography.headlineLg, color: colors.text },
  trophy: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  masteryCard: {
    alignSelf: "stretch",
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  masteryCaption: { ...typography.labelSm, color: colors.textSecondary, letterSpacing: 1.2 },
  masteryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  masteryFrom: { ...typography.headlineMd, color: colors.textSecondary },
  masteryTo: { ...typography.displayLg, fontSize: 34, lineHeight: 40, color: colors.primary },
  deltaPill: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.full },
  delta: { ...typography.labelLg },
  nextCard: { alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.xs, marginVertical: spacing.sm },
  nextEyebrow: { ...typography.labelSm, color: "rgba(255,255,255,0.75)", letterSpacing: 1.5 },
  nextTitle: { ...typography.headlineSm, color: "#FFFFFF" },
});
