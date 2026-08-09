---
id: vocabulario-de-confiabilidade
title: "Vocabulário de confiabilidade"
summary: "SLI, SLO, SLA, error budget, a matemática dos noves e as métricas de tempo de incidente — cada termo com o erro comum que ele costuma esconder."
estimatedMinutes: 50
references:
  - title: "Google SRE Book — Service Level Objectives"
    url: https://sre.google/sre-book/service-level-objectives/
  - title: "Google SRE Workbook — Implementing SLOs"
    url: https://sre.google/workbook/implementing-slos/
  - title: "Google SRE Book — Eliminating Toil"
    url: https://sre.google/sre-book/eliminating-toil/
---

## O marco-dicionário

Este é o marco que dá nome às coisas. Cada termo vem com definição em uma frase, o
exemplo no `fin-platform` e — o mais importante — o **erro comum** associado, porque é
o erro que revela se o termo foi entendido ou decorado.

Não instale nada. Aqui é vocabulário; a aplicação profunda de SLO vira código no
marco 12.

## SLI, SLO, SLA — a hierarquia

- **SLI** (*indicator*) — **o que você mede**: a razão entre eventos bons e eventos
  válidos. *"Proporção de `POST /payments` que responde em menos de 500ms sem erro 5xx."*
  Note a forma: uma razão, não uma média. "Latência média" não é um SLI.
- **SLO** (*objective*) — **a meta interna** sobre esse SLI, com janela explícita.
  *"99,9% em 30 dias corridos."*
- **SLA** (*agreement*) — **o contrato externo**, com consequência jurídica ou
  financeira. *"Abaixo de 99,5% no mês, multa contratual."*

A regra que organiza tudo: **o SLO é sempre mais apertado que o SLA**, e a diferença é
a sua margem de manobra. SLO de 99,9% com SLA de 99,5% significa que você tem um alarme
disparando muito antes de o jurídico ser envolvido. SLO igual ao SLA significa que o
primeiro sinal de problema já é uma multa.

> **Erro comum:** usar os três como sinônimos numa reunião, e sair de lá com um SLA
> assinado que é na verdade a aspiração de alguém.

## Error budget

Se o SLO é 99,9%, então 0,1% de falha é **permitido**. Esse complemento é o **error
budget** — em 30 dias, cerca de 43 minutos.

A mudança é política, não matemática: falha deixa de ser acidente e vira **orçamento
planejado**. Enquanto há budget, o time lança feature; quando o budget acaba, a
prioridade muda para confiabilidade até ele se recompor. Isso é o que uma *error budget
policy* escreve (marco 12), e é o que transforma "precisamos ser mais estáveis" numa
regra em vez de uma opinião.

> **Erro comum:** tratar error budget como meta a atingir (*"gastamos só 10%, ótimo!"*).
> Budget sistematicamente não gasto significa SLO conservador demais — você está
> deixando velocidade na mesa e provavelmente investindo em confiabilidade que ninguém
> percebe.

## A matemática dos noves

| Disponibilidade | Indisponibilidade/mês | Indisponibilidade/ano |
| --- | --- | --- |
| 99% | 7h 12min | 3,65 dias |
| 99,9% | 43min | 8,76h |
| 99,95% | 21min | 4,38h |
| 99,99% | 4min 20s | 52min |
| 99,999% | 26s | 5min 15s |

Dois fatos que essa tabela esconde e que decidem discussões:

**Dependências em série multiplicam.** Quatro serviços de 99,9% encadeados entregam
0,999⁴ ≈ **99,6%** — de 43min/mês para quase 3 horas. Você não pode prometer, para um
fluxo, mais do que o produto das disponibilidades do caminho crítico. É por isso que
redundância em paralelo existe: dois componentes de 99% em paralelo, com falhas
independentes, dão 99,99%. E "independentes" é a palavra que quase nunca é verdade —
duas réplicas na mesma AZ, com o mesmo bug, não são independentes.

