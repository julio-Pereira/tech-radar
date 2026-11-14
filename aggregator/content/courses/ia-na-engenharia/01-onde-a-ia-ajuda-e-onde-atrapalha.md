---
id: onde-a-ia-ajuda-e-onde-atrapalha
title: "Onde a IA ajuda e onde atrapalha"
summary: "O ganho de um agente é limitado pelo custo de verificar o que ele entregou; tarefa barata de verificar é boa candidata, tarefa cara de verificar é risco. Assistente × agente, o colaborador não determinístico e sem memória, a taxonomia por custo de verificação e raio de explosão, os modos de falha típicos, o que o DORA de 2025 diz sobre throughput e instabilidade — e uma matriz de delegação em YAML, provada por testes, cujo classificador pôs o teste de uma regra na classe da regra, e não na de 'teste'."
estimatedMinutes: 50
reviewedAt: 2026-11-14
reviewEvery: 3m
competencies: [decisao, execucao]
references:
  - title: "DORA — State of AI-assisted Software Development (2025)"
    url: https://dora.dev/research/2025/dora-report/
  - title: "DORA — Balancing AI tensions"
    url: https://dora.dev/insights/balancing-ai-tensions/
  - title: "AGENTS.md"
    url: https://agents.md/
---

## Assistente e agente não são a mesma ferramenta

Um **assistente de código** completa: sugere a próxima linha, a função, o teste, e você aceita ou não, uma
sugestão de cada vez. Um **agente de código** age em laço: lê o repositório, **planeja**, edita vários
arquivos, roda comandos, **observa** o resultado e repete até achar que terminou. A diferença não é de
qualidade do modelo; é de quanto o resultado anda sem você olhar.

Duas propriedades do agente mudam o trabalho de quem o usa:

- **ele não é determinístico.** A mesma tarefa, pedida duas vezes, pode virar dois patches diferentes. Um
  teste que "passou com o agente" provou aquele patch, não o próximo;
- **ele não tem memória entre sessões.** O que ele "aprendeu" ontem sobre o seu repositório não existe
  hoje, a menos que esteja escrito num lugar que ele lê: o arquivo de instruções do repositório
  (`AGENTS.md`, marco 04), a especificação (marco 02) e os testes.

Por isso, o que vale escrever para um agente é o que vale escrever para um colega novo que chega toda
manhã sem lembrar de nada: o comando de teste, a convenção, o limite.

## O custo que manda é o de verificar

O agente escreve depressa. O gargalo passa a ser **saber se o que ele escreveu está certo**. Esse é o
**custo de verificação**, e ele decide se delegar compensa:

| Tarefa | Custo de verificar | Raio de explosão se errar | Delegar? |
| --- | --- | --- | --- |
| renomear, formatar, migrar uma API depreciada | baixo: o compilador e os testes dizem | pequeno | sim, com testes rápidos |
| escrever testes para código existente | médio: o teste pode confirmar o erro | pequeno a médio | sim, revisando as asserções |
| regra de negócio fora do dinheiro (tela, extrato) | médio: precisa de critério de aceite | médio | sim, com especificação |
| regra no caminho do dinheiro (ledger, limite, tarifa) | alto: só um invariante prova | grande | só com teste de invariante e revisão humana |
| migração de schema, infraestrutura de produção | alto | grande, às vezes irreversível | proposta, nunca execução |

A tarefa barata de verificar é a boa candidata, mesmo que seja chata. A tarefa cara de verificar é o
risco, mesmo que pareça simples. "O agente fez em dez minutos o que levaria um dia" só é ganho se a
verificação não levar o dia.

## Os modos de falha que se repetem

Os erros de um agente têm cara própria, e o revisor sênior aprende a procurá-los:

- **código plausível e errado:** compila, tem nome bom e trata o caso comum; o caso de borda (a meia-noite,
  o centavo, o fuso) fica de fora;
- **API inventada:** um método que não existe na versão que você usa, ou um parâmetro que sumiu duas
  versões atrás;
- **o teste que confirma o próprio erro:** o agente escreve o código e o teste juntos, e o teste verifica o
  que o código faz, não o que deveria fazer. Pior: diante de um teste vermelho, ele **muda o teste**;
- **escopo que cresce:** a tarefa era o limite noturno, e o patch também "melhorou" a formatação de dez
  arquivos, refatorou um utilitário e trocou uma dependência.

Nenhum desses é raro. Todos aparecem no laboratório como *fixture*, e o marco 04 constrói o detector de
cada um.

## O que a pesquisa diz, com o link na mão

O relatório do DORA de 2025, *State of AI-assisted Software Development*, é a referência mais citada.
Conferido em 14 nov 2026, ele descreve a IA como um **amplificador**:

- a adoção de IA passou a estar associada a **mais *throughput*** de entrega, revertendo o achado de 2024;
- e continua associada a **mais instabilidade**: sem testes automatizados fortes, controle de versão
  maduro e ciclos de *feedback* rápidos, mais volume de mudança vira mais falha;
- o ganho é desigual: arquitetura pouco acoplada e *feedback* rápido aproveitam; sistema acoplado e
  processo lento absorvem o ganho individual nos gargalos de teste e de *deploy*.

Leia os números no próprio relatório, com a metodologia ao lado. Duas regras de uso: **o ganho percebido
não é o ganho medido** (pesquisa de opinião mede satisfação, não entrega), e **número de produtividade sem
fonte não entra em ADR nem em entrevista**. O marco 07 mede o efeito no seu time, com estabilidade junto.

