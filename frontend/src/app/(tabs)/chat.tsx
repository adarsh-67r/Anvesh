import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Speech from "expo-speech";
import { api } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Message = { role: string; content: string; created_at: string };

const speakText = (text: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } else {
    Speech.stop();
    Speech.speak(text);
  }
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      api.get<Message[]>("/api/chat/history?limit=50").then(setMessages).catch(() => {});
    }, [])
  );

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const res = await api.post<{ reply: string }>("/api/chat", { message: text });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, created_at: new Date().toISOString() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Try again.", created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <MaterialIcons name="smart-toy" size={24} color={colors.primary} />
        <Text style={styles.title}>AI Tutor</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="school" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Ask me anything about your studies!</Text>
            </View>
          )}
          {messages.map((msg, i) => (
            <View
              key={i}
              style={[styles.bubble, msg.role === "user" ? styles.userBubble : styles.aiBubble]}
            >
              {msg.role !== "user" && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <MaterialIcons name="smart-toy" size={16} color={colors.primary} />
                  <TouchableOpacity onPress={() => speakText(msg.content)} hitSlop={8}>
                    <MaterialIcons name="volume-up" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={[styles.bubbleText, msg.role === "user" && styles.userBubbleText]}>
                {msg.content}
              </Text>
            </View>
          ))}
          {sending && (
            <View style={[styles.bubble, styles.aiBubble, { paddingVertical: 12 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Ask your AI tutor..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={styles.micBtn}
            onPress={() => Alert.alert("Voice Input", "Voice input coming soon.")}
          >
            <MaterialIcons name="mic" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
          >
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceWhite,
  },
  title: { ...typography.headlineSm, color: colors.text },
  chatArea: { flex: 1 },
  chatContent: { padding: spacing.md, paddingBottom: spacing.lg },
  emptyState: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyText: { ...typography.bodyMd, color: colors.textMuted },
  bubble: {
    maxWidth: "85%",
    padding: spacing.md,
    borderRadius: radii.xl,
    marginBottom: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: "flex-end",
    borderBottomRightRadius: radii.sm,
  },
  aiBubble: {
    backgroundColor: colors.surfaceWhite,
    alignSelf: "flex-start",
    borderBottomLeftRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { ...typography.bodyMd, color: colors.text },
  userBubbleText: { color: "#FFFFFF" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceWhite,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodyMd,
    color: colors.text,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.locked,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
});
