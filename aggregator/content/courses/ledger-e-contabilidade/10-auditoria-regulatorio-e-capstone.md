---
id: auditoria-e-capstone-do-ledger
title: "Auditoria, regulatório e capstone"
summary: "Auditar um ledger é verificar, por conta própria, que o que ele afirma é verdade — e a melhor auditoria é a que o seu próprio sistema consegue rodar sozinho todo dia."
estimatedMinutes: 60
references:
  - title: "Banco Central do Brasil — Contabilidade (COSIF e normas contábeis)"
    url: https://www.bcb.gov.br/estabilidadefinanceira/cosif
---

## Trilha de auditoria: quem, quando, por quê, de onde

Cada lançamento já carrega, desde o marco 03, uma trilha de auditoria mínima — mas em escala de
produção, essa trilha precisa responder de forma consistente a quatro perguntas sobre **qualquer**
lançamento: quem (ou qual sistema) o iniciou, quando foi registrado, por que (a referência de
negócio), e de onde (qual canal, qual API, qual processo). Faltando qualquer uma dessas quatro
respostas, reconstruir "o que aconteceu e por quê" para um auditor externo se torna
significativamente mais difícil.

## Prova de integridade: *hash* encadeado

Uma técnica adicional de proteção contra adulteração: cada lançamento do journal inclui um
**hash** calculado sobre seu próprio conteúdo **mais** o hash do lançamento anterior — um
**encadeamento** que torna qualquer alteração retroativa de um lançamento antigo detectável,
porque ela quebraria o encadeamento de hashes de todos os lançamentos posteriores a ele. Essa
prova é independente da proteção de permissão de banco (marco 03) — uma defesa em profundidade,
não uma substituição.

## Verificações contínuas

Três verificações deveriam rodar **continuamente** (não só quando um auditor pede): **contas de
controle = soma dos saldos de clientes** (marco 02), o **balancete fecha** a cada período (marco
07), e uma **reconstrução amostral** (escolher contas aleatoriamente e verificar que o saldo
materializado bate com o derivado) roda regularmente sobre uma fração do total. Rodar essas
verificações automaticamente, todo dia, é o que torna uma auditoria externa uma formalidade
confirmando o que o próprio sistema já sabe, em vez de uma investigação do zero.

## Relatórios como produtos do ledger

Balancete, razão por conta, e os relatórios regulatórios específicos do setor financeiro
(**conferir** com contabilidade e compliance o formato e a periodicidade exatos exigidos) são,
todos, **produtos derivados** do mesmo journal e do mesmo motor de cálculo de saldo — nunca
relatórios calculados por um caminho separado e potencialmente divergente. Essa trilha ensina o
**mecanismo** de gerar esses produtos corretamente a partir do ledger; a interpretação regulatória
específica de cada relatório é responsabilidade de contabilidade e compliance.

## Retenção e imutabilidade: WORM

Dados de ledger frequentemente precisam de retenção por um período regulatório longo
(**conferir** o prazo vigente), armazenados de forma que garanta **WORM** (*write once, read
many* — escrito uma vez, nunca modificado, lido quantas vezes for necessário). Essa garantia de
retenção é uma extensão, em escala de armazenamento de longo prazo, da mesma imutabilidade já
central ao journal desde o marco 03.

## Segregação de funções

Quem **aprova** uma exceção de controle, quem **implementa** uma correção no ledger, e quem
**audita** o resultado deveriam ser, idealmente, papéis diferentes — a mesma disciplina de
segregação de funções já formalizada em `entrega-continua-e-devops/09` para controle de mudança
regulado, aqui aplicada especificamente a quem pode tocar o componente que literalmente não pode
errar.

## Acesso a dados do ledger

Nem todo papel dentro da organização precisa (ou deveria) ter acesso de leitura irrestrito a todos
os lançamentos de todos os clientes — a disciplina de **autorização** já formalizada em
`seguranca-aplicacao/08` se aplica com peso extra aqui, porque dados de ledger são, por natureza,
dados financeiros sensíveis de clientes reais.

## Resposta ao auditor: explicar um saldo

Quando um auditor aponta um saldo específico e pergunta "de onde veio esse número?", a resposta
correta não é uma investigação manual ad-hoc — é uma função que, dado um saldo e uma conta,
devolve a **lista completa de lançamentos** que o compõem, com a soma batendo exatamente. Essa
função de **explicação** é, estruturalmente, só uma consulta sobre o mesmo journal que já
sustenta todo o resto do ledger — não um processo separado construído especialmente para
auditoria.

## Processos de correção e riscos de modelo

Todo processo de correção (um estorno, um ajuste, uma reabertura de período) segue as regras já
estabelecidas nos marcos anteriores — a auditoria, aqui, verifica que esses processos foram de
fato seguidos, não que inventa uma regra nova. E um **risco de modelo** — a possibilidade de que a
própria lógica de cálculo (de juros, de rateio, de conversão) tenha um erro sistemático — é
precisamente o que a conciliação (marco 08) e a reconstrução amostral, rodando continuamente,
existem para expor antes que um auditor externo o faça.

## Exemplo numa fintech

Um auditor aponta o saldo de uma conta de cliente e pede a história completa por trás dele; o
sistema devolve, em segundos, a lista de todos os lançamentos que compõem esse saldo — incluindo
os estornos e a conciliação que já os validou — sem que nenhuma pessoa precise reconstruir
manualmente nada a partir de planilhas.

## Hands-on

**Tutorial.** Implemente o *hash* encadeado do journal e o comando `make audit`.

**Desafio.** Implemente a detecção de adulteração e a verificação de contas de controle.

**Invariantes testáveis**

