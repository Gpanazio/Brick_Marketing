#!/bin/bash
# ============================================
# BRICK AI - ORQUESTRADOR
# ============================================
#
# O QUE FAZ:
#   Fluxo completo: puxa briefing do Railway → roda pipeline → sincroniza resultados
#   Chamado pelo Douglas quando recebe aviso de novo briefing no Telegram.
#
# USO:
#   ./run-orchestrate.sh [mode]
#
# EXEMPLOS:
#   ./run-orchestrate.sh                  # Default: marketing
#   ./run-orchestrate.sh marketing
#   ./run-orchestrate.sh projetos
#   ./run-orchestrate.sh ideias
#
# FLUXO:
#   1. GET /api/pending → lista briefings pendentes
#   2. Para cada briefing: baixa conteúdo via GET /api/file
#   3. Salva local em history/{mode}/briefing/
#   4. Roda run-{mode}.sh
#   5. Sincroniza cada arquivo gerado pro Railway via sync-to-railway.sh
#   6. Limpa briefing no Railway via POST /api/briefing/clear
#
# PRÉ-REQUISITOS:
#   - Railway online
#   - Scripts run-marketing.sh, run-projetos.sh, run-ideias.sh no mesmo diretório
#   - sync-to-railway.sh no mesmo diretório
#
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAILWAY_URL="${RAILWAY_URL:-https://brickmarketing-production.up.railway.app}"
API_KEY="${API_KEY:-brick-squad-2026}"
MODE="${1:-marketing}"

echo "============================================"
echo "  BRICK AI ORQUESTRADOR"
echo "============================================"
echo ""
echo "📡 Railway: $RAILWAY_URL"
echo "📂 Mode: $MODE"
echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ---- 1. HEALTH CHECK ----
echo "🔍 Checando Railway..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${RAILWAY_URL}/api/health" 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Railway fora do ar (HTTP $HTTP_CODE)"
    echo "   URL: ${RAILWAY_URL}/api/health"
    exit 1
fi
echo "✅ Railway online"

# ---- 2. BUSCAR BRIEFINGS PENDENTES ----
echo ""
echo "📋 Buscando briefings pendentes ($MODE)..."

PENDING=$(curl -s \
    -H "X-API-Key: ${API_KEY}" \
    "${RAILWAY_URL}/api/pending?mode=${MODE}" 2>/dev/null)

if [ -z "$PENDING" ]; then
    echo "❌ Falha ao buscar pendentes"
    exit 1
fi

BRIEFING_COUNT=$(echo "$PENDING" | jq '.briefings | length' 2>/dev/null)

if [ "$BRIEFING_COUNT" = "0" ] || [ -z "$BRIEFING_COUNT" ]; then
    echo "✅ Nenhum briefing pendente."
    exit 0
fi

echo "📨 $BRIEFING_COUNT briefing(s) encontrado(s)"

# ---- 3. PROCESSAR CADA BRIEFING ----
echo "$PENDING" | jq -r '.briefings[].name' | while read -r FILENAME; do
    echo ""
    echo "============================================"
    echo "  PROCESSANDO: $FILENAME"
    echo "============================================"
    
    # Baixar conteúdo
    LOCAL_DIR="$SCRIPT_DIR/history/$MODE/briefing"
    mkdir -p "$LOCAL_DIR"
    LOCAL_FILE="$LOCAL_DIR/$FILENAME"
    
    echo "📥 Baixando briefing..."
    CONTENT=$(curl -s \
        -H "X-API-Key: ${API_KEY}" \
        "${RAILWAY_URL}/api/file?mode=${MODE}&dir=briefing&name=${FILENAME}" 2>/dev/null)
    
    if [ -z "$CONTENT" ]; then
        echo "❌ Falha ao baixar $FILENAME -- pulando"
        continue
    fi
    
    # Extrair conteúdo (API retorna JSON com campo content)
    FILE_CONTENT=$(echo "$CONTENT" | jq -r '.content // empty' 2>/dev/null)
    
    if [ -z "$FILE_CONTENT" ]; then
        # Talvez retorne texto puro
        FILE_CONTENT="$CONTENT"
    fi
    
    echo "$FILE_CONTENT" > "$LOCAL_FILE"
    echo "✅ Salvo em: $LOCAL_FILE"
    
    # Determinar script do pipeline
    PIPELINE_SCRIPT="$SCRIPT_DIR/run-${MODE}.sh"
    
    if [ ! -x "$PIPELINE_SCRIPT" ]; then
        echo "❌ Script não encontrado: $PIPELINE_SCRIPT"
        continue
    fi
    
    # Rodar pipeline
    echo ""
    echo "🚀 Iniciando pipeline $MODE..."
    echo "---"
    
    "$PIPELINE_SCRIPT" "$LOCAL_FILE"
    PIPELINE_EXIT=$?
    
    echo "---"
    
    if [ $PIPELINE_EXIT -ne 0 ]; then
        echo "⚠️ Pipeline terminou com código $PIPELINE_EXIT"
    else
        echo "✅ Pipeline concluído com sucesso"
    fi
    
    # Sincronizar resultados pro Railway
    echo ""
    echo "📤 Sincronizando resultados pro Railway..."
    "$SCRIPT_DIR/sync-to-railway.sh" --all "$MODE"
    
    # Limpar briefing no Railway
    echo ""
    echo "🧹 Limpando briefing processado no Railway..."
    CLEAR_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST "${RAILWAY_URL}/api/briefing/clear" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "{\"filename\": \"${FILENAME}\", \"mode\": \"${MODE}\"}")
    
    CLEAR_CODE=$(echo "$CLEAR_RESPONSE" | tail -1)
    
    if [ "$CLEAR_CODE" = "200" ]; then
        echo "✅ Briefing limpo no Railway"
    else
        echo "⚠️ Falha ao limpar briefing ($CLEAR_CODE) -- não é crítico"
    fi
    
    echo ""
    echo "============================================"
    echo "  CONCLUÍDO: $FILENAME"
    echo "============================================"
done

echo ""
echo "🏁 Orquestração finalizada. $(date '+%H:%M:%S')"
