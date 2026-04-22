import s from './TitleBar.module.css';
import { useApp } from '../../app/store';
import * as api from '../../shared/api/tauri';
import type { Screen } from '../../shared/types';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'workspace', label: '작업 화면' },
  { id: 'connect',   label: '연결' },
  { id: 'splitter',  label: '패킷 분리' },
  { id: 'checksum',  label: '체크섬' },
  { id: 'analyzer',  label: '분석' },
];

const WireScopeLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M1 9 C 3 9, 3 4, 5 4 S 7 14, 9 14 S 11 4, 13 4 S 15 9, 17 9"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

export function SessionTitleBar() {
  const { state, dispatch } = useApp();
  const { sessions, screen } = state;

  const screenLabel = SCREENS.find(s => s.id === screen)?.label ?? '';

  async function closeSession(id: string) {
    try { await api.disconnect(id); } catch {}
    dispatch({ type: 'REMOVE_SESSION', id });
    dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `세션 닫힘: ${id}`, kind: 'info' } });
  }

  return (
    <div className={s.titlebar}>
      {/* Brand */}
      <div className={s.brand}>
        <WireScopeLogo />
        <span>WireScope</span>
      </div>

      <div className={s.sep} />

      {/* Breadcrumb */}
      <div className={s.crumbs}>
        <span>{screenLabel}</span>
      </div>

      {/* Session tabs */}
      <div className={s.sessions}>
        {sessions.map(sess => (
          <div
            key={sess.id}
            className={`${s.tab} ${state.activeSessionId === sess.id ? s.active : ''} ${!sess.connected ? s.off : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_SESSION', id: sess.id })}
          >
            <span className={`${s.dot} ${sess.connected ? s.dotOn : s.dotOff}`} />
            <span className={s.tabLabel}>{sess.name}</span>
            <button
              className={s.tabClose}
              onClick={e => { e.stopPropagation(); closeSession(sess.id); }}
              title="세션 닫기"
            >×</button>
          </div>
        ))}
        <button
          className={s.newTab}
          onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'connect' })}
          title="새 연결 추가"
        >+</button>
      </div>

      <div className={s.spacer} />

      {/* Nav */}
      <nav className={s.nav}>
        {SCREENS.map(sc => (
          <button
            key={sc.id}
            className={`${s.navBtn} ${screen === sc.id ? s.navBtnActive : ''}`}
            onClick={() => dispatch({ type: 'SET_SCREEN', screen: sc.id })}
          >
            {sc.label}
          </button>
        ))}
      </nav>

    </div>
  );
}
