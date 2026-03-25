"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipc_bridge_1 = require("./ipc-bridge");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
let bridge;
let coreProcess = null;
function resolveCorePath() {
    if (electron_1.app.isPackaged) {
        return path.join(process.resourcesPath, 'core', 'rewsd_core.exe');
    }
    return path.resolve(__dirname, '../../core/build/Release/rewsd_core.exe');
}
function startCore() {
    if (coreProcess && !coreProcess.killed)
        return;
    const corePath = resolveCorePath();
    if (!fs.existsSync(corePath)) {
        // Keep UI alive even if core executable is missing.
        return;
    }
    coreProcess = (0, child_process_1.spawn)(corePath, [], {
        cwd: path.dirname(corePath),
        windowsHide: true,
        stdio: 'ignore'
    });
    coreProcess.on('exit', () => {
        coreProcess = null;
    });
}
function stopCore() {
    if (!coreProcess || coreProcess.killed)
        return;
    coreProcess.kill();
    coreProcess = null;
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1200, height: 800,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        }
    });
    if (process.env.VITE_DEV_URL) {
        win.loadURL(process.env.VITE_DEV_URL);
    }
    else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    win.webContents.on('did-fail-load', (_event, code, desc) => {
        win.loadURL(`data:text/html,<h2>InputBus UI load failed</h2><p>code=${code}</p><p>${encodeURIComponent(desc)}</p>`);
    });
    bridge = new ipc_bridge_1.CoreBridge();
    bridge.connect();
    bridge.on('connected', () => {
        win.webContents.send('core-message', {
            type: 100,
            payload: { connected: true }
        });
    });
    bridge.on('error', (err) => {
        // Core may be offline during UI startup; keep renderer alive and retry in bridge.
        win.webContents.send('core-message', {
            type: 200,
            payload: { connected: false, error: err.message }
        });
    });
    bridge.on('message', ({ type, payload }) => {
        win.webContents.send('core-message', { type, payload });
    });
    // Relay UI requests to core
    electron_1.ipcMain.handle('core-send', async (_, type, payload) => {
        bridge.send(type, payload);
        return { ok: true };
    });
    // Frameless window close button
    electron_1.ipcMain.on('close-window', () => win.close());
}
electron_1.app.whenReady().then(() => {
    startCore();
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    stopCore();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('before-quit', () => {
    stopCore();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
