import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteRelative } from '@/lib/files';
import { newId } from '@/lib/utils';
import type { Idea, Section, SectionKind, Song, SongStatus, Take } from './types';

// Toutes les requêtes SQL de l'app sont ici : les écrans n'écrivent jamais de SQL.

// ---------- Morceaux ----------

export type SongSort = 'updated' | 'created' | 'title' | 'status';

export type SongListItem = Song & { section_count: number; take_count: number };

const SORT_SQL: Record<SongSort, string> = {
  updated: 's.updated_at DESC',
  created: 's.created_at DESC',
  title: 's.title COLLATE NOCASE ASC',
  status: "CASE s.status WHEN 'wip' THEN 0 WHEN 'idea' THEN 1 ELSE 2 END, s.updated_at DESC",
};

export async function listSongs(
  db: SQLiteDatabase,
  opts: { search?: string; status?: SongStatus | null; sort?: SongSort } = {},
): Promise<SongListItem[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const q = opts.search?.trim().toLowerCase();
  if (q) {
    // Cherche dans le titre, les tags, les crédits et les paroles.
    where.push(`(lower(s.title) LIKE ? OR s.tags LIKE ? OR lower(s.credits) LIKE ?
      OR EXISTS (SELECT 1 FROM sections x WHERE x.song_id = s.id AND lower(x.content) LIKE ?))`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (opts.status) {
    where.push('s.status = ?');
    params.push(opts.status);
  }
  return db.getAllAsync<SongListItem>(
    `SELECT s.*,
       (SELECT COUNT(*) FROM sections x WHERE x.song_id = s.id) AS section_count,
       (SELECT COUNT(*) FROM takes t WHERE t.song_id = s.id) AS take_count
     FROM songs s
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${SORT_SQL[opts.sort ?? 'updated']}`,
    params,
  );
}

export function getSong(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Song>('SELECT * FROM songs WHERE id = ?', id);
}

export async function createSong(db: SQLiteDatabase, title = ''): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT INTO songs (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      id,
      title,
      now,
      now,
    );
    // Un morceau neuf démarre avec un couplet vide : on peut écrire tout de suite.
    await tx.runAsync(
      'INSERT INTO sections (id, song_id, kind, content, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      newId(),
      id,
      'verse',
      '',
      0,
      now,
    );
  });
  return id;
}

type SongPatch = Partial<
  Pick<Song, 'title' | 'status' | 'bpm' | 'musical_key' | 'credits' | 'tags' | 'beat_file' | 'beat_name'>
>;

export async function updateSong(db: SQLiteDatabase, id: string, patch: SongPatch) {
  const keys = Object.keys(patch) as (keyof SongPatch)[];
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => patch[k] ?? null);
  await db.runAsync(
    `UPDATE songs SET ${sets}, updated_at = ? WHERE id = ?`,
    ...values,
    Date.now(),
    id,
  );
}

export function touchSong(db: SQLiteDatabase, id: string) {
  return db.runAsync('UPDATE songs SET updated_at = ? WHERE id = ?', Date.now(), id);
}

export async function deleteSong(db: SQLiteDatabase, id: string) {
  const song = await getSong(db, id);
  const takes = await listTakes(db, id);
  await db.runAsync('DELETE FROM songs WHERE id = ?', id); // cascade sections + prises
  deleteRelative(song?.beat_file);
  for (const t of takes) deleteRelative(t.file);
}

// ---------- Sections ----------

export function listSections(db: SQLiteDatabase, songId: string) {
  return db.getAllAsync<Section>(
    'SELECT * FROM sections WHERE song_id = ? ORDER BY position ASC',
    songId,
  );
}

export async function addSection(
  db: SQLiteDatabase,
  songId: string,
  kind: SectionKind,
  content = '',
): Promise<Section> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM sections WHERE song_id = ?',
    songId,
  );
  const section: Section = {
    id: newId(),
    song_id: songId,
    kind,
    content,
    position: row?.next ?? 0,
    updated_at: Date.now(),
  };
  await db.runAsync(
    'INSERT INTO sections (id, song_id, kind, content, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    section.id,
    section.song_id,
    section.kind,
    section.content,
    section.position,
    section.updated_at,
  );
  await touchSong(db, songId);
  return section;
}

