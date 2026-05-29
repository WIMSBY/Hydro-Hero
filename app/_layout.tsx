import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider } from "../contexts/AuthContext";
import { ProProvider } from "../contexts/ProContext";
import { LLThemeProvider } from "../contexts/ThemeContext";
import { configureRevenueCat } from "../utils/revenueCat";
import * as Sentry from '@sentry/react-native';

function handleDeepLink(url: string) {
  const { hostname, queryParams } = Linking.parse(url);
  if (hostname === "add") {
    const code = typeof queryParams?.code === "string" ? queryParams.code : null;
    if (code) {
      router.push({ pathname: "/(tabs)/partners", params: { addCode: code } });
    }
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

export default Sentry.wrap(function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
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
    </AuthProvider>
  );
});
