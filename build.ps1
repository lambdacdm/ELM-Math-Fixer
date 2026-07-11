[CmdletBinding()]
param(
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$manifestPath = Join-Path $root 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$version = [string]$manifest.version

if (-not $version) {
  throw 'manifest.json does not contain a version.'
}

$readme = Get-Content -LiteralPath (Join-Path $root 'README.md') -Raw -Encoding utf8
if (-not $readme.Contains("Extension version: $version.")) {
  throw "README.md version does not match manifest.json ($version)."
}

if (-not $OutputPath) {
  $OutputPath = Join-Path (Split-Path $root -Parent) "ELM-Math-Fixer-v$version.zip"
} elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path (Get-Location) $OutputPath
}

$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path $OutputPath -Parent
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

$runtimeFiles = @(
  'manifest.json',
  'math-repair.js',
  'content.js',
  'prompts.js',
  'ui.css',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md'
)
$runtimeDirectories = @('icons', 'katex')
$files = [System.Collections.Generic.List[IO.FileInfo]]::new()

foreach ($relativePath in $runtimeFiles) {
  $file = Get-Item -LiteralPath (Join-Path $root $relativePath)
  $files.Add($file)
}

foreach ($relativePath in $runtimeDirectories) {
  Get-ChildItem -LiteralPath (Join-Path $root $relativePath) -Recurse -File |
    ForEach-Object { $files.Add($_) }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $entryName = $file.FullName.Substring($root.Length).TrimStart([char[]]'\/').Replace('\', '/')
    $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
    $entryStream = $entry.Open()
    $inputStream = $file.OpenRead()
    try {
      $inputStream.CopyTo($entryStream)
    } finally {
      $inputStream.Dispose()
      $entryStream.Dispose()
    }
  }
} finally {
  $archive.Dispose()
  $stream.Dispose()
}

$check = [IO.Compression.ZipFile]::OpenRead($OutputPath)
try {
  $entryNames = @($check.Entries | ForEach-Object FullName)
  foreach ($required in @('manifest.json', 'math-repair.js', 'content.js', 'prompts.js', 'ui.css', 'icons/icon128.png')) {
    if ($required -notin $entryNames) {
      throw "Package is missing $required."
    }
  }
  if ($entryNames | Where-Object { $_ -like '.git/*' -or $_ -like 'tests/*' -or $_ -eq 'package.json' }) {
    throw 'Package contains development-only files.'
  }
} finally {
  $check.Dispose()
}

[pscustomobject]@{
  Path = $OutputPath
  Version = $version
  Entries = $files.Count
  Size = (Get-Item -LiteralPath $OutputPath).Length
}
