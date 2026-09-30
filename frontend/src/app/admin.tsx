import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useOrg } from "../lib/org";
import { DOMAIN_COLORS, type Domain } from "../lib/skills";
import { colors, spacing, typography } from "../lib/theme";
import { Card, Chip, Empty, Page, PercentBar, SectionTitle, shared } from "../components/Skill";
import { Skeleton } from "../components/Motion";

const DOMAINS: { id: Domain; label: string }[] = [
  { id: "statistical", label: "Statistical" }, { id: "technical", label: "Technical" },
  { id: "digital", label: "Digital Governance" }, { id: "behavioural", label: "Behavioural" },
];

export default function WorkforceGaps() {
  const { width } = useWindowDimensions();
  const { org, error, reload } = useOrg();
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [sort, setSort] = useState<"gap" | "meeting">("gap");
  const [refreshing, setRefreshing] = useState(false);
  const wide = width >= 900;

  const rows = (org?.distribution ?? [])
    .filter((d) => domain === "all" || d.domain === domain)
    .sort((a, b) => (sort === "gap" ? b.total_gap - a.total_gap : a.percent_meeting - b.percent_meeting));

  return (
    <Page title="Workforce Gaps" subtitle="Where competencies fall short of what roles require"
      onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} refreshing={refreshing}>
      {!org && !error && <Skeleton height={220} />}
      {error && <Empty icon="lock" title="Couldn't load workforce analytics" body="This view is for administrators." />}
      {org && (
        <>
          <View style={wide ? styles.cols : undefined}>
            <View style={wide ? { flex: 1 } : undefined}>
              <SectionTitle>Priority training needs</SectionTitle>
              <Card>
                <Text style={shared.muted}>Largest total gap across the officials whose roles need the competency.</Text>
                {org.top_gaps.map((d) => (
                  <PercentBar key={d.id} label={d.name} value={d.percent_meeting} sub={`avg ${d.average_level}/5 · ${d.officials} need it`} color={DOMAIN_COLORS[d.domain]} />
                ))}
              </Card>
            </View>
            <View style={wide ? { flex: 1 } : undefined}>
              <SectionTitle>Emerging skill needs</SectionTitle>
              <Card>
                <Text style={shared.muted}>AI, cloud, open data, APIs and digital governance: where the future workforce is weakest.</Text>
                {org.emerging_needs.map((d) => (
                  <PercentBar key={d.id} label={d.name} value={d.percent_meeting} sub={`avg ${d.average_level}/5`} color={colors.error} />
                ))}
              </Card>
            </View>
          </View>

          <SectionTitle>All competencies</SectionTitle>
          <View style={shared.wrap}>
            <Chip label="All domains" active={domain === "all"} onPress={() => setDomain("all")} />
            {DOMAINS.map((d) => <Chip key={d.id} label={d.label} active={domain === d.id} onPress={() => setDomain(d.id)} />)}
          </View>
          <View style={shared.wrap}>
            <Chip icon="sort" label="Biggest gap first" active={sort === "gap"} onPress={() => setSort("gap")} />
            <Chip icon="sort" label="Fewest meeting first" active={sort === "meeting"} onPress={() => setSort("meeting")} />
          </View>
          <Card>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.cell, { flex: 3, textAlign: "left" }]}>Competency</Text>
              <Text style={styles.cell}>Officials</Text>
              <Text style={styles.cell}>Avg level</Text>
              <Text style={styles.cell}>Meeting</Text>
              <Text style={styles.cell}>Total gap</Text>
            </View>
            {rows.map((d) => (
              <View key={d.id} style={styles.tr}>
                <View style={[shared.row, { flex: 3 }]}>
                  <View style={[styles.dot, { backgroundColor: DOMAIN_COLORS[d.domain] }]} />
                  <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{d.name}</Text>
                </View>
                <Text style={styles.cell}>{d.officials}</Text>
                <Text style={styles.cell}>{d.average_level}/5</Text>
                <Text style={[styles.cell, { color: d.percent_meeting < 30 ? colors.error : colors.textSecondary }]}>{d.percent_meeting}%</Text>
                <Text style={styles.cell}>{d.total_gap}</Text>
              </View>
            ))}
            <Text style={shared.muted}>Total gap = sum over officials of (required level − current level), levels 0–5.</Text>
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: spacing.md },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  th: { borderTopWidth: 0, paddingTop: 0 },
  cell: { ...typography.bodySm, color: colors.textSecondary, flex: 1, textAlign: "right" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
