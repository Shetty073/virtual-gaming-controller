@echo off
:: Self-elevate to Administrator if not already elevated
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~fn0\"\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo  Activating ViGEmBus Virtual Gamepad Controller Driver
echo ========================================================
echo.

set "VIGEM_DIR=C:\Program Files\Nefarius Software Solutions\ViGEm Bus Driver"

if not exist "%VIGEM_DIR%\nefconw.exe" (
    echo Error: ViGEm Bus Driver files not found in "%VIGEM_DIR%".
    echo Please run ViGEmBusSetup.exe first.
    pause
    exit /b 1
)

cd /d "%VIGEM_DIR%"

echo [1/2] Installing ViGEmBus driver into Windows DriverStore...
"%VIGEM_DIR%\nefconw.exe" --install-driver --inf-path "%VIGEM_DIR%\ViGEmBus.inf"

echo [2/2] Registering ViGEmBus root virtual device node...
"%VIGEM_DIR%\nefconw.exe" --create-device-node --hardware-id "Nefarius\ViGEmBus\Gen1" --class-name "System" --class-guid "{4D36E97D-E325-11CE-BFC1-08002BE10318}"

echo.
echo ========================================================
echo  SUCCESS! ViGEmBus Virtual Controller Driver is Active!
echo ========================================================
echo You can now return to the Virtual Gaming Controller app
echo and click "Detect Driver" or restart the app.
echo.
timeout /t 5
