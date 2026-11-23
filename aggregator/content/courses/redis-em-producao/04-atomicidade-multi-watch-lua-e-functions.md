---
id: atomicidade-multi-watch-lua-e-functions
title: "Atomicidade: MULTI, WATCH, Lua e Functions"
summary: "O Redis tem atomicidade de isolamento (ninguém intercala) e não tem atomicidade de falha (não há rollback). Quem confunde as duas escreve código que debita metade. MULTI/EXEC e os dois tipos de erro; WATCH como concorrência otimista e o preço dela sob contenção; scripts Lua atômicos e bloqueantes; SCRIPT KILL e o script que não morre; KEYS[] como contrato; Functions; e o Lua como módulo no Valkey 9.1. Medido nos dois motores: 200 pedidos de débito concorrentes custaram de 33 a 35 abortos de WATCH por pedido, e a mesma regra em Lua, nenhum."
estimatedMinutes: 65
reviewedAt: 2026-11-20
reviewEvery: 6m
competencies: [dados, confiabilidade]
references:
  - title: "Redis — Transactions"
    url: https://redis.io/docs/latest/develop/interact/transactions/
  - title: "Redis — Scripting with Lua"
    url: https://redis.io/docs/latest/develop/interact/programmability/eval-intro/
  - title: "Redis — Functions"
    url: https://redis.io/docs/latest/develop/interact/programmability/functions-intro/
  - title: "Valkey — Lua scripting"
    url: https://valkey.io/topics/eval-intro/
---

## Duas atomicidades, e o Redis só tem uma

"Atômico" quer dizer duas coisas diferentes, e banco relacional dá as duas juntas:

- **atomicidade de isolamento:** ninguém vê o meio. Outro cliente não intercala comandos no meio da
  operação;
- **atomicidade de falha:** tudo ou nada. Se um passo falha, os anteriores são desfeitos.

O Redis dá a primeira e **não dá a segunda**. Não existe *rollback*. Um bloco `MULTI`/`EXEC` ou um script
Lua roda sem que ninguém intercale, e, se um comando do meio falha, os anteriores **ficam aplicados**. O
marco 01 mostrou por que cada comando é atômico: a execução é serial. Este marco mostra como juntar vários
comandos sob o mesmo isolamento, e o que acontece quando um deles dá errado.

## MULTI/EXEC: enfileirar não é executar

`MULTI` (O(1)) abre a transação. Os comandos seguintes são **enfileirados**, e cada um devolve `QUEUED`.
`EXEC` (custo dos comandos da fila) executa a fila inteira de uma vez, sem intercalação. `DISCARD` joga a fila
fora.

Os erros vêm em dois momentos, e só um deles aborta:

- **erro de enfileiramento:** comando inexistente ou com aridade errada. O servidor recusa o comando ao
  enfileirar, e o `EXEC` devolve `EXECABORT`. **Nada** é aplicado;
- **erro de execução:** o comando é válido, mas falha ao rodar, como um `RPUSH` numa chave que é *string*
  (`WRONGTYPE`). Os outros comandos da fila **rodam normalmente**, e o `EXEC` devolve uma lista com o
  resultado de cada um, inclusive o erro.

No laboratório, nos dois motores, o `MULTI` debitou R$ 50,00 do limite e tentou registrar o uso numa chave
corrompida. O débito ficou, o registro falhou, e o disponível terminou em 95.000 centavos. Com o mesmo
roteiro e um comando de aridade errada no lugar do `RPUSH`, o `EXEC` voltou `EXECABORT` e o disponível ficou
intacto.

> **Armadilha.** Debitar o limite e registrar o uso num `MULTI` acreditando que, se o segundo comando
> falhar, o primeiro volta. Não volta. A transação do Redis serve para que ninguém veja o estado pela
> metade, e não para desfazer o que já foi feito. Ou a regra é escrita para que o segundo passo não possa
> falhar (validando antes, num script), ou a compensação é explícita.

O `MULTI` tem uma segunda limitação: os comandos da fila não podem depender do resultado dos anteriores.
"Leia o disponível e debite só se houver saldo" não cabe num `MULTI`, porque a leitura só devolve o valor no
`EXEC`, quando a decisão já passou.

## WATCH: concorrência otimista

O `WATCH chave` (O(1) por chave) resolve isso por concorrência otimista. O cliente vigia a chave, lê o
valor, decide e abre o `MULTI`. Se **qualquer** cliente alterar a chave vigiada entre o `WATCH` e o `EXEC`, o
`EXEC` não executa nada e devolve nulo. O cliente lê de novo e tenta outra vez. É o *check-and-set* de
`concorrencia-e-recursos/03`, com o servidor fazendo o papel do CAS.

