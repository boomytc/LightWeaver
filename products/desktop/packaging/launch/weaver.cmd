@echo off
setlocal
set "LIGHTWEAVER_BUNDLE_ROOT=%~dp0.."
"%LIGHTWEAVER_BUNDLE_ROOT%\node\node.exe" "%LIGHTWEAVER_BUNDLE_ROOT%\service\cli.mjs" %*
