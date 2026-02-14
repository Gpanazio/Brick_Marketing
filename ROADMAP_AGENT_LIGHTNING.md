# ⚠️ LEGADO (roadmap antigo)

> Roadmap da arquitetura antiga baseada em OpenClaw agent. Manter apenas para referência histórica.

# Roadmap: Migração para Agent Lightning Architecture

**Status atual:** Fix temporário com spawn() (bash scripts)  
**Objetivo futuro:** Migrar para arquitetura Agent Lightning (Node.js nativo)  
**Quando:** Quando sistema estável e demanda crescer

---

## Por Que Migrar?

### Problemas Atuais (Bash Scripts)
1. **SIGKILL vulnerability:** Processos longos podem ser mortos pelo sistema
2. **Debugging difícil:** Logs espalhados, stack traces limitados
3. **State management manual:** Arquivos JSON/MD como única persistência
4. **Retry logic duplicado:** Cada script tem seu próprio retry
5. **Sem paralelismo real:** `&` do bash não é tão confiável quanto workers
6. **Escalabilidade limitada:** Difícil rodar múltiplos pipelines simultâneos

### Benefícios Agent Lightning
1. **Event-driven nativo:** Cada etapa é worker autônomo
2. **State persistence:** Redis/Postgres com rollback automático
3. **Retry & circuit breaker:** Built-in, configurável por etapa
4. **Observability:** Logs estruturados, traces, métricas
5. **Paralelismo real:** Node.js workers ou clusters
6. **Testável:** Unit tests por etapa, integration tests end-to-end

---

## Arquitetura Proposta

### Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                        Railway (Frontend)                    │
│  - Socket.IO Server                                          │
│  - API Endpoints (briefing/rerun/feedback)                   │
│  - Static UI (War Room dashboard)                            │
└────────────────┬────────────────────────────────────────────┘
                 │ Socket.IO events
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     Orchestrator (runner.js v2)              │
│  - Event loop                                                │
│  - Job queue (Bull/BullMQ + Redis)                           │
│  - State machine (PENDING → RUNNING → COMPLETED/FAILED)     │
│  - Worker dispatch                                           │
└────────────────┬────────────────────────────────────────────┘
                 │ enqueue jobs
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Job Queue (Redis)                       │
│  - FIFO per pipeline mode                                    │
│  - Priority support                                          │
│  - Retry with backoff                                        │
│  - Dead letter queue                                         │
└────────────────┬────────────────────────────────────────────┘
                 │ dequeue
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Workers (Step Executors)                  │
│                                                              │
│  Marketing:                                                  │
│    - ValidatorWorker.js                                      │
│    - AudienceWorker.js                                       │
│    - ResearcherWorker.js                                     │
│    - ClaimsWorker.js                                         │
│    - CopywriterWorker.js (x3 parallel)                       │
│    - CopySeniorWorker.js                                     │
│    - WallWorker.js                                           │
│                                                              │
│  Projetos:                                                   │
│    - BrandDigestWorker.js                                    │
│    - IdeationWorker.js (x3 parallel)                         │
│    - ConceptCriticWorker.js                                  │
│    - ExecutionWorker.js                                      │
│    - ProposalWorker.js                                       │
│    - DirectorWorker.js                                       │
│                                                              │
│  Ideias:                                                     │
│    - PainCheckWorker.js                                      │
│    - MarketScanWorker.js                                     │
│    - AngelDevilWorker.js (x2 parallel)                       │
│    - ViabilityWorker.js                                      │
│                                                              │
└────────────────┬────────────────────────────────────────────┘
                 │ LLM calls via OpenClaw agent
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   OpenClaw Agent System                      │
│  - flash, pro, sonnet, opus, gpt                             │
│  - Retries built-in                                          │
│  - Cost tracking                                             │
└─────────────────────────────────────────────────────────────┘
```

### State Storage

**Option A: Redis (lightweight)**
```javascript
{
  "job:1738892400000": {
    "mode": "marketing",
    "status": "RUNNING",
    "currentStep": 5,
    "steps": {
      "1_VALIDATOR": { "status": "COMPLETED", "duration": 12000, "output": {...} },
      "2_AUDIENCE": { "status": "COMPLETED", "duration": 15000, "output": {...} },
      // ...
      "5_COPYWRITERS": { "status": "RUNNING", "startedAt": 1738892430000 },
    },
    "errors": [],
    "createdAt": 1738892400000,
    "updatedAt": 1738892430000,
  }
}
```

**Option B: PostgreSQL (enterprise)**
- Tabela `jobs`: id, mode, status, created_at, updated_at
- Tabela `steps`: job_id, step_name, status, output, duration, error
- Tabela `artifacts`: job_id, filename, content (large text/blob)

---

## Estrutura de Código (Node.js)

```
brick-marketing/
├── src/
│   ├── orchestrator/
│   │   ├── index.js              # Main orchestrator loop
│   │   ├── queue.js              # Bull/BullMQ setup
│   │   └── statemachine.js       # Job state transitions
│   ├── workers/
│   │   ├── base/
│   │   │   └── BaseWorker.js     # Abstract class (retry, logging, error handling)
│   │   ├── marketing/
│   │   │   ├── ValidatorWorker.js
│   │   │   ├── AudienceWorker.js
│   │   │   ├── ResearcherWorker.js
│   │   │   ├── ClaimsWorker.js
│   │   │   ├── CopywriterWorker.js
│   │   │   ├── CopySeniorWorker.js
│   │   │   └── WallWorker.js
│   │   ├── projetos/
│   │   │   ├── BrandDigestWorker.js
│   │   │   ├── IdeationWorker.js
│   │   │   ├── ConceptCriticWorker.js
│   │   │   ├── ExecutionWorker.js
│   │   │   ├── ProposalWorker.js
│   │   │   └── DirectorWorker.js
│   │   └── ideias/
│   │       ├── PainCheckWorker.js
│   │       ├── MarketScanWorker.js
│   │       ├── AngelDevilWorker.js
│   │       └── ViabilityWorker.js
│   ├── agents/
│   │   └── openclaw.js           # Wrapper pra openclaw agent calls
│   ├── storage/
│   │   ├── redis.js              # Redis client
│   │   └── postgres.js           # Postgres client (optional)
│   ├── lib/
│   │   ├── logger.js             # Structured logging
│   │   ├── metrics.js            # Prometheus/StatsD
│   │   └── retry.js              # Exponential backoff
│   └── server/
│       └── railway.js            # Express + Socket.IO (frontend)
├── config/
│   ├── default.json              # Default config
│   ├── production.json           # Production overrides
│   └── development.json          # Dev overrides
├── tests/
│   ├── unit/                     # Worker unit tests
│   ├── integration/              # Pipeline integration tests
│   └── e2e/                      # Full flow tests
├── roles/                        # Prompt templates (keep existing)
├── package.json
└── README.md
```

---

## BaseWorker Class (Template)

```javascript
// src/workers/base/BaseWorker.js
const { execAgent } = require('../../agents/openclaw');
const logger = require('../../lib/logger');
const { withRetry } = require('../../lib/retry');

