import { useState, useEffect } from 'react';
import s from './Splitter.module.css';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { Badge } from '../../shared/ui/Badge';
import { useApp } from '../../app/store';
import * as api from '../../shared/api/tauri';
import { CHECKSUM_PRESETS } from '../../shared/config/tokens';
import type { SplitterConfig } from '../../shared/types';

const DEFAULT_CONFIG: SplitterConfig = {
  method: 'delimiter',
  sof: [],
  eof: [],
  eof_include: true,
  gap_ms: 10,
  length_field_offset: 1,
  length_field_size: 1,
  length_includes_header: false,
  min_packet_size: 4,
  max_packet_size: 256,
  checksum_algorithm: '',
  checksum_offset: -2,
  checksum_size: 2,
  mark_errors: true,
  resync_on_error: true,
  discard_on_disconnect: false,
  inner_gap_warn_ms: 5,
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

const METHODS = [
  { value: 'delimiter',    label: 'SOF/EOF 구분자' },
  { value: 'length_field', label: '길이 필드' },
  { value: 'gap',          label: '간격 기반' },
  { value: 'regex',        label: '정규식' },
] as const;

export function SplitterPage() {
  const { state, dispatch } = useApp();
  const [cfg, setCfg] = useState<SplitterConfig>(state.splitter ?? DEFAULT_CONFIG);
  const [sofHex, setSofHex] = useState(hexStr(cfg.sof));
  const [eofHex, setEofHex] = useState(hexStr(cfg.eof));
  const [saved, setSaved] = useState(false);
  const [previewPackets, setPreviewPackets] = useState<number[][]>([]);

  // Redux state is the source of truth — Rust is synced on AppProvider mount

  useEffect(() => {
    // Build synthetic preview from last 8 packets
    const pkts = state.packets.slice(-8).map(p => p.bytes);
    setPreviewPackets(pkts);
  }, [state.packets]);

  function update(patch: Partial<SplitterConfig>) {
    setCfg(prev => ({ ...prev, ...patch }));
    setSaved(false);
  }

  async function apply() {
    const next = {
      ...cfg,
      sof: parseHexInput(sofHex),
      eof: parseHexInput(eofHex),
    };
    setCfg(next);
    await api.setSplitter(next);
    dispatch({ type: 'SET_SPLITTER', config: next });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const sofDisplay = sofHex || '(없음)';
  const eofDisplay = eofHex || '(없음)';

  return (
    <div className={s.page}>
      <div className={s.body}>
        {/* Left: Config */}
        <div className={s.configPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>스트림 분할기</h2>
            <p className={s.panelSub}>원시 바이트 스트림을 패킷 단위로 파싱합니다</p>
          </div>

          {/* Method */}
          <div className={s.section}>
            <SectionHeading>분할 방식</SectionHeading>
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
              <SectionHeading>구분자 설정</SectionHeading>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>SOF (패킷 시작)</label>
                  <input
                    className={s.inp}
                    value={sofHex}
                    onChange={e => { setSofHex(e.target.value); setSaved(false); }}
                    placeholder="예: 68 (16진수)"
                    spellCheck={false}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>EOF (패킷 끝)</label>
                  <input
                    className={s.inp}
                    value={eofHex}
                    onChange={e => { setEofHex(e.target.value); setSaved(false); }}
                    placeholder="예: 16 (16진수)"
                    spellCheck={false}
                  />
                </div>
              </div>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.eof_include}
                  onChange={e => update({ eof_include: e.target.checked })} />
                <span>EOF 바이트를 패킷에 포함</span>
              </label>
            </div>
          )}

          {/* Length field settings */}
          {cfg.method === 'length_field' && (
            <div className={s.section}>
              <SectionHeading>길이 필드 설정</SectionHeading>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>SOF (있으면)</label>
                  <input className={s.inp} value={sofHex}
                    onChange={e => { setSofHex(e.target.value); setSaved(false); }}
                    placeholder="비워두면 무시" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>길이 필드 오프셋</label>
                  <input className={s.inpNum} type="number" value={cfg.length_field_offset}
                    onChange={e => update({ length_field_offset: Number(e.target.value) })} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>길이 필드 크기 (바이트)</label>
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
                <span>길이에 헤더 포함</span>
              </label>
            </div>
          )}

          {/* Gap settings */}
          {cfg.method === 'gap' && (
            <div className={s.section}>
              <SectionHeading>간격 기반 설정</SectionHeading>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>패킷 간격 임계값</label>
                  <div className={s.inlineRow}>
                    <input className={s.inpNum} type="number" value={cfg.gap_ms}
                      onChange={e => update({ gap_ms: Number(e.target.value) })} />
                    <span className={s.unit}>ms</span>
                  </div>
                </div>
                <div className={s.field}>
                  <label className={s.label}>내부 간격 경고</label>
                  <div className={s.inlineRow}>
                    <input className={s.inpNum} type="number" value={cfg.inner_gap_warn_ms}
                      onChange={e => update({ inner_gap_warn_ms: Number(e.target.value) })} />
                    <span className={s.unit}>ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Size limits */}
          <div className={s.section}>
            <SectionHeading>패킷 크기 제한</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>최소 크기</label>
                <div className={s.inlineRow}>
                  <input className={s.inpNum} type="number" value={cfg.min_packet_size}
                    onChange={e => update({ min_packet_size: Number(e.target.value) })} />
                  <span className={s.unit}>B</span>
                </div>
              </div>
              <div className={s.field}>
                <label className={s.label}>최대 크기</label>
                <div className={s.inlineRow}>
                  <input className={s.inpNum} type="number" value={cfg.max_packet_size}
                    onChange={e => update({ max_packet_size: Number(e.target.value) })} />
                  <span className={s.unit}>B</span>
                </div>
              </div>
            </div>
          </div>

          {/* Checksum */}
          <div className={s.section}>
            <SectionHeading>체크섬 검증</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>알고리즘</label>
                <select className={s.sel} value={cfg.checksum_algorithm}
                  onChange={e => update({ checksum_algorithm: e.target.value })}>
                  <option value="">검증 안 함</option>
                  {CHECKSUM_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              {cfg.checksum_algorithm && (
                <>
                  <div className={s.field}>
                    <label className={s.label}>체크섬 오프셋</label>
                    <div className={s.inlineRow}>
                      <input className={s.inpNum} type="number" value={cfg.checksum_offset}
                        onChange={e => update({ checksum_offset: Number(e.target.value) })} />
                      <span className={s.unit}>B</span>
                    </div>
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>체크섬 크기</label>
                    <div className={s.inlineRow}>
                      <input className={s.inpNum} type="number" value={cfg.checksum_size}
                        onChange={e => update({ checksum_size: Number(e.target.value) })} />
                      <span className={s.unit}>B</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Error handling */}
          <div className={s.section}>
            <SectionHeading>오류 처리</SectionHeading>
            <div className={s.checkList}>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.mark_errors}
                  onChange={e => update({ mark_errors: e.target.checked })} />
                <span>체크섬 오류 패킷 표시 (빨간색)</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.resync_on_error}
                  onChange={e => update({ resync_on_error: e.target.checked })} />
                <span>오류 시 SOF 재동기화</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" checked={cfg.discard_on_disconnect}
                  onChange={e => update({ discard_on_disconnect: e.target.checked })} />
                <span>연결 끊김 시 불완전 패킷 폐기</span>
              </label>
            </div>
          </div>

          <div className={s.actions}>
            <Button variant="primary" onClick={apply}>
              {saved ? '✓ 적용됨' : '설정 적용'}
            </Button>
            <Button onClick={() => {
              setCfg(DEFAULT_CONFIG);
              setSofHex(hexStr(DEFAULT_CONFIG.sof));
              setEofHex(hexStr(DEFAULT_CONFIG.eof));
              setSaved(false);
            }}>초기화</Button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className={s.previewPanel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>라이브 미리보기</h2>
            <p className={s.panelSub}>최근 수신 패킷에 설정을 시뮬레이션합니다</p>
          </div>

          {/* Current config summary */}
          <div className={s.cfgSummary}>
            <div className={s.cfgRow}>
              <span className={s.cfgKey}>방식</span>
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
                <span className={s.cfgKey}>길이 오프셋</span>
                <code className={s.cfgVal}>{cfg.length_field_offset}B + {cfg.length_field_size}B</code>
              </div>
            )}
            {cfg.method === 'gap' && (
              <div className={s.cfgRow}>
                <span className={s.cfgKey}>간격</span>
                <code className={s.cfgVal}>{cfg.gap_ms}ms</code>
              </div>
            )}
            <div className={s.cfgRow}>
              <span className={s.cfgKey}>크기 범위</span>
              <code className={s.cfgVal}>{cfg.min_packet_size}–{cfg.max_packet_size}B</code>
            </div>
            {cfg.checksum_algorithm && (
              <div className={s.cfgRow}>
                <span className={s.cfgKey}>체크섬</span>
                <code className={s.cfgVal}>{cfg.checksum_algorithm}</code>
              </div>
            )}
          </div>

          {/* Packet preview */}
          <div className={s.previewSection}>
            <SectionHeading
              right={<span className={s.previewCount}>{previewPackets.length}개 패킷</span>}
            >
              패킷 미리보기
            </SectionHeading>

            {previewPackets.length === 0 ? (
              <div className={s.emptyPreview}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="4" y="14" width="32" height="12" rx="3"/>
                  <path d="M10 20h4M18 20h4M26 20h4"/>
                </svg>
                <span>수신된 패킷이 없습니다</span>
                <span className={s.emptyHint}>연결 후 수신하면 여기서 분할 결과를 확인할 수 있습니다</span>
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
            <SectionHeading>패킷 구조 다이어그램</SectionHeading>
            <PacketDiagram cfg={cfg} sofHex={sofHex} eofHex={eofHex} />
          </div>
        </div>
      </div>

      <StatusBar
        left={
          <>
            <StatusChip dot={saved ? 'var(--ok)' : 'var(--ink-dim)'}>
              {saved ? '설정 적용됨' : '미적용 변경사항'}
            </StatusChip>
            <StatusSep />
            <span>패킷 {state.packets.length.toLocaleString()}개 · 방식: {METHODS.find(m => m.value === cfg.method)?.label}</span>
          </>
        }
        right={<span>설정은 새로 수신되는 패킷에 적용됩니다</span>}
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
  const hasError = cfg.checksum_algorithm ? bytes.length < (cfg.min_packet_size ?? 0) : false;
  return (
    <div className={`${s.previewPkt} ${hasError ? s.previewPktErr : ''}`}>
      <div className={s.previewPktHead}>
        <span className={s.previewPktIdx}>#{index + 1}</span>
        <span className={s.previewPktLen}>{bytes.length}B</span>
        {hasError && <Badge variant="err">오류</Badge>}
      </div>
      <div className={s.previewPktBytes}>
        {bytes.slice(0, 24).map((b, i) => {
          const isSof = sofBytes.length > 0 && i < sofBytes.length && sofBytes[i] === bytes[i];
          const eofLen = eofBytes.length;
          const eofMatch = eofLen > 0 && bytes.length >= eofLen &&
            bytes.slice(bytes.length - eofLen).every((eb, j) => eb === eofBytes[j]);
          const isEof = eofMatch && i >= bytes.length - eofLen;
          return (
            <span key={i} className={`${s.hexByte} ${isSof ? s.hexSof : ''} ${isEof ? s.hexEof : ''}`}>
              {b.toString(16).padStart(2, '0').toUpperCase()}
            </span>
          );
        })}
        {bytes.length > 24 && <span className={s.hexMore}>+{bytes.length - 24}B</span>}
      </div>
    </div>
  );
}

function PacketDiagram({ cfg, sofHex, eofHex }: { cfg: SplitterConfig; sofHex: string; eofHex: string }) {
  const method = cfg.method;

  if (method === 'delimiter') {
    const sof = sofHex.trim() || '??';
    const eof = eofHex.trim() || '??';
    return (
      <div className={s.diagram}>
        <div className={s.diagramRow}>
          <div className={`${s.diagramBlock} ${s.diagramSof}`}><span>SOF</span><code>{sof}</code></div>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>데이터</span><code>…</code></div>
          <div className={`${s.diagramBlock} ${s.diagramEof}`}><span>EOF</span><code>{eof}</code></div>
        </div>
        <p className={s.diagramHint}>
          {cfg.eof_include ? 'EOF 포함됨' : 'EOF 미포함'} · 최소 {cfg.min_packet_size}B · 최대 {cfg.max_packet_size}B
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
              <span>헤더</span><code>{cfg.length_field_offset}B</code>
            </div>
          )}
          <div className={`${s.diagramBlock} ${s.diagramLen}`}>
            <span>길이</span><code>{cfg.length_field_size}B</code>
          </div>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>데이터</span><code>…</code></div>
        </div>
        <p className={s.diagramHint}>
          {cfg.length_includes_header ? '헤더 포함 길이' : '데이터 길이만'} · 최대 {cfg.max_packet_size}B
        </p>
      </div>
    );
  }

  if (method === 'gap') {
    return (
      <div className={s.diagram}>
        <div className={s.diagramRow}>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>패킷 A</span><code>…</code></div>
          <div className={s.diagramGapLabel}>≥ {cfg.gap_ms}ms 침묵</div>
          <div className={`${s.diagramBlock} ${s.diagramData}`}><span>패킷 B</span><code>…</code></div>
        </div>
        <p className={s.diagramHint}>통신 간격으로 패킷 경계 감지 · 경고: {cfg.inner_gap_warn_ms}ms</p>
      </div>
    );
  }

  return (
    <div className={s.diagram}>
      <p className={s.diagramHint}>정규식 방식은 연결 후 적용됩니다</p>
    </div>
  );
}
