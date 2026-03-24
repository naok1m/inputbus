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
exports.CoreBridge = void 0;
const events_1 = require("events");
const net_node = __importStar(require("net"));
const PIPE_PATH = '\\\\.\\pipe\\rewsd_core';
const MAGIC = 0x52455753;
class CoreBridge extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.socket = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.recvBuffer = Buffer.alloc(0);
    }
    connect() {
        if (this.socket)
            return;
        this.socket = net_node.createConnection(PIPE_PATH);
        this.socket.on('connect', () => {
            this.connected = true;
            this.emit('connected');
        });
        this.socket.on('data', (buf) => this.handleData(buf));
        this.socket.on('error', (e) => {
            this.emit('error', e);
        });
        this.socket.on('close', () => {
            this.connected = false;
            this.socket = null;
            this.recvBuffer = Buffer.alloc(0);
            this.scheduleReconnect();
        });
    }
    send(type, payload) {
        if (!this.connected || !this.socket)
            return;
        const json = JSON.stringify(payload);
        const buf = Buffer.alloc(12 + json.length);
        buf.writeUInt32LE(MAGIC, 0);
        buf.writeUInt32LE(type, 4);
        buf.writeUInt32LE(json.length, 8);
        Buffer.from(json).copy(buf, 12);
        this.socket?.write(buf);
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 1500);
    }
    handleData(buf) {
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
            }
            catch (err) {
                this.emit('error', err);
            }
        }
    }
}
exports.CoreBridge = CoreBridge;
