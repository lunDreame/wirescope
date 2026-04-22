import { useState } from 'react';
import s from './Checksum.module.css';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Badge';
import { HexDump } from '../../shared/ui/HexDump';
import { useApp } from '../../app/store';
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

export function ChecksumPage() {
  const { state } = useApp();
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
    if (!activeBytes) { setError('올바른 16진수를 입력하세요'); return; }
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
    if (!activeBytes) { setError('올바른 16진수를 입력하세요'); return; }
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
            <h2 className={s.libTitle}>체크섬 라이브러리</h2>
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
                  <span className={s.libItemDesc}>{p.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Center: Editor */}
        <div className={s.editor}>
          <div className={s.editorHeader}>
            <h2 className={s.editorTitle}>체크섬 계산기</h2>
            <p className={s.editorSub}>16진수 바이트를 입력하고 다양한 알고리즘으로 계산합니다</p>
          </div>

          {/* Input mode */}
          <div className={s.inputModeTabs}>
            <button
              className={`${s.modeTab} ${inputMode === 'hex' ? s.modeTabActive : ''}`}
              onClick={() => setInputMode('hex')}
            >직접 입력</button>
            <button
              className={`${s.modeTab} ${inputMode === 'packet' ? s.modeTabActive : ''}`}
              onClick={() => setInputMode('packet')}
            >패킷에서 선택</button>
          </div>

          {inputMode === 'hex' ? (
            <div className={s.hexEditor}>
              <SectionHeading>16진수 입력</SectionHeading>
              <textarea
                className={s.hexTextarea}
                value={hexInput}
                onChange={e => setHexInput(e.target.value)}
                placeholder="16진수 바이트를 공백으로 구분하여 입력&#10;예: 68 01 00 16"
                spellCheck={false}
              />
              <div className={s.inputMeta}>
                {bytes
                  ? <span>{bytes.length}바이트 · {bytes.reduce((a, b) => a + b, 0).toString(16).toUpperCase().padStart(4, '0')} 합계</span>
                  : <span className={s.inputError}>올바르지 않은 16진수 입력</span>
                }
              </div>
            </div>
          ) : (
            <div className={s.packetPicker}>
              <SectionHeading>패킷 선택</SectionHeading>
              {state.packets.length === 0 ? (
                <div className={s.emptyPicker}>수신된 패킷이 없습니다</div>
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
                <SectionHeading>HEX 덤프</SectionHeading>
                <div className={s.rangeInputs}>
                  <label className={s.rangeLabel}>강조 범위</label>
                  <input className={s.rangeInp} value={highlightFrom}
                    onChange={e => setHighlightFrom(e.target.value)} placeholder="시작" />
                  <span className={s.rangeSep}>–</span>
                  <input className={s.rangeInp} value={highlightTo}
                    onChange={e => setHighlightTo(e.target.value)} placeholder="끝" />
                </div>
              </div>
              <HexDump bytes={activeBytes} highlights={hlRange} />
            </div>
          )}

          {error && <div className={s.error}>{error}</div>}

          {/* Actions */}
          <div className={s.actions}>
            <Button variant="primary" onClick={computeAll} disabled={computing || !activeBytes}>
              {computing ? '계산 중…' : '전체 알고리즘 계산'}
            </Button>
            <Button onClick={computeSingle} disabled={computing || !activeBytes}>
              {CHECKSUM_PRESETS.find(p => p.id === selectedAlgo)?.label ?? '선택된 알고리즘'} 계산
            </Button>
          </div>
        </div>

        {/* Right: Results */}
        <div className={s.results}>
          <div className={s.resultsHeader}>
            <h2 className={s.resultsTitle}>계산 결과</h2>
            {results.length > 0 && (
              <button className={s.clearBtn} onClick={() => setResults([])}>지우기</button>
            )}
          </div>

          {results.length === 0 ? (
            <div className={s.emptyResults}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="18" cy="18" r="13"/>
                <path d="M13 18h10M18 13v10"/>
              </svg>
              <span>계산 결과가 없습니다</span>
              <span className={s.emptyHint}>바이트를 입력하고 계산 버튼을 누르세요</span>
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
              <SectionHeading>알고리즘 정보</SectionHeading>
              {(() => {
                const p = CHECKSUM_PRESETS.find(c => c.id === selectedAlgo);
                if (!p) return null;
                return (
                  <div className={s.algoCard}>
                    <div className={s.algoName}>{p.label}</div>
                    <div className={s.algoGroup}>{p.group}</div>
                    <div className={s.algoDesc}>{p.desc}</div>
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
              {results.length > 0 ? `${results.length}개 결과` : '대기 중'}
            </StatusChip>
            <StatusSep />
            {activeBytes && <span>{activeBytes.length}바이트 입력됨</span>}
          </>
        }
        right={<span>선택된 알고리즘: {CHECKSUM_PRESETS.find(p => p.id === selectedAlgo)?.label ?? selectedAlgo}</span>}
      />
    </div>
  );
}
