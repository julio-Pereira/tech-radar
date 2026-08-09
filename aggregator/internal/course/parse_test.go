package course

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeTemp writes content to a temp file and returns its path.
func writeTemp(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

func TestParseQuiz(t *testing.T) {
	tests := []struct {
		name    string
		yaml    string
		wantErr bool
	}{
		{
			name: "valid",
			yaml: `questions:
  - question: "acks=1 protege contra perda de mensagem?"
    options: ["Sim", "Não, o líder pode morrer antes de replicar"]
    answer: 1
    explanation: "Só acks=all espera o ISR."
`,
		},
		{
			name:    "answer out of range",
			yaml:    "questions:\n  - question: \"q\"\n    options: [\"a\", \"b\"]\n    answer: 2\n",
			wantErr: true,
		},
		{
			name:    "negative answer",
			yaml:    "questions:\n  - question: \"q\"\n    options: [\"a\", \"b\"]\n    answer: -1\n",
			wantErr: true,
		},
		{
			name:    "single option",
			yaml:    "questions:\n  - question: \"q\"\n    options: [\"a\"]\n    answer: 0\n",
			wantErr: true,
		},
		{
			name:    "empty question text",
			yaml:    "questions:\n  - question: \"\"\n    options: [\"a\", \"b\"]\n    answer: 0\n",
			wantErr: true,
		},
		{
			name:    "no questions",
			yaml:    "questions: []\n",
			wantErr: true,
		},
		{
			name:    "malformed yaml",
			yaml:    "questions: [oops\n",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := writeTemp(t, "x.quiz.yaml", tt.yaml)
			got, err := ParseQuiz(path)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got quiz with %d question(s)", len(got))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != 1 || got[0].Answer != 1 || len(got[0].Options) != 2 {
				t.Fatalf("unexpected parse result: %+v", got)
			}
		})
	}
}

func TestParseQuizMissingFile(t *testing.T) {
	if _, err := ParseQuiz(filepath.Join(t.TempDir(), "absent.quiz.yaml")); err == nil {
		t.Fatal("expected error for missing file")
	}
}

// The glossary has no frontmatter, unlike a milestone — it must render anyway,
// and script tags must not survive sanitization.
func TestParseGlossary(t *testing.T) {
	path := writeTemp(t, "GLOSSARIO.md",
		"### Error budget\n**Em uma frase:** o complemento do SLO.\n\n<script>alert(1)</script>\n")

	html, err := ParseGlossary(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{"<h3", "Error budget", "<strong>"} {
		if !strings.Contains(html, want) {
			t.Errorf("expected %q in rendered glossary, got: %s", want, html)
		}
	}
	if strings.Contains(html, "<script") {
		t.Errorf("script tag survived sanitization: %s", html)
	}
}
