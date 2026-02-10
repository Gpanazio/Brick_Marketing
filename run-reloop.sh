#!/bin/bash
# ============================================
# BRICK AI - RE-LOOP: Copy Senior ↔ Wall
# ============================================
#
# O QUE FAZ:
#   Reprocessa o loop Copy Senior ↔ Wall para um job que já passou
#   pelo pipeline completo mas foi reprovado pelo Wall (score < 80).
#   NÃO roda o pipeline inteiro -- só as etapas finais de revisão.
#
# QUANDO USAR:
#   - Wall reprovou a copy e você quer forçar novo loop
#   - Pipeline rodou mas loop automático não resolveu
#   - Quer testar revisão com modelo diferente
#
# USO:
#   ./run-reloop.sh <JOB_ID>
#
# EXEMPLOS:
#   ./run-reloop.sh 1770317032000_fran_2_lancamento_ia
#   ./run-reloop.sh 1770293201226_anti_ia
#
# PRÉ-REQUISITOS:
#   - Job deve ter _06_COPY_SENIOR.json (ou versão mais recente _v2, _v3)
#   - Job deve ter _07_WALL.json (ou versão mais recente)
#   - Ambos os arquivos em history/marketing/wip/
#
# FLUXO:
#   1. Lê copy_revisada do último COPY_SENIOR
#   2. Lê score e feedback do último WALL
#   3. Se score < 80: Copy Senior (modelo vencedor) revisa com feedback
#   4. Wall (Opus) reavalia
#   5. Repete até score >= 80 ou max 3 loops
#   6. Gera FINAL.md atualizado
#
# ARQUIVOS GERADOS:
#   - {JOB_ID}_06_COPY_SENIOR_v{N}.json  (revisão N do Copy Senior)
#   - {JOB_ID}_07_WALL_v{N}.json         (avaliação N do Wall)
#   - {JOB_ID}_FINAL.md                  (atualizado com versão aprovada)
#   - logs/{JOB_ID}_06_COPY_SENIOR_v{N}.log
#   - logs/{JOB_ID}_07_WALL_v{N}.log
#
# ============================================

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/pipeline-utils.sh"

JOB_ID="$1"

if [ -z "$JOB_ID" ]; then
    echo "❌ Uso: $0 <JOB_ID>"
    echo "   Ex:  $0 1770317032000_fran_2_lancamento_ia"
    echo ""
    echo "Jobs disponíveis no WIP:"
    ls "$SCRIPT_DIR/history/marketing/wip/" 2>/dev/null | grep "_06_COPY_SENIOR" | sed 's/_06_COPY_SENIOR.*$//' | sort -u
    exit 1
fi

WIP_DIR="$SCRIPT_DIR/history/marketing/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$SCRIPT_DIR/roles"

mkdir -p "$LOG_DIR"

# Carregar roles
CRITIC_ROLE=$(cat "$ROLES_DIR/COPY_SENIOR.md" 2>/dev/null || echo "N/A")
WALL_ROLE=$(cat "$ROLES_DIR/FILTRO_FINAL.md" 2>/dev/null || echo "N/A")
BRAND_GUARDIAN=$(cat "$ROLES_DIR/BRAND_GUARDIAN.md" 2>/dev/null || echo "N/A")

# Encontrar versão mais recente dos arquivos
# Procura _v3, _v2, depois o original
find_latest() {
    local base="$1"  # ex: _06_COPY_SENIOR
    local ext="$2"   # ex: .json
    
    for v in 3 2; do
        local f="$WIP_DIR/${JOB_ID}${base}_v${v}${ext}"
        if [ -f "$f" ] && validate_json "$f" 2>/dev/null; then
            echo "$f"
            return
        fi
    done
    
    local f="$WIP_DIR/${JOB_ID}${base}${ext}"
    if [ -f "$f" ]; then
        echo "$f"
        return
    fi
    
    echo ""
}

CRITIC_OUT=$(find_latest "_06_COPY_SENIOR" ".json")
WALL_OUT=$(find_latest "_07_WALL" ".json")

# Validações
if [ -z "$CRITIC_OUT" ] || [ ! -f "$CRITIC_OUT" ]; then
    echo "❌ COPY_SENIOR não encontrado para job: $JOB_ID"
    echo "   Procurei em: $WIP_DIR/${JOB_ID}_06_COPY_SENIOR*.json"
    exit 1
fi

if [ -z "$WALL_OUT" ] || [ ! -f "$WALL_OUT" ]; then
    echo "❌ WALL não encontrado para job: $JOB_ID"
    echo "   Procurei em: $WIP_DIR/${JOB_ID}_07_WALL*.json"
    exit 1
fi

