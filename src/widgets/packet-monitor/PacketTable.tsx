import { useRef, useEffect, memo, useCallback } from 'react';
import s from './PacketTable.module.css';
import { useApp, usePackets } from '../../app/store';
import { formatTimestamp, formatDelta, formatBytes } from '../../shared/lib/format';
import type { Packet } from '../../shared/types';

export function PacketTable() {
  const { state, dispatch } = useApp();
  const packets = usePackets();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { settings, splitter } = state;

  // Auto-scroll
  useEffect(() => {
    if (!settings.autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [packets.length, settings.autoScroll]);

  const select = useCallback((id: number) => {
    dispatch({ type: 'SELECT_PACKET', id });
  }, [dispatch]);

  const sofHex = splitter.sof.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const eofHex = splitter.eof.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  return (
    <div className={s.wrap}>
      {/* Table header */}
      <div className={s.head}>
        <div className={s.colIdx}>#</div>
        <div className={s.colTs}>시각 ↓</div>
        <div className={s.colDir}>방향</div>
        <div className={s.colGap}>간격</div>
        <div className={s.colBytes}>
          바이트 ({settings.byteFormat.toUpperCase()})
          {sofHex && (
            <span className={s.splitterHint}>
              분리 기준: {sofHex}{eofHex ? ` … ${eofHex}` : ''}
            </span>
          )}
        </div>
        <div className={s.colLen}>길이</div>
        <div className={s.colCk}>체크섬</div>
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
              {state.sessions.some(s => s.connected)
                ? '패킷을 기다리는 중…'
                : '먼저 장치에 연결하세요'}
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
}

const PacketRow = memo(function PacketRow({ packet: p, selected, onSelect, fmt, sofBytes, eofBytes }: RowProps) {
  const dir = p.direction.toLowerCase() as 'tx' | 'rx';
  const isErr = p.checksum_ok === false;

  const displayBytes = fmt === 'hex'
    ? renderHexWithHighlights(p.bytes, sofBytes, eofBytes, p.checksum_ok)
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
  checksumOk: boolean | null,
) {
  const eofLen = eofBytes.length;
  // Only highlight EOF if the packet actually ends with the configured EOF pattern
  const eofMatch = eofLen > 0 && bytes.length >= eofLen &&
    bytes.slice(bytes.length - eofLen).every((b, j) => b === eofBytes[j]);

  return (
    <>
      {bytes.map((b, i) => {
        const h = b.toString(16).padStart(2, '0').toUpperCase();
        const isSof = sofBytes.length > 0 && i < sofBytes.length;
        const isEof = eofMatch && i >= bytes.length - eofLen;
        const cls = (isSof || isEof)
          ? s.hexSync
          : checksumOk === false ? s.hexBad : s.hexPlain;
        return <span key={i} className={cls}>{h}</span>;
      })}
    </>
  );
}
