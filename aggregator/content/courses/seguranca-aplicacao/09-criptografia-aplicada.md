---
id: criptografia-aplicada
title: "Criptografia aplicada sem inventar nada"
summary: "AEAD como padrão, o desastre silencioso do nonce repetido, hash de senha lento por design, e por que comparar assinatura com `==` é uma vulnerabilidade, não um detalhe de estilo."
estimatedMinutes: 55
references:
  - title: "OWASP Cryptographic Storage Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
  - title: "OWASP Password Storage Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
  - title: "NIST SP 800-38D — GCM Mode"
    url: https://csrc.nist.gov/pubs/sp/800/38/d/final
---

## O que escolher, e por quê

A regra de ouro deste marco cabe numa frase: **não invente**. As primitivas certas já
existem, são revisadas publicamente há décadas, e o trabalho de engenharia é escolher e
usar corretamente, não desenhar algo novo. Para cifrar dado, o padrão é **AEAD**
(Authenticated Encryption with Associated Data) — **AES-GCM** ou **ChaCha20-Poly1305** —
que entrega confidencialidade e integridade no mesmo pacote. O detalhe que decide entre
"seguro" e "quebrado" é o **nonce**: em GCM, **reusar o mesmo nonce com a mesma chave
duas vezes é um desastre silencioso** — não gera erro, não trava, apenas permite recuperar
informação sobre o texto claro e, em casos piores, forjar mensagens. Não existe alarme; só
existe a matemática quebrando sem avisar. Modos antigos saem da mesa por razões diferentes:
**ECB** é piada de segurança (padrões do texto claro aparecem no texto cifrado, visível a
olho nu em qualquer imagem cifrada com ECB) e **CBC sem MAC** deixa o texto cifrado
maleável — alterável sem detecção, porque cifrar não é o mesmo que autenticar.

Uma segunda distinção que erra com frequência: **assinatura (ECDSA, EdDSA) × MAC (HMAC)**.
Assinatura usa par de chaves — **prova origem para qualquer terceiro** que tenha a chave
pública, sem que esse terceiro precise ser confiável com segredo. MAC usa chave simétrica
— **só prova algo para quem já possui o mesmo segredo**. Escolher MAC onde se precisava de
assinatura quebra exatamente a propriedade de **não repúdio** que o marco 15 depende de o
sistema garantir: um MAC não convence um árbitro externo, porque o verificador também
poderia ter forjado a mensagem com o mesmo segredo.

## Hash de senha é outro problema, com outra resposta certa

Hash de senha não é "criptografia mais uma vez" — é um problema com propriedades opostas.
**Argon2id** ou **bcrypt**, não SHA-256: a característica desejável aqui é ser **lento e
caro computacionalmente**, de propósito, porque isso é o que torna força bruta offline
impraticável. "Rápido" é o **defeito**, não a qualidade, quando o objetivo é hash de
senha — o oposto exato do que se quer de uma função de hash genérica. **Salt** (valor
aleatório único por senha, armazenado junto ao hash) impede que a mesma senha produza o
mesmo hash em contas diferentes, derrotando rainbow tables. **Pepper** (um segredo
adicional, não armazenado junto ao hash, guardado separadamente) compra proteção **apenas**
se o banco de dados vazar sem o pepper junto — o que, na prática, exige que ele more num
cofre de verdade, não numa variável de ambiente ao lado do resto.

## Aleatoriedade: `SecureRandom` × `Random`

`java.util.Random` (e equivalentes previsíveis em outras linguagens) é um gerador
**determinístico** a partir de uma semente — adequado para simulação, inadequado para
qualquer coisa de segurança. `SecureRandom` usa uma fonte de entropia criptograficamente
segura. O erro clássico é o **token de recuperação de senha gerado com `Random`** —
previsível o bastante para um atacante reconstruir, dado tempo e algumas amostras.

Outro exemplo, mais sutil: uma **chave de idempotência gerada a partir do relógio** (em
vez de aleatoriedade suficiente) reduz o espaço de valores possíveis e facilita colisão ou
previsão — *reencontro* de `spring-boot/06`, que trata idempotência como contrato de API, e
da discussão UUIDv4 × UUIDv7 de `dados-distribuidos/10`. O ponto de contraste importa: lá,
o critério para preferir UUIDv7 era **desempenho de índice** (ordenação temporal reduz
fragmentação); aqui, para chave de idempotência ou token, o critério é
**imprevisibilidade** — a mesma decisão de design (qual identificador usar) pode ter
critérios que **conflitam** dependendo do que o identificador precisa proteger.

## Comparação em tempo constante

Comparar dois valores secretos — uma assinatura calculada contra a recebida, um HMAC, um
hash — com o operador `==` ou `.equals()` padrão tem uma propriedade indesejada: a
comparação **para no primeiro byte diferente**, e isso faz o tempo de execução variar de
forma mensurável com o número de bytes corretos no início. Um atacante com acesso a medir
o tempo de resposta, byte a byte, com paciência estatística, **reconstrói a assinatura
correta sem nunca vê-la**. A correção é comparação em **tempo constante**
(`MessageDigest.isEqual` em Java, ou equivalente), que sempre compara todos os bytes,
independentemente de onde a primeira diferença ocorre.

