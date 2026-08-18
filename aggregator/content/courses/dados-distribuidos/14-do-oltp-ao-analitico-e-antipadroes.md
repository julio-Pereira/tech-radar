---
id: analitico-e-antipadroes
title: "Do OLTP ao analítico — e os antipadrões"
summary: "CDC como a ponte correta, data contract e freshness como SLO, os oito antipadrões de camada de dados, e o checklist de uma página que fecha a trilha."
estimatedMinutes: 55
references:
  - title: "Debezium — Documentation"
    url: https://debezium.io/documentation/
  - title: "PostgreSQL — Logical Decoding Concepts"
    url: https://www.postgresql.org/docs/current/logicaldecoding-explanation.html
  - title: "dbt — What is a data contract?"
    url: https://docs.getdbt.com/docs/collaborate/govern/model-contracts
---

## CDC é a ponte correta

O banco transacional não deve ser fonte de query analítica. Ele **emite** mudança, e quem quiser
analisar consome o fluxo.

**Change Data Capture** lê o log de replicação — no Postgres, decodificação lógica do WAL — e
publica cada `INSERT`, `UPDATE` e `DELETE` como evento. Debezium é a implementação de referência,
e o que ele entrega tem três vantagens sobre a alternativa ingênua:

| | `SELECT ... WHERE updated_at > :ultimo` | CDC |
| --- | --- | --- |
| Deleções | invisíveis | capturadas |
| Escritas concorrentes | perdidas na borda da janela | capturadas na ordem do commit |
| Carga no banco | uma varredura periódica | leitura do WAL, sem tocar as tabelas |
| Ordem | por timestamp — e o marco 01 explicou o problema | ordem de commit, confiável |

O que o CDC cobra é operacional e precisa ser sabido: o **slot de replicação retém WAL** enquanto o
consumidor não avança. Consumidor parado num fim de semana significa disco do primário enchendo —
e disco cheio no Postgres é banco parado. Alerta no lag do slot é obrigatório, não opcional.

> **Reencontro — `kafka/08` e `/11`.** Ali o CDC apareceu como fonte de eventos e o Connect como o
> mecanismo. Aqui ele é a fronteira entre o transacional e o analítico — e a mesma preocupação com
> o slot vale nos dois casos.

## ETL, ELT e as camadas

**ETL** transforma antes de carregar; **ELT** carrega cru e transforma dentro do destino, que é o
padrão desde que armazenamento ficou barato e o warehouse ficou capaz. O ganho do ELT é
reprocessar: se a regra de transformação estava errada, o dado bruto ainda está lá.

As camadas que organizam isso são sempre as mesmas, com nomes que variam:

- **Bronze** — o dado como chegou, imutável, com metadado de origem e horário de ingestão.
- **Prata** — limpo, tipado, deduplicado, com as chaves de negócio resolvidas.
- **Ouro** — modelado para consumo: agregações, métricas, tabelas que a área de negócio entende.

A disciplina que evita o pântano: **ninguém consome bronze diretamente para decisão**. Bronze é
matéria-prima e histórico de reprocessamento; se um relatório de diretoria lê bronze, a camada
prata não está fazendo o trabalho dela.

## Data contract e freshness

O consumo analítico precisa do mesmo rigor do contrato de evento de `arquitetura-eventos/05`,
aplicado a tabela: schema declarado, semântica de cada campo, política de evolução, dono nomeado e
SLO. É isso que um **data contract** é — e a sua ausência produz o incidente mais chato do
analítico, aquele em que uma refatoração inocente no transacional quebra silenciosamente um painel
que a diretoria olha há dois anos.

Um contrato mínimo declara: as colunas e tipos, o que é chave, o que pode ser nulo, a granularidade
de cada linha, a política de mudança (compatível sempre; incompatível exige versão), o dono, e o
**SLO de freshness**.

**Freshness é o SLO do analítico**: o atraso máximo aceitável entre o fato acontecer e ele estar
disponível no destino. Ele precisa de número, dono e alerta — exatamente como qualquer outro SLO
(`observabilidade/12`). "O dashboard está atrasado" no Slack não é um sinal; é o sintoma de não
existir sinal.

E o corolário que quase sempre é esquecido: freshness diferente por caso de uso. O painel de fraude
precisa de minutos; o relatório regulatório mensal precisa de horas; e prometer minutos para tudo
custa caro sem beneficiar ninguém.

## Custo, que é o assunto que ninguém levanta

Três desperdícios recorrentes, e todos têm a mesma correção — alguém olhando o número:

