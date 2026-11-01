import { setAudioModeAsync } from 'expo-audio';
import { Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DB_NAME } from '@/db/constants';
import { migrateDb } from '@/db/migrations';
import { colors, navTheme } from '@/theme';

export default function RootLayout() {
  useEffect(() => {
    // Lecture même en mode silencieux ; on coupe la musique des autres apps.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(console.warn);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={navTheme}>
        <SQLiteProvider databaseName={DB_NAME} onInit={migrateDb}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="song/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="idea/[id]" options={{ title: 'Idée' }} />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
