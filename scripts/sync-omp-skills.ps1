# Sync root skills/ into .omp-plugin/skills/ before publishing the omp bundle.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root '.omp-plugin\skills'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $root 'skills\*') $dest
Write-Host "Synced skills to $dest"
