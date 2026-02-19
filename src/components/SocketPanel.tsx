import { invoke } from '@tauri-apps/api/core'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import type { NewlineMode, SocketConfig } from '../types/wirescope'

interface SocketPanelProps {
  connId: string
  config: SocketConfig
  onConfigChange: (next: SocketConfig) => void
}

export function SocketPanel({ connId, config, onConfigChange }: SocketPanelProps) {
  const { connected, refreshStatus } = useConnectionStatus('socket_connected', connId)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const patchConfig = (updates: Partial<SocketConfig>) => {
    onConfigChange({
      ...config,
      ...updates,
    })
  }

  const connect = async () => {
    if (working || connected) {
      return
    }

    setWorking(true)
    try {
      await invoke('socket_open', {
        args: {
          host: config.host,
          port: config.port,
          proto: config.proto,
          conn_id: connId,
        },
      })
      await refreshStatus()
      setError('')
    } catch (invokeError) {
      await refreshStatus()
      setError(`Socket connection failed: ${String(invokeError)}`)
    } finally {
      setWorking(false)
    }
  }

  const disconnect = async () => {
    if (working || !connected) {
      return
    }

    setWorking(true)
    try {
      await invoke('socket_close', { conn_id: connId })
      await refreshStatus()
      setError('')
    } catch (invokeError) {
      await refreshStatus()
      setError(`Socket disconnect failed: ${String(invokeError)}`)
    } finally {
      setWorking(false)
    }
  }

  const send = async () => {
    if (!message.trim() || !connected || working) {
      return
    }

    try {
      await invoke('socket_tx', {
        args: {
          payload: message,
          append: config.append,
          conn_id: connId,
        },
      })
      setMessage('')
      setError('')
    } catch (invokeError) {
      await refreshStatus()
      setError(`Socket send failed: ${String(invokeError)}`)
    }
  }

  return (
    <section className="control-card">
      <header>
        <h2>Socket Connection</h2>
        <span className={`status-dot ${connected ? 'on' : 'off'}`}>{connected ? 'Connected' : 'Disconnected'}</span>
      </header>

      <div className="grid-fields">
        <label>
          <span>Host</span>
          <input value={config.host} onChange={(event) => patchConfig({ host: event.target.value })} />
        </label>

        <label>
          <span>Port</span>
          <input
            type="number"
            inputMode="numeric"
            value={String(config.port)}
            onChange={(event) => {
              const numeric = Number(event.target.value)
              if (!Number.isNaN(numeric)) {
                patchConfig({ port: numeric })
              }
            }}
          />
        </label>

        <label>
          <span>Protocol</span>
          <select
            value={config.proto}
            onChange={(event) => patchConfig({ proto: event.target.value as SocketConfig['proto'] })}
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </label>

        <label>
          <span>Newline</span>
          <select
            value={config.append}
            onChange={(event) => patchConfig({ append: event.target.value as NewlineMode })}
          >
            <option value="none">None</option>
            <option value="cr">CR</option>
            <option value="lf">LF</option>
            <option value="crlf">CRLF</option>
          </select>
        </label>
      </div>

      <div className="button-row">
        <button className="accent" onClick={connect} disabled={connected || working}>
          Connect
        </button>
        <button className="ghost" onClick={disconnect} disabled={!connected || working}>
          Disconnect
        </button>
      </div>

      <div className="send-box">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void send()
            }
          }}
          placeholder="Enter data to send"
          disabled={!connected}
        />
        <button className="accent" onClick={send} disabled={!connected || !message.trim()}>
          Send
        </button>
      </div>

      {error && (
        <p className="inline-error">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}
    </section>
  )
}
