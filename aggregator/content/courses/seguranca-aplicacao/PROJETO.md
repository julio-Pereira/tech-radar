# Projeto guia — fin-idp

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> O `fin-idp` é o **authorization server** contra o qual o `pix-gateway` (trilha
> `spring-boot`) passa a autenticar — sem ele, os marcos de identidade desta trilha
> viram teoria. Uma **CA local**, gerada por script, faz o papel do Diretório de
> Participantes do Open Finance em miniatura.

## O que você vai construir

Um authorization server real — Spring Authorization Server, com Keycloak documentado como
alternativa — que emite, assina e revoga token para o `pix-gateway`, fala OIDC além de
OAuth2 puro, e sustenta um perfil FAPI 1.0 Advanced: PKCE obrigatório, PAR, autenticação de
cliente por `private_key_jwt` ou mTLS, resposta assinada (JARM) e token vinculado ao
certificado do cliente. Ao lado dele, o `pix-gateway` existente é **endurecido**, não
reescrito: ganha validação de token correta, autorização no domínio (não só no
`@PreAuthorize` do controller) e os controles de borda que faltavam.

O ponto do exercício não é "subir um OAuth2 funcionando" — o `spring-boot/09` já fez isso.
É produzir evidência de que cada controle resiste ao ataque que ele existe para impedir:
um JWT com `alg` trocado é rejeitado, um token roubado sem o certificado certo não vale
nada, um `id` de outro cliente não abre o recurso dele.

**Contratos que o `fin-idp` tem com os vizinhos:**

| Direção | Interface | Vizinho |
| --- | --- | --- |
| serve | emissão de token (authorization code + PKCE, client credentials) e JWKS | `pix-gateway`, trilha `spring-boot` |
| serve | introspecção e revogação para token opaco | `pix-gateway`, quando o marco 04 escolhe token por referência |
| serve | CIBA (`auth_req_id`, poll/ping/push) para autorização fora do canal da transação | `pix-gateway` |
| serve | broker de federação (Keycloak) para identidade workforce, com o `fin-idp` como resource server das claims de papel | backoffice do `pix-gateway` |
| consome | certificado de cliente validado na borda (mTLS) | camada de rede do `pix-gateway`, com sanitização do header de certificado |
| emite | evento de segurança (falha de validação, revogação, rotação, logout) | pipeline do marco 15, consumido pela trilha `observabilidade` |

**O que este projeto não é.** Ele não ensina a configurar um `SecurityFilterChain` do zero
— isso é `spring-boot/09`, e continua valendo. Aqui você está do outro lado da fronteira:
por que a validação que o resource server faz precisa ser exatamente aquela, e o que
acontece quando ela não é.

## Pré-requisitos

- JDK 21+ e Maven ou Gradle
- Docker (Postgres para o `fin-idp`, Keycloak para o marco 06, Vault em modo dev para o
  marco 10, registry local para o marco 12)
- OpenSSL para a CA local (script incluído, `openssl req`/`openssl x509` bastam)
- O `pix-gateway` da trilha `spring-boot`, ou um resource server mínimo equivalente — o
  contrato (JWKS, `aud`, escopo) é o que importa, não a origem do serviço
- **Não precisa:** conta em cloud paga, HSM real, Keycloak em produção. Onde a nuvem ou o
  HSM mudam a resposta, o marco correspondente explica a diferença em vez de simular.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | DFD do `fin-platform` com fronteiras de confiança e 10 ameaças STRIDE priorizadas | Cada ameaça está ligada a um controle nomeado (com link) ou a um risco aceito por escrito |
