import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useBindingStore } from '../store/mappingStore';
import type { ControllerType, MouseConfig } from '../store/mappingStore';

const CONTROLLER_NAMES: Record<string, string> = {
  vader4pro: 'Vader 4 Pro',
  xbox360: 'Xbox 360',
  dualsense: 'DualSense',
  steamInput: 'Steam Input',
};

const CONTROLLER_TYPES: ControllerType[] = ['vader4pro', 'xbox360', 'dualsense', 'steamInput'];

const VK_LABELS: Record<number, string> = {
  0x70:'F1',0x71:'F2',0x72:'F3',0x73:'F4',0x74:'F5',0x75:'F6',
  0x76:'F7',0x77:'F8',0x78:'F9',0x79:'F10',0x7A:'F11',0x7B:'F12',
  0xC0:'~',0x14:'CapsLock',
};

export function SettingsTab() {
  const {
    activeProfile, savedProfiles, saveProfile, loadProfile,
    refreshProfiles, resetFpsDefaults,
    controllerType, setControllerType,
    hotkeyVk, hotkeyMods, setHotkey,
    mouseConfig, setMouseConfig,
  } = useBindingStore();

  const [newName, setNewName] = useState('');
  const [licenseKey, setLicenseKey] = useState('');

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim() || activeProfile;
    if (!name) return;
    saveProfile(name);
    setNewName('');
    refreshProfiles();
  };

  const updateMouseCamera = <K extends keyof MouseConfig>(key: K, value: MouseConfig[K]) => {
    setMouseConfig({ ...mouseConfig, [key]: value });
  };

  return (
    <div className="settings-grid">
      {/* Mouse Camera Mode */}
      <div className="settings-section">
        <div className="settings-section-title">Mouse Camera Mode</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Native Mouse Passthrough</div>
            <div className="settings-row-desc">Only for games that allow mouse and controller at the same time</div>
          </div>
          <button
            type="button"
            className={`toggle ${mouseConfig.nativeMouseCameraEnabled ? 'toggle--on' : ''}`}
            onClick={() => updateMouseCamera('nativeMouseCameraEnabled', !mouseConfig.nativeMouseCameraEnabled)}
            aria-pressed={mouseConfig.nativeMouseCameraEnabled}
            title="Enable native mouse passthrough"
          >
            <span className="toggle-thumb" />
          </button>
        </div>
        <div className="settings-row" style={{ paddingBottom: 0 }}>
          <div>
            <div className="settings-row-label">Warzone / Reflex</div>
            <div className="settings-row-desc">Keep this off so mouse is converted to right stick on the virtual controller</div>
          </div>
        </div>
      </div>

      {/* Hotkey */}
      <div className="settings-section">
        <div className="settings-section-title">Capture Hotkey</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Toggle Shortcut</div>
            <div className="settings-row-desc">Key combination to enable/disable capture</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {([['Shift',0x01],['Ctrl',0x02],['Alt',0x04]] as const).map(([name, bit]) => (
              <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={(hotkeyMods & bit) !== 0}
                  onChange={e => setHotkey(hotkeyVk, (hotkeyMods & ~bit) | (e.target.checked ? bit : 0))} />
                {name}
              </label>
            ))}
            <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>+</span>
            <select value={hotkeyVk} onChange={e => setHotkey(Number(e.target.value), hotkeyMods)} style={{ width: 80 }}>
              {Object.entries(VK_LABELS).map(([vk, label]) => (
                <option key={vk} value={Number(vk)}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Controller */}
      <div className="settings-section">
        <div className="settings-section-title">Controller</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Emulated Controller</div>
            <div className="settings-row-desc">Steam Input uses a virtual DS4 handoff for Steam remapping</div>
          </div>
          <select
            value={controllerType}
            onChange={e => setControllerType(e.target.value as ControllerType)}
            style={{ width: 180 }}
          >
            {CONTROLLER_TYPES.map(val => (
              <option key={val} value={val}>{CONTROLLER_NAMES[val]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Profiles */}
      <div className="settings-section">
        <div className="settings-section-title">Profiles</div>

        <form className="profile-row" onSubmit={onSave} style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={newName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            placeholder={activeProfile || 'profile name\u2026'}
          />
          <button type="submit" className="btn btn-primary">Save</button>
        </form>

        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={resetFpsDefaults}
        >
          Load FPS Defaults
        </button>

        {savedProfiles.length > 0 && (
          <div className="profile-list">
            {savedProfiles.map(name => (
              <div
                key={name}
                className={`profile-item ${name === activeProfile ? 'active-profile' : ''}`}
              >
                <span className="profile-name">{name}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '3px 10px', fontSize: 11 }}
                  onClick={() => loadProfile(name)}
                >
                  Load
                </button>
              </div>
            ))}
          </div>
        )}

        {savedProfiles.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
            No saved profiles yet. Create one above or load FPS defaults.
          </p>
        )}
      </div>

      {/* License */}
      <div className="settings-section">
        <div className="settings-section-title">License</div>
        <div className="license-notice">
          <div className="license-icon">
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="20" width="32" height="22" rx="4" stroke="var(--text-disabled)" strokeWidth="2" fill="none" />
              <path d="M16 20V14a8 8 0 1 1 16 0v6" stroke="var(--text-disabled)" strokeWidth="2" fill="none" />
              <circle cx="24" cy="31" r="3" fill="var(--text-disabled)" />
              <line x1="24" y1="34" x2="24" y2="38" stroke="var(--text-disabled)" strokeWidth="2" />
            </svg>
          </div>
          <h3 className="license-title">License Protection</h3>
          <p className="license-desc">
            Per-user encryption will prevent unauthorized access.
            This feature is under development.
          </p>
        </div>

        <div className="license-form">
          <label className="license-label">License Key</label>
          <div className="profile-row">
            <input
              type="text"
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              disabled
            />
            <button className="btn btn-primary" disabled>Activate</button>
          </div>
          <p className="license-hint">Contact the developer to obtain a license key.</p>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <div className="settings-section-title">About</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <span>InputBus v2.0</span>
          <span>Mouse-to-analog controller emulator</span>
          <span>Core: rewsd_core via ViGEm</span>
        </div>
      </div>
    </div>
  );
}
