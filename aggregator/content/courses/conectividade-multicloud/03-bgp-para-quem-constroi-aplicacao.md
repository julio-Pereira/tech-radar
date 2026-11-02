---
id: bgp-para-aplicacao
title: "BGP para quem constrói aplicação"
summary: "Toda interconexão de nuvem fala BGP; quem não entende o que é anunciado e por que um caminho vence não consegue nem ler o incidente."
estimatedMinutes: 70
references:
  - title: "RFC 4271 — BGP-4"
    url: https://www.rfc-editor.org/rfc/rfc4271
  - title: "RFC 6996 — ASNs para uso privado"
    url: https://www.rfc-editor.org/rfc/rfc6996
  - title: "RFC 5880 — BFD"
    url: https://www.rfc-editor.org/rfc/rfc5880
  - title: "MANRS — boas práticas de roteamento"
    url: https://www.manrs.org/
---

## Sistemas autônomos e ASN

**BGP** é o protocolo pelo qual redes independentes dizem umas às outras quais faixas alcançam. Cada
rede é um **sistema autônomo**, identificado por um **ASN**. ASNs públicos são alocados por
registros regionais; para redes que não falam com a internet, o RFC 6996 reserva faixas de **ASN
privado** (`64512–65534` em 16 bits e `4200000000–4294967294` em 32 bits). As nuvens têm os seus: o
Azure usa o AS 12076 no *private peering* do ExpressRoute e reserva 65515 a 65520 para uso interno,
e o Google exige o AS 16550 no Cloud Router do Partner Interconnect (**conferir** os valores
vigentes ao configurar). Escolher para o seu lado um ASN que a nuvem reserva é um erro que só
aparece quando a sessão se recusa a subir.

## eBGP e a sessão

Entre sistemas autônomos diferentes, a conversa é **eBGP** (dentro do mesmo AS, iBGP, que esta
trilha não precisa). Dois roteadores abrem uma **sessão** sobre TCP na porta 179 e passam por
estados até `Established`: só ali trocam rotas. Depois, mandam **keepalives** periódicos; se o
**hold timer** expira sem notícia do vizinho, a sessão cai e todas as rotas aprendidas dele somem de
uma vez. Saber ler o estado da sessão é o primeiro passo de qualquer incidente de interconexão:
"a sessão está em `Active`" quer dizer que nem o TCP fechou.

```diagrama
cm-bgp-sessao
```

## Anunciado e recebido

Numa sessão, cada lado **anuncia** prefixos (o que ele alcança) e **recebe** os do vizinho. O que se
anuncia é uma decisão sua; o que se aceita, também. A tabela de rotas que a aplicação de fato usa é
o resultado dessas duas decisões nos dois lados — e é por isso que "a rota sumiu" pode ser um
anúncio que parou, um filtro que mudou ou uma sessão que caiu.

## Seleção de melhor caminho, no que importa aqui

Quando o mesmo destino chega por mais de um caminho, o BGP escolhe um, numa ordem de critérios. Para
interconexão, quatro bastam:

- **Prefixo mais específico** vence sempre, antes de qualquer atributo: um /24 ganha de um /16
  que o contém. É também o mecanismo do vazamento mais perigoso.
- **Local preference** (maior vence) é a preferência que você declara para a saída; é a forma
  normal de dizer "este é o primário".
- **AS path** (mais curto vence). O **prepend** repete o próprio ASN no anúncio para alongar o
  caminho e tornar uma rota menos preferida *do outro lado* — é como você sugere ao vizinho qual
  caminho usar para chegar até você.
- **MED** é uma dica entre dois vizinhos sobre por onde entrar, com peso menor.

## Filtros, nos dois sentidos

Um **filtro de entrada** aceita só os prefixos combinados com o vizinho; um **filtro de saída**
anuncia só os que você decidiu anunciar. Os dois existem porque o erro pode vir de qualquer lado:
o fornecedor anuncia demais, ou o seu roteador redistribui uma rota que não devia. As formas usuais
são a *prefix-list* (lista de prefixos permitidos) e o *route-map* (regras com ação). Sessão sem
filtro de saída é a sua rede corporativa inteira à disposição do vizinho.

## `max-prefix`: o disjuntor

O **`max-prefix`** limita quantos prefixos um vizinho pode anunciar. Passou do limite, a sessão cai
— uma queda deliberada, preferível a aceitar milhares de rotas de um vizinho com defeito. No FCR,
por exemplo, estourar o limite reseta a sessão por alguns minutos antes de ela voltar (**conferir**
o comportamento de cada peça).

## Autenticação da sessão