1. O *hash* encadeado **detecta** a alteração de qualquer lançamento do journal — testado
   adulterando um lançamento de propósito e verificando que o encadeamento subsequente quebra.
2. As **contas de controle** são iguais à soma dos saldos de clientes, por moeda, verificado sobre
   uma massa sintética completa.
3. `make audit` executa balancete, reconstrução amostral, verificação de encadeamento e
   conciliação, e **falha** se qualquer uma dessas verificações falhar.
4. Dado um saldo e uma conta, a função de **explicação** devolve a lista completa de lançamentos
   que o compõem, e a soma desses lançamentos bate exatamente com o saldo informado.
5. O relatório de auditoria é **reprodutível**: duas execuções sobre o mesmo estado produzem
   exatamente o mesmo resultado.

**Complemento.** Escreva o *runbook* "o saldo do cliente está errado" — os passos exatos que você
seguiria para investigar, incluindo que função de explicação consultar primeiro.

**Checagem**

1. Por que o hash encadeado é uma proteção independente da permissão de banco já estabelecida no
   marco 03, e não uma substituição dela?
2. Por que rodar verificações contínuas (contas de controle, balancete, reconstrução amostral)
   todo dia é melhor do que rodá-las só quando um auditor solicita?
3. Por que a função que explica um saldo a um auditor deveria ser só uma consulta sobre o journal,
   não um processo de investigação manual separado?
4. O que é um risco de modelo, e por que a conciliação e a reconstrução amostral são o que o
   expõe antes de um auditor externo?

> **Reencontro — `entrega-continua-e-devops/09`.** A segregação de funções e o controle de
> mudança regulado daquele marco são exatamente a disciplina que decide quem pode aprovar,
> implementar e auditar uma correção no componente deste marco que literalmente não pode errar.

O acesso a dados sensíveis de ledger se apoia na mesma disciplina de autorização de
`seguranca-aplicacao/08`, e a governança de PII e auditoria de `dados-distribuidos/13` é o
vocabulário geral de retenção e controle de acesso que este marco aplica especificamente a dados
financeiros de clientes. A telemetria e a auditoria de PII de `observabilidade/17` é exatamente o
que impede que um log de erro do `fin-books`, gerado para depuração, vaze o mesmo dado sensível
que a trilha de auditoria formal já protege com disciplina.

## Principais aprendizados

- A trilha de auditoria de um lançamento precisa responder quem, quando, por quê e de onde, de
  forma consistente para qualquer lançamento.
- Hash encadeado é uma proteção independente contra adulteração, em defesa em profundidade com a
  permissão de banco já estabelecida.
- Verificações contínuas (contas de controle, balancete, reconstrução amostral) tornam uma
  auditoria externa uma formalidade, não uma investigação do zero.
- A resposta a "de onde veio esse saldo" deveria ser uma função de consulta sobre o journal, não
  uma investigação manual.
- Risco de modelo — um erro sistemático na própria lógica de cálculo — é exatamente o que
  conciliação e reconstrução amostral contínuas existem para expor antes de um auditor externo.

## Capstone

O `fin-books` é o seu razão executável — a especificação completa está em `PROJETO.md`, na raiz
desta trilha. Aqui é onde ele fica pronto, consolidando o modelo, o valor, a confiança e a
operação de todos os blocos anteriores.

**Entrega**

- [ ] Esquema de contas e `Postar(lançamento)` com validação de balanceamento (marco 01)
- [ ] Saldos derivados e materializados, com verificação de reconstrução (marco 02)
- [ ] Journal *append-only*, estorno/ajuste e idempotência de *posting* (marco 03)
- [ ] Reservas com expiração, captura parcial e liberação (marco 04)
- [ ] Rateio por maior resto e acúmulo de juros (marco 05)
- [ ] Contas por moeda, conversão e reavaliação cambial (marco 06)
- [ ] Períodos, fechamento e balancete (marco 07)
- [ ] `conciliacao/` com casamento 1:1, 1:N e fila de exceções (marco 08)
- [ ] Carga com contas quentes, fragmentação e reconstrução a partir do journal (marco 09)
- [ ] Trilha de auditoria, hash encadeado e `make audit` (este marco)

**Critérios de pronto — cada um provado por teste ou comando**

- [ ] Todo lançamento é balanceado (Σ débitos = Σ créditos por moeda); lançamento desbalanceado
      nunca persiste
- [ ] O journal é imutável: o papel de aplicação não tem `UPDATE`/`DELETE`; correção só por
      estorno/ajuste
- [ ] Saldo materializado é igual à soma dos lançamentos, verificado por reconstrução completa
- [ ] A mesma chave de idempotência não gera dois lançamentos, inclusive com *retries* concorrentes
- [ ] Saldo disponível nunca fica negativo por concorrência, com reserva e captura corretas
- [ ] Arredondamento e rateio conservam o total — nenhum centavo criado ou perdido
- [ ] Cada moeda balanceia isoladamente; a conversão tem taxa, hora e conta de ganho/perda
- [ ] Período fechado é imutável; o balancete fecha
- [ ] A conciliação encontra e classifica todas as divergências plantadas, de forma determinística
- [ ] Reconstrução do estado a partir do journal reproduz o estado atual
- [ ] A soma dos saldos de clientes é igual às contas de controle
- [ ] `make audit` passa integralmente, e uma adulteração plantada no journal é detectada

**Antes de fechar**, rode o *game day* do `PROJETO.md` (os sete cenários) e escreva um
*post-mortem* de uma página para cada um — inclusive se nada tiver quebrado. E responda por
escrito à pergunta final da trilha: **das invariantes que você prova no `fin-books`, qual só vale
porque o simulador de contrapartes é honesto — e que divergência de uma contraparte real você
esperaria encontrar no primeiro mês?**
