@echo off
setlocal EnableDelayedExpansion

:: Self-elevate to Administrator if not already elevated
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [VGC] Requesting Windows Administrator privileges to install driver & firewall...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~fn0\"\"' -Verb RunAs"
    exit /b
)

title Virtual Gaming Controller - ViGEm Driver & Firewall Setup
color 0b
echo ======================================================================
echo    VIRTUAL GAMING CONTROLLER - XBOX 360 DRIVER ^& FIREWALL SETUP
echo ======================================================================
echo.

set "DRIVER_DIR=%~dp0"
if "%DRIVER_DIR:~-1%"=="\" set "DRIVER_DIR=%DRIVER_DIR:~0,-1%"
set "VIGEM_SETUP=%DRIVER_DIR%\ViGEmBusSetup.exe"
if not exist "%VIGEM_SETUP%" (
    set "VIGEM_SETUP=%~dp0desktop-companion\drivers\ViGEmBusSetup.exe"
)
set "VIGEM_DIR=C:\Program Files\Nefarius Software Solutions\ViGEm Bus Driver"

:: Step 1: Run the Official ViGEmBus Setup Package
if exist "%VIGEM_SETUP%" (
    echo [1/3] Running official ViGEmBus driver package installer...
    "%VIGEM_SETUP%" /install /passive /norestart
    echo  - ViGEmBus installer package executed.
) else (
    echo [!] ViGEmBusSetup.exe not found at "%VIGEM_SETUP%".
)

:: Step 2: Register device node using nefconw if present
if exist "%VIGEM_DIR%\nefconw.exe" (
    echo [2/3] Registering ViGEmBus device node in Windows PnP tree...
    cd /d "%VIGEM_DIR%"
    "%VIGEM_DIR%\nefconw.exe" --install-driver --inf-path "%VIGEM_DIR%\ViGEmBus.inf" >nul 2>&1
    "%VIGEM_DIR%\nefconw.exe" --create-device-node --hardware-id "Nefarius\ViGEmBus\Gen1" --class-name "System" --class-guid "{4D36E97D-E325-11CE-BFC1-08002BE10318}"
)

:: Ensure the driver service is started
net start ViGEmBus >nul 2>&1

:: Step 3: Configure Windows Firewall for UDP input streaming and HTTP/WS
echo.
echo [3/3] Configuring Windows Defender Firewall rules...
netsh advfirewall firewall delete rule name="VGC_Companion_UDP" >nul 2>&1
netsh advfirewall firewall add rule name="VGC_Companion_UDP" dir=in action=allow protocol=UDP localport=45455,45456 profile=any >nul
echo  - UDP ports 45455, 45456: Allowed in Windows Firewall

netsh advfirewall firewall delete rule name="VGC_Companion_TCP" >nul 2>&1
netsh advfirewall firewall add rule name="VGC_Companion_TCP" dir=in action=allow protocol=TCP localport=45450 profile=any >nul
echo  - TCP port 45450 (HTTP/WebSocket): Allowed in Windows Firewall

echo.
echo ======================================================================
echo  VERIFYING CONTROLLER DRIVER STATUS...
echo ======================================================================
powershell -NoProfile -Command "if (Test-Path '\\.\ViGEmBus') { Write-Host '  SUCCESS! ViGEmBus Kernel Device is ACTIVE and READY!' -ForegroundColor Green } else { Write-Host '  ViGEmBus device node created. Restart the Desktop Companion to detect.' -ForegroundColor Yellow }"
echo ======================================================================
echo.
echo You can now return to the Desktop Companion and click "Detect Driver".
echo Games like Euro Truck Simulator 2 (ETS 2) will now detect:
echo  - "Controller (Xbox 360 For Windows)" for Steering, Throttle ^& Brake
echo  - Keyboard buttons for Cabin lights, wipers, blinkers, ignition
echo.
echo Press any key to close this window...
pause >nul
exit /b 0
