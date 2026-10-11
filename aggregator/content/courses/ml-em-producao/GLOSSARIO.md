# Glossário — Machine Learning em Produção

## Enquadramento

**Baseline**
Em uma frase: a política mais simples (geralmente por regras) que o modelo precisa superar para justificar sua existência.
No fin-offers: registrado no marco 01, persistido para comparação automática no gate de promoção (marco 04).
Erro comum: tratar qualquer melhora de métrica como suficiente, sem comparar contra essa régua.
Onde na prática: harness de avaliação offline, logo antes de treinar qualquer modelo.

**Custo assimétrico**
Em uma frase: o custo de um tipo de erro (mostrar a oferta errada) é diferente do custo do outro tipo (deixar de mostrar a certa).
No fin-offers: a matriz de custo do marco 01 deriva o limiar de decisão ótimo a partir dessa assimetria.
Erro comum: usar acurácia genérica em vez da matriz de custo para escolher o limiar.
Onde na prática: teste de sensibilidade do limiar quando a matriz de custo muda.

**Policy gate**
Em uma frase: a barreira de consentimento, finalidade, elegibilidade e frequência que todo candidato atravessa antes do modelo.
No fin-offers: roda na construção de candidatos (marco 01) e de novo no serving (marco 06).
Erro comum: assumir que passar pelo gate uma vez garante validade indefinidamente.
Onde na prática: teste exaustivo sobre todas as combinações de finalidade simuladas.

**Elegibilidade**
Em uma frase: a aprovação de que um cliente pode receber um produto, decidida por um motor de risco fora do escopo desta trilha.
No fin-offers: consumida como resposta de um stub de motor de risco, nunca recalculada pelo modelo de oferta.
Erro comum: deixar o modelo de ranking decidir elegibilidade, misturando as duas responsabilidades.
Onde na prática: o policy gate do marco 01, antes de qualquer ranking.

**Decisão automatizada**
Em uma frase: uma decisão tomada sem intervenção humana direta que afeta os interesses do titular.
No fin-offers: tratada no marco 09, com o direito de revisão dependendo de reexecução histórica da decisão.
Erro comum: tratar o texto da LGPD sobre o tema como definitivo sem conferir a fonte vigente.
Onde na prática: fluxo de revisão que reexecuta entradas e versão histórica do modelo.

## Dados

**Instante da decisão**
Em uma frase: o momento exato em que uma decisão de oferta foi tomada, usado como referência para toda feature daquela linha.
No fin-offers: ancora o join point-in-time do marco 02.
Erro comum: confundir o instante da decisão com o instante em que o dataset está sendo construído.
Onde na prática: teste por construção que verifica timestamp de feature ≤ instante da decisão.

**Join point-in-time**
Em uma frase: um join que busca o valor de uma feature como ela era no instante da decisão, não o valor mais recente disponível hoje.
No fin-offers: implementado no marco 02 com DuckDB sobre as tabelas do sim-clientes.
Erro comum: usar um join SQL comum (pelo valor mais recente) para construir dataset de treino.
Onde na prática: a armadilha de vazamento plantada no sim-clientes, que um join comum não detecta.

**Vazamento**
Em uma frase: informação que não deveria estar disponível no instante da decisão entrando no treino, por quatro vias possíveis (alvo, temporal, grupo, pré-processamento).
No fin-offers: a armadilha didática do marco 02, com a assinatura de métrica ótima no laboratório e resultado ruim em produção.
Erro comum: aceitar uma métrica excelente sem investigar se ela é real ou vazamento.
Onde na prática: teste que compara métrica do pipeline com e sem a coluna suspeita.

**Janela de maturação**
Em uma frase: o tempo necessário para um rótulo (inadimplência, contratação) se confirmar depois da decisão.
No fin-offers: limita quais decisões podem entrar no dataset de treino (marco 02) e quais métricas de produção são confiáveis (marco 07).
Erro comum: tratar uma decisão recente como "negativo confirmado" antes da janela se fechar.
Onde na prática: estimativa de perda de volume de dados por causa da janela, no marco 02.

