---
id: core-e-legado
title: "Core bancário e legado"
summary: "O core é a fonte da verdade do saldo e raramente fala a sua língua; a camada que traduz é a que decide se o legado contamina o resto."
estimatedMinutes: 65
completion: quiz
references:
  - title: "Fundamentals of Software Architecture (Richards & Ford)"
    url: https://www.oreilly.com/library/view/fundamentals-of-software/9781492043447/
---

## Como são os *cores* bancários

Sistemas de *core banking* mais antigos costumam ter características que nenhum sistema moderno
assumiria por padrão: **arquivos posicionais** (formato de largura fixa, sem delimitador),
**fechamento em lote** (o dia "fecha" num horário específico, e dados mudam de significado antes e
depois disso), **janelas de manutenção** (indisponibilidade programada, às vezes diária), **API
lenta ou inexistente** (algumas operações só existem via arquivo, não via chamada síncrona), e
**codificações antigas** com **decimal e arredondamento** tratados de forma que precisa ser verificada
explicitamente, nunca assumida igual à representação moderna.

## Camada anticorrupção em escala

A ACL (`arquitetura-eventos/02`) que isola um domínio moderno de um modelo legado ganha, no nível de
integração entre sistemas, a mesma função em escala maior: **tradução** de formato, **isolamento de
tipos** (nenhum tipo do legado, nenhuma estrutura específica daquele arquivo posicional, aparece fora
da camada), e **tolerância a campo desconhecido** (um arquivo do legado ganha um campo novo que a
ACL não esperava — a resposta correta é ignorar o campo desconhecido com um alerta, nunca falhar a
integração inteira por um campo que ninguém está usando ainda).

## Encapsular × substituir

Duas estratégias para lidar com um legado: **encapsular** (colocar uma API moderna na frente do
sistema antigo, sem tocar o que está por dentro) ou **substituir** (trocar o sistema por um novo,
gradualmente). Encapsular é mais rápido e de menor risco imediato, mas preserva as limitações
internas do legado (ainda lento, ainda com fechamento em lote). Substituir resolve as limitações de
verdade, mas é um projeto muito maior, com todo o risco de uma migração completa.

## CDC e arquivos como ponte

**Change Data Capture** (`arquitetura-eventos/13`) ou arquivos (quando o legado não expõe CDC) são
as duas pontes típicas entre o core e o resto da plataforma — a escolha depende do que o core
efetivamente oferece, não de preferência arquitetural abstrata.

## Leitura degradada quando o core cai

Quando o core está indisponível (planejado, numa janela de manutenção, ou não), o resto do sistema
não precisa parar — pode servir **dado do dia anterior**, de cache, explicitamente **marcado como
defasado**. A alternativa (um erro opaco, sem explicação) é pior do que um dado levemente
desatualizado e claramente identificado como tal: o usuário sabe o que está vendo, em vez de só ver
"algo deu errado".

## Reconciliação entre core e plataforma

Periodicamente, os totais do core e os totais da plataforma precisam **bater** — e quando não batem,
a diferença precisa ser **classificada** (atraso normal de sincronização, estorno, erro real), nunca
simplesmente ignorada ou registrada sem ação associada.

## Corte, e execução em paralelo

Ao migrar do core para um substituto (ou mesmo ao encapsular de forma mais profunda), rodar os dois
**em paralelo** por um período, comparando resultados, antes de um **corte** completo
(`system-design/14`) reduz drasticamente o risco de uma falha descoberta só depois que não há mais
caminho de volta fácil.

## Padrões de mensagem do setor — exemplos, **confira**

O setor financeiro tem padrões de mensagem específicos (formatos de transferência, de cobrança) que
mudam e evoluem — citados aqui só como **exemplo de existência**, nunca implementados "de memória":
**confira** a versão e o formato vigente antes de assumir qualquer detalhe específico.

## Dependência do relógio e do calendário bancário

"Dia útil" não é um conceito universal — depende do calendário bancário específico (feriados
nacionais, feriados bancários que não coincidem com feriados gerais, fuso horário de onde o core
roda). Qualquer lógica que assume "hoje é dia útil" sem consultar o calendário correto é uma fonte
de bug sutil, geralmente descoberto só no primeiro feriado que a lógica não previa.

