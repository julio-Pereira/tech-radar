---
id: construir-uma-vez-e-promover
title: "Construir uma vez e promover"
summary: "Se o que vai para produção não é o mesmo artefato que foi testado, você não testou o que está rodando."
estimatedMinutes: 65
references:
  - title: "The Twelve-Factor App"
    url: https://12factor.net/pt_br/
---

## Artefato imutável, identificado por *digest*

Um artefato de build (uma imagem de container, um pacote) deveria ser **imutável** depois de criado,
identificado por um ***digest*** (um hash do conteúdo) — não por uma tag mutável como `latest` ou
mesmo `v1.2.3` reconstruída. Com *digest*, "é exatamente este artefato, byte a byte" é uma afirmação
verificável, não uma esperança baseada em nome.

## Promoção entre ambientes sem reconstruir

**Promover** um artefato de homologação para produção significa mover a **referência** (o mesmo
*digest*) de um ambiente para outro — nunca **reconstruir** o código a partir do mesmo commit numa
etapa separada. Reconstruir parece inofensivo ("é o mesmo código, vai dar o mesmo resultado") mas não
é garantido: uma dependência transitiva pode ter sido atualizada entre as duas construções, um
*timestamp* de build pode entrar no binário, o ambiente de build pode ter mudado de versão de
ferramenta — qualquer uma dessas diferenças silenciosas significa que o artefato que roda em
produção **não é** o que foi testado em homologação, mesmo vindo do "mesmo" código-fonte.

## Configuração externa ao artefato, e a diferença permitida entre ambientes

Segundo o princípio dos doze fatores (`spring-boot/03`), configuração (strings de conexão,
*feature flags*, limites) vive **fora** do artefato, injetada no momento de execução — o mesmo
artefato roda em homologação e em produção, só a configuração muda. A diferença de configuração
**permitida** entre ambientes deveria estar numa **lista explícita** (quais variáveis podem
divergir) — qualquer diferença fora dessa lista é, por definição, uma divergência não planejada que
merece investigação.

## Paridade de ambientes

Homologação que diverge muito de produção (versão diferente de banco, topologia diferente de rede)
produz uma falsa sensação de segurança: passou em homologação, mas homologação não representava
produção o suficiente para a passagem significar algo. **Paridade** não exige ambientes idênticos em
escala — exige que as diferenças relevantes estejam **conhecidas e declaradas**, não descobertas
durante um incidente.

## Ambiente efêmero por PR, e *teardown*

Um **ambiente efêmero** — criado automaticamente para um PR específico, destruído quando o PR é
fechado ou mesclado — permite testar uma mudança isolada em condições próximas de produção, sem
competir por um ambiente compartilhado de homologação. O ***teardown*** (destruição completa, sem
deixar recurso órfão) é tão importante quanto a criação: um ambiente efêmero que nunca é destruído
vira custo permanente disfarçado de temporário.

## Versionamento semântico calculado, e *changelog* automático

A partir de commits estruturados (marco 03), a **versão semântica** (`major.minor.patch`) pode ser
**calculada** automaticamente — um commit marcado como mudança incompatível incrementa `major`; uma
funcionalidade nova incrementa `minor`; uma correção incrementa `patch`. O mesmo histórico gera um
***changelog*** automático, sem alguém escrevendo manualmente "o que mudou nesta versão" (e
esquecendo, ou exagerando, ou simplificando demais). **Confira** a convenção específica adotada antes
de assumir o comportamento exato.

## Registro de artefatos e retenção

Um registro de artefatos guarda cada versão construída — mas guardar **para sempre** tem custo de
armazenamento sem benefício correspondente além de um certo ponto. Uma política de **retenção** (por
tempo, ou por quantidade de versões recentes, preservando o que está efetivamente em produção) evita
esse custo crescente sem comprometer a capacidade de reverter para uma versão recente.

## Proteção de ambiente

Um ambiente de produção deveria exigir **aprovação explícita** antes de um deploy, e **segredos
específicos daquele ambiente**, nunca compartilhados com homologação — a proteção de ambiente é o
mecanismo que impede que um erro de configuração de pipeline, destinado a homologação, acidentalmente
afete produção.

