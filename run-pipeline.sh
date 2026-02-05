#!/bin/bash
# BRICK AI PIPELINE RUNNER (WRAPPER)
# Redireciona para o novo Maestro Python

# Caminhos
PROJECT_ROOT="$HOME/projects/Brick_Marketing"
MAESTRO="$PROJECT_ROOT/maestro.py"
PYTHON="$PROJECT_ROOT/.venv/bin/python3"
BRIEFING_FILE="$1"

# Checagem básica
if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

echo "🚀 Brick AI Pipeline (Legacy Wrapper)"
echo "🔄 Redirecionando para Maestro (Python Engine)..."
echo "---"

# Executar Maestro
exec "$PYTHON" "$MAESTRO" "$BRIEFING_FILE"
