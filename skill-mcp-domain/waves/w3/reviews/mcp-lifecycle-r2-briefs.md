# w3-mcp-lifecycle 第 2 轮增量评审的简报

共同材料（每份简报都给）：

- 候选：PR #1134，分支 `PanQiWei/skill-mcp-w3-mcp-lifecycle`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-lifecycle`。第 1 轮评审的 head 是 `f8bf19596`，本轮 head 见卡评论。父分支基线 `92a8e3cdf`。
- 本轮范围：`git diff f8bf19596..HEAD`。只评本轮改动与它直接影响的行为；第 1 轮已评过、本轮没动的部分不重评。
- 规格：`packages/mcp/mcp/SPEC.md`（本轮已改写），`packages/mcp/mcp/verification/README.md`，`packages/mcp/mcp/verification/models/README.md`。
- 第 1 轮的四份报告与处置：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-lifecycle-r1.md`。
- 证据：卡 #1119 上本轮的证据评论；原件在工作树 `tmp/closures/w3-mcp-lifecycle/`（`gates-3/`、`dump-2.log`、`tlc-2.log`、`mutation-2/`）。
- 只读。只在这棵工作树里搜索。手工变异在副本上做，不改工作树的文件。报告内联交回。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现本轮 SPEC；第 1 轮各条阻断与非阻断在本轮的处置是否成立（逐条：已修、部分、未修、处置理由不成立）。每条发现带反例或缺的行为，或本次运行的工具输出。重点：

- 每次 `ensure` 只受自己的时限（排队、轮到时的核对、加入的调用自己的时限）；时限来源 `startBound` 的注入是否让生产路径与测试路径走同一套代码。
- 落点从开始起就在途：时限内答复时句柄回到条目、关停时立即释放、之后交来的进程只停不再释放。
- 关停开始之后的失败按关停收场，不标记清单。
- `ask` 的闭包只包端口调用。
- 任务作用域的退出与事后出口：`closeAll` 取走并清空，之后的错误交出口，缺省作为未捕获异常抛出。
- 探索器：注入的时限与 `bounds` 场景、逐个 `ensure` 的 P8 T2 检查是否真能抓住「排队与加入不受自己的时限」；TLA 模型对 F2、F3 的改动与实现一致。
- 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base 92a8e3cdf`，只摘本轮改动函数的圈复杂度与 CRAP。命令失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象：本轮对 `SPEC.md`、`README.md`、`README_ZH.md`、`verification/README.md`、`verification/models/README.md` 的改动。判据按 design-review 的表达页。另核对：第 1 轮表达评审 N1–N16 每条在本轮是否落实；SPEC 与两份 README、两份 verification 页之间有没有互相矛盾；编号的读法（K、T、F、WF、已定事项）是否全文一致。附：`pnpm run check:docs` 与 `pnpm run check:design` 的输出在 `gates-3/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定、`pstack:typescript-best-practices`。只看本轮代码与测试改动：`src/internal/{scope,port,table,build,entry,teardown}.ts`、`src/discovery.ts`、`src/index.ts`、`tests/doubles/bounds.ts`、`tests/model/{explore,properties,scenarios,lifecycle.spec}.ts`、新增与改写的用例。问题指到具体类型、函数或分支。第 1 轮已登记为后续的 S1、S4、S5、S6、S8、S9 不重提，除非本轮让它变坏。

## D. 差分变异（general-purpose，sonnet，high）

在工作树根运行。没有 task context（`status` 的 `bound` 是 `false`），基线给 `--base 92a8e3cdf`，范围给 `--since f8bf19596`（本轮改动行）。先 `--plan-only` 核对范围只含本轮改动的 `packages/mcp/mcp/src` 文件，再正式运行。启动前确认运行名额的排队情况（`scripts/README.md`「运行名额」）；看日志开头的进程数一行，偏低时用 `VITEST_MAX_WORKERS=6` 重启。存活与无覆盖原样列出；判为等价变异前先说明能否改夹具或代码让它可判定。命令失败时交回命令与输出。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：只核第 1 轮未达到的一条（验收 1 的 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 原样运行记录）与本轮新增的证据是否贴在卡上；另给调度者第 1 轮裁定 F1–F10（上面 r1 文件末节），列出与卡文冲突的项。
