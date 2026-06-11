import { useEffect, useMemo, useState } from 'react';
import { useBindingStore } from '../store/mappingStore';
import vaderImg from '../assets/vader4pro.png';
import xboxImg from '../assets/xbox360.png';

type GP = {
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

const B = {
  DU:0x0001, DD:0x0002, DL:0x0004, DR:0x0008,
  Start:0x0010, Back:0x0020, LS:0x0040, RS:0x0080,
  LB:0x0100, RB:0x0200, A:0x1000, B:0x2000, X:0x4000, Y:0x8000,
};

const HI = '#f97316';

// Per-controller positions (% of image)
type Pos = { l: string; t: string };
interface Layout {
  img: string;
  ls: Pos; rs: Pos;
  Y: Pos; B: Pos; X: Pos; A: Pos;
  DU: Pos; DD: Pos; DL: Pos; DR: Pos;
  St: Pos; Bk: Pos; LB: Pos; RB: Pos;
}

const L: Record<string, Layout> = {
  xbox360: {
    img: xboxImg,
    ls:{l:'30%',t:'33%'}, rs:{l:'57%',t:'58%'},
    Y:{l:'73%',t:'24%'}, B:{l:'80%',t:'35%'}, X:{l:'66%',t:'35%'}, A:{l:'73%',t:'46%'},
    DU:{l:'37%',t:'51%'}, DD:{l:'37%',t:'65%'}, DL:{l:'31%',t:'58%'}, DR:{l:'43%',t:'58%'},
    St:{l:'56%',t:'30%'}, Bk:{l:'44%',t:'30%'},
    LB:{l:'22%',t:'6%'}, RB:{l:'78%',t:'6%'},
  },
  vader4pro: {
    img: vaderImg,
    ls:{l:'28%',t:'33%'}, rs:{l:'59%',t:'55%'},
    Y:{l:'79%',t:'24%'}, B:{l:'86%',t:'36%'}, X:{l:'72%',t:'36%'}, A:{l:'79%',t:'48%'},
    DU:{l:'22%',t:'54%'}, DD:{l:'22%',t:'68%'}, DL:{l:'16%',t:'61%'}, DR:{l:'28%',t:'61%'},
    St:{l:'57%',t:'33%'}, Bk:{l:'43%',t:'33%'},
    LB:{l:'18%',t:'8%'}, RB:{l:'82%',t:'8%'},
  },
};
L.dualsense = { ...L.xbox360 };
L.steamInput = { ...L.xbox360 };

const NAMES: Record<string, string> = {
  vader4pro: 'Vader 4 Pro', xbox360: 'Xbox 360', dualsense: 'DualSense', steamInput: 'Steam Input',
};

// Glow dot — invisible when off, colored glow when on
function Glow({ on, color, pos }: { on: boolean; color: string; pos: Pos }) {
  return (
    <div style={{
      position: 'absolute', left: pos.l, top: pos.t,
      transform: 'translate(-50%,-50%)',
      width: 26, height: 26, borderRadius: '50%',
      background: on ? `radial-gradient(circle, ${color}55 0%, transparent 70%)` : 'transparent',
      boxShadow: on ? `0 0 18px 6px ${color}77` : 'none',
      transition: 'all 0.08s', pointerEvents: 'none', zIndex: 2,
    }} />
  );
}

// Trigger bar
function TriggerBar({ value, label, side }: { value: number; label: string; side: 'left'|'right' }) {
  const on = value > 0.05;
  return (
    <div className={`gp-trigger gp-trigger--${side}`}>
      <span className="gp-trigger-label" style={{ color: on ? HI : undefined }}>{label}</span>
      <div className="gp-trigger-track">
        <div className="gp-trigger-fill" style={{ width: `${Math.max(2, value*100)}%`, opacity: Math.max(0.2, value) }} />
      </div>
    </div>
  );
}

// Button status pill
function Pill({ on, color, label }: { on: boolean; color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 22, height: 18, padding: '0 5px', borderRadius: 9,
      fontSize: 8, fontWeight: 700, letterSpacing: 0.3,
      background: on ? `${color}22` : 'var(--bg-overlay)',
      color: on ? color : 'var(--text-disabled)',
      border: `1px solid ${on ? `${color}44` : 'transparent'}`,
      boxShadow: on ? `0 0 6px ${color}33` : 'none',
      transition: 'all 0.1s',
    }}>{label}</span>
  );
}

