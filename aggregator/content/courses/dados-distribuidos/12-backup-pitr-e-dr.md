---
id: backup-e-dr
title: "Backup, PITR e DR"
summary: "Backup não testado não é backup: RPO e RTO com número, a falha lógica que réplica nenhuma protege, e o restore cronometrado como artefato de compliance."
estimatedMinutes: 50
references:
  - title: "PostgreSQL — Continuous Archiving and Point-in-Time Recovery"
    url: https://www.postgresql.org/docs/current/continuous-archiving.html
  - title: "pgBackRest — User Guide"
    url: https://pgbackrest.org/user-guide.html
  - title: "AWS Builders' Library — Static stability using Availability Zones"
    url: https://aws.amazon.com/builders-library/static-stability-using-availability-zones/
---

## Backup não testado não é backup

A única métrica que importa é **tempo de restore medido**. "O job rodou verde" prova que um
arquivo foi escrito, não que ele contém um banco íntegro, não que a chave de criptografia ainda
existe, não que alguém sabe o procedimento, e não que ele cabe no tempo que o negócio aceita.

A lista das formas conhecidas de descobrir isso tarde demais é curta e sempre a mesma: o backup
estava corrompido há três meses; o arquivo existia e faltava o WAL para torná-lo consistente; a
chave estava só no cofre que caiu junto; o restore levou onze horas e o SLA prometia duas;
ninguém tinha permissão para executar o procedimento no fim de semana.

Todas se resolvem com um ensaio periódico e cronometrado. Um por trimestre é o mínimo defensável,
e o relatório dele é um artefato de compliance, não um documento interno de curiosidade.

## RPO e RTO com número

**RPO** — quanto dado você aceita perder, em tempo. É a mesma pergunta do modo de replicação
(marco 02), agora publicada como compromisso.

**RTO** — quanto tempo você aceita ficar fora. E ele é maior do que o tempo de restore, porque
inclui o que ninguém cronometra: perceber, decidir, obter aprovação, executar, validar, religar o
tráfego. O restore de 40 minutos dentro de um RTO de 4 horas normalmente esconde três horas de
decisão.

| Sistema do `fin-platform` | RPO | RTO | Consequência de estourar |
| --- | --- | --- | --- |
| Ledger (`fin-store`) | 0 | 1h | dinheiro sem registro; incidente regulatório |
| Projeção de extrato | 24h | 4h | reconstruível a partir do ledger |
| Cache de limite | ∞ | minutos | não tem dado próprio |
| Store analítico | 24h | 24h | relatório atrasado |

A tabela é o exercício inteiro: dizer RPO zero para tudo é o mesmo que não ter RPO, porque o custo
inviabiliza o desenho e o número deixa de ser levado a sério. E a coluna da direita é a que
justifica as outras duas numa conversa com o negócio — cada nove custa (`observabilidade/02`), e o
que se compra com ele precisa estar dito.

> **Reencontro — `kafka/12`.** A mesma pergunta feita ao broker: quantas mensagens você aceita
> perder no failover, e o que acontece com os offsets quando a região volta. Broker e banco têm o
> mesmo vocabulário e a mesma armadilha — o failback é a parte que ninguém ensaia.

## Físico, lógico e PITR

**Backup físico** é a cópia dos arquivos do banco: `pg_basebackup` ou pgBackRest. Restaura rápido,
é o mesmo tamanho do banco, e só serve para a mesma versão maior e a mesma arquitetura. É o
backup do dia a dia.

**Backup lógico** é `pg_dump`: SQL ou formato customizado, portável entre versões, seletivo por
tabela. Lento para restaurar um banco grande — o índice é reconstruído do zero —, e insubstituível
para migrar de versão, subir um ambiente ou recuperar uma tabela só.

**PITR** é o que transforma backup em rede de segurança de verdade. Com um backup base e o
**WAL arquivado continuamente**, você restaura para **qualquer instante** entre o base e agora:

```
restore_command = 'pgbackrest --stanza=fin-store archive-get %f "%p"'
recovery_target_time = '2026-08-18 14:32:00-03'
```

É isso que permite voltar para cinco minutos antes do `DELETE` errado, em vez de perder o dia
inteiro desde o último backup. O preço é operar o arquivamento de WAL — e monitorá-lo, porque
arquivamento parado é backup quebrado que continua reportando verde por dias.

## A falha que a réplica não protege

Réplica protege contra **falha física**: disco, máquina, zona. Ela não protege contra **corrupção
lógica**, porque o erro é replicado com perfeição em milissegundos.

O `UPDATE` sem `WHERE`, o `DELETE` na tabela errada, a migration que zerou uma coluna, o bug que
gravou o valor com escala errada em dez milhões de linhas — nada disso é falha, do ponto de vista
do banco. É uma escrita válida, e todas as réplicas a aplicam obedientemente.

Só PITR ou backup salva. É por isso que "temos três réplicas" **não** é uma resposta para "e se
alguém apagar os dados?", e é por isso que a estratégia precisa das duas coisas.

