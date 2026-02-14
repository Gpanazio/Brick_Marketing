# STATUS — War Room

Atualizado: 2026-02-14

## Estado geral

✅ Operacional em produção com pipeline autônomo Node.

## Verdades atuais

- Execução principal via:
  - `server.js`
  - `lib/pipeline-runner.js`
- Não depende de `openclaw agent` para rodar etapas.
- Modelos free removidos do fluxo principal.
- Marketing com injeção de marca correta:
  - `BRAND_GUIDE` em Audience + Copywriters
  - `BRAND_GUARDIAN` em Wall + Copy Senior (inclusive loop)

## Endpoints ativos

- `POST /api/run-autonomous`
- `GET /api/pipeline-status`
- `GET /api/models`
- `GET /api/openrouter-test`

## Mapeamento por modo

- **marketing:** VALIDATOR → AUDIENCE → RESEARCH → CLAIMS → COPY A/B/C → COPY_SENIOR → WALL → FINAL
- **projetos:** BRAND_DIGEST → IDEATION A/B/C → CONCEPT_CRITIC → EXECUTION_DESIGN → PROPOSAL → DIRECTOR
- **ideias:** PAIN_CHECK → MARKET_SCAN → ANGEL/DEVIL → VIABILITY → DECISION
- **originais:** TRIAGE → CREATIVE_DOCTOR → SALES_SHARK → ANGEL → DEMON → DOCTOR_FINAL

## Pendente (curto prazo)

- [ ] Revisar docs históricos (CHANGELOG/ROADMAP) para marcar claramente o que é legado.
- [ ] Opcional: remover scripts bash legados `run-*.sh` quando não houver mais dependência operacional.

## Nota

Se aparecer referência antiga a OpenClaw em docs, tratar como legado e alinhar para o runner autônomo.
