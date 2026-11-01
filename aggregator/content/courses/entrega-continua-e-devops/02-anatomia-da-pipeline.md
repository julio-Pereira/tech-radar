---
id: anatomia-da-pipeline
title: "Anatomia da pipeline"
summary: "Uma pipeline é um sistema com orçamento de tempo, modos de falha e superfície de ataque — a maior parte da qualidade vem de onde se põe cada verificação e de quanto ela pode fazer."
estimatedMinutes: 65
completion: quiz
references:
  - title: "GitHub Actions — documentation"
    url: https://docs.github.com/actions
  - title: "actionlint"
    url: https://github.com/rhysd/actionlint
---

## Estágios, e a regra de falhar cedo e barato primeiro

Uma pipeline percorre estágios — lint → teste unitário → build → teste de integração →
empacotamento → promoção — e a ordem não é arbitrária: **o mais barato e mais rápido de executar
vem primeiro**. Um lint que roda em 5 segundos não deveria esperar um teste de integração de 12
minutos para rodar; se o lint falha, a pipeline inteira pode parar ali, economizando os 12 minutos
que seriam desperdiçados num código que nem passa na verificação mais básica. A ordem certa é uma
função direta do **custo declarado** de cada estágio, não de convenção ou hábito.

## Paralelismo e matriz

Estágios independentes (testar contra duas versões de uma dependência, por exemplo) podem rodar em
**paralelo**, numa matriz, em vez de sequencialmente — reduzindo o tempo total da pipeline sem
reduzir a cobertura do que é verificado. A armadilha é paralelizar estágios que **não** são
independentes (um que depende do resultado do outro) — a pipeline pode até terminar mais rápido, mas
com uma condição de corrida entre jobs que produz resultado inconsistente.

## Cache: a chave certa é o hash do lockfile

Um cache de dependências acelera builds repetidos drasticamente — mas só se a **chave do cache**
capturar exatamente o que determina se o cache ainda é válido. A chave certa inclui o **hash do
arquivo de lock** de dependências: se o lockfile não mudou, o cache é reutilizável; se mudou, uma
chave baseada só no nome do branch ou numa string fixa serviria um cache **desatualizado e
incorreto**, silenciosamente, sem erro algum — um bug sutil e caro de diagnosticar.

## Artefatos entre jobs

Um estágio produz algo (um binário compilado, um relatório de cobertura) que um estágio posterior
precisa — isso passa por **artefatos** explícitos entre jobs, não por reconstruir a mesma coisa duas
vezes (que desperdiça tempo e pode produzir resultados ligeiramente diferentes entre as duas
construções) nem por estado compartilhado implícito entre execuções.

## Pipeline como código fino: decisão em script, YAML só orquestra

O princípio central desta trilha: toda **decisão** (bloqueia ou não, promove ou não, registra o quê)
vive em **funções testáveis** — Go, shell, ou a linguagem que o projeto já usa — e o arquivo YAML do
CI só **orquestra**, chamando esses scripts na ordem certa. Um `run:` de 30 linhas com lógica
condicional embutida no YAML é o antipadrão central deste marco: aquela lógica não pode ser testada
isoladamente, sem rodar a pipeline inteira — e "só descobrir que a lógica está errada rodando a
pipeline de produção" é exatamente o tipo de risco que esta trilha existe para evitar.

```diagrama
ec-pipeline
```

## Reuso: *workflows* reutilizáveis, *composite actions*

Duplicar o mesmo conjunto de estágios em cada repositório é o mesmo problema de copiar-colar código
— cada cópia diverge silenciosamente ao longo do tempo. *Workflows* reutilizáveis e *composite
actions* (mecanismos do GitHub Actions para compartilhar lógica de pipeline entre repositórios) são
tratados aqui em nível conceitual: todo CI moderno tem algum equivalente, e o valor é o mesmo —
mudar a esteira num lugar e propagar, não editar N repositórios um por um.

## Idempotência e re-execução

Re-executar o mesmo job (depois de uma falha transitória de rede, por exemplo) deveria produzir o
mesmo resultado que a primeira execução teria produzido, se tivesse funcionado — nenhum efeito
colateral duplicado (publicar o mesmo artefato duas vezes com nomes diferentes, por exemplo).
**Concorrência e cancelamento**: útil em CI (cancelar a execução anterior de um PR quando um commit
novo chega, economizando tempo de execução) e **perigoso** em deploy (cancelar um deploy no meio pode
deixar o sistema num estado intermediário, nem na versão antiga nem na nova).

## Permissões mínimas, e *pinning* por SHA

O token que a pipeline usa para interagir com o repositório e com serviços externos deveria ter
**permissões mínimas** declaradas explicitamente — nunca o padrão amplo "escreve tudo" por
comodidade. E toda *action* de terceiros usada na pipeline deveria ser fixada pelo **SHA completo do
commit**, nunca por uma tag móvel (`v2`, `latest`) que o mantenedor da *action* pode repontar para
outro conteúdo sem aviso — a mesma disciplina de cadeia de suprimentos de `seguranca-aplicacao/12`,
aplicada à própria esteira que constrói o software.

## Segredos e OIDC em vez de chave de longa duração

