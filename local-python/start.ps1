# Launch Smart Garage Access Server
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting Smart Garage Access Controller   " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan

python server.py
