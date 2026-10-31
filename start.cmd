@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. See README.md for setup instructions.
  pause
  exit /b 1
)
node "%~dp0scripts\start-desktop.mjs" %*
set "weaver_status=%errorlevel%"
if not "%weaver_status%"=="0" pause
exit /b %weaver_status%
