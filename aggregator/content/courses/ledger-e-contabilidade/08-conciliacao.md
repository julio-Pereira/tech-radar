---
id: conciliacao
title: "Conciliação"
summary: "Conciliar é provar que o seu ledger e o do outro lado contam a mesma história — e as diferenças que sobram são o seu backlog de riscos."
estimatedMinutes: 70
references:
  - title: "Jepsen — Consistency Models"
    url: https://jepsen.io/consistency
---

## Conciliação interna × externa

**Conciliação interna** compara o razão, o subrazão e o saldo materializado entre si — todos
deveriam contar exatamente a mesma história, porque são, em última instância, derivados da mesma
fonte de verdade. **Conciliação externa** compara o razão com uma fonte fora do seu controle (um
extrato de contraparte, um arquivo de liquidação de arranjo) — e aqui a divergência não é
necessariamente um bug seu: pode ser um erro do outro lado, uma diferença de timing, ou, sim, um
bug seu também. A conciliação externa é o que prova (ou desmente) que seu ledger e o mundo real
contam a mesma história.

## Chaves de casamento e sua fragilidade

**Casar** um lançamento do seu ledger com uma linha de um arquivo externo depende de uma **chave**
— idealmente um identificador fim a fim único, mas na prática frequentemente uma combinação mais
frágil de valor, data e talvez um identificador parcial. Quanto mais frágil a chave, maior o risco
de casamento **falso-positivo** (duas operações diferentes, por coincidência, com a mesma
combinação de valor e data) ou **falso-negativo** (a mesma operação, representada de forma
levemente diferente nos dois lados, não é reconhecida como a mesma).

## Casamento 1:1, 1:N, N:M

O caso mais simples é **1:1**: um lançamento seu corresponde a exatamente uma linha externa.
**1:N** ocorre quando um lançamento seu corresponde a várias linhas externas (um lote dividido em
partes pela contraparte); **N:M** é o caso geral, onde grupos de lançamentos de ambos os lados
precisam ser agrupados e comparados como totais. Um motor de conciliação que só sabe fazer 1:1
falha silenciosamente (ou gera exceções em excesso) sempre que a realidade operacional produz
qualquer um dos outros casos.

## Tolerâncias: valor, tempo, fuso

Uma conciliação perfeitamente exata raramente é realista: pequenas diferenças de valor (centavos
de arredondamento de taxa de câmbio, por exemplo) e diferenças de **fuso horário** na data
registrada por cada lado são esperadas, não erros. Definir **tolerâncias** explícitas — um valor
de diferença de valor aceitável, uma janela de tempo aceitável — e aplicá-las de forma consistente
é o que separa "aceitar divergências esperadas" de "mascarar erros reais sob a desculpa da
tolerância".

## Diferenças de *timing* × erros reais

Uma divergência de **timing** (um lançamento "em trânsito": já ocorreu de um lado, mas ainda não
chegou do outro) se resolve sozinha com o tempo — a linha que falta hoje aparece no arquivo de
amanhã. Um **erro** real (duplicado, valor diferente, completamente faltante, lançado no lado
errado) não se resolve com tempo — precisa de investigação e correção ativa. Confundir as duas
categorias — tratar um erro real como "só timing, vai resolver sozinho" — é como um erro real
silenciosamente se acumula sem nunca ser corrigido.

## Fila de exceções, *aging* e dono

Toda divergência que não casa automaticamente entra numa **fila de exceções**, cada uma com
**idade** (*aging* — há quanto tempo está pendente) e um **dono** explícito responsável por
investigar. Uma exceção sem dono, ou uma fila sem visibilidade de idade, é como um estorno sem
referência ao original (marco 03): tecnicamente existe, mas ninguém necessariamente vai agir sobre
ela a tempo.

## Automação progressiva: regras antes de heurísticas

A estratégia mais sustentável de automação de conciliação começa com **regras determinísticas**
(chave exata, tolerância explícita) resolvendo o máximo possível de casos, e só recorre a
**heurísticas** mais flexíveis (correspondência aproximada, pontuação de similaridade) para o
resto, sempre revisadas por humano antes de aplicadas automaticamente. Pular direto para heurística
sofisticada sem esgotar primeiro as regras determinísticas é inverter a ordem de confiabilidade.

## Idempotência da conciliação e reprocessamento

Rodar a conciliação **duas vezes** sobre o mesmo arquivo de entrada nunca deveria duplicar itens
casados nem exceções abertas — a mesma disciplina de idempotência de todo o resto desta trilha,
aqui aplicada ao próprio processo de conciliar. Essa propriedade é o que torna seguro
**reprocessar** um arquivo depois de corrigir um bug no motor de conciliação, sem medo de criar
entradas fantasmas.

## A conciliação como resolvedora de resultado desconhecido

