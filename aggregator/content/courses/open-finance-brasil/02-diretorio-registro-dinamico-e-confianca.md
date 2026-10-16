---
id: diretorio-registro-dinamico-e-confianca
title: "Diretório, registro dinâmico e confiança"
summary: "Em um ecossistema com centenas de participantes que não se conhecem, identidade é um problema de infraestrutura — e quem verifica mal o diretório confia em qualquer um."
estimatedMinutes: 65
references:
  - title: "RFC 7591 — OAuth 2.0 Dynamic Client Registration"
    url: https://datatracker.ietf.org/doc/html/rfc7591
  - title: "OpenID Connect Dynamic Client Registration 1.0"
    url: https://openid.net/specs/openid-connect-registration-1_0.html
---

## O diretório de participantes como autoridade

O **diretório de participantes** é a fonte central de verdade sobre quem é um participante válido
do ecossistema, qual papel exerce, e em que estado (ativo, suspenso, revogado) ele está. Toda
decisão de confiança, em última instância, se apoia nessa fonte — direta (consultando o diretório)
ou indiretamente (validando um certificado emitido pela cadeia que o diretório controla).

## SSA: a declaração de software

A **SSA** (*software statement assertion*) é um **JWT assinado pelo diretório** que atesta, de
forma verificável, que um determinado software pertence a uma determinada organização
participante, com um determinado escopo de uso. Validar uma SSA significa, no mínimo, verificar a
**assinatura** (foi de fato o diretório que assinou), o **emissor**, a **expiração**, e o
**status** atual da organização que ela representa — uma SSA tecnicamente bem assinada, mas de uma
organização já revogada, não deveria ser aceita.

## Registro dinâmico de cliente (DCR)

O **DCR** (*dynamic client registration*) é o processo pelo qual um participante, apresentando uma
SSA válida, se registra como cliente OAuth2 num transmissor — um ciclo de vida completo:
**registrar**, **atualizar** (metadados, chaves) e **remover**. Tratar DCR como um cadastro manual
único, sem suporte a atualização e remoção, falha exatamente no cenário mais comum em produção:
rotação de chave e mudança de metadados do participante ao longo do tempo.

## JWKS: cache, rotação e o problema do *kid*

O **JWKS** (*JSON Web Key Set*) publica as chaves públicas usadas para verificar assinaturas — do
diretório e de cada participante individualmente. Consultar o JWKS a cada requisição seria caro
demais; manter um **cache** é necessário, mas introduz a pergunta real deste marco: por quanto
tempo um cache obsoleto deveria ser tolerado se o JWKS de origem estiver indisponível? O campo
**`kid`** (*key id*) identifica qual chave específica de um conjunto foi usada — e tratá-lo sem
cuidado (aceitando qualquer `kid` desconhecido sem rejeitar, por exemplo) abre uma classe de
ataque de confusão de chave.

## Cadeia de certificados e a CA do ecossistema

Cada participante opera com certificados emitidos por uma **cadeia de certificação** controlada
pelo ecossistema (**conferir** quais autoridades e perfis de certificado são aceitos na versão
vigente) — os **atributos do certificado** (razão social, identificador organizacional) são, eles
mesmos, uma forma de identidade verificável, independente do que qualquer *payload* de requisição
afirma. Um certificado de transporte válido, mas emitido para uma organização diferente da que a
SSA apresentada declara, é uma incompatibilidade que precisa ser detectada antes de qualquer outra
validação.

## Revogação: *fail-open* × *fail-closed*

Quando a consulta de revogação de um certificado (CRL ou OCSP) falha — por indisponibilidade do
serviço de revogação, não porque o certificado foi de fato revogado — o sistema precisa escolher
entre **fail-open** (aceitar o certificado, assumindo que provavelmente está válido) e
**fail-closed** (rejeitar, assumindo o pior). Essa é uma decisão explícita de risco, não um
acidente de implementação — **conferir** qual postura o perfil de segurança vigente exige, e
documentar a escolha e sua justificativa quando não houver exigência explícita.

## Rotação de certificado e de chave sem derrubar o participante

Um participante rotacionando seu certificado ou sua chave de assinatura não deveria perder acesso
abruptamente — uma janela de **sobreposição** (o certificado ou chave antiga e a nova, ambas
válidas por um período) é o que permite uma transição suave. Implementar rotação sem essa
sobreposição é tecnicamente "correto" num sentido estrito, mas operacionalmente hostil — o
participante é efetivamente derrubado no exato momento em que tenta fazer a coisa certa.

## Ataques específicos deste domínio

