import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSong } from '@/db/repo';
import { STATUS_LABELS, type Song } from '@/db/types';
import { lyricBlocks } from './lyrics';
import { safeFileName, splitTags } from './utils';

async function load(db: SQLiteDatabase, songId: string) {
  const song = await getSong(db, songId);
  if (!song) throw new Error('Morceau introuvable');
  return song;
}

function metaLine(song: Song): string {
  return [
    STATUS_LABELS[song.status],
    song.bpm ? `${song.bpm} BPM` : null,
    song.musical_key || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function songToText(song: Song): string {
  const lines: string[] = [song.title || 'Sans titre', metaLine(song)];
  if (song.credits.trim()) lines.push(`Crédits : ${song.credits.trim()}`);
  const tags = splitTags(song.tags);
  if (tags.length) lines.push(tags.map((t) => `#${t}`).join(' '));
  lines.push('');
  for (const b of lyricBlocks(song.lyrics)) {
    if (b.label) lines.push(`[${b.label}]`);
    lines.push(b.text, '');
  }
  return lines.join('\n');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function songToHtml(song: Song): string {
  const body = lyricBlocks(song.lyrics)
    .map((b) => `<section>${b.label ? `<h2>${esc(b.label)}</h2>` : ''}<p>${esc(b.text)}</p></section>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, Roboto, Helvetica, sans-serif; color: #111; margin: 40px; }
    h1 { font-size: 26px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 4px; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #c2185b; margin: 22px 0 6px; }
    p { white-space: pre-wrap; font-size: 15px; line-height: 1.55; margin: 0; }
    section { break-inside: avoid; margin-bottom: 14px; }
  </style></head><body>
  <h1>${esc(song.title || 'Sans titre')}</h1>
  <div class="meta">${esc(metaLine(song))}</div>
  ${song.credits.trim() ? `<div class="meta">Crédits : ${esc(song.credits.trim())}</div>` : ''}
  ${body}
  </body></html>`;
}

async function share(file: File, mimeType: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage n'est pas disponible sur cet appareil.");
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: file.name });
}

export async function exportSongText(db: SQLiteDatabase, songId: string) {
  const song = await load(db, songId);
  const file = new File(Paths.cache, `${safeFileName(song.title)}.txt`);
  file.create({ overwrite: true });
  await file.write(songToText(song));
  await share(file, 'text/plain', 'public.plain-text');
}

export async function exportSongPdf(db: SQLiteDatabase, songId: string) {
  const song = await load(db, songId);
  // Format A4 en points (72 ppp).
  const { uri } = await Print.printToFileAsync({ html: songToHtml(song), width: 595, height: 842 });
  // Renomme le PDF (le nom généré est aléatoire).
  const target = new File(Paths.cache, `${safeFileName(song.title)}.pdf`);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await share(target, 'application/pdf', 'com.adobe.pdf');
}
