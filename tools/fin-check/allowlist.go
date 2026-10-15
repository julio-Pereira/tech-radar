package main

import "regexp"

// The manifest is published data from a public repo (the tech-radar
// aggregator), not something the reader wrote — fin-check must not trust
// its "check" strings as arbitrary shell commands. Only "exists" (a plain
// os.Stat, never executed) and these two patterns are allowed; anything
// else is refused before it ever reaches exec.Command. No shell is
// involved in running an allowed command either (see check.go), so even a
// pattern match can't smuggle a second command via "; " or "&&".
var allowlistPatterns = []*regexp.Regexp{
	regexp.MustCompile(`^go test \./\.\.\.$`),
	regexp.MustCompile(`^make [a-zA-Z0-9_-]+$`),
}

func isAllowlisted(check string) bool {
	if check == "exists" {
		return true
	}
	for _, p := range allowlistPatterns {
		if p.MatchString(check) {
			return true
		}
	}
	return false
}
