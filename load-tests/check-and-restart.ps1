# fixture 활성화 여부 확인 후, 필요시 서버 재시작
$port = 3000
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connections) {
    $pid3000 = ($connections | Where-Object { $_.State -eq 'Listen' } | Select-Object -First 1).OwningProcess
    Write-Host "Port 3000 used by PID: $pid3000"
    # fixture create 호출 테스트
    try {
        $body = '{}'
        $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/e2e/auction-fixture/create" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 5
        Write-Host "Fixture create OK: $($resp | ConvertTo-Json -Compress)"
    } catch {
        $errBody = $_.ErrorDetails.Message
        Write-Host "Fixture create failed: $errBody"
        Write-Host "  -> E2E_AUCTION_FIXTURE not set. Killing PID $pid3000 and restarting..."
        Stop-Process -Id $pid3000 -Force -ErrorAction SilentlyContinue
        Start-Sleep 2
        # 재시작
        . "$PSScriptRoot\start-server.ps1"
    }
} else {
    Write-Host "Port 3000 not in use. Starting server..."
    . "$PSScriptRoot\start-server.ps1"
}
