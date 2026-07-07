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
import { ProfileProvider, useProfile } from "../contexts/ProfileContext";
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

  // Do NOT auto-attach IP address / user context / cookies to events —
  // we don't need any of that for crash triage, and disclosing IP under
  // Google Play Data Safety is a gray area we can just avoid.
  sendDefaultPii: false,

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
        <ProfileProvider>
          <LLThemeProvider>
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <ProfileScopedStack />
              <StatusBar style="auto" />
            </ThemeProvider>
          </LLThemeProvider>
        </ProfileProvider>
      </ProProvider>
    </GestureHandlerRootView>
  );
});

// Family Mode: bumping profileVersion forces a remount of every screen so
// they re-read namespaced storage against the new active profile. Cheaper
// than wiring a refresh subscription into every component that talks to
// AsyncStorage. Routing state resets to the initial tab (Home), which is
// the expected post-switch landing spot anyway.
function ProfileScopedStack() {
  const { profileVersion } = useProfile();
  return (
    <Stack key={profileVersion}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}
