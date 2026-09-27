import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { AuthProvider } from "../lib/auth";
import { SidebarProvider } from "../components/Sidebar";
import { colors } from "../lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <SidebarProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.surface } }}>
          <Stack.Screen name="index" options={{ animation: "fade" }} />
          <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          <Stack.Screen name="practice/[skillId]" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="quiz/[skillId]" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="lecture/[id]" options={{ animation: "fade_from_bottom" }} />
        </Stack>
      </SidebarProvider>
    </AuthProvider>
  );
}
