import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import { getAssetContentUriAsync, getAssetsAsync, SortBy, usePermissions, type Asset } from 'expo-media-library/legacy';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBeat } from '@/audio/BeatContext';
import { Button, Chip, Empty, Input, styles as ui } from '@/components/ui';
import { extensionOf } from '@/lib/files';
import { formatTime } from '@/lib/utils';
import { colors, radius, spacing } from '@/theme';

/** Les sons de moins de 10 s (notifications, sonneries) ne sont pas des instrus. */
const MIN_DURATION = 10;
const PAGE = 500;
const MAX_ASSETS = 5000;

// La médiathèque iOS ne contient pas les fichiers audio : on passe par l'app Fichiers.
const HAS_LIBRARY = Platform.OS === 'android';

type Track = { asset: Asset; title: string; ext: string };

function toTrack(asset: Asset): Track {
  const ext = extensionOf(asset.filename, '').replace('.', '');
  const title = ext ? asset.filename.slice(0, -(ext.length + 1)) : asset.filename;
  return { asset, title: title.replace(/[_]+/g, ' ').trim() || asset.filename, ext: ext.toUpperCase() };
}

async function loadAllAudio(): Promise<Track[]> {
  const out: Asset[] = [];
  let after: string | undefined;
  while (out.length < MAX_ASSETS) {
    const page = await getAssetsAsync({
      mediaType: 'audio',
      first: PAGE,
      after,
      sortBy: [[SortBy.modificationTime, false]],
    });
    out.push(...page.assets);
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  return out.filter((a) => a.duration >= MIN_DURATION).map(toTrack);
}

export default function BeatLibrary() {
  const beat = useBeat();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = usePermissions({ granularPermissions: ['audio'] });
  const granted = !!permission?.granted;

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<string | null>(null);
  const [selected, setSelected] = useState<Track | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = useAudioPlayer(null, { updateInterval: 250 });
  const previewStatus = useAudioPlayerStatus(preview);

  // L'instru du morceau se tait pendant qu'on écoute la bibliothèque.
  useEffect(() => {
    beat.player.pause();
  }, [beat.player]);

  useEffect(() => {
    if (!HAS_LIBRARY || !granted) return;
    let alive = true;
    loadAllAudio()
      .then((t) => alive && setTracks(t))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [granted]);

  const formats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks ?? []) if (t.ext) counts.set(t.ext, (counts.get(t.ext) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([ext]) => ext);
  }, [tracks]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tracks ?? []).filter(
      (t) => (!format || t.ext === format) && (!q || t.asset.filename.toLowerCase().includes(q)),
    );
  }, [tracks, search, format]);

  const onTapTrack = (t: Track) => {
    if (selected?.asset.id === t.asset.id) {
      if (preview.playing) preview.pause();
      else preview.play();
      return;
    }
    setSelected(t);
    preview.replace({ uri: t.asset.uri });
    preview.play();
  };

  const onUse = async () => {
    if (!selected) return;
    setSaving(true);
    preview.pause();
    try {
      try {
        await beat.setBeatFromFile(new File(selected.asset.uri), selected.asset.filename);
      } catch {
        // Certains appareils refusent la lecture par chemin : on repasse par l'URI content://.
        const contentUri = await getAssetContentUriAsync(selected.asset);
        await beat.setBeatFromFile(new File(contentUri), selected.asset.filename);
      }
      router.back();
    } catch (e) {
      Alert.alert('Import impossible', String(e));
      setSaving(false);
    }
  };

  const onBrowse = async () => {
    preview.pause();
    try {
      if (await beat.importBeat()) router.back();
    } catch (e) {
      Alert.alert('Import impossible', String(e));
    }
  };

  const browseButton = (
    <Button icon="folder-open-outline" label="Parcourir les fichiers" onPress={onBrowse} variant="ghost" />
  );

  if (!HAS_LIBRARY) {
    return (
      <View style={[ui.screen, styles.center]}>
        <Empty icon="musical-notes" title="Choisis ton instru" hint="Ouvre l'app Fichiers et sélectionne ton mp3." />
        <Button icon="folder-open" label="Parcourir les fichiers" variant="primary" onPress={onBrowse} />
      </View>
    );
  }

  if (!permission) {
    return <ActivityIndicator style={{ marginTop: 60 }} color={colors.accent} />;
  }

  if (!granted) {
    return (
      <View style={[ui.screen, styles.center]}>
        <Empty
          icon="musical-notes"
          title="Accès à ta musique"
          hint="Seize16 liste les fichiers audio du téléphone pour que tu choisisses ton instru. Rien ne quitte l'appareil."
        />
        {permission.canAskAgain ? (
          <Button icon="lock-open" label="Autoriser l'accès" variant="primary" onPress={requestPermission} />
        ) : (
          <Button icon="settings" label="Ouvrir les réglages" variant="primary" onPress={() => Linking.openSettings()} />
        )}
        {browseButton}
      </View>
    );
  }

  return (
    <View style={ui.screen}>
      <View style={styles.top}>
        <View>
          <Ionicons name="search" size={18} color={colors.textDim} style={styles.searchIcon} />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un son"
            style={styles.search}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {formats.length > 1 && (
          <View style={styles.formats}>
            <Chip label="Tous" selected={!format} onPress={() => setFormat(null)} />
            {formats.slice(0, 4).map((f) => (
              <Chip key={f} label={f} selected={format === f} onPress={() => setFormat(format === f ? null : f)} />
            ))}
          </View>
        )}
      </View>

      {error ? (
        <Empty icon="alert-circle" title="Lecture de la musique impossible" hint={error} />
      ) : !tracks ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.asset.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 24 }}
          ListHeaderComponent={
            <Text style={styles.count}>
              {visible.length} son{visible.length > 1 ? 's' : ''}
            </Text>
          }
          ListEmptyComponent={
            <Empty
              icon="musical-notes-outline"
              title={search || format ? 'Aucun résultat' : 'Aucun fichier audio trouvé'}
              hint="Ton instru n'est pas là ? Parcours les fichiers."
            />
          }
          ListFooterComponent={<View style={styles.footer}>{browseButton}</View>}
          renderItem={({ item }) => {
            const isSelected = selected?.asset.id === item.asset.id;
            const isPlaying = isSelected && previewStatus.playing;
            return (
              <Pressable
                onPress={() => onTapTrack(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatTime(item.asset.duration)}`}
                style={({ pressed }) => [styles.row, isSelected && styles.rowSelected, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.art, isSelected && { backgroundColor: colors.accent }]}>
                  <Ionicons
                    name={isPlaying ? 'pause' : isSelected ? 'play' : 'musical-note'}
                    size={22}
                    color={isSelected ? '#fff' : colors.accent}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.trackTitle, isSelected && { color: colors.accent }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.trackMeta}>
                    {formatTime(item.asset.duration)}
                    {item.ext ? `  ·  ${item.ext}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {selected && (
        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
          <View style={styles.dockTrack}>
            <View
              style={[
                styles.dockFill,
                {
                  width: `${previewStatus.duration ? Math.min(1, previewStatus.currentTime / previewStatus.duration) * 100 : 0}%`,
                },
              ]}
            />
          </View>
          <View style={styles.dockRow}>
            <Pressable
              onPress={() => (preview.playing ? preview.pause() : preview.play())}
              accessibilityRole="button"
              accessibilityLabel={previewStatus.playing ? 'Pause' : 'Écouter'}
              style={({ pressed }) => [styles.dockPlay, pressed && { opacity: 0.6 }]}
            >
              <Ionicons
                name={previewStatus.playing ? 'pause' : 'play'}
                size={24}
                color={colors.bg}
                style={!previewStatus.playing && { marginLeft: 3 }}
              />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {selected.title}
              </Text>
              <Text style={styles.trackMeta}>
                {formatTime(previewStatus.currentTime)} / {formatTime(selected.asset.duration)}
              </Text>
            </View>
            <Button icon="checkmark" label="Choisir" variant="primary" onPress={onUse} loading={saving} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'stretch', padding: spacing.xl, gap: spacing.md },
  top: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  searchIcon: { position: 'absolute', left: spacing.md, top: 17, zIndex: 1 },
  search: { paddingLeft: 40, borderRadius: 999 },
  formats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: { color: colors.textDim, fontSize: 13, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 68,
  },
  rowSelected: { backgroundColor: colors.surface },
  art: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  trackMeta: { color: colors.textDim, fontSize: 13, fontVariant: ['tabular-nums'] },
  footer: { padding: spacing.lg, alignItems: 'center' },
  dock: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  dockTrack: { height: 3, marginHorizontal: -spacing.lg, backgroundColor: colors.surfaceAlt },
  dockFill: { height: '100%', backgroundColor: colors.accent },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dockPlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
