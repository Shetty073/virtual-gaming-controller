@echo off
:: Self-elevate to Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to configure Windows Firewall...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~fn0\"\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo  Allowing Virtual Gaming Controller through Firewall
echo ========================================================
echo.

netsh advfirewall firewall delete rule name="Virtual Gaming Controller HTTP" >nul 2>&1
netsh advfirewall firewall delete rule name="Virtual Gaming Controller UDP" >nul 2>&1

netsh advfirewall firewall add rule name="Virtual Gaming Controller HTTP" dir=in action=allow protocol=TCP localport=45450 profile=any
netsh advfirewall firewall add rule name="Virtual Gaming Controller UDP" dir=in action=allow protocol=UDP localport=45455,45456 profile=any

echo.
echo ========================================================
echo  Firewall Rules Configured Successfully!
echo  Port 45450 (TCP) and Ports 45455, 45456 (UDP) are OPEN.
echo ========================================================
timeout /t 4
