/** Une ligne qui ne contient qu'un tag : « #intro », « #refrain 2 », « #Couplet-1 ». */
const TAG_LINE = /^\s*#([\p{L}\p{N}][\p{L}\p{N}_-]*(?: \d+)?)\s*$/u;

/** Renvoie le libellé du tag (« Refrain 2 ») si la ligne est un tag de structure, sinon null. */
export function tagLabel(line: string): string | null {
  const m = TAG_LINE.exec(line);
  if (!m) return null;
  const raw = m[1].replace(/[_-]/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export type LyricBlock = { label: string | null; text: string };

/** Découpe les paroles en blocs, chacun ouvert par un tag (ou sans tag au début). */
export function lyricBlocks(lyrics: string): LyricBlock[] {
  const blocks: LyricBlock[] = [];
  let current: { label: string | null; lines: string[] } = { label: null, lines: [] };
  const push = () => {
    const text = current.lines.join('\n').replace(/^\n+|\s+$/g, '');
    if (current.label || text) blocks.push({ label: current.label, text });
  };
  for (const line of lyrics.split('\n')) {
    const label = tagLabel(line);
    if (label) {
      push();
      current = { label, lines: [] };
    } else current.lines.push(line);
  }
  push();
  return blocks;
}

/** Nombre de lignes de texte (hors tags et lignes vides). */
export function countLines(lyrics: string): number {
  return lyrics.split('\n').filter((l) => l.trim() && !tagLabel(l)).length;
}

/** Première ligne de texte, pour un aperçu. */
export function firstLine(lyrics: string): string {
  return lyrics.split('\n').find((l) => l.trim() && !tagLabel(l))?.trim() ?? '';
}

/**
 * Insère « #tag » sur sa propre ligne à la position du curseur, en laissant une
 * ligne vide avant (sauf en tout début de texte). Renvoie le nouveau texte et
 * la position du curseur, placée sur la ligne suivant le tag.
 */
export function insertTag(text: string, cursor: number, tag: string): { text: string; cursor: number } {
  const pos = Math.max(0, Math.min(cursor, text.length));
  let before = text.slice(0, pos);
  let after = text.slice(pos);
  // Si le curseur est en plein milieu d'une ligne, on coupe à la fin de cette ligne.
  const lineEnd = after.indexOf('\n');
  if (before && !before.endsWith('\n') && lineEnd !== 0) {
    const cut = lineEnd === -1 ? after.length : lineEnd;
    before += after.slice(0, cut);
    after = after.slice(cut);
  }
  const trimmedBefore = before.replace(/[ \t]+$/, '');
  const prefix = !trimmedBefore ? '' : trimmedBefore.endsWith('\n\n') ? '' : trimmedBefore.endsWith('\n') ? '\n' : '\n\n';
  const head = `${trimmedBefore}${prefix}#${tag}\n`;
  const rest = after.replace(/^\n/, '');
  return { text: head + rest, cursor: head.length };
}
