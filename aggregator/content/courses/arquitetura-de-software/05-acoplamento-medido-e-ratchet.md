---
id: acoplamento-medido
title: "Acoplamento medido e ratchet"
summary: "Acoplamento que não é medido cresce; acoplamento que é medido sem ratchet vira número ignorado."
estimatedMinutes: 60
references:
  - title: "Building Evolutionary Architectures (Ford, Parsons, Kua)"
    url: https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/
---

## Acoplamento aferente, eferente, e instabilidade

**Acoplamento aferente** (`Ca`) conta quantos outros módulos dependem **deste** módulo. **Acoplamento
eferente** (`Ce`) conta de quantos outros módulos **este** módulo depende. A **instabilidade**
`I = Ce / (Ca + Ce)` resume os dois num número entre 0 (totalmente estável — muitos dependem dele,
ele não depende de quase nada) e 1 (totalmente instável — depende de muita coisa, quase nada depende
dele). Módulos estáveis deveriam mudar pouco; módulos instáveis podem mudar livremente, porque pouca
coisa quebra quando mudam.

## Abstração e a "sequência principal"

Um módulo estável que também é concreto (pouca abstração, muita implementação direta) é rígido: difícil
de estender sem modificar. A ideia da **sequência principal** relaciona instabilidade com abstração —
módulos estáveis deveriam ser abstratos (interfaces, contratos), e módulos concretos deveriam ser
instáveis (podem mudar, porque poucos dependem deles diretamente). Um módulo estável e totalmente
concreto é a "zona de dor": muita coisa depende dele, e ele é difícil de mudar sem quebrar os
dependentes.

## Dependências cíclicas, e como quebrar

Um **ciclo** de dependência entre módulos (A depende de B que depende de A) é sempre um problema —
mesmo que o código compile e funcione, o ciclo significa que os dois módulos só podem ser entendidos,
testados e mudados juntos, nunca isoladamente. Três formas de quebrar um ciclo: **inversão** (um dos
lados passa a depender de uma interface que o outro implementa, invertendo a direção concreta),
**extração de interface** (um terceiro módulo, mais estável, define o contrato que os dois
consomem), e **extração via evento** (em vez de A chamar B diretamente e B chamar A de volta, A
publica um evento que B consome — quebrando a dependência síncrona bidirecional).

```diagrama
as-ciclo
as-ciclo-quebrado
```

## O princípio das dependências estáveis

Um módulo não deveria depender de outro **menos estável** que ele mesmo — se o módulo A é estável
(muita coisa depende dele) e depende de B, que é instável (B muda com frequência), toda mudança em
B se propaga até A e de A até todos os dependentes de A. A violação desse princípio é detectável
automaticamente comparando a instabilidade dos dois lados de cada dependência.

## *Connascence*: o vocabulário de força de acoplamento

**Connascence** nomeia os diferentes **tipos** de acoplamento, por força crescente: de nome (dois
módulos precisam concordar no nome de algo), de tipo, de posição (ordem de parâmetros), de
algoritmo (os dois precisam implementar a mesma lógica de forma consistente), e as formas mais
fortes e mais perigosas — **acoplamento temporal** (a ordem de chamadas importa, e não é visível no
tipo) e **acoplamento de dados** (dois módulos compartilham o mesmo armazenamento — o banco
compartilhado é o caso extremo). Ter o vocabulário certo permite dizer "este acoplamento é de tipo,
é barato de mudar" versus "este é temporal, é caro e invisível" — uma distinção que "está tudo
acoplado" não permite fazer.

## Extrair o grafo: ferramentas por linguagem

**Java**: `jdeps` ou ArchUnit extraem o grafo de dependências entre pacotes diretamente do bytecode
ou do código-fonte. **Go**: `go list` com as flags certas produz o mesmo tipo de grafo a partir dos
imports reais — não o que o diagrama diz, o que o código **de fato** importa.

## *Fitness function* com *ratchet*: o valor nunca piora

