#!/bin/bash
# BRICK AI MARKETING PIPELINE v2.1
# Executa pipeline de Marketing (Content & Flow)
# Usa openclaw agent (sincrono) com retry, validação e logging
#
# Melhorias v2.1:
# - Context-summarizer integrado (economia ~40-50% tokens)
# - Douglas removido do pipeline (processamento manual via OpenClaw)
# - Retry com exponential backoff
# - Validação de JSON output
# - Logging completo (não descarta output)
# - Métricas de duração por etapa

# Detectar diretório do script dinamicamente
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# Carregar utilitários
source "$PROJECT_ROOT/lib/pipeline-utils.sh"
source "$PROJECT_ROOT/lib/context-summarizer.sh"

BRIEFING_FILE="$1"

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

# Extrair JOB_ID do nome do briefing (suporta .txt e .md)
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

WIP_DIR="$PROJECT_ROOT/history/marketing/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$PROJECT_ROOT/roles"

# Criar diretórios
mkdir -p "$WIP_DIR"
mkdir -p "$LOG_DIR"

# Timer do pipeline completo
PIPELINE_START=$(start_timer)

echo "📢 Brick AI Marketing Pipeline v2.1"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "📁 Logs: $LOG_DIR"
echo "ℹ️  PRÉ-PIPELINE: Douglas processou briefing via OpenClaw"
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
BRAND_GUIDE=$(cat "$ROLES_DIR/BRAND_GUIDE.md" 2>/dev/null || echo "N/A")
BRAND_GUARDIAN=$(cat "$ROLES_DIR/BRAND_GUARDIAN.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/COPY_SENIOR.md" 2>/dev/null || echo "N/A")
WALL_ROLE=$(cat "$ROLES_DIR/FILTRO_FINAL.md" 2>/dev/null || echo "N/A")

# ============================================
# PRÉ-PIPELINE: Douglas processa briefing manualmente via OpenClaw
# Este script assume que {JOB_ID}_PROCESSED.md já foi criado
# ============================================

# ============================================
# ETAPA 1: VALIDATOR (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Brief Validator (Flash)"
STEP_START=$(start_timer)
VALIDATOR_OUT="$WIP_DIR/${JOB_ID}_01_VALIDATOR.json"
VALIDATOR_LOG="$LOG_DIR/${JOB_ID}_01_VALIDATOR.log"

# Executa com safe_timeout, retry e logging
attempt=1
max_retries=3
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 150s openclaw agent --agent flash \
      --session-id "bm-${SHORT_ID}-validator" \
      --message "${VALIDATOR_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

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
    
    safe_timeout 180s openclaw agent --agent flash \
      --session-id "bm-${SHORT_ID}-audience" \
      --message "# ⚠️ CONTEXTO DE MARCA OBRIGATÓRIO (RESPEITAR RIGOROSAMENTE)

${BRAND_GUIDE}

---

