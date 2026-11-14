import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useBeat } from '@/audio/BeatContext';
import { formatTime } from '@/lib/utils';
import { colors, radius, spacing } from '@/theme';

/** Lecteur volontairement simple : play/pause, -5 s / +5 s, barre de progression. */
export function BeatPlayer() {
  const { songId, status, hasBeat, beatName, seekBy, toggle, player } = useBeat();
  const [barWidth, setBarWidth] = useState(1);
  const openLibrary = () => router.push(`/song/${songId}/instru`);

  if (!hasBeat) {
    return (
      <Pressable
        onPress={openLibrary}
        accessibilityRole="button"
        accessibilityLabel="Choisir une instru"
        style={({ pressed }) => [styles.bar, styles.emptyBar, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.emptyArt}>
          <Ionicons name="musical-notes" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.emptyTitle}>Choisir une instru</Text>
          <Text style={styles.time}>Parmi les sons de ton téléphone</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textDim} />
      </Pressable>
    );
  }

  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  return (
    <View style={styles.bar}>
      <View style={styles.nameRow}>
        <Ionicons name="musical-note" size={14} color={colors.accent} />
        <Text style={styles.name} numberOfLines={1}>
          {beatName?.replace(/\.[a-z0-9]{1,5}$/i, '')}
        </Text>
        <Pressable onPress={openLibrary} hitSlop={10} accessibilityRole="button" accessibilityLabel="Changer d'instru">
          <Text style={styles.change}>Changer</Text>
        </Pressable>
      </View>
      <Pressable
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => duration > 0 && player.seekTo((e.nativeEvent.locationX / barWidth) * duration)}
        hitSlop={{ top: 14, bottom: 14 }}
        style={styles.track}
        accessibilityLabel="Barre de progression"
      >
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(status.currentTime)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={() => seekBy(-5)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Reculer de 5 secondes"
          style={({ pressed }) => [styles.seek, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name="replay-5" size={28} color={colors.text} />
        </Pressable>
        {/* Lecture en blanc : le rouge est réservé à l'enregistrement. */}
        <Pressable
          onPress={toggle}
          disabled={!status.isLoaded}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause' : 'Lecture'}
          style={({ pressed }) => [styles.play, (pressed || !status.isLoaded) && { opacity: 0.6 }]}
        >
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={28}
            color={colors.bg}
            style={!status.playing && { marginLeft: 3 }}
          />
        </Pressable>
        <Pressable
          onPress={() => seekBy(5)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Avancer de 5 secondes"
          style={({ pressed }) => [styles.seek, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name="forward-5" size={28} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  change: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  emptyBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  emptyArt: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  track: {
    height: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.textDim, fontVariant: ['tabular-nums'], fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl * 1.5 },
  seek: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
