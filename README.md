# BRICK AI WAR ROOM

Sistema de orquestração de agentes de IA para criação de conteúdo, projetos e validação de ideias.

**URL:** https://brickmarketing-production.up.railway.app
**Repo:** https://github.com/Gpanazio/Brick_Marketing

---

## O que é isso?

Um sistema que transforma um **briefing** (pedido de conteúdo) em **copy publicável** (texto pronto pra postar). Passa por 7 robôs (modelos de IA) que fazem o trabalho de uma equipe de marketing inteira. Tudo visual, em tempo real, no War Room.

---

## Como funciona (fluxo geral)

1. Você cria um briefing no site (War Room)
2. Railway avisa o Douglas no Telegram
3. Douglas puxa o briefing e roda o pipeline (`run-orchestrate.sh`)
4. Cada etapa roda um modelo de IA diferente, resultados aparecem no War Room em tempo real
5. Quando chega no final, você aprova ou pede revisão

---

## Pipeline Marketing (o principal)

### PRÉ-PIPELINE: Douglas (Manual)

**Antes do pipeline automático rodar:**
1. Douglas recebe notificação do Railway (novo briefing)
2. Lê e interpreta o briefing via OpenClaw session
3. Preenche gaps, baixa anexos, adiciona contexto da Brick AI
4. Salva `{JOB_ID}_PROCESSED.md` enriquecido
5. Executa `./run-marketing.sh {JOB_ID}_PROCESSED.md`

**Modelo:** Opus 4.6 (raciocínio crítico + decisões estratégicas)

---

### As 7 Etapas (Pipeline Automático)

```
BRIEFING (input do usuário)
│
▼
[DOUGLAS] ─── Processamento manual via OpenClaw
│             (interpreta, enriquece, decide executar)
▼
PROCESSED.md ─── Briefing enriquecido
│
▼
01. BRIEF VALIDATOR (Flash) ── Valida completude, identifica lacunas
│
▼
02. AUDIENCE ANALYST (Flash) ─ Analisa persona + alinhamento com Brand Guide
│
▼
03. TOPIC RESEARCHER (Flash) ─ Pesquisa dados, tendências, referências
│
▼
04. CLAIMS CHECKER (Flash) ── Filtra hype, valida claims verificáveis
│
├──────────────┬──────────────┐
▼              ▼              ▼
COPY A         COPY B         COPY C
GPT-5.2        FLASH          SONNET
(Direto)       (Data)         (Narrativo)
├──────────────┴──────────────┘
▼
06. COPY SENIOR (GPT 5.2) ─── Escolhe melhor, aplica ajustes, entrega copy_revisada
│
▼
07. WALL (Opus + Brand Guardian) ─── Score 0-100 (rubrica 5 critérios)
│
├─► (score < 80) → LOOP: Copy Senior revisa com feedback do Wall (max 3x)
│
▼ (score ≥ 80)
08. HUMAN ─── Aprovação final → OUTPUT
```

### O que cada etapa faz

| Etapa | Modelo | O que faz | Role File |
|-------|--------|-----------|-----------|
| -- | **Douglas (manual)** | **Pré-processa briefing via OpenClaw. Interpreta, enriquece, decide executar** | **OpenClaw Opus 4.6** |
| 01. Validator | Flash | Checa se briefing tem objetivo, público, formato, contexto | `BRIEF_VALIDATOR.md` |
| 02. Audience | Flash | Avalia alinhamento com persona da Brick + Brand Guide completo | `AUDIENCE_ANALYST.md` |
| 03. Researcher | Flash | Busca dados de mercado, tendências, referências verificáveis | `TOPIC_RESEARCHER.md` |
| 04. Claims | Flash | Filtra hype, valida se claims têm fonte e fazem sentido | `CLAIMS_CHECKER.md` |
| 05. Copywriters | GPT/Flash/Sonnet | 3 versões paralelas: direto, data-driven, narrativo. Com Brand Guide | `COPYWRITER.md` |
| 06. Copy Senior | GPT 5.2 | Escolhe melhor copy, FAZ os ajustes, entrega `copy_revisada` | `COPY_SENIOR.md` |
| 07. Wall | Opus | Score 0-100 (5 critérios). ≥80 aprova, <80 rejeita com feedback | `FILTRO_FINAL.md` + `BRAND_GUARDIAN.md` |
| 08. Human | Você | Aprova → OUTPUT. Ou pede revisão → modelo campeão gera REVISÃO_N | -- |

### Rubrica do Wall (5 critérios, 100 pontos)

| Critério | Pontos | O que avalia |
|----------|--------|-------------|
| Clareza da Oferta | 25 | Dá pra entender o que vendemos? |
| Dor Real | 20 | Toca numa dor verdadeira do público? |
| Credibilidade | 20 | Claims sustentados por fatos? |
| On-Brand | 20 | Segue a voz da Brick AI? (usa BRAND_GUARDIAN.md) |
| CTA Específico | 15 | Próximo passo é claro e factível? |

