# War Room de Criacao - Arquitetura

## Visao Geral

Sistema de pipelines de criacao com agentes de IA para a Brick (produtora de video).
3 modos: Marketing (conteudo interno da Brick), Projetos — Clientes (propostas criativas para clientes, usando a marca do CLIENTE), Ideias (validacao rapida).

## Fluxo

```
[Usuario] -> Cria briefing no site (Railway)
     |
[Watcher.js] -> Polling a cada 10s, detecta briefing novo
     |
[run-pipeline.sh] -> Dispatcher, detecta modo pelo path
     |
     ├── marketing -> run-marketing.sh (8 etapas)
     ├── projetos  -> run-projetos.sh  (6 etapas)
     └── ideias    -> run-ideias.sh    (5 etapas)
     |
[openclaw agent] -> Roda cada etapa sincronamente
     |
[WIP files] -> Salvos em history/{modo}/wip/
     |
[Watcher.js] -> Sincroniza arquivos pro Railway via API
     |
[Frontend] -> Nodes acendem conforme arquivos aparecem
```

## Pipelines

### Marketing (run-marketing.sh)
```
BRIEFING -> DOUGLAS -> VALIDATOR -> AUDIENCE -> RESEARCHER -> CLAIMS
                                                                |
                                         COPYWRITER_GPT ──────┐|
                                         COPYWRITER_FLASH ────┤|
                                         COPYWRITER_SONNET ───┘|
                                                                |
                                       BRAND_GUARDIAN -> COPY_SENIOR -> WALL -> [HUMANO]
```
Modelos: Flash (etapas 1-4,6), GPT+Flash+Sonnet (etapa 5), GPT (etapa 7 - Copy Senior), Opus (etapa 8)

### Projetos — Clientes (run-projetos.sh)
**Usa marca do CLIENTE (não da Brick). Brand Digest extrai DNA do briefing do cliente.**
```
BRIEFING DO CLIENTE -> DOUGLAS -> BRAND_DIGEST -> IDEATION_GPT ──────┐
                                                   IDEATION_FLASH ────┤
                                                   IDEATION_SONNET ───┘
                                                                       |
                       CONCEPT_CRITIC -> EXECUTION_DESIGN -> PROPOSAL -> DIRECTOR -> [HUMANO]
```
Modelos: Flash (etapa 1), GPT+Flash+Sonnet (etapa 2), Pro (etapas 3-4,6), GPT (etapa 5)

### Ideias (run-ideias.sh)
```
RAW_IDEA -> DOUGLAS -> PAIN_CHECK -> MARKET_SCAN -> ANGLE_GEN (angel) ─┐
                                                    DEVIL_GEN (devil) ─┘
                                                           |
                                                       VIABILITY -> [HUMANO]
```
Modelos: Flash (etapas 1-2), Sonnet (etapa 3), Opus (etapa 4)

## Componentes

### Scripts Bash (run-*.sh)
- Usam `openclaw agent --session-id ... --message ... --timeout ... --json`
- Cada etapa injeta o role file completo + contexto das etapas anteriores
- Fallback com placeholder se agente falhar
- NAO usam `set -e` (pipeline continua mesmo com falha parcial)

### Role Files (roles/)
- 20 arquivos .md com prompts detalhados
- Ver roles/INDEX.md para mapeamento completo
- Cada role define: modelo sugerido, objetivo, framework, output esperado, regras

### Watcher (watcher.js)
- Polling Railway a cada 10s procurando briefings novos
- State: .watcher_state_v4.json (formato: {processedBriefings: {name: mtime}})
- Detecta re-run via mudanca de mtime
- Sincroniza arquivos WIP/done pro Railway via POST /api/result
- Logs: /tmp/watcher.log
- Iniciar: `cd ~/projects/Brick_Marketing && RAILWAY_URL=... node watcher.js`

### Frontend (public/index.html)
- Nodes coloridos por modelo (GPT=verde, Flash=azul, Pro=cyan, Sonnet=amber, Opus=roxo)
- fileMapping conecta nomes de arquivo a nodes visuais
- Polling /api/state a cada 5s

