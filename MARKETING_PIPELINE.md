# Marketing Pipeline — Estado Atual

Atualizado: 2026-02-14

## Objetivo

Transformar briefing em copy final aprovada, com controle de qualidade por stages.

## Execução

O pipeline roda via `lib/pipeline-runner.js` (modo `marketing`), disparado por:

```bash
POST /api/run-autonomous
```

Sem `openclaw agent` no fluxo principal.

---

## Etapas

1. **VALIDATOR**
   - valida briefing e estrutura mínima
   - output: `*_01_VALIDATOR.json`

2. **AUDIENCE**
   - analisa aderência de público e direcionamento
   - recebe `BRAND_GUIDE.md`
   - output: `*_02_AUDIENCE.json`

3. **RESEARCH**
   - pesquisa contexto/referências
   - output: `*_03_RESEARCH.json`

4. **CLAIMS**
   - valida claims e risco de hype/alucinação
   - output: `*_04_CLAIMS.json`

5. **COPY_A / COPY_B / COPY_C** (paralelo)
   - 3 versões de copy
   - todas recebem `BRAND_GUIDE.md`
   - outputs: `*_05A_COPY_GPT.md`, `*_05B_COPY_FLASH.md`, `*_05C_COPY_SONNET.md`

6. **COPY_SENIOR**
   - escolhe melhor copy e gera `copy_revisada`
   - recebe `BRAND_GUARDIAN.md` (referência obrigatória)
   - output: `*_06_COPY_SENIOR.json`

7. **WALL**
   - auditoria final (score + veredito)
   - recebe `BRAND_GUARDIAN.md` (referência obrigatória)
   - output: `*_07_WALL.json`

8. **LOOP automático (se necessário)**
   - se score do WALL < threshold, volta para COPY_SENIOR
   - versões salvas como `*_06_COPY_SENIOR_vN.json` e `*_07_WALL_vN.json`

9. **FINAL**
   - consolida output final
   - output: `*_FINAL.md`

---

## Injeção de Brand (fonte da verdade)

- `roles/BRAND_GUIDE.md`
  - AUDIENCE
  - COPYWRITERs

- `roles/BRAND_GUARDIAN.md`
  - COPY_SENIOR (principal e loops)
  - WALL

---

## Como cada etapa sabe o que fazer

Cada chamada contém:
- **system prompt** = role file da etapa (+ brand refs quando aplicável)
- **user prompt** = contexto runtime (briefing + outputs anteriores)
- **contrato** = JSON/MD esperado

A função `callWithRetry(...)` aplica retry, valida JSON e troca para fallback na última tentativa.

---

## Arquivos principais

- `lib/pipeline-runner.js`
- `roles/BRIEF_VALIDATOR.md`
- `roles/AUDIENCE_ANALYST.md`
- `roles/TOPIC_RESEARCHER.md`
- `roles/CLAIMS_CHECKER.md`
- `roles/COPYWRITER.md`
- `roles/COPY_SENIOR.md`
- `roles/FILTRO_FINAL.md`
- `roles/BRAND_GUIDE.md`
- `roles/BRAND_GUARDIAN.md`

---

## Observações

- `BRAND_DIGEST` pertence ao modo **projetos**, não marketing.
- Se telemetria mostrar modelo antigo (`free`), tratar como cache/UI desatualizada.
