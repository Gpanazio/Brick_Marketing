#!/bin/bash
# BRICK AI PROJECTS PIPELINE v2.5 (LOOP REFINEMENT)
# Executa pipeline de Projetos com Feedback Loop
# Etapas: Digest -> Ideation -> Critic -> LOOP(Execution -> Proposal -> Director)
#
# v2.5: Adicionado Loop Automático (Max 3x) se Director reprovar

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

echo "🎬 Brick AI Projects Pipeline v2.5 (Loop Mode)"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "📁 Logs: $LOG_DIR"
echo "---"

# Log de início do pipeline
echo "[$(date -Iseconds)] Pipeline iniciado: $JOB_ID" >> "$LOG_DIR/pipeline.log"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# Carregar roles estáticos
BRAND_GUIDE=$(cat "$ROLES_DIR/BRAND_GUIDE.md" 2>/dev/null || echo "N/A")
BRAND_DIGEST_ROLE=$(cat "$ROLES_DIR/BRAND_DIGEST.md" 2>/dev/null || echo "N/A")
CREATIVE_ROLE=$(cat "$ROLES_DIR/CREATIVE_IDEATION.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/CONCEPT_CRITIC.md" 2>/dev/null || echo "N/A")
# Roles do Loop (Execution, Proposal, Director) são carregados dentro do loop ou aqui mesmo
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

# ============================================
# ETAPA 1: BRAND DIGEST (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Brand Digest (Flash)"
STEP_START=$(start_timer)
BRAND_OUT="$WIP_DIR/${JOB_ID}_BRAND_DIGEST.json"
# Usa função run_agent do utils (simplifica código)
run_agent "flash" "brick-proj-${JOB_ID}-brand" \
    "${BRAND_DIGEST_ROLE}
    
    ---
    BRIEFING DO CLIENTE:
    ${BRIEFING_CONTENT}
    
    ---
    INSTRUÇÕES:
    Extraia a essência da marca e salve JSON em: ${BRAND_OUT}" \
    "$BRAND_OUT" "120" "$LOG_DIR"

BRAND_CONTENT=$(cat "$BRAND_OUT" 2>/dev/null || echo "Brand digest não disponível")
print_duration $(get_duration_ms $STEP_START) "Etapa 1"

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

# Lança os 3 em background
openclaw agent --agent gpt \
  --session-id "brick-proj-${JOB_ID}-ideation-gpt" \
  --message "${CREATIVE_ROLE}
  VARIAÇÃO: Conceito A - Ousado e Surpreendente
  ---
  ${IDEATION_CONTEXT}
  ---
  INSTRUÇÕES: Salve Markdown em: ${IDEATION_GPT_OUT}" \
  --timeout 120 --json > "$LOG_DIR/${JOB_ID}_02A_IDEATION_GPT.log" 2>&1 &
PID1=$!

openclaw agent --agent flash \
  --session-id "brick-proj-${JOB_ID}-ideation-flash" \
  --message "${CREATIVE_ROLE}
  VARIAÇÃO: Conceito B - Pragmático e Executável
  ---
  ${IDEATION_CONTEXT}
  ---
  INSTRUÇÕES: Salve Markdown em: ${IDEATION_FLASH_OUT}" \
  --timeout 120 --json > "$LOG_DIR/${JOB_ID}_02B_IDEATION_FLASH.log" 2>&1 &
PID2=$!

openclaw agent --agent sonnet \
  --session-id "brick-proj-${JOB_ID}-ideation-sonnet" \
  --message "${CREATIVE_ROLE}
  VARIAÇÃO: Conceito C - Emocional e Storytelling
  ---
  ${IDEATION_CONTEXT}
  ---
  INSTRUÇÕES: Salve Markdown em: ${IDEATION_SONNET_OUT}" \
  --timeout 120 --json > "$LOG_DIR/${JOB_ID}_02C_IDEATION_SONNET.log" 2>&1 &
PID3=$!

echo "  >> Aguardando agentes..."
wait $PID1
wait $PID2
wait $PID3
echo "✅ Ideation concluído"
print_duration $(get_duration_ms $STEP_START) "Etapa 2"