**Split temporal**
Em uma frase: separar treino e validação por data, nunca aleatoriamente.
No fin-offers: usado no marco 02 (dataset) e no marco 04 (validação do modelo).
Erro comum: usar validação cruzada aleatória, misturando passado e futuro de forma inválida.
Onde na prática: teste que garante nenhuma linha de validação com data anterior a uma linha de treino.

**Rótulo atrasado**
Em uma frase: o resultado real de uma decisão (contratação, inadimplência) só fica disponível muito depois da decisão.
No fin-offers: força o uso de proxies ou coortes maduras no monitoramento (marco 07) e na experimentação (marco 08).
Erro comum: decidir o resultado de um experimento antes da janela de maturação se fechar.
Onde na prática: simulação de rótulo atrasado de 90 dias no marco 08.

## Features

**Feature store**
Em uma frase: um registro que define, materializa e serve features de forma consistente entre treino e serviço.
No fin-offers: avaliada no marco 03 — útil com reúso entre modelos, peso morto com poucas features e poucos modelos.
Erro comum: adotar a ferramenta antes de precisar dela, pagando custo sem benefício proporcional.
Onde na prática: decisão registrada em ADR sobre adotar ou não uma feature store.

**Training/serving skew**
Em uma frase: a mesma feature calculada por dois caminhos diferentes produz números diferentes para a mesma entrada.
No fin-offers: a causa mais comum de modelo que funciona no laboratório e falha em produção, depois do vazamento.
Erro comum: manter duas implementações da mesma feature "que deveriam bater" em vez de um único caminho de cálculo.
Onde na prática: teste de paridade offline/online do marco 03.

**Frescor (TTL)**
Em uma frase: o tempo de vida de uma feature, depois do qual ela é considerada vencida.
No fin-offers: uma feature vencida devolve ausente, nunca o último valor conhecido disfarçado de atual.
Erro comum: servir o último valor conhecido como se fosse atual quando a feature está vencida.
Onde na prática: teste do marco 03 que verifica resposta ausente para feature fora do TTL.

**Paridade offline/online**
Em uma frase: a garantia de que a mesma feature, calculada nos dois contextos, produz o mesmo valor para a mesma entrada.
No fin-offers: verificada por teste automatizado no marco 03, com igualdade exata para inteiros e tolerância declarada para reais.
Erro comum: validar paridade manualmente uma vez, sem teste automatizado recorrente.
Onde na prática: suíte de testes de paridade que roda a cada alteração de definição de feature.

## Treino

**Reprodutibilidade**
Em uma frase: a garantia de que o mesmo dado, seed e código produzem sempre as mesmas métricas.
No fin-offers: fundamenta o marco 04 e é pré-requisito de qualquer auditoria de modelo.
Erro comum: treinar sem fixar seed ou sem registrar hash do dado e do código usados.
Onde na prática: rastreio de experimentos (MLflow) registrando hiperparâmetros, métricas e hashes.

**Calibração**
Em uma frase: se a probabilidade que o modelo produz corresponde à frequência real observada.
No fin-offers: condição do gate de promoção do marco 04, junto com a margem sobre o baseline.
Erro comum: confundir calibração com uma métrica de ranking como AUC — são propriedades diferentes.
Onde na prática: erro de calibração medido sobre a validação temporal antes de promover um modelo.

**Lift**
Em uma frase: o ganho de uma seleção guiada pelo modelo sobre uma seleção aleatória do mesmo tamanho.
No fin-offers: parte da avaliação do marco 04, ao lado de ranking, calibração e custo esperado.
Erro comum: olhar só para lift sem considerar o custo operacional de atingi-lo.
Onde na prática: comparação do ganho de lift do modelo candidato com o custo de mantê-lo em produção.

**Model card**
Em uma frase: um documento em linguagem simples sobre o que o modelo faz, com que dado foi treinado, limitações e desempenho por segmento.
No fin-offers: produzido junto com cada modelo candidato no marco 04, para quem opera e audita, não só quem treinou.
Erro comum: tratar o model card como documentação opcional em vez de parte do artefato promovido.
Onde na prática: anexado ao registro do modelo no registry (marco 05).