| 02 | Requisitos ASVS nível 2 do `pix-gateway` como issues rastreáveis | BOLA provado no endpoint de consulta de pagamento e corrigido: cliente A recebe 404 do recurso de B |
| 03 | Endpoint de callback do PSP protegido contra SSRF | Requisição ao endpoint de metadados bloqueada; bypass por redirect 302 também bloqueado |
| 04 | Validação de JWS na mão contra o JWKS do `fin-idp`, sem biblioteca | Bateria de 6 tokens maliciosos: 6/6 rejeitados, token legítimo aceito |
| 05 | `fin-idp` de pé, authorization code + PKCE ponta a ponta com o `pix-gateway` | Redirect URI corrigida para matching exato; exfiltração do código de autorização deixa de funcionar, com teste |
| 06 | Keycloak como broker, federado a um IdP upstream simulado, com back-channel logout no RP | Logout no IdP encerra a sessão do RP sem passar por ele; a janela de exposição do access token após o logout é medida em número |
| 07 | mTLS entre `pix-gateway` e `fin-idp` com CA local; header de certificado sanitizado na borda | Token emitido é vinculado ao certificado: outro certificado válido apresentando o mesmo token é rejeitado, e a rejeição aparece no log de segurança |
| 08 | Matriz papel × recurso × ação declarada como dado | Toda combinação permitida passa, toda combinação não declarada é negada (default-deny), e recurso novo sem política quebra o build |
| 09 | Verificação de assinatura de webhook do PSP resistente a replay e a timing | Requisição replicada e corpo adulterado são rejeitados; diferença de tempo entre assinatura válida e inválida não é distinguível em 1.000 amostras |
| 10 | Rotação da chave de assinatura do `fin-idp` com dois `kid` ativos | Rotação cronometrada, zero token em voo invalidado; segredo plantado em commit antigo é detectado e falha o build |
| 11 | Endpoint de consulta de chave Pix sem enumeração, com rate limit por identidade | 500 consultas a chaves aleatórias não revelam quais existem; o limite dispara e fica registrado |
| 12 | Pipeline que gera SBOM, assina a imagem e falha em CVE alcançável | Dependency confusion reproduzido num registry local e mitigado: o build passa a puxar o pacote interno, não o público |
| 13 | Pipeline com quatro gates (segredo, CVE alcançável, regra SAST, exceção) | PR com cada violação é barrado; exceção expirada volta a barrar sem intervenção |
| 14 | Step-up authentication disparado por regra de valor e de velocidade | Transação acima do limite sem step-up é rejeitada; o step-up libera só aquela transação, com motivo registrado |
| 15 | Evento de segurança estruturado, alerta e runbook ligados | Game day "chave de assinatura vazada": tempo de detecção até rotação completa medido; token da chave comprometida deixa de valer |
| 16 | Matriz controle × exigência regulatória do `fin-platform`, com ADRs de risco aceito | Toda ameaça do marco 01 aparece com controle testado ou com ADR assinado e datado |

## Definição de pronto (capstone)

- [ ] O `fin-idp` está de pé e emite token real para o `pix-gateway` via authorization
      code + PKCE, com JWKS publicado e rotação testada
- [ ] Nenhum token é aceito sem validar `iss`, `aud`, `exp` e assinatura — há um teste
      parametrizado com tokens maliciosos que prova isso
- [ ] Pelo menos um fluxo usa token **sender-constrained** (mTLS ou DPoP), com teste que
      prova que o mesmo token noutro certificado/chave é rejeitado
- [ ] Logout iniciado no IdP federado (Keycloak) encerra a sessão do RP sem o usuário
      passar por ele, e a janela de exposição do access token depois do logout está
      declarada em número, não como "depende"
- [ ] Autorização é decidida por uma matriz declarada como dado, não por `if` espalhado;
      default é negar
- [ ] Nenhum segredo de assinatura está fora do cofre; a chave tem procedimento de
      rotação de emergência cronometrado pelo menos uma vez
- [ ] O pipeline do `fin-idp`/`pix-gateway` barra segredo vazado, CVE crítica alcançável e
      violação de regra SAST — e a exceção registrada expira sozinha
- [ ] Existe log de segurança append-only para autenticação, falha de autorização e
      rotação de credencial, distinto do log de aplicação
- [ ] Toda ameaça do DFD do marco 01 tem controle testado ou risco aceito assinado
- [ ] Uma ADR por bloco: identidade, criptografia/segredo, cadeia de suprimentos,
      conformidade

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Vazar a chave de assinatura do `fin-idp`.** Cronometre da detecção à rotação
   completa. Algum cliente legítimo ficou fora além da janela declarada?
2. **Apresentar um token válido com outro certificado.** Ele é aceito? Se for, o token
   nunca foi sender-constrained de verdade.
3. **Repetir uma requisição de webhook assinada.** Ela é aceita a segunda vez? Meça
   também se o tempo de resposta distingue assinatura válida de inválida.
4. **Pedir o recurso de um cliente com o token de outro.** A resposta é 404 ou 403? 403
   confirma que o recurso existe — isso já é vazamento.
5. **Deixar a exceção do gate de pipeline expirar.** O build volta a barrar sozinho, ou
   alguém precisa lembrar?

## Regra do tempo declarado

`estimatedHours` da trilha é ~2× a soma dos `estimatedMinutes` dos marcos: leitura mais
hands-on. Aqui a proporção pesa para o hands-on nos marcos de identidade e cripto (04–10),
onde provar a mitigação custa mais do que descrever o conceito.
