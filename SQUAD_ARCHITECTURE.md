# BRICK AI SQUAD - ARCHITECTURE v3.2

---

## FLUXO DE PRODUÇÃO

```
BRIEFING
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  01. BRIEF VALIDATOR                          Gemini Flash  │
│  ├─ Gerador de lacunas (não binário)                        │
│  ├─ questions_to_human (perguntas acionáveis)               │
│  └─ assumptions_if_silent (previne ping-pong)               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────┐     ┌─────────────────────┐
│  02. AUDIENCE       │     │  03. TOPIC          │
│  ANALYST            │ ══► │  RESEARCHER         │
│  Gemini Flash       │     │  Gemini Flash       │
└─────────────────────┘     └─────────────────────┘
    │                             │
    └──────────────┬──────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  04. CLAIMS CHECKER                           Gemini Flash  │
│  ├─ Valida dados (mantém se tiver fonte)                    │
│  ├─ Marca [NEEDS SOURCE] ou reescreve                       │
│  └─ Higieniza para Autoridade Segura (anti-hype)            │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  05. COPYWRITER                          GPT-5.2    │
│  └─ Criatividade pura baseada em dados limpos               │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  06. BRAND GUARDIANS (Split)                  Gemini Flash  │
│  ├─ STYLE GUARDIAN (Tom, Voz, Proibições)                   │
│  └─ POSITIONING GUARDIAN (Lógica Comercial, Oferta Clara)   │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────┐     ┌─────────────────────┐
│  07. CRITIC LITE    │ ──► │  08. CRITIC OPUS    │
│  Gemini Flash (65%) │     │  Claude Opus        │
└─────────────────────┘     └─────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  09. DIRECTOR                             GPT-5.2   │
│  └─ Filtro de craft (copy tem punch? é cafona?)             │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  10. HUMAN FEEDBACK                            Dashboard    │
│  └─ Aprovar / Revisar com feedback / Reprovar               │
└─────────────────────────────────────────────────────────────┘
                   │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
    ┌─────────┐    ┌──────────────┐
    │ APROVAR │    │   FEEDBACK   │
    │    ↓    │    │      ↓       │
    │ OUTPUT  │    │ Volta pro    │
    └─────────┘    │ agente certo │
                   └──────────────┘
```

---

## 01. BRIEF VALIDATOR

**Modelo:** Gemini Flash  
**Função:** Gerador de lacunas, não binário.

**Output:**
```json
{
  "status": "PASS | FAIL",
  "missing_fields": ["publico", "oferta", "canal"],
  "questions_to_human": [
    "Quem decide a contratação? Marketing, RH, Founder?",
    "Qual oferta? (diagnóstico, piloto, always-on, pacote mensal)",
    "Onde isso vai rodar? (LinkedIn, email, landing, outbound)"
  ],
  "assumptions_if_silent": {
    "canal": "LinkedIn",
    "objetivo": "lead qualificado"
  }
}
```

**Regra:** Se FAIL mas tem `assumptions_if_silent`, o sistema ASSUME e SEGUE. Não trava.

---

## 02. AUDIENCE ANALYST

**Modelo:** Gemini Flash  
**Função:** Perfil detalhado do público.

**Output:**
```json
{
  "cargo": "Diretores de Criação, CMOs",
  "senioridade": "Pleno/Sênior (35-50 anos)",
  "dor_principal": "...",
  "gatilhos": ["autenticidade", "track record"],
  "objecoes": ["Mais um vendendo curso?"],
  "linguagem_evitar": ["growth hacking", "disruptivo"]
}
```

---

## 03. TOPIC RESEARCHER

**Modelo:** Gemini Flash  
**Função:** Contexto de mercado e referências.

**Output:**
```json
{
  "contexto_mercado": "...",
  "tendencias": ["..."],
  "referencias_tom": ["Naval: specific knowledge", "..."],
  "dados_brutos": ["stat1", "stat2"]
}
```

---

## 04. CLAIMS CHECKER

**Modelo:** Gemini Flash  
**Função:** Higieniza estatísticas inventadas.

