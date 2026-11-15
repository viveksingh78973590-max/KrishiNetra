@echo off
cd /d "%~dp0"
python -m pip install -q -r requirements.txt
python check_gemini.py
echo.
pause
