# IDEATION: Feedback UX Redesign

## Análise do Problema

O feedback atual pede pro usuário fazer o trabalho do sistema:
- Categorizar o problema (conceito? execução? marca? dados?)
- Isso requer conhecer a arquitetura interna
- Fricção alta = feedback pior ou inexistente

## Princípio de Design
**O usuário diz O QUE está errado, o sistema descobre PRA QUEM mandar.**

---

## PROPOSTA A: Feedback por Sentimento + Texto Livre

O mais simples possível. Três botões de sentimento + campo de texto.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Como está esse conteúdo?                                   │
│                                                             │
│  [😐 Quase]    [🚫 Não]    [✓ Bom]                         │
│                                                             │
│  O que precisa mudar?                                       │
│  [___________________________________________________]     │
│                                                             │
│                                    [Enviar]  [Aprovar →]   │
└─────────────────────────────────────────────────────────────┘
```

**Roteamento:** Sistema analisa o texto do feedback e roteia automaticamente:
- Menciona "ideia", "conceito", "mensagem" → COPYWRITER
- Menciona "tom", "voz", "marca", "brick" → BRAND GUARDIAN
- Menciona "cafona", "genérico", "execução" → DIRECTOR
- Menciona "dados", "números", "fonte" → RESEARCHER

**Prós:** Zero fricção, natural
**Contras:** Roteamento pode errar

---

## PROPOSTA B: Checklist Invertido

Em vez de "o que está errado", perguntar "o que está certo" e deduzir.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  O que está funcionando?                                    │
│                                                             │
│  [✓] A ideia/mensagem                                      │
│  [ ] O tom/voz da Brick                                    │
│  [✓] A qualidade da execução                               │
│  [✓] Os dados/informações                                  │
│                                                             │
│  → Problema detectado: TOM/VOZ                             │
│                                                             │
│  O que ajustar no tom?                                      │
│  [Tá arrogante demais, precisa ser mais_______________]    │
│                                                             │
│                                    [Enviar]  [Aprovar →]   │
└─────────────────────────────────────────────────────────────┘
```

**Prós:** Roteamento preciso, UX de "checklist" é familiar
**Contras:** 4 cliques antes de escrever

---

## PROPOSTA C: Feedback Contextual Inline

Clicar em partes específicas do conteúdo pra comentar.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  "Seu concorrente acabou de lançar um comercial que        │
│   parece da Nike. [💬 +2 comentários]                       │
│                                                             │
│   Custou R$15 mil. Ele usou IA. [💬 verificar dado]        │
│                                                             │
│   Você ainda está orçando com produtoras tradicionais?"    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  [+ Adicionar comentário]              [Aprovar Tudo →]    │
└─────────────────────────────────────────────────────────────┘
```

**Prós:** Feedback preciso, contexto claro
**Contras:** Mais complexo de implementar, nem todo conteúdo é texto

---

## PROPOSTA D: Barra de Qualidade + Único Campo

Uma barra visual de qualidade + campo único de feedback.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Qualidade geral:                                           │
│  [====|================] 75%                                │
│   Reprovar  Ajustar  Aprovar                                │
│                                                             │
│  Se não está 100%, o que falta?                            │
│  [Execução tá cafona, parece vídeo de RH_____________]     │
│                                                             │
│  💡 Detectado: problema de EXECUÇÃO → vai pro DIRECTOR     │
│                                                             │
│                                           [Enviar Feedback] │
└─────────────────────────────────────────────────────────────┘
```

**Prós:** Visual intuitivo, roteamento automático com transparência
**Contras:** Barra de % pode parecer arbitrária

---

## RECOMENDAÇÃO

**PROPOSTA A (Sentimento + Texto Livre)** é a mais intuitiva e rápida.

O roteamento automático por análise de texto funciona porque:
1. Gabriel escreve naturalmente o que está errado
2. Keywords são suficientes pra 90% dos casos
3. Se errar, o agente que receber pode redirecionar

Fallback: se o sistema não conseguir detectar, pergunta uma vez só.
