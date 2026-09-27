export type TopicStatus = "mastered" | "covered" | "available" | "locked";

export type TopicNode = {
  id: string;
  label: string;
  prerequisites: string[];
  position: number;
  summary: string | null;
  trail_id: string;
  trail_title: string;
  equivalents: { id: string; label: string; trail_title: string }[];
  mastery_score: number;
  status: TopicStatus;
  video_count: number;
};

export type TrailSource = {
  id: string;
  kind: "playlist" | "video";
  url: string;
  title: string;
  status: "importing" | "ready" | "failed";
  error: string | null;
  topic_count: number;
};

export type TrailSummary = {
  id: string;
  title: string;
  source_count: number;
  topic_count: number;
  mastered_count: number;
  importing: boolean;
  next_topic: { id: string; label: string } | null;
};

export type TrailDetail = { id: string; title: string; sources: TrailSource[]; topics: TopicNode[] };

/** Level = longest prerequisite chain below a topic (foundations are level 0). */
export function levelsOf(nodes: TopicNode[]): TopicNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const level = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const prereqs = byId.get(id)?.prerequisites.filter((p) => byId.has(p)) ?? [];
    const l = prereqs.length ? 1 + Math.max(...prereqs.map((p) => level(p, seen))) : 0;
    memo.set(id, l);
    return l;
  };
  const tiers: TopicNode[][] = [];
  for (const n of [...nodes].sort((a, b) => a.position - b.position)) (tiers[level(n.id, new Set())] ??= []).push(n);
  return tiers.filter(Boolean);
}

export function fmtTs(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function rangeLabel(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  return `${fmtTs(start ?? 0)}–${end != null ? fmtTs(end) : "end"}`;
}

export function errorDetail(e: unknown, fallback: string): string {
  try { return JSON.parse((e as Error).message).detail || fallback; } catch { return fallback; }
}
