#!/bin/bash
# BRICK AI MARKETING PIPELINE v2.0
# Executa pipeline de Marketing (Content & Flow)
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

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

# Extrair JOB_ID do nome do briefing
BASENAME=$(basename "$BRIEFING_FILE" .md)
BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"

if [ -z "$JOB_ID" ]; then
    JOB_ID=$(date +%s%3N)
fi

WIP_DIR="$PROJECT_ROOT/history/marketing/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$PROJECT_ROOT/roles"

# Criar diretórios
mkdir -p "$WIP_DIR"
mkdir -p "$LOG_DIR"

# Timer do pipeline completo
PIPELINE_START=$(start_timer)

echo "📢 Brick AI Marketing Pipeline v2.0"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "📁 Logs: $LOG_DIR"
echo "---"

# Log de início do pipeline
echo "[$(date -Iseconds)] Pipeline iniciado: $JOB_ID" >> "$LOG_DIR/pipeline.log"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# Carregar todos os role files
VALIDATOR_ROLE=$(cat "$ROLES_DIR/BRIEF_VALIDATOR.md" 2>/dev/null || echo "N/A")
AUDIENCE_ROLE=$(cat "$ROLES_DIR/AUDIENCE_ANALYST.md" 2>/dev/null || echo "N/A")
RESEARCHER_ROLE=$(cat "$ROLES_DIR/TOPIC_RESEARCHER.md" 2>/dev/null || echo "N/A")
CLAIMS_ROLE=$(cat "$ROLES_DIR/CLAIMS_CHECKER.md" 2>/dev/null || echo "N/A")
COPYWRITER_ROLE=$(cat "$ROLES_DIR/COPYWRITER.md" 2>/dev/null || echo "N/A")
BRAND_ROLE=$(cat "$ROLES_DIR/BRAND_GUARDIAN.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/COPY_SENIOR.md" 2>/dev/null || echo "N/A")
WALL_ROLE=$(cat "$ROLES_DIR/FILTRO_FINAL.md" 2>/dev/null || echo "N/A")

# ============================================
# ETAPA 0: Douglas (Ingestion)
# ============================================
echo ""
echo "⏳ ETAPA 0: Douglas (Ingestion)"
STEP_START=$(start_timer)
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_PROCESSED.md"
DURATION=$(get_duration_ms $STEP_START)
echo "✅ Briefing processado"
print_duration $DURATION "Etapa 0"

# ============================================
# ETAPA 1: VALIDATOR (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Brief Validator (Flash)"
STEP_START=$(start_timer)
VALIDATOR_OUT="$WIP_DIR/${JOB_ID}_01_VALIDATOR.json"
VALIDATOR_LOG="$LOG_DIR/${JOB_ID}_01_VALIDATOR.log"

# Executa com retry e logging
attempt=1
max_retries=3
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent flash \
      --session-id "brick-mkt-${JOB_ID}-validator" \
      --message "${VALIDATOR_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Avalie o briefing conforme seu role acima e salve o resultado JSON no arquivo: ${VALIDATOR_OUT}" \
      --timeout 90 --json 2>&1 | tee "$VALIDATOR_LOG"
    
    # Verifica se arquivo existe e é JSON válido
    if [ -f "$VALIDATOR_OUT" ] && validate_json "$VALIDATOR_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Validator concluído"
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

# Se todas as tentativas falharam, cria placeholder
if [ ! -f "$VALIDATOR_OUT" ] || ! validate_json "$VALIDATOR_OUT"; then
    create_json_placeholder "$VALIDATOR_OUT" "VALIDATOR" "$JOB_ID" "All retries failed"
fi

# ============================================
# ETAPA 2: AUDIENCE ANALYST (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 2: Audience Analyst (Flash)"
STEP_START=$(start_timer)
AUDIENCE_OUT="$WIP_DIR/${JOB_ID}_02_AUDIENCE.json"
AUDIENCE_LOG="$LOG_DIR/${JOB_ID}_02_AUDIENCE.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent flash \
      --session-id "brick-mkt-${JOB_ID}-audience" \
      --message "${AUDIENCE_ROLE}

---

BRIEFING PROPOSTO:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Avalie o alinhamento do briefing com a persona oficial conforme seu role acima. Salve o resultado JSON no arquivo: ${AUDIENCE_OUT}" \
      --timeout 120 --json 2>&1 | tee "$AUDIENCE_LOG"
    
    if [ -f "$AUDIENCE_OUT" ] && validate_json "$AUDIENCE_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Audience concluído"
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

