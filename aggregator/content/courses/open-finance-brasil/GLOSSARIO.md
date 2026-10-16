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
