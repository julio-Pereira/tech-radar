Um verbete por termo: definição em uma frase, o exemplo no `fin-kv`, o erro comum associado e o marco onde
o conceito aparece na prática. Conceitos que já têm dono (*cache-aside*, *stampede*, *fencing token*,
Redlock, *token bucket*, janela deslizante, `Idempotency-Key`) são verbetes das trilhas donas e não se
repetem aqui.

## Execução

### Pipelining
**Em uma frase:** mandar vários comandos pela mesma conexão sem esperar a resposta de cada um, pagando o
tempo de ida e volta uma vez só; não dá atomicidade.
**No fin-kv:** o `pix-gateway` junta as leituras de uma requisição num *pipeline*.
**Erro comum:** confundir com `MULTI`, que dá isolamento e não economiza o tempo de ida e volta.
**Onde na prática:** marco 01.

## Durabilidade

### Política de eviction
**Em uma frase:** a regra que o Redis segue para descartar chaves quando atinge o `maxmemory`, de recusar
toda escrita (`noeviction`) a descartar qualquer chave (`allkeys-lru`).
**No fin-kv:** a instância de estado usa `noeviction`, e a de cache, `allkeys-lru`.
**Erro comum:** guardar cache e estado na mesma instância com `allkeys-lru`, e perder a chave de
idempotência junto com o cache.
**Onde na prática:** marco 09.
