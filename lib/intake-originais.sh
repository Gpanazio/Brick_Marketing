#!/bin/bash
# Intake Agent - Originais Pipeline (TV/Streaming/Doc)
# Foco: Viabilidade Comercial, Acesso, Formato e Refinamento Criativo
# Persona: Executivo de Desenvolvimento / Script Doctor
# Modelo: Gemini Flash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pipeline-utils.sh"

log() {
  echo "[$(date +'%H:%M:%S')] $*"
}

PROJECT_ID="$1"
MODE="${2:-originais}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "❌ Uso: $0 <PROJECT_ID> [MODE]"
  exit 1
fi

BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$BASE_DIR/wip/$PROJECT_ID"
BRIEFING_FILE="$PROJECT_DIR/BRIEFING.json"
INTAKE_FILE="$PROJECT_DIR/INTAKE.md"

mkdir -p "$PROJECT_DIR"

log "🎬 INTAKE AGENT - Originais Brick (Audit & Creative Refinement)"

# Schema focado em Venda e Viabilidade
BRIEFING_SCHEMA=$(cat <<'EOF'
{
  "titulo": "string (sugerido ou original)",
  "logline_venda": "string (pitch de elevador comercial e magnético - máx 2 frases)",
  "formato": {
    "tipo": "string (Série Doc | Longa Doc | Reality | Ficção)",
    "estrutura": "string (ex: 4 episódios de 45min)",
    "genero": "string (ex: True Crime, Biografia, Competition)"
  },
  "auditoria": {
    "acesso": {
      "status": "string (Exclusivo | Difícil | Público | Inexistente)",
      "risco": "string (Baixo | Médio | Alto)",
      "observacao": "string (O que temos de concreto? Entrevistados? Arquivo?)"
    },
    "tese": {
      "clareza": "string (Focada | Genérica | Confusa)",
      "problema": "string (Qual a falha no recorte atual?)"
    }
  },
  "mercado": {
    "target": "array de strings (Quem compra? Ex: Globoplay, Netflix, Curta!)",
    "comps": "array de strings (Projetos similares de sucesso - X encontra Y)",
    "diferencial_competitivo": "string (Por que comprariam O NOSSO e não o do vizinho?)"
  },
  "creative_doctor": {
    "diagnostico": "string (Análise crítica narrativa)",
    "debate_interno": {
      "demon": "string (A voz do mercado cínico: Por que isso vai falhar? Seja brutal.)",
      "angel": "string (A voz da arte: Por que isso é genial? Defenda a alma do projeto.)"
    },
    "pontos_fortes": "array de strings",
    "pontos_fracos": "array de strings (Gaps de roteiro/estrutura)",
    "sugestao_pivot": "string (A ideia genial para salvar ou melhorar o projeto)"
  },
  "veredito": {
    "score": "number (0-100)",
    "acao": "string (LIXO | INCUBAR | REFINAR | PITCH)",
    "resumo": "string (Justificativa final do executivo)"
  }
}
EOF
)

INTAKE_PROMPT=$(cat <<EOF
Você é o Head de Desenvolvimento de Originais da Brick AI. Sua persona é uma mistura de Executivo de TV cínico com um Roteirista genial.

**SUA MISSÃO:**
Não é passar a mão na cabeça. É transformar ideias em PRODUTOS VENDÁVEIS.
Você deve ler o material e julgar brutalmente a viabilidade, mas também agir como "Creative Partner" sugerindo melhorias narrativas.

**O MATERIAL:**
$(cat "$PROJECT_DIR/INPUT.md" 2>/dev/null || echo "Nenhum texto extraído. Analise apenas anexos se houver.")

**ANEXOS (Contexto):**
$(ls -1 "$PROJECT_DIR/attachments/" 2>/dev/null | sed 's/^/- /' || echo "Nenhum anexo")

**SCHEMA OBRIGATÓRIO:**
$BRIEFING_SCHEMA

**DIRETRIZES DE ANÁLISE:**

1. **AUDITORIA DE ACESSO (O "BS Detector"):**
   - O projeto diz que vai entrevistar o Papa. Eles TÊM o Papa? Se não, aponte o risco.
   - O acesso é exclusivo ou qualquer um com uma câmera faz igual?
   - Documentário sem acesso privilegiado é apenas "reportagem longa".

2. **AUDITORIA DE TESE (O "So What?"):**
   - O tema é amplo demais? (Ex: "O universo do funk"). Exija recorte! (Ex: "A criminalização do funk nos anos 90").
   - Se for genérico, CLASSIFIQUE como "Genérico" e sugira um ângulo na seção 'creative_doctor'.

3. **FORMATO & MERCADO:**
   - Isso tem cara de filme de festival ou série de streaming? Não confunda os dois.
   - Quem paga a conta? Se for "arte demais", sugira canais de nicho (Arte 1, Curta!). Se for "pop", aponte Streamings.
   - Use referências (Comps) para situar o projeto: "É 'Chefs Table' com 'Narcos'".

4. **CREATIVE DOCTOR (A Consultoria):**
   - Reescreva a Logline. Torne-a sexy. Venda o peixe.
   - Se a ideia for chata, sugira um PIVOT. (Ex: "Em vez de apenas mostrar a banda, mostre a briga judicial entre os integrantes").

5. **VEREDITO:**
   - Dê uma nota realista (0-100).
   - Ação: "PITCH" (Pronto), "REFINAR" (Bom mas falta algo), "INCUBAR" (Ideia crua), "LIXO" (Sem salvação).

**OUTPUT:**
Retorne APENAS o JSON. Sem markdown extra.
EOF
)

