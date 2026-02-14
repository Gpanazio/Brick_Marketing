# Brick AI — War Room

Sistema de pipelines autônomos para **Marketing**, **Projetos** e **Ideias**.

**Status atual (2026-02-14):**
- Pipeline principal roda em **Node.js** (`server.js` + `lib/pipeline-runner.js`)
- Execução por etapa via **API de modelos** (OpenRouter/Google), sem `openclaw agent`
- **Modelos free removidos** do fluxo principal

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
    - `GET /api/models` → modelos disponíveis/configurados
    - `GET /api/openrouter-test` → teste de conectividade
- `lib/pipeline-runner.js`
  - Orquestra etapas por modo
  - Resolve modelo por `stage` (primary + fallback)
  - Emite progresso por Socket.IO (`pipeline:progress`)

### Clients de modelo
- `lib/openrouter-client.js`
- `lib/google-ai-client.js`

### Frontend
- `public/index.html`
  - Telemetria em tempo real
  - Mapa visual dos pipelines
  - Painéis por etapa

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

## Como cada etapa “sabe o que fazer”

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
6. COPY_SENIOR
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
2. IDEATION x3
3. CONCEPT_CRITIC
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

---

## Checklist antes de push

- [ ] Testei local
- [ ] Validei sintaxe (`node --check`)
- [ ] Validei que não voltou `free` sem querer
- [ ] Conferi telemetria no frontend

---

## Nota de legado

Ainda existem scripts bash legados (`run-*.sh`) para histórico/compatibilidade, mas o caminho oficial atual é o pipeline autônomo Node (`/api/run-autonomous` + `pipeline-runner`).

---

**Última revisão:** 2026-02-14 (atualizado para estado real do pipeline)
