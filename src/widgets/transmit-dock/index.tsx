import { useState, useRef, useEffect } from 'react';
import s from './Dock.module.css';
import { useApp } from '../../app/store';
import * as api from '../../shared/api/tauri';
import type { TxPreset, DockTab } from '../../shared/types';

const DOCK_TABS: { id: DockTab; label: string }[] = [
  { id: 'transmit', label: '전송' },
  { id: 'script',   label: '스크립트' },
  { id: 'console',  label: '콘솔' },
  { id: 'macro',    label: '매크로' },
];

const MACRO_KEYS = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];

export function TransmitDock() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<DockTab>('transmit');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [quickHex, setQuickHex] = useState('');
  const [quickError, setQuickError] = useState('');
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetBytes, setNewPresetBytes] = useState('');
  const [newPresetMode, setNewPresetMode] = useState<TxPreset['mode']>('single');
  const [newPresetInterval, setNewPresetInterval] = useState(500);

  const connected = state.sessions.some(sess => sess.connected);
  const activeId = state.activeSessionId;

  async function sendQuick() {
    if (!quickHex.trim() || !activeId) return;
    setQuickError('');
    try {
      await api.sendBytes(quickHex, activeId);
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `TX: ${quickHex.trim()}`, kind: 'tx' } });
      setQuickHex('');
    } catch (e: any) {
      setQuickError(String(e));
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `오류: ${e}`, kind: 'err' } });
    }
  }

  async function runPreset(preset: TxPreset) {
    if (!activeId) return;
    dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: true } });
    try {
      await api.sendBytes(preset.bytes, activeId);
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `TX [${preset.name}]: ${preset.bytes}`, kind: 'tx' } });
    } catch (e: any) {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `오류 [${preset.name}]: ${e}`, kind: 'err' } });
    }
    if (preset.mode !== 'repeat') {
      dispatch({ type: 'UPDATE_TX_PRESET', preset: { ...preset, active: false } });
    }
  }

  function addPreset() {
    if (!newPresetName.trim() || !newPresetBytes.trim()) return;
    const preset: TxPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      bytes: newPresetBytes.trim(),
      mode: newPresetMode,
      interval_ms: newPresetMode === 'repeat' ? newPresetInterval : undefined,
      active: false,
    };
    dispatch({ type: 'ADD_TX_PRESET', preset });
    setNewPresetName(''); setNewPresetBytes(''); setNewPresetMode('single');
    setAddingPreset(false);
  }

  const preset = selectedPreset ? state.txPresets.find(p => p.id === selectedPreset) : null;

  return (
    <div className={s.dock}>
      <div className={s.head}>
        <div className={s.tabs}>
          {DOCK_TABS.map(t => (
            <button
              key={t.id}
              className={`${s.tab} ${tab === t.id ? s.tabOn : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'transmit' && <span className={s.tabNum}>{state.txPresets.length}</span>}
              {t.id === 'console' && state.consoleLog.length > 0 && (
                <span className={s.tabNum}>{Math.min(state.consoleLog.length, 99)}</span>
              )}
            </button>
          ))}
        </div>
        <div className={s.dockActions}>
          <button
            className={s.iconBtn}
            title="닫기"
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
                    disabled={!connected}
                    title="전송"
                  >▶</button>
                  <div className={s.txInfo}>
                    <div className={s.txName}>{p.name}</div>
                    <div className={s.txSub}>{p.bytes}</div>
                  </div>
                  <div className={s.txRight}>
                    <span className={s.txMode}>
                      {p.mode === 'repeat'  ? `${p.interval_ms}ms` :
                       p.mode === 'trigger' ? '트리거' : '단발'}
                    </span>
                    <button
                      className={s.removeBtn}
                      onClick={e => {
                        e.stopPropagation();
                        dispatch({ type: 'REMOVE_TX_PRESET', id: p.id });
                        if (selectedPreset === p.id) setSelectedPreset(null);
                      }}
                      title="삭제"
                    >×</button>
                  </div>
                </div>
              ))}

              {addingPreset ? (
                <div className={s.addPresetForm}>
                  <input className={s.addInp} value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    placeholder="이름" autoFocus />
                  <input className={s.addInp} value={newPresetBytes}
                    onChange={e => setNewPresetBytes(e.target.value)}
                    placeholder="HEX 바이트 (예: 68 01 00 16)" spellCheck={false} />
                  <div className={s.addRow}>
                    <select className={s.addSel} value={newPresetMode}
                      onChange={e => setNewPresetMode(e.target.value as TxPreset['mode'])}>
                      <option value="single">단발</option>
                      <option value="repeat">반복</option>
                      <option value="trigger">트리거</option>
                    </select>
                    {newPresetMode === 'repeat' && (
                      <>
                        <input className={s.addInpSm} type="number" value={newPresetInterval}
                          onChange={e => setNewPresetInterval(Number(e.target.value))} />
                        <span className={s.unit}>ms</span>
                      </>
                    )}
                  </div>
                  <div className={s.addBtns}>
                    <button className={s.addSaveBtn} onClick={addPreset}>저장</button>
                    <button className={s.addCancelBtn} onClick={() => setAddingPreset(false)}>취소</button>
                  </div>
                </div>
              ) : (
                <div className={s.txItem}
                  style={{ color: 'var(--brand)', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                  onClick={() => setAddingPreset(true)}>
                  <span>+</span> 새 프리셋
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
                />
              )}
            </div>
          </div>
        )}

        {tab === 'script'  && <ScriptTab  activeId={activeId} connected={connected} dispatch={dispatch} />}
        {tab === 'console' && <ConsoleTab />}
        {tab === 'macro'   && <MacroTab   activeId={activeId} connected={connected} dispatch={dispatch} />}
      </div>
    </div>
  );
}

function QuickSend({ value, onChange, onSend, onErrorClear, error, disabled }: {
  value: string; onChange: (v: string) => void;
  onSend: () => void; onErrorClear: () => void; error: string; disabled: boolean;
}) {
  return (
    <div className={s.quickSend}>
      <div className={s.label}>빠른 전송</div>
      <textarea
        className={s.hexInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.ctrlKey && e.key === 'Enter' && onSend()}
        placeholder="HEX 바이트를 입력하세요 (예: 68 01 00 16)"
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
          전송
          <kbd className={s.sendKbd}>Ctrl+↵</kbd>
        </button>
        <span className={s.txHint}>{disabled ? '장치에 연결되지 않음' : 'Ctrl+Enter로 전송'}</span>
      </div>
    </div>
  );
}

function PresetEditor({ preset, onUpdate, onRun, connected }: {
  preset: TxPreset; onUpdate: (p: TxPreset) => void; onRun: () => void; connected: boolean;
}) {
  return (
    <div className={s.presetEditor}>
      <div className={s.presetEditorHead}>
        <input
          className={s.presetNameInput}
          value={preset.name}
          onChange={e => onUpdate({ ...preset, name: e.target.value })}
        />
        <button className={s.sendBtn} onClick={onRun} disabled={!connected} style={{ marginLeft: 'auto' }}>▶ 전송</button>
      </div>
      <textarea
        className={s.hexInput}
        value={preset.bytes}
        onChange={e => onUpdate({ ...preset, bytes: e.target.value })}
        rows={3}
        placeholder="HEX 바이트"
        spellCheck={false}
      />
      <div className={s.presetModeRow}>
        <select className={s.addSel} value={preset.mode}
          onChange={e => onUpdate({ ...preset, mode: e.target.value as TxPreset['mode'] })}>
          <option value="single">단발</option>
          <option value="repeat">반복</option>
          <option value="trigger">트리거</option>
        </select>
        {preset.mode === 'repeat' && (
          <>
            <input className={s.addInpSm} type="number" value={preset.interval_ms ?? 500}
              onChange={e => onUpdate({ ...preset, interval_ms: Number(e.target.value) })} />
            <span className={s.unit}>ms</span>
          </>
        )}
        {preset.mode === 'trigger' && (
          <input className={s.addInp} value={preset.trigger ?? ''}
            onChange={e => onUpdate({ ...preset, trigger: e.target.value })}
            placeholder="트리거 패턴 (예: contains:68 01)" />
        )}
      </div>
    </div>
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
      onLog(`알 수 없는 명령: ${line}`, 'err');
    }
  }
}

function ScriptTab({ activeId, connected, dispatch }: {
  activeId: string | null; connected: boolean;
  dispatch: React.Dispatch<any>;
}) {
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem('ws_script') ?? '# 명령어: send HEX | sleep MS | log 메시지\n'; } catch { return '# 명령어: send HEX | sleep MS | log 메시지\n'; }
  });
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');

  useEffect(() => {
    try { localStorage.setItem('ws_script', code); } catch {}
  }, [code]);

  async function run() {
    if (!connected || !activeId) {
      setOutput('오류: 장치에 연결되지 않음');
      return;
    }
    setRunning(true);
    const lines: string[] = [];
    const log = (text: string, kind: 'tx'|'info'|'err') => {
      lines.push(text);
      setOutput(lines.join('\n'));
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text, kind } });
    };
    try {
      await runScript(code, activeId, log);
      lines.push('✓ 스크립트 완료');
      setOutput(lines.join('\n'));
    } catch (e: any) {
      lines.push(`오류: ${e.message}`);
      setOutput(lines.join('\n'));
    }
    setRunning(false);
  }

  return (
    <div className={s.scriptTab}>
      <div className={s.scriptHead}>
        <span className={s.scriptTitle}>스크립트 편집기</span>
        <span className={s.scriptHint}>send HEX · sleep MS · log 메시지</span>
        <button className={`${s.runScriptBtn} ${running ? s.runScriptRunning : ''}`}
          onClick={run} disabled={running || !connected}>
          {running ? '실행 중…' : '▶ 실행'}
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.consoleLog.length]);

  return (
    <div className={s.consoleTab}>
      <div className={s.consoleHead}>
        <span className={s.consoleTitle}>콘솔 로그</span>
        <button className={s.consoleClear} onClick={() => dispatch({ type: 'CLEAR_CONSOLE' })}>지우기</button>
      </div>
      <div className={s.consoleBody}>
        {state.consoleLog.map((entry, i) => (
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

function MacroTab({ activeId, connected, dispatch }: {
  activeId: string | null; connected: boolean;
  dispatch: React.Dispatch<any>;
}) {
  const [macros, setMacros] = useState<Record<string, string>>(() => {
    try { const v = localStorage.getItem('ws_macros'); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!connected || !activeId) return;
      const key = e.key;
      if (MACRO_KEYS.includes(key) && macros[key]) {
        e.preventDefault();
        api.sendBytes(macros[key], activeId).then(() => {
          dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `매크로 ${key}: ${macros[key]}`, kind: 'tx' } });
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [macros, connected, activeId, dispatch]);

  function startEdit(key: string) { setEditing(key); setEditVal(macros[key] ?? ''); }
  function saveMacros(next: Record<string, string>) {
    setMacros(next);
    try { localStorage.setItem('ws_macros', JSON.stringify(next)); } catch {}
  }
  function saveMacro() {
    if (!editing) return;
    saveMacros({ ...macros, [editing]: editVal });
    setEditing(null);
  }
  function clearMacro(key: string) {
    const n = { ...macros }; delete n[key]; saveMacros(n);
  }
  function fireMacro(key: string) {
    if (!connected || !activeId || !macros[key]) return;
    api.sendBytes(macros[key], activeId).then(() => {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `매크로 ${key}: ${macros[key]}`, kind: 'tx' } });
    });
  }

  return (
    <div className={s.macroTab}>
      <div className={s.macroHint}>{connected ? 'F1–F12 키로 즉시 전송' : '연결 후 사용 가능'}</div>
      <div className={s.macroList}>
        {MACRO_KEYS.map(key => (
          <div key={key} className={`${s.macroItem} ${!macros[key] ? s.macroEmpty : ''}`}>
            <span className={s.macroKey}>{key}</span>
            {editing === key ? (
              <input
                className={s.macroEditInp}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveMacro(); if (e.key === 'Escape') setEditing(null); }}
                autoFocus
                placeholder="HEX 바이트"
                spellCheck={false}
              />
            ) : (
              <span className={s.macroBytes} onClick={() => startEdit(key)}>
                {macros[key] ?? <span className={s.macroNone}>— 클릭하여 설정</span>}
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
                  <button className={s.macroEdit} onClick={() => startEdit(key)}>편집</button>
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
        ))}
      </div>
    </div>
  );
}
