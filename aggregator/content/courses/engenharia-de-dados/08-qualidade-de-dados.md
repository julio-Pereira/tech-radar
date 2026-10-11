---
id: qualidade-de-dados
title: "Qualidade de dados"
summary: "Dado errado que passa em silêncio custa mais que dado que falha alto. Quarentena, contrato com o fornecedor externo, e reconciliação com a transmissora. Marco crítico — quiz estendido."
estimatedMinutes: 60
references:
  - title: "Data Contract Specification"
    url: https://datacontract.com/
---

## As seis dimensões, como ferramenta de diagnóstico

**Completude** (o campo esperado está presente?), **unicidade** (a chave que deveria ser única é
única de fato?), **validade** (o valor está no formato e faixa esperados?), **consistência** (duas
fontes concordam sobre o mesmo fato?), **atualidade** (o dado está fresco o suficiente para o uso
pretendido?) e **acurácia** (o valor está correto, não só bem formado?). Essas seis dimensões não
são uma lista para decorar — são uma ferramenta de diagnóstico: quando um consumidor reclama "o
dado está errado", a primeira pergunta útil é "errado em qual dessas seis dimensões?", porque cada
uma aponta para uma causa e uma correção diferentes.

## Onde testar: entrada, transformação, saída

Testar só na **saída** (a tabela ouro final) significa descobrir o problema tarde, depois que ele
já se propagou por todas as camadas intermediárias. Testar na **entrada** (o bruto, assim que
chega) pega o problema na origem, antes de ele contaminar qualquer coisa — e é onde a maior parte
dos testes desta trilha deveria viver. Testar na **transformação** (os testes de dados do marco 06,
sobre modelos intermediários) pega o que a lógica de negócio pode introduzir mesmo com entrada
limpa. As três camadas são complementares, não substitutas.

## Quarentena: a *dead-letter queue* de dados

Um registro que falha um teste de qualidade não deveria travar o pipeline inteiro nem ser
descartado silenciosamente — vai para **quarentena**: uma área separada, visível, onde o dado
suspeito espera decisão humana ou correção automática, sem poluir a prata com algo que pode estar
errado. É o mesmo princípio da *dead-letter queue* de mensageria (`kafka/08`), aplicado a linha de
dado em vez de evento. A política de quarentena precisa decidir: quanto tempo um registro pode
ficar lá, e o que acontece se nunca for resolvido.

## Contrato com o fornecedor externo, e *schema drift*

Um **data contract** formaliza o que se espera de uma fonte externa: schema, tipos, semântica de
cada campo, SLA de disponibilidade. **Schema drift**: a transmissora muda algo — um campo some, um
tipo muda, uma unidade muda (o caso do marco 02) — sem que o contrato formal tenha mudado. Detectar
isso **antes** que o dado chegue à prata é o que separa um incidente controlado (a execução falha,
alguém investiga) de um incidente silencioso (o ouro tem números errados por semanas até alguém
notar uma discrepância no relatório de fechamento).

## Reconciliação: provar que os totais batem

**Reconciliação** com a transmissora — comparar totais, contagens, somas de controle entre o que o
seu pipeline registrou e o que a fonte declara ter enviado — é o mesmo mecanismo de
`dados-distribuidos/08`, aqui aplicado à fronteira com um terceiro em vez de entre sistemas
internos. As quatro classes de divergência continuam as mesmas: **faltando** (a transmissora tem,
você não processou), **a mais** (você tem algo que a transmissora não reconhece — possível
duplicata), **valor diferente** (mesma transação, valores que não batem), e **atrasado** (chegou,
mas fora da janela esperada). Cada classe tem uma causa provável diferente, e misturar todas numa
métrica única ("X% de divergência") esconde qual delas precisa de atenção.

> **Reencontro — `dados-distribuidos/14`; `observabilidade/12`; `arquitetura-eventos/05`.** A
> disciplina de qualidade daquele marco (CDC, data contract, freshness) tratava do caminho **do seu
> próprio** OLTP ao analítico; aqui a fonte é externa, imprevisível, e fora do seu controle — o
> contrato precisa ser mais defensivo. `arquitetura-eventos/05` já ensinou contrato de evento —
> aqui é o mesmo princípio aplicado a uma API de terceiro inteira, não a uma mensagem.

## O custo do falso positivo

Um teste de qualidade excessivamente rígido (que falha sob variação normal e esperada do dado) gera
tanto dano quanto um teste ausente: a equipe aprende a ignorar alertas, e quando um alerta real
aparece, ele já está misturado no ruído. Medir a **taxa de falso positivo** sobre uma massa de dado
conhecidamente normal, e manter essa taxa abaixo de um limiar declarado, é tão parte da suíte de
qualidade quanto os próprios testes.

## Exemplo numa fintech

A transmissora, numa atualização silenciosa, passa a devolver valores em reais com duas casas
decimais em vez de centavos inteiros. Sem um teste de validade na entrada (faixa esperada de
valor, ou verificação de tipo), o ouro **triplica** o ticket médio — um número que parece plausível
o suficiente para passar despercebido por semanas, até alguém comparar com o extrato oficial da
transmissora e descobrir a divergência de três dígitos de magnitude.

## Hands-on

**Tutorial.** Construa uma suíte de qualidade cobrindo entrada, transformação e saída, sobre dados
do `fake-transmissor`.

**Desafio.** Implemente quarentena e reconciliação contra o `fake-transmissor`, que conhece sua
própria verdade-base.

**Invariantes testáveis**

1. Dado inválido (falha num teste de qualidade na entrada) vai para **quarentena** e **não entra**
   na prata.
2. Uma mudança de schema ou unidade simulada no `fake-transmissor` **derruba a execução** com
   alerta, antes de poluir a prata.
3. A reconciliação detecta as **quatro classes** de divergência injetadas de propósito (faltando, a
   mais, valor diferente, atrasado) e as classifica corretamente.
4. A taxa de falso positivo, medida sobre uma massa de dado normal simulada, fica **abaixo do
   limite declarado**.

**Complemento.** Projete o limiar de anomalia de volume (quantas transações por dia é "normal"?)
considerando sazonalidade — um dia de pagamento de salário tem volume muito maior que um domingo
comum, e um limiar fixo gera alerta falso em um dos dois.

**Checagem**

1. Quais são as seis dimensões de qualidade, e por que elas servem como ferramenta de diagnóstico,
   não só de medição?
2. Por que testar só na saída descobre problemas tarde demais?
3. O que a quarentena evita que descartar silenciosamente ou travar o pipeline inteiro não evitam?
4. Por que um teste de qualidade excessivamente rígido é tão prejudicial quanto a ausência de
   teste?

## Principais aprendizados

- As seis dimensões de qualidade (completude, unicidade, validade, consistência, atualidade,
  acurácia) são diagnóstico: cada uma aponta uma causa e uma correção diferentes.
- Testar na entrada pega o problema na origem; testar só na saída descobre tarde, depois que o
  problema já se propagou por todas as camadas intermediárias.
- Quarentena é a *dead-letter queue* de dados: dado suspeito fica visível e isolado, sem poluir a
  prata e sem travar o pipeline inteiro.
- Reconciliação com a transmissora prova que os totais batem, classificando divergência em quatro
  causas distintas — misturar todas numa métrica única esconde qual precisa de atenção.
- Teste excessivamente rígido tem o mesmo efeito prático de não ter teste nenhum: a equipe aprende
  a ignorar alertas, e o alerta real se perde no ruído.
