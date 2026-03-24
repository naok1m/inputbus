import { useEffect } from 'react';
import { KeyMapper } from './components/KeyMapper';
import { SensitivityEditor } from './components/SensitivityEditor';
import { ProfileSelector } from './components/ProfileSelector';
import { GamepadPreview } from './components/GamepadPreview';
import { CaptureToggle } from './components/CaptureToggle';
import { useBindingStore } from './store/mappingStore';
import './styles.css';

export default function App() {
	const syncToCore = useBindingStore((s: ReturnType<typeof useBindingStore.getState>) => s.syncToCore);
	const setCoreConnected = useBindingStore((s: ReturnType<typeof useBindingStore.getState>) => s.setCoreConnected);
	const setCaptureEnabledFromCore = useBindingStore((s: ReturnType<typeof useBindingStore.getState>) => s.setCaptureEnabledFromCore);
	const requestStatus = useBindingStore((s: ReturnType<typeof useBindingStore.getState>) => s.requestStatus);

	useEffect(() => {
		syncToCore();
	}, [syncToCore]);

	useEffect(() => {
		if (!window.electronAPI?.onCoreMessage) return;

		const off = window.electronAPI.onCoreMessage((msg) => {
			if (msg.type !== 100 || typeof msg.payload !== 'object' || msg.payload === null) return;

			const payload = msg.payload as { connected?: boolean; captureEnabled?: boolean };

			if (typeof payload.connected === 'boolean') {
				setCoreConnected(payload.connected);
				if (payload.connected) {
					syncToCore();
					requestStatus();
				}
			}

			if (typeof payload.captureEnabled === 'boolean') {
				setCaptureEnabledFromCore(payload.captureEnabled);
			}
		});

		const timer = window.setInterval(() => {
			requestStatus();
		}, 1200);

		return () => {
			off?.();
			window.clearInterval(timer);
		};
	}, [requestStatus, setCaptureEnabledFromCore, setCoreConnected, syncToCore]);

	return (
		<main className="app-shell">
			<header className="hero">
				<h1>InputBus</h1>
				<p>reWASD alternativo e pessoal para mapear teclado e mouse em gamepad virtual.</p>
			</header>

			<section className="grid-layout">
				<CaptureToggle />
				<ProfileSelector />
				<GamepadPreview />
				<SensitivityEditor />
				<KeyMapper />
			</section>
		</main>
	);
}
