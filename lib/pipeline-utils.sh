#!/bin/bash
# BRICK AI PIPELINE UTILITIES
# Funções compartilhadas entre os scripts de pipeline
# v1.0 - 05/02/2026

# ============================================
# CONFIGURAÇÃO
# ============================================
MAX_RETRIES=${MAX_RETRIES:-3}
INITIAL_BACKOFF_SECONDS=${INITIAL_BACKOFF_SECONDS:-2}

# ============================================
# LOGGING
# ============================================

# Cria diretório de logs se não existir
setup_logs() {
    local wip_dir="$1"
    LOG_DIR="${wip_dir}/logs"
    mkdir -p "$LOG_DIR"
    echo "$LOG_DIR"
}

# Log estruturado em JSON
log_json() {
    local level="$1"
    local event="$2"
    local data="$3"
    local timestamp=$(date -Iseconds)
    echo "{\"level\":\"$level\",\"event\":\"$event\",\"data\":$data,\"timestamp\":\"$timestamp\"}"
}

# Log simples com timestamp
log_step() {
    local step="$1"
    local status="$2"
    local duration_ms="$3"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $step: $status (${duration_ms}ms)"
}

# ============================================
# VALIDAÇÃO DE JSON
# ============================================

# Valida se arquivo contém JSON válido
validate_json() {
    local file="$1"
    
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    # Tenta parsear com jq
    if jq empty "$file" 2>/dev/null; then
        return 0
    fi
    
    return 1
}

# Valida JSON e retorna código de status
validate_json_with_details() {
    local file="$1"
    local expected_fields="$2"  # campos separados por vírgula (opcional)
    
    if [ ! -f "$file" ]; then
        echo "FILE_NOT_FOUND"
        return 1
    fi
    
    # Verifica se é JSON válido
    if ! jq empty "$file" 2>/dev/null; then
        echo "INVALID_JSON"
        return 2
    fi
    
    # Se campos esperados foram especificados, verifica se existem
    if [ -n "$expected_fields" ]; then
        IFS=',' read -ra FIELDS <<< "$expected_fields"
        for field in "${FIELDS[@]}"; do
            if ! jq -e ".$field" "$file" >/dev/null 2>&1; then
                echo "MISSING_FIELD:$field"
                return 3
            fi
        done
    fi
    
    echo "VALID"
    return 0
}

# ============================================
# RETRY COM EXPONENTIAL BACKOFF
# ============================================

# Executa comando com retry e backoff exponencial
run_with_retry() {
    local max_retries="$MAX_RETRIES"
    local backoff="$INITIAL_BACKOFF_SECONDS"
    local attempt=1
    local cmd="$@"
    
    while [ $attempt -le $max_retries ]; do
        # Executa o comando
        eval "$cmd"
        local exit_code=$?
        
        if [ $exit_code -eq 0 ]; then
            return 0
        fi
        
        if [ $attempt -lt $max_retries ]; then
            echo "⚠️ Tentativa $attempt/$max_retries falhou (exit: $exit_code), aguardando ${backoff}s..."
            sleep $backoff
            backoff=$((backoff * 2))  # Exponential backoff
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo "❌ Todas as $max_retries tentativas falharam"
    return 1
}

