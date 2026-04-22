import { useState } from 'react';
import s from './Checksum.module.css';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Badge';
import { HexDump } from '../../shared/ui/HexDump';
import { useApp } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import * as api from '../../shared/api/tauri';
import { CHECKSUM_PRESETS } from '../../shared/config/tokens';
import type { ChecksumResult } from '../../shared/types';

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

export function ChecksumPage() {
  const { state } = useApp();
  const t = useT();
  const [hexInput, setHexInput] = useState('');
  const [results, setResults] = useState<ChecksumResult[]>([]);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAlgo, setSelectedAlgo] = useState('crc16-modbus');
  const [inputMode, setInputMode] = useState<'hex' | 'packet'>('hex');
  const [selectedPacketId, setSelectedPacketId] = useState<number | null>(null);
  const [highlightFrom, setHighlightFrom] = useState('');
  const [highlightTo, setHighlightTo] = useState('');

  const bytes = parseHexBytes(hexInput);
  const activeBytes = inputMode === 'packet' && selectedPacketId !== null
    ? state.packets.find(p => p.id === selectedPacketId)?.bytes ?? null
    : bytes;

  function toHexString(bytes: number[]) {
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function computeAll() {
    if (!activeBytes) { setError(t('checksum.invalidInput')); return; }
    setComputing(true); setError('');
    try {
      const res = await api.computeAllChecksums(toHexString(activeBytes));
      setResults(res);
    } catch (e: any) {
      setError(String(e));
    }
    setComputing(false);
  }

  async function computeSingle() {
    if (!activeBytes) { setError(t('checksum.invalidInput')); return; }
    setComputing(true); setError('');
    try {
      const res = await api.computeChecksum(selectedAlgo, toHexString(activeBytes));
      setResults(prev => {
        const idx = prev.findIndex(r => r.algorithm === res.algorithm);
        if (idx >= 0) { const next = [...prev]; next[idx] = res; return next; }
        return [...prev, res];
      });
    } catch (e: any) {
      setError(String(e));
    }
    setComputing(false);
  }

  function loadFromPacket(id: number) {
    const pkt = state.packets.find(p => p.id === id);
    if (!pkt) return;
    setHexInput(pkt.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
    setInputMode('hex');
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
          {grouped.map(({ group, items }) => (
            <div key={group} className={s.libGroup}>
              <div className={s.libGroupLabel}>{group}</div>
              {items.map(p => (
                <button
                  key={p.id}
                  className={`${s.libItem} ${selectedAlgo === p.id ? s.libItemActive : ''}`}
                  onClick={() => setSelectedAlgo(p.id)}
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
                  : <span className={s.inputError}>{t('checksum.invalidHex')}</span>
                }
              </div>
            </div>
          ) : (
            <div className={s.packetPicker}>
              <SectionHeading>{t('checksum.packetSelect')}</SectionHeading>
              {state.packets.length === 0 ? (
                <div className={s.emptyPicker}>{t('checksum.noPackets')}</div>
              ) : (
                <div className={s.pickerList}>
                  {state.packets.slice(-20).reverse().map(pkt => (
                    <button
                      key={pkt.id}
                      className={`${s.pickerItem} ${selectedPacketId === pkt.id ? s.pickerItemActive : ''}`}
                      onClick={() => { setSelectedPacketId(pkt.id); loadFromPacket(pkt.id); }}
                    >
                      <Badge variant={pkt.direction === 'TX' ? 'tx' : 'rx'}>{pkt.direction}</Badge>
                      <span className={s.pickerBytes}>{pkt.bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}{pkt.bytes.length > 8 ? '…' : ''}</span>
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
              {CHECKSUM_PRESETS.find(p => p.id === selectedAlgo)?.label ?? t('checksum.selectedAlgo')}
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
              {/* Results not matching known groups */}
              {results.filter(r => !CHECKSUM_PRESETS.find(p => p.id === r.algorithm || p.label === r.algorithm)).map(r => (
                <div key={r.algorithm} className={s.resultItem}>
                  <div className={s.resultAlgo}>{r.algorithm}</div>
                  <div className={s.resultValues}>
                    <code className={s.resultHex}>{r.hex}</code>
                    <span className={s.resultDec}>{r.value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick reference */}
          {selectedAlgo && (
            <div className={s.algoInfo}>
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
            </div>
          )}
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
        right={<span>{t('checksum.selectedAlgo')}: {CHECKSUM_PRESETS.find(p => p.id === selectedAlgo)?.label ?? selectedAlgo}</span>}
      />
    </div>
  );
}
