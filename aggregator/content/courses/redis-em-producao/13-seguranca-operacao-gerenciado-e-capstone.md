---
id: seguranca-operacao-gerenciado-e-capstone
title: "Segurança, operação, gerenciado e capstone"
summary: "Redis exposto sem autenticação ainda é uma das portas de entrada mais comuns da internet; e Redis sem métrica de memória, latência e replicação é um incidente marcado. Modo protegido e bind; ACL por serviço; TLS e mTLS; comandos perigosos; dado sensível e LGPD; INFO, LATENCY, SLOWLOG e alertas como código; ElastiCache, MemoryDB e Azure Managed Redis, e o que o gerenciado não resolve; Redis × Valkey; e o capstone. Medido nos dois motores: a imagem oficial sobe com o modo protegido desligado e escutando em todas as interfaces; a ACL recusou ao pix-gateway as chaves do antifraude, FLUSHALL, CONFIG e KEYS; e cada um dos seis alertas disparou no seu cenário."
estimatedMinutes: 75
reviewedAt: 2026-11-23
reviewEvery: 6m
competencies: [seguranca, plataforma]
references:
  - title: "Redis — Security"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/security/
  - title: "Redis — ACL"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/
  - title: "Valkey — Security"
    url: https://valkey.io/topics/security/
  - title: "redis_exporter"
    url: https://github.com/oliver006/redis_exporter
---

## A porta aberta

O servidor, compilado do código-fonte, sobe com o **modo protegido** ligado (`protected-mode yes`): sem senha
configurada, ele só aceita conexão do *loopback*. As **imagens oficiais** dos dois motores mudam isso. No laboratório,
`redis:8.10.3` e `valkey/valkey:9.1.4`, iniciadas sem arquivo de configuração, responderam `protected-mode no` e
`bind * -::*`: escutando em todas as interfaces, sem senha, com o usuário `default` liberado para tudo.

Isso é razoável num contêiner de desenvolvimento e um desastre em qualquer rede que alguém mais alcance. Um Redis
aberto deixa ler tudo, apagar tudo e mudar a configuração em execução. O ataque clássico, de apontar `CONFIG SET dir` e
`dbfilename` para um diretório do sistema e gravar um arquivo lá, está fechado por padrão desde o 7.0: `dir` e
`dbfilename` são configurações protegidas, e o laboratório recebeu `can't set protected config` nos dois motores. O
resto continua aberto. O endurecimento começa por **não usar a configuração padrão da imagem em produção**.

> **Armadilha.** Usuário `default` sem senha "porque está numa rede privada". A rede privada continua privada até
> alguém publicar um serviço na mesma VNet, abrir um *peering* ou colocar um *pod* de depuração no mesmo *namespace*. O
> `default` desligado, com um usuário por serviço, não depende de ninguém acertar a topologia de rede.

## ACL: um usuário por serviço

A **ACL** (Redis 6+ e Valkey) define, por usuário, a senha, os comandos (`+@read`, `-@dangerous`, `-keys`), os padrões
de chave (`~pix:*`) e os canais de Pub/Sub. A regra é o menor privilégio por serviço:

```
ACL SETUSER pix-gateway on >${SENHA} resetkeys ~pix:* ~ofb:sess:* resetchannels
    -@all +@read +@write +@scripting +@connection -@dangerous -keys
ACL SETUSER antifraude  on >${SENHA} resetkeys ~af:* resetchannels
    -@all +@read +@write +@scripting +@connection -@dangerous -keys
ACL SETUSER default off
```

No laboratório, nos dois motores, o usuário `pix-gateway` gravou `pix:lim:c1` e recebeu `NOPERM` em:

- `GET af:vel:chave-1`, uma chave do antifraude;
- `FLUSHALL`;
- `CONFIG GET maxmemory`;
- `KEYS pix:*`.

Uma conexão sem usuário, com o `default` desligado, foi recusada. A ACL vale também dentro dos scripts: um script
chamado pelo `pix-gateway` não toca uma chave fora de `~pix:*`, e esse é mais um motivo para as chaves entrarem por
`KEYS[]` (marco 04).

