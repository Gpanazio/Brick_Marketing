# Brick AI - War Room

Sistema de pipelines multi-agente para criação de conteúdo (Marketing, Projetos — Clientes, Ideias).

**Última atualização:** 2026-02-12

---

## 🌐 URLs de Acesso

- **Produção:** https://war.brick.mov (oficial)
- **Railway:** https://brickmarketing-production.up.railway.app (infra)
- **Repositório:** https://github.com/Gpanazio/Brick_Marketing

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
│   ├── BRAND_GUIDE.md     # Brand Guide v8.0 (tom/vocabulário Brick AI)
│   ├── ANGEL_GEN.md       # Ideias: perspectiva otimista
│   ├── DEVIL_GEN.md       # Ideias: perspectiva crítica
│   └── ...
├── lib/
│   ├── pipeline-utils.sh       # Funções de retry, validação, timers
│   └── context-summarizer.sh   # Reduz contexto (economia de tokens)
├── run-marketing.sh       # Pipeline Marketing (7 etapas + FINAL)
├── run-projetos.sh        # Pipeline Projetos — Clientes (6 etapas)
├── run-ideias.sh          # Pipeline Ideias (5 etapas)
├── run-reloop.sh          # Loop Marketing: HUMAN → COPY_SENIOR (feedback)
├── run-reloop-projetos.sh # Loop Projetos: HUMAN → PROPOSAL (feedback)
└── sync-to-railway.sh     # Sincroniza arquivo local → Railway
```

---

## 🔍 Intake Agent (Gemini Pro) - NOVO 2026-02-11

**O que é:**
Primeiro agente de TODOS os pipelines. Recebe materiais brutos (texto, PDFs, imagens) e monta um briefing completo estruturado.

**Regras de Ouro:**
- ❌ **NUNCA faz perguntas pro usuário** (não trava o pipeline)
- ✅ **Sempre preenche tudo** (infere o que falta)
- ✅ **Documenta suposições** (campo `inferred_fields`)
- ✅ **Assume defaults inteligentes** (baseado no setor/tipo)

**Modelos:**
- **Tentativa 1:** Gemini Pro (google/gemini-3-pro-preview)
- **Tentativa 2 (fallback):** Gemini Flash (se Pro falhar)

**O que faz por pipeline:**

### Marketing (`lib/intake-marketing.sh`)
Preenche:
- Marca, produto, objetivo (awareness/conversão/engagement)
- Público (primário + secundário + demo + psico)
- Mensagem central, tom de voz, canal, formato
- CTA, restrições, contexto

Inferências típicas:
- Público secundário (ex: influencers se for B2C)
- Psicografia detalhada (valores, comportamentos)
- Tom baseado no perfil da marca
- Formato baseado no budget

### Projetos (`lib/intake-projetos.sh`)
Preenche:
- Tipo de projeto (website/app/video/evento)
- Escopo (entregáveis + features + restrições técnicas)
- Timeline (prazo + milestones + urgência)
- Orçamento (valor + alocação + prioridade custo/velocidade/qualidade)

Inferências típicas:
- Entregáveis típicos do tipo (ex: website → responsivo + CMS + hosting)
- Duração típica se prazo não informado
- Range de orçamento típico do mercado

### Ideias (`lib/intake-ideias.sh`)
Preenche:
- Problema (dor + público afetado + intensidade + frequência)
- Solução (proposta + diferenciais + MVP + escalabilidade)
- Mercado (tamanho + concorrentes + barreiras + oportunidade)
- Validação (hipóteses + métricas + riscos)

Inferências típicas:
- Intensidade da dor (nice-to-have vs painkiller)
- Concorrentes diretos e indiretos
- MVP (versão mais simples possível)
- Hipóteses testáveis

**Saída:**
- `BRIEFING.json` (estruturado, pronto pro pipeline)
- `INTAKE.md` (markdown legível com metadados)
- `INTAKE_RAW_*.log` (logs de execução)

---

## 🔄 Como Funciona (Criança de 5 Anos)

### 1. Usuário cria briefing no site
- Clica "+ New_Briefing"
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
  - `1234_07_WALL.json`

### 4. Site atualiza em tempo real
- Backend sincroniza arquivos novos (Socket.IO)
- Frontend detecta mudanças
- Nodes acendem quando etapa completa
- Clica duplo no node = abre painel com resultado

### 5. Humano aprova OU pede revisão
- Clica "Aprovar" → move pra `done/`
- Clica "Revisar" → feedback → modelo campeão refaz

---

## 🧬 Pipelines (Estado Atual - 2026-02-07)

### Marketing (7 etapas + FINAL)
**Objetivo:** Criar copy de conteúdo interno da Brick AI (Instagram, LinkedIn, Twitter)

**Brand Guide v8.0:** Injetado DIRETO nos copywriters (etapa 5). Tom: "The Cold Director". Vocabulário técnico. Proibido: emojis, "prompt", "revolucionário", corporativês.

```
00. DOUGLAS (manual) → interpreta briefing, enriquece, salva PROCESSED.md
01. VALIDATOR (Flash) → valida completude
02. AUDIENCE (Flash) → analisa persona + Brand Guide completo
03. RESEARCHER (Flash) → dados de mercado
04. CLAIMS (Flash) → filtro anti-hype
05. COPYWRITERS x3 (GPT+Flash+Sonnet) → recebem Brand Guide, criam copies já alinhadas
06. COPY_SENIOR (GPT 5.2) → escolhe melhor, revisa, entrega copy_revisada
07. WALL (Opus + Brand Guardian) → score 0-100 (5 critérios)
    ├─► score < 80 → LOOP: volta pro COPY_SENIOR (max 3x)
    └─► score ≥ 80 → segue
