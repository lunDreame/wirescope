import React, {
  createContext, useContext, useReducer,
  useEffect, useRef, ReactNode
} from 'react';
import type {
  Packet, SessionInfo, SplitterConfig, Screen,
  FilterState, AppSettings, TxPreset, SavedFilter, CustomChecksum, ByteFormat,
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
  bufferBytes:        number;
  sessionReceiving:   Record<string, boolean>;
  removedSessionIds:  string[];  // kept for compat but no longer used to filter SET_SESSIONS
  packetNotes:        Record<string, string>;  // key = `${session_id}:${packet_id}`
  customChecksums:    CustomChecksum[];
  // Per-session state backing stores — saved on session switch, restored on session restore
  sessionFilters:     Record<string, FilterState>;
  sessionSplitters:   Record<string, SplitterConfig>;
  sessionByteFormats: Record<string, ByteFormat>;
  consoleLog:       { ts: number; text: string; kind: 'info' | 'tx' | 'rx' | 'err'; session_id?: string }[];
}

// ── Actions ───────────────────────────────────────────────────

type Action =
  | { type: 'ADD_PACKET'; packet: Packet }
  | { type: 'SET_PACKETS'; packets: Packet[] }
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
  | { type: 'SET_RECEIVING'; id: string; on: boolean }
  | { type: 'CLEAR_PACKETS'; id?: string }
  | { type: 'SET_PACKET_NOTE'; packetKey: string; note: string }
  | { type: 'ADD_CUSTOM_CHECKSUM'; checksum: CustomChecksum }
  | { type: 'UPDATE_CUSTOM_CHECKSUM'; checksum: CustomChecksum }
  | { type: 'REMOVE_CUSTOM_CHECKSUM'; id: string }
  | { type: 'LOG_CONSOLE'; entry: AppState['consoleLog'][number] }
  | { type: 'CLEAR_CONSOLE'; id?: string };

// ── Defaults ─────────────────────────────────────────────────

