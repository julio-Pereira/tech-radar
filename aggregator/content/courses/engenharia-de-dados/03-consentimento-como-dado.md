---
id: consentimento-como-dado
title: "Consentimento como dado"
summary: "Consentimento não é uma flag de cadastro: é um dado de primeira classe, com ciclo de vida, que governa o uso de todos os outros. Política como código, não como interpretação jurídica. Marco crítico — quiz estendido."
estimatedMinutes: 60
references:
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
  - title: "Lei Geral de Proteção de Dados (Lei nº 13.709/2018)"
    url: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
---

## O erro mais comum: tratar consentimento como booleano

"O cliente autorizou ou não" parece suficiente até a primeira auditoria perguntar "autorizou o
quê, por quanto tempo, para qual finalidade?". Um consentimento real carrega: um **identificador**
próprio; o **titular**; a **transmissora** de origem; os **grupos de dados** autorizados (conta,
cartão, operação de crédito — cada grupo é uma permissão separada, não um pacote tudo-ou-nada); a
**finalidade declarada** (para que aquele dado pode ser usado — "oferta de crédito pessoal" não
autoriza uso para "pesquisa de mercado"); a **validade** (por quanto tempo, compatível com a
finalidade); e o **estado** (autorizado, renovado, expirado, revogado). Tratar isso como uma flag
é perder toda a informação que torna uma auditoria possível.

**Sobre a validade**: a regulação mudou — uma versão anterior limitava a validade a um teto fixo;
uma resolução conjunta posterior removeu esse teto, permitindo validade por prazo indeterminado
desde que compatível com a finalidade, conforme a LGPD. **Confira o texto vigente** antes de
hardcodar qualquer número — a trilha implementa o prazo como **parâmetro configurável**, nunca como
constante no código, exatamente para sobreviver a essa mudança.

## O ciclo de vida, e por que o histórico é imutável

Um consentimento nasce **autorizado**, pode ser **renovado** (o titular estende ou ajusta o que já
tinha concedido, sem perder o histórico do que valeu antes), **expira** (o prazo acaba sem ação do
titular) ou é **revogado** (o titular encerra explicitamente, a qualquer momento, por qualquer
canal — a especificação vigente declara quais canais e **como o receptor fica sabendo**, que
precisa ser conferido, não assumido). Cada transição é um **evento**, registrado num histórico
**imutável** — nunca um `UPDATE` sobre o registro do consentimento. Sem isso, não há como responder
"este dado podia ser usado para esta finalidade, naquela data específica?", que é exatamente a
pergunta que uma auditoria faz.

## `consentId` em cada registro: a linhagem de consentimento

Todo registro de dado recebido de uma transmissora carrega o `consentId` que o autorizou — sem
exceção, sem "a maioria tem". Essa é a **linhagem de consentimento**: a capacidade de responder,
para qualquer dado armazenado, "sob qual consentimento ele entrou?", e a capacidade inversa,
"quais dados entraram sob este consentimento específico?" — a segunda pergunta é exatamente o que
a revogação (marco 10) precisa responder para apagar corretamente.

## Política como código, e a visão "dado utilizável"

Finalidade, validade e retenção **não são texto numa ADR** — são **arquivos de configuração
versionados e testados**. Mudar o prazo máximo de retenção, ou adicionar uma finalidade nova, é
mudar um parâmetro e rodar a suíte de testes, não reinterpretar um documento jurídico cada vez. A
**visão `dado_utilizavel`** é a porta única de consumo: ela aplica a política (filtra por
consentimento válido, finalidade compatível, dentro da validade) e é a **única** fonte que qualquer
consumidor — incluindo o pipeline de ML da trilha `ml-em-producao` — está autorizado a ler. Acesso
direto ao dado bruto, contornando essa visão, quebra a garantia que toda a arquitetura existe para
dar.

## O que a norma exige do receptor após a revogação — e o que esta trilha decide no lugar disso

