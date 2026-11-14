export type SongStatus = 'idea' | 'wip' | 'done';

export const STATUS_LABELS: Record<SongStatus, string> = {
  idea: 'Idée',
  wip: 'En cours',
  done: 'Terminé',
};

/** Tags de structure insérés dans les paroles (« #intro » sur sa propre ligne). */
export const LYRIC_TAGS = ['intro', 'couplet', 'refrain', 'pont', 'outro'] as const;

export type Song = {
  id: string;
  title: string;
  status: SongStatus;
  bpm: number | null;
  musical_key: string;
  credits: string;
  /** Tags séparés par des virgules, en minuscules : "trap,mélancolique" */
  tags: string;
  /** Chemin RELATIF au dossier documents de l'app (ex. "beats/abc.mp3") */
  beat_file: string | null;
  beat_name: string | null;
  /** Tout le texte du morceau ; les lignes « #intro », « #refrain »… le découpent. */
  lyrics: string;
  created_at: number;
  updated_at: number;
};

export type Take = {
  id: string;
  song_id: string;
  name: string;
  /** Chemin RELATIF au dossier documents (ex. "takes/xyz.m4a") */
  file: string;
  duration_ms: number;
  with_beat: number;
  created_at: number;
};

export type Idea = {
  id: string;
  content: string;
  tags: string;
  song_id: string | null;
  created_at: number;
  updated_at: number;
};
