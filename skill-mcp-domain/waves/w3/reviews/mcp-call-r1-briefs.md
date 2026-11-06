# w3-mcp-call 第 1 轮评审的简报

共同材料（每份简报都给）：

- 候选：PR（见卡评论），分支 `PanQiWei/skill-mcp-w3-mcp-call`，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `7d91a330c`。基线 `b2ba7dc89`（闭包派发时的父分支头，没有 task context）。范围 `git diff b2ba7dc89..HEAD`。
- 闭包规格（目标边界、reduce 已定的事 1–12、写范围、验收清单 1–10、性质及证据义务、追加记录）：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-call.md`。
- 规格：`packages/mcp/mcp/SPEC.md`（调用口一节 MC-16、MC-17、映射表、性质与证据）；`packages/mcp/mcp-contract/SPEC.md`（S1–S9、R2、R5、O1–O6、D1–D5、T5、T6、T9）。
- 证据：卡 #1119 上本闭包的证据评论；原件在工作树 `tmp/closures/w3-mcp-call/`（`red/`、`logs/`、`gates-r/`、`mutate.py`）。
- 只读，只在这棵工作树里搜索。手工变异在副本上做，不改工作树。报告内联交回。
- 另一棵树 `w3-mcp-call-model` 正在为调用口写探索器场景与 TLA+ 模型，不在本轮范围。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

判据：实现是否兑现成员 SPEC 与契约条款；每条发现带反例、缺的行为或本次运行的工具输出。L3 热点逐行读：

- 隔离：在途表与任务表按租户与主体隔离；任务按记录的连接键（租户、持有、对端账户）隔离账户；另一主体或租户的 `cancel`、任务操作不触发端口调用。
- 次序：MC-16 的每一步失败都归还占位；发出前的取消或中止不调用传输的 `call`；发出后的取消调用 `cancelRequest` 恰好一次、不等对端；`markSent` 与取消、`ensure` 与中止、`closeAll` 与在途调用的交错。
- 结局如实：未发出的调用没有对端效果；发出后的结局只经 `classifyOutcome`；`no-answer` 的子因与连接状态（S7，`lose` 只对当前代际）；违约（T9）的去向。
- 每个异步副作用有等待上界或明确的拥有者：建连、发出后的等待、任务操作的时限、`cancelRequest`。
- 契约改动只可加：`ContinueRequest.inputResponses` 可选、`McpPorts.checkOutput` 必填与样本构造器；原有用例原样通过。
- 结构读数：`pnpm run lint:deps`；`pnpm run metrics --coverage --base b2ba7dc89`，只摘本闭包改动函数的圈复杂度与 CRAP。`lint:deps` 在干净树上要先构建 `@omne-harness/agent` 与 `@omne-harness/identity-sql`（这棵树已构建）。命令失败时交回命令与输出。

## B. 表达（design-reviewer，expression，opus，xhigh）

对象：`packages/mcp/mcp/SPEC.md`（本闭包改动的节）、`README.md`、`README_ZH.md`、`docs/`、`src/README.md`、`tests/README.md`、`verification/README.md`；`packages/mcp/mcp-contract/SPEC.md` 本闭包改动的句子（S3、O1、`./testing` 列表）。判据按 design-review 的表达页。另核对：规格「实施规格」第一条的单一源约束（行为只写在成员 SPEC，README 与 docs 只写用法、装配与链接）是否守住；SPEC 与 README、docs 之间有没有复述漂移；编号读法（MC、S、R、O、D、M）是否一致。`check:docs` 与 `check:design` 的输出在 `tmp/closures/w3-mcp-call/gates-r/`。

## C. 设计与实践（general-purpose，opus，high）

判据：ub-mode、本项目工程约定（`docs/defensive-patterns.md`、`docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」）、`pstack:typescript-best-practices`。对象是 `packages/mcp/mcp/src/` 与 `tests/` 的改动，契约 `src/services.ts`、`testing-values.ts`、`testing.ts` 的改动。重点：调用口、在途表、任务表、装配的职责是否分开；一份规则一份实现；状态与所有权；错误与失败的去向；用例是否断言行为、并发用例是否用 deferred 排次序。问题指到具体类型、函数或分支。

## D. 差分变异

本轮不跑。按 review-code，差分变异只在最终 head 上跑一次；本闭包之后必有修复轮（并行的 `w3-mcp-call-model` 会带回模型的结论），旧 head 的结果会过时，还占运行名额。写者的手工变异 M01–M34 在 `verification/README.md` 与 `tmp/closures/w3-mcp-call/red/`，交 E 按卡与规格判。

## E. 交付边界（general-purpose，sonnet，medium）

按 `review-delivery`：任务卡 #1119 现行正文、闭包规格的验收清单 1–10 与「性质及证据义务」，逐条判达到或未达到，只认卡上的证据。另给调度者的裁定（闭包规格「reduce 已定的事」1–12 与追加记录），列出与派发时卡文、规格原文的冲突项。
