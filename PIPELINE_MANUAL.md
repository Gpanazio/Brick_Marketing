# 🤖 BRICK AI PIPELINE - MANUAL DE USO

## Status Atual

✅ **Pipeline IMPLEMENTADO** - Pronto para rodar automaticamente  
⚠️ **Requer:** OpenClaw com sessions_spawn habilitado

---

## Arquitetura

### Pipeline Marketing (14 etapas)

```
BRIEFING
    ↓
00. DOUGLAS → pré-processa PDFs/imagens/anexos
    ↓
01. VALIDATOR (Flash) → valida briefing
    ↓
02. AUDIENCE (Flash) → perfil do público (persona hardcoded)
    ↓
03. RESEARCHER (Flash) → pesquisa tendências/concorrentes
    ↓
04. CLAIMS (Flash) → valida estatísticas
    ↓
05A. COPY_GPT (GPT-5.2) ┐
05B. COPY_FLASH (Flash) ├─► 3 versões paralelas (temperatura 1.0)
05C. COPY_SONNET (Sonnet)┘
    ↓
06. BRAND_GUARDIANS (Flash) → valida tom + posicionamento
    ↓
07. CRITICS (GPT-5.2) → escolhe melhor versão + sugere ajustes
    ↓
07B. COPY_FINAL (Dynamic) → SÓ SE ajustes_sugeridos existir
    ↓                         (usa modelo vencedor do Critics)
08. WALL (Opus) → score final (≥80 passa, <80 reinicia)
    ↓
09. HUMAN → aprovação manual
    ↓
OUTPUT
```

---

## Como Usar

### Opção 1: Script Bash Automático

```bash
cd ~/projects/Brick_Marketing
./run-pipeline.sh marketing/briefing/MEU_BRIEFING.md marketing
```

**O que faz:**
- Executa TODAS as 14 etapas automaticamente
- Spawna sub-agentes com modelos corretos
- Implementa lógica condicional (Copy Final)
- Valida score no Wall (loop se <80)
- Para em HUMAN aguardando aprovação

**Saída:**
- Arquivos em `history/marketing/wip/{jobId}_*.{json|md}`
- Arquivo final: `{jobId}_FINAL.md`

---

### Opção 2: Douglas Manual (você chama cada etapa)

Se quiser controle total, você (Douglas) pode chamar cada agente via `sessions_spawn` tool:

```javascript
// Exemplo: Rodar etapa VALIDATOR
sessions_spawn({
    task: `Você é o BRIEF_VALIDATOR...`,
    model: "flash",
    timeout: 60,
    cleanup: "delete"
})
```

---

## Modelos por Etapa

| Etapa | Agente | Modelo | Timeout |
|-------|--------|--------|---------|
| 00 | DOUGLAS | - | manual |
| 01 | VALIDATOR | Flash | 60s |
| 02 | AUDIENCE | Flash | 90s |
| 03 | RESEARCHER | Flash | 120s |
| 04 | CLAIMS | Flash | 90s |
| 05A | COPYWRITER_A | GPT-5.2 | 180s |
| 05B | COPYWRITER_B | Flash | 120s |
| 05C | COPYWRITER_C | Sonnet | 180s |
| 06 | BRAND_GUARDIANS | Flash | 90s |
| 07 | CRITICS | GPT-5.2 | 120s |
| 07B | COPY_FINAL | Dynamic* | 180s |
| 08 | WALL | Opus | 120s |
| 09 | HUMAN | - | manual |

_*Dynamic = usa modelo vencedor do Critics (gpt/flash/sonnet)_

---

## Lógica Condicional

### Copy Final (07B)

**Executa SE:**
- `ajustes_sugeridos` existe no output do CRITICS (07)
- `ajustes_sugeridos.length > 0`

**Modelo usado:**
- Lê `modelo_vencedor` do CRITICS
- Roda COPYWRITER com esse modelo
- Aplica ajustes mantendo essência

**Pula SE:**
- Critics não sugeriu ajustes
- Copy vencedora já está perfeita

### Wall Loop (08)

**Score ≥ 80:**
- ✅ APROVADO
- Cria `{jobId}_FINAL.md`
- Segue pra HUMAN

**Score < 80:**
- ❌ REPROVADO
- Loop de rejeição (max 3 tentativas)
- Reinicia do DOUGLAS com feedback

---

## Estrutura de Arquivos

```
history/marketing/
├── briefing/           # Briefings brutos (input)
├── wip/                # Work in Progress (pipeline rodando)
│   ├── {jobId}_PROCESSED.md
│   ├── {jobId}_01_VALIDATOR.json
│   ├── {jobId}_02_AUDIENCE.json
│   ├── {jobId}_03_RESEARCH.json
│   ├── {jobId}_04_CLAIMS.json
│   ├── {jobId}_05A_COPY_GPT.md
│   ├── {jobId}_05B_COPY_FLASH.md
│   ├── {jobId}_05C_COPY_SONNET.md
│   ├── {jobId}_06_BRAND_GUARDIANS.json
│   ├── {jobId}_07_CRITICS.json
│   ├── {jobId}_07B_COPY_FINAL.md  ← SÓ SE ajustes
│   ├── {jobId}_08_WALL.json
│   └── {jobId}_FINAL.md           ← Aguardando aprovação
└── done/               # Campanhas aprovadas (post-HUMAN)
```

---

## Próximos Passos

1. **Testar com briefing real:**
   ```bash
   echo "# BRIEFING TESTE\n\nProduto: X\nObjetivo: Y" > marketing/briefing/teste.md
   ./run-pipeline.sh marketing/briefing/teste.md
   ```

2. **Monitorar execução:**
   - Logs aparecem no terminal
   - Arquivos salvos em `wip/` em tempo real

3. **Aprovar no War Room:**
   - Acesse http://localhost:3000
   - Navegue até projeto
   - Clique APROVAR ou REVISAR

4. **Iterar:**
   - Se WALL reprovar, ajustar briefing
   - Se HUMAN reprovar, usar botão REVISAR

---

## Troubleshooting

### Pipeline não roda

**Sintoma:** Script trava ou falha  
**Causa:** OpenClaw Gateway offline  
**Solução:** Verificar `openclaw status`

### Agentes não geram arquivos

**Sintoma:** Etapas completam mas arquivos não aparecem  
**Causa:** Caminho errado nos prompts  
**Solução:** Verificar `$WIP_DIR` no script

### Score sempre < 80

**Sintoma:** Loop infinito no Wall  
**Causa:** Briefing mal formulado  
**Solução:** Refinar briefing, adicionar mais contexto

---

## Debug Mode

Para ver exatamente o que cada agente está fazendo:

```bash
# Adicionar flag -x pra debug bash
bash -x ./run-pipeline.sh marketing/briefing/teste.md
```

Ou rodar etapa por etapa manualmente via `sessions_spawn`.

---

**Criado em:** 04/02/2026  
**Versão:** 1.0  
**Autor:** Douglas (Brick AI Orchestrator)
