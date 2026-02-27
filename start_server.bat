@echo off
title Azkar Reader Server
echo ========================================
echo    Azkar Reader - Local Server
echo ========================================
echo.

cd /d "%~dp0"

echo Starting server...
echo.

:: Try Python 3 first
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Found Python - starting server at http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server.
    echo ========================================
    start http://localhost:8000
    python -m http.server 8000
    goto :end
)

:: Try Python via py launcher
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Found Python - starting server at http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server.
    echo ========================================
    start http://localhost:8000
    py -m http.server 8000
    goto :end
)

:: Try Node.js npx serve
where npx >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Found Node.js - starting server at http://localhost:3000
    echo.
    echo Press Ctrl+C to stop the server.
    echo ========================================
    start http://localhost:3000
    npx serve -l 3000
    goto :end
)

:: Try PowerShell HTTP server as last resort
echo [!] Python and Node.js not found.
echo [!] Trying PowerShell server...
echo.
start http://localhost:8000
powershell -ExecutionPolicy Bypass -Command ^
  "$listener = [System.Net.HttpListener]::new(); $listener.Prefixes.Add('http://localhost:8000/'); $listener.Start(); Write-Host '[OK] Server running at http://localhost:8000'; Write-Host 'Press Ctrl+C to stop.'; while ($listener.IsListening) { $ctx = $listener.GetContext(); $path = $ctx.Request.Url.LocalPath; if ($path -eq '/') { $path = '/index.html' }; $file = Join-Path '%~dp0' $path.TrimStart('/'); if (Test-Path $file) { $bytes = [IO.File]::ReadAllBytes($file); $ext = [IO.Path]::GetExtension($file); $mime = @{'.html'='text/html';'.css'='text/css';'.js'='application/javascript';'.json'='application/json';'.pdf'='application/pdf';'.svg'='image/svg+xml'}; $ctx.Response.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }; $ctx.Response.ContentLength64 = $bytes.Length; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) } else { $ctx.Response.StatusCode = 404 }; $ctx.Response.Close() }"

:end
pause
