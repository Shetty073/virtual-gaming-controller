import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Wifi, 
  Gamepad2, 
  Settings, 
  Sliders, 
  Activity, 
  Monitor, 
  Zap, 
  Smartphone,
  Play,
  Square,
  RotateCcw,
  Save,
  CheckCircle2,
  Info,
  ExternalLink,
  Github,
  Globe,
  Heart
} from 'lucide-react';

interface ClientDevice {
  id: string;
  ip: string;
  port: number;
  lastPing: number;
  latencyMs: number;
  packetCount: number;
}

interface KeyMappingProfile {
  id: string;
  name: string;
  description: string;
  steering: {
    leftKey: string;
    rightKey: string;
    sensitivity: number;
    deadzone: number;
    linearity: number;
  };
  pedals: {
    throttleKey: string;
    brakeKey: string;
    progressivePressure: boolean;
  };
  buttons: {
    id: string;
    label: string;
    key: string;
    type: string;
    icon: string;
    category?: string;
  }[];
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'webcontroller' | 'mapping' | 'settings' | 'connection' | 'about'>('dashboard');
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [clients, setClients] = useState<ClientDevice[]>([]);
  const [inputs, setInputs] = useState({ steer: 0, throttle: 0, brake: 0, activeButtons: [] as string[] });
  const [profiles, setProfiles] = useState<KeyMappingProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<KeyMappingProfile | null>(null);
  const [serverInfo, setServerInfo] = useState<{ udpPort: number; wsPort: number; ips: string[] }>({
    udpPort: 45455,
    wsPort: 45450,
    ips: ['127.0.0.1']
  });
  const [isServerRunning, setIsServerRunning] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [testKeyFeedback, setTestKeyFeedback] = useState<string | null>(null);
  const [customUdpPort, setCustomUdpPort] = useState<number>(45455);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [driverStatus, setDriverStatus] = useState<{ driverMode: string; isDriverInstalled: boolean }>({
    driverMode: 'Keyboard',
    isDriverInstalled: false
  });

  // Web Controller state
  const [webSteer, setWebSteer] = useState<number>(0);
  const [webThrottle, setWebThrottle] = useState<number>(0);
  const [webBrake, setWebBrake] = useState<number>(0);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const wsUrl = `${protocol}//${host}:45450`;

    let socket: WebSocket;

