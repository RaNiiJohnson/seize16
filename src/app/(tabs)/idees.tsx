import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Input, TagList, styles as ui } from '@/components/ui';
import { createIdea, listIdeas, type IdeaListItem } from '@/db/repo';
import { formatDate, normalizeTags, splitTags } from '@/lib/utils';
import { colors, spacing } from '@/theme';

export default function IdeasScreen() {
  const db = useSQLiteContext();
  const [ideas, setIdeas] = useState<IdeaListItem[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');

  const load = useCallback(() => {
    listIdeas(db, search).then(setIdeas).catch(console.error);
  }, [db, search]);
  useFocusEffect(load);

  // Note rapide : les #mots deviennent des tags.
  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    const tags = normalizeTags((text.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((t) => t.slice(1)).join(','));
    setDraft('');
    await createIdea(db, text, tags);
    load();
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding">
      <View style={styles.header}>
        <Input value={search} onChangeText={setSearch} placeholder="Rechercher une idée" returnKeyType="search" />
      </View>
      <FlatList
        data={ideas}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={
          <Empty
            icon="bulb-outline"
            title={search ? 'Aucune idée trouvée' : 'Ton carnet est vide'}
            hint={search ? undefined : 'Une punchline, un thème, une mélodie… note-la en bas. Ajoute des #tags.'}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/idea/${item.id}`)}
            style={({ pressed }) => [ui.card, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.content} numberOfLines={4}>
              {item.content}
            </Text>
            <TagList tags={splitTags(item.tags)} />
            <View style={styles.meta}>
              <Text style={ui.dim}>{formatDate(item.updated_at)}</Text>
              {item.song_title !== null && (
                <Text style={[ui.dim, { color: colors.success }]} numberOfLines={1}>
                  <Ionicons name="arrow-forward" size={13} /> {item.song_title || 'Sans titre'}
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />
      <View style={styles.composer}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="Nouvelle idée… #tag"
          multiline
          style={{ flex: 1, minHeight: 52, maxHeight: 140 }}
        />
        <Button icon="add" variant="primary" onPress={add} disabled={!draft.trim()} accessibilityLabel="Ajouter l'idée" />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingBottom: 0 },
  content: { color: colors.text, fontSize: 17, lineHeight: 24 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
