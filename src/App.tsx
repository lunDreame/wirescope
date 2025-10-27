import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

type LogLine = { when_iso: string; interval_ms: number; dir: string; origin: string; text: string; raw: number[]; connId: string }

type Tab = 'serial' | 'socket'
type Newline = 'none' | 'cr' | 'lf' | 'crlf'
type ViewMode = 'ascii' | 'hex'

type Preset = { label: string; payload: string; append: Newline; group?: string }
type ColorRule = { pattern: string; color: string; isRegex: boolean; enabled: boolean }
type MacroGroup = { name: string; presets: Preset[] }
type ConnectionTab = { id: string; type: 'serial' | 'socket'; label: string; active: boolean }

// 표준 Baud Rate 값들
const STANDARD_BAUD_RATES = [150, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

// 설정 저장/로드 유틸리티
const SETTINGS_KEY = 'wirescope_settings'
interface Settings {
  viewMode: ViewMode
  autoscroll: boolean
  filter: string
  useRegex: boolean
  serialBaud: number
  serialDataBits: number
  serialParity: string
  serialStopBits: number
  serialFlow: string
  serialAppend: Newline
  socketHost: string
  socketPort: number
  socketProto: string
  socketAppend: Newline
  colorRules: ColorRule[]
  macroGroups: MacroGroup[]
}

const defaultSettings: Settings = {
  viewMode: 'ascii',
  autoscroll: true,
  filter: '',
  useRegex: false,
  serialBaud: 115200,
  serialDataBits: 8,
  serialParity: 'none',
  serialStopBits: 1,
  serialFlow: 'none',
  serialAppend: 'lf',
  socketHost: '127.0.0.1',
  socketPort: 12345,
  socketProto: 'tcp',
  socketAppend: 'lf',
  colorRules: [],
  macroGroups: []
}

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) }
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return defaultSettings
}

