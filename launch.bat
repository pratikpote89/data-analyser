@echo off
title Data Analyser
echo.
echo  ==============================
echo    Starting Data Analyser...
echo  ==============================
echo.

cd /d "%~dp0"

:: Wait 2 seconds then open in a NEW browser window
start "" cmd /c "timeout /t 2 /nobreak >nul && python -m webbrowser -n http://localhost:5000"

:: Start the Flask app
python app.py

pause
