---
id: transporte-e-borda
title: "Transporte e borda"
summary: "Não é sobre onde o login vive (isso é o marco 06) — é sobre como o token viaja depois de emitido: TLS que importa, cookie contra localStorage, CORS sem lenda, e a enumeração de chave Pix como vazamento por diferença."
estimatedMinutes: 55
references:
  - title: "OWASP Cross-Site Request Forgery Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - title: "MDN — Cross-Origin Resource Sharing (CORS)"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
  - title: "OWASP REST Security Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
---

## TLS que importa

"Tem cadeado" e "é seguro" não são a mesma frase. O que importa de verdade num TLS bem
configurado: a **versão** (TLS 1.2 como piso aceitável hoje, 1.3 preferível — versões
anteriores têm vulnerabilidade conhecida e não deveriam estar habilitadas), as **cipher
suites** habilitadas (descartar as que usam algoritmo quebrado ou modo sem autenticação),
e **HSTS** (HTTP Strict Transport Security — instrui o navegador a nunca tentar HTTP puro
de novo com aquele domínio, fechando a janela do primeiro acesso vulnerável a downgrade).
Um detalhe operacional que se perde com frequência: quando o **TLS termina no gateway**
(API gateway, load balancer), o **serviço de aplicação nunca vê a conexão TLS original** —
ele recebe HTTP puro internamente. Isso esconde do serviço qualquer coisa que dependesse de
inspecionar a conexão diretamente (o certificado do cliente, no caso de mTLS, é o exemplo
do marco 07 — e por isso precisa ser repassado e sanitizado explicitamente).

## Onde guardar o token no navegador

O debate entre **cookie** (`HttpOnly`, `Secure`, `SameSite`) e **localStorage** para
guardar token de sessão é real, não bikeshedding: **localStorage é acessível a qualquer
JavaScript rodando na página**, o que significa que um único XSS bem-sucedido expõe o
token inteiro — localStorage é, por isso, **indefensável** como armazenamento de token
contra um atacante que já conseguiu injetar script. Cookie `HttpOnly` não é acessível a
JavaScript, o que fecha essa porta — mas **traz de volta CSRF**, porque o navegador anexa
o cookie automaticamente a qualquer requisição para aquele domínio, inclusive as que o
próprio titular não iniciou conscientemente. `SameSite=Strict` ou `Lax` mitiga a maior
parte do CSRF sem exigir token anti-CSRF separado. O veredito prático para uma API de
fintech: **cookie `HttpOnly` + `Secure` + `SameSite`**, aceitando o resíduo de CSRF que
`SameSite` não cobre (navegadores antigos, alguns cenários de subdomínio) como risco menor
e mais gerenciável do que expor o token inteiro a qualquer XSS.

## CORS explicado corretamente

O mal-entendido mais comum sobre CORS: tratá-lo como **controle de segurança**. Não é —
**CORS é um relaxamento** da política de mesma origem que o navegador já aplica por
padrão. Ele existe para **permitir**, de forma controlada, que um domínio diferente
consuma sua API — não para proteger nada. A configuração perigosa é
**`Access-Control-Allow-Origin: *` combinada com `Access-Control-Allow-Credentials: true`**
— a maioria dos navegadores rejeita essa combinação exata por especificação, mas o padrão
que efetivamente quebra a proteção é o **reflexo cego de origem**: o servidor lê o header
`Origin` da requisição recebida e o devolve como `Access-Control-Allow-Origin`,
efetivamente aceitando **qualquer** origem, enquanto parece estar restringindo. CORS
correto é uma **allowlist explícita** de origens permitidas, nunca um reflexo automático.

## Headers que o backend de API realmente precisa

