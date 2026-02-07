#!/usr/bin/env node
/**
 * War Room Runner - Event-Driven Pipeline Orchestrator
 * 
 * Substitui Douglas (LLM) por execução determinística.
 * Escuta eventos Socket.IO do Railway e executa scripts bash exatos.
 * 
 * Autor: Douglas (ironicamente)
 * Data: 2026-02-06
 */

const io = require('socket.io-client');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG = {
  RAILWAY_URL: 'https://brickmarketing-production.up.railway.app',
  API_KEY: 'brick-squad-2026',
  WORKSPACE: '/Users/gabrielpanazio/projects/Brick_Marketing',
  LOG_FILE: '/Users/gabrielpanazio/projects/Brick_Marketing/logs/runner.log',
  RECONNECT_BACKOFF: [2000, 4000, 8000, 16000, 32000], // ms
  MAX_CONCURRENT: 1, // Não rodar 2 pipelines ao mesmo tempo
};

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

let socket = null;
let isProcessing = false;
let jobQueue = [];
let stats = {
  jobsProcessed: 0,
  jobsSucceeded: 0,
  jobsFailed: 0,
  startTime: Date.now(),
};

// ============================================================================
// LOGGING
// ============================================================================

async function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  
  console.log(JSON.stringify(entry));
  
  // Append to log file
  try {
    const logDir = path.dirname(CONFIG.LOG_FILE);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(CONFIG.LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

// ============================================================================
// CONEXÃO SOCKET.IO
// ============================================================================

function connectSocket() {
  log('info', 'Conectando ao Railway...', { url: CONFIG.RAILWAY_URL });
  
  socket = io(CONFIG.RAILWAY_URL, {
    auth: {
      apiKey: CONFIG.API_KEY,
    },
    reconnection: true,
    reconnectionDelay: CONFIG.RECONNECT_BACKOFF[0],
    reconnectionDelayMax: CONFIG.RECONNECT_BACKOFF[CONFIG.RECONNECT_BACKOFF.length - 1],
    reconnectionAttempts: Infinity,
  });
  
  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('pipeline:run', handlePipelineRun);
  socket.on('error', handleError);
}

async function handleConnect() {
  await log('info', '✓ Conectado ao Railway');
  
  // Entrar na room 'runner'
  socket.emit('join', 'runner');
  await log('info', '✓ Entrou na room runner');
  
  // Catch-up: processar jobs pendentes
  await processPendingJobs();
}

async function handleDisconnect(reason) {
  await log('warn', 'Desconectado do Railway', { reason });
}

async function handleError(error) {
  await log('error', 'Socket.IO error', { error: error.message });
}

// ============================================================================
// PIPELINE HANDLER
// ============================================================================

async function handlePipelineRun(payload) {
  const { action, mode, jobId, content, target } = payload;
  
  await log('info', 'Evento pipeline:run recebido', { action, mode, jobId, target });
  
  // Enfileirar job
  jobQueue.push(payload);
  
  // Se já tá processando, espera a vez
  if (isProcessing) {
    await log('info', 'Job enfileirado (processando outro)', { jobId, queueSize: jobQueue.length });
    return;
  }
  
  // Processar fila
  await processQueue();
}

async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;
  
  isProcessing = true;
  
  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    await processJob(job);
  }
  
  isProcessing = false;
}

async function processJob(payload) {
  const { action, mode, jobId, content, target } = payload;
  const startTime = Date.now();
  
  try {
    await log('info', '▶ Processando job', { action, mode, jobId });
    
    // Salvar briefing local se necessário
    if ((action === 'briefing' || action === 'rerun') && content) {
      await saveBriefing(mode, jobId, content);
    }
    
    // NOVO: Executar via sub-agent em vez de spawn direto
    // Motivo: Evita SIGKILL do processo parent
    const result = await executeViaSubAgent(action, mode, jobId, target);
    
    // Sincronizar resultados
    await syncResults(mode, jobId);
    
    // Stats
    stats.jobsProcessed++;
    stats.jobsSucceeded++;
    
    const duration = Date.now() - startTime;
    await log('info', '✓ Job concluído', { 
      jobId, 
      duration: `${(duration / 1000).toFixed(1)}s`,
    });
    
  } catch (err) {
    stats.jobsProcessed++;
    stats.jobsFailed++;
    
    await log('error', '✗ Job falhou', {
      jobId,
      error: err.message,
      stack: err.stack,
    });
  }
}