log "🍿 Rodando Análise de Originais (Executivo + Script Doctor)..."

attempt=1
max_retries=2
MODEL_USED=""

while [ $attempt -le $max_retries ]; do
  # Tenta usar o modelo configurado, fallback pro flash se der erro
  AGENT="flash" 
  
  log "  >> Tentativa $attempt: Gemini Flash"
  
  RESPONSE=$(safe_timeout 120s openclaw agent \
    --agent "$AGENT" \
    --session-id "intake-originais-$PROJECT_ID" \
    --message "$INTAKE_PROMPT" \
    2>&1 | tee "$PROJECT_DIR/INTAKE_RAW_${attempt}.log")
  
  exit_code=$?
  # Remove header logs do openclaw agent se houver, tenta pegar só o JSON
  RESPONSE_CLEAN=$(echo "$RESPONSE" | sed -n '/^[{]/,$p')
  
  if [ $exit_code -eq 0 ] && [ -n "$RESPONSE_CLEAN" ]; then
    MODEL_USED="$AGENT"
    RESPONSE="$RESPONSE_CLEAN"
    log "✅ Análise concluída com sucesso."
    break
  fi
  
  log "⚠️  Tentativa $attempt falhou ou retorno vazio."
  attempt=$((attempt + 1))
  sleep 3
done

if [ -z "$MODEL_USED" ]; then
  log "❌ Falha crítica na análise."
  exit 1
fi

echo "$RESPONSE" > "$BRIEFING_FILE"

# Gera o relatório legível em Markdown
cat > "$INTAKE_FILE" <<EOF
# 🎬 Originais Brick: $PROJECT_ID

$(echo "$RESPONSE" | jq -r '"## " + .titulo + "\n\n> **" + .logline_venda + "**"')

## 📊 Veredito do Executivo
- **Score:** $(echo "$RESPONSE" | jq -r '.veredito.score')/100
- **Ação Recomendada:** $(echo "$RESPONSE" | jq -r '.veredito.acao')
- **Resumo:** $(echo "$RESPONSE" | jq -r '.veredito.resumo')

## 🔍 Auditoria
- **Acesso:** $(echo "$RESPONSE" | jq -r '.auditoria.acesso.status') (Risco: $(echo "$RESPONSE" | jq -r '.auditoria.acesso.risco'))
- **Tese:** $(echo "$RESPONSE" | jq -r '.auditoria.tese.clareza')
- **Formato:** $(echo "$RESPONSE" | jq -r '.formato.tipo') - $(echo "$RESPONSE" | jq -r '.formato.estrutura')

## 💡 Creative Doctor (Análise)
$(echo "$RESPONSE" | jq -r '.creative_doctor.diagnostico')

### 😈 vs 😇
**O Demônio (Mercado):**
> "$(echo "$RESPONSE" | jq -r '.creative_doctor.debate_interno.demon')"

**O Anjo (Arte):**
> "$(echo "$RESPONSE" | jq -r '.creative_doctor.debate_interno.angel')"

**Sugestão de Pivot:**
> $(echo "$RESPONSE" | jq -r '.creative_doctor.sugestao_pivot')

## 🎯 Mercado
- **Target:** $(echo "$RESPONSE" | jq -r '.mercado.target | join(", ")')
- **Parecido com:** $(echo "$RESPONSE" | jq -r '.mercado.comps | join(", ")')

EOF

log "✅ Relatório salvo em $INTAKE_FILE"
echo "$INTAKE_FILE"
