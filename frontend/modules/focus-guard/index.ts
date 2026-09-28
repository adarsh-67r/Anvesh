import { NativeModule, requireOptionalNativeModule } from "expo";

export type FocusAction = "pause" | "resume" | "stop" | "done";
export type InstalledApp = { package: string; label: string };

declare class FocusGuardNative extends NativeModule<{ onAction: (e: { action: FocusAction }) => void }> {
  startSession(title: string, text: string, endAt: number, startedAt: number, paused: boolean, blockUntil: number): void;
  stopSession(): void;
  setBlockedApps(apps: string[]): void;
  getBlockedApps(): string[];
  listApps(): Promise<InstalledApp[]>;
  isBlockerEnabled(): boolean;
  openBlockerSettings(): void;
  /** Next Android permission the blocker still needs. */
  blockerSetupStep(): "usage" | "overlay" | "ready";
  hasNotificationPermission(): boolean;
  requestNotificationPermission(): void;
}

/** Android only (timer notification + app blocker); null on web or when the native module is missing. */
export const FocusGuard = requireOptionalNativeModule<FocusGuardNative>("FocusGuard");
