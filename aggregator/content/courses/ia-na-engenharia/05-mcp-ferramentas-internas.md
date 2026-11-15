---
id: mcp-ferramentas-internas
title: "MCP: ferramentas internas para agentes"
summary: "Um servidor MCP é uma API pública para um cliente que obedece a qualquer texto que ler: desenhe como API, autorize como API e registre como API. O que o protocolo padroniza, a revisão 2026-07-28 sem estado, a autorização sobre OAuth 2.1 com a audiência do token, ferramenta estreita e só de leitura, descrição como contrato, saída limitada e sem dado pessoal, auditoria por chamada e quando não fazer — com um servidor em Go que barrou o token de outra audiência antes de tocar os dados, e um achado: o SDK só negocia a revisão nova com o handler sem estado ligado."
estimatedMinutes: 65
reviewedAt: 2026-11-14
reviewEvery: 3m
competencies: [seguranca, plataforma]
references:
  - title: "Model Context Protocol — specification (2026-07-28)"
    url: https://modelcontextprotocol.io/specification/2026-07-28
  - title: "Model Context Protocol — Key changes in 2026-07-28"
    url: https://modelcontextprotocol.io/specification/2026-07-28/changelog
  - title: "Model Context Protocol — Authorization: security considerations"
    url: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations
  - title: "MCP Go SDK"
    url: https://github.com/modelcontextprotocol/go-sdk
---

## Uma API para um cliente que obedece a tudo

O **Model Context Protocol** (MCP) padroniza como um agente descobre e chama ferramentas que outros
sistemas expõem. Para quem desenha o servidor, a frase que importa é esta: **um servidor MCP é uma API
pública para um cliente que obedece a qualquer texto que ler.** O cliente é um modelo. Ele chama a
ferramenta porque um usuário pediu, porque uma issue sugeriu ou porque uma página que ele leu mandou
(marco 06).

A consequência: desenhe como API, autorize como API e registre como API. Tudo de `system-design/05` (API
como contrato) e de `seguranca-aplicacao/05` e `/08` (OAuth e autorização) vale, com a diferença de que o
chamador pode estar enganado.

## O que o protocolo padroniza

O MCP define um **cliente** (o agente, ou o aplicativo que o hospeda) e um **servidor** (quem expõe
capacidades), com três primitivas do servidor:

- **ferramentas:** funções que o modelo chama, com entrada descrita por esquema JSON;
- **recursos:** dados que o cliente lê por URI;
- ***prompts***: modelos de mensagem oferecidos ao usuário.

O transporte é **stdio** (o servidor como processo local) ou **Streamable HTTP** (o servidor como serviço
de rede). Para uma ferramenta interna de um banco, o HTTP é o caso comum, e é nele que entra a autorização.

## A revisão vigente: 2026-07-28, sem estado

Conferido em 14 nov 2026, no repositório da especificação, a revisão vigente é a **2026-07-28**. As
mudanças que importam para quem opera um servidor:

- **o núcleo ficou sem estado.** Não há mais o *handshake* `initialize` nem o cabeçalho `Mcp-Session-Id`.
  Cada requisição leva a versão do protocolo e as capacidades do cliente no `_meta`. O servidor tem de
  implementar o `server/discover`. Estado entre chamadas, quando preciso, vira um identificador explícito
  passado como argumento;
- ***roots*, *sampling* e *logging* foram descontinuados**, com janela mínima de 12 meses;
- na autorização, o **registro dinâmico de cliente** (RFC 7591) foi descontinuado em favor do *Client ID
  Metadata Document*. O servidor de autorização **deveria** incluir o `iss` na resposta (RFC 9207), e o
  cliente **deve** validá-lo quando presente.

Para o servidor, "sem estado" é boa notícia: cada requisição se autoriza sozinha, escala horizontalmente
sem afinidade e não carrega sessão para sequestrar.

**O achado do laboratório.** O SDK oficial em Go, na v1.8.0, suporta a 2026-07-28, e o cliente a pede por
padrão. Mas o *handler* HTTP do servidor só a negocia com `StreamableHTTPOptions{Stateless: true}`. Sem a
opção, a sessão do teste caiu para a **2025-11-25**, com o *handshake* antigo, sem erro nenhum. O teste do
`fin-assist` passou a falhar se a versão negociada não for a 2026-07-28.

## Autorização: o token tem de ser para este servidor

Sobre HTTP, o MCP usa **OAuth 2.1**. Pela seção de segurança da especificação:

- o *token* é ligado à **audiência** do servidor (RFC 8707): um *token* emitido para o `ledger-core` não
  serve no servidor MCP, e vice-versa;
