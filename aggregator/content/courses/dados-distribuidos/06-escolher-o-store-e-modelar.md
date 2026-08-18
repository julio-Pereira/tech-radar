---
id: escolher-o-store
title: "Escolher o store e modelar para a query"
summary: "O modelo de dados serve à query, não ao diagrama: o que cada família de banco responde barato, o preço escrito da desnormalização e o critério para adicionar o segundo store."
estimatedMinutes: 50
references:
  - title: "AWS — Purpose-built databases"
    url: https://aws.amazon.com/products/databases/
  - title: "Martin Fowler — PolyglotPersistence"
    url: https://martinfowler.com/bliki/PolyglotPersistence.html
  - title: "PostgreSQL — JSON Types and Functions"
    url: https://www.postgresql.org/docs/current/datatype-json.html
---

## A regra

O modelo de dados serve à query, não à beleza do diagrama. Um esquema elegante que obriga cinco
`JOIN` para responder a pergunta que o app faz duzentas mil vezes por minuto é um esquema errado,
por mais correto que esteja na terceira forma normal.

O método é sempre o mesmo, e ele começa pelo fim: **liste as queries antes de desenhar as
tabelas**. Para cada uma, anote volume, latência alvo e quem a chama. Só então modele. É o mesmo
raciocínio de `arquitetura-eventos/06`, onde a projeção existe para uma pergunta específica — aqui
a projeção tem um schema, e o schema tem um dono.

## O que cada família responde barato

| Família | Responde barato | Responde caro | Exemplo no `fin-platform` |
| --- | --- | --- | --- |
| **Relacional** | invariante entre entidades, query ad-hoc, agregação transacional | documento profundamente aninhado, escrita massiva sem estrutura | ledger, contas, limites |
| **Documento** | ler um agregado inteiro por id | consulta que atravessa documentos, invariante entre eles | payload bruto do PSP, dossiê de KYC |
| **Chave-valor** | leitura por chave exata, altíssimo volume | qualquer coisa que não seja por chave | limite disponível, sessão, rate limit |
| **Colunar** | agregação sobre bilhões de linhas e poucas colunas | escrita linha a linha, leitura de uma linha inteira | TPV por dia, relatório regulatório |
| **Série temporal** | janelas e downsampling sobre métricas | dado relacional, atualização de histórico | métricas do `fin-watch` |
| **Grafo** | travessia de relacionamentos em profundidade | agregação analítica, escrita de altíssimo volume | anéis de fraude, ligação entre contas |

A pergunta que corta caminho: **o que você tem é uma pergunta por chave, uma pergunta por
relacionamento, ou uma pergunta por conjunto?** Cada resposta aponta uma família.

E vale dizer o que o Postgres já cobre, porque isso adia muita decisão: `jsonb` com GIN atende ao
caso documento na maior parte dos volumes; um índice bem escolhido atende ao caso chave-valor até
uma escala respeitável. A pergunta não é "qual store é melhor para isto?", é **"o store que eu já
opero resolve com folga suficiente?"**.

## Normalização como default, desnormalização com preço escrito

Normalizar é o default porque cada fato mora num lugar só: mudou, mudou para todo mundo, sem
processo. Desnormalizar é uma decisão consciente, e o preço tem nome: **duplicação exige processo
de atualização, e processo de atualização exige evento**.

Guardar `nomeDoCliente` na tabela de lançamentos parece inofensivo até o cliente mudar de nome.
A partir daí existem três respostas, e todas custam:

1. Aceitar a divergência como **histórica** — o lançamento guarda o nome que valia na data. Numa
   fintech isso normalmente é o certo, e precisa estar escrito, senão vira bug reportado.
2. Atualizar em lote quando o nome muda — um processo, disparado por evento, com falha e retry.
3. Não duplicar e pagar o `JOIN`.

A escolha é legítima em qualquer direção. O erro é desnormalizar sem escolher — copiar o campo
"porque fica mais rápido" e descobrir a divergência seis meses depois, quando a conciliação acusa.

## OLTP e OLAP no mesmo banco

O relatório de fechamento roda uma varredura de 40 minutos no banco transacional às 9h, e a
autorização de pagamento começa a estourar timeout. Três causas se somam:

- **I/O e cache** — a varredura expulsa do cache as páginas quentes que a autorização usava.
- **A transação longa segura o vacuum** de todo o banco, exatamente como o marco 04 mostrou.
- **Conexões** — o relatório ocupa slots que são um recurso escasso (marco 07).

Os degraus da solução, do mais barato ao mais caro: mover o relatório para uma **réplica
dedicada** (resolve I/O e cache, não resolve o vacuum — a réplica também segura, via
`hot_standby_feedback`); depois **agendar** para a janela ociosa; e, quando o volume justificar,
mandar o dado para um **store analítico** por CDC (marco 14). O que não funciona é otimizar a
query do relatório indefinidamente: o problema é de isolamento de workload, não de plano.

