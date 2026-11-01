import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useBeat } from '@/audio/BeatContext';
import { PromptModal } from '@/components/Modals';
import { Button, Empty, IconButton, styles as ui } from '@/components/ui';
import { addTake, deleteTake, listTakes, renameTake } from '@/db/repo';
import type { Take } from '@/db/types';
import { TAKES_DIR, ensureDir, uriFromRelative } from '@/lib/files';
import { formatDateTime, formatTime, newId } from '@/lib/utils';
import { colors, radius, spacing } from '@/theme';

export default function TakesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const beat = useBeat();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [beatWanted, setWithBeat] = useState(true);
  const withBeat = beatWanted && beat.hasBeat;
  const [busy, setBusy] = useState(false);

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

  const startRecording = async () => {
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Micro refusé',
          "Sans accès au micro, impossible d'enregistrer. Tu peux l'autoriser dans les réglages du téléphone.",
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
      takePlayer.pause();
      setPlayingId(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix' });
      await recorder.prepareToRecordAsync();
      if (withBeat) {
        await beat.player.seekTo(0);
        beat.player.play();
      } else {
        beat.player.pause();
      }
      recorder.record();
    } catch (e) {
      Alert.alert('Enregistrement impossible', String(e));
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async () => {
    setBusy(true);
    const durationMs = recState.durationMillis;
    try {
      await recorder.stop();
      beat.player.pause();
      const uri = recorder.uri;
      if (!uri) throw new Error('Aucun fichier enregistré');

      // L'enregistrement part dans le cache (que le système peut vider) : on le range dans documents/takes.
      const fileName = `${id}-${newId()}.m4a`;
      await new File(uri).move(new File(ensureDir(TAKES_DIR), fileName));
      await addTake(db, {
        song_id: id,
        name: `Prise ${takes.length + 1}`,
        file: `${TAKES_DIR}/${fileName}`,
        duration_ms: durationMs,
        with_beat: withBeat ? 1 : 0,
      });
      load();
    } catch (e) {
      Alert.alert("La prise n'a pas pu être enregistrée", String(e));
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(
        console.warn,
      );
      setBusy(false);
    }
  };

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

  const recording = recState.isRecording;

  return (
    <View style={ui.screen}>
      <View style={styles.recorder}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={ui.title}>Avec l&apos;instru</Text>
            <Text style={ui.dim}>{beat.hasBeat ? beat.beatName : 'Importe une instru depuis l’éditeur'}</Text>
          </View>
          <Switch
            value={withBeat}
            onValueChange={setWithBeat}
            disabled={!beat.hasBeat || recording}
            trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
            accessibilityLabel="Enregistrer par-dessus l'instru"
          />
        </View>

        {withBeat && (
          <View style={styles.warning}>
            <Ionicons name="headset" size={22} color={colors.warning} />
            <Text style={styles.warningText}>Mets un casque : sinon l’instru sera enregistrée dans ta prise.</Text>
          </View>
        )}

        <Text style={styles.timer}>{formatTime(recState.durationMillis / 1000)}</Text>

        <Pressable
          onPress={recording ? stopRecording : startRecording}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={recording ? "Arrêter l'enregistrement" : 'Enregistrer'}
          style={({ pressed }) => [styles.recButton, recording && styles.recButtonActive, (pressed || busy) && { opacity: 0.7 }]}
        >
          <Ionicons name={recording ? 'stop' : 'mic'} size={40} color="#fff" />
        </Pressable>
        <Text style={[ui.dim, { textAlign: 'center' }]}>{recording ? 'Enregistrement… appuie pour arrêter' : 'Appuie pour enregistrer'}</Text>
      </View>

      <FlatList
        data={takes}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Empty icon="mic-outline" title="Pas encore de prise" hint="Tes enregistrements apparaîtront ici." />}
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
  recorder: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningText: { color: colors.warning, fontSize: 15, flex: 1, fontWeight: '600' },
  timer: { color: colors.text, fontSize: 44, fontWeight: '200', textAlign: 'center', fontVariant: ['tabular-nums'] },
  recButton: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recButtonActive: { backgroundColor: colors.danger },
  take: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
