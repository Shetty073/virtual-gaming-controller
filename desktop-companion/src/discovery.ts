import dgram from 'dgram';
import os from 'os';

export class DiscoveryBeacon {
  private socket: dgram.Socket;
  private timer: NodeJS.Timeout | null = null;
  private udpPort: number;
  private wsPort: number;
  private serverName: string;

  constructor(udpPort: number, wsPort: number) {
    this.udpPort = udpPort;
    this.wsPort = wsPort;
    this.serverName = os.hostname();
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start(broadcastIntervalMs: number = 1000) {
    this.socket.bind(0, () => {
      this.socket.setBroadcast(true);
      console.log('[Beacon] Discovery broadcaster initialized.');
      
      this.timer = setInterval(() => {
        this.broadcast();
      }, broadcastIntervalMs);
      this.broadcast();
    });
  }

  public getLocalIps(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      if (iface) {
        for (const alias of iface) {
          if (alias.family === 'IPv4' && !alias.internal) {
            ips.push(alias.address);
          }
        }
      }
    }
    return ips;
  }

  private broadcast() {
    const ips = this.getLocalIps();
    const message = JSON.stringify({
      service: 'VirtualGamingController',
      version: '1.0.0',
      hostname: this.serverName,
      udpPort: this.udpPort,
      wsPort: this.wsPort,
      ips: ips,
      timestamp: Date.now()
    });

    const payload = Buffer.from(message);

    // Broadcast to 255.255.255.255 on port 45456 (Mobile Discovery Listen Port)
    this.socket.send(payload, 0, payload.length, 45456, '255.255.255.255', (err) => {
      if (err && (err as any).code !== 'EACCES') {
        // Ignore expected ephemeral network broadcast warnings
      }
    });
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.socket.close();
    } catch (_) {}
  }
}