**Output:**
```json
{
  "claims_ok": ["B2B usa vídeo em funil"],
  "claims_risky": ["Vídeo aumenta conversão em X%"],
  "fixes": [
    {
      "claim": "aumenta conversão em X%",
      "rewrite": "pode aumentar conversão dependendo do canal e oferta"
    }
  ]
}
```

**Regra:** Marca `[NEEDS SOURCE]` ou troca por linguagem segura ("é comum ver", "tende a").

---

## 05. COPYWRITER

**Modelo Principal:** GPT-5.2  
**Fallback (após 2 falhas):** Gemini 3 Pro  
**Função:** Criatividade pura.

**Regra de Fallback:**
- Tentativa 1-2: GPT-5.2
- Tentativa 3+: Gemini 3 Pro (mais barato, menos criativo)

**Output:**
```json
{
  "variacao_1": { "tipo": "curta", "texto": "..." },
  "variacao_2": { "tipo": "media", "texto": "..." },
  "variacao_3": { "tipo": "storytelling", "texto": "..." },
  "modelo_usado": "gpt-5.2 | gemini-3-pro",
  "tentativa": 1
}
```

---

## 06A. STYLE GUARDIAN

**Modelo:** Gemini Flash  
**Função:** Tom, vocabulário, proibições.

**Checklist:**
- Não soa startup IA
- Sem hype ("revolucionário", "game-changing")
- Sem jargão tech desnecessário
- Voz de diretor, não de marketer

**Output:**
```json
{
  "score": 95,
  "flags": [],
  "aprovado": true
}
```

---

## 06B. POSITIONING GUARDIAN

**Modelo:** Gemini Flash  
**Função:** Proposta e lógica comercial.

**Checklist:**
- Transformação clara (tempo, risco, previsibilidade)
- IA como meio, não fim
- Clareza de oferta (o que o cliente compra?)
- Evita "texto bonito que não vende nada"

**Output:**
```json
{
  "score": 93,
  "oferta_clara": true,
  "transformacao_explicita": true,
  "flags": []
}
```

---

## 07. CRITIC LITE

**Modelo:** Gemini Flash  
**Threshold:** 65%  
**Função:** Triagem barata.

**Rubrica:**

| Critério | Peso |
|----------|------|
| Clareza da Oferta | 25% |
| Dor Reconhecível | 20% |
| Prova/Credibilidade | 20% |
| On-brand | 20% |
| CTA Específico | 15% |

**Output:**
```json
{
  "scores": { "v1": 82, "v2": 90, "v3": 87 },
  "recomendacao": "V2 é a mais forte",
  "liberado_para_opus": true
}
```

---

## 08. CRITIC OPUS

**Modelo:** Claude Opus  
**Função:** Juiz supremo.

**Output:**
```json
{
  "analise": {
    "v1": { "score": 78, "nota": "Punch forte, mas arrogante isolado" },
    "v2": { "score": 91, "nota": "Melhor equilíbrio. Recomendado." },
    "v3": { "score": 85, "nota": "Narrativa forte, longa demais." }
  },
  "vencedor": "v2",
  "status": "APROVADO"
}
```

---

## 09. DIRECTOR (Copy)

**Modelo:** GPT-5.2  
**Função:** Filtro de craft. O copy está certo, mas está BOM?

**Checklist Anti-Genérico:**
- Primeira frase prende?
- Tem clichês? ("No mundo atual...", "Mais que um X, somos Y")
- Ritmo varia? (frases curtas + longas)
- Tem especificidade? (números, nomes, exemplos concretos)
- Punch final é memorável?

**Output:**
```json
{
  "variacao": "v2",
  "score_craft": 72,
  "veredito": "REFINAR",
  "cliches_encontrados": [...],
  "reescrita": "Copy refinado aqui",
  "nota_final": "Estrutura boa, primeira frase genérica. Reescrita acima."
}
```

**Critérios:**
- **APROVAR (≥85):** Copy tem voz, pode publicar
- **REFINAR (60-84):** Ajustes pontuais, DIRECTOR dá a reescrita
- **REESCREVER (<60):** Volta pro COPYWRITER

---

## 10. HUMAN FEEDBACK (Dashboard)

**Função:** Loop de feedback humano que alimenta o sistema.

