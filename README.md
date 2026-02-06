# Brick AI - War Room

Sistema de pipelines multi-agente para criação de conteúdo (Marketing, Projetos — Clientes, Ideias).

---

## 🚨 LEIA ISSO ANTES DE MEXER EM QUALQUER COISA

### Regra #1: Se funciona, NÃO mexe
Se um endpoint, função ou pipeline já funciona, **não "melhore"** só porque achou uma forma "mais elegante". Só mexe se:
- Tá quebrado OU
- Tem um caso de uso novo que o código atual não cobre

### Regra #2: Teste LOCAL antes de fazer push
```bash
# 1. Faz mudança
# 2. Testa localmente (node server.js OU roda script)
# 3. Funciona 100%? → git commit + push
# 4. NÃO funciona? → NÃO faz push, conserta antes
```

### Regra #3: Deploy Railway demora 1-3 minutos
- Push no GitHub → Railway detecta → Build → Deploy
- **NUNCA** assume que é instantâneo
- Se chamar endpoint novo antes do deploy = 404 (normal)
- Espera 2-3 min, DÁ REFRESH no navegador (Cmd+Shift+R), DEPOIS testa

---

## 📂 Estrutura (Como Funciona)

```
Brick_Marketing/
├── server.js              # Backend (Express + Socket.IO)
├── public/index.html      # Frontend (War Room visual)
├── history/               # Storage de arquivos
│   ├── marketing/
│   │   ├── briefing/      # Briefings recebidos
│   │   ├── wip/           # Arquivos em processamento
│   │   └── done/          # Projetos concluídos
│   ├── projetos/          # Projetos de clientes (marca do cliente, não da Brick)
│   └── ideias/            # Idem (modo Ideias)
├── roles/                 # Prompts dos agentes (20 arquivos .md)
├── lib/
│   ├── pipeline-utils.sh       # Funções de retry, validação, timers
│   └── context-summarizer.sh   # Reduz contexto (economia de tokens)
├── run-marketing.sh       # Pipeline Marketing (8 etapas)
├── run-projetos.sh        # Pipeline Projetos — Clientes (6 etapas)
├── run-ideias.sh          # Pipeline Ideias (5 etapas)
└── sync-to-railway.sh     # Sincroniza arquivo local → Railway
```

---

## 🔄 Como Funciona (Criança de 5 Anos)

### 1. Usuário cria briefing no site
- Clica "Novo Briefing"
- Escreve o que quer
- Escolhe modo (Marketing/Projetos/Ideias)
- Submete

### 2. Briefing vira arquivo
- Backend salva: `history/{modo}/briefing/{timestamp}_{titulo}.md`
- Sincroniza pro Railway (se rodar lá)

### 3. Pipeline roda (local OU Railway)
- Script bash (`run-marketing.sh` ou outro) executa
- Chama agentes via `openclaw agent --agent {modelo}`
- Cada etapa salva arquivo em `history/{modo}/wip/`
- Exemplos:
  - `1234_01_VALIDATOR.json`
  - `1234_05A_COPY_GPT.md`
  - `1234_08_WALL.json`

### 4. Site atualiza em tempo real
- Backend sincroniza arquivos novos
- Frontend detecta via Socket.IO
- Nodes acendem quando etapa completa
- Clica duplo no node = abre painel com resultado

### 5. Humano aprova OU pede revisão
- Clica "Aprovar" → move pra `done/`
- Clica "Revisar" → feedback → agente refaz

---

## ⚙️ Padrões Que FUNCIONAM (NÃO MUDAR)

### Frontend (public/index.html)

#### API_URL
```javascript
const API_URL = '/api';
```
- Endpoints: `${API_URL}/state` expande pra `/api/state`
- **NUNCA** mudar pra `/api/api/state`

#### fileMapping
```javascript
'VIABILITY': ['VIABILITY']  // Procura arquivo com "VIABILITY" no nome
'DECISION': ['VIABILITY']   // DECISION mostra resumo do VIABILITY
```
- Busca por **substring** no nome do arquivo
- Não precisa ser exato

