#!/usr/bin/env python3
import yaml
import sys
import os
import subprocess
import time
import json
import re
import argparse
import shutil
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log(message, level="info"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    if level == "info":
        print(f"{Colors.BLUE}[{timestamp}] ℹ️  {message}{Colors.ENDC}")
    elif level == "success":
        print(f"{Colors.GREEN}[{timestamp}] ✅ {message}{Colors.ENDC}")
    elif level == "warning":
        print(f"{Colors.WARNING}[{timestamp}] ⚠️  {message}{Colors.ENDC}")
    elif level == "error":
        print(f"{Colors.FAIL}[{timestamp}] ❌ {message}{Colors.ENDC}")
    elif level == "header":
        print(f"\n{Colors.HEADER}{Colors.BOLD}=== {message} ==={Colors.ENDC}")

def load_pipeline(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def replace_vars(text, variables):
    if not isinstance(text, str): return text
    for key, value in variables.items():
        pattern = "{{" + key + "}}"
        text = text.replace(pattern, str(value))
    return text

def check_condition(step, variables):
    if 'condition' not in step: return True
    cond = step['condition']
    if cond.get('check') == 'grep':
        file_path = replace_vars(cond['file'], variables)
        pattern = cond['pattern'].strip('"\'')
        if not os.path.exists(file_path): return False
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return pattern in f.read()
        except: return False
    return True

def execute_agent_cli(step_name, task_prompt, model, timeout, job_id, step_id):
    """Executa via CLI openclaw agent"""
    
    # Mapear modelo para thinking level (proxy)
    thinking = "off"
    if "sonnet" in model or "gpt" in model: thinking = "low"
    if "opus" in model: thinking = "high"
    
    session_id = f"job-{job_id}-{step_id}"
    
    cmd = [
        "openclaw", "agent",
        "--session-id", session_id,
        "--message", task_prompt,
        "--thinking", thinking,
        "--timeout", str(timeout),
        "--json"
    ]
    
    try:
        start_time = time.time()
        # Executa e bloqueia até terminar
        result = subprocess.run(cmd, capture_output=True, text=True)
        duration = time.time() - start_time
        
        if result.returncode != 0:
            return {'success': False, 'name': step_name, 'duration': duration, 'stderr': result.stderr}
            
        # Parse JSON output
        try:
            data = json.loads(result.stdout)
            reply = data.get('message', {}).get('text', '') or data.get('text', '')
            return {
                'success': True, 
                'name': step_name, 
                'duration': duration, 
                'stdout': reply
            }
        except:
            # Se não for JSON, retorna stdout bruto
            return {
                'success': True, 
                'name': step_name, 
                'duration': duration, 
                'stdout': result.stdout
            }
            
    except Exception as e:
        return {'success': False, 'name': step_name, 'duration': 0, 'stderr': str(e)}

def run_step(step, variables):
    step_id = step['id']
    step_name = step.get('name', step_id)
    job_id = variables['job_id']
    
    if not check_condition(step, variables):
        log(f"Pulando {step_name}", "warning")
        return True

    log(f"Iniciando: {step_name}", "header")
    
    task_prompt = replace_vars(step['task'], variables)
    model = step.get('model', 'flash')
    timeout = step.get('timeout', 120)
    
    res = execute_agent_cli(step_name, task_prompt, model, timeout, job_id, step_id)
    
    if not res['success']:
        log(f"Erro: {res['stderr']}", "error")
        return False
        
    log(f"Concluído em {res['duration']:.1f}s", "success")
    
    if 'output_check' in step:
        check = step['output_check']
        file_path = replace_vars(check['file'], variables)
        if not os.path.exists(file_path):
            log(f"Output não gerado: {file_path}", "error")
            return False
        log(f"Output OK: {os.path.basename(file_path)}", "success")
    
    return True

def run_parallel_steps(steps, variables):
    log(f"Iniciando {len(steps)} etapas paralelas...", "header")
    job_id = variables['job_id']
    
    futures = []
    with ThreadPoolExecutor(max_workers=len(steps)) as executor:
        for step in steps:
            step_name = step.get('name', step['id'])
            task_prompt = replace_vars(step['task'], variables)
            model = step.get('model', 'flash')
            timeout = step.get('timeout', 120)
            
            futures.append(executor.submit(
                execute_agent_cli, step_name, task_prompt, model, timeout, job_id, step['id']
            ))
            
        all_success = True
        for future in as_completed(futures):
            res = future.result()
            if res['success']:
                log(f"Paralelo {res['name']} OK ({res['duration']:.1f}s)", "success")
            else:
                log(f"Paralelo {res['name']} FALHOU: {res['stderr']}", "error")
                all_success = False
                
    return all_success

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("briefing")
    parser.add_argument("--pipeline", default="pipelines/standard_v1.yaml")
    args = parser.parse_args()
    
    briefing_path = os.path.abspath(args.briefing)
    if not os.path.exists(briefing_path): sys.exit(1)
        
    pipeline = load_pipeline(args.pipeline)
    log(f"Pipeline: {pipeline['name']}", "success")
        
    job_id = str(int(time.time() * 1000))
    variables = pipeline.get('variables', {}).copy()
    for k, v in variables.items():
        if isinstance(v, str): variables[k] = os.path.expanduser(v)
        
    variables['job_id'] = job_id
    variables['input_file'] = briefing_path
    
    wip_dir = variables.get('wip_dir')
    if wip_dir and not os.path.exists(wip_dir): os.makedirs(wip_dir)
        
    processed_file = os.path.join(wip_dir, f"{job_id}_PROCESSED.md")
    shutil.copy2(briefing_path, processed_file)
    variables['input_file'] = processed_file
    
    log(f"Job ID: {job_id}", "info")
    
    for step in pipeline['steps']:
        step_type = step.get('type', 'sequential')
        if step_type == 'parallel':
            success = run_parallel_steps(step['steps'], variables)
        else:
            success = run_step(step, variables)
            
        if not success and step.get('on_failure') == 'abort':
            log("Abortando.", "error")
            sys.exit(1)

    log("Fim! 🚀", "success")

if __name__ == "__main__":
    main()
