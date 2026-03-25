import { useEffect, useMemo, useState } from 'react';

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

const pressed = (btns: number, mask: number) => (btns & mask) !== 0;

export function GamepadPreview() {
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
  const rt   = (state.rightTrigger ?? 0) / 255;
  const lt   = (state.leftTrigger  ?? 0) / 255;

  const { lx, ly, rx, ry } = useMemo(() => ({
    lx: (state.thumbLX ?? 0) / 32767,
    ly: (state.thumbLY ?? 0) / 32767,
    rx: (state.thumbRX ?? 0) / 32767,
    ry: (state.thumbRY ?? 0) / 32767,
  }), [state.thumbLX, state.thumbLY, state.thumbRX, state.thumbRY]);

  const ldx = 70  + lx * 10;
  const ldy = 80  - ly * 10;
  const rdx = 190 + rx * 10;
  const rdy = 90  - ry * 10;
  const mdx = state.mouseDeltaX ?? 0;
  const mdy = state.mouseDeltaY ?? 0;

  const bc = (m: number) => pressed(btns, m) ? 'btn-active' : 'btn-pad';

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Gamepad Preview</span>
      </div>

      <div className="gamepad-preview">
        <svg viewBox="0 0 260 150" role="img" aria-label="Xbox virtual gamepad">
          <rect x="20" y="25" width="220" height="100" rx="45" className="pad-shell" />

          {/* Triggers */}
          <rect x="56"  y="28" width="30" height="7" rx="3"
            className="trigger" style={{ opacity: Math.max(0.2, lt) }} />
          <rect x="174" y="28" width="30" height="7" rx="3"
            className="trigger" style={{ opacity: Math.max(0.2, rt) }} />

          {/* Left stick */}
          <circle cx="70"  cy="80" r="12" className="stick-base" />
          <circle cx={ldx} cy={ldy} r="4"  className="stick-dot"  />

          {/* Right stick */}
          <circle cx="190" cy="90" r="12" className="stick-base" />
          <circle cx={rdx} cy={rdy} r="4"  className="stick-dot"  />

          {/* D-pad */}
          <rect x="42" y="50" width="10" height="30" rx="2" className={bc(BTN.DPadUp) } />
          <rect x="32" y="60" width="30" height="10" rx="2" className={bc(BTN.DPadLeft)} />

          {/* ABXY */}
          <circle cx="210" cy="55" r="6" className={bc(BTN.Y)} />
          <circle cx="224" cy="69" r="6" className={bc(BTN.B)} />
          <circle cx="196" cy="69" r="6" className={bc(BTN.X)} />
          <circle cx="210" cy="83" r="6" className={bc(BTN.A)} />

          {/* LB / RB */}
          <rect x="56"  y="38" width="30" height="6" rx="3" className={bc(BTN.LB)} />
          <rect x="174" y="38" width="30" height="6" rx="3" className={bc(BTN.RB)} />

          {/* Back / Start */}
          <rect x="114" y="55" width="12" height="6" rx="2" className={bc(BTN.Back)} />
          <rect x="134" y="55" width="12" height="6" rx="2" className={bc(BTN.Start)} />
        </svg>
      </div>

      <div className="delta-row">
        <span>Mouse Δ</span>
        <span className="delta-val">X {mdx}</span>
        <span className="delta-val">Y {mdy}</span>
        <span style={{ marginLeft: 'auto' }}>Right stick</span>
        <span className="delta-val">RX {state.thumbRX ?? 0}</span>
        <span className="delta-val">RY {state.thumbRY ?? 0}</span>
      </div>
    </div>
  );
}
