import { useState, useMemo } from 'react';
import { useBindingStore, MacroDef, MacroCategory } from '../store/mappingStore';

const BUTTON_OPTIONS = [
  { label: 'RB', value: 0x0200 },
  { label: 'LB', value: 0x0100 },
  { label: 'A',  value: 0x1000 },
  { label: 'B',  value: 0x2000 },
  { label: 'X',  value: 0x4000 },
  { label: 'Y',  value: 0x8000 },
  { label: 'D-Up',    value: 0x0001 },
  { label: 'D-Down',  value: 0x0002 },
  { label: 'D-Left',  value: 0x0004 },
  { label: 'D-Right', value: 0x0008 },
];

const VK_KEY_OPTIONS = [
  { label: 'F', value: 0x46 },
  { label: 'G', value: 0x47 },
  { label: 'H', value: 0x48 },
  { label: 'X', value: 0x58 },
  { label: 'Z', value: 0x5A },
  { label: 'V', value: 0x56 },
  { label: 'C', value: 0x43 },
  { label: 'Q', value: 0x51 },
  { label: 'E', value: 0x45 },
  { label: 'R', value: 0x52 },
  { label: '1', value: 0x31 },
  { label: '2', value: 0x32 },
  { label: '3', value: 0x33 },
  { label: '4', value: 0x34 },
  { label: '5', value: 0x35 },
  { label: 'Mouse4', value: 0x05 },
  { label: 'Mouse5', value: 0x06 },
  { label: 'CapsLock', value: 0x14 },
];

const CATEGORY_LABELS: Record<MacroCategory, string> = {
  combat: 'Combat',
  movement: 'Movement',
  automation: 'Automation',
};

const CATEGORY_ORDER: MacroCategory[] = ['combat', 'movement', 'automation'];

// ── Toggle Switch ──
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div className={`toggle ${on ? 'toggle--on' : ''}`} onClick={onChange}>
      <div className="toggle-thumb" />
    </div>
  );
}

// ── Macro Card ──
function MacroCard({ macro, onToggle, onConfigure }: {
  macro: MacroDef;
  onToggle: () => void;
  onConfigure: () => void;
}) {
  return (
    <div className={`macro-card ${macro.enabled ? 'macro-card--on' : ''}`}>
      <div className="macro-card-top">
        <span className="macro-card-icon">{macro.icon}</span>
        <span className="macro-card-name">{macro.name}</span>
        {macro.isPro && <span className="macro-card-pro">PRO</span>}
      </div>

      <div className="macro-card-desc">{macro.description}</div>

      {/* Status bar */}
      <div className="macro-card-status">
        {macro.enabled && <div className="macro-card-status-fill" />}
      </div>

      <div className="macro-card-bottom">
        <button className="macro-card-gear" onClick={onConfigure} title="Configure">
          {'\u2699'}
        </button>
        <div className="macro-card-toggle">
          <Toggle on={macro.enabled} onChange={onToggle} />
        </div>
      </div>
    </div>
  );
}

