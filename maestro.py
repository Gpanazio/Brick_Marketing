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

# Configuração de cores
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
    """Substitui {{var}} pelo valor no dicionário variables"""
    if not isinstance(text, str):
        return text
    
    # Replace
    for key, value in variables.items():
        pattern = "{{" + key + "}}"
        text = text.replace(pattern, str(value))
        
    # Check unresolved vars
    unresolved = re.findall(r'\{\{(\w+)\}\}', text)
    if unresolved:
        log(f"Aviso: Variáveis não resolvidas encontradas: {unresolved}", "warning")
        
    return text

def check_condition(step, variables):
    """Verifica se o step deve rodar baseado na condição (Python puro)"""
    if 'condition' not in step:
        return True
    
    cond = step['condition']
    if cond.get('check') == 'grep':
        file_path = replace_vars(cond['file'], variables)
        pattern = cond['pattern'].strip('"\'') # Remove aspas do YAML se houver
        
        if not os.path.exists(file_path):
            return False
            
        try:
            # Leitura segura em Python
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                return pattern in content
        except Exception as e:
            log(f"Erro ao verificar condição no arquivo {file_path}: {e}", "error")
            return False
            
    return True

def execute_openclaw(step_name, cmd):
    """Função helper para executar comando e capturar output (thread-safe)"""
    try:
        start_time = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True)
        duration = time.time() - start_time
        return {
            'success': result.returncode == 0,
            'name': step_name,
            'duration': duration,
            'stdout': result.stdout,
            'stderr': result.stderr
        }
    except Exception as e:
        return {
            'success': False,
            'name': step_name,
            'duration': 0,
            'stdout': '',
            'stderr': str(e)
        }

def run_step(step, variables):
    step_id = step['id']
    step_name = step.get('name', step_id)
    
    # Verificar condição
    if not check_condition(step, variables):
        log(f"Pulando etapa '{step_name}' (condição não satisfeita)", "warning")
        return True

    log(f"Iniciando etapa: {step_name}", "header")
    
    # Processar Task
    task_prompt = replace_vars(step['task'], variables)
    model = step.get('model', 'flash')
    timeout = step.get('timeout', 120)
    
    cmd = [
        "openclaw", "sessions", "spawn",
        "--task", task_prompt,
        "--model", model,
        "--timeout", str(timeout),
        "--cleanup", "delete"
    ]
    
    res = execute_openclaw(step_name, cmd)
    
    if not res['success']:
        log(f"Erro na etapa {step_name}:", "error")
        print(res['stderr'])
        return False
        
    log(f"Etapa concluída em {res['duration']:.1f}s", "success")
    
    # Output Check
    if 'output_check' in step:
        check = step['output_check']
        file_path = replace_vars(check['file'], variables)
        if check['condition'] == 'exists':
            if not os.path.exists(file_path):
                log(f"Output esperado não encontrado: {file_path}", "error")
                return False
            else:
                log(f"Output verificado: {os.path.basename(file_path)}", "success")
    
    return True

def run_parallel_steps(steps, variables):
    """Roda steps em paralelo usando ThreadPoolExecutor"""
    log(f"Iniciando {len(steps)} etapas em paralelo...", "header")
    
    futures = []
    with ThreadPoolExecutor(max_workers=len(steps)) as executor:
        for step in steps:
            step_name = step.get('name', step['id'])
            task_prompt = replace_vars(step['task'], variables)
            model = step.get('model', 'flash')
            timeout = step.get('timeout', 120)
            
            cmd = [
                "openclaw", "sessions", "spawn",
                "--task", task_prompt,
                "--model", model,
                "--timeout", str(timeout),
                "--cleanup", "delete"
            ]
            
            log(f"Disparando {step_name}...", "info")
            futures.append(executor.submit(execute_openclaw, step_name, cmd))
            
        # Coletar resultados
        all_success = True
        for future in as_completed(futures):
            res = future.result()
            if res['success']:
                log(f"Paralelo {res['name']} concluído ({res['duration']:.1f}s)", "success")
            else:
                log(f"Erro no paralelo {res['name']}", "error")
                print(res['stderr'])
                all_success = False
                
    return all_success

def main():
    parser = argparse.ArgumentParser(description="Brick AI Pipeline Maestro")
    parser.add_argument("briefing", help="Caminho para o arquivo de briefing")
    parser.add_argument("--pipeline", default="pipelines/standard_v1.yaml", help="Arquivo YAML do pipeline")
    args = parser.parse_args()
    
    # Setup básico
    briefing_path = os.path.abspath(args.briefing)
    if not os.path.exists(briefing_path):
        log(f"Briefing não encontrado: {briefing_path}", "error")
        sys.exit(1)
        
    pipeline_path = os.path.abspath(args.pipeline)
    if not os.path.exists(pipeline_path):
        log(f"Pipeline YAML não encontrado: {pipeline_path}", "error")
        sys.exit(1)

    # Carregar Pipeline
    try:
        pipeline = load_pipeline(pipeline_path)
        log(f"Pipeline carregado: {pipeline['name']} (v{pipeline['version']})", "success")
    except Exception as e:
        log(f"Erro ao carregar YAML: {e}", "error")
        sys.exit(1)
        
    # Inicializar Variáveis
    job_id = str(int(time.time() * 1000))
    variables = pipeline.get('variables', {}).copy()
    
    # Expandir ~ nas variáveis (FIX: type check)
    for k, v in variables.items():
        if isinstance(v, str):
            variables[k] = os.path.expanduser(v)
        
    variables['job_id'] = job_id
    variables['input_file'] = briefing_path
    
    # Criar diretórios necessários
    wip_dir = variables.get('wip_dir')
    if wip_dir and not os.path.exists(wip_dir):
        os.makedirs(wip_dir)
        log(f"Diretório WIP criado: {wip_dir}", "info")
        
    # Pré-processamento (FIX: shutil seguro)
    processed_file = os.path.join(wip_dir, f"{job_id}_PROCESSED.md")
    try:
        shutil.copy2(briefing_path, processed_file)
        variables['input_file'] = processed_file
    except Exception as e:
        log(f"Erro ao copiar briefing: {e}", "error")
        sys.exit(1)
    
    log(f"Job ID: {job_id}", "info")
    log(f"Input: {briefing_path}", "info")
    
    # Executar Steps
    for step in pipeline['steps']:
        step_type = step.get('type', 'sequential')
        
        if step_type == 'parallel':
            if 'steps' not in step:
                log(f"Etapa paralela {step['id']} sem sub-etapas!", "error")
                continue
            success = run_parallel_steps(step['steps'], variables)
        else:
            success = run_step(step, variables)
            
        if not success:
            on_failure = step.get('on_failure', 'abort')
            if on_failure == 'abort':
                log("Pipeline abortado devido a erro.", "error")
                sys.exit(1)
            elif on_failure == 'continue':
                log("Erro ignorado (on_failure: continue)", "warning")
                
    log("Pipeline finalizado com sucesso! 🚀", "success")
    log(f"Arquivos em: {wip_dir}", "info")

if __name__ == "__main__":
    main()
