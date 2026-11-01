import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { useBeat } from '@/audio/BeatContext';
import { Button, Chip, Field, Input, TagList, styles as ui } from '@/components/ui';
import { deleteSong, getSong, updateSong } from '@/db/repo';
import { STATUS_LABELS, type Song, type SongStatus } from '@/db/types';
import { useAutosave } from '@/lib/useAutosave';
import { normalizeTags, splitTags } from '@/lib/utils';
import { spacing } from '@/theme';

const KEY_SUGGESTIONS = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

export default function SongInfos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const headerHeight = useHeaderHeight();
  const beat = useBeat();

  const [song, setSong] = useState<Song | null>(null);
  const [bpm, setBpm] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    getSong(db, id).then((s) => {
      if (!s) return;
      setSong(s);
      setBpm(s.bpm ? String(s.bpm) : '');
      setTags(splitTags(s.tags).join(', '));
    });
  }, [db, id]);

  const { schedule, flush } = useAutosave(
    useCallback(
      async (key: string, value: string) => {
        if (key === 'bpm') {
          const n = parseInt(value, 10);
          await updateSong(db, id, { bpm: Number.isFinite(n) && n > 0 ? n : null });
        } else if (key === 'tags') {
          await updateSong(db, id, { tags: normalizeTags(value) });
        } else if (key === 'musical_key' || key === 'credits') {
          await updateSong(db, id, { [key]: value });
        }
      },
      [db, id],
    ),
  );

  if (!song) return <View style={ui.screen} />;

  const set = <K extends 'musical_key' | 'credits'>(key: K, value: string) => {
    setSong({ ...song, [key]: value });
    schedule(key, value);
  };

  const setStatus = async (status: SongStatus) => {
    setSong({ ...song, status });
    await updateSong(db, id, { status });
  };

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer ce morceau ?',
      "Paroles, instru et prises vocales seront supprimées définitivement. Pense à faire une sauvegarde dans Réglages si tu as un doute.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            beat.player.pause();
            await deleteSong(db, id);
            router.dismissAll();
          },
        },
      ],
    );
  };

  const confirmRemoveBeat = () => {
    Alert.alert("Retirer l'instru ?", 'Le fichier copié dans l’app sera supprimé. Tes prises restent.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => void beat.removeBeat() },
    ]);
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Field label="Statut">
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(Object.keys(STATUS_LABELS) as SongStatus[]).map((s) => (
              <Chip key={s} label={STATUS_LABELS[s]} selected={song.status === s} onPress={() => setStatus(s)} />
            ))}
          </View>
        </Field>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label="BPM">
              <Input
                value={bpm}
                onChangeText={(v) => {
                  const digits = v.replace(/[^0-9]/g, '').slice(0, 3);
                  setBpm(digits);
                  schedule('bpm', digits);
                }}
                onBlur={() => void flush()}
                keyboardType="number-pad"
                placeholder="ex. 90"
              />
            </Field>
          </View>
          <View style={{ flex: 2 }}>
            <Field label="Tonalité">
              <Input
                value={song.musical_key}
                onChangeText={(v) => set('musical_key', v)}
                onBlur={() => void flush()}
                placeholder="ex. La mineur"
              />
            </Field>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.md }}>
          {KEY_SUGGESTIONS.map((k) => (
            <Chip key={k} label={k} onPress={() => set('musical_key', k)} />
          ))}
          <Chip label="mineur" onPress={() => set('musical_key', `${song.musical_key.replace(/ (majeur|mineur)$/, '')} mineur`.trim())} />
          <Chip label="majeur" onPress={() => set('musical_key', `${song.musical_key.replace(/ (majeur|mineur)$/, '')} majeur`.trim())} />
        </View>

        <Field label="Crédits">
          <Input
            value={song.credits}
            onChangeText={(v) => set('credits', v)}
            onBlur={() => void flush()}
            multiline
            placeholder="Prod. par…, feat…, mix…"
          />
        </Field>

        <Field label="Tags (séparés par des virgules)">
          <Input
            value={tags}
            onChangeText={(v) => {
              setTags(v);
              schedule('tags', v);
            }}
            onBlur={() => void flush()}
            placeholder="trap, mélancolique, freestyle"
            autoCapitalize="none"
          />
          <TagList tags={splitTags(normalizeTags(tags))} />
        </Field>

        <Field label="Instru">
          <Text style={ui.dim}>{beat.hasBeat ? beat.beatName : 'Aucune instru'}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              icon="folder-open"
              label={beat.hasBeat ? 'Remplacer' : 'Importer'}
              onPress={() => beat.importBeat().catch((e) => Alert.alert('Import impossible', String(e)))}
              style={{ flex: 1 }}
            />
            {beat.hasBeat && (
              <Button icon="close" label="Retirer" variant="danger" onPress={confirmRemoveBeat} style={{ flex: 1 }} />
            )}
          </View>
        </Field>

        <Button icon="trash" label="Supprimer le morceau" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
