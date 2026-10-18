import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { colors } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <>
      {/* Light status bar text on the dark theme. */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}
