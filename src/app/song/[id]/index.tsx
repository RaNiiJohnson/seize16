import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useBeat } from '@/audio/BeatContext';
import { BeatPlayer } from '@/components/BeatPlayer';
import { PickerModal } from '@/components/Modals';
import { RecorderBar } from '@/components/RecorderBar';
import { IconButton, styles as ui } from '@/components/ui';
import { countTakes, getSong, updateSong } from '@/db/repo';
import { LYRIC_TAGS } from '@/db/types';
import { exportSongPdf, exportSongText } from '@/lib/export';
import { countLines, insertTag, tagLabel } from '@/lib/lyrics';
import { useAutosave } from '@/lib/useAutosave';
import { colors, spacing } from '@/theme';

export default function SongEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const headerHeight = useHeaderHeight();
  const beat = useBeat();

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  // Mode studio : la barre d'enregistrement s'ajoute au lecteur, les paroles restent visibles.
  const [studio, setStudio] = useState(false);
  const [takeCount, setTakeCount] = useState(0);
  const [recording, setRecording] = useState(false);

  // Curseur : mémorisé à chaque déplacement pour insérer les tags au bon endroit.
  const lyricsRef = useRef<ComponentRef<typeof TextInput>>(null);
  const cursor = useRef<number | null>(null);

  // Quitter l'écran couperait la prise en cours (retour, geste, bouton Android).
  usePreventRemove(recording, () =>
    Alert.alert('Prise en cours', "Arrête l'enregistrement avant de quitter le morceau."),
  );

  const loadTakeCount = useCallback(() => {
    countTakes(db, id).then(setTakeCount).catch(console.error);
  }, [db, id]);
  useFocusEffect(loadTakeCount);

  useEffect(() => {
    getSong(db, id)
      .then((song) => {
        if (!song) {
          router.back();
          return;
        }
        setTitle(song.title);
        setLyrics(song.lyrics);
        setLoaded(true);
      })
      .catch(console.error);
  }, [db, id]);

  const { schedule, flush, state: saveState } = useAutosave(
    useCallback(
      async (key: string, value: string) => {
        if (key === 'title') await updateSong(db, id, { title: value });
        else await updateSong(db, id, { lyrics: value });
      },
      [db, id],
    ),
  );

  const onChangeTitle = (v: string) => {
    setTitle(v);
    schedule('title', v);
  };

  const onChangeLyrics = (v: string) => {
    setLyrics(v);
    schedule('lyrics', v);
  };

  const onInsertTag = (tag: string) => {
    const next = insertTag(lyrics, cursor.current ?? lyrics.length, tag);
    onChangeLyrics(next.text);
    cursor.current = next.cursor;
    lyricsRef.current?.focus();
    // Après le rendu du nouveau texte : curseur sur la ligne sous le tag.
    setTimeout(() => lyricsRef.current?.setSelection(next.cursor, next.cursor), 50);
  };

  const goTo = async (screen: 'infos' | 'prises') => {
    await flush();
    // Les prises ont leur propre lecteur : on coupe l'instru pour ne pas superposer.
    if (screen === 'prises') beat.player.pause();
    router.push(`/song/${id}/${screen}`);
  };

  const onExport = async (kind: 'pdf' | 'txt') => {
    setExportOpen(false);
    await flush();
    try {
      if (kind === 'pdf') await exportSongPdf(db, id);
      else await exportSongText(db, id);
    } catch (e) {
      Alert.alert('Export impossible', String(e));
    }
  };

  const lines = countLines(lyrics);
  const lineArray = lyrics.split('\n');

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <SaveBadge state={saveState} />
              <IconButton
                style={styles.headerIcon}
                icon={studio ? 'mic' : 'mic-outline'}
                onPress={() => setStudio((v) => !v)}
                disabled={recording}
                accessibilityLabel={studio ? 'Fermer le mode studio' : 'Mode studio (enregistrer)'}
              />
              <IconButton
                style={styles.headerIcon}
                icon="information-circle-outline"
                onPress={() => goTo('infos')}
                disabled={recording}
                accessibilityLabel="Infos"
              />
              <IconButton
                style={styles.headerIcon}
                icon="share-outline"
                onPress={() => setExportOpen(true)}
                accessibilityLabel="Exporter"
              />
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView style={ui.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
        {!loaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.page}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <TextInput
              value={title}
              onChangeText={onChangeTitle}
              onBlur={() => void flush()}
              placeholder="Titre du morceau"
              placeholderTextColor={colors.textDim}
              selectionColor={colors.accent}
              style={styles.title}
              returnKeyType="next"
              onSubmitEditing={() => lyricsRef.current?.focus()}
              submitBehavior="submit"
            />
            <Text style={styles.meta}>
              {lines ? `${lines} ligne${lines > 1 ? 's' : ''}` : 'Touche un tag en bas pour structurer ton texte'}
            </Text>

            {/* Le texte est rendu en enfants : les lignes « #tag » ressortent en couleur. */}
            <TextInput
              ref={lyricsRef}
              onChangeText={onChangeLyrics}
              onBlur={() => void flush()}
              onSelectionChange={(e) => {
                cursor.current = e.nativeEvent.selection.end;
              }}
              multiline
              scrollEnabled={false}
              placeholder={'Écris ici…\n\n#intro, #couplet, #refrain : chaque tag ouvre une partie.'}
              placeholderTextColor={colors.textDim}
              selectionColor={colors.accent}
              style={styles.lyrics}
              autoCapitalize="sentences"
            >
              {lyrics
                ? lineArray.map((line, i) => (
                    <Text key={i} style={tagLabel(line) ? styles.tagLine : undefined}>
                      {line}
                      {i < lineArray.length - 1 ? '\n' : ''}
                    </Text>
                  ))
                : null}
            </TextInput>
          </ScrollView>
        )}

        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.tagBar}
          contentContainerStyle={styles.tagBarContent}
        >
          {LYRIC_TAGS.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => onInsertTag(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Insérer #${tag}`}
              style={({ pressed }) => [styles.tagChip, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.tagHash}>#</Text>
              <Text style={styles.tagChipLabel}>{tag}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {studio && (
          <RecorderBar
            songId={id}
            takeCount={takeCount}
            onSaved={loadTakeCount}
            onOpenTakes={() => goTo('prises')}
            onRecordingChange={setRecording}
          />
        )}
        <BeatPlayer />
      </KeyboardAvoidingView>

      <PickerModal
        visible={exportOpen}
        title="Exporter les paroles"
        options={[
          { value: 'pdf' as const, label: 'PDF', hint: 'Mis en page, à imprimer ou envoyer' },
          { value: 'txt' as const, label: 'Texte brut (.txt)', hint: 'À coller partout' },
        ]}
        onCancel={() => setExportOpen(false)}
        onPick={onExport}
      />
    </>
  );
}

function SaveBadge({ state }: { state: 'saved' | 'pending' | 'error' }) {
  const map = {
    saved: { icon: 'cloud-done-outline', color: colors.textDim },
    pending: { icon: 'ellipsis-horizontal', color: colors.textDim },
    error: { icon: 'alert-circle', color: colors.danger },
  } as const;
  return <Ionicons name={map[state].icon} size={18} color={map[state].color} style={{ marginRight: 4 }} />;
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { minWidth: 44, width: 44 },
  page: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: spacing.xs, letterSpacing: -0.5 },
  meta: { color: colors.textDim, fontSize: 13, marginBottom: spacing.lg },
  lyrics: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 30,
    minHeight: 320,
    textAlignVertical: 'top',
    padding: 0,
  },
  tagLine: { color: colors.accent, fontWeight: '800', letterSpacing: 0.5 },
  tagBar: {
    flexGrow: 0,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tagBarContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  tagHash: { color: colors.accent, fontSize: 16, fontWeight: '800', marginRight: 2 },
  tagChipLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
