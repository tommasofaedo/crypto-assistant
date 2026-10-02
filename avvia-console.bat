@echo off
chcp 65001 >nul
title crypto-console
cd /d "%~dp0"

echo ============================================
echo   crypto-console
echo ============================================
echo.

rem Prima volta: installa le dipendenze se mancano
if not exist "node_modules" (
  echo Installo le dipendenze ^(solo la prima volta^)...
  call npm install
  echo.
)

rem Apre il browser dopo 2s (il tempo che il server sia pronto), in background
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4319'"

echo Server in avvio su http://127.0.0.1:4319
echo Lascia aperta questa finestra: e' il server.
echo Per fermare la console: chiudi questa finestra oppure premi Ctrl+C.
echo.

node server.js

echo.
echo Console fermata. Premi un tasto per chiudere.
pause >nul
