.PHONY: docs-check spec-check spec-tools test

docs-check:
	uv run --locked python spec/tools/check_docs.py $(if $(BASELINE),--baseline "$(BASELINE)")

spec-check:
	uv run --locked python spec/tools/check_specs.py

spec-tools:
	$(MAKE) -C spec check-tools

test:
	uv run --locked pytest --basetemp=tmp/test-runs
