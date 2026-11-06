# w3-mcp-host 第 2 轮评审的简报（增量）

共同材料（每份简报都给）：

- 候选：PR #1138，分支 `PanQiWei/skill-mcp-w3-mcp-host`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `db06b5b70`。基线 `92a8e3cdf`（闭包派发时的父分支头，没有 task context）。第 1 轮评审的 head 是 `8f9016fd8`；本轮只评 `git diff 8f9016fd8..HEAD`，必要时读周边代码。
- 第 1 轮的评审与卡拥有者裁定：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md`（五面报告、全部裁定、根因一节）。
- 规格：`packages/mcp/mcp-host-local/SPEC.md`（全文，修复轮之后重写）；`packages/mcp/mcp-contract/SPEC.md` 的 T2、T3、T4、T5、T8、T9 与「真实传输兑现时的裁定」。
- 证据：卡 #1119 评论 6666088522（本轮）与 6657905811（第二段）；原件在各闭包工作树的 `tmp/closures/<闭包>/`。
- 只读，只在这棵工作树里搜索。手工变异在工作树之外的副本上做。报告内联交回。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款；每条发现带反例、缺的行为或本次运行的工具输出。

1. 第 1 轮的阻断逐条核对是否消失（A 的 5 条、C 的 5 条，见第 1 轮记录的根因一节与裁定）：每条写「已消失」及证据（用例名、代码位置），或给出仍成立的反例。
2. L3 热点逐行读：凭据句柄（`close()` 之后不再调用、`reportRejection` 每次 401 或 `insufficient_scope` 的 403 至多一次且只对授权过的请求、头不进任何答复与错误）；每个等待点受请求的 `signal` 与 `close()` 管辖（授权、写出、等应答、授权发现、回退的 GET）；`close()` 时三相的去向；再发规则；stdio 写端中止与断流；SSE 模式的进入与断流。
3. 契约的决策层（`decisions.ts`、`wire.ts` 的 `readPeerMessage`）只有一份实现，会话与脚本化传输都用它；会话没有自己的第二份判断。
4. 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base 92a8e3cdf`，只摘 `8f9016fd8..HEAD` 改动函数的圈复杂度与 CRAP。命令失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象（只评 `8f9016fd8..HEAD` 改动的部分）：`packages/mcp/mcp-host-local/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`index.md`、`docs/`、`src/README.md`、`src/index.md`、`tests/README.md`、`tests/index.md`、`tests/fixtures/` 的 README 与 index、`verification/` 下全部 Markdown；`packages/mcp/mcp-contract/SPEC.md` 改动的句子与 `docs/public-api.md`。判据按 design-review 的表达页。另核对：

- 第 1 轮表达评审 B 的 N1–N16 与卡拥有者的 P1–P5 裁定：逐条「已改」「仍成立」或「不适用」，带位置。
- 单一源：行为只写在成员 SPEC 与契约 SPEC；README 与 `docs/` 只复述并指向条款。
- 性质编号 V1–V6 与不变式名在 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md` 三处一致；H1–H14 的变异句与用例名一致。
`check:docs` 与 `check:design` 的输出在 host 工作树 `tmp/closures/w3-mcp-host/gates-r2/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象是 `8f9016fd8..HEAD` 里 `packages/mcp/mcp-host-local/src/`、`tests/`（含 `tests/model/`、`tests/unhandled.ts`）与契约 `src/` 的改动。重点：

- 第 1 轮 C 的根因（决策层没进契约根、等待点不受管辖）是否在结构上消除，不只是补洞。
- 会话（`session.ts`）的职责与可读性：请求的三相、`die`、`drain`、再发与 SSE 模式是否各有清楚的拥有者。
- 契约根的决策层是否内聚：哪些函数属于 T8 的结论，哪些属于读法与写法。
- 两处需要你给出判断的设计问题：(1) 本成员的探索器引擎（`tests/model/explore.ts`）与 `packages/mcp/mcp/tests/model/explore.ts` 骨架相同、端口与性质不同，该不该抽成共用设施，抽到哪里；(2) `tests/unhandled.ts` 在六个用例文件里各调用一次，是否应改为 `vitest.config.ts` 的 setup 文件。
问题指到具体类型、函数或分支。

## D. 差分变异（general-purpose，sonnet，high）

按 review-code「差分变异」：

1. 时机：本 head 就是当前最终 head，只跑一次。
2. 范围：`--base 92a8e3cdf`，不给 `--since`。第 1 轮的测量无效（运行错误、超时未复核），没有可以收窄的有效基准（第 1 轮记录 D 节的裁定）。第 1 轮同一范围运行 584 s。先 `--plan-only` 列出范围，核对只含 `packages/mcp/mcp-host-local/src/` 与 `packages/mcp/mcp-contract/src/` 的改动行，再正式运行。
3. 名额与工作树：启动前按 `scripts/README.md`「运行名额」确认没有别的代理在等测试名额（调用口的差分变异可能刚跑完）；这棵树在你运行期间没有写者。
4. 进程数：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf`；看日志开头写进程数的那一行，偏低就按告警里的命令重启。

交回：被杀、存活、无覆盖、运行错误、没跑测试、超时的计数（第 1 轮有 2 个运行错误，`tests/unhandled.ts` 之后应为 0，请核）；存活与无覆盖逐个列出（文件:行、变异内容）；把存活判为等价之前，先说明能否改夹具或代码让它可判定；账本路径。命令失败时交回命令与输出，不把未跑写成零存活。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md` 的验收清单 1–9 与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据（评论 6666088522、6657905811）。第 1 轮 E 未达到的项（第 7、8 条，「用例 → 缺陷 → 变红」表，异步副作用与遗留，以及「其他缺口」）逐条复核。另给调度者的裁定：第 1 轮记录的裁定、`w3-mcp-host.md`、`w3-mcp-host-fix1.md`、`w3-mcp-host-docs.md`、`w3-mcp-host-formal.md`、`w3-mcp-host-strength.md` 的追加记录（同目录）；列出它们与派发时卡文、规格原文的冲突项。
