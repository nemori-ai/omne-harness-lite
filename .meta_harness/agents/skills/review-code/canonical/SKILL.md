---
name: review-code
description: >
  用子代理评审代码变更：对架构与规格的遵守、圈复杂度与 CRAP、SOLID 与 TypeScript 实践，并固定运行差分变异。派发前父会话先在 PR head 上自己复跑类型检查与 lint。
  agent 在开出 PR 后，若候选含代码变更，主动加载并执行，不等用户点名。
  交付边界另走 review-delivery。
---

# 代码变更评审

开出 PR 后，父会话发现候选含代码变更时主动加载本技能并派发，不等用户点名。没有这类变更时写没有代码变更并停止。

派发前，父会话在 PR head 上自己运行 `pnpm run typecheck`、`pnpm run lint:rules`、`pnpm run lint:oxlint` 和 `pnpm run lint:deps`。不论代码由谁写，都不采用写者报告的结果。有失败时先修复，不派评审。

四面各派一个子代理。子代理不改产品源码。父会话收成一份报告。同一问题只列一次。

度量与差分变异的基线：先在候选工作树运行 `node --experimental-strip-types tools/dev-flow/src/integration/cli.ts status`，读输出的 `bound`。`bound` 为 `true` 时，不给 `--base`，命令按统一规则取 task context 的 `targetBase`。需要写出基线时，只给 `status` 输出的 `targetBase`。工具拒绝不等于 `targetBase` 的显式基线，并以 2 退出。`bound` 为 `false` 时，没有 task context，给 `--base <候选的任务基线提交>`，即卡上 binding 的 `taskBase`。

正确性：实现是否遵守这次任务已经采用的架构、技术设计和规格。问题要带反例，或指出缺的行为。测试通过不代替这一面。

结构读数：在候选工作树运行 `pnpm run lint:deps` 和 `pnpm run metrics --coverage`。给不给 `--base`、给哪个，按「度量与差分变异的基线」一段决定。`lint:deps` 的依赖违规、成员和组之间的环原样列出。`pnpm run metrics` 只摘这次变更函数的圈复杂度和 CRAP。两者读同一张 dependency-cruiser 依赖图。读数是抽查线索。CRAP 低不表示行为正确。命令失败时交回命令和输出，不手算冒充工具结果。两条命令的量测范围以执行仓库 `docs/verification.md` 为准；当前 `pnpm run metrics` 不量 `tools/` 和 `scripts/`。命令退出 0 但改动不在度量范围内时，这一面写「未覆盖」，不写零发现。逐个列出未覆盖的改动文件，并给出替代证据，例如直接对改动函数算圈复杂度。替代证据标明是手算，不写成工具读数。

设计与实践：是否遵守 SOLID，以及本项目工程约定和 `pstack:typescript-best-practices`。问题要指到具体类型、函数或分支。

差分变异：在候选工作树运行 `pnpm run mutation`。给不给 `--base`、给哪个，按「度量与差分变异的基线」一段决定。这一面固定要跑。该命令只报告，只覆盖改动行和快层。存活与无覆盖原样列出。命令失败时交回命令和输出，不把未跑写成零存活。该命令只量 `packages/` 和 `apps/`。改动不在这个范围内时，这一面写「未覆盖」，逐个列出未覆盖的改动文件，并给出标明是手工的替代证据，例如手工变异。把存活判为等价变异前，先说明能否改夹具或代码让它可判定，作为发现交回。

父会话按任务卡上记录的评审轮次计数，接手前已经做过的轮次也算。连续两轮出现同一类阻断时，停止逐个补洞。先缩窄这一类的承诺：工具对这一类不再下确定结论，一律交人工复核或按未达到处理。同步缩窄评审标准，再做一次增量复审。承诺归别人拥有时，把缩窄方案交拥有者决定。

交付边界和验收标准归 `review-delivery`。文档变更归 `review-docs`。这份报告不是接受，也不合并 PR。
