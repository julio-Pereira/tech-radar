---
id: cadeia-de-suprimentos
title: "Cadeia de suprimentos: dependência, build e SBOM"
summary: "O ataque que não passa pelo seu código: dependency confusion, mantenedor comprometido, o pipeline como alvo. Marco crítico: quiz estendido."
estimatedMinutes: 60
references:
  - title: "SLSA — Supply-chain Levels for Software Artifacts"
    url: https://slsa.dev/
  - title: "CycloneDX — SBOM Specification"
    url: https://cyclonedx.org/
  - title: "OpenSSF — Sigstore"
    url: https://www.sigstore.dev/
---

## O ataque que não passa pelo seu código

Toda a trilha até aqui pressupõe um código que você escreveu, com uma falha para
encontrar. A cadeia de suprimentos é diferente: o código **nunca precisa estar errado** —
o ataque entra por uma dependência. **Typosquatting** publica um pacote com nome quase
idêntico a um popular, esperando um erro de digitação no `npm install`. **Dependency
confusion** é mais sutil e mais perigoso: um pacote **interno**, com nome privado dentro da
organização, também existe — publicado pelo atacante — no registry **público**, com um
número de versão **maior**. Se o gerenciador de pacotes resolve por maior versão
disponível, sem distinguir origem, ele silenciosamente troca o pacote interno legítimo pelo
público malicioso. **Mantenedor comprometido** é a conta de quem publica um pacote legítimo
sendo sequestrada, e uma versão maliciosa publicada sob a mesma identidade confiável. E
**script de pós-instalação** (`postinstall` em npm, e equivalentes) executa código
arbitrário no momento da instalação, antes de qualquer teste ou revisão rodar.

## A árvore real de dependências

Ninguém audita manualmente a árvore de dependências de um projeto moderno — ela tem
centenas ou milhares de pacotes, e **as dependências transitivas** (dependências das
dependências, não as que você escolheu diretamente) **dominam o risco**, porque ninguém as
escolheu conscientemente. **SCA** (Software Composition Analysis) automatiza a varredura
dessa árvore contra bancos de vulnerabilidade conhecidos. E um alerta prático: "**0
vulnerabilidades encontradas**" num relatório de SCA, na maioria das vezes, **não significa
que o projeto é seguro** — significa que o scanner está mal configurado (não escaneando
dependência transitiva, banco de dados desatualizado, ou escopo limitado demais). É o
mesmo tipo de falso conforto que "o scanner não achou nada" produz em qualquer outra
categoria de segurança.

## Priorizar por alcançabilidade

Um projeto médio tem dezenas de CVEs abertas em dependências transitivas a qualquer
momento — corrigir todas, na ordem em que aparecem, é impossível de sustentar. O critério
que separa sinal de ruído é **alcançabilidade**: a função vulnerável daquela CVE está
**realmente no caminho de código que o seu projeto chama**, ou está numa parte da
biblioteca que nunca é invocada? Somado a **EPSS** e **KEV** (*reencontro* do marco 02),
alcançabilidade é o que impede o time de gastar o trimestre inteiro atualizando uma
biblioteca cuja função vulnerável **nunca é invocada** por nenhum caminho do sistema —
enquanto uma CVE alcançável, com exploração ativa, espera na fila.

## SBOM, proveniência e SLSA

**SBOM** (Software Bill of Materials — CycloneDX e SPDX são os formatos dominantes) é a
lista completa e estruturada de tudo que compõe um artefato de software: toda dependência,
direta e transitiva, com versão exata. **Proveniência** é a prova verificável de **como**
um artefato foi construído — qual pipeline, a partir de qual commit, com quais entradas.
**SLSA** (Supply-chain Levels for Software Artifacts) é o framework que gradua o rigor
dessas garantias em níveis. E **assinatura com Sigstore** amarra o artefato final a essa
proveniência de forma verificável. *Reencontro* direto de `kubernetes/09`: aquela trilha
ensina a **verificar** SBOM e proveniência **na admissão** do cluster — esta trilha ensina
a **produzir** o artefato que a política de admissão de lá exige. São as duas metades do
mesmo controle: sem produção correta aqui, não há nada real para verificar lá.

## Build reprodutível e pinning por hash

Um **build reprodutível** garante que compilar o mesmo código-fonte, duas vezes, em
qualquer ambiente, produz **exatamente o mesmo artefato**, byte a byte — pré-requisito para
verificar proveniência de forma confiável. **Pinning por hash** (fixar a dependência por
hash de conteúdo, não apenas por número de versão) impede que uma versão seja
silenciosamente substituída sem que o hash mude — um número de versão pode ser
republicado; um hash de conteúdo, não. **Mirror interno** de dependências (um proxy que a
organização controla, em vez de puxar direto do registry público a cada build) reduz a
superfície de ataque: mesmo que o registry público seja comprometido, o mirror interno só
atualiza sob decisão explícita.

