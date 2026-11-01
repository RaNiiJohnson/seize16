export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** "Trap, mélancolique ,, trap" -> "trap,mélancolique" */
export function normalizeTags(input: string): string {
  const seen = new Set<string>();
  for (const raw of input.split(',')) {
    const t = raw.trim().toLowerCase();
    if (t) seen.add(t);
  }
  return [...seen].join(',');
}

export function splitTags(tags: string): string[] {
  return tags ? tags.split(',').filter(Boolean) : [];
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nom de fichier sûr pour l'export (garde les accents, retire / : * ? etc.) */
export function safeFileName(name: string, fallback = 'sans-titre'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
}
