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
│  05. COPYWRITER                          Claude Sonnet 4    │
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
        ┌──────────────────┐
        │  APROVADO ≥80%   │──────────────► OUTPUT
        └──────────────────┘
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

**Modelo Principal:** Claude Sonnet 4  
**Fallback (após 2 falhas):** Gemini 3 Pro  
**Função:** Criatividade pura.

**Regra de Fallback:**
- Tentativa 1-2: Claude Sonnet 4
- Tentativa 3+: Gemini 3 Pro (mais barato, menos criativo)

**Output:**
```json
{
  "variacao_1": { "tipo": "curta", "texto": "..." },
  "variacao_2": { "tipo": "media", "texto": "..." },
  "variacao_3": { "tipo": "storytelling", "texto": "..." },
  "modelo_usado": "claude-sonnet-4 | gemini-3-pro",
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

## MÉTRICAS DE OURO

- **Tempo até aprovação (minutos)**
- **Taxa de FAIL por briefing**
- **Fator Previsibilidade** (quanto a cópia enfatiza Prazo, Revisões, Risco Zero)

---

*Última atualização: 02/02/2026 - v3.2*
