import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Binding { target: string; mask?: number; axisValue?: number; }

export interface AccelPoint {
  speed: number;  // Mouse speed in px/tick
  mult:  number;  // Sensitivity multiplier at this speed
}

// ── Macro system ──
export type MacroCategory = 'combat' | 'movement' | 'automation';

export interface MacroDef {
  id: string;
  name: string;
  icon: string;
  category: MacroCategory;
  description: string;
  isPro?: boolean;
  enabled: boolean;
  // Config varies per macro type
  config: Record<string, unknown>;
}

const DEFAULT_MACROS: MacroDef[] = [
  {
    id: 'no-recoil',
    name: 'No Recoil',
    icon: '\u{1F3AF}',
    category: 'combat',
    description: 'Compensates vertical recoil while firing',
    enabled: false,
    config: { strength: 3.5, pattern: 'pull-down', activation: 'hold', button: 'LMB' },
  },
  {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    icon: '\u26A1',
    category: 'combat',
    description: 'Rapid trigger presses at configured interval',
    enabled: false,
    config: { intervalMs: 50, button: 0x0200, durationMs: 30 },
  },
  {
    id: 'auto-ads',
    name: 'Auto ADS',
    icon: '\u{1F441}',
    category: 'combat',
    description: 'Toggle aim-down-sights on right click',
    isPro: true,
    enabled: false,
    config: { activation: 'toggle', button: 'RMB' },
  },
  {
    id: 'auto-sprint',
    name: 'Auto Sprint',
    icon: '\u{1F3C3}',
    category: 'movement',
    description: 'Automatically sprints when moving forward',
    enabled: false,
    config: { holdMs: 200, key: 'W' },
  },
  {
    id: 'bunny-hop',
    name: 'Bunny Hop',
    icon: '\u{1F407}',
    category: 'movement',
    description: 'Timed jump loop for movement tech',
    isPro: true,
    enabled: false,
    config: { intervalMs: 400, button: 0x1000 },
  },
  {
    id: 'auto-ping',
    name: 'Auto Ping',
    icon: '\u{1F4CD}',
    category: 'automation',
    description: 'While aiming (RMB), presses D-Up (ping) on interval',
    enabled: false,
    config: { intervalMs: 3000, button: 0x0001, durationMs: 80 },
  },
  {
    id: 'auto-loot',
    name: 'Auto Loot',
    icon: '\u{1F4E6}',
    category: 'automation',
    description: 'Rapid interaction presses for looting',
    isPro: true,
    enabled: false,
    config: { intervalMs: 100, button: 0x4000, durationMs: 30 },
  },
  {
    id: 'sens-boost',
    name: 'PQD Sens Boost',
    icon: '\u{1F4A8}',
    category: 'movement',
    description: 'Hold a key to multiply sensitivity (parachute drop)',
    enabled: false,
    config: { key: 0x58, multiplier: 2.0 },
  },
  {
    id: 'drift-aim',
    name: 'Drift Aim',
    icon: '\u{1F3AF}',
    category: 'combat',
    description: 'Oscillates left stick to manipulate aim assist',
    enabled: false,
    config: { amplitude: 3000, intervalMs: 33 },
  },
  {
    id: 'yy-swap',
    name: 'YY Cancel',
    icon: '\u{1F504}',
    category: 'combat',
    description: 'Double-tap Y on hotkey for weapon swap cancel',
    enabled: false,
    config: { key: 0x46, delayMs: 80 },
  },
  {
    id: 'tab-score',
    name: 'Tab Scoreboard',
    icon: '\u{1F4CB}',
    category: 'automation',
    description: 'Hold Tab to show match scoreboard (Back button)',
    enabled: false,
    config: {},
  },
];

