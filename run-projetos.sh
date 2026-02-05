#!/bin/bash
# BRICK AI PROJECTS PIPELINE
# Executa pipeline de Projetos (Creative/Concept)

set -e

BRIEFING_FILE="$1"

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

# Extrair JOB_ID do nome do briefing (ex: 1770288147944_meu_projeto.md -> 1770288147944_meu_projeto)
BASENAME=$(basename "$BRIEFING_FILE" .md)
BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"

if [ -z "$JOB_ID" ]; then
    JOB_ID=$(date +%s%3N)
fi

PROJECT_ROOT="$HOME/projects/Brick_Marketing"
WIP_DIR="$PROJECT_ROOT/history/projetos/wip"
ROLES_DIR="$PROJECT_ROOT/roles/proposal"

echo "🎬 Brick AI Projects Pipeline"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

mkdir -p "$WIP_DIR"

# ETAPA 0: Douglas
echo "⏳ ETAPA 0: Douglas"
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_BRIEFING_INPUT.md"

# ETAPA 1: BRAND DIGEST (Flash)
echo ""
echo "⏳ ETAPA 1: Brand Digest"
openclaw sessions spawn --task "
Você é o BRAND_DIGEST.
Leia: $BRIEFING_FILE
Role: $ROLES_DIR/01_BRAND_DIGEST.md

Output JSON: $WIP_DIR/${JOB_ID}_BRAND_DIGEST.json
" --model flash --timeout 90 --cleanup delete

# ETAPA 2: CREATIVE IDEATION (Sonnet)
echo ""
echo "⏳ ETAPA 2: Creative Ideation"
openclaw sessions spawn --task "
Você é o CREATIVE_IDEATION.
Leia: $WIP_DIR/${JOB_ID}_BRAND_DIGEST.json
Role: $ROLES_DIR/02_CREATIVE_IDEATION.md

Output Markdown: $WIP_DIR/${JOB_ID}_CREATIVE_IDEATION.md
" --model sonnet --timeout 180 --cleanup delete

# ETAPA 3: CONCEPT CRITIC (Flash)
echo ""
echo "⏳ ETAPA 3: Concept Critic"
openclaw sessions spawn --task "
Você é o CONCEPT_CRITIC.
Leia: $WIP_DIR/${JOB_ID}_CREATIVE_IDEATION.md
Role: $ROLES_DIR/03_CONCEPT_CRITIC.md

Output JSON: $WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.json
" --model flash --timeout 60 --cleanup delete

# ETAPA 4: EXECUTION DESIGN (Gemini/GPT)
echo ""
echo "⏳ ETAPA 4: Execution Design"
openclaw sessions spawn --task "
Você é o EXECUTION_DESIGN.
Leia: $WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.json
Role: $ROLES_DIR/04_EXECUTION_DESIGN.md

Output Markdown: $WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.md
" --model gpt --timeout 120 --cleanup delete

# ETAPA 5: COPYWRITER (Sonnet)
echo ""
echo "⏳ ETAPA 5: Copywriter"
openclaw sessions spawn --task "
Você é o COPYWRITER.
Leia: $WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.md
Role: $ROLES_DIR/05_COPYWRITER.md

Output Markdown: $WIP_DIR/${JOB_ID}_COPYWRITER.md
" --model sonnet --timeout 180 --cleanup delete

# ETAPA 6: DIRECTOR (Opus)
echo ""
echo "⏳ ETAPA 6: Director"
openclaw sessions spawn --task "
Você é o DIRECTOR.
Leia: $WIP_DIR/${JOB_ID}_COPYWRITER.md
Role: $ROLES_DIR/06_DIRECTOR.md

Output Markdown: $WIP_DIR/${JOB_ID}_DIRECTOR.md
" --model opus --timeout 180 --cleanup delete

echo ""
echo "🏁 Pipeline Projetos Finalizado"