**O relatório que ninguém abre.** Roda de hora em hora há seis meses, consumindo cluster e
storage, para um painel que teve três acessos no trimestre. A correção é telemetria de uso do
próprio analítico: sem saber quem consome o quê, não dá para desligar nada com segurança.

**Retenção sem classe.** Guardar tudo para sempre no store quente é caro e desnecessário. A
retenção é por classe de dado: o transacional recente fica quente, o histórico regulatório vai para
storage frio, e o dado de apoio expira. É a mesma lógica de tiered storage de `kafka/11` e `/12`, e
o mesmo raciocínio de custo e cardinalidade de `observabilidade/16`.

**Query analítica ad-hoc sem limite.** Um `SELECT *` num warehouse por consumo pode custar mais que
o servidor do mês. Limite por usuário, alerta por consulta cara, e revisão do que virou rotina.

## Os antipadrões — o fecho da trilha

1. **Banco compartilhado entre serviços.** Dois serviços escrevendo nas mesmas tabelas é o
   acoplamento mais forte que existe: ninguém pode mudar o schema, ninguém sabe quem lê o quê, e a
   fronteira de contexto (`arquitetura-eventos/02`) não existe. Integração é por contrato — API ou
   evento — nunca por tabela.
2. **N+1 do ORM em produção.** A tela que carrega 200 lançamentos e faz 201 queries. Não é problema
   de banco; é falta de `EXPLAIN` e de teste que conte queries.
3. **Sharding prematuro.** A escada do marco 03 pulada por "escala", pagando complexidade
   irreversível antes de esgotar o índice, a réplica e o particionamento.
4. **Cache sem invalidação nem plano de falha.** O do marco 09: se o sistema cai quando o cache
   cai, ele não é cache.
5. **`SELECT *` em tabela larga.** Traz colunas que ninguém usa, inviabiliza index-only scan e
   quebra quando alguém adiciona uma coluna.
6. **Um índice para cada query nova.** Cada índice é imposto por `INSERT` (marco 05); a tabela com
   doze índices é sempre uma tabela em que ninguém removeu nada.
7. **Migration irreversível sem ADR.** A alteração que só volta com restore, aplicada sem que
   ninguém tenha escrito o custo desse restore.
8. **"O banco aguenta".** A frase que precede todo incidente de capacidade — dita sem número, sobre
   um sistema que ninguém mediu.

## Checklist: camada de dados pronta para produção regulada

Uma página, verificável, que fecha a trilha:

- [ ] Toda invariante de dinheiro é garantida por constraint, lock ou isolamento — não por `if`
- [ ] O modelo de falha e a fonte de ordem estão escritos; nada ordena por relógio de dois hosts
- [ ] RPO e RTO declarados por sistema, com restore cronometrado no último trimestre
- [ ] Réplicas monitoradas por lag, com limiar igual ao número declarado
- [ ] Nenhuma decisão de autorização lê dado sem garantia de recência
- [ ] Toda query do caminho quente tem `EXPLAIN` registrado e índice que a serve
- [ ] Alertas de transação mais antiga, `n_dead_tup` e `age(datfrozenxid)` ativos
- [ ] Toda migração segue expand/contract, com `lock_timeout` e backfill retomável
- [ ] Reconciliação automatizada, com ação definida por classe de divergência
- [ ] Cache com TTL declarado, plano de degradação, e nenhum dado contábil servido dele
- [ ] Classificação de dado por coluna, versionada; nenhum PII real fora de produção
- [ ] Acesso a dado pessoal auditado, com acesso humano temporário e aprovado
- [ ] Data contract e SLO de freshness para todo consumo analítico
- [ ] Uma ADR por decisão estrutural, cada uma com **gatilho de reversão**

## Exemplo numa fintech

O fecho volta ao marco 04, e a pergunta é direta: **quais invariantes do `fin-platform` são
transacionais, e o schema realmente as garante?**

| Invariante | Deveria ser | O schema garante? |
| --- | --- | --- |
| A soma dos lançamentos de uma transação é zero | transacional | só se houver constraint ou trigger — verifique |
| O saldo disponível não fica negativo | transacional | `CHECK` no saldo materializado, ou o lock do marco 04 |
| Não há dois lançamentos com a mesma chave de idempotência | transacional | `UNIQUE (accountId, idempotencyKey)` |
| O extrato mostra o pagamento | eventual | projeção, com janela declarada |
| A posição consolidada bate com a soma das contas | eventual | reconciliação, com ação por divergência |

O exercício honesto é ir ao schema real e conferir linha por linha. Na maioria dos sistemas, pelo
menos uma invariante que todo mundo jura ser garantida está protegida apenas por um `if` numa
classe de serviço — e é essa que aparece no fechamento do mês.

