import { useState, useEffect } from 'react';
import s from './Connect.module.css';
import { StatusBar, StatusChip } from '../../shared/ui/StatusBar';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { Button } from '../../shared/ui/Button';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { useApp } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
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
  const t = useT();

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
    setSavedSerial(t('connect.saved'));
    setTimeout(() => setSavedSerial(''), 2000);
    dispatch({
      type: 'ADD_SAVED_FILTER',
      filter: { id: Date.now().toString(), label, query: `session:${port}` },
    });
  }

  function saveTcpPreset() {
    if (!host) return;
    const label = `${host}:${tcpPort}`;
    setSavedTcp(t('connect.saved'));
    setTimeout(() => setSavedTcp(''), 2000);
    dispatch({
      type: 'ADD_SAVED_FILTER',
      filter: { id: Date.now().toString(), label, query: `session:${host}:${tcpPort}` },
    });
  }

  useEffect(() => {
    api.listSerialPorts().then(p => {
      setPorts(p);
      if (p.length > 0) {
        // If saved port is no longer available, switch to first available
        if (!port || !p.includes(port)) setPort(p[0]);
      } else {
        setPort('');
      }
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
      dispatch({ type: 'SET_RECEIVING', id, on: true });
      dispatch({ type: 'SET_SCREEN', screen: 'workspace' });
    } catch (e: any) { setSerialError(String(e)); }
    setSerialLoading(false);
  }

  async function connectTcp() {
    if (!host) return;
    setTcpLoading(true); setTcpError('');
    try {
      const port = parseInt(tcpPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) { setTcpError(t('connect.portError')); setTcpLoading(false); return; }
      const id = await api.connectTcp(host, port);
      const sessions = await api.getSessions();
      dispatch({ type: 'SET_SESSIONS', sessions });
      dispatch({ type: 'SET_ACTIVE_SESSION', id });
      dispatch({ type: 'SET_RECEIVING', id, on: true });
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
    if (state.activeSessionId === id) {
      // Switch to another connected session, or null if none
      const other = sessions.find(s => s.id !== id && s.connected);
      dispatch({ type: 'SET_ACTIVE_SESSION', id: other?.id ?? null });
    }
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
          <strong>{connectedSessions.length}{t('connect.sessionsActive')}:</strong>
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
              <h2 className={s.colTitle}>{t('connect.serialTitle')}</h2>
              <p className={s.colSub}>{t('connect.serialSub')}</p>
            </div>
          </div>

          <div className={s.helperBox}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5v.5"/>
            </svg>
            <span>{t('connect.serialHelp')}</span>
          </div>

          <div className={s.formSection}>
            <SectionHeading>{t('connect.portSection')}</SectionHeading>
            <div className={s.formRow}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.port')}</label>
                <div className={s.portRow}>
                  <select className={s.sel} value={port} onChange={e => setPort(e.target.value)}>
                    {ports.length === 0
                      ? <option value="">{t('connect.noPort')}</option>
                      : ports.map(p => <option key={p} value={p}>{p}</option>)
                    }
                  </select>
                  <Button size="sm" onClick={() => api.listSerialPorts().then(p => { setPorts(p); if (p.length > 0) setPort(p[0]); })}>
                    {t('connect.refresh')}
                  </Button>
                </div>
              </div>
            </div>

            <div className={s.formRow}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.preset')}</label>
                <select className={s.sel} onChange={e => applyPreset(Number(e.target.value))}>
                  <option value="">{t('connect.customPreset')}</option>
                  {SERIAL_PRESETS.map((p, i) => {
                    const label = p.label === '기본 (8N1)' ? t('preset.default')
                      : p.label === 'Arduino 기본' ? t('preset.arduino')
                      : p.label;
                    return <option key={i} value={i}>{label}</option>;
                  })}
                </select>
              </div>
            </div>
          </div>

          <div className={s.formSection}>
            <SectionHeading>{t('connect.params')}</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.baud')}</label>
                <select className={s.sel} value={baud} onChange={e => setBaud(Number(e.target.value))}>
                  {BAUD_RATES.map(r => <option key={r} value={r}>{r.toLocaleString()}</option>)}
                </select>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.dataBits')}</label>
                <SegmentedControl
                  options={DATA_BITS.map(b => ({ value: String(b), label: String(b) }))}
                  value={String(dataBits)}
                  onChange={v => setDataBits(Number(v))}
                  size="sm"
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.parity')}</label>
                <select className={s.sel} value={parity} onChange={e => setParity(e.target.value)}>
                  {PARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(`parity.${o.value}`)}</option>)}
                </select>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.stopBits')}</label>
                <SegmentedControl
                  options={STOP_BITS.map(o => ({ value: o.value, label: t(`stop.${o.value}`) }))}
                  value={stopBits}
                  onChange={setStopBits}
                  size="sm"
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.flowControl')}</label>
                <select className={s.sel} value={flow} onChange={e => setFlow(e.target.value)}>
                  {FLOW_CONTROL.map(o => <option key={o.value} value={o.value}>{t(`flow.${o.value}`)}</option>)}
                </select>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.rxBuffer')}</label>
                <div className={s.inlineRow}>
                  <input className={s.inpSm} type="text" inputMode="numeric" value={bufferKb}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); setBufferKb(v === '' ? 0 : parseInt(v, 10)); }}
                    onFocus={e => e.target.select()} />
                  <span className={s.unit}>KB</span>
                </div>
              </div>
              {/* bufferKb is stored for reference but the backend uses its own default buffer size */}
            </div>
          </div>

          <div className={s.formSection}>
            <SectionHeading>{t('connect.advanced')}</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.dtrRts')}</label>
                <SegmentedControl
                  options={[{ value: 'raise', label: t('connect.raise') }, { value: 'lower', label: t('connect.lower') }, { value: 'none', label: t('connect.noChange') }]}
                  value={dtr}
                  onChange={setDtr}
                  size="sm"
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.onDisconnect')}</label>
                <SegmentedControl
                  options={[{ value: 'auto', label: t('connect.autoReconnect') }, { value: 'ask', label: t('connect.ask') }, { value: 'none', label: t('connect.noReconnect') }]}
                  value={reconnect}
                  onChange={setReconnect}
                  size="sm"
                />
              </div>
            </div>
          </div>

          <SectionHeading>{t('connect.preview')}</SectionHeading>
          <div className={s.preview}>
            <span className={s.previewUri}>{port || `(${t('connect.noPort')})`}</span>
            {' · '}{portParams} · {flow === 'none' ? t('connect.noFlowCtrl') : flow}
            {'\n'}{t('connect.reconnect')}: {reconnect === 'auto' ? t('connect.reconnectAuto') : reconnect === 'ask' ? t('connect.reconnectAsk') : t('connect.reconnectNone')}
          </div>

          {serialError && <div className={s.error}>{serialError}</div>}

          <div className={s.formActions}>
            <Button variant="success" onClick={connectSerial} disabled={serialLoading || !port}>
              <span className={s.pulseDot} />
              {serialLoading ? t('connect.connecting') : t('connect.connectBtn')}
            </Button>
            <Button size="sm" onClick={saveSerialPreset}>
              {savedSerial || t('connect.savePreset')}
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
              <h2 className={s.colTitle}>{t('connect.socketTitle')}</h2>
              <p className={s.colSub}>{t('connect.socketSub')}</p>
            </div>
          </div>

          <div className={s.helperBox}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5v.5"/>
            </svg>
            <span>{t('connect.socketHelp')}</span>
          </div>

          <div className={s.formSection}>
            <SectionHeading>{t('connect.connMode')}</SectionHeading>
            <SegmentedControl
              options={[
                { value: 'tcp-client', label: t('connect.tcpClient') },
                { value: 'tcp-server', label: t('connect.tcpServer') },
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
            <SectionHeading>{t('connect.addrPort')}</SectionHeading>
            <div className={s.addrRow}>
              <input
                className={s.inp}
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder={t('connect.hostPlaceholder')}
                style={{ flex: 3 }}
              />
              <span className={s.colon}>:</span>
              <input
                className={s.inp}
                value={tcpPort}
                onChange={e => setTcpPort(e.target.value)}
                placeholder={t('connect.portPlaceholder')}
                style={{ flex: 1 }}
              />
            </div>
            {recentHosts.length > 0 && (
              <div className={s.recentHosts}>
                {t('connect.recent')}{recentHosts.map((h, i) => (
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
            <SectionHeading>{t('connect.connSettings')}</SectionHeading>
            <div className={s.formGrid}>
              <div className={s.formField}>
                <label className={s.fieldLabel}>Keepalive</label>
                <div className={s.inlineRow}>
                  <input className={s.inpSm} type="text" inputMode="numeric" value={keepalive}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); setKeepalive(v === '' ? 0 : parseInt(v, 10)); }}
                    onFocus={e => e.target.select()} />
                  <span className={s.unit}>s</span>
                </div>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.connTimeout')}</label>
                <div className={s.inlineRow}>
                  <input className={s.inpSm} type="text" inputMode="numeric" value={timeout}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); setTimeout_(v === '' ? 0 : parseInt(v, 10)); }}
                    onFocus={e => e.target.select()} />
                  <span className={s.unit}>s</span>
                </div>
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.reconnect')}</label>
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: 'auto', label: t('connect.reconnectAutoBackoff') },
                    { value: 'manual', label: t('connect.reconnectManual') },
                    { value: 'none', label: t('connect.reconnectNoneOpt') },
                  ]}
                  value={tcpReconnect}
                  onChange={setTcpReconnect}
                />
              </div>
              <div className={s.formField}>
                <label className={s.fieldLabel}>{t('connect.nagle')}</label>
                <SegmentedControl
                  size="sm"
                  options={[{ value: 'on', label: t('connect.nagleOn') }, { value: 'off', label: t('connect.nagleOff') }]}
                  value={nagle}
                  onChange={setNagle}
                />
              </div>
            </div>
          </div>

          <SectionHeading>{t('connect.addrPreview')}</SectionHeading>
          <div className={s.preview}>
            <span className={s.previewUri}>{tcpUri}</span>
            {'\n'}keepalive {keepalive}s · {nagle === 'off' ? t('connect.nodelay') : t('connect.nagleOnShort')} · {tcpReconnect === 'auto' ? t('connect.autoReconnect') : t('connect.reconnectManual')}
            {recentHosts.length > 0 && `\n${t('connect.recentUsed')}${recentHosts.join(', ')}`}
          </div>

          {tcpError && <div className={s.error}>{tcpError}</div>}

          <div className={s.formActions}>
            <Button variant="success" onClick={connectTcp} disabled={tcpLoading || !host}>
              <span className={s.pulseDot} />
              {tcpLoading ? t('connect.connecting') : t('connect.connectBtn')}
            </Button>
            <Button size="sm" disabled={!host || tcpLoading} onClick={async () => {
              if (!host) return;
              setTestStatus(t('connect.testing'));
              try {
                const testPort = parseInt(tcpPort, 10);
                if (isNaN(testPort) || testPort < 1 || testPort > 65535) { setTestStatus(t('connect.portNumError')); setTimeout(() => setTestStatus(''), 3000); return; }
                const id = await api.connectTcp(host, testPort);
                await api.disconnect(id);
                // Add to blocklist so it never appears as a real session
                dispatch({ type: 'REMOVE_SESSION', id });
                setTestStatus(t('connect.testOk'));
              } catch (e: any) {
                const msg = String(e).split(':').pop()?.trim() ?? String(e);
                setTestStatus(`${t('connect.testFailed')}${msg}`);
              }
              setTimeout(() => setTestStatus(''), 3000);
            }}>
              {t('connect.test')}
            </Button>
            {testStatus && <span className={s.testStatus}>{testStatus}</span>}
            <Button size="sm" style={{ marginLeft: 'auto' }} onClick={saveTcpPreset}>
              {savedTcp || t('connect.savePreset')}
            </Button>
          </div>
        </div>
      </div>

      <StatusBar
        left={
          <>
            <StatusChip dot={connectedSessions.length > 0 ? 'var(--ok)' : 'var(--ink-dim)'}>
              {connectedSessions.length > 0
                ? `${connectedSessions.length}${t('connect.sessionsActive')}`
                : t('connect.noDevices')}
            </StatusChip>
            {ports.length > 0 && <span>{ports.length} {t('connect.port')}(s)</span>}
          </>
        }
        right={<span>{t('connect.statusRight')}</span>}
      />
    </div>
  );
}
