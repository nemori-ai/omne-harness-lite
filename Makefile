.PHONY: check agents-check docs-check design-check design-review formal-tools test product-check metrics test-affected test-triage role-eval

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
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/stories.py --root .meta_harness/design

# 设计评审报告：只读、只报告，不判失败。CONTRACT 给一个或几个 <contract_id>/v<N>，FROZEN=1 连已接受契约的产品依据 rev 一起看，FORMAT=json 输出 JSON。
design-review:
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/design_review.py --root .meta_harness/design $(foreach c,$(CONTRACT),--contract "$(c)") $(if $(FROZEN),--include-frozen) $(if $(FORMAT),--format "$(FORMAT)")

# 角色评估：ARGS 给子命令与参数，如 ARGS="verify .meta_harness/agents/evaluation/suites/design-review-expression"。
# verify、inputs、grade、summary、report 不调用模型；run 是付费的一步，用例与判定方法都签过字才肯跑。
role-eval:
	PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.meta_harness/agents/evaluation/harness uv run --locked python -m roleeval $(ARGS)

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
