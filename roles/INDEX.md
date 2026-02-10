# ROLES INDEX - Brick AI War Room
*Atualizado: 06/02/2026 por Douglas (Opus 4.6)*

---

## Pipeline Marketing (run-marketing.sh)

Este é o pipeline principal. Recebe um briefing de marketing e produz copy publicável.

### PRÉ-PIPELINE (Manual):
Douglas processa briefing via OpenClaw session **antes** de executar o script bash. Interpreta, enriquece, decide se vale executar. Salva `{JOB_ID}_PROCESSED.md`.

### PIPELINE AUTOMÁTICO (run-marketing.sh):

| Etapa | Role File | Modelo | O que faz |
|-------|-----------|--------|-----------|
| -- | **Douglas (pré-pipeline)** | **Opus 4.6** | **Processa briefing manualmente via OpenClaw. Interpreta, enriquece, decide executar** |
| 01 | BRIEF_VALIDATOR.md | Flash | Valida se briefing tem objetivo, público, formato e contexto. PASS/FAIL |
| 02 | AUDIENCE_ANALYST.md | Flash | Avalia alinhamento com persona hardcoded + BRAND_GUIDE.md completo |
| 03 | TOPIC_RESEARCHER.md | Flash | Pesquisa dados de mercado, tendências, referências verificáveis |
| 04 | CLAIMS_CHECKER.md | Flash | Filtra hype. Valida se claims têm fonte e fazem sentido |
| 05A | COPYWRITER.md | GPT 5.2 | Copy A -- estilo direto e persuasivo |
| 05B | COPYWRITER.md | Flash | Copy B -- estilo eficiente e data-driven |
| 05C | COPYWRITER.md | Sonnet | Copy C -- estilo narrativo e emocional |
| 06 | COPY_SENIOR.md | GPT 5.2 | Escolhe melhor copy (A/B/C), aplica ajustes, entrega copy_revisada |
| 07 | FILTRO_FINAL.md + BRAND_GUARDIAN.md | Opus | Score 0-100 (5 critérios). >= 80 aprova, < 80 rejeita |
| 08 | (Humano) | -- | Aprovação final. Pode aprovar ou pedir revisão |

### Injeções de contexto (quem recebe o quê):
- **BRAND_GUIDE.md** → Copywriters (etapa 05) + Audience Analyst (etapa 02)
- **BRAND_GUARDIAN.md** → Wall (etapa 07) + Copy Senior fallback (etapa 06)
- Cada etapa recebe o output da etapa anterior como contexto

### Loop automático (Copy Senior ↔ Wall):
- Se Wall rejeita (score < 80), Copy Senior recebe feedback e revisa
- Wall reavalia. Max 3 loops. Arquivos: _v2.json, _v3.json
- Modelo do loop = modelo vencedor original (campo modelo_vencedor)

### Arquivos gerados por job (JOB_ID = timestamp + nome):
```
{JOB_ID}_PROCESSED.md          ← Briefing processado pelo Douglas
{JOB_ID}_01_VALIDATOR.json     ← Resultado da validação
{JOB_ID}_02_AUDIENCE.json      ← Análise de público
{JOB_ID}_03_RESEARCH.json      ← Pesquisa de mercado
{JOB_ID}_04_CLAIMS.json        ← Claims validados
{JOB_ID}_05A_COPY_GPT.md       ← Copy A (GPT)
{JOB_ID}_05B_COPY_FLASH.md     ← Copy B (Flash)
{JOB_ID}_05C_COPY_SONNET.md    ← Copy C (Sonnet)
{JOB_ID}_06_COPY_SENIOR.json   ← Julgamento + copy_revisada
{JOB_ID}_07_WALL.json          ← Score final + breakdown
{JOB_ID}_06_COPY_SENIOR_v2.json ← (se loop) Revisão 2
{JOB_ID}_07_WALL_v2.json        ← (se loop) Reavaliação 2
{JOB_ID}_FINAL.md              ← Copy final consolidada
{JOB_ID}_REVISAO_1.md          ← (se humano pediu revisão)
```

---

## Pipeline Ideias (run-ideias.sh)

Validação rápida de conceitos. Responde: "vale a pena investir nessa ideia?"

| Etapa | Role File | Modelo | O que faz |
|-------|-----------|--------|-----------|
| 00 | (Douglas) | -- | Copia ideia pro WIP |
| 01 | PAIN_CHECK.md | Flash | Valida se a dor é real e tem demanda |
| 02 | MARKET_SCAN.md | Flash | Analisa mercado e concorrência |
| 03a | ANGEL_GEN.md | Sonnet | Angel: defende a ideia com argumentos |
| 03b | DEVIL_GEN.md | Sonnet | Devil: ataca a ideia sem piedade |
| 04 | VIABILITY.md | Opus | Score final GO / NO-GO |
| 05 | (Humano) | -- | Decisão final |

