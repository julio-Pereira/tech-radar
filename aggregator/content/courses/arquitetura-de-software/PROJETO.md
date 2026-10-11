# Projeto guia — fin-structure

> Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
> constrói enquanto lê a trilha. O `fin-structure` é um **módulo de pagamentos reestruturado em
> público**: a mesma funcionalidade (`transferir`) em três desenhos, mais um código legado semeado
> que você conserta sem mudar o comportamento, tudo guardado por regras de arquitetura no CI.

## O que você vai construir

Cinco pastas: `transferir/` (a funcionalidade e a **suíte de comportamento compartilhada**),
`estilos/` (três implementações: em camadas, hexagonal, *vertical slice*), `rules/` (testes de
arquitetura e métricas, em Java e em Go), `legacy-wallet/` (código semeado com ciclos e acoplamento
excessivo, a ser reestruturado) e `modelo/` (C4 como código + ADR + comparação com o código).

**Contratos com os vizinhos** (todos simuláveis com stub):

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Regras do ledger (partida dobrada) como domínio de exemplo | `ledger-core`, trilha go-fintech |
| consome | O modelo C4 e a lista de ADRs como ponto de partida | `fin-blueprint`, trilha system-design |
| serve | Regras de arquitetura reutilizáveis (arquivos de configuração) para qualquer módulo | demais componentes do `fin-platform` |
| serve | Dossiê de estrutura para a revisão arquitetural | `fin-landscape`, trilha arquitetura-de-solucoes |

**O que este projeto não é.** Não é o `pix-gateway`, não reimplementa o ledger e não escolhe
tecnologia de persistência — usa **repositórios em memória** e um adaptador SQL opcional.

**Pré-requisitos.** JDK 21+ e Maven ou Gradle (ArchUnit, jdeps); Go (toolchain atual); `git`. **Não
precisa:** nuvem, Docker obrigatório, ferramenta paga. Confirmar versões e licenças na Fase 0.

### Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `transferir/` + a mesma funcionalidade em 3 estilos (`estilos/`) | A **mesma suíte de comportamento** passa nos três; cada estilo tem a regra de dependência escrita e verificada |
| 02 | `qualidade/cenarios.yaml` (cenários + árvore de utilidade) e uma tática medida | Todo cenário tem *response measure* numérica; a medida de modificabilidade (arquivos tocados) é reproduzível |
| 03 | Agregado `Transferencia` e `Money` em Java e Go | Nenhuma sequência de chamadas públicas viola a invariante (teste de propriedade); agregado referencia outro por id |
| 04 | Núcleo sem framework + dois adaptadores para a mesma porta | O núcleo não importa framework (teste de arquitetura); os dois adaptadores passam no mesmo teste de contrato da porta |
| 05 | Relatório de acoplamento + *ratchet* no CI | Zero ciclos; o valor de instabilidade/ciclos não piora entre commits; violação do *stable dependencies* é reportada |
| 06 | `legacy-wallet/` reestruturado + registro de dívida | Comportamento idêntico (*golden master*); ciclos 0; métricas melhoram a cada passo |
| 07 | `modelo/` com C4 como código, comparação modelo × código, lint de ADR | *Drift* entre modelo e código = 0 ou explicado; todo contêiner tem dono; ADR sem gatilho de reversão quebra o build |

### Definição de pronto (capstone)

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
- [ ] Cada regra de arquitetura tem um teste que a **faz falhar de propósito** (regra que nunca
      falha não protege nada)

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Um colega importa uma classe de infraestrutura no domínio** "só dessa vez". O build quebra?
   Em quanto tempo você descobre?
2. **Um novo meio de pagamento** precisa ser adicionado. Quantos arquivos você toca em cada estilo?
   A medição bate com o cenário de modificabilidade?
3. **Um ciclo aparece** entre dois módulos numa refatoração apressada. O que o *ratchet* faz?
4. **O diagrama e o código divergem** depois de um mês. Quem percebe, e como?
5. **Trocar o banco** por um adaptador novo. O núcleo muda? O teste de contrato da porta pega a
   diferença?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 420 min de leitura viram ~14h porque o hands-on é
implementar a mesma coisa mais de uma vez e fazer a regra falhar de propósito.
