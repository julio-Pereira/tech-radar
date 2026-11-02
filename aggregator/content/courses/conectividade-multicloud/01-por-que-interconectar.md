---
id: por-que-interconectar
title: "Por que (e quando) interconectar"
summary: "Interconexão privada é a resposta para volume, latência previsível e exigência de não trafegar pela internet — e a pergunta errada para quase todo o resto."
estimatedMinutes: 55
references:
  - title: "Equinix Fabric Cloud Router"
    url: https://docs.equinix.com/fabric-cloud-router
  - title: "Google Cloud — Cross-Cloud Interconnect"
    url: https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview
---

## O pedido que chega como "abrir um chamado de rede"

O antifraude do `ledger-core` vai consultar o score de um fornecedor, o `FornecedorScore`, que roda
no Google Cloud, enquanto o `fin-platform` roda no Azure. A frase que costuma chegar ao time é
"precisamos de uma conexão privada com o fornecedor". Antes de qualquer cabo, ela esconde quatro
perguntas: **quanto tráfego**, **com que latência**, **o contrato proíbe a internet?** e **quantos
parceiros virão depois deste**. Interconexão privada responde bem a algumas combinações dessas
respostas — e é cara, lenta de montar e difícil de desfazer em todas as outras.

## As opções, da mais simples à mais pesada

Em ordem de custo e de complexidade:

1. **API pública com mTLS.** O fornecedor expõe um endpoint na internet, e a autenticação mútua por
   certificado garante quem fala com quem (o mTLS é de `seguranca-aplicacao/07`). Fica de pé em
   dias; a latência e a disponibilidade são as da internet.
2. **VPN site a site entre nuvens.** Um túnel IPsec entre o VPN Gateway do Azure e o HA VPN do
   Google. O tráfego é cifrado, mas ainda passa pela internet: a latência varia e a banda do
   gateway tem teto.
3. **Serviço publicado, sem rota.** Quando você tem presença na mesma nuvem do fornecedor, ele pode
   **publicar um serviço** (Private Service Connect no Google, Private Link no Azure) em vez de
   abrir a rede dele para a sua. Ninguém anuncia faixas para ninguém; só um endpoint aparece do
   seu lado.
4. **Cross-Cloud Interconnect.** Um link físico gerenciado pelo Google entre a **sua** rede no
   Google Cloud e a sua rede em outra nuvem — AWS, Azure, Oracle Cloud ou Alibaba Cloud. Serve
   bem quando as duas pontas são suas; com o fornecedor numa organização dele, não resolve sozinho
   (**conferir** metros e condições vigentes).
5. **Interconexão via provedor de colocation, com o Fabric Cloud Router (FCR).** Um roteador L3
   virtual da Equinix, num metro, sem hardware: cada nuvem e cada parceiro entram por uma conexão,
   e o FCR roteia entre elas. É a solução de referência desta trilha.
6. **Conexão física dedicada em colocation.** Seus próprios roteadores e portas num data center de
   interconexão. Máximo controle, máximo prazo e máximo custo fixo.

## Os critérios que decidem

- **Volume e banda.** Milhares de chamadas por segundo, com payloads de alguns quilobytes, somam
  centenas de megabits — o que uma VPN aguenta, mas perto do teto dela.
- **Latência e jitter.** A internet é rápida em média e imprevisível na cauda; um link privado é
  previsível. Se o orçamento de latência do salto de rede é apertado, a cauda importa mais que a
  média (`system-design/08` trata o orçamento de latência em geral).
- **Custo de saída de dados.** As nuvens cobram pelo dado que sai, e a tarifa muda com o caminho;
  o marco 12 mostra como isso muda a decisão com o volume.
- **Exigência regulatória ou contratual.** "Este dado não trafega pela internet" é um requisito
  binário: ele elimina as opções 1 e 2, por mais baratas que sejam.
- **Quem opera.** Uma VPN é sua dos dois lados; um link via provedor tem três ou quatro donos.
- **Quantos parceiros: um ou N.** Montar um caminho privado para um fornecedor só raramente se
  paga; um roteador que recebe mais uma conexão a cada parceiro novo muda a conta.
- **Tempo até ficar de pé.** Dias para uma API, semanas para uma interconexão — com prazos de
  provisionamento que você não controla (marco 04).

