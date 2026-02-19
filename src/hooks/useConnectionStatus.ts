import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

const STATUS_POLL_INTERVAL_MS = 1000

type StatusCommand = 'serial_connected' | 'socket_connected'

export function useConnectionStatus(command: StatusCommand, connId: string) {
  const [connected, setConnected] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const next = await invoke<boolean>(command, { conn_id: connId })
      setConnected(next)
      return next
    } catch {
      setConnected(false)
      return false
    }
  }, [command, connId])

  useEffect(() => {
    let alive = true

    const refresh = async () => {
      try {
        const next = await invoke<boolean>(command, { conn_id: connId })
        if (!alive) {
          return
        }
        setConnected(next)
      } catch {
        if (!alive) {
          return
        }
        setConnected(false)
      }
    }

    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, STATUS_POLL_INTERVAL_MS)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [command, connId])

  return {
    connected,
    refreshStatus,
  }
}
