.PHONY: docs-check spec-check spec-tools test

docs-check:
	uv run python spec/tools/check_docs.py

spec-check:
	uv run python spec/tools/check_specs.py

spec-tools:
	$(MAKE) -C spec check-tools

test:
	uv run pytest