## SBOM e assinatura, por link

A proveniência do artefato (SBOM — *software bill of materials*, assinatura criptográfica) já é
tratada em profundidade em `seguranca-aplicacao/12` — aqui entra só como **requisito consumido**: um
artefato sem SBOM ou assinatura válida não deveria ser promovido, mas o **como** gerar e verificar
esses dois não é reensinado nesta trilha.

## Exemplo numa fintech

Um *hotfix* urgente é "reconstruído só dessa vez" diretamente na etapa de deploy, pulando a promoção
normal do artefato já testado — para ganhar tempo. A reconstrução, sem que ninguém percebesse, resolve
uma dependência transitiva para uma versão de *patch* mais recente que tinha sido publicada minutos
antes, com uma mudança sutil de comportamento. O artefato que chega a produção não é o mesmo que
passou pelos testes de homologação horas antes — é parecido, mas não é o mesmo, e a diferença é o que
quebra.

## Hands-on

**Tutorial.** Construa uma pipeline que compila, publica o artefato por *digest*, e promove sem
reconstruir.

**Desafio.** Implemente um ambiente efêmero com *teardown* automático, e o cálculo de versão a
partir de commits estruturados.

**Invariantes testáveis**

1. O *digest* referenciado no manifesto de produção é **idêntico** ao *digest* que passou pelos
   testes — verificado por script sobre as *fixtures* de manifesto, não por inspeção manual.
2. O *workflow* de promoção **não contém** nenhuma etapa de build — verificado por *lint* sobre a
   definição do *workflow* de promoção.
3. A diferença de configuração entre ambientes está **dentro de uma lista permitida** explícita —
   qualquer chave de configuração fora dessa lista, divergente entre ambientes, falha a verificação.
4. A versão calculada a partir de uma massa de commits estruturados **conhecida** coincide
   exatamente com a versão esperada (teste de tabela).
5. Depois do *teardown*, o inventário do ambiente efêmero está **vazio** — nenhum recurso remanescente
   detectável.

**Complemento.** Descreva o que mudaria no processo de promoção se o artefato fosse uma biblioteca
consumida por outros times, em vez de um serviço implantado diretamente.

**Checagem**

1. Por que reconstruir "o mesmo código" numa etapa separada não garante o mesmo artefato que foi
   testado?
2. O que a lista explícita de diferenças permitidas entre ambientes previne?
3. Por que um ambiente efêmero sem *teardown* garantido se torna custo permanente disfarçado de
   temporário?
4. Como a versão semântica é calculada automaticamente a partir de commits estruturados, sem
   decisão manual a cada release?

> **Reencontro — `kubernetes/13`; `seguranca-aplicacao/12`; `spring-boot/03`; `spring-boot/12`.**
> O GitOps de `kubernetes/13` é o mecanismo típico que aplica a promoção por referência de *digest*
> ao ambiente de destino. SBOM e assinatura de `seguranca-aplicacao/12` são o requisito de
> proveniência que este marco consome sem reensinar. A configuração externa ao artefato retoma
> diretamente os doze fatores de `spring-boot/03`. E a produção e o deploy de `spring-boot/12` são o
> destino concreto onde essa promoção, de fato, acontece.

## Principais aprendizados

- Um artefato identificado por *digest* é imutável e verificável — promover significa mover a
  referência, nunca reconstruir.
- Reconstruir "o mesmo código" em etapa separada não garante o mesmo artefato, porque dependências
  transitivas e ambiente de build podem divergir silenciosamente entre as duas construções.
- Configuração externa ao artefato, com uma lista explícita de diferenças permitidas entre
  ambientes, é o que torna "o mesmo artefato em todo ambiente" uma prática real, não um slogan.
- Um ambiente efêmero só cumpre sua função com *teardown* garantido — sem isso, vira custo
  permanente disfarçado de temporário.
- Versão semântica calculada e *changelog* automático, a partir de commits estruturados, eliminam a
  decisão manual (e o esquecimento) a cada release.
