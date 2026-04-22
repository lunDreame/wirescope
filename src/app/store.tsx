import React, {
  createContext, useContext, useReducer,
  useEffect, useRef, ReactNode
} from 'react';
import type {
  Packet, SessionInfo, SplitterConfig, Screen,
  FilterState, AppSettings, TxPreset, SavedFilter,
} from '../shared/types';
import * as api from '../shared/api/tauri';

// ── State shape ──────────────────────────────────────────────

interface AppState {
  packets:          Packet[];
  sessions:         SessionInfo[];
  activeSessionId:  string | null;
  splitter:         SplitterConfig;
  screen:           Screen;
  selectedPacketId: number | null;
  filter:           FilterState;
  settings:         AppSettings;
  txPresets:        TxPreset[];
  savedFilters:     SavedFilter[];
  dockOpen:         boolean;
  inspectorTab:     'detail' | 'analysis' | 'graph' | 'notes';
  bufferBytes:      number;
  isReceiving:      boolean;
  packetNotes:      Record<number, string>;
  consoleLog:       { ts: number; text: string; kind: 'info' | 'tx' | 'rx' | 'err' }[];
}

// ── Actions ───────────────────────────────────────────────────

type Action =
  | { type: 'ADD_PACKET'; packet: Packet }
  | { type: 'SET_PACKETS'; packets: Packet[] }
  | { type: 'CLEAR_PACKETS' }
  | { type: 'SET_SESSIONS'; sessions: SessionInfo[] }
  | { type: 'SET_ACTIVE_SESSION'; id: string | null }
  | { type: 'SET_SPLITTER'; config: SplitterConfig }
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'SELECT_PACKET'; id: number | null }
  | { type: 'SET_FILTER'; filter: Partial<FilterState> }
  | { type: 'SET_SETTINGS'; settings: Partial<AppSettings> }
  | { type: 'SET_DOCK_OPEN'; open: boolean }
  | { type: 'SET_INSPECTOR_TAB'; tab: AppState['inspectorTab'] }
  | { type: 'ADD_TX_PRESET'; preset: TxPreset }
  | { type: 'UPDATE_TX_PRESET'; preset: TxPreset }
  | { type: 'REMOVE_TX_PRESET'; id: string }
  | { type: 'ADD_SAVED_FILTER'; filter: SavedFilter }
  | { type: 'REMOVE_SAVED_FILTER'; id: string }
  | { type: 'UPDATE_BUFFER'; bytes: number }
  | { type: 'REMOVE_SESSION'; id: string }
  | { type: 'SET_RECEIVING'; on: boolean }
  | { type: 'SET_PACKET_NOTE'; packetId: number; note: string }
  | { type: 'LOG_CONSOLE'; entry: AppState['consoleLog'][number] }
  | { type: 'CLEAR_CONSOLE' };

// ── Defaults ─────────────────────────────────────────────────

const defaultSplitter: SplitterConfig = {
  method:               'delimiter',
  sof:                  [],
  eof:                  [],
  eof_include:          true,
  gap_ms:               3.5,
  length_field_offset:  2,
  length_field_size:    2,
  length_includes_header: false,
  min_packet_size:      6,
  max_packet_size:      256,
  checksum_algorithm:   '',
  checksum_offset:      -2,
  checksum_size:        2,
  mark_errors:          true,
  resync_on_error:      true,
  discard_on_disconnect: false,
  inner_gap_warn_ms:    500,
};

const defaultFilter: FilterState = {
  tokens:     [],
  showTx:     true,
  showRx:     true,
  errorsOnly: false,
  minGapMs:   null,
};

function loadSettings(): AppSettings {
  try {
    const s = localStorage.getItem('ws_settings');
    return s ? { ...defaultSettings, ...JSON.parse(s) } : defaultSettings;
  } catch { return defaultSettings; }
}

function loadSplitter(): SplitterConfig {
  try {
    const s = localStorage.getItem('ws_splitter');
    return s ? { ...defaultSplitter, ...JSON.parse(s) } : defaultSplitter;
  } catch { return defaultSplitter; }
}

