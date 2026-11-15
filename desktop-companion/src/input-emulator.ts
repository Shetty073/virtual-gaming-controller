import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
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
  'CONTROL': 0x11,
  'ALT': 0x12,
  'TAB': 0x09,
  'ENTER': 0x0D,
  'RETURN': 0x0D,
  'ESC': 0x1B,
  'ESCAPE': 0x1B,
  'BACKSPACE': 0x08,
  'CAPSLOCK': 0x14,
  'UP': 0x26,
  'DOWN': 0x28,
  'LEFT': 0x25,
  'RIGHT': 0x27,
  'INSERT': 0x2D,
  'DELETE': 0x2E,
  'HOME': 0x24,
  'END': 0x23,
  'PAGEUP': 0x21,
  'PAGEDOWN': 0x22,

  // Function Keys F1-F12
  'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73, 'F5': 0x74, 'F6': 0x75,
  'F7': 0x76, 'F8': 0x77, 'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,

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

// Map Xbox controller button names to ViGEm / XUSB button bitmasks
const XBOX_BUTTON_MAP: Record<string, number> = {
  'XBOX_UP': 0x0001,
  'XBOX_DPAD_UP': 0x0001,
  'XBOX_DOWN': 0x0002,
  'XBOX_DPAD_DOWN': 0x0002,
  'XBOX_LEFT': 0x0004,
  'XBOX_DPAD_LEFT': 0x0004,
  'XBOX_RIGHT': 0x0008,
  'XBOX_DPAD_RIGHT': 0x0008,
  'XBOX_START': 0x0010,
  'XBOX_BACK': 0x0020,
  'XBOX_THUMB_L': 0x0040,
  'XBOX_THUMB_R': 0x0080,
  'XBOX_LB': 0x0100,
  'XBOX_LEFT_SHOULDER': 0x0100,
  'XBOX_RB': 0x0200,
  'XBOX_RIGHT_SHOULDER': 0x0200,
  'XBOX_GUIDE': 0x0400,
  'XBOX_A': 0x1000,
  'XBOX_B': 0x2000,
  'XBOX_X': 0x4000,
  'XBOX_Y': 0x8000
};

export class InputEmulator {
  private activeProfile: KeyMappingProfile;
  private currentSteer: number = 0;
  private currentThrottle: number = 0;
  private currentBrake: number = 0;

  // State transitions for keyboard fallback
  private lastSteerDirection: 'left' | 'right' | 'center' = 'center';
  private isThrottleActive: boolean = false;
  private isBrakeActive: boolean = false;
  private activePressedButtons = new Set<string>();

  // Single persistent Win32 native gaming input process
  private workerProcess: ChildProcessWithoutNullStreams | null = null;
  private isReady: boolean = false;
  private commandQueue: string[] = [];

  public driverMode: 'vJoy' | 'ViGEm' | 'Keyboard' = 'Keyboard';
  public isDriverInstalled: boolean = false;
  private vigemDllPath: string = '';

  constructor(profile: KeyMappingProfile) {
    this.activeProfile = profile;
    this.vigemDllPath = this.resolveViGEmDllPath();
    this.initNativeWorker();
  }

