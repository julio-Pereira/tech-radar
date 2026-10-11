---
id: integracao-entre-sistemas
title: "Integração entre sistemas"
summary: "Integrar é escolher quem fica acoplado a quê e como a falha se propaga; o padrão certo depende do que acontece quando o outro lado cai."
estimatedMinutes: 65
completion: quiz
references:
  - title: "Enterprise Integration Patterns (Hohpe & Woolf)"
    url: https://www.enterpriseintegrationpatterns.com/
---

## Quatro estilos clássicos

**Transferência de arquivo**: um sistema produz um arquivo (geralmente em lote, numa janela), o outro
consome quando está pronto — desacoplamento temporal forte, mas com latência inerente. **Banco
compartilhado**: dois sistemas leem e escrevem nas mesmas tabelas — e é, quase sempre, o **pior**
padrão dos quatro, porque nenhum dos dois pode mudar o schema sem coordenar com o outro, e a
fronteira de responsabilidade desaparece. **Chamada remota (RPC/API)**: um sistema chama o outro
diretamente, síncrono por natureza (`system-design/08`). **Mensageria/eventos**: um sistema publica,
outro consome, de forma assíncrona e desacoplada no tempo.

## Síncrono × assíncrono como decisão de acoplamento temporal

A escolha entre chamada síncrona e mensageria não é de preferência de estilo — é sobre **o que
acontece quando o outro lado está indisponível**. Síncrono propaga a indisponibilidade imediatamente
(se o outro lado não responde, a chamada falha agora). Assíncrono absorve a indisponibilidade
temporariamente (a mensagem espera na fila até o consumidor voltar) — ao custo de a resposta não ser
imediata. `system-design/08` já tratou esse orçamento de latência; aqui a mesma decisão aparece entre
sistemas inteiros, não só entre componentes de um sistema.

## Orquestração × coreografia

**Orquestração**: um componente central decide a sequência de chamadas a outros sistemas,
coordenando o processo. **Coreografia**: cada sistema reage a eventos e decide sua própria próxima
ação, sem um coordenador central. A trilha `arquitetura-eventos` já trata a disciplina de sagas em
profundidade; aqui a escolha entre as duas abordagens entra como critério de integração entre
sistemas que pertencem a times ou fornecedores diferentes, onde o acoplamento organizacional importa
tanto quanto o técnico.

## Padrões essenciais de integração

***Idempotent receiver***: o consumidor trata a mesma mensagem entregue duas vezes como se fosse uma
única vez. ***Message translator***: converte o formato de um sistema para o formato que o outro
espera, isolando a tradução num ponto só. ***Content-based router***: direciona uma mensagem para
destinos diferentes com base no seu conteúdo. ***Dead letter***: uma mensagem que falhou
repetidamente vai para uma fila separada, em vez de bloquear o processamento das mensagens seguintes
ou ser descartada silenciosamente. ***Canonical model***: um formato de dados comum que todos os
sistemas usam para se comunicar — útil para reduzir tradução ponto a ponto, mas com uma crítica séria:
um modelo canônico mal mantido **vira gargalo**, porque toda mudança precisa de consenso entre todos
os sistemas que o usam.

## Contrato e versionamento

Toda integração tem um **contrato** (o formato exato do que é trocado) que precisa de **versionamento**
explícito — a mesma disciplina de `system-design/05` e `kafka/07`, aqui aplicada entre sistemas que
podem pertencer a equipes ou até organizações diferentes, onde a coordenação de uma mudança
incompatível é ainda mais cara do que dentro da mesma equipe.

## Janela de *batch*, e fuso/relógio

Uma integração por arquivo em lote tem uma **janela** (quando o arquivo é gerado, quando é esperado) —
e cruzar fusos horários ou depender do relógio de sistemas diferentes para definir essa janela é uma
fonte recorrente de bugs sutis: "o arquivo do dia" significa dias diferentes dependendo de qual
relógio e qual fuso decide onde o dia começa e termina.

## Propriedade do contrato: quem muda, quem avisa

Um contrato de integração precisa de **dono** explícito — e o dono não é necessariamente quem
consome ou quem produz, pode ser uma função de arquitetura responsável por coordenar mudanças entre
os dois lados. Sem essa clareza, "quem eu avisava antes de mudar isso?" se torna uma pergunta sem
resposta no momento em que a mudança já está sendo planejada.

## Catálogo de integrações, com modo de falha, idempotência e SLA

