# BRICK AI SQUAD - ARCHITECTURE v2.0

## FLUXO OTIMIZADO

```
BRIEFING
    ↓
BRIEF VALIDATOR (checklist mínimo)
    ↓
AUDIENCE ANALYST + TOPIC RESEARCHER (paralelo)
    ↓
COPYWRITER
    ↓
BRAND GUARDIAN → CRITIC (sequencial)
    ↓
APROVADO? → não → COPYWRITER (max 3x)
    ↓         → 3 falhas → ESCALA PRO HUMANO
   sim
    ↓
OUTPUT → /done
```

---

## FASE 1: VALIDAÇÃO

### 1. BRIEF VALIDATOR
- **Model:** Gemini 3 Flash
- **Função:** Checklist binário antes de gastar tokens
- **Checklist:**
  - [ ] Objetivo claro? (O que queremos alcançar)
  - [ ] Público definido? (Pra quem estamos falando)
  - [ ] Formato especificado? (Post, carrossel, vídeo, email)
  - [ ] Prazo/contexto? (Lançamento, campanha, always-on)
- **Output:** PASSA → continua | FALHA → pede mais info ao humano

---

## FASE 2: PESQUISA (Paralelo)

### 2A. AUDIENCE ANALYST
- **Model:** Gemini 3 Flash
- **Função:** Entender a persona
- **Output:**
  - Dores principais
  - Linguagem/jargão do público
  - Objeções comuns
  - O que motiva ação
  - Onde consomem conteúdo

### 2B. TOPIC RESEARCHER
- **Model:** Gemini 3 Flash
- **Função:** Fatos, dados, referências
- **Output:**
  - Dados de mercado
  - Tendências relevantes
  - Exemplos de concorrentes
  - Links/fontes verificadas

**Rodam em paralelo** → Copywriter recebe inputs estruturados de ambos.

---

## FASE 3: CRIAÇÃO

### 3. COPYWRITER
- **Model:** Gemini 3 Pro
- **Função:** Escrever o conteúdo
- **Input:** Brief + Audience Analysis + Topic Research
- **Output:** Conteúdo no formato especificado

---

## FASE 4: VALIDAÇÃO DE QUALIDADE (Sequencial)

### 4A. BRAND GUARDIAN
- **Model:** Gemini 3 Flash
- **Função:** Consistência de marca
- **Checklist:**
  - [ ] Tom "Bold & Unapologetic"?
  - [ ] Terminologia correta? (Production Enhanced, Vision over Prompt)
  - [ ] Valores refletidos? (Craft > Tech, Direção > Prompt)
  - [ ] Não soa como startup de IA?
  - [ ] Não soa corporativo/RH?
- **Output:** PASSA → vai pro Critic | FALHA → volta pro Copywriter com notas

### 4B. CRITIC (O Auditor)
- **Model:** Claude Opus
- **Função:** Qualidade geral + força de comunicação
- **Rubrica por tipo de conteúdo:**

#### Para SOCIAL (LinkedIn/Instagram):
- [ ] Gancho para scroll nos primeiros 10 palavras?
- [ ] Polêmica calculada ou consenso disfarçado?
- [ ] CTA claro e não-genérico?
- [ ] Hashtags relevantes (não spam)?

#### Para EMAIL:
- [ ] Subject line abre?
- [ ] Primeira frase mantém?
- [ ] Um CTA claro?
- [ ] Escaneável?

#### Para LANDING PAGE:
- [ ] Proposta de valor em 5 segundos?
- [ ] Prova social/credibilidade?
- [ ] Objeções endereçadas?
- [ ] CTA acima da dobra?

- **Output:** 
  - NOTA ≥ 7.5 → APROVADO
  - NOTA < 7.5 → REFAZER (com checklist do que falhou)

---

## FASE 5: LOOP DE QUALIDADE

```
Loop máximo: 3 iterações

Iteração 1: Copywriter refaz com feedback do Critic
Iteração 2: Copywriter refaz com feedback do Critic
Iteração 3: Copywriter refaz com feedback do Critic

Se ainda não aprovar:
→ ESCALA PRO HUMANO
→ Envia contexto completo:
  - Briefing original
  - Todas as versões
  - Todos os feedbacks
  - O que especificamente não passou
```

---

## CONFIGURAÇÃO DE MODELOS

| Agente | Modelo | Custo | Justificativa |
|--------|--------|-------|---------------|
| Brief Validator | Flash | $ | Checklist simples |
| Audience Analyst | Flash | $ | Pesquisa estruturada |
| Topic Researcher | Flash | $ | Busca web + síntese |
| Copywriter | Pro | $$ | Criatividade |
| Brand Guardian | Flash | $ | Checklist de marca |
| Critic | Opus | $$$ | Julgamento sofisticado |

---

## MÉTRICAS DE SUCESSO

- **Taxa de aprovação 1ª tentativa:** Meta > 40%
- **Taxa de aprovação até 3ª tentativa:** Meta > 90%
- **Escalações pro humano:** Meta < 10%
- **Tokens por entrega aprovada:** Monitorar e otimizar

---

## PRÓXIMOS PASSOS (Fase 2 - Growth)

### 5. PERFORMANCE AGENT
- **Função:** Planejar testes A/B, segmentação, budget
- **Ativa quando:** Conteúdo aprovado vai pro ar

### 6. ANALYTICS AGENT
- **Função:** Ler resultados, sugerir otimizações
- **Input:** CSVs de performance (CTR, engagement, conversão)
- **Output:** "Post X performou 3x melhor. Fazer mais assim."

---

*Última atualização: 02/02/2026 - v2.0 (Arquitetura Otimizada)*
