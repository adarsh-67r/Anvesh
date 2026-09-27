import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Question = { id: string; text: string; options: string[]; answer: string; explanation: string | null };
type Practice = { skill: { id: string; label: string }; questions: Question[] };
type AnswerResult = { mastery_score: number; is_mastered: boolean };
type Rec = { skill_id: string; label: string };

const pct = (x: number) => Math.round(x * 100);

export default function PracticeScreen() {
  const { skillId } = useLocalSearchParams<{ skillId: string }>();
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

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    setIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setDone(false);
    setMastery(null);
    try {
      const [p, m] = await Promise.all([
        api.get<Practice>(`/api/game/practice/${skillId}`),
        api.get<{ mastery_score: number }>(`/api/recommend/mastery/${skillId}`).catch(() => ({ mastery_score: 0 })),
      ]);
      setStartMastery(m.mastery_score);
      setData(p);
      shownAt.current = Date.now();
    } catch (e: any) {
      const detail = (() => { try { return JSON.parse(e.message).detail as string; } catch { return ""; } })();
      setError(detail || "Could not load practice questions. Check your connection and try again.");
    }
  }, [skillId]);

  useEffect(() => { load(); }, [load]);

  const q = data?.questions[idx];

  const choose = async (option: string) => {
    if (!q || picked) return;
    setPicked(option);
    const correct = option === q.answer;
    if (correct) setCorrectCount((n) => n + 1);
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
    const recs = await api.get<Rec[]>("/api/recommend/next?limit=3").catch(() => []);
    setNext(recs.find((r) => r.skill_id !== skillId) ?? null);
  };

  const header = (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close practice" hitSlop={8}>
        <MaterialIcons name="close" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.topTitle} numberOfLines={1}>{data?.skill.label ?? "Practice"}</Text>
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
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Preparing questions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    const total = data.questions.length;
    const after = mastery?.mastery_score ?? startMastery;
    const delta = pct(after) - pct(startMastery);
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {header}
        <ScrollView contentContainerStyle={styles.summary}>
          <MaterialIcons
            name={correctCount / total >= 0.7 ? "emoji-events" : "trending-up"}
            size={56}
            color={correctCount / total >= 0.7 ? colors.tertiary : colors.primary}
          />
          <Text style={styles.summaryScore}>{correctCount} / {total} correct</Text>
          <View style={styles.masteryRow}>
            <Text style={styles.masteryFrom}>{pct(startMastery)}%</Text>
            <MaterialIcons name="arrow-forward" size={20} color={colors.textSecondary} />
            <Text style={styles.masteryTo}>{pct(after)}%</Text>
            <Text style={[styles.delta, { color: delta >= 0 ? colors.tertiaryDark : colors.error }]}>
              {delta >= 0 ? `+${delta}` : delta}
            </Text>
          </View>
          <Text style={styles.centerText}>
            {mastery?.is_mastered ? "Skill mastered! New skills may have unlocked." : "Mastery updates with every answer you give."}
          </Text>

          {next && (
            <TouchableOpacity style={styles.nextCard} onPress={() => router.replace(`/skill/${next.skill_id}`)}>
              <Text style={styles.nextEyebrow}>RECOMMENDED NEXT</Text>
              <Text style={styles.nextTitle} numberOfLines={2}>{next.label}</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" style={{ alignSelf: "flex-end" }} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.secondaryBtn} onPress={load}>
            <Text style={styles.secondaryBtnText}>Practice again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnText}>Back to skill</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {header}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((idx + (picked ? 1 : 0)) / data.questions.length) * 100}%` }]} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.counter}>Question {idx + 1} of {data.questions.length}</Text>
        <Text style={styles.question}>{q?.text}</Text>

        {q?.options.map((opt) => {
          const isAnswer = opt === q.answer;
          const isPicked = opt === picked;
          const state = !picked ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
          return (
            <TouchableOpacity
              key={opt}
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
          );
        })}

        {picked && (
          <View style={[styles.feedback, { borderColor: picked === q?.answer ? colors.tertiary : colors.error }]}>
            <Text style={[styles.feedbackTitle, { color: picked === q?.answer ? colors.tertiaryDark : colors.error }]}>
              {picked === q?.answer ? "Correct!" : "Not quite"}
            </Text>
            {q?.explanation ? <Text style={styles.feedbackText}>{q.explanation}</Text> : null}
          </View>
        )}
      </ScrollView>

      {picked && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={advance}>
            <Text style={styles.primaryBtnText}>{idx < data.questions.length - 1 ? "Next question" : "See results"}</Text>
          </TouchableOpacity>
        </View>
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
  progressTrack: { height: 6, backgroundColor: colors.locked, marginHorizontal: spacing.md, borderRadius: radii.full, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: radii.full },
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
  masteryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  masteryFrom: { ...typography.headlineMd, color: colors.textSecondary },
  masteryTo: { ...typography.headlineMd, color: colors.primary },
  delta: { ...typography.labelLg },
  nextCard: { alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.xs, marginVertical: spacing.sm },
  nextEyebrow: { ...typography.labelSm, color: "rgba(255,255,255,0.75)", letterSpacing: 1.5 },
  nextTitle: { ...typography.headlineSm, color: "#FFFFFF" },
});
