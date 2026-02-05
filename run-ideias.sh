#!/bin/bash
# BRICK AI IDEAS PIPELINE
# Executa pipeline de Ideias (Fast Track)
# Usa openclaw agent (sincrono) - cada etapa espera o agente terminar

# set -e  # Removed: placeholders handle errors

BRIEFING_FILE="$1"

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

# Extrair JOB_ID do nome do briefing (ex: 1770288147944_luta_de_boxe.md -> 1770288147944_luta_de_boxe)
BASENAME=$(basename "$BRIEFING_FILE" .md)
# Se o nome contiver um sufixo de role (RAW_IDEA, etc), strip it
BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"

# Fallback: se não conseguiu extrair, gera um novo (não deveria acontecer)
if [ -z "$JOB_ID" ]; then
    JOB_ID=$(date +%s%3N)
fi

PROJECT_ROOT="$HOME/projects/Brick_Marketing"
WIP_DIR="$PROJECT_ROOT/history/ideias/wip"
ROLES_DIR="$PROJECT_ROOT/roles"

echo "💡 Brick AI Ideas Pipeline"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

mkdir -p "$WIP_DIR"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# Carregar todos os role files
PAIN_ROLE=$(cat "$ROLES_DIR/PAIN_CHECK.md" 2>/dev/null || echo "N/A")
MARKET_ROLE=$(cat "$ROLES_DIR/MARKET_SCAN.md" 2>/dev/null || echo "N/A")
ANGLE_ROLE=$(cat "$ROLES_DIR/ANGLE_GEN.md" 2>/dev/null || echo "N/A")
DEVIL_ROLE=$(cat "$ROLES_DIR/DEVIL_GEN.md" 2>/dev/null || echo "N/A")
VIABILITY_ROLE=$(cat "$ROLES_DIR/VIABILITY.md" 2>/dev/null || echo "N/A")

# ETAPA 0: Douglas (Raw Idea)
echo "⏳ ETAPA 0: Douglas (Ingestion)"
RAW_FILE="$WIP_DIR/${JOB_ID}_RAW_IDEA.md"
cp "$BRIEFING_FILE" "$RAW_FILE"
echo "✅ Raw Idea salva em $RAW_FILE"

# ETAPA 1: PAIN CHECK (Flash)
echo ""
echo "⏳ ETAPA 1: Pain Check (Flash)"
PAIN_OUT="$WIP_DIR/${JOB_ID}_PAIN_CHECK.json"
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-pain" \
  --message "${PAIN_ROLE}

---

IDEIA BRUTA:
${BRIEFING_CONTENT}

---

INSTRUÇÕES:
Avalie a ideia conforme seu role acima e salve o resultado JSON no arquivo: ${PAIN_OUT}" \
  --timeout 120 --json > /dev/null 2>&1

if [ -f "$PAIN_OUT" ]; then
    echo "✅ Pain Check concluído: $PAIN_OUT"
else
    echo "⚠️ Pain Check não gerou arquivo, criando placeholder"
    echo '{"agent":"PAIN_CHECK","job_id":"'$JOB_ID'","verdict":"ERROR","analysis":"Agent did not write output file"}' > "$PAIN_OUT"
fi

# ETAPA 2: MARKET SCAN (Flash)
echo ""
echo "⏳ ETAPA 2: Market Scan (Flash)"
MARKET_OUT="$WIP_DIR/${JOB_ID}_MARKET_SCAN.md"
PAIN_CONTENT=$(cat "$PAIN_OUT" 2>/dev/null || echo "Pain check não disponível")
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-market" \
  --message "${MARKET_ROLE}

---

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

---

INSTRUÇÕES:
Pesquise conforme seu role acima e salve o resultado Markdown no arquivo: ${MARKET_OUT}" \
  --timeout 120 --json > /dev/null 2>&1

if [ -f "$MARKET_OUT" ]; then
    echo "✅ Market Scan concluído: $MARKET_OUT"
else
    echo "⚠️ Market Scan não gerou arquivo, criando placeholder"
    echo "# MARKET_SCAN: Error\nAgent did not write output file" > "$MARKET_OUT"
fi

# ETAPA 3: ANGLE GEN + DEVIL GEN (Paralelo - Sonnet)
echo ""
echo "⏳ ETAPA 3: Angel vs Devil (Paralelo - Sonnet)"
ANGLE_OUT="$WIP_DIR/${JOB_ID}_ANGLE_GEN.json"
DEVIL_OUT="$WIP_DIR/${JOB_ID}_DEVIL_GEN.json"
MARKET_CONTENT=$(cat "$MARKET_OUT" 2>/dev/null || echo "Market scan não disponível")

# ANGEL (ângulos criativos a favor)
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-angle" \
  --message "${ANGLE_ROLE}

---

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

---

INSTRUÇÕES:
Advogue pela ideia conforme seu role acima e salve o resultado JSON no arquivo: ${ANGLE_OUT}" \
  --timeout 120 --json > /dev/null 2>&1 &
ANGEL_PID=$!

# DEVIL (destruição criativa)
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-devil" \
  --message "${DEVIL_ROLE}

---

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

---

INSTRUÇÕES:
Destrua a ideia conforme seu role acima e salve o resultado JSON no arquivo: ${DEVIL_OUT}" \
  --timeout 120 --json > /dev/null 2>&1 &
DEVIL_PID=$!

# Esperar ambos terminarem
echo "  >> Angel (PID: $ANGEL_PID) e Devil (PID: $DEVIL_PID) rodando em paralelo..."
wait $ANGEL_PID
wait $DEVIL_PID

if [ -f "$ANGLE_OUT" ]; then
    echo "✅ Angel Gen concluído: $ANGLE_OUT"
else
    echo "⚠️ Angel Gen não gerou arquivo, criando placeholder"
    echo '{"agent":"ANGLE_GEN","status":"ERROR","angles":[]}' > "$ANGLE_OUT"
fi

if [ -f "$DEVIL_OUT" ]; then
    echo "✅ Devil Gen concluído: $DEVIL_OUT"
else
    echo "⚠️ Devil Gen não gerou arquivo, criando placeholder"
    echo '{"agent":"DEVIL_GEN","status":"ERROR","failure_scenarios":[]}' > "$DEVIL_OUT"
fi

# ETAPA 4: VIABILITY (Opus)
echo ""
echo "⏳ ETAPA 4: Viability (Opus)"
VIABILITY_OUT="$WIP_DIR/${JOB_ID}_VIABILITY.json"
ANGLE_CONTENT=$(cat "$ANGLE_OUT" 2>/dev/null || echo "Angle gen não disponível")
DEVIL_CONTENT=$(cat "$DEVIL_OUT" 2>/dev/null || echo "Devil gen não disponível")
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-viability" \
  --message "${VIABILITY_ROLE}

---

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
  --timeout 180 --json > /dev/null 2>&1

if [ -f "$VIABILITY_OUT" ]; then
    echo "✅ Viability concluído: $VIABILITY_OUT"
else
    echo "⚠️ Viability não gerou arquivo, criando placeholder"
    echo '{"agent":"VIABILITY","job_id":"'$JOB_ID'","decision":"ERROR","reasoning":"Agent did not write output file"}' > "$VIABILITY_OUT"
fi

echo ""
echo "🏁 Pipeline Ideias Finalizado"
echo "📁 Arquivos em: $WIP_DIR"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"
