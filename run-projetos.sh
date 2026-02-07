#!/bin/bash
# BRICK AI PROJECTS PIPELINE v3.0
# Loop automático: Execution Design ↔ Director
# Se Director reprovar (veredito != APROVAR), volta pro Execution com feedback
# Max 3 loops

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

source "$PROJECT_ROOT/lib/pipeline-utils.sh"
source "$PROJECT_ROOT/lib/context-summarizer.sh"
# NOTA: Sumarização configurada com 800 chars (vs 500 em Marketing) - briefings de clientes têm detalhes críticos

BRIEFING_FILE="$1"
if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

BASENAME=$(basename "$BRIEFING_FILE")
BASENAME="${BASENAME%.txt}"
BASENAME="${BASENAME%.md}"
BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"
[ -z "$JOB_ID" ] && JOB_ID=$(date +%s)

WIP_DIR="$PROJECT_ROOT/history/projetos/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$PROJECT_ROOT/roles"
mkdir -p "$WIP_DIR" "$LOG_DIR"

PIPELINE_START=$(start_timer)
max_retries=3

echo "🎬 Brick AI Projects Pipeline v3.0 (Loop Mode)"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

echo "[$(date -Iseconds)] Pipeline iniciado: $JOB_ID" >> "$LOG_DIR/pipeline.log"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# Carregar roles
# NOTA: BRAND_GUIDE.md NÃO é carregado aqui - projetos seguem marca do CLIENTE, não da Brick
BRAND_DIGEST_ROLE=$(cat "$ROLES_DIR/BRAND_DIGEST.md" 2>/dev/null || echo "N/A")
CREATIVE_ROLE=$(cat "$ROLES_DIR/CREATIVE_IDEATION.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/CONCEPT_CRITIC.md" 2>/dev/null || echo "N/A")
EXECUTION_ROLE=$(cat "$ROLES_DIR/EXECUTION_DESIGN.md" 2>/dev/null || echo "N/A")
PROPOSAL_ROLE=$(cat "$ROLES_DIR/PROPOSAL_WRITER.md" 2>/dev/null || echo "N/A")
DIRECTOR_ROLE=$(cat "$ROLES_DIR/PROJECT_DIRECTOR.md" 2>/dev/null || echo "N/A")

# ============================================
# ETAPA 0: Ingestion
# ============================================
echo ""
echo "⏳ ETAPA 0: Ingestion"
STEP_START=$(start_timer)
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_BRIEFING_INPUT.md"
echo "✅ Briefing salvo"
print_duration $(get_duration_ms $STEP_START) "Etapa 0"
# Sync feito pelo run-orchestrate.sh ao final

# ============================================
# ETAPA 1: Brand Digest (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Brand Digest (Flash)"
STEP_START=$(start_timer)
BRAND_OUT="$WIP_DIR/${JOB_ID}_BRAND_DIGEST.json"

run_agent "flash" "brick-proj-${JOB_ID}-brand" \
    "${BRAND_DIGEST_ROLE}
    
---
BRIEFING:
${BRIEFING_CONTENT}
---

INSTRUÇÕES: Salve JSON em: ${BRAND_OUT}" \
    "$BRAND_OUT" "120" "$LOG_DIR"

if [ ! -f "$BRAND_OUT" ] || ! validate_json "$BRAND_OUT"; then
    create_json_placeholder "$BRAND_OUT" "BRAND_DIGEST" "$JOB_ID" "Failed"
fi

BRAND_CONTENT=$(cat "$BRAND_OUT" 2>/dev/null || echo "N/A")
print_duration $(get_duration_ms $STEP_START) "Etapa 1"
# Sync feito pelo run-orchestrate.sh ao final

# ============================================
# ETAPA 2: Creative Ideation (Paralelo: GPT + Flash + Sonnet)
# ============================================
echo ""
echo "⏳ ETAPA 2: Creative Ideation (3 modelos)"
STEP_START=$(start_timer)

IDEATION_GPT_OUT="$WIP_DIR/${JOB_ID}_IDEATION_GPT.md"
IDEATION_FLASH_OUT="$WIP_DIR/${JOB_ID}_IDEATION_FLASH.md"
IDEATION_SONNET_OUT="$WIP_DIR/${JOB_ID}_IDEATION_SONNET.md"

# Resumir briefing de forma generosa (800 chars) - briefings de clientes têm detalhes críticos
BRIEFING_SUMMARY=$(summarize_briefing "$BRIEFING_CONTENT" 800)

