---
id: programa-e-antipadroes
title: "O programa: conformidade, revisão e antipadrões"
summary: "Do controle isolado ao programa: o que pentest, bug bounty e revisão de acesso acham — e o que nenhum deles acha. Os doze antipadrões que fecham a trilha, e o capstone: as dez ameaças do marco 01, revisitadas."
estimatedMinutes: 60
references:
  - title: "OWASP Software Assurance Maturity Model (SAMM)"
    url: https://owaspsamm.org/
  - title: "PCI Security Standards Council"
    url: https://www.pcisecuritystandards.org/
  - title: "ISO/IEC 27001"
    url: https://www.iso.org/standard/27001
---

## Do controle ao programa

Um controle isolado — um gate de pipeline, uma matriz de autorização, um HSM — não é um
**programa** de segurança. Programa é a soma de instrumentos que se complementam: **política**
(o que é exigido, por escrito), **exceção** (com prazo, dono e expiração — marco 13),
**revisão periódica de acesso** (confirmar, em intervalo regular, que cada permissão ativa
ainda faz sentido — *reencontro* direto do marco 06: é aqui que o desprovisionamento via
SCIM que falhou aparece, se ainda não tiver sido pego antes), **pentest** (um terceiro
tentando ativamente invadir, num momento específico) e **bug bounty** (a mesma tentativa,
continuamente, por muitos pesquisadores independentes, remunerados por achado).

O mais útil de entender sobre esses instrumentos não é o que cada um encontra — é **o que
nenhum deles encontra de forma confiável**: **lógica de negócio quebrada** costuma passar
por todos. Um pentest focado em vulnerabilidade técnica pode não perceber que a regra de
negócio "estorno não pode exceder o valor original" nunca foi implementada — porque,
tecnicamente, nenhuma requisição individual está "quebrada"; o sistema simplesmente nunca
teve essa regra. Scanner, pentest e bug bounty são excelentes em achar o que se parece com
falha técnica conhecida; são estruturalmente ruins em achar a regra de negócio que nunca
existiu.

## Mapear controle ↔ exigência regulatória

Uma fintech brasileira responde, tipicamente, a **LGPD**, **PCI-DSS** (quando lida com
dado de cartão — e a **tokenização**, *reencontro* de `dados-distribuidos/13`, **reduz o
escopo de auditoria PCI** ao substituir o PAN real por um token fora do fluxo que
manipula dado sensível), **ISO 27001**, e os requisitos específicos de **BACEN** e do
**Open Finance**. O erro caro é mapear cada exigência isoladamente, com um controle
dedicado a cada uma: **um controle bem desenhado atende vários frameworks ao mesmo
tempo** — MFA robusto, por exemplo, satisfaz requisito de várias normas simultaneamente.
Uma **planilha que duplica esforço**, com uma linha de trabalho separada para "o requisito
X da LGPD" e "o requisito Y do BACEN" quando os dois são satisfeitos pelo mesmo controle,
é sintoma de que o mapeamento controle-para-exigência nunca foi feito de verdade.

## Segurança como requisito não-funcional negociado

Segurança compete por prioridade com toda outra funcionalidade — fingir que ela é
absoluta e inegociável não reflete como decisão de engenharia realmente acontece. O que é
**legítimo**: **aceitar um risco por escrito**, com **dono** e **prazo**, como decisão
consciente de engenharia — uma **ADR de risco aceito**, no mesmo formato das ADRs do
capstone desta trilha (contexto, decisão, alternativas, **gatilho de reversão**). O que
**não é legítimo**: aceitar risco **por omissão** — simplesmente não abordar a questão, e
deixar que a ausência de decisão vire, na prática, a decisão. A diferença entre os dois não
é o resultado (em ambos os casos, o risco permanece); é que o primeiro é **auditável e
revisitável**, e o segundo desaparece até o incidente acontecer.

## Os antipadrões — o fecho da trilha

1. **Segurança por obscuridade.** Esconder como o sistema funciona não é controle — é
   ausência de controle com um disfarce. O dia em que alguém descobre o mecanismo, não
   sobra nenhuma defesa atrás dele.
2. **Criptografia caseira.** Inventar um esquema próprio em vez de usar a primitiva
   revisada do marco 09 — quase sempre quebrado de um jeito que só aparece depois que já
   está em produção.
3. **"É rede interna, não precisa autenticar".** A premissa que qualquer movimento lateral
   — um contêiner comprometido, um funcionário mal-intencionado — derruba inteira.
