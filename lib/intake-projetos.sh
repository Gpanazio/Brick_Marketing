#!/bin/bash
# Intake Agent - Projetos Pipeline
# Extrai contexto técnico, specs, orçamento, timeline
# Modelo: Gemini Flash com fallback Flash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pipeline-utils.sh"

log() {
  echo "[$(date +'%H:%M:%S')] $*"
}

PROJECT_ID="$1"
MODE="${2:-projetos}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ Uso: $0 <PROJECT_ID> [MODE]"
  exit 1
fi

BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$BASE_DIR/wip/$PROJECT_ID"
BRIEFING_FILE="$PROJECT_DIR/BRIEFING.json"
INTAKE_FILE="$PROJECT_DIR/INTAKE.md"

mkdir -p "$PROJECT_DIR"

log "🔍 INTAKE AGENT - Projetos (specs técnicas + timeline)"

BRIEFING_SCHEMA=$(cat <<'EOF'
{
  "projeto": "string (nome/título do projeto)",
  "tipo": "string (website|app|video|evento|campanha|produto)",
  "objetivo": "string (objetivo principal do projeto)",
  "escopo": {
    "entregaveis": "array de strings (o que será entregue)",
    "features": "array de strings (funcionalidades principais)",
    "restricoes_tecnicas": "array de strings (limitações técnicas)"
  },
  "timeline": {
    "prazo": "string (data de entrega ou duração)",
    "milestones": "array (marcos intermediários)",
    "urgencia": "string (baixa|media|alta|critica)"
  },
  "orcamento": {
    "valor": "string (budget estimado ou range)",
    "alocacao": "string (distribuição do orçamento)",
    "prioridade": "string (custo|velocidade|qualidade)"
  },
  "publico": "string (quem vai usar/consumir)",
  "contexto": "string (background, referências, motivação)",
  "anexos": "array (paths dos arquivos)",
  "inferred_fields": "array (campos inferidos)"
}
EOF
)

INTAKE_PROMPT=$(cat <<EOF
Você é o Intake Agent da Brick AI - especialista em estruturar briefings de projetos técnicos.

**SEU PAPEL:**
1. Extrair specs técnicas, entregáveis, timeline e budget
2. Inferir escopo completo baseado no tipo de projeto
3. Assumir defaults do mercado quando não houver info
4. NUNCA travar - sempre preencher tudo

**MATERIAIS RECEBIDOS:**
$(cat "$PROJECT_DIR/INPUT.md" 2>/dev/null || echo "Nenhum input")

**ANEXOS:**
$(ls -1 "$PROJECT_DIR/attachments/" 2>/dev/null | sed 's/^/- /' || echo "Nenhum anexo")

**SCHEMA OBRIGATÓRIO:**
$BRIEFING_SCHEMA

**REGRAS:**
- Extraia TODO contexto técnico disponível
- Infira entregáveis típicos do tipo de projeto:
  - Website → páginas, responsivo, CMS, hosting
  - App → iOS/Android, backend, APIs, push notifications
  - Video → roteiro, filmagem, edição, motion graphics
  - Evento → local, produção, cobertura, livestream
- Timeline: se não houver prazo, assuma "a definir" mas sugira duração típica
- Orçamento: se não houver valor, indique range típico do mercado
- Features: liste funcionalidades essenciais + opcionais
- Restrições técnicas: identifique limitações (budget, tempo, plataforma)

**OUTPUT:**
Retorne APENAS o JSON do briefing, sem markdown.
EOF
)

log "📋 Montando briefing de projeto..."

attempt=1
max_retries=2
MODEL_USED=""

while [ $attempt -le $max_retries ]; do
  if [ $attempt -eq 1 ]; then
    log "  >> Tentativa 1: Gemini Flash"
    AGENT="flash"
  else
    log "  >> Tentativa 2 (fallback): Gemini Flash"
    AGENT="flash"
  fi
  
  RESPONSE=$(safe_timeout 90s openclaw agent \
    --agent "$AGENT" \
    --session-id "intake-proj-$PROJECT_ID" \
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
# Intake Projetos - $PROJECT_ID

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
