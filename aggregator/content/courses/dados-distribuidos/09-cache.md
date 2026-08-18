---
id: cache
title: "Cache: o padrão mais usado e o mais mal usado"
summary: "Os quatro padrões e o modo de falha de cada um, os incidentes clássicos com suas mitigações, e a regra que vira política: saldo contábil nunca é servido de cache. Marco crítico — quiz estendido."
estimatedMinutes: 55
references:
  - title: "Redis — Client-side caching and key eviction"
    url: https://redis.io/docs/latest/develop/reference/client-side-caching/
  - title: "AWS Builders' Library — Caching challenges and strategies"
    url: https://aws.amazon.com/builders-library/caching-challenges-and-strategies/
  - title: "Redis — Persistence (RDB and AOF)"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
---

## Os quatro padrões e o que cada um perde

**Cache-aside** é o default e o único que a maioria dos sistemas precisa: a aplicação lê do
cache; no miss, lê do banco e popula. A falha do cache degrada para o banco, o que é exatamente o
comportamento desejado. Custa uma janela: entre a escrita no banco e a invalidação, o cache serve
dado velho.

**Read-through** move a responsabilidade para a biblioteca ou o próprio cache, que busca no banco
no miss. Código mais limpo, mesmo modo de falha, menos controle sobre o que acontece no miss.

**Write-through** escreve no cache e no banco na mesma operação. Mantém o cache sempre quente e
paga latência em toda escrita — e o detalhe que engana: **não é atômico**. Escrever nos dois é
exatamente o dual-write que `arquitetura-eventos/08` proíbe, com a mesma janela de inconsistência
se um dos dois falhar.

**Write-behind** escreve no cache e responde; o banco é atualizado depois, em lote. É o mais
rápido e **perde dado por design**: se o cache cair antes do flush, aquelas escritas não
existiram. Existem workloads em que isso é aceitável — contador de visualizações, telemetria de
uso. Nenhum deles é dinheiro.

## Invalidação, que é o problema difícil

Três estratégias, e a escolha entre elas é sobre quanto atraso o negócio aceita:

**TTL.** Simples, robusto, e o dado fica velho por até o TTL inteiro. O TTL não é um número
técnico: ele **é** a janela de inconsistência do marco 04 de `arquitetura-eventos`, com número e
dono. Um TTL de 5 minutos no limite disponível é uma decisão de risco, não de infraestrutura.

**Invalidação por evento.** O mesmo evento que atualiza a projeção invalida a chave. Reduz a
janela para o tempo de propagação e adiciona um modo de falha novo: se o evento se perde, a chave
fica velha **para sempre** — porque não há TTL para salvá-la. A regra prática que resolve: use
invalidação por evento **e** TTL, o segundo como rede de segurança.

**Versionamento de chave.** A chave inclui uma versão (`limite:acc-123:v7`); atualizar significa
escrever numa chave nova. Nunca há dado velho servido, e o custo é gerenciar a versão e deixar as
antigas expirarem.

## Os incidentes clássicos

**Stampede (thundering herd).** A chave popular expira, e as duzentas requisições em voo naquele
instante vão todas ao banco. O banco, que estava confortável, recebe um pico e engasga —
frequentemente derrubando também o que não tinha nada a ver. As mitigações se somam: **jitter no
TTL** (nunca o mesmo valor exato para todas as chaves), **single-flight** (só a primeira busca; as
demais esperam o resultado dela) e **refresh antecipado** (renovar a chave antes de expirar, com
probabilidade crescente).

**Hot key.** Uma chave concentra tráfego desproporcional e satura o nó do cluster que a hospeda.
É o celebrity problem do marco 03, agora no Redis. As saídas são replicar a chave com sufixo
aleatório ou manter um cache local na aplicação para essa chave específica.

**Cold start.** O deploy sobe com o cache vazio, e 100% das requisições viram miss. O banco recebe
a carga completa do serviço, sem aquecimento. Mitigações: subir gradualmente, pré-aquecer as
chaves quentes, ou não reiniciar tudo ao mesmo tempo.

**Miss que martela.** Uma consulta por algo que não existe nunca popula nada, então toda tentativa
vai ao banco. Um cliente com bug em loop faz milhares por segundo. A correção é **negative
caching**: cachear a ausência, com TTL curto para o dado que passe a existir aparecer rápido.

## O cache que virou dependência crítica

A pergunta que separa cache de banco: **se o Redis cair agora, o sistema degrada ou cai?**

Se cai, ele não é cache — é um banco de dados sem durabilidade, sem backup e sem plano de
recuperação, escolhido por acidente. Isso acontece por evolução, não por decisão: o cache foi
adicionado como otimização, o banco foi dimensionado assumindo o cache, e um ano depois a carga
real de miss não cabe mais.

