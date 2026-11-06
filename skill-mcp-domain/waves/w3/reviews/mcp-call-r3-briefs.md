# w3-mcp-call 第 3 轮评审的简报（增量）

共同材料（每份简报都给）：

- 候选：PR #1141，分支 `PanQiWei/skill-mcp-w3-mcp-call`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `fcc955a53`。基线 `b2ba7dc89`（闭包派发时的父分支头，没有 task context，`status` 的 `bound` 为 false）。第 2 轮评审的 head 是 `5204d3799`；本轮只评 `git diff 5204d3799..HEAD`，必要时读周边代码。
- 第 2 轮的五面报告与卡拥有者的全部裁定：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r2.md`。本轮之间有两个闭包：代码修复 `w3-mcp-call-fix2`（`5204d3799..0b84a0bec`），表达与证据 `w3-mcp-call-docs2`（`0b84a0bec..8d376c0ba`），以及派发者的注释修正 `fcc955a53`。
- 规格：`packages/mcp/mcp/SPEC.md`（MC-7、MC-10、MC-12、MC-16、MC-17、所有权、偏离表、已知限制、性质与证据）；`packages/mcp/mcp-contract/SPEC.md`（S1、S2、S7、S8、R2、R6、R7、T5、T9 与「调用口闭包的裁定」一节）。
- 证据：卡 #1119 评论 6675951054（fix2）、6676418696（docs2 与本轮候选）、6666710295（第 2 轮评审与裁定）；原件在工作树 `tmp/closures/w3-mcp-call/`（`fix2/`、`docs2/`、`owner-fix2/`、`owner-docs2/`）。
- 只读，只在这棵工作树里搜索。手工变异在工作树之外的副本上做。报告内联交回。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款；每条发现带反例、缺的行为或本次运行的工具输出。

1. 第 2 轮的阻断（A 阻断 1：两个对端账户给出同一任务号）与 A、C 标「改」的非阻断，逐条核对是否消失：写「已消失」及证据（用例名、代码位置、在新 head 上复跑的探针输出），或给出仍成立的反例。第 2 轮的探针在 `reviews/mcp-call-r2-probes-a/`、`mcp-call-r2-probes-c/`。
2. 关停之后不问端口（契约 S8 新句）：沿 `perform`、`prepare`、`under`、`sendOrder`、任务操作的 `built`、`refresh` 逐条路径读，找任何在 `closeAll` 之后仍调用关口、存储、建连或传输的路径。写者把裁定里的「等完之后核」改成了「在决定点核」（fix2 交回第 8 节自定 2），请独立判断这在每个微任务落点上是否成立。
3. L3 热点逐行读：占位句柄（`Reservation` 的 `stop`、`sent`、`conclude` 与表里的 `Cell`），`table.lose` 与 `markLost` 的同步前缀，任务表的「有歧义」与账户隔离，停止信号在第 8 步与 `perform` 的判定。
4. 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base b2ba7dc89`，只摘 `5204d3799..HEAD` 改动函数的圈复杂度与 CRAP。命令排队等名额是正常的；失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象（只评 `5204d3799..HEAD` 改动的部分）：`packages/mcp/mcp/SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、`verification/README.md`、`verification/models/README.md`；`packages/mcp/mcp-contract/SPEC.md` 改动的句子与新节「调用口闭包的裁定」。判据按 design-review 的表达页。另核对：

- 第 2 轮表达评审 R2-1～R2-11：逐条「已改」「仍成立」或「不适用」，带位置。
- C 序列（C01–C78）、探索器负控（N1–N8）与性质（P1–P14、WF1–WF5）的编号在 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md` 三处一致，每个读数写了运行时的 head。
- 契约 SPEC 的新节与前言、依据表、根入口清单是否自洽。
`check:docs` 与 `check:design` 的输出在工作树 `tmp/closures/w3-mcp-call/owner-docs2/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象是 `5204d3799..HEAD` 里 `packages/mcp/mcp/src/` 与 `tests/`（含 `tests/model/`）。重点：

- 占位句柄（`Reservation`、`Cell`）是否让「阶段只在表里」成为结构，`perform` 是否只有一个出口；`under`、`STOPPED` 哨兵与 `perform` 的 `cancelled` 判定是否一处决定。
- `lose`、`markLost` 返回 `Losing` 的同步前缀是否由类型保证；`loseOn` 与 `loseInScope` 两个入口是否清楚。
- 任务表的 `Ambiguous` 是否让非法状态不可表示；任务操作与调用口共用的规则是否一份实现（`connectionFailureOfBuild`、`classificationOf`、`ensureOptionsOf`）。
- 用例是否断言行为；逐微任务扫描的用例是否只观察、不改变被测行为；探索器的计数视图是否只观察句柄。
问题指到具体类型、函数或分支。

## D. 差分变异（general-purpose，sonnet，high）

按 review-code「差分变异」：

1. 时机：本 head 就是当前最终 head，只跑一次。
2. 范围：`--base b2ba7dc89 --since 5204d3799`（上一轮评审之后的改动行）。先 `--plan-only` 列出范围，核对只含 `packages/mcp/mcp/src/` 与 `packages/mcp/mcp-contract/src/` 的改动行，再正式运行。
3. 名额与工作树：启动前按 `scripts/README.md`「运行名额」确认没有别的代理在等测试名额；这棵树在你运行期间没有写者。另一棵树（`w3-mcp-host`）上有写者可能在跑成员测试，会抢 CPU：启动时与结束时各记一次 `ps` 里别的 vitest 进程，写进交回。
4. 进程数与复核：`VITEST_MAX_WORKERS=6 OMNE_MUTATION_RECHECK_MAX=24 pnpm run mutation --base b2ba7dc89 --since 5204d3799`；看日志开头写进程数的那一行，偏低就按告警里的命令重启。

交回：被杀、存活、无覆盖、运行错误、没跑测试、超时（已判定与未复核分开）的计数。本成员用了未处理拒绝的守卫，运行错误应为 0，请核。存活与无覆盖逐个列出（文件:行、变异内容）；把存活判为等价之前，先说明能否改夹具或代码让它可判定。运行错误或「没跑测试」出现时，手工复现一两个，判断是被测代码的问题还是运行器的产物。命令失败时交回命令与输出，不把未跑写成零存活。账本路径。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call.md` 的验收清单与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据（评论 6675951054、6676418696，以及之前的 6665868317、6659833572）。第 2 轮 E 未达到或有保留的项逐条复核。另给调度者的裁定：第 2 轮记录的卡拥有者裁定、`w3-mcp-call-fix2.md`、`w3-mcp-call-docs2.md` 的追加记录（同目录 `delegate/closures/`）；列出它们与派发时卡文、规格原文的冲突项。