const defaultSplitter: SplitterConfig = {
  method:               'delimiter',
  regex_pattern:        '',
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
  checksum_offset:      -1,
  checksum_size:        1,
  checksum_exclude_sof: false,
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

function loadCustomChecksums(): CustomChecksum[] {
  try {
    const s = localStorage.getItem('ws_custom_checksums');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function detectLanguage(): 'ko' | 'en' {
  const lang = (navigator.language ?? '').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

const defaultSettings: AppSettings = {
  theme:       'light',
  byteFormat:  'hex',
  density:     'mid',
  showGapRows: true,
  accentHue:   245,
  autoScroll:  true,
  language:    detectLanguage(),
};

// Clear stale removed-sessions list — it is no longer used to filter SET_SESSIONS,
// and old entries would have caused new connections to be invisible after a session removal.
try { localStorage.removeItem('ws_removed_sessions'); } catch {}

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
  bufferBytes:       0,
  sessionReceiving:  {},
  removedSessionIds: [], // no longer persisted — SET_SESSIONS accepts full backend list
  packetNotes:       {},
  customChecksums:   loadCustomChecksums(),
  sessionFilters:    {},
  sessionSplitters:  {},
  sessionByteFormats:{},
  consoleLog:    [
    { ts: Date.now(), text: 'WireScope started', kind: 'info' },
  ],
};

// ── Reducer ───────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_PACKET': {
      if (state.sessionReceiving[action.packet.session_id] === false) return state;
      const MAX = 100_000;
      const packets = state.packets.length >= MAX
        ? [...state.packets.slice(-MAX + 1), action.packet]
        : [...state.packets, action.packet];
      const logEntry: AppState['consoleLog'][number] = {
        ts: action.packet.timestamp_ms,
        text: `${action.packet.direction} ${action.packet.bytes.length}B · ${action.packet.bytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}`,
        kind: action.packet.direction === 'TX' ? 'tx' : 'rx',
        session_id: action.packet.session_id,
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
    case 'CLEAR_PACKETS': {
      const packets = action.id
        ? state.packets.filter(p => p.session_id !== action.id)
        : [];
      // Only clear selection if the selected packet was in the cleared session
      const clearedIds = action.id
        ? state.packets.filter(p => p.session_id === action.id).map(p => p.id)
        : state.packets.map(p => p.id);
      const selectedPacketId = clearedIds.includes(state.selectedPacketId ?? -1)
        ? null
        : state.selectedPacketId;
      // Clear notes for the cleared session's packets to prevent stale notes
      // appearing on new packets that may reuse the same IDs
      const packetNotes = action.id
        ? Object.fromEntries(
            Object.entries(state.packetNotes).filter(([key]) => !key.startsWith(`${action.id}:`))
          )
        : {};
      return { ...state, packets, selectedPacketId, packetNotes, bufferBytes: packets.reduce((a, p) => a + p.bytes.length, 0) };
    }
    case 'SET_SESSIONS': {
      // Always accept the full backend list — REMOVE_SESSION already removes from state.sessions
      // directly, and there is no background push that could re-add them.
      return { ...state, sessions: action.sessions };
    }
    case 'SET_ACTIVE_SESSION': {
      const oldId = state.activeSessionId;
      const newId = action.id;
      // Save the current session's state before switching
      const sessionFilters = oldId
        ? { ...state.sessionFilters, [oldId]: state.filter }
        : state.sessionFilters;
      const sessionSplitters = oldId
        ? { ...state.sessionSplitters, [oldId]: state.splitter }
        : state.sessionSplitters;
      const sessionByteFormats = oldId
        ? { ...state.sessionByteFormats, [oldId]: state.settings.byteFormat }
        : state.sessionByteFormats;
      // Restore the new session's state.
      // For splitter: fall back to the current splitter (which may be loaded from localStorage)
      // rather than defaultSplitter, so the saved config is not wiped on first connect.
      const filter = newId ? (sessionFilters[newId] ?? defaultFilter) : defaultFilter;
      const splitter = newId ? (sessionSplitters[newId] ?? state.splitter) : state.splitter;
      const byteFormat = newId ? (sessionByteFormats[newId] ?? state.settings.byteFormat) : state.settings.byteFormat;
      // Only persist to localStorage if this session had an explicit saved config
      if (newId && sessionSplitters[newId]) {
        try { localStorage.setItem('ws_splitter', JSON.stringify(splitter)); } catch {}
      }
      return {
        ...state,
        activeSessionId: newId,
        filter,
        splitter,
        settings: { ...state.settings, byteFormat },
        sessionFilters,
        sessionSplitters,
        sessionByteFormats,
      };
    }
    case 'SET_SPLITTER': {
      try { localStorage.setItem('ws_splitter', JSON.stringify(action.config)); } catch {}
      const sessionSplitters = state.activeSessionId
        ? { ...state.sessionSplitters, [state.activeSessionId]: action.config }
        : state.sessionSplitters;
      return { ...state, splitter: action.config, sessionSplitters };
    }
    case 'SET_SCREEN':
      return { ...state, screen: action.screen };
    case 'SELECT_PACKET':
      return { ...state, selectedPacketId: action.id };
    case 'SET_FILTER': {
      const filter = { ...state.filter, ...action.filter };
      const sessionFilters = state.activeSessionId
        ? { ...state.sessionFilters, [state.activeSessionId]: filter }
        : state.sessionFilters;
      return { ...state, filter, sessionFilters };
    }
    case 'SET_SETTINGS': {
      const settings = { ...state.settings, ...action.settings };
      try { localStorage.setItem('ws_settings', JSON.stringify(settings)); } catch {}
      // Mirror byteFormat change into per-session backing store
      const sessionByteFormats = (action.settings.byteFormat !== undefined && state.activeSessionId)
        ? { ...state.sessionByteFormats, [state.activeSessionId]: action.settings.byteFormat }
        : state.sessionByteFormats;
      return { ...state, settings, sessionByteFormats };
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
      const packets = state.packets.filter(p => p.session_id !== action.id);
      const sessionReceiving = { ...state.sessionReceiving };
      delete sessionReceiving[action.id];
      // If selected packet was in the removed session, clear selection
      const removedPacketIds = state.packets.filter(p => p.session_id === action.id).map(p => p.id);
      const selectedPacketId = removedPacketIds.includes(state.selectedPacketId ?? -1)
        ? null
        : state.selectedPacketId;
      const nextActiveId = state.activeSessionId === action.id
        ? (sessions[0]?.id ?? null)
        : state.activeSessionId;
      // If switching away, restore the next session's state; otherwise keep current
      const filter = (state.activeSessionId === action.id && nextActiveId)
        ? (state.sessionFilters[nextActiveId] ?? defaultFilter)
        : state.filter;
      const splitter = (state.activeSessionId === action.id && nextActiveId)
        ? (state.sessionSplitters[nextActiveId] ?? defaultSplitter)
        : state.splitter;
      const byteFormat = (state.activeSessionId === action.id && nextActiveId)
        ? (state.sessionByteFormats[nextActiveId] ?? state.settings.byteFormat)
        : state.settings.byteFormat;
      // Clean up removed session's backing state
      const { [action.id]: _rf, ...sessionFilters }     = state.sessionFilters;
      const { [action.id]: _rs, ...sessionSplitters }   = state.sessionSplitters;
      const { [action.id]: _rb, ...sessionByteFormats } = state.sessionByteFormats;
      return {
        ...state,
        sessions,
        packets,
        selectedPacketId,
        bufferBytes: packets.reduce((acc, p) => acc + p.bytes.length, 0),
        activeSessionId: nextActiveId,
        filter,
        splitter,
        settings: { ...state.settings, byteFormat },
        sessionReceiving,
        sessionFilters,
        sessionSplitters,
        sessionByteFormats,
        removedSessionIds: (() => {
          const ids = [...state.removedSessionIds, action.id];
          try { localStorage.setItem('ws_removed_sessions', JSON.stringify(ids)); } catch {}
          return ids;
        })(),
      };
    }
    case 'SET_RECEIVING':
      return { ...state, sessionReceiving: { ...state.sessionReceiving, [action.id]: action.on } };
    case 'SET_PACKET_NOTE':
      return { ...state, packetNotes: { ...state.packetNotes, [action.packetKey]: action.note } };
    case 'ADD_CUSTOM_CHECKSUM': {
      const customChecksums = [...state.customChecksums, action.checksum];
      try { localStorage.setItem('ws_custom_checksums', JSON.stringify(customChecksums)); } catch {}
      return { ...state, customChecksums };
    }
    case 'UPDATE_CUSTOM_CHECKSUM': {
      const customChecksums = state.customChecksums.map(c => c.id === action.checksum.id ? action.checksum : c);
      try { localStorage.setItem('ws_custom_checksums', JSON.stringify(customChecksums)); } catch {}
      return { ...state, customChecksums };
    }
    case 'REMOVE_CUSTOM_CHECKSUM': {
      const customChecksums = state.customChecksums.filter(c => c.id !== action.id);
      try { localStorage.setItem('ws_custom_checksums', JSON.stringify(customChecksums)); } catch {}
      return { ...state, customChecksums };
    }
    case 'LOG_CONSOLE':
      return { ...state, consoleLog: [...state.consoleLog.slice(-500), action.entry] };
    case 'CLEAR_CONSOLE': {
      // If session id provided, only remove that session's entries (keep system/global entries)
      if (action.id) {
        return { ...state, consoleLog: state.consoleLog.filter(e => e.session_id !== action.id) };
      }
      return { ...state, consoleLog: [] };
    }
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

  // Sync active splitter to Rust backend whenever it changes (session switch or user config)
  useEffect(() => {
    api.setSplitter(state.splitter).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.splitter]);

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

    api.onPacket(rawPkt => {
      // For custom checksum algorithms (unknown to Rust), compute checksum_ok in JS
      const { txPresets, activeSessionId, splitter, customChecksums } = stateRef.current;
      let pkt = rawPkt;
      if (splitter.checksum_algorithm.startsWith('custom:')) {
        const csId = splitter.checksum_algorithm.slice(7);
        const cs = customChecksums.find(c => c.id === csId);
        if (cs) {
          pkt = { ...rawPkt, checksum_ok: evalCustomChecksumOk(rawPkt.bytes, cs.code, splitter) };
        }
      }
      dispatch({ type: 'ADD_PACKET', packet: pkt });
      for (const preset of txPresets) {
        if (preset.mode !== 'trigger' || !preset.trigger || !activeSessionId) continue;
        if (matchesTrigger(pkt, preset.trigger)) {
          const hex = preset.inputFmt === 'ascii'
            ? asciiToHex(preset.bytes)
            : preset.bytes;
          api.sendBytes(hex, activeSessionId).then(() => {
            dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `Trigger [${preset.name}]: ${preset.bytes}`, kind: 'tx', session_id: activeSessionId } });
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

// ── Custom checksum JS evaluator ─────────────────────────────

function evalCustomChecksumOk(bytes: number[], code: string, splitter: SplitterConfig): boolean {
  try {
    const n = bytes.length;
    const dataStart = splitter.checksum_exclude_sof ? Math.min(splitter.sof.length, n) : 0;
    const csStart = splitter.checksum_offset < 0
      ? n + splitter.checksum_offset
      : splitter.checksum_offset;
    if (csStart <= dataStart || csStart >= n) return false;
    const data = bytes.slice(dataStart, csStart);
    const expected = bytes.slice(csStart, csStart + splitter.checksum_size);
    if (expected.length < splitter.checksum_size) return false;

    // Execute user-defined calculate() function
    const FnCtor = Object.getPrototypeOf(function(){}).constructor as FunctionConstructor;
    const fn = new FnCtor('__bytes__', code + '\nreturn calculate(__bytes__);');
    const computed = (fn([...data]) as number) >>> 0;

    // Compare as little-endian integer of checksum_size bytes
    let expectedVal = 0;
    for (let i = 0; i < expected.length && i < 4; i++) {
      expectedVal |= expected[i] << (i * 8);
    }
    expectedVal = expectedVal >>> 0;
    const mask = splitter.checksum_size >= 4 ? 0xFFFFFFFF : ((1 << (splitter.checksum_size * 8)) - 1) >>> 0;
    return (computed & mask) === (expectedVal & mask);
  } catch {
    return false;
  }
}

function matchToken(p: Packet, raw: string, sessions: SessionInfo[] = []): boolean {
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
  } else if (t.startsWith('session:')) {
    // Match by session name or ID — useful for saved connection presets
    const needle = t.slice(8);
    const sess = sessions.find(s => s.id === p.session_id);
    result = !!(sess && (sess.name.toLowerCase().includes(needle) || sess.id.toLowerCase().includes(needle)));
  } else {
    result = hexSpaced.toLowerCase().includes(t) || p.session_id.toLowerCase().includes(t);
  }
  return negate ? !result : result;
}

function asciiToHex(text: string): string {
  const bytes: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const esc = text[i + 1];
      if      (esc === 'r')                         { bytes.push('0d'); i += 2; }
      else if (esc === 'n')                         { bytes.push('0a'); i += 2; }
      else if (esc === 't')                         { bytes.push('09'); i += 2; }
      else if (esc === '0')                         { bytes.push('00'); i += 2; }
      else if (esc === 'x' && i + 3 < text.length) { bytes.push(text.slice(i + 2, i + 4).toLowerCase()); i += 4; }
      else { bytes.push(text.charCodeAt(i).toString(16).padStart(2, '0')); i++; }
    } else {
      bytes.push(text.charCodeAt(i).toString(16).padStart(2, '0')); i++;
    }
  }
  return bytes.join(' ');
}

export function matchesTrigger(p: Packet, pattern: string): boolean {
  return matchToken(p, pattern);
}

export function usePackets() {
  const { state } = useApp();
  const { packets, filter, activeSessionId, sessions } = state;
  const { tokens, showTx, showRx, errorsOnly, minGapMs } = filter;

  return packets.filter(p => {
    if (activeSessionId === null) return false;
    if (p.session_id !== activeSessionId) return false;
    if (!showTx && p.direction === 'TX') return false;
    if (!showRx && p.direction === 'RX') return false;
    if (errorsOnly && p.checksum_ok !== false) return false;
    if (minGapMs !== null && (p.gap_ms ?? 0) < minGapMs) return false;
    if (tokens.length === 0) return true;
    return tokens.every(tok => matchToken(p, tok, sessions));
  });
}

export function useActiveSession() {
  const { state } = useApp();
  return state.sessions.find(s => s.id === state.activeSessionId) ?? null;
}

/** Session-only filtered packets — no filter tokens applied. Use for visualizations/context views. */
export function useSessionPackets() {
  const { state } = useApp();
  const { packets, activeSessionId } = state;
  if (activeSessionId === null) return [];
  return packets.filter(p => p.session_id === activeSessionId);
}

export function useSelectedPacket() {
  const { state } = useApp();
  const { packets, selectedPacketId, activeSessionId } = state;
  return packets.find(p => p.id === selectedPacketId && p.session_id === activeSessionId) ?? null;
}

/** Returns whether the active session is currently receiving packets. Defaults to true (receiving) if not explicitly paused. */
export function useIsReceiving(): boolean {
  const { state } = useApp();
  if (!state.activeSessionId) return false;
  return state.sessionReceiving[state.activeSessionId] !== false;
}

export function useCustomChecksums() {
  const { state } = useApp();
  return state.customChecksums;
}
