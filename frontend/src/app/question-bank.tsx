import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { getFramework, type AssessmentSummary } from "../lib/skills";
import { SPACES } from "../lib/workspace";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Button, Card, Chip, Empty, Page, shared } from "../components/Skill";
import { PressableScale, Skeleton } from "../components/Motion";
import { QuizRow, type TrainerDash } from "../components/TrainerHome";

const ACCENT = SPACES.trainer.accent;

export default function QuestionBank() {
  const [stats, setStats] = useState<TrainerDash["quiz_stats"] | null>(null);
  const [meta, setMeta] = useState<Record<string, AssessmentSummary>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [comp, setComp] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    getFramework().then((f) => setNames(Object.fromEntries(f.competencies.map((c) => [c.id, c.name])))).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    const [d, list] = await Promise.all([
      api.get<TrainerDash>("/api/dashboard/trainer").catch(() => null),
      api.get<AssessmentSummary[]>("/api/assessments").catch(() => []),
    ]);
    setMeta(Object.fromEntries(list.map((a) => [a.id, a])));
    setStats(d?.quiz_stats ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const used = useMemo(() => [...new Set((stats ?? []).flatMap((s) => meta[s.id]?.competency_ids ?? []))], [stats, meta]);
  const shown = (stats ?? []).filter((s) =>
    (status === "all" || (status === "published") === s.published) &&
    (!comp || meta[s.id]?.competency_ids.includes(comp)) &&
    (!q || s.title.toLowerCase().includes(q.toLowerCase())));

  return (
    <Page title="Question Bank" subtitle="Every quiz you have built, with how learners did"
      right={<Button label="New" icon="add" accent={ACCENT} onPress={() => router.push("/studio")} />}>
      <View style={styles.search}>
        <MaterialIcons name="search" size={20} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search quizzes" placeholderTextColor={colors.textMuted} style={styles.input} />
      </View>
      <View style={shared.wrap}>
        {(["all", "published", "draft"] as const).map((k) => (
          <Chip key={k} label={k === "all" ? "All" : k === "published" ? "Published" : "Drafts"} active={status === k} onPress={() => setStatus(k)} />
        ))}
      </View>
      {used.length > 1 && (
        <View style={shared.wrap}>
          {used.map((c) => <Chip key={c} icon="label-outline" label={names[c] ?? c} active={comp === c} onPress={() => setComp(comp === c ? null : c)} />)}
        </View>
      )}
      {!stats && <Skeleton height={220} />}
      {stats && shown.length === 0 && (
        <Empty icon="inventory-2" title={stats.length ? "No quizzes match" : "No quizzes yet"}
          body={stats.length ? "Try a different filter." : "Upload a PDF, slide deck, document or YouTube video in the Question Studio."} />
      )}
      {shown.length > 0 && (
        <Card>
          {shown.map((s) => (
            <View key={s.id} style={styles.row}>
              <View style={{ flex: 1 }}><QuizRow q={s} /></View>
              <PressableScale onPress={() => router.push({ pathname: "/studio/[id]", params: { id: s.id } })} style={styles.edit}
                accessibilityLabel={`Edit ${s.title}`}>
                <MaterialIcons name="edit" size={18} color={ACCENT} />
              </PressableScale>
            </View>
          ))}
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.full, paddingHorizontal: spacing.md },
  input: { flex: 1, ...typography.bodyMd, color: colors.text, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.locked },
  edit: { width: 36, height: 36, borderRadius: 18, backgroundColor: SPACES.trainer.tint, alignItems: "center", justifyContent: "center" },
});
