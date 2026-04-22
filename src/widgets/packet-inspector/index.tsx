import { useState, useEffect } from 'react';
import s from './Inspector.module.css';
import { useApp, useSelectedPacket } from '../../app/store';
import { HexDump } from '../../shared/ui/HexDump';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { formatTimestamp, formatDelta } from '../../shared/lib/format';
import type { ChecksumResult } from '../../shared/types';
import * as api from '../../shared/api/tauri';

const TABS = [
  { id: 'detail',   label: '상세' },
  { id: 'analysis', label: '분석' },
  { id: 'graph',    label: '그래프' },
  { id: 'notes',    label: '메모' },
] as const;

type TabId = typeof TABS[number]['id'];

export function PacketInspector() {
  const { state, dispatch } = useApp();
  const livePacket = useSelectedPacket();
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const activeTab = state.inspectorTab as TabId;

  const packet = pinnedId !== null
    ? (state.packets.find(p => p.id === pinnedId) ?? livePacket)
    : livePacket;

  const isPinned = pinnedId !== null;

  return (
    <div className={s.inspector}>
      {/* Tabs header */}
      <div className={s.head}>
        <div className={s.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${s.tab} ${activeTab === t.id ? s.tabOn : ''}`}
              onClick={() => dispatch({ type: 'SET_INSPECTOR_TAB', tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          className={`${s.pinBtn} ${isPinned ? s.pinned : ''}`}
          title={isPinned ? '고정 해제' : livePacket ? '현재 패킷 고정' : '패킷을 먼저 선택하세요'}
          disabled={!isPinned && !livePacket}
          onClick={() => setPinnedId(isPinned ? null : (livePacket?.id ?? null))}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M3 1h5v3l1.5 2.5H1.5L3 4V1zM5.5 6.5v3.5"/>
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className={s.body}>
        {activeTab === 'detail' && <DetailTab packet={packet} />}
        {activeTab === 'analysis' && <AnalysisTab packet={packet} />}
        {activeTab === 'graph' && <GraphTab packet={packet} />}
        {activeTab === 'notes' && <NotesTab packet={packet} />}
      </div>
    </div>
  );
}

function DetailTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const [checksums, setChecksums] = useState<ChecksumResult[]>([]);
  const { state } = useApp();
  const { settings } = state;

  useEffect(() => {
    if (!packet) { setChecksums([]); return; }
    const hex = packet.bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    api.computeAllChecksums(hex).then(setChecksums).catch(() => {});
  }, [packet?.id]);

  if (!packet) {
    return (
      <div className={s.empty}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.25">
          <rect x="4" y="8" width="28" height="20" rx="2"/>
          <path d="M4 16h28M10 22h8M10 26h16"/>
        </svg>
        <div>패킷을 선택하면 상세 정보가 표시됩니다</div>
      </div>
    );
  }

  const dir = packet.direction.toLowerCase() as 'tx' | 'rx';

  const sofBytes = state.splitter.sof;
  const eofBytes = state.splitter.eof;

  const highlights = [];
  if (sofBytes.length > 0 &&
    packet.bytes.slice(0, sofBytes.length).every((b, i) => b === sofBytes[i])) {
    highlights.push({ start: 0, end: sofBytes.length, kind: 'sync' as const });
  }
  if (eofBytes.length > 0) {
    const start = packet.bytes.length - eofBytes.length;
    if (start > 0 && packet.bytes.slice(start).every((b, i) => b === eofBytes[i])) {
      highlights.push({ start, end: packet.bytes.length, kind: 'end' as const });
    }
  }

  const csAlgo = state.splitter.checksum_algorithm;
  if (csAlgo !== 'none' && state.splitter.checksum_size > 0) {
    const csOffset = state.splitter.checksum_offset;
    const csStart = csOffset < 0
      ? packet.bytes.length + csOffset
      : csOffset;
    if (csStart >= 0 && csStart + state.splitter.checksum_size <= packet.bytes.length) {
      highlights.push({
        start: csStart,
        end: csStart + state.splitter.checksum_size,
        kind: (packet.checksum_ok === false ? 'bad' : 'chk') as 'bad' | 'chk',
      });
    }
  }

  return (
    <>
      <div className={s.packetHead}>
        <span className={`${s.dirBadge} ${s['dir-' + dir]}`}>
          {dir === 'rx' ? '← 수신' : '→ 송신'}
        </span>
        <span className={s.packetTitle}>패킷 #{packet.id}</span>
        <span className={s.ts}>+{formatTimestamp(packet.timestamp_ms)}</span>
      </div>

      <div className={s.kv}>
        <span className={s.k}>연결</span><span className={s.v}>{packet.session_id}</span>
        <span className={s.k}>간격</span>
        <span className={s.v}>{packet.gap_ms !== null ? formatDelta(packet.gap_ms) : '—'}</span>
        <span className={s.k}>길이</span>
        <span className={s.v}>{packet.bytes.length} 바이트</span>
        <span className={s.k}>체크섬</span>
        <span className={`${s.v} ${packet.checksum_ok === true ? s.ckOk : packet.checksum_ok === false ? s.ckBad : ''}`}>
          {packet.checksum_ok === true ? '✓ 유효' : packet.checksum_ok === false ? '✗ 오류' : '—'}
        </span>
      </div>

      <SectionHeading>
        {{ hex: '16진수', ascii: '아스키', dec: '10진수', bin: '2진수' }[settings.byteFormat] ?? '16진수'} 덤프
      </SectionHeading>
      <HexDump bytes={packet.bytes} highlights={highlights} format={settings.byteFormat} />

      {checksums.length > 0 && (
        <>
          <SectionHeading>체크섬 계산 결과</SectionHeading>
          <div className={s.csTable}>
            {checksums.map(ck => (
              <div key={ck.algorithm} className={s.csRow}>
                <span className={s.csAlgo}>{ck.algorithm}</span>
                <span className={s.csHex}>0x{ck.hex}</span>
                <span className={s.csDec}>{ck.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function AnalysisTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const { state } = useApp();
  if (!packet) return <div className={s.empty}>패킷을 선택하세요</div>;

  // Find nearby packets for context
  const allPackets = state.packets;
  const idx = allPackets.findIndex(p => p.id === packet.id);
  const nearby = allPackets.slice(Math.max(0, idx - 4), idx + 5);

  return (
    <>
      <SectionHeading>주변 패킷 컨텍스트</SectionHeading>
      <div className={s.ctxList}>
        {nearby.map(p => (
          <div key={p.id} className={`${s.ctxRow} ${p.id === packet.id ? s.ctxActive : ''}`}>
            <span className={`${s.ctxDir} ${p.direction === 'TX' ? s.ctxTx : s.ctxRx}`}>
              {p.direction}
            </span>
            <span className={s.ctxGap}>
              {p.gap_ms !== null ? formatDelta(p.gap_ms) : '—'}
            </span>
            <span className={s.ctxBytes}>
              {p.bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
              {p.bytes.length > 8 ? ' …' : ''}
            </span>
            <span className={s.ctxLen}>{p.bytes.length}B</span>
          </div>
        ))}
      </div>

      <SectionHeading>바이트 분포</SectionHeading>
      <ByteHistogram bytes={packet.bytes} />
    </>
  );
}

function ByteHistogram({ bytes }: { bytes: number[] }) {
  const freq = new Array(256).fill(0);
  bytes.forEach(b => freq[b]++);
  const max = Math.max(...freq, 1);

  return (
    <div className={s.histogram}>
      {freq.map((f, i) => (
        f > 0 ? (
          <div
            key={i}
            className={s.histBar}
            style={{ height: `${(f / max) * 100}%` }}
            title={`0x${i.toString(16).padStart(2, '0').toUpperCase()}: ${f}회`}
          />
        ) : null
      ))}
    </div>
  );
}

function GraphTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const { state } = useApp();
  if (!packet) return <div className={s.empty}>패킷을 선택하세요</div>;

  const allPackets = state.packets
    .filter(p => p.session_id === packet.session_id && p.gap_ms !== null)
    .slice(-50);

  if (allPackets.length === 0) return <div className={s.empty}>데이터가 충분하지 않습니다</div>;

  const gaps = allPackets.map(p => p.gap_ms!);
  const maxGap = Math.max(...gaps, 1);
  const W = 300, H = 100;
  const pts = gaps.map((g, i) => `${(i / (gaps.length - 1)) * W},${H - (g / maxGap) * (H - 10) - 5}`);
  const path = 'M' + pts.join('L');
  const fill = 'M0,' + H + ' ' + path + ' L' + W + ',' + H + 'Z';

  return (
    <>
      <SectionHeading>간격 추이 · 최근 {allPackets.length}개</SectionHeading>
      <div className={s.plot}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="gfill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="oklch(0.52 0.15 245)" stopOpacity="0.3"/>
              <stop offset="1" stopColor="oklch(0.52 0.15 245)" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={fill} fill="url(#gfill)"/>
          <path d={path} stroke="oklch(0.52 0.15 245)" strokeWidth="1.5" fill="none"/>
        </svg>
        <div className={s.plotFoot}>
          <span>이전 {allPackets.length}개</span>
          <span>간격 (ms)</span>
          <span>현재</span>
        </div>
      </div>

      <div className={s.kv} style={{ marginTop: 12 }}>
        <span className={s.k}>최소</span><span className={s.v}>{Math.min(...gaps).toFixed(1)} ms</span>
        <span className={s.k}>최대</span><span className={s.v}>{Math.max(...gaps).toFixed(1)} ms</span>
        <span className={s.k}>평균</span><span className={s.v}>{(gaps.reduce((a,b) => a+b, 0) / gaps.length).toFixed(1)} ms</span>
      </div>
    </>
  );
}

function NotesTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const { state, dispatch } = useApp();
  if (!packet) return <div className={s.empty}>패킷을 선택하세요</div>;
  const note = state.packetNotes[packet.id] ?? '';
  return (
    <>
      <SectionHeading>메모</SectionHeading>
      <textarea
        className={s.noteArea}
        value={note}
        onChange={e => dispatch({ type: 'SET_PACKET_NOTE', packetId: packet.id, note: e.target.value })}
        placeholder="이 패킷에 대한 메모를 입력하세요…"
        rows={6}
      />
      <div className={s.noteHint}>
        {note.length > 0 ? `${note.length}자 저장됨` : '패킷별 메모는 세션 동안 유지됩니다'}
      </div>
    </>
  );
}
