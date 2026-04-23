import { Component, ReactNode } from 'react';
import { UpdateProvider } from '../shared/lib/update-context';
import { useApp } from './store';
import { getT } from '../shared/lib/i18n';
import { SessionTitleBar } from '../widgets/session-titlebar';
import { WorkspacePage } from '../pages/workspace';
import { ConnectPage } from '../pages/connect';
import { SplitterPage } from '../pages/splitter';
import { ChecksumPage } from '../pages/checksum';
import { AnalyzerPage } from '../pages/analyzer';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      const settings = (() => { try { return JSON.parse(localStorage.getItem('ws_settings') ?? '{}'); } catch { return {}; } })();
      const lang = settings.language ?? 'ko';
      const dark = settings.theme === 'dark' || document.body.classList.contains('theme-dark');
      const t = getT(lang);

      const bg   = dark ? '#0f0f0f' : '#ffffff';
      const fg   = dark ? '#e8e8e8' : '#111111';
      const pre  = dark ? '#ff6b6b' : '#c0392b';
      const btn  = dark ? '#2a2a2a' : '#f0f0f0';
      const bdr  = dark ? '#444'    : '#ccc';

      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: bg, color: fg, minHeight: '100vh', boxSizing: 'border-box' }}>
          <strong style={{ fontSize: 15 }}>{t('error.occurred')}</strong>
          <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', color: pre, fontSize: 13 }}>{this.state.error}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 16,
              padding: '6px 18px',
              background: btn,
              color: fg,
              border: `1px solid ${bdr}`,
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t('error.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const { state } = useApp();

  function renderScreen() {
    switch (state.screen) {
      case 'connect':   return <ConnectPage />;
      case 'splitter':  return <SplitterPage />;
      case 'checksum':  return <ChecksumPage />;
      case 'analyzer':  return <AnalyzerPage />;
      default:          return <WorkspacePage />;
    }
  }

  return (
    <div className="app-shell">
      <SessionTitleBar />
      {renderScreen()}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <UpdateProvider>
        <AppInner />
      </UpdateProvider>
    </ErrorBoundary>
  );
}
