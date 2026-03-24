"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    coreSend: (type, payload) => electron_1.ipcRenderer.invoke('core-send', type, payload),
    onCoreMessage: (handler) => {
        const listener = (_event, msg) => handler(msg);
        electron_1.ipcRenderer.on('core-message', listener);
        return () => electron_1.ipcRenderer.removeListener('core-message', listener);
    }
});
