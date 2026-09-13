Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira —
o Bloco A cria o vocabulário e os blocos seguintes o reencontram, sempre com o ataque e a
mitigação lado a lado.

## Modelagem de ameaça

### STRIDE
**Em uma frase:** um checklist de seis categorias de ameaça — spoofing, tampering, repúdio, vazamento de informação, negação de serviço, elevação de privilégio — usado para não esquecer nenhuma classe ao analisar um DFD.
**No fin-platform:** aplicado à fronteira entre o `pix-gateway` e o PSP parceiro, STRIDE é o que lembra de perguntar "o PSP pode negar depois que enviou o webhook?" — repúdio, não só spoofing.
**Erro comum:** rodar STRIDE uma vez, no início do projeto, e nunca mais — a modelagem de ameaça é contínua, a cada mudança de fronteira.
**Onde na prática:** marco 01.

## OWASP e verificação

### ASVS
**Em uma frase:** o Application Security Verification Standard — requisito de segurança numerado, testável e organizado por nível (1, 2, 3), ao contrário do Top 10, que é lista de conscientização.
**No fin-platform:** os requisitos ASVS nível 2 do `pix-gateway` viram issues com dono, não um PDF lido uma vez pelo time.
**Erro comum:** aplicar o mesmo nível ASVS em toda a aplicação — o nível certo depende da classe de dado, não da preguiça de decidir.
**Onde na prática:** marco 02; retomado como gate automatizado no marco 13.

### BOLA
**Em uma frase:** Broken Object Level Authorization — a requisição é sintaticamente válida, autenticada e com token legítimo, mas aponta para o objeto de outra pessoa.
**No fin-platform:** o token do cliente A, válido e com escopo correto, usado para ler `GET /payments/{id}` de um pagamento do cliente B.
**Erro comum:** achar que autenticação forte resolve BOLA — ela não resolve, porque o problema nunca foi provar quem é o cliente, foi verificar de quem é o recurso.
**Onde na prática:** marco 02, provado e corrigido; reencontrado como o motivo de existir da matriz de autorização do marco 08.

### EPSS
**Em uma frase:** Exploit Prediction Scoring System — a probabilidade estimada de uma CVE ser explorada nos próximos 30 dias, ao contrário do CVSS, que mede severidade teórica.
**No fin-platform:** uma CVE 9.8 sem EPSS relevante e sem exploit no catálogo KEV pode esperar a próxima janela; uma 6.5 com EPSS alto, não.
**Erro comum:** priorizar backlog de vulnerabilidade só por CVSS — é like ordenar incêndios pelo tamanho da fumaça, não pelo que está queimando de verdade.
**Onde na prática:** marco 02; usado como critério de gate no marco 12, junto com alcançabilidade.

### KEV
**Em uma frase:** o catálogo (Known Exploited Vulnerabilities, mantido pela CISA) de CVEs com exploração confirmada em ambiente real, não hipotética.
**No fin-platform:** uma CVE no KEV entra na fila de correção antes de qualquer coisa nova, independentemente de prioridade de produto.
**Erro comum:** tratar KEV e EPSS como a mesma coisa — KEV é fato observado, EPSS é previsão estatística; os dois se complementam, não se substituem.
**Onde na prática:** marco 02; critério de gate no marco 12.

## Entrada não confiável

### SSRF
**Em uma frase:** Server-Side Request Forgery — o servidor é induzido a fazer uma requisição para um destino que o atacante escolhe, não o cliente.
**No fin-platform:** a URL de callback fornecida pelo PSP parceiro, usada sem allowlist, apontando para o endpoint de metadados da nuvem.
**Erro comum:** mitigar com regex de validação de URL — redirect encadeado e resolução de DNS variável furam regex; a defesa real é allowlist de destino com egress controlado.
**Onde na prática:** marco 03.

## Identidade e federação

### SSO
**Em uma frase:** Single Sign-On — autenticar uma vez e obter acesso a múltiplas aplicações sem repetir a credencial.
**No fin-platform:** o operador de backoffice entra uma vez pelo AD corporativo e acessa o console do `pix-gateway` e outras ferramentas internas sem novo login.
**Erro comum:** achar que SSO é sinônimo de OIDC — SSO é o objetivo; OIDC, SAML e Kerberos são protocolos que o implementam.
**Onde na prática:** marco 06.

