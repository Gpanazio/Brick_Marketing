#!/bin/bash
# BRICK AI - Context Summarizer
# Reduz contexto entre etapas para economizar tokens
#
# Em vez de passar todo o output de cada etapa para a próxima,
# cria um resumo estruturado com apenas as informações essenciais.

# ============================================
# SUMMARIZAÇÃO DE CONTEXTO
# ============================================

# Extrai campos essenciais de um JSON e retorna versão compacta
summarize_json() {
    local file="$1"
    local fields="$2"  # campos separados por vírgula
    
    if [ ! -f "$file" ]; then
        echo "{}"
        return
    fi
    
    # Se campos não especificados, retorna JSON compacto
    if [ -z "$fields" ]; then
        jq -c '.' "$file" 2>/dev/null || echo "{}"
        return
    fi
    
    # Extrai apenas os campos especificados
    local jq_filter="{"
    IFS=',' read -ra FIELD_ARRAY <<< "$fields"
    for i in "${!FIELD_ARRAY[@]}"; do
        local field="${FIELD_ARRAY[$i]}"
        if [ $i -gt 0 ]; then
            jq_filter+=","
        fi
        jq_filter+="\"$field\": .$field"
    done
    jq_filter+="}"
    
    jq -c "$jq_filter" "$file" 2>/dev/null || echo "{}"
}

