@echo off
title FocusMeet AI Launcher
echo ===================================================
echo        Starting FocusMeet AI Application
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Backend Signaling Server (Port 5000)...
start "FocusMeet Backend Server" cmd /k "cd /d "%~dp0backend" && node dist/index.js"

echo Waiting 2 seconds for backend initialization...
timeout /t 2 /nobreak >nul

echo [2/3] Starting Frontend Dev Server (Port 5173)...
start "FocusMeet Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo Waiting 3 seconds for frontend server...
timeout /t 3 /nobreak >nul

echo [3/3] Opening FocusMeet in your browser...
start http://localhost:5173/

echo.
echo ===================================================
echo  FocusMeet AI is now running!
echo  - Frontend: http://localhost:5173/
echo  - Backend:  http://localhost:5000/api
echo ===================================================
echo You can close this launcher window (the servers will keep running in their own windows).
pause
