import s from './TitleBar.module.css';
import { useApp } from '../../app/store';
import * as api from '../../shared/api/tauri';
import { useT } from '../../shared/lib/i18n';
import type { Screen } from '../../shared/types';

const WireScopeLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M1 9 C 3 9, 3 4, 5 4 S 7 14, 9 14 S 11 4, 13 4 S 15 9, 17 9"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

export function SessionTitleBar() {
  const { state, dispatch } = useApp();
  const { sessions, screen } = state;
  const t = useT();

  const SCREENS: { id: Screen; label: string }[] = [
    { id: 'workspace', label: t('nav.workspace') },
    { id: 'connect',   label: t('nav.connect') },
    { id: 'splitter',  label: t('nav.splitter') },
    { id: 'checksum',  label: t('nav.checksum') },
    { id: 'analyzer',  label: t('nav.analyzer') },
  ];

  const screenLabel = SCREENS.find(s => s.id === screen)?.label ?? '';

  async function closeSession(id: string) {
    try { await api.disconnect(id); } catch {}
    const name = sessions.find(s => s.id === id)?.name ?? id;
    dispatch({ type: 'LOG_CONSOLE', entry: { ts: Date.now(), text: `Session closed: ${name}`, kind: 'info', session_id: id } });
    dispatch({ type: 'REMOVE_SESSION', id });
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
              title={t('nav.closeSession')}
            >×</button>
          </div>
        ))}
        <button
          className={s.newTab}
          onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'connect' })}
          title={t('nav.addSession')}
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
