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
      <View style={styles.header}>
        <View style={styles.status}>
          <View style={[styles.dot, recording && { backgroundColor: colors.danger }]} />
          <Text style={[styles.label, recording && { color: colors.danger }]}>{recording ? 'ENREGISTREMENT' : 'STUDIO'}</Text>
        </View>
        <View style={styles.status}>
          <Text style={styles.small}>{beat.hasBeat ? 'Avec l’instru' : 'Pas d’instru'}</Text>
          <Switch
            value={withBeat}
            onValueChange={setBeatWanted}
            disabled={!beat.hasBeat || recording}
            trackColor={{ true: colors.danger, false: colors.surfaceAlt }}
            thumbColor={colors.text}
            accessibilityLabel="Enregistrer par-dessus l'instru"
          />
        </View>
      </View>
      {withBeat && !recording && (
        <View style={styles.warning}>
          <Ionicons name="headset" size={16} color={colors.warning} />
          <Text style={styles.warningText}>Mets un casque : sinon l’instru sera dans ta prise.</Text>
        </View>
      )}
      <View style={styles.row}>
        <View style={styles.side}>
          <Text style={[styles.timer, recording && { color: colors.danger }]}>
            {formatTime(recState.durationMillis / 1000)}
          </Text>
        </View>

        <Pressable
          onPress={recording ? stop : start}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={recording ? "Arrêter l'enregistrement" : 'Enregistrer une prise'}
          style={({ pressed }) => [styles.ring, (pressed || busy) && { opacity: 0.7 }]}
        >
          <View style={[styles.rec, recording && styles.recActive]}>
            <Ionicons name={recording ? 'stop' : 'mic'} size={recording ? 24 : 28} color="#fff" />
          </View>
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
  // Fond légèrement rougi : on distingue d'un coup d'œil la zone d'enregistrement du lecteur.
  bar: {
    backgroundColor: '#1C1519',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textDim },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { flex: 1, justifyContent: 'center' },
  small: { color: colors.textDim, fontSize: 13 },
  timer: { color: colors.text, fontSize: 26, fontWeight: '300', fontVariant: ['tabular-nums'] },
  ring: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: 'rgba(255,77,77,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rec: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recActive: { width: 44, height: 44, borderRadius: radius.md },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  warningText: { color: colors.warning, fontSize: 13, flex: 1 },
});
