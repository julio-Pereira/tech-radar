---
id: enderecamento-e-sobreposicao
title: "Endereçamento e sobreposição"
summary: "A decisão de rede mais cara de desfazer é a faixa IP; com fornecedor, você não controla a dele — então planeje para a colisão."
estimatedMinutes: 60
references:
  - title: "RFC 1918 — endereçamento privado"
    url: https://www.rfc-editor.org/rfc/rfc1918
  - title: "RFC 6598 — espaço de endereços compartilhado (100.64.0.0/10)"
    url: https://www.rfc-editor.org/rfc/rfc6598
---

## CIDR e agregação

Uma faixa como `10.20.0.0/16` diz duas coisas: o começo e quantos bits são fixos. O /16 fixa os
16 primeiros bits e deixa 16 livres — 65.536 endereços. Dividir em /24 dá 256 sub-redes de 256
endereços. O inverso é a **agregação**: se todas as sub-redes de um dono estão dentro de um bloco
contíguo, o roteador anuncia o bloco inteiro numa linha só. Planejar para agregar é o que mantém a
tabela de rotas pequena e o anúncio para o parceiro curto — e é o que se perde quando cada time pega
"a próxima faixa livre" sem um plano.

## Faixas privadas, e o espaço compartilhado

O **RFC 1918** reserva três faixas para uso privado: `10.0.0.0/8`, `172.16.0.0/12` e
`192.168.0.0/16`. Justamente por serem as faixas de todo mundo, são as que mais colidem quando duas
organizações se ligam. O **espaço compartilhado** `100.64.0.0/10` (RFC 6598) nasceu para a rede de
operadoras e fica fora das faixas que as empresas costumam usar internamente; por isso ele aparece
com frequência como faixa de **interconexão** ou de **NAT** entre organizações. Usá-lo assim é uma
convenção, não um uso previsto pelo RFC: **conferir** se a sua organização e o fornecedor já o usam
para alguma outra coisa antes de escolher um bloco.

## IPAM: uma faixa, um dono

O **IPAM** é a fonte da verdade do endereçamento: cada bloco tem **dono**, **ambiente** e
**propósito**, e nenhuma faixa é alocada fora dele. Sem IPAM, a pergunta "quem usa `10.30.4.0/24`?"
se responde olhando o console de três nuvens e torcendo. Com IPAM, a sobreposição vira um teste: o
plano inteiro é verificado a cada mudança, como qualquer outro código.

## O que as nuvens reservam

Cada nuvem guarda alguns endereços de toda sub-rede para uso próprio (o gateway, o DNS, o
broadcast): o Azure e o Google Cloud reservam quatro ou cinco por sub-rede (**conferir** a regra
vigente de cada uma). Numa sub-rede pequena, isso pesa: um /29 tem 8 endereços, e sobram poucos
para hosts. Há também sub-redes de propósito fixo — a sub-rede do gateway no Azure, as sub-redes
pequenas de *peering* em cada perna da interconexão (marco 04) — que precisam caber no plano desde o
começo, sem colidir com nada.

## Planejar para crescer

O plano reserva espaço contíguo para cada ambiente e cada nuvem, mesmo vazio, para que o crescimento
caia dentro do mesmo agregado. Fragmentar ("pega um /24 aqui, outro ali") economiza endereço hoje
e custa uma linha de anúncio por fragmento amanhã — e cada linha anunciada a um parceiro é uma
decisão de segurança (marco 08).

## Sobreposição com o fornecedor: renumerar, traduzir ou não rotear

Você controla o seu plano, não o do fornecedor. Quando as faixas colidem, há três saídas:

- **Renumerar** um dos lados. É a solução limpa e quase nunca a disponível: ninguém renumera
  produção para ligar um parceiro.
- **Traduzir com NAT.** Cada lado passa a enxergar o outro por uma faixa nova, sem colisão —
  por exemplo, um /28 de `100.64.0.0/10` para cada sentido. A pergunta é **onde fica o NAT**:
  na sua borda, num appliance virtual no próprio provedor de interconexão ou no fornecedor. O NAT
  tem custo: o log do fornecedor mostra o endereço traduzido, não o do seu serviço; correlacionar
  exige guardar a tabela de tradução; e um NAT com estado sofre com rota assimétrica (marco 03).
- **Não rotear.** Se o fornecedor pode publicar um **serviço** em vez de uma rede (marco 01), a
  colisão deixa de importar: só um endpoint aparece do seu lado.

O **IPv6** elimina a colisão por tamanho de espaço, mas exige que cada peça do caminho o suporte nas
duas pontas: **conferir** o suporte de cada nuvem e do provedor de interconexão antes de contar com
ele.

```diagrama
cm-faixas
```

## Exemplo numa fintech

O fornecedor usa `10.0.0.0/16` na VPC dele — a mesma faixa da VNet de produção do `fin-platform`.
Renumerar não é opção para nenhum dos dois. A saída é NAT na borda do `fin-platform`: o `ledger-core`
passa a chamar o fornecedor em `100.64.10.0/28`, e o fornecedor enxerga o `fin-platform` em
`100.64.20.0/28`. O IPAM registra os dois /28 com dono, ambiente e propósito, e o detector de
sobreposição passa a conferir também essas faixas de tradução a cada mudança.

## Hands-on

**Tutorial.** Em `ipam/`, escreva em Go um plano de faixas em YAML (blocos com dono, ambiente e
propósito), uma função de alocação de sub-redes dentro dos blocos e um detector de sobreposição.

**Desafio.** Encaixe o fornecedor, com a faixa que colide, usando NAT para dois /28 de
`100.64.0.0/10`, e registre a tradução no plano.

**Invariantes testáveis**

1. Nenhuma sobreposição no plano final — teste de propriedade sobre alocações aleatórias com
   semente fixa.
2. Uma sobreposição injetada é **detectada**, e a mensagem nomeia os dois donos.
3. Toda sub-rede tem dono, ambiente e propósito.
4. O agregado anunciado cobre **exatamente** as sub-redes do dono: nem mais, nem menos.

**Complemento.** Inventarie as faixas do seu ambiente real (sem publicar) e procure as que colidem
com as de um parceiro.

**Checagem**

1. Por que as faixas do RFC 1918 são as que mais colidem entre organizações?
2. O que a agregação economiza, e o que a fragmentação custa?
3. Quais são as três saídas para uma sobreposição com o fornecedor, e quando cada uma serve?
4. Por que onde fica o NAT importa?

> **Reencontro — `arquitetura-de-solucoes/05`.** A zona de pouso decide as contas e as redes de cada
> ambiente; o IPAM é o que garante que essas redes caibam juntas, inclusive com quem está fora dela.

A rede do cluster de `kubernetes/04` usa faixas de pods e de serviços que também entram no plano —
um `10.96.0.0/12` de serviços do cluster que colide com a rede de um parceiro é o mesmo problema,
descoberto mais tarde.

## Principais aprendizados

- A faixa IP é a decisão de rede mais cara de desfazer; com fornecedor, planeje para a colisão.
- Agregar mantém o anúncio curto; fragmentar custa uma linha a cada pedaço.
- O IPAM é a fonte da verdade: uma faixa, um dono, testada a cada mudança.
- Sobreposição se resolve renumerando, traduzindo com NAT ou não roteando — e o NAT tem custo.
- O espaço `100.64.0.0/10` serve bem para interconexão, mas é convenção: confira antes de usar.
