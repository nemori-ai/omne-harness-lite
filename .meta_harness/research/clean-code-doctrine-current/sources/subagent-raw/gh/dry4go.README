# dry4go

dry4go finds candidate duplicate Go code across files and directories. It reports fuzzy structural matches by filename and line range so another mechanism can evaluate and reduce duplication.

## Overview

dry4go compares Go functions and methods by converting each function body and
signature shape into normalized syntax nodes. The normalized tree is walked to
collect a set of structural fingerprints, one for the whole function and one for
each nested syntax node.

Similarity is Jaccard similarity over those fingerprint sets:

```text
score = shared fingerprints / all fingerprints seen in either function
```

A score of `1.0` means the normalized structures have the same fingerprint set.
Lower scores mean the functions still share structure, but each function also
has structure the other does not. The default `--threshold 0.82` reports
candidates whose normalized structures are close enough to be worth review.

Go differs from Clojure in important ways, so dry4go treats functions and
methods as the comparison units and uses Go's parser/AST instead of textual
forms. Identifiers, local names, selector names, and literal values normalize
away. Structural Go syntax is preserved, including:

- function and method shape
- parameter and result type structure
- blocks and statement order
- `if`, `for`, `range`, `switch`, `select`
- assignments, returns, calls, selectors, indexing, slicing
- composite literals, map/array/struct/function types
- operators such as `+`, `==`, `&&`, and `||`

For example, these functions can match strongly even though their names, local
variables, predicates, and field names differ:

```go
func Alpha(xs []int) []int {
	var ys []int
	for _, x := range xs {
		if x%2 == 1 {
			ys = append(ys, x+1)
		}
	}
	return ys
}

func Beta(items []int) []int {
	var kept []int
	for _, item := range items {
		if item%2 == 0 {
			kept = append(kept, item+1)
		}
	}
	return kept
}
```

## Usage

```bash
dry4go [options] [file-or-directory ...]
```

Options:

```text
--threshold N   Minimum structural similarity score, default 0.82
--min-lines N   Minimum source lines in a candidate function, default 4
--min-nodes N   Minimum normalized syntax nodes, default 20
--format F      text or json, default text
--json          Same as --format json
--text          Same as --format text
```

Examples:

```bash
dry4go .
dry4go internal/foo/foo.go internal/bar/bar.go
dry4go --json --threshold 0.9 ./internal ./cmd
```

Every file named on the command line participates in the same duplication
search. When an argument is a directory, dry4go recursively includes every
`.go` file under that directory in the same search set, skipping `.git`,
`vendor`, and `target` directories.

Default text output is intended for quick reading:

```text
DUPLICATE score=0.89
  internal/billing/invoice.go:12-25
  internal/billing/receipt.go:30-44
```

JSON output is intended for tools:

```json
{
  "candidates": [
    {
      "score": 0.8909090909090909,
      "left": {"file": "internal/billing/invoice.go", "start_line": 12, "end_line": 25},
      "right": {"file": "internal/billing/receipt.go", "start_line": 30, "end_line": 44},
      "left_nodes": 88,
      "right_nodes": 91
    }
  ]
}
```

## Development

```bash
go test ./...
go run ./cmd/dry4go --help
go run ./cmd/dry4go --threshold 0.75 .
```

## License

Copyright (c) Robert C. Martin. All rights reserved.
