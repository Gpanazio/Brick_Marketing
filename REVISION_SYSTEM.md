# Sistema de Revisão Visual - War Room

## Visão Geral

O Sistema de Revisão Visual permite iteração transparente e visual no processo de criação de conteúdo. Quando o humano solicita revisões, elas aparecem como **nós laranja destacados** ao lado do node HUMAN no gráfico do War Room, mostrando claramente o histórico de iterações.

## Arquitetura

### Frontend (index.html)

#### Detecção Automática
```javascript
const revisionFiles = projectFiles.filter(f => /REVISAO_\d+/.test(f.name));
```
O sistema busca arquivos com padrão `REVISAO_1.md`, `REVISAO_2.md`, etc.

#### Renderização Dinâmica
- **Posição:** Perfeitamente alinhado ao lado do HUMAN (mesma altura Y, offset X de 370px)
- **Largura:** 320px (mesma largura de todos os nós)
- **Visual:** Borda laranja dupla, LED pulsante, background semi-transparente
- **Conexões:** Linha laranja pontilhada conectando HUMAN → REVISÃO

#### CSS Específico
```css
.node[data-provider="revision"] {
    border-left: 2px solid #f97316;
    border: 2px solid #f97316;
    background: rgba(249, 115, 22, 0.05);
}
.node[data-provider="revision"] .node-led {
    background: #f97316;
    box-shadow: 0 0 12px #f97316;
    animation: pulse-revision 2s ease-in-out infinite;
}
```

### Backend (server.js)

#### Endpoints

**POST `/api/feedback`**
```json
{
  "jobId": "1770309268711_lancamento_brick_ia_fran",
  "mode": "marketing",
  "feedback": "Texto muito longo, dividir em posts para Instagram, LinkedIn e Twitter"
}
```
Cria arquivo de feedback que será processado.

**POST `/api/revisions/:jobId/approve`**
```json
{
  "mode": "marketing",
  "revisionNumber": 1
}
```
- Busca `REVISAO_1.md`
- Substitui arquivo de output original (ex: `SOCIAL_SLICE.md`)
- Cria backup timestampado
- Atualiza status no diff JSON

**POST `/api/revisions/:jobId/reject`**
```json
{
  "mode": "marketing",
  "revisionNumber": 1
}
```
- Move `REVISAO_1.md` para `feedback/archived/`
- Marca feedback como resolvido
- Limpa diff status

## Fluxo de Uso

### 1. Solicitar Revisão
```
War Room → Projeto → Node HUMAN → Botão "REVISAR"
↓
Modal de Feedback → Escrever o que precisa ser ajustado → "ENVIAR FEEDBACK"
```

### 2. Processamento
O backend (ou watcher):
1. Identifica o modelo campeão via `07_COPY_SENIOR.json` → `modelo_vencedor`
2. Chama o modelo com:
   - Contexto original (copy vencedora)
   - Feedback do humano
   - Role file do agente
3. Salva output como `{jobId}_REVISAO_1.md`

### 3. Visualização
```
Refresh da página → Sistema detecta REVISAO_1.md → Cria node laranja ao lado do HUMAN
```

### 4. Revisão
```
Duplo-clique no node REVISAO_1 → Lê conteúdo no painel lateral
↓
Avaliar se atende ao feedback
↓
Clicar "✓ APROVAR" OU "✗ REJEITAR"
```

### 5. Aprovação
- Backup do original criado
- Revisão substitui o output
- Node desaparece (ou fica marcado como aprovado)

### 6. Rejeição
- Revisão arquivada
- Node desaparece
- Humano pode solicitar nova revisão (loop)

## Mapeamento de Arquivos

```javascript
const fileMapping = {
    'REVISÃO 1': ['REVISAO_1'],
    'REVISÃO 2': ['REVISAO_2'],
    'REVISÃO 3': ['REVISAO_3'],
    'REVISÃO 4': ['REVISAO_4']
};
```

## Decisões de Design

