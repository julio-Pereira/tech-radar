---
id: autorizacao
title: "Autorização: do escopo ao ReBAC"
summary: "Escopo não é permissão — é a confusão exata que produz BOLA. RBAC, ABAC, ReBAC, PDP/PEP como dado versus código, e por que a decisão de autorização mora no domínio, não no controller. Marco crítico: quiz estendido."
estimatedMinutes: 60
references:
  - title: "Open Policy Agent (OPA) — Documentation"
    url: https://www.openpolicyagent.org/docs/latest/
  - title: "AWS Cedar — Policy Language"
    url: https://www.cedarpolicy.com/
  - title: "NIST — Guide to Attribute Based Access Control (ABAC)"
    url: https://csrc.nist.gov/pubs/sp/800/162/final
---

## Escopo ≠ permissão

O marco 02 provou BOLA no endpoint de consulta de pagamento: um token com escopo correto,
de um titular legítimo, acessando o recurso de outro titular. Essa falha tem um nome
estrutural: **escopo diz o que o client pode pedir; permissão diz o que este usuário pode
fazer sobre este recurso específico**. Um framework de autorização que só verifica escopo
— "este token tem `payments:read`?" — responde a pergunta errada. A pergunta certa é "este
titular, especificamente, pode ler **este** pagamento?" — e nenhum framework responde a
essa pergunta por padrão, porque ela depende de uma relação de posse que só o domínio
conhece.

## RBAC → ABAC → ReBAC

Três modelos, em ordem crescente de expressividade — e de custo:

- **RBAC** (Role-Based Access Control) — permissão atrelada a **papel**. Simples de
  raciocinar, funciona bem quando "o que você pode fazer" depende só de quem você é
  organizacionalmente.
- **ABAC** (Attribute-Based Access Control) — permissão calculada a partir de
  **atributos**: do usuário, do recurso, do contexto (horário, localização, valor da
  transação). Responde perguntas que papel sozinho não responde: "operador pode ver, mas
  só transações abaixo de R$ 10 mil".
- **ReBAC** (Relationship-Based Access Control) — permissão baseada em **relação** entre
  entidades: "este usuário é gerente **da conta** que está sendo consultada?". É a
  pergunta que RBAC nunca responde, porque papel não carrega a relação com o recurso
  específico — só ReBAC modela "gerente de qual conta", não apenas "é gerente".

A escolha certa depende de onde a pergunta de autorização realmente mora. Boa parte dos
sistemas usa RBAC para o corte grosso (quem é operador, quem é cliente) e ReBAC ou ABAC
para o corte fino sobre o recurso específico. E uma ressalva que vale para os três
modelos: uma claim de papel vinda de um IdP federado (marco 06) é **entrada** da decisão
de autorização, apoiada na confiança que o broker estabeleceu — nunca a decisão em si.

## Política como dado × como código

Duas formas de expressar regra de autorização produzem resultados operacionais muito
diferentes. **Política como código** significa a regra embutida em `if`s espalhados pela
base — funciona, mas fica impossível de auditar sem ler o serviço inteiro, e cada novo
`if` é uma chance de esquecer um caso. **Política como dado** — ferramentas como
**OPA/Rego** ou **Cedar** — externaliza a regra para um formato declarativo, avaliado por
um motor de decisão separado.

Isso introduz o par **PDP/PEP**: o **Policy Decision Point** é quem avalia a política e
decide (permitir ou negar); o **Policy Enforcement Point** é quem aplica essa decisão no
caminho da requisição. Separar os dois papéis é o que permite **auditar a política sem
ler o código do serviço inteiro** — um revisor lê o arquivo de regras, não o serviço Java.
O custo é real: **latência** (uma chamada de decisão a mais no caminho crítico) e **mais
uma peça para operar** (o PDP precisa estar disponível, versionado, testado). A escolha
entre política como código e como dado é, no fim, uma escolha entre simplicidade
operacional e auditabilidade — e cresce em favor da segunda conforme a superfície de
regras cresce.

## Autorização no domínio, não só no controller

O erro de arquitetura mais caro do marco: um `@PreAuthorize` no controller HTTP protege
**a chamada HTTP**. Ele não protege o mesmo caso de uso quando invocado por um **consumidor
Kafka** processando um evento, ou por um **job agendado** rodando com credencial de
serviço — *reencontro:* exatamente o ponto de responsabilidade de camada que
`spring-boot/13` e a trilha `arquitetura-eventos` levantam para lógica de negócio em geral,
aplicado aqui à decisão de autorização. A regra que resolve isso: **a decisão de
autorização mora onde o caso de uso mora** — dentro do serviço de aplicação ou do domínio,
não numa anotação da camada de entrada. Toda entrada (HTTP, mensagem, job) invoca o mesmo
caso de uso, que aplica a mesma verificação, uma vez, no mesmo lugar.

