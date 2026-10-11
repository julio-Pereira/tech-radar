---
id: privacidade-e-governanca
title: "Privacidade e governança aplicadas"
summary: "Esquecer é uma funcionalidade, e em armazenamento imutável ela precisa ser projetada. Revogação propagada por todas as camadas, e apagar em arquivo imutável. Marco crítico — quiz estendido."
estimatedMinutes: 65
references:
  - title: "Lei Geral de Proteção de Dados (Lei nº 13.709/2018)"
    url: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
---

## Finalidade, minimização, retenção: parâmetros, não interpretação

O marco 03 já tratou consentimento como dado; este marco trata do que fazer com os princípios que
o governam no dia a dia do pipeline. **Minimização**: coletar e reter só o que a finalidade exige —
nunca "já que estamos buscando o dado da conta, vamos trazer tudo que a API oferece". **Retenção**:
por quanto tempo um dado pode ficar guardado depois de coletado, mesmo com consentimento ainda
válido — parâmetro configurável, testado, nunca hardcoded. **Base legal**: o fundamento jurídico
que autoriza o tratamento (consentimento é um deles, mas não o único possível na LGPD — confira o
texto vigente para as demais hipóteses) — tratado como metadado associado ao dado, não como
pressuposto implícito.

## Pseudonimização e tokenização de CPF

**Pseudonimizar** um CPF substitui o valor real por um identificador que não permite reversão
trivial, mas preserva a capacidade de juntar registros do mesmo titular (join por esse
identificador continua funcionando). **Tokenizar** vai além: o valor real fica guardado só num
cofre separado, e o token não carrega nenhuma informação sobre o original — a mesma técnica de
`dados-distribuidos/13`, aqui aplicada à fronteira de ingestão, antes mesmo do CPF real tocar
qualquer camada além do mínimo necessário.

## Acesso por papel e por coluna, trilha de acesso

Nem todo dado pessoal deveria estar visível para todo mundo que tem acesso ao lake. **Acesso por
papel** restringe quem consulta o quê; **acesso por coluna** vai mais fundo — duas pessoas podem
consultar a mesma tabela e ver conjuntos de colunas diferentes, conforme seu papel. **Mascaramento**
exibe uma versão parcial de um valor sensível (os últimos quatro dígitos de um documento) quando o
valor completo não é necessário para a tarefa. Todo acesso humano a dado pessoal gera **registro de
auditoria** — quem, o quê, quando — a mesma exigência de `dados-distribuidos/13`, aqui aplicada a
dado que **não é nem seu**: é de um cliente, mediado por uma transmissora, sob um consentimento
específico.

## Revogação propagada: a varredura que precisa chegar a todo lugar

Quando um consentimento é revogado, o dado associado precisa deixar de ser legível em **todas** as
camadas: bruto, prata, ouro, **caches**, **extratos já gerados**, e **cópias de homologação** — a
lista completa, não só as óbvias. Esquecer o cache ou a cópia de homologação é o erro mais comum, e
o mais caro de uma auditoria encontrar: "o cliente revogou, mas o dado dele ainda está no ambiente
de testes que três desenvolvedores acessam sem controle nenhum" é exatamente o tipo de achado que
uma auditoria de verdade procura.

## Apagar em arquivo imutável: três estratégias, três custos

**Reescrita por partição**: localizar os arquivos que contêm o dado do titular e reescrevê-los sem
ele — funciona com qualquer formato, custa proporcionalmente ao tamanho da partição afetada, não
ao tamanho do dado apagado (a amplificação de escrita do marco 05, revisitada). **Particionar por
titular**: se o particionamento físico já separa por titular (viável para alguns casos de uso,
caro para o padrão geral de consulta), apagar vira remover uma partição inteira — rápido, mas essa
escolha de particionamento compete com outros critérios de otimização de consulta.
***Crypto-shredding***: cada consentimento (ou titular) tem sua própria chave de criptografia;
apagar significa destruir a chave, tornando o dado permanentemente ilegível sem reescrever um
único byte do arquivo — o mais barato em tempo de execução, com a complexidade movida para a
gestão de chaves (uma chave por titular, numa escala de milhões de titulares, não é trivial de
operar).

