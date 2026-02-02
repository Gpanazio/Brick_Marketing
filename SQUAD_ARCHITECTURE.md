# BRICK AI SQUAD - ARCHITECTURE v3.0

## FLUXO DE PRODUÇÃO

```
BRIEFING
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  BRIEF VALIDATOR                              Gemini Flash  │
│  ├─ Objetivo claro?                                         │
│  ├─ Público definido?                                       │
│  ├─ Formato especificado?                                   │
│  └─ Prazo/contexto?                                         │
│  Output: PASSA → continua | FALHA → pede mais info          │
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
│  COPYWRITER                              Claude Sonnet 4    │
│  (refação: Gemini 3 Pro - mais barato)                      │
└─────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────┐     ┌─────────────────────┐
│  BRAND GUARDIAN     │ ──► │  CRITIC             │
│  Gemini Flash       │     │  Claude Opus        │
└─────────────────────┘     └─────────────────────┘
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
        │  ESCALA HUMANO   │
        └──────────────────┘
```

---

## 1. BRIEF VALIDATOR
- **Modelo:** Gemini Flash
- **Função:** Checklist binário antes de gastar tokens
- **Checklist:**
  - [ ] Objetivo claro? (O que queremos alcançar)
  - [ ] Público definido? (Pra quem estamos falando)
  - [ ] Formato especificado? (Post, carrossel, vídeo, email, landing page)
  - [ ] Prazo/contexto? (Lançamento, campanha, always-on)
- **Output:** `PASSA` → continua | `FALHA` → pede mais info ao humano

---

## 2. AUDIENCE ANALYST
- **Modelo:** Gemini Flash
- **Função:** Entender o comprador de vídeo corporativo

### Fontes de Pesquisa

**Dores do comprador:**
```
"produtora de vídeo demora muito"
"vídeo institucional caro demais"
"orçamento vídeo corporativo frustração"
"produtora não entendeu o briefing"
```

**Processo de decisão:**
```
"como escolher produtora de vídeo"
"o que perguntar para produtora"
"produtora de vídeo RFP critérios"
```

**Objeções específicas sobre IA:**
```
"vídeo IA parece artificial"
"cliente aceitou vídeo com IA?"
"vídeo sintético para empresa é profissional?"
```

**LinkedIn (onde seu comprador está):**
```
site:linkedin.com "produtora de vídeo" contratei OR experiência
site:linkedin.com "vídeo institucional" aprendizado OR dica
site:linkedin.com marketing manager "produção de vídeo" desafio
```

**Discussões reais:**
```
site:reddit.com/r/marketing video production agency experience
site:reddit.com/r/videography client corporate video
```

**Feedback direto (ativo mais valioso):**
- Emails de clientes antigos da produtora
- Transcrições de calls de vendas
- Motivos de propostas perdidas

### Output Estruturado
```json
{
  "personas": [...],
  "dores_principais": [...],
  "linguagem_jargao": [...],
  "objecoes_comuns": [...],
  "motivadores_acao": [...],
  "onde_consomem_conteudo": [...]
}
```

---

## 3. TOPIC RESEARCHER
- **Modelo:** Gemini Flash
- **Função:** Inteligência de mercado e credibilidade

### Fontes de Pesquisa

**Tendências do mercado:**
```
"vídeo marketing B2B tendências 2025"
"como empresas estão usando vídeo institucional"
"video content strategy enterprise"
```

**Dados de credibilidade:**
```
"ROI vídeo marketing estatísticas"
"vídeo aumenta conversão dados"
"LinkedIn video engagement rates 2024"
```

**Cases e referências:**
```
"case vídeo institucional Brasil"
"campanha vídeo corporativo premiada"
```

**Análise de concorrentes:**
```
site:produtoraX.com.br clientes OR portfólio
"produtora vídeo São Paulo portfólio"
```

### Output Estruturado
```json
{
  "mercado": {
    "dados_credibilidade": [
      "Vídeo aumenta conversão em X%",
      "Y% das empresas B2B usam vídeo"
    ],
    "tendencias": [
      "Vídeos mais curtos",
      "Personalização por segmento",
      "Volume > peça única épica"
    ]
  },
  "concorrencia": {
    "produtoras_tradicionais": {
      "prazo_medio": "4-8 semanas",
      "ticket_medio": "R$ XX.XXX",
      "argumentos_usados": ["qualidade cinema", "equipe dedicada"]
    }
  }
}
```

---

## 4. COPYWRITER
- **Modelo:** Claude Sonnet 4 (1ª tentativa) | Gemini 3 Pro (refações)
- **Função:** Escrever o conteúdo com tom Brick
- **Input:** Brief + Audience Analysis + Topic Research

### Tom de Voz
- Confiante, não arrogante
- Direto, sem jargão tech
- Foco em resultado, não em processo
- IA mencionada como meio, nunca como fim

### Princípios Narrativos

| NÃO ESCREVER | ESCREVER |
|--------------|----------|
| "Usamos IA de ponta" | "Entregamos em dias, não semanas" |
| "Tecnologia revolucionária" | "A mesma qualidade. Novo modelo." |
| "Vídeos gerados por IA" | "Produção profissional sob demanda" |
| "Ferramenta inovadora" | "10 anos de narrativa. Agora mais ágil." |

### Estrutura de Argumentação

