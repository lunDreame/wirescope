import { useRef, useEffect } from 'react';
import s from './StreamStrip.module.css';
import { useApp } from '../../app/store';

export function StreamStrip() {
  const { state } = useApp();
  const { packets, splitter } = state;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const recent = packets.slice(-300);
  const totalPps = packets.length > 1
    ? Math.round(packets.length / ((packets[packets.length - 1].timestamp_ms - packets[0].timestamp_ms) / 1000) || 0)
    : 0;

  const avgGap = packets.filter(p => p.gap_ms).reduce((a, p) => a + (p.gap_ms ?? 0), 0) / (packets.filter(p => p.gap_ms).length || 1);

  const sofHex = splitter.sof.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const eofHex = splitter.eof.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const MAX_H = H - 4;
    const maxLen = Math.max(...recent.map(p => p.bytes.length), 1);
    const colW = Math.max(2, Math.floor(W / Math.max(recent.length, 1)));

    recent.forEach((pkt, i) => {
      const h = Math.max(3, (pkt.bytes.length / maxLen) * MAX_H);
      const x = i * colW;
      const y = H - h - 2;

      const isDark = document.body.classList.contains('theme-dark');

      if (pkt.direction === 'TX') {
        ctx.fillStyle = isDark ? 'oklch(0.72 0.15 150)' : 'oklch(0.56 0.14 150)';
      } else {
        ctx.fillStyle = isDark ? 'oklch(0.74 0.13 75)' : 'oklch(0.58 0.14 75)';
      }

      if (pkt.checksum_ok === false) {
        ctx.fillStyle = 'oklch(0.55 0.18 25)';
      }

      ctx.globalAlpha = 0.5 + (i / recent.length) * 0.5;
      ctx.fillRect(x, y, Math.max(colW - 1, 1), h);
    });

    ctx.globalAlpha = 1;
  }, [recent]);

  return (
    <div className={s.strip}>
      <div className={s.head}>
        <span>원시 바이트 스트림 · 최근 {recent.length}개 패킷</span>
        {totalPps > 0 && <span className={s.stat}>· <b>{totalPps}</b> 패킷/초</span>}
        {avgGap > 0 && <span className={s.stat}>· 평균 간격 <b>{avgGap.toFixed(0)} ms</b></span>}
        <span style={{ flex: 1 }} />
        {(sofHex || eofHex) && (
          <span className={s.rule}>
            시작 <span className={s.syncHex}>{sofHex}</span>
            {eofHex && <> → 끝 <span className={s.syncHex}>{eofHex}</span></>}
            {splitter.checksum_algorithm && splitter.checksum_algorithm !== 'none' && ` · ${splitter.checksum_algorithm}`}
          </span>
        )}
      </div>
      <div className={s.canvasWrap}>
        <canvas
          ref={canvasRef}
          className={s.canvas}
          width={1100}
          height={60}
        />
      </div>
    </div>
  );
}
