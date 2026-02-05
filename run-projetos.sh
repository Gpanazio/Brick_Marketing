#!/bin/bash
# BRICK AI PROJECTS PIPELINE
# Executa pipeline de Projetos (Creative/Concept)
# Usa openclaw agent (sincrono)

set -e

BRIEFING_FILE="$1"

if [ -z "$BRIEFING_FILE" ]; then
    echo "❌ Uso: $0 <briefing-file>"
    exit 1
fi

# Extrair JOB_ID do nome do briefing
BASENAME=$(basename "$BRIEFING_FILE" .md)
BASENAME=$(echo "$BASENAME" | sed -E 's/_(RAW_IDEA|PROCESSED|BRIEFING_INPUT)$//')
JOB_ID="$BASENAME"

if [ -z "$JOB_ID" ]; then
    JOB_ID=$(date +%s%3N)
fi

PROJECT_ROOT="$HOME/projects/Brick_Marketing"
WIP_DIR="$PROJECT_ROOT/history/projetos/wip"

echo "🎬 Brick AI Projects Pipeline"
echo "📋 Briefing: $(basename $BRIEFING_FILE)"
echo "🆔 Job ID: $JOB_ID"
echo "---"

mkdir -p "$WIP_DIR"

BRIEFING_CONTENT=$(cat "$BRIEFING_FILE")

# ETAPA 0: Douglas (Ingestion)
echo "⏳ ETAPA 0: Douglas (Ingestion)"
cp "$BRIEFING_FILE" "$WIP_DIR/${JOB_ID}_BRIEFING_INPUT.md"
echo "✅ Briefing salvo"

# ETAPA 1: BRAND DIGEST (Flash)
echo ""
echo "⏳ ETAPA 1: Brand Digest (Flash)"
BRAND_OUT="$WIP_DIR/${JOB_ID}_BRAND_DIGEST.md"
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-brand" \
  --message "Você é o BRAND_DIGEST do Brick AI War Room.

BRIEFING DO CLIENTE:
${BRIEFING_CONTENT}

INSTRUÇÕES:
1. Extraia o DNA da marca/projeto: tom, valores, assets mencionados, público-alvo
2. Identifique o objetivo central do projeto
3. Liste as referências e constraints mencionadas
4. Resuma em formato estruturado (Markdown)
5. Escreva o resultado no arquivo: ${BRAND_OUT}
6. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1

if [ -f "$BRAND_OUT" ]; then
    echo "✅ Brand Digest concluído: $BRAND_OUT"
else
    echo "⚠️ Brand Digest não gerou arquivo, criando placeholder"
    echo "# BRAND_DIGEST: Error\nAgent did not write output file" > "$BRAND_OUT"
fi

# ETAPA 2: CREATIVE IDEATION (3 modelos em paralelo)
echo ""
echo "⏳ ETAPA 2: Creative Ideation (3 modelos em paralelo)"
BRAND_CONTENT=$(cat "$BRAND_OUT" 2>/dev/null || echo "Brand digest não disponível")

IDEATION_GPT_OUT="$WIP_DIR/${JOB_ID}_IDEATION_GPT.md"
IDEATION_FLASH_OUT="$WIP_DIR/${JOB_ID}_IDEATION_FLASH.md"
IDEATION_SONNET_OUT="$WIP_DIR/${JOB_ID}_IDEATION_SONNET.md"

# GPT
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-ideation-gpt" \
  --message "Você é o CREATIVE_IDEATION (Conceito A) do Brick AI War Room.

BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

