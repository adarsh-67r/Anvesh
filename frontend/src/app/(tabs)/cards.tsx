import { useCallback, useEffect, useState } from "react";
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
import Animated, { FadeIn, FadeInDown, SlideInRight, SlideOutLeft, ZoomIn, interpolate, useAnimatedStyle, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { PressableScale, enter } from "../../components/Motion";
import { feedback } from "../../lib/feedback";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { ScreenHeader } from "../../components/Sidebar";
import { Card, loadDueCards, reviewCard } from "../../lib/offline";
import { colors, typography, spacing, radii } from "../../lib/theme";

const QUALITY_LABELS = ["Blackout", "Forgot", "Familiar", "Hard", "Good", "Perfect"];
const QUALITY_COLORS = ["#BA1A1A", "#C2410C", "#EA580C", "#D97706", "#0EA5E9", "#10B981"];

/** A flashcard that turns over in 3D: question on the front face, answer on the back. */
function FlipCard({ front, back, flipped, onPress }: { front: string; back: string; flipped: boolean; onPress: () => void }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withTiming(flipped ? 180 : 0, { duration: 450, easing: Easing.inOut(Easing.cubic) });
  }, [flipped, r]);
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${r.value}deg` }],
    opacity: r.value < 90 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${r.value - 180}deg` }],
    opacity: r.value >= 90 ? 1 : 0,
  }));
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(Math.abs(90 - r.value), [0, 90], [1.04, 1]) }] }));
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={flipped ? `Answer: ${back}. Tap to see question` : `Question: ${front}. Tap to reveal answer`}>
      <Animated.View style={lift}>
        <Animated.View style={[styles.flashcard, frontStyle]}>
          <Text style={styles.cardSide}>Question</Text>
          <Text style={styles.cardContent}>{front}</Text>
          <Text style={styles.tapHint}>Tap to reveal answer</Text>
        </Animated.View>
        <Animated.View style={[styles.flashcard, styles.flashcardBack, StyleSheet.absoluteFill, backStyle]}>
          <Text style={[styles.cardSide, { color: colors.primary }]}>Answer</Text>
          <Text style={styles.cardContent}>{back}</Text>
          <Text style={styles.tapHint}>Tap to see question</Text>
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

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
    if (quality >= 4) feedback.correct(); else feedback.press();
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
            <Animated.View key={current.id} entering={SlideInRight.springify().damping(18)} exiting={SlideOutLeft.duration(200)}>
              <FlipCard front={current.front} back={current.back} flipped={flipped} onPress={() => setFlipped(!flipped)} />
            </Animated.View>

            {flipped && (
              <Animated.View entering={FadeInDown.delay(250).springify().damping(18)} style={styles.qualityRow}>
                <Text style={styles.qualityLabel}>Recall Confidence</Text>
                <View style={styles.qualityBtns}>
                  {QUALITY_LABELS.map((label, i) => (
                    <Animated.View key={i} entering={enter(i)} style={{ flex: 1 }}>
                    <PressableScale
                      haptic={false}
                      style={[styles.qualityBtn, { borderColor: QUALITY_COLORS[i] }]}
                      onPress={() => review(i)}
                      accessibilityLabel={`${i}, ${label}`}
                    >
                      <Text style={[styles.qualityBtnNum, { color: QUALITY_COLORS[i] }]}>{i}</Text>
                      <Text style={styles.qualityBtnLabel}>{label}</Text>
                    </PressableScale>
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>
            )}
          </>
        ) : (
          <Animated.View entering={FadeIn} style={styles.emptyState}>
            <Animated.View entering={ZoomIn.springify().damping(9)}>
              <MaterialIcons name="check-circle" size={56} color={colors.tertiary} />
            </Animated.View>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyText}>No cards due for review right now.</Text>
          </Animated.View>
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
    backfaceVisibility: "hidden",
  },
  flashcardBack: { backgroundColor: colors.primaryLight, borderColor: colors.primary, backfaceVisibility: "hidden" },
  cardSide: { ...typography.labelMd, color: colors.textMuted, marginBottom: spacing.sm },
  cardContent: { ...typography.headlineSm, color: colors.text, textAlign: "center" },
  tapHint: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.md },
  qualityRow: { marginBottom: spacing.md },
  qualityLabel: { ...typography.labelMd, color: colors.textSecondary, marginBottom: spacing.sm, textAlign: "center" },
  qualityBtns: { flexDirection: "row", gap: spacing.xs },
  qualityBtn: {
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