export interface MouseConfig {
  // Processing mode: velocity is direct and low-latency; integrator keeps the legacy accumulate/decay feel.
  velocityMode:     boolean;
  velocityScale:    number;
  velocityReleaseMs: number;
  // DPI normalization: deltas are scaled by (800 / mouseDPI) so configs
  // feel identical regardless of hardware DPI
  mouseDPI:        number;
  // Sensitivity: scale factor per pixel of mouse movement
  sensitivityX:    number;
  sensitivityY:    number;
  // Response curve
  exponent:        number;
  maxSpeed:        number;
  // Acceleration curve (input-side, speed-dependent sensitivity)
  accelCurve:      AccelPoint[];
  // Deadzone
  deadzone:        number;
  // Smoothing (EMA time constant in seconds: 0 = off, 0.002-0.008 = light)
  smoothingFactor: number;
  // Anti-acceleration spike: max stick change per frame (0 = unlimited)
  maxStepPerFrame: number;
  // Jitter filter (px) — filters optical sensor noise at rest
  jitterThreshold: number;
  // Decay: how long stick holds position after mouse stops
  decayDelay:      number;  // ms before decay starts
  decayRate:       number;  // exponential decay rate (higher = drier/faster return)
  decayMinStick:   number;  // floor magnitude: decay stops below this
  // Anti-deadzone: ensures output starts above game's internal deadzone
  antiDeadzone:    number;  // 0 = disabled, typical: 0.02–0.10
}

const DEFAULT_CONFIG: MouseConfig = {
  velocityMode:     true,
  velocityScale:    0.012,
  velocityReleaseMs: 8,
  mouseDPI:        800,
  sensitivityX:    1.0,
  sensitivityY:    1.0,
  exponent:        1.0,
  maxSpeed:        1.0,
  accelCurve:      [],
  deadzone:        0.05,
  smoothingFactor: 0,
  maxStepPerFrame: 0,
  jitterThreshold: 1.5,
  decayDelay:      100,
  decayRate:       6,
  decayMinStick:   0,
  antiDeadzone:    0,
};

const WARZONE_CONFIG: MouseConfig = {
  velocityMode:     true,
  velocityScale:    0.012,
  velocityReleaseMs: 8,
  mouseDPI:        800,
  sensitivityX:    3.5,
  sensitivityY:    3.5,
  exponent:        1.0,
  maxSpeed:        1.0,
  accelCurve:      [],
  deadzone:        0.0,
  smoothingFactor: 0,
  maxStepPerFrame: 0,
  jitterThreshold: 0.3,
  decayDelay:      0,
  decayRate:       20,
  decayMinStick:   0,
  antiDeadzone:    0,
};

// Warzone keyboard bindings (PC keybinds → Xbox controller)
const WARZONE_BINDINGS: Record<number, Binding> = {
  // WASD → Left Stick
  87: { target: 'leftStickY', axisValue:  1.0 },  // W
  83: { target: 'leftStickY', axisValue: -1.0 },  // S
  65: { target: 'leftStickX', axisValue: -1.0 },  // A
  68: { target: 'leftStickX', axisValue:  1.0 },  // D
  // Face Buttons
  32: { target: 'button', mask: 0x1000 },          // Space → A (Jump)
  67: { target: 'button', mask: 0x2000 },          // C → B (Slide/Prone)
  82: { target: 'button', mask: 0x4000 },          // R → X (Reload)
  49: { target: 'button', mask: 0x8000 },          // 1 → Y (Weapon Switch)
  // Bumpers
  81: { target: 'button', mask: 0x0100 },          // Q → LB (Tactical)
  71: { target: 'button', mask: 0x0200 },          // G → RB (Lethal)
  // System
  27: { target: 'button', mask: 0x0010 },          // Esc → Start (Menu)
  90: { target: 'button', mask: 0x0020 },          // Z → Back (Ping)
  16: { target: 'button', mask: 0x0040 },          // Shift → LS (Sprint)
  86: { target: 'button', mask: 0x0080 },          // V → RS (Melee)
  // D-Pad
   9: { target: 'button', mask: 0x0001 },          // Tab → D-Up (Map)
  50: { target: 'button', mask: 0x0002 },          // 2 → D-Down (Inventory)
  51: { target: 'button', mask: 0x0004 },          // 3 → D-Left (Emotes)
  52: { target: 'button', mask: 0x0008 },          // 4 → D-Right (Streaks)
};

// Warzone mouse bindings (LMB/RMB → Triggers)
const WARZONE_MOUSE_BINDINGS: Record<number, Binding> = {
  0: { target: 'rightTrigger', axisValue: 1.0 },  // LMB → RT (Fire)
  1: { target: 'leftTrigger',  axisValue: 1.0 },  // RMB → LT (ADS)
};

const MsgType = {
  LoadProfile:       1,
  GetStatus:         4,
  SetActiveProfile:  5,
  SetCaptureEnabled: 6,
} as const;

const buildProfilePayload = (
  name: string,
  bindings: Record<number, Binding>,
  mouseBindings: Record<number, Binding>,
  cfg: MouseConfig
) => ({
  profileName: name,
  version: '2.0',
  keyBindings: bindings,
  mouseBindings,
  mouse: { ...cfg },
});

