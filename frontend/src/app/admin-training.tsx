import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useOrg } from "../lib/org";
import { SOURCE_LABEL } from "../lib/skills";
import { colors, spacing, typography } from "../lib/theme";
import { Badge, Card, Chip, Empty, Page, SectionTitle, Stat, shared } from "../components/Skill";
import { Skeleton } from "../components/Motion";
import { scoreColor } from "../components/TrainerHome";

export default function TrainingEffectiveness() {
  const { org, error, reload } = useOrg();
  const [source, setSource] = useState<"all" | "igot" | "nssta">("all");
  const [refreshing, setRefreshing] = useState(false);

  const rows = (org?.training_effectiveness ?? []).filter((t) => source === "all" || t.source === source);
  const scored = rows.filter((t) => t.average_score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((a, t) => a + (t.average_score ?? 0), 0) / scored.length) : null;

  return (
    <Page title="Training Effectiveness" subtitle="Enrolment, completion and assessed outcomes per course"
      onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} refreshing={refreshing}>
      {!org && !error && <Skeleton height={220} />}
      {error && <Empty icon="lock" title="Couldn't load training analytics" body="This view is for administrators." />}
      {org && (
        <>
          <View style={shared.wrap}>
            <Stat label="Enrolments" value={String(org.enrolments)} icon="how-to-reg" tint={colors.secondary} />
            <Stat label="Completion rate" value={`${org.enrolments ? Math.round((100 * org.completions) / org.enrolments) : 0}%`} icon="task-alt" tint={colors.tertiary} />
            <Stat label="Avg completion score" value={avgScore == null ? "–" : `${avgScore}%`} icon="grading" tint={scoreColor(avgScore)} />
            <Stat label="Readiness lift if all finish" value={`+${org.projected_readiness - org.average_readiness} pts`} icon="trending-up" tint="#D97706" />
          </View>

          <SectionTitle>Courses</SectionTitle>
          <View style={shared.wrap}>
            <Chip label="All providers" active={source === "all"} onPress={() => setSource("all")} />
            <Chip label="iGOT Karmayogi" active={source === "igot"} onPress={() => setSource("igot")} />
            <Chip label="NSSTA" active={source === "nssta"} onPress={() => setSource("nssta")} />
          </View>
          <Card>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.cell, { flex: 3, textAlign: "left" }]}>Course</Text>
              <Text style={styles.cell}>Enrolled</Text>
              <Text style={styles.cell}>Completed</Text>
              <Text style={styles.cell}>Avg score</Text>
            </View>
            {rows.map((t) => (
              <View key={t.id} style={styles.tr}>
                <View style={{ flex: 3, gap: 4 }}>
                  <Text style={shared.body} numberOfLines={2}>{t.title}</Text>
                  <Badge label={SOURCE_LABEL[t.source]} tint={t.source === "igot" ? "#D97706" : colors.primary} />
                </View>
                <Text style={styles.cell}>{t.enrolled}</Text>
                <View style={{ flex: 1, alignItems: "flex-end", gap: 4 }}>
                  <Text style={styles.cellText}>{t.completion_rate}%</Text>
                  <View style={styles.track}><View style={[styles.fill, { width: `${t.completion_rate}%` }]} /></View>
                </View>
                <Text style={[styles.cell, { color: scoreColor(t.average_score) }]}>{t.average_score == null ? "–" : `${t.average_score}%`}</Text>
              </View>
            ))}
            {rows.length === 0 && <Text style={shared.muted}>No enrolments yet.</Text>}
            <Text style={shared.muted}>A course counts as completed when the official passes its end-of-course quiz (70%+); every answer also updates their competency levels.</Text>
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  th: { borderTopWidth: 0, paddingTop: 0 },
  cell: { ...typography.bodySm, color: colors.textSecondary, flex: 1, textAlign: "right" },
  cellText: { ...typography.bodySm, color: colors.textSecondary },
  track: { width: "100%", maxWidth: 80, height: 5, borderRadius: 3, backgroundColor: colors.locked, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.tertiary },
});
