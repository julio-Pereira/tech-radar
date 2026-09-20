---
id: owasp-e-asvs
title: "OWASP como mapa: Top 10, API Top 10 e ASVS"
summary: "Três artefatos com três usos diferentes — e por que autorização quebrada domina o API Top 10 de um jeito que nenhum scanner detecta. Marco crítico: quiz estendido."
estimatedMinutes: 55
references:
  - title: "OWASP Application Security Verification Standard (ASVS)"
    url: https://owasp.org/www-project-application-security-verification-standard/
  - title: "OWASP API Security Project"
    url: https://owasp.org/www-project-api-security/
  - title: "FIRST — Exploit Prediction Scoring System (EPSS)"
    url: https://www.first.org/epss/
---

## Três artefatos, três usos

O ecossistema OWASP produz vários documentos que parecem intercambiáveis e não são. O
**OWASP Top 10** é uma lista de dez categorias de risco, reescrita a cada poucos anos —
serve para conversa e para conscientização, é ruim como critério de aceite porque uma
categoria como "falhas criptográficas" não diz o que testar. O **API Security Top 10** é
o recorte que interessa a quem escreve backend: nasce da observação de que APIs falham de
um jeito sistematicamente diferente de aplicação web tradicional. E o **ASVS**
(Application Security Verification Standard) é o único dos três que é **verificável**:
cada item é um requisito numerado, testável, agrupado por nível (1, 2 ou 3, crescendo em
rigor). É do ASVS que sai critério de aceite de verdade — "o sistema atende ASVS 4.1.1"
é uma frase que se testa; "o sistema segue o OWASP Top 10" não é.

A edição vigente de cada um desses documentos muda com o tempo; esta trilha ensina o
raciocínio por trás deles, não a numeração de uma edição específica — a versão vigente
fica registrada aqui e no `GLOSSARIO.md`, para o resto do catálogo não precisar
acompanhar.

## Por que autorização quebrada domina o API Top 10

Historicamente, as duas primeiras posições do API Top 10 são de autorização quebrada:
**BOLA** (Broken Object Level Authorization — o `id` é de outro cliente) e **BFLA**
(Broken Function Level Authorization — o endpoint administrativo que o cliente comum
também consegue chamar, porque ninguém verificou o papel). A razão para essas duas
dominarem não é falta de ferramenta boa — é que **nenhum scanner sabe de quem é a
conta**. Um SAST vê que o endpoint existe e está protegido por autenticação; ele não sabe
que o `accountId` do path deveria pertencer ao dono do token. A requisição de um BOLA é
sintaticamente perfeita, autenticada, com token válido — o único jeito de pegar isso é
testar a relação entre identidade e recurso, não a sintaxe da requisição.

## Escolher o nível ASVS por classe de dado

O erro mais comum ao adotar ASVS é aplicar o mesmo nível em tudo: ou nível 1 em serviço
que move dinheiro (rigor insuficiente), ou nível 3 em endpoint de leitura pública (esforço
desperdiçado). A escolha certa depende da **classe de dado** que o componente manipula —
o mesmo raciocínio de `dados-distribuidos/13`, aplicado agora à escolha de controle em vez
de à escolha de armazenamento. Um serviço que inicia pagamento justifica ASVS nível 2 ou 3;
um endpoint que serve a lista de bandeiras aceitas não.

O ganho maior de escrever requisito ASVS como **teste automatizado desde o início** não
aparece agora — aparece no marco 12, quando "requisito de segurança" deixa de ser
documento e vira gate de pipeline. Um requisito ASVS satisfeito manualmente uma vez e
nunca mais verificado é conhecimento que envelhece no primeiro refactor.

## CWE × CVE × CVSS × EPSS/KEV

Quatro siglas que descrevem coisas diferentes na cadeia de uma vulnerabilidade, e
confundi-las custa priorização errada:

- **CWE** (Common Weakness Enumeration) é a **taxonomia** — a categoria do defeito (ex.:
  CWE-89, injeção de SQL).
- **CVE** (Common Vulnerabilities and Exposures) é a **instância** — esta vulnerabilidade
  específica, nesta versão desta biblioteca.
- **CVSS** é a **severidade teórica** — o quão ruim seria, se explorada, numa escala de
  0 a 10, calculada a partir de características técnicas.
- **EPSS** é a **probabilidade real de exploração** nos próximos 30 dias, um número
  atualizado com base em dados observados de exploração ativa. O **KEV** (Known Exploited
  Vulnerabilities, catálogo da CISA) vai além: lista CVEs com exploração **confirmada**,
  não estimada.

