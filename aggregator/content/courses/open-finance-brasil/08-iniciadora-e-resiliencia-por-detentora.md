---
id: iniciadora-e-resiliencia-por-detentora
title: "A iniciadora e a resiliência por detentora"
summary: "Quem consome dezenas de detentoras depende da pior delas — a menos que cada uma seja isolada como uma falha independente."
estimatedMinutes: 60
references:
  - title: "Open Finance Brasil — Portal institucional"
    url: https://openfinancebrasil.org.br/
---

## O lado iniciador em tempo real

O papel de **receptora/iniciadora**, visto agora do lado de quem consome, opera em **tempo real**:
descobre, via diretório, quais **endpoints e metadados** cada detentora publica, e precisa se
**registrar dinamicamente** (DCR, marco 02) em cada uma individualmente — não existe um único
registro universal que vale para todas as detentoras do ecossistema. Cada detentora é,
estruturalmente, uma integração separada, mesmo compartilhando o mesmo contrato canônico.

## Credenciais e tokens por detentora

Como o registro é individual, as **credenciais e os tokens** também são por detentora — exigindo
armazenamento seguro, renovação e revogação independentes para cada uma (a mesma disciplina de
`seguranca-aplicacao/10` aplicada, aqui, multiplicada pelo número de detentoras com as quais a
iniciadora interage). Um erro estrutural grave: o **token de uma detentora sendo enviado a
outra** — algo que só uma disciplina explícita de roteamento por detentora consegue prevenir de
forma confiável.

## Fluxos de consentimento no aplicativo

O fluxo de consentimento, do ponto de vista do cliente, envolve **redirecionamento** ou
*deep link* entre o aplicativo do TPP e o da detentora, e o retorno subsequente — e falhas nessa
jornada de experiência do usuário (uma volta que não funciona, uma tela de erro genérica) não são
só um problema de UX: são um **risco** real de abandono de fluxo em qualquer etapa, com estado de
consentimento potencialmente inconsistente se a falha ocorrer no momento errado.

## Resiliência por detentora: isolamento como princípio central

Quando uma detentora específica está lenta ou instável, a disciplina de **timeout**, **retry com
jitter**, **circuit breaker** e **bulkhead** (já formalizada em `spring-boot/08`) precisa ser
aplicada **por detentora**, não globalmente — o objetivo explícito é que uma detentora degradada
nunca consuma recursos (threads, conexões, filas) que deveriam estar disponíveis para chamadas a
outras detentoras saudáveis. Sem esse isolamento, a pior detentora do ecossistema determina a
experiência de **todos** os clientes da iniciadora, mesmo os que nunca interagem com ela.

## Diferenças de implementação entre detentoras

Na prática, detentoras reais divergem — em graus variados — do que a especificação formalmente
exige (um campo extra não documentado, uma enumeração com um valor novo). A iniciadora precisa de
uma **política declarada** sobre como lidar com esse desvio: **tolerar com alerta** (aceitar a
divergência, registrando que ela ocorreu, sem travar o fluxo) ou **recusar** (tratar como erro de
contrato). A escolha entre as duas, feita caso a caso sob pressão de produção, tende a ser pior do
que uma política decidida com antecedência.

## Mapeamento de erros entre detentoras

Cada detentora pode expressar o "mesmo" erro conceitual (saldo insuficiente, consentimento
inválido) com códigos e mensagens diferentes — a iniciadora precisa de uma camada de **mapeamento
de erros** que traduz essas variações para um vocabulário interno único, de forma que o restante
do sistema (e, eventualmente, o usuário final) não precise conhecer as particularidades de cada
detentora individualmente.

## Conciliação: iniciar × estado final, e o que nunca repetir

O ato de **iniciar** um pagamento e o **estado final** que ele eventualmente alcança são eventos
distintos, possivelmente distantes no tempo — a iniciadora precisa **conciliar** os dois
(exatamente o problema já visto em `ledger-e-contabilidade`), e a regra inegociável: um resultado
desconhecido ou um timeout **nunca** deveria levar a um **novo débito** por conta própria da
iniciadora — a resolução é sempre por consulta ao estado real, a mesma disciplina já estabelecida
no marco 07, aqui vista do lado de quem consome múltiplas detentoras.

## Observabilidade por detentora

