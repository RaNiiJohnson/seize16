import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useBeat } from '@/audio/BeatContext';
import { formatTime } from '@/lib/utils';
import { colors, radius, spacing } from '@/theme';
import { Button } from './ui';

/** Lecteur volontairement simple : play/pause, -5 s / +5 s, barre de progression. */
export function BeatPlayer() {
  const { status, hasBeat, beatName, importBeat, seekBy, toggle, player } = useBeat();
  const [barWidth, setBarWidth] = useState(1);
  const [importing, setImporting] = useState(false);

  const onImport = async () => {
    setImporting(true);
    try {
      await importBeat();
    } catch (e) {
      Alert.alert("Import impossible", String(e));
    } finally {
      setImporting(false);
    }
  };

  if (!hasBeat) {
    return (
      <View style={styles.bar}>
        <Button
          icon="musical-note"
          label="Importer une instru (mp3)"
          onPress={onImport}
          loading={importing}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  return (
    <View style={styles.bar}>
      <Text style={styles.name} numberOfLines={1}>
        ♪ {beatName}
      </Text>
      <Pressable
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => duration > 0 && player.seekTo((e.nativeEvent.locationX / barWidth) * duration)}
        hitSlop={{ top: 14, bottom: 14 }}
        style={styles.track}
        accessibilityLabel="Barre de progression"
      >
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </Pressable>
      <View style={styles.controls}>
        <Text style={styles.time}>{formatTime(status.currentTime)}</Text>
        <Button icon="play-back" label="5 s" onPress={() => seekBy(-5)} accessibilityLabel="Reculer de 5 secondes" />
        <Button
          icon={status.playing ? 'pause' : 'play'}
          variant="primary"
          onPress={toggle}
          disabled={!status.isLoaded}
          accessibilityLabel={status.playing ? 'Pause' : 'Lecture'}
          style={styles.play}
        />
        <Button icon="play-forward" label="5 s" onPress={() => seekBy(5)} accessibilityLabel="Avancer de 5 secondes" />
        <Text style={[styles.time, { textAlign: 'right' }]}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  name: { color: colors.textDim, fontSize: 13 },
  track: {
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  time: { color: colors.text, fontVariant: ['tabular-nums'], width: 48, fontSize: 15 },
  play: { width: 64, height: 56, borderRadius: 28 },
});