### Loop automático (Copy Senior ↔ Wall)

Quando Wall reprova (score < 80):
1. Copy Senior recebe feedback detalhado do Wall
2. Revisa a copy usando o **modelo vencedor** da rodada original
3. Wall reavalia. Max 3 loops. Arquivos: `_v2.json`, `_v3.json`

### Referências de marca

| Arquivo | O que é | Quem recebe |
|---------|---------|-------------|
| `BRAND_GUIDE.md` | Tom, vocabulário, proibições ("Vision over Prompt") | Copywriters + Audience Analyst |
| `BRAND_GUARDIAN.md` | Checklist de tom, terminologia, red flags | Wall + Copy Senior (fallback) |

### Economia de tokens (Context-Summarizer)

**Integrado v2.1:** O pipeline agora resume contexto automaticamente entre etapas críticas.

| Ponto de Resumo | Antes | Depois | Economia |
|-----------------|-------|--------|----------|
| Etapa 5 (Copywriters) | ~12k tokens | ~4k tokens | 66% |
| Etapa 6 (Copy Senior) | ~8k tokens | ~3k tokens | 62% |
| Etapa 7 (Wall/Opus) | ~10k tokens | ~2k tokens | 80% |

**Impacto:** Economia de ~40-50% no custo total por run.

### Custo por run (~$0.30)

| Etapa | Modelo | Custo (v2.0) | Custo (v2.1) |
|-------|--------|--------------|--------------|
| 1-4 | Flash (x4) | ~$0.01 | ~$0.01 |
| 5 | GPT + Flash + Sonnet | ~$0.05 | ~$0.03 |
| 6 | GPT 5.2 | ~$0.04 | ~$0.02 |
| 7 | Opus | ~$0.45 | ~$0.24 |
| **TOTAL** | -- | **~$0.55** | **~$0.30** |

**Maior impacto:** Opus (etapa 7) reduziu de $0.45 → $0.24 (~47% economia).

---

## Pipeline Projetos

Para projetos de clientes. Gera proposta comercial completa.

```
BRIEFING → DOUGLAS → BRAND DIGEST (Flash) → 3x IDEATION (GPT/Flash/Sonnet)
→ CONCEPT CRITIC (Pro) → EXECUTION DESIGN (Pro) → PROPOSAL WRITER (GPT)
→ DIRECTOR (Pro, loop até ≥85) → HUMAN
```

*Detalhes em `roles/INDEX.md`*

## Pipeline Ideias

Validação rápida de conceitos. "Vale a pena investir nessa ideia?"

```
RAW IDEA → DOUGLAS → PAIN CHECK (Flash) → MARKET SCAN (Flash)
→ ANGEL vs DEVIL (Sonnet, paralelo) → VIABILITY (Opus) → DECISÃO HUMANA
```

*Detalhes em `roles/INDEX.md`*

---

## Estrutura de pastas

```
Brick_Marketing/
├── public/index.html          # Frontend (War Room visual)
├── server.js                  # Backend Railway (API + WebSocket)
├── run-marketing.sh           # Pipeline Marketing (7 etapas + loop)
├── run-projetos.sh            # Pipeline Projetos (6 etapas)
├── run-ideias.sh              # Pipeline Ideias (5 etapas)
├── run-pipeline.sh            # Dispatcher (detecta modo, redireciona)
├── run-orchestrate.sh         # Orquestrador (puxa → roda → sincroniza)
├── run-reloop.sh              # Re-loop standalone (Copy Senior ↔ Wall)
├── sync-to-railway.sh         # Upload de arquivos pro Railway
├── watcher.js                 # DESCONTINUADO (era polling 24/7)
├── roles/                     # Role files (prompts de cada agente)
│   ├── INDEX.md               # Mapa completo de todos os roles
│   ├── BRAND_GUIDE.md         # Identidade da Brick AI v8.0
│   ├── BRAND_GUARDIAN.md      # Checklist de consistência de marca
│   ├── BRIEF_VALIDATOR.md     # Etapa 1
│   ├── AUDIENCE_ANALYST.md    # Etapa 2
│   ├── TOPIC_RESEARCHER.md    # Etapa 3
│   ├── CLAIMS_CHECKER.md      # Etapa 4
│   ├── COPYWRITER.md          # Etapa 5 (3 modelos)
│   ├── COPY_SENIOR.md         # Etapa 6
│   ├── FILTRO_FINAL.md        # Etapa 7 (Wall)
│   └── ...                    # + roles de Projetos e Ideias
├── lib/
│   ├── pipeline-utils.sh      # Retry, validação JSON, logging
│   └── context-summarizer.sh  # 🆕 Resumo de contexto entre etapas (economia ~50% tokens)
├── config/
│   └── constants.js           # Custos, thresholds, tokens médios
├── contracts/
│   └── schemas.js             # Schemas de validação dos outputs
├── history/
│   ├── marketing/
│   │   ├── briefing/          # Briefings recebidos
│   │   ├── wip/               # Em processamento
│   │   ├── wip/logs/          # Logs de cada agente
│   │   ├── done/              # Aprovados
│   │   ├── failed/            # Falharam
│   │   └── feedback/          # Feedback humano
│   ├── projetos/              # Mesma estrutura
│   └── ideias/                # Mesma estrutura
└── MARKETING_PIPELINE.md      # Documentação detalhada do pipeline
```

