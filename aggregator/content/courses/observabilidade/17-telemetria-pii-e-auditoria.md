---
id: telemetria-e-compliance
title: "Telemetria, PII e auditoria"
summary: "Redaction no Collector como segunda barreira, a distinção que o regulador cobra, e o fecho: o fin-platform responde as 10 perguntas do marco 01?"
estimatedMinutes: 50
references:
  - title: "OpenTelemetry — Transform Processor"
    url: https://opentelemetry.io/docs/collector/transforming-telemetry/
  - title: "Lei Geral de Proteção de Dados (Lei 13.709/2018)"
    url: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
  - title: "OWASP — Logging Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
---

## Telemetria é dado pessoal

É fácil esquecer, porque telemetria parece técnica. Mas um span com `user.email`, um log
com CPF ou uma métrica com `account_id` são tratamento de dado pessoal — com as mesmas
obrigações de qualquer outro sistema, e uma característica que agrava: **a telemetria se
espalha**.

O mesmo CPF que entrou num log está no agregador, no backup, no índice, possivelmente no
SaaS de terceiro e no data lake. Recolher depois é praticamente impossível.

Por isso a defesa é em camadas, exatamente como no marco 09 da trilha Kubernetes:

1. **Minimização** — não emitir. A única que funciona em todos os lugares de uma vez.
2. **Redaction no Collector** — segunda barreira, porque a primeira falha.
3. **Controle de acesso** ao backend de telemetria.
4. **Retenção curta** para o que é telemetria.

## Redaction no Collector

A disciplina do desenvolvedor **vai falhar** — não por descuido, mas porque um framework
loga o corpo da requisição, uma biblioteca inclui headers, alguém adiciona um atributo útil
sem pensar em PII. A barreira automática é o Collector (marco 06), no **agente do nó**,
antes de o dado sair da máquina:

```yaml
processors:
  attributes/pii:
    actions:
      - key: http.request.header.authorization
        action: delete
      - key: user.email
        action: delete
      - key: db.query.text
        action: delete
      - key: user.cpf
        action: hash          # quando o valor precisa ser correlacionável
  transform/mascara:
    log_statements:
      - context: log
        statements:
          - replace_pattern(body, "\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}", "[CPF]")
          - replace_pattern(body, "\\d{13,19}", "[PAN]")
```

Duas observações honestas sobre isso:

- **`hash` preserva correlação sem expor o valor** — você continua conseguindo agrupar
  eventos do mesmo titular sem saber quem ele é. Use sal, senão o hash de um CPF é
  reversível por força bruta (o espaço de CPFs é pequeno).
- **Regex é uma rede de segurança, não uma garantia.** Ela pega o formato conhecido e
  perde o CPF sem pontuação dentro de um JSON escapado. Serve como segunda barreira; a
  primeira continua sendo não emitir.

E o processador precisa rodar **no agente do nó**, não no gateway — para que o dado
sensível não trafegue pela rede nem chegue a um segundo processo.

## Telemetria ≠ trilha de auditoria

A distinção do marco 09, agora com as consequências completas:

| | Telemetria | Trilha de auditoria |
| --- | --- | --- |
| Propósito | diagnóstico | registro legal |
| Completude | amostrável | **completa, sempre** |
| Mutabilidade | descartável | **imutável** |
| Retenção | dias/semanas | **anos** |
| Acesso | time de engenharia | restrito e **auditado** |
| Se sumir | incômodo no debug | problema com o regulador |

Consequências práticas:

- **Auditoria nunca é amostrada.** Tail sampling (marco 06) é para trace; trilha de
  auditoria não tem amostragem.
- **Auditoria não vai para o Loki** com 15 dias de retenção. Vai para storage com *object
  lock*, tabela append-only, ou serviço dedicado.
- **Quem lê a auditoria também é auditado** — o acesso à trilha é ele próprio um evento
  de auditoria.
- **O audit log do Kubernetes** (marco 10 daquela trilha) é auditoria de infraestrutura, e
  vale a mesma regra: fora do cluster, imutável.

Vale notar que o mesmo raciocínio produziu respostas parecidas em três trilhas: crypto-
shredding no Kafka (marco 13), storage frio imutável via Connect (marco 11), audit log
fora do cluster no Kubernetes (marco 10). Não é coincidência — é a mesma obrigação vista
de três ângulos.

## O que o regulador pergunta

E o que a sua telemetria precisa entregar:

- *"Reconstrua a linha do tempo do incidente de 12/03."* → retenção suficiente e
  correlação (marco 14). Se o incidente foi há 45 dias e a retenção é de 15, não há
  resposta.
- *"Quem acessou dado de cliente nos últimos 90 dias?"* → trilha de auditoria, não log de
  aplicação.
- *"Provem que o dado do titular X foi eliminado."* → inclui a telemetria. Se o CPF dele
  está num log de 30 dias, ele não foi eliminado.
- *"Qual foi a disponibilidade do serviço no trimestre?"* → SLI com recording rules e
  retenção (marco 12).

A última é a mais fácil de falhar por um detalhe bobo: retenção de métrica menor que o
período do relatório. É o argumento para o downsampling de longo prazo do marco 16.

## Checklist de produção regulada

Fecha a trilha. Cada item aponta o marco que o entrega:

