---
id: sincrono-assincrono-e-orcamento
title: "Síncrono, assíncrono e o orçamento de um fluxo"
summary: "A pergunta não é \"fila ou chamada\", e sim quem espera, por quanto tempo, e o que acontece quando a resposta não vem. Lei de Little aplicada a filas, e onde dizer não."
estimatedMinutes: 55
references:
  - title: "Google SRE Book"
    url: https://sre.google/sre-book/table-of-contents/
---

## A pergunta errada, e a certa

"Síncrono ou assíncrono" soa como escolha binária de tecnologia. A pergunta que de fato decide:
**quem espera, por quanto tempo, e o que acontece se a resposta não vier a tempo?** Uma chamada
síncrona é uma aposta de que a resposta vem rápido o bastante para o chamador esperar sem
degradar a experiência de quem está do outro lado da cadeia. Quando essa aposta deixa de valer —
o salto é lento, ou pode falhar de forma prolongada — a pergunta não é "troque para assíncrono por
princípio", é "quem especificamente pode esperar, e o que fazemos com quem não pode?"

## A árvore de decisão

**Síncrono**: o chamador precisa do resultado **agora** para continuar, e o salto é rápido e
confiável o bastante para justificar a espera — autorização de pagamento, validação de saldo.
**Fila**: o processamento pode acontecer depois, e o chamador só precisa de confirmação de que foi
aceito — geração de relatório, envio de notificação. **Stream**: o consumidor processa um fluxo
contínuo de eventos, sem relação um-para-um com uma chamada — atualização de posição consolidada
em tempo real. **Evento**: um fato aconteceu e múltiplos consumidores, desconhecidos de quem
publica, podem reagir — o padrão que `arquitetura-eventos` cobre em profundidade.

## O joelho da curva, perto da saturação

Toda fila (ou pool, ou executor) tem uma curva de latência contra utilização que é **plana** até
perto da capacidade máxima, e então sobe **abruptamente** — o "joelho". Operar confortavelmente
abaixo do joelho significa latência previsível; operar perto ou acima significa que uma pequena
variação de carga produz uma grande variação de latência, e o sistema fica frágil a qualquer pico.
O erro mais comum de capacity planning é dimensionar para a **média** de utilização, que pode
parecer confortavelmente abaixo de 100% enquanto picos recorrentes empurram o sistema para cima do
joelho várias vezes por dia.

## Lei de Little aplicada a filas, e o ponto de admissão

O marco 04 desta trilha já estabeleceu, para retry: fila **ilimitada** é uma escolha, não um
padrão seguro — ela transforma sobrecarga em consumo de memória silencioso em vez de rejeição
visível. O mesmo raciocínio vale para qualquer fila de processamento. O **ponto de admissão** é
onde o sistema decide dizer "não" explicitamente: na borda (rejeitar antes de entrar no sistema, mais barato) ou no serviço (rejeitar
depois de já ter gasto algum recurso processando parcialmente, mais caro mas às vezes a única opção
quando a borda não tem informação suficiente para decidir). Dizer não **explicitamente e cedo** é
sempre mais barato que aceitar e falhar tarde.

> **Reencontro — `kafka/04`.** Lag de consumidor é o mesmo fenômeno de fila crescendo além da
> capacidade de processamento, só que medido em offset em vez de tamanho de fila. `kubernetes/07`
> cobre KEDA, que escala consumidores **pelo** lag — o mecanismo que reage ao sintoma que este
> marco ensina a reconhecer antes que vire incidente.

## Propagação de deadline e orçamento de retry em fluxo assíncrono

Mesmo em fluxo assíncrono, existe um orçamento de tempo até a ação de negócio precisar de
resultado — "o relatório precisa estar pronto até 9h" é um deadline, só que medido em horas, não em
milissegundos. O orçamento de retry (marco 04) vale aqui também: uma fila com reprocessamento sem
limite de tentativas, sem *dead letter*, é a versão assíncrona do retry sem orçamento — a diferença
é que o sintoma demora mais para aparecer, não que o risco seja menor.

## Exemplo numa fintech

O fluxo de iniciação de pagamento: validação de saldo e autorização **precisam** responder em
até 300 ms — síncrono, sem alternativa, porque o cliente está esperando uma confirmação de que o
pagamento foi aceito. A atualização do extrato e o disparo de notificação **não precisam** —
viram evento, processados em segundos sem que ninguém perceba, porque nenhum humano está olhando
a tela esperando especificamente por eles naquele instante.

## Hands-on

**Tutorial.** Simulador de fila em Go (produtores a uma taxa configurável, um servidor com tempo de
processamento configurável); plote latência × utilização e encontre o joelho experimentalmente.

**Desafio.** Adicione fila **limitada** com rejeição explícita ao simulador, e prove o
comportamento a 150% da capacidade sustentável: o que acontece com quem é aceito versus quem é
rejeitado.

**Invariantes testáveis**

1. O comprimento médio da fila observado bate com `taxa de chegada × tempo médio de permanência`
   (lei de Little), dentro de ±5%.
2. A 150% da capacidade sustentável, o p99 das requisições **aceitas** permanece abaixo do SLO
   declarado.
3. A taxa de rejeição observada fica dentro de ±10% do excesso de carga acima da capacidade.
4. Sem limite de fila, sob a mesma carga de 150%, o p99 cresce sem teto — o contraste direto com
   o invariante 2.

**Complemento.** Compare admitir/rejeitar na borda contra admitir/rejeitar no serviço: meça o custo
de recurso gasto por requisição rejeitada em cada um dos dois pontos.

**Checagem**

1. Qual é a pergunta certa para decidir síncrono × assíncrono, em vez de "qual tecnologia usar"?
2. O que é o joelho da curva, e por que dimensionar pela média de utilização é perigoso?
3. Por que dizer não cedo, na borda, costuma ser mais barato que rejeitar tarde, no serviço?
4. O que torna uma fila de reprocessamento sem limite o equivalente assíncrono do retry sem
   orçamento?

## Principais aprendizados

- A pergunta certa é quem espera, por quanto tempo, e o que acontece se a resposta não vier — não
  "síncrono ou assíncrono" como escolha de tecnologia.
- O joelho da curva de latência fica perto da capacidade máxima; dimensionar pela utilização média
  esconde que picos recorrentes já empurram o sistema para cima dele várias vezes ao dia.
- Lei de Little aplicada a filas conecta taxa de chegada e tempo de permanência ao comprimento
  esperado — a mesma ferramenta do marco 02, agora para admissão.
- Dizer não explicitamente e cedo, na borda, é sempre mais barato que aceitar e falhar tarde, no
  serviço, depois de já ter gasto recurso processando.
- Fluxo assíncrono tem deadline e orçamento de retry também — só que medidos em escala de tempo
  maior, e com sintoma mais lento para aparecer, não com risco menor.
