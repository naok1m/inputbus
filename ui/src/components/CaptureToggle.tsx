import { useBindingStore } from '../store/mappingStore';

export function CaptureToggle() {
  const captureEnabled = useBindingStore((s) => s.captureEnabled);
  const coreConnected = useBindingStore((s) => s.coreConnected);
  const setCaptureEnabled = useBindingStore((s) => s.setCaptureEnabled);

  return (
    <section className="card capture-toggle">
      <h2>Modo de Captura</h2>
      <p>
        Estado atual: <strong>{captureEnabled ? 'ATIVO' : 'DESATIVADO'}</strong>
      </p>
      <p>
        Core: <strong>{coreConnected ? 'CONECTADO' : 'DESCONECTADO'}</strong>
      </p>
      <p>Atalho de emergencia no core: solte a tecla F12 para alternar.</p>
      <button
        type="button"
        disabled={!coreConnected}
        onClick={() => setCaptureEnabled(!captureEnabled)}
      >
        {captureEnabled ? 'Desativar Captura' : 'Ativar Captura'}
      </button>
    </section>
  );
}
