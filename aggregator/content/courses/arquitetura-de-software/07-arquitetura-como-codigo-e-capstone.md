---
id: arquitetura-como-codigo
title: "Arquitetura como código e capstone"
summary: "Documentação de arquitetura que não é comparada com o código já está desatualizada — só não se sabe quanto. Capstone da trilha."
estimatedMinutes: 60
references:
  - title: "The C4 model"
    url: https://c4model.com/
  - title: "arc42 — template de documentação de arquitetura"
    url: https://arc42.org/
---

## C4 como código, e diagramas gerados

Um modelo C4 (`system-design/01`) escrito em texto versionado — não desenhado numa ferramenta
visual proprietária — pode ser **comparado programaticamente** com o código real, e os diagramas
são **gerados** a partir desse texto, não desenhados à mão e esquecidos. A ferramenta exata (há
várias, por ADR) importa menos que a propriedade central: o modelo é um artefato que o CI pode ler,
não uma imagem presa num documento que ninguém atualiza.

## arc42 como roteiro, não formulário obrigatório inteiro

O template arc42 oferece uma estrutura completa de documentação de arquitetura — mas poucos
projetos precisam de todas as seções preenchidas com o mesmo rigor. Usar arc42 como **roteiro** (uma
lista do que vale considerar documentar) em vez de formulário obrigatório evita o antipadrão de
documentação que existe só para "estar completa", sem que ninguém a leia ou mantenha.

## Comparação modelo × código: onde o *drift* aparece

O valor real de ter o modelo como código é poder compará-lo, de forma automática, com as
dependências **reais** extraídas do código (o mesmo grafo do marco 05) — se o modelo diz que
`pagamentos` só fala com `ledger`, e o grafo real mostra uma chamada a `relatorios` que ninguém
atualizou no modelo, isso é ***drift***: divergência entre o que o modelo afirma e o que o sistema
realmente faz. *Drift* não é necessariamente um erro — pode ser uma decisão legítima que só não foi
documentada — mas é sempre algo que precisa ser **visto**, nunca descoberto por acidente meses
depois.

## ADR log: status, substituição, e gatilho de reversão

Um registro de ADRs (`system-design/01`) só cumpre sua função se for **consultável como log**, com
`status` (proposta, aceita, substituída), data, alternativas consideradas e, de novo, o **gatilho de
reversão** que aparece em toda trilha desta série — a condição concreta que faria reconsiderar a
decisão. Uma ADR "substituída" deveria linkar explicitamente para a ADR que a substituiu; um link
que aponta para uma ADR que não existe é um erro de forma, verificável por *lint*, não de conteúdo.

## Regras de arquitetura como parte do repositório e da revisão

As regras de arquitetura escritas nos marcos anteriores (dependência do núcleo, zero ciclos,
*ratchet* de instabilidade) não são documentação à parte — são **código no repositório**,
executadas a cada *pull request*, com o mesmo peso que qualquer outro teste que bloqueia o merge.

## Documentação viva, gerada de testes e do código

Parte da documentação mais confiável que existe não é escrita diretamente — é **gerada**: exemplos
de uso extraídos de testes que realmente passam, diagramas extraídos do grafo de dependências real,
contrato de porta documentado pelo próprio teste de contrato (marco 04). Documentação gerada não
pode ficar desatualizada da mesma forma que prosa escrita à mão, porque ela é recalculada a cada
execução.

## O que **não** automatizar

Decisões e seus porquês não são automatizáveis — nenhuma ferramenta extrai do código **por que** a
equipe escolheu hexagonal em vez de camadas para um módulo específico, ou **por que** um atributo de
qualidade foi priorizado sobre outro. Isso é exatamente o que uma ADR captura, e é por isso que ADR e
arquitetura como código são complementares, não substitutos um do outro: o código mostra o quê; a
ADR explica o porquê.

## Exemplo numa fintech

O diagrama C4 do `fin-platform` afirma que `pagamentos` só depende de `ledger`. O script de
comparação, rodando contra o grafo real extraído do código, encontra uma chamada direta a
`relatorios` que ninguém documentou — introduzida meses atrás, num PR que passou todos os outros
testes porque nenhum deles comparava modelo com código real. O *drift* é listado, com a opção de
atualizar o modelo (se a dependência for legítima) ou remover a dependência (se não for) — a decisão
é humana, mas a detecção não dependeu de ninguém lembrar de checar.

## Hands-on

**Tutorial.** Construa `modelo/` com C4 como código e o script que compara o modelo com o grafo
extraído no marco 05.

**Desafio.** Implemente o *lint* de ADR (status, alternativas, gatilho de reversão, links de
substituição válidos).

**Invariantes testáveis**

