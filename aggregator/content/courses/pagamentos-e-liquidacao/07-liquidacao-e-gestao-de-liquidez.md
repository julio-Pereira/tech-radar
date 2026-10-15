---
id: liquidacao-e-liquidez
title: "Liquidação e gestão de liquidez"
summary: "Com o Pix 24x7, o dinheiro de uma instituição pode acabar num domingo à noite — e a gestão de liquidez deixa de ser uma tarefa de mesa e vira um sistema em tempo real."
estimatedMinutes: 60
references:
  - title: "Banco Central do Brasil — Arranjos de pagamento"
    url: https://www.bcb.gov.br/estabilidadefinanceira/arranjospagamento
---

## *Netting*: por que reduz a necessidade de caixa

O marco 01 já contrastou liquidação bruta e líquida; aqui o **netting** (liquidação líquida)
entra em foco como técnica de gestão de caixa: se a instituição A deve R$ 10.000 à B e a B deve
R$ 7.000 à A no mesmo ciclo, o netting move apenas R$ 3.000 — o saldo — em vez de duas
transferências brutas de R$ 10.000 e R$ 7.000. O resultado do netting precisa ser **igual à soma
dos valores brutos** por participante (uma propriedade de conservação verificável), mas o caixa
efetivamente movido é muito menor.

## Conta de reserva e colchão mínimo

A conta de reserva (marco 01) precisa manter um **colchão mínimo** — um saldo de segurança acima
do estritamente necessário para as obrigações já conhecidas, absorvendo picos inesperados de saída
sem forçar a instituição a uma situação de falta de fundos no meio de uma liquidação obrigatória.
Definir esse colchão é uma decisão de risco, não um número arbitrário: ele precisa refletir a
volatilidade real observada do fluxo de caixa da instituição.

## Projeção de posição

**Projetar a posição** de liquidez é somar, para um horizonte futuro, todas as entradas e saídas já
conhecidas (liquidações agendadas do arranjo, vencimentos de obrigações, folhas de pagamento) e
comparar o resultado com o colchão mínimo — uma projeção que ignora qualquer uma dessas fontes
('vamos assumir que não há saídas programadas') projeta uma liquidez que não existe de fato.

## Sazonalidade e eventos

Picos previsíveis — folha de pagamento no início do mês, feriados prolongados, campanhas
promocionais que geram picos de saída via Pix — precisam entrar na projeção como **eventos
conhecidos**, não como surpresas recalculadas depois do fato. Um sistema de projeção que não
distingue um domingo comum de uma véspera de feriado prolongado vai, sistematicamente, subestimar
o risco de faltar caixa exatamente nos momentos em que isso seria mais caro.

## Limites e alertas

