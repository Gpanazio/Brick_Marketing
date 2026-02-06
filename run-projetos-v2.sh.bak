#!/bin/bash
# BRICK AI PROJECTS PIPELINE v2.0
# Executa pipeline de Projetos (Creative/Concept)
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

WIP_DIR="$PROJECT_ROOT/history/projetos/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$PROJECT_ROOT/roles"

# Criar diretórios
mkdir -p "$WIP_DIR"
mkdir -p "$LOG_DIR"

# Timer do pipeline completo
PIPELINE_START=$(start_timer)

# Configuração de retry
max_retries=3

echo "🎬 Brick AI Projects Pipeline v2.0"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "📁 Logs: $LOG_DIR"
echo "---"

# Log de início do pipeline
echo "[$(date -Iseconds)] Pipeline iniciado: $JOB_ID" >> "$LOG_DIR/pipeline.log"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# Carregar todos os role files
BRAND_DIGEST_ROLE=$(cat "$ROLES_DIR/BRAND_DIGEST.md" 2>/dev/null || echo "N/A")
CREATIVE_ROLE=$(cat "$ROLES_DIR/CREATIVE_IDEATION.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/CONCEPT_CRITIC.md" 2>/dev/null || echo "N/A")
EXECUTION_ROLE=$(cat "$ROLES_DIR/EXECUTION_DESIGN.md" 2>/dev/null || echo "N/A")
PROPOSAL_ROLE=$(cat "$ROLES_DIR/PROPOSAL_WRITER.md" 2>/dev/null || echo "N/A")
DIRECTOR_ROLE=$(cat "$ROLES_DIR/PROJECT_DIRECTOR.md" 2>/dev/null || echo "N/A")

# ============================================
# ETAPA 0: Douglas (Ingestion)
# ============================================
echo ""
echo "⏳ ETAPA 0: Douglas (Ingestion)"
STEP_START=$(start_timer)
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_BRIEFING_INPUT.md"
DURATION=$(get_duration_ms $STEP_START)
echo "✅ Briefing salvo"
print_duration $DURATION "Etapa 0"
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_BRIEFING_INPUT.md" >/dev/null 2>&1 &

# ============================================
# ETAPA 1: BRAND DIGEST (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Brand Digest (Flash)"
STEP_START=$(start_timer)
BRAND_OUT="$WIP_DIR/${JOB_ID}_BRAND_DIGEST.json"
BRAND_LOG="$LOG_DIR/${JOB_ID}_01_BRAND_DIGEST.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent flash \
      --session-id "brick-proj-${JOB_ID}-brand" \
      --message "${BRAND_DIGEST_ROLE}

---

BRIEFING DO CLIENTE:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Extraia a essência da marca conforme seu role acima e salve o resultado JSON no arquivo: ${BRAND_OUT}" \
      --timeout 120 --json 2>&1 | tee "$BRAND_LOG"
    
    if [ -f "$BRAND_OUT" ] && validate_json "$BRAND_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Brand Digest concluído"
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

if [ ! -f "$BRAND_OUT" ] || ! validate_json "$BRAND_OUT"; then
    create_json_placeholder "$BRAND_OUT" "BRAND_DIGEST" "$JOB_ID" "All retries failed"
fi
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_BRAND_DIGEST.json" >/dev/null 2>&1 &

BRAND_CONTENT=$(cat "$BRAND_OUT" 2>/dev/null || echo "Brand digest não disponível")

# ============================================
# ETAPA 2: CREATIVE IDEATION (3 modelos em paralelo)
# ============================================
echo ""
echo "⏳ ETAPA 2: Creative Ideation (3 modelos em paralelo)"
STEP_START=$(start_timer)

IDEATION_GPT_OUT="$WIP_DIR/${JOB_ID}_IDEATION_GPT.md"
IDEATION_FLASH_OUT="$WIP_DIR/${JOB_ID}_IDEATION_FLASH.md"
IDEATION_SONNET_OUT="$WIP_DIR/${JOB_ID}_IDEATION_SONNET.md"

