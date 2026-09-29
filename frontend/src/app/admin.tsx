import { useCallback, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { DOMAIN_COLORS, SOURCE_LABEL, type Domain } from "../lib/skills";
import { colors, spacing, typography } from "../lib/theme";
import { Badge, Button, Card, Chip, Empty, Page, SectionTitle, Stat, shared } from "../components/Skill";
import { Skeleton } from "../components/Motion";

type Dist = { id: string; name: string; domain: Domain; officials: number; average_level: number; percent_meeting: number; total_gap: number };
type Org = {
  officials: number; users: number; average_readiness: number; projected_readiness: number; enrolments: number; completions: number;
  by_department: { department: string; officials: number; readiness: number }[];
  by_role: { role: string; officials: number; readiness: number }[];
  distribution: Dist[]; top_gaps: Dist[]; emerging_needs: Dist[];
  training_effectiveness: { id: string; title: string; source: "igot" | "nssta"; enrolled: number; completed: number; completion_rate: number; average_score: number | null }[];
};

function Bar({ label, value, sub, color = colors.primary }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <View style={styles.barRow}>
      <View style={[shared.row, { justifyContent: "space-between" }]}>
        <Text style={shared.body} numberOfLines={1}>{label}</Text>
        <Text style={shared.muted}>{value}%{sub ? ` · ${sub}` : ""}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, value)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const [org, setOrg] = useState<Org | null>(null);
  const [error, setError] = useState(false);
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [syncing, setSyncing] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.get<Org>("/api/dashboard/org").then((o) => { setOrg(o); setError(false); }).catch(() => setError(true)), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sync = async () => {
    setSyncing("Syncing…");
    const r = await api.post<{ synced: Record<string, number> }>("/api/courses/sync").catch(() => null);
    setSyncing(r ? `Synced ${Object.entries(r.synced).map(([k, v]) => `${v} ${SOURCE_LABEL[k as "igot" | "nssta"] ?? k}`).join(", ")} courses` : "Sync failed");
  };

  const wide = width >= 900;
  const col = wide ? { flex: 1 } : undefined;
  return (
    <Page title="Organisation" subtitle="Workforce competencies across the Official Statistical System"
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} refreshing={refreshing}>
      {!org && !error && <Skeleton height={200} />}
      {error && <Empty icon="lock" title="Couldn't load the organisation dashboard" body="This view is for administrators." />}
      {org && (
        <>
          <View style={shared.wrap}>
            <Stat label="Officials profiled" value={String(org.officials)} icon="badge" />
            <Stat label="Average role readiness" value={`${org.average_readiness}%`} icon="speed" tint={colors.secondary} />
            <Stat label="Projected after enrolments" value={`${org.projected_readiness}%`} icon="trending-up" tint={colors.tertiary} />
            <Stat label="Course completions" value={`${org.completions} / ${org.enrolments}`} icon="task-alt" tint="#D97706" />
          </View>

          <View style={wide ? styles.cols : undefined}>
            <View style={col}>
              <SectionTitle>Priority training needs</SectionTitle>
              <Card>
                <Text style={shared.muted}>Competencies with the largest total gap across officials who need them.</Text>
                {org.top_gaps.map((d) => (
                  <Bar key={d.id} label={d.name} value={d.percent_meeting} sub={`avg ${d.average_level}/5 · ${d.officials} need it`} color={DOMAIN_COLORS[d.domain]} />
                ))}
                <Text style={shared.muted}>Bar = % of officials meeting their role’s requirement.</Text>
              </Card>
            </View>
            <View style={col}>
              <SectionTitle>Emerging skill needs</SectionTitle>
              <Card>
                <Text style={shared.muted}>AI, cloud, data platforms and digital governance — where the future workforce is weakest.</Text>
                {org.emerging_needs.map((d) => (
                  <Bar key={d.id} label={d.name} value={d.percent_meeting} sub={`avg ${d.average_level}/5`} color={colors.error} />
                ))}
              </Card>
            </View>
          </View>

          <View style={wide ? styles.cols : undefined}>
            <View style={col}>
              <SectionTitle>Readiness by department</SectionTitle>
              <Card>{org.by_department.map((d) => <Bar key={d.department} label={d.department} value={d.readiness} sub={`${d.officials}`} />)}</Card>
            </View>
            <View style={col}>
              <SectionTitle>Readiness by role</SectionTitle>
              <Card>{org.by_role.map((r) => <Bar key={r.role} label={r.role} value={r.readiness} sub={`${r.officials}`} color={colors.secondary} />)}</Card>
            </View>
          </View>

          <SectionTitle>Training effectiveness</SectionTitle>
          <Card>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.cell, { flex: 3 }]}>Course</Text>
              <Text style={styles.cell}>Enrolled</Text>
              <Text style={styles.cell}>Completed</Text>
              <Text style={styles.cell}>Avg score</Text>
            </View>
            {org.training_effectiveness.map((t) => (
              <View key={t.id} style={styles.tr}>
                <View style={{ flex: 3, gap: 2 }}>
                  <Text style={shared.body} numberOfLines={2}>{t.title}</Text>
                  <Badge label={SOURCE_LABEL[t.source]} tint={t.source === "igot" ? "#D97706" : colors.primary} />
                </View>
                <Text style={styles.cell}>{t.enrolled}</Text>
                <Text style={styles.cell}>{t.completion_rate}%</Text>
                <Text style={styles.cell}>{t.average_score == null ? "–" : `${t.average_score}%`}</Text>
              </View>
            ))}
          </Card>

          <SectionTitle>Competency distribution</SectionTitle>
          <View style={shared.wrap}>
            <Chip label="All" active={domain === "all"} onPress={() => setDomain("all")} />
            {(["statistical", "technical", "digital", "behavioural"] as Domain[]).map((d) => (
              <Chip key={d} label={d[0].toUpperCase() + d.slice(1)} active={domain === d} onPress={() => setDomain(d)} />
            ))}
          </View>
          <Card>
            {org.distribution.filter((d) => domain === "all" || d.domain === domain).map((d) => (
              <Bar key={d.id} label={d.name} value={d.percent_meeting} sub={`avg ${d.average_level}/5 · ${d.officials}`} color={DOMAIN_COLORS[d.domain]} />
            ))}
          </Card>

          <SectionTitle>Catalogue</SectionTitle>
          <Card>
            <Text style={shared.muted}>Pull the latest iGOT Karmayogi and NSSTA course catalogue through the connectors.</Text>
            <View style={[shared.row, { flexWrap: "wrap" }]}>
              <Button label="Sync catalogue" icon="sync" kind="secondary" onPress={sync} busy={syncing === "Syncing…"} />
              {syncing && syncing !== "Syncing…" ? <Text style={shared.muted}>{syncing}</Text> : null}
            </View>
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: spacing.md },
  barRow: { gap: 6, paddingVertical: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.locked, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  th: { borderTopWidth: 0, paddingTop: 0 },
  cell: { ...typography.bodySm, color: colors.textSecondary, flex: 1, textAlign: "right" },
});

