---
id: revisao-arquitetural-do-fin-platform
title: "Revisão arquitetural do fin-platform"
summary: "A prova de que você aprendeu arquitetura é revisar um sistema real e produzir riscos priorizados com dono e prazo, não um relatório de adjetivos. Capstone da trilha."
estimatedMinutes: 70
references:
  - title: "The Architect Elevator (Gregor Hohpe)"
    url: https://architectelevator.com/book/
---

## Como conduzir uma revisão

Uma revisão arquitetural segue uma estrutura: definir **escopo** (o que exatamente está sendo
revisado, e o que explicitamente não está), coletar **evidência** (ADRs, modelos, código — não
opinião de quem está sendo revisado sobre o próprio trabalho), avaliar contra **cenários de
qualidade** (os atributos que mais importam para aquele sistema específico), identificar **riscos** e
também **não-riscos** (coisas que pareciam arriscadas mas, examinadas, não são — tão valioso quanto
achar risco real, porque evita gastar atenção onde não precisa), e produzir **recomendações**.

## A revisão como comando

O valor real desta trilha se materializa quando a revisão não é um processo manual repetido do
zero a cada vez, mas um **comando** que agrega os *lints* e modelos dos marcos 01–08 (mapa de
capacidades, catálogo de integrações, ACL do core, modelo de TCO, políticas de nuvem, radar e
*paved road*, modelo de portfólio) — mais, se existir, o dossiê de estrutura
(`fin-structure`, trilha `arquitetura-de-software`) — tudo rodando junto, produzindo um relatório
único e reproduzível.

## Priorizar risco: impacto × probabilidade × facilidade de reversão

Nem todo risco merece a mesma atenção imediata — **impacto** (o quão mal as coisas ficam se o risco
se materializar), **probabilidade** (quão provável é), e **facilidade de reversão** (se acontecer,
quão caro é corrigir) juntos priorizam onde investir atenção primeiro. Um risco de alto impacto mas
fácil de reverter pode esperar; um risco de impacto moderado mas essencialmente irreversível merece
atenção antes.

## Recomendações **acionáveis**

Uma recomendação só é útil se tiver **decisão** (o que fazer, especificamente), **dono** (quem é
responsável por executar), **prazo** (até quando), e **critério de pronto** (como saber que foi
resolvido). "Deveríamos melhorar a integração com o sistema X" não é uma recomendação acionável;
"adicionar idempotent receiver à integração com o sistema X, dono: time Y, prazo: fim do trimestre,
pronto quando: teste de duplicata passa" é.

## Revisão em duas passagens: artefatos, depois entrevistas

Uma primeira passagem sobre **artefatos** (ADRs, PROJETOs, modelos, código) forma uma hipótese inicial
sobre onde estão os riscos. Uma segunda passagem de **entrevistas** (ou, no contexto desta trilha
sintética, releitura cuidadosa dos PROJETOs como se fossem entrevistas) confirma, refina ou corrige
essa hipótese com contexto que só quem trabalha diretamente no sistema teria.

## Como receber a revisão do próprio trabalho

Ser revisado não é o mesmo que ser acusado — uma revisão bem conduzida produz riscos e recomendações,
não um veredicto sobre a competência de quem construiu o sistema. Receber bem significa engajar com
as recomendações especificamente, não defender genericamente o trabalho already feito.

## O que **não** dá para revisar sem o sistema rodando

Uma revisão baseada só em artefatos estáticos (código, documentos) não consegue avaliar
comportamento real sob carga, nem o comportamento real de um incidente — isso exige o sistema
**rodando**, com dados reais de operação. A revisão desta trilha é honesta sobre essa limitação: ela
revisa o que pode ser revisado a partir de artefatos e modelos, não substitui observação de produção
real.

## Exemplo numa fintech

A revisão do `fin-platform` encontra que "saldo" não tem sistema de registro único (um problema do marco
01, nunca resolvido) e que uma integração por arquivo não tem *idempotent receiver* implementado (um
problema do marco 02). Os dois riscos são priorizados: o primeiro, de impacto alto e difícil de
reverter depois que mais sistemas passarem a depender da ambiguidade, recebe prazo mais curto; o
segundo, mais fácil de corrigir isoladamente, recebe prazo um pouco mais longo, mas ainda com dono e
critério de pronto definidos.

```diagrama
aso-revisao
```

## Hands-on

**Tutorial.** Construa `make review`, agregando os *lints* dos marcos 01–08 (e, se existir, o
dossiê de estrutura de `arquitetura-de-software`).

**Desafio.** Execute a revisão sobre o `fin-platform` completo e priorize os riscos encontrados.

**Invariantes testáveis**

1. O comando **falha** se **qualquer** *lint* agregado falhar — nenhuma falha é silenciosamente
   ignorada ou mascarada por outras verificações passando.
2. O relatório lista **cada** risco com **dono**, **prazo**, e **critério de pronto** — nenhum item
   sem os três campos.
