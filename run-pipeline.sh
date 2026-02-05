#!/bin/bash
# BRICK AI PIPELINE DISPATCHER
# Redireciona para o script Bash correto baseado no modo

BRIEFING_FILE="$1"
MODE="marketing" # Default

# Detectar modo via flag --pipeline (compatibilidade com watcher v3) ou argumento posicional
# Se o watcher passar "--pipeline pipelines/ideias_v1.yaml", sabemos que é Ideias.
# Mas vamos simplificar: o watcher pode passar apenas o modo se a gente quiser.

# Verificar argumentos
for arg in "$@"; do
    if [[ "$arg" == *"ideias"* ]]; then
        MODE="ideias"
    elif [[ "$arg" == *"projetos"* ]]; then
        MODE="projetos"
    fi
done

echo "🚀 Brick AI Dispatcher"
echo "📂 Arquivo: $BRIEFING_FILE"
echo "⚙️  Modo detectado: $MODE"
echo "---"

if [ "$MODE" == "ideias" ]; then
    exec ./run-ideias.sh "$BRIEFING_FILE"
elif [ "$MODE" == "projetos" ]; then
    exec ./run-projetos.sh "$BRIEFING_FILE"
else
    exec ./run-marketing.sh "$BRIEFING_FILE"
fi
