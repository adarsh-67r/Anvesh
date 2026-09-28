import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FocusGuard } from "../../modules/focus-guard";
import { api } from "./api";
import { feedback } from "./feedback";

export type Kind = "pomodoro" | "timer" | "stopwatch";
export type Phase = "focus" | "short" | "long";
export type Settings = { focusMin: number; shortMin: number; longMin: number; rounds: number; timerMin: number; block: boolean };
export type Session = {
  kind: Kind;
  phase: Phase;
  round: number;
  status: "idle" | "running" | "paused";
  /** Countdown: wall-clock end while running, seconds left while paused. */
  endAt: number;
  remaining: number;
  /** Stopwatch: virtual start (now - elapsed) while running, elapsed seconds while paused. */
  startedAt: number;
  elapsed: number;
  tag: string | null;
};
export type LogEntry = { day: string; tag: string | null; minutes: number };

const KEYS = { settings: "anvesh.focus.settings", session: "anvesh.focus.session", tags: "anvesh.focus.tags", log: "anvesh.focus.log" };
export const MAX_SESSION_MIN = 180;
const FOREVER = 8.64e15;

export const DEFAULT_SETTINGS: Settings = { focusMin: 25, shortMin: 5, longMin: 15, rounds: 4, timerMin: 45, block: false };
const IDLE: Session = { kind: "pomodoro", phase: "focus", round: 1, status: "idle", endAt: 0, remaining: 0, startedAt: 0, elapsed: 0, tag: null };

type Store = { settings: Settings; session: Session; tags: string[]; log: LogEntry[] };
let store: Store = { settings: DEFAULT_SETTINGS, session: IDLE, tags: [], log: [] };
const listeners = new Set<() => void>();
let onLogged: (() => void) | null = null;

function set(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
  if (patch.settings) AsyncStorage.setItem(KEYS.settings, JSON.stringify(store.settings)).catch(() => {});
  if (patch.tags) AsyncStorage.setItem(KEYS.tags, JSON.stringify(store.tags)).catch(() => {});
  if (patch.log) AsyncStorage.setItem(KEYS.log, JSON.stringify(store.log)).catch(() => {});
  if (patch.session) {
    AsyncStorage.setItem(KEYS.session, JSON.stringify(store.session)).catch(() => {});
    syncNative();
  }
}

export function useFocus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => store);
}

/** Called after a focus block is saved (e.g. to refresh the quiz unlock status). */
export function setOnLogged(fn: (() => void) | null) { onLogged = fn; }

AsyncStorage.multiGet(Object.values(KEYS)).then((rows) => {
  const v = Object.fromEntries(rows);
  const parse = <T,>(s: string | null, d: T): T => { try { return s ? { ...d, ...JSON.parse(s) } : d; } catch { return d; } };
  const arr = <T,>(s: string | null): T[] => { try { const x = s ? JSON.parse(s) : []; return Array.isArray(x) ? x : []; } catch { return []; } };
  store = {
    settings: parse(v[KEYS.settings], DEFAULT_SETTINGS),
    session: parse(v[KEYS.session], IDLE),
    tags: arr<string>(v[KEYS.tags]).filter((t) => typeof t === "string"),
    log: arr<LogEntry>(v[KEYS.log]),
  };
  listeners.forEach((l) => l());
  tick();
}).catch(() => {});

// ---- time ----

export const isCountdown = (s: Session) => s.kind !== "stopwatch";
export function phaseSeconds(kind: Kind, phase: Phase, st: Settings) {
  if (kind === "timer") return st.timerMin * 60;
  return (phase === "focus" ? st.focusMin : phase === "short" ? st.shortMin : st.longMin) * 60;
}
export function secondsLeft(s: Session, now = Date.now()) {
  return s.status === "running" ? Math.max(0, Math.ceil((s.endAt - now) / 1000)) : s.remaining;
}
export function secondsElapsed(s: Session, now = Date.now()) {
  return s.status === "running" ? Math.floor((now - s.startedAt) / 1000) : s.elapsed;
}
/** Seconds shown on the dial: remaining for countdowns, elapsed for the stopwatch. */
export const display = (s: Session, st: Settings, now = Date.now()) =>
  s.status === "idle" ? (isCountdown(s) ? phaseSeconds(s.kind, s.phase, st) : 0) : isCountdown(s) ? secondsLeft(s, now) : secondsElapsed(s, now);

export const today = () => new Date().toISOString().slice(0, 10);

// ---- logging ----

function logFocus(seconds: number, kind: Kind, tag: string | null) {
  const minutes = Math.min(MAX_SESSION_MIN, Math.round(seconds / 60));
  if (minutes < 1) return;
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  set({ log: [...store.log.filter((e) => e.day >= cutoff), { day: today(), tag, minutes }] });
  api.post("/api/recommend/events", { event_type: "study_session", skill_id: "general", context: { minutes, tag, mode: kind } })
    .then(() => onLogged?.())
    .catch(() => {});
}

