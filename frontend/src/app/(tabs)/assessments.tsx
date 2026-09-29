import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getFramework, type AssessmentSummary } from "../../lib/skills";
import { colors } from "../../lib/theme";
import { Badge, Button, Card, Empty, Page, SectionTitle, shared } from "../../components/Skill";
import { PressableScale, Skeleton } from "../../components/Motion";

export default function AssessmentsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AssessmentSummary[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getFramework().then((f) => setNames(Object.fromEntries(f.competencies.map((c) => [c.id, c.name])))).catch(() => {});
  }, []);
  const load = useCallback(() => api.get<AssessmentSummary[]>("/api/assessments").then(setItems).catch(() => setItems([])), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const quizzes = items?.filter((a) => a.published) ?? [];
  return (
    <Page title="Assessments" subtitle="Quizzes from your trainers, with instant feedback"
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} refreshing={refreshing}>
      <Card>
        <View style={shared.row}>
          <MaterialIcons name="insights" size={22} color={colors.primary} />
          <Text style={[shared.title, { flex: 1 }]}>Competency diagnostics</Text>
        </View>
        <Text style={shared.muted}>A short adaptive check for any competency. Your level updates with every answer.</Text>
        <View style={{ alignSelf: "flex-start" }}>
          <Button label="Choose a competency" kind="secondary" icon="arrow-forward" onPress={() => router.push("/competencies")} />
        </View>
      </Card>

      <SectionTitle>Published quizzes</SectionTitle>
      {items === null && <Skeleton height={120} />}
      {items && quizzes.length === 0 && (
        <Empty icon="quiz" title="No quizzes yet"
          body={user?.role === "learner" ? "Quizzes your trainers publish will appear here." : "Create one from learning material in Question Studio."}
          action={user?.role !== "learner" ? <Button label="Open Question Studio" onPress={() => router.push("/studio")} /> : undefined} />
      )}
      {quizzes.map((a, i) => (
        <PressableScale key={a.id} onPress={() => router.push({ pathname: "/assess/[id]", params: { id: a.id } })} accessibilityRole="button">
          <Card index={i}>
            <Text style={shared.title}>{a.title}</Text>
            <View style={shared.wrap}>
              <Badge label={`${a.questions} QUESTIONS`} />
              {a.competency_ids.map((c) => <Badge key={c} label={names[c] ?? c} tint={colors.secondaryDark} />)}
              {a.best_percent != null && <Badge label={`BEST ${Math.round(a.best_percent)}%`} tint={colors.tertiaryDark} />}
            </View>
          </Card>
        </PressableScale>
      ))}
    </Page>
  );
}