**Validação temporal**
Em uma frase: avaliar o modelo sobre dados posteriores ao período de treino, nunca sobre um split aleatório.
No fin-offers: condição do gate de promoção do marco 04, usando o mesmo split temporal do marco 02.
Erro comum: validar com dados que se misturam temporalmente com o treino, inflando a métrica.
Onde na prática: gate "supera o baseline" calculado só sobre essa validação.

## Operação

**Registry**
Em uma frase: o sistema que guarda versões de modelo com metadados e as move por estágios.
No fin-offers: implementado no marco 05, com gates de contrato, baseline e proveniência entre estágios.
Erro comum: promover um modelo manualmente, pulando os gates automatizados sob pressão de prazo.
Onde na prática: pipeline que rejeita uma promoção com assinatura de contrato incompatível.

**Contrato do modelo**
Em uma frase: a especificação de quais features um modelo recebe, em que versão, e que formato de saída produz.
No fin-offers: verificado no CI do marco 05 antes de qualquer promoção de estágio.
Erro comum: descobrir uma feature faltante só quando o serviço já está tentando servir o modelo.
Onde na prática: teste de CI que rejeita um modelo com assinatura incompatível com o serviço atual.

**Shadow**
Em uma frase: o modelo novo calcula sua decisão em paralelo ao modelo em produção, mas nunca a usa.
No fin-offers: etapa anterior ao canário no marco 05, mede sem risco de impacto no cliente.
Erro comum: pular o shadow e ir direto para canário, perdendo a comparação sem risco.
Onde na prática: teste que garante respostas idênticas ao cliente com e sem o modelo em shadow ativo.

**Canário**
Em uma frase: uma fração pequena do tráfego real recebe a decisão do modelo novo de fato.
No fin-offers: etapa posterior ao shadow no marco 05, mede com risco controlado e limitado.
Erro comum: expandir o canário para todo o tráfego antes de validar as métricas da fração inicial.
Onde na prática: expansão gradual de tráfego condicionada a métricas estáveis do canário.

**Rollback**
Em uma frase: reverter um modelo promovido para a versão anterior, restaurando também a versão das features usadas por ela.
No fin-offers: testado no marco 05 — sem restaurar a versão das features, a mesma entrada pode produzir uma saída diferente.
Erro comum: reverter só o binário do modelo, deixando a versão de features na versão nova.
Onde na prática: teste que compara a decisão pós-rollback com a decisão anterior à promoção.

**Fallback**
Em uma frase: a ação tomada quando o modelo ou uma feature não respondem dentro do orçamento de latência.
No fin-offers: definido por tipo de oferta antes do incidente, no marco 06, não inventado sob pressão.
Erro comum: não ter um fallback declarado e improvisar uma resposta durante uma falha real.
Onde na prática: matriz de fallback testada caso a caso para cada tipo de oferta.

**Log de decisão**
Em uma frase: o registro completo de uma decisão — entradas, versões de modelo/feature/política, resultado e um decisionId.
No fin-offers: construído no marco 06, base do replay (marco 06) e da revisão de decisão (marco 09).
Erro comum: registrar só o resultado final, sem as versões que permitem reproduzir a decisão depois.
Onde na prática: replay de uma decisão a partir do log, produzindo a mesma saída.

**Replay**
Em uma frase: reexecutar uma decisão passada com as mesmas entradas e versões registradas no log.
No fin-offers: usado para auditoria (marco 06) e para responder a um pedido de revisão (marco 09).
Erro comum: rodar o modelo atual sobre dados atuais em vez de reproduzir o contexto histórico exato.
Onde na prática: fluxo de revisão de decisão automatizada do marco 09.

## Monitoramento

**Data drift**
Em uma frase: a distribuição das features de entrada muda em relação à distribuição vista no treino.
No fin-offers: detectado por PSI/KS no marco 07, com limiar declarado e testado.
Erro comum: confundir data drift com um problema de qualidade de entrada — causas e remédios diferentes.
Onde na prática: alerta que dispara sob um deslocamento conhecido injetado em teste.

