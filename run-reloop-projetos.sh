#!/bin/bash
# ============================================
# BRICK AI - RE-LOOP: Projetos (HUMAN → PROPOSAL)
# ============================================
#
# O QUE FAZ:
#   Reprocessa feedback humano em projetos que já passaram pelo pipeline
#   completo mas precisam de ajustes. Pode revisar:
#   - PROPOSAL (proposta comercial) - mais comum
#   - EXECUTION (plano de execução)
#   - CONCEPT (conceito criativo)
#
# QUANDO USAR:
#   - Cliente/humano deu feedback sobre a proposta
#   - Quer ajustar orçamento, escopo ou approach
#   - Precisa revisar plano de execução
#
# USO:
#   ./run-reloop-projetos.sh <JOB_ID> [TARGET]
#
# EXEMPLOS:
#   ./run-reloop-projetos.sh 1770403445630_campanha_duloren PROPOSAL
#   ./run-reloop-projetos.sh 1770403445630_campanha_duloren EXECUTION
#   ./run-reloop-projetos.sh 1770403445630_campanha_duloren  # default: PROPOSAL
#
# PRÉ-REQUISITOS:
#   - Job deve ter completado o pipeline (ter _05_PROPOSAL.json)
#   - Feedback humano salvo em {JOB_ID}_FEEDBACK_HUMAN.txt
#
# FLUXO (TARGET=PROPOSAL):
#   1. Lê proposta atual (_05_PROPOSAL.json)
#   2. Lê feedback humano (_FEEDBACK_HUMAN.txt)
#   3. PROPOSAL (GPT) revisa com feedback
#   4. DIRECTOR (Pro) avalia a revisão
#   5. Gera nova versão da proposta
#
# ARQUIVOS GERADOS:
#   - {JOB_ID}_05_PROPOSAL_v{N}.json
#   - {JOB_ID}_06_DIRECTOR_v{N}.json
#   - logs/{JOB_ID}_05_PROPOSAL_v{N}.log
#   - logs/{JOB_ID}_06_DIRECTOR_v{N}.log
#
# ============================================

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/pipeline-utils.sh"

JOB_ID="$1"
TARGET="${2:-PROPOSAL}"  # Default: PROPOSAL

if [ -z "$JOB_ID" ]; then
    echo "❌ Uso: $0 <JOB_ID> [TARGET]"
    echo "   TARGET: PROPOSAL (default), EXECUTION, CONCEPT"
    echo ""
    echo "   Ex:  $0 1770403445630_campanha_duloren PROPOSAL"
    echo ""
    echo "Jobs disponíveis no WIP:"
    ls "$SCRIPT_DIR/history/projetos/wip/" 2>/dev/null | grep "_05_PROPOSAL" | sed 's/_05_PROPOSAL.*$//' | sort -u
    exit 1
fi

# Validar TARGET
case "$TARGET" in
    PROPOSAL|EXECUTION|CONCEPT)
        ;;
    *)
        echo "❌ TARGET inválido: $TARGET"
        echo "   Valores permitidos: PROPOSAL, EXECUTION, CONCEPT"
        exit 1
        ;;
esac

WIP_DIR="$SCRIPT_DIR/history/projetos/wip"
LOG_DIR="$WIP_DIR/logs"
ROLES_DIR="$SCRIPT_DIR/roles"

mkdir -p "$LOG_DIR"

# Carregar roles
PROPOSAL_ROLE=$(cat "$ROLES_DIR/PROPOSAL_WRITER.md" 2>/dev/null || echo "N/A")
DIRECTOR_ROLE=$(cat "$ROLES_DIR/PROJECT_DIRECTOR.md" 2>/dev/null || echo "N/A")
EXECUTION_ROLE=$(cat "$ROLES_DIR/EXECUTION_DESIGN.md" 2>/dev/null || echo "N/A")

# Encontrar versão mais recente dos arquivos
find_latest() {
    local base="$1"  # ex: _05_PROPOSAL
    local ext="$2"   # ex: .json ou .md
    
    for v in 3 2; do
        local f="$WIP_DIR/${JOB_ID}${base}_v${v}${ext}"
        if [ -f "$f" ]; then
            # Se for JSON, validar. Se for MD, só checar existência.
            if [[ "$ext" == ".json" ]]; then
                if validate_json "$f" 2>/dev/null; then echo "$f"; return; fi
            else
                echo "$f"
                return
            fi
        fi
    done
    
    local f="$WIP_DIR/${JOB_ID}${base}${ext}"
    if [ -f "$f" ]; then
        echo "$f"
        return
    fi
    
    echo ""
}

