Um verbete por termo: definição em uma frase, o exemplo no `fin-opengate`, o erro comum associado
e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Ecossistema

### Open Finance
**Em uma frase:** o ecossistema regulado que permite compartilhar dados financeiros e iniciar
pagamentos entre instituições, sob consentimento do cliente.
**No fin-opengate:** cada simulador representa um participante distinto desse ecossistema.
**Erro comum:** tratar o ecossistema como um produto que se escolhe integrar, em vez de um
contrato imposto de fora para dentro.
**Onde na prática:** marco 01.

### Transmissora de dados
**Em uma frase:** a instituição que compartilha dados do cliente sob consentimento.
**No fin-opengate:** o `transmissor/` simulado implementa esse papel.
**Erro comum:** achar que toda transmissora é automaticamente também detentora — são papéis
distintos, ainda que frequentemente acumulados pela mesma instituição.
**Onde na prática:** marco 01.

### Receptora de dados
**Em uma frase:** a instituição que consome dados do cliente em nome dele, a partir de outra
instituição.
**No fin-opengate:** o lado `iniciador/` desempenha, nos marcos de dados, também o papel de
receptora.
**Erro comum:** achar que ser receptora concede automaticamente a capacidade de iniciar
pagamentos.
**Onde na prática:** marco 01.

### Detentora de conta
**Em uma frase:** a instituição que mantém a conta e os fundos do cliente.
**No fin-opengate:** o `fin-books` simulado é a fonte dos dados de conta que o papel de detentora
expõe.
**Erro comum:** confundir detentora com transmissora — uma instituição pode ser as duas, mas são
papéis conceitualmente distintos.
**Onde na prática:** marco 01.

### Iniciadora de transação de pagamento (ITP)
**Em uma frase:** a instituição que inicia um pagamento em nome do cliente, a partir de outra
instituição.
**No fin-opengate:** o `iniciador/` simulado desempenha esse papel nos marcos 07 e 08.
**Erro comum:** achar que toda receptora de dados é também, automaticamente, iniciadora de
pagamento.
**Onde na prática:** marco 01, retomado no 07 e 08.

### TPP (*third-party provider*)
**Em uma frase:** termo genérico para a instituição do lado de fora, não dona dos dados ou da
conta em questão.
**No fin-opengate:** os simuladores de TPP no `sim/` representam participantes externos ao
transmissor.
**Erro comum:** tratar "TPP" como um papel específico — é um termo genérico que cobre receptoras e
iniciadoras.
**Onde na prática:** marco 01.

### Diretório de participantes
**Em uma frase:** a autoridade central que certifica quais organizações são participantes válidos
do ecossistema, com qual papel e em qual estado.
**No fin-opengate:** o `diretorio-sim/` implementa essa autoridade de forma simulada, nunca real.
**Erro comum:** validar identidade sem consultar o diretório, confiando no que a própria
requisição afirma.
**Onde na prática:** marco 01, retomado no 02.

### Fase (do ecossistema)
**Em uma frase:** uma etapa de implantação do ecossistema que expande o conjunto de APIs e
requisitos disponíveis.
**No fin-opengate:** o mapa de papéis declara explicitamente em qual fase cada capacidade está
disponível.
**Erro comum:** tratar o ecossistema como um conjunto estático de APIs, ignorando que ele evolui
por fases.
**Onde na prática:** marco 01.

### Versão da especificação
**Em uma frase:** a versão específica de uma norma técnica do ecossistema, registrada e datada em
`spec-versions.yaml`.
**No fin-opengate:** toda afirmação "conferir" remete, em última instância, a esse arquivo
versionado.
**Erro comum:** escrever um valor regulatório direto no código sem registrar de qual versão ele
vem.
**Onde na prática:** marco 01.

## Confiança

### SSA (*software statement assertion*)
**Em uma frase:** um JWT assinado pelo diretório, atestando que um software pertence a uma
organização participante.
**No fin-opengate:** a SSA simulada é validada por assinatura, emissor, expiração e status da
organização.
**Erro comum:** validar só a assinatura da SSA, sem verificar o status atual da organização que
ela representa.
**Onde na prática:** marco 02.

### DCR (registro dinâmico de cliente)
**Em uma frase:** o processo de registrar, atualizar e remover um participante como cliente OAuth2
num transmissor.
**No fin-opengate:** o `transmissor/` simulado implementa o ciclo completo, não só o registro
inicial.
**Erro comum:** implementar DCR como cadastro manual único, sem suporte a atualização de
metadados e chaves.
**Onde na prática:** marco 02.

