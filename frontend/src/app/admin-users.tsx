import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { errorDetail } from "../lib/trails";
import { Card, Chip, Empty, Page, shared } from "../components/Skill";
import { Skeleton } from "../components/Motion";

type UserRow = { id: string; name: string; email: string; role: "learner" | "trainer" | "admin"; designation: string | null; department: string | null };
const ROLES: UserRow["role"][] = ["learner", "trainer", "admin"];
const LABEL = { learner: "Official", trainer: "Trainer", admin: "Admin" } as const;

export default function AdminUsers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.get<UserRow[]>("/api/dashboard/users").then(setRows).catch(() => setRows([])), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setRole = async (u: UserRow, role: UserRow["role"]) => {
    setError("");
    try {
      await api.patch(`/api/dashboard/users/${u.id}`, { role });
      setRows((rs) => rs?.map((r) => (r.id === u.id ? { ...r, role } : r)) ?? null);
    } catch (e) {
      setError(errorDetail(e, "Couldn't change the role."));
    }
  };

  return (
    <Page title="Users & Roles" subtitle="Role-based access: officials, trainers, administrators">
      <Text style={shared.muted}>
        Officials see their own dashboard. Trainers can also create and publish quizzes. Administrators see
        organisation-wide analytics and manage roles.
      </Text>
      {error ? <Text style={shared.error}>{error}</Text> : null}
      {!rows && <Skeleton height={200} />}
      {rows?.length === 0 && <Empty icon="group" title="No users" />}
      {rows?.map((u, i) => (
        <Card key={u.id} index={Math.min(i, 8)}>
          <Text style={shared.title}>{u.name}</Text>
          <Text style={shared.muted}>{u.email}{u.designation ? ` · ${u.designation}` : ""}{u.department ? ` · ${u.department}` : ""}</Text>
          <View style={shared.wrap}>
            {ROLES.map((r) => (
              <Chip key={r} label={LABEL[r]} active={u.role === r} onPress={u.id === user?.id || u.role === r ? undefined : () => setRole(u, r)} />
            ))}
          </View>
        </Card>
      ))}
    </Page>
  );
}
