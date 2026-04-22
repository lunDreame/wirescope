import { useEffect, useRef, useCallback, useState } from 'react';

// Auto-scroll to bottom when new items arrive
export function useAutoScroll<T extends HTMLElement>(dep: unknown, enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [dep, enabled]);
  return ref;
}

// Debounced value
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Local storage state
export function useLocalStorage<T>(key: string, initial: T): [T, (val: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });

  const set = useCallback((val: T) => {
    setState(val);
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key]);

  return [state, set];
}

// Keyboard shortcut
export function useKeyboard(
  key: string,
  handler: (e: KeyboardEvent) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const parts = key.split('+');
      const wantMeta  = parts.includes('Meta');
      const wantCtrl  = parts.includes('Ctrl');
      const wantShift = parts.includes('Shift');
      const mainKey   = parts[parts.length - 1];
      if (
        (wantMeta  ? e.metaKey  : !e.metaKey)  &&
        (wantCtrl  ? e.ctrlKey  : true) &&
        (wantShift ? e.shiftKey : !e.shiftKey) &&
        e.key === mainKey
      ) handler(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
