#!/bin/bash
# Intake Agent - Ideias Pipeline
# Extrai problema, solução proposta, hipóteses, mercado-alvo
# Modelo: Gemini Pro com fallback Flash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pipeline-utils.sh"

log() {
  echo "[$(date +'%H:%M:%S')] $*"
}

PROJECT_ID="$1"
MODE="${2:-ideias}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ Uso: $0 <PROJECT_ID> [MODE]"
  exit 1
fi

BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$BASE_DIR/wip/$PROJECT_ID"
BRIEFING_FILE="$PROJECT_DIR/BRIEFING.json"
INTAKE_FILE="$PROJECT_DIR/INTAKE.md"

mkdir -p "$PROJECT_DIR"

log "🔍 INTAKE AGENT - Ideias (problema + solução + validação)"

BRIEFING_SCHEMA=$(cat <<'EOF'
{
  "ideia": "string (nome ou conceito da ideia)",
  "problema": {
    "dor": "string (dor/problema que a ideia resolve)",
    "publico_afetado": "string (quem sofre com esse problema)",
    "intensidade": "string (baixa|media|alta|critica)",
    "frequencia": "string (pontual|recorrente|constante)"
  },
  "solucao": {
    "proposta": "string (como a ideia resolve o problema)",
    "diferenciais": "array de strings (o que torna única)",
    "MVP": "string (versão mínima viável da solução)",
    "escalabilidade": "string (potencial de crescimento)"
  },
  "mercado": {
    "tamanho": "string (nicho|segmento|massa)",
    "concorrentes": "array de strings (players existentes)",
    "barreiras": "array de strings (dificuldades de entrada)",
    "oportunidade": "string (janela de mercado)"
  },
  "validacao": {
    "hipoteses": "array de strings (suposições a validar)",
    "metricas": "array de strings (como medir sucesso)",
    "riscos": "array de strings (o que pode dar errado)"
  },
  "contexto": "string (motivação, referências, insight original)",
  "anexos": "array (paths)",
  "inferred_fields": "array"
}
EOF
)

INTAKE_PROMPT=$(cat <<EOF
Você é o Intake Agent da Brick AI - especialista em estruturar e validar ideias de negócio/produto.

**SEU PAPEL:**
1. Extrair o problema central e a solução proposta
2. Inferir mercado, concorrência e viabilidade
3. Estruturar hipóteses a validar
4. NUNCA travar - sempre preencher tudo

**MATERIAIS RECEBIDOS:**
$(cat "$PROJECT_DIR/INPUT.md" 2>/dev/null || echo "Nenhum input")

**ANEXOS:**
$(ls -1 "$PROJECT_DIR/attachments/" 2>/dev/null | sed 's/^/- /' || echo "Nenhum")

**SCHEMA OBRIGATÓRIO:**
$BRIEFING_SCHEMA

**REGRAS:**
- Identifique claramente: problema → solução → mercado
- Infira intensidade da dor (baixa: nice-to-have | alta: painkiller)
- Liste concorrentes diretos e indiretos
- Defina MVP (versão mais simples possível)
- Estruture hipóteses testáveis (ex: "Usuários pagariam R\$X/mês")
- Identifique riscos críticos (técnico, mercado, regulatório)
- Se a ideia for vaga, proponha estruturação e documente em "inferred_fields"

**OUTPUT:**
Retorne APENAS o JSON do briefing, sem markdown.
EOF
)

log "📋 Estruturando ideia..."

attempt=1
max_retries=2
MODEL_USED=""

while [ $attempt -le $max_retries ]; do
  if [ $attempt -eq 1 ]; then
    log "  >> Tentativa 1: Gemini Pro"
    AGENT="pro"
  else
    log "  >> Tentativa 2 (fallback): Gemini Flash"
    AGENT="flash"
  fi
  
  RESPONSE=$(safe_timeout 90s openclaw agent \
    --agent "$AGENT" \
    --session-id "intake-idea-$PROJECT_ID" \
    --message "$INTAKE_PROMPT" \
    2>&1 | tee "$PROJECT_DIR/INTAKE_RAW_${attempt}.log")
  
  exit_code=$?
  RESPONSE=$(echo "$RESPONSE" | tail -n +2)
  
  if [ $exit_code -eq 0 ] && [ -n "$RESPONSE" ]; then
    MODEL_USED="$AGENT"
    log "✅ Intake gerado com sucesso via $AGENT"
    break
  fi
  
  log "⚠️  Tentativa $attempt falhou"
  attempt=$((attempt + 1))
  [ $attempt -le $max_retries ] && sleep 3
done

if [ -z "$MODEL_USED" ]; then
  log "❌ Intake falhou após $max_retries tentativas"
  exit 1
fi

echo "$RESPONSE" | jq '.' > "$BRIEFING_FILE" 2>/dev/null || {
  log "⚠️  Resposta não é JSON válido, salvando raw"
  echo "$RESPONSE" > "$BRIEFING_FILE"
}

cat > "$INTAKE_FILE" <<EOF
# Intake Ideias - $PROJECT_ID

## 📋 Briefing Estruturado

$(cat "$BRIEFING_FILE")

## 🤖 Campos Inferidos

$(echo "$RESPONSE" | jq -r '.inferred_fields[]' 2>/dev/null | sed 's/^/- /' || echo "Nenhum")

## ⚙️ Metadados

- **Gerado em:** $(date -Iseconds)
- **Modelo:** ${MODEL_USED} (gemini-3-$([ "$MODEL_USED" = "pro" ] && echo "pro" || echo "flash"))
- **Materiais:** $(ls -1 "$PROJECT_DIR/attachments/" 2>/dev/null | wc -l) arquivo(s)

EOF

log "✅ Briefing completo salvo em $BRIEFING_FILE"
echo "$BRIEFING_FILE"
