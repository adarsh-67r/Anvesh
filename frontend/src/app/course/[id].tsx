import { useCallback, useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api , errorDetail } from "../../lib/api";
import { SOURCE_LABEL, getFramework, type Course } from "../../lib/skills";
import { colors, spacing } from "../../lib/theme";
import { Badge, Button, Card, Page, SampleNote, SectionTitle, shared } from "../../components/Skill";
import { ProgressBar, Skeleton } from "../../components/Motion";

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Course | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getFramework().then((f) => setNames(Object.fromEntries(f.competencies.map((x) => [x.id, x.name])))).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    const all = await api.get<Course[]>("/api/courses").catch(() => []);
    setC(all.find((x) => x.id === id) ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (fn: () => Promise<Course>) => {
    setBusy(true);
    setError("");
    try { setC(await fn()); } catch (e) { setError(errorDetail(e, "Something went wrong.")); } finally { setBusy(false); }
  };
  const enc = encodeURIComponent(id ?? "");
  const e = c?.enrolment;

  return (
    <Page title={c ? SOURCE_LABEL[c.source] : "Course"} subtitle={c?.programme}>
      {!c && <Skeleton height={220} />}
      {c && (
        <>
          <Card>
            <View style={[shared.row, { flexWrap: "wrap" }]}>
              <Badge label={SOURCE_LABEL[c.source]} tint={c.source === "igot" ? "#D97706" : colors.primary} />
              <Badge label={`${c.duration_hours} HOURS`} />
              <Badge label={c.mode.toUpperCase()} />
              <Badge label={`TO LEVEL ${c.level}`} tint={colors.secondaryDark} />
            </View>
            <Text style={[shared.title, { fontSize: 20, lineHeight: 28 }]}>{c.title}</Text>
            <Text style={shared.muted}>{c.provider}</Text>
            <Text style={shared.body}>{c.description}</Text>
          </Card>

          <SectionTitle>Builds these competencies</SectionTitle>
          <View style={shared.wrap}>
            {c.competencies.map((x) => <Badge key={x} label={names[x] ?? x} tint={colors.secondaryDark} />)}
          </View>

          <SectionTitle>Your progress</SectionTitle>
          <Card>
            {!e && (
              <>
                <Text style={shared.body}>Enrol to track this course on your learning path.</Text>
                <Button label="Enrol" icon="add" busy={busy} onPress={() => act(() => api.post<Course>(`/api/courses/${enc}/enrol`))} />
              </>
            )}
            {e && e.status !== "completed" && (
              <>
                <ProgressBar value={e.progress / 100} />
                <Text style={shared.muted}>{e.progress}% done. Progress syncs from {SOURCE_LABEL[c.source]}; you can also update it here.</Text>
                <View style={shared.wrap}>
                  {[25, 50, 75, 100].filter((p) => p > e.progress).map((p) => (
                    <Button key={p} label={`${p}%`} kind="secondary" disabled={busy}
                      onPress={() => act(() => api.post<Course>(`/api/courses/${enc}/progress`, { progress: p }))} />
                  ))}
                </View>
                <View style={{ height: spacing.sm }} />
                <Text style={shared.body}>Finish with a short completion quiz (70% to pass). Passing updates your competency levels.</Text>
                <Button label="Take completion quiz" icon="quiz" onPress={() => router.push({ pathname: "/assess/[id]", params: { id: "course", course: c.id } })} />
              </>
            )}
            {e?.status === "completed" && (
              <Text style={[shared.title, { color: colors.tertiaryDark }]}>Completed{e.score != null ? ` · quiz score ${Math.round(e.score)}%` : ""}</Text>
            )}
            {c.url ? <Button label="Open course" icon="open-in-new" kind="secondary" onPress={() => Linking.openURL(c.url!)} /> : null}
            {error ? <Text style={shared.error}>{error}</Text> : null}
          </Card>
          {c.sample && <SampleNote />}
        </>
      )}
    </Page>
  );
}
