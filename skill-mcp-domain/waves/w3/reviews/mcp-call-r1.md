# w3-mcp-call 第 1 轮评审（PR #1141，head `7d91a330c`，范围 `b2ba7dc89..7d91a330c`）

简报：`mcp-call-r1-briefs.md`。A、B、C 三路并行；D（差分变异）本轮不跑，在最终 head 上跑；E 在证据上卡之后派。并行的 `w3-mcp-call-model` 在另一棵树扩展探索器与 TLA+ 模型。

## C. 设计与实践（general-purpose，opus，high）

探针在 `/tmp/call-c-probe/`，用 `vitest --config /tmp/call-c-probe/vitest.config.mts <名>` 跑在真实的 `assemble` 上。职责划分判为正确：`calls.ts`、`tasks.ts`、`in-flight.ts`、`task-table.ts`、`assembly.ts` 各管一件事；`Send` 是判别联合；`Spawn` 视图拿不到 `exit`；装配只写一遍；`invoke` 与 MC-16 第 1–13 步逐步对应。

阻断：

1. `calls.ts` `abandon`（`:150-158`）`await` 了 `cancelRequest`，没有上界。旧修订的 Streamable HTTP 上它是一次 POST。探针 `cancel-request-hang.spec.ts`：`cancelRequest` 永不兑现时，中止后 20 轮事件循环 `invoke` 仍未返回。违背闭包性质「取消后不等对端」、MC-16 第 12 步「一次，不等对端」、DP-06。
2. `calls.ts` `sendOn`（`:200-206`）：`classifyOutcome` 里调用的宿主端口 `checkOutput` 抛出时，在途表项停在 `sent`，整个运行期不结束。探针 `throwing-validator.spec.ts` 第一例：`invoke` 以宿主错误 reject；之后同键 `cancel` 答 `signalled`；同键再 `invoke` 一直答 `correlation-key-in-use`。表项的退出口散在 6 处（`refused`、`cancelled`、`abandon`、发出前 `not-sent`、T9、正常结束），漏一处就泄漏。另有契约缺口：校验函数抛出算端口违约还是本包错误照常抛出，T9 与 MC-15 都没写。
3. `tasks.ts` `taskResult`（`:157-163`）：`resultOf`（含 `classifyOutcome` 与 `checkOutput`）在 `ask` 的闭包里执行，违反 MC-15 的 F4 裁定（`ask` 只包端口调用）。探针第二例：校验函数抛出时答 `effect-unknown`（`abandoned`），而对端已答（`tasks/get` 计数 1）。与第 2 条是同一缺陷的两种去向。
4. `in-flight.ts` `markSent`（`:268-284`）记下的是视图在 `await transport.call(...)` 之后的实时代际，不是发出代际。探针 `marksent-generation.spec.ts`：第 1 代发出，`call` 返回前连接 `lose` 并经 `refresh` 重建到第 2 代（视图对象相同），`markSent` 记成第 2 代；之后 `cancel` 答 `signalled`，对已关闭的旧传输发了 `cancelRequest`。MC-12 要求答 `unknown`、不触发。`in-flight.spec.ts` 的对应用例在 `markSent` 之后才挪代际，新旧实现都放过。

