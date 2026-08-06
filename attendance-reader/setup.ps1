$ErrorActionPreference = 'Stop'
$readerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $readerRoot
npm install
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'KalmiaAttendanceReader.cmd'
$nodePath = (Get-Command node).Source
$command = "@echo off`r`ncd /d `"$readerRoot`"`r`n`"$nodePath`" reader.mjs >> `"$env:LOCALAPPDATA\KalmiaAttendanceReader\reader.log`" 2>&1`r`n"
[IO.File]::WriteAllText($shortcutPath, $command, [Text.UTF8Encoding]::new($false))
Write-Host 'セットアップ完了。Windowsへ再サインインすると自動起動します。'
