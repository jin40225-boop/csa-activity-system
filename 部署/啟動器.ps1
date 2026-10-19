# 活動與教育訓練系統 — 共用啟動器（Windows PowerShell 5.1 相容）
# 每人一個捷徑呼叫：powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File 啟動器.ps1 -User <帳號>
# 做法沿用微旅 v2：先把程式同步到本機快取再執行（不跳「開啟檔案－安全性警告」、開得比較快），資料仍在 NAS。
param(
    [Parameter(Mandatory = $true)][string]$User,
    [switch]$SelfTest,
    [string]$Report = ''
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path      # 啟動器放在系統根資料夾（與 程式、資料、範本、備份 同層）
$Prog = Join-Path $Root '程式'
$DataPath = Join-Path $Root '資料\activity.db'
$Local = Join-Path $env:LOCALAPPDATA 'ActivitySystem'
$Cache = Join-Path $Local 'app'
$Log = Join-Path $Local 'launcher.log'

function Write-Log([string]$msg) {
    try { New-Item -ItemType Directory -Force -Path $Local | Out-Null; Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg) -Encoding UTF8 } catch { }
}
function Fail([string]$msg) {
    Write-Log ('失敗：' + $msg)
    if (-not $SelfTest) {
        try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($msg + "`r`n`r`n（紀錄：$Log）", '活動與教育訓練系統無法開啟', 'OK', 'Error') | Out-Null } catch { }
    }
    Write-Host $msg
    exit 1
}

try {
    if (-not (Test-Path -LiteralPath $DataPath)) { Fail "連不到系統資料：`r`n$DataPath`r`n`r`n請確認網路磁碟（NAS）連線正常。" }
    $exeSrc = Join-Path $Prog 'ActivitySystem.exe'
    if (-not (Test-Path -LiteralPath $exeSrc)) { Fail "找不到程式：$exeSrc" }

    # 本機快取：版本不同才同步；程式開著時不覆蓋，下次開再更新
    $verSrc = Join-Path $Prog 'version.txt'; $verDst = Join-Path $Cache 'version.txt'
    $src = if (Test-Path -LiteralPath $verSrc) { (Get-Content -LiteralPath $verSrc -Raw).Trim() } else { '' }
    $dst = if (Test-Path -LiteralPath $verDst) { (Get-Content -LiteralPath $verDst -Raw).Trim() } else { '' }
    $exeLocal = Join-Path $Cache 'ActivitySystem.exe'
    if ($src -ne $dst -or -not (Test-Path -LiteralPath $exeLocal)) {
        $running = Get-Process -Name 'ActivitySystem' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($Cache, [System.StringComparison]::OrdinalIgnoreCase) }
        if ($running -and (Test-Path -LiteralPath $exeLocal)) { Write-Log "有新版本（$src），程式使用中，這次先開目前版本（$dst）" }
        else {
            New-Item -ItemType Directory -Force -Path $Cache | Out-Null
            & robocopy $Prog $Cache /MIR /XF config.json /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { Fail "複製程式到本機失敗（robocopy $LASTEXITCODE）。請稍後再開一次。" }
            Write-Log "已更新本機程式：$dst → $src"
        }
    }

    # 本機設定：資料、附件、範本、備份一律指回 NAS（UNC）
    $cfg = @{ dataPath = $DataPath; filesDir = (Join-Path $Root '資料\附件'); templatesDir = (Join-Path $Root '範本'); backupDir = (Join-Path $Root '備份'); keepDailyBackups = 30 } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $Cache 'config.json'), $cfg, (New-Object System.Text.UTF8Encoding($false)))

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exeLocal
    $psi.WorkingDirectory = $Cache
    $psi.UseShellExecute = $false
    if ($SelfTest) {
        $rp = if ($Report) { $Report } else { Join-Path $env:TEMP ('activity_selftest_' + [guid]::NewGuid().ToString('N') + '.txt') }
        $psi.Arguments = "--selftest --user $User --report `"$rp`""
        $p = [System.Diagnostics.Process]::Start($psi); $p.WaitForExit(60000) | Out-Null
        if (Test-Path -LiteralPath $rp) { Get-Content -LiteralPath $rp -Encoding UTF8 }
        exit $p.ExitCode
    }
    $psi.Arguments = "--user $User"
    [System.Diagnostics.Process]::Start($psi) | Out-Null
    Write-Log "開啟：$User（$src）"
} catch { Fail $_.Exception.Message }
