import { useCallback, useState, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { api, StudyStatus } from "../../lib/api";
import { youTubeId, youTubeThumb } from "../../lib/youtube";
import { colors, typography, spacing, radii } from "../../lib/theme";

type MasteryInfo = { skill_id: string; mastery_score: number; phase: "ema" | "bkt" | "irt" };
type Video = { id: string; title: string; url: string; display_order: number };
type GraphNode = { id: string; label: string; prerequisites: string[]; status: "mastered" | "available" | "locked" };

const MODEL_NAMES = { ema: "rule-based EMA", bkt: "Bayesian Knowledge Tracing", irt: "Item Response Theory" };
const LESSONS_SHOWN = 5;

function Step({ n, title, subtitle, done, children }: { n: number; title: string; subtitle: string; done?: boolean; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.stepBadge, done && styles.stepBadgeDone]}>
          {done ? <MaterialIcons name="check" size={16} color="#FFFFFF" /> : <Text style={styles.stepNum}>{n}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.stepSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

export default function SkillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [mastery, setMastery] = useState<MasteryInfo | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [graph, setGraph] = useState<GraphNode[]>([]);
  const [study, setStudy] = useState<StudyStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editPrereqs, setEditPrereqs] = useState(false);
  const [draftPrereqs, setDraftPrereqs] = useState<string[]>([]);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const [m, v, g, s] = await Promise.all([
      api.get<MasteryInfo>(`/api/recommend/mastery/${id}`).catch(() => null),
      api.get<Video[]>(`/api/recommend/videos/${id}`).catch(() => []),
      api.get<GraphNode[]>("/api/recommend/graph").catch(() => []),
      api.get<StudyStatus>("/api/game/status").catch(() => null),
    ]);
    setMastery(m);
    setVideos(v);
    setGraph(g);
    setStudy(s);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pct = mastery ? Math.round(mastery.mastery_score * 100) : 0;
  const node = graph.find((n) => n.id === id);
  const label = node?.label ?? "Skill";
  const labelOf = (sid: string) => graph.find((n) => n.id === sid)?.label ?? sid;
  const unmet = (node?.prerequisites ?? []).filter((p) => graph.find((n) => n.id === p)?.status !== "mastered");
  const mastered = node?.status === "mastered";
  const lessons = showAll ? videos : videos.slice(0, LESSONS_SHOWN);

  const addVideo = async () => {
    const url = videoUrl.trim();
    if (!url || !id) return;
    try {
      await api.post("/api/videos", { skill_id: id, url, title: videoTitle.trim() || url });
      setVideoUrl("");
      setVideoTitle("");
      setShowAddVideo(false);
      await load();
    } catch {
      Alert.alert("Could not add video", "Check the link and try again.");
    }
  };

  const savePrereqs = async () => {
    try {
      await api.put(`/api/recommend/skills/${id}/prerequisites`, { prerequisites: draftPrereqs });
      setEditPrereqs(false);
      await load();
    } catch (e: any) {
      const msg = (() => { try { return JSON.parse(e.message).detail; } catch { return e.message; } })();
      Alert.alert("Could not save", msg || "Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{label}</Text>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/chat", params: { label } })}
          accessibilityLabel="Ask the AI tutor about this skill"
          hitSlop={8}
        >
          <MaterialIcons name="smart-toy" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            colors={[colors.primary]}
          />
        }
      >
        {/* Mastery */}
        <View style={styles.masteryCard}>
          <View style={styles.masteryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.masteryLabel}>{mastered ? "Mastered" : pct >= 50 ? "In progress" : "Getting started"}</Text>
              <Text style={styles.masteryModel}>
                Tracked by {MODEL_NAMES[mastery?.phase ?? "ema"]}
              </Text>
            </View>
            <Text style={styles.masteryPct}>{pct}%</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: mastered ? colors.tertiary : colors.primary }]} />
          </View>
        </View>

        {unmet.length > 0 && (
          <View style={styles.lockBanner}>
            <MaterialIcons name="lock" size={18} color={colors.error} />
            <Text style={styles.lockText}>Master {unmet.map(labelOf).join(", ")} first to unlock recommendations for this skill.</Text>
          </View>
        )}

        {/* ① Watch */}
        <Step n={1} title="Watch" subtitle={videos.length ? `${videos.length} lessons` : "No lessons yet"}>
          {lessons.map((v, i) => {
            const vid = youTubeId(v.url);
            return (
              <TouchableOpacity key={v.id} style={styles.lesson} onPress={() => router.push(`/lecture/${v.id}`)}>
                {vid ? (
                  <View>
                    <Image source={{ uri: youTubeThumb(vid) }} style={styles.thumb} />
                    <View style={styles.thumbPlay}>
                      <MaterialIcons name="play-arrow" size={20} color="#FFFFFF" />
                    </View>
                  </View>
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <MaterialIcons name="play-circle-outline" size={24} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonIndex}>Lesson {i + 1}</Text>
                  <Text style={styles.lessonTitle} numberOfLines={2}>{v.title}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {videos.length > LESSONS_SHOWN && (
            <TouchableOpacity onPress={() => setShowAll((s) => !s)} style={styles.linkBtn}>
              <Text style={styles.linkText}>{showAll ? "Show fewer" : `Show all ${videos.length} lessons`}</Text>
            </TouchableOpacity>
          )}
          {showAddVideo ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="YouTube link"
                placeholderTextColor={colors.textMuted}
                value={videoUrl}
                onChangeText={setVideoUrl}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Title (optional)"
                placeholderTextColor={colors.textMuted}
                value={videoTitle}
                onChangeText={setVideoTitle}
              />
              <View style={styles.formRow}>
                <TouchableOpacity style={[styles.smallBtn, styles.smallBtnMuted]} onPress={() => setShowAddVideo(false)}>
                  <Text style={styles.smallBtnMutedText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={addVideo}>
                  <Text style={styles.smallBtnText}>Add lesson</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setShowAddVideo(true)} style={styles.linkBtn}>
              <Text style={styles.linkText}>+ Add a lesson</Text>
            </TouchableOpacity>
          )}
        </Step>

        {/* ② Practice */}
        <Step n={2} title="Practice" subtitle="5 questions · every answer updates your mastery" done={mastered}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/practice/${id}`)} accessibilityRole="button">
            <MaterialIcons name="quiz" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{pct > 0 ? "Practice again" : "Start practice"}</Text>
          </TouchableOpacity>
        </Step>

        {/* ③ Challenge */}
        <Step
          n={3}
          title="Challenge"
          subtitle={
            study?.unlocked
              ? "Timed quiz game with XP"
              : `Unlocks after ${study?.required_minutes ?? 60} focus minutes (${study?.study_minutes ?? 0} so far today)`
          }
        >
          <TouchableOpacity
            style={[styles.secondaryBtn, !study?.unlocked && styles.secondaryBtnLocked]}
            onPress={() => router.push(study?.unlocked ? `/quiz/${id}` : "/pomodoro")}
            accessibilityRole="button"
          >
            <MaterialIcons name={study?.unlocked ? "bolt" : "timer"} size={20} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>{study?.unlocked ? "Take the challenge" : "Start a focus session"}</Text>
          </TouchableOpacity>
        </Step>

        {/* Prerequisites */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Prerequisites</Text>
          {!editPrereqs && graph.length > 1 && (
            <TouchableOpacity
              onPress={() => { setDraftPrereqs(node?.prerequisites ?? []); setEditPrereqs(true); }}
              accessibilityLabel="Edit prerequisites"
              hitSlop={8}
            >
              <MaterialIcons name="edit" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {!editPrereqs ? (
          <View style={styles.chips}>
            {(node?.prerequisites ?? []).length === 0 && <Text style={styles.muted}>None. This skill is available right away.</Text>}
            {(node?.prerequisites ?? []).map((p) => {
              const done = graph.find((n) => n.id === p)?.status === "mastered";
              return (
                <TouchableOpacity key={p} style={styles.chip} onPress={() => router.push(`/skill/${p}`)}>
                  <MaterialIcons name={done ? "check-circle" : "radio-button-unchecked"} size={16} color={done ? colors.tertiary : colors.textMuted} />
                  <Text style={styles.chipText} numberOfLines={1}>{labelOf(p)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View>
            <Text style={styles.muted}>Tap the skills a student must master before this one.</Text>
            <View style={[styles.chips, { marginTop: spacing.sm }]}>
              {graph.filter((n) => n.id !== id).map((n) => {
                const on = draftPrereqs.includes(n.id);
                return (
                  <TouchableOpacity
                    key={n.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setDraftPrereqs((d) => (on ? d.filter((x) => x !== n.id) : [...d, n.id]))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={16} color={on ? "#FFFFFF" : colors.textMuted} />
                    <Text style={[styles.chipText, on && { color: "#FFFFFF" }]} numberOfLines={1}>{n.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.formRow}>
              <TouchableOpacity style={[styles.smallBtn, styles.smallBtnMuted]} onPress={() => setEditPrereqs(false)}>
                <Text style={styles.smallBtnMutedText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={savePrereqs}>
                <Text style={styles.smallBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  topTitle: { ...typography.titleMd, color: colors.text, flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  masteryCard: {
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  masteryRow: { flexDirection: "row", alignItems: "center" },
  masteryLabel: { ...typography.titleMd, color: colors.text },
  masteryModel: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  masteryPct: { ...typography.displayLg, fontSize: 36, lineHeight: 42, color: colors.primary },
  bar: { height: 8, borderRadius: radii.full, backgroundColor: colors.locked, marginTop: spacing.sm, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radii.full },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  lockText: { ...typography.bodyMd, color: colors.error, flex: 1 },
  step: {
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  stepHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeDone: { backgroundColor: colors.tertiary },
  stepNum: { ...typography.labelLg, color: colors.primary },
  stepTitle: { ...typography.headlineSm, color: colors.text },
  stepSubtitle: { ...typography.bodySm, color: colors.textSecondary },
  lesson: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 112, height: 63, borderRadius: radii.md, backgroundColor: colors.locked },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  thumbPlay: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radii.full,
    padding: 2,
  },
  lessonIndex: { ...typography.labelSm, color: colors.textSecondary },
  lessonTitle: { ...typography.bodyMd, color: colors.text },
  linkBtn: { paddingVertical: spacing.xs },
  linkText: { ...typography.labelLg, color: colors.primary },
  form: { gap: spacing.sm },
  input: {
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.text,
  },
  formRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  smallBtn: { flex: 1, height: 44, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  smallBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  smallBtnMuted: { backgroundColor: colors.locked },
  smallBtnMutedText: { ...typography.labelLg, color: colors.textSecondary },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 50,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
  },
  primaryBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 50,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
  },
  secondaryBtnLocked: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  secondaryBtnText: { ...typography.labelLg, color: colors.primary },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { ...typography.headlineSm, color: colors.text },
  muted: { ...typography.bodyMd, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    maxWidth: "100%",
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.labelMd, color: colors.text, flexShrink: 1 },
});
