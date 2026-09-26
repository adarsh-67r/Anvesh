import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { colors, typography, spacing, radii } from "../lib/theme";

type Todo = {
  id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
  carried_from: string | null;
};

type Suggestion = { title: string; skill_id: string };

export default function TodosScreen() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [carriedCount, setCarriedCount] = useState(0);
  const [showCarried, setShowCarried] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        api.get<Todo[]>("/api/todos"),
        api.get<Suggestion[]>("/api/todos/suggested"),
      ]);
      setTodos(t);
      setSuggestions(s);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      await api.put(`/api/todos/${todo.id}`, { is_done: !todo.is_done });
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, is_done: !t.is_done } : t)));
    } catch {}
  };

  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await api.post<Todo>("/api/todos", { title });
      setTodos((prev) => [created, ...prev]);
      setNewTitle("");
    } catch {}
  };

  const deleteTodo = async (todo: Todo) => {
    Alert.alert("Delete Task", `Remove "${todo.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.del(`/api/todos/${todo.id}`);
            setTodos((prev) => prev.filter((t) => t.id !== todo.id));
          } catch {}
        },
      },
    ]);
  };

  const carryForward = async () => {
    try {
      const res = await api.post<{ carried: number }>("/api/todos/carry-forward");
      setCarriedCount(res.carried);
      setShowCarried(true);
      await load();
    } catch {}
  };

  const addSuggestion = async (s: Suggestion) => {
    try {
      const created = await api.post<Todo>("/api/todos", { title: s.title });
      setTodos((prev) => [created, ...prev]);
      setSuggestions((prev) => prev.filter((x) => x.skill_id !== s.skill_id));
    } catch {}
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const pending = todos.filter((t) => !t.is_done);
  const done = todos.filter((t) => t.is_done);
  const overdue = todos.filter((t) => !t.is_done && t.due_date && t.due_date < today.toISOString().split("T")[0]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Study Checklist</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <View style={styles.progressBadge}>
          <Text style={styles.progressText}>{done.length}/{todos.length} Done</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Carry Forward Banner */}
        {overdue.length > 0 && (
          <View style={styles.carryBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.carryTitle}>
                {overdue.length} overdue task{overdue.length > 1 ? "s" : ""}
              </Text>
              <Text style={styles.carryDesc}>Carry them forward to today</Text>
            </View>
            <TouchableOpacity style={styles.carryBtn} onPress={carryForward} activeOpacity={0.7}>
              <Text style={styles.carryBtnText}>Carry Forward</Text>
              <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {carriedCount > 0 && showCarried && (
          <View style={styles.carriedAlert}>
            <MaterialIcons name="check-circle" size={18} color={colors.tertiary} />
            <Text style={styles.carriedText}>{carriedCount} task{carriedCount > 1 ? "s" : ""} carried over</Text>
            <TouchableOpacity onPress={() => setShowCarried(false)} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Add Todo */}
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Add a new task..."
            placeholderTextColor={colors.textMuted}
            value={newTitle}
            onChangeText={setNewTitle}
            onSubmitEditing={addTodo}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addBtn, !newTitle.trim() && { opacity: 0.5 }]}
            onPress={addTodo}
            disabled={!newTitle.trim()}
            activeOpacity={0.7}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Pending Todos */}
        {pending.length > 0 && <Text style={styles.sectionLabel}>Pending</Text>}
        {pending.map((todo) => (
          <TouchableOpacity
            key={todo.id}
            style={styles.todoItem}
            onPress={() => toggleTodo(todo)}
            onLongPress={() => deleteTodo(todo)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="radio-button-unchecked" size={22} color={colors.textMuted} />
            <Text style={styles.todoText} numberOfLines={2}>{todo.title}</Text>
            {todo.due_date && (
              <View style={styles.dueBadge}>
                <Text style={styles.dueText}>{todo.due_date}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Completed */}
        {done.length > 0 && <Text style={styles.sectionLabel}>Completed</Text>}
        {done.map((todo) => (
          <TouchableOpacity
            key={todo.id}
            style={styles.todoItem}
            onPress={() => toggleTodo(todo)}
            onLongPress={() => deleteTodo(todo)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="check-circle" size={22} color={colors.tertiary} />
            <Text style={[styles.todoText, styles.todoDone]} numberOfLines={2}>{todo.title}</Text>
          </TouchableOpacity>
        ))}

        {/* AI Suggestions */}
        {suggestions.length > 0 && (
          <>
            <View style={styles.suggestHeader}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />
              <Text style={styles.sectionLabel}>AI Suggestions</Text>
            </View>
            {suggestions.map((s) => (
              <View key={s.skill_id} style={styles.suggestCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestTitle}>{s.title}</Text>
                  <Text style={styles.suggestMeta}>From knowledge graph</Text>
                </View>
                <TouchableOpacity
                  style={styles.suggestBtn}
                  onPress={() => addSuggestion(s)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add" size={16} color={colors.primary} />
                  <Text style={styles.suggestBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {todos.length === 0 && suggestions.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="task-alt" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tasks yet. Add one above!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceWhite,
  },
  title: { ...typography.headlineSm, color: colors.text },
  dateText: { ...typography.bodySm, color: colors.textSecondary },
  progressBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  progressText: { ...typography.labelMd, color: colors.primary },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  carryBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.errorLight,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "#FFCDC8",
  },
  carryTitle: { ...typography.titleMd, color: colors.error },
  carryDesc: { ...typography.bodySm, color: colors.textSecondary },
  carryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceWhite,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  carryBtnText: { ...typography.labelMd, color: colors.primary },
  carriedAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.tertiaryLight,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  carriedText: { ...typography.bodySm, color: colors.tertiaryDark, flex: 1 },
  addRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  addInput: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceWhite,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.text,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionLabel: { ...typography.labelLg, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todoText: { ...typography.bodyMd, color: colors.text, flex: 1 },
  todoDone: { textDecorationLine: "line-through", color: colors.textMuted },
  dueBadge: {
    backgroundColor: colors.locked,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  dueText: { ...typography.labelSm, color: colors.textSecondary },
  suggestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  suggestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "#D4D1FA",
  },
  suggestTitle: { ...typography.titleMd, color: colors.text },
  suggestMeta: { ...typography.bodySm, color: colors.textSecondary },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceWhite,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestBtnText: { ...typography.labelMd, color: colors.primary },
  emptyState: { alignItems: "center", paddingTop: 60, gap: spacing.sm },
  emptyText: { ...typography.bodyMd, color: colors.textMuted },
});
