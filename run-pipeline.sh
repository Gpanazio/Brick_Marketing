#!/bin/bash
# BRICK AI PIPELINE RUNNER
# Executa pipeline Marketing completo via OpenClaw CLI

set -e

BRIEFING_FILE="$1"
MODE="${2:-marketing}"

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file> [mode]"
    exit 1
fi

if [ ! -f "$BRIEFING_FILE" ]; then
    echo "❌ Arquivo não encontrado: $BRIEFING_FILE"
    exit 1
fi

JOB_ID=$(date +%s%3N)
PROJECT_ROOT="$HOME/projects/Brick_Marketing"
WIP_DIR="$PROJECT_ROOT/history/$MODE/wip"
ROLES_DIR="$PROJECT_ROOT/roles"

echo "🚀 Brick AI Pipeline"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

# Criar diretórios se não existem
mkdir -p "$WIP_DIR"

# ETAPA 0: Douglas pré-processa (placeholder por enquanto)
echo "⏳ ETAPA 0: Douglas (pré-processamento)"
PROCESSED_FILE="$WIP_DIR/${JOB_ID}_PROCESSED.md"
cp "$BRIEFING_FILE" "$PROCESSED_FILE"
echo "✅ Briefing processado"

# ETAPA 1: BRIEF VALIDATOR (Flash)
echo ""
echo "⏳ ETAPA 1: Brief Validator (Flash)"
openclaw sessions spawn --task "
Você é o BRIEF_VALIDATOR do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/BRIEF_VALIDATOR.md
2. Briefing: $PROCESSED_FILE

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_01_VALIDATOR.json
- Formato: { \"status\": \"OK|FAIL\", \"missing_fields\": [...], \"assumptions_if_silent\": {...} }

Se status = FAIL mas tem assumptions, considere OK e prossiga.
" --model flash --timeout 60 --cleanup delete

if [ ! -f "$WIP_DIR/${JOB_ID}_01_VALIDATOR.json" ]; then
    echo "❌ Validator falhou"
    exit 1
fi

echo "✅ Validator concluído"

# ETAPA 2: AUDIENCE ANALYST (Flash)  
echo ""
echo "⏳ ETAPA 2: Audience Analyst (Flash)"
openclaw sessions spawn --task "
Você é o AUDIENCE_ANALYST do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/AUDIENCE_ANALYST.md (usa persona hardcoded, NÃO pesquise na web)
2. Briefing: $PROCESSED_FILE
3. Validator: $WIP_DIR/${JOB_ID}_01_VALIDATOR.json

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_02_AUDIENCE.json
- Formato: { \"perfil\": {...}, \"dores\": [...], \"desejos\": [...], \"linguagem\": \"...\" }
" --model flash --timeout 90 --cleanup delete

echo "✅ Audience Analyst concluído"

# ETAPA 3: TOPIC RESEARCHER (Flash)
echo ""
echo "⏳ ETAPA 3: Topic Researcher (Flash)"
openclaw sessions spawn --task "
Você é o TOPIC_RESEARCHER do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/TOPIC_RESEARCHER.md
2. Briefing: $PROCESSED_FILE
3. Audience: $WIP_DIR/${JOB_ID}_02_AUDIENCE.json

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_03_RESEARCH.json
- Use web_search para pesquisar tendências/concorrentes
" --model flash --timeout 120 --cleanup delete

echo "✅ Topic Researcher concluído"

# ETAPA 4: CLAIMS CHECKER (Flash)
echo ""
echo "⏳ ETAPA 4: Claims Checker (Flash)"
openclaw sessions spawn --task "
Você é o CLAIMS_CHECKER do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Briefing: $PROCESSED_FILE
2. Research: $WIP_DIR/${JOB_ID}_03_RESEARCH.json

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_04_CLAIMS.json
- Valide estatísticas. Marque [NEEDS SOURCE] se inventado.
" --model flash --timeout 90 --cleanup delete

echo "✅ Claims Checker concluído"

# ETAPA 5A/B/C: COPYWRITERS (paralelo)
echo ""
echo "⏳ ETAPA 5: Copywriters (A/B/C paralelos)"

# 5A: GPT-5.2
openclaw sessions spawn --task "
Você é o COPYWRITER A (GPT-5.2) do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/COPYWRITER.md
2. Briefing: $PROCESSED_FILE  
3. Audience: $WIP_DIR/${JOB_ID}_02_AUDIENCE.json
4. Research: $WIP_DIR/${JOB_ID}_03_RESEARCH.json
5. Claims: $WIP_DIR/${JOB_ID}_04_CLAIMS.json

**Output:**
- Salve copy em: $WIP_DIR/${JOB_ID}_05A_COPY_GPT.md
- Temperatura 1.0 (criatividade máxima)
" --model gpt --timeout 180 --cleanup delete &

# 5B: Flash
openclaw sessions spawn --task "
Você é o COPYWRITER B (Flash) do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/COPYWRITER.md
2. Briefing: $PROCESSED_FILE
3. Audience: $WIP_DIR/${JOB_ID}_02_AUDIENCE.json
4. Research: $WIP_DIR/${JOB_ID}_03_RESEARCH.json
5. Claims: $WIP_DIR/${JOB_ID}_04_CLAIMS.json

**Output:**
- Salve copy em: $WIP_DIR/${JOB_ID}_05B_COPY_FLASH.md
- Temperatura 1.0 (criatividade máxima)
" --model flash --timeout 120 --cleanup delete &

# 5C: Sonnet
openclaw sessions spawn --task "
Você é o COPYWRITER C (Sonnet) do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/COPYWRITER.md
2. Briefing: $PROCESSED_FILE
3. Audience: $WIP_DIR/${JOB_ID}_02_AUDIENCE.json
4. Research: $WIP_DIR/${JOB_ID}_03_RESEARCH.json
5. Claims: $WIP_DIR/${JOB_ID}_04_CLAIMS.json

**Output:**
- Salve copy em: $WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md
- Temperatura 1.0 (criatividade máxima)
" --model sonnet --timeout 180 --cleanup delete &

# Aguardar os 3 copywriters
wait

echo "✅ Copywriters concluídos (A/B/C)"

# ETAPA 6: BRAND GUARDIANS (Flash)
echo ""
echo "⏳ ETAPA 6: Brand Guardians (Flash)"
openclaw sessions spawn --task "
Você é o BRAND_GUARDIANS do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/BRAND_GUARDIAN.md
2. Copies: 
   - $WIP_DIR/${JOB_ID}_05A_COPY_GPT.md
   - $WIP_DIR/${JOB_ID}_05B_COPY_FLASH.md
   - $WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_06_BRAND_GUARDIANS.json
- Valide as 3 versões. Split em Style (Tom) e Positioning (Lógica Comercial).
" --model flash --timeout 90 --cleanup delete

echo "✅ Brand Guardians concluído"

# ETAPA 7: CRITICS (Opus - juiz padrão)
echo ""
echo "⏳ ETAPA 7: Critics (Opus)"
openclaw sessions spawn --task "
Você é o CRITICS do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/CRITIC.md
2. Copies:
   - $WIP_DIR/${JOB_ID}_05A_COPY_GPT.md
   - $WIP_DIR/${JOB_ID}_05B_COPY_FLASH.md
   - $WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md
3. Brand Guardians: $WIP_DIR/${JOB_ID}_06_BRAND_GUARDIANS.json

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_07_CRITICS.json
- Formato: { \"vencedor\": \"A|B|C\", \"copy_vencedora\": \"...\", \"ajustes_sugeridos\": [...], \"modelo_vencedor\": \"gpt|flash|sonnet\" }
" --model opus --timeout 120 --cleanup delete

echo "✅ Critics concluído"

# ETAPA 7B: DIRECTOR (condicional - só se ajustes_sugeridos existir)
if grep -q '"ajustes_sugeridos"' "$WIP_DIR/${JOB_ID}_07_CRITICS.json" 2>/dev/null; then
    echo ""
    echo "⏳ ETAPA 7B: Director (refino com ajustes)"
    openclaw sessions spawn --task "
Você é o DIRECTOR do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Role: $ROLES_DIR/DIRECTOR.md
2. Critics: $WIP_DIR/${JOB_ID}_07_CRITICS.json

**Sua missão:**
- Aplicar os ajustes sugeridos pelos Critics
- Manter essência da copy vencedora
- Salvar resultado em: $WIP_DIR/${JOB_ID}_07B_DIRECTOR.md
" --model gpt --timeout 180 --cleanup delete

    echo "✅ Director concluído"
else
    echo "ℹ️  ETAPA 7B: Director (SKIP - sem ajustes sugeridos)"
fi

# ETAPA 8: WALL (Claude Opus)
echo ""
echo "⏳ ETAPA 8: Wall (Claude Opus - filtro final)"

# Determinar qual copy avaliar
if [ -f "$WIP_DIR/${JOB_ID}_07B_DIRECTOR.md" ]; then
    FINAL_COPY="$WIP_DIR/${JOB_ID}_07B_DIRECTOR.md"
else
    FINAL_COPY=$(jq -r '.copy_vencedora' "$WIP_DIR/${JOB_ID}_07_CRITICS.json")
fi

openclaw sessions spawn --task "
Você é o WALL (Filtro Final) do pipeline Brick AI.

**Job ID:** $JOB_ID

**Leia:**
1. Copy final: $FINAL_COPY
2. Briefing original: $PROCESSED_FILE

**Rubrica (score 0-100):**
- Clareza da Oferta (25 pts)
- Dor Real (20 pts)
- Credibilidade (20 pts)
- On-brand (20 pts)
- CTA Específico (15 pts)

**Output:**
- Salve resultado JSON em: $WIP_DIR/${JOB_ID}_08_WALL.json
- Formato: { \"score_final\": 85, \"aprovado\": true, \"feedback\": \"...\" }

**Critério:**
- Score >= 80: APROVADO
- Score < 80: REPROVADO (loop inteligente no executor)
" --model opus --timeout 120 --cleanup delete

echo "✅ Wall concluído"

# Verificar score do Wall
SCORE=$(jq -r '.score_final // 0' "$WIP_DIR/${JOB_ID}_08_WALL.json")

if [ "$SCORE" -ge 80 ]; then
    echo ""
    echo "✅ PIPELINE APROVADO (Score: $SCORE)"
    
    # Criar FINAL.md
    if [ -f "$WIP_DIR/${JOB_ID}_07B_DIRECTOR.md" ]; then
        cp "$WIP_DIR/${JOB_ID}_07B_DIRECTOR.md" "$WIP_DIR/${JOB_ID}_FINAL.md"
    else
        jq -r '.copy_vencedora' "$WIP_DIR/${JOB_ID}_07_CRITICS.json" > "$WIP_DIR/${JOB_ID}_FINAL.md"
    fi
    
    echo ""
    echo "📋 AGUARDANDO APROVAÇÃO HUMANA"
    echo "🔗 Acesse War Room: http://localhost:3000"
else
    echo ""
    echo "❌ PIPELINE REPROVADO (Score: $SCORE)"
    echo "⚠️  Necessário retrabalho manual ou loop via Douglas"
    echo ""
    echo "💡 Próximos passos:"
    echo "   1. Revisar feedback em: $WIP_DIR/${JOB_ID}_08_WALL.json"
    echo "   2. Ajustar briefing"
    echo "   3. Rodar novamente"
fi

echo ""
echo "---"
echo "📂 Arquivos gerados em: $WIP_DIR"
echo "🏁 Pipeline finalizado"
