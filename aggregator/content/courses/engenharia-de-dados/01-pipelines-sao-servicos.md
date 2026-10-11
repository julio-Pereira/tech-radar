---
id: pipelines-sao-servicos
title: "Pipelines são serviços"
summary: "Um pipeline que não é idempotente, observável e testável não é um pipeline: é um script que ainda não falhou. O ciclo ingestão → bruto → prata → ouro → consumo, e o papel do receptor."
estimatedMinutes: 55
references:
  - title: "Open Finance Brasil — Especificações"
    url: https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview
  - title: "Data Contract Specification"
    url: https://datacontract.com/
---

## O script que ainda não falhou

Todo pipeline começa como um script: lê um arquivo, escreve numa tabela, sai. Funciona — até rodar
duas vezes por engano, até cair no meio e alguém reexecutar sem saber o que já tinha terminado, até
um dado chegar atrasado e ninguém perceber que faltou. Um **pipeline**, em oposição a um script, é
um sistema desenhado para essas três coisas acontecerem sem corromper o resultado: **idempotência**
(rodar de novo não duplica), **observabilidade** (dá para saber o que aconteceu sem ler o código) e
**testabilidade** (existe uma forma de provar que está certo antes de ir para produção). Esta
trilha trata pipeline como **serviço com contrato** — a mesma disciplina de API, aplicada a dado.

## Batch, streaming, micro-batch

**Batch**: processa um lote delimitado (o dia de ontem, um arquivo). **Streaming**: processa um
fluxo contínuo, sem início nem fim declarados. **Micro-batch**: streaming simulado por lotes
pequenos e frequentes — o meio-termo que a maioria dos sistemas usa de fato, porque streaming
"puro" (latência de milissegundos, estado persistente contínuo) custa uma complexidade que a maior
parte dos casos de fintech não precisa pagar. O marco 11 aprofunda quando cada um vale.

## Idempotência e reexecução: o alicerce de tudo

**Idempotência** é a propriedade de que aplicar uma operação uma vez ou várias vezes produz o
mesmo resultado. Sem ela, todo retry é um risco de duplicar, e todo backfill é um risco de corromper.
As técnicas que a entregam na prática: **chave natural** (um identificador que já existe no dado de
origem, não gerado pelo pipeline, usado para deduplicar); **`MERGE`/upsert** (a escrita decide, por
chave, se insere ou atualiza, em vez de sempre inserir); **escrita atômica por partição** (a
partição nova substitui a antiga de uma vez, nunca linha por linha — um leitor nunca vê metade
nova e metade antiga); e o padrão **write-audit-publish**: escrever os dados processados numa área
de staging, **auditar** (rodar os testes de qualidade) e só então **publicar** (tornar visível aos
consumidores) — o oposto de escrever direto no destino e torcer para os testes passarem depois.

## *At-least-once*, e por que exatamente-uma-vez é sobre o efeito, não sobre a entrega

Garantir que uma mensagem ou um arquivo seja **entregue exatamente uma vez**, de ponta a ponta, é
extraordinariamente caro e, na maioria dos sistemas reais, não acontece de verdade — falhas de rede
forçam reenvio, e reenvio é **pelo menos uma vez** por natureza (a mesma lição de
`system-design/11` para webhook). O que de fato se consegue, e o que basta: **efeito
exatamente-uma-vez**, via idempotência na escrita — a mensagem pode chegar duas vezes, mas o
`MERGE` por chave natural faz a segunda chegada não mudar nada. A garantia não está no transporte;
está no destino.

## O ciclo: ingestão → bruto → prata → ouro → consumo

**Bruto** (ou *raw*): o dado como chegou, sem transformação, com metadado de origem e hora de
chegada — é o `bronze` de `dados-distribuidos/14`, com um nome que esta trilha prefere por ser
mais descritivo do papel real da camada. **Prata**: limpo, tipado, deduplicado, com chaves de
negócio resolvidas. **Ouro**: modelado para consumo — métricas, tabelas que a área de negócio e o
modelo de oferta entendem. **Consumo**: a interface final, tratada como produto no marco 12. A
disciplina que evita o pântano de dados continua valendo: **ninguém consome bruto para decisão**.