## Hands-on

**Desafio — CDC com data contract e SLO.** Construa a ponte do `fin-store` para o analítico:

1. Configure decodificação lógica e um conector CDC da tabela de lançamentos para um destino
   (arquivo, tópico ou store analítico — o destino importa menos que o fluxo).
2. Escreva o **data contract** do que você publica: schema, chave, granularidade, nulabilidade,
   política de evolução, dono e SLO de freshness com número.
3. Instrumente a freshness: meça o atraso entre `recordedAt` e a chegada ao destino, publique como
   métrica e configure o alerta no limiar declarado.
4. Provoque a falha: **pare o consumidor por 30 minutos** e observe o slot retendo WAL. Registre o
   crescimento e defina o alerta que teria avisado antes de o disco encher.
5. Rode o checklist da seção anterior contra o seu `fin-store` e escreva o que ainda está vermelho.

**Invariantes testáveis**

1. Uma deleção no transacional aparece no destino — o que a alternativa por `updated_at` não faria.
2. A freshness medida está dentro do SLO declarado, e o alerta dispara quando não está.
3. O lag do slot de replicação tem alerta antes de o disco entrar em risco.
4. Uma mudança incompatível no schema da tabela quebra o pipeline **no CI**, não em produção.

**Complemento.** Compare os dois caminhos: implemente também a captura por
`WHERE updated_at > :ultimo` e rode as duas em paralelo por uma hora, com deleções e updates
concorrentes acontecendo. Conte as diferenças. O número de eventos que a versão ingênua perde é o
argumento que encerra a discussão.

**Checagem**

1. Por que CDC captura o que a consulta por `updated_at` perde, e o que ele cobra em troca?
2. O que um data contract declara, e qual incidente ele previne?
3. Por que freshness precisa ser diferente por caso de uso?
4. Escolha três dos oito antipadrões e diga qual marco da trilha oferece a correção de cada um.

## Capstone

O `fin-store` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] Os três documentos do bloco de teoria: `ORDEM.md`, `REPLICACAO.md` e `SHARDING.md`
- [ ] Schema do ledger com a invariante de saldo garantida por constraint, lock ou isolamento
- [ ] Tabela de lançamentos particionada por mês, com pruning provado no `EXPLAIN`
- [ ] `STORES.md` com as queries mapeadas e a defesa do menor número de stores
- [ ] Job de reconciliação D+1, com classificação e ação por classe de divergência
- [ ] Cache-aside do limite com jitter, single-flight e plano de degradação
- [ ] Expand/contract completo executado com o serviço no ar, com backfill retomável
- [ ] Runbook de DR, com RPO/RTO declarados e o resultado do ensaio cronometrado
- [ ] Pipeline de anonimização com teste de injeção de PII
- [ ] CDC para o analítico, com data contract e SLO de freshness

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] 50 threads concorrentes: o saldo nunca fica negativo e nenhum débito se perde ou duplica
- [ ] Matar o leader sob carga perde no máximo o RPO declarado — medido, não estimado
- [ ] A consulta de extrato toca uma partição, e o `EXPLAIN` está registrado
- [ ] O job de reconciliação detecta as quatro classes de divergência injetadas
- [ ] 200 requisições concorrentes em miss geram uma query ao banco, não duzentas
- [ ] Com o cache fora, o sistema responde de forma degradada definida
- [ ] O backfill rodado duas vezes dá o mesmo resultado, e retoma depois de morto no meio
- [ ] A soma de controle bate por partição antes e depois da migração de coluna monetária
- [ ] O PITR restaura para o instante anterior ao `DELETE`, dentro do RTO declarado
- [ ] O teste de injeção de PII falha se um CPF real atravessar o pipeline
- [ ] Uma mudança incompatível de schema quebra o pipeline analítico no CI
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: das
quatorze decisões que você tomou aqui, qual é a mais cara de reverter, e o que você faria
diferente sabendo o que sabe agora?

## Principais aprendizados

- O transacional emite mudança via CDC; a consulta por `updated_at` perde deleções e escritas
  concorrentes, e o slot de replicação exige alerta próprio.
- ELT com bronze/prata/ouro permite reprocessar — e ninguém consome bronze para decisão.
- Data contract é o contrato de evento aplicado a tabela, e freshness é o SLO do analítico, com
  número, dono e alerta por caso de uso.
- Custo se controla com telemetria de uso, retenção por classe de dado e limite em query ad-hoc.
- Os oito antipadrões têm um denominador comum: uma decisão de dados tomada sem número — e o
  checklist de uma página é o antídoto verificável.
