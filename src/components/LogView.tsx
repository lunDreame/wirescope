import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogLine, ViewMode } from '../types/wirescope'
import { formatPayload } from '../lib/format'

interface LogViewProps {
  logs: LogLine[]
  viewMode: ViewMode
}

const ROW_HEIGHT_PX = 28
const HEADER_HEIGHT_PX = 30
const OVERSCAN_ROWS = 12

export function LogView({ logs, viewMode }: LogViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const pendingScrollTopRef = useRef(0)

  useEffect(() => {
    if (logs.length === 0) {
      setSelectedIndex(0)
      setScrollTop(0)
      if (tableWrapRef.current) {
        tableWrapRef.current.scrollTop = 0
      }
      return
    }

    if (selectedIndex >= logs.length) {
      setSelectedIndex(logs.length - 1)
    }
  }, [logs.length, selectedIndex])

  useEffect(() => {
    const element = tableWrapRef.current
    if (!element) {
      return
    }

    const updateViewport = () => {
      setViewportHeight(element.clientHeight)
    }

    updateViewport()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport)
      return () => {
        window.removeEventListener('resize', updateViewport)
      }
    }

    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [])

  const selected = logs[selectedIndex]
  const totalRows = logs.length

  const bodyHeight = Math.max(viewportHeight - HEADER_HEIGHT_PX, ROW_HEIGHT_PX * 10)
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS)
  const visibleEnd = Math.min(totalRows, Math.ceil((scrollTop + bodyHeight) / ROW_HEIGHT_PX) + OVERSCAN_ROWS)

  const visibleRows = useMemo(() => {
    const next = []

    for (let index = visibleStart; index < visibleEnd; index += 1) {
      const line = logs[index]
      if (!line) {
        continue
      }

      next.push({
        id: index + 1,
        index,
        when: line.when_iso,
        dir: line.dir,
        origin: line.origin.toUpperCase(),
        bytes: line.raw.length,
        preview: makePreview(formatPayload(line.raw, viewMode, line.text)),
      })
    }

    return next
  }, [logs, viewMode, visibleStart, visibleEnd])

  const topSpacerHeight = visibleStart * ROW_HEIGHT_PX
  const bottomSpacerHeight = Math.max(0, (totalRows - visibleEnd) * ROW_HEIGHT_PX)

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop

    if (scrollRafRef.current !== null) {
      return
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      setScrollTop(pendingScrollTopRef.current)
    })
  }

  const detailText = selected
    ? selected.text
        .replaceAll('\r\n', '\\r\\n\n')
        .replaceAll('\n', '\\n\n')
        .replaceAll('\r', '\\r')
    : ''

  const detailHex = selected
    ? selected.raw.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
    : ''

  const detailValue = viewMode === 'ascii' ? detailText || '(empty)' : detailHex || '(empty)'

  return (
    <section className="log-workbench" aria-label="Log Workbench">
      {totalRows === 0 ? (
        <div className="log-table-wrap" />
      ) : (
        <>
          <div className="log-table-wrap" ref={tableWrapRef} onScroll={onScroll}>
            <table className="log-table">
              <thead>
                <tr>
                  <th style={{ width: '54px' }}>No.</th>
                  <th style={{ width: '240px' }}>Timestamp</th>
                  <th style={{ width: '72px' }}>Dir</th>
                  <th style={{ width: '92px' }}>Source</th>
                  <th style={{ width: '70px' }}>Bytes</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {topSpacerHeight > 0 && (
                  <tr className="spacer" aria-hidden>
                    <td colSpan={6} style={{ height: topSpacerHeight }} />
                  </tr>
                )}

                {visibleRows.map((row) => {
                  const rowClass = [row.index === selectedIndex ? 'selected' : '', row.id % 2 === 0 ? 'even' : '']
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <tr key={`${row.when}-${row.index}`} className={rowClass} onClick={() => setSelectedIndex(row.index)}>
                      <td>{row.id}</td>
                      <td>{row.when}</td>
                      <td>
                        <span className={`dir-badge ${row.dir.toLowerCase()}`}>{row.dir}</span>
                      </td>
                      <td>{row.origin}</td>
                      <td>{row.bytes}</td>
                      <td className="payload-preview">{row.preview}</td>
                    </tr>
                  )
                })}

                {bottomSpacerHeight > 0 && (
                  <tr className="spacer" aria-hidden>
                    <td colSpan={6} style={{ height: bottomSpacerHeight }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <section className="log-detail">
              <header>
                <h3>Frame Detail</h3>
                <div className="detail-meta">
                  <span>{selected.when_iso}</span>
                  <span>{selected.origin.toUpperCase()}</span>
                  <span>{selected.dir}</span>
                  <span>+{selected.interval_ms}ms</span>
                </div>
              </header>

              <div className={`detail-inline ${viewMode}`}>
                <div className="detail-inline-value">{detailValue}</div>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  )
}

function makePreview(source: string) {
  return source.replace(/\s+/g, ' ').trim().slice(0, 120)
}