IDEATION_CONTEXT="BRIEFING DO CLIENTE (resumido): ${BRIEFING_SUMMARY}

BRAND DIGEST (DNA da marca do cliente): ${BRAND_CONTENT}"

# GPT
openclaw agent --agent gpt \
  --session-id "brick-proj-${JOB_ID}-ideation-gpt" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito A - Ousado

---
${IDEATION_CONTEXT}
---

INSTRUÇÕES: Salve Markdown em: ${IDEATION_GPT_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_02A_GPT.log" &
GPT_PID=$!

# Flash
openclaw agent --agent flash \
  --session-id "brick-proj-${JOB_ID}-ideation-flash" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito B - Pragmático

---
${IDEATION_CONTEXT}
---

INSTRUÇÕES: Salve Markdown em: ${IDEATION_FLASH_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_02B_FLASH.log" &
FLASH_PID=$!

# Sonnet
openclaw agent --agent sonnet \
  --session-id "brick-proj-${JOB_ID}-ideation-sonnet" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito C - Emocional

---
${IDEATION_CONTEXT}
---

INSTRUÇÕES: Salve Markdown em: ${IDEATION_SONNET_OUT}" \
  --timeout 120 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_02C_SONNET.log" &
SONNET_PID=$!

wait $GPT_PID
GPT_STATUS=$?
wait $FLASH_PID
FLASH_STATUS=$?
wait $SONNET_PID
SONNET_STATUS=$?

if [ -f "$IDEATION_GPT_OUT" ] && [ -s "$IDEATION_GPT_OUT" ]; then
    echo "✅ Ideation A (GPT) concluído"
else
    [ $GPT_STATUS -ne 0 ] && echo "⚠️ GPT falhou com código $GPT_STATUS"
    create_md_placeholder "$IDEATION_GPT_OUT" "IDEATION_GPT" "$JOB_ID" "Failed (exit $GPT_STATUS)"
fi

if [ -f "$IDEATION_FLASH_OUT" ] && [ -s "$IDEATION_FLASH_OUT" ]; then
    echo "✅ Ideation B (Flash) concluído"
else
    [ $FLASH_STATUS -ne 0 ] && echo "⚠️ Flash falhou com código $FLASH_STATUS"
    create_md_placeholder "$IDEATION_FLASH_OUT" "IDEATION_FLASH" "$JOB_ID" "Failed (exit $FLASH_STATUS)"
fi

if [ -f "$IDEATION_SONNET_OUT" ] && [ -s "$IDEATION_SONNET_OUT" ]; then
    echo "✅ Ideation C (Sonnet) concluído"
else
    [ $SONNET_STATUS -ne 0 ] && echo "⚠️ Sonnet falhou com código $SONNET_STATUS"
    create_md_placeholder "$IDEATION_SONNET_OUT" "IDEATION_SONNET" "$JOB_ID" "Failed (exit $SONNET_STATUS)"
fi

print_duration $(get_duration_ms $STEP_START) "Etapa 2"
# Sync feito pelo run-orchestrate.sh ao final

# ============================================
# ETAPA 3: Concept Critic (Pro)
# ============================================
echo ""
echo "⏳ ETAPA 3: Concept Critic (Pro)"
STEP_START=$(start_timer)
CRITIC_OUT="$WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.json"

IDEATION_GPT_CONTENT=$(cat "$IDEATION_GPT_OUT" 2>/dev/null || echo "N/A")
IDEATION_FLASH_CONTENT=$(cat "$IDEATION_FLASH_OUT" 2>/dev/null || echo "N/A")
IDEATION_SONNET_CONTENT=$(cat "$IDEATION_SONNET_OUT" 2>/dev/null || echo "N/A")

run_agent "pro" "brick-proj-${JOB_ID}-critic" \
    "${CRITIC_ROLE}
    
---
GPT: ${IDEATION_GPT_CONTENT}

FLASH: ${IDEATION_FLASH_CONTENT}

SONNET: ${IDEATION_SONNET_CONTENT}
---

INSTRUÇÕES: Salve JSON em: ${CRITIC_OUT}" \
    "$CRITIC_OUT" "150" "$LOG_DIR"

if [ ! -f "$CRITIC_OUT" ] || ! validate_json "$CRITIC_OUT"; then
    echo "⚠️ Pro falhou no Concept Critic. Tentando fallback Sonnet..."
    run_agent "sonnet" "brick-proj-${JOB_ID}-critic-fallback" \
        "${CRITIC_ROLE}
        
---
GPT: ${IDEATION_GPT_CONTENT}

FLASH: ${IDEATION_FLASH_CONTENT}

SONNET: ${IDEATION_SONNET_CONTENT}
---

INSTRUÇÕES: Salve JSON em: ${CRITIC_OUT}" \
        "$CRITIC_OUT" "150" "$LOG_DIR"
    
    if [ ! -f "$CRITIC_OUT" ] || ! validate_json "$CRITIC_OUT"; then
        create_json_placeholder "$CRITIC_OUT" "CONCEPT_CRITIC" "$JOB_ID" "Pro and Sonnet fallback failed"
    fi
fi

CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")
print_duration $(get_duration_ms $STEP_START) "Etapa 3"
# Sync feito pelo run-orchestrate.sh ao final

# ============================================
# ETAPAS 4-6: LOOP EXECUTION → PROPOSAL → DIRECTOR
# ============================================
LOOP_COUNT=1
MAX_LOOPS=3
VEREDITO="PENDING"
PREVIOUS_FEEDBACK=""

while [ "$VEREDITO" != "APROVAR" ] && [ $LOOP_COUNT -le $MAX_LOOPS ]; do
    echo ""
    if [ $LOOP_COUNT -eq 1 ]; then
        echo "🎨 Rodada $LOOP_COUNT: Execution inicial"
    else
        echo "🔄 Rodada $LOOP_COUNT/$MAX_LOOPS: Revisão após reprovação"
    fi
    
    # Arquivos (v1 = sem sufixo, v2+  = _vN)
    if [ $LOOP_COUNT -eq 1 ]; then
        EXEC_OUT="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.json"
        COPY_OUT="$WIP_DIR/${JOB_ID}_PROPOSAL.md"
        DIRECTOR_OUT="$WIP_DIR/${JOB_ID}_DIRECTOR.json"
    else
        EXEC_OUT="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN_v${LOOP_COUNT}.json"
        COPY_OUT="$WIP_DIR/${JOB_ID}_PROPOSAL_v${LOOP_COUNT}.md"
        DIRECTOR_OUT="$WIP_DIR/${JOB_ID}_DIRECTOR_v${LOOP_COUNT}.json"
    fi
    
    # ============================================
    # SUB-ETAPA 4: Execution Design (Pro)
    # ============================================
    echo "  ⏳ Execution Design"
    STEP_START=$(start_timer)
    
    # Criar contexto resumido (economia de tokens)
    PROJETOS_CONTEXT=$(create_projetos_context "$JOB_ID" "$WIP_DIR")
    
    FEEDBACK_INJECTION=""
    if [ ! -z "$PREVIOUS_FEEDBACK" ]; then
        FEEDBACK_INJECTION="
        
🚨 FEEDBACK DO DIRETOR (Rodada anterior):
${PREVIOUS_FEEDBACK}

ATENÇÃO: Corrija os pontos levantados acima. Documente explicitamente no campo 'director_feedback_response' como você resolveu cada problema."
    fi
    
    run_agent "pro" "brick-proj-${JOB_ID}-exec-v${LOOP_COUNT}" \
        "${EXECUTION_ROLE}
        
---
CONTEXTO RESUMIDO (economia de tokens):
${PROJETOS_CONTEXT}

BRIEFING DO CLIENTE (se necessário):
${BRIEFING_SUMMARY}

CONCEITO VENCEDOR: ${CRITIC_CONTENT}
${FEEDBACK_INJECTION}
---

INSTRUÇÕES: Salve JSON em: ${EXEC_OUT}" \
        "$EXEC_OUT" "150" "$LOG_DIR"
    
    if [ ! -f "$EXEC_OUT" ] || ! validate_json "$EXEC_OUT"; then
        echo "  ⚠️ Pro falhou no Execution. Tentando fallback Sonnet..."
        run_agent "sonnet" "brick-proj-${JOB_ID}-exec-v${LOOP_COUNT}-fallback" \
            "${EXECUTION_ROLE}
            
---
CONTEXTO RESUMIDO (economia de tokens):
${PROJETOS_CONTEXT}

BRIEFING DO CLIENTE (se necessário):
${BRIEFING_SUMMARY}

CONCEITO VENCEDOR: ${CRITIC_CONTENT}
${FEEDBACK_INJECTION}
---

INSTRUÇÕES: Salve JSON em: ${EXEC_OUT}" \
            "$EXEC_OUT" "150" "$LOG_DIR"
        
        if [ ! -f "$EXEC_OUT" ] || ! validate_json "$EXEC_OUT"; then
            create_json_placeholder "$EXEC_OUT" "EXECUTION_DESIGN" "$JOB_ID" "Pro and Sonnet fallback failed"
        fi
    fi
    
    EXEC_CONTENT=$(cat "$EXEC_OUT" 2>/dev/null || echo "N/A")
    print_duration $(get_duration_ms $STEP_START) "  Execution"
    # Sync feito pelo run-orchestrate.sh ao final
    
    # ============================================
    # SUB-ETAPA 5: Proposal Writer (GPT)
    # ============================================
    echo "  ⏳ Proposal Writer"
    STEP_START=$(start_timer)
    
    run_agent "gpt" "brick-proj-${JOB_ID}-prop-v${LOOP_COUNT}" \
        "${PROPOSAL_ROLE}
        
---
BRIEFING: ${BRIEFING_CONTENT}

BRAND: ${BRAND_CONTENT}

CONCEITO: ${CRITIC_CONTENT}

EXECUTION: ${EXEC_CONTENT}
---

INSTRUÇÕES: Salve Markdown em: ${COPY_OUT}" \
        "$COPY_OUT" "120" "$LOG_DIR"
    
    if [ ! -f "$COPY_OUT" ] || [ ! -s "$COPY_OUT" ]; then
        create_md_placeholder "$COPY_OUT" "PROPOSAL" "$JOB_ID" "Failed"
    fi
    
    COPY_CONTENT=$(cat "$COPY_OUT" 2>/dev/null || echo "N/A")
    print_duration $(get_duration_ms $STEP_START) "  Proposal"
    # Sync feito pelo run-orchestrate.sh ao final
    
    # ============================================
    # SUB-ETAPA 6: Director (Pro)
    # ============================================
    echo "  ⏳ Director"
    STEP_START=$(start_timer)
    
    LOOP_CONTEXT=""
    if [ $LOOP_COUNT -gt 1 ]; then
        LOOP_CONTEXT="
        
🔄 CONTEXTO DO LOOP:
- Esta é a rodada $LOOP_COUNT de $MAX_LOOPS
- Execution foi revisada com base no seu feedback anterior
- Seja justo: se os problemas foram corrigidos, APROVE"
    fi
    
    run_agent "pro" "brick-proj-${JOB_ID}-dir-v${LOOP_COUNT}" \
        "${DIRECTOR_ROLE}
        
---
BRIEFING: ${BRIEFING_CONTENT}

BRAND: ${BRAND_CONTENT}

CONCEITO: ${CRITIC_CONTENT}

EXECUTION: ${EXEC_CONTENT}

PROPOSAL: ${COPY_CONTENT}
${LOOP_CONTEXT}
---

INSTRUÇÕES: Avalie tudo e salve JSON em: ${DIRECTOR_OUT}" \
        "$DIRECTOR_OUT" "180" "$LOG_DIR"
    
    if [ ! -f "$DIRECTOR_OUT" ] || ! validate_json "$DIRECTOR_OUT"; then
        echo "  ⚠️ Pro falhou no Director. Tentando fallback Sonnet..."
        run_agent "sonnet" "brick-proj-${JOB_ID}-dir-v${LOOP_COUNT}-fallback" \
            "${DIRECTOR_ROLE}
            
---
BRIEFING: ${BRIEFING_CONTENT}

BRAND: ${BRAND_CONTENT}

CONCEITO: ${CRITIC_CONTENT}

EXECUTION: ${EXEC_CONTENT}

PROPOSAL: ${COPY_CONTENT}
${LOOP_CONTEXT}
---

INSTRUÇÕES: Avalie tudo e salve JSON em: ${DIRECTOR_OUT}" \
            "$DIRECTOR_OUT" "180" "$LOG_DIR"
        
        if [ ! -f "$DIRECTOR_OUT" ] || ! validate_json "$DIRECTOR_OUT"; then
            create_json_placeholder "$DIRECTOR_OUT" "DIRECTOR" "$JOB_ID" "Pro and Sonnet fallback failed"
        fi
    fi
    
    print_duration $(get_duration_ms $STEP_START) "  Director"
    # Sync feito pelo run-orchestrate.sh ao final
    
    # ============================================
    # Avaliar veredito
    # ============================================
    DIRECTOR_CONTENT=$(cat "$DIRECTOR_OUT" 2>/dev/null || echo "{}")
    VEREDITO=$(echo "$DIRECTOR_CONTENT" | jq -r '.veredito // "N/A"' 2>/dev/null || echo "N/A")
    SCORE=$(echo "$DIRECTOR_CONTENT" | jq -r '.score_execucao // 0' 2>/dev/null || echo "0")
    
    echo ""
    echo "  📊 Veredito: $VEREDITO | Score: $SCORE/100"
    
    if [ "$VEREDITO" = "APROVAR" ]; then
        echo "  ✅ Director APROVOU!"
        break
    else
        if [ $LOOP_COUNT -lt $MAX_LOOPS ]; then
            echo "  ⚠️ Director REPROVOU - preparando feedback para próxima rodada"
            PREVIOUS_FEEDBACK="Veredito: ${VEREDITO}
Score: ${SCORE}/100

Resumo: $(echo "$DIRECTOR_CONTENT" | jq -r '.resumo_honesto // "N/A"' 2>/dev/null)

Clichês encontrados: $(echo "$DIRECTOR_CONTENT" | jq -r '.cliches_encontrados // []' 2>/dev/null)"
        else
            echo "  ❌ Director REPROVOU mas atingiu max loops ($MAX_LOOPS)"
            echo "  Pipeline segue com última versão gerada"
        fi
        
        LOOP_COUNT=$((LOOP_COUNT + 1))
    fi
done

# ============================================
# DECISÃO FINAL (DIRECTOR → HUMAN)
# ============================================
echo ""
if [ "$VEREDITO" = "APROVAR" ]; then
    echo "✅ Projeto aprovado - criando FINAL.md"
    
    FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"
    
    # Extrair campos importantes do Director
    CONCEITO_AVALIADO=$(echo "$DIRECTOR_CONTENT" | jq -r '.conceito_avaliado // "N/A"' 2>/dev/null)
    RESUMO_HONESTO=$(echo "$DIRECTOR_CONTENT" | jq -r '.resumo_honesto // "N/A"' 2>/dev/null)
    FRAME_ICONICO=$(echo "$DIRECTOR_CONTENT" | jq -r '.frame_iconico.descricao_atual // "N/A"' 2>/dev/null)
    
    # Extrair nome do conceito vencedor
    CONCEITO_NOME=$(echo "$CRITIC_CONTENT" | jq -r '.conceito_escolhido // .winner // "N/A"' 2>/dev/null)
    
    cat > "$FINAL_OUT" <<EOF
# ✅ PROJETO APROVADO

**Conceito:** ${CONCEITO_AVALIADO}  
**Score Director:** ${SCORE}/100  
**Rodadas:** ${LOOP_COUNT}  
**Status:** Pronto para aprovação humana

---

## 📊 VEREDITO DO DIRECTOR

${RESUMO_HONESTO}

**Frame Icônico:** ${FRAME_ICONICO}

---

## 🎨 CONCEITO CRIATIVO

**Escolhido:** ${CONCEITO_NOME}

${COPY_CONTENT}

---

## 📋 DETALHES TÉCNICOS

<details>
<summary>Brand Digest (clique para expandir)</summary>

\`\`\`json
${BRAND_CONTENT}
\`\`\`

</details>

<details>
<summary>Concept Critic (clique para expandir)</summary>

\`\`\`json
${CRITIC_CONTENT}
\`\`\`

</details>

<details>
<summary>Execution Design (clique para expandir)</summary>

\`\`\`json
${EXEC_CONTENT}
\`\`\`

</details>

<details>
<summary>Director Feedback Completo (clique para expandir)</summary>

\`\`\`json
${DIRECTOR_CONTENT}
\`\`\`

</details>

---

**Job ID:** \`${JOB_ID}\`  
**Data:** $(date -Iseconds)
EOF
    
    echo "✅ FINAL.md criado"
    "$PROJECT_ROOT/sync-to-railway.sh" history/projetos/wip/${JOB_ID}_FINAL.md projetos >/dev/null 2>&1 &
else
    echo "⚠️ Projeto NÃO aprovado após $LOOP_COUNT rodadas"
    echo "Pipeline encerrado - arquivos mantidos em wip/"
fi

# ============================================
# SUMÁRIO
# ============================================
PIPELINE_DURATION=$(get_duration_ms $PIPELINE_START)
echo ""
echo "🏁 Pipeline Finalizado"
print_duration $PIPELINE_DURATION "Total"
echo "📁 Arquivos: $WIP_DIR"
echo "📋 Logs: $LOG_DIR"

echo "[$(date -Iseconds)] Pipeline finalizado: $JOB_ID (${PIPELINE_DURATION}ms, ${LOOP_COUNT} rodadas, veredito: ${VEREDITO})" >> "$LOG_DIR/pipeline.log"