Um **limite** configurado sobre a posição projetada (por exemplo, "alertar quando a posição
projetada cair abaixo de 120% do colchão") precisa disparar **no limite exato**, nem antes nem
depois — um alerta que dispara tarde demais já não dá tempo de reposição; um que dispara cedo
demais demais vezes produz fadiga de alerta e as pessoas passam a ignorá-lo.

## Reposição: aporte e empréstimo intradiário

Quando a posição projetada ameaça cair abaixo do colchão, as alavancas de **reposição** incluem
aporte de capital próprio ou, em alguns sistemas, **empréstimo intradiário** da própria
infraestrutura de liquidação (**conferir** a existência e as condições desse mecanismo no sistema
relevante) — um crédito tomado e devolvido dentro do mesmo dia, especificamente para cobrir um
descompasso temporário entre entradas e saídas, não um financiamento de longo prazo.

## Risco de liquidação e risco de contraparte

**Risco de liquidação** é o risco de que a própria instituição não consiga cumprir uma obrigação
de liquidação no prazo; **risco de contraparte** é o risco de que a *outra* parte de uma transação
não cumpra a sua — e os dois se conectam diretamente com a distinção entre liquidação bruta e
líquida diferida do marco 01: liquidação líquida diferida reduz uso de caixa, mas aumenta a janela
de tempo em que o risco de contraparte está em aberto.

## *Float* e automação de tesouraria

**Float** é o dinheiro em trânsito entre o momento em que sai de uma conta e o momento em que
chega efetivamente a outra — um recurso historicamente usado por tesourarias para ganhar tempo de
investimento, hoje bastante restringido pela regulação em muitos sistemas de pagamento (**conferir**
as restrições vigentes antes de assumir qualquer uso de float como permitido). A **automação de
tesouraria** — projeção contínua, alertas automáticos, reposição semiautomática — é o que torna
viável operar sob um sistema de liquidação 24x7 sem depender de uma pessoa acordada o tempo todo
monitorando manualmente.

## Erros típicos: ignorar o fim de semana, não projetar a saída

Dois erros recorrentes em gestão de liquidez: tratar sábado e domingo como dias sem movimento
relevante (quando, sob Pix 24x7, saídas continuam acontecendo normalmente) e projetar apenas
entradas esperadas sem projetar as saídas com o mesmo rigor — uma projeção otimista que só
considera o lado bom do fluxo de caixa não é uma projeção, é uma esperança.

## Exemplo numa fintech

Numa sexta à noite, uma campanha promocional gera um pico de saída via Pix muito maior que o
previsto; a posição projetada para o fim de semana cai abaixo do colchão mínimo antes mesmo de
segunda-feira — exatamente o cenário que uma automação de tesouraria com alerta configurado deveria
sinalizar a tempo de uma reposição, não depois que o problema já se materializou.

## Hands-on

**Tutorial.** Implemente `liquidez/` com a projeção de posição e o cálculo de *netting* sobre
cenários sintéticos.

**Desafio.** Simule o cenário 24x7 completo (fim de semana incluído) com colchão mínimo e alerta
configurado.

**Invariantes testáveis**

1. O resultado do **netting** é igual à **soma dos valores brutos** por participante — uma
   propriedade de conservação, verificada sobre qualquer conjunto de obrigações bilaterais
   sintéticas.
2. No cenário de teste com a política de reposição **ligada**, a posição projetada **nunca** fica
   abaixo do colchão mínimo (asserção rígida); com a política **desligada**, o furo de caixa é
   **demonstrado** no mesmo cenário.
3. O alerta de limite dispara **exatamente** no valor configurado — nem antes, nem depois — testado
   com uma tabela de casos ao redor do limite.
4. A projeção de posição usa o **calendário de fim de semana e feriados** configurado, e uma
   projeção que ignora esse calendário é demonstrada como sistematicamente otimista demais.
5. O erro de previsão (projetado × realizado) é calculado sobre uma massa de dados sintética e
   **reportado**, não descartado silenciosamente.

**Complemento.** Com base nos seus próprios números (reais ou estimados), calcule que colchão
mínimo cobriria o maior desvio observado entre entrada e saída projetada em um fim de semana.

**Checagem**

1. Por que o netting reduz a necessidade de caixa, mas não elimina o risco de contraparte durante
   o período entre as transações originais e a liquidação líquida?
2. O que diferencia risco de liquidação de risco de contraparte?
3. Por que um alerta de limite de liquidez precisa disparar exatamente no valor configurado, nem
   antes nem depois?
4. Por que tratar sábado e domingo como dias sem movimento relevante é um erro específico sob um
   sistema de liquidação 24x7?

> **Reencontro — `observabilidade/12`, `/13`.** O orçamento de erro e o SLO daquele marco são o
> mesmo tipo de limite configurado com gatilho de ação que este marco aplica à posição de
> liquidez — e os alertas e o plantão de `observabilidade/13` são exatamente o mecanismo
> operacional que precisa estar de prontidão quando um alerta de liquidez dispara numa
> madrugada de domingo.

A disponibilidade por região e células de `system-design/13` já tratou do problema geral de
degradação controlada sob pressão; aqui a "região" sob pressão é a posição de caixa da
instituição, não um datacenter. E o caso de ponta a ponta do Pix em `system-design/09` é o que gera,
na prática, o volume contínuo de saídas 24x7 que torna a gestão de liquidez deste marco necessária
em primeiro lugar.

## Principais aprendizados

- *Netting* reduz drasticamente o caixa movido, mas conserva o total bruto e não elimina o risco
  de contraparte durante a janela de liquidação.
- O colchão mínimo de uma conta de reserva precisa refletir a volatilidade real do fluxo de caixa,
  não um número arbitrário.
- Uma projeção de posição que ignora eventos sazonais (folha, feriados, promoções) subestima
  sistematicamente o risco de faltar caixa.
- Um alerta de limite de liquidez precisa disparar exatamente no valor configurado para ser útil —
  tarde demais falha, cedo demais demais gera fadiga de alerta.
- Sob um sistema de liquidação 24x7, fim de semana não é um período de pausa — é só mais um
  período com o mesmo risco de descompasso de caixa.
