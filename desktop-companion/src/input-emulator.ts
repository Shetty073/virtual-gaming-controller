import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { KeyMappingProfile } from './types';

// Map key names to Windows Virtual Key codes (VK)
const VK_MAP: Record<string, number> = {
  // Letters
  'A': 0x41, 'B': 0x42, 'C': 0x43, 'D': 0x44, 'E': 0x45, 'F': 0x46,
  'G': 0x47, 'H': 0x48, 'I': 0x49, 'J': 0x4A, 'K': 0x4B, 'L': 0x4C,
  'M': 0x4D, 'N': 0x4E, 'O': 0x4F, 'P': 0x50, 'Q': 0x51, 'R': 0x52,
  'S': 0x53, 'T': 0x54, 'U': 0x55, 'V': 0x56, 'W': 0x57, 'X': 0x58,
  'Y': 0x59, 'Z': 0x5A,

  // Numbers 0-9
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,

  // Modifiers & Navigation
  'SPACE': 0x20,
  'SHIFT': 0x10,
  'CTRL': 0x11,
  'ALT': 0x12,
  'TAB': 0x09,
  'ENTER': 0x0D,
  'RETURN': 0x0D,
  'ESC': 0x1B,
  'ESCAPE': 0x1B,
  'UP': 0x26,
  'DOWN': 0x28,
  'LEFT': 0x25,
  'RIGHT': 0x27,

  // Punctuation & Brackets
  '[': 0xDB,
  ']': 0xDD,
  ';': 0xBA,
  '\'': 0xDE,
  ',': 0xBC,
  '.': 0xBE,
  '/': 0xBF,
  '\\': 0xDC,
  '-': 0xBD,
  '=': 0xBB,
  '`': 0xC0
};

export class InputEmulator {
  private activeProfile: KeyMappingProfile;
  private currentSteer: number = 0;
  private currentThrottle: number = 0;
  private currentBrake: number = 0;

  // State transitions
  private lastSteerDirection: 'left' | 'right' | 'center' = 'center';
  private isThrottleActive: boolean = false;
  private isBrakeActive: boolean = false;
  private activePressedButtons = new Set<string>();

  // Single persistent Win32 native key event process
  private workerProcess: ChildProcessWithoutNullStreams | null = null;
  private isReady: boolean = false;
  private commandQueue: string[] = [];

  public driverMode: 'vJoy' | 'ViGEm' | 'Keyboard' = 'Keyboard';

  constructor(profile: KeyMappingProfile) {
    this.activeProfile = profile;
    this.initNativeWorker();
  }

  private initNativeWorker() {
    try {
      this.workerProcess = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.workerProcess.on('error', (err) => {
        console.error('[InputEmulator] Worker process error:', err);
      });

      this.workerProcess.on('exit', () => {
        this.isReady = false;
        this.workerProcess = null;
      });

      // Bind Win32 keybd_event API into persistent PowerShell session
      const bindingScript = `
Add-Type -MemberDefinition @"
[DllImport("user32.dll")]
public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
"@ -Name WinInput -Namespace Win32API
[Console]::Out.WriteLine("READY")
`;

      this.workerProcess.stdout.on('data', (data: Buffer) => {
        const out = data.toString();
        if (out.includes('READY')) {
          this.isReady = true;
          this.flushQueue();
        }
      });

      this.workerProcess.stdin.write(bindingScript + '\n');
    } catch (e) {
      console.error('[InputEmulator] Failed initializing persistent native worker:', e);
    }
  }

