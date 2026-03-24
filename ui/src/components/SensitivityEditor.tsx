import { useState } from 'react';
import { useBindingStore } from '../store/mappingStore';

export function SensitivityEditor() {
  const { mouseConfig, setMouseConfig } = useBindingStore();

  const fields: Array<{ key: keyof typeof mouseConfig; label: string; min: number; max: number; step: number }> = [
    { key: 'sensitivity',   label: 'Sensitivity',     min: 0.1, max: 25,  step: 0.1 },
    { key: 'exponent',      label: 'Curve Exponent',  min: 1,   max: 3,   step: 0.05 },
    { key: 'maxSpeed',      label: 'Max Speed',       min: 0.1, max: 1,   step: 0.01 },
    { key: 'deadzone',      label: 'Deadzone',        min: 0,   max: 0.3, step: 0.005 },
    { key: 'smoothSamples', label: 'Smooth Samples',  min: 1,   max: 10,  step: 1 },
  ];

  return (
    <div className="sensitivity-editor">
      <h2>Mouse → Right Stick</h2>
      {fields.map(({ key, label, min, max, step }) => (
        <div key={key} className="slider-row">
          <label>{label}</label>
          <input
            type="range" min={min} max={max} step={step}
            value={mouseConfig[key]}
            onChange={(e) => setMouseConfig({ ...mouseConfig, [key]: parseFloat(e.target.value) })}
          />
          <span>{mouseConfig[key]}</span>
        </div>
      ))}
    </div>
  );
}