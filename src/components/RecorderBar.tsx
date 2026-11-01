import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useBeat } from '@/audio/BeatContext';
import { addTake, countTakes } from '@/db/repo';
import { TAKES_DIR, ensureDir } from '@/lib/files';
import { formatTime, newId } from '@/lib/utils';
import { colors, radius, spacing } from '@/theme';
import { Button } from './ui';

const KEEP_AWAKE_TAG = 'recording';

/**
 * Barre d'enregistrement posée au-dessus du lecteur d'instru, dans l'éditeur :
 * on garde les paroles sous les yeux et le contrôle de l'instru pendant la prise.
 */
export function RecorderBar({
  songId,
  takeCount,
  onSaved,
  onOpenTakes,
  onRecordingChange,
}: {
  songId: string;
  takeCount: number;
  onSaved: () => void;
  onOpenTakes: () => void;
  onRecordingChange: (recording: boolean) => void;
}) {
  const db = useSQLiteContext();
  const beat = useBeat();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [beatWanted, setBeatWanted] = useState(true);
  const withBeat = beatWanted && beat.hasBeat;
  const [busy, setBusy] = useState(false);
  const recording = recState.isRecording;

  const start = async () => {
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
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix' });
      await recorder.prepareToRecordAsync();
      const p = beat.player;
      if (withBeat) {
        // L'instru repart d'où tu l'as placée (±5 s, barre) ; du début si elle était finie.
        if (p.duration > 0 && p.currentTime >= p.duration - 0.25) await p.seekTo(0);
        p.play();
      } else {
        p.pause();
      }
      recorder.record();
      onRecordingChange(true);
      // L'écran ne doit pas s'éteindre en pleine prise.
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } catch (e) {
      Alert.alert('Enregistrement impossible', String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    const durationMs = recState.durationMillis;
    try {
      await recorder.stop();
      beat.player.pause();
      const uri = recorder.uri;
      if (!uri) throw new Error('Aucun fichier enregistré');

      // L'enregistrement part dans le cache (que le système peut vider) : on le range dans documents/takes.
      const fileName = `${songId}-${newId()}.m4a`;
      await new File(uri).move(new File(ensureDir(TAKES_DIR), fileName));
      await addTake(db, {
        song_id: songId,
        name: `Prise ${(await countTakes(db, songId)) + 1}`,
        file: `${TAKES_DIR}/${fileName}`,
        duration_ms: durationMs,
        with_beat: withBeat ? 1 : 0,
      });
      onSaved();
    } catch (e) {
      Alert.alert("La prise n'a pas pu être enregistrée", String(e));
    } finally {
      onRecordingChange(false);
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(
        console.warn,
      );
      setBusy(false);
    }
  };

  return (
    <View style={styles.bar}>
      {withBeat && (
        <View style={styles.warning}>
          <Ionicons name="headset" size={18} color={colors.warning} />
          <Text style={styles.warningText}>Mets un casque : sinon l’instru sera dans ta prise.</Text>
        </View>
      )}
      <View style={styles.row}>
        <View style={styles.side}>
          <Switch
            value={withBeat}
            onValueChange={setBeatWanted}
            disabled={!beat.hasBeat || recording}
            trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
            accessibilityLabel="Enregistrer par-dessus l'instru"
          />
          <Text style={styles.small}>{beat.hasBeat ? 'Instru' : 'Sans instru'}</Text>
        </View>

        <Text style={[styles.timer, recording && { color: colors.danger }]}>
          {formatTime(recState.durationMillis / 1000)}
        </Text>

        <Pressable
          onPress={recording ? stop : start}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={recording ? "Arrêter l'enregistrement" : 'Enregistrer une prise'}
          style={({ pressed }) => [styles.rec, recording && styles.recActive, (pressed || busy) && { opacity: 0.7 }]}
        >
          <Ionicons name={recording ? 'stop' : 'mic'} size={30} color="#fff" />
        </Pressable>

        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          <Button
            icon="albums-outline"
            label={String(takeCount)}
            onPress={onOpenTakes}
            disabled={recording}
            accessibilityLabel={`Voir les prises (${takeCount})`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { flex: 1, alignItems: 'flex-start', gap: 2 },
  small: { color: colors.textDim, fontSize: 12 },
  timer: { color: colors.text, fontSize: 24, fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
  rec: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recActive: { backgroundColor: colors.danger },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  warningText: { color: colors.warning, fontSize: 14, flex: 1, fontWeight: '600' },
});
