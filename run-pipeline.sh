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
    # Marketing (Código legado inline para evitar criar mais um arquivo)
    
    set -e
    if [ -z "$BRIEFING_FILE" ]; then echo "❌ Uso: $0 <briefing>"; exit 1; fi
    
    # Extrair JOB_ID do nome do briefing
    BASENAME=$(basename "$BRIEFING_FILE" .md)
    BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
    JOB_ID="$BASENAME"
    if [ -z "$JOB_ID" ]; then JOB_ID=$(date +%s%3N); fi
    
    PROJECT_ROOT="$HOME/projects/Brick_Marketing"
    WIP_DIR="$PROJECT_ROOT/history/marketing/wip"
    ROLES_DIR="$PROJECT_ROOT/roles"
    
    mkdir -p "$WIP_DIR"
    
    # ETAPA 0
    echo "⏳ [Marketing] ETAPA 0: Douglas"
    cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_PROCESSED.md"
    
    # ETAPA 1
    echo "⏳ [Marketing] ETAPA 1: Validator"
    openclaw sessions spawn --task "Você é o VALIDATOR. Leia $WIP_DIR/${JOB_ID}_PROCESSED.md. Output JSON: $WIP_DIR/${JOB_ID}_01_VALIDATOR.json" --model flash --timeout 60 --cleanup delete
    
    # ETAPA 2
    echo "⏳ [Marketing] ETAPA 2: Audience"
    openclaw sessions spawn --task "Você é o AUDIENCE. Leia $WIP_DIR/${JOB_ID}_PROCESSED.md. Output JSON: $WIP_DIR/${JOB_ID}_02_AUDIENCE.json" --model flash --timeout 90 --cleanup delete
    
    # ETAPA 3
    echo "⏳ [Marketing] ETAPA 3: Researcher"
    openclaw sessions spawn --task "Você é o RESEARCHER. Leia $WIP_DIR/${JOB_ID}_02_AUDIENCE.json. Output JSON: $WIP_DIR/${JOB_ID}_03_RESEARCH.json" --model flash --timeout 90 --cleanup delete
    
    # ETAPA 4
    echo "⏳ [Marketing] ETAPA 4: Claims"
    openclaw sessions spawn --task "Você é o CLAIMS. Leia $WIP_DIR/${JOB_ID}_03_RESEARCH.json. Output JSON: $WIP_DIR/${JOB_ID}_04_CLAIMS.json" --model flash --timeout 60 --cleanup delete
    
    # ETAPA 5 (A/B/C)
    echo "⏳ [Marketing] ETAPA 5: Copywriters (Paralelo)"
    openclaw sessions spawn --task "COPYWRITER A (GPT). Output: $WIP_DIR/${JOB_ID}_05A_COPY_GPT.md" --model gpt --timeout 120 --cleanup delete &
    openclaw sessions spawn --task "COPYWRITER B (Flash). Output: $WIP_DIR/${JOB_ID}_05B_COPY_FLASH.md" --model flash --timeout 120 --cleanup delete &
    openclaw sessions spawn --task "COPYWRITER C (Sonnet). Output: $WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md" --model sonnet --timeout 120 --cleanup delete &
    wait
    
    # ETAPA 6
    echo "⏳ [Marketing] ETAPA 6: Brand Guardians"
    openclaw sessions spawn --task "BRAND GUARDIANS. Valide as copies A/B/C. Output JSON: $WIP_DIR/${JOB_ID}_06_BRAND_GUARDIANS.json" --model flash --timeout 90 --cleanup delete
    
    # ETAPA 7
    echo "⏳ [Marketing] ETAPA 7: Critics"
    openclaw sessions spawn --task "CRITICS. Escolha a melhor. Output JSON: $WIP_DIR/${JOB_ID}_07_CRITICS.json" --model opus --timeout 120 --cleanup delete
    
    # ETAPA 8
    echo "⏳ [Marketing] ETAPA 8: Wall"
    openclaw sessions spawn --task "WALL. Score final. Output JSON: $WIP_DIR/${JOB_ID}_08_WALL.json" --model opus --timeout 120 --cleanup delete
    
    # Final
    echo "✅ [Marketing] Pipeline Finalizado"
    # Criar FINAL simplificado
    cp "$WIP_DIR/${JOB_ID}_05C_COPY_SONNET.md" "$WIP_DIR/${JOB_ID}_FINAL.md" 2>/dev/null || true
fi
