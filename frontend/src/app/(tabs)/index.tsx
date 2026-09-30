import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { DOMAIN_COLORS, SOURCE_LABEL, levelText, type Course, type Domain, type Level } from "../../lib/skills";
import { Badge, Button, Card, Empty, LevelBar, Page, SectionTitle, Stat, shared } from "../../components/Skill";
import { PressableScale, Skeleton } from "../../components/Motion";
import AdminHome from "../../components/AdminHome";
import TrainerHome from "../../components/TrainerHome";
import { useSpace } from "../../lib/workspace";

type Dashboard = {
  role: { id: string; name: string } | null;
  readiness: number;
  projected_readiness: number;
  domains: { domain: Domain; name: string; competencies: number; current: number | null; required: number | null }[];
  gaps: Level[];
  assessed: number;
  learning_hours: number;
  courses: { completed: number; in_progress: number };
  assessments: { taken: number; average: number | null };
};

export default function Home() {
  const { user } = useAuth();
  const space = useSpace(user?.role);
  if (space === "admin") return <AdminHome />;
  if (space === "trainer") return <TrainerHome />;
  return <LearnerDashboard />;
}

function LearnerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [recs, setRecs] = useState<Course[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        api.get<Dashboard>("/api/dashboard/me"),
        api.get<Course[]>("/api/courses/recommended?limit=3").catch(() => []),
      ]);
      setData(d);
      setRecs(r);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const first = user?.name?.split(" ")[0];
  return (
    <Page
      title={first ? `Hi, ${first}` : "Dashboard"}
      subtitle={data?.role?.name ?? "Skill intelligence for Official Statistics"}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      refreshing={refreshing}
    >
      {!data && !error && <Skeleton height={180} radius={radii.xxl} />}
      {error && !data && (
        <Empty icon="cloud-off" title="Couldn't load your dashboard" body="The server may be waking up. Pull down to try again." />
      )}

      {data && !data.role && (
        <Card style={styles.hero}>
          <Text style={styles.heroEyebrow}>GET STARTED</Text>
          <Text style={styles.heroTitle}>Set up your competency profile</Text>
          <Text style={styles.heroBody}>
            Tell us your designation, role, experience and past trainings. Anvesh maps them against the Official Statistics
            competency framework and shows exactly where to grow.
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Button label="Create profile" icon="badge" onPress={() => router.push("/profile-setup")} kind="secondary" />
          </View>
        </Card>
      )}

      {data?.role && (
        <Card style={styles.hero}>
          <Text style={styles.heroEyebrow}>ROLE READINESS · {data.role.name.toUpperCase()}</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroBig}>{data.readiness}%</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.heroBody}>of the competencies your role needs, at the required level.</Text>
              {data.projected_readiness > data.readiness && (
                <Text style={styles.heroProj}>→ {data.projected_readiness}% once you finish your current courses</Text>
              )}
            </View>
          </View>
          <View style={styles.heroTrack}><View style={[styles.heroFill, { width: `${data.readiness}%` }]} /></View>
          <View style={[shared.row, { marginTop: spacing.xs }]}>
            <Button label="See my gaps" icon="insights" kind="secondary" onPress={() => router.push("/competencies")} />
            <PressableScale onPress={() => router.push("/profile-setup")} accessibilityRole="button">
              <Text style={styles.heroLink}>Edit profile</Text>
            </PressableScale>
          </View>
        </Card>
      )}

      {data && (
        <View style={shared.wrap}>
          <Stat label="Learning hours" value={String(data.learning_hours)} icon="schedule" />
          <Stat label="Courses completed" value={String(data.courses.completed)} icon="task-alt" tint={colors.tertiary} />
          <Stat label="In progress" value={String(data.courses.in_progress)} icon="play-circle" tint={colors.secondary} />
          <Stat label="Avg. assessment score" value={data.assessments.average == null ? "–" : `${data.assessments.average}%`} icon="quiz" tint="#D97706" />
        </View>
      )}

      {data?.role && (
        <>
          <SectionTitle>Competency by domain</SectionTitle>
          <Card>
            {data.domains.filter((d) => d.competencies > 0).map((d) => (
              <View key={d.domain} style={styles.domainRow}>
                <View style={[shared.row, { justifyContent: "space-between" }]}>
                  <Text style={shared.title}>{d.name}</Text>
                  <Text style={shared.muted}>{levelText(d.current ?? 0)} / {levelText(d.required ?? 0)} · {d.competencies} skills</Text>
                </View>
                <LevelBar current={d.current ?? 0} required={d.required ?? 0} color={DOMAIN_COLORS[d.domain]} />
              </View>
            ))}
            <Text style={shared.muted}>Bar = your average level (0–5); tick = what your role requires.</Text>
          </Card>

          <SectionTitle right={<PressableScale onPress={() => router.push("/competencies")}><Text style={styles.link}>All</Text></PressableScale>}>
            Top skill gaps
          </SectionTitle>
          <Card>
            {data.gaps.length === 0 && <Text style={shared.body}>No gaps — you meet every requirement for your role.</Text>}
            {data.gaps.slice(0, 5).map((g) => (
              <View key={g.id} style={styles.gapRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[shared.row, { justifyContent: "space-between" }]}>
                    <Text style={shared.title} numberOfLines={1}>{g.name}</Text>
                    <Text style={shared.muted}>{levelText(g.current)} → {g.required}</Text>
                  </View>
                  <LevelBar current={g.current} required={g.required} color={DOMAIN_COLORS[g.domain]} />
                  {g.source === "profile" && <Text style={shared.muted}>Estimated from your profile — take a quick diagnostic to confirm.</Text>}
                </View>
                <PressableScale
                  onPress={() => router.push({ pathname: "/assess/[id]", params: { id: "diagnostic", competency: g.id } })}
                  style={styles.assessBtn}
                  accessibilityLabel={`Assess ${g.name}`}
                >
                  <MaterialIcons name="quiz" size={18} color={colors.primary} />
                </PressableScale>
              </View>
            ))}
          </Card>

          <SectionTitle right={<PressableScale onPress={() => router.push("/courses")}><Text style={styles.link}>Learning path</Text></PressableScale>}>
            Recommended next
          </SectionTitle>
          {recs.map((c, i) => (
            <PressableScale key={c.id} onPress={() => router.push({ pathname: "/course/[id]", params: { id: c.id } })}>
              <Card index={i}>
                <View style={shared.row}>
                  <Badge label={SOURCE_LABEL[c.source]} tint={c.source === "igot" ? "#D97706" : colors.primary} />
                  <Text style={shared.muted}>{c.duration_hours} h · {c.mode}</Text>
                </View>
                <Text style={shared.title}>{c.title}</Text>
                {c.reasons?.slice(0, 2).map((r) => (
                  <View key={r} style={shared.row}>
                    <MaterialIcons name="trending-up" size={16} color={colors.tertiaryDark} />
                    <Text style={shared.muted}>{r}</Text>
                  </View>
                ))}
              </Card>
            </PressableScale>
          ))}
          {recs.length === 0 && <Text style={shared.muted}>No course recommendations — your gaps are covered.</Text>}
        </>
      )}

    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: radii.xxl, padding: spacing.lg, gap: spacing.sm },
  heroEyebrow: { ...typography.labelSm, color: "rgba(255,255,255,0.8)", letterSpacing: 1.2 },
  heroTitle: { ...typography.headlineLg, color: "#FFFFFF" },
  heroBody: { ...typography.bodyMd, color: "rgba(255,255,255,0.9)" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroBig: { ...typography.displayLg, fontSize: 56, lineHeight: 62, color: "#FFFFFF" },
  heroProj: { ...typography.labelLg, color: "#FFFFFF" },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  heroFill: { height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  heroLink: { ...typography.labelLg, color: "#FFFFFF", textDecorationLine: "underline", padding: spacing.sm },
  domainRow: { gap: 6, paddingVertical: 4 },
  gapRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  assessBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  link: { ...typography.labelLg, color: colors.primary },
});
