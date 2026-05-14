import { useState, useCallback } from 'react';
import { useBindingStore, Binding } from '../store/mappingStore';

const VK_NAMES: Record<number, string> = {
  8:'Backspace', 9:'Tab', 13:'Enter', 16:'Shift', 17:'Ctrl', 18:'Alt',
  20:'CapsLock', 27:'Esc', 32:'Space', 33:'PgUp', 34:'PgDn',
  37:'Left', 38:'Up', 39:'Right', 40:'Down',
  48:'0', 49:'1', 50:'2', 51:'3', 52:'4', 53:'5', 54:'6', 55:'7', 56:'8', 57:'9',
  65:'A', 66:'B', 67:'C', 68:'D', 69:'E', 70:'F', 71:'G', 72:'H',
  73:'I', 74:'J', 75:'K', 76:'L', 77:'M', 78:'N', 79:'O', 80:'P',
  81:'Q', 82:'R', 83:'S', 84:'T', 85:'U', 86:'V', 87:'W', 88:'X',
  89:'Y', 90:'Z',
  96:'Num0', 97:'Num1', 98:'Num2', 99:'Num3', 100:'Num4',
  101:'Num5', 102:'Num6', 103:'Num7', 104:'Num8', 105:'Num9',
  112:'F1', 113:'F2', 114:'F3', 115:'F4', 116:'F5', 117:'F6',
  118:'F7', 119:'F8', 120:'F9', 121:'F10', 122:'F11', 123:'F12',
  160:'LShift', 161:'RShift', 162:'LCtrl', 163:'RCtrl', 164:'LAlt', 165:'RAlt',
  186:';', 187:'=', 188:',', 189:'-', 190:'.', 191:'/', 192:'`',
  219:'[', 220:'\\', 221:']', 222:"'",
};

const vkName = (vk: number) => VK_NAMES[vk] ?? `VK ${vk}`;

const MOUSE_LABELS: Record<number, string> = {
  0: 'Left Click', 1: 'Right Click', 2: 'Middle Click', 3: 'Mouse 4', 4: 'Mouse 5',
  5: 'Wheel Up', 6: 'Wheel Down',
};

// Browser MouseEvent.button -> core button index
// Browser: 0=LMB, 1=MMB, 2=RMB, 3=X1, 4=X2
// Core:    0=LMB, 1=RMB, 2=MMB, 3=X1, 4=X2
const toCoreBtn = (b: number): number | null => {
  if (b === 0) return 0;  // LMB
  if (b === 1) return 2;  // MMB
  if (b === 2) return 1;  // RMB
  if (b === 3) return 3;  // Mouse 4
  if (b === 4) return 4;  // Mouse 5
  return null;
};

// Button definitions grouped by category
type BindingItem = {
  type: 'button';
  mask: number;
  label: string;
  color?: string;
} | {
  type: 'trigger';
  target: 'leftTrigger' | 'rightTrigger';
  label: string;
  color?: string;
};

interface BindingGroup {
  title: string;
  icon: string;
  items: BindingItem[];
}

const BINDING_GROUPS: BindingGroup[] = [
  {
    title: 'Face Buttons',
    icon: '*',
    items: [
      { type: 'button', mask: 0x1000, label: 'A', color: '#4ade80' },
      { type: 'button', mask: 0x2000, label: 'B', color: '#f87171' },
      { type: 'button', mask: 0x4000, label: 'X', color: '#60a5fa' },
      { type: 'button', mask: 0x8000, label: 'Y', color: '#facc15' },
    ],
  },
  {
    title: 'Bumpers & Triggers',
    icon: 'LT',
    items: [
      { type: 'button',  mask: 0x0100, label: 'LB', color: '#a78bfa' },
      { type: 'button',  mask: 0x0200, label: 'RB', color: '#a78bfa' },
      { type: 'trigger', target: 'leftTrigger',  label: 'LT', color: '#f97316' },
      { type: 'trigger', target: 'rightTrigger', label: 'RT', color: '#f97316' },
    ],
  },
  {
    title: 'D-Pad',
    icon: '+',
    items: [
      { type: 'button', mask: 0x0001, label: 'Up' },
      { type: 'button', mask: 0x0002, label: 'Down' },
      { type: 'button', mask: 0x0004, label: 'Left' },
      { type: 'button', mask: 0x0008, label: 'Right' },
    ],
  },
  {
    title: 'System',
    icon: 'O',
    items: [
      { type: 'button', mask: 0x0010, label: 'Start' },
      { type: 'button', mask: 0x0020, label: 'Back' },
      { type: 'button', mask: 0x0040, label: 'LS', color: '#94a3b8' },
      { type: 'button', mask: 0x0080, label: 'RS', color: '#94a3b8' },
    ],
  },
];

// Component

