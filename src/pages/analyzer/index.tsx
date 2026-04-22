import { useMemo } from 'react';
import s from './Analyzer.module.css';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { useApp } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import { formatSize, formatDelta } from '../../shared/lib/format';
import type { TimingStats } from '../../shared/types';

function StatCard({ label, value, unit, sub }: { label: string; value: string | number; unit?: string; sub?: string }) {
  return (
    <div className={s.statCard}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

export function AnalyzerPage() {
  const { state } = useApp();
  const t = useT();
  const packets = state.packets;

  const stats: TimingStats | null = useMemo(() => {
    if (packets.length < 2) return null;
    const gaps = packets.map(p => p.gap_ms ?? 0).filter(g => g > 0);
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const minGap = gaps.length ? Math.min(...gaps) : 0;
    const maxGap = gaps.length ? Math.max(...gaps) : 0;
    const variance = gaps.length
      ? gaps.reduce((a, g) => a + (g - avgGap) ** 2, 0) / gaps.length
      : 0;
    const stdGap = Math.sqrt(variance);
    const totalBytes = packets.reduce((a, p) => a + p.bytes.length, 0);
    const timespan = packets[packets.length - 1].timestamp_ms - packets[0].timestamp_ms;
    const pps = timespan > 0 ? (packets.length / timespan) * 1000 : 0;

    // cycle detection: consecutive TX->RX pairs
    let cycles = 0, cycleMs = 0;
    for (let i = 0; i < packets.length - 1; i++) {
      if (packets[i].direction === 'TX' && packets[i + 1].direction === 'RX') {
        cycles++;
        cycleMs += packets[i + 1].gap_ms ?? 0;
      }
    }
    const avgCycleMs = cycles > 0 ? cycleMs / cycles : 0;

    // idle detection: gaps > 3× avg
    const idleThreshold = avgGap * 3;
    const idleGaps = gaps.filter(g => g > idleThreshold);
    const avgIdleMs = idleGaps.length ? idleGaps.reduce((a, b) => a + b, 0) / idleGaps.length : 0;

    const csPass = packets.filter(p => p.checksum_ok === true).length;
    const csFail = packets.filter(p => p.checksum_ok === false).length;

    return {
      total_packets: packets.length,
      total_bytes: totalBytes,
      avg_gap_ms: avgGap,
      min_gap_ms: minGap,
      max_gap_ms: maxGap,
      std_gap_ms: stdGap,
      cycle_count: cycles,
      avg_cycle_ms: avgCycleMs,
      avg_idle_ms: avgIdleMs,
      checksum_pass: csPass,
      checksum_fail: csFail,
      packets_per_sec: pps,
    };
  }, [packets]);

  // Byte frequency for all packets
  const byteFreq = useMemo(() => {
    const freq = new Array(256).fill(0);
    for (const pkt of packets) for (const b of pkt.bytes) freq[b]++;
    return freq;
  }, [packets]);

  const maxFreq = Math.max(...byteFreq, 1);

  // Gap trend (last 60 packets)
  const gapTrend = useMemo(() =>
    packets.slice(-60).map(p => p.gap_ms ?? 0),
  [packets]);

  // Direction distribution
  const txCount = packets.filter(p => p.direction === 'TX').length;
  const rxCount = packets.filter(p => p.direction === 'RX').length;
  const total = packets.length || 1;

  // Top bytes
  const topBytes = useMemo(() =>
    byteFreq
      .map((count, byte) => ({ byte, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 16),
  [byteFreq]);

  return (
    <div className={s.page}>
      <div className={s.body}>
        {/* Left: Stats */}
        <div className={s.statsPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>{t('analyzer.title')}</h2>
            <p className={s.panelSub}>{packets.length.toLocaleString()} pkts · {formatSize(state.bufferBytes)}</p>
          </div>

          {packets.length < 2 ? (
            <div className={s.emptyStats}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M6 32 L12 22 L18 26 L24 16 L30 20 L36 10"/>
              </svg>
              <span>{t('analyzer.needMore')}</span>
            </div>
          ) : stats ? (
            <>
              <div className={s.section}>
                <SectionHeading>{t('analyzer.traffic')}</SectionHeading>
                <div className={s.statsGrid}>
                  <StatCard label={t('analyzer.totalPackets')} value={stats.total_packets} />
                  <StatCard label={t('analyzer.totalBytes')} value={formatSize(stats.total_bytes)} />
                  <StatCard label={t('analyzer.pps')} value={stats.packets_per_sec.toFixed(1)} unit="pps" />
                  <StatCard label={t('analyzer.csumErrors')} value={stats.checksum_fail}
                    sub={stats.checksum_fail > 0 ? `${((stats.checksum_fail / total) * 100).toFixed(1)}%` : t('analyzer.noErrors')} />
                </div>
              </div>

              <div className={s.section}>
                <SectionHeading>{t('analyzer.timing')}</SectionHeading>
                <div className={s.statsGrid}>
                  <StatCard label={t('analyzer.avgGap')} value={formatDelta(stats.avg_gap_ms)} />
                  <StatCard label={t('analyzer.minGap')} value={formatDelta(stats.min_gap_ms)} />
                  <StatCard label={t('analyzer.maxGap')} value={formatDelta(stats.max_gap_ms)} />
                  <StatCard label={t('analyzer.stdDev')} value={formatDelta(stats.std_gap_ms)} />
                </div>
              </div>

              {stats.cycle_count > 0 && (
                <div className={s.section}>
                  <SectionHeading>{t('analyzer.cycle')}</SectionHeading>
                  <div className={s.statsGrid}>
                    <StatCard label={t('analyzer.cycleCount')} value={stats.cycle_count} />
                    <StatCard label={t('analyzer.avgResponse')} value={formatDelta(stats.avg_cycle_ms)} />
                    {stats.avg_idle_ms > 0 && (
                      <StatCard label={t('analyzer.avgIdle')} value={formatDelta(stats.avg_idle_ms)} />
                    )}
                  </div>
                </div>
              )}

              <div className={s.section}>
                <SectionHeading>{t('analyzer.direction')}</SectionHeading>
                <div className={s.dirBar}>
                  <div className={s.dirBarTx} style={{ width: `${(txCount / total) * 100}%` }} />
                  <div className={s.dirBarRx} style={{ width: `${(rxCount / total) * 100}%` }} />
                </div>
                <div className={s.dirLegend}>
                  <span className={s.dirTx}>TX {txCount}</span>
                  <span className={s.dirRx}>RX {rxCount}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Center: Graphs */}
        <div className={s.graphPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>{t('analyzer.gapGraph')}</h2>
            <p className={s.panelSub}>{t('analyzer.gapGraphSub')}</p>
          </div>

          {gapTrend.length < 2 ? (
            <div className={s.emptyGraph}>
              {t('analyzer.notEnoughData')}
            </div>
          ) : (
            <GapTrendChart gaps={gapTrend} />
          )}

          <div className={s.panelHeader} style={{ marginTop: 24 }}>
            <h2 className={s.panelTitle}>{t('analyzer.byteFreq')}</h2>
            <p className={s.panelSub}>{t('analyzer.byteFreqSub')}</p>
          </div>

          <ByteFreqChart freq={byteFreq} maxFreq={maxFreq} sofBytes={state.splitter.sof} />
        </div>

        {/* Right: Top bytes */}
        <div className={s.topPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>{t('analyzer.topBytes')}</h2>
            <p className={s.panelSub}>{t('analyzer.topBytesSub')}</p>
          </div>

          {topBytes[0]?.count === 0 ? (
            <div className={s.emptyStats}>{t('analyzer.noPackets')}</div>
          ) : (
            <div className={s.topList}>
              {topBytes.map(({ byte, count }, i) => (
                <div key={byte} className={s.topItem}>
                  <span className={s.topRank}>#{i + 1}</span>
                  <code className={s.topByte}>0x{byte.toString(16).padStart(2, '0').toUpperCase()}</code>
                  <div className={s.topBar}>
                    <div className={s.topBarFill} style={{ width: `${(count / topBytes[0].count) * 100}%` }} />
                  </div>
                  <span className={s.topCount}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {stats && stats.checksum_fail > 0 && (
            <div className={s.warningBox}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M7 2L12.5 12H1.5L7 2z"/>
                <path d="M7 6v3M7 10.5v.5"/>
              </svg>
              <span>{t('analyzer.errorsDetected')}{stats.checksum_fail}{t('analyzer.errorsDetected2')}</span>
            </div>
          )}
        </div>
      </div>

      <StatusBar
        left={
          <>
            <StatusChip dot={packets.length > 0 ? 'var(--brand)' : 'var(--ink-dim)'}>
              {packets.length > 0 ? `${packets.length.toLocaleString()}${t('analyzer.packetsAnalyzed')}` : t('analyzer.noPackets')}
            </StatusChip>
            {stats && (
              <>
                <StatusSep />
                <span>{t('analyzer.avgGap')} {formatDelta(stats.avg_gap_ms)} · {stats.packets_per_sec.toFixed(1)} pps</span>
              </>
            )}
          </>
        }
        right={<span>{t('analyzer.statusRight')}</span>}
      />
    </div>
  );
}

function GapTrendChart({ gaps }: { gaps: number[] }) {
  const max = Math.max(...gaps, 1);
  const w = 560, h = 140, pad = 24;
  const step = (w - pad * 2) / (gaps.length - 1);

  const points = gaps.map((g, i) => ({
    x: pad + i * step,
    y: h - pad - ((g / max) * (h - pad * 2)),
  }));

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const area = path + ` L ${points[points.length - 1].x} ${h - pad} L ${pad} ${h - pad} Z`;

  return (
    <div className={s.chartWrap}>
      <svg viewBox={`0 0 ${w} ${h}`} className={s.chart} preserveAspectRatio="none">
        <defs>
          <linearGradient id="gapGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#gapGrad)" />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--brand)" opacity="0.7" />
        ))}
      </svg>
      <div className={s.chartYMax}>{formatDelta(max)}</div>
      <div className={s.chartYMin}>0</div>
    </div>
  );
}

function ByteFreqChart({ freq, maxFreq, sofBytes }: { freq: number[]; maxFreq: number; sofBytes: number[] }) {
  const w = 560, h = 80, barW = w / 256;

  return (
    <div className={s.chartWrap}>
      <svg viewBox={`0 0 ${w} ${h}`} className={s.chartFreq}>
        {freq.map((count, byte) => {
          const barH = count > 0 ? Math.max(1, (count / maxFreq) * h) : 0;
          const isSof = sofBytes.includes(byte);
          return (
            <rect
              key={byte}
              x={byte * barW}
              y={h - barH}
              width={Math.max(barW - 0.5, 0.5)}
              height={barH}
              fill={isSof ? 'var(--brand)' : 'var(--ink-dim)'}
              opacity={count > 0 ? 0.8 : 0}
            />
          );
        })}
      </svg>
      <div className={s.chartFreqLabels}>
        <span>0x00</span>
        <span>0x40</span>
        <span>0x80</span>
        <span>0xC0</span>
        <span>0xFF</span>
      </div>
    </div>
  );
}
