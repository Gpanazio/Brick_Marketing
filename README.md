# Brick AI — War Room

Sistema de pipelines autônomos para **Marketing**, **Projetos** e **Ideias**.

**Status atual (2026-02-15):**
- Pipeline principal roda em **Node.js** (`server.js` + `lib/pipeline-runner.js`)
- Execução por etapa via **API de modelos** (OpenRouter/Google), sem `openclaw agent`
- **PostgreSQL** integrado para persistência (dual-write: filesystem + DB)
- **Ranking de modelos** (A×B×C leaderboard) disponível em `/ranking.html`

---

## URLs

- Produção: https://war.brick.mov
- Railway: https://brickmarketing-production.up.railway.app
- Repositório: https://github.com/Gpanazio/Brick_Marketing

---

## Arquitetura atual (verdade do projeto)

### Backend
- `server.js`
  - Endpoints principais:
    - `POST /api/run-autonomous` → dispara pipeline em background
    - `GET /api/pipeline-status` → status de jobs ativos
    - `GET /api/state` → estado do sistema (briefing/wip/done/failed)
    - `GET /api/archived` → projetos arquivados
    - `GET /api/ranking` → ranking A×B×C dos modelos
    - `POST /api/archive` / `POST /api/restore` → arquivar/restaurar projetos
    - `DELETE /api/project/:jobId` → deletar projeto (soft delete no DB)
    - `GET /api/models` → modelos disponíveis/configurados
- `lib/pipeline-runner.js`
  - Orquestra etapas por modo
  - Resolve modelo por `stage` (primary + fallback)
  - Emite progresso por Socket.IO (`pipeline:progress`)

### Database (PostgreSQL)
- `server/helpers/db.js` — Connection pool + schema auto-migration
- Tabelas:
  - `projects` — Projetos com soft delete (`deleted_at`) e archive (`archived_at`)
  - `pipeline_files` — Arquivos gerados pelas pipelines (status: briefing/wip/done/failed/archived)
  - `feedbacks` — Feedbacks e revisões
  - `cost_reports` — Relatórios de custo por execução
- Estratégia: **dual-write** (filesystem + DB) para backward compatibility

### Routes (modularizadas)
| Arquivo | Responsabilidade |
|---|---|
| `server/routes/state.js` | Estado do sistema, projetos arquivados |
| `server/routes/briefings.js` | Criação/limpeza de briefings |
| `server/routes/files.js` | Submit, archive, restore de arquivos |
| `server/routes/feedback.js` | Feedback do usuário, aprovação |
| `server/routes/revisions.js` | Aprovação/rejeição de revisões |
| `server/routes/costs.js` | Custos e estimativas |
| `server/routes/projects.js` | Delete, fail, retry, rerun de projetos |
| `server/routes/ranking.js` | Ranking A×B×C dos modelos |
| `server/routes/pipeline.js` | Execução de pipelines |
| `server/routes/health.js` | Health check e métricas |

### Clients de modelo
- `lib/openrouter-client.js`
- `lib/google-ai-client.js`

### Frontend
- `public/index.html`
  - Lobby com cards de projeto (ativo, aprovado, arquivado)
  - Ações: Arquivar, Deletar, Restaurar (com modais de confirmação)
  - Telemetria em tempo real
  - Mapa visual dos pipelines
- `public/ranking.html`
  - Leaderboard A×B×C com barras animadas
  - Histórico de batalhas por pipeline

---

## Database

### Setup
- PostgreSQL hospedado no **Railway**
- Variável de ambiente: `DATABASE_PUBLIC_URL` (ou `DATABASE_URL` como fallback)
- Schema criado automaticamente no startup via `initDb()`
- Se o DB não estiver disponível, o sistema funciona normalmente via filesystem

### Tabelas
```sql
projects          (id, job_id, mode, status, title, created_at, updated_at, deleted_at, archived_at)
pipeline_files    (id, job_id, mode, filename, content, status, model, created_at, updated_at)
feedbacks         (id, job_id, mode, feedback_text, status, created_at)
cost_reports      (id, job_id, mode, report_data, created_at)
```

---

## Estado de modelos (importante)

### OpenClaw config
- Sem fallbacks globais
- Sem aliases `:free`
- Sem `openrouter/free` no provider list

### War Room (pipeline autônomo)
- Defaults e rotas ajustadas para não usar `free/free:free`
- Se um modelo aparecer como `free` na UI, é bug de cache/telemetria antiga

---

## Como cada etapa "sabe o que fazer"

Cada chamada usa:
1. **System prompt**: conteúdo do role file (`roles/*.md`)
2. **User prompt**: tarefa concreta montada no runtime com briefing + outputs anteriores
3. **Contrato de saída**: JSON/Markdown conforme etapa

No `pipeline-runner`, a função `callWithRetry(...)` aplica:
- modelo **primary** por stage
- fallback na última tentativa (se existir)
- retry com backoff

---

## Modo Marketing (atual)

Fluxo:
1. VALIDATOR
2. AUDIENCE
3. RESEARCH
4. CLAIMS
5. COPY A/B/C (paralelo)
6. COPY_SENIOR → seleciona vencedor (A/B/C)
7. WALL
8. FINAL

### Referências de marca (implementação atual)
- `BRAND_GUIDE.md`:
  - Injetado em **AUDIENCE**
  - Injetado no contexto dos **COPYWRITERs**
- `BRAND_GUARDIAN.md`:
  - Injetado no **WALL**
  - Injetado no **COPY_SENIOR** (incluindo loop de revisão)

---

## Modo Projetos

Fluxo principal:
1. BRAND_DIGEST
2. IDEATION x3 → 3 conceitos (A/B/C)
3. CONCEPT_CRITIC → seleciona vencedor
4. EXECUTION_DESIGN
5. PROPOSAL
6. DIRECTOR

Observação: `BRAND_DIGEST` pertence a **Projetos**, não ao Marketing.

---

## Modo Ideias

Fluxo principal:
1. PAIN_CHECK
2. MARKET_SCAN
3. ANGEL + DEVIL
4. VIABILITY
5. DECISION

Ajuste recente:
- `MARKET_SCAN` com **primary = Gemini Flash** (web-capable), fallback DeepSeek.

---

## Comandos úteis

No diretório do projeto:

```bash
npm start
npm test    # smoke tests da API
```

Checks rápidos:

```bash
node --check server.js
node --check lib/pipeline-runner.js
node --check lib/openrouter-client.js
```

Busca de regressão para modelos free:

```bash
rg -n "openrouter/free|:free" lib server.js public/index.html
```

---

## Deploy

Fluxo:
1. Commit + push em `main`
2. Railway build/deploy automático
3. Esperar 1–3 min
4. Hard refresh no browser

### Variáveis de ambiente necessárias
- `DATABASE_PUBLIC_URL` — PostgreSQL connection string
- `PORT` — Porta do servidor
- `API_KEY` — Chave de API para operações de escrita
- `OPENROUTER_API_KEY` — Chave para chamadas de modelo

---

## Checklist antes de push

- [ ] Testei local
- [ ] Validei sintaxe (`node --check`)
- [ ] Validei que não voltou `free` sem querer
- [ ] Conferi telemetria no frontend
- [ ] Testei endpoints novos (archive, delete, ranking)

---

## Nota de legado

Ainda existem scripts bash legados (`run-*.sh`) para histórico/compatibilidade, mas o caminho oficial atual é o pipeline autônomo Node (`/api/run-autonomous` + `pipeline-runner`).

---

**Última revisão:** 2026-02-15 (DB integrado, ranking A×B×C, archive/delete frontend)
