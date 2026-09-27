import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { feedback } from "../lib/feedback";
import { colors, radii } from "../lib/theme";

/** Entrance for the i-th item of a list: fades up, each one a beat after the last. */
export const enter = (i = 0) => FadeInDown.delay(Math.min(i, 10) * 70).springify().damping(18).stiffness(160);

const APressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that sinks slightly under the finger and springs back, with a light haptic tick. */
export function PressableScale({
  style,
  children,
  haptic = true,
  scaleTo = 0.96,
  onPress,
  ...rest
}: Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; children?: ReactNode; haptic?: boolean; scaleTo?: number }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => { scale.set(withSpring(scaleTo, { damping: 20, stiffness: 400 })); rest.onPressIn?.(e); }}
      onPressOut={(e) => { scale.set(withSpring(1, { damping: 12, stiffness: 300 })); rest.onPressOut?.(e); }}
      onPress={(e) => { if (haptic) feedback.tap(); onPress?.(e); }}
      style={[style, animated, rest.disabled && { opacity: 0.6 }]}
    >
      {children}
    </APressable>
  );
}

/** Progress bar whose fill glides to `value` (0..1) instead of jumping. */
export function ProgressBar({
  value,
  from = 0,
  color = colors.primary,
  track = colors.locked,
  height = 6,
  delay = 0,
  duration = 900,
  style,
}: { value: number; from?: number; color?: string; track?: string; height?: number; delay?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const w = useSharedValue(from);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, value)), { duration, easing: Easing.out(Easing.cubic) }));
  }, [value, delay, duration, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={[{ height, borderRadius: radii.full, backgroundColor: track, overflow: "hidden" }, style]}>
      <Animated.View style={[{ height: "100%", borderRadius: radii.full, backgroundColor: color }, fill]} />
    </View>
  );
}

/** A number that counts from `from` to `to`. */
export function CountUp({
  to,
  from = 0,
  duration = 900,
  delay = 0,
  format = (n: number) => String(Math.round(n)),
  style,
}: { to: number; from?: number; duration?: number; delay?: number; format?: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(from);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = Date.now() + delay;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / duration));
      setN(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, duration, delay, reduced]);
  return <Text style={style}>{format(reduced ? to : n)}</Text>;
}

/** Grey placeholder that breathes while real content loads. */
export function Skeleton({ width = "100%", height = 16, radius = radii.md, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: "#E2E8F0" }, pulse, style]} />;
}

/** Wraps an answer option: pulses when it turns out right, shakes when it was a wrong pick. */
export function AnswerFx({ state, children }: { state: "idle" | "right" | "wrong" | "dim"; children: ReactNode }) {
  const x = useSharedValue(0);
  const s = useSharedValue(1);
  useEffect(() => {
    if (state === "wrong") {
      x.value = withSequence(
        withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }),
        withTiming(-7, { duration: 50 }), withTiming(7, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    } else if (state === "right") {
      s.value = withSequence(withSpring(1.04, { damping: 6, stiffness: 300 }), withSpring(1, { damping: 10 }));
    }
  }, [state, x, s]);
  const fx = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: s.value }] }));
  return <Animated.View style={fx}>{children}</Animated.View>;
}

/** Slow, endless drift for decorative shapes. */
export function Drift({ style, range = 14, duration = 5000 }: { style: StyleProp<ViewStyle>; range?: number; duration?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, duration]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: (t.value - 0.5) * range }, { translateX: (0.5 - t.value) * range * 0.6 }, { rotate: `${t.value * 20}deg` }] }));
  return <Animated.View pointerEvents="none" style={[style, a]} />;
}

/** Gentle repeating scale, e.g. a running timer. */
export function Breathe({ active, children, style }: { active: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = active ? withRepeat(withTiming(1.035, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true) : withTiming(1);
  }, [active, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Three dots bouncing in turn: "the tutor is typing". */
export function TypingDots({ color = colors.primary }: { color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 4 }} accessibilityLabel="Tutor is typing">
      {[0, 1, 2].map((i) => <Dot key={i} delay={i * 150} color={color} />)}
    </View>
  );
}
function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 280 }), withTiming(0, { duration: 280 }), withTiming(0, { duration: 250 })), -1));
  }, [y, delay]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, a]} />;
}

const CONFETTI_COLORS = [colors.primary, colors.secondary, colors.tertiary, "#F59E0B", "#EC4899", "#A78BFA"];

/** A one-shot confetti burst over the whole screen. Remount (change `key`) to fire again. */
export function Confetti({ count = 60 }: { count?: number }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width,
      drift: (Math.random() - 0.5) * 160,
      delay: Math.random() * 250,
      fall: height * (0.7 + Math.random() * 0.4),
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: Math.random() > 0.6,
    }))
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => <Piece key={i} {...p} />)}
    </View>
  );
}
function Piece({ x, drift, delay, fall, spin, size, color, round }: { x: number; drift: number; delay: number; fall: number; spin: number; size: number; color: string; round: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }));
  }, [t, delay]);
  const a = useAnimatedStyle(() => ({
    opacity: t.value < 0.8 ? 1 : (1 - t.value) * 5,
    transform: [
      { translateX: x + drift * t.value },
      { translateY: -40 + fall * t.value },
      { rotate: `${spin * t.value}deg` },
      { rotateX: `${spin * 0.7 * t.value}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", left: 0, top: 0, width: size, height: round ? size : size * 0.45, borderRadius: round ? size : 1, backgroundColor: color }, a]}
    />
  );
}
