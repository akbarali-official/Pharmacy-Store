@echo off
echo === VIP Pharmacy BACKEND install ===
if not exist .env (
  copy .env.example .env
  echo.
  echo .env file ban gayi hai. Ab Notepad se .env kholein, DATABASE_URL mein apna PostgreSQL password
  echo likhein aur JWT_SECRET ko lambi random string se badal dein. Phir yeh file dobara chalayein.
  notepad .env
  pause
  exit /b
)
call npm install
if errorlevel 1 goto fail
call npx prisma generate
if errorlevel 1 goto fail
call npx prisma migrate dev --name init
if errorlevel 1 goto fail
echo.
echo Demo data chahiye? (sirf test ke liye)  =>  npm run db:seed
echo Install mukammal. Ab 2-start.bat chalayein.
pause
exit /b
:fail
echo.
echo KUCH GHALAT HUA - upar ka error parhein (aksar PostgreSQL chal nahi raha ya password ghalat hai).
pause
