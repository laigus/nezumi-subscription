param(
  [string]$ExePath = "",
  [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $releaseDirectory = Join-Path $root 'release'
  $latestRelease = Get-ChildItem -LiteralPath $releaseDirectory -Filter '账耗-*.exe' -File |
    ForEach-Object {
      if ($_.Name -match '^账耗-(\d+\.\d+\.\d+)\.exe$') {
        [PSCustomObject]@{ File = $_; Version = [Version]$Matches[1] }
      }
    } |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if ($null -eq $latestRelease) {
    throw "发布目录中没有可执行程序：$releaseDirectory"
  }
  $ExePath = $latestRelease.File.FullName
}
$resolvedExe = [IO.Path]::GetFullPath($ExePath)
if (-not (Test-Path -LiteralPath $resolvedExe -PathType Leaf)) {
  throw "未找到可执行程序：$resolvedExe"
}

New-Item -ItemType Directory -Force -Path $DesktopDirectory | Out-Null
$shortcutPath = Join-Path ([IO.Path]::GetFullPath($DesktopDirectory)) '账耗.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $resolvedExe
$shortcut.WorkingDirectory = Split-Path -Parent $resolvedExe
$shortcut.IconLocation = "$resolvedExe,0"
$shortcut.Description = '透明悬浮的本地账号与订阅管理器'
$shortcut.Save()

if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
  throw "快捷方式创建后未找到：$shortcutPath"
}
$check = $shell.CreateShortcut($shortcutPath)
if ([IO.Path]::GetFullPath($check.TargetPath) -ne $resolvedExe) {
  throw '快捷方式目标校验失败'
}

if (-not ('ZhangHao.ShellRefresh' -as [Type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace ZhangHao {
  public static class ShellRefresh {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);
  }
}
'@
}
[ZhangHao.ShellRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Output "shortcut=$shortcutPath"
Write-Output "target=$resolvedExe"
Write-Output "icon=$($check.IconLocation)"
Write-Output 'desktopIconRefreshNotified=True'
Write-Output 'verified=True'