> **Reencontro — `dados-distribuidos/13`; `seguranca-aplicacao/09` e `/10`.** Classificação de PII,
> as três camadas de criptografia e tokenização já foram ensinadas ali — este marco aplica o mesmo
> vocabulário à fronteira específica de dado de terceiro sob consentimento revogável, que o
> `dados-distribuidos/13` não cobre (ele trata do seu próprio dado operacional). `/09` e `/10`
> cobrem gestão de chave e segredo em profundidade — aqui ela aparece aplicada especificamente ao
> crypto-shredding por consentimento.

## O que não dá para garantir, e como declarar isso honestamente

Uma vez que um dado foi legitimamente processado e serviu de insumo para uma decisão registrada (um
modelo treinado, uma oferta decidida), **apagar o dado de origem não desfaz esse registro
histórico** — o mesmo problema de "não existe desaprender limpo" que `ml-em-producao/10` trata em
profundidade. E cópias que saíram do seu controle direto (um relatório exportado para uma
planilha, por exemplo) não podem ser garantidamente apagadas por este sistema — a honestidade aqui
é **declarar** esse limite explicitamente na política, não fingir uma garantia que não existe.

## Exemplo numa fintech

O cliente revoga seu consentimento às 10h. A varredura automatizada confirma que o bruto, a prata e
o ouro já não retornam nada dele em 5 minutos — mas 40 minutos depois, alguém percebe que a tabela
de features materializada para o modelo de oferta (um cache derivado, gerado por um job separado)
ainda tem os dados dele, porque a varredura não tinha sido configurada para incluir essa tabela
específica na lista de lugares a verificar.

## Hands-on

**Tutorial.** Implemente chave de criptografia por consentimento e o fluxo completo de revogação.

**Desafio.** Construa uma varredura por `consentId` que verifica **todas** as camadas (bruto,
prata, ouro, cache, extrato simulado).

**Invariantes testáveis**

1. Depois da revogação mais o SLO declarado, **nenhum dado** associado ao `consentId` é legível em
   nenhuma das camadas verificadas pela varredura automatizada.
2. Nenhum CPF (ou outro identificador pessoal real) aparece em log, métrica ou rótulo — testado por
   injeção deliberada de um CPF sintético e verificação de que ele nunca aparece fora do dado
   propriamente dito.
3. Todo acesso humano a dado pessoal gera um registro de auditoria — verificado simulando um
   acesso e conferindo o registro correspondente.
4. O custo do apagar por reescrita (bytes reescritos) é medido e comparado ao custo do
   crypto-shredding para o mesmo cenário.

**Complemento.** Escreva a política de retenção como um arquivo de configuração testado — mude o
prazo e confirme, por teste, que o comportamento muda sem alterar nenhuma linha de código.

**Checagem**

1. Qual é a lista completa de camadas que a revogação precisa alcançar, e qual costuma ser
   esquecida com mais frequência?
2. Qual é a troca de custo entre reescrita por partição e *crypto-shredding* para apagar dado de
   um titular?
3. Por que apagar o dado de origem não desfaz uma decisão já registrada que o usou como insumo?
4. O que este marco considera honesto declarar sobre o que **não** dá para garantir, em vez de
   fingir uma garantia que não existe?

## Principais aprendizados

- Minimização, retenção e base legal são parâmetros configuráveis e testados, nunca interpretação
  jurídica fixada no código — a mesma disciplina de política como código do marco 03.
- Revogação precisa alcançar bruto, prata, ouro, caches e cópias de homologação — esquecer os
  últimos dois é o erro mais comum e o mais caro de uma auditoria encontrar.
- Reescrita por partição, particionar por titular e *crypto-shredding* são três estratégias de
  apagar em armazenamento imutável, cada uma com um custo diferente movido para um lugar diferente.
- Apagar o dado de origem não desfaz uma decisão histórica que já o usou como insumo — "não existe
  desaprender limpo" é um limite real, não uma falha de implementação.
- Declarar honestamente o que não dá para garantir (cópias fora do seu controle) é parte da
  política — fingir uma garantia que não existe é pior do que admitir o limite.