### JWKS
**Em uma frase:** o conjunto de chaves públicas publicado para verificar assinaturas de um
participante ou do diretório.
**No fin-opengate:** o JWKS simulado tem uma política explícita de cache com limite de tempo
declarado.
**Erro comum:** consultar o JWKS de origem a cada requisição, sem nenhum cache, tornando o sistema
caro e lento.
**Onde na prática:** marco 02.

### *Kid* (*key id*)
**Em uma frase:** o identificador de qual chave específica, dentro de um JWKS, foi usada para
assinar um token.
**No fin-opengate:** um `kid` desconhecido ou ambíguo é sempre rejeitado, nunca aceito por
suposição.
**Erro comum:** aceitar qualquer `kid` desconhecido sem rejeitar, abrindo espaço para confusão de
chave.
**Onde na prática:** marco 02.

### CA do ecossistema
**Em uma frase:** a autoridade certificadora que emite os certificados usados pelos participantes
do ecossistema.
**No fin-opengate:** uma CA simulada, nunca uma CA real, emite os certificados de teste.
**Erro comum:** assumir que qualquer CA genérica serve — o ecossistema real exige autoridades e
perfis específicos.
**Onde na prática:** marco 02.

### *Fail-open* / *fail-closed*
**Em uma frase:** a escolha de aceitar (fail-open) ou rejeitar (fail-closed) um certificado quando
a consulta de revogação falha.
**No fin-opengate:** a escolha simulada é explícita e documentada, nunca um acidente de
implementação.
**Erro comum:** não decidir explicitamente entre as duas posturas, deixando o comportamento sob
falha indefinido.
**Onde na prática:** marco 02.

### Organização do certificado
**Em uma frase:** o atributo do certificado que identifica a organização a que ele pertence,
verificável independente de qualquer afirmação da requisição.
**No fin-opengate:** o `transmissor/` simulado recusa um registro quando a organização do
certificado difere da declarada na SSA.
**Erro comum:** validar a assinatura de uma SSA sem verificar se o certificado de transporte
pertence à mesma organização.
**Onde na prática:** marco 02.

## Autorização

### FAPI
**Em uma frase:** o perfil de segurança de APIs financeiras que estende OAuth2/OIDC com
exigências adicionais de proteção.
**No fin-opengate:** o `transmissor/` implementa o perfil FAPI simulado sobre uma base padrão de
OAuth2.
**Erro comum:** achar que implementar OAuth2 básico já satisfaz o perfil FAPI — ele exige
extensões específicas além disso.
**Onde na prática:** marco 03.

### PAR (*pushed authorization request*)
**Em uma frase:** mecanismo que move os parâmetros de uma requisição de autorização para fora da
URL visível, empurrando-os antecipadamente a um endpoint dedicado.
**No fin-opengate:** o `transmissor/` simulado só aceita requisições de autorização iniciadas via
PAR.
**Erro comum:** enviar parâmetros de autorização sensíveis diretamente na URL, visível e
manipulável pelo navegador.
**Onde na prática:** marco 03.

### *Request object*
**Em uma frase:** os parâmetros de uma requisição de autorização empacotados e assinados
criptograficamente.
**No fin-opengate:** validado quanto a assinatura e campos obrigatórios antes de qualquer
interação com o usuário.
**Erro comum:** aceitar parâmetros de autorização não assinados quando o perfil exige um request
object.
**Onde na prática:** marco 03.

### Token vinculado ao certificado
**Em uma frase:** um token que carrega referência criptográfica ao certificado TLS usado para
obtê-lo, verificada em cada uso.
**No fin-opengate:** um token simulado usado com certificado diferente do que o obteve é sempre
recusado.
**Erro comum:** emitir tokens sem vinculação ao certificado, tornando um token copiado utilizável
por qualquer um que o possua.
**Onde na prática:** marco 03.

### `jti` (*JWT ID*)
**Em uma frase:** identificador único de uma instância específica de token ou request object,
usado para prevenir replay.
**No fin-opengate:** um `jti` repetido é recusado mesmo sob tentativas concorrentes simultâneas.
**Erro comum:** não verificar `jti` sob concorrência, aceitando mais de uma tentativa simultânea
com o mesmo identificador.
**Onde na prática:** marco 03.

### Rotação de *refresh* com detecção de reuso
**Em uma frase:** substituir um refresh token usado por um novo, revogando toda a família de
tokens se o antigo for reutilizado depois.
**No fin-opengate:** a reutilização simulada de um refresh já rotacionado revoga toda a família
derivada dele.
**Erro comum:** negar só a tentativa de reuso específica, sem revogar o restante da família de
tokens potencialmente comprometida.
**Onde na prática:** marco 03.

## Consentimento

