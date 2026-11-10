@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "%~dp0deployment\activar-desarrollo.ps1" (
  echo [ERROR] Falta deployment\activar-desarrollo.ps1
  echo Copie el proyecto completo: la carpeta deployment debe estar junto a este archivo.
  if not defined CRM_UNATTENDED pause
  exit /b 1
)

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\activar-desarrollo.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not defined CRM_UNATTENDED pause
exit /b %RESULT%