## Envelope encryption (DEK/KEK)

**Envelope encryption** separa duas chaves com papéis diferentes: a **DEK** (Data
Encryption Key) cifra o dado propriamente dito, e a **KEK** (Key Encryption Key) cifra a
DEK. A DEK cifrada é armazenada **junto** ao dado; a KEK mora no cofre, nunca no mesmo
lugar que o dado. *Reencontro* de `dados-distribuidos/13` (onde o padrão aparece do lado do
armazenamento) e do crypto-shredding de `kafka/13` (apagar a DEK torna o dado
irrecuperável, sem tocar no dado em si). Aqui o foco é diferente: **o código que cifra** —
quem no serviço chama a operação de cifragem, em que momento a DEK é gerada (por registro?
por lote? reutilizada?), e a disciplina de nunca deixar a DEK em claro fora da memória do
processo que a usa.

## Cripto-agilidade e pós-quântico

**Cripto-agilidade** é a capacidade de trocar um algoritmo criptográfico por outro sem
reescrever o sistema — o que exige, como pré-requisito, um **inventário criptográfico**:
saber, hoje, quais algoritmos e tamanhos de chave estão em uso, onde, e há quanto tempo. É
decisão de engenharia **hoje**, não daqui a cinco anos: o dia em que um algoritmo precisar
ser trocado (por vulnerabilidade descoberta, por exigência regulatória, por avanço de
computação quântica) é tarde demais para começar a mapear onde ele está espalhado. O que
ainda é hype, para a maioria das fintechs: migrar já para algoritmo pós-quântico em
produção. O inventário e a capacidade de trocar são a parte que vale investir agora; a
migração em si é decisão para quando o padrão amadurecer.

## Exemplo numa fintech

Um HMAC de webhook do PSP, verificado com `.equals()` em vez de comparação em tempo
constante, e sem janela de replay implementada, tem duas falhas simultâneas: a assinatura
é reconstruível por timing, e mesmo uma assinatura genuína capturada uma vez pode ser
reenviada indefinidamente para creditar a mesma conta repetidamente. **Qualquer uma das
duas falhas sozinha já é grave**; numa fintech, o par junto significa que "verificamos a
assinatura do webhook" não protege quase nada na prática.

## Hands-on

**Desafio — verificação de webhook resistente a replay e a timing.** Implemente a
verificação de assinatura HMAC de um webhook do PSP com três camadas: (1) **janela de
timestamp** — rejeitar requisições fora de uma janela curta declarada (por exemplo, 5
minutos); (2) **`jti` persistido** — um identificador único por requisição, verificado
contra um registro do que já foi processado, para rejeitar reenvio dentro da janela; (3)
**comparação em tempo constante** para a assinatura.

**Invariantes testáveis**

1. Uma requisição idêntica, replicada (mesmo corpo, mesma assinatura, mesmo `jti`), é
   rejeitada na segunda tentativa.
2. Um corpo adulterado, mesmo com o `jti` e o timestamp originais, é rejeitado — a
   assinatura não confere mais.
3. Rode 1.000 amostras medindo o tempo de resposta para assinatura válida e para
   assinatura inválida (mudando um único byte): a diferença média não deve ser
   estatisticamente distinguível.
4. A janela de timestamp é configurável e testada nos dois limites (dentro e fora dela).

**Complemento.** Gere dois tokens de recuperação de senha usando `Random`/`Math.random()`
com a mesma semente (ou seed derivada do relógio do sistema) e demonstre que são
previsíveis o bastante para serem reproduzidos. Repita com `SecureRandom` e compare.

**Checagem**

1. Por que reusar um nonce em AES-GCM é um problema silencioso, e não um erro que aparece
   em teste?
2. Por que Argon2id/bcrypt são escolhas melhores que SHA-256 para hash de senha, apesar de
   SHA-256 ser criptograficamente mais "forte" em outros contextos?
3. O que a comparação em tempo constante evita especificamente, e o que um atacante
   consegue reconstruir sem ela?
4. Qual é a diferença de papel entre a DEK e a KEK no envelope encryption?

## Principais aprendizados

- AEAD (AES-GCM, ChaCha20-Poly1305) é o padrão para cifrar; o nonce repetido em GCM é um
  desastre silencioso, e ECB e CBC sem MAC estão fora de cogitação.
- Assinatura prova origem para terceiros; MAC só prova para quem já tem o segredo —
  confundir os dois quebra a propriedade de não repúdio.
- Hash de senha precisa ser lento por design (Argon2id/bcrypt); "rápido" é o defeito, não
  a qualidade, ao contrário de quase todo outro uso de hash.
- Comparação em tempo constante não é estilo — sem ela, uma assinatura é reconstruível
  byte a byte por quem consegue medir tempo de resposta.
- Envelope encryption separa DEK (cifra o dado) de KEK (cifra a DEK, mora no cofre); o
  foco deste marco é o código que cifra, não onde o dado fica guardado.