Sob contenção, o otimismo cobra. O laboratório pôs 200 clientes concorrentes debitando de R$ 1,00 a R$ 14,99
de um limite de R$ 1.000,00, com até 50 tentativas cada:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| WATCH + MULTI (go-redis): abortos | 6.672 (33,4 por pedido) | 6.935 (34,7 por pedido) |
| WATCH + MULTI (go-redis): desistências após 50 tentativas | 36 de 200 | 75 de 200 |
| WATCH + MULTI (go-redis): tempo total | 313 ms | 315 ms |
| script Lua (go-redis): abortos / tempo | 0 / 7 ms | 0 / 5 ms |
| Function (go-redis): abortos / tempo | 0 / 3 ms | 0 / 3 ms |
| WATCH + MULTI (Spring Data Redis): abortos | 4.877 | 4.214 |

Ambiente: o do marco 01, cliente e servidor no mesmo host (20 nov 2026). Nas três versões em Go e nas duas
versões em Java (Lua e `WATCH`), o total debitado nunca passou do limite, e o disponível final bateu com a soma do registro de uso.

O `WATCH` não erra: ele desiste. As desistências são pedidos legítimos recusados porque o cliente não
conseguiu a vez, e não porque faltava saldo. O retry precisa de limite, como todo retry (`spring-boot/08`), e o
número de abortos precisa de métrica. Com contenção baixa, o `WATCH` é ótimo. Com uma chave quente, como o
limite de uma conta muito movimentada, ele vira um laço de leituras desperdiçadas.

No Spring Data Redis, o `WATCH` só funciona dentro de um `SessionCallback`, que prende a mesma conexão do
`WATCH` ao `EXEC`. Chamado direto no `RedisTemplate`, cada comando pode ir por uma conexão diferente, e a
vigilância se perde.

## Scripts Lua: atômicos e bloqueantes

O **script Lua** roda **dentro** do servidor, com o mesmo isolamento de um comando só. Ler, decidir e
escrever acontecem sem ninguém intercalar e sem ida e volta entre os passos:

```lua
-- KEYS[1] = pix:lim:<conta>; KEYS[2] = pix:lim:uso:<conta>; ARGV[1] = valor; ARGV[2] = id
local disp = tonumber(redis.call('GET', KEYS[1]) or '0')
local valor = tonumber(ARGV[1])
if valor <= 0 or valor > disp then
  return 0
end
redis.call('DECRBY', KEYS[1], valor)
redis.call('RPUSH', KEYS[2], ARGV[2] .. ':' .. ARGV[1])
return 1
```

`EVAL` manda o script inteiro. `SCRIPT LOAD` guarda o script e devolve o SHA1, e `EVALSHA` o executa pelo SHA1
sem reenviá-lo. Os clientes fazem isso sozinhos: o `redis.Script` do go-redis e o `DefaultRedisScript` do
Spring Data Redis tentam `EVALSHA` e caem para `EVAL` quando o servidor responde `NOSCRIPT`.

O script valida **antes** de escrever, e é isso que resolve a armadilha do `MULTI`. Se não há saldo, ele sai
sem tocar em nada. Mas um erro no meio do script, depois da primeira escrita, também **não desfaz** essa
escrita. A regra continua valendo: escreva o script para que toda validação venha antes da primeira escrita.

O preço é o do marco 01, numa escala maior: o script **bloqueia** o servidor enquanto roda. Um script de
200 ms é uma pausa de 200 ms para todos os clientes. Quando um script passa de `busy-reply-threshold` (5.000 ms
por padrão nos dois motores; o nome antigo, `lua-time-limit`, continua como apelido), o servidor começa a
responder `BUSY` a quase todo comando. Passam só os que têm a marca `allow-busy` (`AUTH`, `HELLO`, `MULTI` e alguns
outros de conexão), e, para o operador, sobram dois caminhos: `SCRIPT KILL` (ou `FUNCTION KILL`, se o que está rodando
é uma Function) e `SHUTDOWN NOSAVE`.

No laboratório, com o limiar baixado para 100 ms e um script que girava por 1,5 s:

- um segundo cliente recebeu `BUSY` na hora, nos dois motores;
- o `SCRIPT KILL` matou o script que **ainda não tinha escrito**;
- o mesmo `SCRIPT KILL` contra um script que **já tinha escrito** recebeu `UNKILLABLE`. O servidor não mata
  um script pela metade, porque não tem como desfazer a escrita. Restam esperar o fim ou `SHUTDOWN NOSAVE`,
  que derruba o servidor sem salvar.

