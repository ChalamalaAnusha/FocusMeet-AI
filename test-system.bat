@echo off
title FocusMeet System Verification Tests
cd /d "%~dp0backend"
echo ===================================================
echo   Running FocusMeet AI Automated Tests
echo ===================================================
node test-e2e.js
pause
