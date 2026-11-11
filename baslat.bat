@echo off
title Madenci Home - Aile Evi
cd /d "%~dp0"
echo ========================================================
echo   Madenci Home - Aile Evi (Kotasiz Yerel Sistem)
echo ========================================================
echo.
echo Tarayicinizda acin: http://localhost:3000
echo Sunucuyu kapatmak icin bu pencereyi kapatabilirsiniz.
echo.
call npm.cmd start
pause
