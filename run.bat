@echo off
rem ============================================================
rem   ARGUS - AI Gold Trading Fund   |   run.bat
rem   Double-click to start everything and enter the model
rem ============================================================
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title ARGUS - AI Gold Trading Fund
cd /d "%~dp0"

echo.
echo   ==================================================
echo     ARGUS  ^|  Autonomous AI Gold Trading Desk
echo   ==================================================
echo.

rem ---------- 0. Docker present? ----------
where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker is not installed or not in PATH.
  echo         Install Docker Desktop: https://docs.docker.com/get-docker/
  echo.
  pause
  exit /b 1
)

rem ---------- 1. engine already up? ----------
curl -sf -o nul -m 2 http://localhost:3000/api/health
if not errorlevel 1 goto HEALTHY

echo [*] Starting the engine with Docker...
docker compose up -d
if errorlevel 1 (
  echo.
  echo [ERROR] docker compose failed. Is Docker Desktop running?
  echo.
  pause
  exit /b 1
)

echo [*] Waiting for the model brain to wake up...
:WAITLOOP
timeout /t 3 /nobreak >nul
curl -sf -o nul -m 2 http://localhost:3000/api/health
if errorlevel 1 goto WAITLOOP

:HEALTHY
echo [OK] AI engine is ONLINE.

rem ---------- 2. MetaTrader 4 running on this machine? ----------
set "MT4=OFF"
tasklist /FI "IMAGENAME eq terminal64.exe" 2>nul | find /I "terminal64.exe" >nul && set "MT4=ON"
tasklist /FI "IMAGENAME eq terminal.exe"   2>nul | find /I "terminal.exe"   >nul && set "MT4=ON"

rem ---------- 3. bridge heartbeat: is the EA actually connected? ----------
set "BRIDGE=DISCONNECTED"
curl -s -m 3 http://localhost:3000/api/state 2>nul | findstr /C:"\"online\":true" >nul && set "BRIDGE=CONNECTED"

echo.
echo   ----------------------------------------------
echo     AI engine ......... ONLINE  (localhost:3000)
if "%MT4%"=="ON" (
  echo     MetaTrader 4 ...... RUNNING
) else (
  echo     MetaTrader 4 ...... NOT RUNNING
)
echo     ArgusBridge link .. %BRIDGE%
echo   ----------------------------------------------
echo.

if "%MT4%"=="OFF" (
  echo [i] Open your Alpari MT4 terminal so the model can place live trades.
  echo     ^(compile ArgusBridge.mq4 in Experts, drop on XAUUSD, set token^)
) else if "%BRIDGE%"=="DISCONNECTED" (
  echo [i] MT4 is open but the EA has not connected yet. Check:
  echo     - AutoTrading button is ON
  echo     - Tools -^> Options -^> Expert Advisors -^> Allow WebRequest: http://localhost:3000
  echo     - Bridge_Token input is set to your account token from the dashboard
)

echo [^>^>] Opening the desk in your browser...
start "" "http://localhost:3000"
timeout /t 2 /nobreak >nul
exit /b 0
