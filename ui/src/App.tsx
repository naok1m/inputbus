import { useEffect, useState } from 'react';
import { useBindingStore } from './store/mappingStore';
import { CaptureToggle } from './components/CaptureToggle';
import { GamepadPreview } from './components/GamepadPreview';
import { SensitivityEditor } from './components/SensitivityEditor';
import { KeyMapper } from './components/KeyMapper';
import { ProfileSelector } from './components/ProfileSelector';
import './styles.css';

type Tab = 'dashboard' | 'mouse' | 'bindings' | 'profiles';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const syncToCore         = useBindingStore(s => s.syncToCore);
  const setCoreConnected   = useBindingStore(s => s.setCoreConnected);
  const setCaptureEnabled  = useBindingStore(s => s.setCaptureEnabledFromCore);
  const requestStatus      = useBindingStore(s => s.requestStatus);
  const coreConnected      = useBindingStore(s => s.coreConnected);
  const captureEnabled     = useBindingStore(s => s.captureEnabled);

  useEffect(() => {
    syncToCore();
  }, [syncToCore]);

  useEffect(() => {
    if (!window.electronAPI?.onCoreMessage) return;

    const off = window.electronAPI.onCoreMessage((msg) => {
      if (msg.type === 100 && typeof msg.payload === 'object' && msg.payload !== null) {
        const p = msg.payload as { _bridge?: boolean; connected?: boolean; captureEnabled?: boolean };

        // Bridge connection/disconnection events (from electron main process)
        if (p._bridge) {
          setCoreConnected(!!p.connected);
          if (p.connected) { syncToCore(); requestStatus(); }
          return;
        }

        // Core status responses (from rewsd_core via pipe)
        if (typeof p.captureEnabled === 'boolean') setCaptureEnabled(p.captureEnabled);
      }
    });

    const timer = window.setInterval(() => requestStatus(), 1500);
    return () => { off?.(); window.clearInterval(timer); };
  }, [requestStatus, setCaptureEnabled, setCoreConnected, syncToCore]);

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '◈', label: 'Dashboard' },
    { id: 'mouse',     icon: '⊕', label: 'Mouse' },
    { id: 'bindings',  icon: '⌨', label: 'Bindings' },
    { id: 'profiles',  icon: '☰', label: 'Profiles' },
  ];

  return (
    <>
      <div className="titlebar">
        <span className="titlebar-logo">InputBus</span>
        <button
          className="titlebar-close"
          onClick={() => window.electronAPI?.closeWindow?.()}
          title="Close"
        >✕</button>
      </div>

      <div className="app-shell">
        <nav className="sidebar">
          {navItems.map(({ id, icon, label }) => (
            <button
              key={id}
              className={`nav-btn ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </button>
          ))}

          <div className="sidebar-spacer" />

          <div className="sidebar-status">
            <div className="status-row">
              <div className={`dot ${coreConnected ? 'dot-green' : 'dot-red'}`} />
              <span>{coreConnected ? 'Core running' : 'Core offline'}</span>
            </div>
            <div className="status-row">
              <div className={`dot ${captureEnabled ? 'dot-orange' : 'dot-gray'}`} />
              <span>{captureEnabled ? 'Capturing' : 'Idle'}</span>
            </div>
          </div>
        </nav>

        <main className="content">
          {tab === 'dashboard' && (
            <div className="dash-grid">
              <CaptureToggle />
              <GamepadPreview />
            </div>
          )}
          {tab === 'mouse'    && <SensitivityEditor />}
          {tab === 'bindings' && <KeyMapper />}
          {tab === 'profiles' && <ProfileSelector />}
        </main>
      </div>
    </>
  );
}
