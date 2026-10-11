Um verbete por termo: definição em uma frase, o exemplo no `fin-platform`, o erro comum
associado e o marco onde o conceito aparece na prática. Consulte durante a trilha inteira.

## Paisagem

### Capacidade
**Em uma frase:** o que o negócio faz — "autorizar pagamento", "avaliar risco" — independente de qual sistema faz isso hoje.
**No fin-platform:** `paisagem/capacidades.yaml`, listando o que o `fin-platform` faz, não quais sistemas existem.
**Erro comum:** confundir capacidade com sistema, perdendo a distinção entre o que precisa existir e o que já existe.
**Onde na prática:** marco 01.

### Sistema de registro
**Em uma frase:** a fonte definitiva de um dado — o lugar de onde todo outro deveria copiar, nunca o contrário.
**No fin-platform:** o `ledger-core` como sistema de registro do saldo, não o core nem a planilha de tesouraria.
**Erro comum:** ter o mesmo dado em dois lugares sem que um seja claramente cópia do outro.
**Onde na prática:** marco 01.

### Arquitetura corporativa × de soluções
**Em uma frase:** corporativa decide no nível do portfólio inteiro; soluções decide como sistemas se conectam.
**No fin-platform:** o mapa de capacidades é corporativo; o catálogo de integrações é desta trilha.
**Erro comum:** responder uma pergunta de soluções com raciocínio de software, ou vice-versa.
**Onde na prática:** marco 01.

### Estado atual × estado alvo
**Em uma frase:** documentar como as coisas realmente são, separado de como deveriam ser.
**No fin-platform:** o estado atual admite que "saldo" tem três cópias; o estado alvo declara qual delas deveria ser a única.
**Erro comum:** misturar realidade com aspiração no mesmo documento, tornando impossível saber o que já existe.
**Onde na prática:** marco 01.

### Mapa evolutivo (Wardley)
**Em uma frase:** posiciona capacidades de genesis a commodity, como ferramenta de conversa sobre o que vale construir.
**No fin-platform:** usado para decidir, no marco 04, o que é diferenciador e o que é commodity.
**Erro comum:** tratar o mapa como medição precisa, em vez de ferramenta de discussão.
**Onde na prática:** marcos 01 e 04.

## Integração

### Banco compartilhado
**Em uma frase:** dois sistemas lendo e escrevendo nas mesmas tabelas — quase sempre o pior estilo de integração.
**No fin-platform:** o antipadrão citado explicitamente no catálogo de integrações.
**Erro comum:** adotar por conveniência de curto prazo, sem perceber que nenhum dos dois lados pode mudar o schema sozinho.
**Onde na prática:** marco 02.

### Idempotent receiver
**Em uma frase:** o consumidor trata a mesma mensagem entregue duas vezes como se fosse uma única vez.
**No fin-platform:** aplicado aos três simuladores (arquivo, API, evento) do catálogo de integrações.
**Erro comum:** confiar que o produtor nunca duplica entrega, em vez de proteger o consumidor de qualquer forma.
**Onde na prática:** marco 02.

### Canonical model
**Em uma frase:** um formato de dados comum a todos os sistemas, que reduz tradução ponto a ponto — mas pode virar gargalo.
**No fin-platform:** avaliado com cautela, porque toda mudança nele exige consenso de todos que o usam.
**Erro comum:** adotar sem planejar quem mantém e aprova mudanças, até o modelo travar toda evolução.
**Onde na prática:** marco 02.

### Catálogo de integrações
**Em uma frase:** registro central de toda integração, com padrão, contrato, idempotência, modo de falha, SLA e dono.
**No fin-platform:** `integracoes/catalogo.yaml`, consultável em vez de respondido de memória.
**Erro comum:** não ter catálogo, deixando "o que acontece se este sistema cair?" sem resposta confiável.
**Onde na prática:** marco 02.

### Janela de batch
**Em uma frase:** o período em que uma integração por arquivo gera e espera o resultado, sensível a fuso e relógio.
**No fin-platform:** "o arquivo do dia" do `fake-core`, cujo significado muda conforme o fuso e o calendário bancário.
**Erro comum:** assumir que "o dia" tem o mesmo início e fim em todos os sistemas envolvidos na integração.
**Onde na prática:** marcos 02 e 03.