08. HUMAN → [APROVAR] ou [REVISAR]
    ├─► APROVAR → FINAL.md (copy_revisada + alterações + WALL JSON)
    └─► REVISAR → REVISAO_N.md (modelo campeão + feedback humano)
```

**Custo:** ~$0.12/projeto | **Tempo:** 2-4 min (sem loop), 5-7 min (com loop)

**Inovações recentes:**
- Brand Guide integrado (etapa 6 "Brand Guardian" eliminada)
- Loop automático Copy Senior ↔ Wall (arquivos `_v2.json`, `_v3.json` ESCONDIDOS na UI)
- Sistema de revisão visual (nodes dinâmicos REVISAO_1, REVISAO_2...)

### Projetos — Clientes (6 etapas)
**Objetivo:** Criar conceito criativo + proposta comercial para CLIENTES da Brick (produtora)

**IMPORTANTE:** Marca/tom é DO CLIENTE, NÃO da Brick AI.

```
00. DOUGLAS (manual) → interpreta briefing do cliente
01. BRAND_DIGEST (Flash) → extrai DNA da marca DO CLIENTE
02. IDEATION x3 (GPT+Flash+Sonnet) → 3 conceitos paralelos
03. CONCEPT_CRITIC (Pro) → escolhe vencedor
04. EXECUTION_DESIGN (Pro) → plano executável (visual system, copy, specs)
05. PROPOSAL (GPT) → proposta comercial
06. DIRECTOR (Pro) → score 0-100 (olhar de diretor de fotografia)
    ├─► APROVAR (85-100) → segue pro HUMAN
    ├─► REFINAR (60-84) → loop volta pro step 04 (max 3x)
    └─► REPENSAR (0-59) → volta pro IDEATION
