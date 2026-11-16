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
  private secondaryServer: http.Server | null = null;
  private wss: WebSocketServer;
  private secondaryWss: WebSocketServer | null = null;
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

    this.app.post('/api/driver/recheck', async (_req, res) => {
      const isInstalled = await this.emulator.recheckDriver();
      res.json({
        success: true,
        isDriverInstalled: isInstalled,
        driverMode: this.emulator.driverMode
      });
    });

    this.app.post('/api/driver/install', (_req, res) => {
      try {
        const { exec } = require('child_process');
        const batCandidates = [
          path.resolve(__dirname, '..', 'drivers', 'activate_vigem.bat'),
          path.resolve(process.cwd(), 'drivers', 'activate_vigem.bat'),
          path.resolve(process.cwd(), 'desktop-companion', 'drivers', 'activate_vigem.bat'),
          (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'drivers', 'activate_vigem.bat') : ''
        ].filter(p => !!p);

        const batPath = batCandidates.find(p => fs.existsSync(p));

        if (batPath) {
          const runCmd = `powershell -NoProfile -Command "Start-Process -FilePath '${batPath.replace(/'/g, "''")}' -Verb RunAs"`;
          exec(runCmd, (err: any) => {
            if (err) console.error('[Server] Failed to launch activate_vigem.bat:', err);
          });
          res.json({
            success: true,
            launched: true,
            message: 'Xbox 360 controller driver & firewall setup launched! Please click "Yes" on the Windows Administrator prompt.'
          });
          return;
        }

        const installerPath = this.resolveViGEmInstallerPath();
        if (installerPath && fs.existsSync(installerPath)) {
          const cmd = `powershell -NoProfile -Command "Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -Verb RunAs"`;
          exec(cmd);
          res.json({
            success: true,
            launched: true,
            path: installerPath,
            message: 'ViGEmBus installer launched! Accept the Windows administrator prompt, finish setup, then click "Detect Driver".'
          });
        } else {
          exec('start https://github.com/nefarius/ViGEmBus/releases/latest');
          res.json({ success: true, launched: false, message: 'Opening ViGEmBus driver release page in browser.' });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/api/client/heartbeat', (req, res) => {
      const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^.*:/, '');
      const clientId = req.body?.clientId || `device_${ip}`;
      const now = Date.now();
      const existing = this.clientSessions.get(clientId);
      this.clientSessions.set(clientId, {
        id: clientId,
        ip,
        port: req.socket.remotePort || 0,
        lastPing: now,
        latencyMs: typeof req.body?.latency === 'number' ? req.body.latency : 2,
        packetCount: (existing?.packetCount || 0) + 1
      });
      if (req.body?.inputs) {
        const inp = req.body.inputs;
        if (typeof inp.steer === 'number') {
          this.emulator.updateAxes(inp.steer, inp.throttle || 0, inp.brake || 0);
        }
        this.currentInputs = {
          steer: inp.steer || 0,
          throttle: inp.throttle || 0,
          brake: inp.brake || 0,
          activeButtons: inp.buttons || []
        };
      }
      this.broadcastTelemetry();
      res.json({ success: true, timestamp: now });
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

  private setupWebSocketListeners(wssInstance: WebSocketServer) {
    wssInstance.on('connection', (ws, req) => {
      const clientIp = (req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientId = `ws_${clientIp}_${req.socket.remotePort || Math.floor(Math.random() * 10000)}`;

      this.clientSessions.set(clientId, {
        id: clientId,
        ip: clientIp,
        port: req.socket.remotePort || 0,
        lastPing: Date.now(),
        latencyMs: 1,
        packetCount: 1
      });
      this.broadcastTelemetry();

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
          const now = Date.now();
          const session = this.clientSessions.get(clientId);
          if (session) {
            session.lastPing = now;
            session.packetCount++;
          }

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

            if (now - this.lastTelemetryBroadcast >= 50) {
              this.lastTelemetryBroadcast = now;
              this.broadcastTelemetry();
            }
          }
        } catch (_) {}
      });

      ws.on('close', () => {
        this.clientSessions.delete(clientId);
        this.broadcastTelemetry();
      });

      ws.on('error', () => {
        this.clientSessions.delete(clientId);
      });
    });
  }

  private setupWebSockets() {
    this.setupWebSocketListeners(this.wss);

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, client] of this.clientSessions.entries()) {
        if (now - client.lastPing > 5000) {
          this.clientSessions.delete(id);
          changed = true;
        }
      }
      if (changed) {
        this.broadcastTelemetry();
      }
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
    if (this.isUdpRunning) return;
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
    const send = (client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    };
    this.wss.clients.forEach(send);
    this.secondaryWss?.clients.forEach(send);
  }

  public async startHttp(): Promise<void> {
    const bindServer = (serverInstance: http.Server, port: number, label: string) => {
      return new Promise<void>((resolve) => {
        serverInstance.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[Server] Port ${port} (${label}) already in use.`);
          } else {
            console.error(`[Server] ${label} error:`, err);
          }
          resolve();
        });

        serverInstance.listen(port, '0.0.0.0', () => {
          console.log(`[Server] HTTP & WebSocket (${label}) listening on http://0.0.0.0:${port}`);
          resolve();
        });
      });
    };

    // Bind primary HTTP/WS port (45450)
    await bindServer(this.server, this.httpPort, 'Primary');

    // Also bind HTTP & WebSocket on the exact UDP port (45455) so clients connecting to 45455 work seamlessly!
    if (this.udpPort !== this.httpPort) {
      try {
        this.secondaryServer = http.createServer(this.app);
        this.secondaryWss = new WebSocketServer({ server: this.secondaryServer });
        this.setupWebSocketListeners(this.secondaryWss);
        await bindServer(this.secondaryServer, this.udpPort, 'Unified UDP/HTTP');
      } catch (e) {
        console.warn('[Server] Could not bind secondary HTTP/WS server:', e);
      }
    }
  }

  public stopAll() {
    this.stopUdp();
    this.emulator.destroy();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    try {
      this.secondaryWss?.close();
    } catch (_) {}
    try {
      this.secondaryServer?.close();
    } catch (_) {}
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
