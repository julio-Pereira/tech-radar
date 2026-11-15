---
id: adotar-ia-no-time
titulo: "Como você adotou agentes de código no seu time"
tipo: comportamental
nivel: senior
duracaoMin: 20
prerequisitos:
  - ia-na-engenharia/07
conceitos: []
parametros: {}
reviravolta:
  momentoPct: 70
  texto: "Follow-up do entrevistador: \"E como vocês trataram o código e o dado de cliente que iam para o modelo?\""
  rubrica:
    - "Disse o que podia e o que não podia ir para o modelo, como política escrita, e não decisão de cada pessoa"
    - "Citou o controle que cobra a política (ambiente isolado, segredo fora do contexto, lista de destinos), sem depender de o modelo obedecer"
    - "Mencionou quem decide a norma (jurídico, segurança) sem fingir interpretá-la"
entregavel:
  secoesObrigatorias: [Situação, Tarefa, Ação, Resultado, Aprendizado]
rubrica:
  - "Deu um critério de delegação: onde o agente ajuda e onde não, pelo custo de verificar e pelo risco, com o caminho do dinheiro tratado à parte"
  - "Descreveu um controle que não depende do modelo se comportar: escopo de arquivos, portão de permissão, revisão humana, outra pessoa no irreversível"
  - "Mediu o efeito com estabilidade junto da velocidade: tempo de entrega com taxa de falha e retrabalho, contra um grupo de comparação"
  - "Contou o que não funcionou e o controle ou ajuste que nasceu disso"
  - "Explicou como tratou dado sensível e segredo, sem expor nomes, clientes ou dados da empresa"
---
## Enunciado

"Conte como você levou o uso de agentes de código para o seu time. Onde você decidiu usar, o que fez para
que fosse seguro, e como sabe que valeu a pena?"

Responda no formato STAR, com um aprendizado no fim, para falar em 2 a 4 minutos. A resposta fica só neste
navegador: não escreva nomes de colegas, de clientes nem dados de empresas.

## Dicas

- `ia-na-engenharia/01` dá o critério de delegação pelo custo de verificar; `ia-na-engenharia/06`, os
  controles que funcionam com o modelo enganado; `ia-na-engenharia/07`, a medição que não cai na vaidade.
- Comece pela decisão, não pela ferramenta: o que o time delegou, o que não delegou, e por quê.
- Busque no seu dossiê privado um número de antes e de depois que inclua estabilidade, e não só velocidade.

## Gabarito comentado

A banca quer separar quem **usou uma ferramenta** de quem **definiu como o time trabalha com ela**. A resposta
fraca lista assistentes e conta quantas horas economizou, ou quantas sugestões o time aceitou. Isso mede o
uso, não o efeito, e não diz nada sobre risco.

A resposta forte tem cinco partes:

1. **Critério de delegação:** onde o agente entra (teste, migração mecânica, regra fora do dinheiro, com
   especificação) e onde não entra sozinho (o caminho do dinheiro, com teste de invariante e revisão humana).
2. **Controle determinístico:** o que limita o agente mesmo se ele errar ou for enganado. Escopo de arquivos e
   tamanho de PR, o *gate* de mutação contra a asserção enfraquecida, a sessão que não junta dado privado,
   conteúdo externo e saída, outra pessoa aprovando o irreversível.
3. **Medida com estabilidade:** o tempo de entrega junto com a taxa de falha e o retrabalho, contra um grupo de
   comparação, com a duração do piloto definida antes.
4. **O que não funcionou:** o PR verde com o teste enfraquecido, o código refeito na semana seguinte, o agente com
   rede demais. E o controle que nasceu dali.
5. **Dado sensível:** a política do que vai para o modelo, e o controle que a cobra. É a reviravolta da banca.

Erros comuns: tratar a adoção como obrigação ("todo PR com agente") ou como proibição; não ter número de
estabilidade; dizer que "o modelo não faz isso" como defesa; e interpretar a norma de sigilo ou de proteção de
dados no lugar de quem decide.
