import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { Link, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Skill = {
  skill_id: string;
  label: string;
  mastery_score: number;
  reason: string;
  videos: { id: string; title: string; url: string }[];
};

type Todo = {
  id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
};

type DropoutRisk = { risk_score: number; risk_level: string };

function getStudyMinutesToday(): number {
  try {
    const stored = JSON.parse(
      (Platform.OS === "web" ? localStorage.getItem("studyTime") : null) || "{}"
    );
    const today = new Date().toISOString().split("T")[0];
    return stored[today] || 0;
  } catch {
    return 0;
  }
}

export default function DashboardScreen() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [mastery, setMastery] = useState<{ mastery_score: number; is_mastered: boolean }[]>([]);
  const [dropout, setDropout] = useState<DropoutRisk | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, m, d] = await Promise.all([
        api.get<Skill[]>("/api/recommend/next?limit=3"),
        api.get<Todo[]>("/api/todos"),
        api.get<{ mastery_score: number; is_mastered: boolean }[]>("/api/recommend/mastery"),
        api.get<DropoutRisk>("/api/recommend/dropout-risk").catch(() => null),
      ]);
      setSkills(s);
      setTodos(t);
      setMastery(m);
      if (d) setDropout(d);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const overallMastery = mastery.length
    ? Math.round((mastery.reduce((a, b) => a + b.mastery_score, 0) / mastery.length) * 100)
    : 0;
  const masteredCount = mastery.filter((m) => m.is_mastered).length;
  const dueTodos = todos.filter((t) => !t.is_done).slice(0, 3);
  const doneCount = todos.filter((t) => t.is_done).length;
  const studyMins = getStudyMinutesToday();
  const studyGoal = 120;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      await api.put(`/api/todos/${todo.id}`, { is_done: !todo.is_done });
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, is_done: !t.is_done } : t))
      );
    } catch {}
  };

  const isLowRisk = !dropout || dropout.risk_level?.toLowerCase().includes("low");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Header with streak + XP badges */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.appName}>Anvesh</Text>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.streakBadge}>
              <MaterialIcons name="local-fire-department" size={14} color={colors.primary} />
              <Text style={styles.streakText}>Active</Text>
            </View>
            <View style={[styles.streakBadge, { backgroundColor: colors.tertiaryLight }]}>
              <MaterialIcons name="bolt" size={14} color={colors.tertiaryDark} />
              <Text style={[styles.streakText, { color: colors.tertiaryDark }]}>+75 XP</Text>
            </View>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overallMastery}%</Text>
            <Text style={styles.statLabel}>Mastery</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{masteredCount}</Text>
            <Text style={styles.statLabel}>Mastered</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todos.filter((t) => !t.is_done).length}</Text>
            <Text style={styles.statLabel}>Due Tasks</Text>
          </View>
        </View>

        {/* Dropout Risk */}
        {dropout && (
          <View style={[styles.riskCard, { borderColor: isLowRisk ? colors.tertiary : colors.error }]}>
            <MaterialIcons
              name={isLowRisk ? "verified-user" : "warning"}
              size={20}
              color={isLowRisk ? colors.tertiary : colors.error}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.riskLevel, { color: isLowRisk ? colors.tertiary : colors.error }]}>
                {dropout.risk_level} ({Math.round(dropout.risk_score * 100)}%)
              </Text>
              <Text style={styles.riskDesc}>
                {isLowRisk
                  ? "Consistent practice keeps your retention strong."
                  : "Try completing a few more study sessions this week."}
              </Text>
            </View>
          </View>
        )}

        {/* Recommended Skills */}
        <Text style={styles.sectionTitle}>Recommended Next</Text>
        {skills.map((skill) => (
          <Link href={`/skill/${skill.skill_id}`} key={skill.skill_id} asChild>
            <TouchableOpacity style={styles.skillCard} activeOpacity={0.7}>
              <View style={styles.skillHeader}>
                <MaterialIcons name="bolt" size={20} color={colors.secondary} />
                <Text style={styles.skillLabel} numberOfLines={1}>
                  {skill.label}
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.round(skill.mastery_score * 100)}%`,
                      backgroundColor:
                        skill.mastery_score >= 0.8 ? colors.tertiary : colors.secondary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.skillMeta}>
                {Math.round(skill.mastery_score * 100)}% mastery
              </Text>
            </TouchableOpacity>
          </Link>
        ))}

        {/* Today's Progress */}
        <Text style={styles.sectionTitle}>{"Today's Progress"}</Text>
        <View style={styles.progressCard}>
          <View style={styles.progressGrid}>
            <View style={styles.progressItem}>
              <MaterialIcons name="schedule" size={18} color={colors.primary} />
              <Text style={styles.progressValue}>
                {studyMins >= 60 ? `${Math.floor(studyMins / 60)}h ${studyMins % 60}m` : `${studyMins}m`}
              </Text>
              <Text style={styles.progressLabel}>Focused</Text>
            </View>
            <View style={styles.progressItem}>
              <MaterialIcons name="check-circle" size={18} color={colors.tertiary} />
              <Text style={styles.progressValue}>{doneCount}/{todos.length}</Text>
              <Text style={styles.progressLabel}>Tasks</Text>
            </View>
            <View style={styles.progressItem}>
              <MaterialIcons name="bolt" size={18} color="#D97706" />
              <Text style={styles.progressValue}>+75</Text>
              <Text style={styles.progressLabel}>XP</Text>
            </View>
          </View>
          <View style={styles.goalRow}>
            <Text style={styles.goalText}>Daily Target</Text>
            <Text style={[styles.goalText, { color: colors.primary }]}>
              {studyMins} / {studyGoal} min
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, Math.round((studyMins / studyGoal) * 100))}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </View>

        {/* Due Today */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Due Today</Text>
          <Link href="/todos" asChild>
            <TouchableOpacity hitSlop={8}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </Link>
        </View>
        {dueTodos.length === 0 && (
          <Text style={styles.emptyText}>All caught up!</Text>
        )}
        {dueTodos.map((todo) => (
          <TouchableOpacity
            key={todo.id}
            style={styles.todoItem}
            onPress={() => toggleTodo(todo)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={todo.is_done ? "check-circle" : "radio-button-unchecked"}
              size={22}
              color={todo.is_done ? colors.tertiary : colors.textMuted}
            />
            <Text
              style={[styles.todoText, todo.is_done && styles.todoDone]}
              numberOfLines={1}
            >
              {todo.title}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Link href="/add-content" asChild>
            <TouchableOpacity style={styles.quickBtn} activeOpacity={0.7}>
              <MaterialIcons name="video-library" size={20} color={colors.primary} />
              <Text style={styles.quickBtnText}>Add Content</Text>
            </TouchableOpacity>
          </Link>
          <Link href="/pomodoro" asChild>
            <TouchableOpacity style={styles.quickBtn} activeOpacity={0.7}>
              <MaterialIcons name="timer" size={20} color={colors.primary} />
              <Text style={styles.quickBtnText}>Pomodoro</Text>
            </TouchableOpacity>
          </Link>
          <Link href="/(tabs)/chat" asChild>
            <TouchableOpacity style={styles.quickBtn} activeOpacity={0.7}>
              <MaterialIcons name="smart-toy" size={20} color={colors.primary} />
              <Text style={styles.quickBtnText}>AI Tutor</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  greeting: { ...typography.bodyMd, color: colors.textSecondary },
  appName: { ...typography.headlineLg, color: colors.text },
  badgeRow: { flexDirection: "row", gap: 6 },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  streakText: { ...typography.labelMd, color: colors.primary },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { ...typography.headlineMd, color: colors.text },
  statLabel: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  riskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  riskLevel: { ...typography.labelMd },
  riskDesc: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { ...typography.headlineSm, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },
  viewAll: { ...typography.labelMd, color: colors.primary },
  skillCard: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  skillLabel: { ...typography.titleMd, color: colors.text, flex: 1 },
  progressBarBg: { height: 8, backgroundColor: colors.border, borderRadius: radii.full },
  progressBarFill: { height: 8, borderRadius: radii.full },
  skillMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs },
  progressCard: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  progressItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: 2,
  },
  progressValue: { ...typography.titleMd, color: colors.text },
  progressLabel: { ...typography.bodySm, color: colors.textSecondary },
  goalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  goalText: { ...typography.bodySm, color: colors.textSecondary },
  emptyText: { ...typography.bodyMd, color: colors.textMuted, marginBottom: spacing.sm },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todoText: { ...typography.bodyMd, color: colors.text, flex: 1 },
  todoDone: { textDecorationLine: "line-through", color: colors.textMuted },
  quickActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radii.lg,
    paddingVertical: 14,
  },
  quickBtnText: { ...typography.labelLg, color: colors.primary },
});
