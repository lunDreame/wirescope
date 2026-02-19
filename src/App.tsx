import { useEffect, useMemo, useState } from 'react'
import { LogView } from './components/LogView'
import { LogoMark } from './components/LogoMark'
import { SerialPanel } from './components/SerialPanel'
import { SocketPanel } from './components/SocketPanel'
import { MAIN_CONNECTION_ID } from './constants'
import { useLogStream } from './hooks/useLogStream'
import { summarizeLogs } from './lib/format'
import { loadSettings, saveSettings } from './lib/settings'
import type { AppSettings, ConnectionMode, ViewMode } from './types/wirescope'

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const { logs, clear } = useLogStream()

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const stats = useMemo(() => summarizeLogs(logs), [logs])

  const endpointSummary = useMemo(() => {
    if (settings.mode === 'serial') {
      return `Serial · ${settings.serial.baud}bps`
    }

    return `Socket · ${settings.socket.proto.toUpperCase()} ${settings.socket.host}:${settings.socket.port}`
  }, [settings.mode, settings.serial.baud, settings.socket.host, settings.socket.port, settings.socket.proto])

  const setMode = (mode: ConnectionMode) => {
    setSettings((previous) => ({
      ...previous,
      mode,
    }))
  }

  const setViewMode = (viewMode: ViewMode) => {
    setSettings((previous) => ({
      ...previous,
      viewMode,
    }))
  }

  return (
    <div className="app-shell">
      <div className="bg-grid" aria-hidden />

      <header className="pm-topbar">
        <div className="brand-block">
          <LogoMark />
          <div>
            <h1>WireScope</h1>
          </div>
        </div>

        <div className="pm-topbar-right">
          <span className="endpoint-chip">{endpointSummary}</span>
        </div>
      </header>

      <div className="pm-body">
        <aside className="pm-sidebar">
          <div className="sidebar-group-title">MODE</div>
          <button className={`nav-btn ${settings.mode === 'serial' ? 'active' : ''}`} onClick={() => setMode('serial')}>
            <span>Serial</span>
          </button>
          <button className={`nav-btn ${settings.mode === 'socket' ? 'active' : ''}`} onClick={() => setMode('socket')}>
            <span>Socket</span>
          </button>

          <div className="sidebar-divider" />

          <div className="sidebar-group-title">SUMMARY</div>
          <div className="sidebar-meta">
            <span>Frames</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="sidebar-meta">
            <span>Bytes</span>
            <strong>{stats.totalBytes}</strong>
          </div>
        </aside>

        <section className="pm-main">
          <div className="pm-tabbar">
            <div className="view-switch">
              <button className={settings.viewMode === 'ascii' ? 'active' : ''} onClick={() => setViewMode('ascii')}>
                ASCII
              </button>
              <button className={settings.viewMode === 'hex' ? 'active' : ''} onClick={() => setViewMode('hex')}>
                HEX
              </button>
            </div>
          </div>

          <div className="pm-panels">
            <section className="pm-request-panel">
              <div className="panel-section stat-panel">
                <h3>Session Summary</h3>
                <div className="stat-row">
                  <span>RX / TX</span>
                  <strong>
                    {stats.rx} / {stats.tx}
                  </strong>
                </div>
                <div className="stat-row">
                  <span>Avg Interval</span>
                  <strong>{stats.avgGap}ms</strong>
                </div>
              </div>

              {settings.mode === 'serial' ? (
                <SerialPanel
                  connId={MAIN_CONNECTION_ID}
                  config={settings.serial}
                  onConfigChange={(serial) =>
                    setSettings((previous) => ({
                      ...previous,
                      serial,
                    }))
                  }
                />
              ) : (
                <SocketPanel
                  connId={MAIN_CONNECTION_ID}
                  config={settings.socket}
                  onConfigChange={(socket) =>
                    setSettings((previous) => ({
                      ...previous,
                      socket,
                    }))
                  }
                />
              )}
            </section>

            <section className="pm-response-panel">
              <div className="pane-head">
                <div>
                  <h2>Packet Log</h2>
                </div>
                <div className="pane-head-actions">
                  <span className="pane-badge">Frames {stats.total}</span>
                  <button className="pane-clear-btn" onClick={() => clear()}>
                    Clear
                  </button>
                </div>
              </div>

              <LogView logs={logs} viewMode={settings.viewMode} />
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
