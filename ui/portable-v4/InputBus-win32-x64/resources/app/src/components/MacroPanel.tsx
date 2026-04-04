import { useState } from 'react';

const BUTTON_OPTIONS = [
  { label: 'RB', value: 0x0200 },
  { label: 'LB', value: 0x0100 },
  { label: 'A',  value: 0x1000 },
  { label: 'B',  value: 0x2000 },
  { label: 'X',  value: 0x4000 },
  { label: 'Y',  value: 0x8000 },
  { label: 'D-Pad Up',    value: 0x0001 },
  { label: 'D-Pad Down',  value: 0x0002 },
  { label: 'D-Pad Left',  value: 0x0004 },
  { label: 'D-Pad Right', value: 0x0008 },
];

const MsgType = { SetMacroConfig: 7 } as const;

export function MacroPanel() {
  const [enabled, setEnabled] = useState(false);
  const [intervalMs, setIntervalMs] = useState(3000);
  const [button, setButton] = useState(0x0200);
  const [durationMs, setDurationMs] = useState(80);

  const sync = (overrides: Record<string, unknown> = {}) => {
    const cfg = {
      autoPingEnabled: enabled,
      autoPingIntervalMs: intervalMs,
      autoPingButton: button,
      autoPingDurationMs: durationMs,
      ...overrides,
    };
    window.electronAPI?.coreSend(MsgType.SetMacroConfig, cfg);
  };

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    sync({ autoPingEnabled: next });
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Auto Ping</span>
        <span className={`card-badge ${enabled ? 'active' : ''}`}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="macro-row">
        <span className="slider-label">Enabled</span>
        <button
          className={`btn ${enabled ? 'btn-danger' : 'btn-primary'}`}
          onClick={toggleEnabled}
          style={{ padding: '4px 14px', fontSize: 12 }}
        >
          {enabled ? 'Disable' : 'Enable'}
        </button>
      </div>

      <div className="macro-row">
        <span className="slider-label">Button</span>
        <select
          value={button}
          onChange={e => {
            const v = Number(e.target.value);
            setButton(v);
            sync({ autoPingButton: v });
          }}
          style={{ flex: 1 }}
        >
          {BUTTON_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="slider-row">
        <span className="slider-label">Interval</span>
        <input
          type="range"
          min={500}
          max={10000}
          step={100}
          value={intervalMs}
          onChange={e => {
            const v = Number(e.target.value);
            setIntervalMs(v);
            sync({ autoPingIntervalMs: v });
          }}
        />
        <span className="slider-value">{(intervalMs / 1000).toFixed(1)}s</span>
      </div>

      <div className="slider-row">
        <span className="slider-label">Press Duration</span>
        <input
          type="range"
          min={30}
          max={300}
          step={10}
          value={durationMs}
          onChange={e => {
            const v = Number(e.target.value);
            setDurationMs(v);
            sync({ autoPingDurationMs: v });
          }}
        />
        <span className="slider-value">{durationMs}ms</span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        Automatically presses the selected button at the configured interval while capture is active.
      </p>
    </div>
  );
}
