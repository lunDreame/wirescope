import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
  current_version: string;
}

interface UpdateContextValue {
  /** Non-null when a newer version exists on GitHub Releases */
  pendingUpdate: UpdateInfo | null;
  /** Call after the user installs to clear the badge */
  clearUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextValue>({
  pendingUpdate: null,
  clearUpdate: () => {},
});

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Delay 3 s so the initial render finishes before the network call
    const timer = setTimeout(async () => {
      try {
        const info = await invoke<UpdateInfo | null>('check_update');
        if (info) setPendingUpdate(info);
      } catch {
        // silently ignore — network unavailable, dev build, etc.
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <UpdateContext.Provider value={{ pendingUpdate, clearUpdate: () => setPendingUpdate(null) }}>
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  return useContext(UpdateContext);
}