## Polyglot persistence e o custo do segundo banco

Cada store novo não é "mais uma tecnologia". É:

- backup, restore testado e retenção próprios;
- plantão — alguém acorda às 3h por ele;
- expertise real, não um tutorial lido;
- um modo de falha novo no fluxo, que se multiplica com os existentes
  (`observabilidade/02`);
- e a pergunta inevitável: qual a **fonte da verdade** quando os dois discordam?

O critério para adicionar o segundo store, em uma frase: **a query que ele resolve é crítica, o
store atual não a resolve com folga, e a diferença foi medida.** Se falta qualquer um dos três, a
resposta é o índice, a réplica ou o `jsonb`.

O caso simétrico também existe: manter tudo em Postgres quando o workload analítico já custa mais
em nó gigante do que custaria um warehouse é teimosia, não simplicidade. A defesa precisa ser
numérica nas duas direções.

## Exemplo numa fintech

Seis queries reais do `fin-platform`, e onde cada uma deveria morar:

| Query | Volume | Store | Por quê |
| --- | --- | --- | --- |
| Saldo de uma conta agora | 200k/min | relacional (leader) | invariante, precisa de recência |
| Extrato por conta e período | 40k/min | relacional (réplica ou projeção) | índice coberto resolve; tolera segundos de lag |
| Limite disponível na autorização | 300k/min | chave-valor + verificação | leitura por chave, TTL curto (marco 09) |
| Payload bruto recebido do PSP | 50k/min | documento ou `jsonb` | schema do parceiro, lido inteiro por id |
| TPV por dia, por instituição | 1/dia | colunar | agregação sobre bilhões, poucas colunas |
| Anéis de contas ligadas por device | 200/min | grafo — ou nenhum | só se a travessia for profunda de verdade |

A defesa que o exercício exige é a do **menor número de stores**. Neste desenho, quatro linhas
cabem em Postgres (com `jsonb` para o payload), o limite cabe em Redis porque o volume e a latência
justificam, e o colunar só entra quando o relatório passar a doer de verdade. O grafo é o caso mais
comum de store adicionado por entusiasmo: quase toda pergunta de fraude de primeiro nível é um
`JOIN` de duas tabelas.

## Hands-on

**Desafio — o menor número de stores possível.** Para as seis queries da tabela acima, produza
`STORES.md` com:

1. O store escolhido para cada uma e a justificativa pela **pergunta** (por chave, por
   relacionamento, por conjunto) — não por moda.
2. Uma seção defendendo por que o número total de stores distintos não pode ser menor. Se você
   propôs três, mostre por que dois não resolvem.
3. Para cada store além do primeiro: quem faz backup, quem está no plantão, e qual é a fonte da
   verdade se ele divergir do relacional.
4. Uma linha por query dizendo o que acontece se aquele store ficar indisponível por 10 minutos.

**Invariantes testáveis**

1. Nenhum dado tem duas fontes da verdade; toda cópia está declarada como cópia, com processo de
   atualização.
2. Todo store adicional tem backup, dono e plano de indisponibilidade escritos antes de entrar.
3. Toda query listada tem volume e latência alvo anotados — nenhuma entrou por "achamos que
   precisa".
4. Nenhum campo duplicado existe sem uma linha dizendo se ele é histórico ou sincronizado.

**Complemento.** Pegue a query do payload do PSP e implemente as duas versões: `jsonb` com índice
GIN no Postgres, e uma coleção num banco de documento. Compare latência de leitura por id,
tamanho em disco e esforço de operação. A conclusão costuma ser desconfortável para quem já tinha
decidido.

**Checagem**

1. Por que listar as queries antes de desenhar as tabelas, e o que isso muda no resultado?
2. Qual é o preço escrito da desnormalização, e quais são as três respostas legítimas para o campo
   duplicado que mudou?
3. Por que o relatório derruba a autorização, e por que otimizar a query dele não resolve?
4. Quais são os três testes que um segundo store precisa passar para entrar?

## Principais aprendizados

- O modelo serve à query: liste volume, latência e chamador de cada pergunta antes de desenhar
  tabela.
- Cada família de banco responde barato a um tipo de pergunta — por chave, por relacionamento, por
  conjunto; e o Postgres já cobre mais casos do que a discussão costuma admitir.
- Desnormalizar é legítimo com o preço escrito: duplicação exige processo, e processo exige evento.
- OLAP dentro do OLTP é problema de isolamento de workload — réplica dedicada, janela, e CDC quando
  o volume justificar.
- O segundo store precisa passar em três testes: a query é crítica, o store atual não resolve com
  folga, e a diferença foi medida.
