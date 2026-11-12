Um verbete por termo: definição em uma frase, o exemplo no `fin-azure`, o erro comum associado e o marco
onde o conceito aparece na prática. Conceitos neutros (*envelope encryption*, identidade de *workload* como
conceito, DLQ, idempotência) são verbetes das trilhas donas e não se repetem aqui.

## Governança

### Management group
**Em uma frase:** o nível da hierarquia do Azure acima das assinaturas; política e permissão atribuídas nele herdam para todas as assinaturas e recursos abaixo.
**No fin-azure:** o management group `producao` recebe a iniciativa de guardrails, com localizações permitidas e *tags* obrigatórias.
**Erro comum:** atribuir a política assinatura por assinatura e esquecer a assinatura nova, que nasceu fora da árvore.
**Onde na prática:** marco 01.

## Identidade

### Managed identity
**Em uma frase:** uma identidade do Entra ID (antigo Azure AD) que o próprio Azure gerencia para um recurso, sem segredo para guardar nem rotacionar; existe na forma *system-assigned*, presa ao recurso, e *user-assigned*, independente dele.
**No fin-azure:** o `pix-gateway` no Container Apps usa uma *user-assigned* própria para enviar à fila e ler os seus segredos.
**Erro comum:** compartilhar a mesma identidade entre vários serviços, e com isso somar as permissões de todos em cada um.
**Onde na prática:** marco 02.

### `NotActions`
**Em uma frase:** a lista de ações que uma *role definition* exclui do que ela mesma concede; não é uma negação, e outro papel atribuído ao mesmo principal pode conceder a ação de volta.
**No fin-azure:** o avaliador didático prova o caso "papel A com `NotActions` + papel B que concede = permitido".
**Erro comum:** usar `NotActions` como se fosse um `Deny`; a negação explícita no Azure é a *deny assignment*.
**Onde na prática:** marco 02.

## Rede

### Private DNS zone
**Em uma frase:** a zona de DNS privada do Azure (como `privatelink.blob.core.windows.net`) que faz o nome público de um serviço resolver para o IP do Private Endpoint, nas VNets vinculadas a ela.
**No fin-azure:** a zona `privatelink` de cada serviço fica no *hub* e é vinculada a toda VNet que consome o serviço.
**Erro comum:** criar o Private Endpoint e esquecer a zona ou o vínculo; o nome continua resolvendo para o IP público, e o tráfego sai pela internet, sem erro.
**Onde na prática:** marco 03.