interface MappingStore {
  bindings:      Record<number, Binding>;
  mouseBindings: Record<number, Binding>;
  mouseConfig:   MouseConfig;
  controllerType: 'xbox360' | 'dualsense' | 'vader4pro';
  activeProfile: string;
  savedProfiles: string[];
  captureEnabled:  boolean;
  coreConnected:   boolean;
  macros:          MacroDef[];
  hotkeyVk:        number;
  hotkeyMods:      number;

  setBinding:             (vkCode: number, binding: Binding) => void;
  unbindByMask:           (mask: number) => void;
  unbindByTarget:         (target: string) => void;
  setMouseBinding:        (button: number, binding: Binding) => void;
  unbindMouseByMask:      (mask: number) => void;
  unbindMouseByTarget:    (target: string) => void;
  setMouseConfig:         (cfg: MouseConfig) => void;
  setControllerType:      (type: 'xbox360' | 'dualsense' | 'vader4pro') => void;
  setCaptureEnabled:      (enabled: boolean) => void;
  setCaptureEnabledFromCore: (enabled: boolean) => void;
  setCoreConnected:       (connected: boolean) => void;
  resetFpsDefaults:       () => void;
  saveProfile:            (name: string) => void;
  loadProfile:            (name: string) => void;
  refreshProfiles:        () => void;
  requestStatus:          () => void;
  syncToCore:             () => void;
  toggleMacro:            (id: string) => void;
  updateMacroConfig:      (id: string, config: Record<string, unknown>) => void;
  setHotkey:              (vk: number, mods: number) => void;
}

const listSavedProfileNames = (): string[] => {
  const prefix = 'profile_';
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) names.push(key.slice(prefix.length));
  }
  return names.sort((a, b) => a.localeCompare(b));
};

// Builds IPC payload for a macro
function buildMacroPayload(macro: MacroDef): Record<string, unknown> | null {
  const cfg = macro.config as Record<string, unknown>;
  const payloads: Record<string, Record<string, unknown>> = {
    'auto-ping': {
      autoPingEnabled: macro.enabled,
      autoPingIntervalMs: cfg.intervalMs ?? 3000,
      autoPingButton: cfg.button ?? 0x0200,
      autoPingDurationMs: cfg.durationMs ?? 80,
    },
    'rapid-fire': {
      rapidFireEnabled: macro.enabled,
      rapidFireIntervalMs: cfg.intervalMs ?? 50,
      rapidFireButton: cfg.button ?? 0x0200,
      rapidFireDurationMs: cfg.durationMs ?? 30,
    },
    'sens-boost': {
      sensBoostEnabled: macro.enabled,
      sensBoostKey: cfg.key ?? 0x58,
      sensBoostMultiplier: cfg.multiplier ?? 2.0,
    },
    'drift-aim': {
      driftEnabled: macro.enabled,
      driftAmplitude: cfg.amplitude ?? 3000,
      driftIntervalMs: cfg.intervalMs ?? 33,
    },
    'yy-swap': {
      yyEnabled: macro.enabled,
      yyKey: cfg.key ?? 0x46,
      yyDelayMs: cfg.delayMs ?? 80,
    },
    'tab-score': {
      tabScoreEnabled: macro.enabled,
    },
    'no-recoil': {
      noRecoilEnabled: macro.enabled,
      noRecoilStrength: cfg.strength ?? 3.5,
      noRecoilPattern: cfg.pattern === 's-pattern' ? 1 : cfg.pattern === 'custom' ? 2 : 0,
      noRecoilActivation: cfg.activation === 'toggle' ? 1 : cfg.activation === 'always' ? 2 : 0,
    },
    'auto-ads': {
      autoAdsEnabled: macro.enabled,
    },
    'auto-sprint': {
      autoSprintEnabled: macro.enabled,
    },
    'bunny-hop': {
      bunnyHopEnabled: macro.enabled,
      bunnyHopIntervalMs: cfg.intervalMs ?? 400,
      bunnyHopButton: cfg.button ?? 0x1000,
    },
    'auto-loot': {
      autoLootEnabled: macro.enabled,
      autoLootIntervalMs: cfg.intervalMs ?? 100,
      autoLootButton: cfg.button ?? 0x4000,
      autoLootDurationMs: cfg.durationMs ?? 30,
    },
  };
  return payloads[macro.id] ?? null;
}