O plano de degradação precisa existir e ser exercitado: o que responde quando o cache não está
disponível? Ler do banco com rate limit? Servir um valor conservador? Recusar a operação de forma
explícita? Qualquer uma das três é uma resposta; "não pensamos nisso" não é.

O mínimo sobre Redis que muda decisões:

- **Single-thread.** Um comando O(n) — `KEYS`, `SMEMBERS` num conjunto enorme, `FLUSHALL` —
  bloqueia **todos** os outros clientes enquanto roda. Use `SCAN`.
- **Persistência.** RDB é snapshot periódico (perde o intervalo); AOF é log de comandos, com
  `fsync` configurável. Nenhum dos dois transforma o Redis num banco durável para dinheiro.
- **Cluster e resharding.** Slots são movidos entre nós; durante a migração o cliente pode
  receber redirecionamento, e a biblioteca precisa saber tratá-lo.
- **Eviction policy.** Com `maxmemory` atingido, `allkeys-lru` descarta o que for preciso;
  `noeviction` passa a recusar escrita. A segunda transforma pressão de memória em erro visível —
  às vezes é o que se quer.

## Exemplo numa fintech

**O limite disponível pode ser cacheado.** Ele muda com frequência moderada, a consulta é por
chave, o volume é alto (300 mil por minuto na autorização), e — o detalhe decisivo — a decisão
final **verifica no banco** antes de comprometer o valor. O cache filtra as recusas óbvias; a
autorização real acontece com o dado autoritativo. Uma janela de 30 segundos aqui significa, no
pior caso, uma autorização que segue adiante e é recusada no passo seguinte. Aceitável, medível,
com dono.

**O saldo contábil nunca é servido de cache.** Ele é o dado que a auditoria confere, que o cliente
usa para decidir e que o regulador cobra. Um saldo velho servido rápido é uma resposta errada com
baixa latência — e a fintech inteira paga pela diferença. A política que sai deste marco, escrita
com todas as letras:

> Dado contábil autoritativo (saldo, extrato oficial, comprovante) **não** é servido de cache.
> Dado derivado e de apoio (limite, catálogo, configuração, resultado de consulta pública) **pode**
> ser cacheado, com TTL declarado e plano de degradação.

## Hands-on

**Tutorial — cache-aside com jitter e single-flight.**

1. Suba Redis em Docker e implemente o cache-aside do limite disponível: `GET`, no miss consulta
   o banco, `SET` com TTL.
2. Aplique **jitter**: TTL de 60 segundos mais um aleatório de 0 a 15, para que as chaves não
   expirem juntas.
3. Implemente **single-flight**: quando várias goroutines ou threads pedem a mesma chave em miss,
   apenas uma consulta o banco e as demais aguardam o resultado.
4. Implemente **negative caching** com TTL de 5 segundos para conta inexistente.
5. `git commit` com os três mecanismos e um teste que prova o single-flight.

**Desafio — provocar e medir o stampede.** Com a chave popularizada, force a expiração e dispare
**200 requisições simultâneas**:

1. Sem mitigação: conte quantas queries chegaram ao banco (`pg_stat_statements` ou log) e meça o
   p99 das 200 respostas.
2. Com single-flight e jitter: repita exatamente o mesmo teste.
3. Registre os dois números lado a lado. A entrega é a **comparação**, não o código.

**Invariantes testáveis**

1. Nenhum dado contábil autoritativo é lido de cache em nenhum caminho da aplicação.
2. Toda chave cacheada tem TTL declarado — nenhuma é escrita sem expiração.
3. Sob 200 requisições concorrentes em miss, o banco recebe uma query, não duzentas.
4. Com o Redis indisponível, o sistema responde de forma degradada definida, e existe teste que
   prova isso.

**Complemento.** Rode `redis-cli --latency` durante um `KEYS *` num banco com um milhão de
chaves e observe o efeito no p99 de todos os outros clientes. É a demonstração de single-thread
que substitui qualquer parágrafo sobre o assunto.

**Checagem**

1. Quais são os quatro padrões de cache, e qual deles perde dado por design?
2. Por que invalidação por evento precisa de TTL como rede de segurança?
3. Quais são as três mitigações de stampede, e o que cada uma resolve?
4. Qual pergunta distingue um cache de um banco sem durabilidade — e o que fazer se a resposta for
   ruim?

## Principais aprendizados

- Cache-aside é o default e degrada certo; write-through não é atômico e write-behind perde dado
  por design — nenhum deles serve para dinheiro.
- O TTL é a janela de inconsistência com outro nome: é decisão de negócio, com número e dono.
- Invalidação por evento sem TTL deixa a chave velha para sempre quando o evento se perde; use os
  dois juntos.
- Stampede, hot key, cold start e miss que martela são os quatro incidentes clássicos — jitter,
  single-flight, refresh antecipado e negative caching são as respostas.
- Se o sistema cai quando o cache cai, ele não é cache; e saldo contábil nunca é servido de cache,
  porque resposta errada rápida é pior que resposta certa lenta.