## Por que o FCR é a referência desta trilha — e quando não é

O FCR ganha quando três coisas aparecem juntas: **não pode passar pela internet**, **há volume ou
latência que justifique um caminho privado** e **vêm mais parceiros**, em nuvens diferentes. Cada
parceiro novo é mais uma conexão no mesmo roteador, não um projeto novo. Fora disso, ele perde: para
um parceiro só, com volume baixo e sem exigência de rede privada, uma API com mTLS resolve em dias;
com as duas pontas suas, o Cross-Cloud Interconnect evita um intermediário; quando o fornecedor pode
publicar um serviço na sua nuvem, nenhuma faixa precisa ser anunciada.

```diagrama
cm-decisao
```

## A dívida mais comum: escolher pelo diagrama

A arquitetura de rede "bonita" — o desenho com o roteador no meio ligando tudo a tudo — é escolhida
antes de alguém medir o volume. Seis meses depois, a interconexão carrega 20 chamadas por minuto, o
custo fixo é o maior item da conta do fornecedor, e ninguém lembra por que não bastava uma API. A
decisão precisa de critérios escritos e de um **gatilho de revisão**: o volume que, se não aparecer
em seis meses, faz a decisão voltar à mesa (o formato de ADR é de `arquitetura-de-software/07`).

## Exemplo numa fintech

O score do `FornecedorScore` recebe 3 mil chamadas por segundo no pico. O contrato com o fornecedor
proíbe o tráfego do dado pela internet, e o roadmap já tem mais dois parceiros, em nuvens
diferentes, para o ano que vem. A árvore descarta a API pública e a VPN pela exigência do contrato;
descarta o serviço publicado porque o `fin-platform` não tem presença no Google Cloud; descarta o
Cross-Cloud Interconnect porque a rede do outro lado é do fornecedor. Sobra o FCR — e a ADR registra
que, se os dois parceiros novos não vierem em 12 meses, a decisão é revista.

## Hands-on

**Tutorial.** Instale o containerlab (em macOS ou Windows, numa VM Linux ou no WSL2) e suba um
"olá, laboratório" com dois hosts que se pingam. Em seguida, escreva `decisao/arvore.yaml` com os
critérios desta seção como perguntas e as seis opções como folhas.

**Desafio.** Escreva cinco cenários-gabarito, cada um com os critérios e a opção esperada, e um
teste que roda a árvore sobre eles.

**Invariantes testáveis**

1. Para cada cenário-gabarito, a árvore escolhe a opção esperada.
2. Toda folha da árvore é alcançada por pelo menos um cenário: não há opção morta.
3. Mudar só o critério "exige não usar internet" de não para sim **nunca** leva a "API pública".
4. A ADR de conectividade tem contexto, pelo menos três opções, a decisão e um **gatilho de
   revisão** — verificado por um lint de estrutura.

**Complemento.** Classifique três integrações reais do seu trabalho com a árvore e veja se a
escolha que foi feita bate com a que ela daria.

**Checagem**

1. Por que a exigência de não usar a internet elimina opções que são mais baratas?
2. Quando um serviço publicado é melhor do que uma rede roteada?
3. Por que o número de parceiros futuros muda a decisão de hoje?
4. O que é um gatilho de revisão, e por que uma decisão de interconexão precisa de um?

> **Reencontro — `arquitetura-de-solucoes/05`.** "Multinuvem sem romantismo" pede uma razão concreta
> para ligar nuvens; esta trilha é a rede dessa razão, quando ela existe.

A avaliação de comprar ou construir e de risco de fornecedor de `arquitetura-de-solucoes/04` vale
para o provedor de interconexão tanto quanto para o fornecedor de score; e o orçamento de latência
de `system-design/08` é a régua que diz se a cauda da internet cabe no salto de rede.

## Principais aprendizados

- Interconexão privada responde a volume, latência previsível e proibição de internet — não a
  "quero uma conexão privada".
- As opções vão da API pública com mTLS ao link dedicado; cada degrau custa mais e demora mais.
- Serviço publicado evita anunciar redes; Cross-Cloud Interconnect liga duas redes suas.
- O FCR ganha quando há proibição de internet, volume e vários parceiros em nuvens diferentes.
- Toda decisão de interconexão tem critérios escritos e um gatilho de revisão.
