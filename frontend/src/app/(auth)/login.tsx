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
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { colors, typography, spacing, radii, fonts } from "../../lib/theme";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      if (isSignUp) {
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <View style={styles.header}>
          <Image source={require("../../../assets/icon.png")} style={styles.logo} />
          <Text style={styles.title}>Anvesh</Text>
          <Text style={styles.subtitle}>Your adaptive learning companion</Text>
        </View>

        <View style={styles.form}>
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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Log In"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.switchBtn}>
            <Text style={styles.switchText}>
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <Text style={styles.switchTextBold}>{isSignUp ? "Log In" : "Sign Up"}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
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
  buttonText: { ...typography.labelLg, color: "#FFFFFF" },
  switchBtn: { marginTop: spacing.md, alignItems: "center" },
  switchText: { ...typography.bodyMd, color: colors.textSecondary },
  switchTextBold: { ...fonts.bold, color: colors.primary },
});
