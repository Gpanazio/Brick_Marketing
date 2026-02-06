# UI Fixes - 06/02/2026

## Problema 1: Linhas de Revisão Não Aparecem

### Sintoma
Nós de REVISÃO criados dinamicamente, mas linha laranja pontilhada não conecta ao HUMAN.

### Causa Raiz
`updateConnections(activeRevisionLinks)` chamado **imediatamente após** `appendChild()`.

Navegador ainda não calculou `getBoundingClientRect()` dos novos elementos.

### Tentativas Falhadas
1. `setTimeout(100)` - funciona mas flicka
2. `getBoundingClientRect()` direto - retorna 0,0,0,0
3. `offsetLeft/offsetTop` - valores errados (relativos ao parent, não container)
4. Trocar por `style.left/top` - valores em string ("2050px"), não numéricos

### Solução Final
```javascript
// ANTES (linha não aparece)
activeRevisionLinks.push(['n9', revId]);
updateConnections(activeRevisionLinks);

// DEPOIS (funciona)
activeRevisionLinks.push(['n9', revId]);
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        updateConnections(activeRevisionLinks);
    });
});
```

**Por quê funciona:**
- Primeiro `requestAnimationFrame`: espera o navegador commitar mudanças no DOM
- Segundo `requestAnimationFrame`: espera o navegador **calcular layout** (reflow)
- Aí sim `getBoundingClientRect()` retorna coordenadas válidas

**Referência:**
- MDN: requestAnimationFrame fires before next repaint
- Duplo RAF garante que reflow já aconteceu

---

## Problema 2: Nós de Loop Poluindo UI

### Contexto
Pipeline tem loop automático Copy Senior ↔ Wall (score < 80, max 3x).

Backend gera arquivos:
- `COPY_SENIOR_v2.json`
- `WALL_v2.json`
- `COPY_SENIOR_v3.json`
- `WALL_v3.json`

Frontend detectava esses arquivos e criava nós visuais.

### Decisão do Gabriel
"sem mostrar o looping"

Loop é detalhe técnico. Usuário quer ver resultado final, não iterações internas.

### Implementação
Comentar blocos que criam nós de loop:

```javascript
// ANTES: detectava _v2, _v3 e criava nós
const loopWallFiles = projectFiles.filter(f => /_v(\d+)\.json$/i.test(f.name) && f.name.includes('WALL'));
const loopCopyFiles = projectFiles.filter(f => /_v(\d+)\.json$/i.test(f.name) && f.name.includes('COPY_SENIOR'));

loopCopyFiles.forEach((copyFile, idx) => {
    // criar node loop-copy-2, loop-copy-3
});

loopWallFiles.forEach((wallFile, idx) => {
    // criar node loop-wall-2, loop-wall-3
});

// Desenhar linhas do loop
const loopLinks = [];
if (document.getElementById('loop-copy-2')) loopLinks.push(['n8', 'loop-copy-2']);
// ...

// DEPOIS: comentado inteiro
// const loopWallFiles = ...
// const loopCopyFiles = ...
```

**Efeito:**
- UI mostra apenas pipeline principal (00-08) + REVISÕES humanas
- Loop continua funcionando no backend (scripts não alterados)
- Histórico preservado nos arquivos `_v2.json`, `_v3.json`
- Se precisar debugar loop: inspecionar arquivos via terminal

---

## Boas Práticas (Aprendidas Hoje)

### 1. Timing de Render
**Problema:** Coordenadas de elementos dinâmicos.

**Solução:** 
- `appendChild()` → `requestAnimationFrame()` → `requestAnimationFrame()` → desenhar linhas
- Nunca assumir que coordenadas estão prontas logo após criar elemento

### 2. UI != Backend
**Problema:** UI fica poluída com nós técnicos.

**Solução:**
- Esconder detalhes de implementação (loops, retries, fallbacks)
- Mostrar apenas o que gera valor pro usuário
- Preservar histórico completo nos arquivos (debuggable via terminal/logs)

### 3. Comentar != Deletar
**Problema:** Código pode ser útil depois.

**Solução:**
- Comentar blocos grandes com `// DESABILITADO (Gabriel pediu pra esconder)`
- Deixar contexto do porquê foi desabilitado
- Git guarda o histórico, mas comentário no código ajuda quem lê

### 4. requestAnimationFrame
**Quando usar:**
- Criar elementos dinamicamente + desenhar linhas/gráficos baseados em posição
- Animações que dependem de layout calculado
- Qualquer coisa que usa `getBoundingClientRect()` de elemento recém-criado

**Quando NÃO usar:**
- Elementos estáticos (posições fixas)
- Operações síncronas (setTimeout é melhor se precisa de delay específico)
- Listeners de eventos (não precisa esperar render)

---

## Commits Relacionados

- `5c99f23` - feat: servidor local testado, pronto para deploy (último antes deste doc)
- (próximo) - fix: linhas de revisão + nós de loop escondidos

---

*Douglas - 06/02/2026 13:09*