# Extrair dados
COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$CRITIC_OUT" 2>/dev/null)
WALL_SCORE=$(jq -r '.score_final // 0' "$WALL_OUT" 2>/dev/null)
WINNING_MODEL=$(jq -r '.modelo_vencedor // "sonnet"' "$CRITIC_OUT" 2>/dev/null)

echo "============================================"
echo "  BRICK AI RE-LOOP: Copy Senior ↔ Wall"
echo "============================================"
echo ""
echo "📋 Job: $JOB_ID"
echo "📄 Copy Senior: $(basename $CRITIC_OUT)"
echo "📄 Wall: $(basename $WALL_OUT)"
echo "📊 Wall Score atual: $WALL_SCORE/100"
echo "🤖 Modelo vencedor: $WINNING_MODEL"
echo ""

if [ -z "$COPY_REVISADA" ]; then
    echo "❌ ERRO: copy_revisada não encontrada em $CRITIC_OUT"
    echo "   O Copy Senior precisa ter gerado o campo 'copy_revisada' no JSON."
    echo "   Sem isso, o loop não tem material pra revisar."
    exit 1
fi

if [ "$WALL_SCORE" -ge 80 ]; then
    echo "✅ Score já é $WALL_SCORE (>= 80). Nada a fazer."
    exit 0
fi

# Determinar qual loop estamos (baseado nos arquivos existentes)
EXISTING_LOOPS=$(ls "$WIP_DIR"/${JOB_ID}_07_WALL_v*.json 2>/dev/null | wc -l | tr -d ' ')
LOOP_COUNT=$((EXISTING_LOOPS + 1))
MAX_LOOPS=$((EXISTING_LOOPS + 3))  # Max 3 loops A PARTIR DE AGORA
max_retries=3

echo "🔄 Iniciando a partir do loop $((LOOP_COUNT + 1)) (max $MAX_LOOPS)"
echo ""

while [ "$WALL_SCORE" -lt 80 ] && [ $LOOP_COUNT -lt $MAX_LOOPS ]; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    echo "🔄 Loop $LOOP_COUNT - Wall rejeitou ($WALL_SCORE/100), Copy Senior revisando..."
    
    COPY_SENIOR_V="${WIP_DIR}/${JOB_ID}_06_COPY_SENIOR_v${LOOP_COUNT}.json"
    WALL_V="${WIP_DIR}/${JOB_ID}_07_WALL_v${LOOP_COUNT}.json"
    
    # ---- COPY SENIOR REVISA ----
    STEP_START=$(start_timer)
    attempt=1
    backoff=2
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Copy Senior v$LOOP_COUNT - Tentativa $attempt/$max_retries"
        
        openclaw agent --agent "$WINNING_MODEL" \
          --session-id "brick-reloop-${JOB_ID}-cs-${LOOP_COUNT}-$(date +%s)" \
          --message "${CRITIC_ROLE}

---

CONTEXTO DO LOOP:
- Esta é a revisão $LOOP_COUNT
- Wall rejeitou com score $WALL_SCORE/100 (precisa 80+)

---

COPY ATUAL (vencedora anterior):
${COPY_REVISADA}

---

FEEDBACK DO WALL:
$(cat "$WALL_OUT")

---

INSTRUÇÕES:
1. Leia o feedback detalhado do Wall (breakdown + pontos_de_melhoria)
2. Aplique os ajustes cirúrgicos necessários
3. Gere copy_revisada melhorada
4. Salve JSON no arquivo: ${COPY_SENIOR_V}" \
          --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_06_COPY_SENIOR_v${LOOP_COUNT}.log"
        
        if [ -f "$COPY_SENIOR_V" ] && validate_json "$COPY_SENIOR_V"; then
            DURATION=$(get_duration_ms $STEP_START)
            echo "✅ Copy Senior v$LOOP_COUNT concluído"
            print_duration $DURATION "Copy Senior Loop $LOOP_COUNT"
            break
        fi
        
        if [ $attempt -lt $max_retries ]; then
            echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
            sleep $backoff
            backoff=$((backoff * 2))
        fi
        
        attempt=$((attempt + 1))
    done
    
    if [ ! -f "$COPY_SENIOR_V" ] || ! validate_json "$COPY_SENIOR_V"; then
        echo "❌ Copy Senior v$LOOP_COUNT falhou após $max_retries tentativas - abortando"
        exit 1
    fi
    
    COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$COPY_SENIOR_V" 2>/dev/null)
    
    if [ -z "$COPY_REVISADA" ]; then
        echo "❌ Copy Senior v$LOOP_COUNT não gerou copy_revisada - abortando"
        exit 1
    fi
    
    # ---- WALL AVALIA ----
    echo ""
    echo "⏳ Wall v$LOOP_COUNT - Avaliando revisão..."
    STEP_START=$(start_timer)
    attempt=1
    backoff=2
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Tentativa $attempt/$max_retries"
        
        openclaw agent --agent opus \
          --session-id "brick-reloop-${JOB_ID}-wall-${LOOP_COUNT}" \
          --message "${WALL_ROLE}

