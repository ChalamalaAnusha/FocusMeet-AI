@echo off
title FocusMeet Backend Server
cd /d "%~dp0backend"
echo ===================================================
echo   FocusMeet AI Backend Server (Port 5000)
echo ===================================================
node dist/index.js
pause
