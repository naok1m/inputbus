import { useState } from 'react';
import { useBindingStore } from '../store/mappingStore';
import type { MouseConfig } from '../store/mappingStore';

interface GamePreset {
  name: string;
  description: string;
  gradient: string;
  config: MouseConfig | null;
}

const DEFAULT_MOUSE_CAMERA = {
  nativeMouseCameraEnabled: false,
  mouseCameraSensitivityX: 1.0,
  mouseCameraSensitivityY: 1.0,
  mouseCameraDeadzone: 0.0,
  mouseCameraCurve: 1.0,
  mouseCameraSmoothing: 0.0,
  mouseCameraInvertY: false,
};

const GAME_PRESETS: GamePreset[] = [
  {
    name: 'Call of Duty: Warzone',
    description: 'Fast linear aim, no decay. Ideal for twitch shooters with high in-game sens.',
    gradient: 'linear-gradient(135deg, #f97316, #dc2626)',
    config: {
      mouseDPI:        800,
      sensitivityX:    7.0,
      sensitivityY:    7.0,
      exponent:        1.0,
      accelCurve:      [],
      deadzone:        0,
      smoothingFactor: 0,
      maxStepPerFrame: 0,
      jitterThreshold: 0.1,
      decayDelay:      0,
      decayRate:       20,
      decayMinStick:   0,
      maxSpeed:        1.0,
      antiDeadzone:    0,
      ...DEFAULT_MOUSE_CAMERA,
    },
  },
  {
    name: 'Fortnite',
    description: 'Slight curve with decay for building and editing. Good balance of speed and control.',
    gradient: 'linear-gradient(135deg, #3b82f6, #9333ea)',
    config: {
      mouseDPI:        800,
      sensitivityX:    5.5,
      sensitivityY:    5.5,
      exponent:        1.15,
      accelCurve:      [],
      deadzone:        0.02,
      smoothingFactor: 0,
      maxStepPerFrame: 0,
      jitterThreshold: 0.5,
      decayDelay:      80,
      decayRate:       4,
      decayMinStick:   0,
      maxSpeed:        1.0,
      antiDeadzone:    0,
      ...DEFAULT_MOUSE_CAMERA,
    },
  },
  {
    name: 'Apex Legends',
    description: 'Acceleration curve for tracking targets. Ramps sensitivity with mouse speed.',
    gradient: 'linear-gradient(135deg, #dc2626, #991b1b)',
    config: {
      mouseDPI:        800,
      sensitivityX:    6.0,
      sensitivityY:    6.0,
      exponent:        1.0,
      accelCurve:      [
        { speed: 0,  mult: 0.5 },
        { speed: 15, mult: 0.8 },
        { speed: 50, mult: 1.0 },
      ],
      deadzone:        0.01,
      smoothingFactor: 0,
      maxStepPerFrame: 0,
      jitterThreshold: 0.3,
      decayDelay:      60,
      decayRate:       5,
      decayMinStick:   0,
      maxSpeed:        1.0,
      antiDeadzone:    0,
      ...DEFAULT_MOUSE_CAMERA,
    },
  },
  {
    name: 'Valorant',
    description: 'Low sensitivity, pure linear. Precision-first for tactical shooters.',
    gradient: 'linear-gradient(135deg, #dc2626, #ec4899)',
    config: {
      mouseDPI:        800,
      sensitivityX:    4.0,
      sensitivityY:    4.0,
      exponent:        1.0,
      accelCurve:      [],
      deadzone:        0,
      smoothingFactor: 0,
      maxStepPerFrame: 0,
      jitterThreshold: 0.2,
      decayDelay:      0,
      decayRate:       0,
      decayMinStick:   0,
      maxSpeed:        1.0,
      antiDeadzone:    0,
      ...DEFAULT_MOUSE_CAMERA,
    },
  },
  {
    name: 'GTA V',
    description: 'Smoothed input with deadzone and slow decay. Tuned for third-person aiming.',
    gradient: 'linear-gradient(135deg, #22c55e, #14b8a6)',
    config: {
      mouseDPI:        800,
      sensitivityX:    5.0,
      sensitivityY:    5.0,
      exponent:        1.2,
      accelCurve:      [],
      deadzone:        0.05,
      smoothingFactor: 0.003,
      maxStepPerFrame: 0.1,
      jitterThreshold: 1.0,
      decayDelay:      200,
      decayRate:       3,
      decayMinStick:   0,
      maxSpeed:        1.0,
      antiDeadzone:    0,
      ...DEFAULT_MOUSE_CAMERA,
    },
  },
  {
    name: 'Custom',
    description: 'Configure your own settings manually in the Mouse tab.',
    gradient: 'linear-gradient(135deg, #6b7280, #374151)',
    config: null,
  },
];

export default function GamePresets() {
  const setMouseConfig = useBindingStore((s) => s.setMouseConfig);
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const handleLoadPreset = (preset: GamePreset) => {
    if (!preset.config) return;
    setMouseConfig(preset.config);
    setActiveGame(preset.name);
  };

  return (
    <div className="game-presets">
      <h2 className="game-presets-title">Game Presets</h2>
      <p className="game-presets-subtitle">
        Select a game to load optimized mouse-to-analog settings.
      </p>

      <div className="game-grid">
        {GAME_PRESETS.map((preset) => {
          const isActive = activeGame === preset.name;
          const isCustom = preset.config === null;

          return (
            <div
              key={preset.name}
              className={`game-card ${isActive ? 'game-card--active' : ''}`}
              style={{ background: preset.gradient }}
            >
              <div className="game-card-overlay">
                {isActive && <span className="game-badge">Active</span>}
                <h3 className="game-card-name">{preset.name}</h3>
                <p className="game-card-desc">{preset.description}</p>
                {!isCustom ? (
                  <button
                    className="game-load-btn"
                    onClick={() => handleLoadPreset(preset)}
                  >
                    {isActive ? 'Loaded' : 'Load Preset'}
                  </button>
                ) : (
                  <span className="game-custom-hint">Use Mouse tab</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
