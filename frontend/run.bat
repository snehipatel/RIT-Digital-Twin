@echo off
echo ================================================
echo   ClimaTwin India — Local Dev Server
echo ================================================
echo.
echo Starting server at http://localhost:8765...
echo Press Ctrl+C to stop.
echo.
start "" "http://localhost:8765"

where python >nul 2>nul
if %errorlevel%==0 (
    python -m http.server 8765
    exit /b
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -m http.server 8765
    exit /b
)

npx -y serve . -l 8765