非阻断：(1) `perform` `:261` 建连期间只在调用方 `signal` 下等，`cancel` 要等建连结束才生效（与 MC-16「两者合成一个停止信号」不一致；有建连时限，不会挂住）；(2) `reserve` 与 `stopOf` 两步留下死分支（`calls.ts:235-237`），`reserved` 的 `cancelled` 与 `stop.signal.aborted` 重复；(3) `tasks.ts` `connectionOf` 重写了 `guard.ts` 的「撤采用时关闭」；(4) `connectionOf` 先复用后判关停，与 MC-17 次序相反，靠 `closeAll` 同步关掉 `ready` 条目才正确；(5) `calls.ts` `lose` 与 `tasks.ts` `losing` 相同，`discovery.ts` 也内联一份；`tasks.ts` `failureOf` 的 `not-sent` 映射重写了 `connectionFailureOf`；`sendOn` 两次展开 `outputSchema`；(6) `TaskRecord.issuedAt` 写而不读；(7) `createTasks` 收 `CallsDependencies`、`InvokerDependencies = CallsDependencies`，依赖类型方向反了；(8) 观察函数错误按 S6 吞掉，与 DP-05 有张力，没有诊断出口（归契约 S6）；(9) `cancel.spec.ts`「races the send」（`:130-146`）等用 `settled()` 排次序，没核对调用已到 `transport.call`，一轮不够时走不到 T5 分支照样通过；同类 `:57`、`:148`；(10) `sendOn` 6 个位置参数。

未覆盖：`tests/model/` 的改动；结构读数；表达；差分变异；交付边界；L3 隔离没有逐行核。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

`lint:deps` 退出 0；`metrics --coverage --base b2ba7dc89` 退出 0，覆盖率运行里 `lifecycle.spec.ts > wide > P1–P8 hold` 超 600 s 时限（未归因，`triage` 不适用于覆盖率运行）；产物 `tmp/metrics/7d91a330c/`。探针 `/tmp/ir-call/probe/probe.spec.ts`（副本 `mcp-call-r1-probes-a/`）。

阻断：

- A1（同 C1）：`calls.ts:156` 等 `cancelRequest` 无上界。P1：`cancelRequest` 永不兑现时，`cancel` 答 `signalled` 后 20 轮事件循环 `invoke` 仍 `pending`。
- A2：第 2–5 步（关口、配值、已知动作、续调用核代际）期间收到的 `cancel`，之后那一步拒绝时，原调用答拒绝原因而不是 `cancelled`；`refused`（`:238-241`）不看停止信号，`release` 删掉了已标 `cancelled` 的占位，之后的 `cancel` 答 `unknown` 而不是 `no-call-in-flight`。P2：`invoke= not-sent(definition-changed)`，second cancel= `unknown`。违背已定事项 3 与契约 S2。成员 SPEC MC-16 也只在第 7、9 步看停止信号，SPEC 的次序同样要改。
- A3（同 C2）：`checkOutput` 抛出时 `invoke` reject、占位停在 `sent`。P4：`rejected: Error: schema is invalid`，之后同键 `correlation-key-in-use`、`cancel` 答 `signalled`。对端答 `resultType: 'task'` 时 `tasks.record` 在抛出点之后，任务不登记，对端那边有一个没人能查询、取消或交输入的任务。输入可由对端控制：对象形式但不合法的 `outputSchema` 会让常见 schema 引擎编译时抛出。

非阻断：B1（同 C3）`taskResult` 的分类在 `ask` 里，P5 答 `effect-unknown(abandoned)` 而 `tasks/get` 计数 1；B2 度量红项没交代：`perform` CC 17、`sendOn` CC 12（CRAP 12.1）、`discovery.ts publish` CC 17（原有）、`tasks.ts failureOf` CRAP 13.1（覆盖 50%）、`failureOfEnsure` 覆盖 0（CRAP 12）、`table.ts begin` CC 12；B3 SPEC 写明而没有用例执行到的分支：`calls.ts:181-182`（T9 违约）、`:262`（`ensure` 期间 `signal`）、`:265-267`（`ensure` 之后再核代际与停止信号；删掉 `:265-266` 时续调用会在新代际发出，现有用例全过）、`tasks.ts:42-43`/`:85`（MC-17 第 3 步的 `ensure` 映射）、`:101-102`（任务请求 `not-sent`）；B4 M17 存活已交代。

范围外待裁：(1) `checkOutput` 抛出由谁吸收；(2) 第 3–5 步的端口读取不受调用方信号约束（P3：存储 `read` 永不答复，中止后 `invoke` 仍 `pending`），`discovery.ts` 原有同样写法。

