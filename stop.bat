@echo off
rem ============================================================
rem   ARGUS  |  stop.bat  -  shut everything down
rem ============================================================
chcp 65001 >nul 2>&1
title ARGUS - Stop
cd /d "%~dp0"

echo.
echo [*] Stopping ARGUS services...
docker compose down
echo [OK] Stopped. Database volume kept (data preserved).
echo      Full wipe: docker compose down -v
echo.
timeout /t 3 >nul
exit /b 0
