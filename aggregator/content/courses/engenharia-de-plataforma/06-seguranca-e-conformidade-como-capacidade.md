---
id: seguranca-como-capacidade
title: "Segurança e conformidade como capacidade"
summary: "Se a segurança depende de cada time lembrar, ela falha; se vem de graça no caminho pavimentado, ela é o padrão — e a plataforma, por concentrar poder, é o alvo que mais precisa dela."
estimatedMinutes: 60
completion: quiz
references:
  - title: "Open Policy Agent — documentation"
    url: https://www.openpolicyagent.org/docs/
---

## Defaults seguros, não checklist de lembrar

Segurança que depende de cada equipe lembrar de configurar algo corretamente **falha** — alguém,
algum dia, vai esquecer. Segurança que vem **de graça** no *golden path* (marco 04), como *default*,
não como passo extra opcional, é o que realmente escala: **rede *default-deny*** (`kubernetes/11`),
**identidade de workload** e federação (**confira** os mecanismos vigentes), **segredos por
referência** (nunca em texto claro — `kubernetes/03`, `seguranca-aplicacao/10`), **políticas de
admissão** (**confira** ferramentas), e **proveniência/SBOM como porta** de entrada
(`seguranca-aplicacao/12`) — todos embutidos no caminho padrão, não adicionados depois por quem
lembrar.

## Autorização do autosserviço: quem pode pedir o quê, para qual *tenant*

A própria API da plataforma (marco 02) precisa de **autorização**: quem pode pedir o quê, e
especificamente, para qual **tenant** (equipe, ambiente). **Isolamento entre equipes**
(`kubernetes/14`) significa que o time A não deveria conseguir, através da plataforma, criar ou ler
recursos do *tenant* do time B — mesmo que ambos usem a mesma API e os mesmos mecanismos
compartilhados.

## A plataforma como alvo

Por concentrar o poder de criar, modificar e remover recursos em nome de **todas** as equipes, a
plataforma é um dos alvos mais valiosos da organização — quem comprometer o *control plane* da
plataforma ganha, potencialmente, acesso equivalente ao de todas as equipes que a plataforma serve.
Isso exige: **credenciais de menor privilégio** (a conta de serviço da própria plataforma não deveria
ter mais permissão do que ela estritamente precisa, nunca um curinga "para garantir"), consciência
clara do **raio de explosão** se a plataforma for comprometida, proteção do **segredo do *control
plane*** em si (a credencial que a plataforma usa para agir em nome de todos), e **trilha de
auditoria** completa de toda ação.

## Evidência de toda ação

Toda ação da plataforma (criar ambiente, mudar permissão, promover modelo de pipeline) gera
**evidência** — a mesma disciplina de `entrega-continua-e-devops/09` (**trilha planejada**),
aplicada especificamente às ações da própria plataforma, não só às ações de deploy de um serviço.

## Exceção com prazo (de novo)

A mesma disciplina de exceção com dono e prazo, já vista em `arquitetura-de-solucoes/06`
(**trilha planejada**), se aplica aqui a desvios de política de segurança — nunca uma exceção
permanente sem revisão.

## Conformidade como capacidade: o time herda, não reimplementa

Quando a plataforma embute um controle de conformidade no *golden path*, cada equipe que o usa
**herda** esse controle automaticamente — em vez de cada equipe precisar **reimplementar** a mesma
verificação de conformidade de forma independente (e, inevitavelmente, inconsistente entre times).

## Equilíbrio entre guarda-corpo e autonomia

Segurança excessivamente restritiva empurra equipes a contornar a plataforma (criar recursos por
fora, "porque é mais rápido") — o que é **pior** para a segurança geral do que uma restrição um
pouco mais permissiva que as equipes realmente seguem. O equilíbrio certo entre guarda-corpo (o que
é bloqueado) e autonomia (o que pode ser decidido livremente) precisa ser calibrado com atenção a
esse efeito, não maximizado ingenuamente para "o máximo de restrição possível".