# ============================================
# ETAPA 3: CONCEPT CRITIC (Gemini Pro)
# ============================================
echo ""
echo "⏳ ETAPA 3: Concept Critic (Gemini Pro)"
STEP_START=$(start_timer)
CRITIC_OUT="$WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.json"

run_agent "pro" "brick-proj-${JOB_ID}-critic" \
    "${CRITIC_ROLE}
    
    ---
    BRIEFING ORIGINAL: ${BRIEFING_CONTENT}
    BRAND DIGEST: ${BRAND_CONTENT}
    CONCEITO GPT: $(cat "$IDEATION_GPT_OUT" 2>/dev/null)
    CONCEITO FLASH: $(cat "$IDEATION_FLASH_OUT" 2>/dev/null)
    CONCEITO SONNET: $(cat "$IDEATION_SONNET_OUT" 2>/dev/null)
    
    ---
    INSTRUÇÕES: Avalie e escolha o vencedor. Salve JSON em: ${CRITIC_OUT}" \
    "$CRITIC_OUT" "150" "$LOG_DIR"

CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")
print_duration $(get_duration_ms $STEP_START) "Etapa 3"

# ============================================
# START LOOP: EXECUTION -> PROPOSAL -> DIRECTOR
# ============================================
loop_count=1
max_loops=3
director_approved=false
previous_feedback=""