---

# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA PARA AVALIAÇÃO ON-BRAND)

${BRAND_GUARDIAN}

---

COPY REVISADA (versão $LOOP_COUNT):
${COPY_REVISADA}

---

CONTEXTO:
Esta é a avaliação $LOOP_COUNT após feedback anterior. Seja justo: se os ajustes foram aplicados corretamente, aprove. Para o critério ON-BRAND, use o BRAND GUARDIAN acima como referência.

---

INSTRUÇÕES:
Avalie esta copy revisada conforme seu role e salve o resultado JSON no arquivo: ${WALL_V}" \
          --timeout 150 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_07_WALL_v${LOOP_COUNT}.log"
        
        if [ -f "$WALL_V" ] && validate_json "$WALL_V"; then
            DURATION=$(get_duration_ms $STEP_START)
            echo "✅ Wall v$LOOP_COUNT concluído"
            print_duration $DURATION "Wall Loop $LOOP_COUNT"
            break
        fi
        
        if [ $attempt -lt $max_retries ]; then
            echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
            sleep $backoff
            backoff=$((backoff * 2))
        fi
        
        attempt=$((attempt + 1))
    done
    
    if [ ! -f "$WALL_V" ] || ! validate_json "$WALL_V"; then
        echo "⚠️ Opus falhou após $max_retries tentativas. Tentando fallback GPT-5.3..."

        safe_timeout 300s openclaw agent --agent gpt53 \
          --session-id "brick-reloop-${JOB_ID}-wall-${LOOP_COUNT}-fb" \
          --message "${WALL_ROLE}

---

# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA PARA AVALIAÇÃO ON-BRAND)

${BRAND_GUARDIAN}

---

COPY REVISADA (versão $LOOP_COUNT):
${COPY_REVISADA}

---

CONTEXTO:
Esta é a avaliação $LOOP_COUNT após feedback anterior. Seja justo: se os ajustes foram aplicados corretamente, aprove. Para o critério ON-BRAND, use o BRAND GUARDIAN acima como referência.

---

INSTRUÇÕES:
Avalie esta copy revisada conforme seu role e salve o resultado JSON no arquivo: ${WALL_V}" \
          --timeout 150 --json 2>&1 | tee -a "$LOG_DIR/${JOB_ID}_07_WALL_v${LOOP_COUNT}.log"

        if [ -f "$WALL_V" ] && validate_json "$WALL_V"; then
            DURATION=$(get_duration_ms $STEP_START)
            echo "✅ Wall v$LOOP_COUNT concluído via fallback GPT-5.3"
            print_duration $DURATION "Wall Loop $LOOP_COUNT (fallback)"
        else
            echo "❌ Wall v$LOOP_COUNT falhou após $max_retries tentativas + fallback GPT-5.3 - abortando"
            exit 1
        fi
    fi
    
    WALL_SCORE=$(jq -r '.score_final // 0' "$WALL_V" 2>/dev/null)
    WALL_OUT="$WALL_V"
    CRITIC_OUT="$COPY_SENIOR_V"
    
    echo ""
    echo "📊 Wall Score v$LOOP_COUNT: $WALL_SCORE/100"
    
    if [ "$WALL_SCORE" -ge 80 ]; then
        echo "✅ Copy aprovada no loop $LOOP_COUNT!"
        break
    fi
done

# ---- RESULTADO ----
echo ""
echo "============================================"

if [ "$WALL_SCORE" -ge 80 ]; then
    echo "  APROVADA - Score: $WALL_SCORE/100"
else
    echo "  NÃO APROVADA - Score: $WALL_SCORE/100 (após $LOOP_COUNT loops)"
fi

echo "============================================"

# Gerar FINAL.md atualizado
FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"
{
    echo "# COPY FINAL (APROVADA - Loop v$LOOP_COUNT, Score $WALL_SCORE/100)"
    echo ""
    echo "$COPY_REVISADA"
    echo ""
    echo "---"
    echo ""
    echo "## ALTERAÇÕES APLICADAS"
    jq -r '.alteracoes_aplicadas[]? // empty' "$CRITIC_OUT" 2>/dev/null | while read -r alt; do
        echo "- $alt"
    done
    echo ""
    echo "---"
    echo ""
    echo "## WALL (JSON)"
    cat "$WALL_OUT" 2>/dev/null || true
} > "$FINAL_OUT"

echo ""
echo "📁 FINAL.md atualizado: $FINAL_OUT"
echo "📄 Copy Senior: $(basename $CRITIC_OUT)"
echo "📄 Wall: $(basename $WALL_OUT)"
