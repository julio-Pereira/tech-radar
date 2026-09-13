---
id: modelagem-de-ameaca
title: "Pensar como atacante: modelagem de ameaça"
summary: "STRIDE, DFD com fronteiras de confiança e abuse case: por que 'criptografe tudo' sem modelo de ameaça é teatro caro, e como um ativo em dinheiro muda a economia de quem ataca."
estimatedMinutes: 55
references:
  - title: "OWASP — Threat Modeling"
    url: https://owasp.org/www-community/Threat_Modeling
  - title: "OWASP Application Threat Modeling Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
  - title: "MITRE ATT&CK"
    url: https://attack.mitre.org/
---

## STRIDE e o DFD com fronteiras de confiança

Modelar ameaça é responder, por escrito e antes de escrever código, a uma pergunta
específica: o que pode dar errado aqui, e para quem? A ferramenta que organiza essa
conversa é o **Data Flow Diagram (DFD)** — processos, armazenamentos de dado, fluxos e,
o elemento que faz o diagrama valer alguma coisa, **fronteiras de confiança**: as linhas
onde o nível de confiança no que chega muda. Um DFD sem fronteira marcada é só um
diagrama de arquitetura bonito; a fronteira é o que diz "a partir daqui, o dado não é seu".

Sobre cada fronteira, aplica-se **STRIDE**: seis categorias de ameaça, uma por letra —
**S**poofing (alguém finge ser quem não é), **T**ampering (alguém altera o que não deveria),
**R**epúdio (alguém nega ter feito o que fez), **I**nformation disclosure (vazamento),
**D**enial of service, **E**levation of privilege. O valor de STRIDE não é a sigla — é que
ela força a passar pelas seis categorias em toda fronteira, inclusive as que ninguém lembra
sem checklist. Repúdio é a mais esquecida: "o parceiro pode alegar que nunca enviou aquele
webhook?" é uma pergunta de segurança tanto quanto "alguém pode forjar esse token?".

## Attack tree: quando a ameaça merece decomposição

STRIDE por fronteira gera uma lista plana. Quando uma ameaça específica é grande demais
para caber numa linha — "um atacante rouba fundos de um cliente" —, o **attack tree**
decompõe: o nó raiz é o objetivo do atacante, os nós filhos são os caminhos que levam lá
(roubar credencial, explorar BOLA, comprometer um parceiro), e cada folha vira uma ameaça
STRIDE de tamanho analisável. Não é ferramenta para toda ameaça — é ferramenta para a
ameaça que o time já sabe que é séria e precisa entender por onde ela realmente chega.

## Abuse case ao lado do user story

Todo backlog tem user stories: "como cliente, quero iniciar um pagamento". Poucos têm o
par que STRIDE torna óbvio ser necessário: "como atacante, quero iniciar um pagamento com
o consentimento de outro cliente". O **abuse case** é essa história invertida, escrita no
mesmo formato, revisada no mesmo ritual. Um time que só escreve user story projetou o
caminho feliz e nada mais — o abuse case é o que faz o caminho infeliz aparecer na reunião
de planejamento em vez de aparecer em produção.

## Risco é probabilidade vezes impacto — e "criptografe tudo" é teatro caro

Nem toda ameaça listada merece o mesmo investimento. **Risco = probabilidade × impacto**
é a conta que ordena a lista — e ela tem uma consequência que incomoda quem prefere
resposta única para tudo: "criptografe tudo", sem saber qual campo é sensível e qual não
é, custa engenharia real (chave, rotação, performance) para reduzir risco que muitas vezes
já era baixo. A classificação de dado que `dados-distribuidos/13` ensina a fazer — qual
campo é PII, qual é sensível, qual é público — é o **insumo** da modelagem de ameaça, não
o oposto. Primeiro se sabe o que se tem e o quanto vale; depois se decide o que proteger e
com que intensidade.

## O ativo é dinheiro: a economia do atacante muda

A diferença entre modelar ameaça para um blog e para uma fintech não é técnica, é
econômica. Quando o ativo final é dinheiro, o atacante tem **retorno direto e escalável**:
um BOLA que expõe saldo de outro cliente rende reconhecimento; um BOLA que permite iniciar
pagamento em nome de outro cliente rende dinheiro, imediatamente, e automatizável. Isso
muda a norma esperada — automação e volume deixam de ser exceção e viram o comportamento
padrão do atacante, o que puxa para cima a prioridade de qualquer ameaça com caminho até
uma transação, mesmo que o esforço de exploração pareça alto.

## MITRE ATT&CK e a modelagem contínua

