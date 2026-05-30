@echo off
echo ============================================
echo   Setting up cmux Windows v0.1.0
echo ============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo pnpm not found. Installing pnpm via npm...
    npm install -g pnpm
)

echo.
echo [1/2] Installing workspace dependencies...
echo ----------------------------------------
cd /d "%~dp0"
call pnpm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: pnpm install failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Typechecking cmux Windows...
echo ----------------------------------------
call pnpm typecheck
if %ERRORLEVEL% neq 0 (
    echo ERROR: typecheck failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup complete!
echo   Run: run.bat
echo ============================================
pause
