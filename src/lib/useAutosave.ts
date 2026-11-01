import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type SaveState = 'saved' | 'pending' | 'error';

/**
 * Sauvegarde automatique « jamais de texte perdu » :
 * - chaque frappe programme une écriture après `delay` ms (debounce par clé) ;
 * - tout ce qui est en attente est écrit immédiatement quand l'app passe en
 *   arrière-plan, quand on quitte l'écran, ou sur `flush()` (ex. perte de focus).
 * L'état local de l'écran reste la source de vérité pendant la frappe.
 */
export function useAutosave(save: (key: string, value: string) => Promise<void>, delay = 600) {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const pending = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [state, setState] = useState<SaveState>('saved');

  const writeKey = useCallback(async (key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    if (!pending.current.has(key)) return;
    const value = pending.current.get(key)!;
    pending.current.delete(key);
    try {
      await saveRef.current(key, value);
      if (pending.current.size === 0) setState('saved');
    } catch (e) {
      console.error('Échec de sauvegarde', key, e);
      // On remet la valeur en attente si rien de plus récent n'est arrivé.
      if (!pending.current.has(key)) pending.current.set(key, value);
      setState('error');
    }
  }, []);

  const flush = useCallback(async () => {
    await Promise.all([...pending.current.keys()].map(writeKey));
  }, [writeKey]);

  const schedule = useCallback(
    (key: string, value: string) => {
      pending.current.set(key, value);
      setState('pending');
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.set(
        key,
        setTimeout(() => void writeKey(key), delay),
      );
    },
    [delay, writeKey],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flush();
    });
    return () => {
      sub.remove();
      void flush(); // écran quitté : on écrit ce qui reste
    };
  }, [flush]);

  return { schedule, flush, state };
}
