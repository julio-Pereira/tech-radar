---
id: consentimento-no-transmissor
title: "Consentimento no transmissor"
summary: "O consentimento é a fonte da verdade de toda resposta — e a pergunta que a implementação precisa responder é: 'este acesso é permitido agora?'."
estimatedMinutes: 65
references:
  - title: "Open Finance Brasil — Portal de especificações (Confluence)"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## O consentimento como máquina de estados

O consentimento não é um booleano "tem ou não tem" — é uma **máquina de estados** explícita:
criado → aguardando autorização → autorizado → (consumido, expirado, revogado ou rejeitado, entre
outros — **conferir** os nomes e as transições exatas vigentes). Modelar o consentimento como
estados com transições válidas e inválidas, em vez de um conjunto de *flags* independentes, é o
que torna "esse consentimento ainda vale?" uma pergunta com resposta única e verificável.

## Permissões e o escopo mínimo

Um consentimento agrupa **permissões** específicas (acesso a saldo, a extrato, a dados cadastrais
— **conferir** o agrupamento vigente), e o cliente concede cada uma explicitamente, não um pacote
genérico de "todos os meus dados". O **escopo mínimo** — conceder só o que o caso de uso real
precisa, nunca "por garantia, peça tudo" — é tanto uma boa prática quanto, frequentemente, uma
exigência regulatória direta.

## Escopo (OAuth) × permissão (consentimento): necessário × suficiente

Uma distinção estrutural central: o **escopo** OAuth declara a categoria de acesso que o token
carrega — é **necessário** para que uma chamada seja tecnicamente possível, mas **não é
suficiente**. A chamada só é de fato permitida se o **consentimento** específico do cliente também
cobrir aquela permissão específica. Um token com escopo "contas" mas sem um consentimento ativo
cobrindo a permissão de saldo ainda precisa ser recusado — ter o escopo certo não substitui ter o
consentimento certo.

## Revogação e o limite de propagação declarado

Quando o cliente **revoga** um consentimento (pelo próprio cliente, pelo TPP, ou pelo
transmissor), o acesso correspondente precisa cessar — mas "cessar instantaneamente em todo
sistema distribuído" raramente é literal. O que existe, na prática, é um **limite de propagação
declarado** (`system-design/10` já tratou esse desenho): um tempo máximo até que a revogação tenha
efeito em qualquer ponto do sistema, e esse limite precisa ser **verificável**, não uma promessa
vaga de "o mais rápido possível".

## Consentimento com estado e dono

Um consentimento tem um **dono** claro (o cliente) e regras específicas sobre **quem pode mudar o
quê**: o cliente pode revogar a qualquer momento; o TPP pode, em certos fluxos, também solicitar
encerramento; o transmissor pode revogar por razões operacionais ou de segurança (**conferir** as
condições exatas). Permitir que qualquer parte mude qualquer estado, sem essa distinção de
permissão por ator, é uma falha de modelagem que abre espaço para um TPP, por exemplo, reativar um
consentimento que o cliente já havia revogado.

## Validação em cada requisição: cache com invalidação ativa

Consultar a validade do consentimento numa fonte lenta a cada requisição seria caro; confiar num
cache com TTL longo, sem mais nada, significa que uma revogação recente pode não ser refletida a
tempo. A resposta (`system-design/10` já desenhou essa arquitetura) é um **cache com invalidação
ativa**: o cache acelera o caso comum, mas um evento de revogação dispara, explicitamente, a
invalidação da entrada correspondente — não se depende só da expiração natural do TTL.

## Eventos de consentimento via *outbox*

Cada mudança relevante de estado do consentimento (criado, autorizado, revogado) deveria gerar um
**evento** publicado de forma confiável — a mesma disciplina de outbox já formalizada em
`arquitetura-eventos/08`, aqui aplicada especificamente a transições de consentimento, que outros
sistemas (auditoria, análise, o próprio mecanismo de invalidação de cache) consomem.

## Trilha de auditoria de acesso

Todo acesso a um dado sob consentimento gera um registro de auditoria: qual TPP, qual recurso,
qual consentimento amparou o acesso, e qual foi o resultado. Esse registro não é opcional nem uma
melhoria futura — é, estruturalmente, a evidência que permite responder, depois do fato, "quem
acessou o quê, sob qual autorização, e quando" — a mesma disciplina de autorização verificável já
tratada em `seguranca-aplicacao/08`, aqui com o consentimento como camada adicional sobre o escopo.

