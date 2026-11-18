# Segurança do Tech Radar

O Tech Radar é um site estático no GitHub Pages: sem *backend*, sem login, sem dado pessoal coletado. O
progresso de quem estuda fica só no navegador (`localStorage`). O que este documento protege é a
**integridade do que o site mostra**: que ninguém além do mantenedor altere o site, publique no nome dele ou
use o feed para exibir conteúdo malicioso.

## Como reportar uma vulnerabilidade

Use o **reporte privado** do GitHub: aba **Security** do repositório → **Report a vulnerability**. O relato
fica visível só para o mantenedor até a correção. Não abra *issue* pública para uma vulnerabilidade.

Inclua o que for possível: a rota ou o arquivo afetado, os passos para reproduzir e o impacto que você vê.
Não há programa de recompensa.

### Escopo

Dentro do escopo:

- execução de *script* ou injeção de HTML no site (pelo feed, pelas trilhas ou pela URL);
- link do feed ou das trilhas que leve a destino diferente do exibido, ou a esquema perigoso
  (`javascript:`, `data:`);
- caminhos para alterar o site sem passar pela revisão: *workflow*, *action* de terceiros, artefato de
  *deploy*;
- credencial exposta no repositório ou no histórico.

Fora do escopo:

- *clickjacking* e cabeçalhos HTTP que o GitHub Pages não permite configurar (ver "Limitações aceitas");
- o conteúdo dos sites externos para os quais o radar aponta: o radar só referencia por link;
- ataques que exigem acesso prévio à conta do mantenedor ou ao navegador de quem lê.

## Controles do repositório

Estes controles são configurados na interface do GitHub pelo mantenedor, e não ficam no código. A tabela
diz o que deve estar ligado; o estado de cada um está na auditoria
(`web/docs/AUDITORIA-hardening-divulgacao.md`).

| Onde | O quê |
| --- | --- |
| Conta | 2FA ligado, de preferência com *passkey* ou chave de segurança |
| Conta → Emails | "Keep my email address private" e "Block command line pushes that expose my email" |
| *Settings → Rules → Rulesets* (`main`) | PR obrigatório; *status checks* obrigatórios; bloqueio de *force push* e de deleção |
| *Settings → Actions → General* | aprovação obrigatória para *workflows* de colaboradores de fora; `GITHUB_TOKEN` padrão só leitura |
| *Settings → Code security* | *secret scanning* com *push protection*; alertas do Dependabot; reporte privado de vulnerabilidade |
| *Settings → Pages* | origem "GitHub Actions"; "Enforce HTTPS" |
| *Settings → Environments → github-pages* | *deploy* só a partir da `main` |

**Os *status checks* obrigatórios** são os nomes dos *jobs*, e não dos *workflows*: `lint` (*workflow*
"Lint") e `e2e` (*workflow* "Web UI tests"), os dois que rodam em todo PR. O `lld` roda só quando um desafio
muda: se for obrigatório, um PR que não mexe em desafio fica esperando um *check* que nunca chega. O `build`
roda só depois do *merge*, e o *deploy* espera o `build`, o `lint` e o `e2e` rodarem de novo no mesmo
*commit*.

**O `CODEOWNERS` e a revisão obrigatória.** O `.github/CODEOWNERS` faz o GitHub pedir a revisão do mantenedor
em todo PR. Com um mantenedor só, **não** marque "Require review from Code Owners" nem um número mínimo de
aprovações: o autor não aprova o próprio PR, e nada seria mergeado. O ganho de segurança vem do PR
obrigatório com os *checks* verdes e de ninguém mais ter permissão de escrita.

## Varredura de segredos

O histórico inteiro, com todas as *branches*, é varrido com o [gitleaks](https://github.com/gitleaks/gitleaks).
O `.gitleaks.toml` mantém as regras padrão e só abre exceção para textos didáticos das trilhas que parecem
credencial; cada exceção está explicada no arquivo. Se uma varredura achar uma credencial real, a ordem é:
**revogar primeiro**, depois limpar o histórico. Reescrever o histórico sem revogar não adianta, porque o
segredo já foi copiado por quem clonou.

## Limitações aceitas

- **Sem `frame-ancestors` nem `X-Frame-Options`.** O GitHub Pages não permite cabeçalhos próprios, e a
  diretiva `frame-ancestors` não vale em `<meta>`. O risco de *clickjacking* é baixo: o site não tem ação
  que mude estado no servidor.
- **Sem HSTS próprio e sem `Permissions-Policy`**, pelo mesmo motivo. O GitHub Pages já força HTTPS.
- **Domínio:** o site fica em `julio-pereira.github.io/tech-radar`, sem domínio próprio, e por isso não há
  DNS a proteger contra *subdomain takeover*. Se um domínio próprio entrar, ele precisa ser verificado na
  conta, e o DNS precisa sair no mesmo dia em que o Pages for desligado.

O caminho, se algum desses virar requisito, é pôr um CDN (por exemplo, a Cloudflare) na frente do Pages, para
controlar os cabeçalhos.