#### Deploy
- Push → Railway detecta em **1-3 minutos**
- Se endpoint novo retorna 404 = deploy não terminou
- **SEMPRE** aguardar + refresh (Cmd+Shift+R)

### Backend (Scripts Bash)

#### Timeout de Modelos (COM context summarizer)
```bash
--timeout 240  # Flash: 4 minutos
--timeout 180  # Sonnet: 3 minutos
--timeout 180  # Opus: 3 minutos
```
- SEM summarizer, Flash precisa 360s (6 min)

#### Context Summarizer (OBRIGATÓRIO)
```bash
source "$PROJECT_ROOT/lib/context-summarizer.sh"
CONTEXT_SUMMARY=$(create_marketing_context "$JOB_ID" "$WIP_DIR")
```
- Reduz contexto de ~12k → ~4k tokens
- **Marketing TEM** (desde v2.1)
- **Ideias TEM** (desde 2026-02-06)
- **Projetos — Clientes** (sendo implementado)

#### Retry com Backoff
```bash
attempt=1
max_retries=3
backoff=2

while [ $attempt -le $max_retries ]; do
    # chama agente
    if [ sucesso ]; then break; fi
    sleep $backoff
    backoff=$((backoff * 2))  # 2s → 4s → 8s
    attempt=$((attempt + 1))
done
```
- **PROBLEMA:** Usa MESMO modelo 3x
- **FALTA:** Fallback Flash → Sonnet → GPT

#### Etapa 0 (Ingestion)
- **Marketing:** Processa briefing com agente (adiciona contexto)
- **Ideias:** Passthrough puro (`cp briefing → RAW_IDEA.md`)
- **Projetos — Clientes:** Digest de brand do CLIENTE (transforma em contexto técnico da marca do cliente)

---

## 🐛 Erros Comuns (NÃO REPETIR)

### 1. "Vou melhorar esse endpoint que já funciona"
❌ **NUNCA** faz isso. Se funciona, deixa quieto.

### 2. "Fiz mudança, vou fazer push pra testar"
❌ **SEMPRE** testa local primeiro. Push só se funcionar 100%.

### 3. "Chamei endpoint e deu 404, tá quebrado!"
❌ Espera 2-3 min pra deploy completar. Dá refresh. Testa de novo.

### 4. "Vou adicionar timeout maior sem context summarizer"
❌ Summarizer SEMPRE vem primeiro. Timeout é último recurso.

### 5. "Fiz revert, agora tá consertado"
❌ Revert não é instantâneo. Espera deploy. Testa. Confirma.

---

## ✅ Checklist OBRIGATÓRIO Antes de Push

```bash
# 1. Li o README? ✓
# 2. Testei localmente? ✓
# 3. Funcionou 100%? ✓
# 4. Li o diff do git? ✓
# 5. Tenho certeza que não vai quebrar? ✓

git add .
git commit -m "..."
git push
```

Depois do push:
```bash
# 6. Esperei 2-3 minutos? ✓
# 7. Dei refresh (Cmd+Shift+R)? ✓
# 8. Testei endpoint/funcionalidade? ✓
# 9. Funciona no Railway? ✓
```

---

## 🚧 TO-DO (Prioridade)

### 1. Fallback de Modelo (CRÍTICO)
- Se Flash falhar 3x → Sonnet
- Se Sonnet falhar 3x → GPT
- Garantir que pipeline NUNCA aborta

### 2. Sync Incremental (IMPORTANTE)
- Watcher roda em background
- A cada 5s checa arquivos novos
- Sincroniza automático pro Railway
- Site atualiza em tempo real

### 3. Context Summarizer em Projetos
- Projetos ainda não tem
- Implementar igual Marketing/Ideias

---

## 📞 Contato

Se algo quebrar:
1. Leia este README de novo
2. Confira se seguiu o checklist
3. Se mesmo assim não funcionar, pergunte pro Gabriel

**Regra de Ouro:** Quando em dúvida, NÃO mexe. Pergunta antes.
