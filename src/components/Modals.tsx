import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme';
import { Button, Input } from './ui';

/** Remplace Alert.prompt, qui n'existe que sur iOS. */
export function PromptModal({
  visible,
  title,
  initialValue = '',
  placeholder,
  confirmLabel = 'OK',
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Monté à chaque ouverture : le champ repart de initialValue. */}
      {visible && (
        <PromptSheet
          title={title}
          initialValue={initialValue}
          placeholder={placeholder}
          confirmLabel={confirmLabel}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  );
}

function PromptSheet({
  title,
  initialValue,
  placeholder,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Input
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            autoFocus
            onSubmitEditing={() => onConfirm(value)}
            returnKeyType="done"
          />
          <View style={styles.row}>
            <Button label="Annuler" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
            <Button label={confirmLabel} variant="primary" onPress={() => onConfirm(value)} style={{ flex: 1 }} />
          </View>
        </View>
    </KeyboardAvoidingView>
  );
}

export type PickerOption<T> = { value: T; label: string; hint?: string; destructive?: boolean };

/** Liste de choix plein écran-bas (feuille d'actions simple, multiplateforme). */
export function PickerModal<T>({
  visible,
  title,
  options,
  onCancel,
  onPick,
}: {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  onCancel: () => void;
  onPick: (value: T) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdropBottom} onPress={onCancel}>
        <Pressable style={[styles.sheet, styles.sheetBottom]} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(_, i) => String(i)}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(item.value)}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[styles.optionLabel, item.destructive && { color: colors.danger }]}>{item.label}</Text>
                {item.hint ? <Text style={styles.optionHint}>{item.hint}</Text> : null}
              </Pressable>
            )}
          />
          <Button label="Annuler" variant="ghost" onPress={onCancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdropBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    minHeight: touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  optionLabel: { color: colors.text, fontSize: 17 },
  optionHint: { color: colors.textDim, fontSize: 13 },
});
