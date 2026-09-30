import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { SOURCE_LABEL, getFramework, type Competency, type Course } from "../lib/skills";
import { SPACES } from "../lib/workspace";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Badge, Button, Card, Chip, Page, SampleNote, SectionTitle, shared } from "../components/Skill";
import { PressableScale, Skeleton } from "../components/Motion";

const ACCENT = SPACES.admin.accent;

export default function CatalogueAdmin() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [comps, setComps] = useState<Competency[]>([]);
  const [source, setSource] = useState<"all" | "igot" | "nssta">("all");
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState("");

  useEffect(() => { getFramework().then((f) => setComps(f.competencies)).catch(() => {}); }, []);
  const load = useCallback(() => api.get<Course[]>("/api/courses").then(setCourses).catch(() => setCourses([])), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sync = async () => {
    setSyncing("Syncing…");
    const r = await api.post<{ synced: Record<string, number> }>("/api/courses/sync").catch(() => null);
    setSyncing(r ? `Synced ${Object.entries(r.synced).map(([k, v]) => `${v} ${SOURCE_LABEL[k as "igot" | "nssta"] ?? k}`).join(", ")} courses` : "Sync failed");
    if (r) load();
  };

  const all = courses ?? [];
  const count = (s: "igot" | "nssta") => all.filter((c) => c.source === s).length;
  const covered = new Set(all.flatMap((c) => c.competencies));
  const uncovered = comps.filter((c) => !covered.has(c.id));
  const names = Object.fromEntries(comps.map((c) => [c.id, c.name]));
  const shown = all.filter((c) => (source === "all" || c.source === source) &&
    (!q || `${c.title} ${c.programme} ${c.provider}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <Page title="Course Catalogue" subtitle="Training sources that learning paths are built from">
      <View style={styles.connectors}>
        {(["igot", "nssta"] as const).map((s) => (
          <Card key={s} style={{ flex: 1, minWidth: 240 }}>
            <View style={shared.row}>
              <View style={[styles.icon, { backgroundColor: (s === "igot" ? "#D97706" : colors.primary) + "1A" }]}>
                <MaterialIcons name={s === "igot" ? "account-balance" : "school"} size={20} color={s === "igot" ? "#D97706" : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={shared.title}>{SOURCE_LABEL[s]}</Text>
                <Text style={shared.muted}>{courses ? `${count(s)} courses` : "…"} · connector ready</Text>
              </View>
              <Badge label="SAMPLE DATA" tint={colors.secondaryDark} />
            </View>
          </Card>
        ))}
      </View>
      <SampleNote />
      <View style={[shared.row, { flexWrap: "wrap" }]}>
        <Button label="Sync catalogue" icon="sync" accent={ACCENT} onPress={sync} busy={syncing === "Syncing…"} />
        {syncing && syncing !== "Syncing…" ? <Text style={shared.muted}>{syncing}</Text> : null}
      </View>

      {uncovered.length > 0 && (
        <>
          <SectionTitle>Competencies with no course</SectionTitle>
          <Card>
            <Text style={shared.muted}>No catalogue course builds these yet. Commission one, or ask trainers to publish quizzes for them.</Text>
            <View style={shared.wrap}>{uncovered.map((c) => <Badge key={c.id} label={c.name.toUpperCase()} tint={colors.error} />)}</View>
          </Card>
        </>
      )}

      <SectionTitle>Courses</SectionTitle>
      <View style={styles.search}>
        <MaterialIcons name="search" size={20} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search courses" placeholderTextColor={colors.textMuted} style={styles.input} />
      </View>
      <View style={shared.wrap}>
        <Chip label="All" active={source === "all"} onPress={() => setSource("all")} />
        <Chip label="iGOT Karmayogi" active={source === "igot"} onPress={() => setSource("igot")} />
        <Chip label="NSSTA" active={source === "nssta"} onPress={() => setSource("nssta")} />
      </View>
      {!courses && <Skeleton height={200} />}
      {courses && (
        <Card>
          {shown.map((c) => (
            <PressableScale key={c.id} onPress={() => router.push({ pathname: "/course/[id]", params: { id: c.id } })}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={shared.title} numberOfLines={1}>{c.title}</Text>
                  <Text style={shared.muted} numberOfLines={1}>
                    {SOURCE_LABEL[c.source]} · {c.duration_hours} h · {c.mode} · builds {c.competencies.map((x) => names[x] ?? x).join(", ")}
                  </Text>
                </View>
                <Badge label={`LEVEL ${c.level}`} tint={ACCENT} />
              </View>
            </PressableScale>
          ))}
          {shown.length === 0 && <Text style={shared.muted}>No courses match.</Text>}
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  connectors: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  icon: { width: 38, height: 38, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.full, paddingHorizontal: spacing.md },
  input: { flex: 1, ...typography.bodyMd, color: colors.text, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.locked },
});
