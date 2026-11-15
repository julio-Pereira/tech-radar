---
id: medir-efeito-e-capstone
title: "Medir efeito e capstone"
summary: "Linhas geradas e taxa de aceite de sugestão são métricas de vaidade; o efeito aparece — ou não — no tempo de entrega, na taxa de falha e no retrabalho. As cinco métricas do DORA e as duas palavras 'retrabalho' que não são a mesma coisa, o que não medir e a lei de Goodhart, o desenho do piloto com grupo de comparação, o gargalo que muda para a revisão, o custo do modelo como FinOps e a resposta de entrevista — com um relatório que recusa velocidade sem estabilidade e classificou o piloto mais rápido e com mais código refeito como 'sem ganho comprovado' — e o capstone do fin-assist."
estimatedMinutes: 70
reviewedAt: 2026-11-15
reviewEvery: 3m
competencies: [execucao, negocio]
references:
  - title: "DORA — DORA's software delivery metrics: the four keys (guide)"
    url: https://dora.dev/guides/dora-metrics/
  - title: "DORA — A history of DORA's software delivery metrics"
    url: https://dora.dev/insights/dora-metrics-history/
  - title: "DORA — State of AI-assisted Software Development (2025)"
    url: https://dora.dev/research/2025/dora-report/
---

## O que se mede, e o que se exibe

A adoção de agentes produz dois tipos de número. Os fáceis: **linhas geradas**, **sugestões aceitas**,
**horas economizadas** que cada pessoa diz ter economizado. Os difíceis: quanto tempo uma mudança leva até
produção, quantas falham, quanto do que entrou foi refeito logo depois. Os primeiros sobem sempre; por
isso não dizem nada. São **métricas de vaidade**.

A **lei de Goodhart** completa o argumento: quando uma medida vira meta, ela deixa de ser boa medida. Se o
time é avaliado por "sugestões aceitas", aceita mais sugestões. Se é avaliado por "linhas", escreve mais
linhas, e o agente é ótimo nisso.

O efeito de verdade aparece, ou não, na **entrega**.

## As cinco métricas, e as duas palavras "retrabalho"

O DORA mede a entrega com **cinco métricas** desde o relatório de 2024, em dois grupos (conferido em 15 nov
2026, no guia de métricas do DORA):

| Grupo | Métrica | O que diz |
| --- | --- | --- |
| *throughput* | tempo de entrega da mudança (*change lead time*) | do *commit* até produção |
| *throughput* | frequência de *deploy* | quantas vezes o time entrega |
| *throughput* | tempo de recuperação de *deploy* que falhou | quanto leva para voltar |
| instabilidade | taxa de falha de mudança | fração de *deploys* que exigiram intervenção imediata |
| instabilidade | **taxa de retrabalho de *deploy*** | fração de *deploys* não planejados, feitos por causa de um incidente em produção |

A quinta métrica foi a mais recente a entrar; as quatro primeiras são as de `entrega-continua-e-devops/01`.

**Cuidado com a palavra "retrabalho".** Ela tem dois sentidos, e o piloto precisa dos dois:

- o **retrabalho de *deploy*** do DORA: *deploys* não planejados para corrigir produção;
- o **retrabalho de código**: linhas que um PR adicionou e outro PR reescreveu ou reverteu em poucos dias.
  É o sinal mais direto do código "plausível e errado" do marco 01, que passou na revisão e voltou.

Com agentes, o segundo costuma subir antes do primeiro: o código refeito na semana seguinte ainda não virou
incidente.

**O que mais olhar:** o **tempo de revisão** e o **tamanho do PR** (o gargalo muda de lugar, abaixo), o **defeito
escapado** (o que só apareceu em produção) e o **custo por PR integrado**.

## O que o DORA diz, e o que ele não diz por você

O relatório de 2025 associa a adoção de IA a **mais *throughput* e mais instabilidade**, e chama a IA de
amplificador: com teste, versão e *feedback* fortes, o ganho aparece; sem eles, o volume vira falha (marco 01).
Isso é uma associação numa pesquisa com milhares de respostas, não a previsão do seu time. O seu time mede o
próprio efeito.

## O desenho do piloto

O piloto mal desenhado mede outra coisa que não o agente:

- **antes e depois no mesmo time** mistura o agente com tudo o que mudou no período: a época do ano, o
  projeto, a pessoa nova. Precisa de um **grupo de comparação** que não adotou, no mesmo período;
- **times diferentes** não são comparáveis direto: o time do ledger e o time da tela de extrato têm *lead
  times* que não se comparam. Compare a **variação** de cada um (antes e depois, nos dois grupos), não os
  valores absolutos;