### Propriedade do contrato (de integração)
**Em uma frase:** quem é dono de um contrato entre sistemas, responsável por coordenar mudanças e avisar os dois lados.
**No fin-platform:** uma função de arquitetura, não necessariamente quem consome ou quem produz, coordenando mudança de contrato.
**Erro comum:** não ter dono definido, deixando "quem eu avisava antes de mudar isso?" sem resposta no momento da mudança.
**Onde na prática:** marco 02.

## Legado

### Core bancário
**Em uma frase:** o sistema que guarda o saldo de verdade, geralmente com arquivo posicional, fechamento em lote e API lenta.
**No fin-platform:** representado pelo `fake-core/` — sintético, com as mesmas limitações estruturais.
**Erro comum:** assumir que o core se comporta como um sistema moderno, sem verificar suas limitações reais.
**Onde na prática:** marco 03.

### Camada anticorrupção (em escala)
**Em uma frase:** tradução, isolamento de tipos e tolerância a campo desconhecido entre o legado e o resto da plataforma.
**No fin-platform:** nenhum tipo do `fake-core` aparece fora do pacote da ACL — verificado por teste de arquitetura.
**Erro comum:** deixar um tipo específico do legado vazar para o domínio moderno "só essa vez".
**Onde na prática:** marco 03.

### Leitura degradada
**Em uma frase:** servir o último dado disponível, explicitamente marcado como defasado, quando a fonte original está indisponível.
**No fin-platform:** o saldo mostrado "calculado até as 22h" quando o core está em fechamento.
**Erro comum:** mostrar erro opaco em vez de dado defasado identificado, ou mentir mostrando como se fosse atual.
**Onde na prática:** marco 03.

### Encapsular × substituir
**Em uma frase:** pôr API moderna na frente do legado sem tocar o interior, versus trocar o sistema gradualmente.
**No fin-platform:** a escolha entre as duas estratégias para cada parte do `fake-core` a modernizar.
**Erro comum:** escolher substituir sem medir se o esforço do projeto maior realmente se paga frente a encapsular.
**Onde na prática:** marco 03.

## Decisão

### TCO (custo total de propriedade)
**Em uma frase:** licença mais implantação, integração, operação, treinamento e custo de saída.
**No fin-platform:** `decisoes/tco.go`, com três cenários (construir, comprar, híbrido) ao longo de 5 anos.
**Erro comum:** comparar só o preço da licença contra o custo de desenvolvimento, ignorando operação e saída.
**Onde na prática:** marco 04.

### Aprisionamento (vendor lock-in)
**Em uma frase:** a dificuldade, medida, de trocar de fornecedor depois de adotar uma solução.
**No fin-platform:** o custo de sair do `FornecedorA` (fictício), incluído no modelo de TCO.
**Erro comum:** estimar o custo de saída de memória, em vez de medir com número real.
**Onde na prática:** marco 04.

### Análise de sensibilidade
**Em uma frase:** lista os parâmetros que, variados numa faixa razoável, fariam a decisão inverter.
**No fin-platform:** o relatório que mostra que a decisão de construir × comprar inverte acima de um certo volume.
**Erro comum:** apresentar um número único de conclusão, escondendo onde a decisão é frágil.
**Onde na prática:** marco 04.

### Pontuação ponderada
**Em uma frase:** critérios com pesos e notas por opção — vulnerável a ter o peso escolhido depois de saber a favorita.
**No fin-platform:** os pesos definidos antes de pontuar, registrados de forma verificável.
**Erro comum:** ajustar o peso até o resultado "objetivo" bater com a conclusão que já estava decidida.
**Onde na prática:** marco 04.

## Nuvem

### Zona de pouso (landing zone)
**Em uma frase:** a estrutura de contas, identidade, rede e política que existe antes de qualquer serviço rodar.
**No fin-platform:** a fundação organizacional que `nuvem/` modela antes de qualquer recurso declarativo.
**Erro comum:** criar recursos ad-hoc e organizar a estrutura depois, em vez de planejá-la primeiro.
**Onde na prática:** marco 05.

