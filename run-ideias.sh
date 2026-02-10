#!/bin/bash
# BRICK AI IDEAS PIPELINE v2.0
# Executa pipeline de Ideias (Fast Track)
# Usa openclaw agent (sincrono) com retry, validação e logging
#
# Melhorias v2.0:
# - Retry com exponential backoff
# - Validação de JSON output
# - Logging completo (não descarta output)
# - Métricas de duração por etapa

# Detectar diretório do script dinamicamente
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# Carregar utilitários
source "$PROJECT_ROOT/lib/pipeline-utils.sh"

BRIEFING_FILE="$1"

source "$PROJECT_ROOT/lib/context-summarizer.sh"
if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

# Extrair JOB_ID do nome do briefing
BASENAME=$(basename "$BRIEFING_FILE")
BASENAME="${BASENAME%.txt}"
BASENAME="${BASENAME%.md}"
BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"

# ID curto para evitar erro de cache (max 64 chars no total)
SHORT_ID=$(echo "$JOB_ID" | tail -c 9)

if [ -z "$JOB_ID" ]; then
    JOB_ID=$(date +%s%3N)
    SHORT_ID=$(echo "$JOB_ID" | tail -c 9)
fi

WIP_DIR="$PROJECT_ROOT/history/ideias/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$PROJECT_ROOT/roles"

# Criar diretórios
mkdir -p "$WIP_DIR"
mkdir -p "$LOG_DIR"

# Timer do pipeline completo
PIPELINE_START=$(start_timer)

# Configuração de retry
max_retries=3

echo "💡 Brick AI Ideas Pipeline v2.0"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "📁 Logs: $LOG_DIR"
echo "---"

# Log de início do pipeline
echo "[$(date -Iseconds)] Pipeline iniciado: $JOB_ID" >> "$LOG_DIR/pipeline.log"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# Carregar todos os role files
PAIN_ROLE=$(cat "$ROLES_DIR/PAIN_CHECK.md" 2>/dev/null || echo "N/A")
MARKET_ROLE=$(cat "$ROLES_DIR/MARKET_SCAN.md" 2>/dev/null || echo "N/A")
ANGLE_ROLE=$(cat "$ROLES_DIR/ANGLE_GEN.md" 2>/dev/null || echo "N/A")
DEVIL_ROLE=$(cat "$ROLES_DIR/DEVIL_GEN.md" 2>/dev/null || echo "N/A")
VIABILITY_ROLE=$(cat "$ROLES_DIR/VIABILITY.md" 2>/dev/null || echo "N/A")

# ============================================
# ETAPA 0: Douglas (Raw Idea)
# ============================================
echo ""
echo "⏳ ETAPA 0: Douglas (Ingestion)"
STEP_START=$(start_timer)
RAW_FILE="$WIP_DIR/${JOB_ID}_RAW_IDEA.md"
cp "$BRIEFING_FILE" "$RAW_FILE"
DURATION=$(get_duration_ms $STEP_START)
echo "✅ Raw Idea salva"
print_duration $DURATION "Etapa 0"

# ============================================
# ETAPA 1: PAIN CHECK (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Pain Check (Flash)"
STEP_START=$(start_timer)
PAIN_OUT="$WIP_DIR/${JOB_ID}_PAIN_CHECK.json"
PAIN_LOG="$LOG_DIR/${JOB_ID}_01_PAIN_CHECK.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 180s openclaw agent --agent flash \
      --session-id "bi-${SHORT_ID}-pain" \
      --message "${PAIN_ROLE}

---