class BaseWorker {
  constructor(config = {}) {
    this.name = this.constructor.name;
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 120000; // 2min default
    this.agent = config.agent || 'flash';
  }

  // Abstract: cada worker implementa
  async buildPrompt(context) {
    throw new Error('buildPrompt must be implemented');
  }

  // Abstract: cada worker implementa
  async validateOutput(output) {
    throw new Error('validateOutput must be implemented');
  }

  // Método principal (comum a todos)
  async execute(jobId, context) {
    const startTime = Date.now();
    
    logger.info(`[${this.name}] Starting`, { jobId });
    
    try {
      // Build prompt específico do worker
      const prompt = await this.buildPrompt(context);
      
      // Executar LLM com retry
      const output = await withRetry(
        () => execAgent(this.agent, prompt, this.timeout),
        this.maxRetries,
        `${this.name}::execute`
      );
      
      // Validar output
      await this.validateOutput(output);
      
      const duration = Date.now() - startTime;
      logger.info(`[${this.name}] Completed`, { jobId, duration });
      
      return {
        success: true,
        output,
        duration,
      };
      
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(`[${this.name}] Failed`, { 
        jobId, 
        error: err.message, 
        duration 
      });
      
      return {
        success: false,
        error: err.message,
        duration,
      };
    }
  }
}

module.exports = BaseWorker;
```

---

## Exemplo: ValidatorWorker

```javascript
// src/workers/marketing/ValidatorWorker.js
const BaseWorker = require('../base/BaseWorker');
const fs = require('fs').promises;
const path = require('path');

class ValidatorWorker extends BaseWorker {
  constructor() {
    super({
      agent: 'flash',
      maxRetries: 3,
      timeout: 60000, // 1min
    });
  }

  async buildPrompt(context) {
    const { briefingContent, roleFile } = context;
    
    return `
${roleFile}

BRIEFING RECEBIDO:
${briefingContent}

Valide e estruture no formato JSON.
    `.trim();
  }