---

## Pipeline Projetos (run-projetos.sh)

Para projetos de clientes. Gera proposta comercial completa.

| Etapa | Role File | Modelo | O que faz |
|-------|-----------|--------|-----------|
| 00 | (Douglas) | -- | Copia briefing pro WIP |
| 01 | BRAND_DIGEST.md | Flash | Extrai DNA/tom/assets da marca do cliente |
| 02a | CREATIVE_IDEATION.md | GPT | Conceito criativo A |
| 02b | CREATIVE_IDEATION.md | Flash | Conceito criativo B |
| 02c | CREATIVE_IDEATION.md | Sonnet | Conceito criativo C |
| 03 | CONCEPT_CRITIC.md | Pro | Avalia e escolhe melhor conceito |
| 04 | EXECUTION_DESIGN.md | Pro | Define direção visual e técnica |
| 05 | PROPOSAL_WRITER.md | GPT | Escreve proposta comercial |
| 06 | DIRECTOR.md | Pro | Avalia execução audiovisual (loop até ≥85) |

---

## Mapa completo de roles/ (25 arquivos → 17 usados)

### Usados pelo Marketing:
| Arquivo | Usado por |
|---------|-----------|
| BRIEF_VALIDATOR.md | Etapa 01 |
| AUDIENCE_ANALYST.md | Etapa 02 |
| TOPIC_RESEARCHER.md | Etapa 03 |
| CLAIMS_CHECKER.md | Etapa 04 |
| COPYWRITER.md | Etapa 05 (A/B/C) |
| BRAND_GUIDE.md | Injetado em 02 + 05 |
| BRAND_GUARDIAN.md | Injetado em 07 + 06 fallback |
| COPY_SENIOR.md | Etapa 06 |
| FILTRO_FINAL.md | Etapa 07 (Wall) |

### Usados pelo Ideias:
| Arquivo | Usado por |
|---------|-----------|
| PAIN_CHECK.md | Etapa 01 |
| MARKET_SCAN.md | Etapa 02 |
| ANGEL_GEN.md | Etapa 03a |
| DEVIL_GEN.md | Etapa 03b |
| VIABILITY.md | Etapa 04 |

### Usados pelo Projetos:
| Arquivo | Usado por |
|---------|-----------|
| BRAND_DIGEST.md | Etapa 01 |
| CREATIVE_IDEATION.md | Etapa 02 (A/B/C) |
| CONCEPT_CRITIC.md | Etapa 03 |
| EXECUTION_DESIGN.md | Etapa 04 |
| PROPOSAL_WRITER.md | Etapa 05 |
| DIRECTOR.md | Etapa 06 |

### NÃO usados por nenhum pipeline:
| Arquivo | Status |
|---------|--------|
| ART_DIRECTOR.md | Extra -- prompts visuais para Imagen 4/Veo 3. Não integrado em nenhum script |
| RESEARCHER.md | Versão antiga do TOPIC_RESEARCHER. Redundante. Candidato a remoção |
| PROJECT_DIRECTOR.md | Carregado por constants.js mas NÃO usado por run-projetos.sh. Peso morto |

---

## Scripts (raiz do projeto)

| Script | O que faz |
|--------|-----------|
| run-marketing.sh | Pipeline Marketing completo (7 etapas + loop + FINAL) |
| run-projetos.sh | Pipeline Projetos (6 etapas) |
| run-ideias.sh | Pipeline Ideias (5 etapas) |
| run-pipeline.sh | Dispatcher: detecta modo e redireciona pro script certo |
| run-orchestrate.sh | Orquestrador: puxa briefing do Railway → roda pipeline → sincroniza |
| run-reloop.sh | Re-loop standalone: reroda só Copy Senior ↔ Wall pra job existente |
| sync-to-railway.sh | Upload de arquivos locais pro Railway (sob demanda) |
| server.js | Backend Railway (API + static + WebSocket) |
| watcher.js | DESCONTINUADO -- antigo polling 24/7. Substituído por run-orchestrate.sh |
| start-robots.sh | DESCONTINUADO -- iniciava watcher + server. Precisa atualização |

## Bibliotecas (lib/)

| Arquivo | O que faz |
|---------|-----------|
| pipeline-utils.sh | Retry com backoff, validação JSON, logging, métricas, placeholders |
| context-summarizer.sh | Resume contexto entre etapas (economia ~40-60% tokens) |

## Configuração (config/ e contracts/)

| Arquivo | O que faz |
|---------|-----------|
| config/constants.js | Custos por modelo, tokens médios, pipeline definitions pra estimativa |
| contracts/schemas.js | Schemas de validação pro output de cada agente (server.js importa) |
