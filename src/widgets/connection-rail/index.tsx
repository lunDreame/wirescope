import { useState } from 'react';
import s from './Rail.module.css';
import { useApp } from '../../app/store';
import { useT } from '../../shared/lib/i18n';
import { formatSize } from '../../shared/lib/format';
import type { SavedFilter } from '../../shared/types';

const MonitorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="2" y="3" width="10" height="8" rx="1"/><path d="M2 6h10"/>
  </svg>
);
const SplitIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M2 7h10M5 3l2 4-2 4"/>
  </svg>
);
const AnalyzeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M2 12L6 5l3 4 3-8"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M3 7l3 3 5-6"/>
  </svg>
);
const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M7 2v10M2 7h10"/>
  </svg>
);

export function ConnectionRail() {
  const { state, dispatch } = useApp();
  const { sessions, activeSessionId, screen, filter, savedFilters, txPresets, bufferBytes } = state;
  const t = useT();
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const totalPackets = state.packets.length;
  const [addingFilter, setAddingFilter] = useState(false);
  const [newFilterLabel, setNewFilterLabel] = useState('');
  const [newFilterQuery, setNewFilterQuery] = useState('');

  function applyFilter(f: SavedFilter) {
    dispatch({ type: 'SET_FILTER', filter: { tokens: [f.query] } });
  }

  function saveNewFilter() {
    if (!newFilterLabel.trim() || !newFilterQuery.trim()) return;
    dispatch({
      type: 'ADD_SAVED_FILTER',
      filter: { id: Date.now().toString(), label: newFilterLabel.trim(), query: newFilterQuery.trim() },
    });
    setNewFilterLabel('');
    setNewFilterQuery('');
    setAddingFilter(false);
  }

  const bufferMaxKb = (() => { try { return JSON.parse(localStorage.getItem('ws_serial_buffer') ?? '64'); } catch { return 64; } })();

  return (
    <div className={s.rail}>
      {/* Connections section */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          {t('rail.connections')}
          <button
            className={s.addBtn}
            onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'connect' })}
            title={t('rail.addConn')}
          >+</button>
        </div>

        {sessions.length === 0 ? (
          <div className={s.empty}>
            <div>{t('rail.noDevices')}</div>
            <button
              className={s.emptyBtn}
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'connect' })}
            >
              {t('rail.newConn')}
            </button>
          </div>
        ) : sessions.map(sess => (
          <div
            key={sess.id}
            className={`${s.conn} ${activeSessionId === sess.id ? s.connActive : ''} ${!sess.connected ? s.connOff : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_SESSION', id: sess.id })}
          >
            <span className={`${s.bar} ${!sess.connected ? s.barOff : ''}`} />
            <div className={s.connInfo}>
              <div className={s.connName}>{sess.name}</div>
              <div className={s.connSub}>
                {sess.port_params ?? sess.kind.toUpperCase()}
                {!sess.connected && ` · ${t('rail.disconnected')}`}
              </div>
            </div>
            {sess.connected && (
              <div className={s.connRate}>
                <b>{sess.rx_bytes > 0 ? (sess.rx_bytes / 1024).toFixed(0) : '0'}</b>{t('rail.rateUnit')}<br/>{t('rail.receiveRate')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Session sub-nav */}
      {activeSession && (
        <div className={s.section} style={{ paddingTop: 4 }}>
          <div className={s.sectionHead}>{activeSession.name}</div>
          <div className={s.subnav}>
            <NavItem
              icon={<MonitorIcon />}
              label={t('rail.liveMonitor')}
              count={totalPackets}
              active={screen === 'workspace'}
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'workspace' })}
            />
            <NavItem
              icon={<SplitIcon />}
              label={t('rail.splitter')}
              count={state.splitter.sof.length > 0 ? state.splitter.sof.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ') : undefined}
              active={screen === 'splitter'}
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'splitter' })}
            />
            <NavItem
              icon={<AnalyzeIcon />}
              label={t('rail.analyzer')}
              active={screen === 'analyzer'}
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'analyzer' })}
            />
            <NavItem
              icon={<CheckIcon />}
              label={t('rail.checksum')}
              active={screen === 'checksum'}
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'checksum' })}
            />
            <NavItem
              icon={<SendIcon />}
              label={t('rail.transmit')}
              count={txPresets.length}
              active={false}
              onClick={() => dispatch({ type: 'SET_DOCK_OPEN', open: true })}
            />
          </div>
        </div>
      )}

      {/* Saved filters */}
      <div className={s.section}>
        <div className={s.sectionHead}>{t('rail.savedFilters')}</div>
        <div className={s.subnav}>
          {savedFilters.map(f => (
            <div
              key={f.id}
              className={`${s.navItem} ${filter.tokens.length === 1 && filter.tokens[0] === f.query ? s.navItemOn : ''}`}
              onClick={() => applyFilter(f)}
            >
              <span className={s.filterDot}>·</span>
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.count !== undefined && (
                <span className={`${s.count} ${f.id === '3' ? s.countErr : ''}`}>
                  {f.count}
                </span>
              )}
              <button
                className={s.filterRemove}
                onClick={e => { e.stopPropagation(); dispatch({ type: 'REMOVE_SAVED_FILTER', id: f.id }); }}
                title={t('rail.deleteFilter')}
              >×</button>
            </div>
          ))}
          {addingFilter ? (
            <div className={s.addFilterForm}>
              <input
                className={s.filterInp}
                value={newFilterLabel}
                onChange={e => setNewFilterLabel(e.target.value)}
                placeholder={t('rail.filterName')}
                autoFocus
              />
              <input
                className={s.filterInp}
                value={newFilterQuery}
                onChange={e => setNewFilterQuery(e.target.value)}
                placeholder={t('rail.filterQuery')}
                onKeyDown={e => { if (e.key === 'Enter') saveNewFilter(); if (e.key === 'Escape') setAddingFilter(false); }}
              />
              <div className={s.filterFormBtns}>
                <button className={s.filterSaveBtn} onClick={saveNewFilter}>{t('rail.save')}</button>
                <button className={s.filterCancelBtn} onClick={() => setAddingFilter(false)}>{t('rail.cancel')}</button>
              </div>
            </div>
          ) : (
            <div
              className={s.navItem}
              style={{ color: 'var(--brand)' }}
              onClick={() => setAddingFilter(true)}
            >
              {t('rail.addFilter')}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Buffer info */}
      <div className={s.bufferRow}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="6" cy="6" r="4.5"/><path d="M6 3.5v3l1.5 1"/>
        </svg>
        {t('rail.buffer')} · {formatSize(bufferBytes)} / {bufferMaxKb} MB
      </div>
    </div>
  );
}

function NavItem({ icon, label, count, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  count?: number | string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`${s.navItem} ${active ? s.navItemOn : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className={s.count}>{count}</span>}
    </div>
  );
}