  async validateOutput(output) {
    // Parse JSON
    const data = JSON.parse(output);
    
    // Campos obrigatórios
    if (!data.job_id || !data.step_name || !data.status) {
      throw new Error('Missing required fields in VALIDATOR output');
    }
    
    return true;
  }
}

module.exports = ValidatorWorker;
```

---

## Orchestrator Loop (Simplified)

```javascript
// src/orchestrator/index.js
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../lib/logger');

// Import workers
const ValidatorWorker = require('../workers/marketing/ValidatorWorker');
const AudienceWorker = require('../workers/marketing/AudienceWorker');
// ... etc

const connection = new Redis({ host: 'localhost', port: 6379 });

const pipelineQueue = new Queue('pipeline', { connection });

// Worker processor
const worker = new Worker('pipeline', async (job) => {
  const { mode, stepName, jobId, context } = job.data;
  
  logger.info('Processing step', { mode, stepName, jobId });
  
  // Dispatch to correct worker
  let workerInstance;
  if (stepName === 'VALIDATOR') {
    workerInstance = new ValidatorWorker();
  } else if (stepName === 'AUDIENCE') {
    workerInstance = new AudienceWorker();
  }
  // ... etc
  
  // Execute
  const result = await workerInstance.execute(jobId, context);
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  // Save to state store
  await saveStepResult(jobId, stepName, result);
  
  // Enqueue next step (if pipeline continues)
  const nextStep = getNextStep(mode, stepName);
  if (nextStep) {
    await pipelineQueue.add(nextStep.name, {
      mode,
      stepName: nextStep.name,
      jobId,
      context: { ...context, previousOutput: result.output },
    });
  }
  
  return result;
}, { connection });

worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.data.jobId });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job.data.jobId, error: err.message });
});
```

---

## Migração Faseada

### Fase 1: Proof of Concept (1 semana)
- [ ] Setup Bull + Redis
- [ ] Implementar BaseWorker
- [ ] Migrar 3 etapas de Marketing (VALIDATOR, AUDIENCE, RESEARCHER)
- [ ] Teste smoke end-to-end

### Fase 2: Marketing Completo (1 semana)
- [ ] Migrar todas as 8 etapas
- [ ] Loops Copy Senior ↔ Wall
- [ ] Testes de carga (10 jobs simultâneos)

### Fase 3: Projetos & Ideias (1 semana)
- [ ] Migrar pipelines Projetos e Ideias
- [ ] Paralelização (Copywriters x3, Ideation x3, Angel+Devil x2)
- [ ] Testes de stress

### Fase 4: Observability & Production (1 semana)
- [ ] Metrics (Prometheus)
- [ ] Distributed tracing (Jaeger/Zipkin)
- [ ] Alerting (PagerDuty/Slack)
- [ ] Deploy Railway + Redis Cloud

### Fase 5: Deprecate Bash Scripts
- [ ] Comparar custos (tokens, tempo, falhas)
- [ ] Arquivar scripts bash
- [ ] Atualizar docs

---

## Estimativa de Esforço

**Desenvolvedor experiente Node.js:**
- Setup infra: 1-2 dias
- BaseWorker + utils: 1 dia
- Migrar 1 pipeline completo: 2-3 dias
- Testes: 1-2 dias
- Deploy + monitoring: 1 dia

**Total:** ~2-3 semanas full-time

**Desenvolvedor júnior ou aprendendo:**
- Dobrar estimativa: ~4-6 semanas

---

## Decisão: Quando Migrar?

**Gatilhos para migração:**
1. ✅ SIGKILL vira problema recorrente (>1x/semana)
2. ✅ Precisar rodar >5 pipelines simultâneos
3. ✅ Cliente pede SLA garantido (<5min p95)
4. ✅ Debugging consome >10h/mês
5. ✅ Precisar rollback automático de etapas

**Gatilhos para NÃO migrar (manter bash):**
1. ❌ Sistema funciona 95%+ do tempo
2. ❌ <10 pipelines/dia
3. ❌ Debugging é rápido (<30min/issue)
4. ❌ Orçamento limitado (Redis Cloud custa $$)

---

## Referências

- [Agent Lightning (Microsoft)](https://github.com/microsoft/agent-lightning)
- [Bull/BullMQ Docs](https://docs.bullmq.io/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Temporal.io](https://temporal.io/) - Alternative to Bull (mais enterprise)

---

**Decisão atual:** Manter bash + spawn() até um dos gatilhos acima acontecer.
**Próxima revisão:** 2026-03-01 (1 mês de uso em produção)
