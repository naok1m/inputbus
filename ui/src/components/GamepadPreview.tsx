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

const on = (btns: number, m: number) => (btns & m) !== 0;

// Colors
const C = {
  body:     '#1e2028',
  bodyEdge: '#15171c',
  inner:    '#282b34',
  btn:      '#3a3d4a',
  btnHi:    '#f97316',
  stick:    '#111318',
  stickRim: '#2a2d36',
  guide:    '#3a3d4a',
  guideHi:  '#f97316',
  text:     '#666a78',
  textHi:   '#f97316',
  green:    '#22c55e',
  red:      '#ef4444',
  blue:     '#3b82f6',
  yellow:   '#eab308',
  trigBg:   '#282b34',
  trigFill: '#f97316',
};

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

  // Stick positions (range of travel)
  const stickR = 12;
  const lsx = 145 + lx * stickR;
  const lsy = 175 + -ly * stickR;
  const rsx = 305 + rx * stickR;
  const rsy = 215 + -ry * stickR;

  const bc = (m: number) => on(btns, m) ? C.btnHi : C.btn;
  const tc = (m: number) => on(btns, m) ? C.textHi : C.text;

  return (
    <div className="card gamepad-card">
      <div className="card-header">
        <span className="card-title">Controller</span>
        <span className="card-badge">Xbox 360</span>
      </div>

      <div className="gamepad-preview">
        <svg viewBox="0 0 450 320" role="img" aria-label="Xbox controller">
          <defs>
            <radialGradient id="bodyGrad" cx="50%" cy="40%" r="60%">
              <stop offset="0%"   stopColor="#252830" />
              <stop offset="100%" stopColor="#181a20" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="innerShadow">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
              <feOffset dx="0" dy="2" result="off" />
              <feComposite in2="SourceAlpha" operator="out" result="shadow"/>
              <feFlood floodColor="#000" floodOpacity="0.4" result="color"/>
              <feComposite in="color" in2="shadow" operator="in" result="final"/>
              <feMerge><feMergeNode in="final"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* ── BODY ── */}
          {/* Main body shape - Xbox controller silhouette */}
          <path d={`
            M 120,80
            C 100,80  75,95  65,130
            Q 50,175  55,220
            Q 60,270  90,290
            Q 110,300 130,285
            Q 150,270 160,245
            Q 170,220 185,215
            L 265,215
            Q 280,220 290,245
            Q 300,270 320,285
            Q 340,300 360,290
            Q 390,270 395,220
            Q 400,175 385,130
            Q 375,95  350,80
            L 120,80
            Z
          `} fill="url(#bodyGrad)" stroke={C.bodyEdge} strokeWidth="2" />

          {/* Inner face plate */}
          <path d={`
            M 130,90
            C 115,90  95,105  85,135
            Q 72,170  77,210
            Q 82,250  100,268
            Q 115,278 130,268
            Q 145,255 155,235
            Q 165,215 185,210
            L 265,210
            Q 285,215 295,235
            Q 305,255 320,268
            Q 335,278 350,268
            Q 368,250 373,210
            Q 378,170 365,135
            Q 355,105  340,90
            L 130,90
            Z
          `} fill={C.body} stroke={C.bodyEdge} strokeWidth="1" opacity="0.5" />

          {/* ── BUMPERS (LB / RB) ── */}
          <path d={`M 115,82 Q 140,72 175,75 L 175,82 Q 140,78 115,82 Z`}
            fill={bc(BTN.LB)} rx="3" />
          <text x="145" y="72" textAnchor="middle" fontSize="9" fontWeight="700"
            fill={tc(BTN.LB)}>LB</text>

          <path d={`M 335,82 Q 310,72 275,75 L 275,82 Q 310,78 335,82 Z`}
            fill={bc(BTN.RB)} rx="3" />
          <text x="305" y="72" textAnchor="middle" fontSize="9" fontWeight="700"
            fill={tc(BTN.RB)}>RB</text>

          {/* ── TRIGGERS (LT / RT) with fill level ── */}
          {/* LT */}
          <rect x="125" y="50" width="40" height="16" rx="4" fill={C.trigBg} stroke={C.bodyEdge} strokeWidth="1" />
          <rect x="126" y="51" width={Math.max(1, 38 * lt)} height="14" rx="3" fill={C.trigFill} opacity={Math.max(0.15, lt)} />
          <text x="145" y="44" textAnchor="middle" fontSize="8" fill={lt > 0.1 ? C.textHi : C.text}>LT</text>

          {/* RT */}
          <rect x="285" y="50" width="40" height="16" rx="4" fill={C.trigBg} stroke={C.bodyEdge} strokeWidth="1" />
          <rect x={325 - Math.max(1, 38 * rt)} y="51" width={Math.max(1, 38 * rt)} height="14" rx="3" fill={C.trigFill} opacity={Math.max(0.15, rt)} />
          <text x="305" y="44" textAnchor="middle" fontSize="8" fill={rt > 0.1 ? C.textHi : C.text}>RT</text>

          {/* ── LEFT STICK ── */}
          <circle cx="145" cy="175" r="24" fill={C.stickRim} stroke={C.bodyEdge} strokeWidth="1.5" />
          <circle cx="145" cy="175" r="20" fill={C.stick} />
          {/* Stick position dot */}
          <circle cx={lsx} cy={lsy} r="6" fill={C.btnHi} filter="url(#glow)" opacity={Math.max(0.4, Math.abs(lx) + Math.abs(ly))} />
          {/* Stick crosshair */}
          <line x1="133" y1="175" x2="157" y2="175" stroke={C.stickRim} strokeWidth="0.5" />
          <line x1="145" y1="163" x2="145" y2="187" stroke={C.stickRim} strokeWidth="0.5" />
          {/* LS click indicator */}
          {on(btns, BTN.LeftThumb) && <circle cx="145" cy="175" r="20" fill="none" stroke={C.btnHi} strokeWidth="2" filter="url(#glow)" />}

          {/* ── RIGHT STICK ── */}
          <circle cx="305" cy="215" r="24" fill={C.stickRim} stroke={C.bodyEdge} strokeWidth="1.5" />
          <circle cx="305" cy="215" r="20" fill={C.stick} />
          <circle cx={rsx} cy={rsy} r="6" fill={C.btnHi} filter="url(#glow)" opacity={Math.max(0.4, Math.abs(rx) + Math.abs(ry))} />
          <line x1="293" y1="215" x2="317" y2="215" stroke={C.stickRim} strokeWidth="0.5" />
          <line x1="305" y1="203" x2="305" y2="227" stroke={C.stickRim} strokeWidth="0.5" />
          {on(btns, BTN.RightThumb) && <circle cx="305" cy="215" r="20" fill="none" stroke={C.btnHi} strokeWidth="2" filter="url(#glow)" />}

          {/* ── D-PAD ── */}
          <g>
            {/* D-pad base */}
            <rect x="130" y="205" width="30" height="12" rx="2" fill={C.inner} />
            <rect x="139" y="196" width="12" height="30" rx="2" fill={C.inner} />
            {/* Active directions */}
            <rect x="139" y="196" width="12" height="12" rx="2" fill={bc(BTN.DPadUp)} />
            <rect x="139" y="218" width="12" height="8"  rx="2" fill={bc(BTN.DPadDown)} />
            <rect x="130" y="205" width="12" height="12" rx="2" fill={bc(BTN.DPadLeft)} />
            <rect x="148" y="205" width="12" height="12" rx="2" fill={bc(BTN.DPadRight)} />
            {/* Arrows */}
            <text x="145" y="205" textAnchor="middle" fontSize="7" fill={tc(BTN.DPadUp)}>▲</text>
            <text x="145" y="225" textAnchor="middle" fontSize="7" fill={tc(BTN.DPadDown)}>▼</text>
            <text x="135" y="214" textAnchor="middle" fontSize="7" fill={tc(BTN.DPadLeft)}>◀</text>
            <text x="155" y="214" textAnchor="middle" fontSize="7" fill={tc(BTN.DPadRight)}>▶</text>
          </g>

          {/* ── ABXY BUTTONS ── */}
          <g>
            {/* Y - top */}
            <circle cx="355" cy="140" r="13" fill={bc(BTN.Y)} filter="url(#innerShadow)" />
            <text x="355" y="144" textAnchor="middle" fontSize="11" fontWeight="700"
              fill={on(btns, BTN.Y) ? '#fff' : C.yellow}>Y</text>

            {/* B - right */}
            <circle cx="380" cy="165" r="13" fill={bc(BTN.B)} filter="url(#innerShadow)" />
            <text x="380" y="169" textAnchor="middle" fontSize="11" fontWeight="700"
              fill={on(btns, BTN.B) ? '#fff' : C.red}>B</text>

            {/* X - left */}
            <circle cx="330" cy="165" r="13" fill={bc(BTN.X)} filter="url(#innerShadow)" />
            <text x="330" y="169" textAnchor="middle" fontSize="11" fontWeight="700"
              fill={on(btns, BTN.X) ? '#fff' : C.blue}>X</text>

            {/* A - bottom */}
            <circle cx="355" cy="190" r="13" fill={bc(BTN.A)} filter="url(#innerShadow)" />
            <text x="355" y="194" textAnchor="middle" fontSize="11" fontWeight="700"
              fill={on(btns, BTN.A) ? '#fff' : C.green}>A</text>
          </g>

          {/* ── BACK / START (small center buttons) ── */}
          <rect x="200" y="150" width="20" height="10" rx="5" fill={bc(BTN.Back)} />
          <text x="210" y="147" textAnchor="middle" fontSize="7" fill={tc(BTN.Back)}>Back</text>

          <rect x="235" y="150" width="20" height="10" rx="5" fill={bc(BTN.Start)} />
          <text x="245" y="147" textAnchor="middle" fontSize="7" fill={tc(BTN.Start)}>Start</text>

          {/* ── GUIDE BUTTON (Xbox logo) ── */}
          <circle cx="225" cy="125" r="10" fill={C.guide} stroke={C.bodyEdge} strokeWidth="1" />
          <text x="225" y="129" textAnchor="middle" fontSize="10" fill={C.text}>X</text>
        </svg>
      </div>

      {/* ── TELEMETRY BAR ── */}
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
