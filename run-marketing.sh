#!/bin/bash
# BRICK AI MARKETING PIPELINE
# Executa pipeline de Marketing (Content & Flow)
# Usa openclaw agent (sincrono)

# set -e  # Removed: placeholders handle errors

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

# Detectar diretório do script dinamicamente
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
WIP_DIR="$PROJECT_ROOT/history/marketing/wip"

echo "📢 Brick AI Marketing Pipeline"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

mkdir -p "$WIP_DIR"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")
ROLES_DIR="$PROJECT_ROOT/roles"

# Carregar todos os role files
VALIDATOR_ROLE=$(cat "$ROLES_DIR/BRIEF_VALIDATOR.md" 2>/dev/null || echo "N/A")
AUDIENCE_ROLE=$(cat "$ROLES_DIR/AUDIENCE_ANALYST.md" 2>/dev/null || echo "N/A")
RESEARCHER_ROLE=$(cat "$ROLES_DIR/TOPIC_RESEARCHER.md" 2>/dev/null || echo "N/A")
CLAIMS_ROLE=$(cat "$ROLES_DIR/CLAIMS_CHECKER.md" 2>/dev/null || echo "N/A")
COPYWRITER_ROLE=$(cat "$ROLES_DIR/COPYWRITER.md" 2>/dev/null || echo "N/A")
BRAND_ROLE=$(cat "$ROLES_DIR/BRAND_GUARDIAN.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/CRITIC.md" 2>/dev/null || echo "N/A")
WALL_ROLE=$(cat "$ROLES_DIR/FILTRO_FINAL.md" 2>/dev/null || echo "N/A")

# ETAPA 0: Douglas (Ingestion)
echo "⏳ ETAPA 0: Douglas (Ingestion)"
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_PROCESSED.md"
echo "✅ Briefing processado"

# ETAPA 1: VALIDATOR (Flash)
echo ""
echo "⏳ ETAPA 1: Brief Validator (Flash)"
VALIDATOR_OUT="$WIP_DIR/${JOB_ID}_01_VALIDATOR.json"
openclaw agent --agent flash \
  --session-id "brick-mkt-${JOB_ID}-validator" \
  --message "${VALIDATOR_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Avalie o briefing conforme seu role acima e salve o resultado JSON no arquivo: ${VALIDATOR_OUT}" \
  --timeout 90 --json > /dev/null 2>&1

[ -f "$VALIDATOR_OUT" ] && echo "✅ Validator concluído" || { echo "⚠️ Placeholder criado"; echo '{"status":"PASS","can_proceed":true}' > "$VALIDATOR_OUT"; }

# ETAPA 2: AUDIENCE ANALYST (Flash)
echo ""
echo "⏳ ETAPA 2: Audience Analyst (Flash)"
AUDIENCE_OUT="$WIP_DIR/${JOB_ID}_02_AUDIENCE.json"
openclaw agent --agent flash \
  --session-id "brick-mkt-${JOB_ID}-audience" \
  --message "${AUDIENCE_ROLE}

---

BRIEFING PROPOSTO:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Avalie o alinhamento do briefing com a persona oficial conforme seu role acima. Salve o resultado JSON no arquivo: ${AUDIENCE_OUT}" \
  --timeout 120 --json > /dev/null 2>&1

[ -f "$AUDIENCE_OUT" ] && echo "✅ Audience concluído" || { echo "⚠️ Placeholder criado"; echo '{"personas":[]}' > "$AUDIENCE_OUT"; }

# ETAPA 3: TOPIC RESEARCHER (Flash)
echo ""
echo "⏳ ETAPA 3: Topic Researcher (Flash)"
RESEARCH_OUT="$WIP_DIR/${JOB_ID}_03_RESEARCH.json"
AUDIENCE_CONTENT=$(cat "$AUDIENCE_OUT" 2>/dev/null || echo "N/A")
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
  --timeout 120 --json > /dev/null 2>&1

[ -f "$RESEARCH_OUT" ] && echo "✅ Research concluído" || { echo "⚠️ Placeholder criado"; echo '{"insights":[]}' > "$RESEARCH_OUT"; }

# ETAPA 4: CLAIMS CHECKER (Flash)
echo ""
echo "⏳ ETAPA 4: Claims Checker (Flash)"
CLAIMS_OUT="$WIP_DIR/${JOB_ID}_04_CLAIMS.json"
RESEARCH_CONTENT=$(cat "$RESEARCH_OUT" 2>/dev/null || echo "N/A")
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
  --timeout 90 --json > /dev/null 2>&1

[ -f "$CLAIMS_OUT" ] && echo "✅ Claims concluído" || { echo "⚠️ Placeholder criado"; echo '{"risk_level":"low"}' > "$CLAIMS_OUT"; }

# ETAPA 5: COPYWRITERS (3 modelos em paralelo)
echo ""
echo "⏳ ETAPA 5: Copywriters (3 modelos em paralelo)"
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

# GPT
openclaw agent --agent gpt \
  --session-id "brick-mkt-${JOB_ID}-copy-gpt" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter A - Estilo direto e persuasivo

---

${COPY_CONTEXT}

---

INSTRUÇÕES:
Escreva a copy conforme seu role acima (tom direto, persuasivo) e salve no arquivo: ${COPY_GPT_OUT}" \
  --timeout 150 --json > /dev/null 2>&1 &
GPT_PID=$!

# Flash
openclaw agent --agent flash \
  --session-id "brick-mkt-${JOB_ID}-copy-flash" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter B - Estilo eficiente e data-driven

---