---

## Context-Summarizer (Economia de Tokens)

**Arquivo:** `lib/context-summarizer.sh`

### O que faz
Em vez de passar **todo** o output de cada etapa para a próxima (o que infla tokens exponencialmente), o context-summarizer extrai apenas as informações essenciais e cria um resumo estruturado.

### Pontos de aplicação (run-marketing.sh)
| Etapa | O que resume | Tokens antes | Tokens depois | Economia |
|-------|--------------|--------------|---------------|----------|
| **05 → Copywriters** | Validator + Audience + Research + Claims (JSONs completos) | ~12k | ~4k | **66%** |
| **06 → Copy Senior** | 3 copies completas (3x ~1.5k chars) | ~8k | ~3k | **62%** |
| **07 → Wall (Opus)** | Copy Senior JSON completo + contexto | ~10k | ~2k | **80%** |

### Funções principais
- `create_marketing_context()` → Resumo estruturado do pipeline Marketing
- `summarize_briefing()` → Trunca briefing mantendo essência (300-500 chars)
- `summarize_json()` → Extrai apenas campos críticos de JSONs

### Por que funciona
- Modelos não precisam do contexto **completo** pra fazer seu trabalho
- Copywriters só precisam saber **o que importa** (persona, dores, claims), não cada vírgula do JSON
- Wall (Opus) só precisa julgar **a copy final**, não as 3 versões originais

### Estimativa de economia
**Antes (v2.0):** ~$0.55/run → Opus queimava $0.45 sozinho
**Depois (v2.1):** ~$0.30/run → Opus agora custa $0.24

**Total economizado:** ~45% por run (~$15/mês com 50 runs)

---

## Infraestrutura

- **Frontend:** HTML5 + Tailwind + vanilla JS (sem framework)
- **Backend:** Node.js (Express + Socket.IO)
- **Deploy:** Railway (auto-deploy via Git push)
- **Agentes:** OpenClaw (`openclaw agent --agent flash/gpt/sonnet/opus`)
- **Orquestração:** Bash scripts + OpenClaw CLI (síncrono)
- **Notificações:** Railway → Telegram (webhook) + OpenClaw Wake API

---

## Como rodar localmente

```bash
# Instalar dependências
npm install

# Iniciar server (porta 3000)
node server.js

# Rodar pipeline manualmente
./run-marketing.sh history/marketing/briefing/meu_briefing.md

# Rodar via orquestrador (puxa do Railway)
RAILWAY_URL=https://brickmarketing-production.up.railway.app ./run-orchestrate.sh marketing

# Re-loop um job existente
./run-reloop.sh 1770317032000_fran_2_lancamento_ia

# Sync resultados pro Railway
./sync-to-railway.sh --all marketing
```

---

## Sistema de Revisão (v2.0)

**Feedback Humano → Modelo Campeão:**

Quando você clica em **REVISAR** no node HUMAN:
1. Modal abre pedindo feedback
2. Backend identifica qual modelo ganhou o round (via Concept Critic ou Copy Senior)
3. Chama esse modelo com o feedback + contexto original
4. Gera `REVISAO_1.md` (ou 2, 3...)
5. Node laranja aparece ao lado do HUMAN com linha pontilhada
6. Botões: **✓ APROVAR** (substitui arquivo original) ou **✗ REJEITAR** (arquiva)

**Visual:**
- Nó laranja com LED pulsante
- Linha pontilhada conectando HUMAN → REVISÃO
- Alinhamento perfeito (mesma altura)
- Suporta múltiplas revisões (REVISAO_1, REVISAO_2...)

---

## Decisões de Design (UI)

**O que aparece no gráfico:**
- ✅ Pipeline principal (00-08 Marketing, 00-06 Projetos)
- ✅ Nós de REVISÃO humana (REVISAO_N)
- ❌ Nós de loop automático (Copy Senior v2/v3, Wall v2/v3) - **ESCONDIDOS**

**Por quê esconder o loop?**
- Deixa UI mais limpa (foco no resultado final)
- Loop é detalhe técnico, não valor pro usuário
- Backend continua rodando loop normalmente
- Histórico preservado nos arquivos `_v2.json`, `_v3.json`

---

*Atualizado: 06/02/2026*
*Changelog: `CHANGELOG.md`*
*Documentação Marketing: `MARKETING_PIPELINE.md`*
*Mapa de roles: `roles/INDEX.md`*
