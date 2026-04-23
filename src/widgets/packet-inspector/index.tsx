import { useState, useEffect, useCallback } from 'react';
import s from './Inspector.module.css';
import { useApp, useSelectedPacket, useSessionPackets } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import { HexDump } from '../../shared/ui/HexDump';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { formatTimestamp, formatDelta } from '../../shared/lib/format';
import type { ChecksumResult } from '../../shared/types';
import * as api from '../../shared/api/tauri';

type TabId = 'detail' | 'analysis' | 'graph' | 'notes';

export function PacketInspector() {
  const { state, dispatch } = useApp();
  const livePacket = useSelectedPacket();
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const activeTab = state.inspectorTab as TabId;
  const t = useT();

  // Clear pin when active session changes
  useEffect(() => {
    setPinnedId(null);
  }, [state.activeSessionId]);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'detail',   label: t('inspector.detail') },
    { id: 'analysis', label: t('inspector.analysis') },
    { id: 'graph',    label: t('inspector.graph') },
    { id: 'notes',    label: t('inspector.notes') },
  ];

  const sessionPackets = useSessionPackets();
  const packet = pinnedId !== null
    ? (sessionPackets.find(p => p.id === pinnedId) ?? livePacket)
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
          title={isPinned ? t('inspector.unpin') : livePacket ? t('inspector.pin') : t('inspector.pinFirst')}
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
  const [copied, setCopied] = useState(false);
  const { state, dispatch } = useApp();
  const { settings, splitter } = state;
  const t = useT();

  const copyBytes = useCallback(() => {
    if (!packet) return;
    let text: string;
    switch (settings.byteFormat) {
      case 'ascii':
        text = packet.bytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
        break;
      case 'dec':
        text = packet.bytes.map(b => b.toString(10)).join(' ');
        break;
      case 'bin':
        text = packet.bytes.map(b => b.toString(2).padStart(8, '0')).join(' ');
        break;
      default: // hex
        text = packet.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [packet, settings.byteFormat]);

  const isChecksumConfigured = !!(splitter.checksum_algorithm && splitter.checksum_algorithm !== '' && splitter.checksum_algorithm !== 'none');

  useEffect(() => {
    if (!packet || !isChecksumConfigured) { setChecksums([]); return; }

    // Determine the byte range for checksum reference computation:
    // - Start after SOF if checksumExcludeSof is enabled
    // - End before the checksum field
    const csOffset = splitter.checksum_offset;
    const csStart = csOffset < 0 ? packet.bytes.length + csOffset : csOffset;
    const excludeStart = splitter.checksum_exclude_sof && splitter.sof.length > 0 ? splitter.sof.length : 0;
    const bytesToHash = (csStart > excludeStart && csStart <= packet.bytes.length)
      ? packet.bytes.slice(excludeStart, csStart)
      : packet.bytes;

    const hex = bytesToHash.map(b => b.toString(16).padStart(2, '0')).join('');
    api.computeAllChecksums(hex).then(setChecksums).catch(() => {});
  }, [packet?.id, isChecksumConfigured, splitter.checksum_offset, splitter.checksum_size,
      splitter.checksum_exclude_sof, splitter.sof.length]);

  if (!packet) {
    return (
      <div className={s.empty}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.25">
          <rect x="4" y="8" width="28" height="20" rx="2"/>
          <path d="M4 16h28M10 22h8M10 26h16"/>
        </svg>
        <div>{t('inspector.emptyHint')}</div>
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
  if (csAlgo && csAlgo !== 'none' && state.splitter.checksum_size > 0) {
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
          {dir === 'rx' ? t('inspector.rx') : t('inspector.tx')}
        </span>
        <span className={s.packetTitle}>{t('inspector.packet')} #{packet.id}</span>
        <span className={s.ts}>+{formatTimestamp(packet.timestamp_ms)}</span>
      </div>

      <div className={s.kv}>
        <span className={s.k}>{t('inspector.session')}</span><span className={s.v}>{packet.session_id}</span>
        <span className={s.k}>{t('inspector.gap')}</span>
        <span className={s.v}>{packet.gap_ms !== null ? formatDelta(packet.gap_ms) : '—'}</span>
        <span className={s.k}>{t('inspector.length')}</span>
        <span className={s.v}>{packet.bytes.length} {t('inspector.bytes')}</span>
        <span className={s.k}>{t('inspector.checksum')}</span>
        <span className={`${s.v} ${packet.checksum_ok === true ? s.ckOk : packet.checksum_ok === false ? s.ckBad : ''}`}>
          {packet.checksum_ok === true ? t('inspector.csumOk') : packet.checksum_ok === false ? t('inspector.csumErr') : '—'}
        </span>
      </div>

      <div className={s.dumpHead}>
        <SectionHeading>
          { { hex: t('inspector.hex'), ascii: t('inspector.ascii'), dec: t('inspector.dec'), bin: t('inspector.bin') }[settings.byteFormat] ?? t('inspector.hex') }{t('inspector.dump')}
        </SectionHeading>
        <button className={`${s.copyBtn} ${copied ? s.copyBtnOk : ''}`} onClick={copyBytes} title={t('inspector.copyDump')}>
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 5l2.5 2.5L8 2.5"/>
              </svg>
              {t('inspector.copied')}
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="3.5" y="1" width="5.5" height="7" rx="1"/>
                <path d="M1 3v6a1 1 0 001 1h4.5"/>
              </svg>
              {t('inspector.copyDump')}
            </>
          )}
        </button>
      </div>
      <HexDump bytes={packet.bytes} highlights={highlights} format={settings.byteFormat} />

      <SectionHeading>{t('inspector.csumResults')}</SectionHeading>
      {isChecksumConfigured ? (
        checksums.length > 0 && (
          <>
            <div className={s.csHint}>
              {splitter.checksum_exclude_sof && splitter.sof.length > 0
                ? t('inspector.csumHint')
                : t('inspector.csumHintFull')}
            </div>
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
        )
      ) : (
        <div className={s.csNotConfigured}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5">
            <circle cx="6.5" cy="6.5" r="5"/><path d="M6.5 4v3M6.5 8.5v.5"/>
          </svg>
          <span>{t('inspector.csumNotConfigured')}</span>
          <button
            className={s.csGoSplitter}
            onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'splitter' })}
          >
            {t('inspector.csumGoSplitter')} →
          </button>
        </div>
      )}
    </>
  );
}

function AnalysisTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const t = useT();
  const sessionPackets = useSessionPackets();
  if (!packet) return <div className={s.empty}>{t('inspector.selectPacket')}</div>;

  // Find nearby packets for context
  const allPackets = sessionPackets;
  const idx = allPackets.findIndex(p => p.id === packet.id);
  const nearby = allPackets.slice(Math.max(0, idx - 4), idx + 5);

  return (
    <>
      <SectionHeading>{t('inspector.context')}</SectionHeading>
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
              {p.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
            </span>
            <span className={s.ctxLen}>{p.bytes.length}B</span>
          </div>
        ))}
      </div>

      <SectionHeading>{t('inspector.byteDist')}</SectionHeading>
      <ByteHistogram bytes={packet.bytes} />
    </>
  );
}

function ByteHistogram({ bytes }: { bytes: number[] }) {
  const t = useT();
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
            title={`0x${i.toString(16).padStart(2, '0').toUpperCase()}: ${f}${t('inspector.freqTimes')}`}
          />
        ) : null
      ))}
    </div>
  );
}

function GraphTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const t = useT();
  const sessionPackets = useSessionPackets();
  if (!packet) return <div className={s.empty}>{t('inspector.selectPacket')}</div>;

  const allPackets = sessionPackets
    .filter(p => p.gap_ms !== null)
    .slice(-50);

  if (allPackets.length < 2) return <div className={s.empty}>{t('inspector.notEnoughData')}</div>;

  const gaps = allPackets.map(p => p.gap_ms!);
  const maxGap = Math.max(...gaps, 1);
  const W = 300, H = 100;
  const pts = gaps.map((g, i) => `${(i / (gaps.length - 1)) * W},${H - (g / maxGap) * (H - 10) - 5}`);
  const path = 'M' + pts.join('L');
  const fill = 'M0,' + H + ' ' + path + ' L' + W + ',' + H + 'Z';

  return (
    <>
      <SectionHeading>{t('inspector.gapTrend')}{allPackets.length}</SectionHeading>
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
          <span>{t('inspector.prev')}{allPackets.length}</span>
          <span>{t('inspector.gapMs')}</span>
          <span>{t('inspector.current')}</span>
        </div>
      </div>

      <div className={s.kv} style={{ marginTop: 12 }}>
        <span className={s.k}>{t('inspector.min')}</span><span className={s.v}>{Math.min(...gaps).toFixed(1)} ms</span>
        <span className={s.k}>{t('inspector.max')}</span><span className={s.v}>{Math.max(...gaps).toFixed(1)} ms</span>
        <span className={s.k}>{t('inspector.avg')}</span><span className={s.v}>{(gaps.reduce((a,b) => a+b, 0) / gaps.length).toFixed(1)} ms</span>
      </div>
    </>
  );
}

function NotesTab({ packet }: { packet: ReturnType<typeof useSelectedPacket> }) {
  const { state, dispatch } = useApp();
  const t = useT();
  if (!packet) return <div className={s.empty}>{t('inspector.selectPacket')}</div>;
  // Use session-qualified key to avoid collisions between sessions
  const noteKey = `${packet.session_id}:${packet.id}`;
  const note = state.packetNotes[noteKey] ?? '';
  return (
    <>
      <SectionHeading>{t('inspector.notesTitle')}</SectionHeading>
      <textarea
        className={s.noteArea}
        value={note}
        onChange={e => dispatch({ type: 'SET_PACKET_NOTE', packetKey: noteKey, note: e.target.value })}
        placeholder={t('inspector.notesPlaceholder')}
        rows={6}
      />
      <div className={s.noteHint}>
        {note.length > 0 ? `${note.length}${t('inspector.notesSaved')}` : t('inspector.notesHint')}
      </div>
    </>
  );
}
