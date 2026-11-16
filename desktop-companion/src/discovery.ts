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
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
    }
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (err: any) => {
      console.warn(`[Beacon] Broadcaster warning: ${err.message || err}`);
    });

    this.socket.bind(0, () => {
      try {
        this.socket.setBroadcast(true);
      } catch (_) {}
      console.log('[Beacon] Discovery broadcaster initialized.');
      
      if (this.timer) {
        clearInterval(this.timer);
      }
      this.timer = setInterval(() => {
        this.broadcast();
      }, broadcastIntervalMs);
      this.broadcast();
    });
  }

  public getLocalIps(): string[] {
    const interfaces = os.networkInterfaces();
    const candidateIps: { ip: string; dev: string; priority: number; netmask: string }[] = [];

    for (const devName in interfaces) {
      const lowerDev = devName.toLowerCase();
      const isVirtual = lowerDev.includes('vethernet') ||
                        lowerDev.includes('virtual') ||
                        lowerDev.includes('vmware') ||
                        lowerDev.includes('wsl') ||
                        lowerDev.includes('hyper-v') ||
                        lowerDev.includes('docker') ||
                        lowerDev.includes('loopback') ||
                        lowerDev.includes('tailscale') ||
                        lowerDev.includes('zerotier');

      const iface = interfaces[devName];
      if (iface) {
        for (const alias of iface) {
          if (alias.family === 'IPv4' && !alias.internal) {
            const ip = alias.address;
            let priority = 10;

            // Prioritize standard home/office LAN subnets (192.168.x.x, 10.x.x.x)
            if (ip.startsWith('192.168.')) priority += 60;
            else if (ip.startsWith('10.')) priority += 40;

            // Heavily deprioritize virtual adapters (e.g. Hyper-V vEthernet 172.x)
            if (isVirtual) priority -= 150;
            if (ip.startsWith('172.') && isVirtual) priority -= 100;
            if (ip.startsWith('169.254.')) priority -= 250;

            candidateIps.push({ ip, dev: devName, priority, netmask: alias.netmask || '255.255.255.0' });
          }
        }
      }
    }

    // Sort descending by priority so the physical Wi-Fi/Ethernet IP is always first
    candidateIps.sort((a, b) => b.priority - a.priority);
    return candidateIps.map(c => c.ip);
  }

  private getSubnetBroadcastAddresses(): string[] {
    const interfaces = os.networkInterfaces();
    const broadcastAddresses = new Set<string>(['255.255.255.255']);

    for (const devName in interfaces) {
      const iface = interfaces[devName];
      if (iface) {
        for (const alias of iface) {
          if (alias.family === 'IPv4' && !alias.internal && alias.netmask) {
            try {
              const ipParts = alias.address.split('.').map(Number);
              const maskParts = alias.netmask.split('.').map(Number);
              if (ipParts.length === 4 && maskParts.length === 4) {
                const bcast = ipParts.map((part, i) => (part | (~maskParts[i] & 255))).join('.');
                broadcastAddresses.add(bcast);
              }
            } catch (_) {}
          }
        }
      }
    }

    return Array.from(broadcastAddresses);
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
    const targets = this.getSubnetBroadcastAddresses();

    for (const bcastTarget of targets) {
      try {
        this.socket?.send(payload, 0, payload.length, 45456, bcastTarget, (err) => {
          if (err && (err as any).code !== 'EACCES') {
            // Ignore expected ephemeral network broadcast warnings
          }
        });
      } catch (_) {}
    }
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