### IdP × RP × SP
**Em uma frase:** Identity Provider (quem autentica), Relying Party (quem confia, termo OIDC) e Service Provider (o mesmo papel de RP, termo SAML).
**No fin-platform:** o backoffice do `pix-gateway` é o RP; o Keycloak, atuando como broker, intermedia o IdP upstream corporativo.
**Erro comum:** usar RP e SP como se fossem coisas diferentes — são o mesmo papel, só em famílias de protocolo diferentes.
**Onde na prática:** marco 06.

### Broker de identidade
**Em uma frase:** um IdP que, em vez de autenticar diretamente, federa a autenticação para um ou mais IdPs upstream.
**No fin-platform:** o Keycloak do `fin-platform` roteia o login do operador para o IdP corporativo simulado, sem o `pix-gateway` conhecer os detalhes desse IdP.
**Erro comum:** achar que o broker autentica por conta própria — ele delega, e herda a política de segurança de quem está atrás dele.
**Onde na prática:** marco 06.

### Home realm discovery
**Em uma frase:** o mecanismo pelo qual o broker decide para qual IdP upstream rotear um titular, tipicamente pelo domínio do e-mail.
**No fin-platform:** um e-mail `@fintech.com.br` vai para o IdP corporativo; um e-mail pessoal vai para o realm de cliente.
**Erro comum:** deixar o titular escolher livremente o IdP sem validação — abre caminho para um titular se apresentar por um IdP de confiança menor.
**Onde na prática:** marco 06.

### Account linking
**Em uma frase:** reconhecer que o mesmo humano, chegando por dois provedores de identidade diferentes, é uma única identidade no sistema.
**No fin-platform:** um funcionário que também é cliente da própria fintech precisa ser uma pessoa, não duas contas desconectadas.
**Erro comum:** não implementar linking e deixar o sistema duplicar silenciosamente a mesma pessoa conforme o provedor de entrada muda.
**Onde na prática:** marco 06.

### Confiança transitiva
**Em uma frase:** o RP confia no broker, que confia no IdP upstream — o RP herda, na prática, a política de segurança de alguém que nunca configurou diretamente.
**No fin-platform:** se o IdP corporativo não exige MFA para um papel, o `pix-gateway` herda essa lacuna através do broker, a menos que verifique `amr`/`acr` explicitamente.
**Erro comum:** presumir que "veio do broker confiável" já implica o nível de garantia de autenticação esperado.
**Onde na prática:** marco 06.

### SAML
**Em uma frase:** um protocolo de federação baseado em asserções XML assinadas, anterior ao OIDC e ainda dominante em integração corporativa.
**No fin-platform:** o ERP e a ferramenta de RH da fintech seguem falando SAML; o broker traduz para OIDC do lado do `pix-gateway`.
**Erro comum:** tentar substituir toda integração SAML por OIDC de uma vez — a regra prática é conviver e migrar, não reconstruir.
**Onde na prática:** marco 06.

### Asserção SAML
**Em uma frase:** o documento XML assinado que a SAML entrega, afirmando quem o titular é e sob quais condições.
**No fin-platform:** a asserção que o IdP corporativo (simulado) envia ao broker durante um login SP-initiated.
**Erro comum:** processar a asserção sem verificar a assinatura sobre o elemento exato esperado — abre espaço para XML signature wrapping.
**Onde na prática:** marco 06.

### XML signature wrapping
**Em uma frase:** um ataque em que o atacante injeta um elemento XML extra de forma que o parser processe um nó diferente do que a assinatura efetivamente cobriu.
**No fin-platform:** uma asserção SAML manipulada faz o broker ler um `NameID` diferente do que foi assinado pelo IdP.
**Erro comum:** validar apenas "a assinatura confere em algum lugar do documento", em vez de amarrar a verificação à estrutura exata esperada.
**Onde na prática:** marco 06.

### Back-channel logout
**Em uma frase:** o IdP notifica cada RP diretamente, servidor a servidor, com um logout token, em vez de depender do navegador do titular.
**No fin-platform:** o Keycloak envia o logout token ao backoffice do `pix-gateway` quando o operador sai, mesmo que o navegador dele já tenha sido fechado.
**Erro comum:** receber o logout token e não processá-lo de fato — a notificação chegou, mas a sessão local nunca foi invalidada.
**Onde na prática:** marco 06.

### Logout token
**Em uma frase:** o token assinado que o IdP envia a um RP durante back-channel logout, identificando qual sessão ou qual titular deve ser desconectado.
**No fin-platform:** o RP valida a assinatura do logout token antes de invalidar qualquer sessão local — do contrário, qualquer um poderia forjar um logout alheio.
**Erro comum:** invalidar a sessão baseado só no `sub` do token, sem checar a sessão específica quando o titular tem múltiplas sessões ativas.
**Onde na prática:** marco 06.

