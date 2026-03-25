import { useBindingStore, MouseConfig } from '../store/mappingStore';

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
    title: 'Sensitivity',
    fields: [
      { key: 'sensitivityX',    label: 'Sensitivity X',     min: 0.1, max: 6,    step: 0.1  },
      { key: 'sensitivityY',    label: 'Sensitivity Y',     min: 0.1, max: 6,    step: 0.1  },
    ],
  },
  {
    title: 'Response Curve',
    fields: [
      { key: 'exponent',        label: 'Curve Exponent',    min: 1,   max: 3,    step: 0.05 },
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
      { key: 'decayDelay',      label: 'Decay Delay',       min: 0,   max: 300,  step: 5,   unit: 'ms' },
      { key: 'decayRate',       label: 'Decay Speed',       min: 1,   max: 20,   step: 0.5  },
    ],
  },
  {
    title: 'Smoothing',
    fields: [
      { key: 'smoothSamples',   label: 'Smooth Samples',    min: 1,   max: 10,   step: 1    },
    ],
  },
];

function fmt(v: number, step: number): string {
  const decimals = step < 0.1 ? 3 : step < 1 ? 2 : 1;
  return v.toFixed(decimals);
}

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
          <div className="slider-section-title">{title}</div>
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
                  {fmt(val, step)}{unit ? ` ${unit}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
