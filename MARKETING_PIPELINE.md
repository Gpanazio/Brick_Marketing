# PIPELINE MARKETING - Como Funciona (Explicação Simples)

*Atualizado: 05/02/2026*

---

## O que é isso?

Um sistema que transforma um **briefing** (pedido de conteúdo) em **copy publicável** (texto pronto pra postar). Passa por 7 robôs que fazem o trabalho de uma equipe de marketing inteira.

---

## O Fluxo (passo a passo)

### 1. Você cria um briefing no site (War Room)
- Acessa https://brickmarketing-production.up.railway.app
- Clica em "New Briefing"
- Escreve o que quer (ex: "Post de LinkedIn sobre lançamento da Brick AI")
- Pode anexar arquivos (PDFs, imagens)

### 2. Railway avisa o Douglas no Telegram
- O site salva o briefing e manda notificação
- Douglas (o bot) recebe e começa a trabalhar

### 3. Douglas roda o pipeline
- Executa `run-orchestrate.sh` que puxa o briefing e dispara o `run-marketing.sh`
- Cada etapa roda um robô diferente (modelo de IA)
- Os resultados vão aparecendo no War Room em tempo real

### 4. Você aprova ou pede revisão
- Quando chega no final, você vê a copy no node HUMAN
- Clica em APROVAR (vai pro OUTPUT) ou REVISAR (pede ajustes)

---

## As 7 Etapas (os robôs)

### ETAPA 0: DOUGLAS (Orchestrator)
**Quem:** Douglas (o bot que mora no Telegram)
**Faz o quê:** Pega o briefing bruto e prepara pra pipeline. Se falta informação (público, objetivo, formato), Douglas inventa baseado no que sabe da Brick AI. Documenta tudo que decidiu no arquivo PROCESSED.md.
**Arquivo gerado:** `{JOB_ID}_PROCESSED.md`

### ETAPA 1: BRIEF VALIDATOR (Gemini Flash)
**Quem:** Robô validador rápido
**Faz o quê:** Checa se o briefing tem o mínimo: objetivo, público, formato, contexto. Se falta algo, lista o que falta. Não bloqueia -- Douglas resolve.
**Arquivo gerado:** `{JOB_ID}_01_VALIDATOR.json`
**Role file:** `roles/BRIEF_VALIDATOR.md`

### ETAPA 2: AUDIENCE ANALYST (Gemini Flash)
**Quem:** Analista de público
**Faz o quê:** Verifica se o briefing faz sentido pra persona da Brick AI (Diretores de Criação, 35-50 anos, agências mid-market). A persona é fixa (hardcoded) -- não inventa persona nova. Também recebe o Brand Guide completo pra avaliar alinhamento.
**Arquivo gerado:** `{JOB_ID}_02_AUDIENCE.json`
**Role file:** `roles/AUDIENCE_ANALYST.md`
**Recebe extra:** `roles/BRAND_GUIDE.md` (injetado no prompt)

### ETAPA 3: TOPIC RESEARCHER (Gemini Flash)
**Quem:** Pesquisador
**Faz o quê:** Busca dados de mercado, tendências, referências e estatísticas relevantes pro tema do briefing. Alimenta os copywriters com munição factual.
**Arquivo gerado:** `{JOB_ID}_03_RESEARCH.json`
**Role file:** `roles/TOPIC_RESEARCHER.md`

### ETAPA 4: CLAIMS CHECKER (Gemini Flash)
**Quem:** Verificador de fatos
**Faz o quê:** Pega tudo que o Researcher trouxe e valida: dados têm fonte? Estatística faz sentido? Não é alucinação? É o filtro anti-hype. Proíbe termos como "revolucionário", "disruptivo".
**Arquivo gerado:** `{JOB_ID}_04_CLAIMS.json`
**Role file:** `roles/CLAIMS_CHECKER.md`

### ETAPA 5: COPYWRITERS x3 (em paralelo!)
**Quem:** Três escritores com personalidades diferentes
**Faz o quê:** Cada um escreve uma versão da copy (Curto + Médio + Storytelling + CTA). Rodam ao mesmo tempo pra economizar tempo. Todos recebem o Brand Guide completo.

| Copy | Modelo | Estilo |
|------|--------|--------|
| A | GPT 5.2 | Direto e persuasivo |
| B | Gemini Flash | Eficiente e data-driven |
| C | Claude Sonnet | Narrativo e emocional |

**Arquivos gerados:** `{JOB_ID}_05A_COPY_GPT.md`, `{JOB_ID}_05B_COPY_FLASH.md`, `{JOB_ID}_05C_COPY_SONNET.md`
**Role file:** `roles/COPYWRITER.md` (mesmo role, 3 modelos diferentes)
**Recebe extra:** `roles/BRAND_GUIDE.md` (injetado no prompt)

