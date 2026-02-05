#!/bin/bash
# BRICK AI IDEAS PIPELINE
# Executa pipeline de Ideias (Fast Track)
# Usa openclaw agent (sincrono) - cada etapa espera o agente terminar

set -e

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
  --message "Você é o PAIN_CHECK do Brick AI War Room.

Analise esta ideia bruta e avalie se resolve uma dor real:

---
${BRIEFING_CONTENT}
---

INSTRUÇÕES:
1. Leia a ideia acima
2. Escreva o resultado como JSON no arquivo: ${PAIN_OUT}
3. Use EXATAMENTE esta estrutura JSON:
{
  \"agent\": \"PAIN_CHECK\",
  \"job_id\": \"${JOB_ID}\",
  \"problem_score\": <1-10>,
  \"audience_size\": \"<small/medium/large/massive>\",
  \"urgency\": \"<low/medium/high/critical>\",
  \"analysis\": \"<sua análise detalhada>\",
  \"verdict\": \"<VALID ou INVALID>\"
}
4. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
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
  --message "Você é o MARKET_SCAN do Brick AI War Room.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

INSTRUÇÕES:
1. Pesquise concorrentes e soluções similares para esta ideia
2. Liste pelo menos 3 benchmarks relevantes
3. Analise o gap de oportunidade
4. Escreva o resultado como Markdown no arquivo: ${MARKET_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1

if [ -f "$MARKET_OUT" ]; then
    echo "✅ Market Scan concluído: $MARKET_OUT"
else
    echo "⚠️ Market Scan não gerou arquivo, criando placeholder"
    echo "# MARKET_SCAN: Error\nAgent did not write output file" > "$MARKET_OUT"
fi

# ETAPA 3: ANGLE GEN (Sonnet)
echo ""
echo "⏳ ETAPA 3: Angle Gen (Sonnet)"
ANGLE_OUT="$WIP_DIR/${JOB_ID}_ANGLE_GEN.md"
MARKET_CONTENT=$(cat "$MARKET_OUT" 2>/dev/null || echo "Market scan não disponível")
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-angle" \
  --message "Você é o ANGLE_GEN do Brick AI War Room.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

INSTRUÇÕES:
1. Com base em toda a análise acima, gere 3 ângulos criativos ÚNICOS (Unique Mechanisms)
2. Cada ângulo deve diferenciar esta ideia da concorrência
3. Seja criativo mas realista
4. Escreva o resultado como Markdown no arquivo: ${ANGLE_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1

if [ -f "$ANGLE_OUT" ]; then
    echo "✅ Angle Gen concluído: $ANGLE_OUT"
else
    echo "⚠️ Angle Gen não gerou arquivo, criando placeholder"
    echo "# ANGLE_GEN: Error\nAgent did not write output file" > "$ANGLE_OUT"
fi

# ETAPA 4: VIABILITY (Opus)
echo ""
echo "⏳ ETAPA 4: Viability (Opus)"
VIABILITY_OUT="$WIP_DIR/${JOB_ID}_VIABILITY.json"
ANGLE_CONTENT=$(cat "$ANGLE_OUT" 2>/dev/null || echo "Angle gen não disponível")
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-viability" \
  --message "Você é o VIABILITY JUDGE do Brick AI War Room. Você é o juiz supremo.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

ANGLE GEN:
${ANGLE_CONTENT}

INSTRUÇÕES:
1. Avalie TUDO acima com olhar crítico e imparcial
2. Dê um score final de viabilidade (0-100)
3. Decida GO ou NO-GO
4. Escreva o resultado como JSON no arquivo: ${VIABILITY_OUT}
5. Use EXATAMENTE esta estrutura:
{
  \"agent\": \"VIABILITY\",
  \"job_id\": \"${JOB_ID}\",
  \"final_score\": <0-100>,
  \"decision\": \"<GO ou NO-GO>\",
  \"reasoning\": \"<justificativa detalhada>\",
  \"strengths\": [\"...\"],
  \"weaknesses\": [\"...\"],
  \"recommendation\": \"<próximos passos se GO>\"
}
6. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
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
