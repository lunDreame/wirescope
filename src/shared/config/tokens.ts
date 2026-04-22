// Design token constants — mirrors CSS custom properties in globals.css
// Use these in TypeScript logic; use CSS vars in stylesheets.

export const COLORS = {
  brand:    'oklch(0.52 0.15 245)',
  tx:       'oklch(0.56 0.14 150)',
  txBg:     'oklch(0.93 0.05 150)',
  rx:       'oklch(0.58 0.14 75)',
  rxBg:     'oklch(0.94 0.07 75)',
  err:      'oklch(0.55 0.18 25)',
  errBg:    'oklch(0.94 0.06 25)',
  ok:       'oklch(0.58 0.12 150)',
  warn:     'oklch(0.66 0.13 75)',
} as const;

export const FONTS = {
  ui:    "'IBM Plex Sans', -apple-system, sans-serif",
  mono:  "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'IBM Plex Serif', serif",
} as const;

export const BAUD_RATES = [
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200,
  28800, 38400, 57600, 115200, 230400, 460800, 921600,
] as const;

export const DATA_BITS = [5, 6, 7, 8] as const;

export const PARITY_OPTIONS = [
  { value: 'none',  label: '없음 (N)' },
  { value: 'odd',   label: '홀수 (O)' },
  { value: 'even',  label: '짝수 (E)' },
  { value: 'mark',  label: '마크 (M)' },
  { value: 'space', label: '스페이스 (S)' },
] as const;

export const STOP_BITS = [
  { value: '1',   label: '1비트' },
  { value: '1.5', label: '1.5비트' },
  { value: '2',   label: '2비트' },
] as const;

export const FLOW_CONTROL = [
  { value: 'none',     label: '없음' },
  { value: 'hardware', label: '하드웨어 (RTS/CTS)' },
  { value: 'software', label: '소프트웨어 (XON/XOFF)' },
] as const;

export const SERIAL_PRESETS = [
  { label: '기본 (8N1)',        baud: 9600,   data: 8, parity: 'none', stop: '1', flow: 'none' },
  { label: 'Modbus RTU',       baud: 9600,   data: 8, parity: 'even', stop: '1', flow: 'none' },
  { label: 'Modbus 115200',    baud: 115200, data: 8, parity: 'none', stop: '1', flow: 'none' },
  { label: 'Arduino 기본',     baud: 115200, data: 8, parity: 'none', stop: '1', flow: 'none' },
  { label: 'GPS NMEA',         baud: 4800,   data: 8, parity: 'none', stop: '1', flow: 'none' },
  { label: 'Bluetooth SPP',    baud: 115200, data: 8, parity: 'none', stop: '1', flow: 'none' },
] as const;

export const CHECKSUM_PRESETS = [
  { id: 'crc16-modbus',  label: 'CRC-16/MODBUS',    group: 'CRC-16',  desc: 'Modbus RTU, 산업용 RS-485' },
  { id: 'crc16-ccitt',   label: 'CRC-16/CCITT',     group: 'CRC-16',  desc: 'XMODEM, X.25, HDLC' },
  { id: 'crc16-kermit',  label: 'CRC-16/Kermit',    group: 'CRC-16',  desc: 'Kermit 프로토콜' },
  { id: 'crc16-dnp',     label: 'CRC-16/DNP',       group: 'CRC-16',  desc: 'DNP3 프로토콜' },
  { id: 'crc32',         label: 'CRC-32/ISO-HDLC',  group: 'CRC-32',  desc: 'Ethernet, ZIP, PNG' },
  { id: 'crc32c',        label: 'CRC-32C (Castagnoli)', group: 'CRC-32', desc: 'iSCSI, SCTP' },
  { id: 'sum8',          label: 'Sum8',              group: 'Simple',  desc: '단순 바이트 합산' },
  { id: 'sum16',         label: 'Sum16',             group: 'Simple',  desc: '16비트 합산' },
  { id: 'xor',           label: 'XOR',               group: 'Simple',  desc: '모든 바이트 XOR' },
  { id: 'fletcher16',    label: 'Fletcher-16',       group: 'Simple',  desc: 'TCP/IP 헤더 검증' },
  { id: 'adler32',       label: 'Adler-32',          group: 'Simple',  desc: 'zlib' },
  { id: 'lrc',           label: 'LRC',               group: 'Simple',  desc: 'ASCII Modbus' },
] as const;

export type ChecksumId = typeof CHECKSUM_PRESETS[number]['id'];
