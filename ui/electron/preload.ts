import { contextBridge, ipcRenderer } from 'electron';

type CoreMessage = {
	type: number;
	payload: unknown;
};

type CoreMessageHandler = (msg: CoreMessage) => void;

contextBridge.exposeInMainWorld('electronAPI', {
	coreSend: (type: number, payload: unknown) => ipcRenderer.invoke('core-send', type, payload),
	onCoreMessage: (handler: CoreMessageHandler) => {
		const listener = (_event: Electron.IpcRendererEvent, msg: CoreMessage) => handler(msg);
		ipcRenderer.on('core-message', listener);
		return () => ipcRenderer.removeListener('core-message', listener);
	}
});
