import { useBindingStore } from '../store/mappingStore';
import type { AccelPoint, MouseConfig } from '../store/mappingStore';
import { useState } from 'react';
import AimCurveGraph from './AimCurveGraph';

type Field = {
  key: keyof MouseConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

const BASIC_FIELDS: Field[] = [
  { key: 'sensitivityX',    label: 'Sensitivity X',  min: 0.1, max: 10,   step: 0.1  },
  { key: 'sensitivityY',    label: 'Sensitivity Y',  min: 0.1, max: 10,   step: 0.1  },
  { key: 'deadzone',        label: 'Deadzone',       min: 0,   max: 0.3,  step: 0.005 },
];

const ADVANCED_SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: 'Mouse DPI',
    fields: [
      { key: 'mouseDPI',        label: 'Your Mouse DPI',   min: 100, max: 6400,  step: 100  },
    ],
  },
  {
    title: 'Response Curve',
    fields: [
      { key: 'exponent',        label: 'Curve Exponent',    min: 0.1, max: 3,    step: 0.05 },
      { key: 'maxSpeed',        label: 'Max Speed',         min: 0.1, max: 1,    step: 0.01 },
    ],
  },
  {
    title: 'Deadzone & Noise',
    fields: [
      { key: 'deadzone',        label: 'Deadzone',          min: 0,   max: 0.3,  step: 0.005 },
      { key: 'antiDeadzone',    label: 'Anti-Deadzone',     min: 0,   max: 0.2,  step: 0.005 },
      { key: 'jitterThreshold', label: 'Jitter Filter',     min: 0,   max: 5,    step: 0.1, unit: 'px' },
    ],
  },
  {
    title: 'Return to Center',
    fields: [
      { key: 'decayDelay',      label: 'Decay Delay',       min: 0,   max: 2000,  step: 10,   unit: 'ms' },
      { key: 'decayRate',       label: 'Decay Speed',       min: 0,   max: 20,   step: 0.1  },
      { key: 'decayMinStick',   label: 'Hold Floor',        min: 0,   max: 0.5,  step: 0.01 },
    ],
  },
  {
    title: 'Smoothing & Anti-Spike',
    fields: [
      { key: 'smoothingFactor', label: 'Smoothing',         min: 0,   max: 0.05, step: 0.001 },
      { key: 'maxStepPerFrame', label: 'Max Step/Frame',    min: 0,   max: 0.3,  step: 0.005 },
    ],
  },
];

function fmt(v: number, step: number): string {
  const decimals = step < 0.1 ? 3 : step < 1 ? 2 : 1;
  return v.toFixed(decimals);
}

// ── Collapsible section for advanced mode ──
function CollapsibleSection({ title, defaultOpen, children, badge }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div>
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <span className="collapsible-title">{title}</span>
        {badge && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }}>{badge}</span>}
        <span className={`collapsible-chevron ${open ? 'open' : ''}`}>{'\u25B6'}</span>
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