- **amostra pequena** engana: com dez *deploys* por grupo, uma falha a mais muda a taxa em dez pontos;
- **duração definida antes**, como no teste A/B de `entrega-continua-e-devops/07`: espiar o relatório toda
  semana e parar no primeiro número bom infla o falso positivo. A unidade aqui é o time, não o cliente, e
  times são poucos: a estatística é mais fraca, e a conclusão deve ser mais modesta. A experimentação em
  detalhe está em `ml-em-producao/08`.

## O gargalo muda de lugar

Quando o agente escreve mais depressa, o gargalo passa para a **revisão**: mais PRs, maiores, com os modos de
falha do marco 04 para procurar. Se o tempo de revisão sobe e o tamanho do PR cresce, o "ganho" de escrita
está sendo pago por quem revisa, e a qualidade da revisão cai. O PR pequeno e o escopo declarado do marco 04
são a resposta; o tempo de revisão é a medida que mostra se ela funcionou.

## O custo do modelo é FinOps

O agente tem custo por uso: *tokens*, assentos, execução. Ele entra no modelo de custo como qualquer outra
linha (`engenharia-de-plataforma/08`), com dono, orçamento e a unidade de negócio ao lado: **custo por PR
integrado**, e não custo por mês. Um piloto que dobra o custo por PR para um ganho de *lead time* que o grupo
de comparação também teve não se paga.

## Adotar sem virar obrigação nem proibição

A adoção num time não funciona por decreto, nem num sentido nem no outro (`lideranca-tecnica/07`):

- **obrigação** ("todo PR com agente") produz as métricas de vaidade e esconde onde ele atrapalha;
- **proibição** empurra o uso para fora do ambiente controlado, sem portão, sem registro, sem política de
  dados;
- o caminho é o desta trilha: a **matriz de delegação** diz onde vale, o **portão** e o ***harness*** limitam,
  a **medição** diz se valeu, e o time revisa os três a cada trimestre.

## "Como você usa IA?"

A pergunta aparece em toda entrevista de sênior. A resposta fraca lista ferramentas e conta quanto tempo
economizou. A resposta forte tem a estrutura desta trilha:

1. **onde delego, e por quê:** pelo custo de verificar, com o caminho do dinheiro tratado à parte;
2. **como especifico:** critério de aceite como teste, ambiguidade marcada;
3. **o que limita o agente:** escopo, portão, segredo fora do contexto, outra pessoa no irreversível;
4. **como sei se valeu:** o *lead time* junto com a falha e o retrabalho, contra um grupo de comparação;
5. **o que não funcionou:** um caso concreto, e o controle que nasceu dele.

> **Armadilha.** Apresentar "o time aceitou 40% das sugestões" como resultado do piloto. É a medida de que o
> time usou a ferramenta, não de que a entrega melhorou.

> **O que o laboratório não reproduz.** A medição roda sobre um histórico sintético, com o efeito plantado.
> Ela prova que o relatório calcula certo, recusa a velocidade sozinha e não declara ganho quando o
> retrabalho sobe. Se o seu time ganhou ou perdeu, só o histórico real diz.

## Exemplo numa fintech

O piloto de agentes do time de pagamentos foi apresentado com um número: o *lead time* caiu de 45 para 17
horas. A diretoria quis expandir. O relatório da medição, que recusa mostrar velocidade sem estabilidade e
retrabalho, mostrou o resto: a taxa de falha tinha ido de 10% para 30%, e 30% das linhas adicionadas pelo
piloto foram refeitas em menos de 14 dias, contra 8% no grupo de comparação. Veredito: **sem ganho
comprovado**. A correção:

- o piloto continuou, com o *harness* do marco 04 na esteira e o PR limitado pela classe;
- o relatório trimestral passou a mostrar as cinco métricas do DORA e o retrabalho de código, sempre juntos;
- a expansão ficou condicionada a o retrabalho voltar ao nível do grupo de comparação.

## Hands-on

**Tutorial.** A medição do `fin-assist` (`medicao/`) calcula, sobre um histórico sintético de PRs e *deploys*:
o *lead time*, o tempo de revisão, a taxa de falha, o tempo de recuperação, o retrabalho de *deploy* e o
retrabalho de código numa janela de N dias.

**Desafio.** O relatório do piloto (`Comparar`), que compara o grupo de comparação com o piloto e dá o
veredito.

**Invariantes testáveis**

