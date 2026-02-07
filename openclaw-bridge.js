#!/usr/bin/env node
/**
 * OpenClaw Bridge - Permite runner.js chamar ferramentas do OpenClaw
 * 
 * Como runner.js roda como processo standalone (não dentro do OpenClaw),
 * precisamos fazer chamadas via CLI para acessar sessions_spawn e outras tools.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Spawn sub-agent session via OpenClaw CLI
 * 
 * @param {Object} options
 * @param {string} options.task - Task message
 * @param {string} options.agentId - Agent ID (flash, pro, sonnet, opus, gpt)
 * @param {number} options.runTimeoutSeconds - Timeout in seconds
 * @param {string} options.cleanup - 'delete' or 'keep'
 * @param {string} options.label - Session label
 * @returns {Promise<Object>} Result object
 */
async function sessions_spawn({ task, agentId = 'flash', runTimeoutSeconds = 600, cleanup = 'delete', label }) {
  // Escapar task message para bash
  const escapedTask = task.replace(/'/g, "'\\''");
  
  // Montar comando openclaw
  const cmd = [
    'openclaw',
    'sessions',
    'spawn',
    `--agent-id=${agentId}`,
    `--run-timeout=${runTimeoutSeconds}`,
    `--cleanup=${cleanup}`,
    label ? `--label=${label}` : '',
    `--task='${escapedTask}'`,
  ].filter(Boolean).join(' ');
  
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: (runTimeoutSeconds + 30) * 1000, // +30s buffer
    });
    
    // Parse output (assumindo JSON ou texto estruturado)
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      // Se não for JSON, considerar texto bruto como sucesso
      result = {
        success: !stderr && stdout.length > 0,
        output: stdout,
        error: stderr,
      };
    }
    
    return result;
    
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stderr: err.stderr,
    };
  }
}

module.exports = {
  sessions_spawn,
};
