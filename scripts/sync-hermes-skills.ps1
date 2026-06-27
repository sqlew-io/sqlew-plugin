# Sync root skills/ into .hermes-plugin/skills/ before publishing the Hermes bundle.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root '.hermes-plugin\skills'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $root 'skills\*') $dest
Write-Host "Synced skills to $dest"