| Passo | Nome | Descrição |
|-------|------|-----------|
| 01 | **GANCHO** | Dor que o leitor sente (custo, prazo, burocracia) |
| 02 | **PONTE** | "Existe outro jeito agora" |
| 03 | **PROVA** | Trajetória de 10 anos, clientes, resultado |
| 04 | **OFERTA** | O que muda pra ele (prazo, custo, processo) |
| 05 | **CTA** | Próximo passo claro |

---

## 5. BRAND GUARDIAN
- **Modelo:** Gemini Flash
- **Função:** Consistência de marca

### Checklist de Consistência
- [ ] Não promete "IA" como diferencial principal
- [ ] Menciona experiência/trajetória da produtora
- [ ] Tom confiante mas não agressivo
- [ ] Foco em resultado do cliente, não em tecnologia
- [ ] Sem hipérboles ("revolucionário", "nunca visto")
- [ ] Preço/prazo mencionados só se aprovado no briefing
- [ ] Terminologia correta (Production Enhanced, Vision over Prompt)
- [ ] Não soa como startup de IA
- [ ] Não soa corporativo/RH

**Output:** `PASSA` → vai pro Critic | `FALHA` → volta pro Copywriter com notas

---

## 6. CRITIC
- **Modelo:** Claude Opus
- **Função:** Avaliação final de qualidade

### Rubrica de Avaliação (Pesos)

| Critério | Peso | Pergunta |
|----------|------|----------|
| **Clareza** | 25% | Entende a oferta em 5 segundos? |
| **Credibilidade** | 25% | Parece produtora séria ou startup hype? |
| **Diferenciação** | 20% | Fica claro por que não ir pro concorrente? |
| **Ação** | 15% | O CTA é óbvio e baixa fricção? |
| **Tom** | 15% | Soa como a marca ou genérico? |

### Rubrica por Tipo de Conteúdo

#### SOCIAL (LinkedIn/Instagram)
- [ ] Gancho para scroll nos primeiros 10 palavras?
- [ ] Polêmica calculada ou consenso disfarçado?
- [ ] CTA claro e não-genérico?
- [ ] Hashtags relevantes (não spam)?

#### EMAIL
- [ ] Subject line abre?
- [ ] Primeira frase mantém?
- [ ] Um CTA claro?
- [ ] Escaneável?

#### LANDING PAGE
- [ ] Proposta de valor em 5 segundos?
- [ ] Prova social/credibilidade?
- [ ] Objeções endereçadas?
- [ ] CTA acima da dobra?

### Decisão
- **Score ≥ 80%** → `APROVADO`
- **Score < 80%** → `REPROVA` com feedback específico por critério

---

## LOOP DE QUALIDADE

```
Iteração 1: Copywriter (Sonnet 4) refaz com feedback do Critic
Iteração 2: Copywriter (Gemini Pro) refaz com feedback do Critic  
Iteração 3: Copywriter (Gemini Pro) refaz com feedback do Critic

Se ainda não aprovar após 3 tentativas:
→ ESCALA PRO HUMANO
→ Envia contexto completo:
  - Briefing original
  - Todas as versões geradas
  - Todos os feedbacks do Critic
  - O que especificamente não passou
```

### Lógica de Cascata de Custo
```
1ª tentativa → Sonnet 4 (paga caro, qualidade alta)
Se reprovar → Gemini 3 Pro (mais barato, só corrige o que falhou)
Se reprovar 2x → Gemini 3 Pro (último try barato)
Se reprovar 3x → Escala pro humano
```

---

## CONFIGURAÇÃO DE MODELOS

| Agente | Modelo | Custo | Justificativa |
|--------|--------|-------|---------------|
| Brief Validator | Gemini Flash | $ | Checklist simples |
| Audience Analyst | Gemini Flash | $ | Pesquisa estruturada |
| Topic Researcher | Gemini Flash | $ | Busca web + síntese |
| **Copywriter (1ª)** | **Claude Sonnet 4** | $$ | Qualidade criativa máxima |
| **Copywriter (refação)** | **Gemini 3 Pro** | $ | Só ajustes pontuais |
| Brand Guardian | Gemini Flash | $ | Checklist de marca |
| **Critic** | **Claude Opus** | $$$ | Julgamento sofisticado |

---

## EXEMPLO DE OUTPUT APROVADO

**Você sabe quanto custa um vídeo institucional.**

Semanas de pré-produção. Diárias de equipe. Orçamento que precisa de três aprovações.

**A gente faz diferente.**

Com 10 anos de produção para diversos setores, criamos um modelo que entrega a mesma qualidade — em dias, por uma fração do custo.

Sem equipe em campo. Sem burocracia. Sem surpresa no orçamento.

**[Quero ver como funciona]**

---

## MÉTRICAS DE SUCESSO

- **Taxa de aprovação 1ª tentativa:** Meta > 40%
- **Taxa de aprovação até 3ª tentativa:** Meta > 90%
- **Escalações pro humano:** Meta < 10%
- **Tokens por entrega aprovada:** Monitorar e otimizar

---

## PRÓXIMOS PASSOS (Fase 2 - Growth)

### 7. PERFORMANCE AGENT
- **Função:** Planejar testes A/B, segmentação, budget
- **Ativa quando:** Conteúdo aprovado vai pro ar

### 8. ANALYTICS AGENT
- **Função:** Ler resultados, sugerir otimizações
- **Input:** CSVs de performance (CTR, engagement, conversão)
- **Output:** "Post X performou 3x melhor. Fazer mais assim."

---

*Última atualização: 02/02/2026 - v3.0 (Merge: Seu Doc + Nosso Sistema)*
