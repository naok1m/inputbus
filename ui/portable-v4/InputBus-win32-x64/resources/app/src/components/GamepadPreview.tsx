import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { useBindingStore } from '../store/mappingStore';
import vaderImg from '../assets/vader4pro.png';

type GamepadPayload = {
  buttons?: number;
  leftTrigger?: number;
  rightTrigger?: number;
  thumbLX?: number;
  thumbLY?: number;
  thumbRX?: number;
  thumbRY?: number;
  mouseDeltaX?: number;
  mouseDeltaY?: number;
};

const BTN = {
  DPadUp: 0x0001, DPadDown: 0x0002, DPadLeft: 0x0004, DPadRight: 0x0008,
  Start: 0x0010, Back: 0x0020, LeftThumb: 0x0040, RightThumb: 0x0080,
  LB: 0x0100, RB: 0x0200,
  A: 0x1000, B: 0x2000, X: 0x4000, Y: 0x8000,
} as const;

const on = (btns: number, m: number) => (btns & m) !== 0;

const HI = '#f97316';
const DIM = '#555a68';
const LABEL_COLOR = '#8a8fa0';

const CONTROLLER_NAMES: Record<string, string> = {
  vader4pro: 'Vader 4 Pro',
  xbox360: 'Xbox 360',
  dualsense: 'DualSense',
};

/* ── Small reusable pieces ── */

function TriggerBar({ value, label, side }: { value: number; label: string; side: 'left' | 'right' }) {
  const active = value > 0.05;
  return (
    <div className={`gp-trigger gp-trigger--${side}`}>
      <span className="gp-trigger-label" style={{ color: active ? HI : LABEL_COLOR }}>{label}</span>
      <div className="gp-trigger-track">
        <div
          className="gp-trigger-fill"
          style={{ width: `${Math.max(2, value * 100)}%`, opacity: Math.max(0.2, value) }}
        />
      </div>
    </div>
  );
}

function SideLabel({ label, active, side, y }: { label: string; active: boolean; side: 'left' | 'right'; y: string }) {
  const s: CSSProperties = {
    position: 'absolute', top: y,
    [side]: 0,
    display: 'flex', alignItems: 'center', gap: 4,
    flexDirection: side === 'left' ? 'row' : 'row-reverse',
  };
  return (
    <div style={s}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1,
        color: active ? HI : LABEL_COLOR,
        transition: 'color 0.1s',
      }}>{label}</span>
      <div style={{
        width: 24, height: 1,
        background: active ? HI : '#333',
        transition: 'background 0.1s',
      }} />
    </div>
  );
}