Algumas portas já vêm fechadas pelo servidor. `enable-debug-command`, `enable-module-command` e
`enable-protected-configs` são `no` por padrão nos dois motores: o `DEBUG` foi recusado antes mesmo da ACL, no
laboratório. O antigo `rename-command` continua existindo, e a ACL o substitui com vantagem, porque é por usuário e
auditável (`ACL LOG`).

> **Diferença Redis × Valkey.** Quem não usa script pode tirar o Lua da ACL (`-@scripting`) nos dois motores. No
> Valkey 9.1, o motor Lua é um módulo (marco 04), e um *build* sem ele (`BUILD_LUA=no`) não tem `EVAL` nenhum. No Redis
> 8.10, o Lua faz parte do servidor, e a ACL é a única forma de fechá-lo.

## TLS e mTLS

A senha da ACL viaja em claro sem TLS. Os dois motores, nas imagens oficiais, sobem com TLS: `--tls-port 6379 --port 0`
desliga a porta em claro, e `--tls-auth-clients yes` exige certificado de cliente (mTLS). No laboratório, com uma CA de
teste, nos dois motores:

| Tentativa | Resultado |
| --- | --- |
| conexão sem TLS | recusada (`EOF`) |
| TLS sem certificado de cliente | recusada (`tls: certificate required`) |
| TLS com certificado, cliente que não confia na CA | recusada (`certificate signed by unknown authority`) |
| mTLS com o certificado de cliente | aceita |

O cliente confia **só** na CA do Redis, configurada no `TLSConfig` do go-redis ou no `SslOptions` do Lettuce, e nunca
desliga a verificação. A rotação de certificado é a de `seguranca-aplicacao/10`.

## Dado sensível e LGPD

O Redis não é lugar de dado pessoal em claro. O dado aparece no `MONITOR`, no `SLOWLOG`, nos *dumps* de memória, nos
RDB copiados para depuração e nas ferramentas de análise. A regra do `fin-kv`:

- **nome de chave** nunca tem CPF, e-mail ou *token* (marco 02). Vai um identificador interno;
- **valor**, quando precisa identificar a pessoa, leva o HMAC do CPF com uma chave da aplicação (`seguranca-aplicacao/09`),
  e não o CPF;
- **TTL** em todo dado pessoal que estiver no Redis, como efêmero do mapa de estado.

Um teste varre o *dataset* com `SCAN`, lê chaves, valores e campos de *hash*, e procura CPF **válido** (com os dígitos
verificadores conferidos, para não confundir com qualquer número de 11 dígitos). No laboratório, nos dois motores, o
*dataset* de 4 mil chaves passou limpo, e uma sessão com o CPF num campo de observação foi encontrada.

## Operação: o que olhar e o que alertar

Os instrumentos do servidor:

- `INFO` (O(1)), por seção: `memory` (`used_memory`, `maxmemory`, `mem_fragmentation_ratio`), `replication` (papel,
  réplicas, atraso), `persistence` (`rdb_last_bgsave_status`, `aof_last_write_status`, `aof_delayed_fsync`), `stats`
  (`evicted_keys`, `rejected_connections`);
- `SLOWLOG` e `LATENCY DOCTOR` (marco 01);
- *keyspace notifications* (`notify-keyspace-events`), com parcimônia: cada evento é uma mensagem de Pub/Sub, sem
  garantia de entrega (marco 08).

O `redis_exporter` (v1.97.0 no laboratório) publica essas seções como métricas Prometheus. O `fin-kv` tem os alertas
**como código** (`lab/alertas/redis.rules.yml`), com nomes de métrica conferidos contra o *exporter* em execução:

