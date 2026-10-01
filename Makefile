.PHONY: check agents-check docs-check design-check formal-tools test product-check metrics test-affected test-triage

TEST_RUNS := node --experimental-strip-types tools/ts-checks/src/testing/cli.ts

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
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/realization_nodes.py --root .meta_harness/design $(if $(STALE),--stale "$(STALE)")

formal-tools:
	uv run --locked omne-spec-tools-check

test:
	mkdir -p tmp
	PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest --basetemp=tmp/test-runs

product-check:
	pnpm run check

# 结构度量：只报告，不判失败。BASE 给基线提交或分支，COVERAGE=1 对变更成员跑覆盖率，OUT 改产物目录。
metrics:
	$(if $(COVERAGE),./scripts/with-test-slot.sh) node --experimental-strip-types tools/ts-checks/src/metrics/cli.ts $(if $(BASE),--base "$(BASE)") $(if $(COVERAGE),--coverage) $(if $(OUT),--out "$(OUT)")

# 只跑受这次改动影响的成员的测试（先构建它们及其依赖），并写耗时账本。
# BASE 给基线提交或分支（缺省 main）；PLAN=1 只列出受影响范围，不构建也不运行。
test-affected:
	$(if $(PLAN),,./scripts/with-test-slot.sh) $(TEST_RUNS) run --base "$(or $(BASE),main)" $(if $(PLAN),--plan-only)

# 失败归因：把一次运行里失败的用例逐个单独重跑并分类。RUN 给那次运行打印出来的运行目录。
test-triage:
	./scripts/with-test-slot.sh $(TEST_RUNS) triage --run "$(RUN)"