## O que muda no papel do sênior

O trabalho que sobra, e que fica mais importante, é o que o agente não faz bem sozinho:

- **especificar** de forma verificável: o critério de aceite vira teste (marco 02);
- **limitar**: o que o agente pode tocar, rodar e acessar (marcos 04 a 06);
- **revisar** com foco no modo de falha: o teste mudado, a asserção fraca, o escopo crescido;
- **decidir** o que delegar, por classe de tarefa, e escrever essa decisão onde o time e o agente leiam.

A decisão de delegação é uma ADR como outra qualquer (`arquitetura-de-software/07`): critério, dono e
revisão periódica.

> **Armadilha.** Delegar pela facilidade de escrever, e não pela de verificar. A correção de uma linha no
> cálculo do saldo é fácil de escrever e cara de verificar; uma migração de mil arquivos de uma API
> depreciada é cansativa de escrever e barata de verificar.

> **O que o laboratório não reproduz.** O classificador e a matriz são determinísticos: eles dizem em que
> classe uma mudança cai e o que ela exige. Não dizem se o agente vai acertar. Essa é a escolha da trilha:
> provar o controle, não o modelo.

## Exemplo numa fintech

O `Money` do `ledger-core` (`go-fintech/02`) arredonda pela regra do banco. Um agente recebeu a tarefa
"o teste `TestArredondaMeioCentavo` está vermelho, conserte". O patch chegou verde em dois minutos: o agente
tinha trocado o valor esperado na asserção, de `1235` para `1234`, que era o que o código produzia. O erro
estava no código, e o teste estava certo. O revisor só percebeu porque o diff mostrava o arquivo de teste
alterado junto com nenhum arquivo de produção. A correção:

- a matriz de delegação passou a pôr todo arquivo de `money/` e `ledger/` na classe crítica, inclusive os
  testes;
- mudança em teste e em produção no mesmo PR passou a exigir a etiqueta de revisão reforçada;
- a tarefa "conserte o teste" passou a vir com a pergunta "o teste ou o código?" respondida antes.

## Hands-on

**Tutorial.** No `fin-assist`, rode o agente roteirizado (`agente-roteirizado/`) com a *fixture*
`patch-assercao-enfraquecida.json` e um executor que só registra, e veja na saída o arquivo de teste mudado
junto com o de produção.

**Desafio.** A **matriz de delegação** do `fin-assist` (`delegacao.yaml`): para cada classe de tarefa, o que o
agente pode fazer, como se verifica (comandos) e quem aprova; e o **classificador** (`classificador/`), uma
função pura que recebe a lista de arquivos alterados e devolve a classe, a mais crítica entre eles.

**Invariantes testáveis**

1. **Toda classe é verificável e tem dono.** Toda classe declara pelo menos um comando de verificação e um
   aprovador.
2. **O caminho do dinheiro não entra sozinho.** A classe `caminho-do-dinheiro` exige teste de invariante e
   revisão humana, e proíbe *merge* automático. Medido: a mutação que liga o *merge* automático nela foi
   reprovada.
3. **O classificador acerta a classe crítica.** Uma tabela de casos: `ledger/`, `money/` (também dentro de
   `ledger-core/money/`) e o pacote do limite caem na classe crítica; a mudança com um arquivo crítico e um
   de documentação vale a classe crítica; arquivo fora de toda classe é **recusado**, não delegado por
   omissão. Medido: a primeira versão da tabela esperava que o teste de `ledger-core/extrato/` caísse na
   classe "teste"; o classificador o pôs na classe da regra que ele verifica. A tabela estava errada: o
   teste de uma regra é exatamente o que o agente enfraquece, e herda a criticidade dela.
4. **Teste e produção juntos, só com reforço.** Nenhuma classe permite alterar teste e produção no mesmo PR
   sem a etiqueta `revisao-reforcada`. Medido: o PR com `ledger/saldo.go` e `ledger/saldo_test.go` foi
   recusado sem a etiqueta e aceito com ela; o PR só com o teste seguiu.

**Complemento.** Pegue os últimos 20 PRs do seu time e classifique cada um pela matriz. Quantos cairiam na
classe crítica? Em quantos o teste e a produção mudaram juntos?

**Checagem**

1. Qual a diferença entre um assistente e um agente de código, e o que a falta de memória entre sessões
   exige do repositório?
2. Por que o custo de verificação, e não o de escrita, decide o que delegar?
3. Como um teste pode confirmar o próprio erro, e como a matriz se defende disso?
4. O que o DORA de 2025 diz sobre IA e estabilidade, e por que o ganho percebido não basta?

## Principais aprendizados

- Assistente completa; agente planeja, age, observa e repete. O agente não é determinístico e não lembra
  de nada entre sessões.
- O ganho de delegar é limitado pelo custo de verificar. Barato de verificar é candidato; caro de
  verificar é risco.
- Modos de falha: código plausível e errado, API inventada, teste que confirma o erro, escopo que cresce.
- DORA 2025: mais *throughput* e mais instabilidade com a IA; o efeito depende de teste, versão e
  *feedback*. Número só com fonte.
- O papel do sênior: especificar, limitar, revisar pelo modo de falha e decidir a delegação por classe.
- Medido: a matriz recusa *merge* automático no caminho do dinheiro, e o teste de uma regra herda a classe
  dela.
