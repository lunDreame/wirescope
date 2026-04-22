import { Component, ReactNode } from 'react';
import { useApp } from './store';
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
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <strong>오류 발생</strong>
          <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', color: 'oklch(0.55 0.18 25)' }}>{this.state.error}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16 }}>다시 시도</button>
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
      <AppInner />
    </ErrorBoundary>
  );
}
