---
id: entrada-nao-confiavel
title: "Entrada não confiável: injeção, SSRF e desserialização"
summary: "Allowlist sobre denylist, a diferença entre validar formato na borda e garantir invariante no domínio, e por que a nuvem promoveu SSRF a falha crítica."
estimatedMinutes: 55
references:
  - title: "OWASP Cheat Sheet Series — Input Validation"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
  - title: "OWASP Server-Side Request Forgery Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
  - title: "OWASP Deserialization Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
---

## Allowlist sobre denylist, borda e domínio

A regra que resolve a maioria dos problemas de entrada antes de qualquer técnica
específica é simples de enunciar e fácil de não seguir: valide por **allowlist**
(o que é permitido) em vez de **denylist** (o que é proibido). Denylist sempre esquece um
caso — é uma lista de coisas que alguém já pensou, e o atacante só precisa pensar em uma
que ninguém pensou. Allowlist inverte o ônus: só passa o que foi explicitamente aceito.

Mas allowlist na borda resolve só metade do problema, e a metade que gera falsa sensação
de segurança é justamente pensar que resolve tudo. `@NotNull` e um regex de formato
garantem que o campo **parece** certo; eles não garantem que o valor faz sentido para o
negócio. `@NotNull` não impede um valor de estorno negativo, nem um valor de compra maior
que o limite do cartão, nem uma data de vencimento no passado. Essa segunda camada —
**invariante de negócio** — mora no domínio, não na anotação de borda. As duas camadas
são necessárias e nenhuma substitui a outra: a borda rejeita o obviamente mal formado
antes de gastar processamento; o domínio rejeita o bem formado que ainda assim é errado.

## Injeção além do SQL

Injeção de SQL é a mais famosa, mas a família é maior, e o padrão se repete: dado não
confiável interpretado como código ou comando em algum interpretador.

- **NoSQL injection** — o operador (`$where`, `$ne`) injetado num filtro de MongoDB
  quando o filtro é montado por concatenação de string em vez de por objeto tipado.
- **LDAP injection** — o mesmo problema, num filtro LDAP de autenticação.
- **SSTI** (Server-Side Template Injection) — quando a entrada do usuário é interpretada
  pelo motor de template, e não só inserida nele.
- **Injeção de expression language** — a mesma classe, em `SpEL` ou `OGNL`.
- **Log injection / CRLF** — um valor de entrada com quebra de linha forjando entradas de
  log inteiras. É particularmente caro numa fintech, porque o log forjado **envenena a
  auditoria** que o marco 14 depende de tratar como fonte de verdade.
- **Header injection** — a mesma ideia, injetando cabeçalho HTTP a partir de entrada não
  sanitizada usada para montar resposta.

A defesa estrutural para SQL é **query parametrizada** — não porque "escapar aspas"
funcione pior, mas porque parametrização separa dado de código no nível do protocolo,
tornando a classe de erro estruturalmente impossível, não apenas improvável. O detalhe que
o ORM não resolve sozinho: **`ORDER BY` dinâmico**, **native query** e **concatenação em
projeção** (`SELECT` montado por string) reintroduzem o problema mesmo dentro de um
framework que parametriza tudo o resto por padrão. O ORM protege o que passa pelo caminho
dele; o que sai do caminho dele volta a ser responsabilidade de quem escreveu a query.

## SSRF, a falha que a nuvem promoveu a crítica

**SSRF** — já no `GLOSSARIO.md` desta trilha — ganhou peso crítico com a nuvem porque
todo provedor expõe um **endpoint de metadados** (frequentemente em `169.254.169.254`) que
devolve credencial da instância para quem conseguir fazer o servidor requisitá-lo. Os
vetores mais comuns numa fintech: a **URL de callback fornecida pelo parceiro** (o PSP diz
"me avise nesta URL quando processar", e a URL é atacante-controlada), e um **redirect**
que escapa de uma allowlist ingênua.

A mitigação que de fato funciona é **egress allowlist** — o serviço só consegue abrir
conexão de saída para destinos explicitamente permitidos, aplicada na camada de rede, não
só em código de aplicação. É o mesmo padrão de "saída por gateway fixo" que
`kubernetes/11` ensina para NetworkPolicy — lá é controle de rede para workload, aqui é a
mesma ideia aplicada à chamada HTTP de saída da aplicação. **Regex em URL não é mitigação
real**: resolução de DNS pode mudar entre a validação e a chamada (TOCTOU), e um redirect
302 para o destino proibido contorna qualquer checagem feita só na URL original.

## Desserialização, path traversal, XXE e zip bomb

