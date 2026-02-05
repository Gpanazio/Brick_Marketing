# War Room de Criacao - Arquitetura

## Visao Geral

Sistema de pipelines de criacao com agentes de IA para a Brick (produtora de video).
3 modos: Marketing (conteudo), Projetos (propostas criativas), Ideias (validacao rapida).

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
                                       BRAND_GUARDIAN -> CRITIC -> WALL -> [HUMANO]
```
Modelos: Flash (etapas 1-4,6), GPT+Flash+Sonnet (etapa 5), Opus (etapas 7-8)

### Projetos (run-projetos.sh)
```
BRIEFING -> DOUGLAS -> BRAND_DIGEST -> IDEATION_GPT ──────┐
                                       IDEATION_FLASH ────┤
                                       IDEATION_SONNET ───┘
                                                           |
                       CONCEPT_CRITIC -> EXECUTION_DESIGN -> COPYWRITER -> DIRECTOR -> [HUMANO]
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
- {JOB_ID}_07_CRITICS.json
- {JOB_ID}_08_WALL.json

### Projetos
- {JOB_ID}_BRIEFING_INPUT.md
- {JOB_ID}_BRAND_DIGEST.md
- {JOB_ID}_IDEATION_GPT.md
- {JOB_ID}_IDEATION_FLASH.md
- {JOB_ID}_IDEATION_SONNET.md
- {JOB_ID}_CONCEPT_CRITIC.md
- {JOB_ID}_EXECUTION_DESIGN.md
- {JOB_ID}_COPYWRITER.md
- {JOB_ID}_DIRECTOR.md

### Ideias
- {JOB_ID}_RAW_IDEA.md
- {JOB_ID}_PAIN_CHECK.json
- {JOB_ID}_MARKET_SCAN.md
- {JOB_ID}_ANGLE_GEN.md
- {JOB_ID}_DEVIL_GEN.md
- {JOB_ID}_VIABILITY.json

## Como Adicionar Nova Etapa

1. Criar role file em roles/ seguindo o padrao existente
2. Adicionar etapa no script bash correspondente (openclaw agent)
3. Adicionar node no frontend (public/index.html) com titulo, label, modelo
4. Adicionar fileMapping no frontend pra conectar arquivo ao node
5. Atualizar roles/INDEX.md
6. Git push (Railway faz deploy automatico)