export function KeyMapper() {
  const {
    bindings, mouseBindings,
    setBinding, setMouseBinding,
    unbindByMask, unbindMouseByMask,
    unbindByTarget, unbindMouseByTarget,
  } = useBindingStore();
  const [listening, setListening] = useState<string | null>(null);
  const [mode, setMode] = useState<'keyboard' | 'mouse'>('keyboard');

  // Find bound keys/mouse inputs for a button item
  const findBounds = (item: BindingItem, source: Record<number, Binding>) => {
    if (item.type === 'button') {
      return Object.entries(source).filter(([, b]) => b.target === 'button' && b.mask === item.mask);
    } else {
      return Object.entries(source).filter(([, b]) => b.target === item.target);
    }
  };

  const getItemId = (item: BindingItem) =>
    item.type === 'button' ? `btn-${item.mask}` : `trg-${item.target}`;

  const startKeyListen = useCallback((item: BindingItem) => {
    const id = item.type === 'button' ? `btn-${item.mask}` : `trg-${item.target}`;
    setListening(id);
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      if (item.type === 'button') {
        setBinding(e.keyCode, { target: 'button', mask: item.mask });
      } else {
        setBinding(e.keyCode, { target: item.target, axisValue: 1.0 });
      }
      setListening(null);
      window.removeEventListener('keydown', h);
    };
    window.addEventListener('keydown', h);
  }, [setBinding]);

  const startMouseListen = useCallback((item: BindingItem) => {
    const id = item.type === 'button' ? `btn-${item.mask}` : `trg-${item.target}`;
    setListening(`m-${id}`);

    // Block context menu while listening (so RMB can be captured)
    const ctxBlock = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', ctxBlock, true);

    const finish = (btn: number) => {
      if (item.type === 'button') {
        setMouseBinding(btn, { target: 'button', mask: item.mask });
      } else {
        setMouseBinding(btn, { target: item.target, axisValue: 1.0 });
      }
      setListening(null);
      window.removeEventListener('mousedown', h, true);
      window.removeEventListener('wheel', wheelH, true);
      window.removeEventListener('contextmenu', ctxBlock, true);
    };

    const h = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = toCoreBtn(e.button);
      if (btn == null) return;
      finish(btn);
    };

    const wheelH = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      finish(e.deltaY < 0 ? 5 : 6);
    };

    window.addEventListener('mousedown', h, true);
    window.addEventListener('wheel', wheelH, true);
  }, [setMouseBinding]);

  const handleUnbind = (item: BindingItem) => {
    if (mode === 'keyboard') {
      if (item.type === 'button') unbindByMask(item.mask);
      else unbindByTarget(item.target);
    } else {
      if (item.type === 'button') unbindMouseByMask(item.mask);
      else unbindMouseByTarget(item.target);
    }
  };

  const source = mode === 'keyboard' ? bindings : mouseBindings;
  const isMouseMode = mode === 'mouse';

  return (
    <div className="card bindings-card">
      <div className="card-header">
        <span className="card-title">Input Mappings</span>
        <div className="bindings-mode-toggle">
          <button
            className={`mode-btn ${mode === 'keyboard' ? 'active' : ''}`}
            onClick={() => setMode('keyboard')}
          >
            <span className="mode-icon">KB</span> Keyboard
          </button>
          <button
            className={`mode-btn ${mode === 'mouse' ? 'active' : ''}`}
            onClick={() => setMode('mouse')}
          >
            <span className="mode-icon">M</span> Mouse
          </button>
        </div>
      </div>

      <div className="bindings-hint">
        {isMouseMode
          ? 'Click a slot then press any mouse button or scroll wheel to bind'
          : 'Click a slot then press any key to bind'
        }
      </div>

      <div className="binding-groups">
        {BINDING_GROUPS.map(group => (
          <div key={group.title} className="binding-group">
            <div className="binding-group-header">
              <span className="binding-group-icon">{group.icon}</span>
              <span className="binding-group-title">{group.title}</span>
            </div>
            <div className="binding-group-items">
              {group.items.map(item => {
                const id = getItemId(item);
                const listenId = isMouseMode ? `m-${id}` : id;
                const isLis = listening === listenId;
                const bounds = findBounds(item, source);
                const isBound = bounds.length > 0;

                let slotText = 'Not bound';
                if (isLis) {
                  slotText = isMouseMode ? 'Click mouse button or scroll wheel...' : 'Press a key...';
                } else if (isBound) {
                  const labels = bounds.map(([code]) => {
                    const k = Number(code);
                    return isMouseMode ? (MOUSE_LABELS[k] ?? `BTN${k}`) : vkName(k);
                  });
                  slotText = labels.length > 2
                    ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
                    : labels.join(', ');
                }

                const isTrigger = item.type === 'trigger';

                return (
                  <div key={id} className={`binding-item ${isTrigger ? 'binding-item--trigger' : ''}`}>
                    <div
                      className="binding-btn-label"
                      style={item.color ? { '--btn-color': item.color } as React.CSSProperties : undefined}
                    >
                      {item.label}
                    </div>
                    <div className="binding-arrow">
                      <svg width="16" height="10" viewBox="0 0 16 10">
                        <path d="M0 5h12m0 0l-3-3m3 3l-3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <button
                      className={`binding-slot ${isLis ? 'listening' : ''} ${isBound && !isLis ? 'bound' : ''}`}
                      onClick={() => isMouseMode ? startMouseListen(item) : startKeyListen(item)}
                    >
                      <span className="binding-slot-text">{slotText}</span>
                      {isBound && !isLis && <span className="binding-slot-indicator" />}
                    </button>
                    <button
                      className="binding-unbind"
                      disabled={!isBound}
                      onClick={() => handleUnbind(item)}
                      title="Remove binding"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14">
                        <path d="M3.5 3.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

