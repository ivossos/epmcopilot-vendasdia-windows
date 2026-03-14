# Reunião Zoom – Resumo Executivo
**Data:** 09/03/2026 (GMT20260309-124151)

---

## Resumo em uma frase

Reunião sobre integração RP→EPM, razão contábil com drill-down, conciliação e licenciamento. O problema central é que os dados do RP não estão subindo para o EPM; o Lucas está envolvido na solução técnica.

---

## Pontos principais

### 1. Problema crítico: RP → EPM não funciona
- O razão contábil não está sendo gerado do RP para o EPM
- Funciona apenas o balancete
- Quando tentaram subir, pegou um valor de uma conta e replicou para todas (erro)
- Nunca chegou a levar o RP pro EPM corretamente
- **Responsável técnico:** Lucas – precisa explicar por que não está subindo

### 2. Razão contábil e drill-down
- Necessidade de drill-down: total → loja → conta → lançamento → nota
- Colunas do razão: layout definido com Lucas; exportar só o necessário
- Contas com alto volume: folha, mineração, CMV – podem estourar 2M de linhas
- Estratégia: gerar razão por loja/filial, não da rede inteira, para evitar limite

### 3. Limite de linhas (2 milhões)
- Relatórios com >2M registros estouram
- Solução: análise por loja primeiro; identificar lojas com divergência (ex.: 1, 2, 5, 10); gerar razão só dessas
- Contas críticas: CMV, perdas, folha (algumas dentro do grupo)

### 4. Licenciamento
- ~30 pessoas precisariam de acesso; muitas não têm licença RP
- RP é caro; custo de licença para gerentes é preocupação
- Alternativa: visão simplificada no EPM para quem não tem acesso ao RP
- Responsabilidade de orçamento: gerente e diretor, não assistente

### 5. Grupos de contas
- **Grupo 3 e 4:** prioridade para exportação diária
- **Grupo 1 e 2:** ativos – não precisam
- **Grupo 5:** condomínio e estacionamento – precisa
- **Grupo 6:** tem ali

### 6. Processo de conciliação
- Contadoria (4 pessoas) faz análise de fechamento
- Fluxo: cronograma de fechamento → provisões → análises → reclassificação
- Conciliações: orçamento vs realizado, gerencial vs contábil, contabilidade vs financeiro
- Financeiro: conciliação de bancos
- Não há sistema automático que diga “só isso você vai olhar”

### 7. Estados do processo
- **Manual:** procedimento atual
- **Mecanizado:** repetição de receita/processo
- **Automatizado:** ferramenta que automatiza na hora do clique

---

## Ações / Próximos passos

| # | Ação | Responsável |
|---|------|-------------|
| 1 | Reunião com Lucas para entender por que RP não sobe para EPM | — |
| 2 | Confirmar colunas definidas para exportação do razão (Lucas) | Lucas |
| 3 | Avaliar custo de licenças RP para ~30 pessoas / gerentes | — |
| 4 | Avaliar modelo de visão simplificada no EPM (sem acesso ao RP) | — |
| 5 | Definir processo: quando precisar focar em conta, passar para quem tem acesso | — |
| 6 | Manter relatório que atualiza razão (grupos 3 e 4) diariamente | — |
| 7 | Replicar reunião/demonstração com outra pessoa (professor/lado dele) | — |

---

## Arquivos relacionados

| Arquivo | Localização |
|---------|-------------|
| **Resumo executivo** | `epmcopilot-vendasdia/reuniao_zoom_20260309_resumo.md` |
| **Transcrição limpa** | `epmcopilot-vendasdia/reuniao_zoom_20260309_transcricao_limpa.md` |
| **Transcrição original** | `~/Downloads/GMT20260309-124151_Recording_1920x1080.txt` |
| **Vídeo** | `~/Downloads/GMT20260309-124151_Recording_1920x1080.MP4` |
