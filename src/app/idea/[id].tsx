import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';

import { PickerModal, type PickerOption } from '@/components/Modals';
import { Button, Field, Input, TagList, styles as ui } from '@/components/ui';
import { createSong, deleteIdea, getIdea, getSong, listSongs, sendIdeaToSong, updateIdea } from '@/db/repo';
import type { Idea } from '@/db/types';
import { useAutosave } from '@/lib/useAutosave';
import { formatDateTime, normalizeTags, splitTags } from '@/lib/utils';
import { spacing } from '@/theme';

const NEW_SONG = '__new__';

export default function IdeaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const headerHeight = useHeaderHeight();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [tags, setTags] = useState('');
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [songOptions, setSongOptions] = useState<PickerOption<string>[] | null>(null);

  useEffect(() => {
    getIdea(db, id).then(async (i) => {
      if (!i) return router.back();
      setIdea(i);
      setTags(splitTags(i.tags).join(', '));
      if (i.song_id) setLinkedTitle((await getSong(db, i.song_id))?.title || 'Sans titre');
    });
  }, [db, id]);

  const { schedule, flush } = useAutosave(
    useCallback(
      async (key: string, value: string) => {
        if (key === 'content') await updateIdea(db, id, { content: value });
        else await updateIdea(db, id, { tags: normalizeTags(value) });
      },
      [db, id],
    ),
  );

  if (!idea) return <View style={ui.screen} />;

  const openSongPicker = async () => {
    await flush();
    const songs = await listSongs(db, { sort: 'updated' });
    setSongOptions([
      { value: NEW_SONG, label: '+ Nouveau morceau', hint: 'Crée un morceau à partir de cette idée' },
      ...songs.map((s) => ({ value: s.id, label: s.title || 'Sans titre' })),
    ]);
  };

  const onPickSong = async (songId: string) => {
    setSongOptions(null);
    let target = songId;
    if (songId === NEW_SONG) target = await createSong(db, idea.content.split('\n')[0].slice(0, 60));
    await sendIdeaToSong(db, idea, target);
    Alert.alert('Idée envoyée', 'Ajoutée en section « Libre » à la fin du morceau.', [
      { text: 'Rester ici', style: 'cancel' },
      { text: 'Ouvrir le morceau', onPress: () => router.push(`/song/${target}`) },
    ]);
    setLinkedTitle((await getSong(db, target))?.title || 'Sans titre');
  };

  const confirmDelete = () => {
    Alert.alert('Supprimer cette idée ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteIdea(db, id);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Input
          value={idea.content}
          onChangeText={(v) => {
            setIdea({ ...idea, content: v });
            schedule('content', v);
          }}
          onBlur={() => void flush()}
          multiline
          autoFocus={!idea.content}
          placeholder="Ton idée…"
          style={{ minHeight: 200, fontSize: 19, lineHeight: 28 }}
        />
        <Field label="Tags">
          <Input
            value={tags}
            onChangeText={(v) => {
              setTags(v);
              schedule('tags', v);
            }}
            onBlur={() => void flush()}
            placeholder="punchline, amour, ego trip"
            autoCapitalize="none"
          />
          <TagList tags={splitTags(normalizeTags(tags))} />
        </Field>

        <Text style={ui.dim}>
          Modifiée le {formatDateTime(idea.updated_at)}
          {linkedTitle !== null ? ` · envoyée vers « ${linkedTitle} »` : ''}
        </Text>

        <Button icon="arrow-forward-circle" label="Envoyer vers un morceau" variant="primary" onPress={openSongPicker} />
        <Button icon="trash" label="Supprimer l'idée" variant="danger" onPress={confirmDelete} />
      </ScrollView>

      <PickerModal
        visible={!!songOptions}
        title="Envoyer vers…"
        options={songOptions ?? []}
        onCancel={() => setSongOptions(null)}
        onPick={onPickSong}
      />
    </KeyboardAvoidingView>
  );
}
