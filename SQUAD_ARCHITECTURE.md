# BRICK AI SQUAD - ARCHITECTURE v3.1 (A Blindada)

## FLUXO DE PRODUÇÃO

```
BRIEFING
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  BRIEF VALIDATOR                              Gemini Flash  │
│  ├─ Gerador de lacunas (FAIL informativo)                   │
│  ├─ Perguntas acionáveis ao humano                          │
│  └─ assumptions_if_silent (previne ping-pong)               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────┐     ┌─────────────────────┐
│  AUDIENCE ANALYST   │     │  TOPIC RESEARCHER   │
│  Gemini Flash       │ ══► │  Gemini Flash       │
│  (paralelo)         │     │  (paralelo)         │
└─────────────────────┘     └─────────────────────┘
    │                             │
    └──────────────┬──────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  CLAIMS CHECKER                               Gemini Flash  │
│  ├─ Valida dados (mantém se tiver fonte)                    │
│  └─ Higieniza para Autoridade Segura (anti-hype)            │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  COPYWRITER                              Claude Sonnet 4    │
│  (refação: Gemini 3 Pro - mais barato)                      │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  BRAND GUARDIANS (Split)                      Gemini Flash  │
│  ├─ STYLE GUARDIAN (Tom, Voz, Proibições)                   │
│  └─ POSITIONING GUARDIAN (Lógica Comercial, Previsibilidade)│
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────┐     ┌─────────────────────┐
│  CRITIC LITE (65%)  │ ──► │  CRITIC OPUS        │
│  Gemini Flash       │     │  Claude Opus        │
│  (Triagem Barata)   │     │  (Juiz Supremo)     │
└─────────────────────┘     └─────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  CONTENT ASSEMBLER                            Gemini Flash  │
│  ├─ Padronização por Canal (LinkedIn, Email, Landing)       │
│  └─ Entrega do Pacote Completo (Hook, Body, CTA)            │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────┐
        │  APROVADO ≥80%   │──────────────► OUTPUT
        └──────────────────┘
                   │
                   │ REPROVADO
                   ▼
        ┌──────────────────┐
        │  LOOP (max 3x)   │──────────────► COPYWRITER
        └──────────────────┘
                   │
                   │ 3 FALHAS
                   ▼
        ┌──────────────────┐
        │  ESCALA HUMANO   │ (Com Pacote Completo de Contexto)
        └──────────────────┘
```

---

## 1. BRIEF VALIDATOR
- **Modelo:** Gemini Flash
- **Saída:** JSON estruturado
- **Função:** Deixa de ser binário e passa a ser consultivo.
- **Output Sugerido:**
  - `status`: PASS/FAIL
  - `missing_fields`: Lista de campos vazios
  - `questions_to_human`: Perguntas específicas para destravar o job
  - `assumptions_if_silent`: O que o sistema vai assumir como padrão se não houver resposta (ex: Canal default = LinkedIn).

---

## 2. AUDIENCE ANALYST & TOPIC RESEARCHER
- Mantidos em paralelo para velocidade.

---

## 3. CLAIMS CHECKER (NOVO)
- **Modelo:** Gemini Flash
- **Função:** Filtro de credibilidade.
- **Lógica:** 
  - Se o dado tem fonte: Mantém.
  - Se o dado é genérico/inventado: Troca por linguagem de autoridade segura ("é comum ver", "o setor aponta para").
  - Evita estatísticas "tiradas do nada" que destroem a confiança no B2B.

---

## 4. COPYWRITER
- **Foco:** Criatividade pura baseada no briefing validado e dados limpos.

---

## 5. BRAND GUARDIANS (SPLIT)
- **Style Guardian:** Focado no "Como" (Tom, vocabulário, proibição de jargão de startup).
- **Positioning Guardian:** Focado no "O Quê" (Transformação: tempo, risco, previsibilidade. Garante que a oferta está clara).

---

## 6. CRITIC HIERARCHY
- **Critic Lite (Gemini Flash):** Triagem barata. Aplica a rubrica e pega falhas óbvias. Só libera para o Opus se o score for ≥ 65%.
- **Critic Opus:** Refino final. O "Supremo Tribunal" da alma do texto.

### Rubrica de Avaliação (Nova Calibração)
- **Clareza da Oferta (25%):** O que o cliente compra exatamente?
- **Dor Reconhecível (20%):** Bate em algo real do dia a dia?
- **Prova/Credibilidade (20%):** Dados validados ou autoridade segura?
- **On-brand (20%):** Tom Brick + Anti-hype.
- **CTA Específico (15%):** Próximo passo fácil e óbvio.

---

## 7. CONTENT ASSEMBLER (NOVO)
- **Função:** Formatação técnica por canal.
- **Exemplos:**
  - **LinkedIn:** Gancho, quebras de linha, bullets, CTA.
  - **Carrossel:** Estrutura de slides (Tensão, Mecanismo, Oferta, Prova).
  - **Outbound:** Variações curtas (80-120 palavras).

---

## MÉTRICAS DE OURO (SISTÊMICAS)
- **Tempo até aprovação (minutos):** Eficiência do fluxo.
- **Taxa de FAIL por briefing:** Qualidade da coleta/venda inicial.
- **Fator Previsibilidade:** O quanto a cópia enfatiza Prazo, Revisões e Risco Zero.

---

*Última atualização: 02/02/2026 - v3.1 (A Blindada)*