### `max_age` / `prompt`
**Em uma frase:** parâmetros OIDC que forçam reautenticação — `max_age` se a sessão no IdP for mais velha que N segundos, `prompt=login` incondicionalmente.
**No fin-platform:** uma operação de alto valor pode exigir `max_age=60` para garantir que a autenticação é recente, não apenas que a sessão existe.
**Erro comum:** confundir isso com step-up authentication — são parâmetros do fluxo de login, não da decisão de autorização da operação.
**Onde na prática:** marco 06.

### SCIM
**Em uma frase:** System for Cross-domain Identity Management — um protocolo padronizado para criar, atualizar e desativar contas entre sistemas.
**No fin-platform:** o desligamento de um funcionário no RH dispara SCIM, que desativa a conta dele em todo sistema federado, não só no AD.
**Erro comum:** implementar provisionamento via SCIM e esquecer o desprovisionamento — é o lado que mais importa numa auditoria.
**Onde na prática:** marco 06.

### JIT provisioning
**Em uma frase:** Just-In-Time provisioning — criar a conta local no primeiro login federado, sem cadastro prévio no sistema de destino.
**No fin-platform:** um novo funcionário federado pelo AD ganha conta no `pix-gateway` no primeiro acesso, sem um cadastro manual antecipado.
**Erro comum:** criar a conta via JIT sem também amarrar o desprovisionamento a um evento equivalente do lado do desligamento.
**Onde na prática:** marco 06.

### Realm
**Em uma frase:** no Keycloak, um domínio de segurança isolado — usuários, clients e configuração de um realm não vazam para outro.
**No fin-platform:** `fin-workforce` e o realm de clientes são realms separados, propositalmente, para não misturar as três identidades do marco 06.
**Erro comum:** usar um único realm para tudo "por simplicidade" — é exatamente o erro estrutural que a distinção workforce/customer/workload existe para evitar.
**Onde na prática:** marco 06.

### Workforce identity
**Em uma frase:** a identidade do funcionário, cuja fonte de verdade é o diretório corporativo (AD) e cujo ciclo de vida termina em desligamento.
**No fin-platform:** o operador de backoffice do `pix-gateway`.
**Erro comum:** aplicar a ela o mesmo modelo de consentimento de customer identity — funcionário não "consente", ele opera sob política da empresa.
**Onde na prática:** marco 06.

### Customer identity
**Em uma frase:** a identidade do cliente, que se cadastra e consente, com escopo e validade declarados — o eixo dos marcos 05 e 08.
**No fin-platform:** o titular da conta que autoriza um pagamento via `pix-gateway`.
**Erro comum:** tratar o consentimento do cliente como um detalhe de UX, quando ele é, na prática, o limite legal da autorização.
**Onde na prática:** marcos 05, 06 e 08.

### Workload identity
**Em uma frase:** a identidade de um serviço, que nunca faz login — autentica por `client_credentials`, `private_key_jwt` ou mTLS.
**No fin-platform:** o próprio `pix-gateway`, autenticando perante o `fin-idp` como client, não como usuário.
**Erro comum:** tentar encaixar workload identity num fluxo de SSO — serviço não faz SSO, ponto que `kubernetes/10` aprofunda para identidade de workload em cluster.
**Onde na prática:** marcos 05, 06 e 07.

### `acr` / `amr`
**Em uma frase:** Authentication Context Class Reference e Authentication Methods References — claims que declaram, respectivamente, o nível e os métodos de autenticação usados no login original.
**No fin-platform:** o `pix-gateway` verifica `amr` antes de liberar uma operação que exige MFA, em vez de presumir que o broker já garantiu isso.
**Erro comum:** confiar que "o token veio de um IdP confiável" já implica MFA, sem checar `amr` explicitamente.
**Onde na prática:** marco 06.

### `fin-idp` × IDP (Internal Developer Platform)
**Em uma frase:** duas siglas iguais, significados diferentes — `fin-idp` (Identity Provider, o authorization server desta trilha) e IDP (Internal Developer Platform, o portal de self-service de `kubernetes` [E1]).
**No fin-platform:** o `fin-idp` emite token; a IDP de plataforma (quando existir) provisiona ambiente. Não é a mesma coisa, apesar da sigla.
**Erro comum:** usar "IDP" em maiúsculas fora deste verbete e deixar ambíguo qual dos dois conceitos está em jogo.
**Onde na prática:** marco 06 e `kubernetes` [E1].