**"99,9% de quê, em qual janela?"** é a pergunta que desmonta a maioria dos SLAs.
99,9% de disponibilidade medida como *o processo está de pé* é trivial e inútil. Medida
como *o cliente consegue concluir um pagamento*, é difícil e significa alguma coisa. E
janela de 30 dias corridos se comporta muito diferente de janela de mês-calendário: no
dia 1º, o budget do mês-calendário zera e um incidente do dia 31 desaparece do relatório.

## MTTD, MTTA, MTTR, MTBF

- **MTTD** — tempo médio até **detectar**. Quase sempre o maior pedaço, e o mais barato
  de reduzir (alerta melhor, sintético).
- **MTTA** — até **reconhecer** (alguém aceitou o pager). MTTA alto é sintoma de *alert
  fatigue*, não de gente preguiçosa.
- **MTTR** — até **restaurar** o serviço. Restaurar, não consertar a causa raiz: reverter
  o deploy conta.
- **MTBF** — tempo médio **entre** falhas.

E a crítica honesta, que é o motivo de este bloco existir: **MTTR é uma média, e média
esconde a cauda.** Dois incidentes de 5 minutos e um de 6 horas não são "média de 2h de
problema" — são dois arranhões e uma catástrofe, e a catástrofe é a única que importa
para o cliente e para o regulador.

Reporte distribuição: mediana, p90, e a lista dos piores. Esse é o gancho direto para o
marco 04, onde a mesma crítica se aplica à latência — e é a mesma falha de raciocínio
nos dois casos.

## Toil

**Toil** é trabalho manual, repetitivo, automatizável, sem valor duradouro e que cresce
linearmente com o tamanho do sistema. Reiniciar um pod toda segunda-feira é toil.
Aprovar acesso por e-mail é toil.

Medi-lo (a fração do tempo do time gasta nele) é a **defesa do time contra virar
operação**. Sem número, "estamos afogados em operação" é reclamação; com número, é um
argumento de alocação. O limite usual da literatura de SRE é 50% — acima disso, o time
não consegue mais reduzir o próprio toil e a espiral se fecha.

> **Erro comum:** confundir toil com trabalho operacional em geral. Investigar um
> incidente novo não é toil — é o trabalho. Executar pela 40ª vez o mesmo runbook de
> 6 passos, é.

## Blast radius e failure domain

**Failure domain** é o conjunto de coisas que caem juntas quando algo falha: uma AZ,
um nó, um cluster, um banco compartilhado. **Blast radius** é o alcance do estrago de
uma falha ou de uma mudança.

Você já viu os dois na trilha `kubernetes` sem esse nome: namespace separando domínios,
`topologySpreadConstraints` espalhando réplicas entre zonas, PodDisruptionBudget
limitando quantos pods somem de uma vez, canary limitando o alcance de um deploy ruim.
Todos são a mesma ideia — **conter**, já que não é possível eliminar a falha.

A pergunta operacional: *"o que cai junto com isso?"*. Se a resposta é "tudo", você não
tem redundância, tem cópias.

## Termos que voltam depois

Apresentados aqui como vocabulário, aprofundados adiante:

- **Alert fatigue** — quando alertas demais (ou irrelevantes demais) treinam o time a
  ignorá-los. É a causa nº 1 de MTTA alto. Marco 13.
- **On-call** — a escala de plantão. Sustentável ou não, e o que torna cada uma.
  Marco 13.
- **Runbook** — o documento que diz o que fazer quando *este* alerta dispara. Alerta sem
  runbook é um susto. Marco 13.
- **Post-mortem blameless** — a análise pós-incidente que investiga o sistema em vez de
  procurar culpado; sem isso ninguém escreve a verdade. Marco 15.
- **RCA** — a análise de causa raiz, e a armadilha de parar na primeira causa
  plausível. Marco 15.
- **Burn rate** — a velocidade com que o error budget está sendo consumido; é o que
  torna possível alertar por SLO em vez de por limiar. Marco 13.

