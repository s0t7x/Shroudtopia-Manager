// src/serverScript.js
const PS_TEMPLATE = `
# CONFIGURATION
$ExeName = "enshrouded_server.exe"
$RestartHour = {{RESTART_HOUR}}
$Priority = "{{PRIORITY}}"
$AffinityMask = {{AFFINITY}}

# --- SCRIPT START ---
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $PSScriptRoot

Write-Host "--- Enshrouded Process Manager Started ---" -ForegroundColor Cyan
$RestartedToday = $false

while($true) {
    Write-Host "[$(Get-Date)] Launching $ExeName..." -ForegroundColor Green
    
    # Start the server
    $ServerProcess = Start-Process -FilePath ".\\$ExeName" -PassThru -WindowStyle Normal
    
    # Wait for process to initialize before applying tweaks
    Start-Sleep -Seconds 5
    
    if ($ServerProcess -and !$ServerProcess.HasExited) {
        try {
            $ServerProcess.ProcessorAffinity = $AffinityMask
            $ServerProcess.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::$Priority
            Write-Host "[OK] Affinity and Priority applied." -ForegroundColor Gray
        } catch {
            Write-Host "[!] Failed to set affinity/priority. Are you Admin?" -ForegroundColor Red
        }
    }

    while (!$ServerProcess.HasExited) {
        $Now = Get-Date
        if ($Now.Hour -eq $RestartHour -and $Now.Minute -eq 0 -and !$RestartedToday) {
            Write-Host "[$(Get-Date)] Scheduled Restart. Shutting down..." -ForegroundColor Yellow
            taskkill /IM $ExeName
            $Timeout = 30
            while (!$ServerProcess.HasExited -and $Timeout -gt 0) { Start-Sleep -Seconds 1; $Timeout-- }
            if (!$ServerProcess.HasExited) { Stop-Process -Id $ServerProcess.Id -Force }
            $RestartedToday = $true
            break 
        }
        if ($Now.Hour -ne $RestartHour) { $RestartedToday = $false }
        Start-Sleep -Seconds 10
    }
    Write-Host "[!] Server stopped. Restarting in 10s..." -ForegroundColor Red
    Start-Sleep -Seconds 10
}
`;

module.exports = { PS_TEMPLATE };