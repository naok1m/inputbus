import { useEffect, useState, useRef, useMemo } from 'react';
import { useBindingStore } from './store/mappingStore';
import { GamepadPreview } from './components/GamepadPreview';
import { SensitivityEditor } from './components/SensitivityEditor';
import { KeyMapper } from './components/KeyMapper';
import { MacroGrid } from './components/MacroPanel';
import GamePresets from './components/GamePresets';
import { SettingsTab } from './components/SettingsTab';
import './styles.css';

type Tab = 'overview' | 'presets' | 'analog' | 'mappings' | 'macros' | 'settings';

const VK_NAMES: Record<number, string> = {
  0x70:'F1',0x71:'F2',0x72:'F3',0x73:'F4',0x74:'F5',0x75:'F6',
  0x76:'F7',0x77:'F8',0x78:'F9',0x79:'F10',0x7A:'F11',0x7B:'F12',
  0xC0:'~',0x14:'CapsLock',
};

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview',  icon: '\u25C8', label: 'Overview' },
  { id: 'presets',   icon: '\u{1F3AE}', label: 'Presets' },
  { id: 'analog',    icon: '\u{1F5B1}', label: 'Analog' },
  { id: 'mappings',  icon: '\u2328',  label: 'Mappings' },
  { id: 'macros',    icon: '\u26A1',  label: 'Macros' },
];