### Raio de explosão (conta de nuvem)
**Em uma frase:** o alcance de um erro de configuração ou credencial comprometida, limitado por separação de contas.
**No fin-platform:** produção e desenvolvimento em contas separadas, sem confiança implícita entre elas.
**Erro comum:** usar a mesma conta para produção e desenvolvimento "para simplificar", ampliando o alcance de qualquer erro.
**Onde na prática:** marco 05.

### Política como código (nuvem)
**Em uma frase:** negar por padrão, com exceção explícita e sempre com prazo.
**No fin-platform:** as três políticas de `nuvem/`, cada uma com fixture que a viola e uma que a satisfaz.
**Erro comum:** permitir por padrão e auditar depois, descobrindo a violação só retroativamente.
**Onde na prática:** marco 05.

### Estratégia de saída (serviço gerenciado)
**Em uma frase:** substituto identificado e exportação de dados validada para todo serviço gerenciado adotado.
**No fin-platform:** o inventário de saída do marco 05, com exportação testada, não assumida.
**Erro comum:** não ter resposta para "e se precisarmos sair desse serviço amanhã?" até o dia em que a pergunta se torna urgente.
**Onde na prática:** marco 05.

## Governança

### Processo de aconselhamento
**Em uma frase:** distribui o direito de decidir para quem está mais próximo do problema, com obrigação de consultar.
**No fin-platform:** o modelo que evita o comitê central virar gargalo de decisões de arquitetura.
**Erro comum:** confundir aconselhamento com ausência de processo — a obrigação de consultar continua existindo.
**Onde na prática:** marco 06.

### Paved road / golden path
**Em uma frase:** um modelo de serviço que já nasce conforme — CI, observabilidade, segurança, estrutura embutidos.
**No fin-platform:** o modelo verificado neste marco; construído pela trilha `entrega-continua-e-devops`.
**Erro comum:** tratar o paved road como opcional, deixando cada time reconstruir a conformidade manualmente.
**Onde na prática:** marco 06.

### Exceção com prazo
**Em uma frase:** uma exceção de governança sempre tem dono e data de expiração, verificada por relógio.
**No fin-platform:** uma exceção de 90 dias para usar um banco fora do radar, com critério de promoção ou retirada.
**Erro comum:** uma exceção "permanente" que nunca é revisada de novo — o antipadrão da exceção eterna.
**Onde na prática:** marco 06.

### Radar tecnológico
**Em uma frase:** anéis (adotar, testar, avaliar, segurar) que categorizam tecnologias pela confiança da organização.
**No fin-platform:** `governanca/radar.yaml`, mantido e revisado periodicamente pela própria equipe.
**Erro comum:** copiar um radar de fonte externa e nunca atualizar, até virar documento decorativo.
**Onde na prática:** marco 06.

### Padrão × diretriz
**Em uma frase:** padrão é obrigatório e verificado; diretriz é recomendação forte, sem mecanismo de bloqueio.
**No fin-platform:** regras do paved road são padrão; sugestões de estilo são diretriz.
**Erro comum:** tratar diretriz como padrão (atrito ao ser ignorada legitimamente) ou padrão como diretriz (violação sistemática).
**Onde na prática:** marco 06.

### Conformidade como código
**Em uma frase:** cada controle regulatório relevante mapeia para um mecanismo verificável — gate, teste, política — nunca só um parágrafo de intenção.
**No fin-platform:** o modelo de serviço do paved road, que já nasce passando nas verificações exigidas.
**Erro comum:** documentar o controle em prosa e nunca verificar automaticamente se ele de fato é respeitado.
**Onde na prática:** marco 06.

### Custo da governança
**Em uma frase:** majoritariamente tempo de espera — medido, não assumido como aceitável.
**No fin-platform:** o tempo que um comitê de aprovação síncrona acrescentaria por mudança, calculado explicitamente.
**Erro comum:** não medir esse custo, pagando um preço invisível em espera que só se percebe quando alguém finalmente calcula.
**Onde na prática:** marco 06.

## Evolução

