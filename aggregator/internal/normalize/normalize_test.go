package normalize

import (
	"strings"
	"testing"
	"time"

	"github.com/julio-pereira/tech-radar/internal/model"
)

func TestSanitizeViraTextoPuro(t *testing.T) {
	casos := []struct{ entrada, quer string }{
		{"<script>alert(1)</script>Título", "Título"},
		{"R&amp;D &lt;b&gt;", "R&D <b>"}, // entidade de texto vira o caractere, e o texto não volta a ser tag
		{"<b>negrito</b> e <a href=\"javascript:x\">link</a>", "negrito e link"},
		{"<img src=x onerror=alert(1)>depois", "depois"},
		{"&amp;amp &#x; &#99999999;", "&amp &#x; �"},
		{"  espaço  ", "espaço"},
	}
	for _, c := range casos {
		if got := plainText(c.entrada); got != c.quer {
			t.Errorf("plainText(%q) = %q, quer %q", c.entrada, got, c.quer)
		}
	}
}

func TestProcessSanitizaTrunca(t *testing.T) {
	longo := strings.Repeat("á", maxSummaryRunes+50)
	items := Process([]model.FeedItem{{
		ID: "1", URL: "https://x.exemplo.com.br/1", Title: "<i>T</i>", Summary: "<p>" + longo + "</p>",
		Author: "<script>x</script>Ana", PublishedAt: time.Now(),
	}}, 10, 10)
	it := items[0]
	if it.Title != "T" || it.Author != "Ana" {
		t.Fatalf("title=%q author=%q", it.Title, it.Author)
	}
	if n := len([]rune(it.Summary)); n != maxSummaryRunes+1 || !strings.HasSuffix(it.Summary, "…") {
		t.Fatalf("summary com %d runas", n)
	}
}

func TestProcessDeduplicaOrdenaELimita(t *testing.T) {
	t0 := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	in := []model.FeedItem{
		{ID: "a", SourceID: "s", PublishedAt: t0},
		{ID: "a", SourceID: "s", PublishedAt: t0}, // repetido
		{ID: "b", SourceID: "s", PublishedAt: t0.Add(2 * time.Hour)},
		{ID: "c", SourceID: "s", PublishedAt: t0.Add(time.Hour)},
		{ID: "serie", SourceID: "s", Kind: model.KindSeries},
	}
	out := Process(in, 2, 10)
	var ids []string
	for _, it := range out {
		ids = append(ids, it.Title+it.SourceID+it.Kind)
	}
	if len(out) != 3 { // b e c (limite 2 por fonte) + a série, que fura o limite
		t.Fatalf("len=%d: %v", len(out), ids)
	}
	if out[0].PublishedAt != t0.Add(2*time.Hour) || out[2].Kind != model.KindSeries {
		t.Fatalf("ordem errada: %v", out)
	}
}
