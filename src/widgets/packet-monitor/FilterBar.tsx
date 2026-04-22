import { useState, KeyboardEvent } from 'react';
import s from './FilterBar.module.css';
import { useApp, usePackets } from '../../app/store';

const FILTER_ROWS = [
  { syntax: 'starts:68 01',   desc: '해당 바이트로 시작하는 패킷' },
  { syntax: 'contains:68 01', desc: '해당 바이트를 포함하는 패킷' },
  { syntax: 'checksum:fail',  desc: '체크섬 실패 패킷' },
  { syntax: 'checksum:pass',  desc: '체크섬 통과 패킷' },
  { syntax: 'len:12',         desc: '길이가 정확히 N바이트' },
  { syntax: 'len>8 / len<4',  desc: 'N바이트 초과 / 미만' },
  { syntax: '!contains:68',   desc: '부정 (! 접두사)' },
  { syntax: '68 01 00 16',    desc: 'HEX 자유 검색' },
];

export function FilterBar() {
  const { state, dispatch } = useApp();
  const { filter } = state;
  const visible = usePackets();
  const [input, setInput] = useState('');

  const tokens = filter.tokens;

  function addToken() {
    const val = input.trim();
    if (!val || tokens.includes(val)) return;
    dispatch({ type: 'SET_FILTER', filter: { tokens: [...tokens, val] } });
    setInput('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') addToken();
    if (e.key === 'Backspace' && !input && tokens.length > 0) {
      dispatch({ type: 'SET_FILTER', filter: { tokens: tokens.slice(0, -1) } });
    }
  }

  function removeToken(i: number) {
    dispatch({ type: 'SET_FILTER', filter: { tokens: tokens.filter((_, idx) => idx !== i) } });
  }

  return (
    <div className={s.bar}>
      <div className={s.search}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="5.5" cy="5.5" r="3.5"/><path d="M8 8l3 3"/>
        </svg>

        {tokens.map((tok, i) => (
          <span
            key={i}
            className={`${s.token} ${tok.startsWith('!') ? s.tokenNeg : tok.startsWith('starts:') || tok.startsWith('contains:') ? s.tokenSyntax : ''}`}
          >
            {tok}
            <button className={s.tokenX} onClick={() => removeToken(i)}>×</button>
          </span>
        ))}

        <input
          className={s.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={tokens.length === 0 ? '+ 필터 추가…' : '+ 추가'}
        />
        <span className={s.hintBtn}>
          ?
          <div className={s.hintPop}>
            <div className={s.hintTitle}>필터 문법</div>
            {FILTER_ROWS.map(r => (
              <div key={r.syntax} className={s.hintRow}>
                <code className={s.hintCode}>{r.syntax}</code>
                <span className={s.hintDesc}>{r.desc}</span>
              </div>
            ))}
            <div className={s.hintFooter}>Enter로 적용 · Backspace로 마지막 토큰 삭제 · 여러 토큰은 AND 조건</div>
          </div>
        </span>
      </div>

      {/* Direction chips */}
      <span
        className={`${s.chip} ${filter.showTx && filter.showRx ? s.chipOn : ''}`}
        onClick={() => dispatch({ type: 'SET_FILTER', filter: { showTx: true, showRx: true } })}
      >
        방향: 모두
      </span>
      <span
        className={`${s.chip} ${filter.errorsOnly ? s.chipOn : ''}`}
        onClick={() => dispatch({ type: 'SET_FILTER', filter: { errorsOnly: !filter.errorsOnly } })}
      >
        오류만
        {filter.errorsOnly && <button className={s.chipX} onClick={e => { e.stopPropagation(); dispatch({ type: 'SET_FILTER', filter: { errorsOnly: false } }); }}>×</button>}
      </span>

      <div style={{ flex: 1 }} />

      <span className={s.count}>
        <b>{visible.length.toLocaleString()}</b>개 표시 / 전체 {state.packets.length.toLocaleString()}개
      </span>
    </div>
  );
}
