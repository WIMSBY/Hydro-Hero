import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ProProvider } from "../contexts/ProContext";
import { LLThemeProvider } from "../contexts/ThemeContext";
import { configureRevenueCat } from "../utils/revenueCat";
import { ensureBootstrap } from "../utils/ProfileStore";
import * as Sentry from '@sentry/react-native';

function handleDeepLink(url: string) {
  const { hostname, queryParams } = Linking.parse(url);
  if (hostname === "add") {
    const code = typeof queryParams?.code === "string" ? queryParams.code : null;
    if (code) {
      router.push({ pathname: "/(tabs)/partners", params: { addCode: code } });
    }
  } else if (hostname === "share") {
    router.push({ pathname: "/(tabs)/partners", params: { showShare: "1" } });
  }
}

Sentry.init({
  dsn: 'https://b3b652b828712e84d9a453721a530e58@o4511469395181568.ingest.de.sentry.io/4511469420281936',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: false,
  integrations: [Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

configureRevenueCat();

// Kick off Family Mode bootstrap as early as possible so the active profile
// ID is resolved before screen-level useEffects start reading from storage.
// profileStorage.pGetItem awaits this same promise as a safety net.
ensureBootstrap();

export default Sentry.wrap(function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProProvider>
        <LLThemeProvider>
          <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
          >
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="modal"
                options={{ presentation: "modal", title: "Modal" }}
              />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </LLThemeProvider>
      </ProProvider>
    </GestureHandlerRootView>
  );
});
