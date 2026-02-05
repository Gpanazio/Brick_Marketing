#!/bin/bash
# Script temporário pra rodar o loop Copy Senior ↔ Wall manualmente
# Uso: ./run-loop-manual.sh <JOB_ID>

set -o pipefail
source lib/pipeline-utils.sh

JOB_ID="${1:-1770317032000_fran_2_lancamento_ia}"
WIP_DIR="history/marketing/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="roles"

# Carregar roles
CRITIC_ROLE=$(cat "$ROLES_DIR/COPY_SENIOR.md" 2>/dev/null || echo "N/A")
WALL_ROLE=$(cat "$ROLES_DIR/FILTRO_FINAL.md" 2>/dev/null || echo "N/A")

# Arquivos do job
CRITIC_OUT="$WIP_DIR/${JOB_ID}_06_COPY_SENIOR.json"
WALL_OUT="$WIP_DIR/${JOB_ID}_07_WALL.json"

# Validar se arquivos existem
if [ ! -f "$CRITIC_OUT" ]; then
    echo "❌ Arquivo não encontrado: $CRITIC_OUT"
    exit 1
fi

if [ ! -f "$WALL_OUT" ]; then
    echo "❌ Arquivo não encontrado: $WALL_OUT"
    exit 1
fi

# Extrair copy vencedora e score do Wall
COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$CRITIC_OUT" 2>/dev/null)
WALL_SCORE=$(jq -r '.score_final // 0' "$WALL_OUT" 2>/dev/null)
WINNING_MODEL=$(jq -r '.modelo_vencedor // "sonnet"' "$CRITIC_OUT" 2>/dev/null)

echo "📋 Job: $JOB_ID"
echo "📊 Wall Score atual: $WALL_SCORE/100"
echo "🤖 Modelo vencedor: $WINNING_MODEL"
echo ""

if [ -z "$COPY_REVISADA" ]; then
    echo "❌ Copy revisada não encontrada no COPY_SENIOR.json"
    exit 1
fi

# Loop
LOOP_COUNT=1
MAX_LOOPS=3
max_retries=3

while [ "$WALL_SCORE" -lt 80 ] && [ $LOOP_COUNT -lt $MAX_LOOPS ]; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    echo "🔄 Loop $LOOP_COUNT/$MAX_LOOPS - Wall rejeitou, Copy Senior revisando..."
    
    COPY_SENIOR_V="${WIP_DIR}/${JOB_ID}_06_COPY_SENIOR_v${LOOP_COUNT}.json"
    WALL_V="${WIP_DIR}/${JOB_ID}_07_WALL_v${LOOP_COUNT}.json"
    
    # Copy Senior revisa
    STEP_START=$(start_timer)
    attempt=1
    backoff=2
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Copy Senior v$LOOP_COUNT - Tentativa $attempt/$max_retries"
        
        openclaw agent --agent "$WINNING_MODEL" \
          --session-id "brick-mkt-${JOB_ID}-copy-senior-loop-${LOOP_COUNT}-$(date +%s)" \
          --message "${CRITIC_ROLE}

---

CONTEXTO DO LOOP:
- Esta é a revisão $LOOP_COUNT de $MAX_LOOPS
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
        echo "❌ Copy Senior v$LOOP_COUNT falhou após $max_retries tentativas - abortando loop"
        exit 1
    fi
    
    # Atualizar COPY_REVISADA
    COPY_REVISADA=$(jq -r '.copy_revisada // empty' "$COPY_SENIOR_V" 2>/dev/null)
    
    if [ -z "$COPY_REVISADA" ]; then
        echo "⚠️ Copy Senior v$LOOP_COUNT não gerou copy_revisada - abortando loop"
        exit 1
    fi
    
    # Wall avalia
    echo ""
    echo "⏳ Wall v$LOOP_COUNT - Avaliando revisão..."
    STEP_START=$(start_timer)
    attempt=1
    backoff=2
    
    while [ $attempt -le $max_retries ]; do
        echo "  >> Tentativa $attempt/$max_retries"
        
        openclaw agent --agent opus \
          --session-id "brick-mkt-${JOB_ID}-wall-loop-${LOOP_COUNT}" \
          --message "${WALL_ROLE}

---

COPY REVISADA (versão $LOOP_COUNT):
${COPY_REVISADA}

---

CONTEXTO:
Esta é a avaliação $LOOP_COUNT após feedback anterior. Seja justo: se os ajustes foram aplicados corretamente, aprove.

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
        echo "❌ Wall v$LOOP_COUNT falhou após $max_retries tentativas - abortando loop"
        exit 1
    fi
    
    # Atualizar score
    WALL_SCORE=$(jq -r '.score_final // 0' "$WALL_V" 2>/dev/null)
    WALL_OUT="$WALL_V"
    CRITIC_OUT="$COPY_SENIOR_V"
    
    echo "📊 Wall Score v$LOOP_COUNT: $WALL_SCORE/100"
    
    if [ "$WALL_SCORE" -ge 80 ]; then
        echo "✅ Copy aprovada no loop $LOOP_COUNT!"
        break
    fi
done

if [ "$WALL_SCORE" -lt 80 ]; then
    echo ""
    echo "⚠️ Copy não atingiu 80 pontos após $LOOP_COUNT loops (score final: $WALL_SCORE)"
    echo "📋 Melhor versão: $CRITIC_OUT"
else
    echo ""
    echo "🎉 Copy aprovada com $WALL_SCORE pontos!"
    echo "📋 Arquivo final: $CRITIC_OUT"
fi

# Gerar FINAL.md atualizado
FINAL_OUT="$WIP_DIR/${JOB_ID}_FINAL.md"
{
  echo "# COPY FINAL (revisada via loop automático - versão $LOOP_COUNT)"
  echo ""
  echo "$COPY_REVISADA"
  echo ""
  echo "---"
  echo ""
  echo "## WALL (JSON)"
  cat "$WALL_OUT" 2>/dev/null || true
} > "$FINAL_OUT"

echo "📁 FINAL.md atualizado: $FINAL_OUT"
