# Удаляет ярлыки Gemini. Сама папка с приложением остаётся: чтобы удалить всё
# (включая вход в аккаунт в profile\), просто удалите папку.
$root = $PSScriptRoot

# Закрыть окно Gemini, запущенное из этой папки
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
  Where-Object { $_.CommandLine -like "*$root\profile*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($dir in @($root, [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = Join-Path $dir 'Gemini.lnk'
  if (Test-Path $lnk) { Remove-Item $lnk; Write-Host "Удалён ярлык: $lnk" }
}
Write-Host "Готово. Чтобы удалить приложение полностью, удалите папку:`n$root" -ForegroundColor Green
