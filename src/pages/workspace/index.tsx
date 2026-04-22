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
import * as api from '../../shared/api/tauri';
import { formatSize } from '../../shared/lib/format';

export function WorkspacePage() {
  const { state, dispatch } = useApp();
  const activeSession = useActiveSession();
  const isReceiving = state.isReceiving;

  const connected = state.sessions.some(s => s.connected);

  const toggleReceive = useCallback(() => {
    dispatch({ type: 'SET_RECEIVING', on: !isReceiving });
    dispatch({
      type: 'LOG_CONSOLE',
      entry: { ts: Date.now(), text: isReceiving ? '수신 일시정지됨' : '수신 재개됨', kind: 'info' },
    });
  }, [isReceiving, dispatch]);

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
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `내보내기 완료 → ${path}`, kind: 'info' } });
    } catch (e: any) {
      dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `내보내기 실패: ${e}`, kind: 'err' } });
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
                ? `${activeSession?.name ?? '연결됨'} · 수신 중`
                : '연결된 장치 없음'}
            </StatusChip>
            <StatusSep />
            <span>{state.packets.length.toLocaleString()}개 패킷</span>
          </>
        }
        right={
          <>
            <span>버퍼 {formatSize(state.bufferBytes)} / 64 MB</span>
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
              {state.dockOpen ? '전송 닫기' : '전송 열기'}
            </button>
          </>
        }
      />
    </div>
  );
}
