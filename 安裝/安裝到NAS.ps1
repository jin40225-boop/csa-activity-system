# 活動與教育訓練系統 — 安裝到 NAS（不需要開發工具；Windows PowerShell 5.1 可執行）
#
# 用法（在任何一台連得到 NAS 的 Windows 電腦，PowerShell 執行）：
#   .\安裝到NAS.ps1 -Root '\\NAS主機\共用資料夾\某處' -Names '督導姓名,社工一姓名,社工二姓名' -Demo
#
#   -Root     要安裝到的 NAS 資料夾（必須已有寫入權限）。程式會在裡面建立「活動與教育訓練系統」資料夾。
#   -Names    三個帳號的顯示名稱，依序：督導、社工一、社工二（逗號分隔）。
#   -Demo     放入示範用的虛構場次與名冊（試用期建議加；正式上線不加）。
#   -Package  安裝包（zip）的網址或本機路徑；不填就下載 GitHub 最新版。
#
# 可以重複執行：已有資料庫時不會清掉資料，只更新程式、補結構、更新三個帳號的名稱。
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Names,
    [switch]$Demo,
    [string]$Package = 'https://github.com/jin40225-boop/csa-activity-system/releases/latest/download/ActivitySystem-win-x64.zip'
)
$ErrorActionPreference = 'Stop'
function Step([string]$m) { Write-Host ''; Write-Host "▶ $m" -ForegroundColor Cyan }

$nameList = @($Names -split '[,，、]' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($nameList.Count -ne 3) { throw "Names 要剛好三個名字（督導、社工一、社工二），用逗號分隔。目前收到：$Names" }

Step '1. 檢查 NAS 資料夾'
if (-not (Test-Path -LiteralPath $Root)) { throw "連不到這個資料夾：$Root`n請確認路徑正確、網路磁碟已連線、帳號有權限。" }
$Sys = Join-Path $Root '活動與教育訓練系統'
New-Item -ItemType Directory -Force -Path $Sys | Out-Null
$probe = Join-Path $Sys ('寫入測試_' + [guid]::NewGuid().ToString('N') + '.tmp')
try { Set-Content -LiteralPath $probe -Value 'ok'; Remove-Item -LiteralPath $probe -Force } catch { throw "這個資料夾沒有寫入權限：$Sys" }
Write-Host "   安裝位置：$Sys"

Step '2. 取得安裝包'
$tmp = Join-Path $env:TEMP ('ActivitySystem_install_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'pkg.zip'
if ($Package -match '^https?://') {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host "   下載：$Package"
    Invoke-WebRequest -Uri $Package -OutFile $zip -UseBasicParsing
} else { Copy-Item -LiteralPath $Package -Destination $zip }
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'pkg') -Force
$pkg = Join-Path $tmp 'pkg'
if (-not (Test-Path (Join-Path $pkg 'ActivitySystem.exe'))) { throw '安裝包內容不完整（找不到 ActivitySystem.exe）。' }
$ver = if (Test-Path (Join-Path $pkg 'version.txt')) { (Get-Content (Join-Path $pkg 'version.txt') -Raw).Trim() } else { '?' }
Write-Host "   版本：$ver"

Step '3. 複製程式到 NAS'
$prog = Join-Path $Sys '程式'
New-Item -ItemType Directory -Force -Path $prog | Out-Null
& robocopy $pkg $prog /MIR /XF config.json 啟動器.ps1 /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "複製程式失敗（robocopy $LASTEXITCODE）。如果有人正開著系統，請先關閉再裝。" }
Copy-Item -LiteralPath (Join-Path $pkg '啟動器.ps1') -Destination (Join-Path $Sys '啟動器.ps1') -Force

Step '4. 建立資料夾、資料庫與三個帳號'
$initArgs = @('--init', "`"$Sys`"", '--names', "`"$($nameList -join ',')`"")
if ($Demo) { $initArgs += '--demo' }
$psi = New-Object System.Diagnostics.ProcessStartInfo (Join-Path $pkg 'ActivitySystem.exe')
$psi.Arguments = $initArgs -join ' '
$psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true
$p = [System.Diagnostics.Process]::Start($psi); $out = $p.StandardOutput.ReadToEnd(); $p.WaitForExit()
Write-Host $out
if ($p.ExitCode -ne 0) { throw '建立資料庫失敗。' }

Step '5. 建立每人一個啟動捷徑'
$users = @('supervisor', 'worker1', 'worker2')
$sh = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt 3; $i++) {
    $lnkPath = Join-Path $Sys "啟動＿活動與教育訓練系統＿$($nameList[$i]).lnk"
    $lnk = $sh.CreateShortcut($lnkPath)
    $lnk.TargetPath = 'powershell.exe'
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $Sys '啟動器.ps1')`" -User $($users[$i])"
    $lnk.IconLocation = (Join-Path $prog 'ActivitySystem.exe') + ',0'
    $lnk.Description = "活動與教育訓練系統（$($nameList[$i])）"
    $lnk.Save()
    Write-Host "   $lnkPath"
}

Step '6. 從 NAS 實際跑一次自我檢查'
$rp = Join-Path $tmp 'selftest.txt'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Sys '啟動器.ps1') -User supervisor -SelfTest -Report $rp | Out-Null
$report = if (Test-Path $rp) { Get-Content $rp -Encoding UTF8 } else { @('沒有產生檢查報告') }
$report | ForEach-Object { Write-Host "   $_" }
$ok = ($report -join "`n") -match 'SELFTEST PASS'

$logFile = Join-Path $Sys '版本與部署紀錄.md'
if (-not (Test-Path $logFile)) { Set-Content -LiteralPath $logFile -Value "| 時間 | 版本 | 安裝者 | 自我檢查 |`r`n|---|---|---|---|" -Encoding UTF8 }
Add-Content -LiteralPath $logFile -Value "| $(Get-Date -Format 'yyyy-MM-dd HH:mm') | $ver | $env:USERNAME@$env:COMPUTERNAME | $(if ($ok) { 'SELFTEST PASS' } else { 'SELFTEST FAIL' }) |" -Encoding UTF8
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

Write-Host ''
if (-not $ok) { Write-Host '安裝完成，但自我檢查沒過，請看上面的訊息。' -ForegroundColor Red; exit 1 }
Write-Host "安裝完成（版本 $ver）。" -ForegroundColor Green
Write-Host "到這個資料夾，雙擊自己名字的捷徑開啟：$Sys"