// ---- actions ----

export function setKind(kind: Kind) {
  if (store.session.status === "idle") set({ session: { ...IDLE, kind, tag: store.session.tag } });
}
export function setTag(tag: string | null) { set({ session: { ...store.session, tag } }); }
export function updateSettings(patch: Partial<Settings>) { set({ settings: { ...store.settings, ...patch } }); }

export function addTag(name: string) {
  const t = name.trim().slice(0, 24);
  if (!t || store.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
  set({ tags: [...store.tags, t] });
}
export function removeTag(name: string) {
  set({ tags: store.tags.filter((t) => t !== name), ...(store.session.tag === name ? { session: { ...store.session, tag: null } } : {}) });
}

function running(s: Session, now = Date.now()): Session {
  if (!isCountdown(s)) return { ...s, status: "running", startedAt: now - s.elapsed * 1000 };
  return { ...s, status: "running", endAt: now + s.remaining * 1000 };
}

export function start() {
  const s = store.session;
  if (s.status === "running") return;
  if (s.status === "paused") return set({ session: running(s) });
  set({ session: running({ ...s, remaining: phaseSeconds(s.kind, s.phase, store.settings), elapsed: 0 }) });
}

export function pause() {
  const s = store.session;
  if (s.status !== "running") return;
  set({ session: { ...s, status: "paused", remaining: secondsLeft(s), elapsed: secondsElapsed(s) } });
}

/** Ends the session; focus time already spent still counts. */
export function stop() {
  const s = store.session;
  if (s.status === "idle") return;
  if (s.phase === "focus") logFocus(isCountdown(s) ? phaseSeconds(s.kind, s.phase, store.settings) - secondsLeft(s) : secondsElapsed(s), s.kind, s.tag);
  set({ session: { ...IDLE, kind: s.kind, tag: s.tag } });
}

/** Pomodoro: jump to the next phase without counting the rest of this one. */
export function skip() {
  const s = store.session;
  if (s.kind !== "pomodoro") return;
  if (s.phase === "focus" && s.status !== "idle") logFocus(phaseSeconds(s.kind, s.phase, store.settings) - secondsLeft(s), s.kind, s.tag);
  const next = nextPhase(s);
  set({ session: next ?? { ...IDLE, tag: s.tag } });
}

function nextPhase(s: Session): Session | null {
  const { rounds } = store.settings;
  const base = { ...s, status: "idle" as const, remaining: 0, endAt: 0 };
  if (s.phase === "focus") return { ...base, phase: s.round >= rounds ? "long" : "short" };
  if (s.phase === "short") return { ...base, phase: "focus", round: s.round + 1 };
  return null; // long break ends the cycle
}

/** Advances a countdown that reached zero. Auto-starts the next phase only while the app is open. */
export function tick() {
  const s = store.session;
  if (s.status !== "running" || !isCountdown(s) || Date.now() < s.endAt) return;
  if (s.phase === "focus") logFocus(phaseSeconds(s.kind, s.phase, store.settings), s.kind, s.tag);
  feedback.celebrate();
  const next = s.kind === "pomodoro" ? nextPhase(s) : null;
  if (!next) return set({ session: { ...IDLE, kind: s.kind, tag: s.tag } });
  const prepared = { ...next, remaining: phaseSeconds(next.kind, next.phase, store.settings) };
  set({ session: AppState.currentState === "active" ? running(prepared) : prepared });
}

// ---- Android notification + blocker ----

const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
};
export const phaseLabel = (s: Session) =>
  s.kind === "stopwatch" ? "Stopwatch" : s.kind === "timer" ? "Timer" : s.phase === "focus" ? "Focus" : s.phase === "short" ? "Short break" : "Long break";

function syncNative() {
  if (!FocusGuard) return;
  const s = store.session;
  try {
    if (s.status === "idle") return FocusGuard.stopSession();
    const title = `${phaseLabel(s)}${s.phase === "focus" && s.tag ? ` · ${s.tag}` : ""}`;
    const round = s.kind === "pomodoro" ? `Round ${s.round} of ${store.settings.rounds}` : "";
    const paused = s.status === "paused";
    const text = paused ? [`Paused · ${clock(display(s, store.settings))}`, round].filter(Boolean).join(" · ") : round || "Stay with it";
    const focusing = s.phase === "focus" && !paused && store.settings.block;
    const endAt = isCountdown(s) && !paused ? s.endAt : 0;
    FocusGuard.startSession(title, text, endAt, s.startedAt || Date.now(), paused, focusing ? (endAt || FOREVER) : 0);
  } catch {}
}

FocusGuard?.addListener("onAction", ({ action }) => {
  if (action === "pause") pause();
  else if (action === "resume") start();
  else if (action === "stop") stop();
  else if (action === "done") tick();
});
AppState.addEventListener("change", (st) => { if (st === "active") tick(); });
