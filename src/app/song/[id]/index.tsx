import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
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
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';

import { BeatPlayer } from '@/components/BeatPlayer';
import { PickerModal } from '@/components/Modals';
import { Chip, IconButton, styles as ui } from '@/components/ui';
import {
  addSection,
  deleteSection,
  getSong,
  listSections,
  reorderSections,
  saveSectionContent,
  setSectionKind,
  updateSong,
} from '@/db/repo';
import { SECTION_KINDS, SECTION_LABELS, type Section, type SectionKind } from '@/db/types';
import { exportSongPdf, exportSongText } from '@/lib/export';
import { sectionTitles } from '@/lib/sections';
import { useAutosave } from '@/lib/useAutosave';
import { colors, radius, spacing } from '@/theme';

export default function SongEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const headerHeight = useHeaderHeight();

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
  const [kindPickerFor, setKindPickerFor] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [song, secs] = await Promise.all([getSong(db, id), listSections(db, id)]);
      if (!song) {
        router.back();
        return;
      }
      setTitle(song.title);
      setSections(secs);
      setLoaded(true);
    })().catch(console.error);
  }, [db, id]);

  const { schedule, flush, state: saveState } = useAutosave(
    useCallback(
      async (key: string, value: string) => {
        if (key === 'title') await updateSong(db, id, { title: value });
        else await saveSectionContent(db, id, key, value);
      },
      [db, id],
    ),
  );

  const onChangeTitle = (v: string) => {
    setTitle(v);
    schedule('title', v);
  };

  const onChangeSection = (sectionId: string, content: string) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content } : s)));
    schedule(sectionId, content);
  };

  const onAdd = async (kind: SectionKind) => {
    const section = await addSection(db, id, kind);
    setSections((prev) => [...prev, section]);
  };

  const onDelete = (section: Section, label: string) => {
    Alert.alert(`Supprimer « ${label} » ?`, section.content.trim() ? 'Le texte de cette section sera perdu.' : undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteSection(db, id, section.id);
          setSections((prev) => prev.filter((s) => s.id !== section.id));
        },
      },
    ]);
  };

  const onPickKind = async (kind: SectionKind) => {
    const sectionId = kindPickerFor;
    setKindPickerFor(null);
    if (!sectionId) return;
    await setSectionKind(db, id, sectionId, kind);
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, kind } : s)));
  };

  const onReorder = ({ from, to }: { from: number; to: number }) => {
    const next = reorderItems(sections, from, to);
    setSections(next);
    reorderSections(
      db,
      id,
      next.map((s) => s.id),
    ).catch(console.error);
  };

  const goTo = async (screen: 'infos' | 'prises') => {
    await flush();
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

  const titles = sectionTitles(sections);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <SaveBadge state={saveState} />
              <IconButton
                style={styles.headerIcon}
                icon={reorderMode ? 'checkmark' : 'reorder-four'}
                onPress={() => {
                  void flush();
                  setReorderMode((m) => !m);
                }}
                accessibilityLabel={reorderMode ? 'Terminer la réorganisation' : 'Réorganiser les sections'}
              />
              <IconButton style={styles.headerIcon} icon="mic" onPress={() => goTo('prises')} accessibilityLabel="Prises vocales" />
              <IconButton style={styles.headerIcon} icon="information-circle" onPress={() => goTo('infos')} accessibilityLabel="Infos" />
              <IconButton style={styles.headerIcon} icon="share-outline" onPress={() => setExportOpen(true)} accessibilityLabel="Exporter" />
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView style={ui.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
        {!loaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
        ) : reorderMode ? (
          <ReorderableList
            data={sections}
            keyExtractor={(s) => s.id}
            onReorder={onReorder}
            contentContainerStyle={{ padding: spacing.lg }}
            ListHeaderComponent={<Text style={[ui.dim, { marginBottom: spacing.sm }]}>Maintiens ≡ et glisse pour réordonner.</Text>}
            renderItem={({ item, index }) => <ReorderRow section={item} title={titles[index]} />}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}
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
            />

            {sections.map((s, i) => (
              <View key={s.id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Pressable
                    onPress={() => setKindPickerFor(s.id)}
                    style={styles.kindButton}
                    accessibilityLabel={`Changer le type de ${titles[i]}`}
                  >
                    <Text style={styles.kindLabel}>{titles[i]}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.accent} />
                  </Pressable>
                  <IconButton
                    icon="trash-outline"
                    onPress={() => onDelete(s, titles[i])}
                    accessibilityLabel={`Supprimer ${titles[i]}`}
                  />
                </View>
                <TextInput
                  value={s.content}
                  onChangeText={(v) => onChangeSection(s.id, v)}
                  onBlur={() => void flush()}
                  multiline
                  scrollEnabled={false}
                  placeholder="Écris ici…"
                  placeholderTextColor={colors.textDim}
                  selectionColor={colors.accent}
                  style={styles.lyrics}
                  autoCapitalize="sentences"
                />
              </View>
            ))}

            <View>
              <Text style={[ui.dim, { marginBottom: spacing.sm }]}>Ajouter une section</Text>
              <View style={styles.addRow}>
                {SECTION_KINDS.map((k) => (
                  <Chip key={k} label={`+ ${SECTION_LABELS[k]}`} onPress={() => onAdd(k)} />
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        <BeatPlayer />
      </KeyboardAvoidingView>

      <PickerModal
        visible={!!kindPickerFor}
        title="Type de section"
        options={SECTION_KINDS.map((k) => ({ value: k, label: SECTION_LABELS[k] }))}
        onCancel={() => setKindPickerFor(null)}
        onPick={onPickKind}
      />
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

function ReorderRow({ section, title }: { section: Section; title: string }) {
  const drag = useReorderableDrag();
  const preview = section.content.trim().split('\n')[0] || '(vide)';
  return (
    <View style={styles.reorderRow}>
      <Pressable onPressIn={drag} hitSlop={10} style={styles.handle} accessibilityLabel={`Déplacer ${title}`}>
        <Ionicons name="reorder-three" size={30} color={colors.textDim} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.kindLabel}>{title}</Text>
        <Text style={ui.dim} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </View>
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
  title: { color: colors.text, fontSize: 26, fontWeight: '800', paddingVertical: spacing.sm },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kindButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingRight: spacing.md },
  kindLabel: { color: colors.accent, fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  lyrics: { color: colors.text, fontSize: 19, lineHeight: 28, minHeight: 84, textAlignVertical: 'top' },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 64,
    marginBottom: spacing.sm,
  },
  handle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
