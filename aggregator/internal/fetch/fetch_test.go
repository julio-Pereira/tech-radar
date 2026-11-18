package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/julio-pereira/tech-radar/internal/model"
	"github.com/julio-pereira/tech-radar/internal/normalize"
)

func servir(t *testing.T, status int, corpo []byte) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ua := r.Header.Get("User-Agent"); ua != "tech-radar-teste" {
			t.Errorf("User-Agent = %q", ua)
		}
		w.WriteHeader(status)
		_, _ = w.Write(corpo)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// O feed malicioso de ponta a ponta: fetch, filtro e normalização. Só o item legítimo e o de entidades
// quebradas (link e data válidos) passam, e os dois como texto puro.
func TestFeedMaliciosoPontaAPonta(t *testing.T) {
	xml, err := os.ReadFile("../../testdata/feed-malicioso.xml")
	if err != nil {
		t.Fatal(err)
	}
	srv := servir(t, http.StatusOK, xml)
	src := model.Source{ID: "mal", Name: "Mal", URL: srv.URL, AllowedHosts: []string{"radar.exemplo.com.br"}}

	r := FetchSource(context.Background(), srv.Client(), "tech-radar-teste", src)
	if r.Err != nil {
		t.Fatal(r.Err)
	}
	if len(r.Items) != 12 { // o fetch lê todos; quem descarta é o filtro
		t.Fatalf("itens lidos: %d, quer 12", len(r.Items))
	}

	agora := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)
	kept, dropped := normalize.Filter(src, r.Items, agora)
	out := normalize.Process(kept, 20, 200)

	var urls []string
	for _, it := range out {
		urls = append(urls, it.URL)
	}
	want := []string{"https://radar.exemplo.com.br/artigo-bom", "https://radar.exemplo.com.br/entidades"}
	if strings.Join(urls, " ") != strings.Join(want, " ") {
		t.Fatalf("itens publicados = %v, quer %v (descartados: %v)", urls, want, dropped)
	}
	if len(dropped) != len(r.Items)-2 {
		t.Fatalf("descartados = %d de %d", len(dropped), len(r.Items))
	}
	for _, it := range out {
		for campo, v := range map[string]string{"title": it.Title, "summary": it.Summary} {
			low := strings.ToLower(v)
			if strings.Contains(low, "<script") || strings.Contains(low, "onerror") || strings.Contains(low, "<img") {
				t.Errorf("%s de %s ainda tem marcação: %q", campo, it.URL, v)
			}
		}
	}
	if out[0].Title != "Artigo legítimo & útil" || out[0].Summary != "Resumo com negrito e  no meio." {
		t.Errorf("título/resumo = %q / %q", out[0].Title, out[0].Summary)
	}
}

func TestItemSemDataFicaComDataZero(t *testing.T) {
	xml := []byte(`<rss version="2.0"><channel><title>x</title>
<item><title>sem data</title><link>https://radar.exemplo.com.br/a</link></item></channel></rss>`)
	srv := servir(t, http.StatusOK, xml)
	r := FetchSource(context.Background(), srv.Client(), "tech-radar-teste", model.Source{ID: "s", URL: srv.URL})
	if r.Err != nil || len(r.Items) != 1 {
		t.Fatalf("err=%v items=%d", r.Err, len(r.Items))
	}
	if !r.Items[0].PublishedAt.IsZero() {
		t.Fatalf("PublishedAt = %v; um item sem data não pode ganhar a hora do build", r.Items[0].PublishedAt)
	}
}

func TestStatusDiferenteDe200EErro(t *testing.T) {
	srv := servir(t, http.StatusNotFound, []byte("não"))
	r := FetchSource(context.Background(), srv.Client(), "tech-radar-teste", model.Source{ID: "s", URL: srv.URL})
	if r.Err == nil || !strings.Contains(r.Err.Error(), "HTTP 404") {
		t.Fatalf("err = %v", r.Err)
	}
}

func TestCorpoQueNaoEFeedEErro(t *testing.T) {
	srv := servir(t, http.StatusOK, []byte("<html><body>página de login</body></html>"))
	r := FetchSource(context.Background(), srv.Client(), "tech-radar-teste", model.Source{ID: "s", URL: srv.URL})
	if r.Err == nil {
		t.Fatal("uma página HTML no lugar do feed devia falhar no parse")
	}
}
