import { Directory, File, Paths } from 'expo-file-system';

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