if [ ! -f "$AUDIENCE_OUT" ] || ! validate_json "$AUDIENCE_OUT"; then
    create_json_placeholder "$AUDIENCE_OUT" "AUDIENCE_ANALYST" "$JOB_ID" "All retries failed"
fi

# ============================================
# ETAPA 3: TOPIC RESEARCHER (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 3: Topic Researcher (Flash)"
STEP_START=$(start_timer)
RESEARCH_OUT="$WIP_DIR/${JOB_ID}_03_RESEARCH.json"
RESEARCH_LOG="$LOG_DIR/${JOB_ID}_03_RESEARCH.log"
AUDIENCE_CONTENT=$(cat "$AUDIENCE_OUT" 2>/dev/null || echo "N/A")

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent flash \
      --session-id "brick-mkt-${JOB_ID}-research" \
      --message "${RESEARCHER_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

PÚBLICO-ALVO:
${AUDIENCE_CONTENT}

---

INSTRUÇÕES:
Pesquise conforme seu role acima e salve o resultado JSON no arquivo: ${RESEARCH_OUT}" \
      --timeout 120 --json 2>&1 | tee "$RESEARCH_LOG"
    
    if [ -f "$RESEARCH_OUT" ] && validate_json "$RESEARCH_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Research concluído"
        print_duration $DURATION "Etapa 3"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$RESEARCH_OUT" ] || ! validate_json "$RESEARCH_OUT"; then
    create_json_placeholder "$RESEARCH_OUT" "TOPIC_RESEARCHER" "$JOB_ID" "All retries failed"
fi

# ============================================
# ETAPA 4: CLAIMS CHECKER (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 4: Claims Checker (Flash)"
STEP_START=$(start_timer)
CLAIMS_OUT="$WIP_DIR/${JOB_ID}_04_CLAIMS.json"
CLAIMS_LOG="$LOG_DIR/${JOB_ID}_04_CLAIMS.log"
RESEARCH_CONTENT=$(cat "$RESEARCH_OUT" 2>/dev/null || echo "N/A")

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent flash \
      --session-id "brick-mkt-${JOB_ID}-claims" \
      --message "${CLAIMS_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

RESEARCH:
${RESEARCH_CONTENT}

---

INSTRUÇÕES:
Valide claims conforme seu role acima e salve o resultado JSON no arquivo: ${CLAIMS_OUT}" \
      --timeout 90 --json 2>&1 | tee "$CLAIMS_LOG"
    
    if [ -f "$CLAIMS_OUT" ] && validate_json "$CLAIMS_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Claims concluído"
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

if [ ! -f "$CLAIMS_OUT" ] || ! validate_json "$CLAIMS_OUT"; then
    create_json_placeholder "$CLAIMS_OUT" "CLAIMS_CHECKER" "$JOB_ID" "All retries failed"
fi

# ============================================
# ETAPA 5: COPYWRITERS (3 modelos em paralelo)
# ============================================
echo ""
echo "⏳ ETAPA 5: Copywriters (3 modelos em paralelo)"
STEP_START=$(start_timer)
COPY_GPT_OUT="$WIP_DIR/${JOB_ID}_05A_COPY_GPT.md"
COPY_FLASH_OUT="$WIP_DIR/${JOB_ID}_05B_COPY_FLASH.md"
COPY_SONNET_OUT="$WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md"
CLAIMS_CONTENT=$(cat "$CLAIMS_OUT" 2>/dev/null || echo "N/A")

COPY_CONTEXT="BRIEFING:
${BRIEFING_CONTENT}

PÚBLICO:
${AUDIENCE_CONTENT}

RESEARCH:
${RESEARCH_CONTENT}

CLAIMS (respeitar):
${CLAIMS_CONTENT}"

# GPT (com logging)
openclaw agent --agent gpt \
  --session-id "brick-mkt-${JOB_ID}-copy-gpt" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter A - Estilo direto e persuasivo

---

${COPY_CONTEXT}

---

INSTRUÇÕES:
Escreva a copy conforme seu role acima (tom direto, persuasivo) e salve no arquivo: ${COPY_GPT_OUT}" \
  --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_05A_COPY_GPT.log" &
GPT_PID=$!

# Flash (com logging)
openclaw agent --agent flash \
  --session-id "brick-mkt-${JOB_ID}-copy-flash" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter B - Estilo eficiente e data-driven

---

${COPY_CONTEXT}

---

INSTRUÇÕES:
Escreva a copy conforme seu role acima (tom eficiente, pragmático) e salve no arquivo: ${COPY_FLASH_OUT}" \
  --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_05B_COPY_FLASH.log" &
FLASH_PID=$!

