#!/bin/bash
# BRICK AI IDEAS PIPELINE
# Executa pipeline de Ideias (Fast Track)

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

# ETAPA 0: Douglas (Raw Idea)
echo "⏳ ETAPA 0: Douglas (Ingestion)"
RAW_FILE="$WIP_DIR/${JOB_ID}_RAW_IDEA.md"
cp "$BRIEFING_FILE" "$RAW_FILE"
echo "✅ Raw Idea processada"

# ETAPA 1: PAIN CHECK (Flash)
echo ""
echo "⏳ ETAPA 1: Pain Check (Flash)"
openclaw sessions spawn --task "
Você é o PAIN_CHECK.
Analise esta ideia bruta: $RAW_FILE

Output JSON esperado em: $WIP_DIR/${JOB_ID}_PAIN_CHECK.json
Estrutura: { \"problem_score\": 1-10, \"audience_size\": \"...\", \"urgency\": \"...\", \"verdict\": \"VALID/INVALID\" }
" --model flash --timeout 60 --cleanup delete

echo "✅ Pain Check concluído"

# ETAPA 2: MARKET SCAN (Flash)
echo ""
echo "⏳ ETAPA 2: Market Scan (Flash)"
openclaw sessions spawn --task "
Você é o MARKET_SCAN.
Leia: $WIP_DIR/${JOB_ID}_PAIN_CHECK.json

Output Markdown em: $WIP_DIR/${JOB_ID}_MARKET_SCAN.md
Pesquise concorrentes e soluções similares. Liste 3 benchmarks.
" --model flash --timeout 90 --cleanup delete

echo "✅ Market Scan concluído"

# ETAPA 3: ANGLE GEN (Sonnet)
echo ""
echo "⏳ ETAPA 3: Angle Gen (Sonnet)"
openclaw sessions spawn --task "
Você é o ANGLE_GEN.
Leia:
1. Pain: $WIP_DIR/${JOB_ID}_PAIN_CHECK.json
2. Market: $WIP_DIR/${JOB_ID}_MARKET_SCAN.md

Output Markdown em: $WIP_DIR/${JOB_ID}_ANGLE_GEN.md
Gere 3 ângulos criativos únicos (Unique Mechanisms) para diferenciar essa ideia.
" --model sonnet --timeout 90 --cleanup delete

echo "✅ Angle Gen concluído"

# ETAPA 4: VIABILITY (Opus)
echo ""
echo "⏳ ETAPA 4: Viability (Opus)"
openclaw sessions spawn --task "
Você é o VIABILITY (Supreme Judge).
Leia tudo:
1. $WIP_DIR/${JOB_ID}_PAIN_CHECK.json
2. $WIP_DIR/${JOB_ID}_MARKET_SCAN.md
3. $WIP_DIR/${JOB_ID}_ANGLE_GEN.md

Output JSON em: $WIP_DIR/${JOB_ID}_VIABILITY.json
Formato: { \"final_score\": 0-100, \"decision\": \"GO/NO-GO\", \"reasoning\": \"...\" }
" --model opus --timeout 120 --cleanup delete

echo "✅ Viability concluído"

echo ""
echo "🏁 Pipeline Ideias Finalizado"
