@echo off
rem ============================================================
rem  Booth launcher: starts the local server, then opens the game
rem  full-screen in Chrome with sound allowed from the first second
rem  (the title music plays right away, no "press any key" screen).
rem  Close the game window with Alt+F4. Close this window to stop the server.
rem ============================================================
cd /d "%~dp0"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

start "BUU game server" /min cmd /c "npm run local"

rem Network check before Chrome covers the screen: LAN address, firewall, internet, and a
rem phone test (scan the QR it prints). It waits for the server itself. Enter skips the phone test.
chcp 65001 >nul
node tools\booth-check.js --wait=25
if errorlevel 1 (
  echo.
  echo   Something needs a look ^(see above^). Press any key to open the game - it opens by itself in 60 s.
  timeout /t 60 >nul
)

if exist "%CHROME%" (
  rem A separate profile keeps the flags (and the booth's hall of fame) apart from everyday Chrome.
  start "" "%CHROME%" --user-data-dir="%LocalAppData%\buu-booth-chrome" --autoplay-policy=no-user-gesture-required --kiosk --no-first-run --disable-session-crashed-bubble http://localhost:3000/
) else (
  echo Chrome not found - opening the default browser instead (the game will ask for one press before the music starts).
  start "" http://localhost:3000/
)
