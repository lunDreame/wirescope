import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import s from './Dock.module.css';
import { useApp } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import * as api from '../../shared/api/tauri';
import type { TxPreset, TimedMacro, DockTab } from '../../shared/types';

const MACRO_KEYS = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];

function asciiToHex(text: string): string {
  const bytes: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const esc = text[i + 1];
      if      (esc === 'r')                        { bytes.push('0d'); i += 2; }
      else if (esc === 'n')                        { bytes.push('0a'); i += 2; }
      else if (esc === 't')                        { bytes.push('09'); i += 2; }
      else if (esc === '0')                        { bytes.push('00'); i += 2; }
      else if (esc === 'x' && i + 3 < text.length) {
        bytes.push(text.slice(i + 2, i + 4).toLowerCase()); i += 4;
      }
      else { bytes.push(text.charCodeAt(i).toString(16).padStart(2, '0')); i++; }
    } else {
      bytes.push(text.charCodeAt(i).toString(16).padStart(2, '0')); i++;
    }
  }
  return bytes.join(' ');
}

function toHex(value: string, fmt: 'hex' | 'ascii'): string {
  return fmt === 'ascii' ? asciiToHex(value) : value;
}

export function TransmitDock() {
  const { state, dispatch } = useApp();
  const t = useT();
  const [tab, setTab] = useState<DockTab>('transmit');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [quickHex, setQuickHex] = useState('');
  const [quickFmt, setQuickFmt] = useState<'hex' | 'ascii'>('hex');
  const [quickError, setQuickError] = useState('');
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPresetNameError, setNewPresetNameError] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetBytes, setNewPresetBytes] = useState('');
  const [newPresetMode, setNewPresetMode] = useState<TxPreset['mode']>('single');
  const [newPresetInterval, setNewPresetInterval] = useState(500);
  const [newPresetCount, setNewPresetCount] = useState(0);
  const [newPresetFmt, setNewPresetFmt] = useState<'hex' | 'ascii'>('hex');

  // Only the active session's connection state matters for sending
  const connected = state.sessions.find(s => s.id === state.activeSessionId)?.connected ?? false;
  const activeId = state.activeSessionId;

  // Repeat preset timers: presetId → intervalId
  const repeatTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  // Keep a ref to txPresets for use inside timer callbacks (avoids stale closures)
  const txPresetsRef = useRef(state.txPresets);
  useEffect(() => { txPresetsRef.current = state.txPresets; }, [state.txPresets]);

  // Stop all repeat timers when disconnected or unmounted
  useEffect(() => {
    if (!connected) stopAllRepeat();
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopAllRepeat(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAllRepeat() {
    Object.entries(repeatTimers.current).forEach(([id, timer]) => {
      clearInterval(timer);
      const preset = txPresetsRef.current.find(p => p.id === id);
      if (preset) dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } });
    });
    repeatTimers.current = {};
  }

  function stopRepeat(presetId: string) {
    if (repeatTimers.current[presetId]) {
      clearInterval(repeatTimers.current[presetId]);
      delete repeatTimers.current[presetId];
    }
  }

  async function sendQuick() {
    if (!quickHex.trim() || !activeId) return;
    setQuickError('');
    const hex = toHex(quickHex, quickFmt);
    try {
      await api.sendBytes(hex, activeId);
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `TX: ${quickHex.trim()}`, kind: 'tx', session_id: activeId ?? undefined } });
      setQuickHex('');
    } catch (e: any) {
      setQuickError(String(e));
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `Error: ${e}`, kind: 'err', session_id: activeId ?? undefined } });
    }
  }

  async function runPreset(preset: TxPreset) {
    if (!activeId) return;

    if (preset.mode === 'repeat') {
      // Toggle: if already running, stop it
      if (repeatTimers.current[preset.id]) {
        stopRepeat(preset.id);
        dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } });
        return;
      }
      // Start repeat timer
      dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: true } });
      const hex = toHex(preset.bytes, preset.inputFmt ?? 'hex');
      const intervalMs = Math.max(preset.interval_ms ?? 1000, 10);
      const maxCount = preset.count ?? 0;
      let count = 0;
      const sendOnce = async () => {
        if (!activeId) { stopRepeat(preset.id); dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } }); return; }
        if (maxCount > 0 && count >= maxCount) {
          stopRepeat(preset.id);
          dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } });
          return;
        }
        try {
          await api.sendBytes(hex, activeId);
          dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `TX [${preset.name}] ×${count + 1}: ${preset.bytes}`, kind: 'tx', session_id: activeId } });
        } catch (e: any) {
          // Session likely gone — stop the repeat automatically
          stopRepeat(preset.id);
          dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } });
          dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `Repeat stopped [${preset.name}]: ${e}`, kind: 'err', session_id: activeId } });
          return;
        }
        count++;
      };
      // Send first immediately then repeat
      sendOnce();
      repeatTimers.current[preset.id] = setInterval(sendOnce, intervalMs);
      return;
    }

    // single / trigger: send once
    dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: true } });
    const hex = toHex(preset.bytes, preset.inputFmt ?? 'hex');
    try {
      await api.sendBytes(hex, activeId);
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `TX [${preset.name}]: ${preset.bytes}`, kind: 'tx', session_id: activeId ?? undefined } });
    } catch (e: any) {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `${t('dock.presetError')} [${preset.name}]: ${e}`, kind: 'err', session_id: activeId ?? undefined } });
    }
    dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } });
  }

  function addPreset() {
    if (!newPresetName.trim()) { setNewPresetNameError(true); return; }
    if (!newPresetBytes.trim()) return;
    setNewPresetNameError(false);
    const preset: TxPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      bytes: newPresetBytes.trim(),
      inputFmt: newPresetFmt,
      mode: newPresetMode,
      interval_ms: newPresetMode === 'repeat' ? newPresetInterval : undefined,
      count: newPresetMode === 'repeat' && newPresetCount > 0 ? newPresetCount : undefined,
      active: false,
    };
    dispatch({ type: 'ADD_TX_PRESET', preset });
    setNewPresetName(''); setNewPresetBytes(''); setNewPresetMode('single'); setNewPresetFmt('hex'); setNewPresetCount(0); setNewPresetNameError(false);
    setAddingPreset(false);
  }

  const preset = selectedPreset ? state.txPresets.find(p => p.id === selectedPreset) : null;

  const DOCK_TABS: { id: DockTab; label: string }[] = [
    { id: 'transmit', label: t('dock.transmit') },
    { id: 'script',   label: t('dock.script') },
    { id: 'console',  label: t('dock.console') },
    { id: 'macro',    label: t('dock.macro') },
    { id: 'timer',    label: t('dock.timer') },
  ];

  return (
    <div className={s.dock}>
      <div className={s.head}>
        <div className={s.tabs}>
          {DOCK_TABS.map(dt => (
            <button
              key={dt.id}
              className={`${s.tab} ${tab === dt.id ? s.tabOn : ''}`}
              onClick={() => setTab(dt.id)}
            >
              {dt.label}
              {dt.id === 'transmit' && <span className={s.tabNum}>{state.txPresets.length}</span>}
              {dt.id === 'console' && (() => {
                const n = state.consoleLog.filter(e => !e.session_id || e.session_id === state.activeSessionId).length;
                return n > 0 ? <span className={s.tabNum}>{Math.min(n, 99)}</span> : null;
              })()}
            </button>
          ))}
        </div>
        <div className={s.dockActions}>
          <button
            className={s.iconBtn}
            title={t('dock.close')}
            onClick={() => dispatch({ type: 'SET_DOCK_OPEN', open: false })}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M1 5h9"/>
            </svg>
          </button>
        </div>
      </div>

      <div className={s.body}>
        {tab === 'transmit' && (
          <div className={s.txLayout}>
            <div className={s.txList}>
              {state.txPresets.map(p => (
                <div
                  key={p.id}
                  className={`${s.txItem} ${selectedPreset === p.id ? s.txItemOn : ''}`}
                  onClick={() => setSelectedPreset(p.id === selectedPreset ? null : p.id)}
                >
                  <button
                    className={`${s.runBtn} ${p.active ? s.runBtnActive : ''}`}
                    onClick={e => { e.stopPropagation(); runPreset(p); }}
                    disabled={!connected && !p.active}
                    title={p.active && p.mode === 'repeat' ? t('dock.stop') : t('dock.send')}
                  >{p.active && p.mode === 'repeat' ? '■' : '▶'}</button>
                  <div className={s.txInfo}>
                    <div className={s.txName}>{p.name}</div>
                    <div className={s.txSub}>{p.bytes}</div>
                  </div>
                  <div className={s.txRight}>
                    <span className={s.txMode}>
                      {p.mode === 'repeat'  ? `${p.interval_ms}ms` :
                       p.mode === 'trigger' ? t('dock.trigger') : t('dock.single')}
                    </span>
                    <button
                      className={s.removeBtn}
                      onClick={e => {
                        e.stopPropagation();
                        dispatch({ type: 'REMOVE_TX_PRESET', id: p.id });
                        if (selectedPreset === p.id) setSelectedPreset(null);
                      }}
                      title={t('dock.delete')}
                    >×</button>
                  </div>
                </div>
              ))}

              {addingPreset ? (
                <div className={s.addPresetForm}>
                  <input className={s.addInp} value={newPresetName}
                    onChange={e => { setNewPresetName(e.target.value); if (e.target.value.trim()) setNewPresetNameError(false); }}
                    placeholder={t('dock.presetName')} autoFocus
                    style={newPresetNameError ? { borderColor: 'var(--err, red)' } : undefined} />
                  <input className={s.addInp} value={newPresetBytes}
                    onChange={e => setNewPresetBytes(e.target.value)}
                    placeholder={newPresetFmt === 'ascii' ? t('dock.asciiPlaceholder') : t('dock.presetBytes')} spellCheck={false} />
                  <div className={s.addRow}>
                    <div className={s.fmtToggle}>
                      <button className={`${s.fmtBtn} ${newPresetFmt === 'hex' ? s.fmtBtnOn : ''}`} onClick={() => setNewPresetFmt('hex')}>HEX</button>
                      <button className={`${s.fmtBtn} ${newPresetFmt === 'ascii' ? s.fmtBtnOn : ''}`} onClick={() => setNewPresetFmt('ascii')}>ASCII</button>
                    </div>
                  </div>
                  <div className={s.addRow}>
                    <select className={s.addSel} value={newPresetMode}
                      onChange={e => setNewPresetMode(e.target.value as TxPreset['mode'])}>
                      <option value="single">{t('dock.single')}</option>
                      <option value="repeat">{t('dock.repeat')}</option>
                      <option value="trigger">{t('dock.trigger')}</option>
                    </select>
                    {newPresetMode === 'repeat' && (
                      <>
                        <input className={s.addInpSm} type="text" inputMode="numeric" value={newPresetInterval}
                          onChange={e => { const v = e.target.value.replace(/\D/g, ''); setNewPresetInterval(v === '' ? 1 : parseInt(v, 10)); }}
                          onFocus={e => e.target.select()} />
                        <span className={s.unit}>ms</span>
                        <input className={s.addInpSm} type="text" inputMode="numeric" value={newPresetCount}
                          onChange={e => { const v = e.target.value.replace(/\D/g, ''); setNewPresetCount(v === '' ? 0 : parseInt(v, 10)); }}
                          onFocus={e => e.target.select()}
                          title={t('dock.repeatCount')} />
                        <span className={s.unit}>{t('dock.repeatUnit')}</span>
                        {newPresetCount === 0 && <span className={s.infinityHint}>∞ {t('dock.infinite')}</span>}
                      </>
                    )}
                  </div>
                  <div className={s.addBtns}>
                    <button className={s.addSaveBtn} onClick={addPreset}>{t('dock.save')}</button>
                    <button className={s.addCancelBtn} onClick={() => setAddingPreset(false)}>{t('dock.cancel')}</button>
                  </div>
                </div>
              ) : (
                <div className={s.txItem}
                  style={{ color: 'var(--brand)', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                  onClick={() => setAddingPreset(true)}>
                  <span>+</span> {t('dock.newPreset')}
                </div>
              )}
            </div>

            <div className={s.txEditor}>
              {preset ? (
                <PresetEditor
                  preset={preset}
                  onUpdate={p => dispatch({ type: 'UPDATE_TX_PRESET', preset: p })}
                  onRun={() => runPreset(preset)}
                  connected={connected}
                />
              ) : (
                <QuickSend
                  value={quickHex}
                  onChange={setQuickHex}
                  onSend={sendQuick}
                  onErrorClear={() => setQuickError('')}
                  error={quickError}
                  disabled={!connected}
                  fmt={quickFmt}
                  onFmtChange={setQuickFmt}
                />
              )}
            </div>
          </div>
        )}

        {tab === 'script'  && <ScriptTab  activeId={activeId} connected={connected} dispatch={dispatch} />}
        {tab === 'console' && <ConsoleTab />}
        {tab === 'macro'   && <MacroTab   activeId={activeId} connected={connected} dispatch={dispatch} />}
        {/* TimedMacroTab is always mounted so timers survive tab switches */}
        <div style={{ display: tab === 'timer' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
          <TimedMacroTab activeId={activeId} connected={connected} dispatch={dispatch} />
        </div>
      </div>
    </div>
  );
}

function QuickSend({ value, onChange, onSend, onErrorClear, error, disabled, fmt, onFmtChange }: {
  value: string; onChange: (v: string) => void;
  onSend: () => void; onErrorClear: () => void; error: string; disabled: boolean;
  fmt: 'hex' | 'ascii'; onFmtChange: (f: 'hex' | 'ascii') => void;
}) {
  const t = useT();
  return (
    <div className={s.quickSend}>
      <div className={s.fmtRow}>
        <div className={s.label}>{t('dock.quickSend')}</div>
        <div className={s.fmtToggle}>
          <button className={`${s.fmtBtn} ${fmt === 'hex' ? s.fmtBtnOn : ''}`} onClick={() => onFmtChange('hex')}>HEX</button>
          <button className={`${s.fmtBtn} ${fmt === 'ascii' ? s.fmtBtnOn : ''}`} onClick={() => onFmtChange('ascii')}>ASCII</button>
        </div>
      </div>
      <textarea
        className={s.hexInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.ctrlKey && e.key === 'Enter' && onSend()}
        placeholder={fmt === 'ascii' ? t('dock.asciiPlaceholder') : t('dock.hexPlaceholder')}
        rows={3}
        disabled={disabled}
      />
      {error && (
        <div className={s.txError}>
          {error}
          <button className={s.txErrorClear} onClick={() => onErrorClear()}>×</button>
        </div>
      )}
      <div className={s.txActions}>
        <button className={s.sendBtn} onClick={onSend} disabled={disabled || !value.trim()}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 2l8 4-8 4V7l5-1-5-1V2z"/>
          </svg>
          {t('dock.send')}
          <kbd className={s.sendKbd}>Ctrl+↵</kbd>
        </button>
        <span className={s.txHint}>{disabled ? t('dock.notConnected') : t('dock.sendHint')}</span>
      </div>
    </div>
  );
}

function PresetEditor({ preset, onUpdate, onRun, connected }: {
  preset: TxPreset; onUpdate: (p: TxPreset) => void; onRun: () => void; connected: boolean;
}) {
  const t = useT();
  const fmt = preset.inputFmt ?? 'hex';
  return (
    <div className={s.presetEditor}>
      <div className={s.presetEditorHead}>
        <input
          className={s.presetNameInput}
          value={preset.name}
          onChange={e => onUpdate({ ...preset, name: e.target.value })}
        />
        <button className={s.sendBtn} onClick={onRun} disabled={!connected} style={{ marginLeft: 'auto' }}>▶ {t('dock.send')}</button>
      </div>
      <div className={s.fmtRow}>
        <div className={s.fmtToggle}>
          <button className={`${s.fmtBtn} ${fmt === 'hex' ? s.fmtBtnOn : ''}`} onClick={() => onUpdate({ ...preset, inputFmt: 'hex' })}>HEX</button>
          <button className={`${s.fmtBtn} ${fmt === 'ascii' ? s.fmtBtnOn : ''}`} onClick={() => onUpdate({ ...preset, inputFmt: 'ascii' })}>ASCII</button>
        </div>
      </div>
      <textarea
        className={s.hexInput}
        value={preset.bytes}
        onChange={e => onUpdate({ ...preset, bytes: e.target.value })}
        rows={3}
        placeholder={fmt === 'ascii' ? t('dock.asciiPlaceholder') : t('dock.hexBytes')}
        spellCheck={false}
      />
      <div className={s.presetModeRow}>
        <select className={s.addSel} value={preset.mode}
          onChange={e => onUpdate({ ...preset, mode: e.target.value as TxPreset['mode'] })}>
          <option value="single">{t('dock.single')}</option>
          <option value="repeat">{t('dock.repeat')}</option>
          <option value="trigger">{t('dock.trigger')}</option>
        </select>
        {preset.mode === 'repeat' && (
          <>
            <input className={s.addInpSm} type="text" inputMode="numeric" value={preset.interval_ms ?? 500}
              onChange={e => { const v = e.target.value.replace(/\D/g, ''); onUpdate({ ...preset, interval_ms: v === '' ? 1 : parseInt(v, 10) }); }}
              onFocus={e => e.target.select()} />
            <span className={s.unit}>ms</span>
            <input className={s.addInpSm} type="text" inputMode="numeric" value={preset.count ?? 0}
              onChange={e => { const v = e.target.value.replace(/\D/g, ''); onUpdate({ ...preset, count: parseInt(v, 10) || undefined }); }}
              onFocus={e => e.target.select()}
              title={t('dock.repeatCount')} />
            <span className={s.unit}>{t('dock.repeatUnit')}</span>
            {(preset.count ?? 0) === 0 && <span className={s.infinityHint}>∞ {t('dock.infinite')}</span>}
          </>
        )}
        {preset.mode === 'trigger' && (
          <div className={s.triggerRow}>
            <input className={s.addInp} style={{ flex: 1 }} value={preset.trigger ?? ''}
              onChange={e => onUpdate({ ...preset, trigger: e.target.value })}
              placeholder={t('dock.triggerPattern')} />
            <TriggerHint />
          </div>
        )}
      </div>
    </div>
  );
}

function TriggerHint() {
  const t = useT();
  const btnRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ bottom: 0, right: 0 });

  function handleEnter() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  const ROWS = [
    { syntax: 'starts:68 01',   desc: t('filter.starts') },
    { syntax: 'contains:68 01', desc: t('filter.contains') },
    { syntax: 'checksum:fail',  desc: t('filter.csumFail') },
    { syntax: 'len:12',         desc: t('filter.lenExact') },
    { syntax: 'len>8',          desc: t('filter.lenRange') },
    { syntax: '!contains:68',   desc: t('filter.negate') },
    { syntax: '68 01 00 16',    desc: t('filter.hexFree') },
    { syntax: 'session:COM3',   desc: t('filter.session') },
  ];

  return (
    <>
      <span ref={btnRef} className={s.hintBtn} onMouseEnter={handleEnter} onMouseLeave={() => setOpen(false)}>?</span>
      {open && createPortal(
        <div className={s.hintPopPortal} style={{ bottom: pos.bottom, right: pos.right }}>
          <div className={s.hintTitle}>{t('dock.triggerHintTitle')}</div>
          {ROWS.map(r => (
            <div key={r.syntax} className={s.hintRow}>
              <code className={s.hintCode}>{r.syntax}</code>
              <span className={s.hintDesc}>{r.desc}</span>
            </div>
          ))}
          <div className={s.hintFooter}>{t('dock.triggerHintFooter')}</div>
        </div>,
        document.body
      )}
    </>
  );
}

// Safe command interpreter: send HEX, sleep MS, log TEXT
async function runScript(
  code: string,
  activeId: string,
  onLog: (line: string, kind: 'tx'|'info'|'err') => void
): Promise<void> {
  const lines = code.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    if (line.startsWith('send ')) {
      const hex = line.slice(5).trim();
      await api.sendBytes(hex, activeId);
      onLog(`TX: ${hex}`, 'tx');
    } else if (line.startsWith('sleep ')) {
      const ms = parseInt(line.slice(6).trim(), 10);
      if (!isNaN(ms) && ms > 0 && ms <= 30000) {
        await new Promise(r => setTimeout(r, ms));
        onLog(`sleep ${ms}ms`, 'info');
      }
    } else if (line.startsWith('log ')) {
      onLog(line.slice(4).trim(), 'info');
    } else if (line !== '') {
      onLog(`Unknown command: ${line}`, 'err');
    }
  }
}

