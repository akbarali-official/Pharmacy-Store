@echo off
echo === VIP Pharmacy FRONTEND install ===
if not exist .env copy .env.example .env
call npm install
if errorlevel 1 (echo Error aaya - upar parhein & pause & exit /b)
echo Install mukammal. Ab 2-start.bat chalayein.
pause