Alguns padrões de ataque são específicos deste modelo de confiança: uma **SSA reutilizada** além do
seu propósito original; um `iss` (*issuer*) **forjado** apontando para um emissor que parece
legítimo mas não é o diretório real; **confusão de `kid`** (explorando como o verificador escolhe
qual chave usar quando múltiplas chaves compartilham identificadores ou formatos parecidos); e
**downgrade de algoritmo** (forçar o uso de um algoritmo de assinatura mais fraco, ou mesmo `none`,
quando o verificador aceita qualquer algoritmo declarado no próprio token em vez de impor um
conjunto fechado permitido).

## Exemplo numa fintech

Um TPP envia um pedido de registro com uma SSA tecnicamente válida — assinatura correta, emissor
correto, não expirada — mas o certificado de transporte usado na conexão pertence a uma
organização **diferente** da que a SSA declara. A assinatura da SSA confere; a identidade
organizacional, não — e é exatamente essa incompatibilidade que precisa ser detectada e recusada.

## Hands-on

**Tutorial.** Implemente `diretorio-sim/` (CA simulada, emissão de SSA, JWKS) e o fluxo de registro
dinâmico no `transmissor/`.

**Desafio.** Escreva a suíte negativa de registro: cada forma conhecida de SSA ou certificado
inválido, com a recusa esperada.

**Invariantes testáveis**

1. Uma SSA **adulterada**, **expirada**, de **emissor desconhecido**, ou de um participante **já
   revogado** é recusada — cada caso com o erro especificado, numa tabela de cenários.
2. O certificado de transporte usado na conexão precisa **pertencer à mesma organização** declarada
   na SSA — uma incompatibilidade entre os dois é sempre recusada.
3. Um algoritmo de assinatura **fora da lista explicitamente permitida** (incluindo `none`) é
   recusado — o verificador nunca aceita o algoritmo só porque o próprio token o declara.
4. Com o diretório simulado fora do ar, o JWKS em **cache** continua sendo usado **até o limite de
   tempo declarado**, e depois disso o sistema falha **fechado** — verificado com relógio falso
   avançando além do limite.
5. Uma rotação de chave com **sobreposição de `kid`** não derruba clientes já registrados —
   verificado mantendo requisições válidas durante toda a janela de sobreposição simulada.
6. **Demonstração do limite:** sem a validação explícita de que o certificado pertence à mesma
   organização da SSA, um participante consegue se registrar fingindo ser outro — reproduzido
   deliberadamente para evidenciar por que a checagem é necessária.

**Complemento.** Decida, por escrito, entre *fail-open* e *fail-closed* para a consulta de
revogação do seu cenário, e justifique a escolha considerando o perfil de risco envolvido.

**Checagem**

1. Por que uma SSA tecnicamente bem assinada ainda pode ser recusada?
2. O que diferencia a validação da assinatura de uma SSA da validação de que o certificado de
   transporte pertence à mesma organização?
3. Quais são os riscos relativos de escolher *fail-open* versus *fail-closed* quando a consulta de
   revogação está indisponível?
4. Por que uma rotação de certificado sem janela de sobreposição é tecnicamente correta, mas
   operacionalmente hostil?

> **Reencontro — `seguranca-aplicacao/04`, `/10`.** O JOSE por dentro do primeiro marco é
> exatamente o mecanismo que sustenta a verificação de assinatura da SSA e do JWKS deste marco; e
> a gestão de segredos e chaves do segundo é a disciplina que decide como a rotação de certificado
> e de chave, aqui, é conduzida sem expor nenhum segredo durante a transição.

O perfil FAPI de `seguranca-aplicacao/07` é o conjunto de exigências que o servidor de autorização
do marco 03 implementa sobre a base de confiança que este marco estabelece; e a segurança de
transporte e de borda de `seguranca-aplicacao/11` é onde a validação de certificado de transporte,
central a este marco, de fato acontece na pilha de rede.

## Principais aprendizados

- O diretório de participantes é a autoridade central de confiança — toda validação de identidade
  se apoia nele, direta ou indiretamente.
- Uma SSA tecnicamente bem assinada ainda precisa ter emissor, expiração e status da organização
  verificados.
- O certificado de transporte precisa pertencer à mesma organização que a SSA declara — a
  assinatura sozinha não garante isso.
- *Fail-open* e *fail-closed*, na indisponibilidade da consulta de revogação, são escolhas
  explícitas de risco, não acidentes de implementação.
- Rotação de certificado e de chave precisa de janela de sobreposição, ou o participante é
  derrubado no momento em que faz a coisa certa.