while [ $loop_count -le $max_loops ] && [ "$director_approved" = false ]; do
    echo ""
    echo "🔄 LOOP DE REFINAMENTO: Rodada $loop_count de $max_loops"
    LOOP_START=$(start_timer)
    
    # Arquivos desta rodada (versionados)
    EXEC_OUT_V="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN_v${loop_count}.json"
    PROPOSAL_OUT_V="$WIP_DIR/${JOB_ID}_PROPOSAL_v${loop_count}.md"
    DIRECTOR_OUT_V="$WIP_DIR/${JOB_ID}_DIRECTOR_v${loop_count}.json"
    
    # Arquivos canônicos (sempre apontam para a última versão)
    EXEC_OUT="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.json"
    PROPOSAL_OUT="$WIP_DIR/${JOB_ID}_PROPOSAL.md"
    DIRECTOR_OUT="$WIP_DIR/${JOB_ID}_DIRECTOR.json"  # AGORA É JSON
    
    # === ETAPA 4: EXECUTION DESIGN ===
    echo "  ⏳ [Loop $loop_count] Execution Design (Gemini Pro)"
    
    FEEDBACK_INJECTION=""
    if [ ! -z "$previous_feedback" ]; then
        FEEDBACK_INJECTION="
        🚨 ATENÇÃO: FEEDBACK DA RODADA ANTERIOR (CORRIGIR ISTO):
        ${previous_feedback}
        
        IGNORE instruções anteriores que causem esse problema."
    fi
    
    run_agent "pro" "brick-proj-${JOB_ID}-exec-v${loop_count}" \
        "${EXECUTION_ROLE}
        
        ---
        BRIEFING: ${BRIEFING_CONTENT}
        BRAND DIGEST: ${BRAND_CONTENT}
        CONCEITO VENCEDOR: ${CRITIC_CONTENT}
        ${FEEDBACK_INJECTION}
        
        ---
        INSTRUÇÕES: Salve JSON em: ${EXEC_OUT_V}" \
        "$EXEC_OUT_V" "150" "$LOG_DIR"
    
    # Linkar para canônico
    cp "$EXEC_OUT_V" "$EXEC_OUT" 2>/dev/null
    EXEC_CONTENT=$(cat "$EXEC_OUT" 2>/dev/null || echo "N/A")
    
    # === ETAPA 5: PROPOSAL WRITER ===
    echo "  ⏳ [Loop $loop_count] Proposal Writer (GPT + Brand Guide)"
    
    run_agent "gpt" "brick-proj-${JOB_ID}-proposal-v${loop_count}" \
        "${PROPOSAL_ROLE}
        
        ---
        BRAND GUIDE BRICK AI (TOM DE VOZ):
        ${BRAND_GUIDE}
        
        BRIEFING CLIENTE: ${BRIEFING_CONTENT}
        BRAND DIGEST: ${BRAND_CONTENT}
        CONCEITO + CRÍTICA: ${CRITIC_CONTENT}
        DIREÇÃO VISUAL: ${EXEC_CONTENT}
        
        ---
        INSTRUÇÕES: Salve Markdown em: ${PROPOSAL_OUT_V}" \
        "$PROPOSAL_OUT_V" "150" "$LOG_DIR"
        
    # Linkar para canônico
    cp "$PROPOSAL_OUT_V" "$PROPOSAL_OUT" 2>/dev/null
    PROPOSAL_CONTENT=$(cat "$PROPOSAL_OUT" 2>/dev/null || echo "N/A")
    
    # === ETAPA 6: DIRECTOR ===
    echo "  ⏳ [Loop $loop_count] Director (Sonnet 4.5)"
    
    run_agent "sonnet" "brick-proj-${JOB_ID}-director-v${loop_count}" \
        "${DIRECTOR_ROLE}
        
        ---
        BRIEFING ORIGINAL: ${BRIEFING_CONTENT}
        BRAND DIGEST: ${BRAND_CONTENT}
        CONCEITO + CRÍTICA: ${CRITIC_CONTENT}
        DIREÇÃO VISUAL: ${EXEC_CONTENT}
        ROTEIRO/COPY: ${PROPOSAL_CONTENT}
        
        ---
        INSTRUÇÕES: Avalie e salve JSON em: ${DIRECTOR_OUT_V}" \
        "$DIRECTOR_OUT_V" "180" "$LOG_DIR"
        
    # Linkar para canônico
    cp "$DIRECTOR_OUT_V" "$DIRECTOR_OUT" 2>/dev/null
    
    # === DECISÃO ===
    if [ -f "$DIRECTOR_OUT_V" ]; then
        # Extrair veredito e score usando Python (mais robusto que grep)
        VEREDITO=$(python3 -c "import sys, json; print(json.load(sys.stdin).get('veredito', 'FAIL'))" < "$DIRECTOR_OUT_V" 2>/dev/null)
        SCORE=$(python3 -c "import sys, json; print(json.load(sys.stdin).get('score_execucao', 0))" < "$DIRECTOR_OUT_V" 2>/dev/null)
        
        echo "  📊 Director Score: $SCORE | Veredito: $VEREDITO"
        
        if [[ "$VEREDITO" == "APROVAR" ]] || [ "$SCORE" -ge 85 ]; then
            echo "  ✅ APROVADO! Saindo do loop."
            director_approved=true
        else
            echo "  ⚠️ REPROVADO. Coletando feedback para próxima rodada..."
            # Extrair feedback estruturado
            RESUMO=$(python3 -c "import sys, json; print(json.load(sys.stdin).get('resumo_honesto', ''))" < "$DIRECTOR_OUT_V" 2>/dev/null)
            CLICHES=$(python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin).get('cliches_encontrados', [])))" < "$DIRECTOR_OUT_V" 2>/dev/null)
            previous_feedback="RESUMO HONESTO: $RESUMO | CLICHÊS IDENTIFICADOS: $CLICHES"
        fi
    else
        echo "  ❌ Erro crítico: Diretor não gerou output. Abortando loop."
        break
    fi
    
    loop_count=$((loop_count + 1))
    print_duration $(get_duration_ms $LOOP_START) "Rodada $loop_count"
done

# ============================================
# FINALIZAÇÃO
# ============================================
PIPELINE_DURATION=$(get_duration_ms $PIPELINE_START)
echo ""
echo "🏁 Pipeline Projetos Finalizado"
if [ "$director_approved" = true ]; then
    echo "🎉 Resultado: APROVADO pelo Diretor."
else
    echo "⚠️ Resultado: REPROVADO (Limite de loops atingido)."
fi
print_duration $PIPELINE_DURATION "Pipeline Total"
echo "📁 Arquivos em: $WIP_DIR"

# Log final
echo "[$(date -Iseconds)] Pipeline finalizado ($director_approved): $JOB_ID (${PIPELINE_DURATION}ms)" >> "$LOG_DIR/pipeline.log"
