# ProcessStartInfo로 E2E_AUCTION_FIXTURE=1 환경변수를 명시 주입하여 dev server 시작
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/c npm run dev'
$psi.WorkingDirectory = 'D:\development\league-auction'
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $false
$psi.RedirectStandardError = $false

# 현재 환경변수 복사 후 E2E_AUCTION_FIXTURE 추가
foreach ($key in [System.Environment]::GetEnvironmentVariables().Keys) {
    if (-not $psi.EnvironmentVariables.ContainsKey($key)) {
        $psi.EnvironmentVariables[$key] = [System.Environment]::GetEnvironmentVariable($key)
    }
}
$psi.EnvironmentVariables['E2E_AUCTION_FIXTURE'] = '1'

$proc = [System.Diagnostics.Process]::Start($psi)
Write-Host "Started PID: $($proc.Id)"
Write-Host 'Waiting 25s for server to be ready...'
Start-Sleep 25
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/e2e/auction-fixture/state?roomId=test' -UseBasicParsing -TimeoutSec 5
    Write-Host "Fixture API response: $($resp.StatusCode) - $($resp.Content.Substring(0,[Math]::Min(100,$resp.Content.Length)))"
} catch {
    Write-Host "Check failed: $_"
}
