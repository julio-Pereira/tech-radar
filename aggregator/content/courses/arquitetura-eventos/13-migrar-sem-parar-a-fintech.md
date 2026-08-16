---
id: migracao-e-antipadroes
title: "Migrar para eventos sem parar a fintech"
summary: "Strangler fig começando pelo contexto de menor invariante compartilhada, CDC como ponte com data de validade, os sete antipadrões que fecham a trilha e a pergunta final honesta."
estimatedMinutes: 55
references:
  - title: "Martin Fowler — StranglerFigApplication"
    url: https://martinfowler.com/bliki/StranglerFigApplication.html
  - title: "Microservices.io — Strangler application"
    url: https://microservices.io/patterns/refactoring/strangler-application.html
  - title: "Martin Fowler — Feature Toggles"
    url: https://martinfowler.com/articles/feature-toggles.html
---

## Strangler fig: um contexto por vez

Ninguém migra um sistema de pagamentos de uma vez. A figueira estranguladora cresce em volta
da árvore até que a árvore não seja mais necessária: você extrai **um bounded context por
vez**, com o legado funcionando o tempo todo.

A ordem importa mais que a técnica. Comece pelo contexto com **menor invariante
compartilhada** com o resto — aquele cujas regras dependem menos de estado que mora em
outro lugar. Notificação, extrato, relatório e conciliação costumam ser bons primeiros
candidatos: eles leem muito e decidem pouco.

E quase nunca é o ledger. Ele concentra as invariantes mais fortes — a soma fecha em zero, o
saldo não fica negativo — e é onde o marco 02 diz que a fronteira do agregado é mais rígida.
Extrair o ledger primeiro é escolher a parte mais difícil quando você ainda tem menos prática
e menos observabilidade de fluxo.

Regra de segurança: **cada extração é reversível**. Enquanto o legado ainda funciona e a
rota pode voltar, você tem um plano de reversão de verdade — não um parágrafo no documento.

## CDC como ponte, com data de validade

Você precisa dos eventos de um sistema que não pode alterar. O CDC lê o log do banco do
legado e publica as mudanças como eventos. Funciona, é rápido de montar, e é uma **ponte**.

O que ele custa: o consumidor passa a depender do **schema interno** do legado — exatamente
o acoplamento que o marco 02 proíbe. Uma coluna renomeada numa refatoração do legado quebra
um consumidor que o time do legado nem sabe que existe.

Por isso a regra: **CDC entra com data de validade escrita na ADR**. Quando o contexto for
extraído, ele passa a publicar eventos de integração próprios, e o CDC é desligado. Sem essa
data, a ponte vira arquitetura, e o acoplamento de schema vira permanente. (A mecânica e o
modo de falha operacional — slot parado enchendo o disco — estão em `kafka/08`.)

E o que continua proibido, inclusive durante a migração: **dual-write**. Gravar no legado e
no novo em duas operações separadas produz divergência silenciosa, e migração é justamente o
momento em que ninguém percebe divergência, porque tudo está mudando.

## Backfill e a virada de leitura

A extração de um contexto com read model tem três tempos:

**1. Backfill.** A projeção nova é construída do histórico, com o legado ainda servindo
todas as leituras. Nada muda para o usuário. É aqui que você descobre que o histórico tem
dados que o modelo novo não previa — e é barato descobrir agora.

**2. Comparação em produção.** Os dois respondem, o legado serve e o novo é comparado em
silêncio. Divergência é registrada, não exibida. Rode por dias, não por horas: o caso raro
que quebra costuma ser mensal.

**3. Virada.** A leitura passa para o novo, atrás de uma **feature flag** que é interruptor
de rota — com dono, prazo de remoção e registro auditável de quem virou e quando. Vire por
fatia (um percentual, um segmento), nunca para todos de uma vez.

A flag é o plano de reversão executável: voltar é mudar um valor, não fazer deploy. E ela
tem prazo porque flag sem prazo vira bifurcação permanente de código — o assunto merece uma
trilha própria, mas a disciplina mínima é essa.

## Os sete antipadrões

O fecho da trilha, que é ela inteira ao contrário:

1. **Monolito distribuído** — serviços separados que só sobem juntos e falham juntos, porque
   os "eventos" são chamadas síncronas disfarçadas.
2. **Tópico único `eventos`** — tudo num lugar só; todo consumidor lê tudo, filtra em
   memória e depende de mudanças que não lhe dizem respeito.
3. **Evento como RPC** — `DoPaymentCommand` publicado. O nome no imperativo denuncia
   (marco 01).
4. **Saga sem timeout** — o processo que fica pendurado para sempre, sem alerta, porque
   nada falhou (marco 09).
5. **Projeção como fonte da verdade** — alguém escreve direto no read model, e a divergência
   aparece na conciliação (marco 06).
6. **Evento de domínio vazando como contrato público** — o modelo interno vira contrato sem
   ninguém decidir, e refatorar passa a quebrar terceiros (marcos 02 e 05).
7. **"EDA porque a arquitetura de referência mandou"** — nenhuma pergunta concreta foi
   respondida, e o custo operacional entrou inteiro.

Os sete têm o mesmo pai: adotar a forma sem a razão.

## A pergunta final, honesta

Passado um ano de migração, a pergunta não é quantos serviços você tem. É:

> **O que melhorou de fato — autonomia de deploy por squad, ou só a contagem de
> repositórios?**

Os testes que respondem, e nenhum deles é sobre arquitetura no papel:

- Um squad consegue subir uma mudança **sem coordenar** com outro?
- Uma falha em um contexto deixa os outros funcionando, mesmo que degradados?
- O tempo até detectar um problema **caiu** com a migração, ou subiu porque agora há mais
  peças e o mesmo painel?
