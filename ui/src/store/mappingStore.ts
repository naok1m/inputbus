import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Binding { target: string; mask?: number; axisValue?: number; }

export interface MouseConfig {
  // Sensitivity: scale factor per pixel of mouse movement
  sensitivityX:    number;
  sensitivityY:    number;
  // Response curve
  exponent:        number;
  maxSpeed:        number;
  // Deadzone
  deadzone:        number;
  // Smoothing (EMA: 1 = none, 10 = heavy)
  smoothSamples:   number;
  // Jitter filter (px) — filters optical sensor noise at rest
  jitterThreshold: number;
  // Decay: how long stick holds position after mouse stops
  decayDelay:      number;  // ms before decay starts
  decayRate:       number;  // exponential decay rate
}

const DEFAULT_CONFIG: MouseConfig = {
  sensitivityX:    1.0,
  sensitivityY:    1.0,
  exponent:        1.0,
  maxSpeed:        1.0,
  deadzone:        0.05,
  smoothSamples:   2,
  jitterThreshold: 1.5,
  decayDelay:      100,
  decayRate:       6,
};

const FPS_CONFIG: MouseConfig = {
  sensitivityX:    1.5,
  sensitivityY:    1.5,
  exponent:        1.1,
  maxSpeed:        1.0,
  deadzone:        0.04,
  smoothSamples:   1,
  jitterThreshold: 1.5,
  decayDelay:      80,
  decayRate:       8,
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
  activeProfile: string;
  savedProfiles: string[];
  captureEnabled:  boolean;
  coreConnected:   boolean;

  setBinding:             (vkCode: number, binding: Binding) => void;
  unbindByMask:           (mask: number) => void;
  setMouseBinding:        (button: number, binding: Binding) => void;
  unbindMouseByMask:      (mask: number) => void;
  setMouseConfig:         (cfg: MouseConfig) => void;
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
      mouseConfig: DEFAULT_CONFIG,
      bindings: {
        87: { target: 'leftStickY', axisValue:  1.0 },  // W
        83: { target: 'leftStickY', axisValue: -1.0 },  // S
        65: { target: 'leftStickX', axisValue: -1.0 },  // A
        68: { target: 'leftStickX', axisValue:  1.0 },  // D
        32: { target: 'button', mask: 4096 },            // Space → A
      },
      mouseBindings: {
        3: { target: 'button', mask: 512 },  // X1 → RB
        4: { target: 'button', mask: 256 },  // X2 → LB
      },

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

      setMouseConfig: (cfg) => {
        set({ mouseConfig: cfg });
        get().syncToCore();
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
          activeProfile: 'fps-default',
          bindings: {
            87: { target: 'leftStickY', axisValue:  1.0 },
            83: { target: 'leftStickY', axisValue: -1.0 },
            65: { target: 'leftStickX', axisValue: -1.0 },
            68: { target: 'leftStickX', axisValue:  1.0 },
            32: { target: 'button', mask: 4096 },
            16: { target: 'button', mask: 8192 },
            17: { target: 'button', mask: 16384 },
          },
          mouseBindings: {
            3: { target: 'button', mask: 512 },
            4: { target: 'button', mask: 256 },
          },
          mouseConfig: FPS_CONFIG,
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

        // Migrate legacy "sensitivity" field to sensitivityX/Y
        const resolvedMouse: MouseConfig = {
          ...DEFAULT_CONFIG,
          ...rawMouse,
          ...(rawMouse.sensitivity != null && rawMouse.sensitivityX == null
            ? { sensitivityX: rawMouse.sensitivity, sensitivityY: rawMouse.sensitivity }
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
      name: 'rewsd-mappings-v3',
      onRehydrateStorage: () => (state) => {
        state?.refreshProfiles();
      },
    }
  )
);
