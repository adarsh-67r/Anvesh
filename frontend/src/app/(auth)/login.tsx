import { useState, type ComponentProps } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInLeft, ZoomIn } from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { Drift, PressableScale } from "../../components/Motion";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { SPACES } from "../../lib/workspace";
import { colors, typography, spacing, radii, fonts } from "../../lib/theme";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

const DEMOS: { label: string; email: string; icon: IconName; blurb: string; space: keyof typeof SPACES }[] = [
  { label: "Official", email: "officer@anvesh.in", icon: "badge", space: "learn", blurb: "Competency profile, gaps and a personal learning path" },
  { label: "Trainer", email: "trainer@anvesh.in", icon: "auto-awesome", space: "trainer", blurb: "Turn material into quizzes and track learner results" },
  { label: "Admin", email: "admin@anvesh.in", icon: "insights", space: "admin", blurb: "Workforce gaps, training effectiveness and roles" },
];

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: "account-tree", text: "Official Statistics competency framework across 4 domains" },
  { icon: "track-changes", text: "Gap analysis against what each role requires" },
  { icon: "school", text: "Learning paths from iGOT Karmayogi and NSSTA courses" },
  { icon: "quiz", text: "AI-generated assessments from PDFs, slides and videos" },
];

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const wide = width >= 960;

  const handleSubmit = (demo?: string) => async () => {
    if (!demo && (!email.trim() || !password.trim())) return;
    setLoading(true);
    try {
      if (demo) {
        await login(demo, "demo1234");
      } else if (isSignUp) {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <Animated.View entering={FadeInDown.delay(250).springify().damping(18)} style={[styles.form, wide && styles.formWide]}>
      <Text style={styles.formTitle}>{isSignUp ? "Create account" : "Sign in"}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={handleSubmit()}
        />
      </View>

      <PressableScale style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit()} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Please wait..." : isSignUp ? "Sign up" : "Log in"}</Text>
      </PressableScale>

      <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.switchBtn}>
        <Text style={styles.switchText}>
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <Text style={styles.switchTextBold}>{isSignUp ? "Log in" : "Sign up"}</Text>
        </Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.demoLabel}>or explore a demo console</Text>
        <View style={styles.line} />
      </View>
      {DEMOS.map((d, i) => {
        const s = SPACES[d.space];
        return (
          <Animated.View key={d.email} entering={FadeInDown.delay(400 + i * 80).springify().damping(18)}>
            <PressableScale
              style={[styles.role, loading && styles.buttonDisabled]}
              onPress={handleSubmit(d.email)}
              disabled={loading}
              accessibilityLabel={`Try as ${d.label}`}
            >
              <View style={[styles.roleIcon, { backgroundColor: s.tint }]}>
                <MaterialIcons name={d.icon} size={20} color={s.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleTitle, { color: s.accent }]}>{d.label}</Text>
                <Text style={styles.roleBlurb}>{d.blurb}</Text>
              </View>
              <MaterialIcons name="arrow-forward" size={20} color={s.accent} />
            </PressableScale>
          </Animated.View>
        );
      })}
    </Animated.View>
  );

  if (wide) {
    return (
      <View style={styles.split}>
        <View style={styles.brandPanel}>
          <Drift style={[styles.glow, { width: 420, height: 420, top: -140, right: -160 }]} duration={9000} />
          <Drift style={[styles.glow, { width: 300, height: 300, bottom: -120, left: -100 }]} duration={8000} range={24} />
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.brandRow}>
            <Image source={require("../../../assets/icon.png")} style={styles.brandLogo} />
            <Text style={styles.brandName}>Anvesh</Text>
          </Animated.View>
          <Animated.Text entering={FadeInLeft.delay(120)} style={styles.headline}>
            Skill intelligence for India’s Official Statistical System
          </Animated.Text>
          <Animated.Text entering={FadeInLeft.delay(200)} style={styles.lede}>
            Know every official’s competencies, close the gaps that matter, and measure whether training works.
          </Animated.Text>
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {FEATURES.map((f, i) => (
              <Animated.View key={f.text} entering={FadeInLeft.delay(280 + i * 70)} style={styles.feature}>
                <View style={styles.featureIcon}><MaterialIcons name={f.icon} size={18} color="#FFFFFF" /></View>
                <Text style={styles.featureText}>{f.text}</Text>
              </Animated.View>
            ))}
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formSide}>{form}</ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Drift style={[styles.blob, { width: 260, height: 260, top: -90, right: -90 }]} duration={7000} />
      <Drift style={[styles.blob, { width: 180, height: 180, bottom: -60, left: -70, backgroundColor: colors.secondaryLight }]} duration={8000} range={24} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Animated.View entering={ZoomIn.springify().damping(10)}>
              <Image source={require("../../../assets/icon.png")} style={styles.logo} />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(150)} style={styles.title}>Anvesh</Animated.Text>
            <Animated.Text entering={FadeInDown.delay(250)} style={styles.subtitle}>Skill intelligence for Official Statistics</Animated.Text>
          </View>
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 999, backgroundColor: colors.primaryLight },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  header: { alignItems: "center", marginBottom: spacing.lg },
  logo: { width: 72, height: 72, borderRadius: radii.xl, marginBottom: spacing.sm },
  title: { ...typography.headlineLg, color: colors.primary },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, marginTop: spacing.xs },

  split: { flex: 1, flexDirection: "row", backgroundColor: colors.surface },
  brandPanel: { flex: 1.1, backgroundColor: colors.primary, padding: 64, justifyContent: "center", overflow: "hidden" },
  glow: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  brandLogo: { width: 44, height: 44, borderRadius: radii.lg, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" },
  brandName: { ...typography.headlineMd, color: "#FFFFFF" },
  headline: { ...typography.displayLg, fontSize: 44, lineHeight: 52, color: "#FFFFFF", maxWidth: 560 },
  lede: { ...typography.bodyLg, fontSize: 18, lineHeight: 28, color: "rgba(255,255,255,0.85)", marginTop: spacing.md, maxWidth: 520 },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  featureText: { ...typography.bodyLg, color: "#FFFFFF", flex: 1 },
  formSide: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },

  form: { backgroundColor: colors.surfaceWhite, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, width: "100%", maxWidth: 460, alignSelf: "center" },
  formWide: { borderWidth: 0, backgroundColor: "transparent", padding: 0 },
  formTitle: { ...typography.headlineMd, color: colors.text, marginBottom: spacing.lg },
  inputGroup: { marginBottom: spacing.md },
  label: { ...typography.labelMd, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceWhite,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.text,
  },
  button: { height: 48, borderRadius: radii.lg, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", marginTop: spacing.xs },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...typography.labelLg, color: "#FFFFFF" },
  switchBtn: { marginTop: spacing.md, alignItems: "center" },
  switchText: { ...typography.bodyMd, color: colors.textSecondary },
  switchTextBold: { ...fonts.bold, color: colors.primary },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  demoLabel: { ...typography.bodySm, color: colors.textSecondary },
  role: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, marginTop: spacing.sm,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceWhite,
  },
  roleIcon: { width: 40, height: 40, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  roleTitle: { ...typography.titleMd },
  roleBlurb: { ...typography.bodySm, color: colors.textSecondary },
});
