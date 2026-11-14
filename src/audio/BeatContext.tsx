import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getSong, updateSong } from '@/db/repo';
import { BEATS_DIR, deleteRelative, ensureDir, extensionOf, pickFile, uriFromRelative } from '@/lib/files';
import { newId } from '@/lib/utils';

type BeatContextValue = {
  songId: string;
  player: AudioPlayer;
  status: AudioStatus;
  beatName: string | null;
  hasBeat: boolean;
  /** Ouvre le sélecteur de fichiers du système. Renvoie false si rien n'a été choisi. */
  importBeat: () => Promise<boolean>;
  /** Copie ce fichier dans l'app et en fait l'instru du morceau. */
  setBeatFromFile: (source: File, name: string) => Promise<void>;
  removeBeat: () => Promise<void>;
  seekBy: (deltaSeconds: number) => void;
  toggle: () => void;
};

const BeatContext = createContext<BeatContextValue | null>(null);

/**
 * Un seul lecteur d'instru par morceau, créé dans le layout du morceau :
 * l'éditeur et l'écran des prises pilotent le même lecteur (pas deux sons
 * qui se chevauchent quand on navigue).
 */
export function BeatProvider({ songId, children }: { songId: string; children: ReactNode }) {
  const db = useSQLiteContext();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [beatFile, setBeatFile] = useState<string | null>(null);
  const [beatName, setBeatName] = useState<string | null>(null);

  useEffect(() => {
    getSong(db, songId).then((s) => {
      setBeatFile(s?.beat_file ?? null);
      setBeatName(s?.beat_name ?? null);
    });
  }, [db, songId]);

  useEffect(() => {
    if (beatFile) {
      player.replace({ uri: uriFromRelative(beatFile) });
    } else {
      player.pause();
      player.replace(null);
    }
  }, [beatFile, player]);

  const setBeatFromFile = useCallback(
    async (source: File, name: string) => {
      // Copie dans le dossier de l'app : l'instru reste dispo même si l'original est supprimé.
      const dir = ensureDir(BEATS_DIR);
      const fileName = `${songId}-${newId()}${extensionOf(name, '.mp3')}`;
      await source.copy(new File(dir, fileName));
      const relative = `${BEATS_DIR}/${fileName}`;

      const previous = beatFile;
      await updateSong(db, songId, { beat_file: relative, beat_name: name });
      deleteRelative(previous);
      setBeatFile(relative);
      setBeatName(name);
    },
    [beatFile, db, songId],
  );

  const importBeat = useCallback(async () => {
    const picked = await pickFile('audio/*');
    if (!picked) return false;
    try {
      await setBeatFromFile(picked.file, picked.name);
      return true;
    } finally {
      if (picked.temporary && picked.file.exists) picked.file.delete();
    }
  }, [setBeatFromFile]);

  const removeBeat = useCallback(async () => {
    const previous = beatFile;
    await updateSong(db, songId, { beat_file: null, beat_name: null });
    setBeatFile(null);
    setBeatName(null);
    deleteRelative(previous);
  }, [beatFile, db, songId]);

  const seekBy = useCallback(
    (delta: number) => {
      const duration = player.duration || 0;
      const target = Math.max(0, Math.min(duration || Infinity, player.currentTime + delta));
      void player.seekTo(target);
    },
    [player],
  );

  const toggle = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      // Arrivé au bout : on repart du début.
      if (player.duration > 0 && player.currentTime >= player.duration - 0.25) void player.seekTo(0);
      player.play();
    }
  }, [player]);

  return (
    <BeatContext.Provider
      value={{
        songId,
        player,
        status,
        beatName,
        hasBeat: !!beatFile,
        importBeat,
        setBeatFromFile,
        removeBeat,
        seekBy,
        toggle,
      }}
    >
      {children}
    </BeatContext.Provider>
  );
}

export function useBeat() {
  const ctx = useContext(BeatContext);
  if (!ctx) throw new Error('useBeat doit être utilisé dans <BeatProvider>');
  return ctx;
}
