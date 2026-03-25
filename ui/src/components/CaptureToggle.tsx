import { useBindingStore } from '../store/mappingStore';

export function CaptureToggle() {
  const captureEnabled  = useBindingStore(s => s.captureEnabled);
  const coreConnected   = useBindingStore(s => s.coreConnected);
  const setCaptureEnabled = useBindingStore(s => s.setCaptureEnabled);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Capture</span>
        <span className={`card-badge ${captureEnabled ? 'active' : ''}`}>
          {captureEnabled ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className={`capture-status ${captureEnabled ? 'on' : 'off'}`}>
        {captureEnabled ? 'CAPTURING' : 'IDLE'}
      </div>
      <div className="capture-hint">
        {coreConnected
          ? 'F12 toggles capture anytime'
          : 'Waiting for core process…'}
      </div>

      <button
        className={`btn ${captureEnabled ? 'btn-danger' : 'btn-primary'}`}
        disabled={!coreConnected}
        onClick={() => setCaptureEnabled(!captureEnabled)}
      >
        {captureEnabled ? 'Stop Capture' : 'Start Capture'}
      </button>
    </div>
  );
}