function ScriptTab({ activeId, connected, dispatch }: {
  activeId: string | null; connected: boolean;
  dispatch: React.Dispatch<any>;
}) {
  const t = useT();
  const defaultComment = [
    '# 명령어: send HEX | sleep MS | log 메시지',
    '#',
    '# 예시:',
    '# send 68 01 00 16        # 패킷 전송',
    '# sleep 200               # 200ms 대기',
    '# send 68 02 00 16        # 두 번째 패킷',
    '# log 시퀀스 완료            # 콘솔에 메시지 출력',
    '',
  ].join('\n');

  // Old defaults to detect and replace with new defaultComment
  const OLD_DEFAULTS = [
    '# Commands: send HEX | sleep MS | log message\n',
    '# 명령어: send HEX | sleep MS | log 메시지\n',
  ];

  const [code, setCode] = useState(() => {
    try {
      const saved = localStorage.getItem('ws_script');
      if (!saved || OLD_DEFAULTS.includes(saved)) return defaultComment;
      return saved;
    } catch { return defaultComment; }
  });
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');

  useEffect(() => {
    try { localStorage.setItem('ws_script', code); } catch {}
  }, [code]);

  async function run() {
    if (!connected || !activeId) {
      setOutput(t('dock.scriptError'));
      return;
    }
    setRunning(true);
    const lines: string[] = [];
    const log = (text: string, kind: 'tx'|'info'|'err') => {
      lines.push(text);
      setOutput(lines.join('\n'));
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text, kind, session_id: activeId ?? undefined } });
    };
    try {
      await runScript(code, activeId, log);
      lines.push(t('dock.scriptDone'));
      setOutput(lines.join('\n'));
    } catch (e: any) {
      lines.push(`${t('dock.scriptExecError')}${e.message}`);
      setOutput(lines.join('\n'));
    }
    setRunning(false);
  }

  return (
    <div className={s.scriptTab}>
      <div className={s.scriptHead}>
        <span className={s.scriptTitle}>{t('dock.scriptTitle')}</span>
        <span className={s.scriptHint}>{t('dock.scriptHint')}</span>
        <button className={`${s.runScriptBtn} ${running ? s.runScriptRunning : ''}`}
          onClick={run} disabled={running || !connected}>
          {running ? t('dock.running') : t('dock.run')}
        </button>
      </div>
      <textarea
        className={s.scriptArea}
        value={code}
        onChange={e => setCode(e.target.value)}
        spellCheck={false}
      />
      {output && <div className={s.scriptOutput}>{output}</div>}
    </div>
  );
}