- [ ] Nenhum CPF, PAN, e-mail ou nome em log, métrica ou span **(09, 17)**
- [ ] Redaction no Collector como segunda barreira, no agente do nó **(06, 17)**
- [ ] `trace_id` em todo log; exemplars nos histogramas **(09, 14)**
- [ ] SLIs implementados como recording rules, com SLO acordado **(12)**
- [ ] Error budget policy escrita e **acordada com o negócio** **(12)**
- [ ] Alertas por burn rate multi-janela, todos com runbook **(13)**
- [ ] Painel de plantão validado pelo teste do minuto **(14)**
- [ ] Retenção definida por classe, com auditoria separada e imutável **(16, 17)**
- [ ] Game day executado, com MTTD e MTTR medidos **(15)**
- [ ] Post-mortem blameless com ações que têm dono e prazo **(15)**
- [ ] Custo medido por sinal, com ADR de self-host vs SaaS **(16)**
- [ ] Sonda sintética cobrindo a jornada de negócio ponta a ponta **(01)**

Como no checklist da trilha Kubernetes: item que não pode ser demonstrado com uma consulta
ou um artefato está **documentado, não pronto**.

## O fecho: as 10 perguntas

No marco 01 você escreveu as **10 perguntas** que o time precisaria responder num incidente
às 3h da manhã, classificou cada uma em known-unknown ou unknown-unknown, e anotou se
conseguiria respondê-la em menos de 2 minutos. O resultado esperado era desconfortável: a
maior parte caía em "só com deploy".

**Volte àquele documento.**

Para cada pergunta, refaça a avaliação com o `fin-platform` instrumentado: qual sinal
responde, qual consulta concreta, e em quanto tempo. Depois responda:

- Quantas mudaram de "não" para "sim"? **Esse número é o resultado da trilha.**
- As que continuam "não" — é lacuna de instrumentação, de retenção, ou de correlação?
- Surgiram perguntas **novas**, que você nem sabia formular no marco 01? Elas são o sinal
  mais forte de que o vocabulário funcionou: você agora enxerga coisas que antes não tinham
  nome.

E a pergunta final, que é a da trilha inteira: *você consegue responder a uma pergunta que
ninguém previu, agora, sem fazer deploy?* Se sim, o sistema é observável. Se não, você sabe
exatamente o que falta — que já é muito mais do que se sabia no começo.

## Exemplo numa fintech

O conflito recorrente do `fin-platform`: investigação exige recorte por cliente, e recorte
por cliente parece exigir identificar o cliente.

A saída é o **identificador interno opaco**. `account_id` como UUID interno, sem relação
derivável com CPF ou nome, permite filtrar `account_id="acc_771"` numa investigação sem que
a telemetria contenha dado pessoal. A tradução para o titular acontece num sistema separado,
com acesso auditado — e só quando é realmente necessária.

Isso preserva quase toda a capacidade de investigação e remove a telemetria do escopo mais
pesado da LGPD. É a mesma ideia da tokenização do marco 13 da trilha Kafka, aplicada ao
sinal em vez do evento.

## Hands-on

**Desafio — a barreira que funciona.**

1. Configure o `attributes` e o `transform` no agente do Collector, com as regras da seção.
2. Faça um serviço emitir, de propósito, um log com CPF, um span com `user.email` e um
   header `Authorization`.

**Invariantes testáveis:**

- Nenhum dos três chega ao backend. Verifique **no destino**, não na configuração.
- Um teste automatizado que consulta o Loki e o Tempo procurando padrão de CPF e PAN, e
  **falha** se encontrar. Rode-o no pipeline — política escrita não impede regressão, teste
  impede.
- O `account_id` **continua presente** e a investigação por cliente continua possível. Se o
  seu redaction quebrou a capacidade de investigar, ele foi longe demais.
- O hash com sal do CPF permite agrupar eventos do mesmo titular sem expor o valor.

**Complemento — telemetria vs auditoria.** Liste 10 eventos do `fin-platform` e classifique
cada um. Para os de auditoria, defina onde ficam guardados, por quanto tempo, e como se
prova a imutabilidade. Implemente **um** deles ponta a ponta.

**Desafio final — as 10 perguntas.** Refaça o documento do marco 01 conforme a seção "O
fecho". Entregue a tabela com as quatro colunas (pergunta, sinal que responde, consulta
concreta, tempo) e o parágrafo comparando com a avaliação original. É o capstone da trilha,
e é o único exercício que mede o que ela realmente entregou.

**Checagem.** (a) Por que redaction deve rodar no agente do nó e não no gateway? (b) Por
que hash de CPF sem sal é insuficiente? (c) O que muda entre telemetria e auditoria em
completude e imutabilidade? (d) Como investigar por cliente sem ter dado pessoal na
telemetria?

## Principais aprendizados

- Telemetria é dado pessoal e se espalha: minimizar primeiro, redaction no agente como
  segunda barreira, porque a disciplina do desenvolvedor falha.
- Auditoria nunca é amostrada, é imutável, é retida por anos e mora fora do stack de
  telemetria.
- Identificador interno opaco preserva a investigação por cliente sem pôr dado pessoal no
  sinal.
- O fecho da trilha é o documento do marco 01: quantas das 10 perguntas passaram de "não"
  para "sim" — e quais perguntas novas você agora consegue formular.
