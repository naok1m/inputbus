/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI?: {
      coreSend: (type: number, payload: unknown) => Promise<{ ok: boolean }>;
      onCoreMessage?: (handler: (msg: { type: number; payload: unknown }) => void) => () => void;
      minimizeWindow?: () => void;
      closeWindow?: () => void;
    };
  }
}

export {};