| Alerta | Expressão | Por quê |
| --- | --- | --- |
| `RedisFora` | `redis_up == 0` por 1 min | o *exporter* não alcança a instância |
| `RedisMemoriaAlta` | `used / max > 0,85` por 5 min | o `fork` do *save* precisa de margem (marco 09) |
| `RedisEstadoDespejou` | `increase(redis_evicted_keys_total{papel="estado"}[5m]) > 0` | a instância de estado nunca despeja |
| `RedisReplicaAtrasada` | `redis_connected_slave_lag_seconds > 2` por 1 min | o `min-replicas-max-lag` do marco 10 |
| `RedisRecusandoConexoes` | `increase(redis_rejected_connections_total[5m]) > 0` | `maxclients`, quase sempre um *pool* sem limite |
| `RedisPersistenciaFalhou` | `rdb_last_bgsave_status == 0` ou `aof_last_write_status == 0` | o disco encheu ou falhou |

O `promtool test rules` (Prometheus v3.16.0) prova cada alerta com séries sintéticas: cada um dispara no seu cenário e
fica quieto no saudável. O despejo na instância de cache, que é o comportamento esperado dela, não alerta. É o mesmo
princípio de `observabilidade/12`: o alerta é sobre o que quebra uma garantia, e não sobre todo número que se mexe.

O ***upgrade* sem *downtime*** segue a ordem da replicação: atualizar as réplicas, promover uma (com Sentinel,
`SENTINEL FAILOVER`), atualizar o primário antigo como réplica. O cliente que segue a topologia (marco 12) não percebe
mais que o *failover*.

## Gerenciado: o que resolve e o que não resolve

Os serviços gerenciados, conferidos na documentação oficial na Fase 0 desta trilha (19 nov 2026):

- **Amazon ElastiCache:** Valkey, Memcached e Redis OSS até a 7.1. Não oferece Redis 8. Com Valkey 9.0+ em nós
  provisionados, tem um modo de durabilidade: escrita síncrona sem perda, ou assíncrona com até 10 s em risco;
- **Amazon MemoryDB:** durável por desenho, com *log* multi-AZ, e a opção para multirregião;
- **Azure:** o Azure Cache for Redis se aposenta (Enterprise em 31 mar 2027; Basic, Standard e Premium em 30 set 2028),
  e o sucessor é o **Azure Managed Redis**.

O gerenciado resolve *failover*, *patch*, *backup*, TLS e a operação dos nós. Ele **não** resolve:

- a política de *eviction* errada, nem cache e estado na mesma instância (marco 09);
- o desenho de chave, a *hash tag* e o *slot* quente (marcos 02 e 11);
- o *timeout*, o retry e a topologia do cliente (marco 12);
- a replicação assíncrona: o modo assíncrono do ElastiCache admite até 10 s de perda, e o *failover* gerenciado perde o
  que o primário não tinha replicado (marco 10).

## Redis × Valkey

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| licença | RSALv2, SSPLv1 ou AGPLv3, à escolha | BSD-3 |
| governança | Redis Ltd. | Linux Foundation |
| comandos só dele, nesta trilha | `INCREX`, `DELEX`, `HOTKEYS`, `XACKDEL`, `XNACK`, `IDMP`, políticas `lrm`, Cuckoo, Count-Min Sketch e Top-K | `DELIFEQ`, `COMMANDLOG`, `cluster-databases`, `CLUSTERSCAN` |
| compatibilidade | — | informa `redis_version:7.2.4` e fala o mesmo protocolo |
| gerenciado | Redis Cloud e Azure Managed Redis | ElastiCache, MemoryDB e outros |

A escolha é um ADR, e o critério não é a moda. A AGPLv3 tem obrigações para quem modifica e oferece o serviço em rede;
para quem só usa o binário, a decisão costuma ser de gerenciado e de comandos. O `fin-kv` é escrito para rodar nos dois:
toda a suíte desta trilha passa contra os dois motores, e cada comando exclusivo tem uma alternativa que funciona nos
dois (script no lugar de `INCREX` e de `DELEX`).

## Exemplo numa fintech

