import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

const POLL_INTERVAL_MS = 2000

export function useSerialPorts() {
  const [ports, setPorts] = useState<string[]>([])
  const [lastError, setLastError] = useState<string>('')

  useEffect(() => {
    let alive = true

    const refreshPorts = async () => {
      try {
        const list = await invoke<string[]>('list_serial_ports')
        if (!alive) {
          return
        }
        setPorts(list)
        setLastError('')
      } catch (error) {
        if (!alive) {
          return
        }
        setLastError(String(error))
      }
    }

    refreshPorts()
    const timer = setInterval(refreshPorts, POLL_INTERVAL_MS)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return {
    ports,
    lastError,
  }
}
