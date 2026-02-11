#!/bin/bash
# Intake Agent - Marketing Pipeline
# Extrai contexto de PDFs/imagens, infere lacunas, monta briefing completo
# Modelo: Gemini Pro (google/gemini-3-pro-preview)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pipeline-utils.sh"

# Helper pra logging
log() {
  echo "[$(date +'%H:%M:%S')] $*"
}

PROJECT_ID="$1"
MODE="${2:-marketing}"  # marketing|projetos|ideias

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ Uso: $0 <PROJECT_ID> [MODE]"
  exit 1
fi

# Detectar BASE_DIR
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$BASE_DIR/wip/$PROJECT_ID"
BRIEFING_FILE="$PROJECT_DIR/BRIEFING.json"
INTAKE_FILE="$PROJECT_DIR/INTAKE.md"

# Criar diretórios se não existirem
mkdir -p "$PROJECT_DIR"

log "🔍 INTAKE AGENT - Análise de materiais e briefing"

# Schema do briefing completo
BRIEFING_SCHEMA=$(cat <<'EOF'
{
  "marca": "string (nome da marca/empresa)",
  "produto": "string (produto/serviço sendo promovido)",
  "objetivo": "string (objetivo da campanha: awareness|conversao|engagement|educacao)",
  "publico": {
    "primario": "string (público principal)",
    "secundario": "string (público secundário, opcional)",
    "demografico": "string (faixa etária, localização, renda)",
    "psicografico": "string (valores, interesses, comportamentos)"
  },
  "mensagem_central": "string (mensagem principal da campanha)",
  "tom": "string (tom de voz: profissional|casual|inspirador|urgente|educativo)",
  "canal": "string ou array (onde será veiculado: social|email|site|ads|tv|radio)",
  "formato": "string (formato do conteúdo: post|video|banner|email|landing)",
  "cta": "string (call-to-action desejado)",
  "restricoes": "array de strings (restrições ou evitar)",
  "contexto": "string (contexto adicional, referências, histórico)",
  "anexos": "array (paths dos arquivos anexados)",
  "inferred_fields": "array (campos que foram inferidos, não explícitos)"
}
EOF
)

# Prompt do Intake Agent
INTAKE_PROMPT=$(cat <<EOF
Você é o Intake Agent da Brick AI - especialista em estruturar briefings de marketing.

**SEU PAPEL:**
1. Extrair TODO contexto disponível dos materiais fornecidos (texto, PDFs, imagens)
2. Inferir campos faltantes com base em contexto/padrões do setor
3. Assumir defaults inteligentes quando não houver info suficiente
4. NUNCA travar - sempre preencher tudo

**MATERIAIS RECEBIDOS:**
$(cat "$PROJECT_DIR/INPUT.md" 2>/dev/null || echo "Nenhum input estruturado fornecido")

**ANEXOS DISPONÍVEIS:**
$(ls -1 "$PROJECT_DIR/attachments/" 2>/dev/null | sed 's/^/- /' || echo "Nenhum anexo")

**CONTEXTO HISTÓRICO:**
- Marca: ${MARCA:-"Não identificada - inferir"}
- Setor: ${SETOR:-"Não identificado - inferir"}
- Campanhas anteriores: $(ls -1 "$BASE_DIR/done/" 2>/dev/null | tail -3 | sed 's/^/  /' || echo "Primeira campanha")

**SCHEMA OBRIGATÓRIO:**
$BRIEFING_SCHEMA

**REGRAS CRÍTICAS:**
- Extraia TODO texto de PDFs/imagens se houver
- Infira campos faltantes (documente em "inferred_fields")
- Use defaults do setor quando necessário:
  - Público: se for B2B → decisores/gestores; B2C → consumidor final
  - Tom: corporativo → profissional; startup → casual; luxo → inspirador
  - Objetivo: se falar de lançamento → awareness; promoção → conversão
- NUNCA deixe campos vazios - sempre assuma algo razoável
- Se não tiver CTA explícito, sugira um baseado no objetivo

**OUTPUT:**
Retorne APENAS o JSON do briefing completo, sem markdown, sem explicações.
EOF
)

# Executa o Intake Agent com Gemini Pro
log "📋 Montando briefing completo..."

# Cria arquivo temporário com o prompt
PROMPT_FILE="$PROJECT_DIR/INTAKE_PROMPT.txt"
echo "$INTAKE_PROMPT" > "$PROMPT_FILE"

# Executa via openclaw agent (Gemini Pro com fallback Flash)
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
    --session-id "intake-$PROJECT_ID" \
    --message "$INTAKE_PROMPT" \
    2>&1 | tee "$PROJECT_DIR/INTAKE_RAW_${attempt}.log")
  
  exit_code=$?
  
  # Remove primeira linha (echo do openclaw)
  RESPONSE=$(echo "$RESPONSE" | tail -n +2)
  
  if [ $exit_code -eq 0 ] && [ -n "$RESPONSE" ]; then
    MODEL_USED="$AGENT"
    log "✅ Intake gerado com sucesso via $AGENT"
    break
  fi
  
  log "⚠️  Tentativa $attempt falhou (exit=$exit_code)"
  attempt=$((attempt + 1))
  
  if [ $attempt -le $max_retries ]; then
    sleep 3
  fi
done

if [ -z "$MODEL_USED" ]; then
  log "❌ Intake Agent falhou após $max_retries tentativas"
  exit 1
fi

# Salva o briefing JSON
echo "$RESPONSE" | jq '.' > "$BRIEFING_FILE" 2>/dev/null || {
  log "⚠️  Resposta não é JSON válido, salvando raw"
  echo "$RESPONSE" > "$BRIEFING_FILE"
}

# Salva também em markdown legível
cat > "$INTAKE_FILE" <<EOF
# Intake - $PROJECT_ID

## 📋 Briefing Estruturado

$(cat "$BRIEFING_FILE")

## 🤖 Campos Inferidos

$(echo "$RESPONSE" | jq -r '.inferred_fields[]' 2>/dev/null | sed 's/^/- /' || echo "Nenhum campo inferido")

## ⚙️ Metadados

- **Gerado em:** $(date -Iseconds)
- **Modelo:** ${MODEL_USED} (google/gemini-3-$([ "$MODEL_USED" = "pro" ] && echo "pro" || echo "flash")-preview)
- **Materiais processados:** $(ls -1 "$PROJECT_DIR/attachments/" 2>/dev/null | wc -l) arquivo(s)

EOF

log "✅ Briefing completo salvo em $BRIEFING_FILE"
log "📄 Resumo legível em $INTAKE_FILE"

# Retorna o path do briefing pro pipeline
echo "$BRIEFING_FILE"
