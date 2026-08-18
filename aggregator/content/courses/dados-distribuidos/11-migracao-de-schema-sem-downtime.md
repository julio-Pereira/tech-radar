---
id: migracao-sem-downtime
title: "Migração de schema sem downtime"
summary: "Expand/contract em quatro fases, o DDL que trava a fintech inteira, backfill retomável — e por que este dual-write não contradiz o que a trilha de eventos proíbe. Marco crítico — quiz estendido."
estimatedMinutes: 60
references:
  - title: "PostgreSQL — ALTER TABLE"
    url: https://www.postgresql.org/docs/current/sql-altertable.html
  - title: "PostgreSQL — Explicit Locking"
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - title: "Flyway — Documentation"
    url: https://documentation.red-gate.com/flyway
---

## Expand/contract em quatro fases

A regra que torna a migração possível sem parar: **nenhuma fase quebra a versão anterior da
aplicação**. Cada fase é um deploy independente, reversível sozinho, e vive em produção por
tempo suficiente para você confiar nela.

1. **Expandir.** Adicione o novo — coluna, tabela, índice — de forma compatível. A aplicação
   antiga continua funcionando porque nada do que ela usa mudou. Coluna nova **anulável** e sem
   default caro; constraint depois.
2. **Escrever nos dois.** A aplicação passa a gravar no campo antigo e no novo. A leitura continua
   no antigo. Se algo der errado, o rollback é só voltar o deploy — o dado antigo nunca parou de
   ser atualizado.
3. **Migrar e verificar.** O backfill preenche o novo campo para as linhas antigas, e a
   verificação prova que os dois estão iguais. Esta é a fase em que o tempo é gasto, e é a fase
   que ninguém pode pular.
4. **Ler do novo, e só então remover o antigo.** A leitura muda por feature flag, com o dado
   antigo intacto — o rollback é desligar a flag. A remoção da coluna antiga vem depois, num
   deploy separado, e é a única irreversível.

O erro que produz incidente é juntar fases num deploy só. Expandir e escrever nos dois na mesma
subida é aceitável; ler do novo e remover o antigo junto significa que o rollback precisa de um
restore.

> **Este dual-write não contradiz `arquitetura-eventos/13`.** Lá, o dual-write proibido é o
> permanente: dois sistemas mantidos em sincronia indefinidamente, sem fonte da verdade, com
> divergência garantida. Aqui ele é **temporário**, dentro da mesma transação e do mesmo banco,
> verificado por checksum e com **data de remoção escrita no ADR**. Se a fase 2 durou mais que o
> planejado sem alguém decidir, você está no antipadrão — não por escrever nos dois, mas por não
> ter terminado.

## O DDL que trava a fintech

Todo `ALTER TABLE` precisa de um lock, e a categoria importa mais que a duração. `ACCESS
EXCLUSIVE` — pedido por `ADD COLUMN` com default volátil, `ALTER TYPE`, `DROP COLUMN` — conflita
com **tudo**, inclusive `SELECT`.

E aqui está o detalhe que transforma um DDL de 50 milissegundos numa parada de sete minutos: **a
fila de locks é ordenada**. Se uma transação longa está lendo a tabela, o seu `ALTER` entra na
fila e espera — e **todas as consultas que chegam depois dele esperam também**, mesmo as que só
leem e não conflitariam com nada. Uma migração instantânea, atrás de um relatório de cinco
minutos, para a leitura da tabela por cinco minutos.

A prática obrigatória, então, é sempre a mesma:

```sql
SET lock_timeout = '2s';
ALTER TABLE lancamento ADD COLUMN valor_v2 bigint;
```

Se o lock não vier em dois segundos, o comando falha e a fila não se forma. Você tenta de novo
mais tarde — de preferência num loop com backoff, e depois de olhar `pg_stat_activity` para saber
quem está segurando.

O que o Postgres moderno já faz barato, e vale conhecer para não pedir janela desnecessária:
`ADD COLUMN` anulável ou com default constante é instantâneo; `DROP COLUMN` é instantâneo (só
marca); renomear é instantâneo. O que continua caro: mudar tipo (reescreve a tabela), adicionar
`NOT NULL` (varre a tabela, a menos que exista um `CHECK NOT VALID` já validado), e criar índice —
que tem a saída conhecida:

```sql
CREATE INDEX CONCURRENTLY idx_lancamento_conta ON lancamento (account_id, recorded_at);
```

`CONCURRENTLY` não bloqueia escrita, custa duas varreduras, não roda dentro de transação e pode
falhar deixando um índice **inválido** — que precisa ser dropado e recriado. Vale a pena de todo
jeito.

## Backfill que não derruba nada

Preencher cinco milhões de linhas em produção é uma operação de fundo com quatro requisitos:

**Paginar por chave, nunca por `OFFSET`.** `OFFSET 4000000` faz o banco percorrer quatro milhões
de linhas para descartá-las: o job fica mais lento a cada página, e o total vira quadrático. Guarde
a última chave processada e siga com `WHERE id > :ultimo ORDER BY id LIMIT 1000`.

**Throttle pelo lag de réplica.** Escrever em lote gera WAL, e WAL vira lag (marco 02). O job lê
`pg_last_xact_replay_timestamp` a cada lote e pausa quando o lag passa do limite. Sem isso, o
backfill degrada a leitura de toda a aplicação sem que ninguém relacione as duas coisas.

**Idempotente e retomável.** Ele **vai** ser interrompido — deploy, OOM, alguém cancelando.
Retomar do ponto de parada exige o cursor persistido; ser idempotente exige que reprocessar um
lote produza o mesmo resultado (`WHERE valor_v2 IS NULL` já resolve a maioria dos casos).

