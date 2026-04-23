import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import s from './Checksum.module.css';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Badge';
import { HexDump } from '../../shared/ui/HexDump';
import { useApp, useSessionPackets, useCustomChecksums } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import * as api from '../../shared/api/tauri';
import { CHECKSUM_PRESETS } from '../../shared/config/tokens';
import type { ChecksumResult, CustomChecksum } from '../../shared/types';

function parseHexBytes(input: string): number[] | null {
  const clean = input.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const parts = clean.split(/[\s,]+/);
  const bytes: number[] = [];
  for (const p of parts) {
    const v = parseInt(p, 16);
    if (isNaN(v) || v < 0 || v > 255) return null;
    bytes.push(v);
  }
  return bytes.length > 0 ? bytes : null;
}

const GROUPS = ['CRC-16', 'CRC-32', 'Simple'] as const;

const CSUM_DESC_KEYS: Record<string, string> = {
  'crc16-modbus': 'csum.modbus.desc',
  'crc16-kermit': 'csum.kermit.desc',
  'crc16-dnp':    'csum.dnp.desc',
  'sum8':         'csum.sum8.desc',
  'sum16':        'csum.sum16.desc',
  'xor':          'csum.xor.desc',
  'fletcher16':   'csum.fletcher16.desc',
};

function csumDesc(id: string, fallback: string, t: (k: string) => string): string {
  const key = CSUM_DESC_KEYS[id];
  return key ? t(key) : fallback;
}

/** Safely execute user-defined checksum formula.
 *  code must be a complete function definition named `calculate(bytes)`.
 *  Returns unsigned 32-bit result or throws.
 */
function runCustomChecksum(code: string, bytes: number[]): number {
  const FnCtor = Object.getPrototypeOf(function(){}).constructor as FunctionConstructor;
  // Wrap: define the user function in scope, then call it
  const wrapper = new FnCtor('__bytes__', code + '\nreturn calculate(__bytes__);');
  const result = wrapper([...bytes]);
  if (typeof result !== 'number' || isNaN(result)) throw new Error('Function must return a number');
  return result >>> 0;
}

const DEFAULT_CUSTOM_CODE = `function calculate(bytes) {
  // bytes: number[] — each value is 0–255
  // Must return a number
  let sum = 0;
  for (const b of bytes) {
    sum = (sum + b) & 0xFF;
  }
  return sum;
}`;

