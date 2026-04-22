import { useState, useEffect } from 'react';
import s from './Connect.module.css';
import { StatusBar, StatusChip } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { useApp } from '../../app/store';
import * as api from '../../shared/api/tauri';
import {
  BAUD_RATES, DATA_BITS, PARITY_OPTIONS, STOP_BITS,
  FLOW_CONTROL, SERIAL_PRESETS
} from '../../shared/config/tokens';

type TcpMode = 'tcp-client' | 'tcp-server' | 'udp' | 'tls' | 'ws';

function loadConn<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export function ConnectPage() {
  const { state, dispatch } = useApp();

  // Serial state
  const [ports, setPorts]   = useState<string[]>([]);
  const [port, setPort]     = useState(() => loadConn('ws_serial_port', ''));
  const [baud, setBaud]     = useState(() => loadConn('ws_serial_baud', 115200));
  const [dataBits, setDataBits] = useState(() => loadConn('ws_serial_databits', 8));
  const [parity, setParity] = useState(() => loadConn('ws_serial_parity', 'none'));
  const [stopBits, setStopBits] = useState(() => loadConn('ws_serial_stopbits', '1'));
  const [flow, setFlow]     = useState(() => loadConn('ws_serial_flow', 'none'));
  const [bufferKb, setBufferKb] = useState(() => loadConn('ws_serial_buffer', 64));
  const [dtr, setDtr]       = useState(() => loadConn('ws_serial_dtr', 'raise'));
  const [reconnect, setReconnect] = useState(() => loadConn('ws_serial_reconnect', 'auto'));

  // TCP state
  const [tcpMode, setTcpMode] = useState<TcpMode>(() => loadConn('ws_tcp_mode', 'tcp-client'));
  const [host, setHost]     = useState(() => loadConn('ws_tcp_host', ''));
  const [tcpPort, setTcpPort] = useState(() => loadConn('ws_tcp_port', '4840'));
  const [keepalive, setKeepalive] = useState(() => loadConn('ws_tcp_keepalive', 30));
  const [timeout, setTimeout_] = useState(() => loadConn('ws_tcp_timeout', 5));
  const [nagle, setNagle]   = useState(() => loadConn('ws_tcp_nagle', 'off'));
  const [tcpReconnect, setTcpReconnect] = useState(() => loadConn('ws_tcp_reconnect', 'auto'));

  const [serialLoading, setSerialLoading] = useState(false);
  const [serialError, setSerialError]     = useState('');
  const [tcpLoading, setTcpLoading]       = useState(false);
  const [tcpError, setTcpError]           = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [savedSerial, setSavedSerial] = useState('');
  const [savedTcp, setSavedTcp]   = useState('');
  const [recentHosts, setRecentHosts] = useState<string[]>(() => {
    try { const v = localStorage.getItem('ws_recent_hosts'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  function saveSerialPreset() {
    const label = `${port} · ${baud} ${dataBits}${parity[0].toUpperCase()}${stopBits}`;
    setSavedSerial('저장됨 ✓');
    setTimeout(() => setSavedSerial(''), 2000);
    dispatch({
      type: 'ADD_SAVED_FILTER',
      filter: { id: Date.now().toString(), label, query: `session:${port}` },
    });
  }

  function saveTcpPreset() {
    if (!host) return;
    const label = `${host}:${tcpPort}`;
    setSavedTcp('저장됨 ✓');
    setTimeout(() => setSavedTcp(''), 2000);
    dispatch({
      type: 'ADD_SAVED_FILTER',
      filter: { id: Date.now().toString(), label, query: `session:${host}:${tcpPort}` },
    });
  }

  useEffect(() => {
    api.listSerialPorts().then(p => {
      setPorts(p);
      if (p.length > 0 && !port) setPort(p[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => { localStorage.setItem('ws_serial_port', JSON.stringify(port)); }, [port]);
  useEffect(() => { localStorage.setItem('ws_serial_baud', JSON.stringify(baud)); }, [baud]);
  useEffect(() => { localStorage.setItem('ws_serial_databits', JSON.stringify(dataBits)); }, [dataBits]);
  useEffect(() => { localStorage.setItem('ws_serial_parity', JSON.stringify(parity)); }, [parity]);
  useEffect(() => { localStorage.setItem('ws_serial_stopbits', JSON.stringify(stopBits)); }, [stopBits]);
  useEffect(() => { localStorage.setItem('ws_serial_flow', JSON.stringify(flow)); }, [flow]);
  useEffect(() => { localStorage.setItem('ws_serial_buffer', JSON.stringify(bufferKb)); }, [bufferKb]);
  useEffect(() => { localStorage.setItem('ws_serial_dtr', JSON.stringify(dtr)); }, [dtr]);
  useEffect(() => { localStorage.setItem('ws_serial_reconnect', JSON.stringify(reconnect)); }, [reconnect]);
  useEffect(() => { localStorage.setItem('ws_tcp_mode', JSON.stringify(tcpMode)); }, [tcpMode]);
  useEffect(() => { localStorage.setItem('ws_tcp_host', JSON.stringify(host)); }, [host]);
  useEffect(() => { localStorage.setItem('ws_tcp_port', JSON.stringify(tcpPort)); }, [tcpPort]);
  useEffect(() => { localStorage.setItem('ws_tcp_keepalive', JSON.stringify(keepalive)); }, [keepalive]);
  useEffect(() => { localStorage.setItem('ws_tcp_timeout', JSON.stringify(timeout)); }, [timeout]);
  useEffect(() => { localStorage.setItem('ws_tcp_nagle', JSON.stringify(nagle)); }, [nagle]);
  useEffect(() => { localStorage.setItem('ws_tcp_reconnect', JSON.stringify(tcpReconnect)); }, [tcpReconnect]);

  const connectedSessions = state.sessions.filter(s => s.connected);

  function applyPreset(idx: number) {
    const p = SERIAL_PRESETS[idx];
    setBaud(p.baud);
    setDataBits(p.data);
    setParity(p.parity);
    setStopBits(p.stop);
    setFlow(p.flow);
  }

  async function connectSerial() {
    if (!port) return;
    setSerialLoading(true); setSerialError('');
    try {
      const id = await api.connectSerial(port, baud);
      const sessions = await api.getSessions();
      dispatch({ type: 'SET_SESSIONS', sessions });
      dispatch({ type: 'SET_ACTIVE_SESSION', id });
      dispatch({ type: 'SET_SCREEN', screen: 'workspace' });
    } catch (e: any) { setSerialError(String(e)); }
    setSerialLoading(false);
  }

  async function connectTcp() {
    if (!host) return;
    setTcpLoading(true); setTcpError('');
    try {
      const port = parseInt(tcpPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) { setTcpError('포트 번호가 올바르지 않습니다'); setTcpLoading(false); return; }
      const id = await api.connectTcp(host, port);
      const sessions = await api.getSessions();
      dispatch({ type: 'SET_SESSIONS', sessions });
      dispatch({ type: 'SET_ACTIVE_SESSION', id });
      const entry = `${host}:${tcpPort}`;
      const next = [entry, ...recentHosts.filter(h => h !== entry)].slice(0, 5);
      setRecentHosts(next);
      localStorage.setItem('ws_recent_hosts', JSON.stringify(next));
      dispatch({ type: 'SET_SCREEN', screen: 'workspace' });
    } catch (e: any) { setTcpError(String(e)); }
    setTcpLoading(false);
  }

  async function disconnectSession(id: string) {
    await api.disconnect(id);
    const sessions = await api.getSessions();
    dispatch({ type: 'SET_SESSIONS', sessions });
    if (state.activeSessionId === id) dispatch({ type: 'SET_ACTIVE_SESSION', id: null });
  }

  const portParams = `${baud} · ${dataBits}${parity[0].toUpperCase()}${stopBits}`;
  const tcpUri = `${tcpMode.replace('-', '+')}://${host || '?'}:${tcpPort}`;

  return (
    <div className={s.page}>
      {/* Currently connected */}
      {connectedSessions.length > 0 && (
        <div className={s.connectedBanner}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M3 7l3 3 5-6"/>
          </svg>
          <strong>{connectedSessions.length}개 세션 활성:</strong>
          {connectedSessions.map(sess => (
            <span key={sess.id} className={s.sessionTag}>
              {sess.name}
              <button onClick={() => disconnectSession(sess.id)}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className={s.cols}>
        {/* Left: Serial */}
        <div className={s.col}>
          <div className={s.colHeader}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2" y="6" width="18" height="10" rx="2"/>
              <path d="M6 11h2M10 11h2M14 11h2"/>
            </svg>
            <div>
              <h2 className={s.colTitle}>시리얼 통신</h2>
              <p className={s.colSub}>COM 포트 / TTY 장치 연결</p>
            </div>
          </div>

          <div className={s.helperBox}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5v.5"/>
            </svg>
            <span>
              아래에서 <b>포트와 보드레이트</b>를 선택하세요.
              잘 모르겠다면 <b>프리셋</b>을 먼저 골라보세요.
              장치 관리자 또는 <code>/dev/</code> 목록에서 포트 이름을 확인할 수 있습니다.
            </span>
          </div>

          <div className={s.formSection}>
            <SectionHeading>포트 선택</SectionHeading>
            <div className={s.formRow}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>포트</label>
                <div className={s.portRow}>
                  <select className={s.sel} value={port} onChange={e => setPort(e.target.value)}>
                    {ports.length === 0
                      ? <option value="">포트 없음</option>
                      : ports.map(p => <option key={p} value={p}>{p}</option>)
                    }
                  </select>
                  <Button size="sm" onClick={() => api.listSerialPorts().then(p => { setPorts(p); if (p.length > 0) setPort(p[0]); })}>
                    새로고침
                  </Button>
                </div>
              </div>
            </div>

            <div className={s.formRow}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>프리셋</label>
                <select className={s.sel} onChange={e => applyPreset(Number(e.target.value))}>
                  <option value="">직접 설정</option>
                  {SERIAL_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={s.formSection}>
            <SectionHeading>통신 파라미터</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>보드레이트</label>
                <select className={s.sel} value={baud} onChange={e => setBaud(Number(e.target.value))}>
                  {BAUD_RATES.map(r => <option key={r} value={r}>{r.toLocaleString()}</option>)}
                </select>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>데이터 비트</label>
                <SegmentedControl
                  options={DATA_BITS.map(b => ({ value: String(b), label: String(b) }))}
                  value={String(dataBits)}
                  onChange={v => setDataBits(Number(v))}
                  size="sm"
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>패리티</label>
                <select className={s.sel} value={parity} onChange={e => setParity(e.target.value)}>
                  {PARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>스톱 비트</label>
                <SegmentedControl
                  options={STOP_BITS.map(o => ({ value: o.value, label: o.label }))}
                  value={stopBits}
                  onChange={setStopBits}
                  size="sm"
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>흐름 제어</label>
                <select className={s.sel} value={flow} onChange={e => setFlow(e.target.value)}>
                  {FLOW_CONTROL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>수신 버퍼</label>
                <div className={s.inlineRow}>
                  <input className={s.inpSm} type="number" value={bufferKb} onChange={e => setBufferKb(Number(e.target.value))} />
                  <span className={s.unit}>KB</span>
                </div>
              </div>
            </div>
          </div>

          <div className={s.formSection}>
            <SectionHeading>고급 옵션</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>DTR / RTS 신호</label>
                <SegmentedControl
                  options={[{ value: 'raise', label: '올림' }, { value: 'lower', label: '내림' }, { value: 'none', label: '변경 안 함' }]}
                  value={dtr}
                  onChange={setDtr}
                  size="sm"
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>연결 끊김 시</label>
                <SegmentedControl
                  options={[{ value: 'auto', label: '자동 재연결' }, { value: 'ask', label: '물어보기' }, { value: 'none', label: '재연결 안 함' }]}
                  value={reconnect}
                  onChange={setReconnect}
                  size="sm"
                />
              </div>
            </div>
          </div>

          <SectionHeading>연결 미리보기</SectionHeading>
          <div className={s.preview}>
            <span className={s.previewUri}>{port || '(포트 없음)'}</span>
            {' · '}{portParams} · {flow === 'none' ? '흐름 제어 없음' : flow}
            {'\n'}재연결: {reconnect === 'auto' ? '자동' : reconnect === 'ask' ? '물어보기' : '안 함'}
          </div>

          {serialError && <div className={s.error}>{serialError}</div>}

          <div className={s.formActions}>
            <Button variant="success" onClick={connectSerial} disabled={serialLoading || !port}>
              <span className={s.pulseDot} />
              {serialLoading ? '연결 중…' : '연결하고 수신 시작'}
            </Button>
            <Button size="sm" onClick={saveSerialPreset}>
              {savedSerial || '프리셋으로 저장'}
            </Button>
          </div>
        </div>

        {/* Right: Socket */}
        <div className={s.col}>
          <div className={s.colHeader}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="11" cy="11" r="7.5"/>
              <path d="M3.5 11h15M11 3.5c3 3 3 12 0 15M11 3.5c-3 3-3 12 0 15"/>
            </svg>
            <div>
              <h2 className={s.colTitle}>소켓 통신</h2>
              <p className={s.colSub}>TCP · UDP · TLS · WebSocket 연결</p>
            </div>
          </div>

          <div className={s.helperBox}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5v.5"/>
            </svg>
            <span>
              연결할 <b>IP 주소와 포트</b>를 입력하세요.
              Modbus TCP는 보통 포트 <b>502</b>, FINS/UDP는 <b>9600</b>을 사용합니다.
            </span>
          </div>

          <div className={s.formSection}>
            <SectionHeading>연결 방식</SectionHeading>
            <SegmentedControl
              options={[
                { value: 'tcp-client', label: 'TCP 클라이언트' },
                { value: 'tcp-server', label: 'TCP 서버' },
                { value: 'udp',        label: 'UDP' },
                { value: 'tls',        label: 'TLS' },
                { value: 'ws',         label: 'WebSocket' },
              ]}
              value={tcpMode}
              onChange={v => setTcpMode(v as TcpMode)}
              size="sm"
              wrap
            />
          </div>

          <div className={s.formSection}>
            <SectionHeading>주소 · 포트</SectionHeading>
            <div className={s.addrRow}>
              <input
                className={s.inp}
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="IP 주소 또는 호스트명"
                style={{ flex: 3 }}
              />
              <span className={s.colon}>:</span>
              <input
                className={s.inp}
                value={tcpPort}
                onChange={e => setTcpPort(e.target.value)}
                placeholder="포트"
                style={{ flex: 1 }}
              />
            </div>
            {recentHosts.length > 0 && (
              <div className={s.recentHosts}>
                최근: {recentHosts.map((h, i) => (
                  <span key={h}>
                    <button className={s.recentHost} onClick={() => {
                      const lastColon = h.lastIndexOf(':');
                      if (lastColon > 0) { setHost(h.slice(0, lastColon)); setTcpPort(h.slice(lastColon + 1)); }
                      else setHost(h);
                    }}>{h}</button>
                    {i < recentHosts.length - 1 && ' · '}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={s.formSection}>
            <SectionHeading>연결 설정</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>Keepalive</label>
                <div className={s.inlineRow}>
                  <input className={s.inpSm} type="number" value={keepalive} onChange={e => setKeepalive(Number(e.target.value))} />
                  <span className={s.unit}>s</span>
                </div>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>연결 대기</label>
                <div className={s.inlineRow}>
                  <input className={s.inpSm} type="number" value={timeout} onChange={e => setTimeout_(Number(e.target.value))} />
                  <span className={s.unit}>s</span>
                </div>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>재연결</label>
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: 'auto', label: '자동 (백오프)' },
                    { value: 'manual', label: '수동' },
                    { value: 'none', label: '안 함' },
                  ]}
                  value={tcpReconnect}
                  onChange={setTcpReconnect}
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>Nagle 알고리즘</label>
                <SegmentedControl
                  size="sm"
                  options={[{ value: 'on', label: '켜기' }, { value: 'off', label: '끄기 (저지연)' }]}
                  value={nagle}
                  onChange={setNagle}
                />
              </div>
            </div>
          </div>

          <SectionHeading>연결 주소 미리보기</SectionHeading>
          <div className={s.preview}>
            <span className={s.previewUri}>{tcpUri}</span>
            {'\n'}keepalive {keepalive}초 · {nagle === 'off' ? 'nodelay' : 'nagle on'} · {tcpReconnect === 'auto' ? '자동 재연결' : '수동'}
            {recentHosts.length > 0 && `\n최근 사용: ${recentHosts.join(', ')}`}
          </div>

          {tcpError && <div className={s.error}>{tcpError}</div>}

          <div className={s.formActions}>
            <Button variant="success" onClick={connectTcp} disabled={tcpLoading || !host}>
              <span className={s.pulseDot} />
              {tcpLoading ? '연결 중…' : '연결하고 수신 시작'}
            </Button>
            <Button size="sm" disabled={!host || tcpLoading} onClick={async () => {
              if (!host) return;
              setTestStatus('테스트 중…');
              try {
                const testPort = parseInt(tcpPort, 10);
                if (isNaN(testPort) || testPort < 1 || testPort > 65535) { setTestStatus('포트 번호 오류'); setTimeout(() => setTestStatus(''), 3000); return; }
                const id = await api.connectTcp(host, testPort);
                await api.disconnect(id);
                setTestStatus('연결 가능 ✓');
              } catch (e: any) {
                const msg = String(e).split(':').pop()?.trim() ?? String(e);
                setTestStatus(`실패: ${msg}`);
              }
              setTimeout(() => setTestStatus(''), 3000);
            }}>
              연결 테스트
            </Button>
            {testStatus && <span className={s.testStatus}>{testStatus}</span>}
            <Button size="sm" style={{ marginLeft: 'auto' }} onClick={saveTcpPreset}>
              {savedTcp || '프리셋으로 저장'}
            </Button>
          </div>
        </div>
      </div>

      <StatusBar
        left={
          <>
            <StatusChip dot={connectedSessions.length > 0 ? 'var(--ok)' : 'var(--ink-dim)'}>
              {connectedSessions.length > 0
                ? `${connectedSessions.length}개 세션 활성`
                : '현재 연결된 장치 없음'}
            </StatusChip>
            {ports.length > 0 && <span>FTDI 장치 {ports.length}개 감지</span>}
          </>
        }
        right={<span>시리얼 설정은 연결 시에 적용됩니다 · Esc로 취소</span>}
      />
    </div>
  );
}
