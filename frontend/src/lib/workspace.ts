import { createContext, useSyncExternalStore } from "react";
import { colors } from "./theme";

/** Each role works in its own console; trainers and admins can also switch to their own learning. */
export type Space = "learn" | "trainer" | "admin";

export const SPACES: Record<Space, { label: string; accent: string; tint: string }> = {
  learn: { label: "Official", accent: colors.primary, tint: colors.primaryLight },
  trainer: { label: "Trainer Console", accent: "#0F766E", tint: "#CCFBF1" },
  admin: { label: "Admin Console", accent: "#1E293B", tint: "#E2E8F0" },
};

export const consoleFor = (role: string | undefined): Space => (role === "admin" ? "admin" : role === "trainer" ? "trainer" : "learn");

let learning = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setLearning(on: boolean) {
  learning = on;
  listeners.forEach((l) => l());
}

/** The workspace the user is in right now. */
export function useSpace(role: string | undefined): Space {
  const on = useSyncExternalStore(subscribe, () => learning, () => learning);
  const home = consoleFor(role);
  return on && home !== "learn" ? "learn" : home;
}

/** Paths only a console role may open (the backend enforces the same). */
export function allowedPath(path: string, role: string | undefined): boolean {
  if (/^\/(admin|framework)/.test(path)) return role === "admin";
  if (/^\/(studio|question-bank|results)/.test(path)) return role === "trainer" || role === "admin";
  return true;
}

/** The current console's colour; buttons, chips and heroes pick it up. */
export const AccentContext = createContext<string>(colors.primary);
