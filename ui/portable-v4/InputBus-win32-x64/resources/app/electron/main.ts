import { app, BrowserWindow, ipcMain } from 'electron';
import { CoreBridge } from './ipc-bridge';
import * as path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as fs from 'fs';

let bridge: CoreBridge;
let coreProcess: ChildProcess | null = null;

function resolveCorePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'core', 'rewsd_core.exe');
  }

  return path.resolve(__dirname, '../../core/build/Release/rewsd_core.exe');
}

/** Kill any orphaned rewsd_core.exe left from a previous run. */
function killOrphanedCore() {
  try {
    execSync('taskkill /F /IM rewsd_core.exe', { stdio: 'ignore' });
    console.log('[Core] Killed orphaned rewsd_core.exe');
  } catch {
    // No process found — expected on clean start.
  }
}

function startCore() {
  if (coreProcess && !coreProcess.killed) return;

  const corePath = resolveCorePath();
  if (!fs.existsSync(corePath)) {
    // Keep UI alive even if core executable is missing.
    return;
  }

  killOrphanedCore();

  const coreDir = path.dirname(corePath);
  console.log(`[Core] Launching: ${corePath}`);
  console.log(`[Core] CWD: ${coreDir}`);

  coreProcess = spawn(corePath, [], {
    cwd: coreDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  coreProcess.stdout?.on('data', (d: Buffer) => console.log(`[Core] ${d.toString().trimEnd()}`));
  coreProcess.stderr?.on('data', (d: Buffer) => console.error(`[Core] ${d.toString().trimEnd()}`));

  coreProcess.on('exit', (code) => {
    console.log(`[Core] Exited with code ${code}`);
    coreProcess = null;
  });

  coreProcess.on('error', (err) => {
    console.error(`[Core] Spawn error: ${err.message}`);
    coreProcess = null;
  });
}

function stopCore() {
  if (!coreProcess || coreProcess.killed) return;
  coreProcess.kill();
  coreProcess = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });

  if (process.env.VITE_DEV_URL) {
    win.loadURL(process.env.VITE_DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.on('did-fail-load', (_event, code, desc) => {
    win.loadURL(`data:text/html,<h2>InputBus UI load failed</h2><p>code=${code}</p><p>${encodeURIComponent(desc)}</p>`);
  });

  bridge = new CoreBridge();
  bridge.connect();

  bridge.on('connected', () => {
    win.webContents.send('core-message', {
      type: 100,
      payload: { _bridge: true, connected: true }
    });
  });

  bridge.on('disconnected', () => {
    win.webContents.send('core-message', {
      type: 100,
      payload: { _bridge: true, connected: false }
    });
  });

  bridge.on('error', (_err: Error) => {
    // Errors are expected during startup while core pipe isn't ready.
    // Connection state is tracked via 'connected'/'disconnected' events only.
  });

  bridge.on('message', ({ type, payload }) => {
    win.webContents.send('core-message', { type, payload });
  });

  // Relay UI requests to core
  ipcMain.handle('core-send', async (_, type: number, payload: object) => {
    bridge.send(type, payload);
    return { ok: true };
  });

  // Frameless window controls
  ipcMain.on('minimize-window', () => win.minimize());
  ipcMain.on('close-window', () => win.close());
}

app.whenReady().then(() => {
  startCore();
  createWindow();
});

app.on('window-all-closed', () => {
  stopCore();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopCore();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});