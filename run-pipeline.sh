#!/bin/bash
# BRICK AI PIPELINE DISPATCHER v2.0
# Redireciona para o script Bash correto baseado no modo
#
# Uso: ./run-pipeline.sh <briefing-file> [--mode=marketing|projetos|ideias]

# Detectar diretório do script dinamicamente
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BRIEFING_FILE="$1"
MODE="marketing" # Default

# Verificar se briefing foi passado
if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file> [--mode=marketing|projetos|ideias]"
    exit 1
fi

# Detectar modo via argumentos
for arg in "$@"; do
    # Novo formato: --mode=ideias
    if [[ "$arg" == --mode=* ]]; then
        MODE="${arg#--mode=}"
    # Compatibilidade: detecta pela string
    elif [[ "$arg" == *"originais"* ]]; then
        MODE="originais"
    elif [[ "$arg" == *"ideias"* ]]; then
        MODE="ideias"
    elif [[ "$arg" == *"projetos"* ]]; then
        MODE="projetos"
    elif [[ "$arg" == *"marketing"* ]]; then
        MODE="marketing"
    fi
done

# Validar modo
if [[ "$MODE" != "marketing" && "$MODE" != "projetos" && "$MODE" != "ideias" && "$MODE" != "originais" ]]; then
    echo "⚠️ Modo inválido: $MODE. Usando 'marketing' como fallback."
    MODE="marketing"
fi

echo "🚀 Brick AI Dispatcher v2.0"
echo "📂 Arquivo: $BRIEFING_FILE"
echo "⚙️  Modo: $MODE"
echo "📁 Script Dir: $SCRIPT_DIR"
echo "---"

# Executar pipeline correspondente
case "$MODE" in
    originais)
        exec "$SCRIPT_DIR/run-originais.sh" "$BRIEFING_FILE"
        ;;
    ideias)
        exec "$SCRIPT_DIR/run-ideias.sh" "$BRIEFING_FILE"
        ;;
    projetos)
        exec "$SCRIPT_DIR/run-projetos.sh" "$BRIEFING_FILE"
        ;;
    marketing|*)
        exec "$SCRIPT_DIR/run-marketing.sh" "$BRIEFING_FILE"
        ;;
esac