3. Rodar a revisão **duas vezes**, sobre o mesmo estado do sistema, gera **o mesmo relatório** —
   determinismo verificado, não assumido.
4. Um risco injetado deliberadamente (uma violação plantada em alguma das verificações agregadas)
   **aparece** no relatório final — a revisão realmente pega o que foi plantado, não só o que já
   era esperado.

**Complemento.** Escreva a ADR "o que não revisamos e por quê" — documentando explicitamente as
limitações de escopo desta revisão específica.

**Checagem**

1. O que distingue um risco identificado de um "não-risco", e por que identificar não-riscos é
   tão valioso quanto identificar riscos reais?
2. Por que impacto, probabilidade e facilidade de reversão juntos priorizam melhor do que qualquer
   um isolado?
3. O que torna uma recomendação "acionável", em vez de uma observação genérica sem consequência
   prática?
4. Por que uma revisão baseada só em artefatos estáticos não consegue avaliar tudo que importa sobre
   um sistema real?

> **Reencontro — `system-design/15`; `observabilidade/15`; `seguranca-aplicacao/16`;
> `kubernetes/14`.** A trajetória de IC sênior/staff de `system-design/15` é onde a habilidade de
> conduzir uma revisão desse tipo, com credibilidade, é construída ao longo do tempo. A condução de
> incidente até a causa raiz de `observabilidade/15` segue a mesma disciplina de duas passagens
> (evidência, depois investigação mais profunda) que este marco aplica à revisão arquitetural. O
> programa de segurança de `seguranca-aplicacao/16` é outro exemplo de processo que só funciona
> quando produz recomendação acionável com dono e prazo, não relatório de adjetivos. E a decisão de
> custo e quando não usar de `kubernetes/14` é o tipo de não-risco ou risco real que uma revisão
> bem conduzida precisa distinguir com cuidado, não por intuição.

## Principais aprendizados

- Uma revisão arquitetural bem conduzida identifica riscos **e** não-riscos — os dois são valiosos,
  porque não-riscos evitam gastar atenção onde não precisa.
- A revisão como comando, agregando os *lints* e modelos dos marcos anteriores, produz um relatório
  reproduzível em vez de um processo manual repetido do zero a cada vez.
- Impacto, probabilidade e facilidade de reversão juntos priorizam risco melhor do que qualquer um
  isoladamente.
- Uma recomendação só é acionável com decisão específica, dono, prazo e critério de pronto — uma
  observação genérica não move nada.
- Uma revisão baseada só em artefatos estáticos não substitui observação de sistema rodando sob
  carga real — este marco é honesto sobre essa limitação de escopo.

## Capstone

O `fin-landscape` é o seu dossiê executável de soluções — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `paisagem/capacidades.yaml` e `sistemas.yaml`, com toda capacidade tendo exatamente um sistema
      de registro
- [ ] `integracoes/catalogo.yaml` com os simuladores de arquivo, API e evento, e *idempotent
      receiver* nos três
- [ ] `fake-core/` com a camada anticorrupção, leitura degradada e reconciliação
- [ ] Modelo de TCO com três cenários, relatório de sensibilidade e ADR com plano de saída
- [ ] `nuvem/` com fixtures conformes e violadoras, e as três políticas correspondentes
- [ ] `governanca/radar.yaml`, `excecoes.yaml` e o modelo de serviço conforme ao *paved road*
- [ ] `portfolio/modelo.yaml` com estratégia por sistema e o roteiro gerado
- [ ] Um RFC completo de uma decisão real do `fin-platform`, com a versão executiva
- [ ] `make review` agregando tudo, com relatório de riscos priorizados

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Toda capacidade do `fin-platform` tem **um** sistema de registro, dono e classificação de
      dado
- [ ] Toda integração está no catálogo com padrão, contrato, idempotência, modo de falha e dono
- [ ] A fronteira com o `fake-core` é uma ACL: nenhum tipo do legado aparece fora dela (teste de
      arquitetura)
- [ ] Existe reconciliação com o core e a diferença é classificada, não ignorada
- [ ] Toda decisão de comprar/hospedar tem TCO reproduzível, análise de sensibilidade, plano de
      saída e **gatilho de reversão**
- [ ] As políticas de nuvem têm *fixtures* que as **violam de propósito** e falham; a conforme passa
- [ ] Toda exceção de governança tem dono e **prazo**; vencida, quebra o CI
- [ ] O roteiro de modernização respeita dependências e tem critério mensurável de desligamento
- [ ] Existe um RFC completo, validado por *lint*, para uma decisão real do `fin-platform`
- [ ] `make review` gera o relatório com riscos priorizados, dono e prazo
- [ ] Nenhum fornecedor real avaliado, nenhum preço real, nenhum recurso em nuvem criado

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das nove
decisões que você tomou aqui, qual só se sustenta porque os fornecedores, o core e as regras de
nuvem eram fictícios e bem-comportados — e o que você mediria no primeiro contato com os reais?**