### Por que nós ao lado e não acima/abaixo?
- **Visibilidade:** Fica claro que é uma iteração lateral, não uma etapa nova do pipeline
- **Histórico:** Múltiplas revisões ficam em fila horizontal, mostrando toda a evolução
- **Sem poluição vertical:** Pipeline principal não cresce infinitamente

### Por que linha pontilhada laranja?
- **Diferenciação:** Linhas vermelhas = pipeline principal | Linhas laranjas = iteração
- **Pontilhado:** Indica que é um desvio temporário, não uma conexão permanente
- **Cor:** Laranja é atenção/alerta, mas não tão agressivo quanto vermelho

### Por que SOCIAL_SLICE foi removido como nó fixo?
- **Redundância:** O conteúdo fatiado é o próprio resultado da revisão
- **Confusão:** Ter um nó vazio "SOCIAL_SLICE" antes da revisão não fazia sentido
- **Simplicidade:** HUMAN → REVISÃO → OUTPUT é mais limpo

### Por que OUTPUT é condicional?
- **Feedback visual claro:** Se OUTPUT não aparece = projeto não foi aprovado
- **Evita cliques vazios:** Não adianta tentar abrir OUTPUT se ele não existe
- **Lógica de negócio:** Output só existe após aprovação final

## Troubleshooting

### Linha laranja não aparece
1. **Verificar console do navegador:** F12 → Console → erros de JavaScript?
2. **Verificar coordenadas:** Nós HUMAN e REVISÃO estão renderizados?
3. **Inspecionar SVG:** DevTools → Elements → `<svg id="conn-svg">` → tem elementos `<line>`?
4. **Hard refresh:** Cmd+Shift+R para limpar cache

### Node de revisão não aparece
1. **Verificar arquivo:** `ls history/marketing/wip/*REVISAO*.md` existe?
2. **Verificar regex:** Nome do arquivo bate com `/REVISAO_\d+/`?
3. **Verificar jobId:** Frontend está filtrando pelo jobId certo?
4. **Refresh:** Dar F5 após criar o arquivo

### Botões não funcionam
1. **Verificar endpoint:** Backend está respondendo em `/api/revisions/:jobId/approve`?
2. **Verificar API Key:** Header `X-API-Key: brick-squad-2026` está presente?
3. **Verificar logs:** Backend console mostra erro?
4. **Verificar permissões:** Arquivos podem ser movidos/renomeados?

## Exemplos de Uso Real

### Caso 1: Copy muito longa
```
Feedback: "Texto muito longo para redes sociais. Dividir em: Instagram (visual + legenda curta), LinkedIn (autoridade + escaneável), Twitter (thread 5-7 tweets)"

Resultado: REVISAO_1.md com 3 seções distintas, cada uma adaptada para a plataforma.
```

### Caso 2: Tom inadequado
```
Feedback: "Tom muito corporativo. Precisa ser mais casual e direto, como o vídeo original."

Resultado: REVISAO_1.md com linguagem mais coloquial, menos jargão, mais personalidade.
```

### Caso 3: Informação faltando
```
Feedback: "Falta mencionar o diferencial do Production Enhanced. É o core da mensagem."

Resultado: REVISAO_1.md com parágrafo destacado sobre Production Enhanced em cada versão.
```

## Roadmap Futuro

- [ ] Diff visual entre original e revisão (highlight de mudanças)
- [ ] Histórico de feedbacks anteriores visível no modal
- [ ] Sugestões automáticas de ajustes baseadas em padrões
- [ ] Métricas de aprovação (quantas revisões em média até aprovar)
- [ ] Exportação de histórico de revisões para relatório

## Contribuindo

Se você encontrar bugs ou tiver sugestões, documentar em:
- `MEMORY.md` (workspace OpenClaw) - para lições aprendidas
- Issues no GitHub - para bugs/features
- Este arquivo - para documentação técnica

---

**Última atualização:** 05/02/2026  
**Versão:** 2.0  
**Status:** Production Ready
