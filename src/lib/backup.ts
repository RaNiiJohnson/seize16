import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_VERSION } from '@/db/migrations';
import { BEATS_DIR, TAKES_DIR, fileFromRelative, pickFile } from './files';

/**
 * Format .carnet (un seul fichier, lu/écrit par morceaux de 1 Mo pour ne
 * jamais charger les mp3 en mémoire) :
 *
 *   "CARNET01" | longueur du manifeste (uint32 LE) | manifeste JSON UTF-8 | octets des fichiers bout à bout
 *
 * Le manifeste contient toutes les lignes de la base et la liste des
 * fichiers (chemin relatif + taille), dans l'ordre où ils suivent.
 */

const MAGIC = 'CARNET01';
const CHUNK = 1024 * 1024;
const TABLES = ['songs', 'sections', 'takes', 'ideas'] as const;
const DATA_DIRS = [BEATS_DIR, TAKES_DIR];
const SAFE_PATH = /^(beats|takes)\/[A-Za-z0-9._-]+$/;

type Row = Record<string, string | number | null>;
type Manifest = {
  app: 'carnet-artiste';
  version: 1;
  schemaVersion: number;
  createdAt: number;
  tables: Record<(typeof TABLES)[number], Row[]>;
  files: { path: string; size: number }[];
};

export type BackupSummary = { songs: number; ideas: number; takes: number; files: number };

// ---------- Sauvegarde ----------

