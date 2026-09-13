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
**Onde na prática:** marco 02; retomado como gate automatizado no marco 12.

### BOLA
**Em uma frase:** Broken Object Level Authorization — a requisição é sintaticamente válida, autenticada e com token legítimo, mas aponta para o objeto de outra pessoa.
**No fin-platform:** o token do cliente A, válido e com escopo correto, usado para ler `GET /payments/{id}` de um pagamento do cliente B.
**Erro comum:** achar que autenticação forte resolve BOLA — ela não resolve, porque o problema nunca foi provar quem é o cliente, foi verificar de quem é o recurso.
**Onde na prática:** marco 02, provado e corrigido; reencontrado como o motivo de existir da matriz de autorização do marco 07.

### EPSS
**Em uma frase:** Exploit Prediction Scoring System — a probabilidade estimada de uma CVE ser explorada nos próximos 30 dias, ao contrário do CVSS, que mede severidade teórica.
**No fin-platform:** uma CVE 9.8 sem EPSS relevante e sem exploit no catálogo KEV pode esperar a próxima janela; uma 6.5 com EPSS alto, não.
**Erro comum:** priorizar backlog de vulnerabilidade só por CVSS — é like ordenar incêndios pelo tamanho da fumaça, não pelo que está queimando de verdade.
**Onde na prática:** marco 02; usado como critério de gate no marco 11, junto com alcançabilidade.

### KEV
**Em uma frase:** o catálogo (Known Exploited Vulnerabilities, mantido pela CISA) de CVEs com exploração confirmada em ambiente real, não hipotética.
**No fin-platform:** uma CVE no KEV entra na fila de correção antes de qualquer coisa nova, independentemente de prioridade de produto.
**Erro comum:** tratar KEV e EPSS como a mesma coisa — KEV é fato observado, EPSS é previsão estatística; os dois se complementam, não se substituem.
**Onde na prática:** marco 02; critério de gate no marco 11.

## Entrada não confiável

### SSRF
**Em uma frase:** Server-Side Request Forgery — o servidor é induzido a fazer uma requisição para um destino que o atacante escolhe, não o cliente.
**No fin-platform:** a URL de callback fornecida pelo PSP parceiro, usada sem allowlist, apontando para o endpoint de metadados da nuvem.
**Erro comum:** mitigar com regex de validação de URL — redirect encadeado e resolução de DNS variável furam regex; a defesa real é allowlist de destino com egress controlado.
**Onde na prática:** marco 03.
