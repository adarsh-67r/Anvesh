import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SOUNDS = {
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
  celebrate: require("../../assets/sounds/celebrate.wav"),
};
type Sound = keyof typeof SOUNDS;

const KEY = "anvesh.sounds";
let soundOn = true;
AsyncStorage.getItem(KEY).then((v) => { if (v === "off") soundOn = false; }).catch(() => {});

export const isSoundOn = () => soundOn;
export function setSoundOn(on: boolean) {
  soundOn = on;
  AsyncStorage.setItem(KEY, on ? "on" : "off").catch(() => {});
}

// One player per sound, created on first use and reused (rewound) after that.
const players: Partial<Record<Sound, AudioPlayer>> = {};
function play(name: Sound) {
  if (!soundOn) return;
  try {
    const p = (players[name] ??= createAudioPlayer(SOUNDS[name]));
    p.volume = 0.6;
    p.seekTo(0);
    p.play();
  } catch {}
}

const buzz = (fn: () => Promise<void>) => { if (Platform.OS !== "web") fn().catch(() => {}); };

/** Tactile and audio feedback. Sound respects the in-app toggle; haptics follow the phone's own settings. */
export const feedback = {
  tap: () => buzz(() => Haptics.selectionAsync()),
  press: () => buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  correct: () => { buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); play("correct"); },
  wrong: () => { buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)); play("wrong"); },
  celebrate: () => { buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); play("celebrate"); },
};