**Interface:**
```
┌─────────────────────────────────────────────────────┐
│ Feedback:                                           │
│ [_______________________________________________]   │
│                                                     │
│ Problema em:                                        │
│ ○ Conceito  ○ Execução/Craft  ○ Marca  ○ Dados     │
│                                                     │
│ [Reprovar]  [Revisar com feedback]  [Aprovar]      │
└─────────────────────────────────────────────────────┘
```

**Routing de Feedback:**
| Problema | Volta para |
|----------|------------|
| Conceito | COPYWRITER (nova tentativa) |
| Execução/Craft | DIRECTOR (refinar) |
| Marca/Tom | BRAND GUARDIAN (revisar) |
| Dados/Claims | RESEARCHER (verificar) |

**Output salvo:**
```json
{
  "timestamp": "2026-02-03T09:58:00",
  "briefing_id": "brick_marketing_001",
  "variacao": "v2",
  "acao": "revisar",
  "problema_tipo": "execucao",
  "feedback_texto": "Tá cafona, parece texto de agência dos anos 2000",
  "roteado_para": "DIRECTOR"
}
```

---

## MÉTRICAS DE OURO

- **Tempo até aprovação (minutos)**
- **Taxa de FAIL por briefing**
- **Fator Previsibilidade** (quanto a cópia enfatiza Prazo, Revisões, Risco Zero)

---

## ARQUITETURA TÉCNICA

```
┌─────────────────────────────────────────────────────────────┐
│                    BRICK AI SQUAD v3.2+                     │
├─────────────────────────────────────────────────────────────┤
│  CONFIG (constants.js)                                      │
│  ├─ THRESHOLDS: CRITIC_LITE(65%), CRITIC_OPUS(80%)         │
│  ├─ MODELS: gemini-flash, gpt-5.2, claude-opus-4   │
│  └─ RETRY: maxAttempts=3, baseDelay=1000ms                 │
├─────────────────────────────────────────────────────────────┤
│  CONTRACTS (schemas.js)                                     │
│  ├─ briefValidator  → status: PASS|FAIL                    │
│  ├─ audienceAnalyst → perfil, dores, gatilhos              │
│  ├─ claimsChecker   → claims_ok[], claims_risky[]          │
│  ├─ copywriter      → variacoes[] (min 1)                  │
│  ├─ criticLite      → scores, recomendacao                 │
│  └─ criticOpus      → decisao: PUBLICAR|REVISAR|REJEITAR   │
├─────────────────────────────────────────────────────────────┤
│  SERVER (server.js)                                         │
│  ├─ Auth: API Key + Public Routes                          │
│  ├─ Rate Limit: 60/min no /api/state                       │
│  ├─ Metrics: runs, success, failed, avgMs, fallbacks       │
│  ├─ DLQ: /api/fail + /api/retry                            │
│  └─ Logs: JSON estruturado                                 │
├─────────────────────────────────────────────────────────────┤
│  WATCHER (watcher.js)                                       │
│  ├─ Retry: exponential backoff (1s, 2s, 4s)                │
│  ├─ Estado: .watcher_state.json                            │
│  └─ Graceful shutdown: SIGINT/SIGTERM                      │
└─────────────────────────────────────────────────────────────┘
```

### Endpoints da API

| Endpoint | Método | Auth | Descrição |
|----------|--------|------|-----------|
| `/api/health` | GET | - | Health check |
| `/api/state` | GET | - | Estado completo (briefing, wip, done, failed) |
| `/api/metrics` | GET | - | Métricas do pipeline |
| `/api/config` | GET | - | Thresholds e models |
| `/api/briefing` | POST | API Key | Criar novo briefing |
| `/api/result` | POST | API Key | Submeter resultado de bot |
| `/api/fail` | POST | API Key | Reportar falha (DLQ) |
| `/api/retry` | POST | API Key | Reprocessar job falhado |
| `/api/move` | POST | API Key | Mover arquivo entre pastas |
| `/api/archive` | POST | API Key | Arquivar para history |

### Diretórios

```
marketing/
├── briefing/   # Input: aguardando processamento
├── wip/        # Work in Progress
├── done/       # Aprovados
└── failed/     # Dead Letter Queue
```

---

*Última atualização: 03/02/2026 - v4.0 (DIRECTOR + FEEDBACK LOOP)*
