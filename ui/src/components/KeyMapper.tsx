import { useState, useCallback } from 'react';
import { useBindingStore } from '../store/mappingStore';

const BUTTON_LABELS: Record<number, string> = {
  4096: 'A', 8192: 'B', 16384: 'X', 32768: 'Y',
  256: 'LB', 512: 'RB', 1: 'DPad↑', 2: 'DPad↓', 4: 'DPad←', 8: 'DPad→',
};

const GAMEPAD_BUTTONS = Object.entries(BUTTON_LABELS).map(([mask, label]) => ({
  mask: Number(mask), label
}));

const MOUSE_LABELS: Record<number, string> = {
  2: 'MMB',
  3: 'X1',
  4: 'X2'
};

const toCoreMouseButton = (browserButton: number): number | null => {
  if (browserButton === 1) return 2; // middle
  if (browserButton === 3) return 3; // X1
  if (browserButton === 4) return 4; // X2
  return null;
};

export function KeyMapper() {
  const {
    bindings,
    mouseBindings,
    setBinding,
    setMouseBinding,
    unbindByMask,
    unbindMouseByMask
  } = useBindingStore();
  const [listening, setListening] = useState<string | null>(null);

  const startListen = useCallback((buttonMask: number) => {
    setListening(String(buttonMask));
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      setBinding(e.keyCode, { target: 'button', mask: buttonMask });
      setListening(null);
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('keydown', handler);
  }, [setBinding]);

  const startMouseListen = useCallback((buttonMask: number) => {
    setListening(`mouse-${buttonMask}`);

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const mouseButton = toCoreMouseButton(e.button);
      if (mouseButton == null) return;

      setMouseBinding(mouseButton, { target: 'button', mask: buttonMask });
      setListening(null);
      window.removeEventListener('mousedown', onMouseDown, true);
    };

    window.addEventListener('mousedown', onMouseDown, true);
  }, [setMouseBinding]);

  return (
    <div className="key-mapper">
      <h2>Bindings</h2>
      <h3>Keyboard</h3>
      <div className="binding-grid">
        {GAMEPAD_BUTTONS.map(({ mask, label }) => {
          const bound = Object.entries(bindings).find(([, b]) => b.mask === mask);
          const isListening = listening === String(mask);

          return (
            <div key={mask} className="binding-row">
              <div className="gamepad-btn">{label}</div>
              <div className="arrow">→</div>
              <div className="binding-actions">
                <button
                  className={`key-slot ${isListening ? 'listening' : ''}`}
                  onClick={() => startListen(mask)}
                >
                  {isListening
                    ? 'Press a key...'
                    : bound
                      ? `VK_${bound[0]}`
                      : 'Unbound'}
                </button>
                <button
                  type="button"
                  disabled={!bound}
                  onClick={() => unbindByMask(mask)}
                >
                  Desbindar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h3>Mouse (MMB / X1 / X2)</h3>
      <div className="binding-grid">
        {GAMEPAD_BUTTONS.map(({ mask, label }) => {
          const bound = Object.entries(mouseBindings).find(([, b]) => b.mask === mask);
          const isListening = listening === `mouse-${mask}`;

          return (
            <div key={`mouse-${mask}`} className="binding-row">
              <div className="gamepad-btn">{label}</div>
              <div className="arrow">→</div>
              <div className="binding-actions">
                <button
                  className={`key-slot ${isListening ? 'listening' : ''}`}
                  onClick={() => startMouseListen(mask)}
                >
                  {isListening
                    ? 'Press MMB/X1/X2...'
                    : bound
                      ? `MOUSE_${bound[0]} (${MOUSE_LABELS[Number(bound[0])] ?? 'BTN'})`
                      : 'Unbound'}
                </button>
                <button
                  type="button"
                  disabled={!bound}
                  onClick={() => unbindMouseByMask(mask)}
                >
                  Desbindar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}