// ── Acceleration Curve Editor ──
function AccelCurveEditor({ curve, onChange }: {
  curve: AccelPoint[];
  onChange: (c: AccelPoint[]) => void;
}) {
  const updatePoint = (idx: number, field: 'speed' | 'mult', value: number) => {
    const next = curve.map((p, i) => i === idx ? { ...p, [field]: value } : p);
    onChange(next);
  };

  const addPoint = () => {
    const lastSpeed = curve.length > 0 ? curve[curve.length - 1].speed + 10 : 0;
    const lastMult  = curve.length > 0 ? Math.min(curve[curve.length - 1].mult + 0.2, 1.0) : 0.1;
    onChange([...curve, { speed: lastSpeed, mult: lastMult }]);
  };

  const removePoint = (idx: number) => onChange(curve.filter((_, i) => i !== idx));

  const loadPreset = () => {
    onChange([
      { speed: 0,  mult: 0.12 },
      { speed: 3,  mult: 0.20 },
      { speed: 8,  mult: 0.38 },
      { speed: 20, mult: 0.65 },
      { speed: 40, mult: 0.85 },
      { speed: 70, mult: 1.00 },
    ]);
  };

  const chartW = 260, chartH = 90, pad = 20;
  const maxSpd = Math.max(80, ...curve.map(p => p.speed));
  const toX = (s: number) => pad + (s / maxSpd) * (chartW - pad * 2);
  const toY = (m: number) => chartH - pad - m * (chartH - pad * 2);
  const pathD = curve.length >= 2
    ? curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.speed).toFixed(1)},${toY(p.mult).toFixed(1)}`).join(' ')
    : '';

  return (
    <div>
      {curve.length >= 2 && (
        <svg width={chartW} height={chartH} style={{
          display: 'block', margin: '4px auto 8px',
          background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border-subtle)'
        }}>
          <line x1={pad} y1={chartH - pad} x2={chartW - pad} y2={chartH - pad} stroke="var(--border-default)" />
          <line x1={pad} y1={pad} x2={pad} y2={chartH - pad} stroke="var(--border-default)" />
          <line x1={toX(0)} y1={toY(0)} x2={toX(maxSpd)} y2={toY(1)} stroke="var(--text-disabled)" strokeDasharray="4,4" />
          <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {curve.map((p, i) => (
            <circle key={i} cx={toX(p.speed)} cy={toY(p.mult)} r={3.5} fill="var(--accent)" />
          ))}
          <text x={chartW / 2} y={chartH - 2} textAnchor="middle" fill="var(--text-disabled)" fontSize={8}>speed (px/tick)</text>
        </svg>
      )}

      {curve.map((pt, idx) => (
        <div key={idx} style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11
        }}>
          <span style={{ width: 16, color: 'var(--text-disabled)' }}>#{idx + 1}</span>
          <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>spd</label>
          <input type="number" min={0} max={200} step={1}
                 value={pt.speed}
                 onChange={e => updatePoint(idx, 'speed', parseFloat(e.target.value) || 0)}
                 style={{ width: 50 }}
          />
          <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>mult</label>
          <input type="number" min={0} max={2} step={0.01}
                 value={pt.mult}
                 onChange={e => updatePoint(idx, 'mult', parseFloat(e.target.value) || 0)}
                 style={{ width: 55 }}
          />
          <button onClick={() => removePoint(idx)} style={{
            background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13, padding: '0 4px'
          }}>{'\u00D7'}</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {curve.length < 8 && <button onClick={addPoint} className="btn-small">+ Point</button>}
        <button onClick={loadPreset} className="btn-small">Warzone Preset</button>
        {curve.length > 0 && <button onClick={() => onChange([])} className="btn-small btn-danger">Clear</button>}
      </div>
    </div>
  );
}

// ── Slider Row ──
function SliderField({ field, value, onChange }: { field: Field; value: number; onChange: (v: number) => void }) {
  const isOff = (field.key === 'decayRate' || field.key === 'smoothingFactor' || field.key === 'maxStepPerFrame' || field.key === 'antiDeadzone') && value === 0;
  return (
    <div className="slider-row">
      <span className="slider-label">{field.label}</span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">
        {isOff ? 'OFF' : `${fmt(value, field.step)}${field.unit ? ` ${field.unit}` : ''}`}
      </span>
    </div>
  );
}

// ── Main Editor ──
export function SensitivityEditor() {
  const { mouseConfig, setMouseConfig } = useBindingStore();
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');

  const update = (key: keyof MouseConfig, value: number) => {
    setMouseConfig({ ...mouseConfig, [key]: value });
  };

  return (
    <div className="analog-editor">
      {/* Left: Controls */}
      <div className="analog-controls">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">Mouse {'\u2192'} Right Stick</span>
            <span className="card-badge">Analog</span>
          </div>

          {/* Mode toggle */}
          <div className="mode-toggle-bar">
            <button
              className={`mode-toggle-btn ${mode === 'basic' ? 'active' : ''}`}
              onClick={() => setMode('basic')}
            >Basic</button>
            <button
              className={`mode-toggle-btn ${mode === 'advanced' ? 'active' : ''}`}
              onClick={() => setMode('advanced')}
            >Advanced</button>
          </div>

          {mode === 'basic' && (
            <div>
              <div className="slider-section">
                <div className="slider-section-title">Quick Settings</div>
                {BASIC_FIELDS.map(field => (
                  <SliderField
                    key={field.key}
                    field={field}
                    value={mouseConfig[field.key] as number}
                    onChange={v => update(field.key, v)}
                  />
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Switch to Advanced for full control over response curve, acceleration, decay, and noise filtering.
              </p>
            </div>
          )}

          {mode === 'advanced' && (
            <div>
              {ADVANCED_SECTIONS.map(({ title, fields }) => (
                <CollapsibleSection
                  key={title}
                  title={title}
                  defaultOpen={title === 'Mouse DPI' || title === 'Response Curve'}
                  badge={title === 'Return to Center' && mouseConfig.decayRate === 0 ? 'DISABLED' : undefined}
                >
                  {fields.map(field => (
                    <SliderField
                      key={field.key}
                      field={field}
                      value={mouseConfig[field.key] as number}
                      onChange={v => update(field.key, v)}
                    />
                  ))}
                </CollapsibleSection>
              ))}

              {/* Acceleration Curve */}
              <CollapsibleSection
                title="Acceleration Curve"
                badge={mouseConfig.accelCurve?.length > 0 ? `${mouseConfig.accelCurve.length} pts` : 'OFF'}
              >
                <AccelCurveEditor
                  curve={mouseConfig.accelCurve ?? []}
                  onChange={accelCurve => setMouseConfig({ ...mouseConfig, accelCurve })}
                />
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="analog-preview">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Response Curve</span>
            <span className="card-badge">Live</span>
          </div>
          <AimCurveGraph
            exponent={mouseConfig.exponent}
            accelCurve={mouseConfig.accelCurve ?? []}
            deadzone={mouseConfig.deadzone}
            maxSpeed={mouseConfig.maxSpeed}
          />
        </div>

        {/* Quick info */}
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div className="stat-label">DPI</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {mouseConfig.mouseDPI}
              </div>
            </div>
            <div>
              <div className="stat-label">Effective Sens</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {(mouseConfig.sensitivityX * (mouseConfig.mouseDPI / 800)).toFixed(1)}
              </div>
            </div>
            <div>
              <div className="stat-label">Curve</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                x^{mouseConfig.exponent.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="stat-label">Accel Points</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {mouseConfig.accelCurve?.length || 0}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
