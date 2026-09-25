# Собирает Gemini.exe из launcher\Gemini.cs встроенным в Windows компилятором C#.
# Иконку Gemini скачивает с сайта Google (в репозиторий она не кладётся).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$icon = Join-Path $root 'launcher\gemini.ico'
$exe  = Join-Path $root 'Gemini.exe'

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'Не найден компилятор C# (.NET Framework 4). Он есть в Windows 10/11 по умолчанию.' }

# Иконка: PNG Gemini с сайта Google, упакованный в .ico 256x256
if (-not (Test-Path $icon)) {
  try {
    Add-Type -AssemblyName System.Drawing
    $png = Join-Path $env:TEMP 'gemini-icon.png'
    Invoke-WebRequest -UseBasicParsing 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=256' -OutFile $png
    $src = [System.Drawing.Image]::FromFile($png)
    $bmp = New-Object System.Drawing.Bitmap 256, 256
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($src, 0, 0, 256, 256)
    $g.Dispose(); $src.Dispose()
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    $data = $ms.ToArray()
    $w = New-Object IO.BinaryWriter ([IO.File]::Create($icon))
    $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)              # ICONDIR
    $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0) # 256x256
    $w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$data.Length); $w.Write([UInt32]22)
    $w.Write($data); $w.Close()
    Remove-Item $png
  } catch {
    Write-Warning "Не удалось скачать иконку, Gemini.exe будет без неё: $_"
  }
}

$cscArgs = @('/nologo', '/target:winexe', '/optimize+', '/codepage:65001', "/out:$exe", '/r:System.Windows.Forms.dll')
if (Test-Path $icon) { $cscArgs += "/win32icon:$icon" }
$cscArgs += (Join-Path $root 'launcher\Gemini.cs')
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw 'Сборка Gemini.exe не удалась.' }
Write-Host "Собран: $exe"