function saveSettings(settings: Partial<Settings>) {
  try {
    const current = loadSettings()
    const updated = { ...current, ...settings }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

function useLogFeed() {
  const [logs, setLogs] = useState<LogLine[]>([])
  useEffect(() => {
    const un = listen<LogLine>('log', (e) => setLogs((prev) => [...prev, e.payload]))
    return () => { un.then(u => u()) }
  }, [])
  return { logs, clear: () => setLogs([]) }
}

// 세션 통계 계산
function useStats(logs: LogLine[]) {
  return useMemo(() => {
    if (logs.length === 0) return { count: 0, avgInterval: 0, maxInterval: 0, totalBytes: 0, rxCount: 0, txCount: 0 }

    const rxLogs = logs.filter(l => l.dir === 'RX')
    const txLogs = logs.filter(l => l.dir === 'TX')
    const intervals = logs.slice(1).map(l => l.interval_ms)
    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
    const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 0
    const totalBytes = logs.reduce((sum, l) => sum + l.raw.length, 0)

    return {
      count: logs.length,
      avgInterval: Math.round(avgInterval),
      maxInterval,
      totalBytes,
      rxCount: rxLogs.length,
      txCount: txLogs.length
    }
  }, [logs])
}

export default function App() {
  const settings = loadSettings()
  const [tab, setTab] = useState<Tab>('serial')
  const { logs, clear } = useLogFeed()
  const [filter, setFilter] = useState(settings.filter)
  const [useRegex, setUseRegex] = useState(settings.useRegex)
  const [viewMode, setViewMode] = useState<ViewMode>(settings.viewMode)
  const [autoscroll, setAutoscroll] = useState(settings.autoscroll)
  const [colorRules, setColorRules] = useState<ColorRule[]>(settings.colorRules)
  const [showStats, setShowStats] = useState(true)
  const [showColorRules, setShowColorRules] = useState(false)
  const [showMacros, setShowMacros] = useState(false)
  const [macroGroups, setMacroGroups] = useState<MacroGroup[]>(settings.macroGroups.length > 0 ? settings.macroGroups : [{ name: 'Default', presets: [] }])
  const [connectionTabs, setConnectionTabs] = useState<ConnectionTab[]>([{ id: 'main', type: 'serial', label: 'Main', active: true }])
  const [activeConnId, setActiveConnId] = useState('main')

  const filtered = useMemo(() => {
    let result = logs.filter(l => l.connId === activeConnId || activeConnId === 'all')
    if (!filter) return result
    if (useRegex) {
      try {
        const re = new RegExp(filter, 'i')
        return result.filter(l => re.test(l.text))
      } catch {
        return result
      }
    }
    return result.filter(l => l.text.includes(filter))
  }, [logs, filter, useRegex, activeConnId])

  const stats = useStats(filtered)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoscroll) scroller.current?.scrollTo(0, scroller.current.scrollHeight)
  }, [filtered, autoscroll])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        clear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clear])

  // 설정 자동 저장
  useEffect(() => {
    saveSettings({ viewMode, autoscroll, filter, useRegex, colorRules, macroGroups })
  }, [viewMode, autoscroll, filter, useRegex, colorRules, macroGroups])

  const exportCSV = async () => {
    try {
      const path = await save({
        title: "Export CSV",
        filters: [{ name: "CSV", extensions: ["csv"] }]
      })
      if (path) {
        const csv = ['Timestamp,Interval(ms),Direction,Origin,Text'].concat(
          logs.map(l => {
            // 바이너리 데이터를 HEX로 변환하여 CSV에 저장
            const hexText = l.raw.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
            return `"${l.when_iso}",${l.interval_ms},${l.dir},${l.origin},"${hexText}"`
          })
        ).join('\n')
        await writeTextFile(path, csv)
        alert("CSV 저장 완료: " + path)
      }
    } catch (e: any) {
      alert("CSV 저장 실패: " + e.toString())
      console.error("CSV export error:", e)
    }
  }

  const exportHexDump = async () => {
    try {
      const path = await save({
        title: "Export HEX Dump",
        filters: [{ name: "Hex", extensions: ["hex"] }]
      })
      if (path) {
        // 순수 HEX 값만 출력 (줄바꿈으로 구분)
        const hexDump = logs.map(l =>
          l.raw.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
        ).join('\n')
        await writeTextFile(path, hexDump)
        alert("HEX 저장 완료: " + path)
      }
    } catch (e: any) {
      alert("HEX 저장 실패: " + e.toString())
      console.error("HEX export error:", e)
    }
  }

  const addColorRule = () => {
    setColorRules([...colorRules, { pattern: '', color: '#ffff00', isRegex: false, enabled: true }])
  }

  const updateColorRule = (idx: number, updates: Partial<ColorRule>) => {
    const updated = [...colorRules]
    updated[idx] = { ...updated[idx], ...updates }
    setColorRules(updated)
  }

  const removeColorRule = (idx: number) => {
    setColorRules(colorRules.filter((_, i) => i !== idx))
  }

  const addMacroGroup = () => {
    setMacroGroups([...macroGroups, { name: `Group ${macroGroups.length + 1}`, presets: [] }])
  }

  const addConnectionTab = (type: 'serial' | 'socket') => {
    const id = `${type}-${Date.now()}`
    const label = `${type.toUpperCase()} ${connectionTabs.filter(t => t.type === type).length + 1}`
    setConnectionTabs([...connectionTabs, { id, type, label, active: false }])
  }

  const switchConnectionTab = (id: string) => {
    setConnectionTabs(connectionTabs.map(t => ({ ...t, active: t.id === id })))
    setActiveConnId(id)
  }

  const closeConnectionTab = (id: string) => {
    if (connectionTabs.length === 1) return
    const remaining = connectionTabs.filter(t => t.id !== id)
    setConnectionTabs(remaining)
    if (activeConnId === id) {
      switchConnectionTab(remaining[0].id)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>WireScope</h1>
        <nav>
          <button className={tab === 'serial' ? 'active' : ''} onClick={() => setTab('serial')}>Serial</button>
          <button className={tab === 'socket' ? 'active' : ''} onClick={() => setTab('socket')}>Socket</button>
        </nav>
        <div className="spacer" />

        {/* 연결 탭 관리 */}
        <div className="conn-tabs">
          {connectionTabs.map(ct => (
            <div key={ct.id} className={`conn-tab ${ct.active ? 'active' : ''}`}>
              <button onClick={() => switchConnectionTab(ct.id)}>{ct.label}</button>
              {connectionTabs.length > 1 && <button className="close-btn" onClick={() => closeConnectionTab(ct.id)}>×</button>}
            </div>
          ))}
          <button onClick={() => addConnectionTab('serial')} title="Add Serial">+S</button>
          <button onClick={() => addConnectionTab('socket')} title="Add Socket">+N</button>
        </div>

        <select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)}>
          <option value="ascii">ASCII</option>
          <option value="hex">HEX</option>
        </select>
        <input placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '150px' }} />
        <label className="muted">
          <input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} /> Regex
        </label>
        <button onClick={clear}>Clear</button>
        <button onClick={async () => {
          try {
            const path = await save({
              title: "Save Log",
              filters: [{ name: "Text", extensions: ["txt"] }]
            })
            if (path) {
              // HEX 데이터만 저장 (깨진 텍스트 제거)
              const logContent = logs.map(l => {
                const hexData = l.raw.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
                return `[${l.when_iso}] (${l.origin}/${l.dir}) HEX: ${hexData}`
              }).join('\n')

              await writeTextFile(path, logContent)
              alert("로그 저장 완료: " + path)
            }
          } catch (e: any) {
            alert("로그 저장 실패: " + e.toString())
            console.error("Save log error:", e)
          }
        }}>
          Save
        </button>
        <button onClick={exportCSV}>CSV</button>
        <button onClick={exportHexDump}>HEX</button>
        <button onClick={() => setShowStats(!showStats)} className={showStats ? 'active' : ''}>Stats</button>
        <button onClick={() => setShowColorRules(!showColorRules)}>Colors</button>
        <button onClick={() => setShowMacros(!showMacros)}>Macros</button>
        <label><input type="checkbox" checked={autoscroll} onChange={e => setAutoscroll(e.target.checked)} /> Auto</label>
      </header>

      <main>
        <aside>
          {showStats && (
            <div className="stats-widget">
              <h3>Session Stats</h3>
              <div className="stats-grid">
                <div><strong>Total:</strong> {stats.count}</div>
                <div><strong>RX:</strong> {stats.rxCount}</div>
                <div><strong>TX:</strong> {stats.txCount}</div>
                <div><strong>Bytes:</strong> {stats.totalBytes}</div>
                <div><strong>Avg Δt:</strong> {stats.avgInterval}ms</div>
                <div><strong>Max Δt:</strong> {stats.maxInterval}ms</div>
              </div>
            </div>
          )}

          {showColorRules && (
            <div className="color-rules-panel">
              <h3>Color Highlight Rules</h3>
              <button onClick={addColorRule}>+ Add Rule</button>
              {colorRules.map((rule, idx) => (
                <div key={idx} className="color-rule">
                  <input
                    type="text"
                    placeholder="Pattern"
                    value={rule.pattern}
                    onChange={e => updateColorRule(idx, { pattern: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="color"
                    value={rule.color}
                    onChange={e => updateColorRule(idx, { color: e.target.value })}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={rule.isRegex}
                      onChange={e => updateColorRule(idx, { isRegex: e.target.checked })}
                    />
                    Regex
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={e => updateColorRule(idx, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                  <button onClick={() => removeColorRule(idx)}>×</button>
                </div>
              ))}
            </div>
          )}

          {showMacros && (
            <div className="macros-panel">
              <h3>Macro Groups</h3>
              <button onClick={addMacroGroup}>+ Add Group</button>
              {macroGroups.map((group, gIdx) => (
                <div key={gIdx} className="macro-group">
                  <input
                    value={group.name}
                    onChange={e => {
                      const updated = [...macroGroups]
                      updated[gIdx].name = e.target.value
                      setMacroGroups(updated)
                    }}
                  />
                  <button onClick={() => {
                    const updated = [...macroGroups]
                    updated[gIdx].presets.push({ label: 'New', payload: '', append: 'lf' })
                    setMacroGroups(updated)
                  }}>+ Preset</button>
                  {group.presets.map((preset, pIdx) => (
                    <div key={pIdx} className="macro-preset">
                      <input
                        placeholder="Label"
                        value={preset.label}
                        onChange={e => {
                          const updated = [...macroGroups]
                          updated[gIdx].presets[pIdx].label = e.target.value
                          setMacroGroups(updated)
                        }}
                      />
                      <input
                        placeholder="Payload"
                        value={preset.payload}
                        onChange={e => {
                          const updated = [...macroGroups]
                          updated[gIdx].presets[pIdx].payload = e.target.value
                          setMacroGroups(updated)
                        }}
                      />
                      <button onClick={() => {
                        const updated = [...macroGroups]
                        updated[gIdx].presets.splice(pIdx, 1)
                        setMacroGroups(updated)
                      }}>×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'serial' ? (
            <SerialPanel
              connId={connectionTabs.find(t => t.active)?.id || 'main'}
              settings={settings}
              macroGroups={macroGroups}
            />
          ) : (
            <SocketPanel
              connId={connectionTabs.find(t => t.active)?.id || 'main'}
              settings={settings}
              macroGroups={macroGroups}
            />
          )}
        </aside>
        <section className="logs" ref={scroller}>
          {filtered.length === 0 ? (
            <div className="empty-logs">
              <div className="empty-icon">📡</div>
              <div className="empty-text">로그가 없습니다</div>
              <div className="empty-hint">시리얼 포트나 소켓을 연결하고 데이터를 수신하세요</div>
            </div>
          ) : (
            renderLogs(filtered, viewMode, filter, useRegex, colorRules)
          )}
        </section>
      </main>
    </div>
  )
}

function SerialPanel({ connId, settings, macroGroups }: { connId: string; settings: Settings; macroGroups: MacroGroup[] }) {
  const [ports, setPorts] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  const [baud, setBaud] = useState(settings.serialBaud)
  const [baudInput, setBaudInput] = useState(settings.serialBaud.toString())
  const [db, setDb] = useState(settings.serialDataBits)
  const [dbInput, setDbInput] = useState(settings.serialDataBits.toString())
  const [parity, setParity] = useState<'none' | 'even' | 'odd'>(settings.serialParity as any)
  const [sb, setSb] = useState(settings.serialStopBits)
  const [flow, setFlow] = useState<'none' | 'software' | 'hardware'>(settings.serialFlow as any)
  const [msg, setMsg] = useState('')
  const [append, setAppend] = useState<Newline>(settings.serialAppend)
  const [presets, setPresets] = useState<Preset[]>([])
  const [selPreset, setSelPreset] = useState<number>(-1)
  const [selGroup, setSelGroup] = useState(0)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => {
    const newPorts = await invoke<string[]>('list_serial_ports')
    setPorts(newPorts)
  }

  useEffect(() => {
    reload()
    // 포트 핫플러그 감지 - 5초마다 갱신
    const interval = setInterval(reload, 5000)
    fetch('/presets.json').then(r => r.json()).then(setPresets).catch(() => { })
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    saveSettings({ serialBaud: baud, serialDataBits: db, serialParity: parity, serialStopBits: sb, serialFlow: flow, serialAppend: append })
  }, [baud, db, parity, sb, flow, append])

  const connect = async () => {
    try {
      const port = (ports[sel] || '').split(' ')[0]
      await invoke('serial_open', { args: { port, baud, data_bits: db, parity, stop_bits: sb, flow, conn_id: connId } })
      setConnected(true)
      setError('')
    } catch (e: any) {
      setError(`연결 실패: ${e.toString()}`)
      setConnected(false)
    }
  }
  const disconnect = async () => {
    try {
      await invoke('serial_close', { connId })
      setConnected(false)
      setError('')
    } catch (e: any) {
      setError(`연결 해제 실패: ${e.toString()}`)
    }
  }
  const send = async () => {
    try {
      await invoke('serial_tx', { args: { payload: msg, append, conn_id: connId } })
      setMsg('')
    } catch (e: any) {
      setError(`전송 실패: ${e.toString()}`)
    }
  }

  const currentGroup = macroGroups[selGroup] || { name: 'Default', presets: [] }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Serial Port</h3>
        {connected && <span className="status-badge connected">연결됨</span>}
        {!connected && <span className="status-badge disconnected">연결 안됨</span>}
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="row">
        <button onClick={reload}>Scan</button>
        <select value={sel} onChange={e => setSel(Number(e.target.value))} style={{ flex: 1 }}>
          {ports.map((p, i) => (<option key={i} value={i}>{p}</option>))}
        </select>
      </div>

      <div className="grid">
        <label>Baud</label>
        <input
          type="number"
          list="baud-rates"
          value={baudInput}
          onChange={e => {
            const val = e.target.value
            setBaudInput(val)
            if (val !== '' && !isNaN(Number(val))) {
              setBaud(Number(val))
            }
          }}
          onBlur={() => {
            if (baudInput === '' || isNaN(Number(baudInput))) {
              setBaudInput(baud.toString())
            }
          }}
          placeholder="선택 또는 입력"
        />
        <datalist id="baud-rates">
          {STANDARD_BAUD_RATES.map(rate => (
            <option key={rate} value={rate} />
          ))}
        </datalist>

        <label>DataBits</label>
        <input
          type="number"
          min={5}
          max={8}
          value={dbInput}
          onChange={e => {
            const val = e.target.value
            setDbInput(val)
            if (val !== '' && !isNaN(Number(val))) {
              setDb(Number(val))
            }
          }}
          onBlur={() => {
            if (dbInput === '' || isNaN(Number(dbInput))) {
              setDbInput(db.toString())
            }
          }}
        />

        <label>Parity</label>
        <select value={parity} onChange={e => setParity(e.target.value as any)}>
          <option>none</option>
          <option>even</option>
          <option>odd</option>
        </select>

        <label>StopBits</label>
        <select value={sb} onChange={e => setSb(Number(e.target.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>

        <label>Flow</label>
        <select value={flow} onChange={e => setFlow(e.target.value as any)}>
          <option>none</option>
          <option>software</option>
          <option>hardware</option>
        </select>
      </div>

      <div className="row">
        <button onClick={connect}>Connect</button>
        <button onClick={disconnect}>Disconnect</button>
      </div>

      <div className="row">
        <input className="grow" placeholder="Message" value={msg} onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <select value={append} onChange={e => setAppend(e.target.value as any)}>
          <option value="none">None</option>
          <option value="cr">CR</option>
          <option value="lf">LF</option>
          <option value="crlf">CRLF</option>
        </select>
        <button onClick={send}>Send</button>
      </div>

      <div className="macro-bar">
        <label>Group:</label>
        <select value={selGroup} onChange={e => setSelGroup(Number(e.target.value))}>
          {macroGroups.map((g, i) => <option key={i} value={i}>{g.name}</option>)}
        </select>
      </div>

      <div className="macro-buttons">
        {currentGroup.presets.map((p, i) => (
          <button
            key={i}
            onClick={async () => {
              await invoke('serial_tx', { args: { payload: p.payload, append: p.append, conn_id: connId } })
            }}
            title={p.payload}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="row">
        <select value={selPreset} onChange={e => setSelPreset(Number(e.target.value))} style={{ flex: 1 }}>
          <option value={-1}>Built-in Presets…</option>
          {presets.map((p, i) => (<option key={i} value={i}>{p.label}</option>))}
        </select>
        <button onClick={() => {
          if (selPreset >= 0) {
            const p = presets[selPreset]
            setMsg(p.payload); setAppend(p.append)
          }
        }}>Fill</button>
        <button onClick={async () => {
          if (selPreset >= 0) {
            const p = presets[selPreset]
            await invoke('serial_tx', { args: { payload: p.payload, append: p.append, conn_id: connId } })
          }
        }}>Send</button>
      </div>
    </div>
  )
}

function SocketPanel({ connId, settings, macroGroups }: { connId: string; settings: Settings; macroGroups: MacroGroup[] }) {
  const [host, setHost] = useState(settings.socketHost)
  const [port, setPort] = useState(settings.socketPort)
  const [portInput, setPortInput] = useState(settings.socketPort.toString())
  const [proto, setProto] = useState<'tcp' | 'udp'>(settings.socketProto as any)
  const [msg, setMsg] = useState('')
  const [append, setAppend] = useState<Newline>(settings.socketAppend)
  const [presets, setPresets] = useState<Preset[]>([])
  const [selPreset, setSelPreset] = useState<number>(-1)
  const [selGroup, setSelGroup] = useState(0)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/presets.json').then(r => r.json()).then(setPresets).catch(() => { })
  }, [])

  useEffect(() => {
    saveSettings({ socketHost: host, socketPort: port, socketProto: proto, socketAppend: append })
  }, [host, port, proto, append])

  const connect = async () => {
    try {
      await invoke('socket_open', { args: { host, port, proto, conn_id: connId } })
      setConnected(true)
      setError('')
    } catch (e: any) {
      setError(`연결 실패: ${e.toString()}`)
      setConnected(false)
    }
  }
  const disconnect = async () => {
    try {
      await invoke('socket_close', { connId })
      setConnected(false)
      setError('')
    } catch (e: any) {
      setError(`연결 해제 실패: ${e.toString()}`)
    }
  }
  const send = async () => {
    try {
      await invoke('socket_tx', { args: { payload: msg, append, conn_id: connId } })
      setMsg('')
    } catch (e: any) {
      setError(`전송 실패: ${e.toString()}`)
    }
  }

  const currentGroup = macroGroups[selGroup] || { name: 'Default', presets: [] }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Network Socket</h3>
        {connected && <span className="status-badge connected">연결됨</span>}
        {!connected && <span className="status-badge disconnected">연결 안됨</span>}
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="grid">
        <label>Host</label>
        <input value={host} onChange={e => setHost(e.target.value)} />

        <label>Port</label>
        <input
          type="number"
          value={portInput}
          onChange={e => {
            const val = e.target.value
            setPortInput(val)
            if (val !== '' && !isNaN(Number(val))) {
              setPort(Number(val))
            }
          }}
          onBlur={() => {
            if (portInput === '' || isNaN(Number(portInput))) {
              setPortInput(port.toString())
            }
          }}
        />

        <label>Protocol</label>
        <select value={proto} onChange={e => setProto(e.target.value as any)}>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
        </select>
      </div>
      <div className="row">
        <button onClick={connect}>Connect</button>
        <button onClick={disconnect}>Disconnect</button>
      </div>
      <div className="row">
        <input className="grow" placeholder="Message" value={msg} onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <select value={append} onChange={e => setAppend(e.target.value as any)}>
          <option value="none">None</option>
          <option value="cr">CR</option>
          <option value="lf">LF</option>
          <option value="crlf">CRLF</option>
        </select>
        <button onClick={send}>Send</button>
      </div>

      <div className="macro-bar">
        <label>Group:</label>
        <select value={selGroup} onChange={e => setSelGroup(Number(e.target.value))}>
          {macroGroups.map((g, i) => <option key={i} value={i}>{g.name}</option>)}
        </select>
      </div>

      <div className="macro-buttons">
        {currentGroup.presets.map((p, i) => (
          <button
            key={i}
            onClick={async () => {
              await invoke('socket_tx', { args: { payload: p.payload, append: p.append, conn_id: connId } })
            }}
            title={p.payload}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="row">
        <select value={selPreset} onChange={e => setSelPreset(Number(e.target.value))} style={{ flex: 1 }}>
          <option value={-1}>Built-in Presets…</option>
          {presets.map((p, i) => (<option key={i} value={i}>{p.label}</option>))}
        </select>
        <button onClick={() => {
          if (selPreset >= 0) {
            const p = presets[selPreset]
            setMsg(p.payload); setAppend(p.append)
          }
        }}>Fill</button>
        <button onClick={async () => {
          if (selPreset >= 0) {
            const p = presets[selPreset]
            await invoke('socket_tx', { args: { payload: p.payload, append: p.append, conn_id: connId } })
          }
        }}>Send</button>
      </div>
    </div>
  )
}

function renderLogs(
  list: LogLine[],
  view: 'ascii' | 'hex',
  filter: string,
  useRegex: boolean,
  colorRules: ColorRule[]
) {
  let filterRe: RegExp | null = null
  if (useRegex && filter) {
    try { filterRe = new RegExp(filter, 'gi') } catch { filterRe = null }
  }

  const fmtHex = (raw: number[]) => raw.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  const match = (s: string) => !filter || (filterRe ? filterRe.test(s) : s.includes(filter))
  const showNL = (s: string) => s
    .replaceAll('\r\n', '<span class="nlcrlf">⏎CRLF</span>')
    .replaceAll('\r', '<span class="nlcr">␍CR</span>')
    .replaceAll('\n', '<span class="nllf">␊LF</span>')

  const applyColorRules = (text: string): string => {
    let result = escapeHtml(text)

    // 정규식 하이라이트
    if (useRegex && filter && filterRe) {
      result = result.replace(new RegExp(escapeRegex(filter), 'gi'), match => `<mark>${match}</mark>`)
    } else if (filter && !useRegex) {
      const escaped = escapeRegex(filter)
      result = result.replace(new RegExp(escaped, 'gi'), match => `<mark>${match}</mark>`)
    }

    // 컬러 룰 적용
    colorRules.forEach(rule => {
      if (!rule.enabled || !rule.pattern) return
      try {
        const re = rule.isRegex ? new RegExp(rule.pattern, 'gi') : new RegExp(escapeRegex(rule.pattern), 'gi')
        result = result.replace(re, match => `<span style="background-color: ${rule.color}; padding: 0 2px;">${match}</span>`)
      } catch {
        // 잘못된 정규식 무시
      }
    })

    return result
  }

  return list.map((l, i) => {
    const text = view === 'ascii' ? l.text : fmtHex(l.raw)
    if (!match(text)) return null
    const body = view === 'ascii' ? showNL(applyColorRules(text)) : text
    return (
      <pre
        key={i}
        className={`log ${l.dir.toLowerCase()} ${l.origin} ${view === 'hex' ? 'hex' : ''}`}
        dangerouslySetInnerHTML={{
          __html:
            `<span class='badge ${l.dir.toLowerCase()}'>${l.origin}/${l.dir}</span>` +
            `[${l.when_iso}] (+${l.interval_ms}ms) | ${body}`
        }}
      />
    )
  })
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
