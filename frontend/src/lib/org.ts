import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "./api";
import type { Domain } from "./skills";

export type Dist = { id: string; name: string; domain: Domain; officials: number; average_level: number; percent_meeting: number; total_gap: number };
export type Org = {
  officials: number; users: number; average_readiness: number; projected_readiness: number; enrolments: number; completions: number;
  by_department: { department: string; officials: number; readiness: number }[];
  by_role: { role: string; officials: number; readiness: number }[];
  distribution: Dist[]; top_gaps: Dist[]; emerging_needs: Dist[];
  training_effectiveness: { id: string; title: string; source: "igot" | "nssta"; enrolled: number; completed: number; completion_rate: number; average_score: number | null }[];
};

// The admin console's pages all read the same analytics; share one request between them.
let cached: Promise<Org> | null = null;

export function useOrg() {
  const [org, setOrg] = useState<Org | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async (fresh = false) => {
    if (fresh || !cached) cached = api.get<Org>("/api/dashboard/org");
    try {
      setOrg(await cached);
      setError(false);
    } catch {
      cached = null;
      setError(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { org, error, reload: () => load(true) };
}
