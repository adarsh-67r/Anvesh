import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api , errorDetail } from "../../lib/api";
import { feedback } from "../../lib/feedback";
import { getFramework, levelText, waitReady, type Assessment } from "../../lib/skills";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { Button, shared } from "../../components/Skill";
import { AnswerFx, Confetti, ProgressBar } from "../../components/Motion";

type Feedback = { correct: boolean; answer: string; explanation: string; source_ref: string; competency_id: string | null; level: number | null };
const now = () => Date.now();
type Result = { score: number; total: number; percent: number; passed: boolean; completed_course: string | null };

/** Quiz player. id = assessment id, or "diagnostic" (+competency) / "course" (+course) to fetch-or-generate one. */
export default function AssessScreen() {
  const { id, competency, course } = useLocalSearchParams<{ id: string; competency?: string; course?: string }>();
  const [quiz, setQuiz] = useState<Assessment | null>(null);
  const [waiting, setWaiting] = useState("");
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [answers, setAnswers] = useState<{ question_id: string; selected: string }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const shownAt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getFramework().then((f) => setNames(Object.fromEntries(f.competencies.map((c) => [c.id, c.name])))).catch(() => {});
    (async () => {
      try {
        let aid = id;
        if (id === "diagnostic" || id === "course") {
          setWaiting(id === "diagnostic" ? "Writing a short diagnostic for this competency…" : "Preparing the course completion quiz…");
          const path = id === "diagnostic" ? `/api/competency/${competency}/diagnostic` : `/api/courses/${encodeURIComponent(course ?? "")}/quiz`;
          aid = (await waitReady(path, () => alive.current)).id;
        }
        for (let i = 0; i < 60 && alive.current; i++) {
          const a = await api.get<Assessment>(`/api/assessments/${aid}`);
          if (a.status === "failed") throw new Error(a.error || "The questions couldn't be generated.");
          if (a.status === "ready") {
            if (!a.questions.length) throw new Error("This quiz has no questions yet.");
            setQuiz(a);
            setWaiting("");
            shownAt.current = now();
            return;
          }
          setWaiting("The AI is still writing the questions…");
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (e) {
        if (alive.current) setError(errorDetail(e, (e as Error)?.message || "Couldn't load this assessment."));
      }
    })();
    return () => { alive.current = false; };
  }, [id, competency, course]);

  const q = quiz?.questions[idx];

  const choose = async (opt: string) => {
    if (!quiz || !q || picked) return;
    setPicked(opt);
    try {
      const r = await api.post<Feedback>(`/api/assessments/${quiz.id}/answer`, {
        question_id: q.id, selected: opt, time_ms: now() - shownAt.current,
      });
      setFb(r);
      if (r.correct) feedback.correct(); else feedback.wrong();
    } catch {
      setFb({ correct: false, answer: "", explanation: "Couldn't check this answer — you can still continue.", source_ref: "", competency_id: null, level: null });
    }
    setAnswers((a) => [...a, { question_id: q.id, selected: opt }]);
  };

  const next = async () => {
    if (!quiz) return;
    if (idx + 1 < quiz.questions.length) {
      setIdx(idx + 1);
      setPicked(null);
      setFb(null);
      shownAt.current = now();
      return;
    }
    try {
      const r = await api.post<Result>(`/api/assessments/${quiz.id}/finish`, { answers });
      setResult(r);
      if (r.passed) feedback.celebrate();
    } catch (e) {
      setError(errorDetail(e, "Couldn't save your result."));
    }
  };

  const header = (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close" hitSlop={8}>
        <MaterialIcons name="close" size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.topTitle} numberOfLines={1}>{quiz?.title ?? "Assessment"}</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  if (error || waiting || !quiz || !q) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {header}
        <View style={styles.center}>
          {error ? (
            <>
              <MaterialIcons name="error-outline" size={40} color={colors.error} />
              <Text style={[shared.body, { textAlign: "center" }]}>{error}</Text>
              <Button label="Go back" onPress={() => router.back()} kind="secondary" />
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[shared.body, { textAlign: "center" }]}>{waiting || "Loading…"}</Text>
              <Text style={shared.muted}>This takes about 20 seconds the first time; after that it’s instant for everyone.</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {result.passed && <Confetti />}
        {header}
        <View style={styles.center}>
          <Text style={styles.big}>{result.percent}%</Text>
          <Text style={shared.title}>{result.score} of {result.total} correct</Text>
          <Text style={[shared.muted, { textAlign: "center", maxWidth: 420 }]}>
            {result.completed_course ? "Course completed — your competency levels have been updated."
              : quiz.kind === "course" && !result.passed ? "70% is needed to complete the course. Review and try again."
              : "Your answers have updated your competency levels."}
          </Text>
          <View style={shared.row}>
            <Button label="Done" onPress={() => router.back()} />
            <Button label="My competencies" kind="secondary" onPress={() => router.replace("/competencies")} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const state = (o: string) => !picked ? "idle" : o === (fb?.answer || "") ? "right" : o === picked ? "wrong" : "dim";
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {header}
      <View style={styles.body}>
        <ProgressBar value={(idx + (picked ? 1 : 0)) / quiz.questions.length} />
        <View style={shared.row}>
          <Text style={shared.muted}>Question {idx + 1} of {quiz.questions.length}</Text>
          {q.competency_id && names[q.competency_id] ? <Text style={shared.muted}>· {names[q.competency_id]}</Text> : null}
          <Text style={shared.muted}>· {["", "Recall", "Understanding", "Application"][q.difficulty] ?? ""}</Text>
        </View>
        <Text style={styles.question}>{q.text}</Text>
        <View style={{ gap: spacing.sm }}>
          {q.options.map((o) => (
            <AnswerFx key={o} state={state(o)}>
              <TouchableOpacity
                onPress={() => choose(o)}
                disabled={!!picked}
                style={[styles.opt, state(o) === "right" && styles.optRight, state(o) === "wrong" && styles.optWrong]}
                accessibilityRole="button"
              >
                <Text style={styles.optText}>{o}</Text>
              </TouchableOpacity>
            </AnswerFx>
          ))}
        </View>
        {fb && (
          <View style={[styles.fb, fb.correct ? styles.fbRight : styles.fbWrong]}>
            <Text style={[shared.title, { color: fb.correct ? colors.tertiaryDark : colors.error }]}>
              {fb.correct ? "Correct" : "Not quite"}
            </Text>
            {fb.explanation ? <Text style={shared.body}>{fb.explanation}</Text> : null}
            <View style={shared.wrap}>
              {fb.source_ref ? <Text style={styles.meta}>Source: {fb.source_ref}</Text> : null}
              {fb.level != null && fb.competency_id ? (
                <Text style={styles.meta}>{names[fb.competency_id] ?? "Competency"} now {levelText(fb.level)} / 5</Text>
              ) : null}
            </View>
          </View>
        )}
        {picked && <Button label={idx + 1 < quiz.questions.length ? "Next question" : "See result"} onPress={next} icon="arrow-forward" />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topTitle: { ...typography.titleMd, color: colors.text, flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  body: { padding: spacing.md, gap: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" },
  question: { ...typography.headlineSm, color: colors.text },
  opt: { backgroundColor: colors.surfaceWhite, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md },
  optRight: { borderColor: colors.tertiary, backgroundColor: colors.tertiaryLight },
  optWrong: { borderColor: colors.error, backgroundColor: colors.errorLight },
  optText: { ...typography.bodyMd, color: colors.text },
  fb: { borderRadius: radii.xl, padding: spacing.md, gap: 6, borderWidth: 1 },
  fbRight: { backgroundColor: colors.tertiaryLight, borderColor: colors.tertiary },
  fbWrong: { backgroundColor: colors.errorLight, borderColor: colors.error },
  meta: { ...typography.labelMd, color: colors.textSecondary },
  big: { ...typography.displayLg, color: colors.primary },
});
