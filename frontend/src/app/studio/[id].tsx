import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api , errorDetail } from "../../lib/api";
import { getFramework, type Assessment, type Question } from "../../lib/skills";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { Badge, Button, Card, Page, shared } from "../../components/Skill";
import { Skeleton } from "../../components/Motion";

function Editor({ assessmentId, q, onSaved, onCancel }: { assessmentId: string; q: Question; onSaved: (q: Question) => void; onCancel: () => void }) {
  const [text, setText] = useState(q.text);
  const [options, setOptions] = useState(q.options);
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [explanation, setExplanation] = useState(q.explanation ?? "");
  const [error, setError] = useState("");
  const save = async () => {
    try {
      onSaved(await api.put<Question>(`/api/assessments/${assessmentId}/questions/${q.id}`, { text, options, answer, explanation }));
    } catch (e) {
      setError(errorDetail(e, "Couldn't save."));
    }
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput value={text} onChangeText={setText} multiline style={[styles.input, { minHeight: 60 }]} />
      {options.map((o, i) => (
        <View key={i} style={shared.row}>
          <TouchableOpacity onPress={() => setAnswer(o)} accessibilityLabel="Mark as correct answer">
            <MaterialIcons name={answer === o ? "check-circle" : "radio-button-unchecked"} size={22} color={answer === o ? colors.tertiary : colors.textMuted} />
          </TouchableOpacity>
          <TextInput value={o} style={[styles.input, { flex: 1 }]}
            onChangeText={(v) => { setOptions((xs) => xs.map((x, j) => (j === i ? v : x))); if (answer === o) setAnswer(v); }} />
        </View>
      ))}
      <TextInput value={explanation} onChangeText={setExplanation} placeholder="Explanation" multiline style={[styles.input, { minHeight: 50 }]} />
      {error ? <Text style={shared.error}>{error}</Text> : null}
      <View style={shared.row}>
        <Button label="Save" icon="check" onPress={save} />
        <Button label="Cancel" kind="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [a, setA] = useState<Assessment | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getFramework().then((f) => setNames(Object.fromEntries(f.competencies.map((c) => [c.id, c.name])))).catch(() => {});
  }, []);
  const load = useCallback(() => api.get<Assessment>(`/api/assessments/${id}`).then(setA).catch(() => {}), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const publish = async (published: boolean) => {
    setBusy(true);
    await api.patch(`/api/assessments/${id}`, { published }).catch(() => {});
    await load();
    setBusy(false);
  };
  const remove = async (qid: string) => {
    await api.del(`/api/assessments/${id}/questions/${qid}`).catch(() => {});
    load();
  };

  return (
    <Page title="Review quiz" subtitle={a?.title}>
      {!a && <Skeleton height={240} />}
      {a && (
        <Card>
          <View style={[shared.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
            <Text style={shared.title}>{a.questions.length} questions</Text>
            <Badge label={a.published ? "PUBLISHED" : "DRAFT"} tint={a.published ? colors.tertiaryDark : colors.secondaryDark} />
          </View>
          <Text style={shared.muted}>
            {a.published ? "Learners can take this quiz now. Unpublish to make changes privately."
              : "Check each question, fix anything off, then publish it to learners."}
          </Text>
          <View style={shared.wrap}>
            <Button label={a.published ? "Unpublish" : "Publish to learners"} icon={a.published ? "visibility-off" : "publish"}
              kind={a.published ? "secondary" : "primary"} busy={busy} onPress={() => publish(!a.published)} />
            <Button label="Try it" icon="play-arrow" kind="secondary" onPress={() => router.push({ pathname: "/assess/[id]", params: { id: a.id } })} />
          </View>
        </Card>
      )}
      {a?.questions.map((q, i) => (
        <Card key={q.id} index={i}>
          {editing === q.id ? (
            <Editor assessmentId={a.id} q={q} onCancel={() => setEditing(null)}
              onSaved={(nq) => { setA({ ...a, questions: a.questions.map((x) => (x.id === nq.id ? nq : x)) }); setEditing(null); }} />
          ) : (
            <>
              <View style={[shared.row, { flexWrap: "wrap" }]}>
                <Text style={shared.muted}>Q{i + 1}</Text>
                {q.source_ref ? <Badge label={q.source_ref.toUpperCase()} /> : null}
                {q.competency_id ? <Badge label={names[q.competency_id] ?? q.competency_id} tint={colors.secondaryDark} /> : null}
                <Badge label={["", "RECALL", "UNDERSTANDING", "APPLICATION"][q.difficulty] ?? ""} tint={colors.primary} />
              </View>
              <Text style={shared.title}>{q.text}</Text>
              {q.options.map((o) => (
                <View key={o} style={shared.row}>
                  <MaterialIcons name={o === q.answer ? "check-circle" : "radio-button-unchecked"} size={18} color={o === q.answer ? colors.tertiary : colors.textMuted} />
                  <Text style={[shared.body, o === q.answer && { color: colors.tertiaryDark }]}>{o}</Text>
                </View>
              ))}
              {q.explanation ? <Text style={shared.muted}>{q.explanation}</Text> : null}
              <View style={shared.row}>
                <Button label="Edit" icon="edit" kind="secondary" onPress={() => setEditing(q.id)} />
                <Button label="Delete" icon="delete-outline" kind="danger" onPress={() => remove(q.id)} />
              </View>
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  input: { ...typography.bodyMd, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface },
});