### ETAPA 6: COPY SENIOR (GPT 5.2)
**Quem:** Diretor de Criação Sênior
**Faz o quê:** Lê as 3 copies, escolhe a melhor (vencedor A, B ou C), e FAZ os ajustes necessários. Não sugere -- executa. Entrega a `copy_revisada` final pronta.
**Importante:** O campo `modelo_vencedor` (gpt, flash ou sonnet) é usado depois no loop e nas revisões.
**Arquivo gerado:** `{JOB_ID}_06_COPY_SENIOR.json`
**Role file:** `roles/COPY_SENIOR.md`

### ETAPA 7: WALL (Claude Opus)
**Quem:** O portão final -- último filtro antes do humano
**Faz o quê:** Dá nota de 0 a 100 pra copy usando 5 critérios:

| Critério | Pontos | O que avalia |
|----------|--------|-------------|
| Clareza da Oferta | 25 | Dá pra entender o que vendemos? |
| Dor Real | 20 | Toca numa dor verdadeira do público? |
| Credibilidade | 20 | Claims sustentados por fatos? |
| On-Brand | 20 | Segue a voz da Brick AI? (usa BRAND_GUARDIAN.md) |
| CTA Específico | 15 | Próximo passo é claro? |

**Se score >= 80:** APROVADO -- segue pro Humano
**Se score < 80:** REJEITADO -- volta pro Copy Senior com feedback (loop automático, max 3x)

**Arquivo gerado:** `{JOB_ID}_07_WALL.json`
**Role file:** `roles/FILTRO_FINAL.md`
**Recebe extra:** `roles/BRAND_GUARDIAN.md` (injetado no prompt)

### ETAPA 8: HUMAN (Você!)
**Quem:** Gabriel (ou quem tiver acesso ao War Room)
**Faz o quê:** Lê a copy final e decide:
- **APROVAR** → Copy vai pro OUTPUT (publicável)
- **REVISAR** → Escreve feedback → Modelo campeão gera REVISÃO_1.md → Aparece como card laranja no War Room → Você aprova ou rejeita → Loop até ficar bom

**Arquivo gerado:** `{JOB_ID}_FINAL.md` (consolidado com copy + alterações + Wall JSON)

---

## O Loop Automático (Copy Senior ↔ Wall)

Quando o Wall reprova (score < 80), acontece automaticamente:

1. Copy Senior recebe o feedback detalhado do Wall (o que errou, quantos pontos perdeu)
2. Copy Senior revisa a copy com base no feedback
3. Wall avalia de novo
4. Se ainda < 80, repete (max 3 vezes)
5. Arquivos versionados: `_v2.json`, `_v3.json`

O modelo usado no loop é o **modelo vencedor** da etapa 6 (campo `modelo_vencedor`). Se Sonnet ganhou, Sonnet revisa.

---

## Referências de Marca (os guardiões)

Dois arquivos controlam a identidade da Brick AI:

### BRAND_GUIDE.md ("Vision over Prompt")
- **Tom:** "The Cold Director" -- seco, preciso, autoritário
- **Proibido:** Emojis, corporativês, "prompt", "revolucionário", "disruptivo"
- **Vocabulário:** "Domínio da Linguagem", "Direção Técnica", "Motor de Visão"
- **Quem recebe:** Copywriters (etapa 5) + Audience Analyst (etapa 2)

### BRAND_GUARDIAN.md
- **Checklist:** Tom de voz, terminologia oficial, red flags, consistência
- **Validação:** Soa como diretor de cinema? Evita corporativês? Diferencia de concorrentes?
- **Quem recebe:** Wall (etapa 7) + Copy Senior fallback (etapa 6)

---

## Arquivos do Projeto (só Marketing)

### Scripts que rodam:
```
run-marketing.sh      ← Pipeline completo (7 etapas + loop + FINAL)
run-orchestrate.sh    ← Orquestrador: puxa do Railway → roda pipeline → sincroniza
run-reloop.sh         ← Re-loop: só Copy Senior ↔ Wall pra job existente
run-pipeline.sh       ← Dispatcher: detecta modo e redireciona
sync-to-railway.sh    ← Upload de arquivos pro Railway (sob demanda)
```

### Roles usados pelo Marketing:
```
roles/BRIEF_VALIDATOR.md     ← Etapa 1
roles/AUDIENCE_ANALYST.md    ← Etapa 2 (persona hardcoded + Brand Guide)
roles/TOPIC_RESEARCHER.md    ← Etapa 3
roles/CLAIMS_CHECKER.md      ← Etapa 4
roles/COPYWRITER.md          ← Etapa 5 (A/B/C, 3 modelos)
roles/COPY_SENIOR.md         ← Etapa 6
roles/FILTRO_FINAL.md        ← Etapa 7 (Wall)
roles/BRAND_GUIDE.md         ← Injetado em etapas 2 e 5
roles/BRAND_GUARDIAN.md      ← Injetado em etapas 6 (fallback) e 7
```

