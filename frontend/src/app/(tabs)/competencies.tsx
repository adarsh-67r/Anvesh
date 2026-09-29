import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { DOMAIN_COLORS, DOMAIN_ICONS, levelText, type Domain, type Level, type MyCompetencies } from "../../lib/skills";
import { colors, spacing, typography } from "../../lib/theme";
import { Badge, Button, Card, Chip, Empty, LevelBar, Page, shared } from "../../components/Skill";
import { PressableScale, Skeleton } from "../../components/Motion";

const DOMAIN_NAMES: Record<Domain, string> = {
  statistical: "Statistical", technical: "Technical", digital: "Digital Governance", behavioural: "Behavioural & Managerial",
};
type Filter = "gaps" | "required" | "all";

export default function CompetenciesScreen() {
  const [data, setData] = useState<MyCompetencies | null>(null);
  const [filter, setFilter] = useState<Filter>("gaps");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.get<MyCompetencies>("/api/competency/me").then(setData).catch(() => {}), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const show = (lv: Level) => filter === "all" || (filter === "required" ? lv.required > 0 : lv.gap > 0);
  const assess = (id: string) => router.push({ pathname: "/assess/[id]", params: { id: "diagnostic", competency: id } });

  return (
    <Page
      title="My Competencies"
      subtitle={data?.role ? `${data.summary.met} of ${data.summary.required} role requirements met` : "Official Statistics framework"}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      refreshing={refreshing}
    >
      {!data && <Skeleton height={300} />}
      {data && !data.profile_complete && (
        <Empty icon="badge" title="Add your role to see gaps"
          body="Without a role Anvesh can show your levels but not what your post requires."
          action={<Button label="Set up profile" onPress={() => router.push("/profile-setup")} />} />
      )}
      {data && (
        <View style={shared.wrap}>
          <Chip label={`Gaps (${data.summary.gaps})`} active={filter === "gaps"} onPress={() => setFilter("gaps")} />
          <Chip label="Required for my role" active={filter === "required"} onPress={() => setFilter("required")} />
          <Chip label="All 33" active={filter === "all"} onPress={() => setFilter("all")} />
        </View>
      )}
      {data && (Object.keys(DOMAIN_NAMES) as Domain[]).map((d, i) => {
        const rows = data.levels.filter((lv) => lv.domain === d && show(lv));
        if (!rows.length) return null;
        return (
          <Card key={d} index={i}>
            <View style={shared.row}>
              <View style={[styles.domIcon, { backgroundColor: DOMAIN_COLORS[d] + "1A" }]}>
                <MaterialIcons name={DOMAIN_ICONS[d]} size={18} color={DOMAIN_COLORS[d]} />
              </View>
              <Text style={styles.domTitle}>{DOMAIN_NAMES[d]}</Text>
            </View>
            {rows.map((lv) => (
              <View key={lv.id} style={styles.row}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[shared.row, { justifyContent: "space-between" }]}>
                    <Text style={shared.title} numberOfLines={1}>{lv.name}</Text>
                    <Text style={shared.muted}>
                      {levelText(lv.current)}{lv.required ? ` / ${lv.required}` : ""}
                    </Text>
                  </View>
                  <LevelBar current={lv.current} required={lv.required} color={DOMAIN_COLORS[d]} />
                  <View style={shared.row}>
                    <Badge label={lv.source === "assessed" ? "ASSESSED" : "PROFILE ESTIMATE"} tint={lv.source === "assessed" ? colors.tertiaryDark : colors.textSecondary} />
                    {lv.gap > 0 && <Badge label={`GAP ${levelText(lv.gap)}`} tint={colors.error} />}
                  </View>
                </View>
                <PressableScale onPress={() => assess(lv.id)} style={styles.btn} accessibilityLabel={`Assess ${lv.name}`}>
                  <MaterialIcons name="quiz" size={18} color={colors.primary} />
                  <Text style={styles.btnText}>{lv.source === "assessed" ? "Re-assess" : "Assess"}</Text>
                </PressableScale>
              </View>
            ))}
          </Card>
        );
      })}
      {data && data.summary.gaps === 0 && filter === "gaps" && data.profile_complete && (
        <Empty icon="verified" title="No gaps" body="You meet every competency requirement for your role." />
      )}
      <Text style={shared.muted}>Levels run 0–5: 1 awareness · 3 independent practitioner · 5 expert who can train others.</Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  domIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  domTitle: { ...typography.headlineSm, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  btn: { alignItems: "center", gap: 2, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.primaryLight, minWidth: 72 },
  btnText: { ...typography.labelSm, color: colors.primary },
});
