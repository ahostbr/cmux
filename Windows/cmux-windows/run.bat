@echo off
title cmux Windows
echo Starting cmux Windows...
echo.

cd /d "%~dp0"
call pnpm dev

echo.
echo cmux Windows stopped.
