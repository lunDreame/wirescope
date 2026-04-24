import { useState, useEffect } from 'react';
import { NumericInput } from '../../shared/ui/Input';
import { useSessionPackets } from '../../app/store';
import s from './Splitter.module.css';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { Badge } from '../../shared/ui/Badge';
import { useApp, useCustomChecksums } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import * as api from '../../shared/api/tauri';
import { CHECKSUM_PRESETS } from '../../shared/config/tokens';
import type { SplitterConfig } from '../../shared/types';

const DEFAULT_CONFIG: SplitterConfig = {
  method: 'delimiter',
  regex_pattern: '',
  sof: [],
  eof: [],
  eof_include: true,
  gap_ms: 3.5,
  length_field_offset: 2,
  length_field_size: 2,
  length_includes_header: false,
  min_packet_size: 6,
  max_packet_size: 256,
  checksum_algorithm: '',
  checksum_offset: -1,
  checksum_size: 1,
  checksum_exclude_sof: false,
  mark_errors: true,
  resync_on_error: true,
  discard_on_disconnect: false,
  inner_gap_warn_ms: 500,
};

function hexStr(bytes: number[]) {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function parseHexInput(s: string): number[] {
  return s.trim().split(/[\s,]+/)
    .filter(Boolean)
    .map(h => parseInt(h, 16))
    .filter(n => !isNaN(n) && n >= 0 && n <= 0xff);
}

export function SplitterPage() {
  const { state, dispatch } = useApp();
  const customChecksums = useCustomChecksums();
  const t = useT();

  const METHODS = [
    { value: 'delimiter',    label: t('splitter.delimiter') },
    { value: 'length_field', label: t('splitter.lengthField') },
    { value: 'gap',          label: t('splitter.gap') },
    { value: 'regex',        label: t('splitter.regex') },
  ] as const;
  const sessionPackets = useSessionPackets();
  // cfg lives in the global store so edits survive tab navigation
  const cfg: SplitterConfig = state.splitterDraft ?? state.splitter ?? DEFAULT_CONFIG;
  const saved = state.splitterDraft === null;
  const [sofHex, setSofHex] = useState(() => hexStr(cfg.sof));
  const [eofHex, setEofHex] = useState(() => hexStr(cfg.eof));
  // gap unit: display in µs / ms / s, internally always stored as ms
  const [gapUnit, setGapUnit] = useState<'µs' | 'ms' | 's'>('ms');

  // When the active session changes, the applied splitter also changes.
  // Sync the hex text inputs to reflect the new session's values.
  // Only sync when there's no pending draft (user hasn't started editing yet).
  const activeSessionId = state.activeSessionId;
  useEffect(() => {
    if (state.splitterDraft === null) {
      setSofHex(hexStr(state.splitter.sof));
      setEofHex(hexStr(state.splitter.eof));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, state.splitter]);

  const previewPackets = sessionPackets.slice(-8).map(p => p.bytes);

  function update(patch: Partial<SplitterConfig>) {
    dispatch({ type: 'SET_SPLITTER_DRAFT', config: { ...cfg, ...patch } });
  }

  async function apply() {
    const next = {
      ...cfg,
      sof: parseHexInput(sofHex),
      eof: parseHexInput(eofHex),
    };
    await api.setSplitter(next);
    dispatch({ type: 'SET_SPLITTER', config: next }); // also clears splitterDraft
  }

  const sofDisplay = sofHex || t('splitter.none');
  const eofDisplay = eofHex || t('splitter.none');

  return (
    <div className={s.page}>
      <div className={s.body}>
        {/* Left: Config */}
        <div className={s.configPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>{t('splitter.title')}</h2>
            <p className={s.panelSub}>{t('splitter.subtitle')}</p>
          </div>

          {/* Method */}
          <div className={s.section}>
            <SectionHeading>{t('splitter.methodSection')}</SectionHeading>
            <div className={s.methodGrid}>
              {METHODS.map(m => (
                <button
                  key={m.value}
                  className={`${s.methodCard} ${cfg.method === m.value ? s.methodCardActive : ''}`}
                  onClick={() => update({ method: m.value as SplitterConfig['method'] })}
                >
                  <MethodIcon method={m.value as any} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Delimiter settings */}
          {cfg.method === 'delimiter' && (
            <div className={s.section}>
              <SectionHeading>{t('splitter.delimSection')}</SectionHeading>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.sofLabel')}</label>
                  <input
                    className={s.inp}
                    value={sofHex}
                    onChange={e => { setSofHex(e.target.value); dispatch({ type: 'SET_SPLITTER_DRAFT', config: { ...cfg, sof: parseHexInput(e.target.value) } }); }}
                    placeholder={t('splitter.sofPlaceholder')}
                    spellCheck={false}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.eofLabel')}</label>
                  <input
                    className={s.inp}
                    value={eofHex}
                    onChange={e => { setEofHex(e.target.value); dispatch({ type: 'SET_SPLITTER_DRAFT', config: { ...cfg, eof: parseHexInput(e.target.value) } }); }}
                    placeholder={t('splitter.eofPlaceholder')}
                    spellCheck={false}
                  />
                </div>
              </div>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.eof_include}
                  onChange={e => update({ eof_include: e.target.checked })} />
                <span>{t('splitter.eofInclude')}</span>
              </label>
            </div>
          )}

          {/* Length field settings */}
          {cfg.method === 'length_field' && (
            <div className={s.section}>
              <SectionHeading>{t('splitter.lenSection')}</SectionHeading>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.sofOptional')}</label>
                  <input className={s.inp} value={sofHex}
                    onChange={e => { setSofHex(e.target.value); dispatch({ type: 'SET_SPLITTER_DRAFT', config: { ...cfg, sof: parseHexInput(e.target.value) } }); }}
                    placeholder={t('splitter.skipPlaceholder')} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.lenOffset')}</label>
                  <input className={s.inpNum} type="text" inputMode="numeric" value={cfg.length_field_offset}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); update({ length_field_offset: v === '' ? 0 : parseInt(v, 10) }); }}
                    onFocus={e => e.target.select()} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.lenSize')}</label>
                  <SegmentedControl
                    size="sm"
                    options={[{ value: '1', label: '1B' }, { value: '2', label: '2B' }, { value: '4', label: '4B' }]}
                    value={String(cfg.length_field_size)}
                    onChange={v => update({ length_field_size: Number(v) })}
                  />
                </div>
              </div>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.length_includes_header}
                  onChange={e => update({ length_includes_header: e.target.checked })} />
                <span>{t('splitter.lenIncludesHeader')}</span>
              </label>
            </div>
          )}

          {/* Regex settings */}
          {cfg.method === 'regex' && (
            <div className={s.section}>
              <SectionHeading>{t('splitter.regexSection')}</SectionHeading>
              <div className={s.field}>
                <label className={s.label}>{t('splitter.regexPattern')}</label>
                <input
                  className={s.inp}
                  value={cfg.regex_pattern ?? ''}
                  onChange={e => update({ regex_pattern: e.target.value })}
                  placeholder={t('splitter.regexPlaceholder')}
                  spellCheck={false}
                />
              </div>
              <div className={s.regexHintBox}>
                <span>{t('splitter.regexHintExamples')}</span>
              </div>
            </div>
          )}

          {/* Gap settings */}
          {cfg.method === 'gap' && (
            <div className={s.section}>
              <SectionHeading>{t('splitter.gapSection')}</SectionHeading>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.gapThreshold')}</label>
                  <div className={s.inlineRow}>
                    <NumericInput className={s.inpNum} allowFloat
                      value={
                        gapUnit === 'µs' ? +(cfg.gap_ms * 1000).toPrecision(6) :
                        gapUnit === 's'  ? +(cfg.gap_ms / 1000).toPrecision(6) :
                        cfg.gap_ms
                      }
                      onChange={v => update({
                        gap_ms: gapUnit === 'µs' ? v / 1000 :
                                gapUnit === 's'  ? v * 1000 : v
                      })} />
                    <select className={s.sel} style={{ width: 52, padding: '0 4px' }}
                      value={gapUnit}
                      onChange={e => setGapUnit(e.target.value as 'µs' | 'ms' | 's')}>
                      <option value="µs">µs</option>
                      <option value="ms">ms</option>
                      <option value="s">s</option>
                    </select>
                  </div>
                </div>
                <div className={s.field}>
                  <label className={s.label}>{t('splitter.innerGapWarn')}</label>
                  <div className={s.inlineRow}>
                    <NumericInput className={s.inpNum} value={cfg.inner_gap_warn_ms} allowFloat
                      onChange={v => update({ inner_gap_warn_ms: v })} />
                    <span className={s.unit}>ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Size limits */}
          <div className={s.section}>
            <SectionHeading>{t('splitter.sizeLimits')}</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>{t('splitter.minSize')}</label>
                <div className={s.inlineRow}>
                  <input className={s.inpNum} type="text" inputMode="numeric" value={cfg.min_packet_size}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); update({ min_packet_size: v === '' ? 0 : parseInt(v, 10) }); }}
                    onFocus={e => e.target.select()} />
                  <span className={s.unit}>B</span>
                </div>
              </div>
              <div className={s.field}>
                <label className={s.label}>{t('splitter.maxSize')}</label>
                <div className={s.inlineRow}>
                  <input className={s.inpNum} type="text" inputMode="numeric" value={cfg.max_packet_size}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); update({ max_packet_size: v === '' ? 0 : parseInt(v, 10) }); }}
                    onFocus={e => e.target.select()} />
                  <span className={s.unit}>B</span>
                </div>
              </div>
            </div>
          </div>

          {/* Checksum */}
          <div className={s.section}>
            <SectionHeading>{t('splitter.csumSection')}</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>{t('splitter.csumAlgo')}</label>
                <select className={s.sel} value={cfg.checksum_algorithm}
                  onChange={e => update({ checksum_algorithm: e.target.value })}>
                  <option value="">{t('splitter.csumNone')}</option>
                  {CHECKSUM_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                  {customChecksums.length > 0 && (
                    <optgroup label="Custom">
                      {customChecksums.map(cs => (
                        <option key={cs.id} value={`custom:${cs.id}`}>{cs.name || '(unnamed)'}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              {cfg.checksum_algorithm && (
                <>
                  <div className={s.field}>
                    <label className={s.label}>{t('splitter.csumOffset')}</label>
                    <div className={s.inlineRow}>
                      <NumericInput className={s.inpNum} value={cfg.checksum_offset} allowNegative
                        onChange={v => update({ checksum_offset: v })} />
                      <span className={s.unit}>B</span>
                      {(() => {
                        const liveEof = parseHexInput(eofHex);
                        return liveEof.length > 0 && (
                          <button
                            className={s.autoDetectBtn}
                            type="button"
                            title={t('splitter.csumAutoDetectTip')}
                            onClick={() => update({ checksum_offset: -(liveEof.length + 1), checksum_size: 1 })}
                          >
                            {t('splitter.csumAutoDetect')}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>{t('splitter.csumSize')}</label>
                    <div className={s.inlineRow}>
                      <input className={s.inpNum} type="text" inputMode="numeric" value={cfg.checksum_size}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); update({ checksum_size: v === '' ? 0 : parseInt(v, 10) }); }}
                        onFocus={e => e.target.select()} />
                      <span className={s.unit}>B</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            {cfg.checksum_algorithm && parseHexInput(sofHex).length > 0 && (
              <label className={s.checkRow} style={{ marginTop: 6 }}>
                <input type="checkbox"
                  checked={!!cfg.checksum_exclude_sof}
                  onChange={e => update({ checksum_exclude_sof: e.target.checked })}
                />
                <span>{t('splitter.csumExcludeSof')}</span>
              </label>
            )}
          </div>

          {/* Error handling */}
          <div className={s.section}>
            <SectionHeading>{t('splitter.errSection')}</SectionHeading>
            <div className={s.checkList}>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.mark_errors}
                  onChange={e => update({ mark_errors: e.target.checked })} />
                <span>{t('splitter.markErrors')}</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.resync_on_error}
                  onChange={e => update({ resync_on_error: e.target.checked })} />
                <span>{t('splitter.resync')}</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.discard_on_disconnect}
                  onChange={e => update({ discard_on_disconnect: e.target.checked })} />
                <span>{t('splitter.discardOnDisc')}</span>
              </label>
            </div>
          </div>

          <div className={s.actions}>
            <Button variant="primary" onClick={apply}>
              {saved ? t('splitter.applied') : t('splitter.apply')}
            </Button>
            <Button onClick={async () => {
              if (!window.confirm(t('splitter.resetConfirm'))) return;
              setSofHex(hexStr(DEFAULT_CONFIG.sof));
              setEofHex(hexStr(DEFAULT_CONFIG.eof));
              await api.setSplitter(DEFAULT_CONFIG);
              dispatch({ type: 'SET_SPLITTER', config: DEFAULT_CONFIG }); // also clears splitterDraft
            }}>{t('splitter.reset')}</Button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className={s.previewPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>{t('splitter.previewTitle')}</h2>
            <p className={s.panelSub}>{t('splitter.previewSub')}</p>
          </div>

          {/* Current config summary */}
          <div className={s.cfgSummary}>
            <div className={s.cfgRow}>
              <span className={s.cfgKey}>{t('splitter.method')}</span>
              <Badge>{METHODS.find(m => m.value === cfg.method)?.label}</Badge>
            </div>
            {cfg.method === 'delimiter' && (
              <>
                <div className={s.cfgRow}>
                  <span className={s.cfgKey}>SOF</span>
                  <code className={s.cfgVal}>{sofDisplay}</code>
                </div>
                <div className={s.cfgRow}>
                  <span className={s.cfgKey}>EOF</span>
                  <code className={s.cfgVal}>{eofDisplay}</code>
                </div>
              </>
            )}
            {cfg.method === 'length_field' && (
              <div className={s.cfgRow}>
                <span className={s.cfgKey}>{t('splitter.lenOffsetDisplay')}</span>
                <code className={s.cfgVal}>{cfg.length_field_offset}B + {cfg.length_field_size}B</code>
              </div>
            )}
            {cfg.method === 'gap' && (
              <div className={s.cfgRow}>
                <span className={s.cfgKey}>{t('splitter.gapShort')}</span>
                <code className={s.cfgVal}>
                  {gapUnit === 'µs' ? `${+(cfg.gap_ms * 1000).toPrecision(4)}µs` :
                   gapUnit === 's'  ? `${+(cfg.gap_ms / 1000).toPrecision(4)}s` :
                   `${cfg.gap_ms}ms`}
                </code>
              </div>
            )}
            {cfg.method === 'regex' && (
              <div className={s.cfgRow}>
                <span className={s.cfgKey}>{t('splitter.regexPattern')}</span>
                <code className={s.cfgVal}>{cfg.regex_pattern || t('splitter.none')}</code>
              </div>
            )}
            <div className={s.cfgRow}>
              <span className={s.cfgKey}>{t('splitter.sizeRange')}</span>
              <code className={s.cfgVal}>{cfg.min_packet_size}–{cfg.max_packet_size}B</code>
            </div>
            {cfg.checksum_algorithm && (
              <div className={s.cfgRow}>
                <span className={s.cfgKey}>{t('splitter.csumSection')}</span>
                <code className={s.cfgVal}>{cfg.checksum_algorithm}</code>
              </div>
            )}
          </div>

          {/* Packet preview */}
          <div className={s.previewSection}>
            <SectionHeading
              right={<span className={s.previewCount}>{previewPackets.length} pkts</span>}
            >
              {t('splitter.packetPreview')}
            </SectionHeading>

            {previewPackets.length === 0 ? (
              <div className={s.emptyPreview}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="4" y="14" width="32" height="12" rx="3"/>
                  <path d="M10 20h4M18 20h4M26 20h4"/>
                </svg>
                <span>{t('splitter.noPackets')}</span>
                <span className={s.emptyHint}>{t('splitter.noPacketsHint')}</span>
              </div>
            ) : (
              <div className={s.packetList}>
                {previewPackets.map((bytes, i) => (
                  <PreviewPacket key={i} index={i} bytes={bytes} cfg={cfg} sofBytes={parseHexInput(sofHex)} eofBytes={parseHexInput(eofHex)} />
                ))}
              </div>
            )}
          </div>

          {/* Visual diagram */}
          <div className={s.diagramSection}>
            <SectionHeading>{t('splitter.diagram')}</SectionHeading>
            <PacketDiagram cfg={cfg} sofHex={sofHex} eofHex={eofHex} gapUnit={gapUnit} />
          </div>
        </div>
      </div>

      <StatusBar
        left={
          <>
            <StatusChip dot={saved ? 'var(--ok)' : 'var(--ink-dim)'}>
              {saved ? t('splitter.statusApplied') : t('splitter.statusPending')}
            </StatusChip>
            <StatusSep />
            <span>{sessionPackets.length.toLocaleString()}{t('splitter.packetsMethod')}{METHODS.find(m => m.value === cfg.method)?.label}</span>
          </>
        }
        right={<span>{t('splitter.statusRight')}</span>}
      />
    </div>
  );
}

function MethodIcon({ method }: { method: SplitterConfig['method'] }) {
  if (method === 'delimiter') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="4" width="14" height="10" rx="2"/>
      <path d="M5 9h2M9 9h2M13 9h2"/>
    </svg>
  );
  if (method === 'length_field') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="4" width="4" height="10" rx="1"/>
      <rect x="7" y="4" width="9" height="10" rx="1"/>
      <path d="M4 9h1M11.5 9h1"/>
    </svg>
  );
  if (method === 'gap') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="6" width="5" height="6" rx="1"/>
      <rect x="12" y="6" width="5" height="6" rx="1"/>
      <path d="M7 9h4" strokeDasharray="1.5 1.5"/>
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3 9h2M7 5l4 4-4 4M13 9h2"/>
    </svg>
  );
}

function PreviewPacket({ index, bytes, cfg, sofBytes, eofBytes }: {
  index: number;
  bytes: number[];
  cfg: SplitterConfig;
  sofBytes: number[];
  eofBytes: number[];
}) {
  const t = useT();
  const hasError = cfg.checksum_algorithm ? bytes.length < (cfg.min_packet_size ?? 0) : false;
  return (
    <div className={`${s.previewPkt} ${hasError ? s.previewPktErr : ''}`}>
      <div className={s.previewPktHead}>
        <span className={s.previewPktIdx}>#{index + 1}</span>
        <span className={s.previewPktLen}>{bytes.length}B</span>
        {hasError && <Badge variant="err">{t('splitter.error')}</Badge>}
      </div>
      <div className={s.previewPktBytes}>
        {bytes.slice(0, 24).map((b, i) => {
          const isSof = sofBytes.length > 0 && i < sofBytes.length && sofBytes[i] === bytes[i];
          const eofLen = eofBytes.length;
          const eofMatch = eofLen > 0 && bytes.length >= eofLen &&
            bytes.slice(bytes.length - eofLen).every((eb, j) => eb === eofBytes[j]);
          const isEof = eofMatch && i >= bytes.length - eofLen;
          const csOffset = cfg.checksum_offset;
          const csStart = csOffset < 0 ? bytes.length + csOffset : csOffset;
          const isCs = !!(cfg.checksum_algorithm && cfg.checksum_algorithm !== '' &&
            csStart >= 0 && i >= csStart && i < csStart + cfg.checksum_size);
          return (
            <span key={i} className={`${s.hexByte} ${isSof ? s.hexSof : ''} ${isEof ? s.hexEof : ''} ${isCs ? s.hexCs : ''}`}>
              {b.toString(16).padStart(2, '0').toUpperCase()}
            </span>
          );
        })}
        {bytes.length > 24 && <span className={s.hexMore}>+{bytes.length - 24}B</span>}
      </div>
    </div>
  );
}

function PacketDiagram({ cfg, sofHex, eofHex, gapUnit = 'ms' }: { cfg: SplitterConfig; sofHex: string; eofHex: string; gapUnit?: 'µs' | 'ms' | 's' }) {
  const t = useT();
  const method = cfg.method;

  if (method === 'delimiter') {
    const sof = sofHex.trim() || '??';
    const eof = eofHex.trim() || '??';
    return (
      <div className={s.diagram}>
        <div className={s.diagramRow}>
          <div className={`${s.diagramBlock} ${s.diagramSof}`}><span>SOF</span><code>{sof}</code></div>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>{t('splitter.data')}</span><code>…</code></div>
          <div className={`${s.diagramBlock} ${s.diagramEof}`}><span>EOF</span><code>{eof}</code></div>
        </div>
        <p className={s.diagramHint}>
          {cfg.eof_include ? t('splitter.eofIncluded') : t('splitter.eofExcluded')} · min {cfg.min_packet_size}B · max {cfg.max_packet_size}B
        </p>
      </div>
    );
  }

  if (method === 'length_field') {
    return (
      <div className={s.diagram}>
        <div className={s.diagramRow}>
          {cfg.length_field_offset > 0 && (
            <div className={`${s.diagramBlock} ${s.diagramHeader}`}>
              <span>{t('splitter.header')}</span><code>{cfg.length_field_offset}B</code>
            </div>
          )}
          <div className={`${s.diagramBlock} ${s.diagramLen}`}>
            <span>{t('splitter.length')}</span><code>{cfg.length_field_size}B</code>
          </div>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>{t('splitter.data')}</span><code>…</code></div>
        </div>
        <p className={s.diagramHint}>
          {cfg.length_includes_header ? t('splitter.lenWithHeader') : t('splitter.lenDataOnly')} · max {cfg.max_packet_size}B
        </p>
      </div>
    );
  }

  if (method === 'gap') {
    return (
      <div className={s.diagram}>
        <div className={s.diagramRow}>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>Pkt A</span><code>…</code></div>
          <div className={s.diagramGapLabel}>≥ {
            gapUnit === 'µs' ? `${+(cfg.gap_ms * 1000).toPrecision(4)}µs` :
            gapUnit === 's'  ? `${+(cfg.gap_ms / 1000).toPrecision(4)}s` :
            `${cfg.gap_ms}ms`
          }{t('splitter.silence')}</div>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>Pkt B</span><code>…</code></div>
        </div>
        <p className={s.diagramHint}>{t('splitter.gapBoundary')}{cfg.inner_gap_warn_ms}ms</p>
      </div>
    );
  }

  return (
    <div className={s.diagram}>
      <p className={s.diagramHint}>{t('splitter.regexHint')}</p>
    </div>
  );
}
