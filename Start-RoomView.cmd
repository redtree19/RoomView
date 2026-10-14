@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer first.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
if not exist dist\index.html (
  call npm.cmd run build
  if errorlevel 1 goto failed
)
echo RoomView: http://127.0.0.1:4317
echo Keep this window open while using RoomView. Press Ctrl+C to stop.
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0
:failed
echo RoomView could not start. See the error above.
pause
exit /b 1