# Sonnet (com logging)
openclaw agent --agent sonnet \
  --session-id "brick-mkt-${JOB_ID}-copy-sonnet" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter C - Estilo narrativo e emocional

---

${COPY_CONTEXT}

---

INSTRUÇÕES:
Escreva a copy conforme seu role acima (tom narrativo, storytelling) e salve no arquivo: ${COPY_SONNET_OUT}" \
  --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_05C_COPY_SONNET.log" &
SONNET_PID=$!

echo "  >> GPT (PID: $GPT_PID), Flash (PID: $FLASH_PID), Sonnet (PID: $SONNET_PID) em paralelo..."

# Aguarda todos e captura status
wait $GPT_PID
GPT_STATUS=$?
wait $FLASH_PID
FLASH_STATUS=$?
wait $SONNET_PID
SONNET_STATUS=$?

DURATION=$(get_duration_ms $STEP_START)

# Verifica resultados e cria placeholders se necessário
if [ -f "$COPY_GPT_OUT" ] && [ -s "$COPY_GPT_OUT" ]; then
    echo "✅ Copy A (GPT) concluído"
else
    [ $GPT_STATUS -ne 0 ] && echo "⚠️ GPT falhou com código $GPT_STATUS"
    create_md_placeholder "$COPY_GPT_OUT" "COPYWRITER_GPT" "$JOB_ID" "Agent failed or empty output"
fi

if [ -f "$COPY_FLASH_OUT" ] && [ -s "$COPY_FLASH_OUT" ]; then
    echo "✅ Copy B (Flash) concluído"
else
    [ $FLASH_STATUS -ne 0 ] && echo "⚠️ Flash falhou com código $FLASH_STATUS"
    create_md_placeholder "$COPY_FLASH_OUT" "COPYWRITER_FLASH" "$JOB_ID" "Agent failed or empty output"
fi

if [ -f "$COPY_SONNET_OUT" ] && [ -s "$COPY_SONNET_OUT" ]; then
    echo "✅ Copy C (Sonnet) concluído"
else
    [ $SONNET_STATUS -ne 0 ] && echo "⚠️ Sonnet falhou com código $SONNET_STATUS"
    create_md_placeholder "$COPY_SONNET_OUT" "COPYWRITER_SONNET" "$JOB_ID" "Agent failed or empty output"
fi

print_duration $DURATION "Etapa 5"

# ============================================
# ETAPA 6: BRAND GUARDIANS (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 6: Brand Guardians (Flash)"
STEP_START=$(start_timer)
BRAND_GUARD_OUT="$WIP_DIR/${JOB_ID}_06_BRAND_GUARDIANS.json"
BRAND_LOG="$LOG_DIR/${JOB_ID}_06_BRAND_GUARDIANS.log"
COPY_A=$(cat "$COPY_GPT_OUT" 2>/dev/null || echo "N/A")
COPY_B=$(cat "$COPY_FLASH_OUT" 2>/dev/null || echo "N/A")
COPY_C=$(cat "$COPY_SONNET_OUT" 2>/dev/null || echo "N/A")

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent flash \
      --session-id "brick-mkt-${JOB_ID}-brand-guard" \
      --message "${BRAND_ROLE}

---

BRIEFING ORIGINAL:
${BRIEFING_CONTENT}

COPY A (GPT):
${COPY_A}

COPY B (Flash):
${COPY_B}

COPY C (Sonnet):
${COPY_C}

---

INSTRUÇÕES:
Valide as copies conforme seu role acima e salve o resultado JSON no arquivo: ${BRAND_GUARD_OUT}" \
      --timeout 120 --json 2>&1 | tee "$BRAND_LOG"
    
    if [ -f "$BRAND_GUARD_OUT" ] && validate_json "$BRAND_GUARD_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Brand Guardians concluído"
        print_duration $DURATION "Etapa 6"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$BRAND_GUARD_OUT" ] || ! validate_json "$BRAND_GUARD_OUT"; then
    create_json_placeholder "$BRAND_GUARD_OUT" "BRAND_GUARDIAN" "$JOB_ID" "All retries failed"
fi

# ============================================
# ETAPA 7: COPY SENIOR (GPT 5.2)
# ============================================
echo ""
echo "⏳ ETAPA 7: Copy Senior (GPT 5.2)"
STEP_START=$(start_timer)
CRITIC_OUT="$WIP_DIR/${JOB_ID}_07_COPY_SENIOR.json"
CRITIC_LOG="$LOG_DIR/${JOB_ID}_07_COPY_SENIOR.log"
GUARD_CONTENT=$(cat "$BRAND_GUARD_OUT" 2>/dev/null || echo "N/A")

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent gpt \
      --session-id "brick-mkt-${JOB_ID}-copy-senior" \
      --message "${CRITIC_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

