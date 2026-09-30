import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api, pickFile, type PickedFile } from "../lib/api";
import { errorDetail } from "../lib/api";
import { getFramework, type Competency } from "../lib/skills";
import { SPACES } from "../lib/workspace";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Badge, Button, Card, Chip, Empty, Page, SectionTitle, shared } from "../components/Skill";
import { PressableScale } from "../components/Motion";

const DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_UPLOAD = 15 * 1024 * 1024;
const ACCENT = SPACES.trainer.accent;

type MaterialRow = {
  id: string; title: string; kind: string; filename: string; status: "processing" | "ready" | "failed"; error: string | null;
  competency_ids: string[]; sections: number; created_at: string;
  assessment: { id: string; published: boolean; questions: number };
};

export default function StudioScreen() {
  const [comps, setComps] = useState<Competency[]>([]);
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  // Opened from a "Quiz ideas" gap: preselect that competency.
  const { competency } = useLocalSearchParams<{ competency?: string }>();
  const [picked, setPicked] = useState<string[]>(competency ? [competency] : []);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getFramework().then((f) => setComps(f.competencies)).catch(() => {}); }, []);


  const load = useCallback(async () => {
    const r = await api.get<MaterialRow[]>("/api/materials").catch(() => null);
    if (r) setRows(r);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Poll while the AI is still generating any quiz.
  const generating = rows?.some((m) => m.status === "processing") ?? false;
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [generating, load]);

  const choose = async () => {
    let f: PickedFile | null = null;
    try { f = await pickFile(DOC_TYPES, MAX_UPLOAD); } catch (e) { return setError((e as Error).message); }
    if (!f) return;
    setFile(f);
    setUrl("");
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    setError("");
  };

  const submit = async () => {
    if (!file && !url.trim()) return setError("Attach a document or paste a YouTube video link.");
    if (!title.trim()) return setError("Give the material a title.");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("competency_ids", picked.join(","));
      form.append("count", String(count));
      if (file) {
        if (Platform.OS === "web" && file.file) form.append("file", file.file, file.name);
        else form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
      } else {
        form.append("url", url.trim());
      }
      await api.upload("/api/materials", form);
      setTitle(""); setUrl(""); setFile(null); setPicked([]);
      await load();
    } catch (e) {
      setError(errorDetail(e, "Upload failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Page title="Question Studio" subtitle="AI-generated MCQs from your learning material">
      <Card>
        <Text style={shared.title}>New quiz from material</Text>
        <Text style={shared.muted}>
          Upload a document (PDF, PPTX, DOCX, TXT up to 15 MB) or paste a YouTube lecture link. The AI writes questions from
          the content, each with an explanation and the page, slide or timestamp it came from. You review before publishing.
        </Text>
        <View style={shared.wrap}>
          <Button label={file ? "Change file" : "Choose file"} icon="upload-file" kind="secondary" accent={ACCENT} onPress={choose} />
          {file && (
            <View style={[shared.row, styles.fileChip]}>
              <MaterialIcons name="description" size={18} color={ACCENT} />
              <Text style={shared.body} numberOfLines={1}>{file.name}</Text>
              <PressableScale onPress={() => setFile(null)} accessibilityLabel="Remove file">
                <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              </PressableScale>
            </View>
          )}
        </View>
        {!file && (
          <TextInput value={url} onChangeText={setUrl} placeholder="…or paste a YouTube video link" placeholderTextColor={colors.textMuted}
            style={styles.input} autoCapitalize="none" />
        )}
        <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. CPI methodology refresher" placeholderTextColor={colors.textMuted}
          style={styles.input} />
        <Text style={styles.label}>Competencies this material builds</Text>
        <View style={shared.wrap}>
          {comps.map((c) => <Chip key={c.id} label={c.name} active={picked.includes(c.id)} onPress={() => toggle(c.id)} />)}
        </View>
        <Text style={styles.label}>Number of questions</Text>
        <View style={shared.wrap}>
          {[5, 10, 15, 20].map((n) => <Chip key={n} label={String(n)} active={count === n} onPress={() => setCount(n)} />)}
        </View>
        {error ? <Text style={shared.error}>{error}</Text> : null}
        <Button label="Generate questions" icon="auto-awesome" accent={ACCENT} busy={busy} onPress={submit} />
      </Card>

      <SectionTitle>Your materials</SectionTitle>
      {rows?.length === 0 && <Empty icon="folder-open" title="Nothing uploaded yet" body="Your uploaded materials and their quizzes appear here." />}
      {rows?.map((m, i) => (
        <PressableScale key={m.id} disabled={m.status !== "ready"}
          onPress={() => router.push({ pathname: "/studio/[id]", params: { id: m.assessment.id } })} accessibilityRole="button">
          <Card index={i}>
            <View style={[shared.row, { justifyContent: "space-between" }]}>
              <Text style={[shared.title, { flex: 1 }]} numberOfLines={1}>{m.title}</Text>
              <Badge
                label={m.status === "processing" ? "GENERATING…" : m.status === "failed" ? "FAILED" : m.assessment.published ? "PUBLISHED" : "DRAFT"}
                tint={m.status === "failed" ? colors.error : m.assessment.published ? colors.tertiaryDark : colors.secondaryDark}
              />
            </View>
            <Text style={shared.muted}>
              {m.kind.toUpperCase()}{m.filename ? ` · ${m.filename}` : ""}{m.status === "ready" ? ` · ${m.sections} sections read · ${m.assessment.questions} questions` : ""}
            </Text>
            {m.error ? <Text style={shared.error}>{m.error}</Text> : null}
            {m.assessment.published && (
              <PressableScale onPress={() => router.push({ pathname: "/results/[id]", params: { id: m.assessment.id } })} style={{ alignSelf: "flex-start" }}>
                <Text style={styles.link}>View learner results →</Text>
              </PressableScale>
            )}
          </Card>
        </PressableScale>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.labelLg, color: colors.text, marginTop: spacing.xs },
  input: { ...typography.bodyMd, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.surface },
  link: { ...typography.labelLg, color: ACCENT },
  fileChip: { backgroundColor: SPACES.trainer.tint, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: 8, maxWidth: 320 },
});
