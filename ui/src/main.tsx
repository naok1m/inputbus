import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

class RenderErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-error">
          <div className="boot-error-card">
            <span className="boot-error-kicker">InputBus</span>
            <h1>UI failed to start</h1>
            <p>{this.state.error.message}</p>
            <small>Check DevTools or rebuild the renderer bundle if this happens after an update.</small>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RenderErrorBoundary>
      <App />
    </RenderErrorBoundary>
  </React.StrictMode>
);