const CONTROLLER_NAMES: Record<string, string> = {
  vader4pro: 'Vader 4 Pro',
  xbox360: 'Xbox 360',
  dualsense: 'DualSense',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const syncToCore         = useBindingStore(s => s.syncToCore);
  const setCoreConnected   = useBindingStore(s => s.setCoreConnected);
  const setCaptureEnabled  = useBindingStore(s => s.setCaptureEnabledFromCore);
  const requestStatus      = useBindingStore(s => s.requestStatus);
  const coreConnected      = useBindingStore(s => s.coreConnected);
  const captureEnabled     = useBindingStore(s => s.captureEnabled);
  const toggleCapture      = useBindingStore(s => s.setCaptureEnabled);
  const controllerType     = useBindingStore(s => s.controllerType);
  const setControllerType  = useBindingStore(s => s.setControllerType);
  const activeProfile      = useBindingStore(s => s.activeProfile);
  const savedProfiles      = useBindingStore(s => s.savedProfiles);
  const loadProfile        = useBindingStore(s => s.loadProfile);
  const refreshProfiles    = useBindingStore(s => s.refreshProfiles);
  const macros             = useBindingStore(s => s.macros);
  const hotkeyVk           = useBindingStore(s => s.hotkeyVk);
  const hotkeyMods         = useBindingStore(s => s.hotkeyMods);

  const hotkeyLabel = useMemo(() => {
    const parts: string[] = [];
    if (hotkeyMods & 0x01) parts.push('Shift');
    if (hotkeyMods & 0x02) parts.push('Ctrl');
    if (hotkeyMods & 0x04) parts.push('Alt');
    parts.push(VK_NAMES[hotkeyVk] ?? `0x${hotkeyVk.toString(16)}`);
    return parts.join('+');
  }, [hotkeyVk, hotkeyMods]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (ctrlRef.current && !ctrlRef.current.contains(e.target as Node)) setCtrlOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);
  useEffect(() => { syncToCore(); }, [syncToCore]);

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

  const activeMacroCount = macros.filter(m => m.enabled).length;

  return (
    <>
      {/* ── Titlebar / Context Bar ── */}
      <div className="titlebar">
        <span className="titlebar-logo">InputBus</span>
        <span className="titlebar-version">v2.0</span>

        <div className="titlebar-context">
          {/* Controller selector */}
          <div ref={ctrlRef} style={{ position: 'relative' }}>
            <button className="ctx-dropdown" onClick={() => { setCtrlOpen(!ctrlOpen); setProfileOpen(false); }}>
              <span className="ctx-label">Controller</span>
              <span className="ctx-value">{CONTROLLER_NAMES[controllerType] ?? controllerType}</span>
              <span className="ctx-chevron">{'\u25BE'}</span>
            </button>
            {ctrlOpen && (
              <div className="ctx-dropdown-panel">
                {(['vader4pro', 'xbox360', 'dualsense'] as const).map(t => (
                  <button
                    key={t}
                    className={`ctx-dropdown-item ${controllerType === t ? 'active' : ''}`}
                    onClick={() => { setControllerType(t); setCtrlOpen(false); }}
                  >
                    <span className="check">{controllerType === t ? '\u2713' : ''}</span>
                    {CONTROLLER_NAMES[t]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ctx-divider" />

          {/* Profile selector */}
          <div ref={profileRef} style={{ position: 'relative' }}>
            <button className="ctx-dropdown" onClick={() => { setProfileOpen(!profileOpen); setCtrlOpen(false); }}>
              <span className="ctx-label">Profile</span>
              <span className="ctx-value">{activeProfile || 'default'}</span>
              <span className="ctx-chevron">{'\u25BE'}</span>
            </button>
            {profileOpen && (
              <div className="ctx-dropdown-panel" style={{ minWidth: 220 }}>
                {savedProfiles.map(name => (
                  <button
                    key={name}
                    className={`ctx-dropdown-item ${name === activeProfile ? 'active' : ''}`}
                    onClick={() => { loadProfile(name); setProfileOpen(false); }}
                  >
                    <span className="check">{name === activeProfile ? '\u2713' : ''}</span>
                    {name}
                  </button>
                ))}
                {savedProfiles.length > 0 && <div className="ctx-dropdown-sep" />}
                <button
                  className="ctx-dropdown-item"
                  onClick={() => { setTab('settings'); setProfileOpen(false); }}
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span className="check">{'\u2699'}</span>
                  Manage Profiles
                </button>
              </div>
            )}
          </div>

          <div className="ctx-divider" />

          {/* Capture toggle */}
          <button
            className={`capture-btn ${captureEnabled ? 'active' : ''}`}
            disabled={!coreConnected}
            onClick={() => toggleCapture(!captureEnabled)}
            title={captureEnabled ? `Stop capture (${hotkeyLabel})` : `Start capture (${hotkeyLabel})`}
          >
            <span className="capture-dot" />
            {captureEnabled ? 'LIVE' : 'START'}
          </button>
        </div>

        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => window.electronAPI?.minimizeWindow?.()} title="Minimize">{'\u2500'}</button>
          <button className="titlebar-close" onClick={() => window.electronAPI?.closeWindow?.()} title="Close">{'\u2715'}</button>
        </div>
      </div>

      {/* ── Shell ── */}
      <div className="app-shell">
        {/* Nav Rail */}
        <nav className="nav-rail">
          {NAV_ITEMS.map(({ id, icon, label }) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
              title={label}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
          <div className="nav-spacer" />
          <button
            className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
            title="Settings"
          >
            <span className="nav-icon">{'\u2699'}</span>
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        {/* Main Area */}
        <div className="main-area">
          <main className="content">
            {tab === 'overview' && (
              <>
                {/* Hero capture status */}
                <div className="overview-hero">
                  <div className="hero-status">
                    <div className={`hero-label ${captureEnabled ? 'on' : ''}`}>
                      {captureEnabled ? 'CAPTURING' : 'IDLE'}
                    </div>
                    <div className="hero-hint">
                      {coreConnected ? `${hotkeyLabel} toggles capture` : 'Waiting for core process\u2026'}
                    </div>
                    <button
                      className={`hero-btn ${captureEnabled ? 'stop' : ''}`}
                      disabled={!coreConnected}
                      onClick={() => toggleCapture(!captureEnabled)}
                    >
                      {captureEnabled ? 'Stop' : 'Start Capture'}
                    </button>
                  </div>
                </div>

                {/* Quick stats */}
                <div className="quick-stats">
                  <div className="stat-card">
                    <div className="stat-label">Active Macros</div>
                    <div className={`stat-value ${activeMacroCount > 0 ? 'green' : ''}`}>
                      {activeMacroCount}/{macros.length}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Profile</div>
                    <div className="stat-value accent">{activeProfile || 'default'}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Core</div>
                    <div className={`stat-value ${coreConnected ? 'green' : ''}`}>
                      {coreConnected ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>

                {/* Gamepad preview */}
                <GamepadPreview />
              </>
            )}
            {tab === 'presets'  && <GamePresets />}
            {tab === 'analog'   && <SensitivityEditor />}
            {tab === 'mappings' && <KeyMapper />}
            {tab === 'macros'   && <MacroGrid />}
            {tab === 'settings' && <SettingsTab />}
          </main>

          {/* Status Footer */}
          <div className="status-footer">
            <div className="status-item">
              <span className={`status-dot ${coreConnected ? 'status-dot--green' : 'status-dot--red'}`} />
              <span>{coreConnected ? 'Core connected' : 'Core offline'}</span>
            </div>
            <span className="status-sep">{'\u00B7'}</span>
            <div className="status-item">
              <span className={`status-dot ${captureEnabled ? 'status-dot--orange' : 'status-dot--gray'}`} />
              <span>{captureEnabled ? 'Capturing' : 'Idle'}</span>
            </div>
            <span className="status-sep">{'\u00B7'}</span>
            <span>{CONTROLLER_NAMES[controllerType]}</span>
            {activeMacroCount > 0 && (
              <>
                <span className="status-sep">{'\u00B7'}</span>
                <span style={{ color: 'var(--green)' }}>{activeMacroCount} macro{activeMacroCount > 1 ? 's' : ''} active</span>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
