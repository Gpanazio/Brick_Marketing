#!/bin/bash
# BRICK AI - Sync Local → Railway
# Uso: ./sync-to-railway.sh <arquivo> [mode]
# Ou:  ./sync-to-railway.sh --all [mode]
#
# Exemplos:
#   ./sync-to-railway.sh history/marketing/wip/123_01_VALIDATOR.json marketing
#   ./sync-to-railway.sh --all marketing
#
# Chamado pelo Douglas (ou pelo pipeline) após cada etapa.
# NÃO roda em background. NÃO faz polling. Event-driven.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILWAY_URL="${RAILWAY_URL:-https://brickmarketing-production.up.railway.app}"
API_KEY="${API_KEY:-brick-squad-2026}"

sync_file() {
    local filepath="$1"
    local mode="$2"
    
    if [ ! -f "$filepath" ]; then
        echo "❌ Arquivo não existe: $filepath"
        return 1
    fi
    
    local filename=$(basename "$filepath")
    local dir=$(basename $(dirname "$filepath"))  # wip, done, failed
    local content=$(cat "$filepath")
    
    echo "📤 Sync: $filename → Railway ($mode/$dir)"
    
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST "${RAILWAY_URL}/api/result" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "$(jq -n \
            --arg filename "$filename" \
            --arg content "$content" \
            --arg category "$dir" \
            --arg mode "$mode" \
            '{filename: $filename, content: $content, category: $category, mode: $mode}')")
    
    local http_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | head -1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo "✅ OK ($http_code)"
        return 0
    else
        echo "❌ Falhou ($http_code): $body"
        return 1
    fi
}

sync_all() {
    local mode="${1:-marketing}"
    local synced=0
    local failed=0
    
    for dir in wip done; do
        local localpath="$SCRIPT_DIR/history/$mode/$dir"
        [ ! -d "$localpath" ] && continue
        
        for file in "$localpath"/*; do
            [ ! -f "$file" ] && continue
            [[ "$(basename "$file")" == .* ]] && continue
            [[ "$(basename "$file")" == logs ]] && continue
            
            if sync_file "$file" "$mode"; then
                synced=$((synced + 1))
            else
                failed=$((failed + 1))
            fi
        done
    done
    
    echo ""
    echo "📊 Sync completo: $synced ok, $failed falhas"
}

# Main
if [ "$1" = "--all" ]; then
    sync_all "${2:-marketing}"
elif [ -n "$1" ]; then
    # Detectar mode pelo path
    MODE="${2:-marketing}"
    if [[ "$1" == *"/projetos/"* ]]; then MODE="projetos"; fi
    if [[ "$1" == *"/ideias/"* ]]; then MODE="ideias"; fi
    sync_file "$1" "$MODE"
else
    echo "Uso: $0 <arquivo> [mode]"
    echo "      $0 --all [mode]"
    exit 1
fi