未覆盖：慢层本次没有验证成绿；全套 `check`、真实组合；`table.ts` 其余段、`build.ts`、`teardown.ts` 的改动、`tests/model/*`。观察：`discovery.ts` 的 `not-sent(session-ended)` 失联原因由 `stream-broken` 改为 `session-ended`，`refresh` 的可观察行为变了，交付说明没提。

## 根因与卡拥有者的裁定（A、B、C、E 合并）

A 与 C 独立指向同一类问题：调用口的占位与异步副作用没有单一的拥有者。占位的退出口散在 6 处（C2），每处各自决定撤销还是结束，于是有的路径漏掉（A3、C2），有的路径选错（A2：已取消的占位被当作拒绝撤销）；等待点各自决定在哪个信号下等，于是有的在调用方 `signal` 下（第 8 步）、有的在停止信号下（第 9 步之后）、有的不受任何信号约束（第 3–5 步的端口读取、`cancelRequest`）。这与 host 第 1 轮的第二个根因同类。修法不是逐个补洞，而是让 `perform` 从占位起拥有这次调用的全部生命周期：

1. **一个出口**：`perform` 自 `reserve` 起用一个 `try/finally` 收口。按当时的阶段结算：没有发出且停止信号已到期 → 键转为已结束、答「未发出：`cancelled`」；没有发出且未到期 → 撤销占位、答拒绝原因；已发出 → 键转为已结束。不再有分散的 `release`/`markEnded`。`InFlightCalls` 给出按阶段收口的方法；`reserve` 直接交出停止信号（删掉 `stopOf` 与重复的 `cancelled` 字段）。
2. **一个停止信号管全部等待**：从占位起，发出之前的每个等待（关口、配值、已知动作的存储读取、`ensure`）都用 `within(…, stop, scope)` 在停止信号（调用方 `signal` 与 `cancel` 合成）下等，端口调用本身继续由表的作用域承接；到期一律答 `cancelled`。这同时闭合 A2、A 待裁 (2)、C 非阻断 1、B 的 N6：MC-16 写成「从占位起，`cancel` 与调用方中止走同一个停止信号」。`discovery.ts` 的同类写法不在本轮（它没有调用方信号），登记为已知限制。
3. **发出后不等对端**：`cancelRequest` 交给表的作用域（`scope.spawn(ask(...))`），不 `await`（A1、C1）。
4. **发出代际**：`markSent(key, connection, generation)`，`generation` 取 `ensured.generation`（C4），补「`call` 返回之前连接换代」的用例。
5. **本包计算不进 `ask`**：`taskResult` 的 `resultOf` 移到 `ask` 之外（A B1、C3）。
6. **`checkOutput` 抛出**（A 待裁 1、C2 的契约缺口）：吸收点放在契约的 `classifyOutcome` 里，使 O1「全函数，不抛出」名副其实，调用与任务两条路径共用一处。结论取 `violates`，原因是新的契约值 `output-check-failed`：校验没有给出结论时，结构化内容不能当作符合 schema（偏安全），原因文本让消费者区分「校验失败」与「输出不符」。契约 O3 补这一句，`classify.ts` 与它的用例归本修复轮（不在 host 的写范围里，不冲突）。
7. **任务操作**：`connectionOf` 先判关停再复用（C 非阻断 4，MC-17 次序）；`guard.ts` 抽出「判定，并在撤采用或被挡下时关闭」，两边共用（C 非阻断 3）；`ensure` 失败的映射按 B 的 N7 裁定（任务请求没发出 → `connection-unavailable`；`no-connection` 只给 S2 的「不能新建」）；`failureOf` 的 `not-sent` 映射改用 `connectionFailureOf`（C 非阻断 5）。
8. **其余代码非阻断**：`lose` 收进一处（C 非阻断 5）；`TaskRecord.issuedAt` 删掉或写明读者（C 非阻断 6）；依赖类型方向（C 非阻断 7）；`races the send` 等用 `reached` deferred 代替 `settled()`（C 非阻断 9）；`sendOn` 改对象参数（C 非阻断 10）；`ContinueRequest` 两个字段都缺时的答复写定并加用例（B 的 N13）；B3 列出的未执行分支每处补一条会失败的用例；度量红项重构后在交回里逐条交代（A B2）。
9. **证据**：E 的验收 2、9 与性质缺口 (3)–(6)：第 9 步的用例或说明；「不重发」「取消后不等对端」与映射表缺的行各补变异；全部手工变异在最终 head 上重跑；卡上补七项门禁的输出尾部与日志哈希；慢层在最终 head 上以 `test:slow` 重跑，附退出码。

