# BRIEFING: Redesign UX do Sistema de Feedback

## Cliente
Brick AI (interno)

## Problema
O sistema de feedback atual no dashboard tem:
1. Nomenclatura técnica demais (CONCEITO, EXECUÇÃO/CRAFT, MARCA/TOM, DADOS/CLAIMS)
2. Organização Kanban não é ideal pra feedback
3. Não fica claro pra onde o feedback vai
4. Usuário precisa pensar demais pra categorizar o problema

## Objetivo
Criar uma UX de feedback intuitiva onde Gabriel (ou qualquer usuário) consiga:
1. Entender imediatamente o que está avaliando
2. Dar feedback sem precisar conhecer a arquitetura interna
3. Ver claramente o impacto do feedback (pra onde vai, o que acontece)

## Constraints
- Manter compatibilidade com o pipeline existente (feedback ainda roteia pros agentes certos)
- Funcionar no dashboard web atual (HTML/JS/Tailwind)
- Não adicionar complexidade desnecessária

## Output Esperado
- Nova proposta de UI para o sistema de feedback
- Implementação no index.html
