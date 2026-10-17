# Coopanion one-line installer for Windows 10/11 (x64).
#
#   irm https://raw.githubusercontent.com/yxengram/Coopanion/main/installer/install.ps1 | iex
#
# Downloads the installer of the latest GitHub release into %TEMP%, runs it, and deletes it. The
# installer is per-user (no administrator rights) and asks for the install directory.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'yxengram/Coopanion'
# Chinese on a Chinese Windows (Simplified or Traditional), as the app itself; English on any other
$zh = (Get-UICulture).Name -like 'zh*'
Write-Host $(if ($zh) { '正在查找最新版本…' } else { 'Looking for the latest release…' })
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'Coopanion-installer' }
$asset = $release.assets | Where-Object { $_.name -like 'Coopanion-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw $(if ($zh) { "最新版本 $($release.tag_name) 里没有安装程序。" } else { "The latest release $($release.tag_name) has no installer." }) }

$target = Join-Path $env:TEMP $asset.name
$size = [math]::Round($asset.size / 1MB)
Write-Host $(if ($zh) { "正在下载 $($asset.name)($size MB)…" } else { "Downloading $($asset.name) ($size MB)…" })
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $target -UseBasicParsing

Write-Host $(if ($zh) { '正在安装…' } else { 'Installing…' })
Start-Process -FilePath $target -Wait
Remove-Item $target -ErrorAction SilentlyContinue
Write-Host $(if ($zh) { 'Coopanion 装好了:桌面上有它的图标。第一次打开时填入 DeepSeek 的 API Key 就能用。' } else { 'Coopanion is installed: its icon is on the desktop. Enter an API key for a model service (DeepSeek if unsure) the first time you open it.' })
