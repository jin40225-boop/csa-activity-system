# 本機試用：在這台電腦同時開三個帳號（督導、社工一、社工二），資料放在本機模擬的 NAS 資料夾。
# 用法：在專案資料夾的 PowerShell 執行  .\部署\本機試用_三個帳號.ps1   （加 -Reset 會重建一份乾淨的示範資料）
param([switch]$Reset, [string]$Names = '')
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Repo
dotnet build src\ActivitySystem.App\ActivitySystem.App.csproj -v q -nologo | Out-Null
if ($LASTEXITCODE -ne 0) { throw '建置失敗' }
$exe = Join-Path $Repo 'src\ActivitySystem.App\bin\Debug\net10.0-windows\ActivitySystem.exe'
$nas = Join-Path $Repo '_local\nas'
if ($Reset -or -not (Test-Path (Join-Path $nas '資料\activity.db'))) {
    if (Test-Path $nas) { Remove-Item -Recurse -Force $nas }
    & $exe --init $nas --demo | Out-Null
}
if ($Names) { & $exe --init $nas --names $Names | Out-Null }   # 更新三個帳號的顯示名稱（不動資料）
$cfg = @{ dataPath = (Join-Path $nas '資料\activity.db'); filesDir = (Join-Path $nas '資料\附件'); templatesDir = (Join-Path $nas '範本'); backupDir = (Join-Path $nas '備份') } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path (Split-Path $exe) 'config.json'), $cfg, (New-Object System.Text.UTF8Encoding($false)))
foreach ($u in 'supervisor', 'worker1', 'worker2') { Start-Process -FilePath $exe -ArgumentList "--user $u"; Start-Sleep -Milliseconds 800 }
Write-Host "已開啟三個帳號。資料在：$nas"
