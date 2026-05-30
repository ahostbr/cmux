@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo Stopping cmux Windows dev servers...
echo.

call :stop_server "cmux Windows" "electron-vite" 5173
call :stop_server "cmux Windows" "electron-vite" 5174

echo.
echo Finished.
exit /b 0

:stop_server
set "TITLE=%~1"
set "LABEL=%~2"
set "PORT=%~3"

taskkill /FI "WINDOWTITLE eq %TITLE%" /T /F >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Stopped %LABEL% window: %TITLE%
    exit /b 0
)

echo %LABEL% window not found. Checking port %PORT%...
call :stop_port %PORT% "%LABEL%"
exit /b 0

:stop_port
set "PORT=%~1"
set "LABEL=%~2"
set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    if not defined seen_%%P (
        set "seen_%%P=1"
        set "FOUND=1"
        taskkill /PID %%P /T /F >nul 2>nul
        if !ERRORLEVEL! equ 0 (
            echo Stopped %LABEL% process on port %PORT% (PID %%P).
        )
    )
)

if not defined FOUND (
    echo No %LABEL% process found on port %PORT%.
)

exit /b 0
