export type ConnectionMode = 'serial' | 'socket'

export type ViewMode = 'ascii' | 'hex'

export type NewlineMode = 'none' | 'cr' | 'lf' | 'crlf'

export type SerialParity = 'none' | 'even' | 'odd'

export type SerialFlow = 'none' | 'software' | 'hardware'

export type SocketProto = 'tcp' | 'udp'

export interface LogLine {
  when_iso: string
  interval_ms: number
  dir: string
  origin: string
  text: string
  raw: number[]
  connId: string
}

export interface SerialConfig {
  baud: number
  dataBits: number
  parity: SerialParity
  stopBits: 1 | 2
  flow: SerialFlow
  append: NewlineMode
}

export interface SocketConfig {
  host: string
  port: number
  proto: SocketProto
  append: NewlineMode
}

export interface AppSettings {
  mode: ConnectionMode
  viewMode: ViewMode
  serial: SerialConfig
  socket: SocketConfig
}
