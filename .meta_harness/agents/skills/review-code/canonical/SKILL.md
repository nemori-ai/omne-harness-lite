---
name: review-code
description: >
  用子代理评审代码变更：对架构与规格的遵守、圈复杂度与 CRAP、SOLID 与 TypeScript 实践，并固定运行差分变异。
  agent 在开出 PR 后，若候选含代码变更，主动加载并执行，不等用户点名。
  交付边界另走 review-delivery。
---

# 代码变更评审

开出 PR 后，父会话发现候选含代码变更时主动加载本技能并派发，不等用户点名。没有这类变更时写没有代码变更并停止。

四面各派一个子代理。子代理不改产品源码。父会话收成一份报告。同一问题只列一次。

正确性：实现是否遵守这次任务已经采用的架构、技术设计和规格。问题要带反例，或指出缺的行为。测试通过不代替这一面。

结构读数：在候选工作树运行 `pnpm run lint:deps` 和 `make metrics BASE=<任务基线> COVERAGE=1`。任务基线用这张卡的 taskBase。`lint:deps` 的依赖违规、成员和组之间的环原样列出。`make metrics` 只摘这次变更函数的圈复杂度和 CRAP。两者读同一张 dependency-cruiser 依赖图。读数是抽查线索。CRAP 低不表示行为正确。命令失败时交回命令和输出，不手算冒充工具结果。

设计与实践：是否遵守 SOLID，以及本项目工程约定和 `pstack:typescript-best-practices`。问题要指到具体类型、函数或分支。

差分变异：在候选工作树运行 `make mutation BASE=<任务基线>`。任务基线用这张卡的 taskBase。这一面固定要跑。该命令只报告，只覆盖改动行和快层。存活与无覆盖原样列出。命令失败时交回命令和输出，不把未跑写成零存活。

交付边界和验收标准归 `review-delivery`。文档变更归 `review-docs`。这份报告不是接受，也不合并 PR。
