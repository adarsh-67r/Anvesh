import { useSyncExternalStore } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

/** Focus tracks clipped to loop; credited on the Focus screen. */
export const TRACKS = [
  { id: "lofi", label: "Lofi beats", icon: "headphones", source: require("../../assets/music/lofi.mp3"), credit: "Art Is Sound — Chill Lofi Beats Mix" },
  { id: "deep", label: "Deep focus", icon: "spa", source: require("../../assets/music/deep.mp3"), credit: "Optimist Music Flow — 60 BPM Study Piano" },
  { id: "rain", label: "Rain", icon: "water-drop", source: require("../../assets/music/rain.mp3"), credit: "Generated in Anvesh" },
  { id: "cinematic", label: "Cinematic", icon: "rocket-launch", source: require("../../assets/music/cinematic.mp3"), credit: "Hans Zimmer — Interstellar (edit)" },
] as const;
export type TrackId = (typeof TRACKS)[number]["id"];
export const VOLUMES = [0.3, 0.6, 1] as const;

let player: AudioPlayer | null = null;
let state: { track: TrackId | null; volume: number } = { track: null, volume: 0.6 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useMusic() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

/** Plays a track on loop (also with the screen off), or stops music with null. */
export async function playTrack(id: TrackId | null) {
  state = { ...state, track: id };
  emit();
  try {
    if (!id) {
      player?.pause();
      player?.setActiveForLockScreen(false);
      return;
    }
    const track = TRACKS.find((t) => t.id === id)!;
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
    if (!player) player = createAudioPlayer(track.source);
    else player.replace(track.source);
    player.loop = true;
    player.volume = state.volume;
    player.play();
    player.setActiveForLockScreen(true, { title: track.label, artist: "Anvesh focus music" });
  } catch {}
}

export function setMusicVolume(volume: number) {
  state = { ...state, volume };
  emit();
  if (player) player.volume = volume;
}
