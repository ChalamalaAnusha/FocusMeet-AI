@echo off
title FocusMeet Frontend
cd /d "%~dp0frontend"
echo ===================================================
echo   FocusMeet AI Frontend (Port 5173)
echo ===================================================
npm run dev
pause
