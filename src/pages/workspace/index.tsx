import { useEffect, useCallback } from 'react';
import s from './Workspace.module.css';
import { ConnectionRail } from '../../widgets/connection-rail';
import { StreamStrip } from '../../widgets/packet-monitor/StreamStrip';
import { FilterBar } from '../../widgets/packet-monitor/FilterBar';
import { PacketTable } from '../../widgets/packet-monitor/PacketTable';
import { PacketInspector } from '../../widgets/packet-inspector';
import { TransmitDock } from '../../widgets/transmit-dock';
import { MainToolbar } from '../../widgets/main-toolbar';
import { StatusBar, StatusChip, StatusSep } from '../../shared/ui/StatusBar';
import { useApp, useActiveSession } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import * as api from '../../shared/api/tauri';
import { formatSize } from '../../shared/lib/format';

export function WorkspacePage() {
  const { state, dispatch } = useApp();
  const activeSession = useActiveSession();
  const isReceiving = state.isReceiving;
  const t = useT();

  const connected = state.sessions.some(s => s.connected);

  const toggleReceive = useCallback(() => {
    dispatch({ type: 'SET_RECEIVING', on: !isReceiving });
    dispatch({
      type: 'LOG_CONSOLE',
      entry: { ts: Date.now(), text: isReceiving ? t('ws.pausedLog') : t('ws.resumedLog'), kind: 'info' },
    });
  }, [isReceiving, dispatch, t]);

  const handleClear = useCallback(async () => {
    await api.clearPackets();
    dispatch({ type: 'CLEAR_PACKETS' });
  }, [dispatch]);

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

  async function handleExport() {
    if (state.packets.length === 0) return;
    try {
      const path = await api.exportPackets(JSON.stringify(state.packets, null, 2));
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `${t('ws.exportDone')}${path}`, kind: 'info' } });
    } catch (e: any) {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `${t('ws.exportFailed')}${e}`, kind: 'err' } });
    }
  }

  return (
    <div className={s.workspace}>
      {/* Toolbar */}
      <MainToolbar
        isReceiving={isReceiving}
        onToggleReceive={toggleReceive}
        onClear={handleClear}
        onExport={handleExport}
        connected={connected}
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
            <StatusChip dot={connected ? 'var(--ok)' : 'var(--ink-dim)'}>
              {connected
                ? `${activeSession?.name ?? 'WireScope'}${t('ws.receiving')}`
                : t('ws.noDevice')}
            </StatusChip>
            <StatusSep />
            <span>{state.packets.length.toLocaleString()}{t('ws.packets')}</span>
          </>
        }
        right={
          <>
            <span>{t('ws.buffer')}{formatSize(state.bufferBytes)} / 64 MB</span>
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
