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
  DPadUp: 0x0001,
  DPadDown: 0x0002,
  DPadLeft: 0x0004,
  DPadRight: 0x0008,
  Start: 0x0010,
  Back: 0x0020,
  LeftThumb: 0x0040,
  RightThumb: 0x0080,
  LeftShoulder: 0x0100,
  RightShoulder: 0x0200,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
} as const;

const isPressed = (buttons: number, mask: number) => (buttons & mask) !== 0;

export function GamepadPreview() {
  const [state, setState] = useState<GamepadPayload>({});

  useEffect(() => {
    if (!window.electronAPI?.onCoreMessage) return;

    const off = window.electronAPI.onCoreMessage((msg) => {
      if (msg.type !== 101 || typeof msg.payload !== 'object' || msg.payload === null) return;
      setState(msg.payload as GamepadPayload);
    });

    return () => off?.();
  }, []);

  const buttons = state.buttons ?? 0;
  const rt = (state.rightTrigger ?? 0) / 255;
  const lt = (state.leftTrigger ?? 0) / 255;

  const stick = useMemo(() => {
    const lx = (state.thumbLX ?? 0) / 32767;
    const ly = (state.thumbLY ?? 0) / 32767;
    const rx = (state.thumbRX ?? 0) / 32767;
    const ry = (state.thumbRY ?? 0) / 32767;
    return { lx, ly, rx, ry };
  }, [state.thumbLX, state.thumbLY, state.thumbRX, state.thumbRY]);

  const dotX = 70 + stick.lx * 10;
  const dotY = 80 - stick.ly * 10;
  const dotRX = 190 + stick.rx * 10;
  const dotRY = 90 - stick.ry * 10;
  const mdx = state.mouseDeltaX ?? 0;
  const mdy = state.mouseDeltaY ?? 0;

  return (
    <section className="gamepad-preview card">
      <h2>Gamepad Preview</h2>
      <svg viewBox="0 0 260 150" role="img" aria-label="Xbox virtual gamepad state">
        <rect x="20" y="25" width="220" height="100" rx="45" className="pad-shell" />

        <circle cx="70" cy="80" r="12" className="stick-base" />
        <circle cx={dotX} cy={dotY} r="4" className="stick-dot active" />

        <circle cx="190" cy="90" r="12" className="stick-base" />
        <circle cx={dotRX} cy={dotRY} r="4" className="stick-dot active" />

        <circle cx="210" cy="55" r="6" className={isPressed(buttons, BTN.Y) ? 'btn-active y' : 'btn'} />
        <circle cx="224" cy="69" r="6" className={isPressed(buttons, BTN.B) ? 'btn-active b' : 'btn'} />
        <circle cx="196" cy="69" r="6" className={isPressed(buttons, BTN.X) ? 'btn-active x' : 'btn'} />
        <circle cx="210" cy="83" r="6" className={isPressed(buttons, BTN.A) ? 'btn-active a' : 'btn'} />

        <rect x="42" y="50" width="10" height="30" className={isPressed(buttons, BTN.DPadUp) || isPressed(buttons, BTN.DPadDown) ? 'btn-active dpad' : 'btn'} />
        <rect x="32" y="60" width="30" height="10" className={isPressed(buttons, BTN.DPadLeft) || isPressed(buttons, BTN.DPadRight) ? 'btn-active dpad' : 'btn'} />

        <rect x="56" y="28" width="30" height="7" rx="3" style={{ opacity: Math.max(0.2, lt) }} className="trigger" />
        <rect x="174" y="28" width="30" height="7" rx="3" style={{ opacity: Math.max(0.2, rt) }} className="trigger" />

        <rect x="114" y="55" width="12" height="6" rx="2" className={isPressed(buttons, BTN.Back) ? 'btn-active center' : 'btn'} />
        <rect x="134" y="55" width="12" height="6" rx="2" className={isPressed(buttons, BTN.Start) ? 'btn-active center' : 'btn'} />
      </svg>
      <p>
        Debug Mouse Delta: <strong>X {mdx}</strong> | <strong>Y {mdy}</strong>
      </p>
      <p>
        Right Stick: <strong>RX {state.thumbRX ?? 0}</strong> | <strong>RY {state.thumbRY ?? 0}</strong>
      </p>
    </section>
  );
}