${AUDIENCE_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

BRIEFING PROPOSTO:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Avalie o alinhamento do briefing com a persona oficial E com o contexto de marca acima. Salve o resultado JSON no arquivo: ${AUDIENCE_OUT}" \
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
    
    safe_timeout 180s openclaw agent --agent flash \
      --session-id "bm-${SHORT_ID}-research" \
      --message "${RESEARCHER_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

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
    
    safe_timeout 150s openclaw agent --agent flash \
      --session-id "bm-${SHORT_ID}-claims" \
      --message "${CLAIMS_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

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
echo "  📊 Resumindo contexto (economia de tokens)..."
STEP_START=$(start_timer)
COPY_GPT_OUT="$WIP_DIR/${JOB_ID}_05A_COPY_GPT.md"
COPY_FLASH_OUT="$WIP_DIR/${JOB_ID}_05B_COPY_FLASH.md"
COPY_SONNET_OUT="$WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md"

# Context-summarizer: reduz contexto de ~12k tokens pra ~4k
CONTEXT_SUMMARY=$(create_marketing_context "$JOB_ID" "$WIP_DIR")

# Briefing resumido (300 chars max)
BRIEFING_SUMMARY=$(summarize_briefing "$BRIEFING_CONTENT" 300)

COPY_CONTEXT="BRAND GUIDE (OBRIGATÓRIO - RESPEITAR RIGOROSAMENTE):
${BRAND_GUIDE}

---

BRIEFING RESUMIDO:
${BRIEFING_SUMMARY}

CONTEXTO CONSOLIDADO (Validator + Audience + Research + Claims):
${CONTEXT_SUMMARY}

---

NOTA: Contexto foi resumido para economia de tokens. Se precisar de detalhes completos de alguma etapa, solicite."

# GPT (com logging e timeout de sistema robusto)
safe_timeout 210s openclaw agent --agent gpt \
  --session-id "bm-${SHORT_ID}-copy-gpt" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter A - Estilo direto e persuasivo

---

${COPY_CONTEXT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado Markdown EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.

INSTRUÇÕES:
Escreva a copy conforme o role COPYWRITER acima e RESPEITANDO RIGOROSAMENTE o BRAND GUIDE (tom, terminologia, red flags). Salve no arquivo: ${COPY_GPT_OUT}" \
  --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_05A_COPY_GPT.log" &
GPT_PID=$!

# Flash (com logging e timeout de sistema robusto)
safe_timeout 210s openclaw agent --agent flash \
  --session-id "bm-${SHORT_ID}-copy-flash" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter B - Estilo eficiente e data-driven

---

${COPY_CONTEXT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado Markdown EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.

INSTRUÇÕES:
Escreva a copy conforme o role COPYWRITER acima e RESPEITANDO RIGOROSAMENTE o BRAND GUIDE (tom, terminologia, red flags). Salve no arquivo: ${COPY_FLASH_OUT}" \
  --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_05B_COPY_FLASH.log" &
FLASH_PID=$!

# Sonnet (com logging e timeout de sistema robusto)
safe_timeout 210s openclaw agent --agent sonnet \
  --session-id "bm-${SHORT_ID}-copy-sonnet" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter C - Estilo narrativo e emocional

---

${COPY_CONTEXT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado Markdown EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.

INSTRUÇÕES:
Escreva a copy conforme o role COPYWRITER acima e RESPEITANDO RIGOROSAMENTE o BRAND GUIDE (tom, terminologia, red flags). Salve no arquivo: ${COPY_SONNET_OUT}" \
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
# ETAPA 6: COPY SENIOR (GPT 5.2)
# ============================================
echo ""
echo "⏳ ETAPA 6: Copy Senior (GPT 5.2)"
echo "  📊 Resumindo copies (economia de tokens)..."
STEP_START=$(start_timer)
CRITIC_OUT="$WIP_DIR/${JOB_ID}_06_COPY_SENIOR.json"
CRITIC_LOG="$LOG_DIR/${JOB_ID}_06_COPY_SENIOR.log"

# Ler copies completas (serão resumidas antes de enviar)
COPY_A_FULL=$(cat "$COPY_GPT_OUT" 2>/dev/null || echo "N/A")
COPY_B_FULL=$(cat "$COPY_FLASH_OUT" 2>/dev/null || echo "N/A")
COPY_C_FULL=$(cat "$COPY_SONNET_OUT" 2>/dev/null || echo "N/A")

# Resumir copies pra 800 chars cada (suficiente pra julgar)
COPY_A=$(summarize_briefing "$COPY_A_FULL" 800)
COPY_B=$(summarize_briefing "$COPY_B_FULL" 800)
COPY_C=$(summarize_briefing "$COPY_C_FULL" 800)

# Resumir briefing (já foi feito antes, mas reusar aqui)
BRIEFING_SUMMARY=$(summarize_briefing "$BRIEFING_CONTENT" 300)

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 240s openclaw agent --agent gpt \
      --session-id "bm-${SHORT_ID}-copy-senior" \
      --message "${CRITIC_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

BRIEFING RESUMIDO:
${BRIEFING_SUMMARY}

COPY A (GPT) - Primeiros 800 chars:
${COPY_A}

COPY B (Flash) - Primeiros 800 chars:
${COPY_B}

COPY C (Sonnet) - Primeiros 800 chars:
${COPY_C}

NOTA: Copies resumidas para economia. Se precisar do texto completo de alguma, solicite pelos arquivos:
- ${COPY_GPT_OUT}
- ${COPY_FLASH_OUT}
- ${COPY_SONNET_OUT}

---

INSTRUÇÕES:
Você é o Copy Senior. Avalie as 3 copies, escolha a melhor, aplique TODOS os ajustes necessários diretamente no texto e entregue a copy_revisada final. Salve o resultado JSON no arquivo: ${CRITIC_OUT}" \
      --timeout 180 --json 2>&1 | tee "$CRITIC_LOG"
    
    if [ -f "$CRITIC_OUT" ] && validate_json "$CRITIC_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Copy Senior concluído"
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

if [ ! -f "$CRITIC_OUT" ] || ! validate_json "$CRITIC_OUT"; then
    echo "⚠️ GPT falhou após $max_retries tentativas. Tentando fallback Sonnet..."
    
    safe_timeout 300s openclaw agent --agent sonnet \
      --session-id "bm-${SHORT_ID}-senior-fb-${LOOP_COUNT}" \
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
${BRAND_GUARDIAN}

---

INSTRUÇÕES:
Você é o Copy Senior. Avalie as 3 copies, escolha a melhor, aplique TODOS os ajustes necessários diretamente no texto e entregue a copy_revisada final. Salve o resultado JSON no arquivo: ${CRITIC_OUT}" \
      --timeout 180 --json 2>&1 | tee -a "$CRITIC_LOG"
    
    if [ -f "$CRITIC_OUT" ] && validate_json "$CRITIC_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Copy Senior concluído via fallback Sonnet"
        print_duration $DURATION "Etapa 6"
    else
        echo "❌ Fallback Sonnet também falhou. Criando placeholder..."
        create_json_placeholder "$CRITIC_OUT" "COPY_SENIOR" "$JOB_ID" "All retries failed (GPT + Sonnet fallback)"
    fi
fi

# ============================================
# ETAPA 7: WALL / FILTRO FINAL (Opus)
# ============================================
echo ""
echo "⏳ ETAPA 7: Wall / Filtro Final (Opus)"
echo "  📊 Resumindo contexto (economia MÁXIMA - Opus é caro)..."
STEP_START=$(start_timer)
WALL_OUT="$WIP_DIR/${JOB_ID}_07_WALL.json"
WALL_LOG="$LOG_DIR/${JOB_ID}_07_WALL.log"

# Copy Senior output completo
CRITIC_FULL=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")

# Extrair apenas copy_revisada + score + justificativa (não precisa das 3 copies originais)
COPY_REVISADA=$(echo "$CRITIC_FULL" | jq -r '.copy_revisada // "N/A"' 2>/dev/null)
CRITIC_WINNER=$(echo "$CRITIC_FULL" | jq -r '.vencedor // "N/A"' 2>/dev/null)
CRITIC_SCORE=$(echo "$CRITIC_FULL" | jq -r '.score_vencedor // "N/A"' 2>/dev/null)
CRITIC_REASON=$(echo "$CRITIC_FULL" | jq -r '.justificativa // "N/A"' 2>/dev/null | head -c 400)

# Briefing resumido
BRIEFING_SUMMARY=$(summarize_briefing "$BRIEFING_CONTENT" 300)

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 210s openclaw agent --agent opus \
      --session-id "bm-${SHORT_ID}-wall" \
      --message "${WALL_ROLE}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo fornecido no prompt pelo Douglas.
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA PARA AVALIAÇÃO ON-BRAND)

${BRAND_GUARDIAN}

---

BRIEFING RESUMIDO:
${BRIEFING_SUMMARY}

COPY FINAL (escolhida e revisada pelo Copy Senior):
Modelo vencedor: ${CRITIC_WINNER} (score: ${CRITIC_SCORE})
Justificativa: ${CRITIC_REASON}

TEXTO DA COPY:
${COPY_REVISADA}

---

INSTRUÇÕES:
Faça a revisão final conforme seu role acima. Para o critério ON-BRAND (20 pontos), use o BRAND GUARDIAN acima como referência completa (tom, terminologia, red flags, checklist). Salve o resultado JSON no arquivo: ${WALL_OUT}" \
      --timeout 150 --json 2>&1 | tee "$WALL_LOG"
    
    if [ -f "$WALL_OUT" ] && validate_json "$WALL_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Wall concluído"
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

if [ ! -f "$WALL_OUT" ] || ! validate_json "$WALL_OUT"; then
    create_json_placeholder "$WALL_OUT" "FILTRO_FINAL" "$JOB_ID" "All retries failed"
fi

# ============================================
# LOOP AUTOMÁTICO: Copy Senior ↔ Wall
# ============================================
# Se Wall rejeitar (score < 80), Copy Senior revisa e Wall avalia de novo
# Max 3 iterações totais

LOOP_COUNT=1
MAX_LOOPS=3
WALL_SCORE=$(jq -r '.score_final // 0' "$WALL_OUT" 2>/dev/null)

# Inicializar COPY_REVISADA com a versão da etapa 6 (OBRIGATÓRIO)
COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$CRITIC_OUT" 2>/dev/null)
if [ -z "$COPY_REVISADA" ]; then
    echo "❌ ERRO CRÍTICO: Copy Senior (etapa 6) não gerou copy_revisada."
    echo "   Arquivo: $CRITIC_OUT"
    echo "   O loop NÃO pode rodar sem a copy revisada. Abortando loop."
    WALL_SCORE=100  # Força skip do loop -- pipeline segue pro FINAL com o que tem
fi

echo ""
echo "📊 Wall Score: $WALL_SCORE/100"

while [ "$WALL_SCORE" -lt 80 ] && [ $LOOP_COUNT -lt $MAX_LOOPS ]; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    echo ""
    echo "🔄 Loop $LOOP_COUNT/$MAX_LOOPS - Wall rejeitou, Copy Senior revisando..."
    
    # Arquivos versionados
    COPY_SENIOR_V="${WIP_DIR}/${JOB_ID}_06_COPY_SENIOR_v${LOOP_COUNT}.json"
    WALL_V="${WIP_DIR}/${JOB_ID}_07_WALL_v${LOOP_COUNT}.json"
    
    # Identificar modelo vencedor da rodada original
    WINNING_MODEL=$(jq -r '.modelo_vencedor // "sonnet"' "$CRITIC_OUT" 2>/dev/null)
    
    # Copy Senior recebe feedback do Wall e gera revisão
    STEP_START=$(start_timer)
    attempt=1
    backoff=2
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Copy Senior v$LOOP_COUNT - Tentativa $attempt/$max_retries"
        
        safe_timeout 300s openclaw agent --agent "$WINNING_MODEL" \
          --session-id "bm-${SHORT_ID}-snr-lp-${LOOP_COUNT}" \
          --message "${CRITIC_ROLE}

---

CONTEXTO DO LOOP:
- Esta é a revisão $LOOP_COUNT de $MAX_LOOPS
- Wall rejeitou com score $WALL_SCORE/100 (precisa 80+)

---

COPY ATUAL (vencedora anterior):
${COPY_REVISADA}

---

FEEDBACK DO WALL:
$(cat "$WALL_OUT")

---

INSTRUÇÕES:
1. Leia o feedback detalhado do Wall (breakdown + pontos_de_melhoria)
2. Aplique os ajustes cirúrgicos necessários
3. Gere copy_revisada melhorada
4. Salve JSON no arquivo: ${COPY_SENIOR_V}" \
          --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_06_COPY_SENIOR_v${LOOP_COUNT}.log"
        
        if [ -f "$COPY_SENIOR_V" ] && validate_json "$COPY_SENIOR_V"; then
            DURATION=$(get_duration_ms $STEP_START)
            echo "✅ Copy Senior v$LOOP_COUNT concluído"
            print_duration $DURATION "Copy_Senior_Loop_$LOOP_COUNT"
            break
        fi
        
        if [ $attempt -lt $max_retries ]; then
            echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
            sleep $backoff
            backoff=$((backoff * 2))
        fi
        
        attempt=$((attempt + 1))
    done
    
    if [ ! -f "$COPY_SENIOR_V" ] || ! validate_json "$COPY_SENIOR_V"; then
        echo "❌ Copy Senior v$LOOP_COUNT falhou após $max_retries tentativas - abortando loop"
        break
    fi
    
    # Atualizar COPY_REVISADA com nova versão
    COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$COPY_SENIOR_V" 2>/dev/null)
    
    if [ -z "$COPY_REVISADA" ]; then
        echo "⚠️ Copy Senior v$LOOP_COUNT não gerou copy_revisada - abortando loop"
        break
    fi
    
    # Wall avalia nova versão
    echo ""
    echo "⏳ Wall v$LOOP_COUNT - Avaliando revisão..."
    STEP_START=$(start_timer)
    attempt=1
    backoff=2
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Tentativa $attempt/$max_retries"
        
        safe_timeout 300s openclaw agent --agent opus \
          --session-id "bm-${SHORT_ID}-wall-lp-${LOOP_COUNT}" \
          --message "${WALL_ROLE}

---

# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA PARA AVALIAÇÃO ON-BRAND)

${BRAND_GUARDIAN}

---

COPY REVISADA (versão $LOOP_COUNT):
${COPY_REVISADA}

---

CONTEXTO:
Esta é a avaliação $LOOP_COUNT após feedback anterior. Seja justo: se os ajustes foram aplicados corretamente, aprove. Para o critério ON-BRAND, use o BRAND GUARDIAN acima como referência.

---

INSTRUÇÕES:
Avalie esta copy revisada conforme seu role e salve o resultado JSON no arquivo: ${WALL_V}" \
          --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_07_WALL_v${LOOP_COUNT}.log"
        
        if [ -f "$WALL_V" ] && validate_json "$WALL_V"; then
            DURATION=$(get_duration_ms $STEP_START)
            echo "✅ Wall v$LOOP_COUNT concluído"
            print_duration $DURATION "Wall Loop $LOOP_COUNT"
            break
        fi
        
        if [ $attempt -lt $max_retries ]; then
            echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
            sleep $backoff
            backoff=$((backoff * 2))
        fi
        
        attempt=$((attempt + 1))
    done
    
    if [ ! -f "$WALL_V" ] || ! validate_json "$WALL_V"; then
        echo "❌ Wall v$LOOP_COUNT falhou após $max_retries tentativas - abortando loop"
        break
    fi
    
    # Atualizar score para próxima iteração
    WALL_SCORE=$(jq -r '.score_final // 0' "$WALL_V" 2>/dev/null)
    WALL_OUT="$WALL_V"  # Usar versão mais recente pro FINAL
    CRITIC_OUT="$COPY_SENIOR_V"  # Usar versão mais recente pro FINAL
    
    echo "📊 Wall Score v$LOOP_COUNT: $WALL_SCORE/100"
    
    if [ "$WALL_SCORE" -ge 80 ]; then
        echo "✅ Copy aprovada no loop $LOOP_COUNT!"
        break
    fi
done

if [ "$WALL_SCORE" -lt 80 ]; then
    echo ""
    echo "⚠️ Copy não atingiu 80 pontos após $LOOP_COUNT loops (score final: $WALL_SCORE)"
    echo "📋 Pipeline seguirá com a melhor versão gerada"
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
