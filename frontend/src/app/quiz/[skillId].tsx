import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Question = { idx: number; text: string; options: string[] };
type QuizData = {
  session_id: string;
  skill: { id: string; label: string };
  questions: Question[];
};
type Result = { score: number; total: number; percentage: number };
type GraphNode = { id: string; label: string; status: string };

export default function QuizScreen() {
  const { skillId } = useLocalSearchParams<{ skillId: string }>();
  const [skills, setSkills] = useState<GraphNode[]>([]);
  const [selectedSkill, setSelectedSkill] = useState(skillId || "");
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(!skillId);
  const [timer, setTimer] = useState(15);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState<Record<number, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get<GraphNode[]>("/api/recommend/graph").then((nodes) => {
      setSkills(nodes.filter((n) => n.status !== "locked"));
    }).catch(() => {});
  }, []);

  const startQuiz = useCallback(async (sid: string) => {
    setLoading(true);
    setShowPicker(false);
    try {
      const data = await api.get<QuizData>(`/api/game/quiz/${sid}`);
      setQuiz(data);
      setCurrentQ(0);
      setSelected({});
      setResult(null);
      setScore(0);
      setStreak(0);
      setAnswered({});
      setTimer(15);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (skillId) startQuiz(skillId);
      else setLoading(false);
    }, [skillId, startQuiz])
  );

  useEffect(() => {
    if (!quiz || result || showPicker) return;
    if (timerRef.current) clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimer(15);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentQ, quiz, result, showPicker]);

  const question = quiz?.questions[currentQ];
  const multiplier = streak >= 4 ? 4 : streak >= 2 ? streak : 1;

  const selectOption = (opt: string) => {
    if (answered[currentQ] !== undefined) return;
    setSelected((prev) => ({ ...prev, [currentQ]: opt }));
  };

  const next = () => {
    if (quiz && currentQ < quiz.questions.length - 1) {
      setCurrentQ((i) => i + 1);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const answers = Object.entries(selected).map(([idx, sel]) => ({
      question_idx: Number(idx),
      selected: sel,
    }));
    try {
      const res = await api.post<Result>("/api/game/submit", {
        session_id: quiz.session_id,
        answers,
      });
      setResult(res);
      setScore(res.score * 250);
      setStreak(res.score);
    } catch {}
  };

  if (showPicker) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Choose a Skill</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          {skills.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.skillPickerItem, selectedSkill === s.id && styles.skillPickerSelected]}
              onPress={() => setSelectedSkill(s.id)}
            >
              <MaterialIcons
                name={s.status === "mastered" ? "check-circle" : "bolt"}
                size={20}
                color={s.status === "mastered" ? colors.tertiary : colors.secondary}
              />
              <Text style={styles.skillPickerText}>{s.label}</Text>
              {selectedSkill === s.id && (
                <MaterialIcons name="radio-button-checked" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
          {skills.length === 0 && (
            <Text style={styles.loadingText}>Loading skills...</Text>
          )}
          <TouchableOpacity
            style={[styles.navBtn, !selectedSkill && styles.navBtnDisabled]}
            onPress={() => selectedSkill && startQuiz(selectedSkill)}
            disabled={!selectedSkill}
          >
            <MaterialIcons name="bolt" size={20} color="#FFFFFF" />
            <Text style={styles.navBtnText}>Start Quiz</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading quiz...</Text>
      </SafeAreaView>
    );
  }

  if (result) {
    const xpEarned = result.score * 50;
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.resultContainer}>
          <MaterialIcons
            name={result.percentage >= 70 ? "emoji-events" : "refresh"}
            size={56}
            color={result.percentage >= 70 ? colors.tertiary : colors.secondary}
          />
          <Text style={styles.resultScore}>{result.score} / {result.total}</Text>
          <Text style={styles.resultPct}>{result.percentage}%</Text>
          <Text style={styles.resultMsg}>
            {result.percentage >= 90 ? "Outstanding!" : result.percentage >= 70 ? "Great job!" : "Keep practicing!"}
          </Text>
          <View style={styles.resultBadges}>
            <View style={[styles.resultBadge, { backgroundColor: colors.primaryLight }]}>
              <MaterialIcons name="bolt" size={16} color={colors.primary} />
              <Text style={[styles.resultBadgeText, { color: colors.primary }]}>+{xpEarned} XP</Text>
            </View>
            <View style={[styles.resultBadge, { backgroundColor: colors.tertiaryLight }]}>
              <MaterialIcons name="local-fire-department" size={16} color={colors.tertiaryDark} />
              <Text style={[styles.resultBadgeText, { color: colors.tertiaryDark }]}>{score} pts</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primaryLight, marginTop: spacing.sm }]}
            onPress={() => startQuiz(selectedSkill || skillId || "")}
          >
            <Text style={[styles.doneBtnText, { color: colors.primary }]}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{quiz?.skill.label}</Text>
        <View style={styles.timerBadge}>
          <MaterialIcons name="timer" size={14} color={timer <= 5 ? colors.error : colors.primary} />
          <Text style={[styles.timerText, timer <= 5 && { color: colors.error }]}>{timer}s</Text>
        </View>
      </View>

      {/* Score & Streak Bar */}
      <View style={styles.scoreBar}>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{score} pts</Text>
        </View>
        {streak >= 2 && (
          <View style={[styles.scoreBadge, { backgroundColor: colors.errorLight }]}>
            <MaterialIcons name="local-fire-department" size={14} color={colors.error} />
            <Text style={[styles.scoreText, { color: colors.error }]}>x{multiplier}</Text>
          </View>
        )}
        <Text style={styles.counter}>
          Question {currentQ + 1} of {quiz?.questions.length}
        </Text>
      </View>

      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${((currentQ + 1) / (quiz?.questions.length || 1)) * 100}%` },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {question && (
          <>
            <Text style={styles.questionText}>{question.text}</Text>

            {question.options.map((opt, i) => {
              const isSelected = selected[currentQ] === opt;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.optionBtn, isSelected && styles.optionSelected]}
                  onPress={() => selectOption(opt)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionLetter]}>
                    <Text style={styles.optionLetterText}>{String.fromCharCode(65 + i)}</Text>
                  </View>
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={styles.navRow}>
          {currentQ < (quiz?.questions.length || 1) - 1 ? (
            <TouchableOpacity
              style={[styles.navBtn, !selected[currentQ] && styles.navBtnDisabled]}
              onPress={next}
              disabled={!selected[currentQ]}
            >
              <Text style={styles.navBtnText}>Next Question</Text>
              <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.navBtn, !selected[currentQ] && styles.navBtnDisabled]}
              onPress={submit}
              disabled={!selected[currentQ]}
            >
              <Text style={styles.navBtnText}>Submit Quiz</Text>
              <MaterialIcons name="check" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingText: { ...typography.bodyMd, color: colors.textSecondary, textAlign: "center", marginTop: 60 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceWhite,
  },
  topTitle: { ...typography.titleMd, color: colors.text },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  timerText: { ...typography.labelLg, color: colors.primary },
  scoreBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceWhite,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  scoreText: { ...typography.labelMd, color: colors.primary },
  counter: { ...typography.bodySm, color: colors.textSecondary, marginLeft: "auto" },
  progressBarBg: { height: 4, backgroundColor: colors.border },
  progressBarFill: { height: 4, backgroundColor: colors.primary },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  questionText: { ...typography.headlineSm, color: colors.text, marginBottom: spacing.lg },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 56,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionLetter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.locked,
    justifyContent: "center",
    alignItems: "center",
  },
  optionLetterText: { ...typography.labelMd, color: colors.textSecondary },
  optionText: { ...typography.bodyMd, color: colors.text, flex: 1 },
  optionTextSelected: { color: colors.primaryDark },
  navRow: { marginTop: spacing.lg },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  resultContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  resultScore: { ...typography.displayLg, color: colors.text, marginTop: spacing.md },
  resultPct: { ...typography.headlineLg, color: colors.primary },
  resultMsg: { ...typography.bodyLg, color: colors.textSecondary, marginTop: spacing.sm },
  resultBadges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  resultBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full },
  resultBadgeText: { ...typography.labelMd },
  doneBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    width: "100%",
    alignItems: "center",
  },
  doneBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  skillPickerItem: {
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
  skillPickerSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  skillPickerText: { ...typography.bodyMd, color: colors.text, flex: 1 },
});