COPY A (GPT):
${COPY_A}

COPY B (Flash):
${COPY_B}

COPY C (Sonnet):
${COPY_C}

BRAND GUARDIAN:
${GUARD_CONTENT}

---

INSTRUÇÕES:
Você é o Copy Senior. Avalie as 3 copies, escolha a melhor, aplique TODOS os ajustes necessários diretamente no texto e entregue a copy_revisada final. Salve o resultado JSON no arquivo: ${CRITIC_OUT}" \
      --timeout 180 --json 2>&1 | tee "$CRITIC_LOG"
    
    if [ -f "$CRITIC_OUT" ] && validate_json "$CRITIC_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Copy Senior concluído"
        print_duration $DURATION "Etapa 7"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$CRITIC_OUT" ] || ! validate_json "$CRITIC_OUT"; then
    create_json_placeholder "$CRITIC_OUT" "COPY_SENIOR" "$JOB_ID" "All retries failed"
fi

# ============================================
# ETAPA 8: WALL / FILTRO FINAL (Opus)
# ============================================
echo ""
echo "⏳ ETAPA 8: Wall / Filtro Final (Opus)"
STEP_START=$(start_timer)
WALL_OUT="$WIP_DIR/${JOB_ID}_08_WALL.json"
WALL_LOG="$LOG_DIR/${JOB_ID}_08_WALL.log"
CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent opus \
      --session-id "brick-mkt-${JOB_ID}-wall" \
      --message "${WALL_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

COPY REVISADA PELO COPY SENIOR + ANÁLISE:
${CRITIC_CONTENT}

---

INSTRUÇÕES:
Faça a revisão final conforme seu role acima e salve o resultado JSON no arquivo: ${WALL_OUT}" \
      --timeout 150 --json 2>&1 | tee "$WALL_LOG"
    
    if [ -f "$WALL_OUT" ] && validate_json "$WALL_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Wall concluído"
        print_duration $DURATION "Etapa 8"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$WALL_OUT" ] || ! validate_json "$WALL_OUT"; then
    create_json_placeholder "$WALL_OUT" "FILTRO_FINAL" "$JOB_ID" "All retries failed"
fi

# ============================================
# FINAL: Montar arquivo consolidado
# ============================================
FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"
WINNER=$(jq -r '.vencedor // .winner // "C"' "$CRITIC_OUT" 2>/dev/null | tr -d '"')

# Extrair copy_revisada do COPY SENIOR (versão final editada)
COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$CRITIC_OUT" 2>/dev/null)

# Fallback: se não tem copy_revisada, usar copy original do vencedor
if [ -z "$COPY_REVISADA" ]; then
  case "$WINNER" in
    A|a) WIN_FILE="$COPY_GPT_OUT" ;; 
    B|b) WIN_FILE="$COPY_FLASH_OUT" ;; 
    C|c) WIN_FILE="$COPY_SONNET_OUT" ;; 
    *) WIN_FILE="$COPY_SONNET_OUT" ;;
  esac
  COPY_REVISADA=$(cat "$WIN_FILE" 2>/dev/null || echo "Copy não encontrada")
fi

{
  echo "# COPY FINAL (vencedora: $WINNER — revisada pelo Copy Senior)"
  echo ""
  echo "$COPY_REVISADA"
  echo ""
  echo "---"
  echo ""
  echo "## ALTERAÇÕES APLICADAS"
  jq -r '.alteracoes_aplicadas[]? // empty' "$CRITIC_OUT" 2>/dev/null | while read -r alt; do
    echo "- $alt"
  done
  echo ""
  echo "---"
  echo ""
  echo "## WALL (JSON)"
  cat "$WALL_OUT" 2>/dev/null || true
} > "$FINAL_OUT"

# ============================================
# SUMÁRIO DO PIPELINE
# ============================================
PIPELINE_DURATION=$(get_duration_ms $PIPELINE_START)
echo ""
echo "🏁 Pipeline Marketing Finalizado"
print_duration $PIPELINE_DURATION "Pipeline Total"
echo "📁 Arquivos em: $WIP_DIR"
echo "📋 Logs em: $LOG_DIR"
echo ""
echo "Arquivos gerados:"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"

# Log de conclusão
echo "[$(date -Iseconds)] Pipeline finalizado: $JOB_ID (${PIPELINE_DURATION}ms)" >> "$LOG_DIR/pipeline.log"
