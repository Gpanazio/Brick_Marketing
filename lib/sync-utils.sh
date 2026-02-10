#!/bin/bash
# lib/sync-utils.sh
# Utilitários de Sincronização com Railway
# v1.0

RAILWAY_URL="https://brickmarketing-production.up.railway.app"
API_KEY="brick-squad-2026"

sync_file_to_railway() {
    local job_id="$1"
    local mode="$2"
    local file_path="$3"
    
    if [ ! -f "$file_path" ]; then
        echo "⚠️ Sync falhou: Arquivo não existe ($file_path)"
        return 1
    fi
    
    local filename=$(basename "$file_path")
    local content=$(cat "$file_path")
    
    # Escape content for JSON safely using jq
    local json_payload=$(jq -n \
        --arg mode "$mode" \
        --arg jobId "$job_id" \
        --arg filename "$filename" \
        --arg content "$content" \
        '{mode: $mode, jobId: $jobId, filename: $filename, content: $content}')
        
    echo "  🔄 Syncing $filename to Railway..."
    
    curl -s -X POST "${RAILWAY_URL}/api/result" \
        -H "Content-Type: application/json" \
        -H "x-api-key: ${API_KEY}" \
        -d "$json_payload" > /dev/null
        
    if [ $? -eq 0 ]; then
        echo "  ✅ Synced"
    else
        echo "  ❌ Sync Failed"
    fi
}

export -f sync_file_to_railway