07. HUMAN → [APROVAR] ou [REJEITAR]
```

**Custo:** ~$0.16/projeto | **Tempo:** 2-3 min (sem loop), 4-6 min (com loop)

**Loop Execution ↔ Director:** Arquivos `_v2`, `_v3` (ESCONDIDOS na UI desde 06/02/26)

### Originais (Doc & Entretenimento) — NOVO 2026-02-12
**Objetivo:** Auditoria de viabilidade + refinamento criativo para projetos de TV/Streaming (não-ficção). Usa material denso (bíblia, tratamento, PDF). **Sem etapa HUMAN** — termina no **DOCTOR_FINAL**.

```
00. DOUGLAS (manual) → recebe PDF/DOCX via Telegram, extrai texto e dispara pipeline
01. TRIAGE (Flash) → classifica profundidade do material (formato, gênero, recorte)
02. CREATIVE_DOCTOR (GPT-5.2 non-codex) → análise por episódio + sugestões criativas
03. SALES_SHARK (GPT-5.1) → viabilidade comercial (acesso/tese/formato/mercado)
04. ANGEL + DEMON (Sonnet) → debate interno arte vs mercado
05. DOCTOR_FINAL (GPT-5.2, fallback GPT-5.3) → score 0-100 + top/bottom + plano de ação
```

**Rubrica:** Acesso 30 + Narrativa 25 + Mercado 25 + Risco 20.

**Notas técnicas importantes:**
- **GPT não escreve arquivo** → `run_agent()` usa `--json` e extrai payload para salvar.
- **Session ID curto:** agora usa **hash estável (shasum 10 chars)** para evitar colisão.
- **Sem HUMAN:** o card final é DOCTOR_FINAL.
- **Placeholders de erro são sincronizados** para o Railway (aparecem no site).

### Ideias (5 etapas)
**Objetivo:** Validação ultra-rápida de conceitos (filtro agressivo)

```
00. DOUGLAS (manual) → salva RAW_IDEA.md (passthrough)
01. PAIN_CHECK (Flash) → valida problema real
02. MARKET_SCAN (Flash) → concorrência, precedentes
03. ANGEL + DEVIL (Sonnet paralelo) → otimista vs crítico
04. VIABILITY (Opus) → score 0-100 (4 critérios: problema 30pts, contexto 25pts, opções 25pts, execução 20pts)
05. DECISION (Human) → Go / No-Go
    ├─► APROVAR (70+) → ideia viável
    ├─► REFINAR (40-69) → precisa ajustes
    └─► REJEITAR (0-39) → arquivar
```

**Custo:** ~$0.08/ideia | **Tempo:** 2-3 min | **Taxa de rejeição:** 60-70% (feature, não bug)

**Score no card (novo):** Node DECISION mostra score + status direto no card visual (além do painel full info)

---

## 🎨 UI/UX (Novidades 2026-02-07)

### Sistema de Revisão Visual v2.0
- Nodes dinâmicos: `REVISAO_1`, `REVISAO_2`, `REVISAO_3`...
- Posicionamento: ao lado do HUMAN, perfeitamente alinhados
- Visual: borda laranja dupla, LED pulsante laranja
- Conexões: linhas laranjas pontilhadas (Human → Revisão)
- Botões: **✓ APROVAR** (substitui original + backup) | **✗ REJEITAR** (move pra `archived/`)

### Ideias: Score no Card
- Node **DECISION (i5)** mostra:
  - Score grande (32px, colorido)
  - Status (APROVAR/REFINAR/REJEITAR)
  - Borda esquerda colorida (verde ≥70, laranja 40-69, vermelho <40)
- Painel full info (double-click):
  - Box destacado no topo com score (48px) + status
  - JSON completo embaixo

### Scheme Atualizado
- **Marketing:** Diagrama detalhado + descrição de cada role
- **Projetos:** Idem (com loop Execution ↔ Director)
- **Ideias:** NOVO (07/02/26) - descrição completa dos 5 roles + filosofia

### Botão Reset Posições
- Visível no canto superior direito (vermelho com borda)
- Texto: **"⟲ RESET POSIÇÕES"**
- Limpa localStorage do modo atual, restaura layout padrão

### Posicionamento Nodes (Ideias)
- **ANGEL_GEN (i3a):** x: -250 (esquerda)
- **DEVIL_GEN (i3b):** x: +250 (direita)
- **Gap:** 180px visível entre eles (ambos em y: 950)

---

## ⚙️ Padrões Que FUNCIONAM (NÃO MUDAR)

### Frontend (public/index.html)

#### Build Timestamp (Cache Busting)
```html
<!-- Build: 2026-02-07T11:17:00-03:00 -->
```
- Forçar invalidação de cache
- Atualizar timestamp em mudanças grandes

#### API_URL
```javascript
const API_URL = '/api';
```
- Endpoints: `${API_URL}/state` expande pra `/api/state`
- **NUNCA** mudar pra `/api/api/state`

#### fileMapping
```javascript
'VIABILITY': ['VIABILITY'],
'ANGEL_GEN': ['ANGEL_GEN', 'ANGLE'],  // Angel, não Angle (corrigido 07/02/26)
'DECISION': ['VIABILITY']  // DECISION mostra resumo do VIABILITY
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
- **Marketing:** ✅ TEM (desde v2.1)
- **Ideias:** ✅ TEM (desde 2026-02-06)
- **Projetos:** ❌ FALTA (TO-DO)

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