Uma sessão BGP aceita qualquer roteador que fale o protocolo no endereço certo, a menos que haja
autenticação: a senha **MD5** na sessão TCP (ou o TCP-AO, mais moderno) e o **GTSM**, que exige que
os pacotes cheguem com TTL máximo, ou seja, de um vizinho diretamente ligado. O suporte varia por
peça (**conferir**); o FCR, por exemplo, aceita MD5.

## BFD e *graceful restart*

Com os temporizadores padrão, uma sessão pode levar dezenas de segundos para perceber que o vizinho
morreu. O **BFD** é um protocolo leve de detecção que avisa o BGP em frações de segundo — a
diferença entre um failover que ninguém percebe e um que derruba requisições (marco 10). O
*graceful restart* faz o contrário: mantém as rotas por um tempo quando o vizinho reinicia só o
processo de controle, para não interromper o tráfego por uma reinicialização planejada.

## Vazamento de rota e rota assimétrica

**Vazamento de rota** é anunciar adiante uma rota que você não devia: o fornecedor recebe do
`fin-platform` a rota de outro parceiro e a anuncia de volta, ou anuncia um prefixo mais específico
do que o combinado. Por causa do prefixo mais específico, o tráfego muda de caminho sem ninguém
mexer em nada do seu lado. As práticas do MANRS — filtrar entrada e saída, validar o que se anuncia —
existem por causa disso.

**Rota assimétrica** é a ida por um caminho e a volta por outro. Para o BGP não há problema; para um
firewall com estado, sim: ele vê a resposta de uma conexão que nunca viu abrir e a descarta. É a
falha que aparece só depois do primeiro failover (marco 10).

## Exemplo numa fintech

O fornecedor anuncia, por engano, um /24 a mais: a faixa de outro parceiro do `fin-platform`. Como
o /24 é mais específico que o agregado que vinha pelo caminho certo, o tráfego para o outro
parceiro passa a sair pelo link do `FornecedorScore` — e quebra, porque o fornecedor não sabe o que
fazer com ele. O filtro de entrada teria descartado o /24 não combinado; o `max-prefix` teria
derrubado a sessão se o vazamento fosse grande.

## Hands-on

**Tutorial.** No `lab/`, suba dois roteadores FRR em eBGP, com ASNs privados, e leia
`show bgp summary` e `show ip bgp` dos dois lados.

**Desafio.** Configure filtros de entrada e de saída por *prefix-list* e o `max-prefix`, e injete
anúncios para ver cada um agir.

**Invariantes testáveis**

1. A sessão chega a `Established`, e os prefixos aceitos são **exatamente** os da lista.
2. Um anúncio extra injetado é **rejeitado** e não aparece na tabela de rotas.
3. Ultrapassar o `max-prefix` derruba a sessão — estado verificado pelo teste.
4. Com *prepend* aplicado, o caminho escolhido do outro lado muda (o teste verifica a ordem, não um
   valor).
5. Sem a senha correta, a sessão **não** sobe.

**Complemento.** Desenhe o caminho de um pacote do seu serviço até um parceiro real, com cada
sistema autônomo no meio.

**Checagem**

1. Por que um prefixo mais específico vence qualquer outro atributo, e por que isso é perigoso?
2. Para que serve o filtro de saída, se o vizinho também filtra?
3. Por que derrubar a sessão no `max-prefix` é melhor que aceitar as rotas?
4. Como o *prepend* influencia o caminho do outro lado?
5. O que o BFD muda no tempo de failover?
6. Por que uma rota assimétrica quebra um firewall com estado?

> **Reencontro — `system-design/04`.** A borda e o balanceamento decidem para onde vai uma requisição
> dentro da sua rede; o BGP decide por qual caminho ela chega lá vinda de fora.

A rede do cluster de `kubernetes/11`, com NetworkPolicy e service mesh, começa onde esta trilha
para: no nó. Os prefixos que o BGP anuncia são os que, lá dentro, viram endereços de pod e de
serviço.

## Principais aprendizados

- BGP é como as redes se anunciam; cada rede é um sistema autônomo com um ASN, e as nuvens reservam
  os delas.
- A sessão só troca rotas em `Established`; o hold timer e o BFD decidem quanto tempo um vizinho
  morto leva para sumir.
- Prefixo mais específico vence tudo; *local preference* e *prepend* dizem qual caminho é o
  primário.
- Filtro de entrada e de saída, `max-prefix` e autenticação em toda sessão.
- Vazamento de rota muda o caminho sem ninguém mexer do seu lado; assimetria quebra firewall com
  estado.