Uma chave de longa duração num segredo de CI é um alvo permanente — se vazar, vale até ser revogada
manualmente. OIDC (*OpenID Connect*) permite a pipeline obter uma credencial **de curta duração**,
emitida sob demanda para aquela execução específica, sem que nenhuma chave de longa duração precise
existir em repouso — **confira** o suporte do seu provedor de nuvem ou serviço antes de assumir
disponibilidade.

## Testes instáveis: detecção e quarentena com dono e prazo

Um teste que às vezes passa e às vezes falha, sobre o **mesmo** código (sem nenhuma mudança real), é
um teste instável (*flaky*) — e a resposta errada mais comum é "roda de novo até passar", que mascara
o problema indefinidamente. A resposta correta: detectar (resultado misto sobre o mesmo commit),
colocar em **quarentena** (não bloqueia o merge, mas continua visível) com **dono** e **prazo** para
investigar e corrigir — nunca quarentena permanente e silenciosa.

## Tempo e custo de CI como orçamento

Cada minuto de execução de CI tem um custo real, e o tempo de espera por uma pipeline lenta é tempo
de desenvolvimento perdido — tratar tempo e custo de CI como um **orçamento** declarado (não
ilimitado) é o que permite decidir, com critério, quando vale a pena otimizar.

## Exemplo numa fintech

Uma pipeline roda testes de integração de 12 minutos **antes** do lint de 5 segundos, com
`permissions: write-all` no token e uma *action* de terceiros referenciada por uma tag móvel (`v2`).
Um commit com erro de sintaxe trivial — que o lint pegaria instantaneamente — só falha depois de 12
minutos de espera. E se a *action* fixada por tag for comprometida um dia, o token com permissão
total dá ao atacante acesso a muito mais do que a pipeline deveria poder tocar.

## Hands-on

**Tutorial.** Construa um *workflow* reutilizável para Java e Go com os estágios na ordem certa e
cache com chave correta, mais `ci/` com as verificações.

**Desafio.** Mova toda decisão que hoje vive dentro do YAML para scripts testados isoladamente.

**Invariantes testáveis**

1. `actionlint` roda **sem erros** sobre todos os *workflows*.
2. **Todo job** declara `permissions` explicitamente, e nenhum usa `write-all` — verificado por
   script sobre o YAML, não por revisão manual.
3. **Toda *action* de terceiros** está fixada por **SHA completo** (não tag, não `latest`) —
   verificado por script.
4. A chave de cache **inclui o hash do lockfile** — verificado por script que extrai a configuração
   de cache e confere o padrão da chave.
5. A ordem de `needs` entre estágios respeita os **custos declarados** em um arquivo de custos (o
   barato antes do caro) — verificado programaticamente, não assumido pela leitura do YAML.
6. O detector de teste instável classifica corretamente um teste com **resultado misto** no mesmo
   commit (massa de teste conhecida) e **não** classifica como instável um teste puramente
   determinístico.

**Complemento.** Reescreva um `run:` real de 30 linhas de lógica condicional como um script testado
isoladamente, comparando o comportamento antes e depois.

**Checagem**

1. Por que a ordem dos estágios é uma função do custo declarado, e não de convenção?
2. Por que uma chave de cache baseada no nome do branch, em vez do hash do lockfile, é um bug sutil
   e perigoso?
3. O que distingue "pipeline como código fino" de um `run:` com lógica condicional embutida, e por
   que a diferença importa?
4. Por que *pinning* por SHA completo é necessário mesmo quando a *action* parece confiável hoje?
5. Por que concorrência/cancelamento é útil em CI e perigoso em deploy?
6. O que distingue a resposta correta a um teste instável ("quarentena com dono e prazo") da
   resposta errada mais comum ("roda de novo até passar")?

> **Reencontro — `seguranca-aplicacao/12`; `seguranca-aplicacao/13`; `spring-boot/12`;
> `go-fintech/06`.** O *pinning* por SHA e as permissões mínimas retomam diretamente a cadeia de
> suprimentos de `seguranca-aplicacao/12`, aplicada à própria pipeline. A ordem dos *gates* de
> segurança dentro da esteira, que `seguranca-aplicacao/13` já discute em alto nível, ganha aqui a
> implementação concreta. A produção e o deploy de `spring-boot/12` são o destino típico desta
> pipeline. E a observabilidade de produção de `go-fintech/06` é onde o tempo de execução gerado por
> esta pipeline acaba sendo monitorado.

## Principais aprendizados

- A ordem dos estágios é uma função do custo declarado — o mais barato e rápido primeiro, nunca
  convenção ou hábito.
- A chave de cache precisa incluir o hash do lockfile; uma chave mal escolhida serve cache
  desatualizado silenciosamente, sem erro.
- Pipeline como código fino significa que toda decisão vive em script testável; o YAML só orquestra
  — um `run:` com lógica condicional embutida não pode ser testado isoladamente.
- Permissões mínimas e *pinning* por SHA completo são a mesma disciplina de cadeia de suprimentos
  aplicada à própria esteira, não só ao software que ela constrói.
- Um teste instável merece quarentena com dono e prazo, nunca "roda de novo até passar" — essa
  resposta mascara o problema indefinidamente.