E há o caso mais desconfortável: a corrupção descoberta **tarde**. Se o valor errado foi gravado
há duas semanas e já foi lido, exportado e usado em fechamento, voltar no tempo joga fora duas
semanas de operação legítima. A resposta então é cirúrgica: restaurar para um banco paralelo,
extrair o estado correto daquelas linhas e aplicar correção como lançamento novo — que é
exatamente por que o ledger é append-only (marco 05).

## DR cross-region e o failback

Replicação assíncrona entre regiões, porque síncrona a 200ms de distância é inviável para o
caminho quente. Isso define o RPO do desastre regional: o lag no instante da queda.

O plano precisa responder, por escrito e antes: quem declara o desastre (um humano nomeado, não
"o time"), quanto dado se aceita perder, como o tráfego é redirecionado, o que fazer com as
transações em voo — e o **failback**, que é a parte que ninguém ensaia e a que costuma dar errado.
Voltar para a região original significa replicar de volta o que foi escrito durante o incidente,
reconciliar (marco 08) o que divergiu, e escolher uma janela para virar. Sem isso escrito, o
sistema fica na região secundária por meses, "porque está funcionando".

O runbook precisa ser executável por quem está de plantão às 3h da manhã, sem contexto do desenho:
comandos exatos, ordem, verificações entre passos, e o critério de abortar.

## Exemplo numa fintech

A exigência regulatória não é "ter backup" — é **demonstrar continuidade**. O que o auditor pede é
evidência: o plano documentado, o teste executado com data e resultado, o RPO e o RTO declarados
com a justificativa de negócio, e o registro de quem participou.

O relatório do ensaio trimestral do `fin-store` é esse artefato, e ele tem cinco linhas que
importam:

1. Data, ambiente e quem executou.
2. O cenário simulado — corrupção lógica, perda de zona, perda de região.
3. **Tempo cronometrado** de cada etapa: perceber, decidir, restaurar, validar, religar.
4. O resultado da validação: contagem de lançamentos, soma de controle e a última transação
   recuperada.
5. O que falhou ou surpreendeu, e a ação corretiva com dono e prazo.

O quinto item é o que separa o ensaio real do teatro. Um ensaio em que nada surpreendeu
normalmente é um ensaio em que nada foi realmente testado.

## Hands-on

**Tutorial — PITR cronometrado.**

1. Configure arquivamento contínuo de WAL no `fin-store` (pgBackRest ou `archive_command` para um
   diretório local).
2. Faça um backup base e confirme que o arquivamento está funcionando — não presuma, verifique
   `pg_stat_archiver`.
3. Gere carga por alguns minutos e anote o horário exato de um ponto seguro.
4. Execute o desastre: `DELETE FROM lancamento WHERE recorded_at > '...'` sem transação, em
   milhares de linhas.
5. **Cronometre a partir daqui.** Restaure para o instante anterior ao `DELETE` num banco novo.
6. Valide: contagem de linhas, soma dos valores, última transação presente. Registre o tempo total
   e o de cada etapa. `git commit` com o runbook e os números.

**Desafio — o runbook de DR do `fin-store`.** Escreva o documento que alguém de plantão consegue
executar sem você: RPO e RTO declarados por sistema com justificativa, quem declara o desastre,
os comandos exatos na ordem, as verificações entre passos, o critério de abortar, e o
procedimento de **failback**. Ao final, o resultado real do ensaio que você acabou de fazer —
inclusive o que deu errado.

**Invariantes testáveis**

1. O restore foi executado e cronometrado, e o tempo medido cabe no RTO declarado.
2. A validação pós-restore compara contagem e soma de controle, não só "o banco subiu".
3. O arquivamento de WAL tem monitoramento: uma falha nele dispara alerta em minutos, não em dias.
4. O runbook foi executado por alguém que não o escreveu — se ninguém mais consegue, ele não está
   pronto.

**Complemento.** Meça o RTO honesto: cronometre também o tempo entre o `DELETE` e alguém
**perceber**. Se a detecção depende de um cliente reclamar, esse tempo é parte do seu RTO e
provavelmente é a maior parcela dele.

**Checagem**

1. Por que "o job de backup rodou verde" não é evidência de nada?
2. O que o RTO inclui além do tempo de restore, e por que ele costuma ser subestimado?
3. Por que réplica não protege contra `UPDATE` sem `WHERE`, e o que protege?
4. O que torna o failback a parte mais arriscada do DR?

## Principais aprendizados

- A única métrica de backup que importa é tempo de restore medido; o relatório do ensaio trimestral
  é o artefato de compliance.
- RPO e RTO são por sistema, com número e consequência escrita — RPO zero para tudo é o mesmo que
  não ter RPO.
- PITR com WAL arquivado permite voltar a qualquer instante; arquivamento parado é backup quebrado
  reportando verde.
- Réplica não protege contra corrupção lógica: ela replica o erro com perfeição, e só PITR ou
  backup salva.
- Failback é a parte não ensaiada do DR — sem plano escrito, o sistema fica na região secundária
  por meses.
