# Fase 1: Vendorizar dependências externas
# Execute uma vez com internet para popular vendor/.
# Idempotente: pula arquivos já existentes.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

function New-VendorDir([string]$rel) {
    New-Item -ItemType Directory -Force -Path (Join-Path $root $rel) | Out-Null
}

function Get-Vendor([string]$url, [string]$rel, [hashtable]$headers = @{}) {
    $dest = Join-Path $root $rel
    if (Test-Path $dest) { Write-Host "  skip  $rel"; return }
    Write-Host "  fetch $rel"
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -Headers $headers
}

New-VendorDir "vendor/font-awesome/css"
New-VendorDir "vendor/font-awesome/webfonts"
New-VendorDir "vendor/fonts"

# ── JS libraries ───────────────────────────────────────────────────────────────
Write-Host "`n=== JS Libraries ==="
Get-Vendor "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"  "vendor/papaparse.min.js"
Get-Vendor "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"         "vendor/jszip.min.js"
Get-Vendor "https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js"                   "vendor/marked.min.js"
Get-Vendor "https://cdn.jsdelivr.net/npm/markdown2typst@0.1.4/+esm"                    "vendor/markdown2typst.esm.js"
# Toast UI Editor (avaliacao em andamento - editor WYSIWYG p/ introducao, ver index-wizard.html)
# Bundle "-all" so existe no CDN oficial NHN (uicdn.toast.com), nao no pacote npm @toast-ui/editor
Get-Vendor "https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js" "vendor/toastui-editor-all.min.js"
Get-Vendor "https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css"    "vendor/toastui-editor.min.css"

# ── Font Awesome 6.4.0 ────────────────────────────────────────────────────────
Write-Host "`n=== Font Awesome 6.4.0 ==="
Get-Vendor "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" "vendor/font-awesome/css/all.min.css"
foreach ($f in @("fa-brands-400","fa-regular-400","fa-solid-900","fa-v4compatibility")) {
    Get-Vendor "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/$f.woff2" "vendor/font-awesome/webfonts/$f.woff2"
}

# ── Google Fonts: Inter + Fira Code ──────────────────────────────────────────
Write-Host "`n=== Google Fonts (Inter + Fira Code) ==="
$ua  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$gfu = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap"
$css = (Invoke-WebRequest -Uri $gfu -Headers @{"User-Agent" = $ua} -UseBasicParsing).Content

$urlMatches = [regex]::Matches($css, 'url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)')
$localCss   = $css
$seen       = @{}
$i          = 0

foreach ($m in $urlMatches) {
    $u = $m.Groups[1].Value
    if (-not $seen.ContainsKey($u)) {
        $name = "font-$i.woff2"
        Get-Vendor $u "vendor/fonts/$name"
        $localCss = $localCss.Replace($u, $name)
        $seen[$u] = $name
        $i++
    }
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $root "vendor/fonts/fonts.css"), $localCss, $utf8)

Write-Host "`n=== Concluido: $i arquivo(s) de fonte baixado(s) ==="
