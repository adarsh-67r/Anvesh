import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { ScreenHeader } from "../../components/Sidebar";
import { Card, loadDueCards, reviewCard } from "../../lib/offline";
import { colors, typography, spacing, radii } from "../../lib/theme";

const QUALITY_LABELS = ["Blackout", "Forgot", "Familiar", "Hard", "Good", "Perfect"];
const QUALITY_COLORS = ["#BA1A1A", "#C2410C", "#EA580C", "#D97706", "#0EA5E9", "#10B981"];

export default function CardsScreen() {
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  const [totalCount, setTotalCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await loadDueCards();
      setDueCards(res.due);
      setTotalCount(res.total);
      setOffline(res.offline);
      setPending(res.pending);
      setCurrentIdx(0);
      setFlipped(false);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const current = dueCards[currentIdx];

  const review = async (quality: number) => {
    if (!current) return;
    try {
      const queued = await reviewCard(current.id, quality);
      if (queued) {
        setOffline(true);
        setPending((n) => n + 1);
      }
      if (currentIdx < dueCards.length - 1) {
        setCurrentIdx((i) => i + 1);
        setFlipped(false);
      } else {
        setDueCards([]);
        setCurrentIdx(0);
      }
    } catch {}
  };

  const createCard = async () => {
    if (!front.trim() || !back.trim()) return;
    try {
      await api.post("/api/flashcards", { front: front.trim(), back: back.trim() });
      setFront("");
      setBack("");
      setShowCreate(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Review"
        subtitle="Spaced-repetition flashcards"
        right={
          <TouchableOpacity onPress={() => setShowCreate(!showCreate)} accessibilityLabel={showCreate ? "Close new card form" : "New flashcard"} hitSlop={8}>
            <MaterialIcons name={showCreate ? "close" : "add"} size={28} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      {showCreate && (
        <View style={styles.createForm}>
          <TextInput
            style={styles.input}
            placeholder="Front (question)"
            placeholderTextColor={colors.textMuted}
            value={front}
            onChangeText={setFront}
            multiline
          />
          <TextInput
            style={styles.input}
            placeholder="Back (answer)"
            placeholderTextColor={colors.textMuted}
            value={back}
            onChangeText={setBack}
            multiline
          />
          <TouchableOpacity style={styles.createBtn} onPress={createCard}>
            <Text style={styles.createBtnText}>Create Card</Text>
          </TouchableOpacity>
        </View>
      )}

      {(offline || pending > 0) && (
        <View style={styles.offlineBar} accessibilityLiveRegion="polite">
          <MaterialIcons name={offline ? "cloud-off" : "cloud-upload"} size={18} color={colors.textSecondary} />
          <Text style={styles.offlineText}>
            {offline ? "Offline: reviewing saved cards." : "Back online."}
            {pending > 0 ? ` ${pending} review${pending === 1 ? "" : "s"} will sync when you're connected.` : ""}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaText}>{dueCards.length} due</Text>
          </View>
          <View style={[styles.metaPill, { backgroundColor: colors.locked }]}>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{totalCount} total</Text>
          </View>
          <Text style={styles.metaProgress}>
            {currentIdx + (dueCards.length ? 1 : 0)} / {dueCards.length} Reviewed
          </Text>
        </View>

        {current ? (
          <>
            <TouchableOpacity
              style={styles.flashcard}
              onPress={() => setFlipped(!flipped)}
              activeOpacity={0.9}
            >
              <Text style={styles.cardSide}>{flipped ? "Answer" : "Question"}</Text>
              <Text style={styles.cardContent}>{flipped ? current.back : current.front}</Text>
              <Text style={styles.tapHint}>Tap to {flipped ? "see question" : "reveal answer"}</Text>
            </TouchableOpacity>

            {flipped && (
              <View style={styles.qualityRow}>
                <Text style={styles.qualityLabel}>Recall Confidence</Text>
                <View style={styles.qualityBtns}>
                  {QUALITY_LABELS.map((label, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.qualityBtn, { borderColor: QUALITY_COLORS[i] }]}
                      onPress={() => review(i)}
                    >
                      <Text style={[styles.qualityBtnNum, { color: QUALITY_COLORS[i] }]}>{i}</Text>
                      <Text style={styles.qualityBtnLabel}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={48} color={colors.tertiary} />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyText}>No cards due for review right now.</Text>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  title: { ...typography.headlineLg, color: colors.text },
  createForm: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...typography.bodyMd,
    color: colors.text,
    minHeight: 48,
  },
  createBtn: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  createBtnText: { ...typography.labelLg, color: "#FFFFFF" },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  metaPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  metaText: { ...typography.labelMd, color: colors.primary },
  metaProgress: { ...typography.bodySm, color: colors.textSecondary },
  flashcard: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.lg,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardSide: { ...typography.labelMd, color: colors.textMuted, marginBottom: spacing.sm },
  cardContent: { ...typography.headlineSm, color: colors.text, textAlign: "center" },
  tapHint: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.md },
  qualityRow: { marginBottom: spacing.md },
  qualityLabel: { ...typography.labelMd, color: colors.textSecondary, marginBottom: spacing.sm, textAlign: "center" },
  qualityBtns: { flexDirection: "row", gap: spacing.xs },
  qualityBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    backgroundColor: colors.surfaceWhite,
  },
  qualityBtnNum: { ...typography.headlineSm },
  qualityBtnLabel: { ...typography.labelSm, color: colors.textSecondary },
  emptyState: { alignItems: "center", paddingTop: 60, gap: spacing.sm },
  emptyTitle: { ...typography.headlineSm, color: colors.text },
  emptyText: { ...typography.bodyMd, color: colors.textSecondary },
  offlineBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.locked,
  },
  offlineText: { ...typography.bodyMd, color: colors.textSecondary, flex: 1 },
});
