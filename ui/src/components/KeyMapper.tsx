import { useState, useCallback } from 'react';
import { useBindingStore } from '../store/mappingStore';

const VK_NAMES: Record<number, string> = {
  8:'Backspace', 9:'Tab', 13:'Enter', 16:'Shift', 17:'Ctrl', 18:'Alt',
  27:'Esc', 32:'Space', 37:'←', 38:'↑', 39:'→', 40:'↓',
  65:'A', 66:'B', 67:'C', 68:'D', 69:'E', 70:'F', 71:'G', 72:'H',
  73:'I', 74:'J', 75:'K', 76:'L', 77:'M', 78:'N', 79:'O', 80:'P',
  81:'Q', 82:'R', 83:'S', 84:'T', 85:'U', 86:'V', 87:'W', 88:'X',
  89:'Y', 90:'Z',
  112:'F1', 113:'F2', 114:'F3', 115:'F4', 116:'F5', 117:'F6',
  118:'F7', 119:'F8', 120:'F9', 121:'F10', 122:'F11', 123:'F12',
};

const vkName = (vk: number) => VK_NAMES[vk] ?? `VK ${vk}`;

const MOUSE_LABELS: Record<number, string> = { 2:'MMB', 3:'X1', 4:'X2' };

const toCoreBtn = (b: number): number | null => {
  if (b === 1) return 2;
  if (b === 3) return 3;
  if (b === 4) return 4;
  return null;
};

const GAMEPAD_BUTTONS = [
  { mask: 4096,  label: 'A'      },
  { mask: 8192,  label: 'B'      },
  { mask: 16384, label: 'X'      },
  { mask: 32768, label: 'Y'      },
  { mask: 256,   label: 'LB'     },
  { mask: 512,   label: 'RB'     },
  { mask: 1,     label: '↑'      },
  { mask: 2,     label: '↓'      },
  { mask: 4,     label: '←'      },
  { mask: 8,     label: '→'      },
  { mask: 16,    label: 'Start'  },
  { mask: 32,    label: 'Back'   },
];

export function KeyMapper() {
  const { bindings, mouseBindings, setBinding, setMouseBinding, unbindByMask, unbindMouseByMask } = useBindingStore();
  const [listening, setListening] = useState<string | null>(null);

  const startKeyListen = useCallback((mask: number) => {
    setListening(String(mask));
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      setBinding(e.keyCode, { target: 'button', mask });
      setListening(null);
      window.removeEventListener('keydown', h);
    };
    window.addEventListener('keydown', h);
  }, [setBinding]);

  const startMouseListen = useCallback((mask: number) => {
    setListening(`m-${mask}`);
    const h = (e: MouseEvent) => {
      e.preventDefault();
      const btn = toCoreBtn(e.button);
      if (btn == null) return;
      setMouseBinding(btn, { target: 'button', mask });
      setListening(null);
      window.removeEventListener('mousedown', h, true);
    };
    window.addEventListener('mousedown', h, true);
  }, [setMouseBinding]);

  const renderRows = (
    source: Record<number, { mask?: number }>,
    isMouseMode: boolean
  ) => GAMEPAD_BUTTONS.map(({ mask, label }) => {
    const bound = Object.entries(source).find(([, b]) => b.mask === mask);
    const id    = isMouseMode ? `m-${mask}` : String(mask);
    const isLis = listening === id;

    let slotText = 'Unbound';
    if (isLis) {
      slotText = isMouseMode ? 'Press MMB / X1 / X2…' : 'Press a key…';
    } else if (bound) {
      const k = Number(bound[0]);
      slotText = isMouseMode
        ? (MOUSE_LABELS[k] ?? `BTN${k}`)
        : vkName(k);
    }

    return (
      <div key={mask} className="binding-row">
        <div className="gamepad-btn">{label}</div>
        <div className="arrow">→</div>
        <button
          className={`key-slot ${isLis ? 'listening' : ''} ${bound && !isLis ? 'bound' : ''}`}
          onClick={() => isMouseMode ? startMouseListen(mask) : startKeyListen(mask)}
        >
          {slotText}
        </button>
        <button
          className="unbind-btn"
          disabled={!bound}
          onClick={() => isMouseMode ? unbindMouseByMask(mask) : unbindByMask(mask)}
          title="Unbind"
        >✕</button>
      </div>
    );
  });

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Keyboard Bindings</span>
        </div>
        <div className="section-label">Gamepad button → keyboard key</div>
        <div className="binding-grid">
          {renderRows(bindings, false)}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Mouse Button Bindings</span>
        </div>
        <div className="section-label">Gamepad button → mouse button (MMB / X1 / X2)</div>
        <div className="binding-grid">
          {renderRows(mouseBindings, true)}
        </div>
      </div>
    </>
  );
}
