import { useState, type ComponentProps } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useOrg } from "../lib/org";
import { DOMAIN_COLORS } from "../lib/skills";
import { SPACES } from "../lib/workspace";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Button, Card, Empty, Hero, Page, PercentBar, SectionTitle, Stat, shared } from "./Skill";
import { PressableScale, Skeleton } from "./Motion";

const ACCENT = SPACES.admin.accent;
type IconName = ComponentProps<typeof MaterialIcons>["name"];

function Alert({ icon, tint, title, body, href }: { icon: IconName; tint: string; title: string; body: string; href: Href }) {
  return (
    <PressableScale onPress={() => router.push(href)} accessibilityRole="button">
      <View style={styles.alert}>
        <View style={[styles.alertIcon, { backgroundColor: tint + "1A" }]}>
          <MaterialIcons name={icon} size={20} color={tint} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={shared.title}>{title}</Text>
          <Text style={shared.muted}>{body}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
      </View>
    </PressableScale>
  );
}

export default function AdminHome() {
  const { width } = useWindowDimensions();
  const { org, error, reload } = useOrg();
  const [refreshing, setRefreshing] = useState(false);
  const wide = width >= 900;

  const weakestDept = org?.by_department.find((d) => d.officials >= 2); // one person isn't a trend
  const topGap = org?.top_gaps[0];
  const emerging = org?.emerging_needs[0];
  const weakCourse = org && [...org.training_effectiveness].filter((t) => t.enrolled >= 3).sort((a, b) => a.completion_rate - b.completion_rate)[0];

  return (
    <Page title="Overview" subtitle="Capacity of the Official Statistical System at a glance"
      onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} refreshing={refreshing}>
      {!org && !error && <Skeleton height={180} radius={radii.xxl} />}
      {error && !org && <Empty icon="cloud-off" title="Couldn't load the overview" body="The server may be waking up. Pull down to try again." />}
      {org && (
        <>
          <Hero eyebrow="ADMIN CONSOLE · ROLE READINESS" accent={ACCENT} value={`${org.average_readiness}%`}
            body={`average readiness of ${org.officials} profiled officials for their roles. Projected ${org.projected_readiness}% once current enrolments complete.`}>
            <View style={shared.wrap}>
              <Button label="Workforce gaps" icon="insights" kind="light" accent={ACCENT} onPress={() => router.push("/admin")} />
              <Button label="Training effectiveness" icon="trending-up" kind="light" accent={ACCENT} onPress={() => router.push("/admin-training")} />
            </View>
          </Hero>

          <View style={shared.wrap}>
            <Stat label="Officials profiled" value={String(org.officials)} icon="badge" tint={ACCENT} />
            <Stat label="Platform users" value={String(org.users)} icon="group" tint={colors.secondary} />
            <Stat label="Course completions" value={`${org.completions} / ${org.enrolments}`} icon="task-alt" tint={colors.tertiary} />
            <Stat label="Projected readiness" value={`${org.projected_readiness}%`} icon="trending-up" tint="#D97706" />
          </View>

          <SectionTitle>Needs attention</SectionTitle>
          <Card>
            {topGap && <Alert icon="priority-high" tint={colors.error} href="/admin" title={`${topGap.name} is the largest gap`}
              body={`Only ${topGap.percent_meeting}% of ${topGap.officials} officials who need it meet the required level.`} />}
            {emerging && <Alert icon="bolt" tint="#D97706" href="/admin" title={`Emerging skill: ${emerging.name}`}
              body={`${emerging.percent_meeting}% meet the level (average ${emerging.average_level}/5). Plan training before demand grows.`} />}
            {weakestDept && <Alert icon="apartment" tint={colors.secondaryDark} href="/admin" title={`${weakestDept.department} trails on readiness`}
              body={`${weakestDept.readiness}% average readiness across ${weakestDept.officials} official${weakestDept.officials === 1 ? "" : "s"}.`} />}
            {weakCourse && <Alert icon="hourglass-bottom" tint={ACCENT} href="/admin-training" title={`Low completion: ${weakCourse.title}`}
              body={`${weakCourse.completion_rate}% of ${weakCourse.enrolled} enrolled officials have completed it.`} />}
          </Card>

          <View style={wide ? styles.cols : undefined}>
            <View style={wide ? { flex: 1 } : undefined}>
              <SectionTitle>Readiness by department</SectionTitle>
              <Card>{org.by_department.map((d) => <PercentBar key={d.department} label={d.department} value={d.readiness} sub={`${d.officials}`} color={ACCENT} />)}</Card>
            </View>
            <View style={wide ? { flex: 1 } : undefined}>
              <SectionTitle>Readiness by role</SectionTitle>
              <Card>{org.by_role.map((r) => <PercentBar key={r.role} label={r.role} value={r.readiness} sub={`${r.officials}`} color={colors.secondary} />)}</Card>
            </View>
          </View>

          <SectionTitle right={<PressableScale onPress={() => router.push("/admin")}><Text style={styles.link}>All gaps</Text></PressableScale>}>
            Priority training needs
          </SectionTitle>
          <Card>
            {org.top_gaps.slice(0, 5).map((d) => (
              <PercentBar key={d.id} label={d.name} value={d.percent_meeting} sub={`avg ${d.average_level}/5`} color={DOMAIN_COLORS[d.domain]} />
            ))}
            <Text style={shared.muted}>Bar = % of officials meeting their role’s requirement.</Text>
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: spacing.md },
  alert: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  alertIcon: { width: 38, height: 38, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  link: { ...typography.labelLg, color: ACCENT },
});
