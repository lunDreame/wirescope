import { useState } from 'react';
import s from './Toolbar.module.css';
import { useApp } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import { useUpdate } from '../../shared/lib/update-context';
import type { ByteFormat } from '../../shared/types';
import { SettingsPanel } from '../../features/configure-splitter/SettingsPanel';

interface Props {
  isReceiving: boolean;
  onToggleReceive: () => void;
  onClear: () => void;
  onExport: () => void;
  connected: boolean;
  hasPackets: boolean;
}

export function MainToolbar({ isReceiving, onToggleReceive, onClear, onExport, connected, hasPackets }: Props) {
  const { state, dispatch } = useApp();
  const { settings, filter } = state;
  const t = useT();
  const { pendingUpdate } = useUpdate();
  const [showSettings, setShowSettings] = useState(false);

  const fmtOptions: { value: ByteFormat; label: string }[] = [
    { value: 'hex',   label: 'HEX' },
    { value: 'ascii', label: 'ASCII' },
    { value: 'dec',   label: 'DEC' },
    { value: 'bin',   label: 'BIN' },
  ];

  return (
    <div className={s.toolbar}>
      {/* Receive toggle */}
      <button
        className={`${s.tg} ${isReceiving && connected ? s.primary : ''}`}
        onClick={onToggleReceive}
        disabled={!connected}
        title={!connected ? t('toolbar.noSession') : undefined}
      >
        {isReceiving && connected ? (
          <>
            <span className={s.pulse} />
            {t('toolbar.receiving')}
            <kbd className={s.kbd}>⌘R</kbd>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 3l6 3-6 3V3z"/>
            </svg>
            {t('toolbar.start')}
          </>
        )}
      </button>

      {isReceiving && connected && (
        <button className={s.tg} onClick={onToggleReceive}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="2" width="3" height="8"/><rect x="7" y="2" width="3" height="8"/>
          </svg>
          {t('toolbar.pause')}
        </button>
      )}

      <div className={s.sep} />

      {/* Direction filter */}
      <div className={s.group}>
        <button
          className={filter.showRx ? s.on : ''}
          onClick={() => dispatch({ type: 'SET_FILTER', filter: { showRx: !filter.showRx } })}
        >
          <span className={s.dotRx} /> RX
        </button>
        <button
          className={filter.showTx ? s.on : ''}
          onClick={() => dispatch({ type: 'SET_FILTER', filter: { showTx: !filter.showTx } })}
        >
          <span className={s.dotTx} /> TX
        </button>
        <button
          className={filter.errorsOnly ? s.on : ''}
          onClick={() => dispatch({ type: 'SET_FILTER', filter: { errorsOnly: !filter.errorsOnly } })}
        >
          {t('toolbar.errorsOnly')}
        </button>
      </div>

      {/* Byte format */}
      <div className={s.group} style={{ marginLeft: 4 }}>
        {fmtOptions.map(o => (
          <button
            key={o.value}
            className={settings.byteFormat === o.value ? s.on : ''}
            onClick={() => dispatch({ type: 'SET_SETTINGS', settings: { byteFormat: o.value } })}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className={s.sep} />

      {/* Splitter shortcut */}
      <button className={s.tg} onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'splitter' })}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 2h4v4H2zM6 6h4v4H6z"/>
        </svg>
        {t('toolbar.splitter')}
        {(() => {
          const { method, sof, eof } = state.splitter;
          if (method === 'delimiter') {
            if (sof.length === 0 && eof.length === 0) return null;
            const sofStr = sof.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
            const eofStr = eof.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
            return <span className={s.hint}>{sofStr || '?'} / {eofStr || '?'}</span>;
          }
          return <span className={s.hint}>{method}</span>;
        })()}
      </button>

      {/* Analyzer shortcut */}
      <button className={s.tg} onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'analyzer' })}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 12L6 5l3 4 3-8"/>
        </svg>
        {t('toolbar.analyzer')}
      </button>

      <div style={{ flex: 1 }} />

      {/* Right side */}
      <button className={s.tg} onClick={onClear}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3h8M4 3V2h4v1M5 5v4M7 5v4M3 3l.5 7h5l.5-7"/>
        </svg>
        {t('toolbar.clear')}
      </button>
      <button className={s.tg} onClick={onExport} disabled={!hasPackets} title={!hasPackets ? t('toolbar.noPacketsToExport') : undefined}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 2v6M3 6l3 3 3-3M2 10h8"/>
        </svg>
        {t('toolbar.export')}
      </button>
      <button
        className={`${s.tg} ${showSettings ? s.on : ''}`}
        onMouseDown={e => e.stopPropagation()}
        onClick={() => setShowSettings(v => !v)}
        style={{ position: 'relative' }}
      >
        {t('toolbar.settings')}
        {pendingUpdate && !showSettings && (
          <span className={s.updateDot} title={`v${pendingUpdate.version} 업데이트 가능`} />
        )}
      </button>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
