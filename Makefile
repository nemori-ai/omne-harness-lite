.PHONY: check docs-check spec-check spec-tools test product-check

check:
	./scripts/check.sh

docs-check:
	uv run --locked omne-docs-check $(if $(BASELINE),--baseline "$(BASELINE)")

spec-check:
	uv run --locked omne-spec-check $(if $(FORMAL),--formal "$(FORMAL)") $(if $(BASELINE),--baseline "$(BASELINE)")

spec-tools:
	uv run --locked omne-spec-tools-check

test:
	mkdir -p tmp
	PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest --basetemp=tmp/test-runs

product-check:
	pnpm run check