1. O *drift* entre modelo e código é **zero**, ou está **listado e justificado** explicitamente —
   nunca silenciosamente ignorado.
2. Todo contêiner/módulo no modelo C4 tem um `owner` declarado.
3. Toda ADR tem `status`, `data`, alternativas consideradas e **gatilho de reversão**; links de
   "substitui" apontam para uma ADR que **existe** — verificado por *lint*.
4. O CI **quebra** se uma dependência real nova aparecer no código sem estar refletida no modelo.

**Complemento.** Escreva a ADR "como detectamos que esta regra de arquitetura deixou de valer" —
documentando o próprio processo de revisão da validade de uma regra, não só a regra em si.

**Checagem**

1. Por que um modelo C4 como texto versionado pode ser comparado automaticamente com o código, e um
   diagrama desenhado à mão não pode?
2. O que é *drift*, e por que ele não é necessariamente um erro, mas é sempre algo que precisa ser
   visto?
3. Por que ADR e arquitetura como código são complementares, e não um substituto do outro?
4. O que, especificamente, este marco diz que **não** deve ser automatizado, e por quê?

> **Reencontro — `system-design/01`; `system-design/15`; `spring-boot/13`; `observabilidade/12`.**
> O C4 e o ADR como método, ensinados em `system-design/01`, ganham aqui a automação que os torna
> verificáveis, não só bem escritos. A trajetória de IC sênior/staff de `system-design/15` é onde a
> habilidade de comunicar uma decisão de arquitetura (que este marco documenta, mas não ensina a
> comunicar) é tratada diretamente. O Spring Modulith de `spring-boot/13` é o tipo de sistema real
> onde esse *drift* entre modelo e código tipicamente aparece primeiro. E o SLO de
> `observabilidade/12` é outro exemplo de regra declarada que só vale alguma coisa quando verificada
> automaticamente, a mesma disciplina aplicada aqui à arquitetura.

## Principais aprendizados

- Um modelo C4 como código versionado pode ser comparado automaticamente com o código real; um
  diagrama desenhado à mão não pode, e por isso envelhece sem ningém notar.
- *Drift* entre modelo e código não é necessariamente um erro, mas precisa ser sempre visível, nunca
  descoberto por acidente.
- Uma ADR com `status`, alternativas e gatilho de reversão, consultável como log, é o que torna um
  registro de decisões útil meses ou anos depois.
- Documentação gerada (de testes, do grafo real de dependências) não pode ficar desatualizada da
  mesma forma que prosa escrita à mão.
- Decisões e seus porquês não são automatizáveis — é exatamente isso que a ADR captura, e por isso
  ADR e arquitetura como código se complementam, nunca um substitui o outro.

## Capstone

O `fin-structure` é o seu módulo de pagamentos reestruturado em público — a especificação completa
está em `PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `transferir/` com a suíte de comportamento única, passando nos três estilos de `estilos/`
- [ ] `qualidade/cenarios.yaml` com 6 cenários completos e a árvore de utilidade
- [ ] `Money` e `Transferencia` como agregado, em Java e em Go, com teste de propriedade
- [ ] Núcleo sem framework com dois adaptadores para a mesma porta, e teste de contrato
- [ ] `rules/` com zero ciclos, instabilidade calculada e *ratchet* no CI
- [ ] `legacy-wallet/` reestruturado com *golden master*, ciclos zerados, dívida registrada
- [ ] `modelo/` com C4 como código, comparação modelo × código, e *lint* de ADR

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] A funcionalidade `transferir` tem uma suíte de comportamento única que passa em **todos** os
      estilos implementados
- [ ] Todo atributo de qualidade priorizado tem cenário com medida numérica e um teste ou medição
- [ ] As invariantes do agregado são impossíveis de violar pela API pública (teste de propriedade)
- [ ] O núcleo do domínio não depende de framework, banco nem biblioteca de transporte — em Java
      **e** em Go
- [ ] Não há ciclos entre módulos/pacotes; o *ratchet* de acoplamento roda no CI
- [ ] O `legacy-wallet` foi reestruturado sem alterar o comportamento observável (*golden master*)
- [ ] O modelo C4 e o código **não divergem** (ou a divergência está listada e explicada)
- [ ] Uma ADR por bloco, com contexto, decisão, alternativas e **gatilho de reversão**, validada por
      *lint*
- [ ] Cada regra de arquitetura tem um teste que a **faz falhar de propósito**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma página —
inclusive se nada tiver quebrado. E responda por escrito à pergunta final da trilha: **das regras de
arquitetura que você colocou no CI, qual protege uma decisão que você tomou por gosto e não por um
atributo de qualidade medido — e que evidência faria você removê-la?**