# Executa agente OpenClaw com retry, logging e validação
run_agent() {
    local agent="$1"
    local session_id="$2"
    local message="$3"
    local output_file="$4"
    local timeout="${5:-120}"
    local log_dir="${6:-/tmp}"
    local expected_fields="${7:-}"  # Campos JSON esperados (opcional)
    
    local job_id=$(basename "$output_file" | cut -d'_' -f1-2)
    local step_name=$(basename "$output_file" .json | sed 's/.*_//')
    local log_file="${log_dir}/${job_id}_${step_name}.log"
    local start_time=$(date +%s%3N)
    local attempt=1
    local max_retries="$MAX_RETRIES"
    local backoff="$INITIAL_BACKOFF_SECONDS"
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Tentativa $attempt/$max_retries (agent: $agent, timeout: ${timeout}s)"
        
        # Executa o agente com log capturado
        openclaw agent --agent "$agent" \
            --session-id "$session_id" \
            --message "$message" \
            --timeout "$timeout" \
            --json 2>&1 | tee "$log_file"
        
        local exit_code=${PIPESTATUS[0]}
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        # Verifica se arquivo foi criado
        if [ -f "$output_file" ]; then
            # Valida JSON se aplicável
            if [[ "$output_file" == *.json ]]; then
                local validation=$(validate_json_with_details "$output_file" "$expected_fields")
                if [ "$validation" = "VALID" ]; then
                    echo "✅ Agente concluído com sucesso (${duration}ms)"
                    log_step "$step_name" "SUCCESS" "$duration" >> "${log_dir}/pipeline.log"
                    return 0
                else
                    echo "⚠️ JSON inválido: $validation"
                    # Continua para tentar novamente
                fi
            else
                # Arquivo não-JSON (markdown) - verifica se tem conteúdo
                if [ -s "$output_file" ]; then
                    echo "✅ Agente concluído com sucesso (${duration}ms)"
                    log_step "$step_name" "SUCCESS" "$duration" >> "${log_dir}/pipeline.log"
                    return 0
                fi
            fi
        fi
        
        # Falhou - tenta novamente com backoff
        if [ $attempt -lt $max_retries ]; then
            echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s antes de retry..."
            sleep $backoff
            backoff=$((backoff * 2))
        fi
        
        attempt=$((attempt + 1))
    done
    
    # Todas as tentativas falharam
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    echo "❌ Agente falhou após $max_retries tentativas (${duration}ms)"
    log_step "$step_name" "FAILED" "$duration" >> "${log_dir}/pipeline.log"
    
    return 1
}

# ============================================
# CRIAÇÃO DE PLACEHOLDERS
# ============================================

# Cria placeholder JSON com metadados de erro
create_json_placeholder() {
    local file="$1"
    local agent="$2"
    local job_id="$3"
    local reason="${4:-Agent did not produce valid output}"
    
    cat > "$file" << EOF
{
  "agent": "$agent",
  "job_id": "$job_id",
  "status": "ERROR",
  "error": {
    "reason": "$reason",
    "timestamp": "$(date -Iseconds)",
    "retries_attempted": $MAX_RETRIES
  },
  "placeholder": true
}
EOF
    echo "⚠️ Placeholder criado: $file"
}

# Cria placeholder Markdown com metadados de erro
create_md_placeholder() {
    local file="$1"
    local agent="$2"
    local job_id="$3"
    local reason="${4:-Agent did not produce valid output}"
    
    cat > "$file" << EOF
# $agent: ERROR

> ⚠️ Este é um placeholder gerado automaticamente.

## Detalhes do Erro

- **Job ID:** $job_id
- **Timestamp:** $(date -Iseconds)
- **Razão:** $reason
- **Tentativas:** $MAX_RETRIES

---

*Placeholder gerado pelo pipeline Brick AI*
EOF
    echo "⚠️ Placeholder MD criado: $file"
}

# ============================================
# MÉTRICAS DE DURAÇÃO
# ============================================

# Inicia timer e retorna timestamp
start_timer() {
    date +%s%3N
}

# Calcula duração desde o timestamp inicial
get_duration_ms() {
    local start="$1"
    local end=$(date +%s%3N)
    echo $((end - start))
}

# Imprime duração formatada
print_duration() {
    local duration_ms="$1"
    local label="$2"
    
    if [ $duration_ms -lt 1000 ]; then
        echo "⏱️ $label: ${duration_ms}ms"
    elif [ $duration_ms -lt 60000 ]; then
        local secs=$((duration_ms / 1000))
        local ms=$((duration_ms % 1000))
        echo "⏱️ $label: ${secs}.${ms}s"
    else
        local mins=$((duration_ms / 60000))
        local secs=$(((duration_ms % 60000) / 1000))
        echo "⏱️ $label: ${mins}m ${secs}s"
    fi
}

# ============================================
# EXPORTAR FUNÇÕES
# ============================================
export -f setup_logs log_json log_step
export -f validate_json validate_json_with_details
export -f run_with_retry run_agent
export -f create_json_placeholder create_md_placeholder
export -f start_timer get_duration_ms print_duration
