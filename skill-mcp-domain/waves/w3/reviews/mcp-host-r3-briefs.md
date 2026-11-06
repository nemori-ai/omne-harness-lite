# w3-mcp-host 第 3 轮评审的简报（增量）

共同材料（每份简报都给）：

- 候选：PR #1138，分支 `PanQiWei/skill-mcp-w3-mcp-host`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `720a5d08a`。基线 `92a8e3cdf`（闭包派发时的父分支头，没有 task context）。第 2 轮评审的 head 是 `db06b5b70`；本轮只评 `git diff db06b5b70..HEAD`，必要时读周边代码。
- 第 2 轮的五面报告、结构根因诊断与卡拥有者的全部裁定：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md`。这一轮是两轮同类阻断（等待点不受 `signal` 与关闭管辖）之后的结构重做：调用方只等在途项的结算，工作流是会话拥有的后台工作，`close()` 只等线路，线路的在途写是计数，探索器 V4 量调用方一层，TLA+ 的不变式改成对状态的断言。
- 规格：`packages/mcp/mcp-host-local/SPEC.md`（全文）；`packages/mcp/mcp-contract/SPEC.md` 的 T1–T9、R4、「真实传输兑现时的裁定」。
- 证据：卡 #1119 评论 6675177331（本轮证据）与 6675170166（「用例 → 缺陷 → 变红」表）；原件在工作树 `tmp/closures/w3-mcp-host/`（`fix2/`、`fix2-check/`、`docs2/`、`owner/`、`gates-r3/`）与 `.worktrees/w3-mcp-host-formal2/tmp/closures/w3-mcp-host-formal2/`。
- 只读，只在这棵工作树里搜索。手工变异在工作树之外的副本上做；本包用例经包名导入 `dist`，副本上改源码要重建，或用 `node --conditions=source` 直接跑 `src`。报告内联交回。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款；每条发现带反例、缺的行为或本次运行的工具输出。

1. 第 2 轮的阻断逐条核对是否消失（A 的 2 条、C 的 B1、B2、B 的 B1）：每条写「已消失」及证据（用例名、代码位置、本次运行的探针输出），或给出仍成立的反例。第 2 轮 A 与 C 的探针在 `reviews/mcp-host-r2-probes-a/`、`mcp-host-r2-probes-c/`，可在新 head 上复跑。
2. 承诺「调用方能看到的每一个 promise 在 `signal` 触发或 `close()` 之后结算」：逐个公开方法读（`discover`、`listActions`、`call` 与它的 `answer`、`cancelRequest`、四个任务操作、`close()`），找任何仍会让调用方等一个端口的路径；凭据句柄、元数据取回、线路与对端都按「可以永不答复」对待。
3. L3 热点逐行读：凭据句柄（`callHandle` 之外没有调用，`close()` 之后不再调用，`reportRejection` 至多一次且只对授权过的请求，头不进任何答复与错误，元数据取回不带凭据头）；按相结算（授权中、已交给线路、授权发现中，`signal` 与 `close()` 同形）；`close()` 单飞；`StdioLine` 的写计数与关闭；`work` 的错误去向。
4. 规则归契约：契约新导出各只有一处实现，会话与脚本化传输都用它；纯移动提交 `9ae28f6e6` 只有移动。
5. 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base 92a8e3cdf`，只摘 `db06b5b70..HEAD` 改动的函数。命令排队等名额是正常的；失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象（只评 `db06b5b70..HEAD` 改动的部分）：`packages/mcp/mcp-host-local/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`index.md`、`docs/`、`tests/README.md`、`tests/index.md`、`tests/fixtures/README.md`、`verification/` 下全部 Markdown；`packages/mcp/mcp-contract/SPEC.md` 改动的句子与 `docs/public-api.md`。判据按 design-review 的表达页。另核对：

- 第 2 轮表达评审 B1 与 NB1–NB13：逐条「已改」「仍成立」或「不适用」，带位置。
- 契约 T5 新定的结局（授权中、已交给线路、授权发现中）与成员 SPEC「取消」「关闭」「端口失败模型」、V4、V6 是否一致、无歧义；第 1 轮已采用规则的修订（`close()` 不再等授权发现）在两份 SPEC 里是否都写清。
- 性质 V1–V6 与不变式名、负控名在 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md`、`tests/model/mutants.ts` 四处一致。
`check:docs` 与 `check:design` 的输出在工作树 `tmp/closures/w3-mcp-host/gates-r3/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象是 `db06b5b70..HEAD` 里两个成员的 `src/` 与 `tests/`（含 `tests/model/`）。重点：

- 第 2 轮的结构根因（调用方跟着工作流走而不跟着结算走；线路的写状态不是数据；形式守护量错了层）是否在结构上消除，而不是又一轮补洞。
- `Session` 的职责与可读性：`Pending`（结算与出发点）、`Phase`、`Connection`、`Sending` 三个判别联合、`work`、`stop`、`callHandle`、`refusalOf`、`untilClosed`、`close` 是否各有清楚的拥有者，有没有残留的可变状态袋或「不该发生」型守卫。
- 契约的拆分（`decisions.ts`、`answer-readings.ts`、`composition.ts`、`discovery.ts`、`authorization.ts`）是否内聚，一条规则是否一处实现。
- 用例是否断言行为、并发用例是否用 deferred 或 `reached` 排次序；探索器与 `mutants.ts` 是否只观察、不改变被测行为。
问题指到具体类型、函数或分支。

## D. 差分变异（general-purpose，sonnet，high）

按 review-code「差分变异」：

1. 时机：本 head 就是当前最终 head，只跑一次。
2. 范围：`--base 92a8e3cdf`，不给 `--since`（第 1 轮的测量无效，第 2 轮没有在 host 上跑，没有可以收窄的有效基准）。先 `--plan-only` 列出范围，核对只含 `packages/mcp/mcp-host-local/src/` 与 `packages/mcp/mcp-contract/src/` 的改动行，再正式运行。
3. 名额与工作树：启动前按 `scripts/README.md`「运行名额」确认没有别的代理在等测试名额；这棵树在你运行期间没有写者。
4. 进程数：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf`；看日志开头写进程数的那一行，偏低就按告警里的命令重启。

交回：被杀、存活、无覆盖、运行错误、没跑测试、超时的计数（本包与契约已用未处理拒绝的守卫，运行错误应为 0，请核）；存活与无覆盖逐个列出（文件:行、变异内容）；把存活判为等价之前，先说明能否改夹具或代码让它可判定；账本路径。命令失败时交回命令与输出，不把未跑写成零存活。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md` 的验收清单 1–9 与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据（本轮 6675177331 与 6675170166，以及 6666088522、6657905811）。第 2 轮 E 未达到的项（第 7 条、「用例 → 缺陷 → 变红」表、慢层 skipped 的说明）逐条复核。另给调度者的裁定：第 2 轮记录的裁定、`w3-mcp-host-fix2.md`、`w3-mcp-host-formal2.md`、`w3-mcp-host-docs2.md` 的追加记录（同目录）；列出它们与派发时卡文、规格原文的冲突项。
