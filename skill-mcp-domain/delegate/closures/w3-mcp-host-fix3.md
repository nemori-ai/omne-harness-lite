# 闭包规格 w3-mcp-host-fix3

## 身份与位置
- 闭包：w3-mcp-host-fix3
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：720a5d08adb270c0b652d84fc25a29242b6bc03e
- 清晰度：定

`w3-mcp-host` 第 3 轮评审之后的集中修复轮（PR #1138）。五面报告与卡拥有者的全部处置在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md`；各面「卡拥有者对 X 的处置」里标「改」的代码项与行为条款是本闭包的施工依据。TLA+ 模型由并行的 `w3-mcp-host-formal3` 改；SPEC 的表达项、README、`docs/`、`verification/` 的 Markdown 由之后的 `w3-mcp-host-docs3` 改。

第 3 轮的结构判断有两条：
- C 面「结论」一节：第 2 轮的三条结构根因已在结构上消除；目标结构第 3 条「调用端口之前同步核可用」只做了一半，仍是手写约定，B1 就出在这里。本闭包把它做完：`inFlight` 是唯一的再核点，`dead` 与 `signal`、`close()` 一样只是又一种「停」。
- 「第 3 轮结构诊断：`close()` 等对端」一节：stdio 的 `close()` 三轮都等过对端，三次修法共有一个错的前提（web 写完成即字节离开本进程，所以无在途写时优雅关闭有界）。规则改为：线路的关闭没有优雅一支，完成只依赖本地资源（第 17 条）。
这是把结构做完，不是又一轮补洞；第 4 条以后的项不得引入新的手写再核，也不得给关闭再加条件。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：会话的并发次序、关闭与线路断开时的结算（策略 `top_risks` 并发、收尾时机），凭据句柄（`security-sensitive`），跨两个成员 → 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：修掉 B1；把「相 → 结局」做成契约的一条规则并让脚本化传输兑现 T5；线路级断开按相结算；兑现 C、B、D、A 面标「改」的代码项；补变异强度的负控与用例。每个行为改动先写一条在基线上变红的用例。