Cada integração registrada deveria declarar: padrão usado, contrato, estratégia de idempotência,
**modo de falha** (o que acontece quando o outro lado cai, por quanto tempo isso é tolerável), SLA, e
dono. Sem esse catálogo centralizado, "quais sistemas dependem deste aqui, e o que acontece se ele
cair?" é uma pergunta respondida por memória de quem está presente, não por consulta a um registro
confiável.

## Antipadrões

**Integração por banco compartilhado**: já tratado acima, o pior padrão. **Contrato implícito**: dois
sistemas se comunicam sem um contrato explícito escrito em lugar nenhum — funciona até alguém mudar
um dos dois lados sem saber do outro. **"O outro lado sempre responde"**: a suposição otimista que
nenhuma integração real deveria fazer — todo lado remoto, cedo ou tarde, vai estar indisponível,
lento, ou retornando erro.

## Exemplo numa fintech

O mesmo repasse financeiro é integrado de três formas diferentes, dependendo do parceiro: por arquivo
noturno (com um parceiro legado), por API síncrona (com um parceiro moderno), e por evento (com um
sistema interno). Quando o destino de cada integração fica indisponível por duas horas, os três se
comportam de formas completamente diferentes: o arquivo simplesmente espera até a próxima janela; a
API síncrona falha imediatamente a cada tentativa durante as duas horas; o evento acumula na fila e é
processado em lote quando o consumidor volta.

## Hands-on

**Tutorial.** Construa `integracoes/catalogo.yaml` e três simuladores (arquivo, API, evento) com
falha injetável.

**Desafio.** Adicione *idempotent receiver* aos três simuladores.

**Invariantes testáveis**

1. Sob a **mesma sequência de falhas injetadas**, os três simuladores, **com** idempotência,
   chegam a **0 perdas e 0 duplicatas** no destino — asserção rígida.
2. **Sem** idempotência, a **duplicata é demonstrada** e contada explicitamente — o lado quebrado
   como demonstração, não escondido.
3. Todo item do catálogo tem padrão, contrato, estratégia de idempotência, modo de falha, SLA e
   dono — verificado por *lint* sobre o arquivo, nenhum campo opcional.
4. Alterar o contrato de uma integração **sem versionar** quebra um teste de compatibilidade —
   verificado contra uma mudança incompatível conhecida.

**Complemento.** Classifique 5 integrações reais do seu próprio trabalho usando o catálogo deste
marco — padrão, modo de falha, dono.

**Checagem**

1. Por que banco compartilhado é descrito como o pior dos quatro estilos de integração?
2. Qual é o critério real que decide entre chamada síncrona e mensageria — não estilo, o quê?
3. Por que um modelo canônico mal mantido vira gargalo, apesar de reduzir tradução ponto a ponto?
4. O que o catálogo de integrações precisa registrar para responder "o que acontece se este sistema
   cair?" sem depender de memória de alguém presente?
5. Por que um dead letter existe em vez de simplesmente descartar uma mensagem que falhou
   repetidamente?
6. O que distingue um contrato implícito de um contrato explícito versionado, e por que o primeiro
   "funciona até não funcionar"?

> **Reencontro — `system-design/05`; `system-design/08`; `arquitetura-eventos/08`;
> `arquitetura-eventos/09`; `kafka/07`.** APIs como contrato, em `system-design/05`, é exatamente o
> que este marco exige para toda integração registrada no catálogo. O orçamento síncrono/assíncrono
> de `system-design/08` é a mesma decisão de acoplamento temporal, aqui entre sistemas inteiros.
> Outbox/inbox e idempotência de `arquitetura-eventos/08` é o mecanismo por trás do *idempotent
> receiver* deste marco. Sagas de `arquitetura-eventos/09` é a disciplina completa por trás da
> escolha entre orquestração e coreografia. E o contrato de schema de `kafka/07` é o mesmo
> versionamento aplicado ao formato de evento específico.

## Principais aprendizados

- Banco compartilhado é, quase sempre, o pior dos quatro estilos de integração — nenhum lado pode
  mudar o schema sem coordenar com o outro.
- A escolha entre síncrono e assíncrono é sobre o que acontece quando o outro lado está
  indisponível, não sobre preferência de estilo.
- Um modelo canônico reduz tradução ponto a ponto, mas vira gargalo se mal mantido — toda mudança
  precisa de consenso entre todos que o usam.
- O catálogo de integrações, com modo de falha e dono declarados, substitui memória de alguém
  presente por consulta a um registro confiável.
- "O outro lado sempre responde" é a suposição otimista que nenhuma integração real deveria fazer —
  todo lado remoto fica indisponível, cedo ou tarde.