B1（转 `lost` 比 S7 宽）按 B 的裁定登记偏离，契约补标记归计划 6b。

C 非阻断 8（观察函数错误按 S6 吞掉）：维持 S6，不在本轮；登记为契约侧的已知张力。

本轮分两个闭包：代码修复（含受行为影响的成员 SPEC 节 MC-12、MC-15、MC-16、MC-17、偏离表、未覆盖与变异表）与文档（README 两种语言、`docs/`、B 的编号与复述漂移项、契约 SPEC 的依据表）。`w3-mcp-call-model` 的结论回来后，若修复轮还在跑就追加给它，否则并入第 2 轮。

## B. 表达（design-reviewer，opus，xhigh）

阻断 1，非阻断 13。`check:docs`、`check:design` 退出 0（只核链接与出处）。评审者没有 git，基线一侧借 `.worktrees/skill-mcp` 的检出代替 `b2ba7dc89`。

阻断：

- B1 调用与任务请求转 `lost` 的规则比契约 S7 宽，没有登记偏离。成员 MC-16 映射表第 5、7 行（`:137`、`:139`）、第 13 步（`:127`）、MC-17 第 4 步（`:149`）按原因转 `lost`；S7（契约 `:344`）只在 T8 结论带「传输不再可用」时转。HTTP 上 `tools/call` 答 400 纯文本（C05）或 5xx（C04），任务请求 O06–O08 同类，连接仍可用却被判 `lost(stream-broken)` 拆除，整份清单被标为不可用（C7），之后每个动作在第 5 步答 `action-unavailable` 直到 `refresh`；状态视图报「通道断了」。`TransportFailure`/`PeerAnswer` 不带这个标记，成员只能按原因猜。`docs/architecture.md:23`、`lost.ts:1-2,25` 的注释说法相同。

非阻断：N1 发送次序两套步号（MC-16 自己的 1–13 与已定事项 28 的 28.n），用例标题与 `calls.ts` 注释写「step N」指的是 28.n，`cancel.spec.ts:82,101` 指错步；N2 `verification/README.md` 一页两套 M 编号冲突（生命周期 M1–M28 与调用口 M01–M34），`:3` 的范围与 `:130`「没有 M11」已不成立，新记录没绑定运行时的 head；N3 MC-12 `:82` 声称 M17 让 `cancel.spec.ts` 变红，与 `:214` 和 `red/M17.log`（7 通过）矛盾；N4 映射表第 1、2、4 行「每行一个能翻转它的变异」没有证据（M01–M34 无对应，第 1 行引的用例测的是 `prepareSettings`）；N5 第 7、8、10 步答 `cancelled` 时键的去向没写，与开头「撤销占位」规则冲突，契约 S2 下 `cancel` 会答 `unknown` 或 `no-call-in-flight` 两种；N6 `cancel` 能否打断第 8 步建连等待两种读法（`:116` 合成停止信号、`:122` 只在调用方 `signal` 下等、`docs/architecture.md:51` 走同一条路）；N7 MC-17 第 3 步对 `ensure` 失败的映射与 R7、MC-16 不一致（`discover` 无应答答 `effect-unknown(stream-broken)`，时限先到或关停答 `no-connection`）；N8 MC-17 没写 `TaskRef.issuedAt` 的处置；N9 MC-11 `:78` 的操作列表、`:169` 关停之后的答复过时，`:165`/`:166` 重复；N10「未覆盖」没写调用口的并发没有形式化证据；N11 `docs/architecture.md:51-53`、`docs/flows.md:94` 新增机制复述，`README.md:95` 覆盖声明超出证据；N12 契约 S3 必填 `checkOutput` 与可选 `inputResponses` 没记依据，`:54` 前言像涵盖全部改动，对构造 `McpPorts` 的宿主不是可加改动；N13 `ContinueRequest` 两个字段都缺时的答复没写（实现发 `{}`）。

