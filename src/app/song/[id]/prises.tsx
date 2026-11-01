import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useBeat } from '@/audio/BeatContext';
import { PromptModal } from '@/components/Modals';
import { Button, Empty, IconButton, styles as ui } from '@/components/ui';
import { deleteTake, listTakes, renameTake } from '@/db/repo';
import type { Take } from '@/db/types';
import { uriFromRelative } from '@/lib/files';
import { formatDateTime, formatTime } from '@/lib/utils';
import { colors, radius, spacing } from '@/theme';

export default function TakesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const beat = useBeat();

  // Un lecteur séparé pour réécouter les prises (l'instru garde le sien).
  const takePlayer = useAudioPlayer(null, { updateInterval: 250 });
  const takeStatus = useAudioPlayerStatus(takePlayer);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const [takes, setTakes] = useState<Take[]>([]);
  const [renaming, setRenaming] = useState<Take | null>(null);

  const load = useCallback(() => {
    listTakes(db, id).then(setTakes).catch(console.error);
  }, [db, id]);
  useFocusEffect(load);

  const togglePlay = (take: Take) => {
    if (playingId === take.id) {
      if (takeStatus.playing) return takePlayer.pause();
      // Arrivée au bout : on repart du début.
      if (takeStatus.duration > 0 && takeStatus.currentTime >= takeStatus.duration - 0.25) void takePlayer.seekTo(0);
      takePlayer.play();
      return;
    }
    beat.player.pause();
    takePlayer.replace({ uri: uriFromRelative(take.file) });
    takePlayer.play();
    setPlayingId(take.id);
  };

  const share = async (take: Take) => {
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage n'est pas disponible sur cet appareil.");
      await Sharing.shareAsync(uriFromRelative(take.file), { mimeType: 'audio/mp4', UTI: 'public.mpeg-4-audio', dialogTitle: take.name });
    } catch (e) {
      Alert.alert('Partage impossible', String(e));
    }
  };

  const confirmDelete = (take: Take) => {
    Alert.alert(`Supprimer « ${take.name} » ?`, "Le fichier audio sera effacé du téléphone. Partage-le d'abord si tu veux le garder.", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          if (playingId === take.id) {
            takePlayer.pause();
            setPlayingId(null);
          }
          await deleteTake(db, take);
          load();
        },
      },
    ]);
  };

  const onRename = async (name: string) => {
    const take = renaming;
    setRenaming(null);
    if (!take || !name.trim()) return;
    await renameTake(db, take.id, name.trim());
    load();
  };

  return (
    <View style={ui.screen}>
      <FlatList
        data={takes}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Empty icon="mic-outline" title="Pas encore de prise" hint="Dans l’éditeur, touche le micro en haut (mode studio) : tu enregistres avec tes paroles sous les yeux." />}
        renderItem={({ item }) => {
          const active = playingId === item.id;
          const progress = active && takeStatus.duration > 0 ? takeStatus.currentTime / takeStatus.duration : 0;
          return (
            <View style={styles.take}>
              <View style={styles.row}>
                <Button
                  icon={active && takeStatus.playing ? 'pause' : 'play'}
                  variant="primary"
                  onPress={() => togglePlay(item)}
                  accessibilityLabel={`Écouter ${item.name}`}
                />
                <Pressable style={{ flex: 1 }} onPress={() => setRenaming(item)} accessibilityLabel={`Renommer ${item.name}`}>
                  <Text style={ui.title} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={ui.dim}>
                    {formatTime(item.duration_ms / 1000)} · {formatDateTime(item.created_at)}
                    {item.with_beat ? ' · avec instru' : ''}
                  </Text>
                </Pressable>
                <IconButton icon="share-outline" onPress={() => share(item)} accessibilityLabel={`Partager ${item.name}`} />
                <IconButton icon="trash-outline" onPress={() => confirmDelete(item)} accessibilityLabel={`Supprimer ${item.name}`} />
              </View>
              {active && (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(1, progress) * 100}%` }]} />
                </View>
              )}
            </View>
          );
        }}
      />

      <PromptModal
        visible={!!renaming}
        title="Renommer la prise"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Renommer"
        onCancel={() => setRenaming(null)}
        onConfirm={onRename}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  take: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