**Concept drift**
Em uma frase: a relação entre as features e o resultado muda, mesmo que a distribuição das features não mude.
No fin-offers: mais difícil de detectar diretamente que data drift; aparece via queda de desempenho medida por proxy.
Erro comum: monitorar só a distribuição das features, sem acompanhar nenhum proxy de desempenho.
Onde na prática: acompanhamento de desempenho por coorte madura no marco 07.

**PSI**
Em uma frase: population stability index, uma medida de distância entre a distribuição de hoje e a distribuição de referência do treino.
No fin-offers: calculada por feature no marco 07, com limiar declarado para disparar alerta.
Erro comum: calibrar o limiar por intuição, em vez de medir a taxa de falso positivo sob dados estáveis.
Onde na prática: teste que verifica taxa de falso positivo abaixo do limite em 100 janelas simuladas.

**KS**
Em uma frase: teste de Kolmogorov-Smirnov, outra medida de distância entre duas distribuições, usada como alternativa ou complemento ao PSI.
No fin-offers: aplicado no marco 07 junto ao PSI para monitorar deslocamento de features.
Erro comum: usar uma única métrica de distância sem considerar suas limitações para distribuições específicas.
Onde na prática: regra de alerta testada com `promtool test rules`.

**Taxa de ausência**
Em uma frase: a proporção de vezes em que uma feature é servida como ausente, geralmente por TTL vencido.
No fin-offers: monitorada separadamente do drift no marco 07, porque tem causa e remédio diferentes.
Erro comum: tratar um aumento de ausência de feature como se fosse drift, mascarando a causa raiz.
Onde na prática: alerta distinto do alerta de drift para aumento de taxa de ausência.

## Feedback

**Viés de seleção**
Em uma frase: a limitação do dataset de treino de só conter decisões já tomadas, sem informação sobre o que aconteceria sem elas.
No fin-offers: o tema central do marco 08, corrigido por exploração e holdout.
Erro comum: tratar o histórico de decisões como se representasse o efeito real da oferta.
Onde na prática: estimativa viesada de valor para uma oferta nunca mostrada, demonstrada no marco 08.

**Laço de reforço**
Em uma frase: um modelo que decide com base no próprio padrão passado, sem exploração, reforça esse padrão indefinidamente.
No fin-offers: o antipadrão "feedback ignorado" do marco 10, raiz do exemplo do marco 08.
Erro comum: achar que mais dados históricos resolvem o problema, sem introduzir exploração real.
Onde na prática: comparação entre política gananciosa e política com exploração no marco 08.

**Exploração**
Em uma frase: tomar deliberadamente, parte do tempo, uma decisão diferente da recomendada pelo modelo, para aprender fora do próprio histórico.
No fin-offers: implementada como ε-greedy no marco 08, com custo real e benefício de reduzir viés.
Erro comum: nunca explorar, por medo do custo de curto prazo, perpetuando o viés de seleção.
Onde na prática: teste que mede queda do viés de estimativa conforme ε aumenta.

**Holdout**
Em uma frase: uma fração pequena e constante da base que nunca recebe oferta guiada por modelo, servindo de referência global.
No fin-offers: usado no marco 08 para medir o efeito do sistema inteiro, não só comparar versões de modelo.
Erro comum: usar apenas comparação entre modelos, sem holdout, perdendo a referência do "sem sistema".
Onde na prática: teste que verifica o efeito estimado dentro do intervalo de confiança do efeito real.

**SRM**
Em uma frase: sample ratio mismatch, o sinal de que a atribuição de um experimento está quebrada.
No fin-offers: verificado no marco 08 antes de confiar em qualquer conclusão de experimento.
Erro comum: interpretar resultado de um experimento com SRM detectado sem corrigir a atribuição primeiro.
Onde na prática: teste que sinaliza uma atribuição 70/30 plantada e não sinaliza a correta 50/50.

