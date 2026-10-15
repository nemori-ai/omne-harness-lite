.PHONY: check check-plan declarations-check agents-check docs-check docs-inventory delivery-check design-check formal-tools test product-check acceptance metrics test-affected test-tier test-triage mutation role-eval acceptance-lock scenario-status loop-status loop-health

TEST_RUNS := node --experimental-strip-types tools/ts-checks/src/testing/cli.ts

# 整套检查：先算基线（BASELINE，缺省 origin/main 或 main）以来改动的影响面，常驻检查每次都跑，pytest、构建、类型检查、
# 成员测试与验收只跑计划里的；FULL=1 全量。规则在 tools/ts-checks/test-runs.config.json，见 docs/verification.md。
check:
	./scripts/check.sh

# 只算影响面、不跑：判成什么、每一步跑还是跳、选中哪些成员与为什么。BASE 给基线（缺省 BASELINE，再缺省 main），FULL=1 全量。
check-plan:
	$(TEST_RUNS) plan $(if $(BASE),--base "$(BASE)")

# 声明兼容：用 TypeScript 6 读全部成员 dist 里的 `.d.ts`（成员用 TypeScript 7 构建）；只检查已构建的成员，没有 dist 的列出来。
declarations-check:
	pnpm run check:declarations

agents-check:
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output .meta_harness --check
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root . --check

docs-check:
	uv run --locked omne-docs-check

# 只读结构缺项测量；BASE 是独立基线目录，OUT 改输出目录；缺项/未知不拦交付，执行错误返回2。
docs-inventory:
	uv run --locked omne-documentation inventory $(if $(BASE),--base "$(BASE)") --out "$(or $(OUT),tmp/documentation-inventory)" --summary

delivery-check:
	node --experimental-strip-types tools/ts-checks/src/delivery/cli.ts --config "$(or $(CONFIG),docs/engineering/github-delivery.json)" $(if $(CAPTURE),--capture "$(CAPTURE)") $(if $(filter 1,$(LIVE)),--live) $(if $(SAVE_CAPTURE),--save-capture "$(SAVE_CAPTURE)") $(if $(BASE_REPORT),--baseline "$(BASE_REPORT)") $(if $(REPORT),--report "$(REPORT)")

design-check:
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/check_sources.py --root .meta_harness/design --source-root .
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design $(if $(STALE),--stale "$(STALE)")

# 角色评估：ARGS 给子命令与参数，如 ARGS="verify .meta_harness/agents/evaluation/suites/design-review-expression"。
# 子命令都不调用模型：模型由主会话派 subagent 来跑，prepare／record、judge-brief／judge-record 成对围着那一次派发；用例与判定方法都签过字 prepare 才肯备。
role-eval:
	PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.meta_harness/agents/evaluation/harness uv run --locked python -m roleeval $(ARGS)

formal-tools:
	uv run --locked omne-spec-tools-check

test:
	mkdir -p tmp
	PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest --ignore-glob='*.legacy' --basetemp=tmp/test-runs

product-check:
	pnpm run check

# 结构度量：只报告，不判失败。BASE 给基线提交或分支，COVERAGE=1 对变更成员跑覆盖率，OUT 改产物目录。
metrics:
	$(if $(COVERAGE),./scripts/with-test-slot.sh) node --experimental-strip-types tools/ts-checks/src/metrics/cli.ts $(if $(BASE),--base "$(BASE)") $(if $(COVERAGE),--coverage) $(if $(OUT),--out "$(OUT)")

# 回路状态：各项整洁指标的带位、这次变更里要解释的红项、超预算的成员与清理草稿。只在硬线被破时退出 1。
# BASE 给任务基线（缺省不给：只报全仓现状）；SNAPSHOT=1 在干净的提交上追加一条趋势快照；OUT 改产物目录。
# STRICT=1 另判「开着的传感器都有数据」，要求 BASE 与 OUT，产物与草稿只写 OUT、不写快照（make check 用它）。
loop-status:
	node --experimental-strip-types tools/ts-checks/src/loop/cli.ts $(if $(BASE),--base "$(BASE)") $(if $(SNAPSHOT),--snapshot) $(if $(OUT),--out "$(OUT)") $(if $(STRICT),--strict)

# 流程体检页：提交大小、测试耗时与债的走向。只报告。
loop-health:
	node --experimental-strip-types tools/ts-checks/src/loop/health-cli.ts $(if $(OUT),--out "$(OUT)")

# 只跑受这次改动影响的成员的测试（先构建它们及其依赖），并写耗时账本；影响面与 make check 是同一份计划。
# BASE 给基线提交或分支（缺省 main）；TIER 给层（fast、slow、all，缺省 fast）；PLAN=1 只列出受影响范围，不构建也不运行。
test-affected:
	$(if $(PLAN),,./scripts/with-test-slot.sh) $(TEST_RUNS) run $(if $(BASE),--base "$(BASE)",--default-base) $(if $(TIER),--tier "$(TIER)") $(if $(PLAN),--plan-only)

# 全部成员的某一层（先构建）：TIER=slow 跑全量慢层，TIER=fast 量快层全量，TIER=all 同 pnpm run test。
test-tier:
	$(if $(TIER),,$(error 给 TIER=fast、slow 或 all))
	./scripts/with-test-slot.sh $(TEST_RUNS) run --all --tier "$(TIER)" --build

# 可执行验收：跑每个带 acceptance 脚本的成员的验收，与测试同一个运行器、同一份并行度，账本写进主检出的 tmp/acceptance-ledger/。
# 验收驱动构建出来的 dist/：缺省先构建这些成员及其依赖，NO_BUILD=1 跳过（调用方已构建过）。make check 不用它，按计划跑自己的一步。
acceptance:
	./scripts/with-test-slot.sh $(TEST_RUNS) run --all --script acceptance $(if $(NO_BUILD),,--build)

# 差分变异（只报告）：变异 BASE（缺省 main）以来改动碰到的产品源码行，或 MEMBERS=<成员目录,…> 的全部产品源码；
# 逐成员跑 Stryker 的快层，列出存活与无覆盖的变异体，读数写进主检出的 tmp/mutation-ledger/。PLAN=1 只列范围。
mutation:
	$(if $(PLAN),,./scripts/with-test-slot.sh) node --experimental-strip-types tools/ts-checks/src/mutation/cli.ts run $(if $(MEMBERS),--members "$(MEMBERS)",$(if $(BASE),--base "$(BASE)",--default-base)) $(if $(PLAN),--plan-only)

# 失败归因：把一次运行里失败的用例逐个单独重跑并分类。RUN 给那次运行打印出来的运行目录（测试或验收的都行）。
test-triage:
	./scripts/with-test-slot.sh $(TEST_RUNS) triage --run "$(RUN)"

# 验收锁：列出任务基线以来碰过各成员 acceptance/ 的提交；实施角色的提交或未提交的验收改动在其中就退出 1。BASE 给任务基线（缺省 main）。
acceptance-lock:
	node --experimental-strip-types tools/ts-checks/src/acceptance/cli.ts $(if $(BASE),--base "$(BASE)",--default-base)

# 场景状态分开报告覆盖声明、执行和接受；未知保留未知。只读、只报告。
scenario-status:
	node --experimental-strip-types tools/ts-checks/src/acceptance/scenario-status-cli.ts