# Mapear TARGET pra etapa do pipeline
case "$TARGET" in
    PROPOSAL)
        STEP_NUM="05"
        STEP_NAME="PROPOSAL"
        AGENT="gpt"
        ROLE="$PROPOSAL_ROLE"
        EXT=".md"
        ;;
    EXECUTION)
        STEP_NUM="04"
        STEP_NAME="EXECUTION"
        AGENT="pro"
        ROLE="$EXECUTION_ROLE"
        EXT=".json"
        ;;
    CONCEPT)
        echo "❌ CONCEPT reloop não implementado ainda"
        exit 1
        ;;
esac

CURRENT_OUT=$(find_latest "_${STEP_NUM}_${STEP_NAME}" "$EXT")
FEEDBACK_FILE="$WIP_DIR/${JOB_ID}_FEEDBACK_HUMAN.txt"

# Validações
if [ -z "$CURRENT_OUT" ] || [ ! -f "$CURRENT_OUT" ]; then
    echo "❌ ${STEP_NAME} não encontrado para job: $JOB_ID"
    echo "   Procurei em: $WIP_DIR/${JOB_ID}_${STEP_NUM}_${STEP_NAME}*${EXT}"
    exit 1
fi

if [ ! -f "$FEEDBACK_FILE" ]; then
    echo "❌ Feedback humano não encontrado: $FEEDBACK_FILE"
    echo ""
    echo "Crie o arquivo com o feedback antes de rodar o reloop:"
    echo "  echo 'Seu feedback aqui' > $FEEDBACK_FILE"
    exit 1
fi

FEEDBACK_TEXT=$(cat "$FEEDBACK_FILE")

echo "============================================"
echo "  BRICK AI RE-LOOP: Projetos (${TARGET})"
echo "============================================"
echo ""
echo "📋 Job: $JOB_ID"
echo "📄 ${STEP_NAME}: $(basename $CURRENT_OUT)"
echo "📝 Feedback: $(basename $FEEDBACK_FILE)"
echo "🤖 Agente: $AGENT"
echo ""
echo "💬 FEEDBACK:"
echo "$FEEDBACK_TEXT"
echo ""

# Determinar versão do loop
# Procura tanto json quanto md para contar versões
EXISTING_LOOPS=$(ls "$WIP_DIR"/${JOB_ID}_${STEP_NUM}_${STEP_NAME}_v* 2>/dev/null | wc -l | tr -d ' ')
LOOP_VERSION=$((EXISTING_LOOPS + 1))

REVISED_OUT="${WIP_DIR}/${JOB_ID}_${STEP_NUM}_${STEP_NAME}_v${LOOP_VERSION}${EXT}"
DIRECTOR_OUT="${WIP_DIR}/${JOB_ID}_06_DIRECTOR_v${LOOP_VERSION}.json"

echo "🔄 Gerando revisão v$LOOP_VERSION..."
echo ""

# ---- REVISAR TARGET ----
STEP_START=$(start_timer)
max_retries=3
attempt=1
backoff=2

# Ajustar instrução baseada no formato (JSON vs Markdown)
SAVE_INSTRUCTION="Salve JSON em: ${REVISED_OUT}"
if [[ "$EXT" == ".md" ]]; then
    SAVE_INSTRUCTION="Salve Markdown em: ${REVISED_OUT}"
fi

while [ $attempt -le $max_retries ]; do
    echo "  >> ${STEP_NAME} v$LOOP_VERSION - Tentativa $attempt/$max_retries"
    
    openclaw agent --agent "$AGENT" \
      --session-id "brick-projetos-reloop-${JOB_ID}-${STEP_NAME}-${LOOP_VERSION}-$(date +%s)" \
      --message "${ROLE}

---

CONTEXTO DO LOOP:
- Esta é a revisão $LOOP_VERSION baseada em feedback humano
- TARGET: ${TARGET}

---

VERSÃO ATUAL (${TARGET}):
$(cat "$CURRENT_OUT")

---

FEEDBACK HUMANO:
${FEEDBACK_TEXT}

---

