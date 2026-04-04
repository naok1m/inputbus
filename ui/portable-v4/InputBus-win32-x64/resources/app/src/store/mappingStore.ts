import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Binding { target: string; mask?: number; axisValue?: number; }

export interface AccelPoint {
  speed: number;  // Mouse speed in px/tick
  mult:  number;  // Sensitivity multiplier at this speed
}

export interface MouseConfig {
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
  decayRate:       number;  // exponential decay rate (0 = never returns)
  decayMinStick:   number;  // floor magnitude: decay stops below this
}

const DEFAULT_CONFIG: MouseConfig = {
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
};

const WARZONE_CONFIG: MouseConfig = {
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
          if (state.mouseConfig.smoothingFactor == null) state.mouseConfig.smoothingFactor = 0;
          if (state.mouseConfig.maxStepPerFrame == null) state.mouseConfig.maxStepPerFrame = 0;
          // Migrate controller type to Vader 4 Pro
          if ((state.controllerType as string) === 'xbox360' || (state.controllerType as string) === 'dualsense') {
            state.controllerType = 'vader4pro';
          }
        }
      },
    }
  )
);