### 已定的事（不重新裁定）
1. **B1：会话结束之后授权中的请求仍上线路**（C 阻断）。`die` 对一切原因都把 `authorizing` 的在途项结算为「未发出：`connection-unavailable`」；只有 `sent` 一支按原因区分，`session-ended` 时 `sent` 的在途项不动。`inFlight` 成为唯一的再核点；`respond`、`notify`、`enterSse` 里手写的「授权 → `!this.usable`」收成一个辅助（C 非阻断 4）。用例照 `session.spec.ts:1490` 的写法：`SESSION_SCRIPT` 加 `'tools/list': [status(404,'gone')]`，扣住第 5 次授权，断言 `call` 答 `not-sent` 且线路上没有 `tools/call`。负控 `mB1-session-ended-skips-authorizing`（恢复 `die` 的提前返回）入 `mutants.ts`。契约 T8 S07 一带写明：会话结束的那次请求答 `session-ended`，之后的请求答 `connection-unavailable`。
2. **线路级断开按相结算**（B NB-1）。流断开、进程退出、旧 HTTP+SSE 共用流结束：已交给线路的请求按原因答 `no-answer`。会话结束：只有触发它的那个请求答「未发出：`session-ended`」，其余已交给线路的请求各自的应答照常决定（第 1 条）。四种原因下，授权中的请求都答「未发出：`connection-unavailable`」；授权发现中的保持 `authorization-required`（先到者定）。契约 T8 的 SSE 段与 S01–S04、S07 各加这一句；成员 SPEC「所有权」一节同步。探索器的 V6 扩到线路级断开，含 `sse-fallback` 场景；零违例，配一个负控（例如断开时不结算授权中的在途项）。
3. **相 → 结局的规则归契约**（C P1，选 (a)）。契约导出这条规则（三相：授权中、已交给线路、授权发现中；`signal` 与 `close()` 同形），会话与脚本化传输共用。脚本化传输改为先登记再授权，`close()` 与 `signal` 按相结算。契约套件补两条闸门永不放开的 T5 用例（授权中 `call` 的 `signal`、授权中的 `close()`），断言当场结算为「未发出」且对端没收到请求。脚本化传输的消费者：契约自己的用例，以及 `@omne-harness/mcp` 的 `tests/doubles/`、`memory-store.spec.ts`、探索器（`tests/model/explore.ts`）；本分支上跑 `@omne-harness/mcp` 的全部用例（快层与慢层）。
4. **元数据取回收 `signal`**（B NB-2）。取回收到 `signal`，会话不依赖它遵守；信号之后不再发起新的取回，已发起的结果丢弃。R4 的第二个候选地址按这句核一遍。探索器 V1 的可观察形式补上元数据取回。
5. **T5 的分界与 T1 措辞**（B NB-7）。契约 T5 用与传输无关的话定义分界：「对端可能收到请求的任何部分之前」为未交出（本传输里就是授权中），之后为已交出；T1 的 `no-answer` 措辞覆盖「已交出、未必已离开」。成员 SPEC「取消」「关闭」两节引用这一分界，不另下定义。
6. **缺陷出口**（C 非阻断 1、6）。`work` 不再丢掉原因：会话加一个缺陷出口（`SessionOptions` 注入；缺省在 Promise 之外抛出，让宿主的未捕获处理看到，与 `@omne-harness/mcp` 作用域的 `afterExit` 同形）。按相结算照旧。`consume`、`pump` 的 `try` 只包住对 `exchange.messages`、`line.events` 的迭代；`onEvent`、`classify`、`concludeAnswer` 里的缺陷走缺陷出口，不再归入 `http-aborted`，读循环不因它静默停止。
7. **GET 状态的归类规则归契约**（C 非阻断 2）。契约导出「GET 的状态按 `initialize` 归类」的规则；`refusedGet` 不再伪造 `WireContext`。
8. **`Pending` 不留可选字段袋**（C 非阻断 3）。`stream` 与探测计时的取消随 `Phase` 的 `sent` 变体；删掉 `authorized`，`refusalOf` 只看句柄是否存在。
9. **`classify` 只对 `sent` 相生效**（C 非阻断 5）。补一条用例：SSE 模式下对端对一个还没写出的请求号作答，在途项不被结算。
10. **`startAuthorizationDiscovery` 接住同步抛出**（C 非阻断 7）。`Promise.resolve().then(() => fetchMetadata(url, signal))`；补一条取回同步抛出时后面的地址照样取的用例。
11. **并发用例的次序**（C 非阻断 8）。`session.spec.ts` 里 C 列出的四处计时与自旋，改为端口替身在被调用时兑现 `reached` deferred；改不了的逐条写理由。
12. **`mutate.ts` 不写进工作树的 `src/`**（C 非阻断 9）。在临时副本里变异；做不到就在原地变异，但开工前要求工作树干净、收到中断信号也还原、结尾按字节比较。
13. **`ConnectionView` 写成判别联合**（C 非阻断 10）。它是本 PR 新加的根导出，没有外部消费者。
14. **琐碎与纯移动**（C 非阻断 11、契约拆分余项）。`mcp-host-local/src/authorization.ts` 文件头改成实际调用的 `startAuthorizationDiscovery`。`withOneResend` 归编排那一组（`discovery.ts`）；按连接的规则与组成用词的位置按 C「契约拆分」一节整理。纯移动单独提交，只有移动。
15. **契约的未处理拒绝守卫**（D）。契约成员的 `vitest.config.ts` 加与 host 相同的 setup 文件（`tests/unhandled.ts`）。由此变红的现有用例逐条修正被测代码或用例，不放宽守卫。
16. **变异强度的簇**（D 处置）。D 的逐条清单是线索，不是计分板：`/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/720a5d08a/20261106-022559/r3-survivors-nocov-timeouts.tsv`。只做下列簇：
    - `decisions.ts:311`：补 `supported` 里只有旧修订、或旧修订排在前面的用例。
    - 契约 `authorization.ts:20` 的参数对检查、host `authorization.ts:37` 的 `read.kind === 'ok'`：读清楚变异之后的行为；结果相同就改写代码让判定只出现一次，不能改就写明等价理由。
    - `session.ts:890` 一行（`heldEndpoint`）：补非 200、非 `text/event-stream`、首个事件不是 `endpoint` 的用例，各自断言不进旧一路。
    - `http-line.ts`：`mutants.ts` 的 `file` 联合加 `src/http-line.ts`；把红灯表 D.1 的 `m11-06c`、`m11-06d`、`m11-06e`、`m11-09e` 转成负控；再从 D 的簇里取 `:87` 的事件过滤与 `:211`、`:223` 两块各一个负控。负控在慢层用例上变红即可（`mode: 'slow'`）。
    - `session.ts`、`stdio-line.ts` 里本闭包不改写的行：按相结算、关闭、写计数、归类四类，各挑存活最集中的簇：补快层用例，或写明哪条慢层用例杀它（手工变异的运行记录），或写等价理由。不要求逐个清零。
    - 不处理：`testing-scripted-transport.ts`（第 3 条重写它）；`options.ts` 的消息文本（SPEC 不承诺文本）。
