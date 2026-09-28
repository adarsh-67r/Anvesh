import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, Modal, Alert, Platform, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api, StudyStatus } from "../lib/api";
import { Breathe, PressableScale, ProgressBar } from "../components/Motion";
import { colors, typography, spacing, radii } from "../lib/theme";
import { FocusGuard, type InstalledApp } from "../../modules/focus-guard";
import {
  useFocus, start, pause, stop, skip, tick, setKind, setTag, addTag, removeTag, updateSettings, setOnLogged,
  display, clock, phaseLabel, phaseSeconds, today, type Kind, type Settings,
} from "../lib/focus";
import { TRACKS, VOLUMES, useMusic, playTrack, setMusicVolume } from "../lib/focusMusic";

const DAILY_GOAL = 120;
const KINDS: { id: Kind; label: string }[] = [
  { id: "pomodoro", label: "Pomodoro" },
  { id: "timer", label: "Timer" },
  { id: "stopwatch", label: "Stopwatch" },
];

function Stepper({ label, value, unit, min, max, step = 1, onChange, disabled }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (v: number) => void; disabled: boolean;
}) {
  const btn = (delta: number, icon: "remove" | "add") => {
    const next = Math.min(max, Math.max(min, value + delta));
    return (
      <TouchableOpacity
        style={[styles.stepBtn, (disabled || next === value) && styles.dim]}
        disabled={disabled || next === value}
        onPress={() => onChange(next)}
        accessibilityLabel={`${icon === "add" ? "Increase" : "Decrease"} ${label}`}
      >
        <MaterialIcons name={icon} size={18} color={colors.primary} />
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      {btn(-step, "remove")}
      <Text style={styles.stepValue}>{value} {unit}</Text>
      {btn(step, "add")}
    </View>
  );
}

export default function FocusScreen() {
  const { session, settings, tags, log } = useFocus();
  const music = useMusic();
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const [newTag, setNewTag] = useState<string | null>(null);
  const [picker, setPicker] = useState<InstalledApp[] | null>(null);
  const [blocked, setBlocked] = useState<string[]>(() => FocusGuard?.getBlockedApps() ?? []);
  const [blockerOn, setBlockerOn] = useState(() => FocusGuard?.isBlockerEnabled() ?? false);

  const refreshStatus = useCallback(() => {
    api.get<StudyStatus>("/api/game/status").then(setStatus).catch(() => {});
    if (FocusGuard) setBlockerOn(FocusGuard.isBlockerEnabled());
  }, []);
  useFocusEffect(refreshStatus);
  useEffect(() => { setOnLogged(refreshStatus); return () => setOnLogged(null); }, [refreshStatus]);

  useEffect(() => {
    if (session.status !== "running") return;
    const id = setInterval(() => { setNow(Date.now()); tick(); }, 500);
    return () => clearInterval(id);
  }, [session.status]);

  const idle = session.status === "idle";
  const seconds = display(session, settings, now);
  const color = session.phase === "focus" ? colors.primary : session.phase === "short" ? colors.secondary : colors.tertiary;
  const studyMinutes = status?.study_minutes ?? 0;
  const byTag = Object.entries(
    log.filter((e) => e.day === today()).reduce<Record<string, number>>((acc, e) => {
      const k = e.tag ?? "Untagged";
      acc[k] = (acc[k] ?? 0) + e.minutes;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const onStart = () => {
    if (FocusGuard && !FocusGuard.hasNotificationPermission()) FocusGuard.requestNotificationPermission();
    start();
  };
  const set = (patch: Partial<Settings>) => updateSettings(patch);

  const toggleBlock = (on: boolean) => {
    set({ block: on });
    if (on && FocusGuard && !FocusGuard.isBlockerEnabled()) {
      Alert.alert(
        "Allow focus mode",
        "Android needs your permission once. In the next screen open \"Installed apps\" (or \"Downloaded apps\"), pick \"Anvesh focus mode\" and turn it on.",
        [{ text: "Not now", style: "cancel" }, { text: "Open settings", onPress: () => FocusGuard?.openBlockerSettings() }],
      );
    }
  };
  const openPicker = async () => {
    if (!FocusGuard) return;
    setPicker([]);
    setPicker(await FocusGuard.listApps().catch(() => []));
  };
  const toggleApp = (pkg: string) => {
    const next = blocked.includes(pkg) ? blocked.filter((p) => p !== pkg) : [...blocked, pkg];
    setBlocked(next);
    FocusGuard?.setBlockedApps(next);
  };
  const confirmRemoveTag = (t: string) =>
    Alert.alert(`Remove "${t}"?`, "Past sessions keep their tag.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeTag(t) },
    ]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Focus</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.segment}>
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k.id}
              style={[styles.segmentItem, session.kind === k.id && styles.segmentActive, !idle && session.kind !== k.id && styles.dim]}
              disabled={!idle}
              onPress={() => setKind(k.id)}
            >
              <Text style={[styles.segmentText, session.kind === k.id && styles.segmentTextActive]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dial}>
          <View style={[styles.modeChip, { backgroundColor: color + "20" }]}>
            <Text style={[styles.modeText, { color }]}>{phaseLabel(session)}{session.status === "paused" ? " · Paused" : ""}</Text>
          </View>
          <Breathe active={session.status === "running"}>
            <Text style={[styles.timer, { color }]}>{clock(seconds)}</Text>
          </Breathe>
          {session.kind === "pomodoro" && (
            <Text style={styles.sessionText}>Round {session.round} of {settings.rounds}</Text>
          )}

          <View style={styles.controls}>
            <TouchableOpacity style={[styles.controlBtn, idle && styles.dim]} disabled={idle} onPress={stop} accessibilityLabel="Stop">
              <MaterialIcons name="stop" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <PressableScale
              style={[styles.playBtn, { backgroundColor: color }]}
              onPress={session.status === "running" ? pause : onStart}
              scaleTo={0.9}
              accessibilityLabel={session.status === "running" ? "Pause" : "Start"}
            >
              <MaterialIcons name={session.status === "running" ? "pause" : "play-arrow"} size={36} color="#FFFFFF" />
            </PressableScale>
            <TouchableOpacity
              style={[styles.controlBtn, session.kind !== "pomodoro" && styles.dim]}
              disabled={session.kind !== "pomodoro"}
              onPress={skip}
              accessibilityLabel="Skip to next phase"
            >
              <MaterialIcons name="skip-next" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tag</Text>
          <View style={styles.chips}>
            {tags.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, session.tag === t && styles.chipActive]}
                onPress={() => setTag(session.tag === t ? null : t)}
                onLongPress={() => confirmRemoveTag(t)}
              >
                <Text style={[styles.chipText, session.tag === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
            {newTag === null ? (
              <TouchableOpacity style={[styles.chip, styles.chipAdd]} onPress={() => setNewTag("")}>
                <MaterialIcons name="add" size={16} color={colors.primary} />
                <Text style={[styles.chipText, { color: colors.primary }]}>New tag</Text>
              </TouchableOpacity>
            ) : (
              <TextInput
                autoFocus
                value={newTag}
                onChangeText={setNewTag}
                placeholder="e.g. Physics"
                placeholderTextColor={colors.textMuted}
                maxLength={24}
                style={styles.tagInput}
                onSubmitEditing={() => { addTag(newTag); setTag(newTag.trim() || session.tag); setNewTag(null); }}
                onBlur={() => setNewTag(null)}
                returnKeyType="done"
              />
            )}
          </View>
          {tags.length > 0 && <Text style={styles.hint}>Long-press a tag to remove it.</Text>}
        </View>

        {session.kind !== "stopwatch" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{session.kind === "pomodoro" ? "Pomodoro setup" : "Timer length"}</Text>
            {session.kind === "pomodoro" ? (
              <>
                <Stepper label="Focus" value={settings.focusMin} unit="min" min={5} max={120} step={5} disabled={!idle} onChange={(v) => set({ focusMin: v })} />
                <Stepper label="Short break" value={settings.shortMin} unit="min" min={1} max={30} disabled={!idle} onChange={(v) => set({ shortMin: v })} />
                <Stepper label="Long break" value={settings.longMin} unit="min" min={5} max={60} step={5} disabled={!idle} onChange={(v) => set({ longMin: v })} />
                <Stepper label="Rounds" value={settings.rounds} unit="" min={1} max={8} disabled={!idle} onChange={(v) => set({ rounds: v })} />
                <Text style={styles.hint}>
                  {settings.rounds - 1} short {settings.rounds - 1 === 1 ? "break" : "breaks"}, then a long break · {Math.round(phaseSeconds("pomodoro", "focus", settings) * settings.rounds / 60)} min of focus
                </Text>
              </>
            ) : (
              <Stepper label="Length" value={settings.timerMin} unit="min" min={5} max={180} step={5} disabled={!idle} onChange={(v) => set({ timerMin: v })} />
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Focus music</Text>
          <View style={styles.chips}>
            <TouchableOpacity style={[styles.chip, !music.track && styles.chipActive]} onPress={() => playTrack(null)}>
              <MaterialIcons name="volume-off" size={16} color={!music.track ? "#FFFFFF" : colors.textSecondary} />
              <Text style={[styles.chipText, !music.track && styles.chipTextActive]}>Off</Text>
            </TouchableOpacity>
            {TRACKS.map((t) => (
              <TouchableOpacity key={t.id} style={[styles.chip, music.track === t.id && styles.chipActive]} onPress={() => playTrack(music.track === t.id ? null : t.id)}>
                <MaterialIcons name={t.icon} size={16} color={music.track === t.id ? "#FFFFFF" : colors.textSecondary} />
                <Text style={[styles.chipText, music.track === t.id && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {music.track && (
            <>
              <View style={[styles.chips, { marginTop: spacing.sm }]}>
                {VOLUMES.map((v, i) => (
                  <TouchableOpacity key={v} style={[styles.chip, music.volume === v && styles.chipActive]} onPress={() => setMusicVolume(v)}>
                    <Text style={[styles.chipText, music.volume === v && styles.chipTextActive]}>{["Quiet", "Medium", "Loud"][i]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>{TRACKS.find((t) => t.id === music.track)?.credit} · CC BY, via YouTube</Text>
            </>
          )}
        </View>

        {Platform.OS === "android" && FocusGuard && (
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Block distracting apps</Text>
                <Text style={styles.hint}>During focus, chosen apps show a “Back to focus” screen. Breaks are free.</Text>
              </View>
              <Switch value={settings.block} onValueChange={toggleBlock} trackColor={{ true: colors.primary }} />
            </View>
            {settings.block && !blockerOn && (
              <TouchableOpacity style={styles.warn} onPress={() => FocusGuard?.openBlockerSettings()}>
                <MaterialIcons name="error-outline" size={18} color={colors.error} />
                <Text style={styles.warnText}>Not allowed yet. Tap to turn on “Anvesh focus mode” in Android settings.</Text>
              </TouchableOpacity>
            )}
            {settings.block && (
              <TouchableOpacity style={styles.linkRow} onPress={openPicker}>
                <MaterialIcons name="apps" size={18} color={colors.primary} />
                <Text style={styles.link}>{blocked.length ? `${blocked.length} ${blocked.length === 1 ? "app" : "apps"} blocked · Change` : "Choose apps to block"}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.studyHeader}>
            <MaterialIcons name="insights" size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>{"Today's focus"}</Text>
          </View>
          <Text style={styles.studyValue}>{Math.floor(studyMinutes / 60)}h {studyMinutes % 60}m</Text>
          <ProgressBar value={studyMinutes / DAILY_GOAL} height={8} />
          <Text style={styles.progressLabel}>{studyMinutes} / {DAILY_GOAL} min goal</Text>
          {byTag.length > 0 && (
            <View style={[styles.chips, { marginTop: spacing.sm }]}>
              {byTag.map(([t, m]) => (
                <View key={t} style={styles.tagStat}>
                  <Text style={styles.tagStatText}>{t} · {m}m</Text>
                </View>
              ))}
            </View>
          )}
          {status && (
            <View style={styles.unlockRow}>
              <MaterialIcons name={status.unlocked ? "lock-open" : "lock"} size={16} color={status.unlocked ? colors.tertiaryDark : colors.textSecondary} />
              <Text style={[styles.progressLabel, status.unlocked && { color: colors.tertiaryDark }]}>
                {status.unlocked ? "Quiz games unlocked" : `${status.required_minutes - status.study_minutes} more focus minutes to unlock quiz games`}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}>
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => setPicker(null)} accessibilityLabel="Done">
              <MaterialIcons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>Apps to block</Text>
            <View style={{ width: 24 }} />
          </View>
          <FlatList
            data={picker ?? []}
            keyExtractor={(a) => a.package}
            ListEmptyComponent={<Text style={[styles.hint, { padding: spacing.lg }]}>Loading apps…</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.appRow} onPress={() => toggleApp(item.package)}>
                <Text style={styles.appLabel}>{item.label}</Text>
                <MaterialIcons
                  name={blocked.includes(item.package) ? "check-box" : "check-box-outline-blank"}
                  size={22}
                  color={blocked.includes(item.package) ? colors.primary : colors.textMuted}
                />
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceWhite,
  },
  topTitle: { ...typography.titleMd, color: colors.text },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  segment: { flexDirection: "row", backgroundColor: colors.locked, borderRadius: radii.full, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: radii.full, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surfaceWhite },
  segmentText: { ...typography.labelLg, color: colors.textSecondary },
  segmentTextActive: { color: colors.primary },
  dial: { alignItems: "center", paddingVertical: spacing.md },
  modeChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radii.full, marginBottom: spacing.md },
  modeText: { ...typography.labelLg },
  timer: { ...typography.displayLg, fontSize: 68, lineHeight: 78, letterSpacing: -2 },
  sessionText: { ...typography.titleMd, color: colors.textSecondary, marginTop: spacing.xs },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.lg },
  controlBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceWhite,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border,
  },
  playBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  dim: { opacity: 0.4 },
  card: { backgroundColor: colors.surfaceWhite, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { ...typography.titleMd, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipAdd: { borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { ...typography.labelLg, color: colors.textSecondary },
  chipTextActive: { color: "#FFFFFF" },
  tagInput: {
    ...typography.bodyMd, color: colors.text, minWidth: 120, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.primary,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  stepLabel: { ...typography.bodyMd, color: colors.text, flex: 1 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  stepValue: { ...typography.labelLg, color: colors.text, minWidth: 64, textAlign: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  warn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.errorLight },
  warnText: { ...typography.bodySm, color: colors.error, flex: 1 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  link: { ...typography.labelLg, color: colors.primary },
  studyHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  studyValue: { ...typography.headlineMd, color: colors.primary, marginBottom: spacing.sm },
  progressLabel: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" },
  tagStat: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full, backgroundColor: colors.primaryLight },
  tagStatText: { ...typography.labelMd, color: colors.primaryDark },
  unlockRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  appRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  appLabel: { ...typography.bodyMd, color: colors.text },
});
