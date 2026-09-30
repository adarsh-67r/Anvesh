import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { DOMAIN_COLORS, DOMAIN_ICONS, getFramework, type Framework } from "../lib/skills";
import { SPACES } from "../lib/workspace";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Card, Chip, Page, SectionTitle, shared } from "../components/Skill";
import { Skeleton } from "../components/Motion";

const ACCENT = SPACES.admin.accent;

export default function FrameworkScreen() {
  const [f, setF] = useState<Framework | null>(null);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { getFramework().then((x) => { setF(x); setRole(x.roles[0]?.id ?? null); }).catch(() => {}); }, []);

  const r = f?.roles.find((x) => x.id === role);
  const names = Object.fromEntries((f?.competencies ?? []).map((c) => [c.id, c]));

  return (
    <Page title="Competency Framework" subtitle="Official Statistics: 4 domains, levels 0–5, requirements by role">
      {!f && <Skeleton height={260} />}
      {f && (
        <>
          <SectionTitle>Role requirements</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {f.roles.map((x) => <Chip key={x.id} label={x.name} active={role === x.id} onPress={() => setRole(x.id)} />)}
          </ScrollView>
          {r && (
            <Card>
              <Text style={shared.title}>{r.name}</Text>
              <Text style={shared.muted}>{r.cadre} · {r.description}</Text>
              {f.domains.map((d) => {
                const reqs = Object.entries(r.requirements).filter(([cid]) => names[cid]?.domain === d.id);
                if (!reqs.length) return null;
                return (
                  <View key={d.id} style={{ gap: 6, marginTop: spacing.sm }}>
                    <Text style={[styles.domain, { color: DOMAIN_COLORS[d.id] }]}>{d.name.toUpperCase()}</Text>
                    {reqs.sort((a, b) => b[1] - a[1]).map(([cid, lvl]) => (
                      <View key={cid} style={styles.req}>
                        <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{names[cid]?.name ?? cid}</Text>
                        <View style={styles.pips}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <View key={i} style={[styles.pip, { backgroundColor: i <= lvl ? DOMAIN_COLORS[d.id] : colors.locked }]} />
                          ))}
                        </View>
                        <Text style={[shared.muted, { width: 20, textAlign: "right" }]}>{lvl}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </Card>
          )}

          <SectionTitle>Competencies</SectionTitle>
          {f.domains.map((d, i) => {
            const list = f.competencies.filter((c) => c.domain === d.id);
            return (
              <Card key={d.id} index={i}>
                <View style={shared.row}>
                  <View style={[styles.icon, { backgroundColor: DOMAIN_COLORS[d.id] + "1A" }]}>
                    <MaterialIcons name={DOMAIN_ICONS[d.id]} size={20} color={DOMAIN_COLORS[d.id]} />
                  </View>
                  <Text style={[shared.title, { flex: 1 }]}>{d.name}</Text>
                  <Text style={shared.muted}>{list.length} competencies</Text>
                </View>
                {list.map((c) => (
                  <View key={c.id} style={styles.comp}>
                    <Text style={shared.body}>{c.name}</Text>
                    <Text style={shared.muted}>{c.description}</Text>
                    {c.prerequisites.length > 0 && (
                      <Text style={[shared.muted, { color: ACCENT }]}>Builds on: {c.prerequisites.map((p) => names[p]?.name ?? p).join(", ")}</Text>
                    )}
                  </View>
                ))}
              </Card>
            );
          })}
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  domain: { ...typography.labelMd, letterSpacing: 0.8 },
  req: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pips: { flexDirection: "row", gap: 3 },
  pip: { width: 14, height: 8, borderRadius: 2 },
  icon: { width: 36, height: 36, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  comp: { gap: 2, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.locked },
});
