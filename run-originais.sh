#!/bin/bash
# BRICK AI ORIGINAIS PIPELINE v2.0
# Executa pipeline de Originais (TV/Streaming/Doc & Entretenimento)
# Etapas: Triage → Creative Doctor(GPT-5.2) || Sales Shark(GPT) → Angel || Demon → Doctor Final(GPT-5.2)
#
# v2.0: Creative Doctor e Doctor Final usam GPT 5.2 (non-codex)
#       Greenlight substituído por Doctor Final (análise per-episódio)
#       Fix: agents agora rodam foreground em sequência quando paralelo falha

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

source "$PROJECT_ROOT/lib/pipeline-utils.sh"
source "$PROJECT_ROOT/lib/sync-utils.sh"

BRIEFING_FILE="$1"

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

BASENAME=$(basename "$BRIEFING_FILE")
BASENAME="${BASENAME%.txt}"
BASENAME="${BASENAME%.md}"
BASENAME=$(echo "$BASENAME" | sed -E 's/_(PROJECT_INPUT|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"
SHORT_ID=$(echo -n "$JOB_ID" | shasum | awk '{print substr($1,1,10)}')

if [ -z "$JOB_ID" ]; then
    JOB_ID=$(date +%s%3N)
    SHORT_ID=$(echo -n "$JOB_ID" | shasum | awk '{print substr($1,1,10)}')
fi

WIP_DIR="$PROJECT_ROOT/history/originais/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$PROJECT_ROOT/roles"

mkdir -p "$WIP_DIR"
mkdir -p "$LOG_DIR"

PIPELINE_START=$(start_timer)
max_retries=3

echo "🎬 Brick AI Originais Pipeline v2.0"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "📁 Logs: $LOG_DIR"
echo "---"

echo "[$(date -Iseconds)] Pipeline iniciado: $JOB_ID" >> "$LOG_DIR/pipeline.log"

# ============================================
# ETAPA 0: INTAKE (Flash)
# ============================================
echo ""
echo "📥 ETAPA 0: Intake Agent Originais (Flash)"
INTAKE_START=$(start_timer)

INTAKE_WIP="$PROJECT_ROOT/wip/$JOB_ID"
mkdir -p "$INTAKE_WIP"
cp "$BRIEFING_FILE" "$INTAKE_WIP/INPUT.md"

PROJECT_INPUT_FILE="$WIP_DIR/${JOB_ID}_PROJECT_INPUT.md"
cp "$BRIEFING_FILE" "$PROJECT_INPUT_FILE"
sync_file_to_railway "$JOB_ID" "originais" "$PROJECT_INPUT_FILE"

BRIEFING_JSON=$("$PROJECT_ROOT/lib/intake-originais.sh" "$JOB_ID" "originais" 2>&1 | tee "$LOG_DIR/${JOB_ID}_00_INTAKE.log" | tail -1)

if [ ! -f "$BRIEFING_JSON" ] && [ -f "$INTAKE_WIP/BRIEFING.json" ]; then
    BRIEFING_JSON="$INTAKE_WIP/BRIEFING.json"
fi

INTAKE_DURATION_MS=$(get_duration_ms $INTAKE_START)
echo "✅ Intake completo em ${INTAKE_DURATION_MS}ms"
echo "---"

BRIEFING_CONTENT=$(cat "$BRIEFING_JSON" 2>/dev/null || cat "$BRIEFING_FILE")
INPUT_CONTENT=$(cat "$INTAKE_WIP/INPUT.md" 2>/dev/null || cat "$BRIEFING_FILE")

# Carregar role files
TRIAGE_ROLE=$(cat "$ROLES_DIR/TRIAGE_ORIGINAIS.md" 2>/dev/null || echo "Classificar material recebido.")
CREATIVE_ROLE=$(cat "$ROLES_DIR/CREATIVE_DOCTOR_ORIGINAIS.md" 2>/dev/null || echo "Análise criativa por episódio.")
SALES_ROLE=$(cat "$ROLES_DIR/SALES_SHARK_ORIGINAIS.md" 2>/dev/null || echo "Auditar viabilidade comercial.")
ANGEL_ROLE=$(cat "$ROLES_DIR/ANGEL_ORIGINAIS.md" 2>/dev/null || echo "Defender potencial artístico.")
DEMON_ROLE=$(cat "$ROLES_DIR/DEMON_ORIGINAIS.md" 2>/dev/null || echo "Destruir ilusões comerciais.")
DOCTOR_ROLE=$(cat "$ROLES_DIR/DOCTOR_FINAL_ORIGINAIS.md" 2>/dev/null || echo "Parecer criativo final por episódio.")

# ============================================
# ETAPA 1: TRIAGE (Flash)
# ============================================
echo ""
echo "⏳ ETAPA 1: Triage (Flash)"
STEP_START=$(start_timer)
TRIAGE_OUT="$WIP_DIR/${JOB_ID}_TRIAGE.json"
TRIAGE_LOG="$LOG_DIR/${JOB_ID}_01_TRIAGE.log"

attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    safe_timeout 180s openclaw agent --agent flash \
      --session-id "bo-${SHORT_ID}-triage-v2" \
      --message "${TRIAGE_ROLE}

---

MATERIAL RECEBIDO:
${INPUT_CONTENT}

INTAKE PRELIMINAR:
${BRIEFING_CONTENT}

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo: ${TRIAGE_OUT}
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

INSTRUÇÕES:
Classifique o material conforme seu role acima e salve o resultado JSON no arquivo: ${TRIAGE_OUT}" \
      --timeout 120 > "$TRIAGE_LOG" 2>&1
    
    if [ -f "$TRIAGE_OUT" ] && validate_json "$TRIAGE_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Triage concluído"
        sync_file_to_railway "$JOB_ID" "originais" "$TRIAGE_OUT"
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

if [ ! -f "$TRIAGE_OUT" ] || ! validate_json "$TRIAGE_OUT"; then
    create_json_placeholder "$TRIAGE_OUT" "TRIAGE" "$JOB_ID" "All retries failed"
fi

TRIAGE_CONTENT=$(cat "$TRIAGE_OUT" 2>/dev/null || echo "Triage não disponível")

# ============================================
# ETAPA 2: CREATIVE DOCTOR (GPT-5.2 non-codex) - SEQUENCIAL com retry
# Análise criativa per-episódio
# ============================================
echo ""
echo "⏳ ETAPA 2: Creative Doctor (GPT-5.2)"
STEP_START=$(start_timer)
CREATIVE_OUT="$WIP_DIR/${JOB_ID}_CREATIVE_DOCTOR.json"
CREATIVE_LOG="$LOG_DIR/${JOB_ID}_02_CREATIVE_DOCTOR.log"

CREATIVE_MSG="${CREATIVE_ROLE}

---

MATERIAL ORIGINAL (cada episódio deve ser analisado individualmente):
${INPUT_CONTENT}

TRIAGE (Classificação):
${TRIAGE_CONTENT}

CONTEXTO DE EXIBIÇÃO: Este projeto passou dentro do Domingo Espetacular (Record). A segunda temporada é para o mesmo programa. Considere o público e formato do Domingo Espetacular na sua análise.

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo: ${CREATIVE_OUT}
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Analise CADA EPISÓDIO individualmente - o que funciona e o que pode melhorar.
5. Respeite rigorosamente o schema JSON definido no seu role.

INSTRUÇÕES:
Analise CADA EPISÓDIO conforme seu role e salve o resultado JSON no arquivo: ${CREATIVE_OUT}"

if run_agent "gpt52" "bo-${SHORT_ID}-creative-v2" "$CREATIVE_MSG" "$CREATIVE_OUT" 240 "$LOG_DIR"; then
    if validate_json "$CREATIVE_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Creative Doctor concluído"
        sync_file_to_railway "$JOB_ID" "originais" "$CREATIVE_OUT"
        print_duration $DURATION "Etapa 2"
    else
        create_json_placeholder "$CREATIVE_OUT" "CREATIVE_DOCTOR" "$JOB_ID" "Invalid JSON"
        sync_file_to_railway "$JOB_ID" "originais" "$CREATIVE_OUT"
    fi
else
    create_json_placeholder "$CREATIVE_OUT" "CREATIVE_DOCTOR" "$JOB_ID" "All retries failed"
    sync_file_to_railway "$JOB_ID" "originais" "$CREATIVE_OUT"
fi

CREATIVE_CONTENT=$(cat "$CREATIVE_OUT" 2>/dev/null || echo "Creative Doctor não disponível")

# ============================================
# ETAPA 3: SALES SHARK (GPT) - SEQUENCIAL com retry
# Auditoria comercial
# ============================================
echo ""
echo "⏳ ETAPA 3: Sales Shark (GPT)"
STEP_START=$(start_timer)
SALES_OUT="$WIP_DIR/${JOB_ID}_SALES_SHARK.json"
SALES_LOG="$LOG_DIR/${JOB_ID}_03_SALES_SHARK.log"

SALES_MSG="${SALES_ROLE}

---

MATERIAL ORIGINAL:
${INPUT_CONTENT}

TRIAGE (Classificação):
${TRIAGE_CONTENT}

CONTEXTO DE EXIBIÇÃO: Este projeto passou dentro do Domingo Espetacular (Record). A segunda temporada é para o mesmo programa.

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo: ${SALES_OUT}
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Respeite rigorosamente o schema JSON definido no seu role.

INSTRUÇÕES:
Audite a viabilidade comercial conforme seu role acima e salve o resultado JSON no arquivo: ${SALES_OUT}"

if run_agent "gpt" "bo-${SHORT_ID}-sales-v2" "$SALES_MSG" "$SALES_OUT" 240 "$LOG_DIR"; then
    if validate_json "$SALES_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Sales Shark concluído"
        sync_file_to_railway "$JOB_ID" "originais" "$SALES_OUT"
        print_duration $DURATION "Etapa 3"
    else
        create_json_placeholder "$SALES_OUT" "SALES_SHARK" "$JOB_ID" "Invalid JSON"
        sync_file_to_railway "$JOB_ID" "originais" "$SALES_OUT"
    fi
else
    create_json_placeholder "$SALES_OUT" "SALES_SHARK" "$JOB_ID" "All retries failed"
    sync_file_to_railway "$JOB_ID" "originais" "$SALES_OUT"
fi

SALES_CONTENT=$(cat "$SALES_OUT" 2>/dev/null || echo "Sales Shark não disponível")

# ============================================
# ETAPA 4: ANGEL + DEMON (Paralelo - Sonnet)
# Angel defende a arte, Demon ataca o mercado
# ============================================
echo ""
echo "⏳ ETAPA 4: Angel vs Demon (Paralelo - Sonnet)"
STEP_START=$(start_timer)
ANGEL_OUT="$WIP_DIR/${JOB_ID}_ANGEL.json"
DEMON_OUT="$WIP_DIR/${JOB_ID}_DEMON.json"

# ANGEL (Sonnet) - defesa artística
safe_timeout 300s openclaw agent --agent sonnet \
  --session-id "bo-${SHORT_ID}-angel-v2" \
  --message "${ANGEL_ROLE}

---

MATERIAL ORIGINAL:
${INPUT_CONTENT}

TRIAGE:
${TRIAGE_CONTENT}

CREATIVE DOCTOR (Análise por Episódio):
${CREATIVE_CONTENT}

SALES SHARK (Auditoria Comercial):
${SALES_CONTENT}

CONTEXTO: Projeto exibido no Domingo Espetacular (Record). T2 é para o mesmo programa.

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo: ${ANGEL_OUT}
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.

INSTRUÇÕES:
Defenda o projeto conforme seu role e salve o resultado JSON no arquivo: ${ANGEL_OUT}" \
  --timeout 240 > "$LOG_DIR/${JOB_ID}_04A_ANGEL.log" 2>&1 &
ANGEL_PID=$!

# DEMON (Sonnet) - destruição impiedosa
safe_timeout 300s openclaw agent --agent sonnet \
  --session-id "bo-${SHORT_ID}-demon-v2" \
  --message "${DEMON_ROLE}

---

MATERIAL ORIGINAL:
${INPUT_CONTENT}

TRIAGE:
${TRIAGE_CONTENT}

CREATIVE DOCTOR (Análise por Episódio):
${CREATIVE_CONTENT}

SALES SHARK (Auditoria Comercial):
${SALES_CONTENT}

CONTEXTO: Projeto exibido no Domingo Espetacular (Record). T2 é para o mesmo programa.

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo: ${DEMON_OUT}
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.

INSTRUÇÕES:
Destrua as ilusões conforme seu role e salve o resultado JSON no arquivo: ${DEMON_OUT}" \
  --timeout 240 > "$LOG_DIR/${JOB_ID}_04B_DEMON.log" 2>&1 &
DEMON_PID=$!

echo "  >> Angel (PID: $ANGEL_PID) e Demon (PID: $DEMON_PID) em paralelo..."

wait $ANGEL_PID
ANGEL_STATUS=$?
wait $DEMON_PID
DEMON_STATUS=$?

DURATION=$(get_duration_ms $STEP_START)

if [ -f "$ANGEL_OUT" ] && validate_json "$ANGEL_OUT"; then
    echo "✅ Angel concluído"
    sync_file_to_railway "$JOB_ID" "originais" "$ANGEL_OUT"
else
    [ $ANGEL_STATUS -ne 0 ] && echo "⚠️ Angel falhou com código $ANGEL_STATUS"
    create_json_placeholder "$ANGEL_OUT" "ANGEL" "$JOB_ID" "Agent failed or invalid JSON"
fi

if [ -f "$DEMON_OUT" ] && validate_json "$DEMON_OUT"; then
    echo "✅ Demon concluído"
    sync_file_to_railway "$JOB_ID" "originais" "$DEMON_OUT"
else
    [ $DEMON_STATUS -ne 0 ] && echo "⚠️ Demon falhou com código $DEMON_STATUS"
    create_json_placeholder "$DEMON_OUT" "DEMON" "$JOB_ID" "Agent failed or invalid JSON"
fi

print_duration $DURATION "Etapa 4"

ANGEL_CONTENT=$(cat "$ANGEL_OUT" 2>/dev/null || echo "Angel não disponível")
DEMON_CONTENT=$(cat "$DEMON_OUT" 2>/dev/null || echo "Demon não disponível")

# ============================================
# ETAPA 5: DOCTOR FINAL (GPT-5.2 non-codex)
# Parecer criativo final com análise per-episódio
# Substitui Greenlight - foco em feedback acionável
# ============================================
echo ""
echo "⏳ ETAPA 5: Doctor Final (GPT-5.2)"
STEP_START=$(start_timer)
DOCTOR_OUT="$WIP_DIR/${JOB_ID}_DOCTOR_FINAL.json"
DOCTOR_LOG="$LOG_DIR/${JOB_ID}_05_DOCTOR_FINAL.log"

DOCTOR_MSG="${DOCTOR_ROLE}

---

MATERIAL ORIGINAL:
${INPUT_CONTENT}

TRIAGE (Classificação):
${TRIAGE_CONTENT}

CREATIVE DOCTOR (Análise Criativa por Episódio):
${CREATIVE_CONTENT}

SALES SHARK (Auditoria Comercial):
${SALES_CONTENT}

ANGEL (Defesa Artística):
${ANGEL_CONTENT}

DEMON (Crítica de Mercado):
${DEMON_CONTENT}

CONTEXTO CRUCIAL: Este projeto (Pitada de Brasil) foi exibido dentro do Domingo Espetacular na Record. A segunda temporada é para o mesmo programa. O comprador (Record) pediu a T2.

---

## INSTRUÇÕES DE OUTPUT (CRÍTICO)
1. Salve o resultado JSON EXATAMENTE no caminho de arquivo: ${DOCTOR_OUT}
2. NÃO mude o nome do arquivo.
3. NÃO adicione nenhum texto antes ou depois do JSON.
4. Analise CADA EPISÓDIO individualmente no veredito final.
5. Respeite rigorosamente o schema JSON definido no seu role.

INSTRUÇÕES:
Dê o parecer criativo final conforme seu role, com análise INDIVIDUAL de cada episódio, e salve o resultado JSON no arquivo: ${DOCTOR_OUT}"

DOCTOR_OK=0
if run_agent "gpt52" "bo-${SHORT_ID}-doctor-v2" "$DOCTOR_MSG" "$DOCTOR_OUT" 300 "$LOG_DIR"; then
    if validate_json "$DOCTOR_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Doctor Final concluído"
        sync_file_to_railway "$JOB_ID" "originais" "$DOCTOR_OUT"
        print_duration $DURATION "Etapa 5"
        DOCTOR_OK=1
    fi
fi

if [ $DOCTOR_OK -ne 1 ]; then
    # Fallback para GPT-5.3 Codex
    echo "⚠️ GPT-5.2 falhou. Tentando fallback GPT-5.3 Codex..."

    DOCTOR_FALLBACK_MSG="${DOCTOR_ROLE}

---

MATERIAL ORIGINAL:
${INPUT_CONTENT}

TRIAGE:
${TRIAGE_CONTENT}

CREATIVE DOCTOR:
${CREATIVE_CONTENT}

SALES SHARK:
${SALES_CONTENT}

ANGEL:
${ANGEL_CONTENT}

DEMON:
${DEMON_CONTENT}

CONTEXTO: Projeto exibido no Domingo Espetacular (Record). T2 para o mesmo programa.

---

Salve o resultado JSON no arquivo: ${DOCTOR_OUT}"

    if run_agent "gpt53" "bo-${SHORT_ID}-doctor-fb" "$DOCTOR_FALLBACK_MSG" "$DOCTOR_OUT" 240 "$LOG_DIR"; then
        if validate_json "$DOCTOR_OUT"; then
            echo "✅ Doctor Final concluído via fallback GPT-5.3"
            sync_file_to_railway "$JOB_ID" "originais" "$DOCTOR_OUT"
            DOCTOR_OK=1
        fi
    fi

    if [ $DOCTOR_OK -ne 1 ]; then
        create_json_placeholder "$DOCTOR_OUT" "DOCTOR_FINAL" "$JOB_ID" "All retries failed (GPT-5.2 + GPT-5.3 fallback)"
        sync_file_to_railway "$JOB_ID" "originais" "$DOCTOR_OUT"
    fi
fi

# ============================================
# GERAR RELATÓRIO FINAL (FINAL.md)
# ============================================
echo ""
echo "📝 Gerando relatório final..."

FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"

# Extrair dados do Doctor Final
DF_SCORE=$(jq -r '.veredito_geral.score_final // .score_final // 0' "$DOCTOR_OUT" 2>/dev/null || echo "N/A")
DF_ACAO=$(jq -r '.veredito_geral.acao // .acao // "UNKNOWN"' "$DOCTOR_OUT" 2>/dev/null || echo "UNKNOWN")
DF_RESUMO=$(jq -r '.veredito_geral.resumo_executivo // "N/A"' "$DOCTOR_OUT" 2>/dev/null || echo "N/A")
DF_TITULO=$(jq -r '.titulo_projeto // "Sem título"' "$DOCTOR_OUT" 2>/dev/null || echo "Sem título")

# Extrair dados do Triage
TR_TIPO=$(jq -r '.tipo_material // "N/A"' "$TRIAGE_OUT" 2>/dev/null || echo "N/A")
TR_GENERO=$(jq -r '.genero_detalhe // .genero // "N/A"' "$TRIAGE_OUT" 2>/dev/null || echo "N/A")
TR_PROF=$(jq -r '.profundidade.label // "N/A"' "$TRIAGE_OUT" 2>/dev/null || echo "N/A")

# Extrair logline do Creative Doctor
CD_LOGLINE=$(jq -r '.logline_reescrita // "N/A"' "$CREATIVE_OUT" 2>/dev/null || echo "N/A")

# Extrair ranking do Doctor Final
DF_TOP3=$(jq -r '.ranking_episodios.top3 // [] | join(", ")' "$DOCTOR_OUT" 2>/dev/null || echo "N/A")
DF_BOTTOM3=$(jq -r '.ranking_episodios.bottom3 // [] | join(", ")' "$DOCTOR_OUT" 2>/dev/null || echo "N/A")

cat > "$FINAL_OUT" <<FINALEOF
# 🎬 ORIGINAIS BRICK: RELATÓRIO FINAL

## ${DF_TITULO}

> **${DF_RESUMO}**

---

## VEREDITO

| Critério | Valor |
|----------|-------|
| **Score Final** | ${DF_SCORE}/100 |
| **Ação** | ${DF_ACAO} |

## LOGLINE REESCRITA
> ${CD_LOGLINE}

## RANKING DE EPISÓDIOS
- **Top 3:** ${DF_TOP3}
- **Bottom 3:** ${DF_BOTTOM3}

---

## CLASSIFICAÇÃO (Triage)
- **Tipo de Material:** ${TR_TIPO}
- **Gênero:** ${TR_GENERO}
- **Profundidade:** ${TR_PROF}

---

## ANÁLISES COMPLETAS

### Creative Doctor (GPT-5.2 — Análise por Episódio)
\`\`\`json
$(cat "$CREATIVE_OUT" 2>/dev/null || echo '{"error": "não disponível"}')
\`\`\`

### Sales Shark (Auditoria Comercial)
\`\`\`json
$(cat "$SALES_OUT" 2>/dev/null || echo '{"error": "não disponível"}')
\`\`\`

### Angel (Defesa Artística)
\`\`\`json
$(cat "$ANGEL_OUT" 2>/dev/null || echo '{"error": "não disponível"}')
\`\`\`

### Demon (Ataque de Mercado)
\`\`\`json
$(cat "$DEMON_OUT" 2>/dev/null || echo '{"error": "não disponível"}')
\`\`\`

### Doctor Final (GPT-5.2 — Parecer por Episódio)
\`\`\`json
$(cat "$DOCTOR_OUT" 2>/dev/null || echo '{"error": "não disponível"}')
\`\`\`

---
*Pipeline Originais Brick v2.0 | $(date -Iseconds)*
FINALEOF

sync_file_to_railway "$JOB_ID" "originais" "$FINAL_OUT"

# ============================================
# SUMÁRIO
# ============================================
PIPELINE_DURATION=$(get_duration_ms $PIPELINE_START)

echo ""
cleanup_children 2>/dev/null || true

echo "🏁 Pipeline Originais v2.0 Finalizado"
print_duration $PIPELINE_DURATION "Pipeline Total"
echo ""
echo "📊 RESULTADO:"
echo "   Título: $DF_TITULO"
echo "   Score: $DF_SCORE/100"
echo "   Ação: $DF_ACAO"
echo ""
echo "📁 Arquivos em: $WIP_DIR"
echo "📋 Logs em: $LOG_DIR"
echo ""
echo "Arquivos gerados:"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"

echo "[$(date -Iseconds)] Pipeline finalizado: $JOB_ID | Score: $DF_SCORE | Ação: $DF_ACAO | Duration: ${PIPELINE_DURATION}ms" >> "$LOG_DIR/pipeline.log"
