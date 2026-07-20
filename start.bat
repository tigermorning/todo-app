@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
uvicorn main:app --reload --reload-dir="%~dp0" --reload-exclude="venv/*" --reload-exclude="__pycache__/*"
pause
