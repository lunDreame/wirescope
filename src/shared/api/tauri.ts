import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Packet, SplitterConfig, SessionInfo, TimingStats, ChecksumResult } from '../types';

// ── Window controls ────────────────────────────────────────────
const win = getCurrentWindow();
export const windowControls = {
  minimize: () => win.minimize(),
  maximize: () => win.toggleMaximize(),
  close:    () => win.close(),
};

// ── Connection ────────────────────────────────────────────────
export const connectSerial = (port: string, baud: number) =>
  invoke<string>('connect_serial', { port, baud });

export const connectTcp = (host: string, port: number) =>
  invoke<string>('connect_tcp', { host, port });

export const disconnect = (sessionId: string) =>
  invoke<void>('disconnect', { sessionId });

export const listSerialPorts = () =>
  invoke<string[]>('list_serial_ports');

// ── Packets ───────────────────────────────────────────────────
export const sendBytes = (hex: string, sessionId: string) =>
  invoke<void>('send_bytes', { hex, sessionId });

export const getPackets = () =>
  invoke<Packet[]>('get_packets');

export const clearPackets = () =>
  invoke<void>('clear_packets');

// ── Sessions ──────────────────────────────────────────────────
export const getSessions = () =>
  invoke<SessionInfo[]>('get_sessions');

// ── Splitter ──────────────────────────────────────────────────
export const setSplitter = (config: SplitterConfig) =>
  invoke<void>('set_splitter', { config });

export const getSplitter = () =>
  invoke<SplitterConfig>('get_splitter');

// ── Checksum ──────────────────────────────────────────────────
export const computeChecksum = (algo: string, hex: string) =>
  invoke<ChecksumResult>('compute_checksum', { algo, hex });

export const computeAllChecksums = (hex: string) =>
  invoke<ChecksumResult[]>('compute_all_checksums', { hex });

// ── Analytics ─────────────────────────────────────────────────
export const getTimingStats = () =>
  invoke<TimingStats>('get_timing_stats');

// ── Export ────────────────────────────────────────────────────
export const exportPackets = (json: string, ext = 'json') =>
  invoke<string>('export_packets', { json, ext });

// ── Events ────────────────────────────────────────────────────
export const onPacket = (cb: (pkt: Packet) => void): Promise<UnlistenFn> =>
  listen<Packet>('packet', e => cb(e.payload));
