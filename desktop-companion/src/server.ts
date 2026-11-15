import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { UdpServer } from './udp-server';
import { DiscoveryBeacon } from './discovery';
import { InputEmulator } from './input-emulator';
import { ControllerPacket, KeyMappingProfile, TelemetryState } from './types';

export class CompanionServer {
  public udpPort: number = 45455;
  public httpPort: number = 45450;
  public isUdpRunning: boolean = false;

  private app: express.Express;
  private server: http.Server;
  private wss: WebSocketServer;
  private emulator: InputEmulator;
  private udpServer: UdpServer;
  private beacon: DiscoveryBeacon;
  private activeProfile: KeyMappingProfile;

  private clientSessions = new Map<string, {
    id: string;
    ip: string;
    port: number;
    lastPing: number;
    latencyMs: number;
    packetCount: number;
  }>();

  private currentInputs = {
    steer: 0,
    throttle: 0,
    brake: 0,
    activeButtons: [] as string[]
  };

  private cleanupInterval: NodeJS.Timeout | null = null;

  private getProfilesDirectory(): string {
    const candidates = [
      (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'default-profiles') : '',
      path.resolve(__dirname, 'default-profiles'),
      path.resolve(__dirname, '../default-profiles'),
      path.resolve(__dirname, '../../shared/default-profiles'),
      path.resolve(process.cwd(), 'shared/default-profiles'),
      path.resolve(process.cwd(), '../shared/default-profiles')
    ];

    for (const dir of candidates) {
      if (dir && fs.existsSync(dir)) {
        return dir;
      }
    }
    return path.resolve(__dirname, '../../shared/default-profiles');
  }

  constructor() {
    // Load initial profile
    const profilesDir = this.getProfilesDirectory();
    const ets2ProfilePath = path.join(profilesDir, 'ets2.json');
    try {
      this.activeProfile = JSON.parse(fs.readFileSync(ets2ProfilePath, 'utf8'));
    } catch (e) {
      this.activeProfile = {
        id: 'ets2-default',
        name: 'Euro Truck Simulator 2',
        description: 'Fallback default',
        steering: { leftKey: 'A', rightKey: 'D', sensitivity: 1.0, deadzone: 0.05, linearity: 1.2 },
        pedals: { throttleKey: 'W', brakeKey: 'S', progressivePressure: true },
        buttons: []
      };
    }

    this.emulator = new InputEmulator(this.activeProfile);
    this.udpServer = new UdpServer(this.udpPort, this.emulator);
    this.beacon = new DiscoveryBeacon(this.udpPort, this.httpPort);

    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Serve UI
    const rendererPath = path.resolve(__dirname, 'renderer');
    this.app.use(express.static(rendererPath));

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupRoutes();
    this.setupWebSockets();
    this.setupUdpListener();
  }

  private resolveViGEmInstallerPath(): string {
    const candidates = [
      (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'drivers', 'ViGEmBusSetup.exe') : '',
      path.resolve(__dirname, '..', 'drivers', 'ViGEmBusSetup.exe'),
      path.resolve(__dirname, 'drivers', 'ViGEmBusSetup.exe'),
      path.resolve(process.cwd(), 'drivers', 'ViGEmBusSetup.exe'),
      path.resolve(process.cwd(), 'desktop-companion', 'drivers', 'ViGEmBusSetup.exe')
    ].filter(p => !!p);

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return '';
  }