E um termo de legado: **Apdex**, um índice de satisfação com base num limiar de latência
(satisfeito / tolerável / frustrado). Você vai encontrá-lo em ferramenta antiga. Caiu em
desuso porque o limiar é arbitrário e o índice **esconde a distribuição** — dois
sistemas muito diferentes produzem o mesmo Apdex. Mesma crítica do MTTR e da latência
média: um número agregado no lugar de uma distribuição.

## Exemplo numa fintech

O SLA com o PSP diz 99,5% mensal para a API de autorização, com crédito em fatura se
descumprido. O jurídico assinou; a engenharia precisa sustentar.

O desenho honesto:

- **SLO interno do `pix-gateway`: 99,9%** — mais apertado que o SLA, para haver margem.
- Mas a autorização **depende** do PSP, que é 99,5% contratual. Um SLO de 99,9% que
  inclui a indisponibilidade do parceiro é uma promessa impossível de cumprir: você não
  controla o denominador.
- Duas saídas, e as duas aparecem no marco 12: excluir a falha do parceiro do SLI (e
  ter um SLI separado para ela, para não ficar cego), ou ter mais de um PSP no caminho
  crítico e medir o fluxo, não o parceiro.

Esse é o momento em que vocabulário vira arquitetura: a decisão de contratar um segundo
PSP é consequência direta de fazer a conta da disponibilidade composta.

## Hands-on

**Tutorial — traduzir um SLA em SLI+SLO.** Você recebe esta cláusula de um parceiro:

> *"O CONTRATADO garante disponibilidade de 99,5% do serviço, apurada mensalmente,
> excluindo-se janelas de manutenção programada comunicadas com 48h de antecedência."*

Produza: (1) o SLI verificável correspondente, na forma "eventos bons / eventos
válidos", dizendo **onde** ele é medido (no cliente ou no servidor — e por que isso muda
o número); (2) o SLO interno que você adotaria e a margem escolhida; (3) as três
perguntas que você faria ao parceiro antes de aceitar a cláusula. Comece pela mais
importante: *manutenção programada conta como indisponibilidade para o meu cliente?*

**Desafio — disponibilidade composta.** O fluxo de iniciação de pagamento do
`fin-platform` atravessa, em série:

| Componente | Disponibilidade |
| --- | --- |
| Gateway de borda | 99,95% |
| `pix-gateway` | 99,9% |
| `ledger-core` | 99,9% |
| PSP externo | 99,5% |

1. Calcule a disponibilidade composta do fluxo e converta para minutos/mês.
2. Diga qual SLO é **honesto** prometer para "iniciar um pagamento".
3. Aponte o componente que domina a perda e proponha **uma** mudança arquitetural que
   melhore o número — com a nova conta feita.
4. Responda: se você puser dois PSPs em paralelo, qual é a nova disponibilidade **e**
   qual premissa dessa conta é provavelmente falsa na vida real?

**Checagem.** (a) Por que o SLO deve ser mais apertado que o SLA? (b) O time gastou 8%
do error budget no mês — isso é bom? (c) Três incidentes: 4min, 6min e 5h. Qual número
você leva para a diretoria e por quê? (d) Aprovar acesso manualmente toda sexta é toil;
investigar um incidente novo é toil?

## Principais aprendizados

- SLI é o que se mede (razão de eventos bons/válidos), SLO é a meta interna, SLA é o
  contrato externo — e o SLO precisa ser mais apertado, senão não há margem.
- Error budget é orçamento a gastar, não meta a atingir; budget nunca gasto é SLO
  conservador demais.
- Dependências em série multiplicam: quatro serviços de 99,9% não entregam 99,9%, e a
  independência que a redundância pressupõe raramente existe.
- MTTR médio e Apdex escondem a cauda pela mesma razão que a latência média (marco 04):
  um agregado no lugar de uma distribuição.
