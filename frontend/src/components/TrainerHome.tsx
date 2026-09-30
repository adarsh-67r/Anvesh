import { useCallback, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DOMAIN_COLORS, type Domain } from "../lib/skills";
import { SPACES } from "../lib/workspace";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Badge, Button, Card, Empty, Hero, Page, PercentBar, SectionTitle, Stat, shared } from "./Skill";
import { PressableScale, Skeleton } from "./Motion";

export type QuizStat = {
  id: string; title: string; status: string; published: boolean; questions: number; attempts: number; learners: number; average_score: number | null;
};
export type TrainerDash = {
  quizzes: number; published: number; questions: number; attempts: number; learners: number; average_score: number | null;
  quiz_stats: QuizStat[];
  hardest_questions: { id: string; text: string; quiz: string; assessment_id: string; responses: number; percent_correct: number }[];
  uncovered_gaps: { id: string; name: string; domain: Domain; officials: number; average_level: number; percent_meeting: number; total_gap: number }[];
};

const ACCENT = SPACES.trainer.accent;
export const scoreColor = (v: number | null) => (v == null ? colors.textMuted : v >= 70 ? colors.tertiary : v >= 50 ? "#D97706" : colors.error);

export function QuizRow({ q }: { q: QuizStat }) {
  return (
    <PressableScale onPress={() => router.push({ pathname: "/results/[id]", params: { id: q.id } })} accessibilityRole="button">
      <View style={styles.quizRow}>
        <View style={[styles.quizIcon, { backgroundColor: SPACES.trainer.tint }]}>
          <MaterialIcons name="fact-check" size={20} color={ACCENT} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={shared.title} numberOfLines={1}>{q.title}</Text>
          <Text style={shared.muted}>{q.questions} questions · {q.attempts} attempts · {q.learners} learners</Text>
        </View>
        {!q.published && <Badge label="DRAFT" tint={colors.secondaryDark} />}
        <Text style={[styles.score, { color: scoreColor(q.average_score) }]}>{q.average_score == null ? "–" : `${q.average_score}%`}</Text>
        <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
      </View>
    </PressableScale>
  );
}

export default function TrainerHome() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [d, setD] = useState<TrainerDash | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.get<TrainerDash>("/api/dashboard/trainer").then((x) => { setD(x); setError(false); }).catch(() => setError(true)), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const wide = width >= 900;
  const first = user?.name?.split(" ")[0];
  return (
    <Page title={first ? `Welcome, ${first}` : "Overview"} subtitle="Build assessments and see how learners perform"
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} refreshing={refreshing}>
      {!d && !error && <Skeleton height={180} radius={radii.xxl} />}
      {error && !d && <Empty icon="cloud-off" title="Couldn't load your overview" body="The server may be waking up. Pull down to try again." />}
      {d && (
        <>
          <Hero eyebrow="TRAINER CONSOLE · LEARNER PERFORMANCE" accent={ACCENT}
            value={d.average_score == null ? "–" : `${d.average_score}%`}
            body={d.attempts ? `average score across ${d.attempts} attempts by ${d.learners} officials on your published quizzes.`
              : "Publish a quiz to start seeing how officials perform."}>
            <View style={shared.wrap}>
              <Button label="New quiz from material" icon="upload-file" kind="light" accent={ACCENT} onPress={() => router.push("/studio")} />
              <Button label="Question bank" icon="inventory-2" kind="light" accent={ACCENT} onPress={() => router.push("/question-bank")} />
            </View>
          </Hero>

          <View style={shared.wrap}>
            <Stat label="Quizzes published" value={`${d.published} / ${d.quizzes}`} icon="publish" tint={ACCENT} />
            <Stat label="Questions written" value={String(d.questions)} icon="help-outline" tint={colors.secondary} />
            <Stat label="Attempts" value={String(d.attempts)} icon="how-to-reg" tint={colors.tertiary} />
            <Stat label="Officials reached" value={String(d.learners)} icon="groups" tint="#D97706" />
          </View>

          <View style={wide ? styles.cols : undefined}>
            <View style={wide ? { flex: 1 } : undefined}>
              <SectionTitle>Questions learners miss</SectionTitle>
              <Card>
                {d.hardest_questions.length === 0 && <Text style={shared.muted}>Needs at least 3 answers per question. Check back once officials take your quizzes.</Text>}
                {d.hardest_questions.map((q) => (
                  <PressableScale key={q.id} onPress={() => router.push({ pathname: "/results/[id]", params: { id: q.assessment_id } })}>
                    <View style={styles.missRow}>
                      <Text style={shared.body} numberOfLines={2}>{q.text}</Text>
                      <PercentBar label={q.quiz} value={q.percent_correct} sub={`${q.responses} answers`} color={scoreColor(q.percent_correct)} />
                    </View>
                  </PressableScale>
                ))}
                {d.hardest_questions.length > 0 && <Text style={shared.muted}>Bar = % who answered correctly. Low scores mean a concept to re-teach, or a question to reword.</Text>}
              </Card>
            </View>
            <View style={wide ? { flex: 1 } : undefined}>
              <SectionTitle>Quiz ideas</SectionTitle>
              <Card>
                <Text style={shared.muted}>The organisation’s biggest competency gaps that none of your published quizzes cover yet.</Text>
                {d.uncovered_gaps.map((g) => (
                  <View key={g.id} style={styles.ideaRow}>
                    <View style={[styles.dot, { backgroundColor: DOMAIN_COLORS[g.domain] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={shared.title} numberOfLines={1}>{g.name}</Text>
                      <Text style={shared.muted}>{g.percent_meeting}% of {g.officials} officials meet the level · avg {g.average_level}/5</Text>
                    </View>
                    <PressableScale onPress={() => router.push({ pathname: "/studio", params: { competency: g.id } })}
                      style={styles.ideaBtn} accessibilityLabel={`Create a quiz for ${g.name}`}>
                      <MaterialIcons name="add" size={20} color={ACCENT} />
                    </PressableScale>
                  </View>
                ))}
                {d.uncovered_gaps.length === 0 && <Text style={shared.body}>Every major gap has a quiz. Nice work.</Text>}
              </Card>
            </View>
          </View>

          <SectionTitle right={<PressableScale onPress={() => router.push("/question-bank")}><Text style={styles.link}>All quizzes</Text></PressableScale>}>
            Your quizzes
          </SectionTitle>
          <Card>
            {d.quiz_stats.length === 0 && <Text style={shared.muted}>No quizzes yet. Upload a PDF, slide deck, document or video in the Question Studio.</Text>}
            {d.quiz_stats.slice(0, 5).map((q) => <QuizRow key={q.id} q={q} />)}
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: spacing.md },
  missRow: { gap: 4, paddingVertical: spacing.xs },
  ideaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  ideaBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: SPACES.trainer.tint, alignItems: "center", justifyContent: "center" },
  quizRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  quizIcon: { width: 38, height: 38, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  score: { ...typography.titleMd, minWidth: 44, textAlign: "right" },
  link: { ...typography.labelLg, color: ACCENT },
});
