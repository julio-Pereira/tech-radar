---
id: api-management-e-monetizacao
title: "API Management e monetização"
summary: "Gateway resolve preocupações transversais; regra de negócio não mora nele. Medir uso é problema de contabilidade, não de métrica. Marco crítico — quiz estendido."
estimatedMinutes: 60
references:
  - title: "Envoy Proxy — documentation"
    url: https://www.envoyproxy.io/docs
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
completion: quiz
---

## O que o gateway faz, e o que não deveria

O gateway concentra preocupações **transversais**: autenticação delegada (validar o token, não
decidir se o usuário pode fazer a operação), cota por cliente, transformação de protocolo
(exposição REST de um backend gRPC, por exemplo), e observabilidade do tráfego de borda. O que
**não** deve morar nele: regra de negócio. Se a decisão de "este cliente pode fazer essa operação
específica neste valor" está no gateway, ela vive separada do código que a implementa, invisível
para quem lê o serviço, e testável só em integração — o pior lugar possível para lógica que muda
com frequência.

## Planos, cotas e identidade de consumidor

Cada **plano** (free, standard, enterprise) define cota e SLA — não é só "quantas chamadas", é
"com qual prioridade sob contenção". **Chave de API** identifica a aplicação chamadora; **cliente
OAuth2** identifica a aplicação **e** permite escopo granular por operação — a segunda é a escolha
certa para qualquer API que concede acesso a dado de terceiro (Open Finance é o caso extremo: o
TPP age em nome do usuário final, com consentimento explícito, e cada chamada carrega essa dupla
identidade). O **portal do desenvolvedor** é onde o parceiro se registra, vê sua cota e lê a
documentação — ele é parte do produto, não um extra.

## Algoritmos de rate limit, e o defeito de cada um

**Janela fixa** (contar requisições num intervalo de relógio, ex. por minuto): simples, e tem um
defeito conhecido — o **burst de borda**: um cliente pode fazer o limite inteiro no último segundo
de uma janela e o limite inteiro de novo no primeiro segundo da próxima, efetivamente **dobrando**
o limite nominal numa janela de dois segundos ao redor da virada.

**Janela deslizante** suaviza isso, olhando uma janela contínua em vez de intervalos fixos — mais
justo, mais caro de computar exatamente.

**Token bucket**: um balde com capacidade fixa, reabastecido a uma taxa constante; cada requisição
consome um token, e o balde permite *burst* até sua capacidade, depois impõe a taxa constante. É o
algoritmo mais usado em produção porque modela bem o caso real: picos curtos são toleráveis, taxa
sustentada não.