- Alguém consegue responder "onde está o pagamento X?" mais rápido do que antes (marco 11)?

Se a resposta a todas for não, o sistema ficou mais caro e não ficou melhor — e essa é uma
conclusão legítima de uma ADR, desde que escrita.

## Exemplo numa fintech

Extrair a liquidação do monolito de pagamentos, com o BACEN olhando.

O que muda em relação a uma migração comum é o que **não** é negociável: o plano de reversão
é obrigatório e precisa ser demonstrável, não descrito. Concretamente, a ADR de extração
precisa responder:

- **Gatilho de reversão** — qual número, medido, faz voltar? "Divergência de conciliação
  acima de 0,01% em qualquer dia" é gatilho; "se der problema" não é.
- **Quanto tempo leva voltar** — e quando isso foi testado pela última vez.
- **O que não volta sozinho** — eventos já publicados, projeções já construídas,
  notificações já enviadas ao cliente.
- **Quem decide** — nome do papel, disponível no horário da virada.

A conciliação diária é o instrumento que torna tudo isso verificável: enquanto o legado e o
novo produzem o mesmo resultado contábil todo dia, a migração está saudável. No primeiro dia
em que não produzem, você tem um número, e não uma sensação.

## Hands-on

**Desafio — a ADR de extração.** Escolha um contexto do `fin-platform` e escreva a ADR
completa da extração dele:

1. **Contexto** — o que existe hoje e por que mudar.
2. **Decisão** — qual contexto sai, em que ordem, com qual ponte temporária.
3. **Alternativas consideradas** — inclusive "não fazer nada", com o custo de cada uma.
4. **Consequências** — o que fica pior, e não só o que fica melhor.
5. **Gatilho de reversão** — um número medido, com o mecanismo que o mede.
6. **Critério de sucesso** — mensurável, com prazo. "Autonomia de deploy" não é critério;
   "o squad de liquidação sobe em produção sem PR em outro repositório" é.

**Invariantes testáveis**

1. O gatilho de reversão é um número com fonte de medição nomeada.
2. O critério de sucesso tem prazo e é verificável por alguém de fora do time.
3. A ponte CDC, se houver, tem data de desligamento escrita na própria ADR.
4. Existe um teste ou procedimento que exercita a reversão — e a data da última execução.
5. Nenhum passo da migração faz dual-write.

**Complemento.** Volte ao `SINCRONO-OU-EVENTO.md` do marco 01 e confronte com o que você
construiu. Alguma interação classificada como síncrona virou evento no caminho, ou o
contrário? Se sim, a divergência está justificada por escrito? Este é o fecho real da
trilha: **o `fin-platform` respeitou a própria decisão?**

**Checagem**

1. Por que a extração começa pelo contexto de menor invariante compartilhada, e por que
   quase nunca é o ledger?
2. Qual acoplamento o CDC cria, e o que impede que ele vire permanente?
3. Quais são os três tempos da virada de leitura, e qual deles as pessoas pulam?
4. Quais dos sete antipadrões existem hoje no seu sistema — e qual você conseguiria remover
   em duas semanas?

## Principais aprendizados

- Strangler fig extrai um contexto por vez, começando pelo de menor invariante compartilhada
  — quase nunca o ledger, que é onde as invariantes são mais rígidas.
- CDC é ponte com data de desligamento na ADR; sem a data, o acoplamento ao schema interno
  do legado vira permanente. Dual-write continua proibido, inclusive na migração.
- A virada de leitura tem três tempos — backfill, comparação silenciosa e virada por fatia
  atrás de flag —, e a flag é o plano de reversão executável.
- Os sete antipadrões têm o mesmo pai: adotar a forma sem a razão.
- A pergunta final é sobre autonomia de deploy e tempo de detecção, não sobre contagem de
  repositórios — e "ficou mais caro sem ficar melhor" é uma conclusão legítima, desde que
  escrita.

## Capstone

O `fin-flow` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] Os quatro documentos do bloco de domínio: `SINCRONO-OU-EVENTO.md`, `CONTEXTOS.md`,
      `EVENTOS.md` e `CONSISTENCIA.md`
- [ ] Catálogo de eventos com envelope canônico, versão, dono e política de evolução
- [ ] Projeção de extrato idempotente, determinística e reprojetável
- [ ] Agregado event-sourced com snapshot — ou a ADR que conclui por audit log + outbox
- [ ] Inbox no consumidor de liquidação, e idempotência de negócio na entrada
- [ ] Orquestrador de saga com máquina de estado persistida, compensação e prazo por passo
- [ ] `correlationId` / `causationId` em todo evento, e o painel de sagas
- [ ] Suítes de reprojeção, idempotência e retomada de saga no CI

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] Toda invariante tem exatamente um dono, e as transacionais cabem num agregado
- [ ] Toda janela de inconsistência tem número, monitoramento e frase para o cliente
- [ ] Reprojeção completa produz um read model idêntico ao anterior, por hash
- [ ] 3 reentregas e 1 evento fora de ordem: o ledger fecha idêntico ao cenário limpo
- [ ] Duas requisições com a mesma chave de idempotência produzem um pagamento
- [ ] A saga retoma depois de `kill -9` em qualquer passo, sem duplicar nem perder compensação
- [ ] Nenhuma saga aberta sem prazo; existe alerta por idade
- [ ] "Onde está o pagamento X?" respondido em menos de 30 segundos, sem abrir o banco
- [ ] Um PR que adiciona campo obrigatório a um evento existente falha no CI
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma
página — inclusive se nada tiver quebrado. E responda por escrito à pergunta final deste
marco: o que melhorou de fato?