// ── Config Panel ──
function MacroConfigPanel({ macro, onClose }: { macro: MacroDef; onClose: () => void }) {
  const updateMacroConfig = useBindingStore(s => s.updateMacroConfig);
  const toggleMacro = useBindingStore(s => s.toggleMacro);
  const config = macro.config as Record<string, unknown>;

  const isAutoPing = macro.id === 'auto-ping';
  const isRapidFire = macro.id === 'rapid-fire';
  const isNoRecoil = macro.id === 'no-recoil';
  const isSensBoost = macro.id === 'sens-boost';
  const isDriftAim = macro.id === 'drift-aim';
  const isYYSwap = macro.id === 'yy-swap';
  const isScrollSwap = macro.id === 'scroll-swap';
  const isTabScore = macro.id === 'tab-score';
  const isAutoAds = macro.id === 'auto-ads';
  const isAutoSprint = macro.id === 'auto-sprint';
  const isBunnyHop = macro.id === 'bunny-hop';
  const isAutoLoot = macro.id === 'auto-loot';

  return (
    <>
      <div className="macro-panel-overlay" onClick={onClose} />
      <div className="macro-panel">
        <div className="macro-panel-header">
          <span style={{ fontSize: 18 }}>{macro.icon}</span>
          <span className="macro-panel-title">{macro.name}</span>
          {macro.isPro && <span className="pro-badge">PRO</span>}
          <button className="macro-panel-close" onClick={onClose}>{'\u2715'}</button>
        </div>

        <div className="macro-panel-body">
          {/* Pro gate */}
          {macro.isPro && (
            <div className="pro-gate">
              <div className="pro-gate-text">
                <strong>PRO Feature</strong> - This macro will be available with a PRO license.
                You can still configure it below.
              </div>
            </div>
          )}

          {/* Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>Enabled</span>
            <Toggle on={macro.enabled} onChange={() => toggleMacro(macro.id)} />
          </div>

          {/* Auto-Ping config */}
          {isAutoPing && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Ping Button</span>
                <select
                  value={Number(config.button ?? 0x0001)}
                  onChange={e => updateMacroConfig(macro.id, { button: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {BUTTON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Interval</span>
                <input
                  type="range" min={500} max={10000} step={100}
                  value={Number(config.intervalMs ?? 3000)}
                  onChange={e => updateMacroConfig(macro.id, { intervalMs: Number(e.target.value) })}
                />
                <span className="slider-value">{((Number(config.intervalMs ?? 3000)) / 1000).toFixed(1)}s</span>
              </div>
              <div className="slider-row">
                <span className="slider-label">Press Time</span>
                <input
                  type="range" min={30} max={300} step={10}
                  value={Number(config.durationMs ?? 80)}
                  onChange={e => updateMacroConfig(macro.id, { durationMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.durationMs ?? 80)}ms</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                While aiming (RMB held), presses the ping button on interval to trigger aim assist.
              </p>
            </div>
          )}

          {/* Rapid Fire config */}
          {isRapidFire && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Button</span>
                <select
                  value={Number(config.button ?? 0x0200)}
                  onChange={e => updateMacroConfig(macro.id, { button: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {BUTTON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Fire Rate</span>
                <input
                  type="range" min={20} max={200} step={5}
                  value={Number(config.intervalMs ?? 50)}
                  onChange={e => updateMacroConfig(macro.id, { intervalMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.intervalMs ?? 50)}ms</span>
              </div>
              <div className="slider-row">
                <span className="slider-label">Press Time</span>
                <input
                  type="range" min={10} max={100} step={5}
                  value={Number(config.durationMs ?? 30)}
                  onChange={e => updateMacroConfig(macro.id, { durationMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.durationMs ?? 30)}ms</span>
              </div>
            </div>
          )}

          {/* No Recoil config */}
          {isNoRecoil && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="slider-row">
                <span className="slider-label">Strength</span>
                <input
                  type="range" min={0.5} max={10} step={0.1}
                  value={Number(config.strength ?? 3.5)}
                  onChange={e => updateMacroConfig(macro.id, { strength: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.strength ?? 3.5).toFixed(1)}</span>
              </div>
              <div className="macro-row">
                <span className="slider-label">Pattern</span>
                <select
                  value={String(config.pattern ?? 'pull-down')}
                  onChange={e => updateMacroConfig(macro.id, { pattern: e.target.value })}
                  style={{ flex: 1 }}
                >
                  <option value="pull-down">Pull Down</option>
                  <option value="s-pattern">S-Pattern</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="macro-row">
                <span className="slider-label">Activation</span>
                <select
                  value={String(config.activation ?? 'hold')}
                  onChange={e => updateMacroConfig(macro.id, { activation: e.target.value })}
                  style={{ flex: 1 }}
                >
                  <option value="hold">Hold</option>
                  <option value="toggle">Toggle</option>
                  <option value="always">Always On</option>
                </select>
              </div>
            </div>
          )}

          {/* Sensitivity Boost (PQD) config */}
          {isSensBoost && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Activation Key</span>
                <select
                  value={Number(config.key ?? 0x58)}
                  onChange={e => updateMacroConfig(macro.id, { key: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {VK_KEY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Multiplier</span>
                <input
                  type="range" min={1.2} max={5.0} step={0.1}
                  value={Number(config.multiplier ?? 2.0)}
                  onChange={e => updateMacroConfig(macro.id, { multiplier: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.multiplier ?? 2.0).toFixed(1)}x</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Hold the key to boost mouse sensitivity while parachuting.
              </p>
            </div>
          )}

          {/* Drift Aim config */}
          {isDriftAim && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="slider-row">
                <span className="slider-label">Amplitude</span>
                <input
                  type="range" min={500} max={8000} step={250}
                  value={Number(config.amplitude ?? 3000)}
                  onChange={e => updateMacroConfig(macro.id, { amplitude: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.amplitude ?? 3000)}</span>
              </div>
              <div className="slider-row">
                <span className="slider-label">Speed</span>
                <input
                  type="range" min={15} max={100} step={1}
                  value={Number(config.intervalMs ?? 33)}
                  onChange={e => updateMacroConfig(macro.id, { intervalMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.intervalMs ?? 33)}ms</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Oscillates left stick to trigger aim assist. Lower speed = faster oscillation.
              </p>
            </div>
          )}

          {/* YY Weapon Swap config */}
          {isYYSwap && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Hotkey</span>
                <select
                  value={Number(config.key ?? 0x46)}
                  onChange={e => updateMacroConfig(macro.id, { key: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {VK_KEY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Delay</span>
                <input
                  type="range" min={30} max={200} step={5}
                  value={Number(config.delayMs ?? 80)}
                  onChange={e => updateMacroConfig(macro.id, { delayMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.delayMs ?? 80)}ms</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Press hotkey to double-tap Y (weapon swap cancel).
              </p>
            </div>
          )}

          {/* Scroll Weapon Swap config */}
          {isScrollSwap && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Swap Button</span>
                <select
                  value={Number(config.button ?? 0x8000)}
                  onChange={e => updateMacroConfig(macro.id, { button: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {BUTTON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Press Time</span>
                <input
                  type="range" min={20} max={120} step={5}
                  value={Number(config.durationMs ?? 45)}
                  onChange={e => updateMacroConfig(macro.id, { durationMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.durationMs ?? 45)}ms</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Scroll up or down to tap the selected controller button once.
              </p>
            </div>
          )}

          {/* Tab Scoreboard config */}
          {isTabScore && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                When enabled, holding Tab will press the Back/Select button to show the scoreboard.
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                No additional configuration needed. Toggle on/off above.
              </p>
            </div>
          )}

          {/* Auto-ADS config */}
          {isAutoAds && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Right-click toggles aim-down-sights (LT). Click once to ADS, click again to release.
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                No additional configuration needed. Toggle on/off above.
              </p>
            </div>
          )}

          {/* Auto-Sprint config */}
          {isAutoSprint && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Automatically presses Left Stick (sprint) when the left stick is pushed forward.
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                No additional configuration needed. Toggle on/off above.
              </p>
            </div>
          )}

          {/* Bunny Hop config */}
          {isBunnyHop && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Jump Button</span>
                <select
                  value={Number(config.button ?? 0x1000)}
                  onChange={e => updateMacroConfig(macro.id, { button: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {BUTTON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Interval</span>
                <input
                  type="range" min={100} max={1000} step={25}
                  value={Number(config.intervalMs ?? 400)}
                  onChange={e => updateMacroConfig(macro.id, { intervalMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.intervalMs ?? 400)}ms</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Hold Space to loop jump presses. Adjust interval for timing.
              </p>
            </div>
          )}

          {/* Auto-Loot config */}
          {isAutoLoot && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              <div className="macro-row">
                <span className="slider-label">Button</span>
                <select
                  value={Number(config.button ?? 0x4000)}
                  onChange={e => updateMacroConfig(macro.id, { button: Number(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  {BUTTON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="slider-row">
                <span className="slider-label">Interval</span>
                <input
                  type="range" min={30} max={500} step={10}
                  value={Number(config.intervalMs ?? 100)}
                  onChange={e => updateMacroConfig(macro.id, { intervalMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.intervalMs ?? 100)}ms</span>
              </div>
              <div className="slider-row">
                <span className="slider-label">Press Time</span>
                <input
                  type="range" min={10} max={100} step={5}
                  value={Number(config.durationMs ?? 30)}
                  onChange={e => updateMacroConfig(macro.id, { durationMs: Number(e.target.value) })}
                />
                <span className="slider-value">{Number(config.durationMs ?? 30)}ms</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Hold Middle Mouse to spam interaction presses for rapid looting.
              </p>
            </div>
          )}

          {/* Generic config for other macros */}
          {!isAutoPing && !isRapidFire && !isNoRecoil && !isSensBoost && !isDriftAim && !isYYSwap && !isScrollSwap && !isTabScore && !isAutoAds && !isAutoSprint && !isBunnyHop && !isAutoLoot && (
            <div>
              <div className="macro-panel-section-title">Configuration</div>
              {config.intervalMs != null && (
                <div className="slider-row">
                  <span className="slider-label">Interval</span>
                  <input
                    type="range" min={50} max={5000} step={50}
                    value={Number(config.intervalMs)}
                    onChange={e => updateMacroConfig(macro.id, { intervalMs: Number(e.target.value) })}
                  />
                  <span className="slider-value">{Number(config.intervalMs)}ms</span>
                </div>
              )}
              {config.holdMs != null && (
                <div className="slider-row">
                  <span className="slider-label">Hold Time</span>
                  <input
                    type="range" min={50} max={2000} step={50}
                    value={Number(config.holdMs)}
                    onChange={e => updateMacroConfig(macro.id, { holdMs: Number(e.target.value) })}
                  />
                  <span className="slider-value">{Number(config.holdMs)}ms</span>
                </div>
              )}
              {config.button != null && (
                <div className="macro-row">
                  <span className="slider-label">Button</span>
                  <select
                    value={Number(config.button)}
                    onChange={e => updateMacroConfig(macro.id, { button: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  >
                    {BUTTON_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {config.activation != null && (
                <div className="macro-row">
                  <span className="slider-label">Activation</span>
                  <select
                    value={String(config.activation)}
                    onChange={e => updateMacroConfig(macro.id, { activation: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    <option value="hold">Hold</option>
                    <option value="toggle">Toggle</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {macro.description}
          </p>
        </div>

        <div className="macro-panel-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}

// ── Macro Grid (main export) ──
export function MacroGrid() {
  const macros = useBindingStore(s => s.macros);
  const toggleMacro = useBindingStore(s => s.toggleMacro);
  const [search, setSearch] = useState('');
  const [configId, setConfigId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!search.trim()) return macros;
    const q = search.toLowerCase();
    return macros.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.includes(q)
    );
  }, [macros, search]);

  const grouped = useMemo(() => {
    const map: Record<MacroCategory, MacroDef[]> = { combat: [], movement: [], automation: [] };
    for (const m of filtered) {
      map[m.category].push(m);
    }
    return map;
  }, [filtered]);

  const configMacro = configId ? macros.find(m => m.id === configId) : null;

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div>
      {/* Header */}
      <div className="macros-header">
        <h2 className="macros-title">Macros</h2>
        <div className="macros-actions">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {macros.filter(m => m.enabled).length} active
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="macro-search">
        <span className="macro-search-icon">{'\u{1F50D}'}</span>
        <input
          type="text"
          placeholder="Search macros..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category lanes */}
      {CATEGORY_ORDER.map(cat => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        const isCollapsed = collapsed[cat];
        const activeCount = items.filter(m => m.enabled).length;

        return (
          <div key={cat} className="macro-category">
            <div className="macro-category-header" onClick={() => toggleCollapse(cat)}>
              <span className="macro-category-label">{CATEGORY_LABELS[cat]}</span>
              <span className="macro-category-line" />
              <span className="macro-category-count">
                {items.length} macro{items.length > 1 ? 's' : ''}{activeCount > 0 ? ` \u00B7 ${activeCount} active` : ''}
              </span>
              <span className={`macro-category-chevron ${isCollapsed ? 'collapsed' : ''}`}>{'\u25BC'}</span>
            </div>

            {!isCollapsed && (
              <div className="macro-grid">
                {items.map(macro => (
                  <MacroCard
                    key={macro.id}
                    macro={macro}
                    onToggle={() => toggleMacro(macro.id)}
                    onConfigure={() => setConfigId(macro.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Config side panel */}
      {configMacro && (
        <MacroConfigPanel macro={configMacro} onClose={() => setConfigId(null)} />
      )}
    </div>
  );
}

// Keep old export name for backwards compat
export { MacroGrid as MacroPanel };