**Desserialização insegura** é o vetor por trás de boa parte dos gadget chains críticos em
Java: um objeto desserializado a partir de entrada não confiável pode acionar código
arbitrário através de classes já presentes no classpath, sem que o atacante precise
injetar código novo. **Path traversal** em upload (`../../etc/passwd` disfarçado de nome
de arquivo) escreve fora do diretório esperado. **XXE** (XML External Entity) faz o parser
de XML seguir uma referência externa definida na própria entrada. **Zip bomb** explora
compressão para consumir memória ou disco de forma desproporcional ao tamanho do arquivo
recebido. O fio comum entre os quatro: nenhum valida o **tipo de conteúdo real** do que
está sendo processado, apenas a extensão ou o cabeçalho declarado — que o atacante
controla.

## Mass assignment

**Mass assignment** é o binding automático de formulário ou JSON para objeto que aceita
mais campos do que deveria, porque o DTO exposto na API é, na prática, a entidade de
domínio. Um `PATCH /users/me` que aceita `{"role": "ADMIN"}` porque o binder mapeia todo
campo do JSON para um campo do objeto, sem lista explícita do que é permitido alterar por
aquele endpoint, é o exemplo canônico — e a correção, de novo, é allowlist: um DTO de
entrada específico do endpoint, com só os campos que aquela operação deveria aceitar.

## Exemplo numa fintech

O campo de valor de uma transação, vindo do PSP como string, chega com separador decimal
que varia conforme a origem — `"1.234,56"` de um parceiro, `"1234.56"` de outro. O erro
caro não é a falta de validação de formato na borda (isso é fácil de acertar); é tratar o
parsing como puramente técnico e empurrá-lo para dentro do caso de uso, onde ele se mistura
com regra de negócio e passa a ser reimplementado, de formas ligeiramente diferentes, em
cada lugar que recebe valor externo. O parsing defensivo — normalizar, validar faixa,
rejeitar formato ambíguo — pertence à borda, uma vez só, com teste. É o mesmo raciocínio
de responsabilidade de camada de `spring-boot/13`, aplicado aqui à entrada não confiável em
vez de à mensageria.

## Hands-on

**Desafio — corrigir SSRF no endpoint de callback.** Você tem (ou simula) um endpoint que
recebe uma URL de callback do PSP e faz uma requisição HTTP para ela ao concluir o
processamento. Demonstre a exploração: aponte a URL para o endpoint de metadados da nuvem
(ou um stub local que simula a resposta) e para uma URL que faz redirect 302 para esse
mesmo destino. Corrija com allowlist de destino (host e porta explicitamente permitidos) e
resolução de DNS validada no momento da chamada, não apenas na validação inicial.

```bash
curl -X POST http://localhost:8080/psp/callback-config \
  -d '{"callbackUrl":"http://169.254.169.254/latest/meta-data/"}'
# antes da correção: a requisição é aceita e o callback chega a ser chamado
# depois da correção (allowlist de destino): rejeitada antes de qualquer chamada de rede
```

**Invariantes testáveis**

1. Uma requisição direta ao endpoint de metadados, usando a URL de callback, é bloqueada.
2. Uma URL de callback que faz redirect 302 para o endpoint de metadados também é
   bloqueada — a allowlist é verificada no destino final, não só na URL declarada.
3. Uma URL de callback legítima, apontando para um destino permitido, continua funcionando
   sem falso positivo.
4. Existe um teste automatizado cobrindo os três casos acima, não uma verificação manual.

**Complemento.** Localize, no seu próprio código ou num projeto de exemplo, um lugar que
monta `ORDER BY` a partir de entrada do usuário (um parâmetro de ordenação de listagem é o
caso mais comum). Reescreva usando uma allowlist de colunas permitidas, mapeando o valor
recebido para uma constante interna — nunca concatenando o valor recebido direto na query.

**Checagem**

1. Por que `@NotNull` numa API de estorno não impede um valor negativo, e onde deveria
   morar a validação que impede?
2. Por que query parametrizada é uma defesa estrutural contra SQL injection, e onde ela
   deixa de proteger mesmo dentro de um ORM?
3. Por que validar uma URL de callback por regex não é suficiente contra SSRF?
4. Dê um exemplo de mass assignment que não envolva o campo `role`.

## Principais aprendizados

- Allowlist resolve o que denylist sempre vai esquecer; validação de formato na borda e
  invariante de negócio no domínio são camadas diferentes, e nenhuma substitui a outra.
- A família de injeção vai muito além de SQL: NoSQL, LDAP, template, expression language,
  log/CRLF e header injection seguem o mesmo padrão — dado não confiável interpretado como
  código.
- SSRF é crítico na nuvem por causa do endpoint de metadados; a mitigação real é egress
  allowlist verificada no destino final, não regex na URL declarada.
- Desserialização insegura, path traversal, XXE e zip bomb compartilham a mesma causa raiz:
  confiar no tipo de conteúdo declarado em vez de validar o real.
- Parsing defensivo de entrada externa pertence à borda, uma vez, com teste — não
  espalhado pelo caso de uso, onde ele se multiplica e diverge.
