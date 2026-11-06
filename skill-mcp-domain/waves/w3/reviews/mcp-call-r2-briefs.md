# w3-mcp-call 第 2 轮评审的简报（增量）

共同材料（每份简报都给）：

- 候选：PR #1141，分支 `PanQiWei/skill-mcp-w3-mcp-call`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `5204d3799`。基线 `b2ba7dc89`（闭包派发时的父分支头，没有 task context，`status` 的 `bound` 为 false）。第 1 轮评审的 head 是 `7d91a330c`；本轮只评 `git diff 7d91a330c..HEAD`，必要时读周边代码。
- 第 1 轮的评审与卡拥有者裁定：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r1.md`（表达评审全文在同目录 `mcp-call-r1-b-full.md`）。
- 规格：`packages/mcp/mcp/SPEC.md`（MC-12、MC-16、MC-17、偏离表、已知限制、性质与证据）；`packages/mcp/mcp-contract/SPEC.md`（S2、S3、S7、S8、R2、O1、O3、T5、T9 与决定清单第 26、27 条）。
- 证据：卡 #1119 评论 6665868317（本轮）与 6659833572（第 1 轮）；原件在各闭包工作树的 `tmp/closures/<闭包>/`。
- 只读，只在这棵工作树里搜索。手工变异在工作树之外的副本上做。报告内联交回。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款；每条发现带反例、缺的行为或本次运行的工具输出。

1. 第 1 轮的阻断逐条核对是否消失（A 的 3 条、C 的 4 条、E 的 2 条，见第 1 轮记录「根因与卡拥有者的裁定」）：每条写「已消失」及证据（用例名、代码位置），或给出仍成立的反例。
2. 本轮新代码的 L3 热点逐行读：`perform` 的唯一出口与停止信号（`calls.ts`）；`InFlightCalls` 的 `reserve`/`markSent`/`conclude`/`cancel` 与发出代际；`loseInScope`（`lost.ts`）交给作用域之后「请求当即被拒」是否仍在答复之前成立，作用域里的拆除与 `closeAll` 的交错；`closeAll` 之后续调用先判关停（契约 S8）；任务操作的关停、发起代际、建连失败映射与账户隔离。
3. 卡拥有者本轮的裁定是否在代码里一致落地：F1(b) 端口前提、F1(d) 的判据（只有报告 `lose` 产物的调用方等 `lose`）、S8。
4. 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base b2ba7dc89`，只摘 `7d91a330c..HEAD` 改动函数的圈复杂度与 CRAP。已知：覆盖率运行里 `lifecycle.spec.ts > wide` 可能在 600 s 超时（第 1 轮同一现象），如出现，交回命令与输出，并用 `vitest` 单独核对改动函数的覆盖，标明替代证据。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象（只评 `7d91a330c..HEAD` 改动的部分）：`packages/mcp/mcp/SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、`src/README.md`、`src/index.md`、`tests/README.md`、`verification/README.md`、`verification/models/README.md`；`packages/mcp/mcp-contract/SPEC.md` 改动的句子与 `docs/public-api.md`。判据按 design-review 的表达页。另核对：

- 第 1 轮表达评审的阻断 B1 与 N1–N13、跨文件漂移清单 1–14：逐条「已改」「仍成立」或「不适用」，带位置。
- 单一源：行为只写在成员 SPEC；README 与 `docs/` 只复述并指向条款。
- 三套变异编号（生命周期 M、服务层 C、探索器 N）与性质编号（P1–P14）在 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md` 三处一致。
- 契约改动的出处与「可加」的说法（决定清单第 26、27 条、前言、依据表）。
`check:docs` 与 `check:design` 的输出在调用口工作树 `tmp/closures/w3-mcp-call/gates-r2/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象是 `7d91a330c..HEAD` 里 `packages/mcp/mcp/src/`、`tests/`（含 `tests/model/`）与契约 `src/` 的改动。重点：第 1 轮 C 的根因（占位与异步副作用没有单一拥有者）是否在结构上消除，不只是补洞；`perform`、`prepare`、`under`、`answerOf`、`outcomeOf` 的职责与可读性；`loseOn` 与 `loseInScope` 两个入口是否清楚；任务操作与调用口共用的部分是否一份规则一份实现；用例是否断言行为、并发用例是否用 deferred 或 `reached` 排次序；探索器的计数视图（`CountedInFlight`）是否只观察、不改变被测行为。问题指到具体类型、函数或分支。

## D. 差分变异（general-purpose，sonnet，high）

按 review-code「差分变异」：

1. 时机：本 head 就是当前最终 head，只跑一次。
2. 范围：`--base b2ba7dc89 --since 7d91a330c`（上一轮评审之后的改动行）。先 `--plan-only` 列出范围，核对只含 `packages/mcp/mcp/src/` 与 `packages/mcp/mcp-contract/src/` 的改动行，再正式运行。
3. 名额与工作树：启动前按 `scripts/README.md`「运行名额」确认没有别的代理在等测试名额；这棵树在你运行期间没有写者。
4. 进程数：`VITEST_MAX_WORKERS=6 pnpm run mutation --base b2ba7dc89 --since 7d91a330c`；看日志开头写进程数的那一行，偏低就按告警里的命令重启。

交回：被杀、存活、无覆盖、运行错误、没跑测试、超时的计数；存活与无覆盖逐个列出（文件:行、变异内容）；把存活判为等价之前，先说明能否改夹具或代码让它可判定。命令失败时交回命令与输出，不把未跑写成零存活。账本路径。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call.md` 的验收清单 1–10 与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据（评论 6665868317 与 6659833572）。第 1 轮 E 未达到的两项（第 2、9 条）逐条复核。另给调度者的裁定：第 1 轮记录的「根因与卡拥有者的裁定」、`w3-mcp-call-fix1.md`、`w3-mcp-call-model.md`、`w3-mcp-call-docs.md` 三份闭包规格的追加记录（同目录）；列出它们与派发时卡文、规格原文的冲突项。