4. **WAF como único controle.** Um Web Application Firewall filtra padrão conhecido; não
   substitui validação de entrada, autorização no domínio nem nenhum dos controles das
   camadas anteriores.
5. **Token sem expiração, "porque renovar dá trabalho".** Transforma todo vazamento de
   token em um comprometimento permanente, em vez de uma janela limitada.
6. **Permissão ampla "temporária".** A concedida sob pressão de prazo, sem data de
   revogação — que nunca é revisada de novo, e vira permanente por inércia.
7. **Scanner verde como prova de segurança.** "0 vulnerabilidades" no relatório, tratado
   como certificado de segurança — em vez do sinal de escopo mal configurado que
   costuma ser (*reencontro:* marco 12).
8. **Treinamento anual como controle.** Uma palestra assistida uma vez por ano não muda
   comportamento no dia a dia — controle precisa estar no fluxo de trabalho, não num
   evento de calendário.
9. **Segredo rotacionado só quando expira.** Rotação reativa, nunca proativa — o oposto do
   padrão de duas versões válidas do marco 10.
10. **Autorização implementada no frontend.** Esconder um botão não impede a chamada de
    API direta — a decisão de autorização já deveria estar no domínio (marco 08), sempre.
11. **Confiar em claim de IdP federado sem verificar a política dele.** A confiança
    transitiva do marco 06 herdada sem nunca ser checada — `amr`/`acr` existem
    exatamente para essa verificação, e ficam sem uso.
12. **Desligamento que só revoga o crachá.** O acesso físico é cortado; a conta no
    `fin-idp`, no broker e em todo sistema federado continua ativa — o achado de
    auditoria mais comum do marco 06, revisitado aqui como antipadrão nomeado.

E o mais caro de todos, o que resume os outros onze: **o controle que ninguém nunca
testou.** Implementado, talvez até documentado — mas nunca exercitado contra o cenário que
ele existe para impedir. Até ser testado, um controle é uma hipótese, não uma garantia.

## Checklist: aplicação financeira pronta para produção regulada

Uma página, verificável, que fecha a trilha:

- [ ] Toda ameaça do DFD do marco 01 tem controle testado ou ADR de risco aceito, assinado
- [ ] BOLA provado e corrigido em todo endpoint que recebe `id` de recurso no path
- [ ] Nenhum token é aceito sem validar `iss`, `aud`, `exp` e assinatura, com teste
      parametrizado contra tokens maliciosos
- [ ] Pelo menos um fluxo usa token sender-constrained, com teste de rejeição cruzada
- [ ] Autorização decidida por matriz declarada como dado, default-deny, no domínio
- [ ] Logout federado com back-channel funcionando e janela de exposição declarada
- [ ] Segredo de assinatura fora de repositório e de histórico de git, com rotação testada
- [ ] Verificação de webhook resistente a replay e a timing, com comparação constante
- [ ] Endpoint de consulta sem enumeração por diferença de resposta ou de tempo
- [ ] Pipeline com SBOM, assinatura e gate de CVE alcançável, com exceção que expira
- [ ] Quatro gates de secure SDLC ativos, com falso positivo medido e sob controle
- [ ] Step-up authentication por transação, não por sessão, com motivo registrado
- [ ] Trilha de auditoria append-only, sem operador capaz de apagar registro
- [ ] Revisão periódica de acesso ativa, com SCIM cobrindo desprovisionamento
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e gatilho de reversão

## Exemplo numa fintech

Um controle bem mapeado numa fintech real: **autenticação forte de cliente** satisfaz, ao
mesmo tempo, requisito de segurança do Open Finance, controle recomendado por ISO 27001, e
expectativa implícita de qualquer auditoria BACEN — um único investimento de engenharia,
três exigências atendidas. É o oposto de manter uma planilha separada de conformidade para
cada framework, tratando o mesmo controle como três trabalhos distintos.

## Hands-on

**Desafio — matriz controle × exigência regulatória.** Construa, para o `fin-platform`, uma
matriz que cruza cada controle relevante (autenticação forte, criptografia em repouso,
trilha de auditoria, revisão de acesso, e outros) contra as exigências de LGPD, PCI-DSS
(se aplicável), ISO 27001 e BACEN/Open Finance. Para cada célula sem controle
correspondente, registre um risco aceito em ADR, assinado e datado. Antes de preencher a
matriz, releia as dez ameaças **STRIDE** priorizadas no marco 01: cada uma precisa
aparecer aqui, ligada a um controle testado ou a um risco aceito — nenhuma pode
simplesmente desaparecer entre o primeiro marco e o último.

**Invariantes testáveis**