    function connectWs() {
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'TELEMETRY_UPDATE' || message.type === 'INIT_STATE') {
              const data = message.data;
              if (data.connectedClients) setClients(data.connectedClients);
              if (data.currentInputs) setInputs(data.currentInputs);
              if (data.activeProfile) setActiveProfile(data.activeProfile);
              if (typeof data.isUdpRunning === 'boolean') setIsServerRunning(data.isUdpRunning);
              if (data.driverMode) {
                setDriverStatus({
                  driverMode: data.driverMode,
                  isDriverInstalled: !!data.isDriverInstalled
                });
              }
              if (data.serverPort) {
                setCustomUdpPort(data.serverPort);
                setServerInfo({
                  udpPort: data.serverPort,
                  wsPort: data.wsPort || 45450,
                  ips: data.localIps || ['127.0.0.1']
                });
              }
            }
          } catch (e) {}
        };

        socket.onclose = () => {
          setWsConnected(false);
          setTimeout(connectWs, 2000);
        };
      } catch (err) {
        setTimeout(connectWs, 2000);
      }
    }

    connectWs();

    // Fetch profiles
    fetch(`http://${host}:45450/api/profiles`)
      .then(res => res.json())
      .then(data => {
        setProfiles(data);
        if (data.length > 0 && !activeProfile) {
          setActiveProfile(data[0]);
        }
      })
      .catch(() => {});

    // Fetch initial status and driver state
    fetch(`http://${host}:45450/api/status`)
      .then(res => res.json())
      .then(data => {
        if (data.driverMode) {
          setDriverStatus({
            driverMode: data.driverMode,
            isDriverInstalled: !!data.isDriverInstalled
          });
        }
      })
      .catch(() => {});

    return () => {
      if (socket) socket.close();
    };
  }, []);

  useEffect(() => {
    const primaryIp = serverInfo.ips.find(ip => !ip.startsWith('127.')) || serverInfo.ips[0] || '127.0.0.1';
    const connectionPayload = JSON.stringify({
      vgc: '1.0',
      ip: primaryIp,
      udp: serverInfo.udpPort,
      ws: serverInfo.wsPort,
      name: 'VGC Desktop Companion'
    });

    QRCode.toDataURL(connectionPayload, {
      margin: 1,
      color: { dark: '#00f0ff', light: '#090d16' },
      width: 220
    }).then(url => setQrDataUrl(url));
  }, [serverInfo]);

  const handleToggleServer = async () => {
    const host = window.location.hostname || 'localhost';
    try {
      const res = await fetch(`http://${host}:45450/api/server/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: !isServerRunning })
      });
      const data = await res.json();
      setIsServerRunning(data.isUdpRunning);
    } catch (_) {}
  };

  const [driverMsg, setDriverMsg] = useState<string | null>(null);
  const [showEts2Guide, setShowEts2Guide] = useState<boolean>(false);

  const handleInstallDriver = async () => {
    const host = window.location.hostname || 'localhost';
    try {
      const res = await fetch(`http://${host}:45450/api/driver/install`, { method: 'POST' });
      const data = await res.json();
      setDriverMsg(data.message || 'Driver installer launched. Click "Detect Controller" once done.');
      // Periodically recheck for automatic connection
      const interval = setInterval(async () => {
        try {
          const checkRes = await fetch(`http://${host}:45450/api/driver/recheck`, { method: 'POST' });
          const checkData = await checkRes.json();
          if (checkData.isDriverInstalled) {
            setDriverStatus({
              driverMode: checkData.driverMode,
              isDriverInstalled: true
            });
            setDriverMsg('Virtual Xbox 360 Controller connected!');
            clearInterval(interval);
          }
        } catch (_) {}
      }, 3000);
      setTimeout(() => clearInterval(interval), 45000);
    } catch (_) {
      window.open('https://github.com/nefarius/ViGEmBus/releases/latest', '_blank');
    }
  };

  const handleRecheckDriver = async () => {
    const host = window.location.hostname || 'localhost';
    try {
      const checkRes = await fetch(`http://${host}:45450/api/driver/recheck`, { method: 'POST' });
      const checkData = await checkRes.json();
      setDriverStatus({
        driverMode: checkData.driverMode,
        isDriverInstalled: !!checkData.isDriverInstalled
      });
      setDriverMsg(checkData.isDriverInstalled
        ? 'Xbox 360 Virtual Controller is active and connected!'
        : 'ViGEmBus driver not yet detected. Run the installer to enable Xbox 360 controller emulation.');
      setTimeout(() => setDriverMsg(null), 4000);
    } catch (_) {}
  };

  const handleSavePortConfig = async () => {
    const host = window.location.hostname || 'localhost';
    try {
      await fetch(`http://${host}:45450/api/server/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ udpPort: Number(customUdpPort) })
      });
      setSaveSuccessMsg('Server configuration applied!');
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    } catch (_) {}
  };

  const handleTestKey = async (key: string) => {
    setTestKeyFeedback(`Emulating [${key}]...`);
    const host = window.location.hostname || 'localhost';
    try {
      await fetch(`http://${host}:45450/api/input/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
    } catch (_) {}
    setTimeout(() => setTestKeyFeedback(null), 1200);
  };

  const handleSwitchProfile = async (prof: KeyMappingProfile) => {
    setActiveProfile(prof);
    const host = window.location.hostname || 'localhost';
    try {
      await fetch(`http://${host}:45450/api/profiles/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prof)
      });
    } catch (_) {}
  };

  const handleSaveProfileChanges = async () => {
    if (!activeProfile) return;
    const host = window.location.hostname || 'localhost';
    try {
      await fetch(`http://${host}:45450/api/profiles/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeProfile)
      });
      setSaveSuccessMsg('Keybindings saved!');
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    } catch (_) {}
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 10% 20%, #08111e 0%, #03070d 90%)', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Top HUD Header */}
      <header style={{ borderBottom: '1px solid rgba(0, 240, 255, 0.2)', background: 'rgba(5, 10, 20, 0.85)', backdropFilter: 'blur(12px)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #00f0ff, #0077ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(0, 240, 255, 0.4)' }}>
            <Gamepad2 size={24} color="#050a14" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '1px', fontFamily: 'Orbitron, monospace', color: '#ffffff' }}>VIRTUAL CONTROLLER</h1>
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0, 240, 255, 0.15)', color: '#00f0ff', border: '1px solid rgba(0, 240, 255, 0.3)' }}>ETS2 / ATS</span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>Desktop Companion Engine & HUD</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '6px', background: 'rgba(15, 23, 42, 0.8)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: activeTab === 'dashboard' ? '#00f0ff' : 'transparent', color: activeTab === 'dashboard' ? '#050a14' : '#94a3b8' }}>
            <Activity size={16} /> Live HUD
          </button>
          <button 
            onClick={() => setActiveTab('webcontroller')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: activeTab === 'webcontroller' ? '#00f0ff' : 'transparent', color: activeTab === 'webcontroller' ? '#050a14' : '#94a3b8' }}>
            <Smartphone size={16} /> Web Controller
          </button>
          <button 
            onClick={() => setActiveTab('mapping')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: activeTab === 'mapping' ? '#00f0ff' : 'transparent', color: activeTab === 'mapping' ? '#050a14' : '#94a3b8' }}>
            <Sliders size={16} /> Key Mappings
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: activeTab === 'settings' ? '#00f0ff' : 'transparent', color: activeTab === 'settings' ? '#050a14' : '#94a3b8' }}>
            <Settings size={16} /> Settings
          </button>
          <button 
            onClick={() => setActiveTab('connection')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: activeTab === 'connection' ? '#00f0ff' : 'transparent', color: activeTab === 'connection' ? '#050a14' : '#94a3b8' }}>
            <Wifi size={16} /> QR / Pair
          </button>
          <button 
            onClick={() => setActiveTab('about')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: activeTab === 'about' ? '#00f0ff' : 'transparent', color: activeTab === 'about' ? '#050a14' : '#94a3b8' }}>
            <Info size={16} /> About
          </button>
        </nav>

        {/* Server Start / Stop Toggle Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleToggleServer}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '8px',
              border: isServerRunning ? '1px solid #00ff66' : '1px solid #ff0055',
              background: isServerRunning ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 0, 85, 0.15)',
              color: isServerRunning ? '#00ff66' : '#ff0055',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px'
            }}>
            {isServerRunning ? <Square size={14} fill="#00ff66" /> : <Play size={14} fill="#ff0055" />}
            {isServerRunning ? 'STOP SERVER' : 'START SERVER'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px' }}>

        {/* Live HUD */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Game Controller Detection & ETS 2 Status Banner */}
              <div style={{
                background: driverStatus.isDriverInstalled
                  ? 'linear-gradient(90deg, rgba(0, 255, 102, 0.12), rgba(15, 23, 42, 0.8))'
                  : 'linear-gradient(90deg, rgba(0, 240, 255, 0.12), rgba(15, 23, 42, 0.8))',
                border: driverStatus.isDriverInstalled
                  ? '1px solid rgba(0, 255, 102, 0.4)'
                  : '1px solid rgba(0, 240, 255, 0.35)',
                borderRadius: '16px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: driverStatus.isDriverInstalled ? 'rgba(0, 255, 102, 0.2)' : 'rgba(0, 240, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: driverStatus.isDriverInstalled ? '#00ff66' : '#00f0ff'
                    }}>
                      <Gamepad2 size={22} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', fontFamily: 'Orbitron, monospace' }}>
                          {driverStatus.isDriverInstalled ? 'VIRTUAL XBOX 360 CONTROLLER (XINPUT)' : 'DIRECT INPUT SIMULATION (HARDWARE SCAN CODES)'}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontWeight: 700,
                          background: driverStatus.isDriverInstalled ? 'rgba(0, 255, 102, 0.2)' : 'rgba(0, 240, 255, 0.2)',
                          color: driverStatus.isDriverInstalled ? '#00ff66' : '#00f0ff',
                          border: driverStatus.isDriverInstalled ? '1px solid #00ff66' : '1px solid #00f0ff'
                        }}>
                          {driverStatus.isDriverInstalled ? 'XBOX 360 DETECTED' : 'DIRECTINPUT READY'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                        {driverStatus.isDriverInstalled
                          ? 'Steering, gas (RT) and brake (LT) feed analog controller axes. Dashboard buttons trigger keyboard keys simultaneously!'
                          : 'Keyboard scan codes active. For analog Xbox 360 controller detection in ETS 2, install the ViGEm driver.'}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setShowEts2Guide(!showEts2Guide)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: showEts2Guide ? 'rgba(0, 240, 255, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                        color: showEts2Guide ? '#00f0ff' : '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                      }}>
                      {showEts2Guide ? 'Hide ETS 2 Setup' : 'ETS 2 Setup Guide'}
                    </button>

                    {!driverStatus.isDriverInstalled ? (
                      <>
                        <button
                          onClick={handleInstallDriver}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid #00f0ff',
                            background: 'rgba(0, 240, 255, 0.2)',
                            color: '#00f0ff',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}>
                          Install Xbox Controller Driver
                        </button>
                        <button
                          onClick={handleRecheckDriver}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            background: 'rgba(30, 41, 59, 0.5)',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                          Detect Driver
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleRecheckDriver}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(0, 255, 102, 0.4)',
                          background: 'rgba(0, 255, 102, 0.15)',
                          color: '#00ff66',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}>
                        Refresh
                      </button>
                    )}
                  </div>
                </div>

                {driverMsg && (
                  <div style={{
                    fontSize: '11px',
                    color: driverStatus.isDriverInstalled ? '#00ff66' : '#38bdf8',
                    background: 'rgba(0, 0, 0, 0.25)',
                    padding: '6px 12px',
                    borderRadius: '6px'
                  }}>
                    {driverMsg}
                  </div>
                )}

                {/* Interactive ETS 2 Guide */}
                {showEts2Guide && (
                  <div style={{
                    background: 'rgba(11, 19, 36, 0.95)',
                    border: '1px solid rgba(0, 240, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginTop: '4px'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#00f0ff', fontFamily: 'Orbitron, monospace', marginBottom: '12px' }}>
                      ETS 2 CONTROLLER & KEYBOARD HYBRID SETUP (RECOMMENDED)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>1. CONTROLS MENU</div>
                        <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: '1.6' }}>
                          In ETS 2, open <b>Options ➔ Controls</b>.<br />
                          Top dropdown: Select <b style={{ color: '#00ff66' }}>"Keyboard + Controller (Xbox 360 For Windows)"</b>.<br />
                          Subtype: Set to <b style={{ color: '#00f0ff' }}>Wheel</b> (for 1:1 direct steering) or <b>Gamepad</b>.
                        </div>
                      </div>

                      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>2. AXIS ASSIGNMENT</div>
                        <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: '1.6' }}>
                          <b>Steering Axis:</b> Click and rotate phone wheel ➔ <span style={{ color: '#00ff66' }}>Joy Left X-Axis</span><br />
                          <b>Acceleration Axis:</b> Click and press gas pedal ➔ <span style={{ color: '#00ff66' }}>Joy Right Trigger (RT)</span><br />
                          <b>Brake Axis:</b> Click and press brake pedal ➔ <span style={{ color: '#00ff66' }}>Joy Left Trigger (LT)</span>
                        </div>
                      </div>

                      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>3. LINEARITY & DEADZONE</div>
                        <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: '1.6' }}>
                          Set <b>Steering Deadzone</b> to <b>0%</b>.<br />
                          Set <b>Steering Linearity</b> slider to the far left (linear 1:1 rotation matching the mobile steering wheel).
                        </div>
                      </div>

                      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>4. TRUCK BUTTONS (KEYBOARD)</div>
                        <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: '1.6' }}>
                          All dashboard buttons on the phone (Engine <span style={{ color: '#00f0ff' }}>[E]</span>, Lights <span style={{ color: '#00f0ff' }}>[L]</span>, Wipers <span style={{ color: '#00f0ff' }}>[P]</span>, Blinkers <span style={{ color: '#00f0ff' }}>[ / ]</span>, Horn <span style={{ color: '#00f0ff' }}>[H]</span>, Park Brake <span style={{ color: '#00f0ff' }}>[SPACE]</span>) trigger ETS 2 default keys automatically alongside controller steering!
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Profile Bar */}
              <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(0, 240, 255, 0.25)', borderRadius: '16px', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8', fontFamily: 'Orbitron, monospace' }}>{activeProfile?.name || 'Euro Truck Simulator 2'}</h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{activeProfile?.description}</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProfile(p)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: activeProfile?.id === p.id ? '1px solid #00f0ff' : '1px solid rgba(255,255,255,0.1)',
                        background: activeProfile?.id === p.id ? 'rgba(0, 240, 255, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                        color: activeProfile?.id === p.id ? '#00f0ff' : '#cbd5e1',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '12px'
                      }}>
                      {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gauges */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>STEERING AXIS</span>
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '3px dashed rgba(0, 240, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${inputs.steer * 180}deg)`, transition: 'transform 0.08s ease-out' }}>
                    <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'radial-gradient(circle, #0f172a 40%, #1e293b 100%)', border: '2px solid #00f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '6px', height: '30px', background: '#00f0ff', borderRadius: '3px', position: 'absolute', top: '10px' }} />
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '20px', fontWeight: 800, fontFamily: 'Orbitron, monospace', color: '#00f0ff' }}>
                    {Math.round(inputs.steer * 100)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>THROTTLE [W]</span>
                  <div style={{ width: '24px', height: '120px', background: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', border: '1px solid rgba(0, 255, 102, 0.3)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.round(inputs.throttle * 100)}%`, background: 'linear-gradient(to top, #00ff66, #38bdf8)', transition: 'height 0.05s' }} />
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '20px', fontWeight: 800, fontFamily: 'Orbitron, monospace', color: '#00ff66' }}>
                    {Math.round(inputs.throttle * 100)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px', marginBottom: '12px' }}>BRAKE [S]</span>
                  <div style={{ width: '24px', height: '120px', background: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', border: '1px solid rgba(255, 0, 85, 0.3)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.round(inputs.brake * 100)}%`, background: 'linear-gradient(to top, #ff0055, #ffaa00)', transition: 'height 0.05s' }} />
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '20px', fontWeight: 800, fontFamily: 'Orbitron, monospace', color: '#ff0055' }}>
                    {Math.round(inputs.brake * 100)}%
                  </div>
                </div>
              </div>

              {/* Action Buttons Matrix */}
              <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>CABIN BUTTONS</h3>
                  {testKeyFeedback && <span style={{ fontSize: '12px', color: '#00f0ff' }}>{testKeyFeedback}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                  {activeProfile?.buttons.map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => handleTestKey(btn.key)}
                      style={{
                        background: inputs.activeButtons.includes(btn.id) ? 'rgba(0, 240, 255, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '12px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                      <span className="material-icons-round" style={{ fontSize: '20px', color: '#00f0ff' }}>{btn.icon}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>{btn.label}</span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'monospace' }}>[{btn.key}]</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '16px', padding: '20px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Monitor size={16} /> CONNECTED DEVICES ({clients.length})
                </h3>
                {clients.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '16px 0' }}>No active mobile device connected</p>
                ) : (
                  clients.map(client => (
                    <div key={client.id} style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(0, 255, 102, 0.3)', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{client.ip}</span>
                        <span style={{ fontSize: '11px', color: '#00ff66', fontWeight: 700 }}>{client.latencyMs} ms</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>INSTANT PAIR</h3>
                {qrDataUrl && <img src={qrDataUrl} alt="Pairing QR" style={{ width: '160px', height: '160px', margin: '0 auto', borderRadius: '10px', background: '#090d16', padding: '6px', border: '1px solid rgba(0,240,255,0.3)' }} />}
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>{serverInfo.ips[0]}:{serverInfo.udpPort}</p>
              </div>
            </div>

          </div>
        )}

        {/* Server & Engine Settings */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '700px', margin: '0 auto', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '20px', padding: '32px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#00f0ff', fontFamily: 'Orbitron, monospace', marginBottom: '8px' }}>ENGINE CONFIGURATIONS</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>Modify transport protocols, ports, and emulation parameters.</p>

            {saveSuccessMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 255, 102, 0.15)', border: '1px solid #00ff66', color: '#00ff66', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                <CheckCircle2 size={16} /> {saveSuccessMsg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>VIRTUAL CONTROLLER & GAME DETECTION STATUS</label>
                <div style={{ background: '#090d16', border: '1px solid rgba(0, 240, 255, 0.25)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                        {driverStatus.isDriverInstalled ? '🎮 ViGEm Virtual Xbox 360 Controller' : '⚡ DirectInput Hardware Scancode Engine'}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', background: driverStatus.isDriverInstalled ? 'rgba(0, 255, 102, 0.15)' : 'rgba(0, 240, 255, 0.15)', color: driverStatus.isDriverInstalled ? '#00ff66' : '#00f0ff', padding: '3px 10px', borderRadius: '4px', fontWeight: 700 }}>
                      {driverStatus.isDriverInstalled ? 'VIRTUAL GAMEPAD ACTIVE' : 'DIRECT SIMULATION ACTIVE'}
                    </span>
                  </div>

                  <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                    {driverStatus.isDriverInstalled
                      ? 'ViGEmBus driver is active. Games like Euro Truck Simulator 2, ATS, and Assetto Corsa will detect your phone as a native "Controller (Xbox 360 For Windows)" with full analog steering and pedal axes.'
                      : 'Emulates genuine DirectInput hardware scancodes directly into ETS2 / ATS game loops without needing third-party drivers. Keystrokes, pedals, and cockpit buttons are processed with zero latency.'}
                  </p>

                  <div style={{ background: 'rgba(15, 23, 42, 0.7)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', marginBottom: '6px' }}>
                      HOW TO CONFIGURE IN EURO TRUCK SIMULATOR 2 (ETS 2):
                    </div>
                    <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: '1.7' }}>
                      {driverStatus.isDriverInstalled ? (
                        <>
                          1. Open ETS 2 ➔ <strong>Options</strong> ➔ <strong>Controls</strong>.<br />
                          2. Set Input Device to: <strong>"Keyboard + Controller (Xbox 360 For Windows)"</strong>.<br />
                          3. Set Controller Subtype to: <strong>"Steering Wheel"</strong> or <strong>"Gamepad"</strong>.<br />
                          4. Steering Axis, Accelerator, and Brake will automatically map to your phone wheel and pedals!
                        </>
                      ) : (
                        <>
                          1. Open ETS 2 ➔ <strong>Options</strong> ➔ <strong>Controls</strong>.<br />
                          2. Set Input Device to: <strong>"Keyboard only"</strong> (or "Keyboard + Mouse Steering").<br />
                          3. Steering (A / D), Pedals (W / S), and all Cockpit Buttons match ETS2 defaults out of the box!<br />
                          4. (Optional) For analog gamepad axis detection in ETS2 dropdown, click "Install ViGEmBus Driver" below.
                        </>
                      )}
                    </div>
                  </div>

                  {!driverStatus.isDriverInstalled && (
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Want ETS 2 to list a dedicated Xbox 360 Gamepad device?</span>
                      <button
                        onClick={handleInstallDriver}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: '1px solid #00f0ff',
                          background: 'rgba(0, 240, 255, 0.1)',
                          color: '#00f0ff',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                        Install ViGEmBus Driver
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>UDP INPUT PORT</label>
                <input 
                  type="number" 
                  value={customUdpPort} 
                  onChange={(e) => setCustomUdpPort(Number(e.target.value))}
                  style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>HTTP & WEBSOCKET PORT</label>
                <input 
                  type="number" 
                  disabled 
                  value={serverInfo.wsPort} 
                  style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', color: '#64748b', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginTop: '12px' }}>
                <button
                  onClick={handleSavePortConfig}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: '#00f0ff',
                    color: '#050a14',
                    border: 'none',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}>
                  <Save size={18} /> APPLY & RESTART SOCKETS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wheel & Pedals Logitech-Style Calibration Tab */}
        {activeTab === 'mapping' && activeProfile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Logitech Steering Wheel & Pedals Calibration Panel */}
            <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#00f0ff', fontFamily: 'Orbitron, monospace' }}>
                    🎮 LOGITECH G29/G920 STEERING & PEDAL CALIBRATION
                  </h2>
                  <p style={{ fontSize: '12px', color: '#94a3b8' }}>Configure steering rotation lock, deadzones, sensitivity curves, and pedal linearity.</p>
                </div>
                <button
                  onClick={handleSaveProfileChanges}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', background: '#00f0ff', color: '#050a14', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                  <Save size={16} /> SAVE CALIBRATION
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                
                {/* Steering Wheel Tuning */}
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginBottom: '14px' }}>STEERING WHEEL AXIS</div>
                  
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                      <span>Steering Deadzone</span>
                      <span style={{ color: '#00f0ff', fontWeight: 700 }}>{Math.round(activeProfile.steering.deadzone * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="0.25" step="0.01"
                      value={activeProfile.steering.deadzone}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveProfile({ ...activeProfile, steering: { ...activeProfile.steering, deadzone: val } });
                      }}
                      style={{ width: '100%', accentColor: '#00f0ff' }}
                    />
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                      <span>Steering Non-Linearity / Sensitivity</span>
                      <span style={{ color: '#00f0ff', fontWeight: 700 }}>{activeProfile.steering.linearity.toFixed(1)}x</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2.5" step="0.1"
                      value={activeProfile.steering.linearity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setActiveProfile({ ...activeProfile, steering: { ...activeProfile.steering, linearity: val } });
                      }}
                      style={{ width: '100%', accentColor: '#00f0ff' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <div style={{ flex: 1, background: '#090d16', padding: '8px', borderRadius: '6px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
                      Left: <strong style={{ color: '#fff' }}>[{activeProfile.steering.leftKey}]</strong>
                    </div>
                    <div style={{ flex: 1, background: '#090d16', padding: '8px', borderRadius: '6px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
                      Right: <strong style={{ color: '#fff' }}>[{activeProfile.steering.rightKey}]</strong>
                    </div>
                  </div>
                </div>

                {/* Accelerator & Brake Pedals */}
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#00ff66', marginBottom: '14px' }}>PEDALS AXIS (THROTTLE & BRAKE)</div>
                  
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                      <span>Throttle Key Binding</span>
                      <input 
                        type="text" 
                        defaultValue={activeProfile.pedals.throttleKey}
                        onChange={(e) => {
                          activeProfile.pedals.throttleKey = e.target.value;
                        }}
                        style={{ width: '50px', background: '#090d16', border: '1px solid rgba(0, 255, 102, 0.4)', borderRadius: '4px', color: '#00ff66', textAlign: 'center', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                      <span>Brake Key Binding</span>
                      <input 
                        type="text" 
                        defaultValue={activeProfile.pedals.brakeKey}
                        onChange={(e) => {
                          activeProfile.pedals.brakeKey = e.target.value;
                        }}
                        style={{ width: '50px', background: '#090d16', border: '1px solid rgba(255, 0, 85, 0.4)', borderRadius: '4px', color: '#ff0055', textAlign: 'center', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', background: '#090d16', padding: '10px', borderRadius: '8px' }}>
                    <input 
                      type="checkbox" 
                      id="progPressure"
                      checked={activeProfile.pedals.progressivePressure}
                      onChange={(e) => {
                        setActiveProfile({ ...activeProfile, pedals: { ...activeProfile.pedals, progressivePressure: e.target.checked } });
                      }}
                      style={{ accentColor: '#00ff66', width: '16px', height: '16px' }}
                    />
                    <label htmlFor="progPressure" style={{ fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>
                      Enable Progressive Hydraulic Pressure Curve
                    </label>
                  </div>
                </div>

              </div>
            </div>

            {/* Custom Gamepad Buttons Matrix */}
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8' }}>SIMULATOR ACTION BUTTONS</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>Customize key scan-codes for truck switches and accessories.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {activeProfile.buttons.map(btn => (
                  <div key={btn.id} style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="material-icons-round" style={{ color: '#00f0ff' }}>{btn.icon}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{btn.label}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{btn.category || 'General'}</div>
                      </div>
                    </div>
                    <input
                      type="text"
                      defaultValue={btn.key}
                      onChange={(e) => {
                        btn.key = e.target.value;
                      }}
                      style={{ width: '60px', background: '#090d16', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '6px', padding: '6px', color: '#00f0ff', textAlign: 'center', fontWeight: 700 }}
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Web Controller */}
        {activeTab === 'webcontroller' && (
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '20px', padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#00f0ff', fontFamily: 'Orbitron, monospace' }}>INTERACTIVE CONTROLLER</h2>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>Control simulator axes and triggers directly from the dashboard.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>STEERING SLIDER</span>
                <input 
                  type="range" 
                  min="-1" 
                  max="1" 
                  step="0.01" 
                  value={webSteer}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setWebSteer(val);
                    const host = window.location.hostname || 'localhost';
                    fetch(`http://${host}:45450/api/input/test-key`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key: val < -0.1 ? 'A' : val > 0.1 ? 'D' : '' })
                    }).catch(() => {});
                  }}
                  style={{ width: '100%', accentColor: '#00f0ff', margin: '16px 0' }}
                />
                <button onClick={() => setWebSteer(0)} style={{ background: 'rgba(0, 240, 255, 0.15)', border: '1px solid #00f0ff', color: '#00f0ff', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}>CENTER (0%)</button>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  onMouseDown={() => { setWebThrottle(1); handleTestKey('W'); }}
                  onMouseUp={() => setWebThrottle(0)}
                  onTouchStart={() => { setWebThrottle(1); handleTestKey('W'); }}
                  onTouchEnd={() => setWebThrottle(0)}
                  style={{ flex: 1, height: '120px', borderRadius: '12px', background: webThrottle > 0 ? '#00ff66' : 'rgba(30, 41, 59, 0.8)', border: '2px solid #00ff66', color: webThrottle > 0 ? '#000' : '#00ff66', fontWeight: 800, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Zap size={24} /> THROTTLE [W]
                </button>
                <button
                  onMouseDown={() => { setWebBrake(1); handleTestKey('S'); }}
                  onMouseUp={() => setWebBrake(0)}
                  onTouchStart={() => { setWebBrake(1); handleTestKey('S'); }}
                  onTouchEnd={() => setWebBrake(0)}
                  style={{ flex: 1, height: '120px', borderRadius: '12px', background: webBrake > 0 ? '#ff0055' : 'rgba(30, 41, 59, 0.8)', border: '2px solid #ff0055', color: webBrake > 0 ? '#000' : '#ff0055', fontWeight: 800, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <RotateCcw size={24} /> BRAKE [S]
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QR Pairing */}
        {activeTab === 'connection' && (
          <div style={{ maxWidth: '540px', margin: '0 auto', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '20px', padding: '28px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#00f0ff', marginBottom: '8px' }}>DEVICE PAIRING</h2>
            {qrDataUrl && <img src={qrDataUrl} alt="Pairing Code" style={{ width: '200px', height: '200px', margin: '0 auto 16px auto', borderRadius: '12px', border: '2px solid rgba(0,240,255,0.4)', padding: '8px', background: '#090d16' }} />}
            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '14px', borderRadius: '10px', textAlign: 'left', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>Host IP:</span>
                <span style={{ color: '#00f0ff' }}>{serverInfo.ips[0]}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>UDP Port:</span>
                <span style={{ color: '#00f0ff' }}>{serverInfo.udpPort}</span>
              </div>
            </div>
          </div>
        )}

        {/* About View */}
        {activeTab === 'about' && (
          <div style={{ maxWidth: '640px', margin: '0 auto', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(0, 240, 255, 0.35)', borderRadius: '24px', padding: '36px', textAlign: 'center', boxShadow: '0 0 40px rgba(0, 240, 255, 0.15)', backdropFilter: 'blur(16px)' }}>
            <div style={{ width: '80px', height: '80px', margin: '0 auto 20px auto', borderRadius: '20px', background: 'linear-gradient(135deg, #00f0ff, #0077ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 25px rgba(0, 240, 255, 0.45)', border: '2px solid #00f0ff' }}>
              <Gamepad2 size={44} color="#050a14" />
            </div>

            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', letterSpacing: '1px', fontFamily: 'Orbitron, monospace', marginBottom: '4px' }}>
              VIRTUAL GAMING CONTROLLER
            </h2>
            <p style={{ fontSize: '13px', color: '#00f0ff', fontWeight: 600, marginBottom: '24px' }}>
              High-Precision Simulator Controller & Companion
            </p>

            <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '20px', textAlign: 'left', marginBottom: '24px', lineHeight: '1.7' }}>
              <p style={{ fontSize: '14px', color: '#e2e8f0', marginBottom: '12px' }}>
                👋 <strong>Warm Greetings!</strong> Welcome to Virtual Gaming Controller. This tool turns any mobile device into a sub-millisecond, low-latency steering wheel and interactive cockpit button box for simulation games.
              </p>
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', marginTop: '12px' }}>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                  Crafted with passion by <strong style={{ color: '#00f0ff' }}>Ashish Shetty</strong> — a software engineer and builder enthusiastic about real-time systems, gaming hardware emulation, and fluid user experiences.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://ashishshetty.in/"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #00f0ff, #00a2ff)',
                  color: '#050a14',
                  fontWeight: 700,
                  fontSize: '13px',
                  textDecoration: 'none',
                  boxShadow: '0 0 15px rgba(0, 240, 255, 0.3)',
                  transition: 'transform 0.2s'
                }}>
                <Globe size={16} /> Personal Webpage <ExternalLink size={14} />
              </a>

              <a
                href="https://github.com/Shetty073/"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: 'rgba(30, 41, 59, 0.9)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  textDecoration: 'none',
                  transition: 'background 0.2s'
                }}>
                <Github size={16} /> GitHub Profile <ExternalLink size={14} />
              </a>
            </div>

            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '24px' }}>
              Version 1.0.0 • Licensed under GNU LGPL v2.1
            </p>
          </div>
        )}

      </main>

    </div>
  );
};