Mantenha o script curto e O(1) ou O(log N). Um laço sobre uma coleção que cresce é o `KEYS` do marco 01,
com a diferença de que não dá para matar depois que ele escreve.

### Determinismo, replicação e KEYS[]

O script é replicado **pelos efeitos** (o padrão desde o Redis 5.0, e o único modo desde o 7.0): a réplica recebe
os comandos de escrita que o script fez, e não o script. Por isso um script pode chamar `TIME` e usar o resultado (o marco 06 faz isso) sem
divergir na réplica.

Toda chave que o script toca precisa chegar por `KEYS[]`, e nunca ser montada dentro dele. No `cluster` do
marco 11, o cliente usa `KEYS[]` para descobrir em que nó rodar o script, e todas as chaves precisam estar no
mesmo *slot*. Uma chave montada dentro do script (`'pix:lim:' .. ARGV[1]`) esconde do cliente onde ela mora. O
`fin-kv` verifica isso estaticamente: um teste lê todos os scripts do repositório e falha se o primeiro argumento de
algum `redis.call` não vier de `KEYS[]`. É uma verificação simples, que não confere as chaves seguintes de um comando
multichave nem um nome de comando guardado em variável, e por isso a revisão de código continua valendo.

## Functions

As **Functions** (Redis 7.0+ e Valkey 7.2+) são a evolução versionada dos scripts. Em vez de um script solto
identificado pelo SHA1, você carrega uma **biblioteca** com nome, com `FUNCTION LOAD` (O(1)), e chama a função
pelo nome com `FCALL` (custo da função):

```lua
#!lua name=finkv
local function debitar_limite(keys, args)
  -- o mesmo corpo do script acima, com keys[] e args[]
end
redis.register_function('debitar_limite', debitar_limite)
```

A diferença prática é de operação. A biblioteca é persistida no RDB e no AOF e replicada, então ela
sobrevive a um *restart* e chega às réplicas sem que cada cliente a recarregue. O nome é estável: o código
chama `debitar_limite`, e não um SHA1 que muda a cada vírgula. E `FUNCTION LOAD REPLACE` troca a versão num
ponto só, o que vira uma etapa do *deploy* com versão no repositório. O custo de execução é o mesmo de um
script, e o bloqueio também, com uma diferença na hora de parar: uma Function que travou não morre com `SCRIPT KILL`
(o servidor recusa), e sim com `FUNCTION KILL`, que também respeita o `UNKILLABLE` de quem já escreveu.

> **Diferença Redis × Valkey.** No Valkey 9.1, o motor Lua virou um **módulo**. Ele vem ligado por padrão
> e linkado estaticamente na imagem oficial, e por isso os scripts e Functions deste marco rodaram sem
> mudança. Mas um *build* com `BUILD_LUA=no` sai sem Lua, e qualquer instalação que desligue o módulo fica sem
> scripting. Quem depende de script para garantir um invariante de dinheiro tem de verificar, no *deploy*,
> que o motor responde a `EVAL`, e ter o `WATCH` como alternativa documentada.

## Exemplo numa fintech

O `pix-gateway` debita o **limite Pix** de cada conta antes de iniciar o pagamento. A regra é ler o
disponível, comparar com o valor, debitar e registrar o uso, que depois a reconciliação do marco 06 confere
com o banco. O time escreveu as três versões e mediu sob a contenção de uma conta de lojista no horário de
pico: 200 pedidos simultâneos para um limite que só comportava uns 130.

A primeira versão foi `WATCH` + `MULTI`, porque era a que o time conhecia de `spring-boot/05` com `@Version`.
Ela não furou o limite, mas recusou de 18% a 38% dos pedidos por desistência depois de 50 tentativas, e cada
aceito custou mais de 30 leituras desperdiçadas. A segunda, em Lua, não abortou nada e levou 7 ms para os 200.
A terceira, como Function, ficou com o mesmo comportamento, e ganhou o *deploy* versionado.

O `fin-kv` usa a Function `finkv.debitar_limite` em produção, carregada com `FUNCTION LOAD REPLACE` no
*pipeline* de *deploy*. O ADR guarda a versão `WATCH`, com retry limitado e métrica de abortos, como plano
para um motor sem Lua.

## Hands-on

**Tutorial.** No `fin-kv`, implemente o débito do limite nas três versões, em Go e em Java. Os scripts moram
em `lua/` e são os mesmos para as duas linguagens:

