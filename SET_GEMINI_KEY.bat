@echo off
cd /d "%~dp0"
echo ============================================================
echo  KrishiNetra - add / replace your Gemini API key
echo ============================================================
python -m pip install -q -r requirements.txt
python check_gemini.py --set
echo.
pause
