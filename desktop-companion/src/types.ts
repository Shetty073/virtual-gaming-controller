export interface ControllerPacket {
  seq: number;
  timestamp: number;
  clientId: string;
  steer: number;     // -1.0 to 1.0
  throttle: number;  // 0.0 to 1.0
  brake: number;     // 0.0 to 1.0
  buttonsDown: string[];
  buttonsUp: string[];
}

export interface KeyMappingProfile {
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
    type: 'toggle' | 'momentary' | 'cycle';
    icon: string;
    category?: string;
  }[];
}

export interface TelemetryState {
  connectedClients: {
    id: string;
    ip: string;
    port: number;
    lastPing: number;
    latencyMs: number;
    packetCount: number;
  }[];
  currentInputs: {
    steer: number;
    throttle: number;
    brake: number;
    activeButtons: string[];
  };
  activeProfile: KeyMappingProfile;
  serverPort: number;
  wsPort: number;
  localIps: string[];
}