export function ChecksumPage() {
  const { state, dispatch } = useApp();
  const sessionPackets = useSessionPackets();
  const customChecksums = useCustomChecksums();
  const t = useT();
  const isDark = state.settings.theme === 'dark';
  const [hexInput, setHexInput] = useState('');
  const [results, setResults] = useState<ChecksumResult[]>([]);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAlgo, setSelectedAlgo] = useState('crc16-modbus');
  const [inputMode, setInputMode] = useState<'hex' | 'packet'>('hex');
  const [selectedPacketId, setSelectedPacketId] = useState<number | null>(null);
  const [highlightFrom, setHighlightFrom] = useState('');
  const [highlightTo, setHighlightTo] = useState('');

  // Custom algo editor state
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [isNewCustom, setIsNewCustom] = useState(false); // true = just created, not yet saved
  const [customName, setCustomName] = useState('');
  const [customCode, setCustomCode] = useState(DEFAULT_CUSTOM_CODE);
  const [customTestResult, setCustomTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const bytes = parseHexBytes(hexInput);
  const activeBytes = inputMode === 'packet' && selectedPacketId !== null
    ? sessionPackets.find(p => p.id === selectedPacketId)?.bytes ?? null
    : bytes;

  const isCustomAlgo = selectedAlgo.startsWith('custom:');

  function toHexString(b: number[]) {
    return b.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  async function computeAll() {
    if (!activeBytes) { setError(t('checksum.invalidInput')); return; }
    setComputing(true); setError('');
    try {
      const builtIn = await api.computeAllChecksums(toHexString(activeBytes));
      const customResults: ChecksumResult[] = customChecksums.map(cs => {
        try {
          const value = runCustomChecksum(cs.code, activeBytes);
          return { algorithm: `custom:${cs.id}`, value, hex: value.toString(16).toUpperCase().padStart(4, '0') };
        } catch {
          return { algorithm: `custom:${cs.id}`, value: 0, hex: 'ERR' };
        }
      });
      setResults([...builtIn, ...customResults]);
    } catch (e: any) { setError(String(e)); }
    setComputing(false);
  }

  async function computeSingle() {
    if (!activeBytes) { setError(t('checksum.invalidInput')); return; }
    if (isCustomAlgo) {
      const cs = customChecksums.find(c => `custom:${c.id}` === selectedAlgo);
      if (!cs) return;
      try {
        const value = runCustomChecksum(cs.code, activeBytes);
        const res: ChecksumResult = { algorithm: selectedAlgo, value, hex: value.toString(16).toUpperCase().padStart(4, '0') };
        setResults(prev => {
          const idx = prev.findIndex(r => r.algorithm === res.algorithm);
          if (idx >= 0) { const next = [...prev]; next[idx] = res; return next; }
          return [...prev, res];
        });
      } catch (e: any) { setError(String(e)); }
      return;
    }
    setComputing(true); setError('');
    try {
      const res = await api.computeChecksum(selectedAlgo, toHexString(activeBytes));
      setResults(prev => {
        const idx = prev.findIndex(r => r.algorithm === res.algorithm);
        if (idx >= 0) { const next = [...prev]; next[idx] = res; return next; }
        return [...prev, res];
      });
    } catch (e: any) { setError(String(e)); }
    setComputing(false);
  }

  function loadFromPacket(id: number) {
    const pkt = sessionPackets.find(p => p.id === id);
    if (!pkt) return;
    setHexInput(pkt.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    setInputMode('hex');
  }

  function startNewCustom() {
    // If already editing a new unsaved entry, discard it first
    if (editingCustomId && isNewCustom) {
      dispatch({ type: 'REMOVE_CUSTOM_CHECKSUM', id: editingCustomId });
    }
    const id = Date.now().toString();
    const checksum: CustomChecksum = { id, name: '', code: DEFAULT_CUSTOM_CODE, tested: false };
    dispatch({ type: 'ADD_CUSTOM_CHECKSUM', checksum });
    setSelectedAlgo(`custom:${id}`);
    setEditingCustomId(id);
    setIsNewCustom(true);
    setCustomName('');
    setCustomCode(DEFAULT_CUSTOM_CODE);
    setCustomTestResult(null);
  }

  function openCustomEditor(cs: CustomChecksum) {
    // If switching away from a new unsaved entry, remove it automatically
    if (editingCustomId && editingCustomId !== cs.id && isNewCustom) {
      dispatch({ type: 'REMOVE_CUSTOM_CHECKSUM', id: editingCustomId });
    }
    setSelectedAlgo(`custom:${cs.id}`);
    setEditingCustomId(cs.id);
    setIsNewCustom(false);
    setCustomName(cs.name);
    setCustomCode(cs.code);
    setCustomTestResult(null);
  }

  function saveCustom() {
    if (!editingCustomId) return;
    const updated: CustomChecksum = {
      id: editingCustomId,
      name: customName.trim() || t('checksum.customUntitled'),
      code: customCode,
      tested: customTestResult?.ok === true,
    };
    dispatch({ type: 'UPDATE_CUSTOM_CHECKSUM', checksum: updated });
    setEditingCustomId(null);
    setIsNewCustom(false);
  }

  function cancelCustom() {
    if (!editingCustomId) return;
    // New unsaved entry: delete it entirely
    if (isNewCustom) {
      dispatch({ type: 'REMOVE_CUSTOM_CHECKSUM', id: editingCustomId });
      setSelectedAlgo('crc16-modbus');
    }
    setEditingCustomId(null);
    setIsNewCustom(false);
  }

  function deleteCustom(id: string) {
    dispatch({ type: 'REMOVE_CUSTOM_CHECKSUM', id });
    if (selectedAlgo === `custom:${id}`) setSelectedAlgo('crc16-modbus');
    if (editingCustomId === id) { setEditingCustomId(null); setIsNewCustom(false); }
  }

  function testCustom() {
    if (!activeBytes) { setCustomTestResult({ ok: false, msg: t('checksum.customNoData') }); return; }
    try {
      const value = runCustomChecksum(customCode, activeBytes);
      setCustomTestResult({ ok: true, msg: `0x${value.toString(16).toUpperCase().padStart(4, '0')}  (${value})` });
    } catch (e: any) {
      setCustomTestResult({ ok: false, msg: String(e.message ?? e) });
    }
  }

  const hlFrom = parseInt(highlightFrom) || 0;
  const hlTo   = parseInt(highlightTo) || (activeBytes?.length ?? 0) - 1;
  const hlRange = highlightFrom || highlightTo
    ? [{ start: hlFrom, end: hlTo, kind: 'chk' as const }]
    : [];

  const grouped = GROUPS.map(g => ({
    group: g,
    items: CHECKSUM_PRESETS.filter(p => p.group === g),
  }));

  return (
    <div className={s.page}>
      <div className={s.body}>
        {/* Left: Library */}
        <div className={s.library}>
          <div className={s.libHeader}>
            <h2 className={s.libTitle}>{t('checksum.library')}</h2>
          </div>

          {/* Custom group — at top for immediate visibility */}
          <div className={s.libGroup}>
            <div className={`${s.libGroupLabel} ${s.libGroupCustom}`}>
              {t('checksum.customGroup')}
              <button className={s.addCustomBtn} onClick={startNewCustom}>{t('checksum.addCustom')}</button>
            </div>
            {customChecksums.length === 0 && (
              <div className={s.customEmpty}>{t('checksum.customEmpty')}</div>
            )}
            {customChecksums.map(cs => (
              <button
                key={cs.id}
                className={`${s.libItem} ${selectedAlgo === `custom:${cs.id}` ? s.libItemActive : ''}`}
                onClick={() => {
                  // Just select — don't auto-open editor. Use 편집 button to edit.
                  if (editingCustomId && editingCustomId !== cs.id && isNewCustom) {
                    dispatch({ type: 'REMOVE_CUSTOM_CHECKSUM', id: editingCustomId });
                  }
                  setSelectedAlgo(`custom:${cs.id}`);
                  setEditingCustomId(null);
                  setIsNewCustom(false);
                }}
              >
                <span className={s.libItemLabel}>{cs.name || t('checksum.customUntitled')}</span>
                <span className={s.libItemDesc}>{t('checksum.customGroup')}</span>
              </button>
            ))}
          </div>

          {/* Built-in algorithm groups */}
          {grouped.map(({ group, items }) => (
            <div key={group} className={s.libGroup}>
              <div className={s.libGroupLabel}>{group}</div>
              {items.map(p => (
                <button
                  key={p.id}
                  className={`${s.libItem} ${selectedAlgo === p.id ? s.libItemActive : ''}`}
                  onClick={() => {
                    if (editingCustomId && isNewCustom) {
                      dispatch({ type: 'REMOVE_CUSTOM_CHECKSUM', id: editingCustomId });
                    }
                    setSelectedAlgo(p.id);
                    setEditingCustomId(null);
                    setIsNewCustom(false);
                  }}
                >
                  <span className={s.libItemLabel}>{p.label}</span>
                  <span className={s.libItemDesc}>{csumDesc(p.id, p.desc, t)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Center: Editor */}
        <div className={s.editor}>
          <div className={s.editorHeader}>
            <h2 className={s.editorTitle}>{t('checksum.editorTitle')}</h2>
            <p className={s.editorSub}>{t('checksum.editorSub')}</p>
          </div>

          {/* Input mode */}
          <div className={s.inputModeTabs}>
            <button
              className={`${s.modeTab} ${inputMode === 'hex' ? s.modeTabActive : ''}`}
              onClick={() => setInputMode('hex')}
            >{t('checksum.directInput')}</button>
            <button
              className={`${s.modeTab} ${inputMode === 'packet' ? s.modeTabActive : ''}`}
              onClick={() => setInputMode('packet')}
            >{t('checksum.fromPacket')}</button>
          </div>

          {inputMode === 'hex' ? (
            <div className={s.hexEditor}>
              <SectionHeading>{t('checksum.hexInput')}</SectionHeading>
              <textarea
                className={s.hexTextarea}
                value={hexInput}
                onChange={e => setHexInput(e.target.value)}
                placeholder={t('checksum.hexPlaceholder')}
                spellCheck={false}
              />
              <div className={s.inputMeta}>
                {bytes
                  ? <span>{bytes.length}{t('checksum.bytesSum')}{bytes.reduce((a, b) => a + b, 0).toString(16).toUpperCase().padStart(4, '0')}</span>
                  : hexInput.trim().length > 0 && <span className={s.inputError}>{t('checksum.invalidHex')}</span>
                }
              </div>
            </div>
          ) : (
            <div className={s.packetPicker}>
              <SectionHeading>{t('checksum.packetSelect')}</SectionHeading>
              {sessionPackets.length === 0 ? (
                <div className={s.emptyPicker}>{t('checksum.noPackets')}</div>
              ) : (
                <div className={s.pickerList}>
                  {sessionPackets.slice(-20).reverse().map(pkt => (
                    <button
                      key={pkt.id}
                      className={`${s.pickerItem} ${selectedPacketId === pkt.id ? s.pickerItemActive : ''}`}
                      onClick={() => { setSelectedPacketId(pkt.id); loadFromPacket(pkt.id); }}
                    >
                      <Badge variant={pkt.direction === 'TX' ? 'tx' : 'rx'}>{pkt.direction}</Badge>
                      <span className={s.pickerBytes}>{pkt.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</span>
                      <span className={s.pickerLen}>{pkt.bytes.length}B</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hex dump */}
          {activeBytes && activeBytes.length > 0 && (
            <div className={s.hexDumpSection}>
              <div className={s.hexDumpHeader}>
                <SectionHeading>{t('checksum.hexDump')}</SectionHeading>
                <div className={s.rangeInputs}>
                  <label className={s.rangeLabel}>{t('checksum.hlRange')}</label>
                  <input className={s.rangeInp} value={highlightFrom}
                    onChange={e => setHighlightFrom(e.target.value)} placeholder={t('checksum.from')} />
                  <span className={s.rangeSep}>–</span>
                  <input className={s.rangeInp} value={highlightTo}
                    onChange={e => setHighlightTo(e.target.value)} placeholder={t('checksum.to')} />
                </div>
              </div>
              <HexDump bytes={activeBytes} highlights={hlRange} />
            </div>
          )}

          {error && <div className={s.error}>{error}</div>}

          {/* Actions */}
          <div className={s.actions}>
            <Button variant="primary" onClick={computeAll} disabled={computing || !activeBytes}>
              {computing ? t('checksum.computing') : t('checksum.computeAll')}
            </Button>
            <Button onClick={computeSingle} disabled={computing || !activeBytes}>
              {isCustomAlgo
                ? (customChecksums.find(c => `custom:${c.id}` === selectedAlgo)?.name || t('checksum.customUntitled'))
                : (CHECKSUM_PRESETS.find(p => p.id === selectedAlgo)?.label ?? t('checksum.selectedAlgo'))
              }
            </Button>
          </div>
        </div>

        {/* Right: Results */}
        <div className={s.results}>
          <div className={s.resultsHeader}>
            <h2 className={s.resultsTitle}>{t('checksum.resultsTitle')}</h2>
            {results.length > 0 && (
              <button className={s.clearBtn} onClick={() => setResults([])}>{t('checksum.clear')}</button>
            )}
          </div>

          {results.length === 0 ? (
            <div className={s.emptyResults}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="18" cy="18" r="13"/>
                <path d="M13 18h10M18 13v10"/>
              </svg>
              <span>{t('checksum.noResults')}</span>
              <span className={s.emptyHint}>{t('checksum.noResultsHint')}</span>
            </div>
          ) : (
            <div className={s.resultList}>
              {/* Custom results group */}
              {(() => {
                const customResults = results.filter(r => r.algorithm.startsWith('custom:'));
                if (customResults.length === 0) return null;
                return (
                  <div className={s.resultGroup}>
                    <div className={s.resultGroupLabel}>{t('checksum.customGroup')}</div>
                    {customResults.map(r => {
                      const cs = customChecksums.find(c => `custom:${c.id}` === r.algorithm);
                      return (
                        <div key={r.algorithm} className={`${s.resultItem} ${selectedAlgo === r.algorithm ? s.resultItemActive : ''}`}>
                          <div className={s.resultAlgo}>{cs?.name || t('checksum.customUntitled')}</div>
                          <div className={s.resultValues}>
                            <code className={`${s.resultHex} ${r.hex === 'ERR' ? s.resultErr : ''}`}>
                              {r.hex === 'ERR' ? 'ERR' : `0x${r.hex}`}
                            </code>
                            {r.hex !== 'ERR' && <span className={s.resultDec}>{r.value}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {/* Built-in groups */}
              {GROUPS.map(group => {
                const groupResults = results.filter(r => {
                  const preset = CHECKSUM_PRESETS.find(p => p.id === r.algorithm || p.label === r.algorithm);
                  return preset?.group === group;
                });
                if (groupResults.length === 0) return null;
                return (
                  <div key={group} className={s.resultGroup}>
                    <div className={s.resultGroupLabel}>{group}</div>
                    {groupResults.map(r => (
                      <div key={r.algorithm} className={`${s.resultItem} ${selectedAlgo === r.algorithm ? s.resultItemActive : ''}`}>
                        <div className={s.resultAlgo}>{r.algorithm}</div>
                        <div className={s.resultValues}>
                          <code className={s.resultHex}>{r.hex}</code>
                          <span className={s.resultDec}>{r.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {/* Unknown algorithm results */}
              {results
                .filter(r => !CHECKSUM_PRESETS.find(p => p.id === r.algorithm || p.label === r.algorithm) && !r.algorithm.startsWith('custom:'))
                .map(r => (
                  <div key={r.algorithm} className={s.resultItem}>
                    <div className={s.resultAlgo}>{r.algorithm}</div>
                    <div className={s.resultValues}>
                      <code className={s.resultHex}>{r.hex}</code>
                      <span className={s.resultDec}>{r.value}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* Algo info / Custom editor panel */}
          <div className={s.algoInfo}>
            {isCustomAlgo && editingCustomId ? (
              <>
                <SectionHeading>{t('checksum.customEditor')}</SectionHeading>
                <div className={s.customEditorCard}>
                  <div className={s.customField}>
                    <label className={s.customLabel}>{t('checksum.customName')}</label>
                    <input
                      className={s.customNameInput}
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder={t('checksum.customUntitled')}
                    />
                  </div>
                  <div className={s.customField}>
                    <label className={s.customLabel}>{t('checksum.customCode')}</label>
                    <div className={s.codeWrapper}>
                      <CodeMirror
                        value={customCode}
                        height="220px"
                        onChange={value => { setCustomCode(value); setCustomTestResult(null); }}
                        extensions={[javascript()]}
                        theme={isDark ? oneDark : undefined}
                        className={s.cmEditor}
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: false,
                          dropCursor: false,
                          allowMultipleSelections: false,
                          indentOnInput: true,
                          closeBrackets: true,
                          autocompletion: false,
                        }}
                        style={{ fontSize: '12px' }}
                      />
                    </div>
                    <div className={s.codeHint}>{t('checksum.customCodeHint')}</div>
                  </div>
                  {customTestResult && (
                    <div className={`${s.testResult} ${customTestResult.ok ? s.testOk : s.testErr}`}>
                      {customTestResult.ok ? t('checksum.customResult') : t('checksum.customError')}
                      {customTestResult.msg}
                    </div>
                  )}
                  <div className={s.customActions}>
                    <button className={s.customTestBtn} onClick={testCustom}>{t('checksum.customTest')}</button>
                    <button className={s.customSaveBtn} onClick={saveCustom}>{t('checksum.customSave')}</button>
                    <button className={s.customCancelBtn} onClick={cancelCustom}>{t('checksum.customCancel')}</button>
                    {!isNewCustom && (
                      <button className={s.customDeleteBtn} onClick={() => deleteCustom(editingCustomId)}>{t('checksum.customDelete')}</button>
                    )}
                  </div>
                </div>
              </>
            ) : isCustomAlgo && !editingCustomId ? (
              // Custom algo selected but editor closed — show saved summary + Edit button
              (() => {
                const cs = customChecksums.find(c => `custom:${c.id}` === selectedAlgo);
                if (!cs) return null;
                return (
                  <>
                    <SectionHeading>{t('checksum.customEditor')}</SectionHeading>
                    <div className={s.algoCard}>
                      <div className={s.algoName}>{cs.name || t('checksum.customUntitled')}</div>
                      <div className={s.algoGroup}>{t('checksum.customGroup')}</div>
                      <div className={s.algoDesc} style={{ fontFamily: 'var(--mono)', fontSize: '11px', opacity: 0.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {cs.code.slice(0, 120)}{cs.code.length > 120 ? '…' : ''}
                      </div>
                    </div>
                    <button className={s.customTestBtn} style={{ marginTop: 10 }} onClick={() => openCustomEditor(cs)}>
                      {t('checksum.customEdit') ?? '편집'}
                    </button>
                  </>
                );
              })()
            ) : !isCustomAlgo && selectedAlgo ? (
              <>
                <SectionHeading>{t('checksum.algoInfo')}</SectionHeading>
                {(() => {
                  const p = CHECKSUM_PRESETS.find(c => c.id === selectedAlgo);
                  if (!p) return null;
                  return (
                    <div className={s.algoCard}>
                      <div className={s.algoName}>{p.label}</div>
                      <div className={s.algoGroup}>{p.group}</div>
                      <div className={s.algoDesc}>{csumDesc(p.id, p.desc, t)}</div>
                    </div>
                  );
                })()}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <StatusBar
        left={
          <>
            <StatusChip dot={results.length > 0 ? 'var(--brand)' : 'var(--ink-dim)'}>
              {results.length > 0 ? `${results.length}${t('checksum.resultCount')}` : t('checksum.waiting')}
            </StatusChip>
            <StatusSep />
            {activeBytes && <span>{activeBytes.length}{t('checksum.bytesInput')}</span>}
          </>
        }
        right={
          <span>
            {t('checksum.selectedAlgo')}: {
              isCustomAlgo
                ? (customChecksums.find(c => `custom:${c.id}` === selectedAlgo)?.name || t('checksum.customUntitled'))
                : (CHECKSUM_PRESETS.find(p => p.id === selectedAlgo)?.label ?? selectedAlgo)
            }
          </span>
        }
      />
    </div>
  );
}