1. **Valores exatos sobre massa conhecida.** Com 4 PRs e 10 *deploys* por grupo, medido:
   - *lead time* de 45 h no grupo de comparação e de 17h30 no piloto;
   - taxa de falha de 10% e de 30%;
   - retrabalho de *deploy* de 20% no piloto;
   - retrabalho de código de 1/12 e de 6/20.
2. **Velocidade sozinha, recusada.** O relatório pedido sem estabilidade devolve erro, não um número.
3. **Mais rápido e mais retrabalho: sem ganho comprovado.** O piloto da massa tem o *lead time* menor e o
   retrabalho maior. O veredito é "sem ganho comprovado". O mesmo piloto, com a estabilidade e o retrabalho do
   grupo de comparação, é "ganho".
4. **O retrabalho respeita a janela.** A linha refeita 30 dias depois fica fora da janela de 14 dias (6/20) e
   entra na de 31 (7/20).
5. **Grupos desiguais, sinalizados.** 4 × 4 PRs não alerta; 12 × 4 alerta. Menos de 30 *deploys* por grupo também
   gera um alerta de amostra pequena.

**Complemento.** Exporte 90 dias de PRs e *deploys* do seu time e rode a medição. Qual é o retrabalho de código
de hoje, antes de qualquer piloto? Esse é o número que o piloto vai precisar não piorar.

**Checagem**

1. Por que linhas geradas e sugestões aceitas são métricas de vaidade?
2. Qual a diferença entre o retrabalho de *deploy* do DORA e o retrabalho de código, e por que o piloto precisa
   dos dois?
3. Por que o piloto precisa de um grupo de comparação, e o que comparar quando os times são diferentes?
4. Para onde vai o gargalo quando o agente escreve mais depressa, e como isso aparece na medição?

## Capstone

O `fin-assist` é o seu componente do `fin-platform`: o kit que torna seguro e mensurável o uso de agentes de
código nos outros componentes, especificado no `PROJETO.md` desta trilha. Aqui ele fica pronto, e nada nele
exige modelo, chave de API ou rede externa.

**Entrega**

O limite por período do `pix-gateway`, entregue de ponta a ponta por SDD:

- [ ] A matriz de delegação e o classificador, com o caminho do dinheiro tratado à parte (marco 01)
- [ ] A especificação, o plano e as tarefas versionados, com o `speclint` aprovando (marco 02)
- [ ] A ida e volta com o Spec Kit, com a versão fixada e as especificações com dono (marco 03)
- [ ] O `AGENTS.md`, com comandos que um teste executa, e o PR aceito pelo *harness* (marco 04)
- [ ] A ferramenta MCP de leitura usada na investigação, atrás do *token* certo e com auditoria (marco 05)
- [ ] A sessão do agente sob o portão de política, com o registro encadeado (marco 06)
- [ ] O relatório de medição do piloto (marco 07)

**Critérios de pronto, cada um provado por um comando**

- [ ] `make spec`: a especificação passa no `speclint`, as bordas da janela são testes de tabela, e a ida e volta
      com o Spec Kit preserva os identificadores
- [ ] `make harness`: o patch bom entra; a asserção removida, a enfraquecida, o patch fora do escopo, o PR grande
      e a autoaprovação são recusados
- [ ] `make mcp`: o *token* de outra audiência é recusado sem tocar no dado, nenhuma ferramenta escreve, a saída não
      tem dado pessoal, e a versão negociada é a 2026-07-28
- [ ] `make portao`: o agente enganado tenta a exfiltração, e nada sai; a sessão com as três capacidades é recusada
- [ ] `make medicao`: o relatório recusa a velocidade sozinha e não declara ganho quando o retrabalho sobe
- [ ] Tudo roda em CI sem chave de API e sem rede externa (`make tudo`)

**A pergunta final.** Qual parte desta entrega você só aceitou porque os testes passaram — e o que nesses testes
garante que eles falhariam se o agente tivesse errado?

## Principais aprendizados

- Linhas geradas, sugestões aceitas e horas declaradas são vaidade; quando viram meta, Goodhart.
- Cinco métricas do DORA, desde 2024: três de *throughput* e duas de instabilidade, entre elas o retrabalho de
  *deploy*.
- Retrabalho de código (linhas refeitas em N dias) não é o retrabalho de *deploy*; o piloto mede os dois.
- Piloto com grupo de comparação, duração definida antes e variação, não valor absoluto, entre times diferentes.
- O gargalo vai para a revisão; o custo do modelo é FinOps, por PR integrado.
- Medido: o piloto mais rápido (45 → 17h30) com mais código refeito (8% → 30%) foi "sem ganho comprovado".