export async function createBackup(db: SQLiteDatabase): Promise<BackupSummary> {
  const tables = {} as Manifest['tables'];
  for (const t of TABLES) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);

  const paths = new Set<string>();
  for (const s of tables.songs) if (typeof s.beat_file === 'string') paths.add(s.beat_file);
  for (const t of tables.takes) if (typeof t.file === 'string') paths.add(t.file);
  const files: Manifest['files'] = [];
  for (const path of paths) {
    const f = fileFromRelative(path);
    if (SAFE_PATH.test(path) && f.exists) files.push({ path, size: f.size ?? 0 });
  }

  const manifest: Manifest = {
    app: 'carnet-artiste',
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    tables,
    files,
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(header.buffer).setUint32(8, json.length, true);

  const stamp = new Date().toISOString().slice(0, 10);
  const out = new File(Paths.cache, `carnet-${stamp}.carnet`);
  out.create({ overwrite: true });
  const w = out.open(FileMode.Truncate);
  try {
    await w.writeBytes(header);
    await w.writeBytes(json);
    for (const { path, size } of files) {
      const r = fileFromRelative(path).open(FileMode.ReadOnly);
      try {
        await pipe(r, w, size);
      } finally {
        r.close();
      }
    }
  } finally {
    w.close();
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage n'est pas disponible sur cet appareil.");
  await Sharing.shareAsync(out.uri, {
    mimeType: 'application/octet-stream',
    UTI: 'public.data',
    dialogTitle: 'Enregistrer la sauvegarde',
  });
  return { songs: tables.songs.length, ideas: tables.ideas.length, takes: tables.takes.length, files: files.length };
}

// ---------- Restauration ----------

/** Demande un fichier .carnet puis remplace TOUT le contenu de l'app. Renvoie null si annulé. */
export async function restoreBackup(db: SQLiteDatabase): Promise<BackupSummary | null> {
  const picked = await pickFile('*/*');
  if (!picked) return null;
  const source = picked.file;

  const r = source.open(FileMode.ReadOnly);
  const staged: Directory[] = [];
  try {
    // 1. Lecture et vérification du manifeste.
    const header = await readExactly(r, 12);
    if (latin1(header.subarray(0, 8)) !== MAGIC) throw new Error("Ce fichier n'est pas une sauvegarde Seize16.");
    const len = new DataView(header.buffer, header.byteOffset).getUint32(8, true);
    const manifest = JSON.parse(utf8Decode(await readExactly(r, len))) as Manifest;
    validate(manifest);

    // 2. Extraction des fichiers dans des dossiers temporaires (beats.restore, takes.restore).
    for (const name of DATA_DIRS) {
      const d = new Directory(Paths.document, `${name}.restore`);
      if (d.exists) d.delete();
      d.create({ intermediates: true });
      staged.push(d);
    }
    for (const { path, size } of manifest.files) {
      const [dir, name] = path.split('/');
      const target = new File(Paths.document, `${dir}.restore`, name);
      target.create({ overwrite: true });
      const w = target.open(FileMode.Truncate);
      try {
        await pipe(r, w, size);
      } finally {
        w.close();
      }
    }
    r.close();

    // 3. Échange des dossiers : l'ancien est mis de côté (.old) tant que la base n'est pas validée.
    const swapped: string[] = [];
    try {
      for (const name of DATA_DIRS) {
        const current = new Directory(Paths.document, name);
        const old = new Directory(Paths.document, `${name}.old`);
        if (old.exists) old.delete();
        if (current.exists) current.rename(`${name}.old`);
        new Directory(Paths.document, `${name}.restore`).rename(name);
        swapped.push(name);
      }

      // 4. Remplacement de la base en une seule transaction : tout ou rien.
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const t of [...TABLES].reverse()) await tx.runAsync(`DELETE FROM ${t}`);
        for (const t of TABLES) {
          const columns = await tableColumns(tx, t);
          for (const row of manifest.tables[t]) {
            const keys = Object.keys(row).filter((k) => columns.has(k));
            await tx.runAsync(
              `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
              keys.map((k) => row[k]),
            );
          }
        }
      });
    } catch (e) {
      // Retour en arrière : on remet les anciens dossiers.
      for (const name of swapped) {
        const current = new Directory(Paths.document, name);
        if (current.exists) current.delete();
        const old = new Directory(Paths.document, `${name}.old`);
        if (old.exists) old.rename(name);
      }
      throw e;
    }

    // 5. Tout est validé : on retire les anciens fichiers.
    for (const name of DATA_DIRS) {
      const old = new Directory(Paths.document, `${name}.old`);
      if (old.exists) old.delete();
    }
    return {
      songs: manifest.tables.songs.length,
      ideas: manifest.tables.ideas.length,
      takes: manifest.tables.takes.length,
      files: manifest.files.length,
    };
  } finally {
    try {
      r.close();
    } catch {}
    for (const d of staged) if (d.exists) d.delete();
    // Seulement la copie temporaire (iOS) : jamais le fichier choisi par l'utilisateur.
    if (picked.temporary && source.exists) source.delete();
  }
}

function validate(m: Manifest) {
  if (m?.app !== 'carnet-artiste' || m.version !== 1 || !m.tables || !Array.isArray(m.files)) {
    throw new Error('Sauvegarde illisible ou corrompue.');
  }
  if (m.schemaVersion > SCHEMA_VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de l'app. Mets l'app à jour avant de restaurer.");
  }
  for (const t of TABLES) if (!Array.isArray(m.tables[t])) throw new Error(`Table « ${t} » manquante.`);
  for (const f of m.files) {
    if (!SAFE_PATH.test(f.path) || !Number.isInteger(f.size) || f.size < 0) throw new Error('Fichier invalide dans la sauvegarde.');
  }
}

async function tableColumns(db: SQLiteDatabase, table: string) {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(cols.map((c) => c.name));
}

// ---------- Utilitaires binaires ----------

async function pipe(from: FileHandle, to: FileHandle, size: number) {
  let left = size;
  while (left > 0) {
    const chunk = await from.readBytes(Math.min(CHUNK, left));
    if (!chunk.length) throw new Error('Sauvegarde tronquée.');
    await to.writeBytes(chunk);
    left -= chunk.length;
  }
}

async function readExactly(from: FileHandle, size: number) {
  const out = new Uint8Array(size);
  let pos = 0;
  while (pos < size) {
    const chunk = await from.readBytes(Math.min(CHUNK, size - pos));
    if (!chunk.length) throw new Error('Sauvegarde tronquée.');
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function latin1(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

/** Décodeur UTF-8 maison : TextDecoder n'est pas garanti dans Hermes. */
function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let codes: number[] = [];
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    if (cp > 0xffff) {
      cp -= 0x10000;
      codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else codes.push(cp);
    if (codes.length > 8000) {
      parts.push(String.fromCharCode(...codes));
      codes = [];
    }
  }
  parts.push(String.fromCharCode(...codes));
  return parts.join('');
}