## Exemplo numa fintech

Um pedido de ambiente contém, no corpo da requisição, um token de acesso em texto claro — talvez
colado por engano por quem fez o pedido, copiando de outro lugar. A plataforma **rejeita** o pedido
antes de gravar qualquer coisa, porque a varredura de segredo roda **antes** da persistência, não
depois — o token nunca chega a ficar armazenado em lugar nenhum, nem por um instante.

## Hands-on

**Tutorial.** Construa `politicas/` com os *defaults* seguros e a matriz de autorização do
autosserviço.

**Desafio.** Verifique o menor privilégio da própria plataforma, e implemente varredura de
segredos nos pedidos.

**Invariantes testáveis**

1. As **permissões da conta de serviço da plataforma** são **mínimas** — verificado contra uma
   **lista permitida** explícita em teste; **adicionar um curinga** (`*`) a essa lista **reprova**
   o teste.
2. Na matriz de autorização, o **time A não cria nem lê** recursos do *tenant* do time B —
   verificado por teste **exaustivo** da matriz, todas as combinações de time × recurso × ação.
3. Toda ação gera registro **encadeado por hash**, e a **adulteração é detectada** — mesma
   disciplina de `entrega-continua-e-devops/09`, verificada aqui para ações da plataforma.
4. O ambiente gerado tem **rede *default-deny*** — verificado pela inspeção dos manifestos
   gerados, não assumido pela configuração "padrão" do provedor.
5. Um **segredo plantado** deliberadamente num pedido ou num template é **rejeitado** pela
   varredura — antes de qualquer persistência.
6. Uma **exceção sem prazo** é **inválida** — rejeitada na criação, não aceita e corrigida depois.

**Complemento.** Liste o que um atacante ganharia, especificamente, controlando o *control plane*
da plataforma do seu contexto — o raio de explosão real, não hipotético.

**Checagem**

1. Por que segurança que depende de "cada time lembrar" é descrita como fadada a falhar?
2. Por que a plataforma é um dos alvos mais valiosos da organização, especificamente por
   concentrar poder?
3. O que significa "o time herda o controle, não o reimplementa", e por que isso produz
   consistência que reimplementação independente não produz?
4. Por que segurança excessivamente restritiva pode ser pior para a segurança geral do que uma
   restrição um pouco mais permissiva que as equipes de fato seguem?

> **Reencontro — `kubernetes/09`; `kubernetes/10`; `kubernetes/11`; `seguranca-aplicacao/10`;
> `seguranca-aplicacao/12`.** A segurança do workload de `kubernetes/09` é a base técnica sobre a
> qual os *defaults* seguros deste marco se apoiam. RBAC e auditoria de `kubernetes/10` é o
> mecanismo de controle de acesso complementar à autorização do autosserviço aqui descrita. A
> *network policy* de `kubernetes/11` é a implementação concreta de rede *default-deny*. Segredos e
> chaves de `seguranca-aplicacao/10` fundamentam a regra de segredo por referência, nunca em texto
> claro. E a cadeia de suprimentos de `seguranca-aplicacao/12` é onde proveniência e SBOM, tratados
> aqui como porta de entrada, já são ensinados em profundidade.

## Principais aprendizados

- Segurança que depende de cada equipe lembrar falha; segurança embutida de graça no caminho
  padrão é o que realmente escala.
- A plataforma é um dos alvos mais valiosos da organização, porque concentra o poder de agir em
  nome de todas as equipes que ela serve.
- Menor privilégio da própria plataforma, raio de explosão consciente, e trilha de auditoria
  completa são exigências específicas de uma plataforma, não de um serviço comum.
- Conformidade como capacidade significa que cada equipe herda o controle automaticamente, em vez
  de reimplementar a mesma verificação de forma inconsistente entre times.
- Segurança excessivamente restritiva pode empurrar equipes a contornar a plataforma, sendo pior
  para a segurança geral do que uma restrição calibrada que as equipes realmente seguem.