- o ***token passthrough*** é proibido: o servidor MCP não repassa o *token* que recebeu para outra API.
  Se precisa chamar o `ledger-core`, pede o próprio *token*, com a própria audiência.

O erro clássico é o servidor que aceita qualquer *token* válido do provedor de identidade, de qualquer
audiência. Aí, um *token* vazado de qualquer outro serviço abre as ferramentas internas. O OAuth e o OIDC em
detalhe estão em `seguranca-aplicacao/05`.

## Desenhar a ferramenta

Uma ferramenta MCP boa é **estreita**: faz uma coisa, com entrada mínima.

- **Só leitura por padrão.** A primeira versão de qualquer servidor interno só lê. A anotação
  `readOnlyHint` diz isso ao cliente, mas **anotação não é controle**: o controle é a ferramenta receber só
  uma interface de leitura, sem método de escrita para chamar.
- **Idempotente**, para que a repetição do agente não mude nada.
- **A descrição é contrato.** O modelo escolhe a ferramenta pela descrição. "Lê um lançamento pelo
  identificador. Devolve o identificador e o valor; nunca o histórico, CPF, conta ou chave Pix" diz o que ela
  faz e o que ela promete não fazer, e a ferramenta não pode devolver nada além disso.
- **Entrada validada antes de tocar o dado**: o esquema com padrão (`^L-\d{1,8}$`), lista fechada de valores,
  nenhum campo extra. Entrada fora do esquema volta como erro sem chegar ao repositório.
- **Saída limitada e sem dado pessoal.** A ferramenta projeta só os campos que promete, e uma segunda
  camada remove os padrões que escaparem (chave Pix aleatória, CPF, CNPJ, conta, e-mail e telefone, nos formatos
  comuns), **inclusive na mensagem de erro**: o erro do repositório pode carregar o dado que a projeção tirou, e
  o cliente recebe uma mensagem genérica, com o detalhe limpo na auditoria. A limpeza por padrão não reconhece
  um nome próprio nem um formato novo; por isso a projeção é a primeira defesa. A resposta tem tamanho máximo, e o corte
  vem com aviso explícito, para o agente refinar em vez de concluir com metade do dado.
- **Escrita, só com confirmação humana fora do agente.** Uma ferramenta que estorna, bloqueia ou muda
  limite não confia no "o usuário pediu" do modelo: a confirmação acontece num canal que o agente não
  controla (marco 06).

**Auditoria por chamada.** Cada chamada gera um registro: quem (a identidade do *token*), qual ferramenta,
com quais argumentos e um resumo do resultado, inclusive quando falha. É o que responde "o agente leu o
quê, a pedido de quem?".

**Versão.** A ferramenta é uma API: mudança incompatível de esquema ganha nome novo ou versão, e a
descrição antiga não muda de significado.

## Servidor MCP como produto da plataforma

Um servidor MCP interno é infraestrutura compartilhada: o time de plataforma oferece um modelo (o
*golden path* de `engenharia-de-plataforma/04`) com autenticação, auditoria, limite e esquema prontos, e os
times de produto escrevem só a ferramenta. O que cada time não deveria reinventar é exatamente o que este
marco testa.

**Quando não fazer.** Se uma CLI com `--help` resolve, o agente já sabe usá-la, e ela já tem autorização,
auditoria e versão. Um servidor MCP para embrulhar um comando que o agente roda direto é mais uma API para
proteger, sem ganho.

> **Armadilha.** Confiar na anotação `readOnlyHint` como se fosse permissão. Ela é uma dica para o cliente.
> Uma ferramenta marcada como só leitura que recebe o repositório inteiro escreve no dia em que alguém
> mudar uma linha.

> **O que o cliente de teste não reproduz.** O cliente do laboratório chama as ferramentas com argumentos
> escolhidos pelo teste. Um modelo escolhe qual ferramenta chamar, e com quais argumentos, a partir da
> descrição e do que leu, e pode ser induzido a pedir o que não devia. O laboratório prova que o servidor
> recusa o que deve recusar, qualquer que seja o pedido.

## Exemplo numa fintech

O time expôs "consultar lançamento do ledger" ao agente para acelerar a investigação de reclamações. Na
primeira semana, um analista colou a resposta da ferramenta num ticket: ela trazia o histórico do
lançamento, e o histórico trazia o CPF e a chave Pix da contraparte, porque era assim que o ledger guardava
a descrição. A correção:

- a ferramenta passou a projetar só o identificador e o valor, e uma segunda camada passou a remover os
  padrões de dado pessoal de qualquer texto que saia, inclusive dos erros;
- a varredura dessas saídas entrou no teste, sobre *fixtures* com os dados de propósito;
- o registro de auditoria passou a mostrar quem pediu cada consulta.

