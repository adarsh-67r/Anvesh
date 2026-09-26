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
import { AI_FILE_TYPES, api, Attachment, openAttachment, PickedFile, pickFile, uploadAttachment } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";

type Message = { role: string; content: string; created_at: string; attachment?: Attachment | null };

const fileIcon = (type: string) => (type.startsWith("image/") ? "image" : type === "application/pdf" ? "picture-as-pdf" : "description");

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
  const [pending, setPending] = useState<PickedFile | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      api.get<Message[]>("/api/chat/history?limit=50").then(setMessages).catch(() => {});
    }, [])
  );

  const attach = async () => {
    try {
      const picked = await pickFile(AI_FILE_TYPES);
      if (picked) setPending(picked);
    } catch (e: any) {
      Alert.alert("Attachment", e.message || "Could not open the file.");
    }
  };

  const send = async () => {
    const text = input.trim();
    const file = pending;
    if ((!text && !file) || sending) return;
    setInput("");
    setPending(null);
    const userMsg: Message = {
      role: "user",
      content: text || "Please help me with this file.",
      created_at: new Date().toISOString(),
      attachment: file ? { id: "", filename: file.name, content_type: file.mimeType } : null,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const uploaded = file ? await uploadAttachment(file) : null;
      if (uploaded) {
        setMessages((prev) => prev.map((m) => (m === userMsg ? { ...m, attachment: uploaded } : m)));
      }
      const res = await api.post<{ reply: string }>("/api/chat", { message: text, attachment_id: uploaded?.id });
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
              {msg.attachment && (
                <TouchableOpacity
                  style={styles.fileChip}
                  disabled={!msg.attachment.id}
                  onPress={() => msg.attachment?.id && openAttachment(msg.attachment.id).catch(() => Alert.alert("Attachment", "Could not open the file."))}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${msg.attachment.filename}`}
                >
                  <MaterialIcons name={fileIcon(msg.attachment.content_type)} size={18} color={colors.primary} />
                  <Text style={styles.fileChipText} numberOfLines={1}>{msg.attachment.filename}</Text>
                </TouchableOpacity>
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

        {pending && (
          <View style={styles.pendingBar}>
            <MaterialIcons name={fileIcon(pending.mimeType)} size={18} color={colors.primary} />
            <Text style={styles.pendingText} numberOfLines={1}>{pending.name}</Text>
            <TouchableOpacity onPress={() => setPending(null)} hitSlop={8} accessibilityLabel="Remove attachment">
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.micBtn}
            onPress={attach}
            disabled={sending}
            accessibilityLabel="Attach image or PDF"
          >
            <MaterialIcons name="attach-file" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
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
            style={[styles.sendBtn, ((!input.trim() && !pending) || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={(!input.trim() && !pending) || sending}
            accessibilityLabel="Send message"
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
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
    maxWidth: 240,
  },
  fileChipText: { ...typography.labelMd, color: colors.primary, flexShrink: 1 },
  pendingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  pendingText: { ...typography.bodyMd, color: colors.text, flex: 1 },
});