function BtnDot({ active, color, label, style }: {
  active: boolean; color: string; label: string; style: CSSProperties;
}) {
  return (
    <div style={{
      position: 'absolute', ...style,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: active ? HI : '#2a2d36',
        border: `2px solid ${active ? HI : color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700,
        color: active ? '#fff' : color,
        transition: 'all 0.1s',
        boxShadow: active ? `0 0 8px ${HI}` : 'none',
      }}>
        {label}
      </div>
    </div>
  );
}

/* ── Main component ── */

export function GamepadPreview() {
  const controllerType = useBindingStore(s => s.controllerType);
  const [state, setState] = useState<GamepadPayload>({});

  useEffect(() => {
    if (!window.electronAPI?.onCoreMessage) return;
    const off = window.electronAPI.onCoreMessage((msg) => {
      if (msg.type === 101 && typeof msg.payload === 'object' && msg.payload !== null)
        setState(msg.payload as GamepadPayload);
    });
    return () => off?.();
  }, []);

  const btns = state.buttons ?? 0;
  const rt = (state.rightTrigger ?? 0) / 255;
  const lt = (state.leftTrigger ?? 0) / 255;

  const { lx, ly, rx, ry } = useMemo(() => ({
    lx: (state.thumbLX ?? 0) / 32767,
    ly: (state.thumbLY ?? 0) / 32767,
    rx: (state.thumbRX ?? 0) / 32767,
    ry: (state.thumbRY ?? 0) / 32767,
  }), [state.thumbLX, state.thumbLY, state.thumbRX, state.thumbRY]);

  return (
    <div className="card gamepad-card">
      <div className="card-header">
        <span className="card-title">Controller</span>
        <span className="card-badge">{CONTROLLER_NAMES[controllerType] ?? controllerType}</span>
      </div>

      {/* ── Trigger bars ── */}
      <div className="gp-triggers-row">
        <TriggerBar value={lt} label="LT" side="left" />
        <TriggerBar value={rt} label="RT" side="right" />
      </div>

      {/* ── Controller image with overlays ── */}
      <div className="gp-container">
        {/* Left side labels */}
        <SideLabel label="LB" active={on(btns, BTN.LB)} side="left" y="38%" />
        <SideLabel label="LS" active={on(btns, BTN.LeftThumb)} side="left" y="55%" />

        {/* Controller image */}
        <div className="gp-image-wrap">
          <img src={vaderImg} alt="Vader 4 Pro" className="gp-image" draggable={false} />

          {/* Left stick indicator */}
          <div className="gp-stick gp-stick--left" style={{
            transform: `translate(${lx * 8}px, ${-ly * 8}px)`,
            boxShadow: (Math.abs(lx) + Math.abs(ly)) > 0.1 ? `0 0 10px ${HI}` : 'none',
            borderColor: (Math.abs(lx) + Math.abs(ly)) > 0.1 ? HI : '#444',
          }} />

          {/* Right stick indicator */}
          <div className="gp-stick gp-stick--right" style={{
            transform: `translate(${rx * 8}px, ${-ry * 8}px)`,
            boxShadow: (Math.abs(rx) + Math.abs(ry)) > 0.1 ? `0 0 10px ${HI}` : 'none',
            borderColor: (Math.abs(rx) + Math.abs(ry)) > 0.1 ? HI : '#444',
          }} />
        </div>

        {/* Right side labels */}
        <SideLabel label="RB" active={on(btns, BTN.RB)} side="right" y="38%" />
        <SideLabel label="RS" active={on(btns, BTN.RightThumb)} side="right" y="65%" />

        {/* ABXY dots (positioned to the right of the image) */}
        <BtnDot active={on(btns, BTN.Y)} color="#eab308" label="Y" style={{ right: -4, top: '32%' }} />
        <BtnDot active={on(btns, BTN.B)} color="#ef4444" label="B" style={{ right: -12, top: '44%' }} />
        <BtnDot active={on(btns, BTN.X)} color="#3b82f6" label="X" style={{ right: 12, top: '44%' }} />
        <BtnDot active={on(btns, BTN.A)} color="#22c55e" label="A" style={{ right: -4, top: '56%' }} />

        {/* D-Pad indicators (positioned to the left) */}
        <BtnDot active={on(btns, BTN.DPadUp)} color={DIM} label="▲" style={{ left: 4, top: '56%' }} />
        <BtnDot active={on(btns, BTN.DPadDown)} color={DIM} label="▼" style={{ left: 4, top: '68%' }} />
        <BtnDot active={on(btns, BTN.DPadLeft)} color={DIM} label="◀" style={{ left: -8, top: '62%' }} />
        <BtnDot active={on(btns, BTN.DPadRight)} color={DIM} label="▶" style={{ left: 16, top: '62%' }} />

        {/* Start / Back */}
        <BtnDot active={on(btns, BTN.Start)} color={DIM} label="≡" style={{ right: 44, top: '24%' }} />
        <BtnDot active={on(btns, BTN.Back)} color={DIM} label="⊞" style={{ left: 44, top: '24%' }} />
      </div>

      {/* ── Telemetry bar ── */}
      <div className="gamepad-telemetry">
        <div className="telemetry-group">
          <span className="telemetry-label">Mouse</span>
          <span className="telemetry-val">{state.mouseDeltaX ?? 0}</span>
          <span className="telemetry-val">{state.mouseDeltaY ?? 0}</span>
        </div>
        <div className="telemetry-group">
          <span className="telemetry-label">Left</span>
          <span className="telemetry-val">{state.thumbLX ?? 0}</span>
          <span className="telemetry-val">{state.thumbLY ?? 0}</span>
        </div>
        <div className="telemetry-group">
          <span className="telemetry-label">Right</span>
          <span className="telemetry-val">{state.thumbRX ?? 0}</span>
          <span className="telemetry-val">{state.thumbRY ?? 0}</span>
        </div>
        <div className="telemetry-group">
          <span className="telemetry-label">Triggers</span>
          <span className="telemetry-val">{state.leftTrigger ?? 0}</span>
          <span className="telemetry-val">{state.rightTrigger ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
