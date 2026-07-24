#!/usr/bin/env bash
# Fase 1: Vendorizar dependências externas (Linux/macOS)
# Execute uma vez com internet para popular vendor/.
# Idempotente: pula arquivos já existentes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fetch() {
    local url="$1" rel="$2"; shift 2
    local dest="$ROOT/$rel"
    if [ -f "$dest" ]; then echo "  skip  $rel"; return; fi
    echo "  fetch $rel"
    curl -fsSL "$@" -o "$dest" "$url"
}

mkdir -p "$ROOT/vendor/font-awesome/css" \
         "$ROOT/vendor/font-awesome/webfonts" \
         "$ROOT/vendor/fonts"

# ── JS libraries ──────────────────────────────────────────────────────────────
echo; echo "=== JS Libraries ==="
fetch "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"  "vendor/papaparse.min.js"
fetch "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"         "vendor/jszip.min.js"
fetch "https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js"                   "vendor/marked.min.js"
fetch "https://cdn.jsdelivr.net/npm/markdown2typst@0.1.4/+esm"                    "vendor/markdown2typst.esm.js"
# Toast UI Editor (avaliacao em andamento - editor WYSIWYG p/ introducao, ver index.html)
# Bundle "-all" so existe no CDN oficial NHN (uicdn.toast.com), nao no pacote npm @toast-ui/editor
fetch "https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js" "vendor/toastui-editor-all.min.js"
fetch "https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css"    "vendor/toastui-editor.min.css"

# ── Font Awesome 6.4.0 ────────────────────────────────────────────────────────
echo; echo "=== Font Awesome 6.4.0 ==="
fetch "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" "vendor/font-awesome/css/all.min.css"
for f in fa-brands-400 fa-regular-400 fa-solid-900 fa-v4compatibility; do
    fetch "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/$f.woff2" "vendor/font-awesome/webfonts/$f.woff2"
done

# ── Google Fonts: Inter + Fira Code ──────────────────────────────────────────
echo; echo "=== Google Fonts (Inter + Fira Code) ==="
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
GFU="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap"
css=$(curl -fsSL -A "$UA" "$GFU")

i=0
local_css="$css"
declare -A seen

while IFS= read -r url; do
    if [ -z "${seen[$url]+x}" ]; then
        name="font-$i.woff2"
        fetch "$url" "vendor/fonts/$name"
        local_css="${local_css//$url/$name}"
        seen["$url"]="$name"
        (( i++ )) || true
    fi
done < <(echo "$css" | grep -oP 'url\(\Khttps://fonts\.gstatic\.com/[^)]+(?=\))')

printf '%s' "$local_css" > "$ROOT/vendor/fonts/fonts.css"
echo; echo "=== Concluido: $i arquivo(s) de fonte baixado(s) ==="

