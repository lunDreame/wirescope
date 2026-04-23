import { useState, KeyboardEvent } from 'react';
import s from './FilterBar.module.css';
import { useApp, usePackets, useSessionPackets } from '../../app/store';
import { useT } from '../../shared/lib/i18n';

export function FilterBar() {
  const { state, dispatch } = useApp();
  const { filter } = state;
  const visible = usePackets();
  const sessionTotal = useSessionPackets();
  const t = useT();
  const [input, setInput] = useState('');

  const FILTER_ROWS = [
    { syntax: 'starts:68 01',   desc: t('filter.starts') },
    { syntax: 'contains:68 01', desc: t('filter.contains') },
    { syntax: 'checksum:fail',  desc: t('filter.csumFail') },
    { syntax: 'checksum:pass',  desc: t('filter.csumPass') },
    { syntax: 'len:12',         desc: t('filter.lenExact') },
    { syntax: 'len>8 / len<4',  desc: t('filter.lenRange') },
    { syntax: 'session:COM3',   desc: t('filter.session') },
    { syntax: '!contains:68',   desc: t('filter.negate') },
    { syntax: '68 01 00 16',    desc: t('filter.hexFree') },
  ];

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
          placeholder={tokens.length === 0 ? t('filter.placeholder') : t('filter.addMore')}
        />
        <span className={s.hintBtn}>
          ?
          <div className={s.hintPop}>
            <div className={s.hintTitle}>{t('filter.syntax')}</div>
            {FILTER_ROWS.map(r => (
              <div key={r.syntax} className={s.hintRow}>
                <code className={s.hintCode}>{r.syntax}</code>
                <span className={s.hintDesc}>{r.desc}</span>
              </div>
            ))}
            <div className={s.hintFooter}>{t('filter.footer')}</div>
          </div>
        </span>
      </div>

      {/* Direction chips */}
      <span
        className={`${s.chip} ${filter.showTx && filter.showRx ? s.chipOn : ''}`}
        onClick={() => dispatch({ type: 'SET_FILTER', filter: { showTx: true, showRx: true } })}
      >
        {t('filter.dirAll')}
      </span>
      <span
        className={`${s.chip} ${filter.errorsOnly ? s.chipOn : ''}`}
        onClick={() => dispatch({ type: 'SET_FILTER', filter: { errorsOnly: !filter.errorsOnly } })}
      >
        {t('filter.errorsOnly')}
        {filter.errorsOnly && <button className={s.chipX} onClick={e => { e.stopPropagation(); dispatch({ type: 'SET_FILTER', filter: { errorsOnly: false } }); }}>×</button>}
      </span>

      <div style={{ flex: 1 }} />

      <span className={s.count}>
        <b>{visible.length.toLocaleString()}</b>{t('filter.showing')}{sessionTotal.length.toLocaleString()}{t('filter.total')}
      </span>
    </div>
  );
}