// Syncs a single macro's state to the core process via IPC (MsgType 7)
function syncMacroToCore(id: string, get: () => MappingStore) {
  const macro = get().macros.find(m => m.id === id);
  if (!macro) return;
  const payload = buildMacroPayload(macro);
  if (payload) window.electronAPI?.coreSend(7, payload);
}

// Syncs ALL enabled macros to core (called on reconnect)
function syncAllMacrosToCore(get: () => MappingStore) {
  for (const macro of get().macros) {
    const payload = buildMacroPayload(macro);
    if (payload) window.electronAPI?.coreSend(7, payload);
  }
  // Sync hotkey config
  const { hotkeyVk, hotkeyMods } = get();
  window.electronAPI?.coreSend(7, { hotkeyVk, hotkeyMods });
}

export const useBindingStore = create<MappingStore>()(
  persist(
    (set, get) => ({
      activeProfile:  'default',
      savedProfiles:  [],
      captureEnabled: false,
      coreConnected:  false,
      mouseConfig: WARZONE_CONFIG,
      controllerType: 'vader4pro' as const,
      bindings: { ...WARZONE_BINDINGS },
      mouseBindings: { ...WARZONE_MOUSE_BINDINGS },
      hotkeyVk: 0x77,    // VK_F8
      hotkeyMods: 0x01,  // Shift
      macros: DEFAULT_MACROS.map(m => ({ ...m })),

      setBinding: (vk, b) => {
        set(s => ({ bindings: { ...s.bindings, [vk]: b } }));
        get().syncToCore();
      },

      unbindByMask: (mask) => {
        set(s => {
          const next = { ...s.bindings };
          for (const [vk, b] of Object.entries(next))
            if (b.mask === mask) delete next[Number(vk)];
          return { bindings: next };
        });
        get().syncToCore();
      },

      unbindByTarget: (target) => {
        set(s => {
          const next = { ...s.bindings };
          for (const [vk, b] of Object.entries(next))
            if (b.target === target) delete next[Number(vk)];
          return { bindings: next };
        });
        get().syncToCore();
      },

      setMouseBinding: (button, b) => {
        set(s => ({ mouseBindings: { ...s.mouseBindings, [button]: b } }));
        get().syncToCore();
      },

      unbindMouseByMask: (mask) => {
        set(s => {
          const next = { ...s.mouseBindings };
          for (const [btn, b] of Object.entries(next))
            if (b.mask === mask) delete next[Number(btn)];
          return { mouseBindings: next };
        });
        get().syncToCore();
      },

      unbindMouseByTarget: (target) => {
        set(s => {
          const next = { ...s.mouseBindings };
          for (const [btn, b] of Object.entries(next))
            if (b.target === target) delete next[Number(btn)];
          return { mouseBindings: next };
        });
        get().syncToCore();
      },

      setMouseConfig: (cfg) => {
        set({ mouseConfig: cfg });
        get().syncToCore();
      },

      setControllerType: (type) => {
        set({ controllerType: type });
      },

      setCaptureEnabled: (enabled) => {
        set({ captureEnabled: enabled });
        window.electronAPI?.coreSend(MsgType.SetCaptureEnabled, { enabled });
        window.electronAPI?.coreSend(MsgType.GetStatus, {});
      },

      setCaptureEnabledFromCore: (enabled) => set({ captureEnabled: enabled }),
      setCoreConnected: (connected) => set({ coreConnected: connected }),

      resetFpsDefaults: () => {
        set({
          activeProfile: 'warzone',
          bindings: { ...WARZONE_BINDINGS },
          mouseBindings: { ...WARZONE_MOUSE_BINDINGS },
          mouseConfig: WARZONE_CONFIG,
        });
        get().syncToCore();
      },

      saveProfile: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const { bindings, mouseBindings, mouseConfig } = get();
        localStorage.setItem(`profile_${trimmed}`, JSON.stringify(
          buildProfilePayload(trimmed, bindings, mouseBindings, mouseConfig)
        ));
        set({ activeProfile: trimmed, savedProfiles: listSavedProfileNames() });
      },

      loadProfile: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const raw = localStorage.getItem(`profile_${trimmed}`);
        if (!raw) return;
        const data = JSON.parse(raw);
        const resolvedBindings     = data.bindings      ?? data.keyBindings   ?? {};
        const resolvedMouseBindings = data.mouseBindings ?? {};
        const rawMouse             = data.mouse          ?? data.mouseConfig   ?? {};

        // Migrate legacy fields
        const resolvedMouse: MouseConfig = {
          ...DEFAULT_CONFIG,
          ...rawMouse,
          accelCurve: Array.isArray(rawMouse.accelCurve) ? rawMouse.accelCurve : DEFAULT_CONFIG.accelCurve,
          ...(rawMouse.sensitivity != null && rawMouse.sensitivityX == null
            ? { sensitivityX: rawMouse.sensitivity, sensitivityY: rawMouse.sensitivity }
            : {}),
          // Legacy: convert smoothSamples → smoothingFactor
          ...(rawMouse.smoothSamples != null && rawMouse.smoothingFactor == null
            ? { smoothingFactor: rawMouse.smoothSamples <= 1 ? 0 : rawMouse.smoothSamples * 0.001 }
            : {}),
        };

        set({ bindings: resolvedBindings, mouseBindings: resolvedMouseBindings, mouseConfig: resolvedMouse, activeProfile: trimmed });
        window.electronAPI?.coreSend(MsgType.LoadProfile,
          buildProfilePayload(trimmed, resolvedBindings, resolvedMouseBindings, resolvedMouse));
        get().syncToCore();
      },

      refreshProfiles: () => set({ savedProfiles: listSavedProfileNames() }),

      requestStatus: () => window.electronAPI?.coreSend(MsgType.GetStatus, {}),

      syncToCore: () => {
        const { bindings, mouseBindings, mouseConfig, activeProfile } = get();
        window.electronAPI?.coreSend(MsgType.SetActiveProfile,
          buildProfilePayload(activeProfile, bindings, mouseBindings, mouseConfig));
        syncAllMacrosToCore(get);
      },

      toggleMacro: (id) => {
        set(s => ({
          macros: s.macros.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m),
        }));
        syncMacroToCore(id, get);
      },

      updateMacroConfig: (id, config) => {
        set(s => ({
          macros: s.macros.map(m => m.id === id ? { ...m, config: { ...m.config, ...config } } : m),
        }));
        syncMacroToCore(id, get);
      },

      setHotkey: (vk, mods) => {
        set({ hotkeyVk: vk, hotkeyMods: mods });
        window.electronAPI?.coreSend(7, { hotkeyVk: vk, hotkeyMods: mods });
      },
    }),
    {
      name: 'rewsd-mappings-v4',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.refreshProfiles();
          // Migrate legacy smoothSamples → smoothingFactor
          const mc = state.mouseConfig as MouseConfig & { smoothSamples?: number };
          if (mc.smoothSamples != null && (mc as any).smoothingFactor == null) {
            state.mouseConfig = {
              ...DEFAULT_CONFIG,
              ...mc,
              smoothingFactor: mc.smoothSamples <= 1 ? 0 : mc.smoothSamples * 0.001,
              maxStepPerFrame: 0,
            };
            delete (state.mouseConfig as any).smoothSamples;
          }
          // Ensure new fields exist
          if (state.mouseConfig.mouseDPI == null) state.mouseConfig.mouseDPI = 800;
          if (state.mouseConfig.velocityMode == null) state.mouseConfig.velocityMode = true;
          if (state.mouseConfig.velocityScale == null) state.mouseConfig.velocityScale = 0.012;
          if (state.mouseConfig.velocityReleaseMs == null) state.mouseConfig.velocityReleaseMs = 8;
          if (state.mouseConfig.smoothingFactor == null) state.mouseConfig.smoothingFactor = 0;
          if (state.mouseConfig.maxStepPerFrame == null) state.mouseConfig.maxStepPerFrame = 0;
          if (state.mouseConfig.antiDeadzone == null) state.mouseConfig.antiDeadzone = 0;
          // Ensure macros array exists with all defaults
          if (!Array.isArray(state.macros) || state.macros.length === 0) {
            state.macros = DEFAULT_MACROS.map(m => ({ ...m }));
          } else {
            // Merge new defaults that may have been added
            for (const def of DEFAULT_MACROS) {
              if (!state.macros.find((m: MacroDef) => m.id === def.id)) {
                state.macros.push({ ...def });
              }
            }
          }
          // Migrate controller type to Vader 4 Pro
          if ((state.controllerType as string) === 'xbox360' || (state.controllerType as string) === 'dualsense') {
            state.controllerType = 'vader4pro';
          }
        }
      },
    }
  )
);