#### Brand Guide v8.0 (Marketing)
- **ANTES:** Copywriters escreviam "às cegas" → Brand Guardian validava depois
- **DEPOIS:** `BRAND_GUIDE.md` injetado DIRETO nos 3 copywriters (etapa 5)
- **Resultado:** Copies saem alinhadas, etapa 6 eliminada, -$0.04 por run

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

### 5. "Angel vs Angle? Tanto faz..."
❌ **ANGEL** (anjo), não ANGLE (ângulo). Nomenclatura corrigida 07/02/26.

### 6. "Nodes de loop escondidos? Vou mostrar na UI"
❌ Gabriel pediu pra ESCONDER (`_v2`, `_v3`). Loop funciona no backend, UI limpa.

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

## 🏗️ Infraestrutura & Resiliência (Blindagem 07/02/26)

### Blindagem contra Timeouts e Travamentos
Para garantir que o pipeline seja **100% automático** e nunca fique preso em "limbo", implementamos:
- **`safe_timeout` (Shell-Level):** Todos os processos paralelos (Angel/Devil, Copywriters, Ideation) agora rodam com um timeout de sistema de 300s. Se o agente travar ou o Gateway der timeout, o SO mata o processo, liberando o script pai para o fallback automático.
- **Short ID Protocol (ATUALIZADO 12/02):** `${SHORT_ID}` agora é **hash estável (shasum 10 chars)** do Job ID (não mais "últimos 8 dígitos") para evitar colisões entre sessões.
- **Auto-Trimming:** Função `run_agent` no `pipeline-utils.sh` corta automaticamente IDs que excedam o limite de segurança.

### Disciplina de Output (Roles)
- **Instruções Militares:** Todas as roles de agentes técnicos agora possuem um bloco de instruções críticas no topo.
- **Naming Lock:** Proibição explícita de inventar nomes de arquivos (ex: Sonnet tentando renomear `ANGEL_GEN` para `OPTIONS_GEN`). O agente agora salva **EXATAMENTE** o que o Douglas solicita no prompt.

---

## 🚧 TO-DO (Prioridade)

### 1. Context Summarizer em Projetos (IMPORTANTE)
- Projetos ainda não tem
- Implementar igual Marketing/Ideias
- Reduzir contexto de ~15k → ~5k tokens

### 0. Originais: sync de placeholders (OBRIGATÓRIO)
- Se etapa falhar, **sempre sincronizar o placeholder** para o Railway
- Objetivo: erro aparecer no site (nunca sumir etapa)

### 2. Fallback de Modelo (CRÍTICO)
- Se Flash falhar 3x → Sonnet
- Se Sonnet falhar 3x → GPT
- Garantir que pipeline NUNCA aborta
- **Originais já usa fallback** (Doctor Final: GPT-5.2 → GPT-5.3)

### 3. Event-Driven System (EM PROGRESSO)
- Substituir watcher.js por Socket.IO
- `runner.js` no Mac (dispatch determinístico)
- Catch-up automático ao reconectar
- **Status:** Bloqueado (SIGKILL matando processos bash filhos)

---

## 📞 Contato

Se algo quebrar:
1. Leia este README de novo
2. Confira se seguiu o checklist
3. Se mesmo assim não funcionar, pergunte pro Gabriel

**Regra de Ouro:** Quando em dúvida, NÃO mexe. Pergunta antes.

---

**Última revisão:** 2026-02-12 14:05 GMT-3 (Douglas)