  private flushQueue() {
    if (!this.isReady || !this.workerProcess || !this.workerProcess.stdin.writable) return;
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift();
      if (cmd) {
        this.workerProcess.stdin.write(cmd + '\n');
      }
    }
  }

  private sendCommand(cmd: string) {
    if (this.isReady && this.workerProcess && this.workerProcess.stdin.writable) {
      this.workerProcess.stdin.write(cmd + '\n');
    } else {
      if (this.commandQueue.length < 50) {
        this.commandQueue.push(cmd);
      }
    }
  }

  private getVkCode(keyName: string): number | null {
    const upper = keyName.trim().toUpperCase();
    if (VK_MAP[upper] !== undefined) {
      return VK_MAP[upper];
    }
    if (upper.length === 1) {
      return upper.charCodeAt(0);
    }
    return null;
  }

  /**
   * Fast native key down event (dwFlags = 0)
   */
  public keyDown(keyName: string) {
    const vk = this.getVkCode(keyName);
    if (vk !== null) {
      this.sendCommand(`[Win32API.WinInput]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero)`);
    }
  }

  /**
   * Fast native key up event (dwFlags = 2 for KEYEVENTF_KEYUP)
   */
  public keyUp(keyName: string) {
    const vk = this.getVkCode(keyName);
    if (vk !== null) {
      this.sendCommand(`[Win32API.WinInput]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)`);
    }
  }

  /**
   * Sends a key stroke (press down and immediately release)
   */
  public sendKey(keyName: string) {
    const vk = this.getVkCode(keyName);
    if (vk !== null) {
      this.sendCommand(
        `[Win32API.WinInput]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); [Win32API.WinInput]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)`
      );
    }
  }

  public setProfile(profile: KeyMappingProfile) {
    this.releaseAll();
    this.activeProfile = profile;
  }

  public handleButtonDown(buttonId: string) {
    if (this.activePressedButtons.has(buttonId)) return;
    this.activePressedButtons.add(buttonId);

    const btn = this.activeProfile.buttons.find(b => b.id === buttonId);
    if (btn) {
      if (btn.type === 'momentary') {
        this.keyDown(btn.key);
      } else {
        this.sendKey(btn.key);
      }
    }
  }

  public handleButtonUp(buttonId: string) {
    if (!this.activePressedButtons.has(buttonId)) return;
    this.activePressedButtons.delete(buttonId);

    const btn = this.activeProfile.buttons.find(b => b.id === buttonId);
    if (btn && btn.type === 'momentary') {
      this.keyUp(btn.key);
    }
  }

  /**
   * Updates axes based on state transitions so zero CPU overhead occurs while holding pedals or steering.
   */
  public updateAxes(steer: number, throttle: number, brake: number) {
    this.currentSteer = steer;
    this.currentThrottle = throttle;
    this.currentBrake = brake;

    const deadzone = this.activeProfile.steering.deadzone || 0.05;

    // --- STEERING STATE MACHINE ---
    if (steer < -deadzone) {
      if (this.lastSteerDirection !== 'left') {
        if (this.lastSteerDirection === 'right') {
          this.keyUp(this.activeProfile.steering.rightKey);
        }
        this.lastSteerDirection = 'left';
        this.keyDown(this.activeProfile.steering.leftKey);
      }
    } else if (steer > deadzone) {
      if (this.lastSteerDirection !== 'right') {
        if (this.lastSteerDirection === 'left') {
          this.keyUp(this.activeProfile.steering.leftKey);
        }
        this.lastSteerDirection = 'right';
        this.keyDown(this.activeProfile.steering.rightKey);
      }
    } else {
      if (this.lastSteerDirection === 'left') {
        this.keyUp(this.activeProfile.steering.leftKey);
      } else if (this.lastSteerDirection === 'right') {
        this.keyUp(this.activeProfile.steering.rightKey);
      }
      this.lastSteerDirection = 'center';
    }

    // --- THROTTLE STATE MACHINE ---
    const throttleThreshold = 0.15;
    if (throttle > throttleThreshold) {
      if (!this.isThrottleActive) {
        this.isThrottleActive = true;
        this.keyDown(this.activeProfile.pedals.throttleKey);
      }
    } else {
      if (this.isThrottleActive) {
        this.isThrottleActive = false;
        this.keyUp(this.activeProfile.pedals.throttleKey);
      }
    }

    // --- BRAKE STATE MACHINE ---
    const brakeThreshold = 0.15;
    if (brake > brakeThreshold) {
      if (!this.isBrakeActive) {
        this.isBrakeActive = true;
        this.keyDown(this.activeProfile.pedals.brakeKey);
      }
    } else {
      if (this.isBrakeActive) {
        this.isBrakeActive = false;
        this.keyUp(this.activeProfile.pedals.brakeKey);
      }
    }
  }

  /**
   * Release all held down keys
   */
  public releaseAll() {
    if (this.isThrottleActive) {
      this.isThrottleActive = false;
      this.keyUp(this.activeProfile.pedals.throttleKey);
    }
    if (this.isBrakeActive) {
      this.isBrakeActive = false;
      this.keyUp(this.activeProfile.pedals.brakeKey);
    }
    if (this.lastSteerDirection === 'left') {
      this.keyUp(this.activeProfile.steering.leftKey);
    } else if (this.lastSteerDirection === 'right') {
      this.keyUp(this.activeProfile.steering.rightKey);
    }
    this.lastSteerDirection = 'center';

    for (const btnId of this.activePressedButtons) {
      const btn = this.activeProfile.buttons.find(b => b.id === btnId);
      if (btn && btn.type === 'momentary') {
        this.keyUp(btn.key);
      }
    }
    this.activePressedButtons.clear();
  }

  public getStatus() {
    return {
      steer: this.currentSteer,
      throttle: this.currentThrottle,
      brake: this.currentBrake,
      isThrottleActive: this.isThrottleActive,
      isBrakeActive: this.isBrakeActive,
      driverMode: this.driverMode,
      direction: this.lastSteerDirection
    };
  }

  public destroy() {
    this.releaseAll();
    if (this.workerProcess) {
      try {
        this.workerProcess.stdin.end();
        this.workerProcess.kill();
      } catch (_) {}
      this.workerProcess = null;
    }
    this.isReady = false;
  }
}
