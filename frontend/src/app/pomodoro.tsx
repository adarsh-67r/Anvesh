import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api, StudyStatus } from "../lib/api";
import { colors, typography, spacing, radii } from "../lib/theme";

const FOCUS = 25 * 60;
const SHORT_BREAK = 5 * 60;
const LONG_BREAK = 15 * 60;

const DAILY_GOAL = 120;

export default function PomodoroScreen() {
  const [seconds, setSeconds] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState(1);
  const [mode, setMode] = useState<"focus" | "short" | "long">("focus");
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const studyMinutes = status?.study_minutes ?? 0;

  const refreshStatus = useCallback(() => {
    api.get<StudyStatus>("/api/game/status").then(setStatus).catch(() => {});
  }, []);
  useFocusEffect(refreshStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            setRunning(false);
            if (mode === "focus") {
              setStatus((st) => st && { ...st, study_minutes: st.study_minutes + 25, unlocked: st.study_minutes + 25 >= st.required_minutes });
              api.post("/api/recommend/events", { event_type: "study_session", skill_id: "general", context: { minutes: 25 } })
                .then(refreshStatus)
                .catch(() => {});
              if (session % 4 === 0) {
                setMode("long");
                return LONG_BREAK;
              }
              setMode("short");
              return SHORT_BREAK;
            }
            setSession((n) => n + 1);
            setMode("focus");
            return FOCUS;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, session, refreshStatus]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  const reset = () => {
    setRunning(false);
    setMode("focus");
    setSeconds(FOCUS);
    setSession(1);
  };

  const skip = () => {
    setRunning(false);
    if (mode === "focus") {
      if (session % 4 === 0) {
        setMode("long");
        setSeconds(LONG_BREAK);
      } else {
        setMode("short");
        setSeconds(SHORT_BREAK);
      }
    } else {
      setSession((n) => n + 1);
      setMode("focus");
      setSeconds(FOCUS);
    }
  };

  const modeLabel = mode === "focus" ? "Focus" : mode === "short" ? "Short Break" : "Long Break";
  const modeColor = mode === "focus" ? colors.primary : mode === "short" ? colors.secondary : colors.tertiary;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Pomodoro Timer</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.modeChip, { backgroundColor: modeColor + "20" }]}>
          <Text style={[styles.modeText, { color: modeColor }]}>{modeLabel}</Text>
        </View>

        <Text style={[styles.timer, { color: modeColor }]}>
          {pad(mins)}:{pad(secs)}
        </Text>

        <Text style={styles.sessionText}>Session {session} of 4</Text>
        <Text style={styles.scheduleText}>25m Focus • 5m Short • 15m Long</Text>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={reset}>
            <MaterialIcons name="replay" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: modeColor }]}
            onPress={() => setRunning(!running)}
          >
            <MaterialIcons name={running ? "pause" : "play-arrow"} size={36} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={skip}>
            <MaterialIcons name="skip-next" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.studyCard}>
          <View style={styles.studyHeader}>
            <MaterialIcons name="insights" size={18} color={colors.primary} />
            <Text style={styles.studyLabel}>{"Today's Study Time"}</Text>
          </View>
          <Text style={styles.studyValue}>
            {Math.floor(studyMinutes / 60)}h {studyMinutes % 60}m
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, (studyMinutes / DAILY_GOAL) * 100)}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{studyMinutes} / {DAILY_GOAL} min goal</Text>
          {status && (
            <View style={styles.unlockRow}>
              <MaterialIcons
                name={status.unlocked ? "lock-open" : "lock"}
                size={16}
                color={status.unlocked ? colors.tertiaryDark : colors.textSecondary}
              />
              <Text style={[styles.progressLabel, status.unlocked && { color: colors.tertiaryDark }]}>
                {status.unlocked
                  ? "Quiz games unlocked"
                  : `${status.required_minutes - status.study_minutes} more focus minutes to unlock quiz games`}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceWhite,
  },
  topTitle: { ...typography.titleMd, color: colors.text },
  content: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modeChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radii.full, marginBottom: spacing.lg },
  modeText: { ...typography.labelLg },
  timer: { fontSize: 72, lineHeight: 80, fontFamily: "PlusJakartaSans_800ExtraBold", letterSpacing: -2 },
  sessionText: { ...typography.titleMd, color: colors.textSecondary, marginTop: spacing.md },
  scheduleText: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.xs },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceWhite,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  studyCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  studyHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  studyLabel: { ...typography.titleMd, color: colors.text },
  studyValue: { ...typography.headlineMd, color: colors.primary, marginBottom: spacing.sm },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: radii.full, overflow: "hidden" as const },
  progressFill: { height: 8, backgroundColor: colors.primary, borderRadius: radii.full },
  progressLabel: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" as const },
  unlockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
});