## O pipeline como alvo

O próprio **pipeline de CI/CD é um alvo**, não apenas o meio de entregar o software.
Vetores conhecidos: **`pull_request_target`** mal configurado, que executa workflow com
permissões do repositório principal sobre código vindo de um **fork** não confiável —
efetivamente dando a quem abre um PR a chance de rodar código com privilégio elevado.
**Segredo em log de CI** (uma variável sensível impressa por engano num passo de debug,
visível a qualquer um com acesso ao log). **Runner compartilhado** (a mesma máquina de
build reutilizada entre jobs de diferentes repositórios ou times, sem isolamento
suficiente). E **token de CI com permissão de escrita** no repositório mais ampla do que o
pipeline realmente precisa — um token de leitura bastaria para a maioria dos jobs, e um
token de escrita comprometido pode alterar o próprio código-fonte.

## Exemplo numa fintech

O questionário de segurança de fornecedor que chega de um parceiro — "quais dependências
vocês usam, com quais versões, há vulnerabilidade conhecida?" — é respondido de forma
confiável apenas quando o **inventário de dependência é gerado automaticamente** a cada
build, a partir do SBOM real. Mantido **numa planilha atualizada manualmente**, o
inventário está desatualizado no momento em que é enviado — e é exatamente esse tipo de
resposta que uma auditoria de fornecedor, ou um incidente em cascata, expõe como
inadequada.

## Hands-on

**Tutorial — pipeline com SBOM, assinatura e gate de CVE alcançável.** Configure um
pipeline que, a cada build: (1) gera SBOM (CycloneDX) do artefato; (2) assina a imagem
com Sigstore; (3) falha o build quando encontra uma CVE que seja simultaneamente
**alcançável** (a função vulnerável está no caminho de código) e com **EPSS alto**.

**Desafio — reproduzir e mitigar dependency confusion.** Usando um registry local, publique
um pacote com o mesmo nome de um pacote interno do `fin-platform`, com número de versão
maior. Demonstre que, sem mitigação, o build resolve para o pacote do registry público (o
malicioso). Mitigue configurando escopo/namespace privado explícito, e prove que o build
volta a puxar o pacote interno correto.

**Invariantes testáveis**

1. Sem a mitigação configurada, o build de teste puxa o pacote do registry público
   (comportamento inseguro, reproduzido deliberadamente).
2. Com a mitigação, o mesmo build passa a puxar o pacote interno, mesmo com o público
   anunciando versão maior.
3. O SBOM gerado no build corrigido lista a versão correta (a interna) do pacote.
4. O gate de CVE alcançável barra um build de teste com uma vulnerabilidade conhecida
   colocada deliberadamente numa função efetivamente chamada pelo código.

**Complemento.** Configure pinning por hash para as dependências diretas de um dos
serviços do `fin-platform`, e demonstre que trocar o conteúdo de uma dependência sem
mudar seu número de versão declarado quebra o build.

**Checagem**

1. Por que dependency confusion consegue substituir um pacote interno legítimo sem
   explorar nenhuma falha de código da aplicação?
2. Por que "0 vulnerabilidades" num relatório de SCA costuma ser um sinal de alerta, e não
   de tranquilidade?
3. O que alcançabilidade acrescenta a EPSS e KEV na priorização de correção de CVE?
4. Qual é a relação entre o que esta trilha ensina sobre SBOM e o que `kubernetes/09`
   ensina sobre política de admissão?

## Principais aprendizados

- O ataque de cadeia de suprimentos não exige código próprio com falha — typosquatting,
  dependency confusion e mantenedor comprometido entram pela dependência, não pela lógica.
- Dependências transitivas dominam o risco real, e "0 vulnerabilidades" costuma significar
  scanner mal configurado, não ausência de risco.
- Alcançabilidade, somada a EPSS e KEV, é o que torna a priorização de CVE sustentável —
  sem ela, o time persegue vulnerabilidade que nunca é de fato invocada.
- SBOM, proveniência e SLSA são as duas metades de um controle cujo outro lado
  (verificação na admissão) já existe em `kubernetes/09` — aqui se aprende a produzir.
- O próprio pipeline de CI/CD é um alvo: `pull_request_target` sobre fork, segredo em log,
  runner compartilhado e token com permissão além do necessário são vetores reais.