## Exemplo numa fintech

O core fecha o dia às 22h e entrega um arquivo posicional com o resultado do fechamento. O app
precisa mostrar o saldo ao cliente às 22h05 — cinco minutos depois do fechamento, antes que o
arquivo tenha sido processado pela ACL. A resposta correta não é mentir dizendo que o saldo está
atualizado, nem travar com um erro: é mostrar o saldo da última posição conhecida, explicitamente
marcado como "calculado até as 22h, aguardando fechamento do dia".

## Hands-on

**Tutorial.** Construa `fake-core/` (arquivo posicional, API lenta, fechamento em lote) e a camada
anticorrupção, em Java ou Go.

**Desafio.** Implemente leitura degradada e reconciliação.

**Invariantes testáveis**

1. ***Round-trip* posicional ↔ domínio sem perda**: converter do arquivo posicional para o modelo de
   domínio e de volta reproduz exatamente o arquivo original — testado por propriedade, com semente
   fixa, sobre um espaço de arquivos gerados.
2. **Nenhum tipo do legado aparece fora do pacote da ACL** — verificado por teste de arquitetura, a
   mesma disciplina de `arquitetura-de-software/04`.
3. **Reprocessar o mesmo arquivo é idempotente** — rodar duas vezes não duplica nenhum efeito.
4. Com a API do core **derrubada** na simulação, a leitura devolve o último dado disponível,
   **marcado como defasado** — nunca um erro opaco sem explicação.
5. A reconciliação **fecha ou classifica** cada diferença encontrada (atraso, estorno, erro) — nunca
   uma diferença sem ação ou classificação associada.

**Complemento.** Projete um corte em três fases, com um critério explícito de volta atrás em cada
fase, para uma migração real do seu contexto.

**Checagem**

1. Quais características típicas de um *core* bancário antigo (arquivo posicional, fechamento em
   lote, API lenta) exigem tratamento explícito na ACL?
2. Qual é a diferença entre encapsular e substituir, e quando cada estratégia faz mais sentido?
3. Por que leitura degradada marcada como defasada é preferível a um erro opaco quando o core está
   indisponível?
4. Por que executar em paralelo antes do corte reduz o risco de uma falha descoberta tarde demais?

> **Reencontro — `arquitetura-eventos/02`; `arquitetura-eventos/13`; `system-design/14`;
> `dados-distribuidos/14`; `spring-boot/08`.** A ACL de `arquitetura-eventos/02` ganha aqui a escala
> de integração entre sistemas inteiros, não só entre um bounded context e outro. O CDC de
> `arquitetura-eventos/13` é uma das duas pontes típicas entre core e plataforma. O *strangler* e a
> execução em paralelo de `system-design/14` são exatamente o padrão de corte que este marco aplica
> ao core legado especificamente. A separação OLTP/analítico de `dados-distribuidos/14` é outro
> exemplo do mesmo princípio de isolar um sistema de fonte de um sistema de consumo. E a resiliência
> (circuito, fallback) de `spring-boot/08` é o mecanismo que implementa a leitura degradada quando o
> core cai.

## Principais aprendizados

- *Cores* bancários antigos têm características estruturais (arquivo posicional, fechamento em
  lote, API lenta) que a ACL precisa tratar explicitamente, nunca assumir como "parecido com um
  sistema moderno".
- Tolerância a campo desconhecido é o que evita que um arquivo legado com um campo novo quebre a
  integração inteira por algo que ninguém está usando ainda.
- Encapsular é mais rápido e de menor risco imediato; substituir resolve limitações de verdade, mas
  é um projeto muito maior — a escolha depende do que compensa no contexto.
- Leitura degradada, explicitamente marcada como defasada, é preferível a um erro opaco quando o
  core está indisponível — o usuário sabe o que está vendo.
- Executar em paralelo antes do corte, comparando resultados, reduz o risco de uma falha descoberta
  só depois que não há mais caminho de volta fácil.
