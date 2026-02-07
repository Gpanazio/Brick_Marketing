# War Room - Status do Sistema

**Última atualização:** 2026-02-06 23:20

---

## ✅ COMPONENTES PRONTOS

### 1. Runner.js (~400 linhas)
- **Socket.IO:** Conectado ao Railway ✅
- **Dispatch:** action+mode → script correto ✅
- **Queue:** FIFO com MAX_CONCURRENT=1 ✅
- **Retry:** Catch-up via GET /api/pending ✅
- **Sync:** POST /api/result após completion ✅
- **Verificação:** Validação de integridade de cada arquivo JSON/MD ✅
- **Logging:** JSON estruturado → console + runner.log ✅

### 2. Scripts de Pipeline
- **run-pipeline.sh:** Dispatcher (detecta modo) ✅
- **run-marketing.sh:** 8 etapas + validação built-in ✅
- **run-projetos.sh:** 6 etapas + DIRECTOR loop automático ✅
- **run-ideias.sh:** 5 etapas ✅
- **run-reloop.sh:** Marketing feedback (Copy Senior ↔ Wall) ✅
- **run-reloop-projetos.sh:** Projetos feedback (HUMAN → PROPOSAL) ✅

### 3. Validação Built-in (pipeline-utils.sh)
- **validate_json():** Checa sintaxe via jq
- **create_json_placeholder():** Fallback se etapa falha
- **run_agent():** 3 tentativas com retry automático
- **Logs:** Cada etapa gera log detalhado

---

## 🔄 FLUXO COMPLETO

### Novo Briefing
1. **Frontend:** Usuário cria briefing → POST /api/briefing
2. **Railway:** Salva em history/{mode}/briefing/
3. **Railway:** `io.to('runner').emit('pipeline:run', {action:'briefing', mode, jobId, content})`
4. **Runner.js:** Recebe evento → enfileira job
5. **Runner.js:** Executa `./run-pipeline.sh <file> --mode=<mode>`
6. **Script:** Roda 8 etapas (marketing) com retry+validação
7. **Runner.js:** Verifica integridade de cada arquivo gerado
8. **Runner.js:** POST /api/result para cada arquivo → Railway sync
9. **Frontend:** Socket.IO push → atualiza nodes em real-time

### Rerun (Job Existente)
1. **Frontend:** Usuário clica RERUN → POST /api/rerun
2. **Railway:** `io.to('runner').emit('pipeline:run', {action:'rerun', mode, jobId})`
3. **Runner.js:** Recebe → busca briefing existente
4. **Runner.js:** Executa `./run-pipeline.sh <file> --mode=<mode>`
5. *(mesmos passos 6-9 acima)*

### Feedback (Revisar Resultado)
1. **Frontend:** Usuário submete feedback → POST /api/feedback
2. **Railway:** `io.to('runner').emit('pipeline:run', {action:'feedback', mode, jobId, target})`
3. **Runner.js:** Recebe → dispatch baseado no modo:
   - **Marketing:** `./run-reloop.sh <jobId>`
   - **Projetos:** `./run-reloop-projetos.sh <jobId> <target>`
   - **Ideias:** Ignora (sem feedback loop)
4. **Script:** Modelo campeão revisa com feedback humano
5. **Runner.js:** Verifica + sincroniza revisão (_v2, _v3, etc.)
6. **Frontend:** Node de revisão aparece dinamicamente

---

## 📊 VERIFICAÇÃO DE INTEGRIDADE

**Runner.js agora valida cada arquivo antes de sync:**

```javascript
{
  total: 8,
  valid: 8,
  invalid: 0,
  files: {
    "1738892400000_VALIDATOR.json": {exists: true, size: 1234, valid: true},
    "1738892400000_AUDIENCE.json": {exists: true, size: 2456, valid: true},
    "1738892400000_COPYWRITER_GPT.json": {exists: true, size: 5678, valid: true},
    // ...etc
  }
}
```

**Checagens:**
- ✅ Arquivo existe
- ✅ Tamanho > 0 bytes
- ✅ JSON válido (syntax check)
- ✅ Campos obrigatórios presentes (job_id, step_name)

**Se falhar:**
- Script bash já cria placeholder automático
- Runner.js loga erro detalhado
- Pipeline continua (não aborta)

---

## 🚧 PRÓXIMOS PASSOS

### 1. Integrar Socket.IO Emits no server.js
**3 pontos de emissão:**

```javascript
// POST /api/briefing (após salvar)
io.to('runner').emit('pipeline:run', {
  action: 'briefing',
  mode: req.body.mode,
  jobId: jobId,
  content: req.body.content,
});

// POST /api/rerun
io.to('runner').emit('pipeline:run', {
  action: 'rerun',
  mode: req.body.mode,
  jobId: req.body.jobId,
});

// POST /api/feedback
io.to('runner').emit('pipeline:run', {
  action: 'feedback',
  mode: req.body.mode,
  jobId: req.body.jobId,
  target: req.body.target || 'PROPOSAL', // Projetos only
});
```

### 2. Autenticação Runner
**Socket.IO handshake:**
```javascript
io.on('connection', (socket) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey !== 'brick-squad-2026') {
    socket.disconnect();
    return;
  }
  // ...accept
});
```

### 3. Teste End-to-End
- [ ] Criar novo briefing marketing
- [ ] Verificar runner pegou em real-time
- [ ] Validar todos os 8 nodes acenderam
- [ ] Testar RERUN
- [ ] Testar FEEDBACK → revisão

### 4. Deprecar watcher.js
- [ ] Parar processo watcher.js (se estiver rodando)
- [ ] Remover do systemd/launchd
- [ ] Arquivar arquivo

---

## 🔥 CRÍTICO

**NÃO CONFUNDIR:**
- **Marketing:** Pipeline INTERNO da Brick AI (usa BRAND_GUIDE da Brick)
- **Projetos:** Pipeline de CLIENTES (usa Brand Digest DO CLIENTE, NÃO da Brick)

**NUNCA:**
- Injetar BRAND_GUIDE.md em Projetos
- Usar persona da Brick em briefing de cliente
- Misturar terminologia ("prompt" vs "Direção Técnica")

---

## 📈 MÉTRICAS

**Runner Stats (reinicia a cada boot):**
```javascript
{
  jobsProcessed: 5,
  jobsSucceeded: 5,
  jobsFailed: 0,
  startTime: 1738892400000,
  uptime: 3600000, // 1h
}
```

**Logged a cada:**
- Conexão/Desconexão
- Job recebido
- Job processado
- Arquivo verificado
- Arquivo sincronizado
- Erro/Warning

---

**Status:** ✅ Sistema 95% pronto. Falta apenas integrar emits no server.js e testar.
