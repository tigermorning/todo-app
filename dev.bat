@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat

REM 포트 8000 사용 중인 프로세스가 있으면 종료 (안 하면 두 번째 실행이 바인드 실패로 바로 죽음)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo 기존 서버 프로세스(%%a) 종료 중...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 >nul
)

REM 절대경로 계산
set "ABS_PATH=%~dp0"
set "ABS_PATH=%ABS_PATH:~0,-1%"

echo 개발 모드로 시작 중... (reload 활성화, http://127.0.0.1:8000)
uvicorn main:app --reload --reload-dir="%ABS_PATH%" --reload-exclude="%ABS_PATH%\venv" --reload-exclude="%ABS_PATH%\__pycache__"
pause