**Propensão registrada**
Em uma frase: a probabilidade da ação tomada, registrada junto com cada decisão para permitir avaliação contrafactual depois.
No fin-offers: base do estimador IPS do marco 08, que recupera efeito de política diferente sem novo experimento.
Erro comum: não registrar a propensão, perdendo a capacidade de reavaliar decisões passadas.
Onde na prática: estimador IPS sobre o log histórico, testado contra tolerância declarada.

**IPS**
Em uma frase: inverse propensity scoring, um estimador que usa a propensão registrada para recuperar o efeito contrafactual de uma política.
No fin-offers: tratado em nível conceitual no marco 08, sem aprofundar a matemática.
Erro comum: aplicar o estimador sem propensão registrada corretamente, invalidando a estimativa.
Onde na prática: recuperação do efeito real a partir do log, dentro de tolerância declarada.

**Guardrail**
Em uma frase: um limite de proteção (cap de frequência, métrica de dano) que vale independente do braço do experimento.
No fin-offers: aplicado no marco 08 em paralelo à estatística do experimento, não como parte dela.
Erro comum: relaxar um guardrail para acelerar a coleta de significância estatística.
Onde na prática: teste que garante o cap de frequência nunca excedido em nenhum braço.

**Cap de frequência**
Em uma frase: o limite de quantas vezes um cliente pode ser contatado com ofertas num período.
No fin-offers: aplicado e testado em todo experimento e em produção, independente de braço ou modelo.
Erro comum: calcular o cap por braço do experimento em vez de por cliente, total.
Onde na prática: invariante testado no marco 08 e na definição de pronto do capstone.

## Responsabilidade

**Reason code**
Em uma frase: uma explicação estruturada e estável de por que uma decisão específica de oferta foi tomada.
No fin-offers: produzido e reexecutável no marco 09, base da revisão de decisão automatizada.
Erro comum: gerar uma explicação diferente a cada vez que a mesma decisão é reexecutada.
Onde na prática: teste que verifica reason codes idênticos num replay da mesma decisão.

**Proxy**
Em uma frase: uma feature que não é o atributo protegido, mas correlaciona fortemente com ele, reintroduzindo o mesmo risco.
No fin-offers: detectado por correlação ou informação mútua antes de aceitar a feature no registro (marco 09).
Erro comum: remover só o atributo protegido direto e assumir que o problema de discriminação foi resolvido.
Onde na prática: teste que detecta um proxy plantado e deixa passar as features limpas.

**Razão de impacto**
Em uma frase: a taxa de resultado favorável de um grupo dividida pela de outro, uma das métricas de disparidade.
No fin-offers: calculada no pipeline de avaliação do marco 09 sobre grupos sintéticos.
Erro comum: tratar essa métrica isolada como suficiente para provar ausência de discriminação.
Onde na prática: gate de promoção que reprova um modelo enviesado plantado deliberadamente.

**Direito de revisão**
Em uma frase: a possibilidade de um titular solicitar reexame de uma decisão automatizada que o afeta.
No fin-offers: apoiado tecnicamente pela reexecução histórica da decisão (marco 09), independente do texto exato da norma.
Erro comum: tratar o texto da LGPD sobre o tema como definitivo sem conferir a fonte vigente.
Onde na prática: fluxo de revisão que reexecuta entradas e versão históricas, não o estado atual.

**Linhagem de treino**
Em uma frase: o rastro de quais dados, consentimentos e janela temporal entraram no dataset que treinou um modelo.
No fin-offers: base da consulta "quais modelos usaram o consentimento X" no marco 10.
Erro comum: não manter essa linhagem e descobrir, só numa revogação em massa, que a consulta não tem resposta.
Onde na prática: teste de consulta de linhagem contra um cenário conhecido do sim-clientes.

**Expiração de modelo**
Em uma frase: marcar um modelo como inválido para promoção ou serving quando a fração de dados revogados no seu treino passa de um limite configurado.
No fin-offers: mecanismo testado no marco 10, uma das três políticas possíveis para revogação em modelo treinado.
Erro comum: continuar servindo um modelo cujo dado de treino já perdeu base legal em fração significativa.
Onde na prática: gate do registry que bloqueia promoção e serving de um modelo marcado expirado.