A consequência prática: uma CVE com CVSS 9.8 e EPSS próximo de zero, sem entrada no KEV,
pode esperar mais do que uma CVE com CVSS 6.5 que está no catálogo KEV. Severidade teórica
sem probabilidade real de exploração é a base de "0 vulnerabilidades críticas" que não
significa nada — tema que volta, com o critério de **alcançabilidade**, no marco 11.

## Exemplo numa fintech

O `spring-boot/09` já passou o `pix-gateway` pelo API Top 10 como exercício rápido, ao
configurar o resource server. Aqui, o mesmo exercício vira sistemático: cada uma das dez
categorias é avaliada contra cada endpoint exposto, o resultado vira backlog com item
numerado, severidade e **dono** — não uma lista de observações arquivada depois da
reunião. A diferença entre os dois momentos é a diferença entre "percebemos que isso pode
ser um problema" e "isto está corrigido, com teste, até a data X".

## Hands-on

**Tutorial — requisito ASVS como issue rastreável.** Escolha os requisitos ASVS nível 2
aplicáveis ao `pix-gateway` (autenticação, controle de sessão, validação de entrada,
tratamento de erro são bons pontos de partida). Para cada um: abra uma issue com o número
do requisito, o critério de aceite testável, e um dono. Não implemente ainda — o objetivo
deste passo é o backlog existir e ser rastreável, não a correção.

**Desafio — provar BOLA e fechar.** No endpoint de consulta de pagamento
(`GET /payments/{id}`), demonstre que o token do cliente A consegue ler o pagamento do
cliente B, escrevendo um teste que reproduz o problema **antes** de tocar na correção.
Corrija verificando, no caso de uso — não só no filtro HTTP —, que o `accountId` do
recurso pertence ao titular do token. Faça `git commit` da correção com o teste incluído.
É o mesmo rigor de `spring-boot/11` — teste que prova comportamento —, aplicado a um
**abuse case** em vez de a um caminho feliz: a prova de que o controle bloqueia o caminho
que ninguém previu, não apenas o que foi especificado.

```bash
# antes da correção: cliente A lê o pagamento do cliente B
curl -H "Authorization: Bearer <token-cliente-A>" http://localhost:8080/payments/<id-de-B>
# 200 — vazamento

# depois da correção
curl -H "Authorization: Bearer <token-cliente-A>" http://localhost:8080/payments/<id-de-B>
# 404 — não vaza nem a existência do recurso
```

**Invariantes testáveis**

1. Existe um teste automatizado que reproduz o BOLA, e ele **falhava** antes da correção —
   não um teste escrito depois só para passar.
2. Depois da correção, o cliente A recebe **404**, não 403, ao tentar acessar o recurso de
   B. 403 confirma que o recurso existe; 404 não vaza essa informação.
3. Cada requisito ASVS nível 2 escolhido está registrado como issue com critério de aceite
   testável e dono nomeado.
4. Pelo menos um requisito do backlog ASVS já está implementado com teste, não só
   registrado.

**Complemento.** Repita o exercício de BOLA num segundo endpoint que manipule um recurso
diferente (por exemplo, extrato ou consentimento). BOLA raramente é um bug isolado — é um
padrão de implementação que se repete em todo endpoint que recebe um `id` no path sem
revalidar a posse.

**Checagem**

1. Por que "o sistema segue o OWASP Top 10" não serve como critério de aceite, e "atende
   ASVS 4.1.1" serve?
2. Por que nenhum scanner automatizado detecta BOLA de forma confiável?
3. Dê um exemplo em que uma CVE de CVSS alto deveria ter prioridade **menor** do que uma
   de CVSS mais baixo, e explique por quê.
4. Por que aplicar ASVS nível 3 em todo endpoint, independentemente da classe de dado, é
   tão problemático quanto aplicar nível 1 em todos?

## Principais aprendizados

- Top 10, API Top 10 e ASVS têm usos diferentes: conscientização, recorte de backend e
  critério de aceite verificável, nessa ordem de utilidade para engenharia.
- BOLA e BFLA dominam o API Top 10 porque nenhuma ferramenta automatizada sabe de quem é
  a conta — só teste de relação entre identidade e recurso pega isso.
- O nível ASVS certo depende da classe de dado do componente, não de um padrão único
  aplicado a tudo — e o requisito escrito como teste hoje é o que sustenta o gate do
  marco 12.
- CVSS mede severidade teórica; EPSS e KEV medem probabilidade e confirmação reais de
  exploração. Priorizar só por CVSS gasta o trimestre no lugar errado.
- Provar BOLA com um teste que falha antes da correção, e fechar com 404 em vez de 403, é
  o padrão que se repete em toda correção de autorização desta trilha.
