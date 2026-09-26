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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  api,
  Attachment,
  GROUP_FILE_TYPES,
  openAttachment,
  PickedFile,
  pickFile,
  uploadAttachment,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, typography, spacing, radii } from "../../lib/theme";

type GroupMessage = {
  id: string;
  user_id: string;
  sender: string;
  content: string;
  created_at: string;
  attachment: Attachment | null;
};

const POLL_MS = 4000;

const fileIcon = (type: string) => (type.startsWith("image/") ? "image" : type === "application/pdf" ? "picture-as-pdf" : "description");

const timeOf = (iso: string) => {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function GroupChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PickedFile | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastAt = useRef<string | null>(null);

  const merge = useCallback((incoming: GroupMessage[]) => {
    if (!incoming.length) return;
    lastAt.current = incoming[incoming.length - 1].created_at;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      merge(await api.get<GroupMessage[]>(`/api/groups/${id}/messages${q}`));
    } catch {}
    setLoaded(true);
  }, [id, merge]);

  useFocusEffect(
    useCallback(() => {
      poll();
      const timer = setInterval(poll, POLL_MS);
      return () => clearInterval(timer);
    }, [poll])
  );

  const attach = async () => {
    try {
      const picked = await pickFile(GROUP_FILE_TYPES);
      if (picked) setPending(picked);
    } catch (e: any) {
      Alert.alert("Attachment", e.message || "Could not open the file.");
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pending) || sending) return;
    setSending(true);
    try {
      const uploaded = pending ? await uploadAttachment(pending, id) : null;
      const msg = await api.post<GroupMessage>(`/api/groups/${id}/messages`, {
        content: text,
        attachment_id: uploaded?.id,
      });
      setInput("");
      setPending(null);
      merge([msg]);
    } catch (e: any) {
      Alert.alert("Not sent", e.message || "Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{name || "Group chat"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!loaded && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />}
          {loaded && messages.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="forum" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No messages yet. Say hi to your study group!</Text>
            </View>
          )}
          {messages.map((m) => {
            const mine = m.user_id === user?.id;
            return (
              <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!mine && <Text style={styles.sender}>{m.sender}</Text>}
                {m.attachment && (
                  <TouchableOpacity
                    style={styles.fileChip}
                    onPress={() => openAttachment(m.attachment!.id).catch(() => Alert.alert("Error", "Could not open the file."))}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${m.attachment.filename}`}
                  >
                    <MaterialIcons name={fileIcon(m.attachment.content_type)} size={18} color={colors.primary} />
                    <Text style={styles.fileChipText} numberOfLines={1}>{m.attachment.filename}</Text>
                  </TouchableOpacity>
                )}
                {!!m.content && <Text style={[styles.text, mine && styles.textMine]}>{m.content}</Text>}
                <Text style={[styles.time, mine && styles.timeMine]}>{timeOf(m.created_at)}</Text>
              </View>
            );
          })}
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
          <TouchableOpacity style={styles.iconBtn} onPress={attach} disabled={sending} accessibilityLabel="Attach a file">
            <MaterialIcons name="attach-file" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Message your group..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, ((!input.trim() && !pending) || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={(!input.trim() && !pending) || sending}
            accessibilityLabel="Send message"
          >
            {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="send" size={20} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  topTitle: { ...typography.titleMd, color: colors.text, flex: 1, textAlign: "center", marginHorizontal: spacing.sm },
  chatContent: { padding: spacing.md, paddingBottom: spacing.lg },
  emptyState: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyText: { ...typography.bodyMd, color: colors.textMuted, textAlign: "center" },
  bubble: { maxWidth: "85%", padding: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.xl, marginBottom: spacing.sm },
  mine: { backgroundColor: colors.primary, alignSelf: "flex-end", borderBottomRightRadius: radii.sm },
  theirs: {
    backgroundColor: colors.surfaceWhite,
    alignSelf: "flex-start",
    borderBottomLeftRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sender: { ...typography.labelMd, color: colors.primary, marginBottom: 2 },
  text: { ...typography.bodyMd, color: colors.text },
  textMine: { color: "#FFFFFF" },
  time: { ...typography.bodySm, color: colors.textMuted, alignSelf: "flex-end", marginTop: 2 },
  timeMine: { color: "rgba(255,255,255,0.75)" },
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
  iconBtn: {
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
});
