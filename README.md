# BRICK MARKETING WAR ROOM v4.1

Sistema de orquestração de agentes autônomos para marketing e projetos criativos.

## 🚀 Status Atual
- **War Room v4.1:** Scheme Modal, Visualização de Pipeline, Dark/Red Theme
- **Modo Webhook:** Polling desativado, ingestão via webhook

## ⚡ Pipelines Ativos

### 1. Marketing (v3.4)
Focado em campanhas e conteúdo externo.
```
BRIEFING (raw + anexos)
    ↓
DOUGLAS (Pré-processador: lê anexos, consolida)
    ↓
01. BRIEF VALIDATOR (Flash)
    ↓
02. AUDIENCE (Flash - persona hardcoded) ══► 03. RESEARCHER (Flash)
    ↓
04. CLAIMS CHECKER (Flash)
    ↓
05. COPYWRITER A/B/C (GPT-5.2/Flash/Sonnet - temp 1.0)
    ↓
06. BRAND GUARDIANS (Flash)
    ↓
07. CRITICS (GPT-5.2)
    ↓
08. FILTRO FINAL (Opus) → Loop de feedback (máx 3x)
    ↓
09. HUMAN (Aprovação Final)
    ↓
OUTPUT READY
```

### 2. Projetos (v2.0)
Focado em branding e projetos internos.
```
BRIEFING (raw + anexos)
    ↓
DOUGLAS (Pré-processador)
    ↓
01. BRAND DIGEST (Flash)
    ↓
02. CREATIVE IDEATION (GPT-5.2 - 3 conceitos)
    ↓
03. CONCEPT CRITIC (Flash)
    ↓
04. EXECUTION DESIGN (Gemini Pro)
    ↓
05. COPYWRITER (Sonnet)
    ↓
06. DIRECTOR (Gemini Pro) → Loop de feedback (máx 3x)
    ↓
07. HUMAN (Aprovação Final)
    ↓
OUTPUT READY
```

### 3. Ideias (v1.1)
Validação rápida de conceitos.
```
BRIEFING
    ↓
01. IDEA PARSER
    ↓
02. CONTEXT SCOUT
    ↓
03. DEVILS vs ANGELS ADVOCATE (Debate)
    ↓
04. VERDICT JUDGE
    ↓
OUTPUT REPORT
```

## 🛠️ Infraestrutura
- **Frontend:** HTML5/Tailwind/JS (Sem framework pesado)
- **Backend:** Node.js (Express)
- **Deploy:** Railway (Automático via Git)
- **Arquivos:** Markdown estruturado + JSON metadata

## 🧠 Papéis Especiais
- **DOUGLAS (Etapa 0):** Agente pré-processador que lê PDFs, imagens e links do briefing para economizar tokens dos agentes downstream.
- **HUMAN (Aprovação):** Etapa final obrigatória antes do output ser considerado pronto.

---
*Atualizado: 04/02/2026*