import { useEffect, useState } from 'react';
import { useBindingStore } from './store/mappingStore';
import { CaptureToggle } from './components/CaptureToggle';
import { GamepadPreview } from './components/GamepadPreview';
import { SensitivityEditor } from './components/SensitivityEditor';
import { KeyMapper } from './components/KeyMapper';
import { ProfileSelector } from './components/ProfileSelector';
import { LicenseTab } from './components/LicenseTab';
import GamePresets from './components/GamePresets';
import { MacroPanel } from './components/MacroPanel';
import './styles.css';

type Tab = 'dashboard' | 'games' | 'mouse' | 'bindings' | 'profiles' | 'license';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const syncToCore         = useBindingStore(s => s.syncToCore);
  const setCoreConnected   = useBindingStore(s => s.setCoreConnected);
  const setCaptureEnabled  = useBindingStore(s => s.setCaptureEnabledFromCore);
  const requestStatus      = useBindingStore(s => s.requestStatus);
  const coreConnected      = useBindingStore(s => s.coreConnected);
  const captureEnabled     = useBindingStore(s => s.captureEnabled);
  const controllerType     = useBindingStore(s => s.controllerType);
  const setControllerType  = useBindingStore(s => s.setControllerType);

  useEffect(() => {
    syncToCore();
  }, [syncToCore]);

  useEffect(() => {
    if (!window.electronAPI?.onCoreMessage) return;

    const off = window.electronAPI.onCoreMessage((msg) => {
      if (msg.type === 100 && typeof msg.payload === 'object' && msg.payload !== null) {
        const p = msg.payload as { _bridge?: boolean; connected?: boolean; captureEnabled?: boolean };

        if (p._bridge) {
          setCoreConnected(!!p.connected);
          if (p.connected) { syncToCore(); requestStatus(); }
          return;
        }

        if (typeof p.captureEnabled === 'boolean') setCaptureEnabled(p.captureEnabled);
      }
    });

    const timer = window.setInterval(() => requestStatus(), 1500);
    return () => { off?.(); window.clearInterval(timer); };
  }, [requestStatus, setCaptureEnabled, setCoreConnected, syncToCore]);

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '◈', label: 'Dashboard' },
    { id: 'games',     icon: '▣', label: 'Games' },
    { id: 'mouse',     icon: '⊕', label: 'Mouse' },
    { id: 'bindings',  icon: '⌨', label: 'Bindings' },
    { id: 'profiles',  icon: '☰', label: 'Profiles' },
    { id: 'license',   icon: '⚿', label: 'License' },
  ];

  return (
    <>
      <div className="titlebar">
        <span className="titlebar-logo">InputBus</span>
        <span className="titlebar-version">v1.0</span>
        <div className="titlebar-controls">
          <button
            className="titlebar-btn"
            onClick={() => window.electronAPI?.minimizeWindow?.()}
            title="Minimize"
          >─</button>
          <button
            className="titlebar-close"
            onClick={() => window.electronAPI?.closeWindow?.()}
            title="Close"
          >✕</button>
        </div>
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

          {/* Controller type selector */}
          <div className="sidebar-section">
            <div className="sidebar-section-label">Controller</div>
            <select
              className="controller-select"
              value={controllerType}
              onChange={e => setControllerType(e.target.value as 'xbox360' | 'dualsense' | 'vader4pro')}
            >
              <option value="vader4pro">Vader 4 Pro</option>
              <option value="xbox360">Xbox 360</option>
              <option value="dualsense">DualSense</option>
            </select>
          </div>

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
            <>
              <div className="dash-grid">
                <CaptureToggle />
                <GamepadPreview />
              </div>
              <MacroPanel />
            </>
          )}
          {tab === 'games'    && <GamePresets />}
          {tab === 'mouse'    && <SensitivityEditor />}
          {tab === 'bindings' && <KeyMapper />}
          {tab === 'profiles' && <ProfileSelector />}
          {tab === 'license'  && <LicenseTab />}
        </main>
      </div>
    </>
  );
}