function ConsoleTab() {
  const { state, dispatch } = useApp();
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeId = state.activeSessionId;

  // Show entries for this session + system-wide entries (no session_id)
  const visibleLog = state.consoleLog.filter(e =>
    !e.session_id || e.session_id === activeId
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLog.length]);

  return (
    <div className={s.consoleTab}>
      <div className={s.consoleHead}>
        <span className={s.consoleTitle}>{t('dock.consoleTitle')}</span>
        {/* Clear only this session's entries; system entries remain */}
        <button className={s.consoleClear} onClick={() => dispatch({ type: 'CLEAR_CONSOLE', id: activeId ?? undefined })}>{t('dock.consoleClear')}</button>
      </div>
      <div className={s.consoleBody}>
        {visibleLog.map((entry, i) => (
          <div key={i} className={`${s.consoleLine} ${s['console_' + entry.kind]}`}>
            <span className={s.consoleTs}>{new Date(entry.ts).toTimeString().slice(0, 8)}</span>
            <span className={s.consoleText}>{entry.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function TimedMacroTab({ activeId, connected, dispatch }: {
  activeId: string | null; connected: boolean;
  dispatch: React.Dispatch<any>;
}) {
  const t = useT();

  const [macros, setMacros] = useState<TimedMacro[]>(() => {
    try {
      const v = localStorage.getItem('ws_timed_macros');
      const list: TimedMacro[] = v ? JSON.parse(v) : [];
      return list.map(m => ({ ...m, active: false }));
    } catch { return []; }
  });
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [adding, setAdding]         = useState(false);
  const [newName, setNewName]       = useState('');
  const [newBytes, setNewBytes]     = useState('');
  const [newFmt, setNewFmt]         = useState<'hex' | 'ascii'>('ascii');
  const [newInterval, setNewInterval] = useState(1000);

  const timerRefs   = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const macrosRef   = useRef(macros);
  const activeIdRef = useRef(activeId);
  useEffect(() => { macrosRef.current = macros; }, [macros]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Stop all timers when disconnected, session changes, or unmount
  useEffect(() => { if (!connected) stopAllTimers(); }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stopAllTimers(); }, [activeId]);                   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAllTimers(), []);                          // eslint-disable-line react-hooks/exhaustive-deps

  function persist(list: TimedMacro[]) {
    setMacros(list);
    try { localStorage.setItem('ws_timed_macros', JSON.stringify(list)); } catch {}
  }

  function stopTimer(id: string) {
    if (timerRefs.current[id]) {
      clearInterval(timerRefs.current[id]);
      delete timerRefs.current[id];
    }
  }

  function stopAllTimers() {
    Object.keys(timerRefs.current).forEach(id => stopTimer(id));
    timerRefs.current = {};
    setMacros(prev => {
      const next = prev.map(m => ({ ...m, active: false }));
      try { localStorage.setItem('ws_timed_macros', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function doSend(macroId: string) {
    const macro = macrosRef.current.find(m => m.id === macroId);
    const aid   = activeIdRef.current;
    if (!macro || !aid) return;
    const hex = macro.inputFmt === 'ascii' ? asciiToHex(macro.bytes) : macro.bytes;
    try {
      await api.sendBytes(hex, aid);
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `TX [${macro.name}]: ${macro.bytes}`, kind: 'tx', session_id: aid } });
    } catch (e: any) {
      stopTimer(macroId);
      setMacros(prev => {
        const next = prev.map(m => m.id === macroId ? { ...m, active: false } : m);
        try { localStorage.setItem('ws_timed_macros', JSON.stringify(next)); } catch {}
        return next;
      });
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `Timer stopped [${macro.name}]: ${e}`, kind: 'err', session_id: aid } });
    }
  }

  function toggleTimer(id: string) {
    if (!connected || !activeId) return;
    const macro = macros.find(m => m.id === id);
    if (!macro) return;
    if (timerRefs.current[id]) {
      stopTimer(id);
      persist(macros.map(m => m.id === id ? { ...m, active: false } : m));
    } else {
      persist(macros.map(m => m.id === id ? { ...m, active: true } : m));
      doSend(id);
      timerRefs.current[id] = setInterval(() => doSend(id), Math.max(macro.interval_ms, 10));
    }
  }

  function addMacro() {
    if (!newName.trim() || !newBytes.trim()) return;
    const macro: TimedMacro = {
      id:          Date.now().toString(),
      name:        newName.trim(),
      bytes:       newBytes.trim(),
      inputFmt:    newFmt,
      interval_ms: Math.max(newInterval, 10),
      active:      false,
    };
    persist([...macros, macro]);
    setNewName(''); setNewBytes(''); setNewFmt('ascii'); setNewInterval(1000);
    setAdding(false);
  }

  function removeMacro(id: string) {
    stopTimer(id);
    persist(macros.filter(m => m.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function updateMacro(updated: TimedMacro) {
    // If interval changed while timer is running, stop it — user must restart
    if (timerRefs.current[updated.id]) {
      const cur = macros.find(m => m.id === updated.id);
      if (cur && cur.interval_ms !== updated.interval_ms) {
        stopTimer(updated.id);
        updated = { ...updated, active: false };
      }
    }
    persist(macros.map(m => m.id === updated.id ? updated : m));
  }

  const activeCount = macros.filter(m => m.active).length;

  return (
    <div className={s.timerTab}>
      {activeCount > 0 && (
        <div className={s.timerRunningBar}>
          <span className={s.timerRunningDot} />
          {activeCount}{t('dock.timerRunning')}
          <button className={s.timerStopAll} onClick={stopAllTimers}>{t('dock.stop')} all</button>
        </div>
      )}

      <div className={s.timerList}>
        {macros.map(m => (
          <div key={m.id} className={`${s.timerRow} ${m.active ? s.timerRowActive : ''}`}>
            <div className={s.timerRowMain}>
              <button
                className={`${s.timerToggle} ${m.active ? s.timerToggleOn : ''}`}
                onClick={() => toggleTimer(m.id)}
                disabled={!connected && !m.active}
                title={m.active ? t('dock.stop') : t('dock.timerStart')}
              >
                {m.active ? '■' : '●'}
              </button>
              <div className={s.timerInfo} onClick={() => setEditingId(editingId === m.id ? null : m.id)}>
                <div className={s.timerName}>{m.name}</div>
                <div className={s.timerSub}>
                  <span className={s.timerFmtBadge}>{m.inputFmt.toUpperCase()}</span>
                  {m.bytes}
                </div>
              </div>
              <div className={s.timerIntervalWrap}>
                <input
                  className={s.timerIntervalInp}
                  type="text"
                  inputMode="numeric"
                  value={m.interval_ms}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '');
                    updateMacro({ ...m, interval_ms: v ? Math.max(parseInt(v), 10) : 10 });
                  }}
                  onFocus={e => e.target.select()}
                  title={t('dock.timerIntervalTip')}
                />
                <span className={s.unit}>ms</span>
              </div>
              <div className={s.timerActions}>
                <button className={s.timerSendBtn} onClick={() => doSend(m.id)} disabled={!connected} title={t('dock.send')}>▶</button>
                <button className={s.timerDeleteBtn} onClick={() => removeMacro(m.id)} title={t('dock.delete')}>×</button>
              </div>
            </div>
            {editingId === m.id && (
              <div className={s.timerEditPanel}>
                <div className={s.addRow}>
                  <div className={s.fmtToggle}>
                    <button className={`${s.fmtBtn} ${m.inputFmt === 'hex' ? s.fmtBtnOn : ''}`} onClick={() => updateMacro({ ...m, inputFmt: 'hex' })}>HEX</button>
                    <button className={`${s.fmtBtn} ${m.inputFmt === 'ascii' ? s.fmtBtnOn : ''}`} onClick={() => updateMacro({ ...m, inputFmt: 'ascii' })}>ASCII</button>
                  </div>
                </div>
                <input className={s.addInp} value={m.name}
                  onChange={e => updateMacro({ ...m, name: e.target.value })}
                  placeholder={t('dock.presetName')} />
                <input className={s.addInp} value={m.bytes}
                  onChange={e => updateMacro({ ...m, bytes: e.target.value })}
                  placeholder={m.inputFmt === 'ascii' ? t('dock.asciiPlaceholder') : t('dock.hexBytes')}
                  spellCheck={false} />
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <div className={s.timerAddForm}>
            <input className={s.addInp} value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('dock.presetName')} autoFocus
              onKeyDown={e => e.key === 'Enter' && addMacro()} />
            <input className={s.addInp} value={newBytes}
              onChange={e => setNewBytes(e.target.value)}
              placeholder={newFmt === 'ascii' ? t('dock.asciiPlaceholder') : t('dock.hexBytes')}
              spellCheck={false}
              onKeyDown={e => e.key === 'Enter' && addMacro()} />
            <div className={s.addRow}>
              <div className={s.fmtToggle}>
                <button className={`${s.fmtBtn} ${newFmt === 'hex' ? s.fmtBtnOn : ''}`} onClick={() => setNewFmt('hex')}>HEX</button>
                <button className={`${s.fmtBtn} ${newFmt === 'ascii' ? s.fmtBtnOn : ''}`} onClick={() => setNewFmt('ascii')}>ASCII</button>
              </div>
              <input className={s.timerIntervalInp} type="text" inputMode="numeric" value={newInterval}
                onChange={e => { const v = e.target.value.replace(/\D/g, ''); setNewInterval(v ? parseInt(v) : 10); }}
                onFocus={e => e.target.select()} />
              <span className={s.unit}>ms</span>
            </div>
            <div className={s.addBtns}>
              <button className={s.addSaveBtn} onClick={addMacro}>{t('dock.save')}</button>
              <button className={s.addCancelBtn} onClick={() => setAdding(false)}>{t('dock.cancel')}</button>
            </div>
          </div>
        ) : (
          <div className={s.timerAddRow} onClick={() => setAdding(true)}>
            {t('dock.timerNew')}
          </div>
        )}
      </div>

      {macros.length > 0 && (
        <div className={s.timerQuickBar}>
          <div className={s.timerQuickLabel}>{t('dock.timerQuickSend')}</div>
          <div className={s.timerQuickBtns}>
            {macros.map(m => (
              <button
                key={m.id}
                className={`${s.timerQuickBtn} ${m.active ? s.timerQuickBtnActive : ''}`}
                onClick={() => doSend(m.id)}
                disabled={!connected}
                title={`${m.bytes} · ${m.interval_ms}ms`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MacroTab({ activeId, connected, dispatch }: {
  activeId: string | null; connected: boolean;
  dispatch: React.Dispatch<any>;
}) {
  const t = useT();
  const [macros, setMacros] = useState<Record<string, string>>(() => {
    try { const v = localStorage.getItem('ws_macros'); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });
  // Per-macro format: 'hex' (default) or 'ascii'
  const [macroFmts, setMacroFmts] = useState<Record<string, 'hex' | 'ascii'>>(() => {
    try { const v = localStorage.getItem('ws_macro_fmts'); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editFmt, setEditFmt] = useState<'hex' | 'ascii'>('hex');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!connected || !activeId) return;
      const key = e.key;
      if (!MACRO_KEYS.includes(key) || !macros[key]) return;
      const tag = (document.activeElement as HTMLElement)?.tagName ?? '';
      const editable = (document.activeElement as HTMLElement)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
      e.preventDefault();
      fireMacro(key);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [macros, macroFmts, connected, activeId, dispatch]);

  function startEdit(key: string) {
    setEditing(key);
    setEditVal(macros[key] ?? '');
    setEditFmt(macroFmts[key] ?? 'hex');
  }
  function saveMacros(nextBytes: Record<string, string>, nextFmts: Record<string, 'hex' | 'ascii'>) {
    setMacros(nextBytes);
    setMacroFmts(nextFmts);
    try { localStorage.setItem('ws_macros', JSON.stringify(nextBytes)); } catch {}
    try { localStorage.setItem('ws_macro_fmts', JSON.stringify(nextFmts)); } catch {}
  }
  function saveMacro() {
    if (!editing) return;
    saveMacros(
      { ...macros, [editing]: editVal },
      { ...macroFmts, [editing]: editFmt },
    );
    setEditing(null);
  }
  function clearMacro(key: string) {
    const nb = { ...macros };  delete nb[key];
    const nf = { ...macroFmts }; delete nf[key];
    saveMacros(nb, nf);
  }
  function fireMacro(key: string) {
    if (!connected || !activeId || !macros[key]) return;
    const fmt = macroFmts[key] ?? 'hex';
    const hex = fmt === 'ascii' ? asciiToHex(macros[key]) : macros[key];
    api.sendBytes(hex, activeId).then(() => {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `${t('dock.macroLog')}${key}: ${macros[key]}`, kind: 'tx', session_id: activeId ?? undefined } });
    });
  }

  return (
    <div className={s.macroTab}>
      <div className={s.macroHint}>{connected ? t('dock.macroHintOn') : t('dock.macroHintOff')}</div>
      <div className={s.macroList}>
        {MACRO_KEYS.map(key => {
          const fmt = macroFmts[key] ?? 'hex';
          return (
            <div key={key} className={`${s.macroItem} ${!macros[key] ? s.macroEmpty : ''}`}>
              <span className={s.macroKey}>{key}</span>
              {editing === key ? (
                <div className={s.macroEditArea}>
                  <div className={s.macroFmtRow}>
                    <button className={`${s.fmtBtn} ${editFmt === 'hex' ? s.fmtBtnOn : ''}`} onClick={() => setEditFmt('hex')}>HEX</button>
                    <button className={`${s.fmtBtn} ${editFmt === 'ascii' ? s.fmtBtnOn : ''}`} onClick={() => setEditFmt('ascii')}>ASCII</button>
                  </div>
                  <input
                    className={s.macroEditInp}
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveMacro(); if (e.key === 'Escape') setEditing(null); }}
                    autoFocus
                    placeholder={editFmt === 'ascii' ? t('dock.asciiPlaceholder') : t('dock.hexBytes')}
                    spellCheck={false}
                  />
                </div>
              ) : (
                <span className={s.macroBytes} onClick={() => startEdit(key)}>
                  {macros[key]
                    ? <><span className={s.macroFmtBadge}>{fmt.toUpperCase()}</span>{macros[key]}</>
                    : <span className={s.macroNone}>{t('dock.macroClickToSet')}</span>
                  }
                </span>
              )}
              <div className={s.macroActions}>
                {editing === key ? (
                  <>
                    <button className={s.macroSave} onClick={saveMacro}>✓</button>
                    <button className={s.macroCancel} onClick={() => setEditing(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <button className={s.macroEdit} onClick={() => startEdit(key)}>{t('dock.macroEdit')}</button>
                    {macros[key] && (
                      <>
                        <button className={s.macroClear} onClick={() => clearMacro(key)}>×</button>
                        {connected && <button className={s.macroRun} onClick={() => fireMacro(key)}>▶</button>}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