```go
s := redis.NewScript(debitarLimiteLua) // EVALSHA, com EVAL quando o servidor não conhece o SHA1
ok, err := s.Run(ctx, rdb, []string{"pix:lim:conta-1", "pix:lim:uso:conta-1"}, valor, id).Int()

err = rdb.FunctionLoadReplace(ctx, finkvFunctionLua).Err()
ok, err = rdb.FCall(ctx, "debitar_limite", []string{"pix:lim:conta-1", "pix:lim:uso:conta-1"}, valor, id).Int()
```

```java
var script = new DefaultRedisScript<Long>();
script.setLocation(new FileSystemResource("lua/debitar_limite.lua"));
script.setResultType(Long.class);
Long ok = template.execute(script, List.of("pix:lim:conta-1", "pix:lim:uso:conta-1"),
        String.valueOf(valor), id);
```

Use `StringRedisTemplate`, e não o `RedisTemplate` com a serialização JDK padrão: o script recebe os
argumentos como *string*, e o valor serializado em bytes Java não vira número no `tonumber`.

**Desafio.** Débito de limite à prova de concorrência: 200 clientes ao mesmo tempo, nas três versões, com o
total debitado conferido contra o registro de uso.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos os testáveis foram provados em Go; em Java, os de número 1, 2 e 3 (Lua e `WATCH`).

1. 200 clientes concorrentes debitando de um limite de R$ 1.000 nunca debitam mais que R$ 1.000 no total, e o
   disponível final bate com a soma dos débitos aceitos e com o registro de uso, nas três versões.
2. Um erro de execução no segundo comando de um `MULTI` mantém o efeito do primeiro. O defeito fica
   documentado como teste. Um erro de enfileiramento aborta o `EXEC` inteiro.
3. A versão `WATCH` tem retry limitado. Sob contenção alta, o teste registra a taxa de abortos e as
   desistências e compara com a versão Lua.
4. Um script que passa do limiar de execução faz um segundo cliente receber `BUSY`. O `SCRIPT KILL` mata o
   script que não escreveu e recebe `UNKILLABLE` do que escreveu.
5. Todo script do repositório recebe as chaves por `KEYS[]`. A verificação é estática, sobre os arquivos, e o
   teste prova que pega uma chave montada dentro do script.

**Complemento.** Reduza a contenção: 200 clientes em 20 contas diferentes, em vez de uma. Quanto caem os
abortos do `WATCH`? A partir de que contenção você escolheria o `WATCH`, sabendo que ele não depende de
Lua?

**Checagem**

1. Qual atomicidade o Redis dá e qual ele não dá? Dê um exemplo de código que quebra por confundir as duas.
2. Por que "ler e debitar só se houver saldo" não cabe num `MULTI` sozinho, e o que o `WATCH` acrescenta?
3. O que acontece com os outros clientes enquanto um script de 2 segundos roda, e por que o `SCRIPT KILL`
   às vezes não funciona?
4. O que as Functions dão que o `EVALSHA` não dá, e o que elas não mudam?

> **Reencontro — `concorrencia-e-recursos/03`; `spring-boot/05`; `dados-distribuidos/04`.** O `WATCH` é o
> CAS de `concorrencia-e-recursos/03` com o servidor como árbitro, e herda o defeito dele sob contenção: o
> laço gira. É o mesmo otimismo do `@Version` de `spring-boot/05`, e a mesma conclusão: o otimista vale
> quando o conflito é raro. E a falta de *rollback* é o contraste com a transação ACID de
> `dados-distribuidos/04`: aqui há isolamento sem atomicidade de falha, e é por isso que a verdade do
> dinheiro continua no banco.

## Principais aprendizados

- O Redis dá isolamento (ninguém intercala) e não dá *rollback*. Um comando que falha no meio de um `MULTI` ou
  de um script não desfaz os anteriores.
- No `MULTI`, o erro de enfileiramento aborta tudo, e o erro de execução não aborta nada.
- O `WATCH` é concorrência otimista. Sob contenção, ele custou mais de 30 abortos por pedido e recusou até 38%
  dos pedidos por desistência. Retry sempre limitado e medido.
- O script Lua lê, decide e escreve sem intercalação e sem ida e volta. Valide tudo antes da primeira escrita.
- Script bloqueia o servidor. Passou do limiar, todos recebem `BUSY`, e o script que já escreveu não pode ser
  morto.
- Toda chave entra por `KEYS[]`. Functions dão nome, versão e persistência. No Valkey 9.1, o Lua é um módulo, e
  a dependência dele vira item de verificação no *deploy*.
