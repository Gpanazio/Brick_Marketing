#!/bin/bash
# BRICK AI PROJECTS PIPELINE
# Executa pipeline de Projetos (Creative/Concept)
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
WIP_DIR="$PROJECT_ROOT/history/projetos/wip"
ROLES_DIR="$PROJECT_ROOT/roles"

echo "🎬 Brick AI Projects Pipeline"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

mkdir -p "$WIP_DIR"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")
ROLES_DIR="$PROJECT_ROOT/roles"

# Carregar todos os role files
BRAND_DIGEST_ROLE=$(cat "$ROLES_DIR/BRAND_DIGEST.md" 2>/dev/null || echo "N/A")
CREATIVE_ROLE=$(cat "$ROLES_DIR/CREATIVE_IDEATION.md" 2>/dev/null || echo "N/A")
CRITIC_ROLE=$(cat "$ROLES_DIR/CONCEPT_CRITIC.md" 2>/dev/null || echo "N/A")
EXECUTION_ROLE=$(cat "$ROLES_DIR/EXECUTION_DESIGN.md" 2>/dev/null || echo "N/A")
PROPOSAL_ROLE=$(cat "$ROLES_DIR/PROPOSAL_WRITER.md" 2>/dev/null || echo "N/A")
DIRECTOR_ROLE=$(cat "$ROLES_DIR/PROJECT_DIRECTOR.md" 2>/dev/null || echo "N/A")

# ETAPA 0: Douglas (Ingestion)
echo "⏳ ETAPA 0: Douglas (Ingestion)"
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_BRIEFING_INPUT.md"
echo "✅ Briefing salvo"

# ETAPA 1: BRAND DIGEST (Flash)
echo ""
echo "⏳ ETAPA 1: Brand Digest (Flash)"
BRAND_OUT="$WIP_DIR/${JOB_ID}_BRAND_DIGEST.json"
openclaw agent --agent flash \
  --session-id "brick-proj-${JOB_ID}-brand" \
  --message "${BRAND_DIGEST_ROLE}

---

BRIEFING DO CLIENTE:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Extraia a essência da marca conforme seu role acima e salve o resultado JSON no arquivo: ${BRAND_OUT}" \
  --timeout 120 --json > /dev/null 2>&1

if [ -f "$BRAND_OUT" ]; then
    echo "✅ Brand Digest concluído: $BRAND_OUT"
else
    echo "⚠️ Brand Digest não gerou arquivo, criando placeholder"
    echo "# BRAND_DIGEST: Error\nAgent did not write output file" > "$BRAND_OUT"
fi

# ETAPA 2: CREATIVE IDEATION (3 modelos em paralelo)
echo ""
echo "⏳ ETAPA 2: Creative Ideation (3 modelos em paralelo)"
BRAND_CONTENT=$(cat "$BRAND_OUT" 2>/dev/null || echo "Brand digest não disponível")

IDEATION_GPT_OUT="$WIP_DIR/${JOB_ID}_IDEATION_GPT.md"
IDEATION_FLASH_OUT="$WIP_DIR/${JOB_ID}_IDEATION_FLASH.md"
IDEATION_SONNET_OUT="$WIP_DIR/${JOB_ID}_IDEATION_SONNET.md"

IDEATION_CONTEXT="BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}"

# GPT (ousado)
openclaw agent --agent gpt \
  --session-id "brick-proj-${JOB_ID}-ideation-gpt" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito A - Ousado e Surpreendente

---

${IDEATION_CONTEXT}

---

INSTRUÇÕES:
Gere seu conceito criativo conforme seu role acima (foco: ousadia, surpresa) e salve no arquivo Markdown: ${IDEATION_GPT_OUT}" \
  --timeout 120 --json > /dev/null 2>&1 &
GPT_PID=$!

# Flash (pragmático)
openclaw agent --agent flash \
  --session-id "brick-proj-${JOB_ID}-ideation-flash" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito B - Pragmático e Executável

---

${IDEATION_CONTEXT}

---

INSTRUÇÕES:
Gere seu conceito criativo conforme seu role acima (foco: clareza, executabilidade) e salve no arquivo Markdown: ${IDEATION_FLASH_OUT}" \
  --timeout 120 --json > /dev/null 2>&1 &
FLASH_PID=$!

# Sonnet (emocional)
openclaw agent --agent sonnet \
  --session-id "brick-proj-${JOB_ID}-ideation-sonnet" \
  --message "${CREATIVE_ROLE}

VARIAÇÃO: Conceito C - Emocional e Storytelling

---

${IDEATION_CONTEXT}