Boa parte da lista de "security headers" recomendada em tutorial genérico é para quem serve
**HTML** — `Content-Security-Policy`, `X-Frame-Options` protegem contra XSS e clickjacking
em página renderizada, e não fazem sentido para uma API que só devolve JSON consumido por
código, não por navegador renderizando a resposta diretamente. O que uma API de backend
realmente precisa: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` (impede
o navegador de tentar "adivinhar" o tipo de conteúdo de forma perigosa), e um
`Content-Type` de resposta correto e consistente. Aplicar a lista inteira de headers de
página HTML numa API JSON é esforço mal direcionado — não é errado, é apenas
desproporcional ao risco real daquele componente.

## Rate limit, quota e anti-automação como controle de segurança

Rate limit não é só sobre capacidade — é também **controle de segurança**: ele é o que
torna **credential stuffing** (testar credenciais vazadas em massa), **enumeração** (testar
sistematicamente quais identificadores existem) e **BOLA em escala** (tentar sistematicamente
`id`s sequenciais) inviáveis de escalar, mesmo quando o controle de autorização individual
está correto. O detalhe que decide se o rate limit protege alguma coisa: ele precisa ser
aplicado **por identidade**, não só por IP — um atacante distribuído por múltiplos IPs (ou
atrás de um NAT compartilhado legítimo) contorna qualquer limite por IP sozinho. *Ponte
explícita* com a futura trilha `performance-resiliencia`: o **mesmo mecanismo** de rate
limit aparece lá com **outro objetivo** — lá protege capacidade do sistema sob carga; aqui
protege o dado contra abuso sistemático.

## Vazamento por diferença

Uma classe de falha que não parece falha, porque nenhuma delas expõe dado diretamente:
**vazamento por diferença**. Um **stack trace em produção** revela estrutura interna do
sistema a quem não deveria ver. Uma **mensagem de erro que confirma que uma conta existe**
("senha incorreta" versus "usuário não encontrado" são duas respostas diferentes que juntas
permitem enumerar contas válidas). Um **tempo de resposta mensuravelmente diferente** entre
"conta não existe" (falha rápido) e "senha errada" (chega a comparar o hash, mais lento)
tem o mesmo efeito, só que pelo relógio em vez do texto. A resposta correta, nos três
casos, é a mesma: **erro genérico para fora** (a mesma mensagem, o mesmo tempo, para os
dois casos), e o **detalhe correlacionável por `trace_id`** disponível só para dentro, no
log — *reencontro* direto de `observabilidade/10`, que trata exatamente dessa separação
entre o que sai na resposta e o que fica no log correlacionado.

## Exemplo numa fintech

Um endpoint de **consulta de chave Pix**, sem nenhum controle de vazamento por diferença
nem rate limit por identidade, é uma base de clientes esperando para ser extraída por força
bruta: testar sistematicamente chaves candidatas (CPF, e-mail, telefone em sequência) e
observar qual resposta — ou qual tempo de resposta — indica "esta chave existe" entrega,
silenciosamente, quais pessoas são clientes da instituição, sem nunca "vazar dado" no
sentido óbvio de um banco de dados exposto.

## Hands-on

**Desafio — endpoint de consulta sem enumeração.** Corrija (ou implemente do zero) um
endpoint de consulta de chave Pix para que a resposta e o tempo de resposta sejam
**indistinguíveis** entre chave existente e inexistente, e adicione rate limit por
identidade autenticada (não apenas por IP).

**Invariantes testáveis**

1. 500 consultas a chaves aleatórias, geradas para não existir, não revelam — pela
   resposta — quais delas de fato não existem versus existem.
2. O tempo médio de resposta para chave existente e para chave inexistente, medido em
   amostra suficiente, não é estatisticamente distinguível.
3. O rate limit dispara ao ultrapassar o limiar por identidade, e o evento fica registrado.
4. Um teste automatizado cobre os três invariantes acima, não apenas verificação manual.

**Complemento.** Configure CORS no `pix-gateway` usando reflexo cego de origem (leia o
header `Origin` e devolva-o em `Access-Control-Allow-Origin`), demonstre que qualquer
origem passa a ser aceita, e corrija para uma allowlist explícita.

```bash
curl -i -H "Origin: https://attacker.example" http://localhost:8080/payments
# com reflexo cego: Access-Control-Allow-Origin: https://attacker.example (refletido)
# depois da correção (allowlist explícita): header ausente ou restrito às origens permitidas
```

**Checagem**

1. Por que "tem cadeado" não é sinônimo de "TLS bem configurado"?
2. Por que localStorage é considerado indefensável para guardar token, mesmo sendo mais
   simples de usar do que cookie `HttpOnly`?
3. Por que CORS não deveria ser descrito como "controle de segurança"?
4. Dê um exemplo de vazamento por diferença que não envolva mensagem de erro em texto.

## Principais aprendizados

- TLS bem configurado exige versão, cipher suites e HSTS corretos — "tem cadeado" não
  garante nenhum dos três, e terminação no gateway esconde a conexão original do serviço.
- Cookie `HttpOnly`/`Secure`/`SameSite` é o veredito prático para token de API de fintech;
  localStorage é indefensável contra XSS, e cookie sozinho reabre CSRF que `SameSite` mitiga.
- CORS é relaxamento de política de origem, não controle de segurança — reflexo cego de
  `Origin` anula qualquer proteção que pareça existir.
- Rate limit por identidade (não só por IP) é controle de segurança contra credential
  stuffing, enumeração e BOLA em escala — o mesmo mecanismo que `performance-resiliencia`
  usa com outro objetivo.
- Vazamento por diferença (stack trace, mensagem, tempo de resposta) exige resposta
  genérica para fora e detalhe correlacionado por `trace_id` só para dentro.