IDEATION_CONTEXT="BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}"

# GPT (ousado) - com logging
openclaw agent --agent gpt \
  --session-id "brick-proj-${JOB_ID}-ideation-gpt" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito A - Ousado e Surpreendente

---

${IDEATION_CONTEXT}

---

INSTRUÇÕES:
Gere seu conceito criativo conforme seu role acima (foco: ousadia, surpresa) e salve no arquivo Markdown: ${IDEATION_GPT_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_02A_IDEATION_GPT.log" &
GPT_PID=$!

# Flash (pragmático) - com logging
openclaw agent --agent flash \
  --session-id "brick-proj-${JOB_ID}-ideation-flash" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito B - Pragmático e Executável

---

${IDEATION_CONTEXT}

---

INSTRUÇÕES:
Gere seu conceito criativo conforme seu role acima (foco: clareza, executabilidade) e salve no arquivo Markdown: ${IDEATION_FLASH_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_02B_IDEATION_FLASH.log" &
FLASH_PID=$!

# Sonnet (emocional) - com logging
openclaw agent --agent sonnet \
  --session-id "brick-proj-${JOB_ID}-ideation-sonnet" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito C - Emocional e Storytelling

---

${IDEATION_CONTEXT}

---

INSTRUÇÕES:
Gere seu conceito criativo conforme seu role acima (foco: emoção, narrativa) e salve no arquivo Markdown: ${IDEATION_SONNET_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_02C_IDEATION_SONNET.log" &
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

# Verifica resultados com status de cada processo
if [ -f "$IDEATION_GPT_OUT" ] && [ -s "$IDEATION_GPT_OUT" ]; then
    echo "✅ Ideation GPT concluído"
else
    [ $GPT_STATUS -ne 0 ] && echo "⚠️ GPT falhou com código $GPT_STATUS"
    create_md_placeholder "$IDEATION_GPT_OUT" "CREATIVE_IDEATION_GPT" "$JOB_ID" "Agent failed or empty output"
fi

if [ -f "$IDEATION_FLASH_OUT" ] && [ -s "$IDEATION_FLASH_OUT" ]; then
    echo "✅ Ideation Flash concluído"
else
    [ $FLASH_STATUS -ne 0 ] && echo "⚠️ Flash falhou com código $FLASH_STATUS"
    create_md_placeholder "$IDEATION_FLASH_OUT" "CREATIVE_IDEATION_FLASH" "$JOB_ID" "Agent failed or empty output"
fi

if [ -f "$IDEATION_SONNET_OUT" ] && [ -s "$IDEATION_SONNET_OUT" ]; then
    echo "✅ Ideation Sonnet concluído"
else
    [ $SONNET_STATUS -ne 0 ] && echo "⚠️ Sonnet falhou com código $SONNET_STATUS"
    create_md_placeholder "$IDEATION_SONNET_OUT" "CREATIVE_IDEATION_SONNET" "$JOB_ID" "Agent failed or empty output"
fi

print_duration $DURATION "Etapa 2"
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_IDEATION_GPT.md" >/dev/null 2>&1 &
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_IDEATION_FLASH.md" >/dev/null 2>&1 &
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_IDEATION_SONNET.md" >/dev/null 2>&1 &

# ============================================
# ETAPA 3: CONCEPT CRITIC (Gemini Pro)
# ============================================
echo ""
echo "⏳ ETAPA 3: Concept Critic (Gemini Pro)"
STEP_START=$(start_timer)
CRITIC_OUT="$WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.json"
CRITIC_LOG="$LOG_DIR/${JOB_ID}_03_CONCEPT_CRITIC.log"
IDEATION_GPT_CONTENT=$(cat "$IDEATION_GPT_OUT" 2>/dev/null || echo "N/A")
IDEATION_FLASH_CONTENT=$(cat "$IDEATION_FLASH_OUT" 2>/dev/null || echo "N/A")
IDEATION_SONNET_CONTENT=$(cat "$IDEATION_SONNET_OUT" 2>/dev/null || echo "N/A")

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent pro \
      --session-id "brick-proj-${JOB_ID}-critic" \
      --message "${CRITIC_ROLE}

---

BRIEFING ORIGINAL:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

CONCEITO GPT:
${IDEATION_GPT_CONTENT}

CONCEITO FLASH:
${IDEATION_FLASH_CONTENT}

CONCEITO SONNET:
${IDEATION_SONNET_CONTENT}

---

INSTRUÇÕES:
Avalie os 3 conceitos conforme seu role acima e salve o resultado JSON no arquivo: ${CRITIC_OUT}" \
      --timeout 150 --json 2>&1 | tee "$CRITIC_LOG"
    
    if [ -f "$CRITIC_OUT" ] && validate_json "$CRITIC_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Concept Critic concluído"
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

if [ ! -f "$CRITIC_OUT" ] || ! validate_json "$CRITIC_OUT"; then
    create_json_placeholder "$CRITIC_OUT" "CONCEPT_CRITIC" "$JOB_ID" "All retries failed"
fi

CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_CONCEPT_CRITIC.json" >/dev/null 2>&1 &

# ============================================
# ETAPA 4: EXECUTION DESIGN (Gemini Pro)
# ============================================
echo ""
echo "⏳ ETAPA 4: Execution Design (Gemini Pro)"
STEP_START=$(start_timer)
EXEC_OUT="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.json"
EXEC_LOG="$LOG_DIR/${JOB_ID}_04_EXECUTION_DESIGN.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent pro \
      --session-id "brick-proj-${JOB_ID}-exec" \
      --message "${EXECUTION_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

CONCEITO VENCEDOR (do Critic):
${CRITIC_CONTENT}

---

INSTRUÇÕES:
Crie o plano de execução conforme seu role acima e salve o resultado JSON no arquivo: ${EXEC_OUT}" \
      --timeout 150 --json 2>&1 | tee "$EXEC_LOG"
    
    if [ -f "$EXEC_OUT" ] && validate_json "$EXEC_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Execution Design concluído"
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

if [ ! -f "$EXEC_OUT" ] || ! validate_json "$EXEC_OUT"; then
    create_json_placeholder "$EXEC_OUT" "EXECUTION_DESIGN" "$JOB_ID" "All retries failed"
fi

EXEC_CONTENT=$(cat "$EXEC_OUT" 2>/dev/null || echo "N/A")
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_EXECUTION_DESIGN.json" >/dev/null 2>&1 &

# ============================================
# ETAPA 5: PROPOSAL WRITER (GPT)
# ============================================
echo ""
echo "⏳ ETAPA 5: Proposal Writer (GPT)"
STEP_START=$(start_timer)
COPY_OUT="$WIP_DIR/${JOB_ID}_PROPOSAL.md"
COPY_LOG="$LOG_DIR/${JOB_ID}_05_PROPOSAL.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent gpt \
      --session-id "brick-proj-${JOB_ID}-copy" \
      --message "${PROPOSAL_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

CONCEITO + CRÍTICA:
${CRITIC_CONTENT}

DIREÇÃO VISUAL:
${EXEC_CONTENT}

---

INSTRUÇÕES:
Escreva a proposta comercial conforme seu role acima e salve o resultado Markdown no arquivo: ${COPY_OUT}" \
      --timeout 150 --json 2>&1 | tee "$COPY_LOG"
    
    if [ -f "$COPY_OUT" ] && [ -s "$COPY_OUT" ]; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Proposal Writer concluído"
        print_duration $DURATION "Etapa 5"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$COPY_OUT" ] || [ ! -s "$COPY_OUT" ]; then
    create_md_placeholder "$COPY_OUT" "PROPOSAL_WRITER" "$JOB_ID" "All retries failed"
fi

COPY_CONTENT=$(cat "$COPY_OUT" 2>/dev/null || echo "N/A")
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_PROPOSAL.md" >/dev/null 2>&1 &

# ============================================
# ETAPA 6: DIRECTOR (Gemini Pro)
# ============================================
echo ""
echo "⏳ ETAPA 6: Director (Gemini Pro)"
STEP_START=$(start_timer)
DIRECTOR_OUT="$WIP_DIR/${JOB_ID}_DIRECTOR.md"
DIRECTOR_LOG="$LOG_DIR/${JOB_ID}_06_DIRECTOR.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent pro \
      --session-id "brick-proj-${JOB_ID}-director" \
      --message "${DIRECTOR_ROLE}

---

BRIEFING ORIGINAL:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

CONCEITO + CRÍTICA:
${CRITIC_CONTENT}

DIREÇÃO VISUAL:
${EXEC_CONTENT}

ROTEIRO/COPY:
${COPY_CONTENT}

---

INSTRUÇÕES:
Avalie a proposta completa conforme seu role acima e salve o resultado Markdown no arquivo: ${DIRECTOR_OUT}" \
      --timeout 180 --json 2>&1 | tee "$DIRECTOR_LOG"
    
    if [ -f "$DIRECTOR_OUT" ] && [ -s "$DIRECTOR_OUT" ]; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Director concluído"
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

if [ ! -f "$DIRECTOR_OUT" ] || [ ! -s "$DIRECTOR_OUT" ]; then
    create_md_placeholder "$DIRECTOR_OUT" "PROJECT_DIRECTOR" "$JOB_ID" "All retries failed"
fi
"$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_DIRECTOR.json" >/dev/null 2>&1 &

# ============================================
# DECISÃO FINAL (DIRECTOR → HUMAN)
# ============================================
DIRECTOR_CONTENT=$(cat "$DIRECTOR_OUT" 2>/dev/null || echo "{}")
VEREDITO=$(echo "$DIRECTOR_CONTENT" | jq -r '.veredito // "N/A"' 2>/dev/null || echo "N/A")

if [ "$VEREDITO" = "APROVAR" ]; then
    echo ""
    echo "✅ Director APROVOU (veredito: $VEREDITO)"
    echo "📤 Movendo para aprovação humana..."
    
    # Criar FINAL.md com todos os outputs
    FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"
    cat > "$FINAL_OUT" <<EOF
# PROJETO APROVADO PELO DIRECTOR
**Job ID:** ${JOB_ID}
**Data:** $(date -Iseconds)
**Veredito:** ${VEREDITO}

---

## BRAND DIGEST
$(cat "$BRAND_OUT" 2>/dev/null || echo "N/A")

---

## CONCEITO VENCEDOR (Critic)
$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")

---

## EXECUTION DESIGN
$(cat "$EXEC_OUT" 2>/dev/null || echo "N/A")

---

## PROPOSAL
$(cat "$COPY_OUT" 2>/dev/null || echo "N/A")

---

## DIRECTOR FEEDBACK
$(cat "$DIRECTOR_OUT" 2>/dev/null || echo "N/A")
EOF
    
    echo "✅ FINAL.md criado"
    "$PROJECT_ROOT/sync-to-railway.sh" --file "history/projetos/wip/${JOB_ID}_FINAL.md" >/dev/null 2>&1 &
else
    echo ""
    echo "⚠️ Director NÃO aprovou (veredito: $VEREDITO)"
    echo "Pipeline encerrado sem mover para HUMAN"
fi

# ============================================
# SUMÁRIO DO PIPELINE
# ============================================
PIPELINE_DURATION=$(get_duration_ms $PIPELINE_START)
echo ""
echo "🏁 Pipeline Projetos Finalizado"
print_duration $PIPELINE_DURATION "Pipeline Total"
echo "📁 Arquivos em: $WIP_DIR"
echo "📋 Logs em: $LOG_DIR"
echo ""
echo "Arquivos gerados:"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"

# Log de conclusão
echo "[$(date -Iseconds)] Pipeline finalizado: $JOB_ID (${PIPELINE_DURATION}ms)" >> "$LOG_DIR/pipeline.log"