**MITRE ATT&CK** é um catálogo de táticas e técnicas observadas em ataques reais,
organizado por fase (acesso inicial, execução, persistência, exfiltração...). Seu valor
aqui não é operacional — é ser **vocabulário comum** entre quem escreve código e quem
responde a incidente: quando o time de segurança diz "isso é T1078 — uso de credencial
válida", engenharia sabe exatamente a que classe de ameaça aquilo pertence, sem reinventar
o nome a cada conversa.

E a modelagem em si não é workshop anual. Toda mudança de fronteira — um novo parceiro
integrado, um novo endpoint exposto, uma migração de nuvem — reabre a pergunta. Um DFD
desenhado uma vez e arquivado descreve um sistema que não existe mais na segunda sprint.

## Exemplo numa fintech

O `fin-platform` tem, no mínimo, quatro fronteiras de confiança com premissas diferentes:
a internet pública (zero confiança, todo input hostil por padrão), o PSP parceiro
(confiança contratual, mas ele pode estar comprometido ou mentir — falha bizantina, não
spoofing), o Diretório de Participantes do Open Finance (âncora de identidade
organizacional, mas com processo de revogação que tem atraso), e o operador de backoffice
(confiança interna, mas com poder de causar dano desproporcional se a conta for
comprometida). Cada uma dessas quatro fronteiras responde de forma diferente à mesma
pergunta STRIDE — "quem pode fazer spoofing aqui?" tem resposta muito distinta entre a
internet pública e o job interno que roda com credencial de serviço.

## Hands-on

**Desafio — DFD do `fin-platform` com ameaças priorizadas.** Desenhe o DFD do
`fin-platform` (ou do subconjunto que você já tem: `pix-gateway`, `fin-idp` quando você
chegar ao marco 05, o parceiro PSP) marcando as fronteiras de confiança. Sobre esse DFD,
liste **10 ameaças STRIDE**, priorizadas por risco (probabilidade × impacto), cobrindo
pelo menos quatro das seis categorias. Para cada ameaça, faça uma de duas coisas:

1. Ligue-a a um controle **que já existe** no seu ambiente, com link para o marco ou
   trilha que o implementa (ex.: "spoofing de workload" → `kubernetes/10`, identidade de
   workload).
2. Declare-a como **lacuna**, por escrito, com uma frase sobre o risco de deixá-la aberta
   por enquanto.

**Invariantes testáveis**

1. As 10 ameaças cobrem pelo menos 4 das 6 categorias STRIDE — nenhuma lista real do
   `fin-platform` é só spoofing e vazamento.
2. Nenhuma ameaça fica sem controle nomeado (com link) ou sem risco aceito por escrito —
   "vamos ver depois" não é uma resposta válida no documento.
3. Pelo menos uma ameaça envolve o PSP parceiro e é modelada como falha bizantina, não
   como spoofing simples.
4. O documento é datado — a modelagem de ameaça declara quando foi revisada pela última
   vez, porque ela expira.

**Complemento.** Escreva um attack tree para a ameaça de maior risco da sua lista,
decompondo o objetivo do atacante em pelo menos três caminhos diferentes até lá. Você vai
descobrir que pelo menos um caminho não estava representado como ameaça separada na lista
STRIDE plana — é exatamente o que o attack tree serve para revelar.

Este artefato — o DFD com as 10 ameaças — é revisitado no marco 15: lá, a pergunta não é
mais "existe controle nomeado?", é "o controle foi **testado**?".

**Checagem**

1. Por que um DFD sem fronteira de confiança marcada não serve para modelar ameaça, mesmo
   sendo tecnicamente correto?
2. Dê um exemplo de ameaça de repúdio no `fin-platform` que não seja sobre autenticação.
3. Por que "criptografar tudo" pode ser uma resposta ruim, mesmo sendo tecnicamente mais
   segura do que não criptografar nada?
4. O que muda, na priorização de risco, quando o ativo final protegido é dinheiro em vez
   de, por exemplo, conteúdo de um blog?

## Principais aprendizados

- STRIDE aplicado a um DFD com fronteiras de confiança marcadas é o que transforma
  "pensar em segurança" numa lista concreta e revisável — sem fronteira, o diagrama não
  ajuda.
- Abuse case ao lado do user story é o que impede o time de só projetar o caminho feliz.
- Risco é probabilidade × impacto; a classificação de dado (`dados-distribuidos/13`) é
  insumo da modelagem, e "criptografar tudo" sem esse insumo é caro sem reduzir o risco
  que mais importa.
- Quando o ativo é dinheiro, o atacante tem retorno direto e escalável — automação e
  volume são a norma, não a exceção, e isso muda a prioridade das ameaças.
- Modelagem de ameaça é contínua: toda mudança de fronteira de confiança reabre a
  pergunta, e o artefato desta trilha é revisitado no marco 15.
