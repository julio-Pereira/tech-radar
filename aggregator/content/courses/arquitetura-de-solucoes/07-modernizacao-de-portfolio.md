---
id: modernizacao-de-portfolio
title: "Modernização de portfólio"
summary: "Modernizar não é reescrever tudo: é decidir o que mover, o que trocar, o que desligar e em que ordem — e desligar é a entrega mais subestimada."
estimatedMinutes: 60
references:
  - title: "Fundamentals of Software Architecture (Richards & Ford)"
    url: https://www.oreilly.com/library/view/fundamentals-of-software/9781492043447/
---

## Estratégias por sistema: os "Rs" (vocabulário varia — **confira**)

Para cada sistema do portfólio, uma estratégia explícita: **manter** (como está, sem investimento
adicional), **hospedar como está** (mover a infraestrutura sem mudar o código), **replataformar**
(adaptações mínimas para rodar numa plataforma nova), **refatorar/rearquitetar** (mudança estrutural
significativa), **substituir** (trocar por outro sistema), ou **aposentar** (desligar). O vocabulário
exato desses "Rs" varia entre fontes diferentes — **confira** qual terminologia a organização adota,
em vez de assumir que todo material usa os mesmos termos com o mesmo significado.

## Pontuação de portfólio: valor × risco × custo da mudança × custo de adiar

Decidir qual sistema modernizar primeiro não é só "qual está mais velho" — uma pontuação que combina
**valor** (o que ganha ao modernizar), **risco** (o que pode dar errado), **custo da mudança**
(esforço de fazer agora), e **custo de adiar** (o que continua custando enquanto não se faz nada)
produz uma priorização mais defensável do que intuição ou "quem está reclamando mais alto".

## Sequenciamento por dependência: ordem topológica

Um sistema que é **consumido** por outro não deveria ser movido, trocado ou desligado antes do
consumidor estar pronto para essa mudança — a **ordem topológica** (derivada do grafo de
dependências do marco 01) garante que a sequência de modernização respeita essa restrição, em vez de
assumida por quem está planejando sem checar sistematicamente quem depende de quem.

## Critério de desligamento mensurável

"Aposentar" um sistema exige um critério **mensurável**, não uma sensação de que "acho que ninguém
usa mais isso": **tráfego zero por N dias** (medido, não assumido) e **consumidores conhecidos e
comunicados** (a lista de quem consome, confirmando explicitamente que já migrou, não silêncio
interpretado como "deve estar tudo bem").

## Dívida de portfólio, e o custo de manter dois sistemas

Durante uma migração, manter **dois** sistemas funcionando em paralelo (o antigo e o novo) tem custo
contínuo — de infraestrutura, de atenção operacional, de confusão sobre qual é a fonte da verdade
naquele momento. Esse custo precisa ser contabilizado explicitamente no plano de modernização, não
tratado como um detalhe temporário que "vai se resolver sozinho".

## Caso de negócio em uma página

Uma modernização de portfólio, para ser aprovada e priorizada ao lado de outras iniciativas, precisa
de um **caso de negócio** curto — não um documento de cinquenta páginas que ninguém vai ler até o
fim, mas o suficiente para justificar a prioridade frente a outras demandas competindo pelo mesmo
tempo de engenharia.

## Relação com *strangler*, e marcos com ponto de retorno

A execução de uma modernização, uma vez decidida, usa o padrão *strangler* e execução em paralelo já
tratados em `system-design/14` — este marco não reensina a técnica, trata da **decisão de
portfólio** que antecede a execução técnica. Cada marco do roteiro de modernização tem um **ponto de
retorno** declarado: até onde é fácil voltar atrás, e a partir de onde a reversão já fica cara ou
impossível.

## Exemplo numa fintech

Três sistemas no mapa: um para aposentar (um relatório interno que ninguém mais consome, confirmado
por tráfego zero há 60 dias), um para replataformar (um serviço que funciona bem, mas roda numa
infraestrutura que está sendo desligada por outro motivo), e um para manter (funciona, é barato de
operar, não há razão de negócio para investir nele agora). A ordem de execução respeita quem
consome quem: o sistema a aposentar não tem consumidor ativo, então pode ser desligado
imediatamente; o sistema a replataformar precisa esperar a infraestrutura nova estar pronta antes.

## Hands-on

**Tutorial.** Construa `portfolio/modelo.yaml` com a estratégia escolhida por sistema e o gerador de
roteiro.

**Desafio.** Implemente o critério de desligamento mensurável sobre logs simulados.

**Invariantes testáveis**

1. A ordem gerada pelo roteiro é **topológica**: nenhum sistema é movido antes do que ele consome,
   nem antes do que o consome (conforme a regra declarada de qual direção importa para aquele
   sistema específico).
2. Aposentar um sistema **com consumidor ativo** é **rejeitado** pelo modelo — verificado contra uma
   massa de dados conhecida com consumidores simulados.
3. O critério "tráfego zero por N dias" é **calculado** a partir de um log sintético, e **muda de
   resultado** (de "pode aposentar" para "não pode ainda") quando se injeta uma chamada tardia no
   log, mesmo que isolada.
4. Cada marco do roteiro de modernização tem **ponto de retorno** e **dono** declarados — nenhum
   marco sem essas duas informações.

**Complemento.** Estime o custo de manter dois sistemas em paralelo por mais um trimestre, para uma
modernização real do seu contexto de trabalho.

**Checagem**

1. Por que a pontuação de portfólio combina valor, risco, custo da mudança e custo de adiar, em vez
   de priorizar só por idade do sistema?
2. O que a ordem topológica garante que uma ordem escolhida por intuição não garante?
3. Por que "tráfego zero por N dias" é um critério melhor que "acho que ninguém usa mais isso" para
   decidir aposentar um sistema?
4. Por que o custo de manter dois sistemas em paralelo precisa ser contabilizado explicitamente no
   plano, em vez de tratado como detalhe temporário?

> **Reencontro — `system-design/14`; `arquitetura-eventos/13`; `kubernetes/14`;
> `observabilidade/16`.** O *strangler* e a execução em paralelo de `system-design/14` são a técnica
> de execução que este marco pressupõe, sem reensinar — aqui o foco é a decisão de portfólio que
> antecede essa execução. A migração sem parar de `arquitetura-eventos/13` é a disciplina aplicada
> especificamente a arquitetura orientada a eventos durante uma modernização. A decisão de custo e
> multi-tenancy de `kubernetes/14` é onde "quando desligar algo" já apareceu num contexto de
> infraestrutura específico. E o custo e cardinalidade de `observabilidade/16` é onde o custo de
> manter dois sistemas em paralelo se torna visível em número, não em intuição.

## Principais aprendizados

- Estratégias de modernização por sistema (manter, hospedar como está, replataformar, refatorar,
  substituir, aposentar) merecem decisão explícita, nunca default por inércia.
- Pontuação de portfólio por valor, risco, custo da mudança e custo de adiar produz priorização mais
  defensável do que intuição ou urgência percebida.
- Ordem topológica, derivada do grafo de dependências, garante que nenhum sistema é movido antes do
  que ele consome ou antes do que o consome.
- Critério de desligamento mensurável (tráfego zero por N dias, consumidores confirmados) substitui
  "acho que ninguém usa mais isso" por evidência verificável.
- O custo de manter dois sistemas em paralelo durante uma migração precisa ser contabilizado
  explicitamente — não é um detalhe temporário que se resolve sozinho.
