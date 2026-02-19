import { invoke } from '@tauri-apps/api/core'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { STANDARD_BAUD_RATES } from '../constants'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { useSerialPorts } from '../hooks/useSerialPorts'
import type { NewlineMode, SerialConfig } from '../types/wirescope'

interface SerialPanelProps {
  connId: string
  config: SerialConfig
  onConfigChange: (next: SerialConfig) => void
}

export function SerialPanel({ connId, config, onConfigChange }: SerialPanelProps) {
  const { ports, lastError } = useSerialPorts()
  const { connected, refreshStatus } = useConnectionStatus('serial_connected', connId)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedPort, setSelectedPort] = useState<string>('')
  const filteredPorts = useMemo(
    () => ports.filter((port) => !port.toLowerCase().includes('debug-console')),
    [ports],
  )

  const primaryError = error || lastError

  useEffect(() => {
    if (!filteredPorts.length) {
      setSelectedPort('')
      return
    }

    const stillExists = filteredPorts.some((port) => parsePortName(port) === selectedPort)
    if (!stillExists) {
      setSelectedPort(parsePortName(filteredPorts[0]))
    }
  }, [filteredPorts, selectedPort])

  useEffect(() => {
    if (!STANDARD_BAUD_RATES.includes(config.baud)) {
      onConfigChange({
        ...config,
        baud: 115200,
      })
    }
  }, [config, onConfigChange])

  const patchConfig = (updates: Partial<SerialConfig>) => {
    onConfigChange({
      ...config,
      ...updates,
    })
  }

  const connect = async () => {
    if (!selectedPort || working) {
      return
    }

    setWorking(true)
    try {
      await invoke('serial_open', {
        args: {
          port: selectedPort,
          baud: config.baud,
          data_bits: config.dataBits,
          parity: config.parity,
          stop_bits: config.stopBits,
          flow: config.flow,
          conn_id: connId,
        },
      })
      await refreshStatus()
      setError('')
    } catch (invokeError) {
      await refreshStatus()
      setError(`Serial connection failed: ${String(invokeError)}`)
    } finally {
      setWorking(false)
    }
  }

  const disconnect = async () => {
    if (working) {
      return
    }

    setWorking(true)
    try {
      await invoke('serial_close', { conn_id: connId })
      await refreshStatus()
      setError('')
    } catch (invokeError) {
      await refreshStatus()
      setError(`Serial disconnect failed: ${String(invokeError)}`)
    } finally {
      setWorking(false)
    }
  }

  const send = async () => {
    if (!message.trim() || !connected || working) {
      return
    }

    try {
      await invoke('serial_tx', {
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
      setError(`Serial send failed: ${String(invokeError)}`)
    }
  }

  return (
    <section className="control-card">
      <header>
        <h2>Serial Connection</h2>
        <span className={`status-dot ${connected ? 'on' : 'off'}`}>{connected ? 'Connected' : 'Disconnected'}</span>
      </header>

      <label className="field-block">
        <span>Port</span>
        <select value={selectedPort} onChange={(event) => setSelectedPort(event.target.value)}>
          {filteredPorts.length === 0 && <option value="">No ports detected</option>}
          {filteredPorts.map((port) => {
            const value = parsePortName(port)
            return (
              <option key={port} value={value}>
                {port}
              </option>
            )
          })}
        </select>
      </label>

      <div className="grid-fields">
        <label>
          <span>Baud</span>
          <select value={String(config.baud)} onChange={(event) => patchConfig({ baud: Number(event.target.value) })}>
            {STANDARD_BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Data Bits</span>
          <select
            value={config.dataBits}
            onChange={(event) => patchConfig({ dataBits: Number(event.target.value) })}
          >
            <option value={5}>5</option>
            <option value={6}>6</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>
        </label>

        <label>
          <span>Parity</span>
          <select
            value={config.parity}
            onChange={(event) => patchConfig({ parity: event.target.value as SerialConfig['parity'] })}
          >
            <option value="none">none</option>
            <option value="even">even</option>
            <option value="odd">odd</option>
          </select>
        </label>

        <label>
          <span>Stop Bits</span>
          <select
            value={config.stopBits}
            onChange={(event) => patchConfig({ stopBits: Number(event.target.value) as 1 | 2 })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>

        <label>
          <span>Flow Control</span>
          <select
            value={config.flow}
            onChange={(event) => patchConfig({ flow: event.target.value as SerialConfig['flow'] })}
          >
            <option value="none">none</option>
            <option value="software">software</option>
            <option value="hardware">hardware</option>
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
        <button className="accent" onClick={connect} disabled={!selectedPort || connected || working}>
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

      {primaryError && (
        <p className="inline-error">
          <AlertTriangle size={14} />
          {primaryError}
        </p>
      )}
    </section>
  )
}

function parsePortName(raw: string) {
  return raw.split(' ')[0] ?? raw
}