// ============================================================================
// UTILIDADES
// ============================================================================

async function saveBriefing(mode, jobId, content) {
  const briefingPath = path.join(
    CONFIG.WORKSPACE,
    `history/${mode}/briefing/${jobId}.txt`
  );
  
  const dir = path.dirname(briefingPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(briefingPath, content, 'utf-8');
  
  await log('info', 'Briefing salvo', { path: briefingPath });
}

async function executeViaSubAgent(action, mode, jobId, target) {
  await log('info', 'Delegando execução para sub-agent via exec direto', { action, mode, jobId });
  
  // NOVA ABORDAGEM: exec simples sem await (fire & forget)
  // Runner apenas dispara o script e polling verifica conclusão
  
  let scriptPath, args;
  
  if (action === 'briefing' || action === 'rerun') {
    scriptPath = './run-pipeline.sh';
    args = [
      path.join(CONFIG.WORKSPACE, `history/${mode}/briefing/${jobId}.txt`),
      `--mode=${mode}`,
    ];
  } else if (action === 'feedback') {
    if (mode === 'marketing') {
      scriptPath = './run-reloop.sh';
      args = [jobId];
    } else if (mode === 'projetos') {
      scriptPath = './run-reloop-projetos.sh';
      args = [jobId, target || 'PROPOSAL'];
    } else {
      throw new Error('Feedback não suportado para modo ideias');
    }
  } else {
    throw new Error(`Action desconhecida: ${action}`);
  }
  
  const fullPath = path.join(CONFIG.WORKSPACE, scriptPath);
  const cmd = `cd ${CONFIG.WORKSPACE} && nohup bash ${fullPath} ${args.join(' ')} > /dev/null 2>&1 &`;
  
  // Fire & forget
  const { exec } = require('child_process');
  exec(cmd);
  
  await log('info', 'Script iniciado em background', { cmd });
  
  // Polling: checar se FINAL.md ou última etapa foi gerada
  return await pollForCompletion(mode, jobId);
}

async function pollForCompletion(mode, jobId) {
  const wipDir = path.join(CONFIG.WORKSPACE, `history/${mode}/wip`);
  const maxPolls = 120; // 10min (5s * 120)
  const pollIntervalMs = 5000; // 5s
  
  let polls = 0;
  
  while (polls < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    polls++;
    
    try {
      const files = await fs.readdir(wipDir);
      const jobFiles = files.filter(f => f.startsWith(jobId) || f.startsWith(`${jobId}_`));
      
      // Checar se FINAL.md existe (indicador de conclusão)
      const hasFinal = jobFiles.some(f => f.includes('FINAL.md'));
      
      if (hasFinal) {
        await log('info', 'Pipeline concluído (FINAL.md encontrado)', { 
          jobId, 
          polls, 
          timeSeconds: polls * (pollIntervalMs / 1000) 
        });
        return { success: true, files: jobFiles.length };
      }
      
      // Log progresso a cada 12 polls (1min)
      if (polls % 12 === 0) {
        await log('info', 'Pipeline em andamento...', { 
          jobId, 
          filesGenerated: jobFiles.length,
          timeSeconds: polls * (pollIntervalMs / 1000)
        });
      }
      
    } catch (err) {
      // Diretório ainda não existe, continuar polling
    }
  }
  
  // Timeout
  throw new Error(`Pipeline timeout após ${maxPolls * (pollIntervalMs / 1000)}s`);
}

async function syncResults(mode, jobId) {
  const wipDir = path.join(CONFIG.WORKSPACE, `history/${mode}/wip`);
  
  // Listar todos os arquivos do job
  const files = await fs.readdir(wipDir);
  const jobFiles = files.filter(f => f.startsWith(jobId) || f.startsWith(`${jobId}_`));
  
  if (jobFiles.length === 0) {
    await log('warn', 'Nenhum arquivo gerado para sync', { jobId, mode });
    return;
  }
  
  // Verificar integridade de cada arquivo antes de sync
  const verification = await verifyPipelineResults(wipDir, jobId, mode);
  await log('info', 'Verificação de pipeline concluída', { 
    jobId, 
    total: verification.total,
    valid: verification.valid,
    invalid: verification.invalid,
    details: verification.files,
  });
  
  // Enviar cada arquivo pro Railway
  for (const filename of jobFiles) {
    const filePath = path.join(wipDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    
    try {
      const response = await fetch(`${CONFIG.RAILWAY_URL}/api/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CONFIG.API_KEY,
        },
        body: JSON.stringify({
          mode,
          jobId,
          filename,
          content,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      await log('info', 'Arquivo sincronizado', { filename });
    } catch (err) {
      await log('error', 'Falha ao sincronizar arquivo', { 
        filename, 
        error: err.message 
      });
    }
  }
}

async function verifyPipelineResults(wipDir, jobId, mode) {
  const files = await fs.readdir(wipDir);
  const jobFiles = files.filter(f => 
    (f.startsWith(jobId) || f.startsWith(`${jobId}_`)) && 
    (f.endsWith('.json') || f.endsWith('.md'))
  );
  
  const results = {
    total: jobFiles.length,
    valid: 0,
    invalid: 0,
    files: {},
  };
  
  for (const filename of jobFiles) {
    const filePath = path.join(wipDir, filename);
    const fileCheck = {
      exists: true,
      size: 0,
      valid: false,
      error: null,
    };
    
    try {
      const stats = await fs.stat(filePath);
      fileCheck.size = stats.size;
      
      // Verificar JSON files
      if (filename.endsWith('.json')) {
        const content = await fs.readFile(filePath, 'utf-8');
        JSON.parse(content); // Throws se inválido
        
        // Verificar campos obrigatórios baseado no modo
        const data = JSON.parse(content);
        if (!data.job_id || !data.step_name) {
          fileCheck.error = 'Missing required fields (job_id, step_name)';
        } else {
          fileCheck.valid = true;
          results.valid++;
        }
      } else {
        // MD files só checam se não estão vazios
        if (fileCheck.size > 0) {
          fileCheck.valid = true;
          results.valid++;
        } else {
          fileCheck.error = 'Empty file';
        }
      }
    } catch (err) {
      fileCheck.error = err.message;
      results.invalid++;
    }
    
    if (!fileCheck.valid && !fileCheck.error) {
      results.invalid++;
    }
    
    results.files[filename] = fileCheck;
  }
  
  return results;
}

async function processPendingJobs() {
  const modes = ['marketing', 'projetos', 'ideias'];
  
  for (const mode of modes) {
    try {
      const response = await fetch(`${CONFIG.RAILWAY_URL}/api/pending?mode=${mode}`, {
        method: 'GET',
        headers: {
          'x-api-key': CONFIG.API_KEY,
        },
      });
      
      if (!response.ok) {
        await log('warn', `Falha ao buscar pendentes para ${mode}`, { status: response.status });
        continue;
      }
      
      const pending = await response.json();
      
      if (pending.briefings && pending.briefings.length > 0) {
        await log('info', `Jobs pendentes encontrados em ${mode}`, { count: pending.briefings.length });
        
        for (const briefing of pending.briefings) {
          // Extrair jobId do filename (pattern: {jobId}_{nome}.md ou {jobId}.md)
          const match = briefing.name.match(/^(\d+)/);
          if (!match) continue;
          
          const jobId = match[1];
          
          jobQueue.push({
            action: 'briefing',
            mode: mode,
            jobId,
            content: briefing.content, // Se disponível
          });
        }
      }
      
    } catch (err) {
      await log('error', `Erro ao buscar jobs de ${mode}`, { error: err.message });
    }
  }

  // Processar fila se houver algo
  if (jobQueue.length > 0 && !isProcessing) {
    await processQueue();
  }
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

async function main() {
  await log('info', '🚀 War Room Runner iniciando...', {
    workspace: CONFIG.WORKSPACE,
    railwayUrl: CONFIG.RAILWAY_URL,
  });
  
  connectSocket();
  
  // Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function shutdown() {
  await log('info', 'Desligando runner...', {
    stats,
    uptime: Date.now() - stats.startTime,
  });
  
  if (socket) {
    socket.disconnect();
  }
  
  process.exit(0);
}

// ============================================================================
// START
// ============================================================================

if (require.main === module) {
  main().catch(async (err) => {
    await log('error', 'Fatal error', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { log };