### Estratégia por sistema
**Em uma frase:** manter, hospedar como está, replataformar, refatorar, substituir ou aposentar — decisão explícita por sistema.
**No fin-platform:** `portfolio/modelo.yaml`, com a estratégia de cada sistema declarada, nunca por default.
**Erro comum:** deixar a estratégia implícita, assumida por quem planeja sem decisão documentada.
**Onde na prática:** marco 07.

### Ordem topológica (modernização)
**Em uma frase:** a sequência de modernização que respeita quem consome e quem é consumido no grafo de dependências.
**No fin-platform:** o gerador de roteiro do marco 07, derivado do grafo de capacidades do marco 01.
**Erro comum:** sequenciar por intuição, sem checar sistematicamente as dependências reais entre sistemas.
**Onde na prática:** marco 07.

### Critério de desligamento mensurável
**Em uma frase:** tráfego zero por N dias e consumidores conhecidos e comunicados, nunca "acho que ninguém usa mais".
**No fin-platform:** o critério calculado de um log sintético, que muda de resultado com uma chamada tardia injetada.
**Erro comum:** aposentar um sistema por impressão, sem medir tráfego real nem confirmar com os consumidores.
**Onde na prática:** marco 07.

### Dívida de portfólio
**Em uma frase:** o custo contínuo de manter dois sistemas (antigo e novo) rodando em paralelo durante uma migração.
**No fin-platform:** contabilizado explicitamente no plano de modernização, nunca tratado como detalhe temporário.
**Erro comum:** ignorar esse custo no planejamento, descobrindo-o só quando a fatura ou a confusão operacional já incomodam.
**Onde na prática:** marco 07.

### Ponto de retorno (roteiro de modernização)
**Em uma frase:** até onde, em cada marco do roteiro, é fácil voltar atrás — e a partir de onde já fica caro ou impossível.
**No fin-platform:** declarado em cada marco do `portfolio/modelo.yaml`, junto com o dono daquele marco.
**Erro comum:** executar uma fase sem saber se ainda é possível reverter, descobrindo isso só quando algo dá errado.
**Onde na prática:** marco 07.

## Comunicação

### RFC (documento de decisão)
**Em uma frase:** problema, ≥2 opções, trade-off, recomendação, riscos, partes consultadas, gatilho de reversão.
**No fin-platform:** `rfc/modelo.md`, validado por lint antes de qualquer decisão real ser registrada.
**Erro comum:** um RFC com uma única opção "analisada" — isso é justificativa retroativa, não decisão.
**Onde na prática:** marco 08.

### Pre-mortem
**Em uma frase:** imaginar que o projeto já falhou, e listar por quê, antes de executar.
**No fin-platform:** parte do processo de decisão de uma mudança significativa do `fin-platform`.
**Erro comum:** só perguntar "o que pode dar errado?" diretamente, perdendo riscos que ficam mais fáceis de admitir hipoteticamente.
**Onde na prática:** marco 08.

### Estimativa em faixa
**Em uma frase:** um intervalo com premissa explícita, em vez de um número único que esconde a incerteza real.
**No fin-platform:** "entre 2 e 5 semanas, assumindo que a integração X não precisa de mudança", não "3 semanas".
**Erro comum:** dar um número único, projetando falsa precisão sobre algo genuinamente incerto.
**Onde na prática:** marco 08.

### Revisão arquitetural
**Em uma frase:** escopo, evidência, cenários de qualidade, riscos e não-riscos, recomendações acionáveis.
**No fin-platform:** `make review`, agregando os lints dos marcos 01–08 num relatório único e reproduzível.
**Erro comum:** produzir um relatório de adjetivos ("parece bem arquitetado"), sem riscos com dono e prazo.
**Onde na prática:** marco 09.

### Recomendação acionável
**Em uma frase:** decisão específica, dono, prazo e critério de pronto — os quatro juntos, nunca um sozinho.
**No fin-platform:** "adicionar idempotent receiver, dono: time Y, prazo: fim do trimestre, pronto quando: teste passa".
**Erro comum:** uma observação genérica ("deveríamos melhorar X") sem nenhum dos quatro elementos.
**Onde na prática:** marco 09.
