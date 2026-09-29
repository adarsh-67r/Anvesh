import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { SOURCE_LABEL, getFramework, type Course } from "../../lib/skills";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { Badge, Card, Chip, Empty, Page, SampleNote, shared } from "../../components/Skill";
import { PressableScale, ProgressBar, Skeleton } from "../../components/Motion";

type Tab = "recommended" | "mine" | "catalogue";

export function CourseCard({ c, names, index = 0 }: { c: Course; names: Record<string, string>; index?: number }) {
  const e = c.enrolment;
  return (
    <PressableScale onPress={() => router.push({ pathname: "/course/[id]", params: { id: c.id } })} accessibilityRole="button">
      <Card index={index}>
        <View style={[shared.row, { flexWrap: "wrap" }]}>
          <Badge label={SOURCE_LABEL[c.source]} tint={c.source === "igot" ? "#D97706" : colors.primary} />
          <Text style={shared.muted}>{c.programme} · {c.duration_hours} h · {c.mode}</Text>
          {e?.status === "completed" && <Badge label="COMPLETED" tint={colors.tertiaryDark} />}
        </View>
        <Text style={shared.title}>{c.title}</Text>
        <Text style={shared.muted} numberOfLines={2}>{c.description}</Text>
        {c.reasons?.length ? (
          <View style={{ gap: 2 }}>
            {c.reasons.slice(0, 3).map((r) => (
              <View key={r} style={shared.row}>
                <MaterialIcons name="trending-up" size={16} color={colors.tertiaryDark} />
                <Text style={styles.reason}>{r}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={shared.wrap}>
            {c.competencies.map((id) => <Badge key={id} label={names[id] ?? id} tint={colors.secondaryDark} />)}
          </View>
        )}
        {e && e.status !== "completed" && (
          <View style={{ gap: 4 }}>
            <ProgressBar value={e.progress / 100} />
            <Text style={shared.muted}>{e.progress}% · complete the quiz to finish</Text>
          </View>
        )}
      </Card>
    </PressableScale>
  );
}

export default function CoursesScreen() {
  const [tab, setTab] = useState<Tab>("recommended");
  const [items, setItems] = useState<Course[] | null>(null);
  const [source, setSource] = useState<"" | "igot" | "nssta">("");
  const [q, setQ] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    getFramework().then((f) => setNames(Object.fromEntries(f.competencies.map((c) => [c.id, c.name])))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setItems(null);
    const path = tab === "recommended" ? "/api/courses/recommended?limit=12" : tab === "mine" ? "/api/courses/mine"
      : `/api/courses?${new URLSearchParams({ ...(source ? { source } : {}), ...(q.trim() ? { q: q.trim() } : {}) })}`;
    setItems(await api.get<Course[]>(path).catch(() => []));
  }, [tab, source, q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Page title="Learning Path" subtitle="iGOT Karmayogi courses and NSSTA programmes">
      <View style={shared.wrap}>
        <Chip label="Recommended for me" icon="auto-awesome" active={tab === "recommended"} onPress={() => setTab("recommended")} />
        <Chip label="My courses" icon="bookmark" active={tab === "mine"} onPress={() => setTab("mine")} />
        <Chip label="Catalogue" icon="library-books" active={tab === "catalogue"} onPress={() => setTab("catalogue")} />
      </View>

      {tab === "recommended" && (
        <Text style={shared.muted}>Ranked by how much each course closes your role’s competency gaps, foundations first.</Text>
      )}
      {tab === "catalogue" && (
        <Card>
          <View style={styles.search}>
            <MaterialIcons name="search" size={20} color={colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={load} placeholder="Search courses" placeholderTextColor={colors.textMuted}
              style={styles.searchInput} returnKeyType="search" />
          </View>
          <View style={shared.wrap}>
            <Chip label="All sources" active={!source} onPress={() => setSource("")} />
            <Chip label="iGOT Karmayogi" active={source === "igot"} onPress={() => setSource("igot")} />
            <Chip label="NSSTA" active={source === "nssta"} onPress={() => setSource("nssta")} />
          </View>
        </Card>
      )}

      {items === null && <Skeleton height={160} />}
      {items?.length === 0 && (
        <Empty
          icon={tab === "mine" ? "bookmark-border" : "check-circle"}
          title={tab === "mine" ? "No courses yet" : tab === "recommended" ? "Nothing to recommend" : "No courses match"}
          body={tab === "mine" ? "Enrol from your recommendations or the catalogue." : tab === "recommended"
            ? "Either your profile has no role yet, or you already meet every requirement." : "Try a different search."}
        />
      )}
      {items?.map((c, i) => <CourseCard key={c.id} c={c} names={names} index={i} />)}
      {items && items.length > 0 && <SampleNote />}
    </Page>
  );
}

const styles = StyleSheet.create({
  reason: { ...typography.bodySm, color: colors.tertiaryDark },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.full, paddingHorizontal: spacing.md },
  searchInput: { ...typography.bodyMd, color: colors.text, flex: 1, paddingVertical: 10 },
});
