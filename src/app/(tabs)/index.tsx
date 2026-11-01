import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { PickerModal } from '@/components/Modals';
import { Button, Chip, Empty, Input, TagList, styles as ui } from '@/components/ui';
import { createSong, listSongs, type SongListItem, type SongSort } from '@/db/repo';
import { STATUS_LABELS, type SongStatus } from '@/db/types';
import { formatDate, splitTags } from '@/lib/utils';
import { colors, spacing } from '@/theme';

const SORT_LABELS: Record<SongSort, string> = {
  updated: 'Modifiés récemment',
  created: 'Créés récemment',
  title: 'Titre (A → Z)',
  status: 'Statut',
};

const STATUS_COLORS: Record<SongStatus, string> = {
  idea: colors.textDim,
  wip: colors.warning,
  done: colors.success,
};

export default function SongsScreen() {
  const db = useSQLiteContext();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SongStatus | null>(null);
  const [sort, setSort] = useState<SongSort>('updated');
  const [sortOpen, setSortOpen] = useState(false);

  const load = useCallback(() => {
    listSongs(db, { search, status, sort }).then(setSongs).catch(console.error);
  }, [db, search, status, sort]);

  // Recharge à chaque retour sur l'onglet (SQLite reste la seule source de vérité).
  useFocusEffect(load);

  const create = async () => {
    const id = await createSong(db);
    router.push(`/song/${id}`);
  };

  return (
    <View style={ui.screen}>
      <View style={styles.header}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher (titre, tag, paroles…)"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <View style={styles.filters}>
          <Chip label="Tous" selected={!status} onPress={() => setStatus(null)} />
          {(Object.keys(STATUS_LABELS) as SongStatus[]).map((s) => (
            <Chip key={s} label={STATUS_LABELS[s]} selected={status === s} onPress={() => setStatus(s)} />
          ))}
          <View style={{ flex: 1 }} />
          <Button icon="swap-vertical" variant="ghost" onPress={() => setSortOpen(true)} accessibilityLabel="Trier" />
        </View>
      </View>

      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          search || status ? (
            <Empty icon="search" title="Aucun résultat" />
          ) : (
            <Empty icon="mic" title="Aucun morceau pour l'instant" hint="Appuie sur + pour écrire ton premier texte." />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/song/${item.id}`)}
            style={({ pressed }) => [ui.card, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.cardTop}>
              <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>
                {item.title || 'Sans titre'}
              </Text>
              <View style={[styles.badge, { borderColor: STATUS_COLORS[item.status] }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] }]}>
                  {STATUS_LABELS[item.status]}
                </Text>
              </View>
            </View>
            <Text style={ui.dim}>
              {[
                item.bpm ? `${item.bpm} BPM` : null,
                item.musical_key || null,
                `${item.section_count} section${item.section_count > 1 ? 's' : ''}`,
                item.take_count ? `${item.take_count} prise${item.take_count > 1 ? 's' : ''}` : null,
                item.beat_file ? '♪ instru' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <TagList tags={splitTags(item.tags)} />
            <Text style={[ui.dim, { fontSize: 12 }]}>Modifié le {formatDate(item.updated_at)}</Text>
          </Pressable>
        )}
      />

      <Pressable onPress={create} style={styles.fab} accessibilityRole="button" accessibilityLabel="Nouveau morceau">
        <Ionicons name="add" size={34} color="#fff" />
      </Pressable>

      <PickerModal
        visible={sortOpen}
        title="Trier par"
        options={(Object.keys(SORT_LABELS) as SongSort[]).map((value) => ({
          value,
          label: (value === sort ? '✓ ' : '') + SORT_LABELS[value],
        }))}
        onCancel={() => setSortOpen(false)}
        onPick={(v) => {
          setSort(v);
          setSortOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingBottom: 0, gap: spacing.md },
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