Medir **taxa de sucesso**, latência e disponibilidade **por detentora individualmente** — não só
agregado para todo o ecossistema — é o que permite identificar qual detentora específica está
degradando a experiência, e decidir se o problema justifica uma política de tolerância diferente
para aquela detentora específica, ou uma escalada formal.

## Exemplo numa fintech

Uma detentora específica começa a responder com latência muito alta; sem isolamento, suas
chamadas lentas consomem todas as *threads* disponíveis do pool de conexões da iniciadora,
paralisando o aplicativo inteiro — inclusive para clientes que não têm nenhuma relação com essa
detentora. Com *bulkhead* e *circuit breaker* aplicados especificamente a ela, só os clientes
dessa detentora são afetados; todos os demais continuam normalmente.

## Hands-on

**Tutorial.** Implemente `iniciador/` com registro, descoberta e chamadas a duas detentoras
simuladas.

**Desafio.** Implemente o isolamento por detentora e a resolução de resultado desconhecido numa
iniciação de pagamento.

**Invariantes testáveis**

1. Uma detentora com **latência injetada** não aumenta a latência das **outras** detentoras além
   de uma margem declarada — verificado como uma relação medida sob carga simulada.
2. O **circuit breaker** por detentora abre após N falhas configuradas e **fecha** após sucesso,
   verificado com relógio falso controlando o tempo de reabertura.
3. Um **timeout** numa iniciação de pagamento leva à **consulta** do estado real, **nunca** a um
   novo envio com uma chave de idempotência nova.
4. O **token de uma detentora nunca é enviado a outra** — verificado por um teste de roteamento
   que injeta deliberadamente múltiplas detentoras simuladas.
5. Um desvio de formato de uma detentora específica (campo extra, enumeração nova) é tratado pela
   **política declarada** (tolerar com alerta × recusar) sem afetar o processamento das demais
   detentoras.
6. Toda iniciação tem um **estado final registrado** depois da conciliação entre o evento de
   início e a confirmação posterior.

**Complemento.** Desenhe, por escrito, a política de "detentora fora do padrão" que você adotaria
— quando tolerar um desvio com alerta, e quando recusar.

**Checagem**

1. Por que credenciais e tokens precisam ser gerenciados separadamente por detentora, em vez de
   um conjunto único compartilhado?
2. Por que isolamento por detentora (circuit breaker, bulkhead) precisa ser aplicado
   individualmente, não globalmente para todo o tráfego da iniciadora?
3. Por que um timeout numa iniciação de pagamento nunca deveria levar a um novo envio com chave de
   idempotência nova?
4. Por que medir taxa de sucesso e latência por detentora individualmente é mais útil do que só
   uma métrica agregada do ecossistema inteiro?

> **Reencontro — `spring-boot/08`.** A disciplina de timeout, circuit breaker e bulkhead daquele
> marco é exatamente o que este marco aplica, individualmente, a cada detentora — o princípio é o
> mesmo; a unidade de isolamento, aqui, é a detentora específica, não o serviço inteiro.

A ingestão de APIs de terceiros de `engenharia-de-dados/02` é o mesmo domínio de integração com
múltiplas fontes externas heterogêneas, aqui aplicado a chamadas em tempo real em vez de lote; as
sagas de `arquitetura-eventos/09` são o padrão de processo de longa duração que a conciliação
entre iniciação e estado final, aqui, representa; a gestão de segredos de `seguranca-aplicacao/10`
sustenta o armazenamento seguro de credenciais por detentora; e os *traces* distribuídos de
`observabilidade/10` são o que permite acompanhar uma única iniciação através de múltiplos
sistemas (iniciadora, detentora, SPI) até seu estado final.

## Principais aprendizados

- Cada detentora é, estruturalmente, uma integração separada — registro, credenciais e tokens não
  são compartilhados entre elas.
- Isolamento (circuit breaker, bulkhead) precisa ser aplicado por detentora, nunca globalmente —
  senão a pior detentora determina a experiência de todos os clientes.
- Um timeout numa iniciação de pagamento se resolve por consulta ao estado real, nunca por um novo
  envio com chave nova.
- Desvios de implementação entre detentoras exigem uma política declarada (tolerar com alerta ×
  recusar), decidida com antecedência, não sob pressão em produção.
- Medir taxa de sucesso e latência por detentora individualmente é o que permite identificar qual
  delas, especificamente, está degradando a experiência.
