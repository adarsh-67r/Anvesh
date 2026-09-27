import { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../../lib/api";
import { errorDetail } from "../../lib/trails";
import { PressableScale } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

export default function NewTrailScreen() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim() || !url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const t = await api.post<{ id: string }>("/api/trails", { title: title.trim(), url: url.trim() });
      router.replace(`/trail/${t.id}`);
    } catch (e) {
      setError(errorDetail(e, "Could not create the trail. Check the link and try again."));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>New trail</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} placeholder="DSA Placements" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} maxLength={200} />
        <Text style={styles.label}>YouTube playlist or video link</Text>
        <TextInput style={styles.input} placeholder="https://youtube.com/playlist?list=…" placeholderTextColor={colors.textMuted} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.hint}>You can add more playlists to this trail later.</Text>
        {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <PressableScale style={[styles.primaryBtn, (!title.trim() || !url.trim() || busy) && { opacity: 0.5 }]} onPress={create} disabled={!title.trim() || !url.trim() || busy}>
          <Text style={styles.primaryBtnText}>{busy ? "Creating…" : "Create trail"}</Text>
        </PressableScale>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topTitle: { ...typography.headlineMd, color: colors.text },
  body: { padding: spacing.md, gap: spacing.sm },
  label: { ...typography.labelMd, color: colors.textSecondary, marginTop: spacing.sm },
  input: { height: 48, borderWidth: 1.5, borderColor: colors.borderMuted, borderRadius: radii.lg, paddingHorizontal: spacing.md, ...typography.bodyMd, color: colors.text, backgroundColor: colors.surfaceWhite },
  hint: { ...typography.bodySm, color: colors.textMuted },
  error: { ...typography.bodyMd, color: colors.error },
  primaryBtn: { marginTop: spacing.md, height: 52, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