### Backend Railway (server.js)
- API: GET /api/state, POST /api/result, POST /api/move, DELETE /api/file
- API Key: X-API-Key header
- Serve frontend estatico

## Arquivos de Output

Padrao: `{JOB_ID}_{ROLE}.{json|md}`

### Marketing
- {JOB_ID}_PROCESSED.md
- {JOB_ID}_01_VALIDATOR.json
- {JOB_ID}_02_AUDIENCE.json
- {JOB_ID}_03_RESEARCH.json
- {JOB_ID}_04_CLAIMS.json
- {JOB_ID}_05A_COPY_GPT.md
- {JOB_ID}_05B_COPY_FLASH.md
- {JOB_ID}_05C_COPY_SONNET.md
- {JOB_ID}_06_BRAND_GUARDIANS.json
- {JOB_ID}_07_COPY_SENIOR.json
- {JOB_ID}_08_WALL.json

### Projetos — Clientes
- {JOB_ID}_BRIEFING_INPUT.md
- {JOB_ID}_BRAND_DIGEST.json
- {JOB_ID}_IDEATION_GPT.md
- {JOB_ID}_IDEATION_FLASH.md
- {JOB_ID}_IDEATION_SONNET.md
- {JOB_ID}_CONCEPT_CRITIC.json
- {JOB_ID}_EXECUTION_DESIGN.json
- {JOB_ID}_PROPOSAL.md
- {JOB_ID}_DIRECTOR.json

### Ideias
- {JOB_ID}_RAW_IDEA.md
- {JOB_ID}_PAIN_CHECK.json
- {JOB_ID}_MARKET_SCAN.md
- {JOB_ID}_ANGLE_GEN.json
- {JOB_ID}_DEVIL_GEN.json
- {JOB_ID}_VIABILITY.json

## Estimativa de Custos

### Endpoint: GET /api/estimate?mode=marketing|projetos|ideias

Retorna breakdown por step com input + output tokens e custo estimado.

### Precos por Modelo (USD por 1M tokens)
| Modelo | Agent  | Output   | Input    |
|--------|--------|----------|----------|
| Flash  | flash  | $0.40    | $0.075   |
| Pro    | pro    | $10.00   | $1.25    |
| GPT    | gpt    | $10.00   | $2.50    |
| Sonnet | sonnet | $15.00   | $3.00    |
| Opus   | opus   | $75.00   | $15.00   |

### Custo Estimado por Pipeline
| Pipeline   | Steps | Custo Total | Maior Gasto                         |
|-----------|-------|-------------|-------------------------------------|
| Marketing | 10    | ~$0.35      | Opus: WALL (~$0.25) + GPT: Copy Senior (~$0.05) |
| Projetos  | 8     | ~$0.16      | GPT + Sonnet Ideation (~$0.06)      |
| Ideias    | 5     | ~$0.22      | Opus: VIABILITY (~$0.16)            |

**Nota:** Custo Marketing foi reduzido de ~$0.55 para ~$0.35 após substituição de Opus (CRITIC) por GPT (COPY_SENIOR) na etapa 7.

### Configuracao
- `config/constants.js`: MODEL_COSTS_OUTPUT, MODEL_COSTS_INPUT, AVG_TOKENS_PER_STEP, AVG_INPUT_TOKENS_PER_STEP
- Input tokens crescem ao longo do pipeline (contexto acumulado: 2k na primeira etapa, 12k na ultima)
- Margem de erro: ±30%

### IMPORTANTE
As definicoes de pipeline no endpoint DEVEM espelhar exatamente os scripts `run-*.sh`.
Se mudar um script, atualizar o endpoint tambem.

## Como Adicionar Nova Etapa

1. Criar role file em roles/ seguindo o padrao existente
2. Adicionar etapa no script bash correspondente (openclaw agent)
3. Adicionar node no frontend (public/index.html) com titulo, label, modelo
4. Adicionar fileMapping no frontend pra conectar arquivo ao node
5. Atualizar roles/INDEX.md
6. Git push (Railway faz deploy automatico)
