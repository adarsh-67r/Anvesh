import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../lib/api";
import { colors, typography, spacing, radii } from "../lib/theme";

export default function AddContentScreen() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [skillId, setSkillId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ added?: number; title?: string; skill_label?: string; skill_id?: string; total_in_playlist?: number } | null>(null);

  const isPlaylist = url.includes("list=");

  const submit = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    if (!isPlaylist && !skillId.trim()) {
      if (Platform.OS === "web") alert("Skill ID is required for single videos");
      else Alert.alert("Error", "Skill ID is required for single videos");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const body: Record<string, string> = { url: trimmedUrl };
      if (title.trim()) body.title = title.trim();
      if (skillId.trim()) body.skill_id = skillId.trim();
      const res = await api.post<any>("/api/videos", body);
      setResult(res);
      setUrl("");
      setTitle("");
      setSkillId("");
    } catch (e: any) {
      const msg = e.message || "Failed to add content";
      if (Platform.OS === "web") alert(msg);
      else Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Add Content</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <MaterialIcons name="video-library" size={28} color={colors.primary} />
            <Text style={styles.cardTitle}>YouTube Video or Playlist</Text>
          </View>
          <Text style={styles.hint}>
            Paste a YouTube link. Playlists auto-extract all videos and create a new topic.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="https://youtube.com/playlist?list=..."
            placeholderTextColor={colors.textMuted}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
          />

          <TextInput
            style={styles.input}
            placeholder={isPlaylist ? "Topic name (auto from playlist title)" : "Topic name"}
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          {!isPlaylist && (
            <TextInput
              style={styles.input}
              placeholder="Topic ID (e.g. arrays, dp, graphs)"
              placeholderTextColor={colors.textMuted}
              value={skillId}
              onChangeText={setSkillId}
              autoCapitalize="none"
            />
          )}

          {isPlaylist && (
            <View style={styles.playlistBadge}>
              <MaterialIcons name="playlist-play" size={18} color={colors.primary} />
              <Text style={styles.playlistText}>Playlist detected — all videos will be extracted</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, (!url.trim() || loading) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!url.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.submitText}>{isPlaylist ? "Import Playlist" : "Add Video"}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {result && (
          <View style={styles.resultCard}>
            <MaterialIcons name="check-circle" size={24} color={colors.tertiary} />
            <View style={{ flex: 1 }}>
              {result.skill_label && (
                <Text style={styles.resultTitle}>Topic: {result.skill_label}</Text>
              )}
              <Text style={styles.resultText}>
                {result.added != null
                  ? `${result.added} videos added${result.total_in_playlist ? ` (${result.total_in_playlist} in playlist)` : ""}`
                  : `Video "${result.title}" added`}
              </Text>
            </View>
            {result.skill_id && (
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => router.push(`/skill/${result.skill_id}`)}
              >
                <Text style={styles.viewBtnText}>View</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips</Text>
          <Text style={styles.tip}>• Paste a playlist URL to import all videos at once</Text>
          <Text style={styles.tip}>• Each playlist creates a new topic automatically</Text>
          <Text style={styles.tip}>• Single video URLs need a topic ID</Text>
          <Text style={styles.tip}>• Topics appear in the Learn tab after adding</Text>
        </View>
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
  topTitle: { ...typography.titleMd, color: colors.text },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  iconRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { ...typography.headlineSm, color: colors.text },
  hint: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.md },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    height: 48,
    ...typography.bodyMd,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  playlistBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  playlistText: { ...typography.bodySm, color: colors.primary },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    height: 48,
  },
  submitText: { ...typography.labelLg, color: "#FFFFFF" },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.tertiaryLight,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  resultTitle: { ...typography.titleMd, color: colors.tertiaryDark },
  resultText: { ...typography.bodySm, color: colors.tertiaryDark },
  viewBtn: {
    backgroundColor: colors.surfaceWhite,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewBtnText: { ...typography.labelMd, color: colors.primary },
  tipsCard: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipsTitle: { ...typography.titleMd, color: colors.text, marginBottom: spacing.sm },
  tip: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.xs },
});