---

INSTRUÇÕES:
Gere seu conceito criativo conforme seu role acima (foco: emoção, narrativa) e salve no arquivo Markdown: ${IDEATION_SONNET_OUT}" \
  --timeout 120 --json > /dev/null 2>&1 &
SONNET_PID=$!

echo "  >> GPT (PID: $GPT_PID), Flash (PID: $FLASH_PID), Sonnet (PID: $SONNET_PID) em paralelo..."
wait $GPT_PID
wait $FLASH_PID
wait $SONNET_PID

for f in "$IDEATION_GPT_OUT:GPT" "$IDEATION_FLASH_OUT:Flash" "$IDEATION_SONNET_OUT:Sonnet"; do
    FILE="${f%%:*}"
    NAME="${f##*:}"
    if [ -f "$FILE" ]; then
        echo "✅ Ideation $NAME concluído"
    else
        echo "⚠️ Ideation $NAME não gerou arquivo, criando placeholder"
        echo "# IDEATION_${NAME}: Error\nAgent did not write output file" > "$FILE"
    fi
done

# ETAPA 3: CONCEPT CRITIC (Gemini Pro)
echo ""
echo "⏳ ETAPA 3: Concept Critic (Gemini Pro)"
CRITIC_OUT="$WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.json"
IDEATION_GPT_CONTENT=$(cat "$IDEATION_GPT_OUT" 2>/dev/null || echo "N/A")
IDEATION_FLASH_CONTENT=$(cat "$IDEATION_FLASH_OUT" 2>/dev/null || echo "N/A")
IDEATION_SONNET_CONTENT=$(cat "$IDEATION_SONNET_OUT" 2>/dev/null || echo "N/A")
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
  --timeout 150 --json > /dev/null 2>&1

if [ -f "$CRITIC_OUT" ]; then
    echo "✅ Concept Critic concluído: $CRITIC_OUT"
else
    echo "⚠️ Concept Critic não gerou arquivo, criando placeholder"
    echo "# CONCEPT_CRITIC: Error\nAgent did not write output file" > "$CRITIC_OUT"
fi

# ETAPA 4: EXECUTION DESIGN (Gemini Pro)
echo ""
echo "⏳ ETAPA 4: Execution Design (Gemini Pro)"
EXEC_OUT="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.json"
CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")
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
  --timeout 150 --json > /dev/null 2>&1

if [ -f "$EXEC_OUT" ]; then
    echo "✅ Execution Design concluído: $EXEC_OUT"
else
    echo "⚠️ Execution Design não gerou arquivo, criando placeholder"
    echo "# EXECUTION_DESIGN: Error\nAgent did not write output file" > "$EXEC_OUT"
fi

# ETAPA 5: COPYWRITER (GPT 5.2)
echo ""
echo "⏳ ETAPA 5: Copywriter (GPT 5.2)"
COPY_OUT="$WIP_DIR/${JOB_ID}_COPYWRITER.md"
EXEC_CONTENT=$(cat "$EXEC_OUT" 2>/dev/null || echo "N/A")
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
Escreva a copy final conforme seu role acima e salve o resultado Markdown no arquivo: ${COPY_OUT}" \
  --timeout 150 --json > /dev/null 2>&1

if [ -f "$COPY_OUT" ]; then
    echo "✅ Copywriter concluído: $COPY_OUT"
else
    echo "⚠️ Copywriter não gerou arquivo, criando placeholder"
    echo "# COPYWRITER: Error\nAgent did not write output file" > "$COPY_OUT"
fi

# ETAPA 6: DIRECTOR (Gemini Pro)
echo ""
echo "⏳ ETAPA 6: Director (Gemini Pro)"
DIRECTOR_OUT="$WIP_DIR/${JOB_ID}_DIRECTOR.md"
COPY_CONTENT=$(cat "$COPY_OUT" 2>/dev/null || echo "N/A")
DIRECTOR_ROLE=$(cat "$ROLES_DIR/PROJECT_DIRECTOR.md" 2>/dev/null || echo "N/A")
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
  --timeout 180 --json > /dev/null 2>&1

if [ -f "$DIRECTOR_OUT" ]; then
    echo "✅ Director concluído: $DIRECTOR_OUT"
else
    echo "⚠️ Director não gerou arquivo, criando placeholder"
    echo "# DIRECTOR: Error\nAgent did not write output file" > "$DIRECTOR_OUT"
fi

# FINAL
echo ""
echo "🏁 Pipeline Projetos Finalizado"
echo "📁 Arquivos em: $WIP_DIR"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"
