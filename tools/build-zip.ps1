<#
.SYNOPSIS
    Packs the extension into a zip ready to upload to the Chrome Web Store.

.DESCRIPTION
    Copies only the files the extension actually needs into a staging folder, checks that
    the references in manifest.json resolve, then zips it. Repository files that must not
    be shipped (.git, the markdown docs, the local tooling folders) are never copied, so
    they cannot leak into the package.

.PARAMETER OutDir
    Where to write the zip. Defaults to <repo>\build.

.PARAMETER Force
    Overwrite the zip if it already exists.

.EXAMPLE
    pwsh tools\build-zip.ps1

.EXAMPLE
    pwsh tools\build-zip.ps1 -OutDir D:\releases -Force
#>
[CmdletBinding()]
param(
    [string] $OutDir,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $repoRoot 'build' }

# Everything that has to end up in the package. Add new top level files or folders here.
$include = @(
    '_locales',
    'css',
    'fonts',
    'images',
    'libs',
    'scripts',
    'background.js',
    'main.js',
    'manifest.json',
    'options.html',
    'options.js',
    'projects.js'
)

# Dropped even when they sit inside an included folder
$excludePatterns = @('*.md', '*.zip', '*.crx', '*.pem', '.DS_Store', 'Thumbs.db')

$manifestPath = Join-Path $repoRoot 'manifest.json'
if (-not (Test-Path $manifestPath)) { throw "manifest.json not found in $repoRoot" }

$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw 'manifest.json has no version field' }

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('avr-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
    foreach ($entry in $include) {
        $source = Join-Path $repoRoot $entry
        if (-not (Test-Path $source)) { throw "Required entry is missing from the repository: $entry" }
        Copy-Item -Path $source -Destination $stage -Recurse -Force
    }

    foreach ($pattern in $excludePatterns) {
        Get-ChildItem -Path $stage -Recurse -Force -Filter $pattern |
            Remove-Item -Recurse -Force -Confirm:$false
    }

    # Fail here rather than after uploading a package with a broken reference
    $referenced = @()
    if ($manifest.background.service_worker) { $referenced += $manifest.background.service_worker }
    if ($manifest.icons) { $referenced += $manifest.icons.PSObject.Properties.Value }
    foreach ($resource in $manifest.web_accessible_resources) { $referenced += $resource.resources }

    foreach ($reference in ($referenced | Where-Object { $_ })) {
        if (-not (Test-Path (Join-Path $stage $reference))) {
            throw "manifest.json references a file that is not in the package: $reference"
        }
    }

    if ($manifest.default_locale) {
        $defaultMessages = Join-Path $stage "_locales\$($manifest.default_locale)\messages.json"
        if (-not (Test-Path $defaultMessages)) {
            throw "The default locale _locales\$($manifest.default_locale) has no messages.json"
        }
    }

    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

    $zipPath = Join-Path $OutDir "auto-vote-rating-$version.zip"
    if (Test-Path $zipPath) {
        if (-not $Force) { throw "$zipPath already exists, pass -Force to overwrite it" }
        Remove-Item $zipPath -Force
    }

    # ZipFile is used instead of Compress-Archive because it always writes forward slashes
    if (-not ('System.IO.Compression.ZipFile' -as [type])) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
    }
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $stage, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

    $staged = Get-ChildItem -Path $stage -Recurse -File
    $zip = Get-Item $zipPath

    Write-Host ''
    Write-Host "Auto Vote Rating $version" -ForegroundColor Green
    Write-Host ("  {0} files, {1:N0} KB on disk, {2:N0} KB zipped" -f `
        $staged.Count, (($staged | Measure-Object Length -Sum).Sum / 1KB), ($zip.Length / 1KB))
    Write-Host "  $zipPath"
    Write-Host ''

    if ($zip.Length -gt 100MB) {
        Write-Warning 'The Chrome Web Store rejects packages over 100 MB'
    }
}
finally {
    Remove-Item -Path $stage -Recurse -Force -ErrorAction SilentlyContinue
}
