import { useRef, useEffect, memo, useCallback } from 'react';
import s from './PacketTable.module.css';
import { useApp, usePackets } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import { formatTimestamp, formatDelta, formatBytes } from '../../shared/lib/format';
import type { Packet } from '../../shared/types';

export function PacketTable() {
  const { state, dispatch } = useApp();
  const packets = usePackets();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { settings, splitter } = state;
  const t = useT();

  // Auto-scroll
  useEffect(() => {
    if (!settings.autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [packets.length, settings.autoScroll]);

  const select = useCallback((id: number) => {
    dispatch({ type: 'SELECT_PACKET', id });
    dispatch({ type: 'SET_INSPECTOR_TAB', tab: 'detail' });
  }, [dispatch]);

  const sofHex = splitter.sof.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const eofHex = splitter.eof.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  return (
    <div className={s.wrap}>
      {/* Table header */}
      <div className={s.head}>
        <div className={s.colIdx}>#</div>
        <div className={s.colTs}>{t('table.time')}</div>
        <div className={s.colDir}>{t('table.dir')}</div>
        <div className={s.colGap}>{t('table.gap')}</div>
        <div className={s.colBytes}>
          {t('table.bytes')} ({settings.byteFormat.toUpperCase()})
          {sofHex && (
            <span className={s.splitterHint}>
              {t('table.splitBy')}: {sofHex}{eofHex ? ` … ${eofHex}` : ''}
            </span>
          )}
        </div>
        <div className={s.colLen}>{t('table.length')}</div>
        <div className={s.colCk}>{t('table.checksum')}</div>
      </div>

      {/* Rows */}
      <div className={s.body} ref={scrollRef}>
        {packets.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.3">
                <rect x="4" y="6" width="24" height="20" rx="2"/>
                <path d="M4 12h24M10 17h12M10 21h8"/>
              </svg>
            </div>
            <div className={s.emptyText}>
              {state.sessions.find(s => s.id === state.activeSessionId)?.connected
                ? t('table.waiting')
                : t('table.connectFirst')}
            </div>
          </div>
        ) : packets.map((pkt, idx) => {
          const showGap = settings.showGapRows
            && pkt.gap_ms !== null
            && pkt.gap_ms > 100
            && idx > 0;

          return (
            <div key={pkt.id}>
              {showGap && (
                <div className={s.gapRow}>
                  <div className={s.gapRuler} />
                  <span>{formatDelta(pkt.gap_ms!)}</span>
                  <div className={s.gapRuler} />
                </div>
              )}
              <PacketRow
                packet={pkt}
                selected={state.selectedPacketId === pkt.id}
                onSelect={select}
                fmt={settings.byteFormat}
                sofBytes={splitter.sof}
                eofBytes={splitter.eof}
                eofInclude={splitter.eof_include}
                checksumAlgo={splitter.checksum_algorithm}
                checksumOffset={splitter.checksum_offset}
                checksumSize={splitter.checksum_size}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RowProps {
  packet: Packet;
  selected: boolean;
  onSelect: (id: number) => void;
  fmt: string;
  sofBytes: number[];
  eofBytes: number[];
  eofInclude: boolean;
  checksumAlgo: string;
  checksumOffset: number;
  checksumSize: number;
}

const PacketRow = memo(function PacketRow({
  packet: p, selected, onSelect, fmt,
  sofBytes, eofBytes, eofInclude,
  checksumAlgo, checksumOffset, checksumSize,
}: RowProps) {
  const dir = p.direction.toLowerCase() as 'tx' | 'rx';
  const isErr = p.checksum_ok === false;

  const displayBytes = fmt === 'hex'
    ? renderHexWithHighlights(p.bytes, sofBytes, eofBytes, eofInclude, p.checksum_ok, checksumAlgo, checksumOffset, checksumSize)
    : <span>{formatBytes(p.bytes, fmt as any)}</span>;

  const gapClass = p.gap_ms === null ? '' : p.gap_ms > 500 ? s.gapVeryLong : p.gap_ms > 100 ? s.gapLong : '';

  return (
    <div
      className={`${s.row} ${s[dir]} ${selected ? s.sel : ''} ${isErr ? s.rowErr : ''}`}
      onClick={() => onSelect(p.id)}
    >
      <div className={`${s.cell} ${s.colIdx}`}>{p.id}</div>
      <div className={`${s.cell} ${s.colTs}`}>{formatTimestamp(p.timestamp_ms)}</div>
      <div className={`${s.cell} ${s.colDir} ${s['dir-' + dir]}`}>{p.direction}</div>
      <div className={`${s.cell} ${s.colGap} ${gapClass}`}>
        {p.gap_ms !== null ? formatDelta(p.gap_ms) : '—'}
      </div>
      <div className={`${s.cell} ${s.colBytes} ${s.bytes}`}>{displayBytes}</div>
      <div className={`${s.cell} ${s.colLen}`}>{p.bytes.length}</div>
      <div className={`${s.cell} ${s.colCk} ${p.checksum_ok === true ? s.ckOk : p.checksum_ok === false ? s.ckBad : ''}`}>
        {p.checksum_ok === true ? '✓' : p.checksum_ok === false ? '✗' : '—'}
      </div>
    </div>
  );
});

function renderHexWithHighlights(
  bytes: number[],
  sofBytes: number[],
  eofBytes: number[],
  eofInclude: boolean,
  checksumOk: boolean | null,
  checksumAlgo: string,
  checksumOffset: number,
  checksumSize: number,
) {
  const n = bytes.length;
  const eofLen = eofBytes.length;

  // SOF: highlight only when packet actually starts with the configured bytes
  const sofMatch = sofBytes.length > 0 && sofBytes.every((b, j) => b === bytes[j]);

  // EOF: only highlight when eof_include is true (bytes are present in the packet)
  const eofMatch = eofInclude && eofLen > 0 && n >= eofLen &&
    bytes.slice(n - eofLen).every((b, j) => b === eofBytes[j]);

  // Checksum byte range
  let csStart = -1, csEnd = -1;
  if (checksumAlgo && checksumSize > 0) {
    csStart = checksumOffset < 0 ? n + checksumOffset : checksumOffset;
    csEnd = csStart + checksumSize;
    if (csStart < 0 || csEnd > n) { csStart = -1; csEnd = -1; }
  }

  return (
    <>
      {bytes.map((b, i) => {
        const h = b.toString(16).padStart(2, '0').toUpperCase();
        const isSof = sofMatch && i < sofBytes.length;
        const isEof = eofMatch && i >= n - eofLen;
        const isCs = csStart >= 0 && i >= csStart && i < csEnd;

        let cls: string;
        if (isSof) cls = s.hexSof;
        else if (isEof) cls = s.hexEof;
        else if (isCs) cls = checksumOk === false ? s.hexBad : s.hexCs;
        else cls = s.hexPlain;

        return <span key={i} className={cls}>{h}</span>;
      })}
    </>
  );
}