## Consentimento de dados × consentimento de pagamento

O consentimento de **dados** (o que este marco trata) autoriza acesso repetido a informação,
dentro de um prazo de validade; o consentimento de **pagamento** (marco 07) é estruturalmente
diferente — **uso único**, vinculado a um valor e destinatário específicos, porque ele move
dinheiro, não apenas informação. Tratar os dois com o mesmo modelo de estados seria um erro: as
consequências de uma falha de controle são de natureza diferente em cada caso.

## Exemplo numa fintech

O cliente revoga, dentro do aplicativo do seu banco, o consentimento dado a um agregador
financeiro; o próximo `GET` que o agregador faz, um segundo depois, é recusado — porque o evento
de revogação já invalidou ativamente a entrada correspondente no cache de validade, em vez de
esperar a expiração natural do TTL.

## Hands-on

**Tutorial.** Implemente a máquina de estados do consentimento, a API correspondente, e a
validação em cada chamada.

**Desafio.** Implemente a revogação com limite de propagação declarado e os eventos
correspondentes.

**Invariantes testáveis**

1. Uma transição **fora do grafo** de estados válido é **rejeitada** — verificado contra uma
   tabela exaustiva de combinações estado × evento.
2. Um estado **terminal** (revogado, expirado, rejeitado) **nunca** volta a "autorizado" —
   verificado tentando essa transição especificamente e confirmando a rejeição.
3. Depois de uma revogação, **nenhuma** requisição é aceita além do **limite de obsolescência
   declarado** — verificado com relógio falso e o mecanismo de cache simulado.
4. Uma chamada com **escopo válido**, mas **sem permissão correspondente** no consentimento ativo,
   é recusada com o erro especificado — escopo necessário não é suficiente.
5. Todo acesso gera um registro de auditoria com **TPP, recurso, consentimento e resultado** —
   verificado sobre uma amostra de chamadas simuladas.
6. A **mesma revogação** enviada **N vezes concorrentes** resulta em **um único** evento publicado
   — idempotência de ingestão, não N eventos duplicados.
7. **Demonstração do limite:** com invalidação **apenas** por TTL (sem invalidação ativa), o pior
   caso observado de atraso de propagação é o TTL inteiro — reproduzido para evidenciar por que a
   invalidação ativa é necessária.

**Complemento.** Escreva, por escrito, o limite de obsolescência de consentimento que você
adotaria para o seu próprio contexto, e quem (qual papel organizacional) deveria aprová-lo.

**Checagem**

1. Por que modelar consentimento como máquina de estados, em vez de um conjunto de *flags*
   independentes, torna "esse consentimento ainda vale?" uma pergunta com resposta verificável?
2. Qual é a diferença entre escopo OAuth e permissão de consentimento — e por que o primeiro é
   necessário, mas não suficiente?
3. Por que um cache de validade de consentimento precisa de invalidação ativa, não só de TTL?
4. Por que o consentimento de pagamento precisa de um modelo estruturalmente diferente do
   consentimento de dados?

> **Reencontro — `system-design/10`.** O caso de consentimento daquele marco já desenhou a
> arquitetura de cache com invalidação ativa que este marco implementa de fato — o desenho e a
> implementação são complementares, não redundantes.

O consentimento como dado do lado receptor, já tratado em `engenharia-de-dados/03`, é a mesma
estrutura de informação vista do outro lado da integração; o outbox de `arquitetura-eventos/08` é
o mecanismo concreto de entrega confiável dos eventos de consentimento; a autorização de
`seguranca-aplicacao/08` é a disciplina geral de escopo que este marco estende com a camada
adicional de consentimento; e a governança de PII de `dados-distribuidos/13` é o vocabulário de
privacidade que rege todo acesso a dado pessoal sob consentimento.

## Principais aprendizados

- Consentimento é melhor modelado como máquina de estados explícita do que como um conjunto de
  *flags* independentes.
- Escopo OAuth é necessário, mas não suficiente — a permissão específica do consentimento também
  precisa cobrir a chamada.
- Revogação precisa de um limite de propagação declarado e verificável, não uma promessa vaga de
  "instantâneo".
- Cache de validade de consentimento precisa de invalidação ativa disparada por evento, não só de
  expiração por TTL.
- Consentimento de dados e consentimento de pagamento são estruturalmente diferentes — um permite
  acesso repetido; o outro é de uso único.
