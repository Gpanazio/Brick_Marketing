# 🧠 REVISÃO COMPLETA: BRICK AI WAR ROOM

**Data da Revisão:** 05/02/2026  
**Versão:** 4.0

---

## 📋 ÍNDICE

1. [Visão Geral do Sistema](#-visão-geral-do-sistema)
2. [Arquitetura](#-arquitetura)
3. [Pipelines de Criação](#-pipelines-de-criação)
4. [Roles (Bots) - Definições Completas](#-roles-bots---definições-completas)
5. [Modelos de IA por Etapa](#-modelos-de-ia-por-etapa)
6. [Fluxo de Dados](#-fluxo-de-dados)
7. [API e Endpoints](#-api-e-endpoints)
8. [Estimativa de Custos](#-estimativa-de-custos)

---

## 🔍 VISÃO GERAL DO SISTEMA

O **War Room de Criação** é um sistema de pipelines automatizados de criação com agentes de IA para a **Brick** (produtora de vídeo premium).

### Propósito Central
Automatizar e estruturar o processo criativo desde o briefing até a aprovação final, usando múltiplos agentes de IA especializados em diferentes etapas da produção de conteúdo.

### Três Modos de Operação

| Modo | Propósito | Pipeline |
|------|-----------|----------|
| **Marketing** | Produção de conteúdo para LinkedIn/Instagram | 8 etapas, foco em copy e brand |
| **Projetos** | Propostas criativas para clientes | 6 etapas, foco em conceito e execução |
| **Ideias** | Validação rápida de ideias de produto/negócio | 5 etapas, foco em viabilidade |

---

## 🏗 ARQUITETURA

```
┌─────────────────────────────────────────────────────────────────┐
│                           FRONTEND                               │
│                    public/index.html (SPA)                       │
│           Dashboard visual com nodes coloridos por modelo        │
└─────────────────────────┬───────────────────────────────────────┘
                          │ WebSocket + Polling
┌─────────────────────────▼───────────────────────────────────────┐
│                        SERVER.JS                                 │
│                     Express + Socket.IO                          │
│              API REST + Real-time state updates                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
┌───────────▼───────────┐   ┌───────────▼───────────┐
│      WATCHER.JS       │   │      HISTORY/         │
│   Polling + Sync      │   │   Armazenamento       │
│   Detecta briefings   │   │   marketing/          │
│   Sincroniza WIP      │   │   projetos/           │
└───────────┬───────────┘   │   ideias/             │
            │               └───────────────────────┘
┌───────────▼───────────┐
│    RUN-*.SH SCRIPTS   │
│   Orquestradores      │
│   Chamam openclaw     │
└───────────┬───────────┘
            │
┌───────────▼───────────┐
│      ROLES/*.MD       │
│   23 arquivos de      │
│   prompt/instrução    │
└───────────────────────┘
```

### Componentes Principais

#### 1. **server.js** (~1050 linhas)
- Express + Socket.IO para API REST e WebSocket
- Gerencia briefings, resultados, feedback, aprovações
- Rate limiting, métricas, graceful shutdown
- WebSocket para atualizações em tempo real

#### 2. **watcher.js** (~200 linhas)
- Polling Railway a cada 10s para novos briefings
- Sincroniza arquivos WIP/done para Railway via API
- Detecta re-run via mudança de mtime

#### 3. **run-*.sh** (3 scripts)
- Orquestradores que chamam `openclaw agent` para cada etapa
- Injetam role files + contexto acumulado
- Fallback com placeholder se agente falhar

#### 4. **roles/*.md** (23 arquivos)
- Prompts detalhados para cada agente
- Define: modelo sugerido, objetivo, framework, output esperado, regras

---

## 🔄 PIPELINES DE CRIAÇÃO

### PIPELINE: MARKETING (run-marketing.sh)

**Propósito:** Produção de conteúdo para LinkedIn/Instagram posicionando Brick AI como líder de categoria.

```
BRIEFING → DOUGLAS → VALIDATOR → AUDIENCE → RESEARCHER → CLAIMS
                                                              │
                                     COPYWRITER_GPT ────────┐│
                                     COPYWRITER_FLASH ──────┤│
                                     COPYWRITER_SONNET ─────┘│
                                                              │
                               BRAND_GUARDIAN → CRITIC → WALL → [HUMANO]
```

| Etapa | Role | Modelo | Propósito |
|-------|------|--------|-----------|
| 0 | Douglas | - | Copia briefing pro WIP |
| 1 | BRIEF_VALIDATOR | Flash | Valida se briefing tem info suficiente |
| 2 | AUDIENCE_ANALYST | Flash | Avalia alinhamento com persona HARDCODED |
| 3 | TOPIC_RESEARCHER | Flash | Pesquisa tendências e dados verificáveis |
| 4 | CLAIMS_CHECKER | Flash | Valida claims e estatísticas |
| 5A | COPYWRITER | GPT | Copy versão A (direto/persuasivo) |
| 5B | COPYWRITER | Flash | Copy versão B (eficiente/data-driven) |
| 5C | COPYWRITER | Sonnet | Copy versão C (narrativo/emocional) |
| 6 | BRAND_GUARDIAN | Flash | Valida consistência de marca |
| 7 | CRITIC | Opus | Escolhe melhor copy, sugere ajustes |
| 8 | FILTRO_FINAL (WALL) | Opus | Score final 0-100, aprova/rejeita |

---

### PIPELINE: PROJETOS (run-projetos.sh)

**Propósito:** Gerar propostas criativas completas para projetos de clientes.

```
BRIEFING → DOUGLAS → BRAND_DIGEST → IDEATION_GPT ────────┐
                                     IDEATION_FLASH ──────┤
                                     IDEATION_SONNET ─────┘
                                                          │
           CONCEPT_CRITIC → EXECUTION_DESIGN → COPYWRITER → DIRECTOR → [HUMANO]
```

| Etapa | Role | Modelo | Propósito |
|-------|------|--------|-----------|
| 0 | Douglas | - | Copia briefing pro WIP |
| 1 | BRAND_DIGEST | Flash | Extrai essência da marca |
| 2A | CREATIVE_IDEATION | GPT | Conceito A |
| 2B | CREATIVE_IDEATION | Flash | Conceito B |
| 2C | CREATIVE_IDEATION | Sonnet | Conceito C |
| 3 | CONCEPT_CRITIC | Pro | Avalia e escolhe melhor conceito |
| 4 | EXECUTION_DESIGN | Pro | Define direção visual/técnica |
| 5 | PROPOSAL_WRITER | GPT | Proposta comercial |
| 6 | PROJECT_DIRECTOR | Pro | Avalia execução audiovisual |

---

### PIPELINE: IDEIAS (run-ideias.sh)

**Propósito:** Validação rápida de ideias de produto/negócio (GO/NO-GO).

```
RAW_IDEA → DOUGLAS → PAIN_CHECK → MARKET_SCAN → ANGLE_GEN (angel) ─┐
                                                DEVIL_GEN (devil) ─┘
                                                        │
                                                    VIABILITY → [HUMANO]
```

| Etapa | Role | Modelo | Propósito |
|-------|------|--------|-----------|
| 0 | Douglas | - | Copia ideia pro WIP |
| 1 | PAIN_CHECK | Flash | Valida se dor é real |
| 2 | MARKET_SCAN | Flash | Analisa mercado e concorrência |
| 3a | ANGLE_GEN | Sonnet | "Angel" - defende a ideia |
| 3b | DEVIL_GEN | Sonnet | "Devil" - ataca a ideia |
| 4 | VIABILITY | Opus | Score final GO/NO-GO |
| 5 | Humano | - | Decisão final |

---

## 🤖 ROLES (BOTS) - DEFINIÇÕES COMPLETAS

### 1. BRIEF_VALIDATOR
**Modelo:** Flash  
**Propósito:** Gatekeeper inicial - valida se briefing tem informação suficiente antes de gastar tokens.

**Checklist Obrigatório:**
- OBJETIVO - O que queremos alcançar está claro?
- PÚBLICO - Para quem estamos falando?
- FORMATO - Qual o entregável?
- CONTEXTO - Por que agora?

**Output:** JSON com `status: PASS/FAIL`, `briefing_estruturado`, `perguntas_para_humano`

**Regras:**
- Não assumir - se não está no briefing, perguntar
- Ser específico - dizer exatamente o que falta
- Não bloquear por perfeccionismo
- Rápido - validação em segundos

---

### 2. AUDIENCE_ANALYST
**Modelo:** Flash  
**Propósito:** Entender profundamente a persona antes do Copywriter escrever.

**⚠️ PERSONA HARDCODED (Brick AI):**
- **Cargo:** Diretor de Criação / Diretor de Marketing (35-50 anos)
- **Empresa:** Agências mid-market (50-200 pessoas)
- **Experiência:** 10+ anos no mercado
- **Dores:** Orçamento apertado, deadline impossível, pressão pra inovar, medo de parecer ultrapassado, ceticismo com IA
- **Motivadores:** Status profissional, eficiência operacional, economia sem perder qualidade

**Output:** JSON com `persona`, `dores`, `linguagem_comum`, `objecoes`, `motivadores_de_acao`

**Regras:**
- NÃO pesquisar persona do zero
- Citar fontes
- Usar palavras que a persona usa

---

### 3. TOPIC_RESEARCHER
**Modelo:** Flash  
**Propósito:** Trazer fatos, dados e referências verificáveis pro Copywriter.

**Fontes de Dados (por prioridade):**
1. Web Search (notícias, artigos, concorrentes, tendências)
2. SEO/Keywords (Ahrefs, SEMrush, People Also Ask)
3. Base de Conhecimento da Marca
4. Dados de Mercado (relatórios, benchmarks)

**Output:** JSON com `keywords_principais`, `dados_credibilidade`, `tendencias_atuais`, `angulos_concorrentes`, `oportunidades_diferenciacao`

**Regras:**
- Dados verificáveis com fonte
- Priorizar últimos 6 meses
- Não alucinar estatísticas

---

### 4. CLAIMS_CHECKER
**Modelo:** Flash  
**Propósito:** Higienizar estatísticas e dados antes do Copywriter usar.

**Classificação de Claims:**
- ✅ **VERIFICADO** - Fonte sólida, dado confirmado
- ⚠️ **PARCIAL** - Fonte ok, dado aproximado
- ❌ **DUVIDOSO** - Fonte fraca ou não verificável
- 🔴 **INVENTADO** - Claramente falso

**Red Flags:**
- "Estudos mostram que..." (sem citar qual)
- Números muito redondos (10x, 100%)
- Fonte é "especialistas dizem"
- URL quebrada
- Dado de 2+ anos

**Output:** JSON com `claims_validados`, `estatisticas_recomendadas`, `estatisticas_evitar`

---

### 5. COPYWRITER
**Modelo:** GPT + Flash + Sonnet (paralelo)  
**Propósito:** Escrever textos para LinkedIn/Instagram que posicionem a Brick AI como líder.

**Personalidade (Voice of Brick):**
- **Bold & Unapologetic** - Não pede desculpas por ser bom
- **Sênior** - 10 anos de set, conhece Arri Alexa vs iPhone
- **Anti-Slop** - Odeia texto genérico de IA
- **Mantra:** "Vision over Prompt"

**Dualidade de Vozes:**
- **BRICK (Estúdio):** Tom de Diretor de Cinema
- **MASON (Sistema):** Tom de Log de Terminal/Glitch

**Output:** Markdown com 3 variações (CURTO, MÉDIO, STORYTELLING) + CTA

**Regras:**
- Nunca usar emojis em excesso
- Nunca usar "revolucionário"
- Ser técnico mas acessível
- Usar ao menos 1 dado validado pelo CLAIMS_CHECKER

---

### 6. BRAND_GUARDIAN
**Modelo:** Flash  
**Propósito:** Garantir consistência de marca ANTES do Critic avaliar qualidade.

**Identidade Brick AI:**
- **Quem somos:** Produtora premium (10 anos) + IA
- **Não somos:** Startup de tech, SaaS, curso de IA
- **Nome:** Stanley KuBRICK + 2001

**Tom de Voz:**
- Bold & Unapologetic
- Diretor de Cinema Sênior
- Energia de Set

**Terminologia Oficial:**
| ✅ USAR | ❌ NÃO USAR |
|---------|-------------|
| Production Enhanced | Revolucionário |
| Vision over Prompt | Disruptivo |
| Full AI Production | Game-changer |
| Direção de IA | Mágica |
| Craft | Metaverso |

**Output:** JSON com `status: BRAND_OK/BRAND_FAIL`, `problemas[]`, `sugestoes`

---

### 7. CRITIC
**Modelo:** Opus  
**Propósito:** "Advogado do Diabo" - impedir que lixo seja publicado.

**Personalidade:** Diretor de Criação Sênior ranzinza, perfeccionista e detalhista. Não liga para sentimentos, liga para a Marca.

**Missão:**
1. Ler as 3 versões de copy (A/B/C)
2. Avaliar cada versão com olhar de DC Sênior
3. Escolher a melhor e justificar
4. Listar ajustes_sugeridos

**Output:** JSON com `vencedor`, `modelo_vencedor`, `copy_vencedora`, `pontos_fortes`, `pontos_fracos`, `ajustes_sugeridos`, `veredito`

**Vereditos:** APPROVED | APPROVED_WITH_NOTES | REJECTED

---

### 8. FILTRO_FINAL (WALL)
**Modelo:** Opus  
**Propósito:** Última barreira de qualidade antes da aprovação humana.

**Rubrica (100 pontos):**
| Critério | Pontos | Descrição |
|----------|--------|-----------|
| Clareza da Oferta | 25 | O que vendemos está cristalino? |
| Dor Real | 20 | Toca numa dor verdadeira? |
| Credibilidade | 20 | Claims sustentados por fatos? |
| On-Brand | 20 | Segue a voz da Brick AI? |
| CTA Específico | 15 | Próximo passo claro e factível? |

**Critérios de Aprovação:**
- Score ≥ 80: APPROVED → segue pra HUMANO
- Score < 80: REJECTED → volta pro DOUGLAS com feedback
- Score < 50: BLOCKED → escala pra Gabriel direto

**Output:** JSON com `score_final`, `status`, `breakdown`, `destaques_positivos`, `pontos_de_melhoria`

---

### 9. PAIN_CHECK
**Modelo:** Flash  
**Propósito:** Validar se a ideia resolve uma dor REAL do mercado.

**Checklist:**
- **A Dor é Real?** Exemplos concretos, discussões em fóruns, empresas gastando dinheiro
- **A Dor é Relevante?** Impacta receita/tempo/qualidade, é recorrente, escala
- **A Dor é Ativa?** Pessoas pesquisam soluções, existem concorrentes, há budget

**Output:** JSON com `pain_check`, `evidence`, `red_flags`, `status: PASS/FAIL`

---

### 10. MARKET_SCAN
**Modelo:** Flash  
**Propósito:** Mapear cenário competitivo e oportunidades de diferenciação.

**Framework (HARDCODED, sem web search):**
1. Categoria de Mercado (SaaS B2B, Marketplace, etc.)
2. Modelo de Negócio (Subscription, Freemium, etc.)
3. Faixa de Precificação
4. Tipos de Concorrentes
5. Barreiras de Entrada

**Output:** JSON com `market_scan`, `opportunity_score`, `differentiation_angles`

**Critério:** PASS se opportunity_score ≥ 50 + pelo menos 2 differentiation angles

---

### 11. ANGLE_GEN (Angel)
**Modelo:** Sonnet  
**Propósito:** Definir o ângulo único que diferencia a ideia no mercado.

**O que é um Ângulo:**
- **Posicionamento** - Como quer ser percebido
- **Mensagem** - O que comunica
- **Público** - Para quem fala

**Framework:**
1. Contra quem você está? (inimigo)
2. Para quem você é? (nicho específico)
3. Qual sua arma? (diferencial)

**Output:** JSON com 3 `angles[]`, `recommended`, `status`

---

### 12. DEVIL_GEN (Devil)
**Modelo:** Sonnet  
**Propósito:** Identificar por que a ideia vai FALHAR.

**Framework de Falha:**
1. **Cenários de Fracasso:** Timing, Execução, Mercado
2. **Riscos Ocultos:** Competição assassina, Custo real, Dependências críticas
3. **Dealbreakers:** Técnico, Econômico, Legal/Ético

**Gravidade:**
- **Fatal** - Mata a ideia (NO-GO imediato)
- **Crítica** - Requer pivot
- **Moderada** - Risco gerenciável
- **Baixa** - Monitorar

**Output:** JSON com `failure_scenarios[]`, `hidden_risks[]`, `dealbreakers[]`, `overall_assessment`

---

### 13. VIABILITY
**Modelo:** Opus  
**Propósito:** Juiz supremo - decisão final GO/NO-GO.

**Rubrica (100 pontos):**
| Critério | Pontos | Descrição |
|----------|--------|-----------|
| Problema | 30 | A dor justifica uma solução? |
| Mercado | 25 | O mercado comporta mais um player? |
| Diferenciação | 25 | O ângulo é defensável? |
| Execução | 20 | É factível para a Brick AI? |

**Critérios de Decisão:**
- ≥ 80: **GO** - Prosseguir para desenvolvimento
- 60-79: **CONDITIONAL GO** - Prosseguir com ressalvas
- 40-59: **REVISIT** - Voltar ao ANGLE_GEN
- < 40: **NO-GO** - Arquivar ideia

**Output:** JSON com `viability_assessment`, `recommendation`, `next_steps`, `risks`, `mitigations`

---

### 14. BRAND_DIGEST
**Modelo:** Flash  
**Propósito:** Extrair essência da marca do briefing para guiar criação.

**O que Extrair:**
1. **Identidade Core:** Personalidade, tom de voz, valores
2. **Posicionamento:** Categoria, público, promessa, diferencial
3. **Visual & Sensorial:** Cores, estética, referências
4. **Restrições:** Must-have, must-not, guidelines

**Output:** JSON com `identity_core`, `positioning`, `visual_sensorial`, `constraints`, `creative_brief_summary`

---

### 15. CREATIVE_IDEATION
**Modelo:** GPT + Flash + Sonnet (paralelo, competindo)  
**Propósito:** Gerar conceitos criativos únicos para o projeto.

**O que é um Conceito:**
A **grande ideia** por trás da execução. O que faz alguém parar e pensar "nossa, isso é inteligente".

**Framework:**
1. **Insight Humano** - Verdade sobre comportamento
2. **Twist Criativo** - Contraste, metáfora, reframe, provocação
3. **Aplicabilidade** - Funciona em copy, visual E UX

**Output:** Markdown com `CONCEITO CORE`, `INSIGHT HUMANO`, `TWIST CRIATIVO`, `APLICAÇÕES`, `POR QUE FUNCIONA`

---

### 16. CONCEPT_CRITIC
**Modelo:** Pro  
**Propósito:** Avaliar os 3 conceitos criativos e escolher o vencedor.

**Rubrica (100 pontos por conceito):**
| Critério | Pontos | Descrição |
|----------|--------|-----------|
| Originalidade | 30 | Único e memorável? |
| Insight | 25 | Captura verdade humana? |
| Aplicabilidade | 25 | Funciona em copy, visual E UX? |
| Brand Fit | 20 | Alinhado com a marca? |

**Decisão:**
- ≥ 80: Excelente - Prosseguir direto
- 70-79: Bom - Pequenos ajustes
- 60-69: Aceitável - Requer refinamento
- < 60: Insuficiente - Voltar ao IDEATION

**Output:** JSON com `evaluation{}`, `winner`, `runner_up`

---

### 17. EXECUTION_DESIGN
**Modelo:** Pro  
**Propósito:** Transformar conceito criativo em plano de execução visual e técnico.

**Entregáveis:**
1. **Visual System:** Paleta, tipografia, grid, estilo
2. **Copy Framework:** Tagline, mensagens-chave, tom, vocabulário
3. **UX/Interações:** Navegação, microinterações
4. **Specs Técnicas:** Formatos, assets, ferramentas

**Regras:**
- "Azul" não serve. "#1E40AF" serve.
- Cada escolha deve conectar com o conceito
- Um designer júnior deve conseguir executar só com esse doc

**Output:** JSON completo com `visual_system`, `copy_framework`, `ux_interactions`, `technical_specs`

---

### 18. PROPOSAL_WRITER
**Modelo:** GPT (com variações multi-modelo para seções criativas)  
**Propósito:** Transformar conceito aprovado em proposta comercial clara e vendedora.

**Seções Criativas (3 modelos):**
- **GPT:** Pitch estruturado, tom executivo
- **Flash:** Abertura direta, CTA incisivo
- **Sonnet:** Narrativa envolvente, storytelling

**Padrões PROIBIDOS (flags de IA):**
- "Faço X. Mas também Y."
- "Não é só X. É Y."
- "No mundo atual / conectado / digital..."
- "Acreditamos que..."

**Output:** Markdown com CONCEITO, ESTRUTURA DO VÍDEO, ORÇAMENTO, CRONOGRAMA, ENTREGÁVEIS, CONDIÇÕES, PRÓXIMOS PASSOS

**Regras:**
- Sempre fechar no budget
- Prazo é lei (entregar com buffer)
- 2 rodadas de ajuste por etapa

---

### 19. PROJECT_DIRECTOR
**Modelo:** Pro  
**Propósito:** Garantir MÃO DE DIRETOR na execução, não PowerPoint corporativo.

**Personalidade:** Diretor de Fotografia com 20 anos de carreira. RIGOROSO. NÃO GENTIL. HONESTO.

**Filosofia:** "Conceito bom + execução medíocre = vídeo medíocre. Eu não deixo passar."

**Checklist Anti-Cafona:**
1. **Clichês Visuais** - Grid de rostos, timelapse de cidade, aperto de mão corporativo
2. **Frame Icônico** - A IMAGEM que resume o vídeo
3. **Estrutura Narrativa** - Primeiro frame prende? Tem surpresa? Último frame memorável?
4. **Craft Técnico** - Luz, som, enquadramento
5. **Assinatura Brick** - Parece que a Brick fez?

**Postura Obrigatória:**
- SEMPRE dá feedback de melhoria (mesmo score 90+)
- NUNCA diz "está bom" sem especificar
- SEMPRE dá referências visuais

**Vereditos:**
- 85-100: APROVAR
- 60-84: REFINAR
- 0-59: REPENSAR

**Output:** JSON completo com `cliches_encontrados`, `frame_iconico`, `estrutura_narrativa`, `craft_tecnico`, `teste_brick`, `reescrita_execucao`, `referencias_obrigatorias`, `nota_do_diretor`

---

## 🎨 MODELOS DE IA POR ETAPA

### Mapeamento de Modelos

| Modelo | Nome Interno | Custo Output (1M tokens) | Custo Input (1M tokens) | Uso |
|--------|--------------|--------------------------|-------------------------|-----|
| Flash | flash | $0.40 | $0.075 | Validação, pesquisa, tarefas rápidas |
| Pro | pro | $10.00 | $1.25 | Avaliação profunda, execução |
| GPT-5.2 | gpt | $10.00 | $2.50 | Copy A, propostas estruturadas |
| Sonnet | sonnet | $15.00 | $3.00 | Copy C, conceitos narrativos |
| Opus | opus | $75.00 | $15.00 | Crítica final, decisões GO/NO-GO |

### Configuração (config/constants.js)

```javascript
MODELS: {
    FLASH: 'gemini-2.0-flash-exp',
    CREATIVE: 'claude-sonnet-4',
    REASONING: 'claude-opus-4'
},
THRESHOLDS: {
    CRITIC_LITE: { pass: 65 },
    CRITIC_OPUS: { pass: 80 },
    COPYWRITER: { claudeAttempts: 2, fallbackModel: 'gemini-3-pro' }
}
```

---

## 📊 FLUXO DE DADOS

### Arquivos de Output por Pipeline

**Padrão:** `{JOB_ID}_{ROLE}.{json|md}`

#### Marketing
```
{JOB_ID}_PROCESSED.md
{JOB_ID}_01_VALIDATOR.json
{JOB_ID}_02_AUDIENCE.json
{JOB_ID}_03_RESEARCH.json
{JOB_ID}_04_CLAIMS.json
{JOB_ID}_05A_COPY_GPT.md
{JOB_ID}_05B_COPY_FLASH.md
{JOB_ID}_05C_COPY_SONNET.md
{JOB_ID}_06_BRAND_GUARDIANS.json
{JOB_ID}_07_CRITICS.json
{JOB_ID}_08_WALL.json
```

#### Projetos
```
{JOB_ID}_BRIEFING_INPUT.md
{JOB_ID}_BRAND_DIGEST.md
{JOB_ID}_IDEATION_GPT.md
{JOB_ID}_IDEATION_FLASH.md
{JOB_ID}_IDEATION_SONNET.md
{JOB_ID}_CONCEPT_CRITIC.md
{JOB_ID}_EXECUTION_DESIGN.md
{JOB_ID}_COPYWRITER.md
{JOB_ID}_DIRECTOR.md
```

#### Ideias
```
{JOB_ID}_RAW_IDEA.md
{JOB_ID}_PAIN_CHECK.json
{JOB_ID}_MARKET_SCAN.md
{JOB_ID}_ANGLE_GEN.md
{JOB_ID}_DEVIL_GEN.md
{JOB_ID}_VIABILITY.json
```

### Diretórios

```
history/
├── marketing/
│   ├── briefing/   # Briefings novos aguardando processamento
│   ├── wip/        # Trabalho em progresso
│   ├── done/       # Concluídos
│   ├── failed/     # Falhas
│   ├── approved/   # Aprovados por humano
│   └── feedback/   # Feedbacks humanos
├── projetos/
│   └── (mesma estrutura)
└── ideias/
    └── (mesma estrutura)
```

---

## 🔌 API E ENDPOINTS

### Read-Only (GET)
| Endpoint | Descrição |
|----------|-----------|
| `/api/health` | Health check para Railway |
| `/api/state?mode=...` | Estado atual (briefing, wip, done, failed) |
| `/api/pending?mode=...` | Briefings pendentes |
| `/api/metrics` | Métricas do pipeline |
| `/api/config` | Thresholds e models |
| `/api/estimate?mode=...` | Estimativa de custo |
| `/api/architecture` | SQUAD_ARCHITECTURE.md |
| `/api/pipeline?mode=...` | Configuração visual do pipeline |
| `/api/history` | Histórico de jobs |
| `/api/feedback?mode=...` | Feedbacks pendentes |

### Write (POST/DELETE)
| Endpoint | Descrição | Auth |
|----------|-----------|------|
| `/api/briefing` | Criar novo briefing | API Key |
| `/api/result` | Submeter resultado de agente | API Key |
| `/api/move` | Mover arquivo entre pastas | API Key |
| `/api/file` (DELETE) | Deletar arquivo | API Key |
| `/api/briefing/clear` | Limpar briefing processado | API Key |
| `/api/fail` | Mover para dead letter queue | API Key |
| `/api/retry` | Retry de job falhado | API Key |
| `/api/rerun` | Re-executar job | API Key |
| `/api/feedback` | Enviar feedback humano | Público |
| `/api/approve` | Aprovar campanha | Público |
| `/api/pipeline` | Salvar config pipeline | API Key |
| `/api/archive` | Arquivar para histórico | API Key |

---

## 💰 ESTIMATIVA DE CUSTOS

### Por Pipeline

| Pipeline | Steps | Custo Estimado | Maior Gasto |
|----------|-------|----------------|-------------|
| Marketing | 10 | ~$0.55 | Opus: CRITICS + WALL (~$0.48) |
| Projetos | 8 | ~$0.16 | GPT + Sonnet Ideation (~$0.06) |
| Ideias | 5 | ~$0.22 | Opus: VIABILITY (~$0.16) |

### Nota
- Margem de erro: ±30%
- Input tokens crescem ao longo do pipeline (contexto acumulado: 2k→12k)
- Custo real pode variar baseado em complexidade do briefing

---

## 📝 COMO ADICIONAR NOVA ETAPA

1. Criar role file em `roles/` seguindo o padrão existente
2. Adicionar etapa no script bash correspondente (`openclaw agent`)
3. Adicionar node no frontend (`public/index.html`) com título, label, modelo
4. Adicionar `fileMapping` no frontend para conectar arquivo ao node
5. Atualizar `roles/INDEX.md`
6. Atualizar endpoint `/api/estimate` em `server.js`
7. Git push (Railway faz deploy automático)

---

## 🎯 RESUMO EXECUTIVO

O War Room é um sistema de **20+ agentes especializados** que:

1. **Validam** (VALIDATOR, CLAIMS_CHECKER, PAIN_CHECK)
2. **Pesquisam** (AUDIENCE_ANALYST, TOPIC_RESEARCHER, MARKET_SCAN)
3. **Criam** (COPYWRITER, CREATIVE_IDEATION, ANGLE_GEN)
4. **Criticam** (BRAND_GUARDIAN, CRITIC, DEVIL_GEN, CONCEPT_CRITIC)
5. **Decidem** (FILTRO_FINAL/WALL, VIABILITY, PROJECT_DIRECTOR)

Cada agente tem:
- **Personalidade definida** (não são genéricos)
- **Output estruturado** (JSON/Markdown)
- **Critérios claros** de PASS/FAIL
- **Modelo de IA específico** baseado na tarefa

O sistema garante que nada seja publicado sem passar por múltiplas camadas de validação, mantendo a qualidade e consistência da marca Brick AI.

---

*Documento gerado automaticamente pela revisão do sistema em 05/02/2026*