**GCRA** (Generic Cell Rate Algorithm) é uma forma particularmente eficiente de implementar o
equivalente a token bucket com um único valor de estado por chave (o "tempo teoricamente permitido
da próxima chamada"), em vez de manter contadores separados — relevante quando o limite é
verificado num store distribuído sob alta concorrência.

**Limite distribuído**: um Redis com um script atômico (Lua) por chave resolve com precisão, ao
custo de uma chamada de rede extra por verificação; **aproximação local + global** (cada instância
mantém uma fatia do limite localmente, sincronizando periodicamente) escala melhor e aceita alguma
imprecisão — a escolha depende de quão rígido o limite precisa ser.

## O pipeline de medição de uso, e por que é contabilidade

Medir uso para faturar não é "mais uma métrica". **Evento de uso → agregação → fatura** precisa
de: **idempotência por `event_id`** (o mesmo evento de uso contado duas vezes é cobrança
indevida — o mesmo problema do `Idempotency-Key` do marco 05, agora do lado da medição, não da
escrita), tolerância a **duplicata e fora de ordem** (a fonte de eventos de uso raramente garante
exactly-once nem ordem), e **reconciliação**: o valor faturado precisa bater com a soma de eventos
únicos, auditável depois do fato. Um pipeline de medição que não passa nesses três testes não está
pronto para cobrar ninguém.

> **Reencontro — `seguranca-aplicacao/07` e `seguranca-aplicacao/14`.** mTLS e FAPI (autenticação
> forte de API) são daquele marco 07; aqui o gateway é onde essa autenticação é **validada e
> delegada**, não reimplementada. E o marco 14 trata abuso de API como fraude — a cota é a
> primeira linha de defesa que esta trilha ensina, e a análise de padrão é daquele marco.

## Falhar aberto × fechado, quando o Redis do rate limit cai

Decisão de negócio, não técnica: **falhar aberto** (deixar passar sem verificar limite) prioriza
disponibilidade sobre controle de cota — aceitável para a maioria dos endpoints de leitura;
**falhar fechado** (bloquear tudo) prioriza controle sobre disponibilidade — correto quando o
limite protege algo caro ou sensível (uma operação de alto custo computacional, por exemplo). A
decisão tem dono nomeado, e vale o mesmo raciocínio do orçamento de erro: qual lado do erro custa
mais caro, medido em dinheiro ou risco, não em preferência técnica.

## Exemplo numa fintech

Três planos para TPPs de Open Finance — básico (100 req/min), parceiro (1.000 req/min), parceiro
estratégico (10.000 req/min com SLA dedicado). Um TPP do plano básico passa a fazer 10× sua cota
(um bug no cliente dele, não má-fé): o rate limit absorve sem derrubar os outros TPPs, o portal do
desenvolvedor mostra o consumo em tempo real, e um alerta avisa o parceiro antes de qualquer
suporte humano precisar intervir.

## Hands-on

**Tutorial.** Implemente token bucket e janela deslizante em Go; demonstre o burst de borda da
janela fixa com um teste que explicitamente provoca a condição (rajada no fim de uma janela,
rajada no início da seguinte).

**Desafio.** Um agregador de uso que recebe 100 mil eventos de uso com 1% de duplicata e eventos
fora de ordem, e precisa produzir o total correto para faturamento.

**Invariantes testáveis**

1. Sob 50 clientes concorrentes, nenhum excede `limite + burst` configurado em nenhuma janela
   observada.
2. A implementação de janela fixa **demonstra** o defeito: admite até ~2× o limite nominal na
   virada de janela (o teste prova o defeito, não apenas o documenta).
3. O agregador produz um total **exatamente igual** à verdade-base construída no teste, mesmo com
   1% de duplicata e eventos fora de ordem — idempotência por `event_id` comprovada.
4. A soma da fatura gerada é igual à soma dos eventos únicos — nenhum evento duplicado contado,
   nenhum evento genuíno perdido.

**Complemento.** Decida e documente: o que acontece com o rate limit quando o Redis que o sustenta
cai — falhar aberto ou fechado — e quem, nomeadamente, é o dono dessa decisão.

**Checagem**

1. Por que o burst de borda da janela fixa pode dobrar efetivamente o limite nominal?
2. O que não deveria morar no gateway, e por quê?
3. Qual é a diferença entre chave de API e cliente OAuth2 como identidade de consumidor, e quando
   cada um é a escolha certa?
4. O que torna um pipeline de medição de uso "pronto para cobrar alguém"?

## Principais aprendizados

- O gateway concentra preocupações transversais — autenticação delegada, cota, transformação,
  observabilidade de borda — e nunca regra de negócio, que precisa viver visível no serviço.
- Token bucket é o algoritmo mais usado em produção porque modela bem o padrão real: burst curto
  tolerável, taxa sustentada controlada; janela fixa tem o defeito conhecido do burst de borda.
- Medição de uso para faturar é contabilidade: idempotência por `event_id`, tolerância a duplicata
  e fora de ordem, e reconciliação auditável — sem isso, não está pronta para cobrar ninguém.
- Falhar aberto ou fechado quando o rate limit cai é decisão de negócio com dono — depende de qual
  lado do erro custa mais, nunca de preferência técnica.
- Cliente OAuth2 com escopo granular é a identidade certa quando a API concede acesso a dado de
  terceiro — chave de API simples não carrega consentimento nem escopo por operação.
