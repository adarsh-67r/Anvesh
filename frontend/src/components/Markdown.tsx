import { Fragment, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";
import { colors, fonts, spacing, typography } from "../lib/theme";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Inline **bold**, *italic* / _italic_ and `code`. */
function inline(text: string, base: TextStyle): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g);
  return parts.filter(Boolean).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <Text key={i} style={[base, styles.bold]}>{p.slice(2, -2)}</Text>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <Text key={i} style={[base, styles.code]}>{p.slice(1, -1)}</Text>;
    if ((p.startsWith("*") && p.endsWith("*") || p.startsWith("_") && p.endsWith("_")) && p.length > 2)
      return <Text key={i} style={[base, styles.italic]}>{p.slice(1, -1)}</Text>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** Renders the Markdown the AI tutor replies with: headings, lists, code blocks and inline emphasis. */
export function Markdown({ text, style }: { text: string; style?: TextStyle }) {
  const base = StyleSheet.flatten([styles.body, style]);
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i]);
      // Scroll sideways instead of wrapping, so indentation stays readable.
      blocks.push(
        <ScrollView key={i} horizontal style={styles.codeBlock} contentContainerStyle={styles.codeInner}>
          <Text style={[base, styles.codeText]}>{code.join("\n")}</Text>
        </ScrollView>,
      );
      continue;
    }
    if (!line.trim()) continue;
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<View key={i} style={styles.rule} />);
    } else if (heading) {
      blocks.push(<Text key={i} style={[base, styles.heading]}>{inline(heading[1].replace(/\*\*/g, ""), base)}</Text>);
    } else if (bullet || numbered) {
      const indent = ((bullet ?? numbered)![1].length >= 2 ? 1 : 0) * spacing.md;
      blocks.push(
        <View key={i} style={[styles.item, { paddingLeft: indent }]}>
          <Text style={[base, styles.marker]}>{bullet ? "•" : `${numbered![2]}.`}</Text>
          <Text style={[base, styles.itemText]}>{inline(bullet ? bullet[2] : numbered![3], base)}</Text>
        </View>,
      );
    } else {
      blocks.push(<Text key={i} style={base}>{inline(line, base)}</Text>);
    }
  }
  return <View style={styles.wrap}>{blocks}</View>;
}

/** Plain text for read-aloud: drops Markdown symbols so the voice doesn't say "asterisk". */
export const stripMarkdown = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*|__|`|\*|_/g, "");

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  body: { ...typography.bodyMd, color: colors.text },
  bold: fonts.bold,
  italic: { fontStyle: "italic" },
  code: { fontFamily: MONO, backgroundColor: colors.locked, fontSize: 13 },
  codeBlock: { backgroundColor: colors.locked, borderRadius: 8 },
  codeInner: { padding: spacing.sm },
  codeText: { fontFamily: MONO, fontSize: 13, lineHeight: 19 },
  heading: { ...typography.titleMd, color: colors.text, marginTop: 2 },
  item: { flexDirection: "row", gap: 6 },
  marker: { color: colors.primary, minWidth: 14 },
  itemText: { flex: 1 },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