> **Reencontro — `dados-distribuidos/14` e `arquitetura-eventos/08`.** As camadas bronze/prata/ouro
> e a disciplina de não consumir bronze diretamente já foram ensinadas ali, para o caminho *do seu
> próprio* banco transacional ao analítico. Aqui o dado nasce em **outra instituição** — o
> `write-audit-publish` é o mesmo princípio de idempotência que outbox/inbox já aplicam à
> publicação de evento, agora aplicado à publicação de uma tabela inteira.

## Papéis do Open Finance, e o que o receptor realmente guarda

No Open Finance Brasil, a instituição **transmissora** é quem detém o dado do cliente e o expõe
mediante consentimento; a **receptora** é quem consome esse dado para oferecer algo ao cliente — o
papel que esta trilha constrói. O receptor **não** precisa guardar tudo que recebe para sempre:
guarda o que a finalidade do consentimento autoriza, pelo prazo que a política de retenção declara
(marco 03), e nada além disso — "guardar tudo porque pode ser útil depois" é exatamente o tipo de
decisão que o marco 10 trata como antipadrão de governança.

## Exemplo numa fintech

O job noturno de conciliação de transações de uma transmissora roda, falha na metade por timeout
de rede, e alguém o reexecuta manualmente às 9h sem saber que metade do dia já tinha sido
processada. Sem idempotência, a reexecução duplica as transações da primeira metade — o saldo
agregado no ouro dobra para aquelas contas, e ninguém percebe até o relatório de fechamento não
bater com a transmissora.

## Hands-on

**Tutorial.** Um pipeline mínimo: lê um arquivo de transações, escreve uma partição, publica (torna
visível). Rode-o normalmente e confirme que funciona no caminho feliz.

**Desafio.** Torne o mesmo pipeline idempotente e retomável: adicione chave natural, `MERGE`, e
escrita atômica por partição (escrever numa área temporária e mover/renomear ao final, não
escrever linha a linha no destino final).

**Invariantes testáveis**

1. Reexecutar o pipeline 3 vezes sobre a mesma entrada produz uma saída **byte-a-byte idêntica**
   (comparação de hash) à de uma única execução.
2. Matar o processo no meio da execução e retomá-lo não duplica nem perde nenhuma linha, comparado
   a uma execução sem interrupção sobre os mesmos dados.
3. A publicação é atômica: um consumidor lendo a partição durante a escrita nunca observa um
   estado parcial — ou vê a versão antiga completa, ou a nova completa, nunca uma mistura.

**Complemento.** Compare um `INSERT` ingênuo (sem chave, sempre insere) com `MERGE` por chave
natural, rodando a mesma carga duas vezes e contando quantas linhas cada abordagem produz.

**Checagem**

1. O que diferencia idempotência de "entrega exatamente uma vez", e por que a primeira é o que de
   fato se consegue na prática?
2. O que o padrão *write-audit-publish* evita que escrever direto no destino não evita?
3. Por que escrita atômica por partição importa mais que escrita atômica por linha?
4. O que o receptor de Open Finance precisa guardar, e o que "guardar tudo porque pode ser útil" é
   um exemplo de quê?

## Principais aprendizados

- Um pipeline, diferente de um script, é desenhado para rodar de novo sem corromper o resultado —
  idempotência, observabilidade e testabilidade são o que fazem essa diferença.
- Efeito exatamente-uma-vez vem da idempotência na escrita (`MERGE` por chave natural), não da
  garantia de entrega — entrega real é sempre pelo menos uma vez.
- *Write-audit-publish* separa processar de expor: os dados só ficam visíveis depois de passar
  pelos testes de qualidade, nunca antes.
- O ciclo bruto → prata → ouro → consumo organiza qualquer pipeline; ninguém consome bruto para
  decisão, a mesma disciplina de bronze/prata/ouro aplicada a dado de terceiro.
- O receptor guarda o que a finalidade do consentimento autoriza, pelo prazo declarado — nunca
  "tudo, porque pode ser útil depois".
