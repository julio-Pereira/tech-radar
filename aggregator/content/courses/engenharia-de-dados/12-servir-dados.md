---
id: servir-dados
title: "Servir dados"
summary: "Consumir dado é uma interface com contrato, custo e permissão — não um acesso ao banco. Camada semântica, contrato de consumo versionado, e consentimento como a única porta."
estimatedMinutes: 60
references:
  - title: "Data Contract Specification"
    url: https://datacontract.com/
---

## O problema que a camada semântica resolve

Três times calculam "ticket médio" de três jeitos — um inclui transações pendentes, outro não; um
usa o valor bruto, outro desconta estorno. Nenhum está "errado" isoladamente, mas os três números
não batem, e uma reunião de alinhamento inteira se perde tentando entender por quê. A **camada
semântica** (ou camada de métricas) resolve isso definindo cada métrica de negócio **uma vez**,
numa única definição versionada, servida por qualquer porta de acesso — SQL direto, API, extração
— sempre com o mesmo resultado, porque é a mesma definição por trás de todas.

## Tabela ouro como produto

Tratar uma tabela ouro como **produto** significa: ela tem um dono, uma definição documentada, um
contrato que declara o que consumidores podem esperar, e um processo formal para mudar — não é
"o SQL que o time de dados escreveu e que todo mundo aprendeu a usar por convenção informal". Essa
mudança de postura é o que torna possível o resto deste marco.

## API de dados × consulta direta × extração

**API de dados**: uma interface explícita (REST, GraphQL, ou uma camada de métricas consultável)
que esconde a estrutura física da tabela por trás de um contrato estável. **Consulta direta**:
acesso SQL à tabela — mais flexível, mais acoplado à estrutura física (uma mudança de schema quebra
quem consulta direto, sem aviso). **Extração**: um snapshot periódico exportado para outro sistema
— útil para integração com ferramentas que não falam SQL, caro de manter sincronizado. A escolha
entre os três depende de quão estável a interface precisa ser e de quanto controle sobre o acesso o
provedor precisa manter.

## Contrato de consumo, e quebrar o CI por design

O **contrato de consumo** declara o schema que uma tabela ouro promete manter — as mesmas ideias de
*breaking change* de `system-design/05`, aqui aplicadas a uma tabela em vez de uma API HTTP.
Remover ou mudar o tipo de uma coluna que o contrato promete **quebra o CI**, não silenciosamente
em produção: o objetivo é que uma mudança incompatível seja pega **antes** do deploy, pelo processo
automatizado, não **depois**, por um consumidor que descobre o problema olhando um painel errado.

## Cotas, custo por consumidor, cache e materialização

Nem todo consumo deveria ser ilimitado: uma **cota** por consumidor evita que uma consulta ad-hoc
mal escrita de um time consuma recurso suficiente para degradar a experiência de todos os outros —
o mesmo *noisy neighbor* de `system-design/06`, aqui entre consumidores de dado em vez de clientes
de API. **Custo por consumidor** é visibilidade: quem gasta o quê, para que a decisão de otimizar
uma consulta cara tenha dono e justificativa. **Cache** e **materialização** aceleram consultas
repetidas — com o mesmo cuidado do marco 09 de `system-design`: cache de dado sob consentimento
precisa respeitar a mesma política de revogação da fonte, nunca servir uma versão desatualizada que
já deveria ter esquecido alguém.

## Consentimento no consumo: `dado_utilizavel` é a única porta

A visão `dado_utilizavel`, construída no marco 03, não é uma conveniência opcional — é a **única**
porta pela qual qualquer consumidor, incluindo o pipeline de ML de `ml-em-producao`, está
autorizado a ler. Uma tentativa de acesso direto ao bruto, contornando essa visão, precisa ser
**negada** pelo controle de acesso, não apenas desencorajada por convenção. Sem essa garantia
técnica, toda a arquitetura de consentimento das camadas anteriores vale só enquanto todo mundo
seguir a convenção voluntariamente — o que uma auditoria nunca aceita como suficiente.

> **Reencontro — `dados-distribuidos/14`; `system-design/05` e `/06`.** "Ninguém consome bronze
> para decisão" já foi a disciplina daquele marco — aqui ela vira **imposição técnica**: o acesso
> direto ao bruto é negado, não só desaconselhado. Contrato de consumo e cota são os mesmos
> conceitos de *breaking change* e gestão de API de `system-design`, aplicados a uma tabela de
> dado em vez de um endpoint HTTP.

## Exemplo numa fintech

O pipeline de features de `ml-em-producao` precisa de "gasto médio dos últimos 90 dias por conta".
Se ele calculasse isso direto do bruto, herdaria qualquer inconsistência de definição que os times
de análise e de risco já tiveram entre si. Consumindo da camada semântica — a mesma definição que
qualquer outro consumidor usa — o modelo de oferta usa exatamente o mesmo "gasto médio" que o
painel de risco mostra para um analista humano, sem nenhuma chance de divergência silenciosa entre
os dois.

## Hands-on

**Tutorial.** Defina três métricas de negócio uma única vez na camada semântica, e sirva-as por
duas portas diferentes (consulta direta e uma API simples).

**Desafio.** Implemente o contrato de consumo com detecção de quebra, e a restrição de acesso que
só permite leitura via `dado_utilizavel`.

**Invariantes testáveis**

1. Mudar ou remover uma coluna ouro que o contrato de consumo promete **quebra o CI**, não passa
   silenciosamente.
2. Uma tentativa de consulta direta ao **bruto** (contornando `dado_utilizavel`) é **negada** pelo
   controle de acesso — testado como tentativa explícita, não como ausência de documentação.
3. A cota por consumidor, uma vez excedida num teste simulado, é **respeitada** — a consulta
   adicional é rejeitada ou enfileirada, conforme a política.
4. A mesma métrica de negócio (definida uma vez na camada semântica) dá **o mesmo número** quando
   consultada pelas duas portas de acesso diferentes.

**Complemento.** Estime o custo por consumidor sobre um período simulado, identificando qual
consulta é a mais cara e por quê.

**Checagem**

1. O que a camada semântica resolve que três times calculando "ticket médio" de três jeitos
   diferentes não resolve sozinho?
2. Por que o contrato de consumo deveria quebrar o CI em vez de só documentar o schema esperado?
3. Qual é a diferença entre API de dados, consulta direta e extração, e o que decide qual usar?
4. Por que `dado_utilizavel` precisa ser **tecnicamente** a única porta de consumo, e não apenas
   uma convenção que todo mundo segue?

## Principais aprendizados

- Camada semântica define cada métrica de negócio uma única vez, servida por qualquer porta de
  acesso — o antídoto para três times calculando a mesma métrica de três jeitos diferentes.
- Tratar a tabela ouro como produto (dono, contrato, processo de mudança) é o que torna possível
  qualquer uma das outras garantias deste marco.
- Contrato de consumo quebra o CI quando uma mudança incompatível é introduzida — pego antes do
  deploy, não depois, por um consumidor olhando um painel errado.
- Cota e custo por consumidor existem pelo mesmo motivo que isolamento entre clientes de API:
  evitar que um consumidor mal comportado degrade a experiência de todos os outros.
- `dado_utilizavel` precisa ser imposição técnica, não convenção — uma auditoria nunca aceita
  "todo mundo segue a regra por acordo" como garantia suficiente.