  private resolveViGEmDllPath(): string {
    const candidates = [
      (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'native', 'ViGEmClient.dll') : '',
      path.resolve(__dirname, '..', 'native', 'ViGEmClient.dll'),
      path.resolve(__dirname, 'native', 'ViGEmClient.dll'),
      path.resolve(process.cwd(), 'native', 'ViGEmClient.dll'),
      path.resolve(process.cwd(), 'desktop-companion', 'native', 'ViGEmClient.dll')
    ].filter(p => !!p);

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return '';
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

      const escapedDllPath = this.vigemDllPath.replace(/\\/g, '\\\\');

      // Bind Win32 hardware scancode & ViGEm Virtual Xbox 360 controller API
      const bindingScript = `
$cs = @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Win32API {
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct XUSB_REPORT {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    public class WinGamingInput {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr LoadLibrary(string lpFileName);

        [DllImport("user32.dll")]
        public static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

        // ViGEmClient C API
        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr vigem_alloc();

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int vigem_connect(IntPtr client);

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr vigem_target_x360_alloc();

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int vigem_target_add(IntPtr client, IntPtr target);

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int vigem_target_x360_update(IntPtr client, IntPtr target, XUSB_REPORT report);

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int vigem_target_remove(IntPtr client, IntPtr target);

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void vigem_target_free(IntPtr target);

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void vigem_disconnect(IntPtr client);

        [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void vigem_free(IntPtr client);

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint MOUSEEVENTF_MOVE = 0x0001;

        private static IntPtr _vigemClient = IntPtr.Zero;
        private static IntPtr _x360Target = IntPtr.Zero;
        private static bool _vigemInitialized = false;
        private static XUSB_REPORT _report = new XUSB_REPORT();

        public static bool IsExtended(uint vk) {
            return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0xA3 || vk == 0xA5;
        }

        public static void KeyDown(uint vk) {
            byte scan = (byte)MapVirtualKey(vk, 0);
            uint flags = 0;
            if (IsExtended(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
            keybd_event((byte)vk, scan, flags, UIntPtr.Zero);
        }

        public static void KeyUp(uint vk) {
            byte scan = (byte)MapVirtualKey(vk, 0);
            uint flags = KEYEVENTF_KEYUP;
            if (IsExtended(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
            keybd_event((byte)vk, scan, flags, UIntPtr.Zero);
        }

        public static void KeyTap(uint vk, int durationMs) {
            KeyDown(vk);
            if (durationMs > 0) Thread.Sleep(durationMs);
            KeyUp(vk);
        }

        public static void MoveMouse(int dx, int dy) {
            mouse_event(MOUSEEVENTF_MOVE, dx, dy, 0, UIntPtr.Zero);
        }

        public static bool InitViGEm(string dllPath) {
            try {
                if (_vigemInitialized) return true;
                if (!string.IsNullOrEmpty(dllPath)) {
                    LoadLibrary(dllPath);
                }
                _vigemClient = vigem_alloc();
                if (_vigemClient == IntPtr.Zero) return false;

                int res = vigem_connect(_vigemClient);
                if (res != 0) {
                    vigem_free(_vigemClient);
                    _vigemClient = IntPtr.Zero;
                    return false;
                }

                _x360Target = vigem_target_x360_alloc();
                if (_x360Target == IntPtr.Zero) {
                    vigem_disconnect(_vigemClient);
                    vigem_free(_vigemClient);
                    _vigemClient = IntPtr.Zero;
                    return false;
                }

                int addRes = vigem_target_add(_vigemClient, _x360Target);
                if (addRes != 0) {
                    vigem_target_free(_x360Target);
                    vigem_disconnect(_vigemClient);
                    vigem_free(_vigemClient);
                    _x360Target = IntPtr.Zero;
                    _vigemClient = IntPtr.Zero;
                    return false;
                }

                _report = new XUSB_REPORT();
                _vigemInitialized = true;
                return true;
            } catch {
                return false;
            }
        }

        public static void SetXboxAxes(short thumbLX, byte rightTrigger, byte leftTrigger) {
            if (!_vigemInitialized || _vigemClient == IntPtr.Zero || _x360Target == IntPtr.Zero) return;
            _report.sThumbLX = thumbLX;
            _report.bRightTrigger = rightTrigger;
            _report.bLeftTrigger = leftTrigger;
            vigem_target_x360_update(_vigemClient, _x360Target, _report);
        }

        public static void SetXboxButton(ushort mask, bool pressed) {
            if (!_vigemInitialized || _vigemClient == IntPtr.Zero || _x360Target == IntPtr.Zero) return;
            if (pressed) {
                _report.wButtons |= mask;
            } else {
                _report.wButtons &= (ushort)~mask;
            }
            vigem_target_x360_update(_vigemClient, _x360Target, _report);
        }

        public static void ShutdownViGEm() {
            try {
                if (_x360Target != IntPtr.Zero && _vigemClient != IntPtr.Zero) {
                    vigem_target_remove(_vigemClient, _x360Target);
                    vigem_target_free(_x360Target);
                    _x360Target = IntPtr.Zero;
                }
                if (_vigemClient != IntPtr.Zero) {
                    vigem_disconnect(_vigemClient);
                    vigem_free(_vigemClient);
                    _vigemClient = IntPtr.Zero;
                }
                _vigemInitialized = false;
            } catch {}
        }
    }
}
'@
Add-Type -TypeDefinition $cs
$initRes = [Win32API.WinGamingInput]::InitViGEm("${escapedDllPath}")
[Console]::Out.WriteLine("VIGEM:" + $initRes)
[Console]::Out.WriteLine("READY")
`;

      this.workerProcess.stdout.on('data', (data: Buffer) => {
        const out = data.toString();
        if (out.includes('VIGEM:True')) {
          this.isDriverInstalled = true;
          this.driverMode = 'ViGEm';
          console.log('[InputEmulator] ViGEmBus active: Virtual Xbox 360 controller connected!');
        } else if (out.includes('VIGEM:False')) {
          this.isDriverInstalled = false;
          this.driverMode = 'Keyboard';
          console.log('[InputEmulator] ViGEmBus driver not installed: DirectInput Simulation active.');
        }
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

  public recheckDriver(): boolean {
    if (!this.vigemDllPath) {
      this.vigemDllPath = this.resolveViGEmDllPath();
    }
    const escapedDllPath = this.vigemDllPath.replace(/\\/g, '\\\\');
    this.sendCommand(`
$recheck = [Win32API.WinGamingInput]::InitViGEm("${escapedDllPath}")
[Console]::Out.WriteLine("VIGEM:" + $recheck)
`);
    return this.isDriverInstalled;
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
      this.workerProcess.stdin.write(cmd.trim() + '\n');
    } else {
      if (this.commandQueue.length < 50) {
        this.commandQueue.push(cmd.trim());
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
   * Fast native key down event with accurate hardware scancode for DirectX/DirectInput games
   */
  public keyDown(keyName: string) {
    const vk = this.getVkCode(keyName);
    if (vk !== null) {
      this.sendCommand(`[Win32API.WinGamingInput]::KeyDown(${vk})`);
    }
  }

  /**
   * Fast native key up event with accurate hardware scancode for DirectX/DirectInput games
   */
  public keyUp(keyName: string) {
    const vk = this.getVkCode(keyName);
    if (vk !== null) {
      this.sendCommand(`[Win32API.WinGamingInput]::KeyUp(${vk})`);
    }
  }

  /**
   * Sends a key stroke held for at least durationMs (default 45ms) so DirectX 60fps input polling loops reliably register it
   */
  public sendKey(keyName: string, durationMs: number = 45) {
    const vk = this.getVkCode(keyName);
    if (vk !== null) {
      this.sendCommand(`[Win32API.WinGamingInput]::KeyTap(${vk}, ${durationMs})`);
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
    if (!btn) return;

    const upperKey = btn.key.trim().toUpperCase();
    if (XBOX_BUTTON_MAP[upperKey] !== undefined) {
      const mask = XBOX_BUTTON_MAP[upperKey];
      this.sendCommand(`[Win32API.WinGamingInput]::SetXboxButton(${mask}, $true)`);
    } else {
      if (btn.type === 'momentary') {
        this.keyDown(btn.key);
      } else {
        this.sendKey(btn.key, 45);
      }
    }
  }

  public handleButtonUp(buttonId: string) {
    if (!this.activePressedButtons.has(buttonId)) return;
    this.activePressedButtons.delete(buttonId);

    const btn = this.activeProfile.buttons.find(b => b.id === buttonId);
    if (!btn) return;

    const upperKey = btn.key.trim().toUpperCase();
    if (XBOX_BUTTON_MAP[upperKey] !== undefined) {
      const mask = XBOX_BUTTON_MAP[upperKey];
      this.sendCommand(`[Win32API.WinGamingInput]::SetXboxButton(${mask}, $false)`);
    } else {
      if (btn.type === 'momentary') {
        this.keyUp(btn.key);
      }
    }
  }

  /**
   * Updates axes:
   * 1. If ViGEm Virtual Xbox 360 controller is active, feeds analog thumbstick & triggers.
   * 2. If ViGEm is not installed, falls back to hardware-scancode DirectX keyboard emulation.
   */
  public updateAxes(steer: number, throttle: number, brake: number) {
    this.currentSteer = steer;
    this.currentThrottle = throttle;
    this.currentBrake = brake;

    const deadzone = this.activeProfile.steering.deadzone || 0.05;

    // 1. Virtual Xbox 360 Controller (XInput)
    if (this.isDriverInstalled) {
      let effectiveSteer = steer;
      if (Math.abs(effectiveSteer) < deadzone) {
        effectiveSteer = 0;
      }
      const thumbLX = Math.max(-32768, Math.min(32767, Math.round(effectiveSteer * 32767)));
      const rightTrigger = Math.max(0, Math.min(255, Math.round(throttle * 255)));
      const leftTrigger = Math.max(0, Math.min(255, Math.round(brake * 255)));

      this.sendCommand(`[Win32API.WinGamingInput]::SetXboxAxes(${thumbLX}, ${rightTrigger}, ${leftTrigger})`);
    } else {
      // 2. DirectInput Keyboard Simulation (DirectX scan codes)
      this.updateKeyboardAxes(steer, throttle, brake);
    }
  }

  private updateKeyboardAxes(steer: number, throttle: number, brake: number) {
    const deadzone = this.activeProfile.steering.deadzone || 0.05;

    // Steering State Machine
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

    // Throttle State Machine
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

    // Brake State Machine
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
   * Release all held down keys & center Xbox controller
   */
  public releaseAll() {
    if (this.isDriverInstalled) {
      this.sendCommand(`[Win32API.WinGamingInput]::SetXboxAxes(0, 0, 0)`);
    }

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
      if (btn) {
        const upperKey = btn.key.trim().toUpperCase();
        if (XBOX_BUTTON_MAP[upperKey] !== undefined) {
          const mask = XBOX_BUTTON_MAP[upperKey];
          this.sendCommand(`[Win32API.WinGamingInput]::SetXboxButton(${mask}, $false)`);
        } else if (btn.type === 'momentary') {
          this.keyUp(btn.key);
        }
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
      isDriverInstalled: this.isDriverInstalled,
      direction: this.lastSteerDirection
    };
  }

  public destroy() {
    this.releaseAll();
    if (this.workerProcess) {
      try {
        this.workerProcess.stdin.write(`[Win32API.WinGamingInput]::ShutdownViGEm()\n`);
        this.workerProcess.stdin.end();
        this.workerProcess.kill();
      } catch (_) {}
      this.workerProcess = null;
    }
    this.isReady = false;
  }
}

