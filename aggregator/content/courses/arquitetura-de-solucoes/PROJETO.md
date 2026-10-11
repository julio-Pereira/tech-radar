# Projeto guia — fin-landscape

> Componente do `fin-platform`. Não é um marco: é a especificação do projeto pessoal que você
> constrói enquanto lê a trilha. O `fin-landscape` é o **dossiê executável de soluções**: o que o
> `fin-platform` tem, como se conecta, o que foi comprado e por quê, onde roda, quem governa o quê e
> qual é o roteiro. Termina numa revisão arquitetural que roda como comando.

## O que você vai construir

Oito pastas: `paisagem/` (capacidades e sistemas em YAML), `integracoes/` (catálogo + simuladores),
`fake-core/` (um "core bancário" de brinquedo: arquivo posicional, API lenta e fechamento em lote),
`decisoes/` (modelo de TCO, pontuação, ADRs), `nuvem/` (arquivos declarativos de exemplo +
políticas), `governanca/` (radar com exceções que expiram, modelo de *paved road*), `portfolio/`
(modelo de modernização) e `rfc/` (modelo e *lint*). A revisão final é um comando que roda tudo.

**Contratos com os vizinhos** (todos simuláveis com stub):

| Direção | Interface | Vizinho |
| --- | --- | --- |
| consome | Modelo C4 e lista de ADRs de todas as trilhas (índice único) | `fin-blueprint`, trilha system-design |
| consome | Dossiê de estrutura e regras de arquitetura | `fin-structure`, trilha arquitetura-de-software |
| consome | Componentes e contratos do `fin-platform` (insumo do mapa de capacidades) | todas as trilhas |
| serve | Catálogo de integrações, mapa e roteiro de modernização | decisões de portfólio |
| serve | Políticas de nuvem como código (arquivos de configuração) | trilha kubernetes |

**O que este projeto não é.** Não cria recurso em nuvem, não avalia produto real, não substitui o
`fin-blueprint` (que é o dossiê do **sistema**) e não faz o pipeline de entrega.

**Pré-requisitos.** Go (toolchain atual) para modelos e *lints*; um motor de política de código
aberto (por ADR); `git`. **Não precisa:** conta em nuvem, fornecedor real, licença paga. Confirmar
versões e licenças na Fase 0.

### Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | `paisagem/capacidades.yaml` + `sistemas.yaml` | Toda capacidade tem **exatamente um** sistema de registro; nenhum sistema sem dono nem classificação de dado |
| 02 | `integracoes/catalogo.yaml` + simuladores de 3 padrões | Todo item tem padrão, contrato, estratégia de idempotência e modo de falha; sob falha injetada, 0 perdas e 0 duplicatas |
| 03 | `fake-core/` + camada anticorrupção + reconciliação | *Round-trip* posicional ↔ domínio; nenhum tipo do legado fora da ACL; reconciliação fecha ou classifica a diferença |
| 04 | Modelo de TCO + pontuação + ADR com saída | Ponto de equilíbrio calculado e testado; relatório de sensibilidade lista onde a decisão **inverte** |
| 05 | `nuvem/` com *fixtures* e políticas | *Fixtures* violadoras falham, a conforme passa; inventário de saída tem substituto e exportação para cada serviço gerenciado |
| 06 | Radar + exceções + modelo de serviço (*paved road*) | Exceção vencida quebra o CI (relógio falso); serviço gerado pelo modelo passa em **todas** as verificações |
| 07 | Modelo de portfólio + roteiro | Ordem é topológica; aposentar sistema com consumidor ativo é rejeitado; critério de desligamento mensurável |
| 08 | RFC de uma decisão real do `fin-platform` + *lint* | RFC com ≥2 opções, trade-off, riscos, partes consultadas, gatilho de reversão; resumo executivo sem jargão proibido |
| 09 | `make review` + relatório de revisão arquitetural | Comando roda todos os *lints*/modelos; relatório lista riscos priorizados com dono e prazo |

### Definição de pronto (capstone)

- [ ] Toda capacidade do `fin-platform` tem **um** sistema de registro, dono e classificação de dado
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

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **O core fica lento** (a API demora 20× mais). O que degrada? O que a ACL protege? O que fica
   sem resposta?
2. **O arquivo de fechamento chega duplicado** (reenviado). A reconciliação percebe? O
   processamento é idempotente?
3. **O "fornecedor" sobe 40% o preço** (ou sai do mercado). Em quanto tempo você sai? O plano de
   saída tem custo?
4. **Um serviço novo precisa subir numa região proibida.** Qual política barra, e em que etapa?
5. **Uma exceção vence numa sexta.** O que quebra? Quem é avisado antes?
6. **Um sistema "aposentado" ainda tem consumidor** que ninguém conhecia. Como o modelo (e os logs)
   teriam mostrado?

## Regra do tempo declarado

`estimatedHours` ≈ 2 × Σ `estimatedMinutes`: 545 min de leitura viram ~18h porque o hands-on é
modelar, quebrar o modelo de propósito e reler a decisão com os números novos.