Um pagamento que terminou em **resultado desconhecido** (`system-design/09` já tratou esse estado
em geral) frequentemente só é resolvido quando a conciliação, no dia seguinte ou depois, encontra
a linha correspondente no arquivo externo e confirma o que de fato aconteceu — a conciliação não é
só uma checagem de qualidade, é, estruturalmente, um dos mecanismos que resolve incerteza
operacional real.

## Conciliação como detector de bugs do próprio ledger

Uma divergência recorrente e sistemática, uma vez investigada, às vezes não revela um erro do
outro lado — revela um **bug no próprio ledger** (um cálculo de taxa sistematicamente errado por
um centavo, por exemplo, que só se torna visível quando a conciliação o compara, repetidamente,
contra uma fonte externa independente). Encarar a conciliação como uma ferramenta de **detecção de
bug**, não só de "casamento de arquivo", muda como ela é projetada e priorizada.

## Exemplo numa fintech

O arquivo de liquidação do dia traz 10 mil linhas; 9.997 casam automaticamente pela chave exata.
Das três restantes, uma é uma linha duplicada que o arquivo enviou por engano, outra tem um valor
R$ 0,01 diferente do esperado (fora da tolerância configurada), e a terceira é uma transação que o
ledger nunca recebeu — três categorias diferentes de exceção, cada uma exigindo uma ação diferente
do dono responsável.

## Hands-on

**Tutorial.** Implemente `conciliacao/` com casamento por chave exata e tolerância de valor.

**Desafio.** Implemente casamento 1:N e a classificação das quebras encontradas.

**Invariantes testáveis**

1. Sobre dados sintéticos com **divergências plantadas** (duplicado, valor diferente, faltante,
   tardio), **todas** são encontradas e **classificadas** corretamente, comparado contra um
   gabarito conhecido.
2. O casamento é **determinístico**: a mesma entrada produz o mesmo resultado, **independente da
   ordem** das linhas no arquivo.
3. Rodar a conciliação **duas vezes** sobre o mesmo arquivo **não duplica** itens casados nem
   exceções na fila.
4. A fila de exceções calcula **aging** corretamente com relógio falso, e ordena por idade e por
   valor.
5. Os totais **conciliados mais exceções somam exatamente** o total do arquivo de entrada —
   conservação, nenhuma linha perdida ou contabilizada duas vezes.
6. Uma diferença classificada inicialmente como **timing** é **reclassificada** corretamente
   quando a contraparte confirma a linha correspondente no dia seguinte (simulado com relógio
   falso).

**Complemento.** Projete, por escrito, a regra de tolerância de valor e de tempo para um arranjo
cuja liquidação ocorre em D+1, justificando os limites escolhidos.

**Checagem**

1. Por que uma chave de casamento frágil (baseada em valor e data, sem identificador único)
   aumenta o risco de falso-positivo e falso-negativo?
2. Qual é a diferença entre uma divergência de timing e um erro real — e por que confundir as duas
   é perigoso?
3. Por que a automação de conciliação deveria começar com regras determinísticas antes de recorrer
   a heurísticas?
4. Como a conciliação externa pode revelar um bug no próprio ledger, não apenas um erro do outro
   lado?

> **Reencontro — `system-design/09`.** O resultado desconhecido de um pagamento, já tratado
> naquele marco como um estado que precisa de resolução, é frequentemente resolvido, na prática,
> exatamente pela conciliação deste marco — a confirmação definitiva chega de uma fonte externa,
> não de uma nova tentativa do próprio sistema.

O caso de extrato e notificações de `system-design/11` lida com a apresentação ao cliente do
histórico de lançamentos; a conciliação deste marco é o que garante que esse histórico, antes de
ser apresentado, já foi verificado contra o mundo externo. A qualidade de dados de
`engenharia-de-dados/08` e o outbox/inbox de `arquitetura-eventos/08` são, respectivamente, a
disciplina de classificar divergências corretamente e o mecanismo que garante entrega exatamente
uma vez de eventos de conciliação para sistemas consumidores. E quando o `fin-books` convive com
um core bancário legado (o cenário de `arquitetura-de-solucoes/03`), a conciliação é exatamente o
mecanismo que prova que os dois lados da fronteira ainda contam a mesma história.

## Principais aprendizados

- Conciliação interna compara seu próprio ledger contra si mesmo; conciliação externa compara
  contra o mundo fora do seu controle.
- Uma chave de casamento frágil aumenta o risco de falso-positivo e falso-negativo — identificador
  único é sempre preferível quando disponível.
- Diferença de timing se resolve com o tempo; erro real exige investigação e correção ativa —
  confundir as duas é perigoso.
- Automação de conciliação deveria esgotar regras determinísticas antes de recorrer a heurísticas
  revisadas por humano.
- A conciliação não é só checagem de qualidade — é, estruturalmente, um detector de bugs do
  próprio ledger e um resolvedor de resultado desconhecido.