## JOSE e tokens

### JOSE
**Em uma frase:** JSON Object Signing and Encryption — a família de especificações que define os envelopes JWS (assinado) e JWE (cifrado) para um payload JSON.
**No fin-platform:** o "JWT" que o `pix-gateway` valida é, tecnicamente, um payload dentro de um envelope JWS — JOSE é o nome da família a que ele pertence.
**Erro comum:** tratar "JWT" como sinônimo de formato de segurança completo — JWT é o payload; JOSE é o envelope que decide se ele é íntegro, confidencial, ou os dois.
**Onde na prática:** marco 04.

### JWS
**Em uma frase:** JSON Web Signature — um payload assinado, íntegro e verificável, mas legível por qualquer um com um decodificador base64url.
**No fin-platform:** o token de acesso emitido pelo `fin-idp` para o `pix-gateway` é um JWS — a assinatura garante que ninguém alterou o conteúdo, não que ele é secreto.
**Erro comum:** colocar dado sensível no payload de um JWS achando que a assinatura protege a confidencialidade.
**Onde na prática:** marco 04.

### JWE
**Em uma frase:** JSON Web Encryption — um payload cifrado, ao contrário do JWS, que só é assinado.
**No fin-platform:** usado quando o token precisa atravessar um intermediário que não deveria ler o conteúdo — cenário raro comparado ao JWS.
**Erro comum:** usar JWE como resposta padrão para "dado sensível no token", quando a resposta mais barata é simplesmente não colocar o dado sensível ali.
**Onde na prática:** marco 04.

### JWKS
**Em uma frase:** JSON Web Key Set — o documento publicado pelo emissor com as chaves públicas de verificação, cada uma identificada por um `kid`.
**No fin-platform:** o `fin-idp` publica seu JWKS com duas chaves simultâneas durante rotação, para nenhum token em voo ser invalidado.
**Erro comum:** cachear o JWKS sem TTL, perdendo uma chave nova por horas depois de uma rotação de emergência.
**Onde na prática:** marcos 04 e 10.

## OAuth2 e OIDC

### PKCE
**Em uma frase:** Proof Key for Code Exchange — um segredo gerado por requisição que impede um código de autorização interceptado de ser trocado por token por outra parte.
**No fin-platform:** obrigatório em todo fluxo authorization code do `fin-idp`, inclusive para o `pix-gateway`, que é um client confidencial.
**Erro comum:** achar que PKCE só é necessário para client público (SPA, mobile) — tornar obrigatório sempre remove essa decisão de risco.
**Onde na prática:** marco 05.

### PAR
**Em uma frase:** Pushed Authorization Request — o client envia a requisição de autorização inteira por back-channel antes do redirect, recebendo uma referência opaca para usar no navegador.
**No fin-platform:** reduz a superfície manipulável no front-channel do `pix-gateway`, remédio estrutural contra mix-up attack e manipulação de parâmetro.
**Erro comum:** achar que PAR substitui a validação de redirect URI — os dois problemas são relacionados, mas distintos.
**Onde na prática:** marcos 05 e 07.

## FAPI e prova de posse

### mTLS
**Em uma frase:** TLS mútuo — cliente e servidor se autenticam por certificado, não só o servidor.
**No fin-platform:** autentica o `pix-gateway` perante o `fin-idp`, e sustenta o token sender-constrained do marco 07.
**Erro comum:** confiar no header de certificado repassado por um gateway sem sanitizá-lo na borda — qualquer requisição externa pode injetar o mesmo header.
**Onde na prática:** marco 06.

### CIBA
**Em uma frase:** Client-Initiated Backchannel Authentication — o cliente inicia a autorização, e o titular aprova em outro dispositivo, via `auth_req_id`.
**No fin-platform:** um atendente inicia um Pix no sistema interno; o titular aprova no próprio celular, em canal separado.
**Erro comum:** tratar CIBA como substituto universal de authorization code — ele resolve um problema específico de canal desacoplado, não é o fluxo padrão.
**Onde na prática:** marco 06.

### DPoP
**Em uma frase:** Demonstration of Proof-of-Possession — o client assina uma prova a cada requisição, comprovando posse de uma chave privada sem certificado.
**No fin-platform:** alternativa ao mTLS para tornar token sender-constrained quando não há infraestrutura de certificado por cliente.
**Erro comum:** achar que DPoP e mTLS são redundantes — a escolha depende da infraestrutura disponível, não de qual é "melhor" em abstrato.
**Onde na prática:** marco 06.