## Hands-on

**Tutorial.** O servidor MCP de leitura do `fin-assist` (`mcp/`, Go, SDK v1.8.0) com duas ferramentas sobre
dados sintéticos do `ledger-core`: `consultar_lancamento` e `ultimo_deploy`. Ele roda atrás do verificador de
*token* do SDK (`auth.RequireBearerToken`), no *handler* HTTP sem estado. O teste sobe o servidor com
`httptest` e fala com ele com o cliente do SDK.

**Desafio.** Endurecer o servidor até as seis invariantes passarem.

**Invariantes testáveis**

1. **Token para este servidor, e só.** Sem *token*, com *token* de outra audiência, vencido ou com assinatura
   falsa: a conexão é recusada, e o repositório não recebe nenhuma leitura. Medido: os quatro recusados, zero
   leituras; o *token* certo conecta.
2. **Nenhuma ferramenta escreve.** O teste lista as ferramentas, exige um caso para cada uma, confere a
   anotação de só leitura e chama todas contra um repositório que conta escritas. Medido: zero escritas.
3. **Nada de dado pessoal na saída.** A *fixture* tem CPF, chave Pix e conta no histórico; nenhuma resposta os
   traz. Medido: limpas.
4. **Toda chamada auditada.** Três chamadas (uma que falha), três registros com identidade, ferramenta,
   argumentos e resultado; a falha registrada como erro.
5. **Entrada fora do esquema, rejeitada antes do dado.** Injeção no identificador, caminho de arquivo, campo
   extra, campo faltando e serviço fora da lista: os cinco rejeitados, zero leituras.
6. **Resposta grande, truncada com aviso.** Medido: um *changelog* de 14.030 bytes chegou com 2.048 bytes de
   dado mais o aviso `[truncado: 2048 de 14030 bytes; refine a consulta]`, sem cortar um caractere ao meio.

E a sétima, que veio do achado: **a versão negociada é a 2026-07-28**. Sem `Stateless: true`, foi a 2025-11-25.

**A revisão adversarial.** Um revisor separado tentou burlar o servidor. Pegos de saída: CPF sem pontuação,
e-mail em maiúsculas, `aud` com outra grafia, identificador com dígitos de outra escrita. Burlas que viraram
regra, cada uma com o seu teste:

- o **erro do repositório** levava CPF e e-mail ao cliente e à auditoria;
- a **chave Pix aleatória** (UUID), o CPF com espaço ou ponto, o telefone com DDD entre parênteses, a conta de 6 a
  7 dígitos e o CNPJ passavam pela limpeza;
- o *token* **sem sujeito** conectava, e a auditoria gravava uma identidade vazia;
- o `aud` em **lista**, que a RFC 7519 permite, era recusado mesmo contendo este servidor.

Três mutações provaram os testes originais, e duas, os novos. Medido:

- tirar a limpeza de dado pessoal reprovou a invariante 3;
- ignorar a audiência do *token* reprovou a 1;
- tirar o padrão do identificador do esquema reprovou a 5.

Um detalhe de ferramenta virou conteúdo: o *middleware* do SDK confere o vencimento do *token* contra o
relógio real, além do verificador. O primeiro teste, com um relógio fixo, recusou o *token* válido.

**Complemento.** Ligue o servidor a um agente de código real e peça uma investigação ("por que o lançamento
L-42 não aparece no extrato?"). Olhe o registro de auditoria: quais ferramentas ele chamou, com quais
argumentos, e alguma chamada foi recusada pelo esquema?

**Checagem**

1. Por que um *token* de outra audiência tem de ser recusado, e o que é *token passthrough*?
2. Por que a anotação de só leitura não basta, e qual é o controle de verdade?
3. O que a revisão 2026-07-28 mudou, e o que o laboratório descobriu sobre o SDK?
4. Quando não vale a pena escrever um servidor MCP?

## Principais aprendizados

- Um servidor MCP é uma API para um cliente que obedece a qualquer texto: desenhe, autorize e registre como
  API.
- Revisão 2026-07-28 (nov 2026): sem estado, sem `initialize`; *roots*, *sampling* e *logging*
  descontinuados; registro dinâmico de cliente descontinuado.
- OAuth 2.1 com a audiência do servidor; *token passthrough* proibido.
- Ferramenta estreita, só leitura por interface, descrição como contrato, entrada validada, saída limitada e
  limpa, auditoria por chamada.
- Medido: o SDK v1.8.0 só negociou a 2026-07-28 com o *handler* sem estado; sem ele, caiu para a 2025-11-25
  sem erro.
- Uma CLI com `--help` muitas vezes resolve; um servidor é mais uma API para proteger.
