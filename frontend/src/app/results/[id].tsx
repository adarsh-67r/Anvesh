import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import type { Question } from "../../lib/skills";
import { SPACES } from "../../lib/workspace";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { Badge, Button, Card, Empty, Page, SectionTitle, Stat, shared } from "../../components/Skill";
import { Skeleton } from "../../components/Motion";
import { scoreColor } from "../../components/TrainerHome";

type Results = {
  id: string; title: string; published: boolean; attempts: number; learners: number; average_score: number | null; pass_rate: number | null;
  questions: (Question & { responses: number; percent_correct: number | null; option_counts: number[] })[];
  recent: { name: string; score: number; total: number; percent: number; at: string }[];
};

const ACCENT = SPACES.trainer.accent;

function OptionBar({ label, count, total, correct, commonWrong }: { label: string; count: number; total: number; correct: boolean; commonWrong: boolean }) {
  const pct = total ? Math.round((100 * count) / total) : 0;
  const tint = correct ? colors.tertiary : commonWrong ? colors.error : colors.borderMuted;
  return (
    <View style={styles.opt}>
      <View style={[shared.row, { justifyContent: "space-between" }]}>
        <View style={[shared.row, { flex: 1 }]}>
          <MaterialIcons name={correct ? "check-circle" : "radio-button-unchecked"} size={16} color={correct ? colors.tertiary : colors.textMuted} />
          <Text style={[shared.body, { flex: 1 }, correct && { color: colors.tertiaryDark }]} numberOfLines={2}>{label}</Text>
        </View>
        <Text style={shared.muted}>{count} · {pct}%</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} /></View>
    </View>
  );
}

export default function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setR] = useState<Results | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => api.get<Results>(`/api/assessments/${id}/results`).then(setR).catch(() => setError(true)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Page title="Quiz results" subtitle={r?.title}
      right={r ? <Button label="Edit" icon="edit" kind="secondary" accent={ACCENT} onPress={() => router.push({ pathname: "/studio/[id]", params: { id: r.id } })} /> : undefined}>
      {!r && !error && <Skeleton height={240} />}
      {error && <Empty icon="lock" title="Couldn't load these results" body="Only the quiz's author can see its results." />}
      {r && (
        <>
          <View style={shared.wrap}>
            <Stat label="Attempts" value={String(r.attempts)} icon="how-to-reg" tint={ACCENT} />
            <Stat label="Officials" value={String(r.learners)} icon="groups" tint={colors.secondary} />
            <Stat label="Average score" value={r.average_score == null ? "–" : `${r.average_score}%`} icon="grading" tint={scoreColor(r.average_score)} />
            <Stat label="Pass rate (70%+)" value={r.pass_rate == null ? "–" : `${r.pass_rate}%`} icon="verified" tint={colors.tertiary} />
          </View>
          {!r.published && <Badge label="DRAFT · NOT VISIBLE TO LEARNERS YET" tint={colors.secondaryDark} />}

          <SectionTitle>Question by question</SectionTitle>
          {r.questions.map((q, i) => {
            const wrong = q.options.map((o, j) => (o === q.answer ? -1 : q.option_counts[j]));
            const top = Math.max(...wrong);
            return (
              <Card key={q.id} index={i}>
                <View style={[shared.row, { justifyContent: "space-between" }]}>
                  <Text style={shared.muted}>Q{i + 1}{q.source_ref ? ` · ${q.source_ref}` : ""}</Text>
                  <Text style={[styles.pct, { color: scoreColor(q.percent_correct) }]}>
                    {q.percent_correct == null ? "No answers yet" : `${q.percent_correct}% correct`}
                  </Text>
                </View>
                <Text style={shared.title}>{q.text}</Text>
                {q.options.map((o, j) => (
                  <OptionBar key={o} label={o} count={q.option_counts[j]} total={q.responses} correct={o === q.answer}
                    commonWrong={top > 0 && wrong[j] === top} />
                ))}
                {q.percent_correct != null && q.percent_correct < 50 && (
                  <View style={styles.tip}>
                    <MaterialIcons name="lightbulb-outline" size={16} color="#B45309" />
                    <Text style={styles.tipText}>Most officials miss this. Re-teach the concept, or check the wording and the distractors.</Text>
                  </View>
                )}
              </Card>
            );
          })}

          <SectionTitle>Recent attempts</SectionTitle>
          <Card>
            {r.recent.length === 0 && <Text style={shared.muted}>No one has taken this quiz yet.</Text>}
            {r.recent.map((a, i) => (
              <View key={i} style={styles.attempt}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{a.name.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={shared.body}>{a.name}</Text>
                  <Text style={shared.muted}>{new Date(a.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
                </View>
                <Text style={shared.muted}>{a.score}/{a.total}</Text>
                <Text style={[styles.pct, { color: scoreColor(a.percent), minWidth: 44, textAlign: "right" }]}>{a.percent}%</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  opt: { gap: 4, paddingVertical: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.locked, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  pct: { ...typography.labelLg },
  tip: { flexDirection: "row", gap: spacing.sm, backgroundColor: "#FEF3C7", borderRadius: radii.lg, padding: spacing.sm },
  tipText: { ...typography.bodySm, color: "#92400E", flex: 1 },
  attempt: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: SPACES.trainer.tint, alignItems: "center", justifyContent: "center" },
  avatarText: { ...typography.labelLg, color: ACCENT },
});