A auditoria de segurança do `fin-platform` encontrou o `kv-estado` com a configuração da imagem: sem senha, escutando em
todas as interfaces, numa sub-rede que também tinha o *pod* de um parceiro em homologação. Nada tinha sido explorado. Mas
qualquer processo naquela sub-rede podia ler as reservas de idempotência e os limites, e apagar os dois.

A correção em uma semana:

1. o `default` desligado, com um usuário ACL por serviço e menor privilégio por prefixo;
2. TLS com mTLS, com a CA do Redis só no *truststore* dos serviços que falam com ele;
3. o CPF que aparecia em campos de observação das sessões trocado por HMAC, e a varredura no CI;
4. os seis alertas como código, testados com `promtool`;
5. o ADR do gerenciado: ElastiCache para Valkey em *cluster*, com o modo de durabilidade síncrono no `kv-estado`, e as
   limitações escritas.

## Hands-on

**Tutorial.** Suba o `kv-estado` com a porta em claro desligada e mTLS, crie os usuários da ACL e conecte os dois
clientes com o usuário do serviço e o certificado dele:

```bash
redis-server --port 0 --tls-port 6379 --tls-cert-file servidor.crt --tls-key-file servidor.key \
  --tls-ca-cert-file ca.crt --tls-auth-clients yes
```

```go
ca := x509.NewCertPool()
ca.AppendCertsFromPEM(caPEM) // só a CA do Redis
cert, _ := tls.LoadX509KeyPair("cliente.crt", "cliente.key")
rdb := redis.NewClient(&redis.Options{Addr: "kv-estado:6379", Username: "ledger-core", Password: senha,
    TLSConfig: &tls.Config{RootCAs: ca, Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}})
```

```java
var ssl = SslOptions.builder()
        .trustManager(new File("ca.crt"))                                          // só a CA do Redis, em PEM
        .keyManager(new File("cliente.crt"), new File("cliente-pkcs8.key"), null)  // chave em PKCS#8
        .build();
var uri = RedisURI.builder().withHost("kv-estado").withPort(6379).withSsl(true)
        .withAuthentication("pix-gateway", senha).build();
var cliente = RedisClient.create(uri);
cliente.setOptions(ClientOptions.builder().sslOptions(ssl).build());
```

A senha vem do gerenciador de segredos (`seguranca-aplicacao/10`), e não do código nem da imagem.

**Desafio.** Endurecer e observar o `fin-kv`.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos os testáveis foram provados em Go; em Java, o de número 2.

1. Cada serviço tem um usuário ACL próprio. O teste prova que o `pix-gateway` não lê as chaves do antifraude nem executa
   `FLUSHALL`, `CONFIG` ou `KEYS`.
2. A conexão sem TLS é recusada, o mTLS exige o certificado de cliente, e o usuário `default` está desligado.
3. A varredura do *dataset* não encontra CPF em claro em chave ou valor do `fin-kv`, e prova que pega uma *fixture* com
   CPF.
4. Os alertas existem como código, e um teste dispara cada um: memória acima de 85%, `evicted_keys` > 0 no `kv-estado`,
   atraso de réplica acima do limiar, e os demais.
5. O ADR Redis × Valkey × gerenciado para o `fin-platform`, com licença, custo e o que cada opção não resolve.

**Complemento.** Suba o `redis_exporter` e o Prometheus no compose, carregue as regras e provoque cada alerta de verdade:
encha o `kv-estado`, mate a réplica, encha o disco do AOF.

**Checagem**

1. Por que o usuário de cada serviço tem padrão de chave, e não só lista de comandos?
2. Quais comandos ficam fora de todo usuário de aplicação, e quais o servidor já desliga sozinho?
3. Cite três coisas que o gerenciado não resolve.
4. O que pesa na escolha entre Redis e Valkey, além da licença?

## Capstone

O `fin-kv` é o seu componente do `fin-platform`: a camada de estado em memória, especificada no `PROJETO.md` desta
trilha, com o que pode ser perdido escrito e provado. Aqui ele fica pronto.

**Entrega**