IDEIA BRUTA:
${BRIEFING_CONTENT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

INSTRUÇÕES:
Avalie a ideia conforme seu role acima e salve o resultado JSON no arquivo: ${PAIN_OUT}" \
      --timeout 120 --json 2>&1 | tee "$PAIN_LOG"
    
    if [ -f "$PAIN_OUT" ] && validate_json "$PAIN_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Pain Check concluído"
        print_duration $DURATION "Etapa 1"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$PAIN_OUT" ] || ! validate_json "$PAIN_OUT"; then
    create_json_placeholder "$PAIN_OUT" "PAIN_CHECK" "$JOB_ID" "All retries failed"
fi

PAIN_CONTENT=$(cat "$PAIN_OUT" 2>/dev/null || echo "Pain check não disponível")

# ============================================
# ETAPA 2: MARKET SCAN (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 2: Market Scan (Flash)"
echo "  📊 Resumindo contexto (economia de tokens)..."
CONTEXT_SUMMARY=$(create_ideias_context "$JOB_ID" "$WIP_DIR")
RAW_CONTENT=$(cat "$RAW_FILE" 2>/dev/null || echo "N/A")
BRIEFING_SUMMARY=$(summarize_ideias_briefing "$RAW_CONTENT" 400)
STEP_START=$(start_timer)
MARKET_OUT="$WIP_DIR/${JOB_ID}_MARKET_SCAN.md"
MARKET_LOG="$LOG_DIR/${JOB_ID}_02_MARKET_SCAN.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 300s openclaw agent --agent flash \
      --session-id "bi-${SHORT_ID}-market" \
      --message "${MARKET_ROLE}

---

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado Markdown EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.

INSTRUÇÕES:
Pesquise conforme seu role acima e salve o resultado Markdown no arquivo: ${MARKET_OUT}" \
      --timeout 240 --json 2>&1 | tee "$MARKET_LOG"
    
    if [ -f "$MARKET_OUT" ] && [ -s "$MARKET_OUT" ]; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Market Scan concluído"
        print_duration $DURATION "Etapa 2"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$MARKET_OUT" ] || [ ! -s "$MARKET_OUT" ]; then
    create_md_placeholder "$MARKET_OUT" "MARKET_SCAN" "$JOB_ID" "All retries failed"
fi

MARKET_CONTENT=$(cat "$MARKET_OUT" 2>/dev/null || echo "Market scan não disponível")

# ETAPA 3: ANGLE GEN + DEVIL GEN (Paralelo - Sonnet)
# ============================================
echo ""
echo "⏳ ETAPA 3: Angel vs Devil (Paralelo - Sonnet)"
STEP_START=$(start_timer)
ANGLE_OUT="$WIP_DIR/${JOB_ID}_ANGLE_GEN.json"
DEVIL_OUT="$WIP_DIR/${JOB_ID}_DEVIL_GEN.json"

# ANGEL (ângulos criativos a favor) - com logging e timeout de sistema robusto
safe_timeout 300s openclaw agent --agent sonnet \
  --session-id "bi-${SHORT_ID}-angle" \
  --message "${ANGLE_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

---

INSTRUÇÕES:
Advogue pela ideia conforme seu role acima e salve o resultado JSON no arquivo: ${ANGLE_OUT}" \
  --timeout 240 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_03A_ANGLE_GEN.log" &
ANGEL_PID=$!

# DEVIL (destruição criativa) - com logging e timeout de sistema robusto
safe_timeout 300s openclaw agent --agent sonnet \
  --session-id "bi-${SHORT_ID}-devil" \
  --message "${DEVIL_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

---

INSTRUÇÕES:
Destrua a ideia conforme seu role acima e salve o resultado JSON no arquivo: ${DEVIL_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_03B_DEVIL_GEN.log" &
DEVIL_PID=$!

echo "  >> Angel (PID: $ANGEL_PID) e Devil (PID: $DEVIL_PID) rodando em paralelo..."

# Aguarda ambos e captura status
wait $ANGEL_PID
ANGEL_STATUS=$?
wait $DEVIL_PID
DEVIL_STATUS=$?

DURATION=$(get_duration_ms $STEP_START)

# Verifica resultados com status de cada processo
if [ -f "$ANGLE_OUT" ] && validate_json "$ANGLE_OUT"; then
    echo "✅ Angel Gen concluído"
else
    [ $ANGEL_STATUS -ne 0 ] && echo "⚠️ Angel falhou com código $ANGEL_STATUS"
    create_json_placeholder "$ANGLE_OUT" "ANGLE_GEN" "$JOB_ID" "Agent failed or invalid JSON"
fi

if [ -f "$DEVIL_OUT" ] && validate_json "$DEVIL_OUT"; then
    echo "✅ Devil Gen concluído"
else
    [ $DEVIL_STATUS -ne 0 ] && echo "⚠️ Devil falhou com código $DEVIL_STATUS"
    create_json_placeholder "$DEVIL_OUT" "DEVIL_GEN" "$JOB_ID" "Agent failed or invalid JSON"
fi

print_duration $DURATION "Etapa 3"

ANGLE_CONTENT=$(cat "$ANGLE_OUT" 2>/dev/null || echo "Angle gen não disponível")
DEVIL_CONTENT=$(cat "$DEVIL_OUT" 2>/dev/null || echo "Devil gen não disponível")

# ============================================
# ETAPA 4: VIABILITY (Opus)
# ============================================
echo ""
echo "⏳ ETAPA 4: Viability (Opus)"
STEP_START=$(start_timer)
VIABILITY_OUT="$WIP_DIR/${JOB_ID}_VIABILITY.json"
VIABILITY_LOG="$LOG_DIR/${JOB_ID}_04_VIABILITY.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 240s openclaw agent --agent opus \
      --session-id "bi-${SHORT_ID}-viability" \
      --message "${VIABILITY_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

ANGEL (A FAVOR):
${ANGLE_CONTENT}

DEVIL (CONTRA):
${DEVIL_CONTENT}

---

INSTRUÇÕES:
Julgue a viabilidade conforme seu role acima e salve o resultado JSON no arquivo: ${VIABILITY_OUT}" \
      --timeout 180 --json 2>&1 | tee "$VIABILITY_LOG"
    
    if [ -f "$VIABILITY_OUT" ] && validate_json "$VIABILITY_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Viability concluído"
        print_duration $DURATION "Etapa 4"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$VIABILITY_OUT" ] || ! validate_json "$VIABILITY_OUT"; then
    echo "⚠️ Opus falhou após $max_retries tentativas. Tentando fallback GPT-5.3..."

    safe_timeout 240s openclaw agent --agent gpt53 \
      --session-id "bi-${SHORT_ID}-viability-fb" \
      --message "${VIABILITY_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

ANGEL (A FAVOR):
${ANGLE_CONTENT}

DEVIL (CONTRA):
${DEVIL_CONTENT}

---

INSTRUÇÕES:
Julgue a viabilidade conforme seu role acima e salve o resultado JSON no arquivo: ${VIABILITY_OUT}" \
      --timeout 180 --json 2>&1 | tee -a "$VIABILITY_LOG"

    if [ -f "$VIABILITY_OUT" ] && validate_json "$VIABILITY_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Viability concluído via fallback GPT-5.3"
        print_duration $DURATION "Etapa 4 (fallback)"
    else
        create_json_placeholder "$VIABILITY_OUT" "VIABILITY" "$JOB_ID" "All retries failed (Opus + GPT-5.3 fallback)"
    fi
fi

# ============================================
# SUMÁRIO DO PIPELINE
# ============================================
PIPELINE_DURATION=$(get_duration_ms $PIPELINE_START)

# Extrair decisão final
DECISION=$(jq -r '.decision // .recommendation // .verdict // "UNKNOWN"' "$VIABILITY_OUT" 2>/dev/null || echo "UNKNOWN")
SCORE=$(jq -r '.score // .viability_score // .final_score // 0' "$VIABILITY_OUT" 2>/dev/null || echo "0")

echo ""
# Cleanup de processos órfãos antes de finalizar
cleanup_children 2>/dev/null || true

echo "🏁 Pipeline Ideias Finalizado"
print_duration $PIPELINE_DURATION "Pipeline Total"
echo ""
echo "📊 RESULTADO:"
echo "   Decisão: $DECISION"
echo "   Score: $SCORE"
echo ""
echo "📁 Arquivos em: $WIP_DIR"
echo "📋 Logs em: $LOG_DIR"
echo ""
echo "Arquivos gerados:"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"

# Log de economia
log_token_savings "$JOB_ID" "$WIP_DIR" "ideias"

# Log de conclusão
echo "[$(date -Iseconds)] Pipeline finalizado: $JOB_ID | Decision: $DECISION | Score: $SCORE | Duration: ${PIPELINE_DURATION}ms" >> "$LOG_DIR/pipeline.log"
