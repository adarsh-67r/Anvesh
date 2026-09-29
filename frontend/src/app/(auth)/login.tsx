import { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { Drift, PressableScale } from "../../components/Motion";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { colors, typography, spacing, radii, fonts } from "../../lib/theme";

const DEMOS = [
  { label: "Official", email: "officer@anvesh.in" },
  { label: "Trainer", email: "trainer@anvesh.in" },
  { label: "Admin", email: "admin@anvesh.in" },
];

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <SafeAreaView style={styles.container}>
      <Drift style={[styles.blob, { width: 260, height: 260, top: -90, right: -90 }]} duration={7000} />
      <Drift style={[styles.blob, { width: 180, height: 180, bottom: -60, left: -70, backgroundColor: colors.secondaryLight }]} duration={8000} range={24} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <View style={styles.header}>
          <Animated.View entering={ZoomIn.springify().damping(10)}>
            <Image source={require("../../../assets/icon.png")} style={styles.logo} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(150)} style={styles.title}>Anvesh</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(250)} style={styles.subtitle}>Skill intelligence for Official Statistics</Animated.Text>
        </View>

        <Animated.View entering={FadeInDown.delay(350).springify().damping(18)} style={styles.form}>
          <Text style={styles.formTitle}>{isSignUp ? "Create Account" : "Welcome Back"}</Text>

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
            />
          </View>

          <PressableScale
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit()}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Log In"}
            </Text>
          </PressableScale>

          <Text style={styles.demoLabel}>Try a demo account</Text>
          <View style={styles.demoRow}>
            {DEMOS.map((d) => (
              <PressableScale
                key={d.email}
                style={[styles.demoButton, styles.demoChoice, loading && styles.buttonDisabled]}
                onPress={handleSubmit(d.email)}
                disabled={loading}
                accessibilityLabel={`Try as ${d.label}`}
              >
                <Text style={styles.demoButtonText}>{d.label}</Text>
              </PressableScale>
            ))}
          </View>

          <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.switchBtn}>
            <Text style={styles.switchText}>
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <Text style={styles.switchTextBold}>{isSignUp ? "Log In" : "Sign Up"}</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 999, backgroundColor: colors.primaryLight },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  header: { alignItems: "center", marginBottom: spacing.xl },
  logo: { width: 80, height: 80, borderRadius: radii.xl, marginBottom: spacing.md },
  title: { ...typography.headlineLg, color: colors.primary },
  subtitle: { ...typography.bodyMd, color: colors.textSecondary, marginTop: spacing.xs },
  form: {
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  button: {
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  demoButton: {
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  demoButtonText: { ...typography.labelLg, color: colors.primary },
  demoLabel: { ...typography.bodySm, color: colors.textSecondary, textAlign: "center", marginTop: spacing.md },
  demoRow: { flexDirection: "row", gap: spacing.sm },
  demoChoice: { flex: 1, marginTop: spacing.xs },
  buttonText: { ...typography.labelLg, color: "#FFFFFF" },
  switchBtn: { marginTop: spacing.md, alignItems: "center" },
  switchText: { ...typography.bodyMd, color: colors.textSecondary },
  switchTextBold: { ...fonts.bold, color: colors.primary },
});