### Onde ficam os resultados:
```
history/marketing/briefing/   ← Briefings recebidos (input)
history/marketing/wip/        ← Em processamento (todos os arquivos do pipeline)
history/marketing/wip/logs/   ← Logs de cada agente
history/marketing/done/       ← Projetos aprovados
history/marketing/failed/     ← Projetos que falharam
history/marketing/feedback/   ← Feedback humano
```

### Configuração:
```
config/constants.js     ← Custos, thresholds (Wall=80), tokens médios
contracts/schemas.js    ← Schemas de validação dos outputs
```

---

## Custos (estimativa por run)

| Etapa | Modelo | Custo aprox. |
|-------|--------|-------------|
| 1-4 | Flash (x4) | ~$0.01 |
| 5 | GPT + Flash + Sonnet | ~$0.05 |
| 6 | GPT 5.2 | ~$0.04 |
| 7 | Opus | ~$0.45 |
| **Total** | | **~$0.55** |

Opus domina o custo (~85% do total) por causa do input pesado (12k tokens de contexto acumulado).

---

## Como testar

1. Acesse o War Room: https://brickmarketing-production.up.railway.app
2. Clique em "New Briefing" no Marketing
3. Escreva algo (ex: "Post de LinkedIn sobre produção de vídeo com IA")
4. Avise o Douglas no Telegram
5. Douglas roda o pipeline e os nodes vão acendendo no War Room
6. Quando chegar no HUMAN, clique no node pra ver a copy
7. Aprove ou peça revisão

---

---

## Como o Douglas orquestra (a lógica do bot)

Douglas é um agente OpenClaw (Claude Opus) que roda no Mac do Gabriel. Ele é o cérebro que conecta tudo.

### Fluxo de orquestração

```
[Usuário cria briefing no War Room]
         │
         ▼
[Railway salva briefing + notifica Telegram]
         │
         ▼
[Gabriel vê notificação e avisa Douglas: "chegou briefing"]
         │
         ▼
[Douglas roda: ./run-orchestrate.sh marketing]
         │
         ├─► 1. Health check no Railway (GET /api/health)
         ├─► 2. Busca briefings pendentes (GET /api/pending?mode=marketing)
         ├─► 3. Baixa conteúdo do briefing (GET /api/file)
         ├─► 4. Salva local em history/marketing/briefing/
         ├─► 5. Roda run-marketing.sh (pipeline completo)
         │       └─► Cada etapa usa: openclaw agent --agent <modelo>
         │           Os agentes (flash, gpt, sonnet, opus) estão
         │           configurados no openclaw.json com modelos específicos
         ├─► 6. Sincroniza resultados (./sync-to-railway.sh --all marketing)
         │       └─► POST /api/result para cada arquivo gerado
         ├─► 7. Limpa briefing processado (POST /api/briefing/clear)
         └─► 8. Avisa Gabriel no Telegram que terminou
```

### Agentes OpenClaw usados pelo pipeline

Os scripts chamam `openclaw agent --agent <id>` de forma síncrona. Cada agent tem modelo fixo:

| Agent ID | Modelo | Usado nas etapas |
|----------|--------|------------------|
| flash | Gemini 3 Flash Preview | 1 (Validator), 2 (Audience), 3 (Research), 4 (Claims), 5B (Copy B) |
| gpt | GPT 5.2 Codex | 5A (Copy A), 6 (Copy Senior) |
| sonnet | Claude Sonnet 4.5 | 5C (Copy C) |
| opus | Claude Opus 4.6 | 7 (Wall) |

Cada chamada cria uma sessão isolada (`--session-id "brick-mkt-{JOB_ID}-{etapa}"`) pra não poluir o contexto entre etapas.

### O que NÃO roda em background

- **Sem watcher** -- Não tem polling. Nada roda 24/7.
- **Sem cron** -- Não tem job agendado pra verificar briefings.
- **Event-driven** -- Tudo começa quando Gabriel avisa no Telegram.
- **Sync sob demanda** -- Arquivos só vão pro Railway quando Douglas manda (sync-to-railway.sh).

### Onde Douglas guarda memória

Douglas é um agente com amnésia -- acorda fresco toda sessão. Pra lembrar do War Room:
- `~/.openclaw/workspace/MEMORY.md` -- Memória de longo prazo (arquitetura, decisões, lições)
- `~/.openclaw/workspace/memory/YYYY-MM-DD.md` -- Notas diárias
- Este documento (`MARKETING_PIPELINE.md`) -- Referência técnica

### Como re-rodar algo que falhou

Se uma etapa falhou ou você quer reprocessar:

```bash
# Re-rodar só o loop Copy Senior ↔ Wall
./run-reloop.sh <JOB_ID>

# Re-rodar pipeline inteiro
./run-marketing.sh history/marketing/briefing/<briefing>.md

# Sincronizar manualmente pro Railway
./sync-to-railway.sh --all marketing

# Sincronizar um arquivo específico
./sync-to-railway.sh history/marketing/wip/<arquivo> marketing
```

---

*Se algo não funciona: verifique se o Railway está online (`/api/health`) e se os agentes do OpenClaw estão configurados (`openclaw status`).*
