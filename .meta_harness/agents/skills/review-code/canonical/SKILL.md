---
name: review-code
description: >
  用子代理评审代码变更：对架构与规格的遵守、圈复杂度与 CRAP、按 ub-mode 判设计与实践，并固定运行差分变异。派发前父会话先在 PR head 上自己复跑类型检查与 lint。
  agent 在开出 PR 后，若候选含代码变更，主动加载并执行，不等用户点名。
  交付边界另走 review-delivery。
---

# 代码变更评审

开出 PR 后，父会话发现候选含代码变更时主动加载本技能并派发，不等用户点名。没有这类变更时写没有代码变更并停止。

派发前，父会话在 PR head 上自己运行 `pnpm run typecheck`、`pnpm run lint:rules`、`pnpm run lint:oxlint` 和 `pnpm run lint:deps`。不论代码由谁写，都不采用写者报告的结果。有失败时先修复，不派评审。

四面各派一个子代理。子代理不改产品源码。父会话收成一份报告。同一问题只列一次。选模型、写简报与汇总的通用做法按 `delegate`「评审派发」；各面判据仍按本技能。

度量与差分变异的基线：父会话在派发结构读数与差分变异两面之前判定基线，并把判定写进给子代理的简报。子代理照简报运行，不自己判定。父会话在候选工作树的根目录运行 `node --experimental-strip-types tools/dev-flow/src/integration/cli.ts status`，读输出的 `bound`，然后按下列分支判定。基线的统一规则归 `tools/test-runner/README_ZH.md`「测试运行」一节的第一个命令块。

- `bound` 为 `true`：简报写明不给 `--base`，也不设环境变量 `BASELINE`。命令按统一规则取 task context 的 `targetBase`。要在简报或报告里写出基线时，写 `status` 输出的 `targetBase`。工具拒绝不等于 `targetBase` 的显式基线（`--base` 或 `BASELINE`），并以 2 退出。
- `bound` 为 `false`（没有 task context）：简报写明 `--base <taskBase>`，`taskBase` 取卡上 binding 的 `taskBase`。没有卡，或卡上没有 binding 时，给候选分支从目标分支切出的提交（`git merge-base <目标分支> HEAD`）。
- 差分变异的范围取「上一轮评审之后的改动」时（见下面「差分变异」一段的范围），简报写明在候选工作树里给 `--since <上一轮评审的 head>`，基线仍按上面两条判定。`--since` 不改变基线，只把范围收窄到 `<ref>` 以来的改动行，所以绑定的工作树里也能用。`<ref>` 必须是 HEAD 的祖先，并且不早于基线与 HEAD 的合并点。`--since` 不能与 `--members` 同给。不满足时命令以 2 退出。规则见 `tools/test-runner/README_ZH.md`「差分变异」。同一轮的结构读数仍按上面两条判定。

正确性：实现是否遵守这次任务已经采用的架构、技术设计和规格。问题要带反例，或指出缺的行为。测试通过不代替这一面。

结构读数：在候选工作树运行 `pnpm run lint:deps` 和 `pnpm run metrics --coverage`。给不给 `--base`、给哪个，照简报里「度量与差分变异的基线」一段的判定。`lint:deps` 的依赖违规、成员和组之间的环原样列出。`pnpm run metrics` 只摘这次变更函数的圈复杂度和 CRAP。两者读同一张 dependency-cruiser 依赖图。读数是抽查线索。CRAP 低不表示行为正确。命令失败时交回命令和输出，不手算冒充工具结果。两条命令的量测范围以执行仓库 `docs/verification.md` 为准；当前 `pnpm run metrics` 不量 `tools/` 和 `scripts/`。命令退出 0 但改动不在度量范围内时，这一面写「未覆盖」，不写零发现。逐个列出未覆盖的改动文件，并给出替代证据，例如直接对改动函数算圈复杂度。替代证据标明是手算，不写成工具读数。

设计与实践：判据是 ub-mode（先做对、再做好，见执行仓库 `docs/engineering/skills.md`「ub-mode 研发品味」）、本项目工程约定和 `pstack:typescript-best-practices`。SOLID 的采用范围归 `docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」。候选有 `spec.md` 时，父会话把它的路径交给这一面的子代理；子代理问它的「Testing Decisions」一节是否先写出了判据、反例与变红验证。问题要指到具体类型、函数或分支。

差分变异：这一面固定要跑。命令是 `pnpm run mutation`，基线照简报里「度量与差分变异的基线」一段的判定。父会话在简报里写明下面四件事，子代理照做：

1. 时机：只在最终 head 上跑一次。有修复轮时，最终 head 是最后一轮修复留下的 head。修复轮一开始，就停掉旧 head 上还在跑的差分变异。它的结果已经过时，还占着测试名额。
2. 范围：只取热点，不对整卡自 taskBase 以来的改动全量跑。热点是上一轮评审之后的改动，或判据、状态转移、并发与失败分支所在的文件。收窄的做法与命令见 `tools/test-runner/README_ZH.md`「差分变异」。先只列范围（`--plan-only`），核对后再正式运行。`--members` 变异整个成员的 `src/`，不能用来缩小范围。
3. 名额与工作树：启动前，确认没有别的代理在等测试名额，也没有人会改这棵树。名额的锁文件与排队方法见 `scripts/README.md`「运行名额」。变异读的是工作区，未提交与未跟踪的文件都算进去。工作树隔离只隔离文件，不隔离测试名额和 CPU。
4. 进程数：启动后，看日志开头写进程数及其来历的那一行。进程数偏低时停掉，用 `VITEST_MAX_WORKERS` 指定进程数后重启。没有设 `VITEST_MAX_WORKERS`、工作进程预算又不到本机核数的一半时，命令在这一行之后打一行告警，告警里有重启命令。告警的内容见 `tools/test-runner/README_ZH.md`「差分变异」的「进程数告警」。

该命令只报告，只覆盖改动行和快层，只量 `packages/` 和 `apps/`。存活与无覆盖原样列出。命令失败时交回命令和输出，不把未跑写成零存活。改动不在量测范围内时，这一面写「未覆盖」，逐个列出未覆盖的改动文件，并给出标明是手工的替代证据，例如手工变异。把存活判为等价变异前，先说明能否改夹具或代码让它可判定，作为发现交回。

父会话按任务卡上记录的评审轮次计数，接手前已经做过的轮次也算。连续两轮出现同一类阻断时，停止逐个补洞。先缩窄这一类的承诺：工具对这一类不再下确定结论，一律交人工复核或按未达到处理。同步缩窄评审标准，再做一次增量复审。承诺归别人拥有时，把缩窄方案交拥有者决定。

交付边界和验收标准归 `review-delivery`。文档变更归 `review-docs`。这份报告不是接受，也不合并 PR。