O que exatamente a instituição receptora deve fazer com dado **já coletado** quando o consentimento
que o autorizava é revogado — apagar, anonimizar, apenas parar de usar — não é uma questão que este
plano resolve: é uma decisão de política que precisa ir ao jurídico da instituição. O que esta
trilha garante é o **mecanismo**: a política é parametrizável entre "parar de coletar", "ocultar da
visão de consumo" e "apagar", e qualquer uma das três é implementada corretamente e testada — qual
delas a organização escolhe é fora do escopo técnico.

> **Reencontro — `system-design/10`.** Aquele marco tratou o mesmo ciclo de vida do lado da
> instituição **transmissora** — cache de validade, limite de obsolescência, propagação da
> revogação. Este é o espelho: aqui você é quem **recebe** e precisa honrar a revogação, não quem a
> propaga. `seguranca-aplicacao/08` cobre autorização em profundidade — aqui a autorização é
> **por finalidade de dado**, não por papel de usuário.

## Exemplo numa fintech

O cliente autoriza dados de conta e histórico de crédito para "oferta de crédito pessoal", por um
prazo que a tela de consentimento declara (confira o texto vigente para o que é permitido). No mês
4, ele revoga pelo app da própria transmissora — o receptor **não** foi notificado diretamente; ele
descobre consultando o estado do consentimento na próxima sincronização (o mecanismo exato de
descoberta está na especificação, a conferir). Entre a revogação real e a descoberta pelo receptor,
existe uma janela — e é exatamente essa janela que o SLO do marco 10 declara e mede.

## Hands-on

**Tutorial.** Construa a tabela de consentimento e a `politica/` (arquivos de configuração para
finalidade, validade, retenção) e a visão `dado_utilizavel` sobre dados simulados.

**Desafio.** Escreva testes de política sobre uma massa de 10 consentimentos em estados diferentes
(autorizado, renovado, expirado, revogado, com finalidades distintas).

**Invariantes testáveis**

1. A visão `dado_utilizavel` **não devolve** nenhuma linha associada a um consentimento revogado,
   expirado, ou de finalidade que não cobre o uso solicitado — teste exaustivo sobre a massa de 10
   consentimentos.
2. Toda linha do dado bruto tem um `consentId` que existe e é válido na tabela de consentimento —
   um registro sem `consentId` válido falha o carregamento, não entra silenciosamente.
3. Renovar um consentimento preserva o histórico de estados anteriores e não duplica nenhum
   registro de dado já coletado.
4. Trocar o parâmetro de prazo de retenção (ou de validade) muda o comportamento da visão
   `dado_utilizavel` **sem alterar nenhuma linha de código** — só o arquivo de configuração.

**Complemento.** Modele o caso de dois consentimentos sobrepostos para o mesmo titular e a mesma
finalidade (o cliente concede duas vezes, por engano ou por necessidade legítima) — o que a
visão `dado_utilizavel` faz nesse caso, e por quê.

**Checagem**

1. Por que tratar consentimento como uma flag booleana impede responder a uma pergunta de
   auditoria básica?
2. O que a linhagem de consentimento (`consentId` em cada registro) torna possível que não seria
   sem ela?
3. Por que finalidade, validade e retenção são arquivos de configuração testados, e não texto em
   ADR?
4. O que esta trilha decide tecnicamente sobre o que fazer após a revogação, e o que ela
   deliberadamente deixa para o jurídico decidir?

## Principais aprendizados

- Consentimento é um dado de primeira classe — identificador, titular, transmissora, grupos de
  dados, finalidade, validade, estado — nunca uma flag booleana de cadastro.
- O prazo de validade do consentimento é parâmetro configurável, nunca constante no código — a
  regulação já mudou esse número uma vez, e vai mudar de novo.
- `consentId` em todo registro é a linhagem que permite responder, nos dois sentidos, "sob qual
  consentimento este dado entrou" e "quais dados entraram sob este consentimento".
- A visão `dado_utilizavel` é a porta única de consumo — qualquer acesso que a contorne quebra a
  garantia que toda a plataforma de dados existe para dar.
- O que fazer com dado já coletado após a revogação é decisão de política com o jurídico; esta
  trilha garante o mecanismo parametrizável, não a interpretação normativa.