export function GamepadPreview() {
  const ct = useBindingStore(s => s.controllerType);
  const [s, setS] = useState<GP>({});

  useEffect(() => {
    if (!window.electronAPI?.onCoreMessage) return;
    const off = window.electronAPI.onCoreMessage((msg) => {
      if (msg.type === 101 && typeof msg.payload === 'object' && msg.payload !== null)
        setS(msg.payload as GP);
    });
    return () => off?.();
  }, []);

  const lay = L[ct] ?? L.vader4pro;
  const b = s.buttons ?? 0;
  const rt = (s.rightTrigger ?? 0) / 255;
  const lt = (s.leftTrigger ?? 0) / 255;
  const on = (m: number) => (b & m) !== 0;

  const { lx, ly, rx, ry } = useMemo(() => ({
    lx: (s.thumbLX ?? 0) / 32767,
    ly: (s.thumbLY ?? 0) / 32767,
    rx: (s.thumbRX ?? 0) / 32767,
    ry: (s.thumbRY ?? 0) / 32767,
  }), [s.thumbLX, s.thumbLY, s.thumbRX, s.thumbRY]);

  const lsActive = (Math.abs(lx) + Math.abs(ly)) > 0.1;
  const rsActive = (Math.abs(rx) + Math.abs(ry)) > 0.1;

  return (
    <div className="card gamepad-card">
      <div className="card-header">
        <span className="card-title">Controller</span>
        <span className="card-badge">{NAMES[ct] ?? ct}</span>
      </div>

      <div className="gp-triggers-row">
        <TriggerBar value={lt} label="LT" side="left" />
        <TriggerBar value={rt} label="RT" side="right" />
      </div>

      <div className="gp-container">
        <div className="gp-image-wrap" style={{ position: 'relative' }}>
          <img src={lay.img} alt={ct} className="gp-image" draggable={false} />

          {/* Stick indicators */}
          <div className="gp-stick" style={{
            left: lay.ls.l, top: lay.ls.t,
            transform: `translate(-50%,-50%) translate(${lx*8}px,${-ly*8}px)`,
            boxShadow: lsActive || on(B.LS) ? `0 0 12px ${HI}` : 'none',
            borderColor: lsActive || on(B.LS) ? HI : '#444',
            background: on(B.LS) ? `${HI}33` : 'rgba(249,115,22,0.1)',
          }} />
          <div className="gp-stick" style={{
            left: lay.rs.l, top: lay.rs.t,
            transform: `translate(-50%,-50%) translate(${rx*8}px,${-ry*8}px)`,
            boxShadow: rsActive || on(B.RS) ? `0 0 12px ${HI}` : 'none',
            borderColor: rsActive || on(B.RS) ? HI : '#444',
            background: on(B.RS) ? `${HI}33` : 'rgba(249,115,22,0.1)',
          }} />

          {/* Button glows */}
          <Glow on={on(B.Y)}  color="#eab308" pos={lay.Y} />
          <Glow on={on(B.B)}  color="#ef4444" pos={lay.B} />
          <Glow on={on(B.X)}  color="#3b82f6" pos={lay.X} />
          <Glow on={on(B.A)}  color="#22c55e" pos={lay.A} />
          <Glow on={on(B.DU)} color={HI} pos={lay.DU} />
          <Glow on={on(B.DD)} color={HI} pos={lay.DD} />
          <Glow on={on(B.DL)} color={HI} pos={lay.DL} />
          <Glow on={on(B.DR)} color={HI} pos={lay.DR} />
          <Glow on={on(B.Start)} color={HI} pos={lay.St} />
          <Glow on={on(B.Back)}  color={HI} pos={lay.Bk} />
          <Glow on={on(B.LB)} color={HI} pos={lay.LB} />
          <Glow on={on(B.RB)} color={HI} pos={lay.RB} />
        </div>
      </div>

      {/* Button status strip */}
      <div className="gp-btn-strip">
        <Pill on={on(B.LB)} color={HI} label="LB" />
        <Pill on={lt>0.1} color={HI} label="LT" />
        <Pill on={on(B.LS)} color={HI} label="LS" />
        <Pill on={on(B.DU)} color={HI} label="D\u2191" />
        <Pill on={on(B.DD)} color={HI} label="D\u2193" />
        <Pill on={on(B.DL)} color={HI} label="D\u2190" />
        <Pill on={on(B.DR)} color={HI} label="D\u2192" />
        <Pill on={on(B.Back)} color="#888" label="BK" />
        <Pill on={on(B.Start)} color="#888" label="ST" />
        <Pill on={on(B.Y)} color="#eab308" label="Y" />
        <Pill on={on(B.B)} color="#ef4444" label="B" />
        <Pill on={on(B.A)} color="#22c55e" label="A" />
        <Pill on={on(B.X)} color="#3b82f6" label="X" />
        <Pill on={on(B.RS)} color={HI} label="RS" />
        <Pill on={rt>0.1} color={HI} label="RT" />
        <Pill on={on(B.RB)} color={HI} label="RB" />
      </div>

      {/* Telemetry */}
      <div className="gamepad-telemetry">
        <div className="telemetry-group">
          <span className="telemetry-label">Left</span>
          <span className="telemetry-val">{s.thumbLX ?? 0}</span>
          <span className="telemetry-val">{s.thumbLY ?? 0}</span>
        </div>
        <div className="telemetry-group">
          <span className="telemetry-label">Right</span>
          <span className="telemetry-val">{s.thumbRX ?? 0}</span>
          <span className="telemetry-val">{s.thumbRY ?? 0}</span>
        </div>
        <div className="telemetry-group">
          <span className="telemetry-label">Triggers</span>
          <span className="telemetry-val">{s.leftTrigger ?? 0}</span>
          <span className="telemetry-val">{s.rightTrigger ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
