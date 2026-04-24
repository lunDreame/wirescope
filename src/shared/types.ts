// ── Core domain types ─────────────────────────────────────────

export interface Packet {
  id:           number;
  timestamp_ms: number;
  gap_ms:       number | null;
  direction:    'TX' | 'RX';
  bytes:        number[];
  checksum_ok:  boolean | null;
  session_id:   string;
}

export interface SplitterConfig {
  method:                'delimiter' | 'length_field' | 'gap' | 'regex' | 'custom';
  regex_pattern?:        string;  // used when method === 'regex'
  sof:                   number[];
  eof:                   number[];
  eof_include:           boolean;
  gap_ms:                number;
  length_field_offset:   number;
  length_field_size:     number;
  length_includes_header: boolean;
  min_packet_size:       number;
  max_packet_size:       number;
  checksum_algorithm:    string;
  checksum_offset:       number;
  checksum_size:         number;
  checksum_exclude_sof:  boolean;
  mark_errors:           boolean;
  resync_on_error:       boolean;
  discard_on_disconnect: boolean;
  inner_gap_warn_ms:     number;
}

export interface SessionInfo {
  id:        string;
  name:      string;
  kind:      'serial' | 'tcp' | 'udp' | 'tls' | 'ws';
  connected: boolean;
  tx_bytes:  number;
  rx_bytes:  number;
  baud_rate?: number;
  port_params?: string;
}

export interface TimingStats {
  total_packets:  number;
  total_bytes:    number;
  avg_gap_ms:     number;
  min_gap_ms:     number;
  max_gap_ms:     number;
  std_gap_ms:     number;
  cycle_count:    number;
  avg_cycle_ms:   number;
  avg_idle_ms:    number;
  checksum_pass:  number;
  checksum_fail:  number;
  packets_per_sec: number;
}

export interface ChecksumResult {
  algorithm: string;
  value:     number;
  hex:       string;
}

export interface SavedFilter {
  id:    string;
  label: string;
  query: string;
  count?: number;
}

export interface TxPreset {
  id:       string;
  name:     string;
  bytes:    string;
  inputFmt: 'hex' | 'ascii';
  mode:    'single' | 'repeat' | 'trigger';
  interval_ms?: number;
  count?:  number;
  trigger?: string;
  active:  boolean;
}

export interface ConnectionPreset {
  id:       string;
  label:    string;
  kind:     'serial' | 'tcp';
  // serial fields
  port?:     string;
  baud?:     number;
  dataBits?: number;
  parity?:   string;
  stopBits?: string;
  flow?:     string;
  // tcp fields
  host?:    string;
  tcpPort?: string;
  tcpMode?: string;
}

export interface CustomChecksum {
  id:    string;
  name:  string;
  code:  string;  // JS function body
  tested: boolean;
}

// ── UI state types ────────────────────────────────────────────

export type Screen = 'workspace' | 'connect' | 'splitter' | 'checksum' | 'analyzer';
export type ByteFormat = 'hex' | 'ascii' | 'dec' | 'bin';
export type DensityLevel = 'cozy' | 'mid' | 'tight';
export type DockTab = 'transmit' | 'script' | 'console' | 'macro';
export type InspectorTab = 'detail' | 'analysis' | 'graph' | 'notes';

export interface FilterState {
  tokens:     string[];
  showTx:     boolean;
  showRx:     boolean;
  errorsOnly: boolean;
  minGapMs:   number | null;
}

export interface AppSettings {
  theme:     'light' | 'dark';
  byteFormat: ByteFormat;
  density:   DensityLevel;
  showGapRows: boolean;
  accentHue:  number;
  autoScroll: boolean;
  language:  'ko' | 'en';
}
