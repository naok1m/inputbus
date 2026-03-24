@echo off
:: Requires ViGEmBus installer — download from GitHub releases
sc query ViGEmBus >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing ViGEmBus driver...
    vigembus_setup.exe /silent
)
echo ViGEmBus ready.