---
id: custo-e-capacidade-de-interconexao
title: "Custo e capacidade"
summary: "Interconexão tem custo fixo alto e marginal baixo; a decisão certa depende do volume — e o volume muda."
estimatedMinutes: 55
references:
  - title: "Azure ExpressRoute — preços"
    url: https://azure.microsoft.com/pricing/details/expressroute/
  - title: "Google Cloud — preços do Cloud Interconnect"
    url: https://cloud.google.com/network-connectivity/docs/interconnect/pricing
  - title: "Equinix Fabric Cloud Router — pacotes (API)"
    url: https://docs.equinix.com/fabric-cloud-router/fcr-api/fcr-packages-pricing-api
---

## Fixo alto, marginal baixo

Uma VPN custa pouco para existir e cobra cada gigabyte que passa pela internet. Uma interconexão
privada custa caro para existir — pacote do FCR, conexões, circuito, gateway — e cobra pouco por
gigabyte. A consequência é uma curva com cruzamento: abaixo de certo volume, a VPN é mais barata;
acima, a interconexão. A decisão certa depende do volume, e o volume muda: o que era caro com um
parceiro pode ser barato com três.

Este marco não tem preço real. O modelo usa **preços fictícios, declarados como tais**; o que se
ensina é *o que* cobra e *como* cobra, para que você preencha o modelo com os números do seu
contrato.

## O que cobra

| Componente | Como costuma cobrar |
| --- | --- |
| Pacote do FCR | mensalidade fixa por pacote (marco 05) |
| Conexões do Fabric | por conexão e pela banda contratada |
| Circuito ExpressRoute | por banda, com plano de dados medido ou ilimitado |
| ExpressRoute Gateway | por hora, conforme o SKU |
| VLAN attachment | por hora e pela capacidade, do lado de quem o tem |
| Saída de dados de cada nuvem | por GB, com tarifa própria quando sai por interconexão |
| VPN (alternativa) | gateway por hora e saída de dados pela internet |

Os modelos de cobrança mudam e têm variações regionais (**conferir** na página de preços de cada
fornecedor). Dois cuidados valem sempre: a **saída de dados** costuma ser a linha que cresce com o
volume, e o plano **medido × ilimitado** do circuito ExpressRoute inverte de vantagem conforme o
volume, como a curva inteira.

## Ponto de equilíbrio

Com custo fixo F e marginal m por TB para cada opção, o custo mensal é F + m × volume, e o ponto de
equilíbrio entre duas opções é o volume em que os custos se igualam: (F₂ − F₁) ÷ (m₁ − m₂). No
modelo fictício do diagrama, a VPN empata com o FCR em 45 TB por mês.

```diagrama
cm-custo
```

O número exato importa menos que duas perguntas: em que lado do cruzamento você está hoje, e para
que lado o volume está indo. E o custo fixo do FCR se **divide** entre os parceiros: com três
parceiros, cada um carrega um terço do fixo, e o cruzamento por parceiro chega bem antes.

## Sensibilidade

Um modelo de custo com um ponto só engana. A **análise de sensibilidade** varia cada parâmetro (o
preço da saída, o pacote, o volume previsto, o número de parceiros) em ±20% e lista os que
**invertem** a decisão. Se a escolha entre VPN e FCR muda com 20% a mais de volume, a decisão está no
fio da navalha e precisa de revisão periódica; se nenhum parâmetro a inverte, ela está firme.

## Capacidade

Custo e capacidade são o mesmo problema visto de dois lados. A **banda contratada** de cada conexão
(e o limite do pacote do FCR) é o teto; o tráfego real tem rajadas. O **95º percentil** é a medida
usual de uso de banda: descarta os 5% de amostras mais altas do mês e olha o maior valor que sobra,
o que ignora os picos curtos sem ignorar o uso sustentado. Ele também é a forma de cobrança de
alguns provedores de trânsito.

Planejar capacidade é acompanhar o 95º percentil contra a banda contratada, com um alerta de
capacidade abaixo do teto e o prazo de ampliação conhecido — aumentar a banda de uma conexão pode ou
não acontecer sem queda (**conferir** em cada produto).

## Custo da redundância

O segundo caminho do marco 10 dobra boa parte do custo fixo: segundo FCR, segundas conexões, segundo
attachment. Esse custo se justifica pelo SLA composto que ele compra, e a conta deve estar escrita:
quanto custa por ano a indisponibilidade que a redundância evita, contra quanto custa a redundância.

## Showback e desligamento

Com vários parceiros no mesmo FCR, o custo precisa ser atribuído a cada um — o **showback**: a parte
do fixo por parceiro e o marginal pelo volume de cada um. A soma por parceiro fecha com o total, e
isso é um teste. O showback também responde à pergunta que ninguém faz: quando desligar. Um parceiro
cujo custo de conexão passou do valor do contrato é candidato a voltar para VPN ou a sair.

## Exemplo numa fintech

No primeiro ano, o `fin-platform` tinha só o `FornecedorScore`, com 20 TB por mês: pelo modelo, a
VPN seria mais barata, e a interconexão se justificava só pela exigência do contrato de não usar a
internet. No ano seguinte, entram mais dois parceiros pelo mesmo FCR, e o volume total passa de 60
TB. O modelo mostra que o FCR passou a ser também a opção mais barata, e o showback divide o custo
fixo entre os três times que usam o caminho.

## Hands-on

**Tutorial.** Escreva `custo/modelo.go` com as três opções (VPN, FCR e Cross-Cloud Interconnect),
preços fictícios declarados num arquivo de parâmetros, e o cálculo do ponto de equilíbrio.

**Desafio.** Sobre uma série de tráfego sintética de um mês, calcule o 95º percentil e dispare o
alerta de capacidade acima do limiar.

**Invariantes testáveis**

1. O modelo é determinístico, e o ponto de equilíbrio calculado pela fórmula coincide com o da busca
   numérica.
2. O relatório de sensibilidade lista cada parâmetro que, com ±20%, **inverte** a decisão.
3. O 95º percentil calculado da série sintética bate com o gabarito, e o alerta de capacidade
   dispara acima do limiar.
4. O custo por parceiro soma o total (o showback fecha).

**Complemento.** Levante os componentes de custo reais da sua interconexão, sem publicar os valores:
quais linhas existem, e quem paga cada uma?

**Checagem**

1. Por que custo fixo alto e marginal baixo produz um ponto de equilíbrio?
2. Por que a saída de dados é a linha a vigiar?
3. O que o 95º percentil mede que a média não mede?
4. Como o número de parceiros muda o ponto de equilíbrio?

> **Reencontro — `arquitetura-de-solucoes/04`.** O custo total de propriedade de comprar ou construir
> é a mesma conta deste marco: fixo, marginal e o horizonte em que a decisão é avaliada.

A cardinalidade e a retenção de `observabilidade/16` têm a mesma forma: um custo que cresce com o
volume e precisa de limiar, alerta e dono.

O FinOps de `engenharia-de-plataforma/08` dá o processo em volta: showback, orçamento por time e
revisão periódica, agora com a interconexão como mais uma linha.

## Principais aprendizados

- Interconexão tem custo fixo alto e marginal baixo; VPN, o contrário; o volume decide.
- A saída de dados é a linha que cresce; o plano do circuito inverte de vantagem com o volume.
- O ponto de equilíbrio é uma fórmula; a sensibilidade diz se a decisão está firme.
- O 95º percentil contra a banda contratada é o planejamento de capacidade.
- Com vários parceiros, o fixo se divide, e o showback precisa fechar com o total.
