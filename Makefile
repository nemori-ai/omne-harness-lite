.PHONY: check docs-check spec-check spec-tools test

check:
	./scripts/check.sh

docs-check:
	uv run --locked omne-docs-check $(if $(BASELINE),--baseline "$(BASELINE)")

spec-check:
	uv run --locked omne-spec-check

spec-tools:
	uv run --locked omne-spec-tools-check

test:
	mkdir -p tmp
	PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest --basetemp=tmp/test-runs