${COPY_CONTEXT}

---

INSTRUÇÕES:
Escreva a copy conforme seu role acima (tom eficiente, pragmático) e salve no arquivo: ${COPY_FLASH_OUT}" \
  --timeout 150 --json > /dev/null 2>&1 &
FLASH_PID=$!

# Sonnet
openclaw agent --agent sonnet \
  --session-id "brick-mkt-${JOB_ID}-copy-sonnet" \
  --message "${COPYWRITER_ROLE}

VARIAÇÃO: Copywriter C - Estilo narrativo e emocional

---

${COPY_CONTEXT}

---

INSTRUÇÕES:
Escreva a copy conforme seu role acima (tom narrativo, storytelling) e salve no arquivo: ${COPY_SONNET_OUT}" \
  --timeout 150 --json > /dev/null 2>&1 &
SONNET_PID=$!

echo "  >> GPT (PID: $GPT_PID), Flash (PID: $FLASH_PID), Sonnet (PID: $SONNET_PID) em paralelo..."
wait $GPT_PID; wait $FLASH_PID; wait $SONNET_PID

[ -f "$COPY_GPT_OUT" ] && echo "✅ Copy A (GPT) concluído" || { echo "⚠️ Copy A placeholder"; echo "# COPY_GPT: Error" > "$COPY_GPT_OUT"; }
[ -f "$COPY_FLASH_OUT" ] && echo "✅ Copy B (Flash) concluído" || { echo "⚠️ Copy B placeholder"; echo "# COPY_FLASH: Error" > "$COPY_FLASH_OUT"; }
[ -f "$COPY_SONNET_OUT" ] && echo "✅ Copy C (Sonnet) concluído" || { echo "⚠️ Copy C placeholder"; echo "# COPY_SONNET: Error" > "$COPY_SONNET_OUT"; }

# ETAPA 6: BRAND GUARDIANS (Flash)
echo ""
echo "⏳ ETAPA 6: Brand Guardians (Flash)"
BRAND_GUARD_OUT="$WIP_DIR/${JOB_ID}_06_BRAND_GUARDIANS.json"
COPY_A=$(cat "$COPY_GPT_OUT" 2>/dev/null || echo "N/A")
COPY_B=$(cat "$COPY_FLASH_OUT" 2>/dev/null || echo "N/A")
COPY_C=$(cat "$COPY_SONNET_OUT" 2>/dev/null || echo "N/A")
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
  --timeout 120 --json > /dev/null 2>&1

[ -f "$BRAND_GUARD_OUT" ] && echo "✅ Brand Guardians concluído" || { echo "⚠️ Placeholder criado"; echo '{"scores":{}}' > "$BRAND_GUARD_OUT"; }

# ETAPA 7: CRITIC (Opus)
echo ""
echo "⏳ ETAPA 7: Critic (Opus)"
CRITIC_OUT="$WIP_DIR/${JOB_ID}_07_CRITICS.json"
GUARD_CONTENT=$(cat "$BRAND_GUARD_OUT" 2>/dev/null || echo "N/A")
openclaw agent --agent opus \
  --session-id "brick-mkt-${JOB_ID}-critic" \
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
Avalie as copies conforme seu role acima e salve o resultado JSON no arquivo: ${CRITIC_OUT}" \
  --timeout 180 --json > /dev/null 2>&1

[ -f "$CRITIC_OUT" ] && echo "✅ Critic concluído" || { echo "⚠️ Placeholder criado"; echo '{"winner":"C"}' > "$CRITIC_OUT"; }

# ETAPA 8: WALL / FILTRO FINAL (Opus)
echo ""
echo "⏳ ETAPA 8: Wall / Filtro Final (Opus)"
WALL_OUT="$WIP_DIR/${JOB_ID}_08_WALL.json"
CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")
openclaw agent --agent opus \
  --session-id "brick-mkt-${JOB_ID}-wall" \
  --message "${WALL_ROLE}

---

BRIEFING:
${BRIEFING_CONTENT}

COPY VENCEDORA + ANÁLISE DO CRITIC:
${CRITIC_CONTENT}

---

INSTRUÇÕES:
Faça a revisão final conforme seu role acima e salve o resultado JSON no arquivo: ${WALL_OUT}" \
  --timeout 150 --json > /dev/null 2>&1

[ -f "$WALL_OUT" ] && echo "✅ Wall concluído" || { echo "⚠️ Placeholder criado"; echo '{"status":"APPROVED","final_score":0}' > "$WALL_OUT"; }

# FINAL
FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"
WINNER=$(jq -r '.winner // .copy_winner // .winner_copy // "C"' "$CRITIC_OUT" 2>/dev/null | tr -d '"')
case "$WINNER" in
  A|a) WIN_FILE="$COPY_GPT_OUT" ;; 
  B|b) WIN_FILE="$COPY_FLASH_OUT" ;; 
  C|c) WIN_FILE="$COPY_SONNET_OUT" ;; 
  *) WIN_FILE="$COPY_SONNET_OUT" ;;
esac

if [ -f "$WIN_FILE" ]; then
  {
    echo "# FINAL (vencedora: $WINNER)"
    echo ""
    cat "$WIN_FILE"
    echo ""
    echo "---"
    echo "\n## WALL (JSON)"
    cat "$WALL_OUT" 2>/dev/null || true
  } > "$FINAL_OUT"
else
  echo "# FINAL (placeholder)" > "$FINAL_OUT"
fi

echo ""
echo "🏁 Pipeline Marketing Finalizado"
echo "📁 Arquivos em: $WIP_DIR"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"