### Token sender-constrained
**Em uma frase:** um token vinculado a algo que o atacante não consegue copiar junto com o valor do token — um certificado (mTLS) ou uma chave (DPoP) — ao contrário do bearer token comum, que vale para quem o segurar.
**No fin-platform:** o `access_token` do `pix-gateway` vinculado ao certificado mTLS: roubado sozinho, não vale nada sem o certificado correspondente.
**Erro comum:** emitir o token vinculado, mas nunca testar que outro certificado válido, apresentando o mesmo token, é de fato rejeitado.
**Onde na prática:** marco 06.

## Autorização

### PDP/PEP
**Em uma frase:** Policy Decision Point (quem avalia a política e decide) e Policy Enforcement Point (quem aplica a decisão no caminho da requisição) — os dois papéis que "política como dado" separa.
**No fin-platform:** o OPA avaliando a matriz papel × recurso × ação é o PDP; o filtro que aplica "negado" antes do caso de uso rodar é o PEP.
**Erro comum:** misturar os dois papéis no mesmo componente, perdendo a vantagem de auditar a política sem ler o código do serviço.
**Onde na prática:** marco 08.

### ReBAC
**Em uma frase:** Relationship-Based Access Control — permissão baseada na relação entre entidades, não apenas no papel ou em atributos isolados.
**No fin-platform:** responde "este usuário é gerente **desta conta específica**?", pergunta que RBAC sozinho não modela.
**Erro comum:** tentar forçar essa pergunta em RBAC criando um papel por conta — não escala e não é o que RBAC foi desenhado para expressar.
**Onde na prática:** marco 08.

### Step-up authentication
**Em uma frase:** exigir um nível maior de garantia de autenticação para uma operação específica, com base no valor ou no risco dela.
**No fin-platform:** uma transferência de valor alto exige segundo fator adicional que uma consulta de saldo não exige.
**Erro comum:** aplicar step-up à sessão inteira em vez de à transação específica que o disparou — o marco 14 retoma esse detalhe.
**Onde na prática:** marcos 08 e 14.

### Quebra-vidro
**Em uma frase:** acesso emergencial que quebra a segregação de funções normal, permitido mas registrado de forma destacada e auditável, com justificativa exigida no momento do uso.
**No fin-platform:** um operador sênior estorna uma transação fora do fluxo normal numa emergência, com o motivo registrado no log de segurança antes da ação ser liberada.
**Erro comum:** implementar o acesso de emergência sem o registro obrigatório — nesse caso, deixou de ser quebra-vidro e virou apenas uma exceção de permissão.
**Onde na prática:** marco 08.

## Criptografia e segredo

### Envelope encryption
**Em uma frase:** cifrar o dado com uma DEK, e cifrar a DEK com uma KEK guardada separadamente — duas chaves, dois lugares, dois papéis.
**No fin-platform:** a DEK cifrada viaja junto ao dado; a KEK nunca sai do cofre que protege o `fin-idp`.
**Erro comum:** guardar a DEK em claro na mesma linha de banco que o dado que ela protege — anula a separação inteira.
**Onde na prática:** marco 09.

### DEK/KEK
**Em uma frase:** Data Encryption Key (cifra o dado) e Key Encryption Key (cifra a DEK) — os dois papéis do envelope encryption.
**No fin-platform:** apagar a KEK torna toda DEK protegida por ela irrecuperável — o mecanismo por trás do crypto-shredding de `kafka/13`.
**Erro comum:** reutilizar a mesma DEK para grandes volumes de dado sem necessidade, ampliando o raio de um eventual comprometimento.
**Onde na prática:** marco 09.

### Crypto-agilidade
**Em uma frase:** a capacidade de trocar um algoritmo criptográfico por outro sem reescrever o sistema, sustentada por um inventário de onde cada algoritmo é usado.
**No fin-platform:** saber, hoje, todo lugar que usa RSA ou AES no `fin-platform`, antes de precisar trocar por exigência regulatória ou vulnerabilidade descoberta.
**Erro comum:** adiar o inventário para o dia da troca — que é exatamente o dia em que não há mais tempo para mapear.
**Onde na prática:** marco 09.

