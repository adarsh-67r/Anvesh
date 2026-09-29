import { useCallback, useEffect, useRef, useState } from "react";
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
import Animated, { FadeIn, FadeInUp, ZoomIn } from "react-native-reanimated";
import { TypingDots } from "../../components/Motion";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { AI_FILE_TYPES, api, Attachment, openAttachment, PickedFile, pickFile, uploadAttachment , errorDetail } from "../../lib/api";
import { colors, typography, spacing, radii } from "../../lib/theme";
import { Markdown, stripMarkdown } from "../../components/Markdown";
import { playTrack } from "../../lib/focusMusic";
import { ScreenHeader } from "../../components/Sidebar";

type Message = { role: string; content: string; created_at: string; attachment?: Attachment | null };

const fileIcon = (type: string) => (type.startsWith("image/") ? "image" : type === "application/pdf" ? "picture-as-pdf" : "description");

const speakText = (markdown: string) => {
  const text = stripMarkdown(markdown);
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
  const { label: skillLabel } = useLocalSearchParams<{ label?: string }>();
  const [pending, setPending] = useState<PickedFile | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const recording = recState.isRecording;
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});

  const startRecording = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert("Microphone", "Allow microphone access to ask questions by voice.");
      return;
    }
    try {
      // Focus music holds the audio session; stop it so the mic can record.
      await playTrack(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: "mixWithOthers" });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      Alert.alert("Voice Input", `Could not start the microphone. ${(e as Error)?.message ?? ""}`.trim());
      return;
    }
    // Keep recordings short so uploads stay under the 5 MB limit.
    autoStopRef.current = setTimeout(() => stopRecordingRef.current(), 60000);
  };

  const stopRecording = async () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
    if (!recorder.isRecording) return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri) return;
    setTranscribing(true);
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("file", blob, "voice.webm");
      } else {
        form.append("file", { uri, name: "voice.m4a", type: "audio/m4a" } as unknown as Blob);
      }
      const send = () => api.upload<{ text: string }>("/api/chat/transcribe", form);
      // One retry: the server may be waking up or the AI briefly busy.
      const { text } = await send().catch(() => new Promise<{ text: string }>((ok, fail) => setTimeout(() => send().then(ok, fail), 1500)));
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
      else Alert.alert("Voice Input", "Didn't catch that. Try again a little closer to the mic.");
    } catch (e) {
      const raw = (e as Error)?.message ?? String(e);
      Alert.alert("Voice Input", errorDetail(e, `Could not transcribe. Please try again.

(${raw.slice(0, 160)})`));
    } finally {
      setTranscribing(false);
    }
  };


  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      api.get<Message[]>("/api/chat/history?limit=50").then(setMessages).catch(() => {});
    }, [])
  );

  useEffect(() => { stopRecordingRef.current = stopRecording; });
  useEffect(() => () => { if (autoStopRef.current) clearTimeout(autoStopRef.current); }, []);

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
      const res = await api.post<{ reply: string }>("/api/chat", { message: text, attachment_id: uploaded?.id, skill_context: skillLabel || undefined });
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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScreenHeader title="AI Assistant" subtitle={skillLabel ? `Helping with ${skillLabel}` : "Ask anything, by text, voice or photo"} />

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
            <Animated.View entering={FadeIn.delay(150)} style={styles.emptyState}>
              <Animated.View entering={ZoomIn.springify().damping(10)}>
                <MaterialIcons name="school" size={44} color={colors.primary} />
              </Animated.View>
              <Text style={styles.emptyText}>Ask me anything about your studies!</Text>
            </Animated.View>
          )}
          {messages.map((msg, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.springify().damping(18)}
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
              {msg.role === "user" ? (
                <Text style={[styles.bubbleText, styles.userBubbleText]}>{msg.content}</Text>
              ) : (
                <Markdown text={msg.content} style={styles.bubbleText} />
              )}
            </Animated.View>
          ))}
          {sending && (
            <Animated.View entering={FadeInUp.springify().damping(18)} style={[styles.bubble, styles.aiBubble, { paddingVertical: 14 }]}>
              <TypingDots />
            </Animated.View>
          )}
        </ScrollView>

        {recording && (
          <Animated.View entering={FadeInUp} style={styles.recordingBar} accessibilityLiveRegion="polite">
            <MaterialIcons name="fiber-manual-record" size={14} color={colors.error} />
            <Text style={styles.recordingText}>
              Listening... {Math.floor(recState.durationMillis / 1000)}s. Tap stop when done.
            </Text>
          </Animated.View>
        )}
        {pending && (
          <Animated.View entering={FadeInUp} style={styles.pendingBar}>
            <MaterialIcons name={fileIcon(pending.mimeType)} size={18} color={colors.primary} />
            <Text style={styles.pendingText} numberOfLines={1}>{pending.name}</Text>
            <TouchableOpacity onPress={() => setPending(null)} hitSlop={8} accessibilityLabel="Remove attachment">
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
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
            placeholder="Ask your AI assistant..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.micBtn, recording && styles.micBtnRecording]}
            onPress={recording ? stopRecording : startRecording}
            disabled={transcribing || sending}
            accessibilityLabel={recording ? "Stop recording" : "Ask by voice"}
          >
            {transcribing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name={recording ? "stop" : "mic"} size={20} color={recording ? "#FFFFFF" : colors.textSecondary} />
            )}
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
  micBtnRecording: { backgroundColor: colors.error },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.errorLight,
  },
  recordingText: { ...typography.bodyMd, color: colors.error, flex: 1 },
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
