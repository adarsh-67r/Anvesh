import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../lib/api";
import { errorDetail } from "../lib/trails";
import { getFramework, type Profile, type Role } from "../lib/skills";
import { colors, radii, spacing, typography } from "../lib/theme";
import { Button, Card, Chip, Page, SectionTitle, shared } from "../components/Skill";

const DEPARTMENTS = ["National Statistics Office (FOD)", "National Accounts Division", "Price Statistics Division",
  "Social Statistics Division", "Economic Statistics Division", "Data Informatics & Innovation Division", "NSSTA", "State DES"];

const split = (s: string) => s.split(/\n|;/).map((x) => x.trim()).filter(Boolean);

export default function ProfileSetup() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [p, setP] = useState<Profile>({
    designation: "", role_id: null, cadre: "", department: "", division: "", current_assignment: "",
    qualifications: [], experience_years: 0, past_trainings: [],
  });
  const [quals, setQuals] = useState("");
  const [trainings, setTrainings] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getFramework().then((f) => setRoles(f.roles)).catch(() => {});
    api.get<{ profile: Profile | null }>("/api/competency/profile").then(({ profile }) => {
      if (!profile) return;
      setP(profile);
      setQuals(profile.qualifications.join("\n"));
      setTrainings(profile.past_trainings.join("\n"));
    }).catch(() => {});
  }, []);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!p.role_id) return setError("Pick the role closest to your current post.");
    setSaving(true);
    setError("");
    try {
      await api.put("/api/competency/profile", { ...p, qualifications: split(quals), past_trainings: split(trainings) });
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      setError(errorDetail(e, "Couldn't save your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string, multiline = false) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top" }]}
      />
    </View>
  );

  return (
    <Page title="Competency profile" subtitle="Used to map your skills and gaps">
      <Card>
        <Text style={shared.muted}>
          Anvesh builds your competency profile from these details and compares it with the Official Statistics
          competency framework for your role. Estimates are conservative until you take an assessment.
        </Text>
        {field("Designation", p.designation, (v) => set("designation", v), "e.g. Assistant Director")}
      </Card>

      <SectionTitle>Role</SectionTitle>
      <View style={{ gap: spacing.sm }}>
        {roles.map((r) => {
          const on = p.role_id === r.id;
          return (
            <TouchableOpacity key={r.id} onPress={() => set("role_id", r.id)} style={[styles.role, on && styles.roleOn]}
              accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <MaterialIcons name={on ? "radio-button-checked" : "radio-button-unchecked"} size={22} color={on ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={shared.title}>{r.name}</Text>
                <Text style={shared.muted}>{r.cadre} · {r.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionTitle>Posting</SectionTitle>
      <Card>
        <Text style={styles.label}>Department</Text>
        <View style={shared.wrap}>
          {DEPARTMENTS.map((d) => <Chip key={d} label={d} active={p.department === d} onPress={() => set("department", d)} />)}
        </View>
        {field("Or type your department", p.department, (v) => set("department", v), "e.g. DES Odisha")}
        {field("Division / unit", p.division, (v) => set("division", v), "e.g. Survey Design & Research Division")}
        {field("Current assignment", p.current_assignment, (v) => set("current_assignment", v), "e.g. Sampling design for PLFS")}
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Years of service</Text>
          <View style={shared.row}>
            <TouchableOpacity style={styles.step} onPress={() => set("experience_years", Math.max(0, p.experience_years - 1))} accessibilityLabel="Fewer years">
              <MaterialIcons name="remove" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[shared.title, { minWidth: 40, textAlign: "center" }]}>{p.experience_years}</Text>
            <TouchableOpacity style={styles.step} onPress={() => set("experience_years", Math.min(45, p.experience_years + 1))} accessibilityLabel="More years">
              <MaterialIcons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      <SectionTitle>Learning history</SectionTitle>
      <Card>
        {field("Educational qualifications (one per line)", quals, setQuals, "M.Sc. Statistics\nPG Diploma in Data Science", true)}
        {field("Previous trainings (one per line)", trainings, setTrainings, "ISS Probationary Training - Sample surveys\nPython for official statistics (NSSTA)", true)}
      </Card>

      {error ? <Text style={shared.error}>{error}</Text> : null}
      <Button label="Save profile" icon="check" onPress={save} busy={saving} />
    </Page>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.labelLg, color: colors.text },
  input: { ...typography.bodyMd, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.surface },
  role: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md },
  roleOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  step: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
});