跨文件矛盾 14 条（原报告），另有：`docs/architecture.md:37`「只有两个 `class`」与 `TaskTable` 矛盾；`README.md:99` 的 S2 模块对照漏 `task-table.ts`；`README.md:64` 把 `continueWithInput` 列为会建连；契约 R2 `cancelled` 定义为「收到了 `cancel`」，而第 7–9 步对调用方自己中止也答 `cancelled`。

范围外待裁：(1) S7 的触发条件服务看不到；(2) 契约 R1「资格非 `granted` 只答 `Refusal`」与 S2 任务操作答 `effect-unknown(no-connection)` 冲突，组页 `architecture.md:497,504` 的 `cancelTask` 与 S2 不一致；(3) N7 若需 R7 扩大 `no-connection`。

### 卡拥有者对 B 的裁定

- B1 成立。根在契约形状：传输的答复不带 T8 的「传输不再可用」，服务只能按原因猜，而原因猜不准（stdio 流断开是死、HTTP 单个请求的流断开不是、旧 HTTP+SSE 模式的共用流断开是，后者只有传输自己知道）。正确的修法是传输把「不再可用」作为事实交出，这是契约 T 段的形状改动，`host` 正在改这一段，`mcp` 的传输替身也要跟着改，不放进任何在途闭包。本轮：成员偏离表登记这条按原因判断的规则：采用的判定、原因（服务看不到标记）、方向（偏安全：多拆一次连接只损失可用性，不会把死掉的传输当可用，也不给出错误结局）、退出条件（契约给出标记之后对齐）；`docs/architecture.md:23`、`lost.ts` 注释改成同一口径。契约补标记另开闭包，排在 host 合入之后（计划「6b」）。
- 范围外待裁 (1)：同上，归那个闭包。(2)：R1 与 S2 的冲突归契约，组页波末写回；先登记进计划，契约改句随 6b 一起做。(3)：N7 的口径与 MC-16 取同一个，不扩大 R7。R7 的 `OperationFailure` 含 `ConnectionFailure`，所以任务操作新建连接时：`discover` 无应答（建连阶段的 `EffectUnknown`）与时限先到、建连途中关停，任务请求都没有发出，答 `connection-unavailable`，不答 `effect-unknown`；`effect-unknown`（`no-connection`）只留给 S2 的「不能新建」（没有采用材料、资格不是 `granted`）。MC-17 第 3 步按此改写，加对应用例。
- N1–N13 与漂移清单全部随修复轮改。

## E. 交付边界（general-purpose，sonnet，medium）

依据：卡 #1119 正文、证据评论 6659833572、闭包规格、工作树。验收 1、3–8、10 达到；2、9 未达到：

