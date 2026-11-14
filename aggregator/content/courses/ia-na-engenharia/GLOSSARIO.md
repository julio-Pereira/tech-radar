Um verbete por termo: definição em uma frase, o exemplo no `fin-assist`, o erro comum associado e o marco
onde o conceito aparece na prática. Conceitos que já têm dono (*gate*, métricas DORA, registro de
evidência, cadeia de suprimentos, segredo) são verbetes das trilhas donas e não se repetem aqui.

## Especificar

### Custo de verificação
**Em uma frase:** o esforço para saber se o que o agente entregou está certo; é ele, e não a velocidade de escrever, que limita o ganho de delegar uma tarefa.
**No fin-assist:** a matriz de delegação põe teste e refatoração mecânica como baratos de verificar, e a regra do ledger como cara.
**Erro comum:** delegar pela facilidade de escrever, e não pela de verificar.
**Onde na prática:** marco 01.

### Critério de aceite executável
**Em uma frase:** a condição de pronto de um requisito escrita de forma que um comando a verifique, como um teste ou uma regra sobre o código.
**No fin-assist:** cada requisito do limite por período tem um teste anotado com o identificador dele.
**Erro comum:** escrever o critério em prosa ("o limite deve funcionar à noite") e deixar o agente decidir o que isso quer dizer.
**Onde na prática:** marco 02.

## Agente no fluxo

### Agente roteirizado
**Em uma frase:** um programa determinístico que reproduz, em ordem fixa, ações gravadas de um agente de código, para testar o controle em volta dele sem depender de um modelo.
**No fin-assist:** o roteiro do conteúdo injetado tenta a exfiltração, e o teste afirma que o portão bloqueou.
**Erro comum:** concluir que o controle funciona porque um agente real "se comportou" num teste.
**Onde na prática:** marco 04.

## Segurança

### Injeção indireta de prompt
**Em uma frase:** a instrução escondida num conteúdo que o agente lê (issue, comentário, README, saída de ferramenta), e não digitada por quem usa o agente.
**No fin-assist:** um comentário escondido numa issue pede para ler o `.env` e enviar para fora.
**Erro comum:** tratar o problema como de *prompt* do sistema, quando a defesa que se testa é o controle de permissão e de saída.
**Onde na prática:** marco 06.