**Verificável.** Ao final, uma consulta prova que não sobrou nada e que os valores batem: contagem
de pendentes zerada e **soma de controle** dos dois campos idêntica. Na migração de valor
monetário, a soma é a evidência — se ela bate na origem e no destino, nenhum centavo se perdeu no
caminho.

## Virada de leitura, e a disciplina da migration

A troca da leitura é a fase que assusta, e a feature flag a torna reversível em segundos. Antes
dela, vale a **verificação em sombra**: por um período, leia dos dois, compare, e registre a
divergência sem usá-la. Quando o contador de divergências ficar em zero por tempo suficiente, a
virada é só uma formalidade — e você tem o número para defendê-la.

E a disciplina que `spring-boot/05` já estabeleceu, agora com o peso desta trilha: migration é
**código versionado, revisado e testado**, não comando digitado em produção. Flyway ou Liquibase,
sequencial, aplicada igual em todos os ambientes. Toda migration é reversível ou **explicitamente
irreversível** — e a irreversível exige ADR com o critério de reversão alternativa, que numa
fintech é sempre "restore mais reprocessamento", com o custo estimado antes.

## Exemplo numa fintech

Migrar `valor numeric(15,2)` para `valor_centavos bigint` na tabela de lançamentos — a mudança que
o marco 02 de `arquitetura-eventos` recomendou e que ninguém quer fazer depois de ter 6 bilhões de
linhas.

O roteiro completo:

| Fase | Ação | Verificação antes de seguir |
| --- | --- | --- |
| 1 | `ADD COLUMN valor_centavos bigint` (anulável) | a aplicação antiga não notou nada |
| 2 | gravar nos dois campos, na mesma transação | 100% das linhas novas têm os dois valores consistentes |
| 3 | backfill por partição, com throttle | pendentes = 0 e `sum(valor*100) = sum(valor_centavos)` por partição |
| 3b | leitura em sombra, comparando | zero divergência por 7 dias |
| 4 | virar a flag de leitura | erros e p99 estáveis por 48h |
| 5 | `DROP COLUMN valor` | ADR assinado, backup recente verificado |

A soma de controle **por partição** é o detalhe que faz a diferença: comparar o total geral
esconde erros que se compensam, e a comparação por mês localiza o problema no dia em que ele
apareceu.

O critério de reversão, escrito **antes** de começar: qualquer divergência de soma em qualquer
partição interrompe o processo e mantém a leitura no campo antigo, até a causa ser conhecida.
Não "avaliamos na hora".

## Hands-on

**Tutorial — expand/contract com o serviço no ar.**

1. Suba o `fin-store` com a tabela de lançamentos populada e um serviço lendo e escrevendo nela.
2. Fase 1: `SET lock_timeout` e `ADD COLUMN`. Confirme que o serviço nem percebeu.
3. Fase 2: deploy que escreve nos dois campos. Verifique que toda linha nova tem os dois.
4. Fase 3: backfill paginado por chave, com throttle por lag, cursor persistido.
5. Fase 3b: leitura em sombra com contador de divergências exposto como métrica.
6. Fase 4: vire a flag. Fase 5: `DROP COLUMN`. `git commit` a cada fase, separadamente.

**Desafio — backfill de 5 milhões com prova de idempotência.** Rode o backfill **duas vezes**
inteiras sobre o mesmo conjunto. O teste passa se: o resultado final é idêntico nas duas execuções,
a segunda execução não escreve nada (ou escreve o mesmo valor), o lag de réplica nunca passou do
limite configurado, e a soma de controle bate por partição. Mate o job no meio da primeira execução
e confirme que ele retoma do ponto de parada, sem reprocessar tudo.

**Invariantes testáveis**

1. Nenhuma fase quebra a versão anterior da aplicação — provado subindo a versão antiga contra o
   schema novo.
2. Todo DDL roda com `lock_timeout`; nenhum comando de migração pode formar fila.
3. O backfill é retomável e idempotente: matar e rodar de novo dá o mesmo resultado.
4. A soma de controle bate **por partição**, não só no total.

**Complemento.** Provoque o incidente: abra `BEGIN; SELECT * FROM lancamento LIMIT 1;` e deixe
aberto. Em outra sessão, rode um `ALTER TABLE` sem `lock_timeout`. Numa terceira, tente um
`SELECT` simples — e cronometre quanto tempo ele espera. É a demonstração da fila de locks, e ela
convence qualquer time a adotar `lock_timeout` como padrão.

**Checagem**

1. Quais são as quatro fases do expand/contract, e por que a fase 3 é a que não se pode pular?
2. Por que este dual-write não é o antipadrão que `arquitetura-eventos/13` proíbe?
3. Por que um `ALTER TABLE` instantâneo pode travar a leitura por minutos?
4. Quais são os quatro requisitos de um backfill em produção, e qual erro torna o job quadrático?

## Principais aprendizados

- Expand/contract em quatro fases, cada uma um deploy reversível; juntar fases é o que transforma
  rollback em restore.
- O dual-write da migração é temporário, verificado por checksum e com data de remoção no ADR — é
  isso que o distingue do antipadrão permanente.
- `ACCESS EXCLUSIVE` atrás de uma transação longa forma fila e trava até a leitura: `lock_timeout`
  com retry é obrigatório, e índice se cria com `CONCURRENTLY`.
- Backfill pagina por chave, faz throttle pelo lag, persiste o cursor e prova o resultado com soma
  de controle por partição.
- Migration é código versionado e revisado; a irreversível precisa de ADR com o custo do restore
  estimado antes.
