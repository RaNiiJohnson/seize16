import { Stack, router, useLocalSearchParams } from 'expo-router';

import { BeatProvider } from '@/audio/BeatContext';
import { IconButton } from '@/components/ui';
import { colors } from '@/theme';

export default function SongLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <BeatProvider songId={id}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: '',
            // Premier écran de la pile imbriquée : pas de bouton retour automatique.
            headerLeft: () => (
              <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Retour aux morceaux" />
            ),
          }}
        />
        <Stack.Screen name="infos" options={{ title: 'Infos du morceau' }} />
        <Stack.Screen name="prises" options={{ title: 'Prises vocales' }} />
      </Stack>
    </BeatProvider>
  );
}
