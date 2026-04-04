import { useBindingStore, MouseConfig, AccelPoint } from '../store/mappingStore';
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

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: 'Mouse DPI',
    fields: [
      { key: 'mouseDPI',        label: 'Your Mouse DPI',   min: 100, max: 6400,  step: 100  },
    ],
  },
  {
    title: 'Sensitivity',
    fields: [
      { key: 'sensitivityX',    label: 'Sensitivity X',     min: 0.1, max: 10,    step: 0.1  },
      { key: 'sensitivityY',    label: 'Sensitivity Y',     min: 0.1, max: 10,    step: 0.1  },
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

// ============================================================================
// ACCELERATION CURVE MINI-EDITOR
// ============================================================================

function AccelCurveEditor({ curve, onChange }: {
  curve: AccelPoint[];
  onChange: (c: AccelPoint[]) => void;
}) {
  const [expanded, setExpanded] = useState(curve.length > 0);

  const updatePoint = (idx: number, field: 'speed' | 'mult', value: number) => {
    const next = curve.map((p, i) => i === idx ? { ...p, [field]: value } : p);
    onChange(next);
  };

  const addPoint = () => {
    const lastSpeed = curve.length > 0 ? curve[curve.length - 1].speed + 10 : 0;
    const lastMult  = curve.length > 0 ? Math.min(curve[curve.length - 1].mult + 0.2, 1.0) : 0.1;
    onChange([...curve, { speed: lastSpeed, mult: lastMult }]);
  };

  const removePoint = (idx: number) => {
    onChange(curve.filter((_, i) => i !== idx));
  };

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

  const clearCurve = () => onChange([]);

  // SVG mini-chart
  const chartW = 260, chartH = 100, pad = 20;
  const maxSpd = Math.max(80, ...curve.map(p => p.speed));

  const toX = (s: number) => pad + (s / maxSpd) * (chartW - pad * 2);
  const toY = (m: number) => chartH - pad - m * (chartH - pad * 2);

  const pathD = curve.length >= 2
    ? curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.speed).toFixed(1)},${toY(p.mult).toFixed(1)}`).join(' ')
    : '';

  return (
    <div className="slider-section">
      <div
        className="slider-section-title"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        Acceleration Curve {curve.length > 0 ? `(${curve.length} pts)` : '(OFF)'}
        <span style={{ float: 'right', fontSize: '0.8em', opacity: 0.6 }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 4px' }}>
          {/* Mini chart */}
          {curve.length >= 2 && (
            <svg width={chartW} height={chartH} style={{
              display: 'block', margin: '4px auto 8px',
              background: '#1a1a2e', borderRadius: 6, border: '1px solid #333'
            }}>
              {/* Grid */}
              <line x1={pad} y1={chartH - pad} x2={chartW - pad} y2={chartH - pad} stroke="#333" />
              <line x1={pad} y1={pad} x2={pad} y2={chartH - pad} stroke="#333" />
              {/* Linear reference */}
              <line x1={toX(0)} y1={toY(0)} x2={toX(maxSpd)} y2={toY(1)} stroke="#555" strokeDasharray="4,4" />
              {/* Curve */}
              <path d={pathD} fill="none" stroke="#ff6a00" strokeWidth={2} />
              {/* Points */}
              {curve.map((p, i) => (
                <circle key={i} cx={toX(p.speed)} cy={toY(p.mult)} r={4} fill="#ff6a00" />
              ))}
              {/* Labels */}
              <text x={chartW / 2} y={chartH - 2} textAnchor="middle" fill="#888" fontSize={9}>speed (px/tick)</text>
              <text x={4} y={chartH / 2} textAnchor="middle" fill="#888" fontSize={9}
                    transform={`rotate(-90, 6, ${chartH / 2})`}>mult</text>
            </svg>
          )}

          {/* Points list */}
          {curve.map((pt, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.85em'
            }}>
              <span style={{ width: 16, color: '#888' }}>#{idx + 1}</span>
              <label style={{ fontSize: '0.8em', color: '#aaa' }}>spd</label>
              <input type="number" min={0} max={200} step={1}
                     value={pt.speed}
                     onChange={e => updatePoint(idx, 'speed', parseFloat(e.target.value) || 0)}
                     style={{ width: 50 }}
              />
              <label style={{ fontSize: '0.8em', color: '#aaa' }}>mult</label>
              <input type="number" min={0} max={2} step={0.01}
                     value={pt.mult}
                     onChange={e => updatePoint(idx, 'mult', parseFloat(e.target.value) || 0)}
                     style={{ width: 55 }}
              />
              <button onClick={() => removePoint(idx)} style={{
                background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: '1em', padding: '0 4px'
              }}>×</button>
            </div>
          ))}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {curve.length < 8 && (
              <button onClick={addPoint} className="btn-small">+ Point</button>
            )}
            <button onClick={loadPreset} className="btn-small">Warzone Preset</button>
            {curve.length > 0 && (
              <button onClick={clearCurve} className="btn-small btn-danger">Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN EDITOR
// ============================================================================

export function SensitivityEditor() {
  const { mouseConfig, setMouseConfig } = useBindingStore();

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Mouse → Right Stick</span>
        <span className="card-badge">Analog</span>
      </div>

      {SECTIONS.map(({ title, fields }) => (
        <div key={title} className="slider-section">
          <div className="slider-section-title">
            {title}
            {title === 'Return to Center' && mouseConfig.decayRate === 0 && (
              <span style={{ fontSize: '0.75em', color: '#ff6a00', marginLeft: 8 }}>DISABLED</span>
            )}
          </div>
          {fields.map(({ key, label, min, max, step, unit }) => {
            const val = mouseConfig[key] as number;
            return (
              <div key={key} className="slider-row">
                <span className="slider-label">{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={val}
                  onChange={e =>
                    setMouseConfig({ ...mouseConfig, [key]: parseFloat(e.target.value) })
                  }
                />
                <span className="slider-value">
                  {(key === 'decayRate' || key === 'smoothingFactor' || key === 'maxStepPerFrame') && val === 0
                    ? 'OFF'
                    : `${fmt(val, step)}${unit ? ` ${unit}` : ''}`
                  }
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Aim Curve Visualization */}
      <div className="slider-section">
        <div className="slider-section-title">Response Curve Preview</div>
        <AimCurveGraph
          exponent={mouseConfig.exponent}
          accelCurve={mouseConfig.accelCurve ?? []}
          deadzone={mouseConfig.deadzone}
          maxSpeed={mouseConfig.maxSpeed}
        />
      </div>

      {/* Acceleration Curve section */}
      <AccelCurveEditor
        curve={mouseConfig.accelCurve ?? []}
        onChange={accelCurve => setMouseConfig({ ...mouseConfig, accelCurve })}
      />
    </div>
  );
}
