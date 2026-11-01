---
id: limite-exposicao-e-concentracao
title: "Limite, exposição e concentração"
summary: "Limite é uma reserva que dois saques simultâneos não podem furar — e exposição é a soma do que você pode perder, não do que já perdeu."
estimatedMinutes: 60
---

## Limite por cliente, produto e carteira

**Limite** existe em três níveis: por **cliente** (quanto ele pode dever no total), por **produto**
(quanto no cartão, quanto no cheque especial) e por **carteira** (quanto a instituição aceita ter
em um segmento). Num **contrato fechado** o limite se consome uma vez, na concessão. No **limite
rotativo** — cartão, cheque especial — ele se consome e se recompõe o tempo todo: cada compra
reserva, cada pagamento libera. É o rotativo que transforma limite num problema de concorrência.

## Reserva atômica: o limite que não se fura

Dois saques chegam no mesmo instante. Se cada um lê "disponível: R$ 1.000", conclui que cabe e
grava, o limite fica negativo — a anomalia clássica de *lost update*. A solução é a mesma da
reserva no razão (`ledger-e-contabilidade/04`) e do saldo concorrente
(`concorrencia-e-recursos/10`): **verificar e reservar na mesma operação atômica**, uma escrita
condicional ("reserve 800 **se** disponível ≥ 800"). Um dos saques reserva; o outro recebe uma
**recusa explicada** ("limite insuficiente"), nunca um erro genérico.

```diagrama
cr-reserva-limite
```

A **liberação** também precisa ser idempotente: a mesma reserva liberada duas vezes (por retentativa
do estorno, por exemplo) libera **uma** vez — senão o limite cresce sozinho.

## Exposição não é saldo

**Exposição** é o quanto a instituição pode perder com o cliente, não o quanto ele já deve. Num
cartão com limite de R$ 5.000 e saldo de R$ 1.000, a exposição inclui o saldo **mais a parte
provável do limite ainda não usada**, porque clientes que vão inadimplir costumam usar o limite
antes. É o conceito de EAD do marco 06 aplicado ao rotativo: o **fator de conversão** (que fração do
não usado vira uso até o default) é um parâmetro estimado, declarado e medido.

## Aumento, redução e pré-aprovado

Aumentar o limite é uma nova decisão de crédito, pela política (marco 05). **Reduzir** tem uma
regra importante: reduzir abaixo do que já está usado **não cancela** o usado — o cliente continua
devendo o que deve, e só **novos** saques ficam bloqueados até o uso cair abaixo do novo limite. O
**pré-aprovado** é a oferta de limite antes do pedido; ela vem do motor de ofertas de
`ml-em-producao/01`, mas a concessão continua passando pela política.

## Concentração e grupo econômico

Uma carteira saudável no total pode estar perigosamente concentrada: 30% da exposição em um setor,
uma região, um canal, ou em **um grupo** de clientes ligados. A **consolidação por grupo
econômico** (empresas do mesmo dono, pessoas do mesmo relacionamento) soma exposições que, olhadas
uma a uma, parecem pequenas. Os **limites de concentração** são parte da política versionada: um
*limit breach* gera alerta com dono e, mais importante, **recusa a próxima concessão** que o
agravaria.

## Exemplo numa fintech

Um cliente tem R$ 1.000 disponíveis no limite do cartão. Dois saques de R$ 800, de dois
dispositivos, chegam com 3 ms de diferença. O `fin-lend` executa
`UPDATE limite SET usado = usado + 800 WHERE id = $1 AND limite - usado >= 800`: o primeiro afeta uma
linha e é aprovado; o segundo afeta zero linhas e volta com "limite insuficiente: disponível
R$ 200". O limite nunca fica negativo, e nenhum dos dois saques precisou de *lock* explícito.

## Hands-on

**Tutorial.** Implemente `limites/` com reserva atômica, liberação idempotente e limite por
cliente e por produto.

**Desafio.** Adicione limite agregado por grupo econômico e o alarme de concentração por setor,
com recusa da concessão que agravaria o estouro.

**Invariantes testáveis**

1. Sob **1.000 saques concorrentes**, a **soma aprovada ≤ limite** — teste com corrida, rodando
   com `-race`.
2. **Liberar duas vezes** a mesma reserva libera uma vez (idempotência).
3. **Reduzir o limite** abaixo do utilizado **não** cancela o utilizado e **bloqueia** novos saques.
4. A **exposição agregada** de um grupo é igual à soma das exposições das partes (propriedade).
5. Estourar o limite de concentração gera **alerta** e **recusa** a próxima concessão que o
   agravaria.
6. Toda alteração de limite é **versionada** e auditável — quem, quando, de quanto para quanto,
   por qual decisão.

**Complemento.** Descreva como o limite do seu produto é reservado hoje e qual é a janela em que
ele pode ficar inconsistente.

**Checagem**

1. Por que "ler o disponível e depois gravar" fura o limite sob concorrência?
2. Por que a exposição de um rotativo é maior que o saldo?
3. O que acontece com o saldo usado quando o limite é reduzido abaixo dele?
4. Por que a concentração precisa ser medida por grupo econômico, e não só por cliente?

> **Reencontro — `concorrencia-e-recursos/10` e `/03`.** O débito concorrente sem saldo negativo e
> as primitivas de exclusão mútua estão lá; o limite rotativo é o mesmo problema com outro nome, e
> a escrita condicional é a solução que dispensa *lock* explícito.

A idempotência por identidade de `dados-distribuidos/10` é o que torna a liberação segura sob
retentativa; e o motor de ofertas de `ml-em-producao/01` é a origem do pré-aprovado, que este marco
trata como entrada da política, não como concessão.

## Principais aprendizados

- Limite rotativo é um problema de concorrência: verificar e reservar na mesma operação atômica.
- A liberação é idempotente; senão o limite cresce sozinho.
- Exposição = saldo + parte provável do limite não usado: o EAD aplicado ao rotativo.
- Reduzir o limite não cancela o usado; bloqueia novos saques.
- Concentração se mede por setor, região, canal e grupo econômico, e o estouro recusa a próxima
  concessão que o agravaria.
