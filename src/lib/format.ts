import type { LogLine, ViewMode } from '../types/wirescope'

export function formatPayload(raw: number[], mode: ViewMode, text: string): string {
  if (mode === 'hex') {
    return raw.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  }

  return text
    .replaceAll('\r\n', '⏎CRLF ')
    .replaceAll('\n', '␊LF ')
    .replaceAll('\r', '␍CR ')
}

export function summarizeLogs(logs: LogLine[]) {
  const rx = logs.filter((line) => line.dir === 'RX').length
  const tx = logs.filter((line) => line.dir === 'TX').length
  const totalBytes = logs.reduce((sum, line) => sum + line.raw.length, 0)

  const intervals = logs.slice(1).map((line) => line.interval_ms)
  const avgGap = intervals.length
    ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
    : 0

  return {
    total: logs.length,
    rx,
    tx,
    totalBytes,
    avgGap,
  }
}