### Timing attack
**Em uma frase:** um ataque que extrai informação secreta observando quanto tempo uma operação leva para responder, não o conteúdo da resposta.
**No fin-platform:** um HMAC de webhook verificado com `equals()` permite reconstruir a assinatura correta byte a byte, medindo o tempo de resposta.
**Erro comum:** considerar timing attack "só teórico" — ele é praticável remotamente, com amostragem estatística suficiente.
**Onde na prática:** marco 09.

## Cadeia de suprimentos e fraude

### SBOM
**Em uma frase:** Software Bill of Materials — a lista completa e estruturada de toda dependência, direta e transitiva, de um artefato de software, com versão exata.
**No fin-platform:** gerado a cada build do `pix-gateway` e do `fin-idp`, sustenta tanto o questionário de fornecedor quanto o gate de CVE alcançável.
**Erro comum:** gerar o SBOM uma vez e arquivar — ele precisa ser produzido a cada build, refletindo o estado real do artefato daquele momento.
**Onde na prática:** marco 12.

### SLSA
**Em uma frase:** Supply-chain Levels for Software Artifacts — um framework que gradua, em níveis, o rigor das garantias de proveniência e integridade de um build.
**No fin-platform:** o nível de SLSA alcançado pelo pipeline do `pix-gateway` é o que a política de admissão de `kubernetes/09` verifica antes de aceitar a imagem.
**Erro comum:** tratar SLSA como certificação de "produto seguro" — ele mede a garantia do processo de build, não a ausência de vulnerabilidade no código.
**Onde na prática:** marco 12.

### Proveniência
**Em uma frase:** a prova verificável de como um artefato foi construído — qual pipeline, a partir de qual commit, com quais entradas.
**No fin-platform:** permite provar, para um auditor, que a imagem em produção veio exatamente do commit que o time diz que veio.
**Erro comum:** confundir proveniência com assinatura — a assinatura prova integridade do artefato final; a proveniência prova a história de como ele chegou lá.
**Onde na prática:** marco 12.

### Dependency confusion
**Em uma frase:** um pacote interno é sequestrado ao ser republicado, pelo atacante, no registry público, com um número de versão maior que o interno.
**No fin-platform:** sem namespace privado explícito, o build do `pix-gateway` pode resolver silenciosamente para a versão pública maliciosa.
**Erro comum:** achar que um nome de pacote "obscuro" ou interno é proteção suficiente — obscuridade não é controle.
**Onde na prática:** marco 12.

### Alcançabilidade
**Em uma frase:** o critério que verifica se a função vulnerável de uma CVE está de fato no caminho de código que o sistema chama, e não apenas presente na árvore de dependência.
**No fin-platform:** o gate de pipeline do marco 12 só bloqueia build por CVE alcançável e com EPSS alto — não por qualquer CVE presente na árvore.
**Erro comum:** tratar toda CVE na árvore de dependência como igualmente urgente, ignorando se o código vulnerável é de fato invocado.
**Onde na prática:** marcos 02 e 12.

### Account takeover
**Em uma frase:** um atacante assume o controle da conta de outra pessoa usando credencial roubada, SIM swap ou engenharia social — sem violar nenhum controle de autenticação ou autorização do sistema.
**No fin-platform:** o cenário central do marco 14 — nenhum controle dos marcos de identidade dispara, porque a sessão é genuinamente do titular comprometido.
**Erro comum:** tratar account takeover como falha de autenticação do sistema — a autenticação funcionou corretamente; o problema é de quem a completou.
**Onde na prática:** marco 14.

## Detecção e resposta

### Não repúdio
**Em uma frase:** a garantia de que uma ação, uma vez registrada, não pode ser negada por quem a praticou.
**No fin-platform:** a trilha de auditoria append-only, com encadeamento por hash, é o mecanismo que sustenta essa garantia.
**Erro comum:** usar MAC (HMAC) onde a situação exige não repúdio perante terceiro — MAC só prova algo para quem já tem o segredo, não convence um auditor externo.
**Onde na prática:** marcos 09 e 15.

### Honeytoken
**Em uma frase:** um valor plantado deliberadamente que nunca deveria ser usado em operação legítima — qualquer uso dele só pode significar acesso indevido.
**No fin-platform:** uma credencial de teste plantada numa tabela sensível, com alerta de alta prioridade ligado a qualquer tentativa de uso.
**Erro comum:** não isolar o alerta de honeytoken do ruído geral — ele merece prioridade máxima, precisamente por ter taxa de falso positivo próxima de zero.
**Onde na prática:** marco 15.
