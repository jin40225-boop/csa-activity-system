# 活動與教育訓練系統 — 部署到 NAS（Windows PowerShell 5.1 相容）
# 用法（在專案資料夾的 PowerShell）：
#   .\部署\部署到NAS.ps1 -Root <系統資料夾>                 → 更新程式（不動資料）
#   .\部署\部署到NAS.ps1 -Root <系統資料夾> -Init           → 第一次部署：另外建立 資料、範本、備份 與空白資料庫（三個帳號、書信公版預設值）
#   .\部署\部署到NAS.ps1 -Root <系統資料夾> -Init -Demo     → 同上，但放入示範資料（試用期用；正式上線請用不含 -Demo）
#   -Root 必填：系統資料夾的完整路徑（例如 \\NAS\共用\活動與教育訓練系統，或本機測試資料夾）
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$Init,
    [switch]$Demo,
    [string[]]$Users = @('supervisor', 'worker1', 'worker2'),
    [string]$Names = ''   # 三個帳號顯示名稱（督導,社工一,社工二），只在 -Init 時寫入
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Repo

# 1. 工作樹乾淨才部署（部署出去的版本一定對得到 commit）
$dirty = git status --porcelain
if ($dirty) { Write-Host '有尚未提交的修改，先 commit 再部署：'; Write-Host $dirty; exit 1 }
$rev = (git rev-parse --short HEAD).Trim()

# 2. 發行（資料夾形式、自帶 .NET；不用單一 exe：會解壓到暫存資料夾而找不到 app\index.html）
$pub = Join-Path $Repo 'publish'
if (Test-Path $pub) { Remove-Item -Recurse -Force $pub }
dotnet publish src\ActivitySystem.App\ActivitySystem.App.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false "-p:SourceRevisionId=$rev" -o $pub
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish 失敗' }
Set-Content -LiteralPath (Join-Path $pub 'version.txt') -Value $rev -Encoding ASCII
Copy-Item -LiteralPath (Join-Path $Repo '部署\啟動器.ps1') -Destination (Join-Path $pub '啟動器.ps1') -Force

# 3. 複製到 NAS\程式（不覆蓋 config.json）
$prog = Join-Path $Root '程式'
New-Item -ItemType Directory -Force -Path $prog | Out-Null
& robocopy $pub $prog /MIR /XF config.json /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy 失敗：$LASTEXITCODE" }
Copy-Item -LiteralPath (Join-Path $Repo '部署\啟動器.ps1') -Destination (Join-Path $Root '啟動器.ps1') -Force

# 4. 第一次：建立資料夾與資料庫（已有資料庫就只補結構與公版，不動資料）
if ($Init) {
    $args2 = @('--init', "`"$Root`""); if ($Demo) { $args2 += '--demo' }; if ($Names) { $args2 += @('--names', "`"$Names`"") }
    $p = Start-Process -FilePath (Join-Path $pub 'ActivitySystem.exe') -ArgumentList $args2 -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { throw '建立資料庫失敗' }
}

# 5. 每人一個捷徑（放在系統根資料夾）
$nl = @($Names -split '[,，、]' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$labels = if ($nl.Count -eq 3) { @{ supervisor = $nl[0]; worker1 = $nl[1]; worker2 = $nl[2] } } else { @{ supervisor = '督導'; worker1 = '社工一'; worker2 = '社工二' } }
$sh = New-Object -ComObject WScript.Shell
foreach ($u in $Users) {
    $label = if ($labels.ContainsKey($u)) { $labels[$u] } else { $u }
    $lnk = $sh.CreateShortcut((Join-Path $Root "啟動＿活動與教育訓練系統＿$label.lnk"))
    $lnk.TargetPath = 'powershell.exe'
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $Root '啟動器.ps1')`" -User $u"
    $lnk.IconLocation = (Join-Path $prog 'ActivitySystem.exe') + ',0'
    $lnk.Description = "活動與教育訓練系統（$label）"
    $lnk.Save()
}

# 6. 從 NAS 路徑實際跑一次自我檢查
$rp = Join-Path $env:TEMP ('activity_deploy_' + [guid]::NewGuid().ToString('N') + '.txt')
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root '啟動器.ps1') -User $Users[0] -SelfTest -Report $rp
$ok = (Test-Path $rp) -and ((Get-Content $rp -Encoding UTF8) -match 'SELFTEST PASS')
Get-Content $rp -Encoding UTF8 -ErrorAction SilentlyContinue

# 7. 部署紀錄
$logLine = "| $(Get-Date -Format 'yyyy-MM-dd HH:mm') | $rev | $env:USERNAME | $(if ($ok) { 'SELFTEST PASS' } else { 'SELFTEST FAIL' }) |"
$logFile = Join-Path $Root '版本與部署紀錄.md'
if (-not (Test-Path $logFile)) { Set-Content -LiteralPath $logFile -Value "| 時間 | 版本 | 部署者 | 自我檢查 |`r`n|---|---|---|---|" -Encoding UTF8 }
Add-Content -LiteralPath $logFile -Value $logLine -Encoding UTF8
if (-not $ok) { Write-Host '自我檢查沒過，請看上面的訊息。'; exit 1 }
Write-Host "部署完成：$rev → $Root"
