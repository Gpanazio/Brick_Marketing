# War Room — Arquitetura Atual

Atualizado: 2026-02-14

## Visão geral

War Room é um orquestrador de pipelines de conteúdo com execução **autônoma em Node.js**.

Modos:
- **marketing** (conteúdo interno Brick)
- **projetos** (propostas para clientes)
- **ideias** (validação rápida)
- **originais** (auditoria criativa/comercial)

## Fluxo principal

```txt
[Frontend]
  -> POST /api/run-autonomous
  -> server.js dispara handlePipelineRun(...)
  -> lib/pipeline-runner.js executa etapas por modo
  -> salva arquivos em history/{mode}/wip
  -> emite progresso Socket.IO (pipeline:progress)
  -> frontend atualiza telemetria/nodes em tempo real
```

## Componentes

- `server.js`
  - API REST + Socket.IO
  - dispara jobs em background
  - mantém status em memória (`activePipelines`)

- `lib/pipeline-runner.js`
  - pipeline por modo
  - roteamento de modelo por stage (primary/fallback)
  - retry/backoff + validação de JSON

- `lib/openrouter-client.js`
- `lib/google-ai-client.js`
  - wrappers para chamadas de modelo

- `public/index.html`
  - dashboard visual + telemetria

## Roteamento de modelos

A função `callWithRetry(systemPrompt, userPrompt, { stage, expectJSON })` resolve:
1. modelo primário por etapa (`*_MODELS`)
2. fallback na última tentativa
3. retries com backoff

Não existe mais execução por `openclaw agent` no pipeline principal.

## Pipelines

### Marketing

```txt
VALIDATOR -> AUDIENCE -> RESEARCH -> CLAIMS -> COPY_A/B/C -> COPY_SENIOR -> WALL -> FINAL
```

Referências de marca:
- `BRAND_GUIDE.md` -> AUDIENCE + COPYWRITERs
- `BRAND_GUARDIAN.md` -> WALL + COPY_SENIOR (incluindo loop de revisão)

### Projetos

```txt
BRAND_DIGEST -> IDEATION_A/B/C -> CONCEPT_CRITIC -> EXECUTION_DESIGN -> PROPOSAL -> DIRECTOR
```

### Ideias

```txt
PAIN_CHECK -> MARKET_SCAN -> ANGEL + DEVIL -> VIABILITY -> DECISION
```

### Originais

```txt
TRIAGE -> CREATIVE_DOCTOR -> SALES_SHARK -> ANGEL -> DEMON -> DOCTOR_FINAL
```

## Persistência

Padrão de saída:

```txt
history/{mode}/wip/{JOB_ID}_{STAGE}.{json|md}
```

Done/archive/feedback permanecem em `history/{mode}/...`.

## API relevante

- `POST /api/run-autonomous`
- `GET /api/pipeline-status`
- `GET /api/models`
- `GET /api/openrouter-test`

## Notas de legado

Scripts bash `run-*.sh` ainda existem para compatibilidade/histórico, mas o caminho oficial de produção é o runner Node (`pipeline-runner`).
