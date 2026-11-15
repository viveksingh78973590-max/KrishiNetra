@echo off
cd /d "%~dp0"
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
  ) else (
    echo .env file not found. Create a file named .env containing:  GEMINI_API_KEY=your_key
    pause
    exit /b 1
  )
)
python -m pip install -r requirements.txt
REM Asks for a Gemini key only if none is saved yet (AI KrishiNetra and Fasal Vaidya need one).
python check_gemini.py --ensure
python server.py
pause