Uma métrica sem consequência é decoração. Um ***ratchet*** torna a métrica uma barreira: uma linha
de base é versionada junto com o código, e o CI falha se um commit **piora** a métrica (mais ciclos,
instabilidade maior numa dependência que violava o princípio de dependências estáveis) — mas
**passa**, e atualiza a linha de base, quando a métrica melhora. Isso resolve o problema clássico de
"não dá para proibir todo acoplamento de uma vez, o código legado já tem muito" sem abrir mão de
nunca mais deixar piorar.

```diagrama
as-ratchet
```

## Limites por módulo, sem punir o código novo por dívida antiga

Um limite único e rígido para o repositório inteiro penaliza um módulo novo e limpo pela dívida de um
módulo antigo que ainda não foi corrigido. O *ratchet* por módulo evita isso: cada módulo tem sua
própria linha de base, e um módulo novo nasce com um limite apertado desde o primeiro commit — a
dívida de um módulo não contamina o padrão exigido de outro.

## Exemplo numa fintech

O módulo `pagamentos` passa a importar `relatorios` "só para reusar uma constante" — um motivo
aparentemente inofensivo. Isso cria um ciclo se `relatorios` já importava algo de `pagamentos`
antes. O *ratchet* pega esse commit específico: o número de ciclos subiu de 0 para 1, e o CI falha
antes do merge, com a mensagem exata de qual dependência nova criou o ciclo — não é preciso esperar
um incidente de produção para descobrir.

## Hands-on

**Tutorial.** Escreva um script que extrai o grafo de pacotes do `fin-structure` e calcula
instabilidade por módulo, em Java e em Go.

**Desafio.** Implemente o *ratchet* com linha de base versionada.

**Invariantes testáveis**

1. **Zero ciclos** entre módulos — verificado por teste sobre o grafo extraído, não por inspeção
   visual de diagrama.
2. O script calcula `Ca`, `Ce` e `I` **corretamente** sobre um grafo de **valores conhecidos**
   construído especificamente para testar o próprio script (teste do script, não só do sistema).
3. O *ratchet* **falha** quando um commit sintético aumenta ciclos ou instabilidade além da linha de
   base, e **passa** (atualizando a linha de base) quando a métrica melhora.
4. Uma violação do princípio das dependências estáveis é **listada** no relatório, nunca escondida
   ou silenciosamente ignorada.

**Complemento.** Classifique 5 exemplos reais de acoplamento do seu próprio trabalho por tipo de
*connascence* (nome, tipo, posição, algoritmo, temporal, de dados).

**Checagem**

1. O que a instabilidade `I = Ce / (Ca + Ce)` mede, e o que significam os valores extremos 0 e 1?
2. Quais são as três formas de quebrar um ciclo de dependência citadas neste marco?
3. O que o princípio das dependências estáveis proíbe, e por que a violação é detectável
   automaticamente?
4. Por que um *ratchet* por módulo é melhor que um limite único para o repositório inteiro?

> **Reencontro — `system-design/03`; `spring-boot/13`; `kafka/07`; `arquitetura-eventos/06`.** A
> fronteira de módulo medida aqui é o mesmo tipo de fronteira que `system-design/03` trata no nível
> de sistema — aqui, a régua é dependência de pacote, não latência de rede. O Spring Modulith de
> `spring-boot/13` é onde esse acoplamento é medido na prática em um projeto Java real. O contrato
> de schema de `kafka/07` é uma forma de acoplamento de tipo (*connascence*) entre produtor e
> consumidor, tornado explícito. E a projeção de `arquitetura-eventos/06` é o padrão de extração via
> evento que este marco usa para quebrar um ciclo síncrono.

## Principais aprendizados

- Instabilidade (`I = Ce / (Ca + Ce)`) resume dependência aferente e eferente num número só, e a
  sequência principal relaciona isso com o grau de abstração esperado do módulo.
- Ciclos de dependência se quebram por inversão, extração de interface, ou extração via evento —
  três ferramentas distintas para o mesmo problema.
- *Connascence* dá vocabulário para distinguir acoplamento barato (nome, tipo) de acoplamento caro e
  invisível (temporal, de dados).
- Uma métrica sem *ratchet* é decoração; um *ratchet* com linha de base versionada torna "nunca
  piorar" uma regra do CI, não uma boa intenção.
- *Ratchet* por módulo evita punir código novo pela dívida de um módulo antigo que ainda não foi
  corrigido.
