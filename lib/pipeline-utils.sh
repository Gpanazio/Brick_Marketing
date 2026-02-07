#!/bin/bash
# BRICK AI PIPELINE UTILITIES
# Funções compartilhadas entre os scripts de pipeline
# v1.1 - Timing functions added

MAX_RETRIES=${MAX_RETRIES:-3}
INITIAL_BACKOFF_SECONDS=${INITIAL_BACKOFF_SECONDS:-2}

# Timing utilities
start_timer() {
    date +%s
}

get_duration_ms() {
    local start=$1
    echo $(( ($(date +%s) - start) * 1000 ))
}

print_duration() {
    local duration_ms=$1
    local label="$2"
    echo "⏱️  ${label}: ${duration_ms}ms"
}

setup_logs() {
    local wip_dir="$1"
    LOG_DIR="${wip_dir}/logs"
    mkdir -p "$LOG_DIR"
    echo "$LOG_DIR"
}

log_step() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1: $2 (${3}ms)"
}

validate_json() {
    [ -f "$1" ] && jq empty "$1" 2>/dev/null
}

validate_json_with_details() {
    local file="$1"
    if [ ! -f "$file" ]; then echo "FILE_NOT_FOUND"; return 1; fi
    if ! jq empty "$file" 2>/dev/null; then echo "INVALID_JSON"; return 2; fi
    echo "VALID"
    return 0
}

run_with_retry() {
    local max_retries="$MAX_RETRIES"
    local attempt=1
    local cmd="$@"
    while [ $attempt -le $max_retries ]; do
        eval "$cmd"
        [ $? -eq 0 ] && return 0
        sleep 2
        attempt=$((attempt + 1))
    done
    return 1
}

run_agent() {
    local agent="$1"
    local session_id="$2"
    local message="$3"
    local output_file="$4"
    local timeout="${5:-120}"
    local log_dir="${6:-/tmp}"
    
        # Encurtar session_id se necessário (max 64 chars)
        if [ ${#session_id} -gt 50 ]; then
            local prefix=$(echo "$session_id" | cut -d'-' -f1-2)
            local suffix=$(echo "$session_id" | tail -c 9)
            session_id="${prefix}-${suffix}"
        fi

    local job_id=$(basename "$output_file" | cut -d'_' -f1-2)
    local step_name=$(basename "$output_file" .json | sed 's/.*_//')
    local log_file="${log_dir}/${job_id}_${step_name}.log"
    local attempt=1
    
    while [ $attempt -le 3 ]; do
        echo "  >> Tentativa $attempt/3 ($agent)"
        
        # EXECUÇÃO ROBUSTA: Captura output no log e extrai content com safe_timeout (blindagem OS-level)
        safe_timeout "$((timeout + 60))s" openclaw agent --agent "$agent" \
            --session-id "$session_id" \
            --message "$message" \
            --timeout "$timeout" \
            --json > "$log_file" 2>&1
            
        # Extração forçada via Python
        if [ ! -f "$output_file" ] || [ ! -s "$output_file" ]; then
            python3 -c "import sys, json; 
try:
    data=json.load(open('$log_file'))
    if 'result' in data and 'payloads' in data['result']: print(data['result']['payloads'][0].get('text', ''))
    else: print(data.get('content', ''))
except: pass" > "$output_file" 2>/dev/null
        fi
        
        if [ -s "$output_file" ]; then
            echo "✅ Sucesso"
            return 0
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ Falha após 3 tentativas"
    return 1
}

# Shell-level timeout robusto (cross-platform: timeout -> gtimeout -> fallback)
safe_timeout() {
    local t=$1
    shift
    if command -v timeout >/dev/null 2>&1; then
        timeout "$t" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$t" "$@"
    else
        # Fallback manual simplificado se não houver timeout/gtimeout
        "$@" &
        local pid=$!
        ( sleep "$t"; kill "$pid" 2>/dev/null ) &
        local killer_pid=$!
        wait "$pid"
        local res=$?
        kill "$killer_pid" 2>/dev/null
        return $res
    fi
}

create_md_placeholder() {
    echo "# ERROR" > "$1"
}

create_json_placeholder() {
    echo "{\"status\":\"ERROR\"}" > "$1"
}

# Cleanup agressivo de processos filhos (nice-to-have, previne zombies)
cleanup_children() {
    local parent_pid=$$
    # Mata todos os processos filhos do script atual
    pkill -P "$parent_pid" 2>/dev/null || true
    # Aguarda 500ms para processos terminarem gracefully
    sleep 0.5
    # Força kill -9 em processos restantes
    pkill -9 -P "$parent_pid" 2>/dev/null || true
}

# Trap para garantir cleanup em exit/interrupção (só se não existir trap anterior)
if ! trap -p EXIT | grep -q cleanup_children; then
    trap cleanup_children EXIT INT TERM
fi

export -f setup_logs log_step validate_json run_agent create_md_placeholder create_json_placeholder cleanup_children
