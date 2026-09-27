import { Tabs } from "expo-router";

// Navigation happens through the sidebar; the tab navigator only keeps these screens mounted.
export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }} />;
}