- [ ] O mapa de estado (`STATE-MAP.md`) com validador: nenhum uso é fonte da verdade de saldo (marcos 02 e 09)
- [ ] Duas instâncias, cache e estado, com persistência e *eviction* justificadas por número (marco 09)
- [ ] O débito de limite atômico, por script ou Function (marco 04)
- [ ] A idempotência com a defesa no banco (marco 05)
- [ ] Os limites com política de falha por tipo, lida do mapa de estado (marco 06)
- [ ] O *lease* com *fencing token* verificado no `fin-store` (marco 07)
- [ ] O notificador por Streams, com *dead-letter* e o Kafka como fonte (marco 08)
- [ ] A topologia Sentinel **ou** cluster, escolhida por ADR (marcos 10 e 11)
- [ ] Os clientes Java e Go com orçamento de *timeout*, retry seguro e topologia explícita (marco 12)
- [ ] ACL, TLS e os alertas como código (marco 13)

**Critérios de pronto, cada um provado por um teste ou por um comando, contra o Redis e o Valkey**

- [ ] Mapa de estado: o validador passa, e reprova as *fixtures* com saldo e com estado na instância de cache
- [ ] Atomicidade: 200 débitos concorrentes nunca passam do limite, e o disponível bate com o registro de uso
- [ ] Idempotência: um efeito com `FLUSHALL` entre as chamadas, com o processo morto entre o banco e o Redis, e depois de um
      *failover*
- [ ] Limites: a janela por *log* nunca passa do limite, e o limite regulatório falha fechado com o Redis fora
- [ ] *Lease*: com o dono congelado além do prazo, a escrita atrasada é recusada pelo `fin-store`
- [ ] Mensagens: o consumidor morto tem as mensagens reivindicadas, e o efeito é único
- [ ] Durabilidade: a perda medida de cada configuração está no mapa de estado, e a instância de estado nunca despeja
- [ ] Cliente: com 500 ms de latência, o endpoint fica no orçamento, e o `INCR` reenviado não conta duas vezes
- [ ] Segurança: a ACL recusa o que deve, a conexão sem TLS é recusada, e não há CPF em claro
- [ ] Operação: cada alerta dispara no `promtool test rules`

**Game day.** Um local, de uma página, com três falhas ao mesmo tempo: a partição do primário do `kv-estado`, a memória
da instância de cache cheia e 500 ms de latência injetada. Registre o que cada serviço fez, o que o mapa de estado previa, o
que foi diferente, e o post-mortem sem culpados.

**A pergunta final.** Qual chave do seu Redis, se sumir agora, vira dinheiro duplicado ou limite furado, e qual teste prova
que não vira?

> **Reencontro — `seguranca-aplicacao/09` e `/11`; `observabilidade/12`; `aws-para-backend/07`;
> `azure-para-backend/07`; `engenharia-de-plataforma/04`.** O HMAC do CPF é a criptografia aplicada de
> `seguranca-aplicacao/09`, e o mTLS, o transporte de `seguranca-aplicacao/11`. Os alertas sobre garantias são o
> princípio de `observabilidade/12`. O gerenciado de cada nuvem é o de `aws-para-backend/07` e `azure-para-backend/07`. E a
> configuração endurecida do `fin-kv`, oferecida como modelo para outros times, é um *golden path* de
> `engenharia-de-plataforma/04`.

## Principais aprendizados

- A imagem oficial sobe sem senha, com o modo protegido desligado e escutando em todas as interfaces. Produção não usa a
  configuração da imagem.
- Um usuário ACL por serviço, com padrão de chave e sem `@dangerous` nem `KEYS`. O `default` fica desligado.
- TLS com mTLS, e o cliente confia só na CA do Redis, sem desligar a verificação.
- Nada de dado pessoal em claro: identificador interno no nome, HMAC no valor, TTL, e uma varredura no CI.
- Os alertas são código e têm teste. A instância de estado despejando é crítica; a de cache, não.
- O gerenciado resolve a operação dos nós. *Eviction*, desenho de chave, cliente e perda assíncrona continuam com você.
