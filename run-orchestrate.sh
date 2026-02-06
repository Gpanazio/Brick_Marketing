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
#   1. GET /api/pending → lista briefings pendentes (já com conteúdo)
#   2. Para cada briefing: salva conteúdo local em history/{mode}/briefing/
#   3. Roda run-{mode}.sh
#   4. Sincroniza cada arquivo gerado pro Railway via sync-to-railway.sh
#   5. Limpa briefing no Railway via POST /api/briefing/clear
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

# Baixa lista completa (inclui conteúdo)
PENDING_JSON=$(curl -s \
    -H "X-API-Key: ${API_KEY}" \
    "${RAILWAY_URL}/api/pending?mode=${MODE}" 2>/dev/null)

if [ -z "$PENDING_JSON" ]; then
    echo "❌ Falha ao buscar pendentes (resposta vazia)"
    exit 1
fi

# Conta briefings
BRIEFING_COUNT=$(echo "$PENDING_JSON" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('briefings', [])))" 2>/dev/null)

if [ "$BRIEFING_COUNT" = "0" ] || [ -z "$BRIEFING_COUNT" ]; then
    echo "✅ Nenhum briefing pendente."
    exit 0
fi

echo "📨 $BRIEFING_COUNT briefing(s) encontrado(s)"

# ---- 3. PROCESSAR CADA BRIEFING ----
# Loop via índice para extrair nome e conteúdo com segurança
for ((i=0; i<$BRIEFING_COUNT; i++)); do
    FILENAME=$(echo "$PENDING_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['briefings'][$i]['name'])")
    
    echo ""
    echo "============================================"
    echo "  PROCESSANDO: $FILENAME"
    echo "============================================"
    
    # Extrair conteúdo (usando Python pra lidar com multiline/encoding corretamente)
    LOCAL_DIR="$SCRIPT_DIR/history/$MODE/briefing"
    mkdir -p "$LOCAL_DIR"
    LOCAL_FILE="$LOCAL_DIR/$FILENAME"
    
    echo "$PENDING_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['briefings'][$i]['content'])" > "$LOCAL_FILE"
    
    if [ ! -s "$LOCAL_FILE" ]; then
        echo "❌ Conteúdo vazio para $FILENAME -- pulando"
        continue
    fi
    
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