  private setupRoutes() {
    this.app.get('/api/status', (_req, res) => {
      res.json({
        status: this.isUdpRunning ? 'online' : 'paused',
        isUdpRunning: this.isUdpRunning,
        version: '1.0.0',
        udpPort: this.udpPort,
        httpPort: this.httpPort,
        ips: this.beacon.getLocalIps(),
        activeProfile: this.activeProfile,
        connectedDevices: this.clientSessions.size,
        driverMode: this.emulator.driverMode,
        isDriverInstalled: this.emulator.isDriverInstalled,
        emulatorStatus: this.emulator.getStatus()
      });
    });

    this.app.get('/api/driver/status', (_req, res) => {
      res.json({
        driverMode: this.emulator.driverMode,
        isDriverInstalled: this.emulator.isDriverInstalled,
        info: this.emulator.isDriverInstalled
          ? 'ViGEmBus Virtual Gamepad Driver is detected and active. Windows games will recognize this device as "Controller (Xbox 360 For Windows)".'
          : 'ViGEmBus Driver not installed. High-performance Direct Simulation Mode is active with genuine DirectInput hardware scancodes.'
      });
    });

    this.app.post('/api/driver/recheck', (_req, res) => {
      const isInstalled = this.emulator.recheckDriver();
      res.json({
        success: true,
        isDriverInstalled: isInstalled,
        driverMode: this.emulator.driverMode
      });
    });

    this.app.post('/api/driver/install', (_req, res) => {
      try {
        const installerPath = this.resolveViGEmInstallerPath();
        const { exec } = require('child_process');
        if (installerPath && fs.existsSync(installerPath)) {
          const cmd = `powershell -NoProfile -Command "Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -Verb RunAs"`;
          exec(cmd, (err: any) => {
            if (err) {
              console.warn('[Server] UAC launch error, falling back to direct start:', err);
              exec(`start "" "${installerPath}"`);
            }
          });
          res.json({
            success: true,
            launched: true,
            message: 'ViGEmBus installer launched. Please accept the Windows administrator prompt to complete installation.'
          });
        } else {
          exec('start https://github.com/nefarius/ViGEmBus/releases/latest');
          res.json({ success: true, launched: false, message: 'Opening ViGEmBus driver release page in browser.' });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/api/server/toggle', async (req, res) => {
      const { start } = req.body;
      if (start && !this.isUdpRunning) {
        await this.startUdp();
        res.json({ success: true, isUdpRunning: true });
      } else if (!start && this.isUdpRunning) {
        this.stopUdp();
        res.json({ success: true, isUdpRunning: false });
      } else {
        res.json({ success: true, isUdpRunning: this.isUdpRunning });
      }
    });

    this.app.post('/api/server/config', async (req, res) => {
      const { udpPort } = req.body;
      if (udpPort && typeof udpPort === 'number') {
        const wasRunning = this.isUdpRunning;
        if (wasRunning) this.stopUdp();
        this.udpPort = udpPort;
        this.udpServer = new UdpServer(this.udpPort, this.emulator);
        this.beacon = new DiscoveryBeacon(this.udpPort, this.httpPort);
        this.setupUdpListener();
        if (wasRunning) await this.startUdp();
        this.broadcastTelemetry();
        res.json({ success: true, udpPort: this.udpPort });
      } else {
        res.status(400).json({ error: 'Invalid port' });
      }
    });

    this.app.get('/api/profiles', (_req, res) => {
      try {
        const profilesDir = this.getProfilesDirectory();
        if (fs.existsSync(profilesDir)) {
          const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
          const profiles = files.map(f => JSON.parse(fs.readFileSync(path.join(profilesDir, f), 'utf8')));
          return res.json(profiles);
        }
        res.json([this.activeProfile]);
      } catch (err) {
        res.json([this.activeProfile]);
      }
    });

    this.app.post('/api/profiles/active', (req, res) => {
      const profile: KeyMappingProfile = req.body;
      if (profile && profile.id) {
        this.activeProfile = profile;
        this.emulator.setProfile(profile);
        this.broadcastTelemetry();
        res.json({ success: true, activeProfile: this.activeProfile });
      } else {
        res.status(400).json({ error: 'Invalid profile' });
      }
    });

    this.app.post('/api/input/test-key', (req, res) => {
      const { key } = req.body;
      if (key) {
        this.emulator.sendKey(key);
        res.json({ success: true, keySent: key });
      } else {
        res.status(400).json({ error: 'Key required' });
      }
    });
  }

  private setupWebSockets() {
    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({
        type: 'INIT_STATE',
        data: {
          activeProfile: this.activeProfile,
          serverPort: this.udpPort,
          wsPort: this.httpPort,
          localIps: this.beacon.getLocalIps(),
          isUdpRunning: this.isUdpRunning
        }
      }));

      ws.on('message', (message) => {
        try {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'CONTROLLER_INPUT' && this.isUdpRunning) {
            const packet: ControllerPacket = msg.data;
            if (typeof packet.steer === 'number') {
              this.emulator.updateAxes(packet.steer, packet.throttle || 0, packet.brake || 0);
            }
            if (Array.isArray(packet.buttonsDown)) {
              for (const btn of packet.buttonsDown) {
                this.emulator.handleButtonDown(btn);
              }
            }
            if (Array.isArray(packet.buttonsUp)) {
              for (const btn of packet.buttonsUp) {
                this.emulator.handleButtonUp(btn);
              }
            }
            this.currentInputs = {
              steer: packet.steer || 0,
              throttle: packet.throttle || 0,
              brake: packet.brake || 0,
              activeButtons: packet.buttonsDown || []
            };
          }
        } catch (_) {}
      });
    });

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.clientSessions.entries()) {
        if (now - client.lastPing > 5000) {
          this.clientSessions.delete(id);
        }
      }
      this.broadcastTelemetry();
    }, 500);
  }

  private lastTelemetryBroadcast = 0;

  private setupUdpListener() {
    this.udpServer.onPacket((packet: ControllerPacket, rinfo) => {
      if (!this.isUdpRunning) return;
      const now = Date.now();
      const clientId = packet.clientId || `${rinfo.address}:${rinfo.port}`;
      const latency = packet.timestamp ? Math.max(0, now - packet.timestamp) : 2;
      const existing = this.clientSessions.get(clientId);

      this.clientSessions.set(clientId, {
        id: clientId,
        ip: rinfo.address,
        port: rinfo.port,
        lastPing: now,
        latencyMs: latency,
        packetCount: (existing?.packetCount || 0) + 1
      });

      this.currentInputs = {
        steer: packet.steer || 0,
        throttle: packet.throttle || 0,
        brake: packet.brake || 0,
        activeButtons: packet.buttonsDown || []
      };

      // Throttle UI HUD telemetry updates to 20Hz (every 50ms) to save CPU/memory
      if (now - this.lastTelemetryBroadcast >= 50) {
        this.lastTelemetryBroadcast = now;
        this.broadcastTelemetry();
      }
    });
  }

  public async startUdp() {
    try {
      await this.udpServer.start();
      this.beacon.start(1000);
      this.isUdpRunning = true;
      this.broadcastTelemetry();
    } catch (e) {
      console.error('Failed starting UDP:', e);
    }
  }

  public stopUdp() {
    this.udpServer.stop();
    this.beacon.stop();
    this.isUdpRunning = false;
    this.emulator.releaseAll();
    this.clientSessions.clear();
    this.broadcastTelemetry();
  }

  public broadcastTelemetry() {
    const state = {
      connectedClients: Array.from(this.clientSessions.values()),
      currentInputs: this.currentInputs,
      activeProfile: this.activeProfile,
      serverPort: this.udpPort,
      wsPort: this.httpPort,
      localIps: this.beacon.getLocalIps(),
      isUdpRunning: this.isUdpRunning,
      driverMode: this.emulator.driverMode,
      isDriverInstalled: this.emulator.isDriverInstalled
    };

    const payload = JSON.stringify({ type: 'TELEMETRY_UPDATE', data: state });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  public async startHttp(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.httpPort, () => {
        resolve();
      });
    });
  }

  public stopAll() {
    this.stopUdp();
    this.emulator.destroy();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    try {
      this.wss.close();
    } catch (_) {}
    try {
      this.server.close();
    } catch (_) {}
  }
}

export const companionServerInstance = new CompanionServer();
companionServerInstance.startHttp().then(() => {
  companionServerInstance.startUdp();
});
