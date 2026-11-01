import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * En base on stocke des chemins RELATIFS au dossier documents ("beats/x.mp3").
 * Sur iOS le chemin absolu du conteneur change à chaque mise à jour de l'app :
 * un chemin absolu enregistré deviendrait invalide.
 */
export const BEATS_DIR = 'beats';
export const TAKES_DIR = 'takes';

export function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

export function fileFromRelative(relative: string): File {
  return new File(Paths.document, relative);
}

export function uriFromRelative(relative: string): string {
  return fileFromRelative(relative).uri;
}

export function deleteRelative(relative: string | null | undefined) {
  if (!relative) return;
  try {
    const f = fileFromRelative(relative);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('Suppression impossible', relative, e);
  }
}

export function extensionOf(name: string, fallback: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? `.${m[1].toLowerCase()}` : fallback;
}

/**
 * Ouvre le sélecteur de fichiers. Sur Android on garde l'URI content:// d'origine :
 * dans Expo Go, expo-file-system refuse la lecture de la copie que le sélecteur
 * fait dans le cache (« Missing 'READ' permission »). Sur iOS la copie en cache
 * est nécessaire ; `temporary` dit si l'appelant doit la supprimer ensuite.
 */
export async function pickFile(type: string): Promise<{ file: File; name: string; temporary: boolean } | null> {
  const copy = Platform.OS !== 'android';
  const res = await DocumentPicker.getDocumentAsync({ type, multiple: false, copyToCacheDirectory: copy });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  return { file: new File(asset.uri), name: asset.name, temporary: copy };
}
