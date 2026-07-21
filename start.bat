@echo off
chcp 65001 >nul
cd /d "%~dp0"
call venv\Scripts\activate.bat

:restart
REM 포트 8090 사용 중인 프로세스가 있으면 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8090 ^| findstr LISTENING') do (
    echo 기존 서버 프로세스(%%a) 종료 중...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 >nul
)

echo.
echo ========================================
echo   서버 시작 (http://127.0.0.1:8090)
echo   종료하려면 Ctrl+C를 누르세요
echo ========================================
echo.

uvicorn main:app --host 127.0.0.1 --port 8090

echo.
echo 서버가 종료되었습니다.
set /p RESTART="자동으로 재시작할까요? (Y/N): "
if /i "%RESTART%"=="Y" goto restart

pause
