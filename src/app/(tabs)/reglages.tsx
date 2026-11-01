import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Button, styles as ui } from '@/components/ui';
import { createBackup, restoreBackup, type BackupSummary } from '@/lib/backup';
import { spacing } from '@/theme';

const describe = (s: BackupSummary) =>
  `${s.songs} morceau(x), ${s.ideas} idée(s), ${s.takes} prise(s), ${s.files} fichier(s) audio.`;

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null);

  const save = async () => {
    setBusy('save');
    try {
      await createBackup(db);
    } catch (e) {
      Alert.alert('Sauvegarde impossible', String(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = () => {
    Alert.alert(
      'Restaurer une sauvegarde ?',
      'TOUT le contenu actuel (morceaux, idées, instrus, prises) sera remplacé par celui de la sauvegarde. Fais d’abord une sauvegarde de l’état actuel si tu veux le garder.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Choisir le fichier',
          style: 'destructive',
          onPress: async () => {
            setBusy('restore');
            try {
              const summary = await restoreBackup(db);
              if (summary) Alert.alert('Restauration terminée', describe(summary));
            } catch (e) {
              Alert.alert('Restauration impossible', `${String(e)}\n\nTes données actuelles n’ont pas été modifiées.`);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={ui.card}>
        <Text style={ui.title}>Sauvegarde</Text>
        <Text style={ui.dim}>
          Tout ton carnet (paroles, idées, instrus, prises) dans un seul fichier .carnet. Envoie-le sur ton Drive, par
          mail ou sur ton PC : rien ne quitte le téléphone sans toi.
        </Text>
        <Button icon="cloud-upload" label="Créer une sauvegarde" variant="primary" onPress={save} loading={busy === 'save'} disabled={!!busy} />
        <Button icon="cloud-download" label="Restaurer…" onPress={restore} loading={busy === 'restore'} disabled={!!busy} />
      </View>

      <View style={ui.card}>
        <Text style={ui.title}>Bientôt</Text>
        <Text style={ui.dim}>
          Compteur de syllabes, rimes colorées, mode scène (écran toujours allumé) et historique des versions.
        </Text>
      </View>

      <Text style={[ui.dim, { textAlign: 'center' }]}>
        Seize {Constants.expoConfig?.version ?? ''} · 100 % hors ligne, sans compte
      </Text>
    </ScrollView>
  );
}