### Consentimento (de dados)
**Em uma frase:** a autorização do cliente para acesso repetido a um conjunto específico de dados,
dentro de um prazo de validade.
**No fin-opengate:** modelado como máquina de estados explícita no `transmissor/` simulado.
**Erro comum:** tratar consentimento como um booleano simples, em vez de uma máquina de estados
com transições válidas e inválidas.
**Onde na prática:** marco 04.

### Permissão (de consentimento)
**Em uma frase:** uma categoria específica de acesso que o cliente concede explicitamente dentro
de um consentimento.
**No fin-opengate:** uma chamada com escopo válido, mas sem a permissão correspondente, é sempre
recusada.
**Erro comum:** confundir permissão de consentimento com escopo OAuth — o primeiro é necessário,
mas não suficiente.
**Onde na prática:** marco 04.

### Limite de obsolescência
**Em uma frase:** o tempo máximo declarado até que uma revogação de consentimento tenha efeito em
qualquer ponto do sistema.
**No fin-opengate:** verificado com relógio falso contra o cache de validade de consentimento
simulado.
**Erro comum:** prometer propagação "instantânea" de revogação sem um limite declarado e
verificável.
**Onde na prática:** marco 04.

### Invalidação ativa
**Em uma frase:** disparar a invalidação de uma entrada de cache de consentimento no momento do
evento de revogação, sem depender só do TTL.
**No fin-opengate:** o evento de revogação simulado invalida ativamente o cache correspondente.
**Erro comum:** depender só de TTL para invalidação, deixando o pior caso de atraso igual ao TTL
inteiro.
**Onde na prática:** marco 04.

### Consentimento de pagamento
**Em uma frase:** autorização de uso único, vinculada a valor e destinatário específicos, para
mover dinheiro.
**No fin-opengate:** modelado separadamente do consentimento de dados, com regras de uso único.
**Erro comum:** usar o mesmo modelo de consentimento de dados (acesso repetido) para consentimento
de pagamento.
**Onde na prática:** marco 04, retomado no 07.

## Dados

### Contrato canônico
**Em uma frase:** a estrutura de dados pública e estável definida pelo ecossistema, para a qual o
core precisa ser traduzido.
**No fin-opengate:** toda resposta das APIs de dados valida contra o OpenAPI do contrato canônico.
**Erro comum:** expor a estrutura interna do core diretamente, sem tradução para o contrato
público.
**Onde na prática:** marco 05.

### Camada anticorrupção (de Open Finance)
**Em uma frase:** o componente que traduz o core legado para o contrato canônico, recusando
devolver o que não consegue garantir.
**No fin-opengate:** a camada simulada recusa explicitamente um campo obrigatório que o core não
possui.
**Erro comum:** inventar um valor para preencher um campo obrigatório que o core não tem, em vez
de recusar explicitamente.
**Onde na prática:** marco 05.

### Minimização (por permissão)
**Em uma frase:** devolver numa resposta apenas os campos cobertos pelas permissões do
consentimento ativo.
**No fin-opengate:** a resposta simulada varia conforme as permissões do consentimento usado na
chamada.
**Erro comum:** devolver um campo fora do consentimento "por conveniência", mesmo que o endpoint
tecnicamente pudesse.
**Onde na prática:** marco 05.

### *Sunset* (de versão de API)
**Em uma frase:** a data em que uma versão antiga de uma API deixa de responder, após um período
de coexistência com a nova.
**No fin-opengate:** o teste de compatibilidade simulado garante que a versão antiga responde
igual até o sunset.
**Erro comum:** mudar o comportamento de uma versão antiga silenciosamente, sem seguir o processo
de sunset declarado.
**Onde na prática:** marco 05, retomado no 09.

## Desempenho

### SLA regulatório
**Em uma frase:** o requisito de disponibilidade e desempenho imposto pelo ecossistema, tratado
como SLI/SLO.
**No fin-opengate:** medido e verificado continuamente sobre dados sintéticos de carga.
**Erro comum:** medir desempenho num ponto diferente do que o requisito regulado pressupõe
(servidor × borda × cliente).
**Onde na prática:** marco 06.

### Cota por TPP
**Em uma frase:** o limite de tráfego isolado por participante, impedindo que um TPP degrade a
experiência dos demais.
**No fin-opengate:** um TPP simulado a 10x a cota recebe recusa sem afetar o desempenho dos
demais.
**Erro comum:** não isolar tráfego por TPP, permitindo que o comportamento de um afete a todos
(*noisy neighbor*).
**Onde na prática:** marco 06.

### `Retry-After`
**Em uma frase:** o cabeçalho que informa quando a próxima tentativa, após um limite de taxa, tem
chance razoável de sucesso.
**No fin-opengate:** toda recusa por cota excedida simulada inclui esse cabeçalho.
**Erro comum:** recusar uma requisição por excesso de cota sem indicar quando tentar novamente.
**Onde na prática:** marco 06.
