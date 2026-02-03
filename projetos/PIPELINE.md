# PIPELINE DE PROJETOS (v2.0)

## Fluxo Principal

```
BRIEFING
    ↓
DOUGLAS (processa anexos, expande briefing)
    ↓
01_BRAND_DIGEST (Gemini Flash)
    Extrai: identidade, tom, valores, histórico
    ↓
02_CREATIVE_IDEATION (Claude Sonnet)
    Gera: 3 conceitos criativos
    ↓
03_CONCEPT_CRITIC (Gemini Flash)
    Avalia: conceitos → aprova/reprova
    ↓
[HUMAN CHECKPOINT] → Escolha do conceito
    ↓
04_EXECUTION_DESIGN (Gemini Pro) ← NOVO
    Define: direção visual, câmera, luz, frame icônico
    Entrega: constraints para o copywriter
    ↓
05_COPYWRITER (Claude Sonnet)
    Escreve: roteiro dentro das constraints visuais
    ↓
06_DIRECTOR (Gemini Pro)
    Avalia: execução → APROVAR / REFINAR / REPENSAR
    ↓
    Se REPENSAR → volta pro 04_EXECUTION_DESIGN
    Se REFINAR → ajustes pontuais
    Se APROVAR → segue
    ↓
[OUTPUT FINAL]
```

## Modelos por Etapa

| Etapa | Modelo | Motivo |
|-------|--------|--------|
| Brand Digest | Gemini Flash | Extração, não criação |
| Creative Ideation | Claude Sonnet | Criatividade |
| Concept Critic | Gemini Flash | Triagem rápida |
| Execution Design | Gemini Pro | Direção visual |
| Copywriter | Claude Sonnet | Roteiro com craft |
| Director | Gemini Pro | Avaliação de execução |

## Regra de Retorno

- **DIRECTOR reprova conceito?** → Volta pro IDEATION (raro, conceito já foi aprovado)
- **DIRECTOR reprova execução?** → Volta pro EXECUTION_DESIGN
- **DIRECTOR pede refinamento?** → COPYWRITER ajusta

## Diferença vs Marketing

| Aspecto | Marketing | Projetos |
|---------|-----------|----------|
| Output | Posts, copies, anúncios | Propostas criativas, roteiros |
| EXECUTION_DESIGN | Não tem | TEM (define direção visual) |
| DIRECTOR foco | Copy/texto | Execução audiovisual |
| Entregável | Texto aprovado | Proposta completa com tratamento |