export async function saveSectionContent(db: SQLiteDatabase, songId: string, id: string, content: string) {
  const now = Date.now();
  await db.runAsync('UPDATE sections SET content = ?, updated_at = ? WHERE id = ?', content, now, id);
  await db.runAsync('UPDATE songs SET updated_at = ? WHERE id = ?', now, songId);
}

export async function setSectionKind(db: SQLiteDatabase, songId: string, id: string, kind: SectionKind) {
  await db.runAsync('UPDATE sections SET kind = ?, updated_at = ? WHERE id = ?', kind, Date.now(), id);
  await touchSong(db, songId);
}

export async function deleteSection(db: SQLiteDatabase, songId: string, id: string) {
  await db.runAsync('DELETE FROM sections WHERE id = ?', id);
  await touchSong(db, songId);
}

/** Réécrit les positions dans l'ordre donné, en une transaction. */
export async function reorderSections(db: SQLiteDatabase, songId: string, orderedIds: string[]) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.runAsync('UPDATE sections SET position = ? WHERE id = ? AND song_id = ?', i, orderedIds[i], songId);
    }
    await tx.runAsync('UPDATE songs SET updated_at = ? WHERE id = ?', Date.now(), songId);
  });
}

// ---------- Prises ----------

export function listTakes(db: SQLiteDatabase, songId: string) {
  return db.getAllAsync<Take>('SELECT * FROM takes WHERE song_id = ? ORDER BY created_at DESC', songId);
}

export async function addTake(db: SQLiteDatabase, take: Omit<Take, 'id' | 'created_at'>) {
  const id = newId();
  await db.runAsync(
    'INSERT INTO takes (id, song_id, name, file, duration_ms, with_beat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    take.song_id,
    take.name,
    take.file,
    take.duration_ms,
    take.with_beat,
    Date.now(),
  );
  return id;
}

export function renameTake(db: SQLiteDatabase, id: string, name: string) {
  return db.runAsync('UPDATE takes SET name = ? WHERE id = ?', name, id);
}

export async function deleteTake(db: SQLiteDatabase, take: Take) {
  await db.runAsync('DELETE FROM takes WHERE id = ?', take.id);
  deleteRelative(take.file);
}

// ---------- Idées ----------

export type IdeaListItem = Idea & { song_title: string | null };

export function listIdeas(db: SQLiteDatabase, search?: string) {
  const q = search?.trim().toLowerCase();
  return db.getAllAsync<IdeaListItem>(
    `SELECT i.*, s.title AS song_title FROM ideas i
     LEFT JOIN songs s ON s.id = i.song_id
     ${q ? 'WHERE lower(i.content) LIKE ? OR i.tags LIKE ?' : ''}
     ORDER BY i.updated_at DESC`,
    q ? [`%${q}%`, `%${q}%`] : [],
  );
}

export function getIdea(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Idea>('SELECT * FROM ideas WHERE id = ?', id);
}

export async function createIdea(db: SQLiteDatabase, content: string, tags = ''): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO ideas (id, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id,
    content,
    tags,
    now,
    now,
  );
  return id;
}

export function updateIdea(db: SQLiteDatabase, id: string, patch: Partial<Pick<Idea, 'content' | 'tags'>>) {
  const keys = Object.keys(patch) as ('content' | 'tags')[];
  if (!keys.length) return Promise.resolve();
  return db.runAsync(
    `UPDATE ideas SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => patch[k] ?? ''),
    Date.now(),
    id,
  );
}

export function deleteIdea(db: SQLiteDatabase, id: string) {
  return db.runAsync('DELETE FROM ideas WHERE id = ?', id);
}

/** Ajoute l'idée comme section « Libre » à la fin du morceau et mémorise le lien. */
export async function sendIdeaToSong(db: SQLiteDatabase, idea: Idea, songId: string) {
  await addSection(db, songId, 'free', idea.content);
  await db.runAsync('UPDATE ideas SET song_id = ?, updated_at = ? WHERE id = ?', songId, Date.now(), idea.id);
}
