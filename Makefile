.PHONY: check agents-check docs-check design-check design-review spec-retention formal-tools test product-check acceptance metrics test-affected test-tier test-triage role-eval acceptance-lock card-retire scenario-status loop-status loop-card loop-health

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

# 旧版规格的消费者盘点：只读、只报告，不判失败。CONTRACT 给一个 <contract_id> 只看那一份，FORMAT=json 输出 JSON。
spec-retention:
	PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/spec_retention.py --root .meta_harness/design $(if $(CONTRACT),--contract "$(CONTRACT)") $(if $(FORMAT),--format "$(FORMAT)")

# 角色评估：ARGS 给子命令与参数，如 ARGS="verify .meta_harness/agents/evaluation/suites/design-review-expression"。
# 子命令都不调用模型：模型由主会话派 subagent 来跑，prepare／record、judge-brief／judge-record 成对围着那一次派发；用例与判定方法都签过字 prepare 才肯备。
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

# 回路状态：各项整洁指标的带位、这次变更里要解释的红项、超预算的成员与清理草稿。只在硬线被破时退出 1。
# BASE 给任务基线（缺省不给：只报全仓现状）；SNAPSHOT=1 在干净的提交上追加一条趋势快照；OUT 改产物目录。
# STRICT=1 另判「开着的传感器都有数据」，要求 BASE 与 OUT，产物与草稿只写 OUT、不写快照（make check 用它）。
loop-status:
	node --experimental-strip-types tools/ts-checks/src/loop/cli.ts $(if $(BASE),--base "$(BASE)") $(if $(SNAPSHOT),--snapshot) $(if $(OUT),--out "$(OUT)") $(if $(STRICT),--strict)

# 卡片台账：给一张故事卡记一个时间点。EVENT 是 proposed（提出）、runnable（第一次能跑）或 accepted（接受）；AT 补记时给 ISO 时间。
# 台账只供度量：接受以删卡提交上的 Accepted-Card trailer 为准。
loop-card:
	node --experimental-strip-types tools/ts-checks/src/loop/cards-cli.ts --card "$(CARD)" --event "$(EVENT)" $(if $(AT),--at "$(AT)")

# 流程体检页：卡的前置时间、每周接受数、剩余卡数、提交大小、测试耗时与债的走向。只报告。
loop-health:
	node --experimental-strip-types tools/ts-checks/src/loop/health-cli.ts $(if $(OUT),--out "$(OUT)")

# 只跑受这次改动影响的成员的测试（先构建它们及其依赖），并写耗时账本。
# BASE 给基线提交或分支（缺省 main）；TIER 给层（fast、slow、all，缺省 fast）；PLAN=1 只列出受影响范围，不构建也不运行。
test-affected:
	$(if $(PLAN),,./scripts/with-test-slot.sh) $(TEST_RUNS) run --base "$(or $(BASE),main)" $(if $(TIER),--tier "$(TIER)") $(if $(PLAN),--plan-only)

# 全部成员的某一层（先构建）：TIER=slow 是合并后在主线头补跑的全量慢层，TIER=fast 量快层全量，TIER=all 同 pnpm run test。
test-tier:
	$(if $(TIER),,$(error 给 TIER=fast、slow 或 all))
	./scripts/with-test-slot.sh $(TEST_RUNS) run --all --tier "$(TIER)" --build

# 可执行验收：跑每个带 acceptance 脚本的成员的验收，与测试同一个运行器、同一份并行度，账本写进主检出的 tmp/acceptance-ledger/。
# 验收驱动构建出来的 dist/：缺省先构建这些成员及其依赖，NO_BUILD=1 跳过（make check 在 product-check 里已全量构建过）。
acceptance:
	./scripts/with-test-slot.sh $(TEST_RUNS) run --all --script acceptance $(if $(NO_BUILD),,--build)

# 失败归因：把一次运行里失败的用例逐个单独重跑并分类。RUN 给那次运行打印出来的运行目录（测试或验收的都行）。
test-triage:
	./scripts/with-test-slot.sh $(TEST_RUNS) triage --run "$(RUN)"

# 验收锁：列出任务基线以来碰过各成员 acceptance/ 的提交；实施角色的提交或未提交的验收改动在其中就退出 1。BASE 给任务基线（缺省 main）。
acceptance-lock:
	node --experimental-strip-types tools/ts-checks/src/acceptance/cli.ts --base "$(or $(BASE),main)"

# 删卡记录：BASE..HEAD 里让卡从 stories.md 消失的提交都要带 Accepted-Card／Voided-Card trailer 点到它，点到的卡要真的消失，「已发到」不许变小。
# 有缺或对不上退出 1。BASE 给任务基线（缺省 main）。make check 最后一步的回路状态与验收锁并列判它。
card-retire:
	node --experimental-strip-types tools/ts-checks/src/product/retire-cli.ts --base "$(or $(BASE),main)"

# 场景状态：按 topic 列出每条带编号的验收场景是已交付、交付中、已立卡还是还没切到。由 acceptance.md、stories.md 与验收的覆盖声明推导，只读、只报告。
scenario-status:
	node --experimental-strip-types tools/ts-checks/src/acceptance/scenario-status-cli.ts