- 2：第 9 步没有标签用例，卡上也没说明第 9 步在发出之后、不产生「未发出」。
- 9：卡上只有 `lint:deps` 的尾行与 turbo 日志的哈希；typecheck、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs`、`check:design` 只写「七项全部退出 0」，没有输出尾部与日志哈希（lifecycle 第 2 轮同类缺口靠评论 6656276783 补齐）。

性质及证据义务的缺口：(3) 「不重发」三项只有换代后的 `continueWithInput` 有变异（M19），发出后取消不重发、任务 `no-answer` 不重发没有；(4) 「取消后不等对端」没有变异；(5) 映射表「每行一个变异」缺：建连阶段 `credential-unavailable`、`landing-unavailable` 原样，加入方到期 `{connect, pending}`、排队到期 `{settings}` 两种形状，写者自裁 1、2、6；(6) 变异批跑在 `c3b8779b0` 之后的树上，head 的 `lose` 收口之后没有重跑，M08、M09、M13、M33 对 head 过期。说明：M17 存活仍未清；差分变异与 `w3-mcp-call-model` 的结论未回，PR 不是终态。

冲突项：

1. 已定事项 7「`McpPorts.checkOutput` 必填」与卡「契约变更：additive」「两契约成员只做可加改动」：必填字段让构造 `McpPorts` 的实现编译失败，类型上不是可加；已定事项 4（`inputResponses` 改可选）对读取它的实现方是收窄。
2. 已定事项 5 取代波段规格已定事项 31「`cancelTask` 不为取消启动新进程」与 MC3-7「`cancelTask` 不建连」，波段规格原文没改。
3. 已定事项 9 收窄波段规格已定事项 19、27（改用契约的脚本化传输），波段规格原文没改。
4. 已定事项 6 与写者自裁 10 的「连接键（租户、持有、对端账户）」与卡文「连接键含租户、持有、采用修订与对端账号」、契约 `ConnectionKey` 四项不一致（风险低，MC-17 措辞已区分）。
5. 追加记录（13:30）的形式化义务卡文未载，卡的验证拥有者表与 C3–C4 判据没有形式模型。
6. 卡 W3 行写 `w3-mcp-call`「首项是连接表遗忘谓词等 W2 已知限制」，闭包目标边界没有这一项（遗忘谓词已随 lifecycle 合入，在 MC-14）；卡「当前执行与交接」仍写「W2 已收波，准备开 W3」。

### 卡拥有者对 E 的裁定

- 1：维持已定事项 4、7。本卡的「可加」指公开形状，与 skill-fix 裁定第 1 条、host 第 1 轮裁定 1 同一口径。`checkOutput` 必填的依据是 O1 已写「注入的输出校验函数」，没有它 `classifyOutcome` 无法如实给出 `conforms`/`violates`（结局如实）。消费者核对：两个 MCP 成员之外，仓库里没有任何地方构造 `McpPorts` 或读 `inputResponses`（`git grep` 0 行），按 0.x 的演进政策同步真实消费者即可。契约 SPEC 的依据表补这两条出处（同 B 的 N12），卡正文的 additive 在波末加限定（计划波末已有一条）。
- 2、3：闭包规格的取代与收窄是派发时的裁定，有理由；波段规格 `waves/w3/mcp/spec.md` 的已定事项 19、27、31 与 MC3-7 在波末写回时同步（与 MC3-10 一起，计划波末加一条）。
- 4：口径以契约为准。任务表记的是连接键的三项投影（租户、持有、对端账户），不含采用修订是有意的：采用修订变了、账户没变时，任务仍属于同一账户；SPEC 用「任务的连接身份」而不叫「连接键」，修复轮把这句理由写进 MC-17。
- 5：形式化义务写进卡判据：卡正文「测试/验证拥有者」与 C3–C4 判据在波末加「新代码的并发在探索器与 TLA+ 模型的守护之内」（负责人 2026-11-05 要求）；本轮交付边界按闭包规格追加记录判。
- 6：卡正文陈旧，波末更新（W3 闭包的分法与进展）。
- 验收 2、9 与性质缺口 (3)–(6)：随修复轮补：第 9 步的用例或说明；卡上补七项门禁的输出尾部与日志哈希；「不重发」「取消后不等对端」与映射表缺的行各补变异；在最终 head 上重跑全部手工变异（`lose` 收口之后的 M08、M09、M13、M33 必须重跑）。
