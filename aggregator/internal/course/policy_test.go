package course

import (
	"strings"
	"testing"
)

// A política do corpo das trilhas aceita HTML (é o único campo que aceita); o hardening antes da
// divulgação (Fase 3) exige que ela recuse o que pode executar código, enquadrar outra página, enviar
// formulário ou carregar recurso de fora sem controle.
func TestPoliticaDoCorpoRecusaOPerigoso(t *testing.T) {
	p := newBodyPolicy()
	casos := []struct{ entrada, proibido string }{
		{`<iframe src="https://evil.example"></iframe>`, "<iframe"},
		{`<p style="position:fixed;top:0">x</p>`, "style="},
		{`<style>body{display:none}</style>`, "<style"},
		{`<a href="https://x.example" onclick="alert(1)">x</a>`, "onclick"},
		{`<img src="https://x.example/a.png" onerror="alert(1)">`, "onerror"},
		{`<form action="https://evil.example"><input name="senha"></form>`, "<form"},
		{`<form action="https://evil.example"><input name="senha"></form>`, "<input"},
		{`<object data="https://evil.example/x.swf"></object>`, "<object"},
		{`<embed src="https://evil.example/x.swf">`, "<embed"},
		{`<img src="https://x.example/a.png" srcset="https://evil.example/b.png 2x">`, "srcset"},
		{`<a href="javascript:alert(1)">x</a>`, "javascript:"},
		{`<a href="data:text/html,<script>alert(1)</script>">x</a>`, "data:"},
		{`<script>alert(1)</script>`, "<script"},
		{`<svg><script>alert(1)</script></svg>`, "<script"},
		{`<base href="https://evil.example/">`, "<base"},
		{`<meta http-equiv="refresh" content="0;url=https://evil.example">`, "<meta"},
	}
	for _, c := range casos {
		if got := p.Sanitize(c.entrada); strings.Contains(strings.ToLower(got), c.proibido) {
			t.Errorf("Sanitize(%q) = %q: ainda tem %q", c.entrada, got, c.proibido)
		}
	}
}

func TestLinkExternoDoCorpoSaiComRelCompleto(t *testing.T) {
	got := newBodyPolicy().Sanitize(`<a href="https://exemplo.com.br/x">x</a> <a href="#/learn/a/b">interno</a>`)
	for _, quer := range []string{`target="_blank"`, "nofollow", "noreferrer", "noopener"} {
		if !strings.Contains(got, quer) {
			t.Errorf("link externo sem %s: %q", quer, got)
		}
	}
	if strings.Count(got, "_blank") != 1 {
		t.Errorf("o link interno também ganhou target: %q", got)
	}
}
