# ROLES INDEX - Brick AI War Room

## Marketing Pipeline (run-marketing.sh)
| Etapa | Role File | Modelo | Funcao |
|-------|-----------|--------|--------|
| 0 | (Douglas) | - | Copia briefing pro WIP |
| 1 | BRIEF_VALIDATOR.md | Flash | Valida se briefing tem info suficiente |
| 2 | AUDIENCE_ANALYST.md | Flash | Avalia alinhamento com persona HARDCODED |
| 3 | TOPIC_RESEARCHER.md | Flash | Pesquisa tendencias e dados verificaveis |
| 4 | CLAIMS_CHECKER.md | Flash | Valida claims e estatisticas |
| 5A | COPYWRITER.md | GPT | Copy versao A (direto/persuasivo) |
| 5B | COPYWRITER.md | Flash | Copy versao B (eficiente/data-driven) |
| 5C | COPYWRITER.md | Sonnet | Copy versao C (narrativo/emocional) |
| 6 | BRAND_GUARDIAN.md | Flash | Valida consistencia de marca |
| 7 | CRITIC.md | Opus | Escolhe melhor copy, sugere ajustes |
| 8 | FILTRO_FINAL.md | Opus | Score final 0-100, aprova/rejeita |

## Ideias Pipeline (run-ideias.sh)
| Etapa | Role File | Modelo | Funcao |
|-------|-----------|--------|--------|
| 0 | (Douglas) | - | Copia ideia pro WIP |
| 1 | PAIN_CHECK.md | Flash | Valida se dor eh real |
| 2 | MARKET_SCAN.md | Flash | Analisa mercado e concorrencia |
| 3a | ANGLE_GEN.md | Sonnet | Angel: defende a ideia |
| 3b | DEVIL_GEN.md | Sonnet | Devil: ataca a ideia |
| 4 | VIABILITY.md | Opus | Score final GO/NO-GO |
| 5 | (Humano) | - | Decisao final |

## Projetos Pipeline (run-projetos.sh)
| Etapa | Role File | Modelo | Funcao |
|-------|-----------|--------|--------|
| 0 | (Douglas) | - | Copia briefing pro WIP |
| 1 | BRAND_DIGEST.md | Flash | Extrai essencia da marca |
| 2a | CREATIVE_IDEATION.md | GPT | Conceito A |
| 2b | CREATIVE_IDEATION.md | Flash | Conceito B |
| 2c | CREATIVE_IDEATION.md | Sonnet | Conceito C |
| 3 | CONCEPT_CRITIC.md | Pro | Avalia e escolhe melhor conceito |
| 4 | EXECUTION_DESIGN.md | Pro | Define direcao visual/tecnica |
| 5 | COPYWRITER.md (proposta) | GPT | Proposta comercial |
| 6 | DIRECTOR.md | Pro | Avalia execucao audiovisual |

## Roles Extras (nao usados em pipelines ativos)
- ART_DIRECTOR.md - Prompts visuais (Imagen 4 / Veo 3)
- RESEARCHER.md - Trend hunter (versao simplificada do TOPIC_RESEARCHER)

## Origem dos Roles
- Marketing: criados em roles/ diretamente
- Projetos: originais em history/marketing/roles/proposal/ (01-06), copiados pra roles/
- Ideias: originais em ideias/roles/ (03-05), copiados pra roles/
