# CHANGELOG - Brick Marketing War Room

## v2.1 - 2026-02-06

### 🚀 Context-Summarizer Integration
**Economia de ~45% no custo por run** ($0.55 → $0.30)

**Implementação:**
- Context-summarizer integrado em 3 pontos críticos do pipeline Marketing
- Etapa 5 (Copywriters): Contexto resumido de ~12k → ~4k tokens (66% economia)
- Etapa 6 (Copy Senior): Copies resumidas de ~8k → ~3k tokens (62% economia)
- Etapa 7 (Wall/Opus): Input reduzido de ~10k → ~2k tokens (**80% economia**)

**Funções utilizadas:**
- `create_marketing_context()` - Resumo estruturado do pipeline
- `summarize_briefing()` - Trunca briefing mantendo essência
- `summarize_json()` - Extrai apenas campos críticos

**Maior impacto:** Opus (etapa 7) reduziu de $0.45 → $0.24 por run

### 🧹 Douglas Clarification
**Correção conceitual:** Douglas não é uma etapa do script bash — é processamento **manual** via OpenClaw.

**Mudanças:**
1. **run-marketing.sh:**
   - Removido fake `cp` (linhas 71-79)
   - Adicionado comentário explicativo
   - Versão: v2.0 → v2.1

2. **README.md:**
   - Seção "PRÉ-PIPELINE: Douglas (Manual)" criada
   - Diagrama atualizado: `[DOUGLAS]` com badge MANUAL
   - Fluxo completo documentado

3. **roles/INDEX.md:**
   - Douglas destacado como pré-pipeline manual
   - Data de atualização: 05/02 → 06/02

4. **public/index.html:**
   - Node Douglas: label `Orchestrator` → `Pre-Pipeline (Manual)`
   - Model: `CORE` → `OPUS 4.6`
   - Badge laranja `MANUAL` adicionado
   - Tooltip atualizado: "Pré-processamento via OpenClaw session"
   - 3 diagramas (Marketing/Projetos/Ideias) corrigidos

### 📚 Documentação
- Seção técnica "Context-Summarizer" adicionada ao README
- Tabela comparativa de custos (v2.0 vs v2.1)
- Tabela de economia de tokens por etapa

---

## v3.0 - 2026-02-06

### Pipeline Projetos
**Loop Automático Execution ↔ Director**
- Implementado loop de até 3 rodadas entre Execution Design e Director
- Vereditos: APROVAR (85-100), REFINAR (60-84), REPENSAR (0-59)
- Arquivos versionados: `_v2.json`, `_v3.json`
- Feedback injetado automaticamente nas iterações
- FINAL.md gerado quando Director aprova

**Correções Críticas:**
- Removido flag `--model` inexistente (quebrava GPT/Sonnet)
- Renomeado COPYWRITER → PROPOSAL (match com frontend)
- Adicionadas timing functions em `lib/pipeline-utils.sh`
- Fix temperatura no GPT-5.2-Codex (params vazios)

**Sync Automático:**
- 6 pontos de sync ao longo do pipeline
- Background calls para não bloquear execução
- Sync sob demanda via `sync-to-railway.sh`

### Frontend

**Sistema de Revisão Visual v2.0:**
- Nós dinâmicos detectam `REVISAO_\d+.md` automaticamente
- Posicionamento ao lado do HUMAN (alinhamento perfeito)
- Linhas laranjas pontilhadas conectando HUMAN → REVISÃO
- Botões: ✓ APROVAR | ✗ REJEITAR
- Fix crítico: `requestAnimationFrame` duplo para garantir render antes de desenhar linhas

**UI Improvements:**
- Spacing cards Ideation: 180px → 550px (gap 230px)
- Director output com badges coloridas (APROVAR/REFINAR/REPENSAR)
- FINAL.md formatado para aprovação humana
- Scheme completo para Marketing e Projetos

**Decisão de Design (Gabriel):**
- Nós de loop automático (Copy Senior v2/v3, Wall v2/v3) **escondidos**
- Loop funciona no backend mas não aparece visualmente
- Mantém UI limpa, foco no resultado final

### Brand Guide v8.0
- Integração direta nos copywriters (etapa 5)
- Eliminado Brand Guardian (etapa 6 removida)
- 8 etapas → 7 etapas (mais rápido, mais barato)
- Tom: "The Cold Director" (seco, autoritário, técnico)

### Documentação
- REVISION_SYSTEM.md completo
- Scheme Marketing atualizado
- Scheme Projetos v3.0 criado
- CHANGELOG criado

## v2.0 - 2026-02-05

### Pipeline Marketing
**Loop Automático Copy Senior ↔ Wall:**
- Max 3 iterações quando score < 80
- Modelo vencedor julga revisões
- Arquivos: `_v2.json`, `_v3.json`

**Melhorias:**
- Libs compartilhadas (`pipeline-utils.sh`, `context-summarizer.sh`)
- Retry com exponential backoff
- Logs persistentes (não mais descartados)
- Estimativa de custo corrigida (input + output tokens)

### Frontend
- Socket.IO para auto-refresh
- Persistência de modo (hash + localStorage)
- Nodes visuais para loop Copy Senior ↔ Wall
- Linhas de conexão angular com pulse

## v1.0 - 2026-02-04

### Initial Release
- Pipeline Marketing: 8 etapas
- Pipeline Projetos: 6 etapas
- Pipeline Ideias: 5 etapas
- War Room visual com drag & drop
- Integração Railway + watcher local