# Cria resumo do briefing (extrai essência)
summarize_briefing() {
    local content="$1"
    local max_chars="${2:-500}"
    
    # Trunca mantendo estrutura
    if [ ${#content} -gt $max_chars ]; then
        echo "${content:0:$max_chars}..."
    else
        echo "$content"
    fi
}

# Cria contexto resumido para Marketing Pipeline
create_marketing_context() {
    local job_id="$1"
    local wip_dir="$2"
    
    local context="{"
    
    # Briefing é injetado separadamente no prompt (não duplicar aqui)
    # Bug fix 07/02/26: Remover briefing_summary daqui para evitar duplicação
    
    # Validator (status + campos faltantes)
    local validator_file="$wip_dir/${job_id}_01_VALIDATOR.json"
    if [ -f "$validator_file" ]; then
        local validator_summary=$(summarize_json "$validator_file" "status,can_proceed,missing_fields")
        context+="\"validator\":$validator_summary,"
    fi
    
    # Audience (persona + dores principais)
    local audience_file="$wip_dir/${job_id}_02_AUDIENCE.json"
    if [ -f "$audience_file" ]; then
        local audience_summary=$(jq -c '{
            alignment_score: .alignment_score,
            persona_cargo: .persona.cargo_tipico,
            dores_top3: (.dores // [])[:3]
        }' "$audience_file" 2>/dev/null || echo "{}")
        context+="\"audience\":$audience_summary,"
    fi
    
    # Research (keywords + insights principais)
    local research_file="$wip_dir/${job_id}_03_RESEARCH.json"
    if [ -f "$research_file" ]; then
        local research_summary=$(jq -c '{
            keywords: (.keywords_principais // [])[:5],
            insights_top3: (.insights // [])[:3]
        }' "$research_file" 2>/dev/null || echo "{}")
        context+="\"research\":$research_summary,"
    fi
    
    # Claims (resumo + risco)
    local claims_file="$wip_dir/${job_id}_04_CLAIMS.json"
    if [ -f "$claims_file" ]; then
        local claims_summary=$(jq -c '{
            risk_level: .risk_level,
            verificados: (.resumo.verificados // 0),
            recomendadas: (.estatisticas_recomendadas // [])[:3]
        }' "$claims_file" 2>/dev/null || echo "{}")
        context+="\"claims\":$claims_summary,"
    fi
    
    # Remove trailing comma e fecha
    context="${context%,}}"
    
    echo "$context"
}

# Cria contexto resumido para Projetos Pipeline
create_projetos_context() {
    local job_id="$1"
    local wip_dir="$2"
    
    local context="{"
    
    # Brand Digest (essência)
    local brand_file="$wip_dir/${job_id}_BRAND_DIGEST.json"
    if [ -f "$brand_file" ]; then
        local brand_summary=$(jq -c '{
            positioning: .positioning.promessa,
            tom: .identity_core.tom_de_voz,
            constraints_count: (.constraints | length)
        }' "$brand_file" 2>/dev/null || echo "{}")
        context+="\"brand\":$brand_summary,"
    fi
    
    # Concept Critic (vencedor com detalhes essenciais)
    local critic_file="$wip_dir/${job_id}_CONCEPT_CRITIC.json"
    if [ -f "$critic_file" ]; then
        local critic_summary=$(jq -c '{
            winner_name: .winner.concept_name,
            winner_score: .winner_score,
            core_idea: .winner.core_idea,
            diferencial: .winner.diferencial,
            recommendation: .recommendation
        }' "$critic_file" 2>/dev/null || echo "{}")
        context+="\"critic\":$critic_summary,"
    fi
    
    # Execution (visual system resumido)
    local exec_file="$wip_dir/${job_id}_EXECUTION_DESIGN.json"
    if [ -f "$exec_file" ]; then
        local exec_summary=$(jq -c '{
            concept_name: .concept_name,
            primary_colors: (.visual_system.color_palette.primary // [])[:2],
            tagline: .copy_framework.tagline
        }' "$exec_file" 2>/dev/null || echo "{}")
        context+="\"execution\":$exec_summary,"
    fi
    
    context="${context%,}}"
    echo "$context"
}

# Cria contexto resumido para Ideias Pipeline
create_ideias_context() {
    local job_id="$1"
    local wip_dir="$2"
    
    local context="{"
    
    # Briefing é injetado separadamente no prompt (não duplicar aqui)
    # Bug fix 07/02/26: Remover briefing_summary para evitar duplicação
    
    # Pain Check (resumo)
    local pain_file="$wip_dir/${job_id}_PAIN_CHECK.json"
    if [ -f "$pain_file" ]; then
        local pain_summary=$(jq -c '{
            status: .status,
            is_real: .pain_check.is_real,
            relevance: .pain_check.relevance
        }' "$pain_file" 2>/dev/null || echo "{}")
        context+="\"pain\":$pain_summary,"
    fi
    
    # Market Scan (oportunidade)
    local market_file="$wip_dir/${job_id}_MARKET_SCAN.md"
    if [ -f "$market_file" ]; then
        # Para markdown, extrai primeiras linhas
        local market_summary=$(head -5 "$market_file" | tr '\n' ' ' | tr '"' "'")
        context+="\"market_summary\":\"${market_summary:0:200}\","
    fi
    
    # Angle Gen (ângulo recomendado)
    local angle_file="$wip_dir/${job_id}_ANGLE_GEN.json"
    if [ -f "$angle_file" ]; then
        local angle_summary=$(jq -c '{
            recommended: .recommended,
            angles_count: (.angles | length)
        }' "$angle_file" 2>/dev/null || echo "{}")
        context+="\"angle\":$angle_summary,"
    fi
    
    # Devil Gen (riscos principais)
    local devil_file="$wip_dir/${job_id}_DEVIL_GEN.json"
    if [ -f "$devil_file" ]; then
        local devil_summary=$(jq -c '{
            risk_score: .risk_score,
            dealbreakers_count: (.dealbreakers | length),
            top_risk: (.failure_scenarios // [{}])[0].scenario
        }' "$devil_file" 2>/dev/null || echo "{}")
        context+="\"devil\":$devil_summary,"
    fi
    
    context="${context%,}}"
    echo "$context"
}

# ============================================
# ESTIMATIVA DE ECONOMIA
# ============================================

# Calcula economia de tokens estimada
estimate_token_savings() {
    local original_size="$1"
    local summarized_size="$2"
    
    # Estimativa: ~4 chars por token em média
    local original_tokens=$((original_size / 4))
    local summarized_tokens=$((summarized_size / 4))
    local savings=$((original_tokens - summarized_tokens))
    local percentage=$((savings * 100 / original_tokens))
    
    echo "{\"original_tokens\":$original_tokens,\"summarized_tokens\":$summarized_tokens,\"savings\":$savings,\"percentage\":$percentage}"
}

summarize_ideias_briefing() {
    local full_briefing="$1"
    local max_chars="${2:-400}"
    
    # Extrai título + primeiros parágrafos
    echo "$full_briefing" | head -c $max_chars | tr '\n' ' '
}

# ============================================
# EXPORTS (para uso como biblioteca)
# ============================================
export -f summarize_json summarize_briefing
export -f create_marketing_context create_projetos_context create_ideias_context
export -f estimate_token_savings
export -f summarize_ideias_briefing