## Multi-tenancy: o filtro esquecido

Numa aplicação multi-tenant, o bug mais caro e mais silencioso é o **filtro de tenant
esquecido em uma única query** — um `WHERE tenantId = ?` que falta numa consulta entre
centenas, e que devolve dado de outro cliente sem nenhum erro visível. Duas estratégias de
mitigação, com custos muito diferentes no prazo longo: **disciplina de revisão** (todo PR
verifica manualmente se a query filtra por tenant) e **controle estrutural** (um
repositório que **não compila** sem o tenant explícito no tipo, ou **Row-Level Security**
no próprio banco, que aplica o filtro independentemente do código de aplicação lembrar).
Disciplina de revisão **perde no prazo longo** — funciona enquanto a equipe é pequena e a
atenção não cansa; controle estrutural continua funcionando quando nenhuma das duas coisas
é mais verdade.

## Step-up authentication e consentimento com validade

Nem toda operação exige o mesmo nível de garantia de identidade. **Step-up authentication**
eleva a exigência de autenticação **por valor ou por risco** da operação específica — uma
consulta de saldo não pede o mesmo que uma transferência de valor alto. E a decisão de
autorização, numa fintech, muitas vezes precisa considerar **quando o titular consentiu**:
um consentimento válido na sexta-feira não autoriza automaticamente uma operação
solicitada meses depois, se o escopo do consentimento tinha validade declarada — a mesma
distinção entre escopo e consentimento que o marco 05 introduziu.

## Exemplo numa fintech

Um operador de backoffice pode **visualizar** uma transação suspeita, mas não pode
**estorná-la sozinho** — a separação chama-se **segregação de funções**, e é o mesmo
raciocínio que `kubernetes/10` aplica a RBAC de cluster (quem pode ver um Secret não deveria
poder também editá-lo), agora aplicado a papel de negócio. Quando a segregação de funções
precisa ser quebrada — uma emergência exige que alguém aja fora do papel normal — o
mecanismo correto é **acesso quebra-vidro**: a ação é permitida, mas **registrada de forma
destacada e auditável**, com justificativa exigida no momento do uso, não depois.

## Hands-on

**Desafio — matriz papel × recurso × ação como dado.** Declare, como dado (YAML, JSON, ou
uma tabela em Rego/Cedar), a matriz completa de quais papéis podem executar quais ações
sobre quais recursos do `fin-platform`. Escreva um teste que **percorre a matriz inteira**,
verificando cada combinação.

**Invariantes testáveis**

1. Toda combinação declarada como permitida realmente passa na verificação de autorização.
2. **Toda combinação não declarada é negada** — default-deny, o mesmo princípio da
   NetworkPolicy default-deny de `kubernetes/11`, agora aplicado a autorização de negócio.
3. Adicionar um recurso novo ao sistema **sem** declarar sua linha na matriz quebra o
   build (o teste falha, não passa silenciosamente permitindo tudo ou negando tudo).
4. A verificação de autorização é chamada a partir do caso de uso, e existe pelo menos um
   teste que invoca o caso de uso **sem passar pelo controller HTTP** (simulando a chamada
   via evento ou job) e confirma que a autorização ainda é aplicada.

**Complemento.** Implemente acesso quebra-vidro para uma ação sensível: permita a
execução fora do papel normal, mas registre, no log de segurança, quem, quando e com que
justificativa a exceção foi usada.

**Checagem**

1. Por que um token com o escopo correto ainda pode resultar em BOLA?
2. Em que situação ReBAC responde uma pergunta que RBAC não consegue responder?
3. Por que autorizar apenas no controller HTTP não protege o mesmo caso de uso quando
   invocado por um consumidor de evento?
4. Por que disciplina de revisão de código tende a falhar, no prazo longo, como única
   defesa contra o filtro de tenant esquecido?

## Principais aprendizados

- Escopo diz o que o client pode pedir; permissão diz o que este usuário pode fazer sobre
  este recurso — confundir os dois é exatamente o que produz BOLA.
- RBAC, ABAC e ReBAC respondem perguntas de granularidade crescente; a pergunta "gerente
  de qual conta" só ReBAC responde de verdade.
- Política como dado (PDP/PEP, OPA/Cedar) troca simplicidade operacional por
  auditabilidade — vale o custo quando a superfície de regras cresce.
- A decisão de autorização mora no caso de uso, não no controller — senão o mesmo caminho
  fica desprotegido quando invocado por evento ou job.
- Controle estrutural (compilação que exige tenant, RLS) vence disciplina de revisão no
  prazo longo para multi-tenancy, pelo mesmo motivo que default-deny vence lista de
  exceções em qualquer sistema de autorização.
