import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Chaque entrée = une version du schéma. On n'édite JAMAIS une migration déjà
 * publiée : on en ajoute une nouvelle à la fin. La version courante est stockée
 * dans `PRAGMA user_version`.
 */
const MIGRATIONS: string[] = [
  // v1 : schéma initial
  `
  CREATE TABLE songs (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idea',
    bpm INTEGER,
    musical_key TEXT NOT NULL DEFAULT '',
    credits TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    beat_file TEXT,
    beat_name TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE sections (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sections_song ON sections(song_id, position);

  CREATE TABLE takes (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    with_beat INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_takes_song ON takes(song_id, created_at);

  CREATE TABLE ideas (
    id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDb(db: SQLiteDatabase) {
  // WAL : écritures plus sûres et plus rapides ; foreign_keys pour les cascades.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Base de données plus récente que l'app (v${version} > v${SCHEMA_VERSION}). Mets l'app à jour.`,
    );
  }

  while (version < SCHEMA_VERSION) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
