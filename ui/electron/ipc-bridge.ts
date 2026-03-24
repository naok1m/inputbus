import { EventEmitter } from 'events';
import * as net_node from 'net';

const PIPE_PATH = '\\\\.\\pipe\\rewsd_core';
const MAGIC = 0x52455753;

export class CoreBridge extends EventEmitter {
  private socket: net_node.Socket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private recvBuffer = Buffer.alloc(0);

  connect() {
    if (this.socket) return;

    this.socket = net_node.createConnection(PIPE_PATH);
    this.socket.on('connect', () => {
      this.connected = true;
      this.emit('connected');
    });
    this.socket.on('data', (buf: Buffer) => this.handleData(buf));
    this.socket.on('error', (e: Error) => {
      this.emit('error', e);
    });
    this.socket.on('close', () => {
      this.connected = false;
      this.socket = null;
      this.recvBuffer = Buffer.alloc(0);
      this.scheduleReconnect();
    });
  }

  send(type: number, payload: object) {
    if (!this.connected || !this.socket) return;

    const json = JSON.stringify(payload);
    const buf = Buffer.alloc(12 + json.length);
    buf.writeUInt32LE(MAGIC, 0);
    buf.writeUInt32LE(type, 4);
    buf.writeUInt32LE(json.length, 8);
    Buffer.from(json).copy(buf, 12);
    this.socket?.write(buf);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  private handleData(buf: Buffer) {
    this.recvBuffer = Buffer.concat([this.recvBuffer, buf]);

    while (this.recvBuffer.length >= 12) {
      const magic = this.recvBuffer.readUInt32LE(0);

      // Try to re-sync if stream is misaligned.
      if (magic !== MAGIC) {
        this.recvBuffer = this.recvBuffer.subarray(1);
        continue;
      }

      const type = this.recvBuffer.readUInt32LE(4);
      const len = this.recvBuffer.readUInt32LE(8);

      // Guard against corrupted length.
      if (len > 1024 * 1024) {
        this.emit('error', new Error(`Invalid IPC payload length: ${len}`));
        this.recvBuffer = Buffer.alloc(0);
        return;
      }

      const total = 12 + len;
      if (this.recvBuffer.length < total) {
        return;
      }

      const payloadRaw = this.recvBuffer.subarray(12, total).toString();
      this.recvBuffer = this.recvBuffer.subarray(total);

      try {
        const payload = JSON.parse(payloadRaw);
        this.emit('message', { type, payload });
      } catch (err) {
        this.emit('error', err as Error);
      }
    }
  }
}