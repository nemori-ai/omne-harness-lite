# w3-mcp-host 第 4 轮关口评审的简报（增量，最后一个关口）

共同材料（每份简报都给）：

- 候选：PR #1138，分支 `PanQiWei/skill-mcp-w3-mcp-host`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `54a2377cb`。基线 `92a8e3cdf`（闭包派发时的父分支头，没有 task context）。第 3 轮评审的 head 是 `720a5d08a`；本轮只评 `git diff 720a5d08a..HEAD`，必要时读周边代码。
- 第 3 轮的五面报告、「第 3 轮结构诊断」与卡拥有者的全部裁定（含「卡拥有者裁定（03:21 UTC）」）：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md`。
- 规格：`packages/mcp/mcp-host-local/SPEC.md`（全文）；`packages/mcp/mcp-contract/SPEC.md` 的 T1–T9、R4、「真实传输兑现时的裁定」。
- 证据：卡 #1119 评论 6677346854（fix3 与 formal3）与 6677715557（docs3）；原件在工作树 `tmp/closures/w3-mcp-host/`（`fix3/`、`owner-fix3/`、`docs3/`、`owner-docs3/`）。
- 只读，只在这棵工作树里搜索。手工变异在工作树之外的副本上做；本包用例经包名导入 `dist`，副本上改源码要重建，或用 `node --conditions=source` 直接跑 `src`。报告内联交回。

阻断判据（四面共用）：阻断只认违反已要求需求或已承诺不变式的问题。已要求的来源有四处：卡 #1119 判据 C1–C6 与闭包规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md` 的验收清单；成员 SPEC 与契约 SPEC 已写的承诺；领域交接 `docs/domains/mcp/architecture.md` 列出的服务与消费者；生态兼容基线 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/compat/README.md`。每条阻断写明违反的是哪一条。其余建议（形状更好、表达更顺、新增能力、优化）写进报告末尾「超出已要求的需求」一节，各带一句理由，不作阻断。本轮是这个闭包的最后一个关口：之后至多一轮修复，复审只核阻断。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款；每条发现带反例、缺的行为或本次运行的工具输出。

1. 第 3 轮的阻断逐条核对是否消失：A 的 N1（stdio `close()` 等不读 stdin 的对端）、A 的 N2 与 C 的 B1（会话结束之后，授权中的请求仍被写上线路）。每条写「已消失」及证据（用例名、代码位置、本次运行的探针输出），或给出仍成立的反例。第 3 轮 A 与 C 的探针在 `reviews/mcp-host-r3-probes-a/`、`mcp-host-r3-probes-c/`，在新 head 上复跑。
2. 按相结算：契约导出 `stopAnswerOf` 与 `lineGoneAnswerOf` 是全函数（每个相、每个原因都有一个结论或明确的「不动」），会话与契约的脚本化传输都只经它们决定，不另写分支。线路断开时：授权中 → 未发出；已交给线路 → 按原因（会话结束时不动）；授权发现中 → 不动（03:21 裁定）。逐个找仍会让调用方等一个端口或给出与规则不一致答复的路径。
3. L3 热点逐行读：
   - 凭据句柄：只经一处入口，`close()` 之后不再调用，拒绝报告至多一次且只对授权过的请求，头不进任何答复与错误。
   - `StdioLine.close()` 一律中止写端，完成只取决于本地资源；不再有只为关闭存在的写计数。
   - 缺陷出口 `reportDefect`：后台工作与事件处理的缺陷都到这里，不被吞掉，也不变成调用方的答复。
   - `ConnectionView` 判别联合：非法组合写不出来。
4. 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base 92a8e3cdf`，只摘 `720a5d08a..HEAD` 改动的函数。命令排队等名额是正常的；失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象（只评 `720a5d08a..HEAD` 改动的部分）：`packages/mcp/mcp-host-local/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`src/index.md`、`docs/`、`tests/index.md`、`tests/fixtures/README.md`、`verification/` 下全部 Markdown；`packages/mcp/mcp-contract/SPEC.md` 改动的句子与 `docs/public-api.md`。判据按 design-review 的表达页。另核对：

- 第 3 轮表达评审的 NB-1～NB-7 与小项：逐条「已改」「仍成立」或「不适用」，带位置。
- 相 → 结局的规则（停止与关闭、线路断开）在契约 SPEC、成员 SPEC「取消」「关闭」「端口失败模型」与性质 V1–V6 里说法一致、无歧义。
- 性质与不变式名、负控名在 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md`、`tests/model/mutants.ts` 四处一致。
- 成员 SPEC 依据表对同一 PR 的契约 SPEC 写「同一分支同批交付」而不钉提交，这样写是否让读者能找到唯一依据。

`check:docs` 与 `check:design` 的输出在工作树 `tmp/closures/w3-mcp-host/owner-docs3/`。

## C. 设计与实践（general-purpose，opus，high，只看新公开形状与新生命周期）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象限于 `720a5d08a..HEAD` 里的这几处：

- 契约新导出 `stopAnswerOf`、`lineGoneAnswerOf` 与它们的归属（是否就是「相 → 结局」这一条规则的唯一实现，穷尽检查是否由类型守住）。
- 契约 `ConnectionView` 的判别联合及其消费者。
- 会话的缺陷出口（`SessionOptions` 注入）与 `StdioLine.close()` 的新生命周期：错误去向与等待上界是否各有拥有者。
- 契约 vitest 的未处理拒绝守卫（`tests/unhandled.ts`）是否只观察、不改变被测行为。

问题指到具体类型、函数或分支。

## D. 差分变异（general-purpose，sonnet，high）——调用口 fix3 不跑 vitest 时再派

按 review-code「差分变异」：

1. 时机：本 head 是最终 head，只跑一次。
2. 范围：`--base 92a8e3cdf --since 720a5d08a`。先 `--plan-only` 列出范围，核对只含 `packages/mcp/mcp-host-local/src/` 与 `packages/mcp/mcp-contract/src/` 在 `720a5d08a` 之后的改动行，再正式运行。
3. 名额与工作树：启动前按 `scripts/README.md`「运行名额」确认没有别的代理在等测试名额；这棵树在你运行期间没有写者。
4. 进程数：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf --since 720a5d08a`；看日志开头写进程数的那一行，偏低就按告警里的命令重启。

交回：被杀、存活、无覆盖、运行错误、没跑测试、超时的计数；存活与无覆盖逐个列出（文件:行、变异内容）；把存活判为等价之前，先说明能否改夹具或代码让它可判定；账本路径。命令失败时交回命令与输出，不把未跑写成零存活。按第 3 轮缩窄，本面读数只当线索，测试强度的证据归负控、TLA 有效动作变异与红灯表。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md` 的验收清单 1–9 与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据（6677346854、6677715557，以及先前的 6675946273、6675177331、6675170166、6666088522、6657905811）。第 3 轮 E 未达到的项逐条复核。另给调度者的裁定：`mcp-host-r3.md` 里的全部处置与 03:21 裁定，`delegate/closures/` 下 `w3-mcp-host-fix3.md`、`w3-mcp-host-formal3.md`、`w3-mcp-host-docs3.md` 的追加记录；列出它们与派发时卡文、规格原文的冲突项。