17. **stdio 线路的关闭一律中止写端**（A 阻断 1，结构诊断）。`StdioLine.close()` 不再调用 `writer.close()`：中止 stdin 写端（对端看到输入结束），再取消 stdout 与 stderr 的读取、等两个读循环结束；从不等缓冲排空。`writes` 计数若只为关闭存在就删掉，负控 `mStdio-writes-boolean` 随之退出；`closing` 信号保留（仍在等满管道的 `send` 答 `aborted`）。用例（`stdio.spec.ts`，真实子进程）：子进程不读 stdin，连续发小 `call` 直到 `child.stdin.writableLength > 0`（全部已出发），`close()` 在进程停止之前、有界时间内返回；做法见 A 的探针 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3-probes-a/n1-stdio-buffered-close.ts`。负控 `mStdio-close-flushes`（无在途写时恢复 `writer.close()`）在这条用例上变红。成员 SPEC H6 按这条改写，并写明「线路的 `close()` 只依赖本地资源」是线路对会话的义务（V4 的前提）。conformance「stdio: close() closes stdin, then cancels stdout」的次序照旧。
18. **A 面的其余项**：
    - 非阻断 1（N3）：并进第 9 条。补用例：SSE 模式下 `tools/list` 先答 401、元数据取回挂着，共用流上随后来了同一请求号的 `result`，结论仍是 `authorization-required`。探针 `n3-answer-after-refusal.mts`（同一目录）。
    - 非阻断 2：3 个超 alert 的函数（`withheld.ts:39 headerDeclarationInvalid` CC 19、`wire.ts:301 resultClassOf` CRAP 17.2、`decisions.ts:337 probeErrorConclusionOf` CRAP 13.8）：能按领域结构（表、判别联合）拆开就拆，CRAP 高于 CC 的补未覆盖分支的用例；拆不开的在交回里写理由。8 个超 warn 不改，交回里给出它们在交回 head 上的读数。
    - 观察（`session.ts:333`）：第 2 条加一条用例，断开时授权发现中的请求不被结算、之后照常以 `authorization-required` 结束。

### 写范围
- `packages/mcp/mcp-host-local/src/` — 会话、线路、授权、选项
- `packages/mcp/mcp-host-local/tests/` — 新用例、探索器（`tests/model/`）、负控（`mutants.ts`）、`mutate.ts`
- `packages/mcp/mcp-host-local/SPEC.md` — 「取消」「关闭」「所有权、失败与生命周期」「端口失败模型」里第 1、2、4、5、6 条涉及的行为句（「性质与证据」一节不改：新负控与探索器读数写在交回里，docs3 写进去）
- `packages/mcp/mcp-contract/src/` — 第 3、7、10、13、14 条的规则、导出与脚本化传输
- `packages/mcp/mcp-contract/tests/` — 第 3、10、15、16 条的用例、套件用例、守卫与导出集合
- `packages/mcp/mcp-contract/vitest.config.ts` — 第 15 条的 setup 文件
- `packages/mcp/mcp-contract/SPEC.md` — T1、T5、T8（SSE 段、S01–S04、S07）、R4 的行为句；第 3、7、13 条新增或改形的导出的登记
- `packages/mcp/mcp-contract/docs/public-api.md` — 第 3、7、13、14 条新增、改形与移动的导出
- `tmp/closures/w3-mcp-host/fix3/`（新建） — 红灯、探索器日志、门禁输出、手工变异日志

### 排除的调用方
- `packages/mcp/mcp-host-local/verification/`：`w3-mcp-host-formal3` 改 `verification/models/`；`verification/README.md` 由 docs3 改。探索器的运行记录写在交回里。
- `packages/mcp/mcp-host-local/README.md`、`README_ZH.md`、`docs/`、`index.md`，契约的 B NB-3～NB-6 与小项（表达）：docs3 改。你改了的行为让这些文件的句子过时，在交回里列出位置。
- `packages/mcp/mcp/`：只跑它的用例，不改。契约改动若让它的用例变红，停下交回（停止条件第 4 条）。
- 锁文件与依赖段。

## 验收清单
每条写命令、预期与结果，输出尾部与日志的 SHA-256 前 16 位写进交回。失败时先在基线上复跑同一检查。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` 退出 0；三个成员的 `test:slow` 各退出 0，日志带退出码一行。
2. 下列行为改动各有一条用例，在基线 `720a5d08a` 上变红、在交回的 head 上变绿；红灯输出存 `tmp/closures/w3-mcp-host/fix3/red/`：B1；线路级断开时授权中的请求（stdio 进程退出、SSE 共用流结束各一）；脚本化传输授权中的 `signal` 与 `close()`；元数据取回在信号之后不再发起；`classify` 对未写出的请求号；发现中的请求在共用流上收到应答（第 18 条）；同步抛出的元数据取回；不读 stdin 的对端上 `close()`（第 17 条）。
3. 新负控（`mB1-…`、第 2 条的 V6 负控、`mStdio-close-flushes`、`http-line.ts` 的 7 个）与仍成立的原有负控用 `tests/model/mutate.ts` 全部重跑，各自按 `expect` 变红，源码按字节还原；退出的负控（如 `mStdio-writes-boolean`）写明原因。表存 `tmp/closures/w3-mcp-host/fix3/mutants.md`。
4. 探索器全部场景零违例；V6 的线路级断开场景列出场景数与调度数。日志存 `tmp/closures/w3-mcp-host/fix3/model/`。
5. 第 16 条每个簇写「行 → 处置（新用例名并附变红日志 / 杀它的慢层用例并附手工变异日志 / 等价理由）」。
6. 结构：`grep -n 'authorized' packages/mcp/mcp-host-local/src/session.ts` 为空；`die` 里没有对 `session-ended` 的提前返回；`respond`、`notify`、`enterSse` 里没有 `this.usable` 的手写再核；`refusedGet` 不构造 `WireContext`；`grep -n 'writer.close' packages/mcp/mcp-host-local/src/stdio-line.ts` 为空。附命令与输出。
9. `pnpm run metrics --coverage --base 92a8e3cdf` 退出 0（全部改完、门禁之后跑一次，排队等名额是正常的）；第 18 条的 3 个函数与 8 个超 warn 函数写读数；本闭包改动的函数不新增超 alert 的。
7. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。
8. 两个成员 `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言；host `src/` 不导入 `@modelcontextprotocol/*`。附命令与输出。

## 实施规格
- 契约公开形状只加不删；第 13 条 `ConnectionView` 是本 PR 新加的导出，改形不算删。移动或改名的导出在交回里列出，并 `git grep` 核对 `packages/mcp/mcp/src` 与 `tests` 没有用到。
- 名字（缺陷出口、相规则、GET 规则、辅助）由你定，写进交回的命名账本。
- 纯移动与行为改动分开提交：先第 14 条的纯移动，再第 1–5 条的行为改动（先红后绿），再第 6–13 条，最后第 15、16 条与负控。

## 性质及证据义务
- V1–V6 照旧；V4、V6 覆盖线路级断开。每个异步副作用有等待上界或明确的拥有者；调用方能看到的每个 promise 在 `signal`、`close()` 与线路断开之后结算。
- 凭据句柄：`close()` 之后不再调用；`reportRejection` 至多一次且只对授权过的请求；头不进任何答复与错误；元数据取回不带凭据头。
- 并发用例用 deferred 或 `reached` 排次序，不用计时代替「已经到达」。

## 施工计划
1. 读处置全文、C 的探针（`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3-probes-c/`），写第 2 条验收的红灯用例，提交一次。
2. 第 14 条的纯移动，原有用例通过就提交。
3. 第 1–5 条行为，先红后绿；探索器 V1、V6 同步。
4. 第 17 条（stdio 关闭），先红后绿。
5. 第 6–13 条与第 18 条。
6. 第 15 条守卫、第 16 条的簇与负控。
7. 门禁、度量、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行三个 MCP 成员的构建与测试（含慢层）、探索器、`mutate.ts`、仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增依赖、改第 1–5 条以外的契约条款含义、跑差分变异；度量只在验收第 9 条跑一次。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行的有 `w3-mcp-host-formal3`（另一棵树，TLC 吃 CPU）与调用口的表达闭包 `w3-mcp-call-docs2`（另一棵树）。成员测试用 `VITEST_MAX_WORKERS=4`；慢层、探索器与 `mutate.ts` 单独跑，不与成员测试叠加。不跑 `admission`、不跑仓库全量测试、不跑差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 第 3 轮评审与处置：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md
- 第 2 轮诊断与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md
- 上一轮修复规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-fix2.md
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T1–T9、R4、「真实传输兑现时的裁定」
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100

## 当前认知
- 已确认：C 的 `session-ended.mts`、`scripted.mts`、`scripted-close.mts` 三个探针在基线上复现 B1 与 P1。
- 已确认：`http-line.ts` 自 `2e4659c8f` 起没有改动；契约 `vitest.config.ts` 没有 `setupFiles`。
- 已确认：MCP 组之外没有包使用契约的脚本化传输（父分支 `9b60aad9e` 上 `grep` 核过）。
- 未知：脚本化传输改为先登记再授权之后，`@omne-harness/mcp` 的用例与探索器有没有依赖旧次序的断言。

## 返回与恢复
每个提交号；每条验收的命令、结果、输出尾部与日志哈希；第 2 条每项的「用例 → 缺陷 → 变红证据」；第 3 条的负控表；第 4 条的探索器读数；第 5 条的簇表；第 6、8 条的 `grep` 输出；命名账本；移动、改名或改形的契约导出；自定裁定与理由；写者声称的结构性改动清单（派发者逐条 `grep` 核实）；让排除文件里的句子过时的位置；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host/fix3/`。

## 已知会受影响的现有用例
- `tests/session.spec.ts:1490` 一带：共用流断开的用例，按第 2 条补授权中的断言。
- `tests/lines.spec.ts`「two overlapping writes, the first completes, then close()」与 `tests/conformance.spec.ts`「stdio: close() closes stdin, then cancels stdout」：关闭改为一律中止写端后，断言按「写端被结束、次序不变」改写，不放宽。
- 契约 `tests/transport-conformance.spec.ts` 与 `src/testing-transport.ts` 里「a call still being authorized when close() ran…」：`close()` 之后先开闸门的写法，改为闸门永不放开。
- 契约里依赖脚本化传输「先授权再登记」次序的用例：按新次序改，断言不放宽。
- 契约加守卫之后由未处理拒绝变红的用例：修被测代码或用例，不放宽守卫。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 已定的事与契约条款冲突，或在任何实现下都兑现不了。
- 同一用例连试三种做法仍红。
- `@omne-harness/mcp` 的用例因契约改动变红，且修法要改 `packages/mcp/mcp/`。

## 追加记录
- 2026-11-06 03:17 派发前：五面全部交回并处置（A 03:10 交回后补第 17、18 条与结构诊断）。工作树干净，head `720a5d08a`。简报检查退出 0；`caller-outside-scope` 警告中落在 `packages/mcp/` 的 155 条，除 `packages/mcp/mcp/src/internal/table.ts`（`close` 等同名标识符）外都在写范围目录里（检查器按文件精确匹配）；`packages/mcp/mcp/` 已在「排除的调用方」写明只跑用例。并行：`w3-mcp-host-formal3`（02:56 派出，另一棵树）。
- 2026-11-06 03:21 追加（写者在跑）：澄清第 2、18 条与开头一句。线路级断开（`die`，一切原因）只结算依赖线路的两相：授权中 → 「未发出：`connection-unavailable`」；已交给线路 → 按原因 `no-answer`（会话结束时不动）。授权发现中的请求不动，发现做完照常以 `authorization-required` 结束（结论已由先到的 401 定下，发现不经线路）。开头「`dead` 与 `signal`、`close()` 一样只是又一种停」改读为：共用同一条相规则，但只作用于依赖线路的两相。formal3 交回的交叉核对点一并转给写者：`begin` 与 `authorize` 在不可用时既不登记也不调用句柄；读类再发经 `begin` 被拒，答「未发出」；迟到的 404（在途项已结算）不触发 `die`。依据 `reviews/mcp-host-r3.md` 同名一节。
- 2026-11-06 04:26 续派：写者被宿主 429 限流中断（5 小时额度，与 `w3-mcp-call-fix3` 同时）。工作树事实：7 个提交到 `184a29b9a`（04:18），树干净，没有在跑的测试进程；交回前最后一句是「验收 1 在跑时先写簇表（第 16 条、验收 5）」。续用原写者（保留上下文与施工理解，P18）。要求：先 `git status`、`git log -1` 核对；验收 1 若没有留下完整日志就重跑；然后接着做簇表、门禁、度量与交回。
- 2026-11-06 04:54 交回（`delegate/handbacks/w3-mcp-host-fix3.md`），head `3a79454d0`，9 个提交，树干净。派发者核对：改动全在写范围（两成员 `src/`、`tests/`、两份 SPEC、契约 `vitest.config.ts` 与 `docs/public-api.md`）；作者、提交者与 trailer 正确；结构声明逐条 `grep`：`session.ts` 没有 `authorized` 字段、没有 `session-ended` 的提前返回，`die` 循环 `lineGoneAnswerOf`，`classify` 第二句 `phase.kind !== 'sent'`；`stdio-line.ts` 没有 `writer.close` 与写计数；契约 `vitest.config.ts` 有 setup 守卫；契约 `lineGoneAnswerOf` 对授权发现中的请求不结算（03:21 澄清）。自定 1–7 全部采纳（第 1 条 `fetchOrNothing` 的 `try/await` 比规格的 `Promise.resolve().then` 更好：取回仍在当下发起；第 4 条余下的否定等待断言「界内不发生」，deferred 表达不了）。验收第 2 条四条基线已绿的项由负控或手工变异证明用例敏感，接受。合入 formal3 为 `72f977c81`（只动 `verification/models/`），派发者在合并结果上复跑（04:55–04:59）：七项轻门禁全部退出 0、CRLF 0、三包 `build typecheck test` 退出 0（254/669/399，19 个任务 15 个命中缓存），日志 `tmp/closures/w3-mcp-host/owner-fix3/`（turbo `0486e372ce153801`）。已推送。
