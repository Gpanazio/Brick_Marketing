# Diagnóstico War Room - 2026-02-06 23:20

## 🔴 PROBLEMA CRÍTICO

**SIGKILL em processos de pipeline**

```
System: [2026-02-06 23:15:10 GMT-3] Exec failed (mellow-c, signal SIGKILL)
```

**O que está acontecendo:**
- Runner.js executa `run-pipeline.sh` via `execAsync`
- Script inicia normalmente (log mostra "Executando script")
- Processo morre com SIGKILL antes de terminar Etapa 1
- Nenhum arquivo WIP é gerado

**Evidências:**
1. Log do runner: última entrada é "Executando script" às 02:13:38
2. Nenhum arquivo em `history/marketing/wip/1770403445630*`
3. Teste manual também retorna SIGKILL após 30s

**Possíveis causas:**
1. **Timeout OpenClaw:** exec() tem limite de tempo (provavelmente 30s)
2. **OOM Killer:** Processo consome muita memória (improvável)
3. **Política de segurança:** OpenClaw matando processos filhos longos

---

## ✅ O QUE ESTÁ FUNCIONANDO

### Runner.js
- ✅ Conecta ao Railway via Socket.IO
- ✅ Entra na room 'runner'
- ✅ GET /api/pending funciona (encontrou 2 briefings)
- ✅ Transforma pending em jobs internos
- ✅ Enfileira jobs corretamente
- ✅ Salva briefing local
- ✅ Inicia execução do script
- ❌ **Script morre antes de terminar**

### Scripts Bash
- ✅ Sintaxe correta
- ✅ Validação built-in (validate_json, retry)
- ✅ Logs estruturados
- ❌ **Não consegue rodar até o fim (SIGKILL)**

### Infraestrutura
- ✅ Railway online (https://brickmarketing-production.up.railway.app)
- ✅ Socket.IO servidor OK
- ✅ API endpoints funcionam
- ✅ Arquivos sincronizam corretamente (quando gerados)

---

## 🔧 SOLUÇÕES POSSÍVEIS

### Opção 1: Aumentar Timeout OpenClaw
```javascript
// runner.js (linha 209)
const { stdout, stderr } = await execAsync(cmd, {
  cwd: CONFIG.WORKSPACE,
  maxBuffer: 10 * 1024 * 1024,
  timeout: 600000, // 10min → JÁ ESTÁ ASSIM!
});
```

**Problema:** OpenClaw pode estar ignorando timeout do child_process e aplicando o próprio.

### Opção 2: Background Execution
```javascript
// Em vez de execAsync (aguarda término)
const { exec } = require('child_process');

function executeScriptBackground(scriptPath, args = []) {
  const fullPath = path.join(CONFIG.WORKSPACE, scriptPath);
  const cmd = `bash ${fullPath} ${args.join(' ')}`;
  
  return new Promise((resolve, reject) => {
    const child = exec(cmd, {
      cwd: CONFIG.WORKSPACE,
      maxBuffer: 10 * 1024 * 1024,
      detached: true, // ← KEY: desacopla do parent
    });
    
    child.unref(); // Permite parent morrer sem matar child
    
    // Polling: checar se arquivos foram gerados
    const pollInterval = setInterval(async () => {
      const wipDir = path.join(CONFIG.WORKSPACE, `history/${mode}/wip`);
      const files = await fs.readdir(wipDir);
      const hasFinal = files.some(f => f.startsWith(jobId) && f.includes('FINAL'));
      
      if (hasFinal) {
        clearInterval(pollInterval);
        resolve({ code: 0 });
      }
    }, 5000); // Check a cada 5s
    
    // Timeout fallback (10min)
    setTimeout(() => {
      clearInterval(pollInterval);
      reject(new Error('Pipeline timeout após 10min'));
    }, 600000);
  });
}
```

### Opção 3: Spawn Instead of Exec
```javascript
const { spawn } = require('child_process');

function executeScriptSpawn(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args], {
      cwd: CONFIG.WORKSPACE,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'], // stdin ignore, stdout/stderr pipe
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString()); // Real-time output
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}
```

### Opção 4: Sub-Agent para Pipelines Longos
```javascript
// Em vez de exec direto, usa sessions_spawn
async function executeViaSubAgent(mode, jobId, briefingContent) {
  const taskMessage = `
Executar pipeline ${mode} para job ${jobId}.

Briefing:
${briefingContent}

Execute:
cd /Users/gabrielpanazio/projects/Brick_Marketing
bash run-pipeline.sh history/${mode}/briefing/${jobId}.txt --mode=${mode}

Aguarde término completo. Não aborte.
  `;
  
  // Spawn sub-agent com timeout alto
  const result = await sessions_spawn({
    task: taskMessage,
    agentId: 'flash', // Agente barato para orquestração
    runTimeoutSeconds: 600, // 10min
    cleanup: 'delete', // Limpa sessão após
  });
  
  return result;
}
```

---

## 🎯 RECOMENDAÇÃO

**Testar na ordem:**

1. **Spawn (Opção 3)** → Mais robusto que exec, menos overhead que sub-agent
2. **Background + Polling (Opção 2)** → Se spawn falhar, desacopla completamente
3. **Sub-Agent (Opção 4)** → Última opção (mais caro, mas garante execução)

**Próximo passo imediato:**
Implementar `executeScriptSpawn()` no runner.js e testar com o briefing pendente.

---

## 📋 CHECKLIST PRÉ-TESTE

Antes de testar qualquer solução:

- [ ] Verificar se watcher.js antigo está rodando (conflito?)
- [ ] Checar ulimit -n (file descriptors)
- [ ] Verificar memória disponível (free -h)
- [ ] Confirmar permissões de execução nos scripts
- [ ] Testar run-marketing.sh FORA do OpenClaw (terminal direto)

---

## 📊 EXPECTATIVA REALISTA

**Se resolver o SIGKILL:**
- Pipeline marketing: ~2-4min (8 etapas)
- Pipeline projetos: ~1-3min (6 etapas)
- Pipeline ideias: ~1-2min (5 etapas)

**Cada etapa:**
- Flash: ~5-15s
- Pro: ~10-20s
- GPT/Sonnet: ~15-30s
- Opus: ~20-40s

**Total esperado Marketing:** ~3min (sem loops)

---

## 🚨 BLOQUEADOR ATUAL

**Sem resolver SIGKILL, nada funciona.**

Event-driven system está correto, mas precisa conseguir rodar os scripts até o fim.

---

**Status:** Sistema 95% implementado, 0% funcional devido a SIGKILL.
**Prioridade:** Resolver execução de scripts longos (spawn ou sub-agent).
