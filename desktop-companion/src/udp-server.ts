import dgram from 'dgram';
import { ControllerPacket } from './types';
import { InputEmulator } from './input-emulator';

export class UdpServer {
  private socket: dgram.Socket;
  private port: number;
  private emulator: InputEmulator;
  private onPacketCallback?: (packet: ControllerPacket, rinfo: dgram.RemoteInfo) => void;

  constructor(port: number, emulator: InputEmulator) {
    this.port = port;
    this.emulator = emulator;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('error', (err) => {
      console.error(`UDP Server error:\n${err.stack}`);
      this.socket.close();
    });

    this.socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      try {
        let packet: ControllerPacket;

        // Fast Binary Packet Protocol (Magic 0x5647 'VG')
        // Length: 20 bytes minimum
        if (msg.length >= 20 && msg[0] === 0x56 && msg[1] === 0x47) {
          const seq = msg.readUInt32LE(2);
          const timestamp = Number(msg.readBigInt64LE(6));
          const steer = msg.readInt16LE(14) / 1000.0;
          const throttle = msg.readInt16LE(16) / 1000.0;
          const brake = msg.readInt16LE(18) / 1000.0;

          let buttonsDown: string[] = [];
          let buttonsUp: string[] = [];

          if (msg.length > 20) {
            try {
              const extraStr = msg.toString('utf8', 20);
              const extra = JSON.parse(extraStr);
              if (Array.isArray(extra.d)) buttonsDown = extra.d;
              if (Array.isArray(extra.u)) buttonsUp = extra.u;
            } catch (_) {}
          }

          packet = {
            seq,
            timestamp,
            clientId: `${rinfo.address}:${rinfo.port}`,
            steer,
            throttle,
            brake,
            buttonsDown,
            buttonsUp
          };
        } else {
          // Backward-compatible JSON parsing
          packet = JSON.parse(msg.toString('utf8'));
        }

        // Direct low-latency dispatch to emulator
        if (typeof packet.steer === 'number') {
          this.emulator.updateAxes(packet.steer, packet.throttle || 0, packet.brake || 0);
        }

        if (Array.isArray(packet.buttonsDown)) {
          for (let i = 0; i < packet.buttonsDown.length; i++) {
            this.emulator.handleButtonDown(packet.buttonsDown[i]);
          }
        }

        if (Array.isArray(packet.buttonsUp)) {
          for (let i = 0; i < packet.buttonsUp.length; i++) {
            this.emulator.handleButtonUp(packet.buttonsUp[i]);
          }
        }

        if (this.onPacketCallback) {
          this.onPacketCallback(packet, rinfo);
        }
      } catch (e) {
        // Drop malformed packets safely
      }
    });

    this.socket.on('listening', () => {
      const address = this.socket.address();
      console.log(`[UDP] Server listening on ${address.address}:${address.port}`);
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.bind(this.port, () => {
        resolve();
      });
    });
  }

  public onPacket(callback: (packet: ControllerPacket, rinfo: dgram.RemoteInfo) => void) {
    this.onPacketCallback = callback;
  }

  public stop() {
    try {
      this.socket.close();
    } catch (_) {}
  }
}
