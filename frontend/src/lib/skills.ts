import { api } from "./api";
import { colors } from "./theme";

export type Domain = "statistical" | "technical" | "digital" | "behavioural";
export type Competency = { id: string; name: string; domain: Domain; description: string; prerequisites: string[] };
export type Role = { id: string; name: string; cadre: string; description: string; requirements: Record<string, number> };
export type Framework = { domains: { id: Domain; name: string }[]; competencies: Competency[]; roles: Role[] };

export type Level = {
  id: string; name: string; domain: Domain; required: number; current: number; source: "assessed" | "profile"; gap: number;
};
export type MyCompetencies = {
  role: { id: string; name: string } | null;
  profile_complete: boolean;
  summary: { required: number; met: number; gaps: number; readiness: number };
  levels: Level[];
  gaps: Level[];
};

export type Profile = {
  designation: string; role_id: string | null; cadre: string; department: string; division: string;
  current_assignment: string; qualifications: string[]; experience_years: number; past_trainings: string[];
};

export type Enrolment = { status: "enrolled" | "completed"; progress: number; score: number | null; completed_at: string | null };
export type Course = {
  id: string; source: "igot" | "nssta"; title: string; provider: string; programme: string; description: string;
  mode: string; duration_hours: number; level: number; competencies: string[]; url: string | null; sample: boolean;
  enrolment: Enrolment | null; score?: number; reasons?: string[];
};

export type Question = {
  id: string; text: string; options: string[]; source_ref: string; competency_id: string | null; difficulty: number;
  answer?: string; explanation?: string;
};
export type Assessment = {
  id: string; kind: "material" | "diagnostic" | "course"; title: string; status: "generating" | "ready" | "failed";
  published: boolean; editable: boolean; competency_ids: string[]; error: string | null; questions: Question[];
};
export type AssessmentSummary = {
  id: string; title: string; status: string; published: boolean; competency_ids: string[]; questions: number;
  best_percent: number | null; editable: boolean; created_at: string;
};

export const DOMAIN_COLORS: Record<Domain, string> = {
  statistical: colors.primary,
  technical: colors.secondary,
  digital: "#D97706",
  behavioural: colors.tertiary,
};
export const DOMAIN_ICONS: Record<Domain, "query-stats" | "code" | "security" | "groups"> = {
  statistical: "query-stats",
  technical: "code",
  digital: "security",
  behavioural: "groups",
};
export const SOURCE_LABEL: Record<Course["source"], string> = { igot: "iGOT Karmayogi", nssta: "NSSTA" };

let frameworkCache: Promise<Framework> | null = null;
/** The competency framework never changes at runtime; fetch it once. */
export function getFramework(): Promise<Framework> {
  frameworkCache ??= api.get<Framework>("/api/competency/framework").catch((e) => {
    frameworkCache = null;
    throw e;
  });
  return frameworkCache;
}

/** GET an endpoint that reports {status: "generating"} (HTTP 202) until the AI finishes; resolves once it's ready. */
export async function waitReady(path: string, isAlive: () => boolean = () => true, tries = 60): Promise<{ id: string }> {
  for (let i = 0; i < tries && isAlive(); i++) {
    const res = await api.get<{ id: string; status: string }>(path);
    if (res.status === "ready") return res;
    if (res.status === "failed") throw new Error("The AI couldn't write this quiz. Please try again.");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("This is taking too long. Please try again in a minute.");
}

export const levelText = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
