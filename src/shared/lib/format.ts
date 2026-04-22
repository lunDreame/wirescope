// ── Hex / bytes ──────────────────────────────────────────────────

export function bytesToHex(bytes: number[], sep = ' '): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) throw new Error('Odd-length HEX string');
  return Array.from({ length: clean.length / 2 }, (_, i) =>
    parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  );
}

export function bytesToAscii(bytes: number[]): string {
  return bytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
}

export function bytesToDec(bytes: number[], sep = ' '): string {
  return bytes.map(b => b.toString().padStart(3, ' ')).join(sep);
}

export function bytesToBin(bytes: number[], sep = ' '): string {
  return bytes.map(b => b.toString(2).padStart(8, '0')).join(sep);
}

export function formatBytes(bytes: number[], fmt: 'hex' | 'ascii' | 'dec' | 'bin' = 'hex', sep = ' '): string {
  switch (fmt) {
    case 'ascii': return bytesToAscii(bytes);
    case 'dec':   return bytesToDec(bytes, sep);
    case 'bin':   return bytesToBin(bytes, sep);
    default:      return bytesToHex(bytes, sep);
  }
}

// ── HexDump rows ─────────────────────────────────────────────────

export interface HexDumpRow {
  offset: number;
  bytes:  number[];
  ascii:  string;
}

export function buildHexDump(bytes: number[], rowSize = 16): HexDumpRow[] {
  const rows: HexDumpRow[] = [];
  for (let i = 0; i < bytes.length; i += rowSize) {
    const chunk = bytes.slice(i, i + rowSize);
    rows.push({ offset: i, bytes: chunk, ascii: bytesToAscii(chunk) });
  }
  return rows;
}

// ── Timestamp ────────────────────────────────────────────────────

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms3 = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms3}`;
}

export function formatDelta(ms: number): string {
  if (ms < 0.1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1)   return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ── Data size ────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Hex display helpers ───────────────────────────────────────────

export function parseHexInput(s: string): number[] {
  return hexToBytes(s.replace(/[^0-9a-fA-F]/g, ''));
}

export function isValidHex(s: string): boolean {
  const clean = s.replace(/[^0-9a-fA-F]/g, '');
  return clean.length > 0 && clean.length % 2 === 0;
}
