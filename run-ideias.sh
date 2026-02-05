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

# ETAPA 3: ANGLE GEN + DEVIL GEN (Paralelo - Sonnet)
echo ""
echo "⏳ ETAPA 3: Angel vs Devil (Paralelo - Sonnet)"
ANGLE_OUT="$WIP_DIR/${JOB_ID}_ANGLE_GEN.md"
DEVIL_OUT="$WIP_DIR/${JOB_ID}_DEVIL_GEN.md"
MARKET_CONTENT=$(cat "$MARKET_OUT" 2>/dev/null || echo "Market scan não disponível")

# ANGEL (ângulos criativos a favor)
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-angle" \
  --message "Você é o ANGLE_GEN (Angel Advocate) do Brick AI War Room.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

INSTRUÇÕES:
1. Você é o ADVOGADO DA IDEIA. Seu papel é encontrar o MELHOR dessa ideia.
2. Gere 3 ângulos criativos ÚNICOS (Unique Mechanisms) que diferenciam esta ideia
3. Para cada ângulo: nome, descrição, por que funciona, exemplo de execução
4. Seja criativo mas realista -- venda a ideia com argumentos sólidos
5. Escreva o resultado como Markdown no arquivo: ${ANGLE_OUT}
6. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1 &
ANGEL_PID=$!

# DEVIL (destruição criativa)
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-devil" \
  --message "Você é o DEVIL_GEN (Devil's Advocate) do Brick AI War Room.

IDEIA ORIGINAL:
${BRIEFING_CONTENT}

PAIN CHECK:
${PAIN_CONTENT}

MARKET SCAN:
${MARKET_CONTENT}

INSTRUÇÕES:
1. Você é o ADVOGADO DO DIABO. Seu papel é DESTRUIR essa ideia com argumentos reais.
2. Liste os 3 maiores riscos/falhas fatais dessa ideia
3. Para cada risco: descrição, probabilidade (alta/média/baixa), impacto, evidência de mercado
4. Sugira o que precisaria mudar para cada risco ser mitigado
5. Seja implacável mas justo -- não invente problemas, encontre os reais
6. Escreva o resultado como Markdown no arquivo: ${DEVIL_OUT}
7. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
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
    echo "# ANGLE_GEN: Error\nAgent did not write output file" > "$ANGLE_OUT"
fi

if [ -f "$DEVIL_OUT" ]; then
    echo "✅ Devil Gen concluído: $DEVIL_OUT"
else
    echo "⚠️ Devil Gen não gerou arquivo, criando placeholder"
    echo "# DEVIL_GEN: Error\nAgent did not write output file" > "$DEVIL_OUT"
fi

# ETAPA 4: VIABILITY (Opus)
echo ""
echo "⏳ ETAPA 4: Viability (Opus)"
VIABILITY_OUT="$WIP_DIR/${JOB_ID}_VIABILITY.json"
ANGLE_CONTENT=$(cat "$ANGLE_OUT" 2>/dev/null || echo "Angle gen não disponível")
DEVIL_CONTENT=$(cat "$DEVIL_OUT" 2>/dev/null || echo "Devil gen não disponível")
openclaw agent \
  --session-id "brick-ideias-${JOB_ID}-viability" \
  --message "Você é o VIABILITY JUDGE do Brick AI War Room. Você é o juiz supremo e IMPARCIAL.

Você recebeu dois pareceres opostos sobre a mesma ideia: o Angel (a favor) e o Devil (contra). Sua missão é ponderar ambos e dar o veredicto final.

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

INSTRUÇÕES:
1. Avalie AMBOS os pareceres com olhar crítico e imparcial
2. Não tome partido -- pese os argumentos do Angel E do Devil
3. Dê um score final de viabilidade (0-100)
4. Decida GO ou NO-GO
5. Escreva o resultado como JSON no arquivo: ${VIABILITY_OUT}
6. Use EXATAMENTE esta estrutura:
{
  \"agent\": \"VIABILITY\",
  \"job_id\": \"${JOB_ID}\",
  \"final_score\": <0-100>,
  \"decision\": \"<GO ou NO-GO>\",
  \"reasoning\": \"<justificativa detalhada pesando Angel vs Devil>\",
  \"angel_merit\": \"<o que o Angel acertou>\",
  \"devil_merit\": \"<o que o Devil acertou>\",
  \"strengths\": [\"...\"],
  \"weaknesses\": [\"...\"],
  \"recommendation\": \"<próximos passos se GO>\"
}
7. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
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