function loadTxPresets(): TxPreset[] {
  try {
    const s = localStorage.getItem('ws_tx_presets');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function loadSavedFilters(): SavedFilter[] {
  try {
    const s = localStorage.getItem('ws_saved_filters');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

const defaultSettings: AppSettings = {
  theme:       'light',
  byteFormat:  'hex',
  density:     'mid',
  showGapRows: true,
  accentHue:   245,
  autoScroll:  true,
};

const initialState: AppState = {
  packets:          [],
  sessions:         [],
  activeSessionId:  null,
  splitter:         loadSplitter(),
  screen:           'workspace',
  selectedPacketId: null,
  filter:           defaultFilter,
  settings:         loadSettings(),
  txPresets:        loadTxPresets(),
  savedFilters:     loadSavedFilters(),
  dockOpen:      false,
  inspectorTab:  'detail',
  bufferBytes:   0,
  isReceiving:   false,
  packetNotes:   {},
  consoleLog:    [
    { ts: Date.now(), text: '앱이 시작되었습니다', kind: 'info' },
  ],
};

// ── Reducer ───────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_PACKET': {
      if (!state.isReceiving) return state;
      const MAX = 100_000;
      const packets = state.packets.length >= MAX
        ? [...state.packets.slice(-MAX + 1), action.packet]
        : [...state.packets, action.packet];
      const logEntry: AppState['consoleLog'][number] = {
        ts: action.packet.timestamp_ms,
        text: `${action.packet.direction} ${action.packet.bytes.length}B · ${action.packet.bytes.slice(0, 6).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}${action.packet.bytes.length > 6 ? '…' : ''}`,
        kind: action.packet.direction === 'TX' ? 'tx' : 'rx',
      };
      return {
        ...state,
        packets,
        bufferBytes: state.bufferBytes + action.packet.bytes.length,
        consoleLog: [...state.consoleLog.slice(-500), logEntry],
      };
    }
    case 'SET_PACKETS':
      return { ...state, packets: action.packets, bufferBytes: action.packets.reduce((s, p) => s + p.bytes.length, 0) };
    case 'CLEAR_PACKETS':
      return { ...state, packets: [], selectedPacketId: null, bufferBytes: 0 };
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.id };
    case 'SET_SPLITTER': {
      try { localStorage.setItem('ws_splitter', JSON.stringify(action.config)); } catch {}
      return { ...state, splitter: action.config };
    }
    case 'SET_SCREEN':
      return { ...state, screen: action.screen };
    case 'SELECT_PACKET':
      return { ...state, selectedPacketId: action.id };
    case 'SET_FILTER':
      return { ...state, filter: { ...state.filter, ...action.filter } };
    case 'SET_SETTINGS': {
      const settings = { ...state.settings, ...action.settings };
      try { localStorage.setItem('ws_settings', JSON.stringify(settings)); } catch {}
      return { ...state, settings };
    }
    case 'SET_DOCK_OPEN':
      return { ...state, dockOpen: action.open };
    case 'SET_INSPECTOR_TAB':
      return { ...state, inspectorTab: action.tab };
    case 'ADD_TX_PRESET': {
      const txPresets = [...state.txPresets, action.preset];
      try { localStorage.setItem('ws_tx_presets', JSON.stringify(txPresets)); } catch {}
      return { ...state, txPresets };
    }
    case 'UPDATE_TX_PRESET': {
      const txPresets = state.txPresets.map(p => p.id === action.preset.id ? action.preset : p);
      try { localStorage.setItem('ws_tx_presets', JSON.stringify(txPresets)); } catch {}
      return { ...state, txPresets };
    }
    case 'REMOVE_TX_PRESET': {
      const txPresets = state.txPresets.filter(p => p.id !== action.id);
      try { localStorage.setItem('ws_tx_presets', JSON.stringify(txPresets)); } catch {}
      return { ...state, txPresets };
    }
    case 'ADD_SAVED_FILTER': {
      const savedFilters = [...state.savedFilters, action.filter];
      try { localStorage.setItem('ws_saved_filters', JSON.stringify(savedFilters)); } catch {}
      return { ...state, savedFilters };
    }
    case 'REMOVE_SAVED_FILTER': {
      const savedFilters = state.savedFilters.filter(f => f.id !== action.id);
      try { localStorage.setItem('ws_saved_filters', JSON.stringify(savedFilters)); } catch {}
      return { ...state, savedFilters };
    }
    case 'UPDATE_BUFFER':
      return { ...state, bufferBytes: action.bytes };
    case 'REMOVE_SESSION': {
      const sessions = state.sessions.filter(s => s.id !== action.id);
      const anyConnected = sessions.some(s => s.connected);
      return {
        ...state,
        sessions,
        activeSessionId: state.activeSessionId === action.id
          ? (sessions[0]?.id ?? null)
          : state.activeSessionId,
        isReceiving: anyConnected ? state.isReceiving : false,
      };
    }
    case 'SET_RECEIVING':
      return { ...state, isReceiving: action.on };
    case 'SET_PACKET_NOTE':
      return { ...state, packetNotes: { ...state.packetNotes, [action.packetId]: action.note } };
    case 'LOG_CONSOLE':
      return { ...state, consoleLog: [...state.consoleLog.slice(-500), action.entry] };
    case 'CLEAR_CONSOLE':
      return { ...state, consoleLog: [] };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────

interface CtxValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const Ctx = createContext<CtxValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Push localStorage splitter to Rust on startup so both are in sync
  useEffect(() => {
    api.setSplitter(initialState.splitter).catch(() => {});
  }, []);

  // Apply theme to body
  useEffect(() => {
    document.body.classList.toggle('theme-dark', state.settings.theme === 'dark');
  }, [state.settings.theme]);

  // Apply density to body
  useEffect(() => {
    document.body.setAttribute('data-density', state.settings.density);
  }, [state.settings.density]);

  // Apply accent hue
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--brand', `oklch(0.52 0.15 ${state.settings.accentHue})`
    );
    document.documentElement.style.setProperty(
      '--brand-2', `oklch(0.62 0.15 ${state.settings.accentHue})`
    );
  }, [state.settings.accentHue]);

  // Listen for incoming packets + evaluate trigger presets
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    api.onPacket(pkt => {
      dispatch({ type: 'ADD_PACKET', packet: pkt });
      const { txPresets, activeSessionId } = stateRef.current;
      for (const preset of txPresets) {
        if (preset.mode !== 'trigger' || !preset.trigger || !activeSessionId) continue;
        if (matchesTrigger(pkt, preset.trigger)) {
          api.sendBytes(preset.bytes, activeSessionId).then(() => {
            dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `트리거 [${preset.name}]: ${preset.bytes}`, kind: 'tx' } });
          }).catch(() => {});
        }
      }
    }).then(fn => {
      if (cancelled) fn(); // StrictMode: already cleaned up, unlisten immediately
      else cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

// ── Hooks ─────────────────────────────────────────────────────

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

function matchToken(p: Packet, raw: string): boolean {
  let negate = false;
  let token = raw.trim();
  if (token.startsWith('!')) { negate = true; token = token.slice(1); }
  const t = token.toLowerCase();
  const hexFlat = p.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  const hexSpaced = p.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
  let result: boolean;
  if (t.startsWith('starts:')) {
    const needle = t.slice(7).replace(/\s/g, '').toUpperCase();
    result = hexFlat.startsWith(needle);
  } else if (t.startsWith('contains:')) {
    const needle = t.slice(9).replace(/\s/g, '').toUpperCase();
    result = hexFlat.includes(needle);
  } else if (t === 'checksum:fail') {
    result = p.checksum_ok === false;
  } else if (t === 'checksum:pass') {
    result = p.checksum_ok === true;
  } else if (t.startsWith('len:')) {
    const n = parseInt(t.slice(4));
    result = !isNaN(n) && p.bytes.length === n;
  } else if (t.startsWith('len>')) {
    const n = parseInt(t.slice(4));
    result = !isNaN(n) && p.bytes.length > n;
  } else if (t.startsWith('len<')) {
    const n = parseInt(t.slice(4));
    result = !isNaN(n) && p.bytes.length < n;
  } else {
    result = hexSpaced.toLowerCase().includes(t) || p.session_id.toLowerCase().includes(t);
  }
  return negate ? !result : result;
}

export function matchesTrigger(p: Packet, pattern: string): boolean {
  return matchToken(p, pattern);
}

export function usePackets() {
  const { state } = useApp();
  const { packets, filter } = state;
  const { tokens, showTx, showRx, errorsOnly, minGapMs } = filter;

  return packets.filter(p => {
    if (!showTx && p.direction === 'TX') return false;
    if (!showRx && p.direction === 'RX') return false;
    if (errorsOnly && p.checksum_ok !== false) return false;
    if (minGapMs !== null && (p.gap_ms ?? 0) < minGapMs) return false;
    if (tokens.length === 0) return true;
    return tokens.every(tok => matchToken(p, tok));
  });
}

export function useActiveSession() {
  const { state } = useApp();
  return state.sessions.find(s => s.id === state.activeSessionId) ?? null;
}

export function useSelectedPacket() {
  const { state } = useApp();
  return state.packets.find(p => p.id === state.selectedPacketId) ?? null;
}