1. Toda ameaça listada no DFD do marco 01 aparece na matriz — com controle testado, ou com
   ADR de risco aceito assinado e datado. Nenhuma das dez fica sem nenhum dos dois.
2. Pelo menos um controle da matriz está mapeado contra mais de uma exigência regulatória
   simultaneamente, comprovando que o mapeamento reduz duplicação em vez de multiplicá-la.
3. Toda ADR de risco aceito segue o formato (contexto, decisão, alternativas, gatilho de
   reversão) — uma ADR sem gatilho de reversão é rejeitada como incompleta.

**Complemento.** Revise a lista de doze antipadrões contra o `fin-platform` como ele está
hoje, honestamente. Para cada antipadrão presente, escreva uma linha: por que ele está ali,
e o que custaria removê-lo.

**Checagem**

1. Por que lógica de negócio quebrada tende a escapar de pentest, bug bounty e scanner ao
   mesmo tempo?
2. Dê um exemplo de controle que satisfaz mais de uma exigência regulatória
   simultaneamente.
3. Qual é a diferença entre aceitar um risco por escrito e aceitar um risco por omissão —
   e por que só o primeiro é legítimo?
4. Por que "o controle que ninguém nunca testou" é considerado o antipadrão mais caro de
   todos?

## Principais aprendizados

- Um programa de segurança é a soma de instrumentos complementares — política, exceção,
  revisão de acesso, pentest, bug bounty — e nenhum deles, sozinho, encontra lógica de
  negócio quebrada de forma confiável.
- Um controle bem desenhado atende várias exigências regulatórias ao mesmo tempo; uma
  planilha que trata cada norma isoladamente é sintoma de mapeamento nunca feito de verdade.
- Aceitar risco por escrito, com dono e prazo, é decisão legítima de engenharia; aceitar
  por omissão é a mesma exposição, sem a auditabilidade.
- Os doze antipadrões desta trilha compartilham uma raiz: controle que parece existir mas
  nunca foi de fato testado contra o cenário que deveria impedir.
- O capstone da trilha revisita o marco 01: toda ameaça listada no primeiro dia precisa
  terminar com controle testado ou risco aceito assinado — não apenas "implementado".

## Capstone

O `fin-idp` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto, e onde a trilha inteira se
fecha revisitando o marco 01.

**Entrega**

- [ ] `fin-idp` de pé (Spring Authorization Server), emitindo e validando token real para
      o `pix-gateway`, com JWKS publicado e rotação testada
- [ ] Keycloak como broker de federação workforce, com back-channel logout funcional
- [ ] mTLS entre `pix-gateway` e `fin-idp`, com token sender-constrained provado
- [ ] Matriz de autorização papel × recurso × ação, declarada como dado, default-deny
- [ ] Verificação de webhook resistente a replay e timing, com comparação constante
- [ ] Procedimento de rotação de segredo documentado para cada tipo de credencial
- [ ] Pipeline com SBOM, assinatura, gate de CVE alcançável e exceção com expiração
- [ ] Step-up authentication por transação disparado por valor e velocidade
- [ ] Log de segurança append-only, com os eventos mínimos e trilha de auditoria distinta
- [ ] Matriz controle × exigência regulatória do `fin-platform`, com ADRs de risco aceito

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] Bateria de 6 tokens maliciosos: 6/6 rejeitados, token legítimo aceito
- [ ] Token sender-constrained com outro certificado válido: rejeitado, e registrado no log
- [ ] Logout no IdP encerra a sessão do RP sem passar por ele; janela de exposição medida
- [ ] BOLA provado e corrigido: cliente A recebe 404 do recurso de B, com teste
- [ ] Toda combinação de autorização não declarada é negada; recurso novo sem política
      quebra o build
- [ ] 1.000 amostras de tempo de resposta não distinguem assinatura válida de inválida
- [ ] Rotação de chave de assinatura cronometrada, zero token em voo invalidado
- [ ] Dependency confusion reproduzido e mitigado, com SBOM listando a versão correta
- [ ] Game day "chave vazada": tempo de detecção até rotação completa medido e registrado
- [ ] Toda ameaça do marco 01 aparece na matriz final com controle testado ou ADR assinado

**Antes de fechar**, rode o game day do `PROJETO.md` que ainda não tiver exercitado e
escreva um post-mortem de uma página — inclusive se nada tiver quebrado. E responda por
escrito à pergunta final da trilha: das dez ameaças que você priorizou no marco 01, qual
foi a mais cara de mitigar de verdade, e o que você faria diferente, na arquitetura,
sabendo o que sabe agora?
