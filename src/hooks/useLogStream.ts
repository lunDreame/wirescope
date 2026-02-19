import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { LogLine } from '../types/wirescope'
import { MAX_LOG_LINES } from '../constants'

const LOG_FLUSH_INTERVAL_MS = 50

export function useLogStream() {
  const [logs, setLogs] = useState<LogLine[]>([])
  const pendingRef = useRef<LogLine[]>([])
  const flushTimerRef = useRef<number | null>(null)

  const appendLogs = useCallback((incoming: LogLine[]) => {
    if (incoming.length === 0) {
      return
    }

    setLogs((previous) => {
      const total = previous.length + incoming.length
      if (total <= MAX_LOG_LINES) {
        return [...previous, ...incoming]
      }

      const overflow = total - MAX_LOG_LINES
      if (overflow >= previous.length) {
        return incoming.slice(incoming.length - MAX_LOG_LINES)
      }

      return [...previous.slice(overflow), ...incoming]
    })
  }, [])

  useEffect(() => {
    let disposed = false

    const flushPending = () => {
      flushTimerRef.current = null
      if (disposed || pendingRef.current.length === 0) {
        return
      }

      const batch = pendingRef.current
      pendingRef.current = []
      appendLogs(batch)
    }

    const scheduleFlush = () => {
      if (flushTimerRef.current !== null) {
        return
      }

      flushTimerRef.current = window.setTimeout(flushPending, LOG_FLUSH_INTERVAL_MS)
    }

    const unlisten = listen<LogLine>('log', (event) => {
      if (event.payload.dir === 'SYS') {
        return
      }

      pendingRef.current.push(event.payload)
      scheduleFlush()
    })

    return () => {
      disposed = true
      pendingRef.current = []

      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }

      unlisten.then((cleanup) => cleanup())
    }
  }, [appendLogs])

  const clear = useCallback(() => {
    pendingRef.current = []
    setLogs([])
  }, [])

  return {
    logs,
    clear,
  }
}
