import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { PressableScale, Skeleton, enter } from "../../components/Motion";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api, logEvent } from "../../lib/api";
import { youTubeId, youTubeThumb } from "../../lib/youtube";
import { fmtTs, rangeLabel } from "../../lib/trails";
import { VideoPlayer } from "../../components/VideoPlayer";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Lesson = { id: string; title: string; url: string; start_sec: number | null; end_sec: number | null };
type Detail = {
  id: string;
  title: string;
  url: string;
  skill_id: string;
  skill_label: string;
  index: number | null;
  total: number;
  channel: string | null;
  description: string | null;
  duration: number | null;
  lessons: Lesson[];
  youtube_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  concepts: { concept: string; explanation: string; timestamp_sec: number | null }[];
};

const fmtDuration = (s: number | null) =>
  s ? (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)} min`) : null;

export default function LectureScreen() {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const { width } = useWindowDimensions();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<Detail>(`/api/videos/detail/${id}`).then((d) => {
      setDetail(d);
      logEvent("video_play", d.skill_id, { video_id: d.id });
    }).catch(() => setError(true));
  }, [id]);

  const playerWidth = Math.min(width, 900);
  const ytId = detail ? detail.youtube_id ?? youTubeId(detail.url) : null;
  const pos = detail ? detail.lessons.findIndex((l) => l.id === detail.id) : -1;
  const upNext = detail ? detail.lessons.slice(pos + 1) : [];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{detail?.skill_label ?? "Lesson"}</Text>
      </View>

      <View style={[styles.player, { height: Math.round((playerWidth * 9) / 16) }]}>
        {ytId ? (
          <VideoPlayer
            key={`${ytId}-${t ?? ""}`}
            videoId={ytId}
            width={playerWidth}
            start={t ? Number(t) : detail?.start_sec ?? undefined}
            end={detail?.end_sec ?? undefined}
          />
        ) : detail ? (
          <TouchableOpacity style={styles.externalBtn} onPress={() => Linking.openURL(detail.url)}>
            <MaterialIcons name="open-in-new" size={22} color="#FFFFFF" />
            <Text style={styles.externalText}>Open video</Text>
          </TouchableOpacity>
        ) : error ? (
          <Text style={styles.externalText}>Could not load this lesson.</Text>
        ) : (
          <ActivityIndicator color="#FFFFFF" />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!detail && !error && (
          <View style={{ gap: spacing.sm }} accessibilityLabel="Loading lesson">
            <Skeleton height={24} width="90%" />
            <Skeleton height={14} width="50%" />
            <Skeleton height={48} radius={radii.full} style={{ marginTop: spacing.sm }} />
            <Skeleton height={110} radius={radii.xl} style={{ marginTop: spacing.sm }} />
          </View>
        )}
        {detail && (
          <Animated.View entering={enter(0)}>
            <Text style={styles.title}>{detail.title}</Text>
            <Text style={styles.meta}>
              {detail.index ? `Lesson ${detail.index} of ${detail.total}` : "Lesson"}
              {detail.channel ? ` · ${detail.channel}` : ""}
              {rangeLabel(detail.start_sec, detail.end_sec)
                ? ` · ${rangeLabel(detail.start_sec, detail.end_sec)}`
                : fmtDuration(detail.duration) ? ` · ${fmtDuration(detail.duration)}` : ""}
            </Text>

            <View style={styles.actions}>
              <PressableScale
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={() => router.push(`/practice/${detail.skill_id}`)}
                accessibilityRole="button"
              >
                <MaterialIcons name="quiz" size={20} color="#FFFFFF" />
                <Text style={[styles.actionText, { color: "#FFFFFF" }]}>Practice</Text>
              </PressableScale>
              <PressableScale
                style={styles.actionBtn}
                onPress={() => router.push({ pathname: "/chat", params: { label: `${detail.skill_label}: ${detail.title}` } })}
                accessibilityRole="button"
              >
                <MaterialIcons name="smart-toy" size={20} color={colors.primary} />
                <Text style={styles.actionText}>Ask tutor</Text>
              </PressableScale>
            </View>

            <View style={styles.descBox}>
              <Text style={styles.descHeading}>Description</Text>
              <Text style={styles.desc} numberOfLines={expanded ? undefined : 4}>
                {detail.description || "No description available for this lesson."}
              </Text>
              {detail.description && detail.description.length > 200 && (
                <TouchableOpacity onPress={() => setExpanded((e) => !e)} hitSlop={8}>
                  <Text style={styles.more}>{expanded ? "Show less" : "Show more"}</Text>
                </TouchableOpacity>
              )}
            </View>

            {detail.concepts.length > 0 && (
              <View style={styles.descBox}>
                <Text style={styles.descHeading}>Key concepts</Text>
                {detail.concepts.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    disabled={c.timestamp_sec == null}
                    onPress={() => router.replace(`/lecture/${detail.id}?t=${c.timestamp_sec}`)}
                    style={{ marginTop: spacing.sm }}
                  >
                    <Text style={styles.conceptTitle}>{c.concept}{c.timestamp_sec != null ? `  · ${fmtTs(c.timestamp_sec)}` : ""}</Text>
                    <Text style={styles.desc}>{c.explanation}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <PressableScale style={styles.checkCard} onPress={() => router.push(`/practice/${detail.skill_id}?lesson=${detail.id}`)} scaleTo={0.98}>
              <MaterialIcons name="fact-check" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.conceptTitle}>Check your understanding</Text>
                <Text style={styles.desc}>A few quick questions on this lesson</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </PressableScale>

            {upNext.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Up next</Text>
                {upNext.slice(0, 8).map((l, i) => {
                  const vid = youTubeId(l.url);
                  return (
                    <Animated.View key={l.id} entering={enter(i + 2)}>
                    <PressableScale style={styles.lessonRow} onPress={() => router.replace(`/lecture/${l.id}`)} scaleTo={0.98}>
                      {vid ? (
                        <Image source={{ uri: youTubeThumb(vid) }} style={styles.lessonThumb} />
                      ) : (
                        <View style={[styles.lessonThumb, styles.thumbFallback]}>
                          <MaterialIcons name="play-circle-outline" size={24} color={colors.textMuted} />
                        </View>
                      )}
                      <Text style={styles.lessonTitle} numberOfLines={2}>{l.title}</Text>
                    </PressableScale>
                    </Animated.View>
                  );
                })}
              </>
            )}
          </Animated.View>
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
    backgroundColor: "#000000",
  },
  topTitle: { ...typography.titleMd, color: "#FFFFFF", flex: 1 },
  player: { width: "100%", backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  externalBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  externalText: { ...typography.labelLg, color: "#FFFFFF" },
  body: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { ...typography.headlineMd, color: colors.text },
  meta: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 46,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionText: { ...typography.labelLg, color: colors.primary },
  descBox: {
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  descHeading: { ...typography.labelLg, color: colors.text, marginBottom: spacing.xs },
  desc: { ...typography.bodyMd, color: colors.textSecondary },
  more: { ...typography.labelLg, color: colors.primary, marginTop: spacing.sm },
  conceptTitle: { ...typography.titleMd, color: colors.text },
  checkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.headlineSm, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  lessonRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginBottom: spacing.sm },
  lessonThumb: { width: 128, height: 72, borderRadius: radii.lg, backgroundColor: colors.locked },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  lessonTitle: { ...typography.titleMd, color: colors.text, flex: 1 },
});
