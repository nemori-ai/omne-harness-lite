# w3-mcp-host 第 1 轮评审的简报

共同材料（每份简报都给）：

- 候选：PR（见卡评论），分支 `PanQiWei/skill-mcp-w3-mcp-host`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `8f9016fd8`。基线 `92a8e3cdf`（闭包派发时的父分支头；依赖提交 `114f1e7ef` 由 reduce 加）。范围 `git diff 92a8e3cdf..HEAD`。
- 闭包规格（目标边界、已定的事、验收清单、性质及证据义务、追加记录里的 Q1–Q11 与自裁处置）：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md`。第一段设计：工作树 `tmp/closures/w3-mcp-host/design.md`。
- 规格：`packages/mcp/mcp-host-local/SPEC.md`，`packages/mcp/mcp-contract/SPEC.md`（T1–T9、「真实传输兑现时的裁定」）。
- 证据：卡 #1119 上本闭包的证据评论；原件在工作树 `tmp/closures/w3-mcp-host/`（`red/`、`gates-r/`、`probes/`）。
- 只读，只在这棵工作树里搜索。手工变异在副本上做，不改工作树。报告内联交回。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约 T1–T9；每条发现带反例、缺的行为或本次运行的工具输出。L3 热点逐行读：

- 凭据：授权头只经 `HttpCredentialHandle.authorize`；凭据值不进答复、错误、事件、日志与快照；401 与带 `insufficient_scope` 的 403 调 `reportRejection()` 恰好一次，其余 403 不调。
- 进程归落点：传输不自己起进程、不停止进程；`close()` 先关 stdin 写端，再取消 stdout 读取。
- 不代调用方重发：流断开时 `tools/call`、`tasks/update`、`tasks/cancel` 不再发；读类恰好再发一次，新请求号、重新授权。
- 结局如实分类：线路只产出 `WireEvent`，会话用契约 `classifyWireEvent` 与 T8 得出结论；没有第二份形状判断。
- 每个异步副作用有等待上界或明确的拥有者：探测计时、应答流、SSE 流、子进程句柄；写者自裁第 10 条「应答到达后应答流在后台读完」的上界与拥有者。测试结束时没有遗留的进程与端口。
- 契约改动只可加：原有用例原样通过，`mcp` 成员在基线上编译不受影响。
- 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base 92a8e3cdf`，只摘本闭包改动函数的圈复杂度与 CRAP。`lint:deps` 在干净树上要先构建 `@omne-harness/agent` 与 `@omne-harness/identity-sql`（环境事实，已在 `gates-r/build-extra.log` 构建过）。命令失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象：`packages/mcp/mcp-host-local/SPEC.md`、`README.md`、`README_ZH.md`、`docs/`；`packages/mcp/mcp-contract/SPEC.md` 本闭包改动的段落（T2、T3、T5、T8、T9、新节「真实传输兑现时的裁定」、未封闭项）。判据按 design-review 的表达页。另核对：成员 SPEC「与 SDK 的复用关系」表每一处不复用是否写明硬承诺、契约条款与 `文件:行`；SPEC 与 README、docs 之间有没有互相矛盾或复述漂移；编号读法（T、F4–F8、Q、H）是否一致。`check:docs` 与 `check:design` 的输出在 `gates-r/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象是 `packages/mcp/mcp-host-local/src/` 与 `tests/`、契约新增的 `src/{plain,envelope,withheld,authorization,readers}.ts`。重点：协议会话与线路的职责分离是否干净；一份规则一份实现；状态机与在途表的形状；错误与失败的去向；用例是否断言行为。问题指到具体类型、函数或分支。

## D. 差分变异（general-purpose，sonnet，high）

在工作树根运行。没有 task context，基线 `--base 92a8e3cdf`，第 1 轮不给 `--since`。先 `--plan-only` 核对范围只含 `packages/mcp/mcp-contract/src` 与 `packages/mcp/mcp-host-local/src`。变异只跑快层：stdio 与 HTTP 线路主要由慢层用例覆盖，所以这些行多半落成「无覆盖」，原样列出；它们的证据是写者的手工变异（`tmp/closures/w3-mcp-host/red/mutations.md`），不在本面重判。启动前确认运行名额，`VITEST_MAX_WORKERS=6`，看进程数那一行。存活与无覆盖原样列出；判为等价前先说明能否改夹具或代码让它可判定。测量无效时写出不计分的变异体与原因。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格的验收清单 1–9 与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据。另给调度者的裁定（闭包规格追加记录里的 Q1–Q11、T9 义务、自裁处置），列出与派发时卡文、规格原文的冲突项。
