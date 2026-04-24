import { useEffect, useCallback, useState } from 'react';
import s from './Workspace.module.css';
import { ConnectionRail } from '../../widgets/connection-rail';
import { StreamStrip } from '../../widgets/packet-monitor/StreamStrip';
import { FilterBar } from '../../widgets/packet-monitor/FilterBar';
import { PacketTable } from '../../widgets/packet-monitor/PacketTable';
import { PacketInspector } from '../../widgets/packet-inspector';
import { TransmitDock } from '../../widgets/transmit-dock';
import { MainToolbar } from '../../widgets/main-toolbar';
import { ExportDialog } from '../../widgets/export-dialog';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { useApp, useActiveSession, usePackets, useIsReceiving } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import * as api from '../../shared/api/tauri';
import { formatSize } from '../../shared/lib/format';

export function WorkspacePage() {
  const { state, dispatch } = useApp();
  const activeSession = useActiveSession();
  const visiblePackets = usePackets();
  const isReceiving = useIsReceiving();
  const t = useT();
  const bufferMaxKb = (() => { try { return JSON.parse(localStorage.getItem('ws_serial_buffer') ?? '64') as number; } catch { return 64; } })();
  const [showExport, setShowExport] = useState(false);
  const [exportToast, setExportToast] = useState('');

  const connected = activeSession?.connected ?? false;
  const activeId = state.activeSessionId;

  const toggleReceive = useCallback(() => {
    if (!activeId) return;
    dispatch({ type: 'SET_RECEIVING', id: activeId, on: !isReceiving });
    dispatch({
      type: 'LOG_CONSOLE',
      entry: { ts: Date.now(), text: isReceiving ? t('ws.pausedLog') : t('ws.resumedLog'), kind: 'info', session_id: activeId },
    });
  }, [isReceiving, activeId, dispatch, t]);

  const handleClear = useCallback(async () => {
    if (!activeId) return;
    if (visiblePackets.length > 0 && !window.confirm(t('ws.clearConfirm'))) return;
    await api.clearPackets();
    dispatch({ type: 'CLEAR_PACKETS', id: activeId });
  }, [activeId, dispatch, visiblePackets.length, t]);

  // ⌘R toggle receive  ⌘K clear packets
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && connected) {
        e.preventDefault();
        toggleReceive();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleClear();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleReceive, handleClear, connected]);

  function handleExport() {
    setShowExport(true);
  }

  async function doExport(content: string, ext: string) {
    try {
      const path = await api.exportPackets(content, ext);
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `${t('ws.exportDone')}${path}`, kind: 'info', session_id: activeId ?? undefined } });
      setExportToast(`${t('ws.exportDone')}${path}`);
      setTimeout(() => setExportToast(''), 4000);
    } catch (e: any) {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `${t('ws.exportFailed')}${e}`, kind: 'err', session_id: activeId ?? undefined } });
      setExportToast(`${t('ws.exportFailed')}${e}`);
      setTimeout(() => setExportToast(''), 4000);
    }
  }

  return (
    <div className={s.workspace}>
      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        packets={visiblePackets}
        onExport={doExport}
      />
      {exportToast && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-2, #222)', color: 'var(--ink-1, #eee)',
          padding: '8px 16px', borderRadius: 8, fontSize: 12,
          fontFamily: 'var(--mono)', zIndex: 9999, maxWidth: '80vw',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          {exportToast}
        </div>
      )}

      {/* Toolbar */}
      <MainToolbar
        isReceiving={isReceiving}
        onToggleReceive={toggleReceive}
        onClear={handleClear}
        onExport={handleExport}
        connected={connected}
        hasPackets={visiblePackets.length > 0}
      />

      {/* Main 3-column body */}
      <div className={s.body}>
        <ConnectionRail />

        {/* Center: monitor */}
        <div className={s.center}>
          <FilterBar />
          <StreamStrip />
          <PacketTable />
          {state.dockOpen && <TransmitDock />}
        </div>

        <PacketInspector />
      </div>

      {/* Status bar */}
      <StatusBar
        left={
          <>
            <StatusChip dot={connected ? (isReceiving ? 'var(--ok)' : 'var(--ink-2)') : 'var(--ink-dim)'}>
              {connected
                ? `${activeSession?.name ?? 'WireScope'}${isReceiving ? t('ws.receiving') : t('ws.paused')}`
                : t('ws.noDevice')}
            </StatusChip>
            <StatusSep />
            <span>{visiblePackets.length.toLocaleString()}{t('ws.packets')}</span>
          </>
        }
        right={
          <>
            <span>{t('ws.buffer')}{formatSize(state.bufferBytes)} / {bufferMaxKb} KB</span>
            <StatusSep />
            <button
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--brand)',
                fontSize: 11,
                fontFamily: 'var(--mono)',
                padding: '0 4px',
              }}
              onClick={() => dispatch({ type: 'SET_DOCK_OPEN', open: !state.dockOpen })}
            >
              {state.dockOpen ? t('ws.transmitClose') : t('ws.transmitOpen')}
            </button>
          </>
        }
      />
    </div>
  );
}
