$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
    $pid3000 = $conns[0].OwningProcess
    Write-Host "Killing PID $pid3000 on port 3000"
    Stop-Process -Id $pid3000 -Force
    Start-Sleep 2
    Write-Host "Done"
} else {
    Write-Host "Port 3000 not in use"
}
