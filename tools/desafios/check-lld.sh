#!/usr/bin/env bash
# Prova, para cada desafio LLD, que os testes entregues ao leitor FALHAM no
# esqueleto e PASSAM na solução de referência (PLANO jornada de entrevistas,
# critério de aceite do LLD). Uso: tools/desafios/check-lld.sh [desafios-dir]
set -euo pipefail
dir="${1:-aggregator/content/desafios}"
status=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for d in "$dir"/*/; do
  id="$(basename "$d")"
  ref="$d/referencia"
  [ -d "$ref" ] || continue

  if [ -d "$d/go" ]; then
    if (cd "$d/go" && go test -count=1 ./... >/dev/null 2>&1); then
      echo "::error::$id/go: os testes passam no esqueleto (deveriam falhar)"; status=1
    else
      echo "ok   $id/go: testes falham no esqueleto"
    fi
    cp -r "$d/go" "$work/$id-go"
    cp "$ref/go/"*.go "$work/$id-go/"
    if (cd "$work/$id-go" && go test -race -count=1 ./...); then
      echo "ok   $id/go: testes passam na referência (com -race)"
    else
      echo "::error::$id/go: os testes falham na referência"; status=1
    fi
  fi

  if [ -d "$d/java" ]; then
    if (cd "$d/java" && mvn -q -B test >/dev/null 2>&1); then
      echo "::error::$id/java: os testes passam no esqueleto (deveriam falhar)"; status=1
    else
      echo "ok   $id/java: testes falham no esqueleto"
    fi
    cp -r "$d/java" "$work/$id-java"
    (cd "$ref/java" && find src -name '*.java' -print0) | while IFS= read -r -d '' f; do
      cp "$ref/java/$f" "$work/$id-java/$f"
    done
    if (cd "$work/$id-java" && mvn -q -B test); then
      echo "ok   $id/java: testes passam na referência"
    else
      echo "::error::$id/java: os testes falham na referência"; status=1
    fi
  fi
done
exit "$status"