INSTRUÇÕES:
1. Leia o feedback humano cuidadosamente
2. Identifique os pontos que precisam ser ajustados
3. Revise o ${TARGET} aplicando os ajustes solicitados
4. Mantenha a qualidade e coerência com o briefing original
5. ${SAVE_INSTRUCTION}" \
      --timeout 180 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_${STEP_NUM}_${STEP_NAME}_v${LOOP_VERSION}.log"
    
    # Validação depende do formato
    VALID=false
    if [[ "$EXT" == ".json" ]]; then
        if [ -f "$REVISED_OUT" ] && validate_json "$REVISED_OUT"; then VALID=true; fi
    else
        if [ -f "$REVISED_OUT" ] && [ -s "$REVISED_OUT" ]; then VALID=true; fi
    fi

    if [ "$VALID" = true ]; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ ${STEP_NAME} v$LOOP_VERSION concluído"
        print_duration $DURATION "${STEP_NAME} Loop v$LOOP_VERSION"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

# Checagem final também depende do formato
VALID=false
if [[ "$EXT" == ".json" ]]; then
    if [ -f "$REVISED_OUT" ] && validate_json "$REVISED_OUT"; then VALID=true; fi
else
    if [ -f "$REVISED_OUT" ] && [ -s "$REVISED_OUT" ]; then VALID=true; fi
fi

if [ "$VALID" = false ]; then
    echo "❌ ${STEP_NAME} v$LOOP_VERSION falhou após $max_retries tentativas - abortando"
    exit 1
fi

# ---- DIRECTOR AVALIA ----
echo ""
echo "⏳ Director v$LOOP_VERSION - Avaliando revisão..."
STEP_START=$(start_timer)
attempt=1
backoff=2

while [ $attempt -le $max_retries ]; do
    echo "  >> Tentativa $attempt/$max_retries"
    
    openclaw agent --agent pro \
      --session-id "brick-projetos-reloop-${JOB_ID}-director-${LOOP_VERSION}" \
      --message "${DIRECTOR_ROLE}

---

CONTEXTO:
Esta é a avaliação da revisão v$LOOP_VERSION do ${TARGET} após feedback humano.

---

${TARGET} REVISADO (v$LOOP_VERSION):
$(cat "$REVISED_OUT")

---

FEEDBACK HUMANO ORIGINAL:
${FEEDBACK_TEXT}

---

INSTRUÇÕES:
Avalie se a revisão atendeu adequadamente ao feedback humano e mantenha os padrões de qualidade. Salve o resultado JSON no arquivo: ${DIRECTOR_OUT}" \
      --timeout 180 --json 2>&1 | tee "$LOG_DIR/${JOB_ID}_06_DIRECTOR_v${LOOP_VERSION}.log"
    
    if [ -f "$DIRECTOR_OUT" ] && validate_json "$DIRECTOR_OUT"; then
        DURATION=$(get_duration_ms $STEP_START)
        echo "✅ Director v$LOOP_VERSION concluído"
        print_duration $DURATION "Director Loop v$LOOP_VERSION"
        break
    fi
    
    if [ $attempt -lt $max_retries ]; then
        echo "⚠️ Tentativa $attempt falhou, aguardando ${backoff}s..."
        sleep $backoff
        backoff=$((backoff * 2))
    fi
    
    attempt=$((attempt + 1))
done

if [ ! -f "$DIRECTOR_OUT" ] || ! validate_json "$DIRECTOR_OUT"; then
    echo "❌ Director v$LOOP_VERSION falhou após $max_retries tentativas - abortando"
    exit 1
fi

DIRECTOR_SCORE=$(jq -r '.score_final // 0' "$DIRECTOR_OUT" 2>/dev/null)

# ---- RESULTADO ----
echo ""
echo "============================================"
echo "  REVISÃO CONCLUÍDA"
echo "============================================"
echo ""
echo "📊 Director Score: $DIRECTOR_SCORE/100"
echo "📁 ${STEP_NAME} revisado: $(basename $REVISED_OUT)"
echo "📁 Director avaliação: $(basename $DIRECTOR_OUT)"
echo ""

if [ "$DIRECTOR_SCORE" -ge 85 ]; then
    echo "✅ Aprovado pelo Director!"
else
    echo "⚠️ Score abaixo de 85 - pode precisar de mais ajustes"
fi

echo ""
echo "💡 Próximos passos:"
echo "   - Revisar arquivos gerados no War Room"
echo "   - Se precisar ajustar mais, edite o feedback e rode novamente"
echo "   - Se aprovado, mover para history/projetos/done/"
