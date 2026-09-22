.PHONY: check agents-check docs-check design-check formal-tools test product-check

check:
	./scripts/check.sh

agents-check:
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output .meta_harness --check
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root . --check

docs-check:
	uv run --locked omne-docs-check

design-check:
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal $(or $(FORMAL),registered) $(if $(GATE),--gate "$(GATE)") $(if $(PREVIOUS_FROZEN),--previous-frozen "$(PREVIOUS_FROZEN)")
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design $(if $(STALE),--stale "$(STALE)")

formal-tools:
	uv run --locked omne-spec-tools-check

test:
	mkdir -p tmp
	PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest --basetemp=tmp/test-runs

product-check:
	pnpm run check