INSTRUÇÕES:
1. Crie UM conceito criativo forte para este projeto
2. Inclua: nome do conceito, tagline, direção visual, narrativa central, referências
3. Seja ousado e diferente -- este é o conceito que surpreende
4. Escreva o resultado como Markdown no arquivo: ${IDEATION_GPT_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1 &
GPT_PID=$!

# Flash
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-ideation-flash" \
  --message "Você é o CREATIVE_IDEATION (Conceito B) do Brick AI War Room.

BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

INSTRUÇÕES:
1. Crie UM conceito criativo forte para este projeto
2. Inclua: nome do conceito, tagline, direção visual, narrativa central, referências
3. Priorize clareza e eficiência -- este é o conceito pragmático e executável
4. Escreva o resultado como Markdown no arquivo: ${IDEATION_FLASH_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1 &
FLASH_PID=$!

# Sonnet
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-ideation-sonnet" \
  --message "Você é o CREATIVE_IDEATION (Conceito C) do Brick AI War Room.

BRIEFING:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

INSTRUÇÕES:
1. Crie UM conceito criativo forte para este projeto
2. Inclua: nome do conceito, tagline, direção visual, narrativa central, referências
3. Foque em storytelling e emoção -- este é o conceito que emociona
4. Escreva o resultado como Markdown no arquivo: ${IDEATION_SONNET_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 120 --json > /dev/null 2>&1 &
SONNET_PID=$!

echo "  >> GPT (PID: $GPT_PID), Flash (PID: $FLASH_PID), Sonnet (PID: $SONNET_PID) em paralelo..."
wait $GPT_PID
wait $FLASH_PID
wait $SONNET_PID

for f in "$IDEATION_GPT_OUT:GPT" "$IDEATION_FLASH_OUT:Flash" "$IDEATION_SONNET_OUT:Sonnet"; do
    FILE="${f%%:*}"
    NAME="${f##*:}"
    if [ -f "$FILE" ]; then
        echo "✅ Ideation $NAME concluído"
    else
        echo "⚠️ Ideation $NAME não gerou arquivo, criando placeholder"
        echo "# IDEATION_${NAME}: Error\nAgent did not write output file" > "$FILE"
    fi
done

# ETAPA 3: CONCEPT CRITIC (Gemini Pro)
echo ""
echo "⏳ ETAPA 3: Concept Critic (Gemini Pro)"
CRITIC_OUT="$WIP_DIR/${JOB_ID}_CONCEPT_CRITIC.md"
IDEATION_GPT_CONTENT=$(cat "$IDEATION_GPT_OUT" 2>/dev/null || echo "N/A")
IDEATION_FLASH_CONTENT=$(cat "$IDEATION_FLASH_OUT" 2>/dev/null || echo "N/A")
IDEATION_SONNET_CONTENT=$(cat "$IDEATION_SONNET_OUT" 2>/dev/null || echo "N/A")
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-critic" \
  --message "Você é o CONCEPT_CRITIC do Brick AI War Room. Juiz imparcial de conceitos.

BRIEFING ORIGINAL:
${BRIEFING_CONTENT}

BRAND DIGEST:
${BRAND_CONTENT}

CONCEITO A (GPT):
${IDEATION_GPT_CONTENT}

CONCEITO B (Flash):
${IDEATION_FLASH_CONTENT}

CONCEITO C (Sonnet):
${IDEATION_SONNET_CONTENT}

INSTRUÇÕES:
1. Avalie os 3 conceitos com critérios: originalidade, aderência ao briefing, executabilidade, impacto emocional
2. Dê score 0-100 para cada
3. Escolha o MELHOR e justifique
4. Sugira melhorias para o conceito vencedor
5. Escreva o resultado como Markdown no arquivo: ${CRITIC_OUT}
6. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 150 --json > /dev/null 2>&1

if [ -f "$CRITIC_OUT" ]; then
    echo "✅ Concept Critic concluído: $CRITIC_OUT"
else
    echo "⚠️ Concept Critic não gerou arquivo, criando placeholder"
    echo "# CONCEPT_CRITIC: Error\nAgent did not write output file" > "$CRITIC_OUT"
fi

# ETAPA 4: EXECUTION DESIGN (Gemini Pro)
echo ""
echo "⏳ ETAPA 4: Execution Design (Gemini Pro)"
EXEC_OUT="$WIP_DIR/${JOB_ID}_EXECUTION_DESIGN.md"
CRITIC_CONTENT=$(cat "$CRITIC_OUT" 2>/dev/null || echo "N/A")
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-exec" \
  --message "Você é o EXECUTION_DESIGN do Brick AI War Room. Diretor visual/técnico.

BRIEFING:
${BRIEFING_CONTENT}

CONCEITO VENCEDOR (do Critic):
${CRITIC_CONTENT}

INSTRUÇÕES:
1. Transforme o conceito vencedor em um plano de execução visual detalhado
2. Inclua: paleta de cores, tipografia, referências visuais, storyboard conceitual, assets necessários
3. Defina o tom visual e a direção de arte
4. Escreva o resultado como Markdown no arquivo: ${EXEC_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 150 --json > /dev/null 2>&1

if [ -f "$EXEC_OUT" ]; then
    echo "✅ Execution Design concluído: $EXEC_OUT"
else
    echo "⚠️ Execution Design não gerou arquivo, criando placeholder"
    echo "# EXECUTION_DESIGN: Error\nAgent did not write output file" > "$EXEC_OUT"
fi

# ETAPA 5: COPYWRITER (GPT 5.2)
echo ""
echo "⏳ ETAPA 5: Copywriter (GPT 5.2)"
COPY_OUT="$WIP_DIR/${JOB_ID}_COPYWRITER.md"
EXEC_CONTENT=$(cat "$EXEC_OUT" 2>/dev/null || echo "N/A")
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-copy" \
  --message "Você é o COPYWRITER do Brick AI War Room. Roteirista profissional.

BRIEFING:
${BRIEFING_CONTENT}

CONCEITO + CRÍTICA:
${CRITIC_CONTENT}

DIREÇÃO VISUAL:
${EXEC_CONTENT}

INSTRUÇÕES:
1. Escreva o roteiro/copy final baseado no conceito aprovado e direção visual
2. Inclua: título, subtítulo, corpo do texto, CTAs, variações por canal se relevante
3. Respeite o tom e as constraints do briefing
4. Escreva o resultado como Markdown no arquivo: ${COPY_OUT}
5. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 150 --json > /dev/null 2>&1

if [ -f "$COPY_OUT" ]; then
    echo "✅ Copywriter concluído: $COPY_OUT"
else
    echo "⚠️ Copywriter não gerou arquivo, criando placeholder"
    echo "# COPYWRITER: Error\nAgent did not write output file" > "$COPY_OUT"
fi

# ETAPA 6: DIRECTOR (Gemini Pro)
echo ""
echo "⏳ ETAPA 6: Director (Gemini Pro)"
DIRECTOR_OUT="$WIP_DIR/${JOB_ID}_DIRECTOR.md"
COPY_CONTENT=$(cat "$COPY_OUT" 2>/dev/null || echo "N/A")
openclaw agent \
  --session-id "brick-proj-${JOB_ID}-director" \
  --message "Você é o DIRECTOR do Brick AI War Room. Avaliador final de execução.

BRIEFING ORIGINAL:
${BRIEFING_CONTENT}

CONCEITO + CRÍTICA:
${CRITIC_CONTENT}

DIREÇÃO VISUAL:
${EXEC_CONTENT}

ROTEIRO/COPY:
${COPY_CONTENT}

INSTRUÇÕES:
1. Avalie a proposta completa: conceito + visual + copy
2. Score de 0-100 para cada dimensão e score final
3. Se score >= 85: APROVADO para review humano
4. Se score < 85: liste os problemas e o que precisa melhorar
5. Escreva o resultado como Markdown no arquivo: ${DIRECTOR_OUT}
6. O arquivo DEVE ser criado em disco. Use a ferramenta write para salvar." \
  --timeout 180 --json > /dev/null 2>&1

if [ -f "$DIRECTOR_OUT" ]; then
    echo "✅ Director concluído: $DIRECTOR_OUT"
else
    echo "⚠️ Director não gerou arquivo, criando placeholder"
    echo "# DIRECTOR: Error\nAgent did not write output file" > "$DIRECTOR_OUT"
fi

# FINAL
echo ""
echo "🏁 Pipeline Projetos Finalizado"
echo "📁 Arquivos em: $WIP_DIR"
ls -la "$WIP_DIR"/${JOB_ID}_* 2>/dev/null || echo "Nenhum arquivo encontrado"
