import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  RefreshControl,
  Image,
  TextInput,
  useWindowDimensions,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { Link, router, useLocalSearchParams, useFocusEffect } from "expo-router";
let YoutubePlayer: any = null;
if (Platform.OS !== "web") {
  YoutubePlayer = require("react-native-youtube-iframe").default;
}
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type MasteryInfo = { skill_id: string; mastery_score: number; phase: string };
type Video = { id: string; title: string; url: string; display_order: number };
type GraphNode = { id: string; label: string; prerequisites: string[]; status: "mastered" | "available" | "locked" };

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function SkillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [mastery, setMastery] = useState<MasteryInfo | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [graph, setGraph] = useState<GraphNode[]>([]);
  const [editPrereqs, setEditPrereqs] = useState(false);
  const [draftPrereqs, setDraftPrereqs] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; prev: number } | null>(null);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [m, v, g] = await Promise.all([
        api.get<MasteryInfo>(`/api/recommend/mastery/${id}`),
        api.get<Video[]>(`/api/recommend/videos/${id}`),
        api.get<GraphNode[]>("/api/recommend/graph"),
      ]);
      setMastery(m);
      setVideos(v);
      setGraph(g);
    } catch {}
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitAnswer = async (correct: boolean) => {
    if (!id || answering) return;
    setAnswering(true);
    const prevPct = mastery ? Math.round(mastery.mastery_score * 100) : 0;
    try {
      await api.post("/api/recommend/answer", { skill_id: id, correct });
      await load();
      setFeedback({ correct, prev: prevPct });
      setTimeout(() => setFeedback(null), 3000);
    } catch {} finally {
      setAnswering(false);
    }
  };

  const addVideo = async () => {
    const url = videoUrl.trim();
    if (!url || !id) return;
    try {
      await api.post("/api/videos", { skill_id: id, url, title: videoTitle.trim() || url });
      setVideoUrl("");
      setVideoTitle("");
      setShowAddVideo(false);
      await load();
    } catch {}
  };

  const pct = mastery ? Math.round(mastery.mastery_score * 100) : 0;
  const node = graph.find((n) => n.id === id);
  const labelOf = (sid: string) => graph.find((n) => n.id === sid)?.label ?? sid;
  const unmetPrereqs = (node?.prerequisites ?? []).filter((p) => graph.find((n) => n.id === p)?.status !== "mastered");

  const startEditPrereqs = () => {
    setDraftPrereqs(node?.prerequisites ?? []);
    setEditPrereqs(true);
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{node?.label ?? id}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {/* Mastery Card */}
        <View style={styles.masteryCard}>
          <View style={styles.masteryHeader}>
            <MaterialIcons name="bolt" size={20} color={colors.primary} />
            <Text style={styles.masteryHeaderText}>Concept Mastery</Text>
          </View>
          <Text style={styles.masteryPct}>{pct}%</Text>
          <Text style={styles.masteryLabel}>
            {pct >= 80 ? "Mastered" : pct >= 50 ? "In Progress" : "Getting Started"}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${pct}%`,
                  backgroundColor: pct >= 80 ? colors.tertiary : colors.secondary,
                },
              ]}
            />
          </View>
          <View style={styles.milestones}>
            <Text style={styles.milestoneText}>0%</Text>
            <Text style={styles.milestoneText}>50%</Text>
            <Text style={[styles.milestoneText, pct >= 80 && { color: colors.tertiary }]}>80%</Text>
            <Text style={styles.milestoneText}>100%</Text>
          </View>
          {mastery?.phase && (
            <Text style={styles.phaseText}>Phase: {mastery.phase}</Text>
          )}
        </View>

        {/* Practice */}
        <Text style={styles.sectionTitle}>Practice</Text>
        <View style={styles.practiceRow}>
          <TouchableOpacity
            style={[styles.practiceBtn, { backgroundColor: colors.tertiaryLight }]}
            onPress={() => submitAnswer(true)}
            disabled={answering}
          >
            <MaterialIcons name="check" size={24} color={colors.tertiaryDark} />
            <Text style={[styles.practiceBtnText, { color: colors.tertiaryDark }]}>Correct</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.practiceBtn, { backgroundColor: colors.errorLight }]}
            onPress={() => submitAnswer(false)}
            disabled={answering}
          >
            <MaterialIcons name="close" size={24} color={colors.error} />
            <Text style={[styles.practiceBtnText, { color: colors.error }]}>Incorrect</Text>
          </TouchableOpacity>
        </View>

        {feedback && (
          <View style={[styles.feedbackCard, { borderColor: feedback.correct ? colors.tertiary : colors.error }]}>
            <View style={styles.feedbackRow}>
              <View style={[styles.xpBadge, { backgroundColor: feedback.correct ? colors.tertiaryLight : colors.errorLight }]}>
                <Text style={[styles.xpText, { color: feedback.correct ? colors.tertiaryDark : colors.error }]}>
                  +12 XP Earned!
                </Text>
              </View>
              <View style={[styles.xpBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.xpText, { color: colors.primary }]}>
                  {feedback.prev}% → {pct}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Quiz */}
        <Link href={`/quiz/${id}`} asChild>
          <TouchableOpacity style={styles.quizBtn} activeOpacity={0.7}>
            <MaterialIcons name="bolt" size={20} color="#FFFFFF" />
            <Text style={styles.quizBtnText}>Take Quiz Challenge</Text>
          </TouchableOpacity>
        </Link>

        {/* Prerequisites */}
        <View style={styles.videoHeader}>
          <Text style={styles.sectionTitle}>Prerequisites</Text>
          {!editPrereqs && graph.length > 1 && (
            <TouchableOpacity onPress={startEditPrereqs} hitSlop={8} accessibilityLabel="Edit prerequisites">
              <MaterialIcons name="edit" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {unmetPrereqs.length > 0 && !editPrereqs && (
          <View style={styles.lockBanner}>
            <MaterialIcons name="lock" size={18} color={colors.error} />
            <Text style={styles.lockText}>Master {unmetPrereqs.map(labelOf).join(", ")} first to unlock recommendations for this skill.</Text>
          </View>
        )}
        {!editPrereqs && (
          <View style={styles.chipRow}>
            {(node?.prerequisites ?? []).length === 0 && <Text style={styles.emptyPrereq}>None. This skill is available right away.</Text>}
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
        )}
        {editPrereqs && (
          <View style={styles.prereqEditor}>
            <Text style={styles.emptyPrereq}>Tap the skills a student must master before this one.</Text>
            <View style={styles.chipRow}>
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
            <View style={styles.practiceRow}>
              <TouchableOpacity style={[styles.practiceBtn, { backgroundColor: colors.locked }]} onPress={() => setEditPrereqs(false)}>
                <Text style={[styles.practiceBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.practiceBtn, { backgroundColor: colors.primary }]} onPress={savePrereqs}>
                <Text style={[styles.practiceBtnText, { color: "#FFFFFF" }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Videos */}
        <View style={styles.videoHeader}>
          <Text style={styles.sectionTitle}>Videos</Text>
          <TouchableOpacity onPress={() => setShowAddVideo(!showAddVideo)} hitSlop={8}>
            <MaterialIcons name={showAddVideo ? "close" : "add-circle"} size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {showAddVideo && (
          <View style={styles.addVideoForm}>
            <TextInput
              style={styles.addVideoInput}
              placeholder="YouTube URL or playlist link"
              placeholderTextColor={colors.textMuted}
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TextInput
              style={styles.addVideoInput}
              placeholder="Title (optional)"
              placeholderTextColor={colors.textMuted}
              value={videoTitle}
              onChangeText={setVideoTitle}
            />
            <TouchableOpacity
              style={[styles.quizBtn, !videoUrl.trim() && { opacity: 0.5 }]}
              onPress={addVideo}
              disabled={!videoUrl.trim()}
            >
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.quizBtnText}>Add Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {videos.map((v) => {
          const ytId = extractYouTubeId(v.url);
          const isPlaying = playingId === v.id;
          const playerWidth = width - spacing.md * 2;
          return (
            <View key={v.id} style={styles.videoCard}>
              {isPlaying && ytId ? (
                Platform.OS === "web" ? (
                  <iframe
                    width={playerWidth}
                    height={Math.round(playerWidth * 9 / 16)}
                    src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    style={{ border: 0 }}
                  />
                ) : YoutubePlayer ? (
                  <YoutubePlayer
                    height={Math.round(playerWidth * 9 / 16)}
                    width={playerWidth}
                    videoId={ytId}
                    play
                    webViewProps={{ allowsFullscreenVideo: true }}
                  />
                ) : null
              ) : (
                <TouchableOpacity
                  onPress={() => ytId ? setPlayingId(v.id) : Linking.openURL(v.url)}
                  activeOpacity={0.7}
                >
                  {ytId ? (
                    <View style={styles.thumbWrapper}>
                      <Image
                        source={{ uri: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` }}
                        style={styles.thumbnail}
                      />
                      <View style={styles.playOverlay}>
                        <MaterialIcons name="play-arrow" size={32} color="#FFFFFF" />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.playIconFallback}>
                      <MaterialIcons name="play-circle-outline" size={28} color={colors.secondary} />
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.videoTitleRow}
                onPress={() => setPlayingId(isPlaying ? null : v.id)}
              >
                <Text style={styles.videoTitle} numberOfLines={2}>{v.title}</Text>
                <MaterialIcons name={isPlaying ? "stop" : "play-arrow"} size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          );
        })}

        {videos.length === 0 && !showAddVideo && (
          <Text style={styles.emptyVideos}>No videos yet. Tap + to add one!</Text>
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
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceWhite,
  },
  topTitle: { ...typography.titleMd, color: colors.text, flex: 1, textAlign: "center", marginHorizontal: spacing.sm },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  masteryCard: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  masteryHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  masteryHeaderText: { ...typography.labelLg, color: colors.text },
  masteryPct: { ...typography.displayLg, color: colors.primary },
  masteryLabel: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
  progressBarBg: { width: "100%", height: 10, backgroundColor: colors.border, borderRadius: radii.full },
  progressBarFill: { height: 10, borderRadius: radii.full },
  milestones: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: spacing.xs },
  milestoneText: { ...typography.labelSm, color: colors.textMuted },
  phaseText: { ...typography.labelMd, color: colors.textSecondary, marginTop: spacing.sm },
  sectionTitle: { ...typography.headlineSm, color: colors.text, marginBottom: spacing.sm },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  lockText: { ...typography.bodyMd, color: colors.error, flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
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
  emptyPrereq: { ...typography.bodyMd, color: colors.textMuted, marginBottom: spacing.sm },
  prereqEditor: { marginBottom: spacing.md },
  practiceRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  practiceBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  practiceBtnText: { ...typography.labelLg },
  feedbackCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceWhite,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  feedbackRow: { flexDirection: "row", gap: spacing.sm },
  xpBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full },
  xpText: { ...typography.labelMd },
  quizBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  quizBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  videoCard: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  thumbWrapper: { width: "100%", height: 180, position: "relative" },
  thumbnail: { width: "100%", height: "100%" },
  playOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playIconFallback: { padding: spacing.md },
  videoTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  videoTitle: { ...typography.bodyMd, color: colors.text, flex: 1 },
  videoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  addVideoForm: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  addVideoInput: {
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    ...typography.bodyMd,
    color: colors.text,
  },
  emptyVideos: { ...typography.bodyMd, color: colors.textMuted, textAlign: "center" as const, marginBottom: spacing.lg },
});
