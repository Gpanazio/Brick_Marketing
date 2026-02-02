# BRICK AI SQUAD - ARCHITECTURE (v1)

## FASE 1: A FÁBRICA CRIATIVA (Creative Ops)
*Onde a ideia nasce e vira asset aprovado.*

### 1. O Orquestrador (Manager)
- **Model:** Gemini 3 Flash
- **Role:** Gerente de Tráfego Interno.
- **Input:** Briefing do Gabriel.
- **Ação:** Quebra tarefas, delega, cobra prazos, consolida entregas.
- **Output:** O Pacote Final na pasta `done`.

### 2. O Pesquisador (Trend Hunter)
- **Model:** Gemini 3 Flash
- **Role:** Olheiro de Tendências.
- **Ação:** Web Search (Brave/Google). Varre Twitter, Reddit, TechCrunch.
- **Regra:** "Proibido alucinar fontes. Links reais apenas."

### 3. O Redator (Copywriter)
- **Model:** Gemini 3 Pro (ou Flash para volume)
- **Role:** A Voz da Brick.
- **Style:** "Bold & Unapologetic".
- **Ação:** Gera variações (A/B/C) de copy.

### 4. O Simulador de Persona (The Hater)
- **Model:** Gemini 3 Flash
- **Role:** O Público Chato / Twitter User.
- **Prompt:** "Critique isso. Ache o cringe. Ache o corporativês."
- **Ação:** Filtro de qualidade inicial.

### 5. O Diretor de Arte (Visual Synth)
- **Model:** Gemini 3 Pro + Tools (Imagen 4 / Veo 3)
- **Role:** Gerador de Imagens.
- **Ação:** Cria assets visuais baseados na copy aprovada.

### 6. O Crítico (The Divergent)
- **Model:** Claude 4.5 Sonnet
- **Role:** O Auditor Final / Diretor de Criação Sênior.
- **Ação:** Análise pixel-perfect e tom de voz.
- **Poder:** Veto. Se ele diz "não", o Redator/Arte tem que refazer.

---

## FASE 2: A MÁQUINA DE CRESCIMENTO (Growth Ops)
*Entra em ação quando os posts vão pro ar.*

### 7. O Performance (Media Planner)
- **Model:** Gemini 3 Flash
- **Role:** Estrategista de Tráfego Pago/Distribuição.
- **Ação:**
    - Define segmentação.
    - Planeja testes A/B (ex: "Vamos testar o Copy A com a Imagem B").
    - Sugere orçamentos e canais.

### 8. O Analytics (Data Scientist)
- **Model:** Claude 4.5 Sonnet (para análise complexa) ou Gemini 3 Flash (para volume).
- **Role:** O Cérebro Racional.
- **Input:** CSVs/JSONs de performance (Likes, Clicks, CPC, Retention).
- **Ação:** Leitura fria dos dados.
    - "O vídeo X reteve 40% a mais. O motivo foi o gancho nos primeiros 3s."
    - "Pare a campanha Y, está queimando dinheiro."
- **Output:** Decisão de negócio para o Orquestrador ("Peça pro Redator fazer mais posts tipo X").

---

## INFRAESTRUTURA (The War Room)
- **Frontend:** Dashboard Web (Next.js simples) para visualização dos agentes trabalhando.
- **Backend:** Sistema de Arquivos (Markdown) + OpenClaw Sessions.
- **Custo Estimado:** Baixo (maioria em Flash, Sonnet apenas para refino).
