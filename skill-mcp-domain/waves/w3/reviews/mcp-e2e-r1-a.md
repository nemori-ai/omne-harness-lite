# PR #1149 评审 r1 · A 面（正确性）

- 对象：分支 `PanQiWei/skill-mcp-w3-mcp-e2e`，head `71b4b02f3`，基线 `3289bee2f`。改动只在 `packages/mcp/mcp-host-local/tests/e2e/`、文档行与一个 devDependency，没有 `src/` 改动。
- 依据：闭包规格 `delegate/closures/w3-mcp-e2e.md`（第 3 条表、第 4、5 条、实施规格、性质及证据义务、追加记录）；契约 `mcp-contract/SPEC.md` 的 S2、S7、S8、O2、O3、O6、T5、PL1、PL5；调用口 `mcp/SPEC.md` 的 MC-10、MC-12、MC-16、MC-17。
- 运行：只读工作树（结束时 `git status --short` 为空）。变异在副本 `/tmp/r-a-e2e`（rsync 自工作树，根 `node_modules` 与 `.venv` 软链回工作树，副本的 `.git` 已删除）。每处变异改一个源文件，重建被改的包，在 `packages/mcp/mcp-host-local` 下运行 `VITEST_MAX_WORKERS=4 pnpm exec vitest run tests/e2e/journey.spec.ts --mode slow --typecheck.enabled=false`，然后用 `cp` 从工作树还原、`cmp` 核对，再重建。日志与 diff 在同目录 `mcp-e2e-r1-a-logs/`，哈希取 sha256 前 16 位。
- 结论：**阻断 0，非阻断 11。** 第 3 条表的每一个期望都有断言，每一步现在都有变异证据。没有发现违反规格表或契约不变式的地方。

## 1. 各步断言对照第 3 条表

| 步 | 表里的期望 | 用例断言（`journey.spec.ts`） | 判断 |
| --- | --- | --- | --- |
| S1 | `published`；清单含已知工具名 | :114 种类；:119 `acquired`；:121 `toContain(known)`；另加 :126 协商修订 | 齐全，比表更严（修订） |
| S2 | `complete` | :138–140 种类，并核答复文本 | 齐全 |
| S3 | `toolError` | :150–152 种类，并核文本非空 | 齐全 |
| S4 | 先 `inputRequired`，后 `complete` | :164、:182 两段种类；:179 服务端读到答复 | 齐全 |
| S5 | `task`，终态 `completed`，结果 `complete` | :194、:211、:216 三段；:210 途中必经 `input_required`；:215 报告文本 | 齐全，:210 比表更严（N9） |
| S6 | `cancel` 答 `signalled`；`invoke` 答 `unknown`（`abandoned`） | :238–241 拼成 `signalled>unknown:abandoned`；`sentOutcome` 遇 `not-sent` 抛出 | 齐全；前提见 N1，旁路见 N2 |
| S7 | `released`；stdio 为确认的停止范围，HTTP 为 `no-process`；无遗留 | :254 种类；:255 `toBe(started.released)`；:256–257 stdio 时 `leftover()` 为空；`afterEach` :295–297 再核 | 齐全；HTTP 一侧见 N3 |

「过宽」的检查：每一步的期望用 `toBe(step.expected)` 比较整串（:282），种类串含每一段，所以一段错就红。S6 的取消太早时，调用答 `not-sent`（`cancelled`），`sentOutcome` 抛出（:64），结果是红，不是假绿。S7 的 `process` 与替身 `stop()` 的答复比较。这个值来自端口，调用口只负责照实转交（契约 S8、MC-10），所以这样比较正确。

## 2. 变异读数（运行时 head `71b4b02f3`）

基线（未变异）：6 条全绿，`base.log` `4a4b9f976356fd4b`。

| 编号 | 变异（文件） | 读数 | 日志哈希 |
| --- | --- | --- | --- |
| mD2 | `mcp-host-local/src/session.ts` `discover()` 开头直接走旧一路 `legacyPath()` | E-stdio、E-http、F 在 S1 红：`S1: the negotiated revision: expected '2025-11-25' to be '2026-07-28'`。P 在 S1 红：`expected 'kept' to be 'published'`。E-sse 绿（本来就是旧修订）。MC3-12 红 | `f962dfce24ce323a` |
| mE2 | `mcp/src/discovery.ts` 交给 `completeListing` 的每页去掉第一个工具 | E-stdio、E-http、E-sse、P 在 S1 红：`S1: the listing has the known tool … to include 'echo'`（P 为 `'fetch'`）。F 绿：`read_text_file` 不在第一位。MC3-12 红 | `bf37130dcb26b95a` |
| mF | `mcp-contract/src/classify.ts` 的 `completed()`：`complete` 的内容清空 | 五个目标都在 S2 红：`S2: the content of the answer: expected '' to contain …`。MC3-12 红 | `fb24e8bbbfa254b2` |
| mB | `mcp/src/calls.ts` 的 `continuationOf`：不带 `inputResponses` | E-stdio、E-http 在 S4 红：`expected 'inputRequired>inputRequired' to be 'inputRequired>complete'`。MC3-12 红 | `70cd2e69c6670e39` |
| mC2 | `mcp-contract/src/composition.ts` 的 `updateTaskRequest`：`values: {}` | E-stdio、E-http 在 S5 红：`provideTaskInput failed: … -32602 … inputResponses is required`。MC3-12 红 | `dd34634656114462` |
| mA2 | `mcp/src/internal/table.ts` 的 `close`：报告固定为 `process: 'no-process'`（进程照停） | E-stdio、F、P 在 S7 红：`S7: the confirmed stop range: expected 'no-process' to be 'root-only'`。E-http、E-sse 绿（本来就是 `no-process`）。MC3-12 红。补上交回 4.4 没做的「报告 `no-process`」一支 | `54000206f94899d3` |
| mA | `mcp/src/internal/teardown.ts` 的 `stopProcesses` 末尾 `return 'no-process'` | 全绿。在报告这一层是等价变异：`stopOne` 把 `root-only` 记进 `lingering`，`confirmedOf` 再把范围收窄为 `root-only`。不是缺口 | `b014130a51f5dd0b` |
| mG | `mcp/src/calls.ts` 的 `answerOf`：停止之后不再 `cancelRequest` | 全绿（见 N2） | `0fd58fc0313b0318` |
| mH | `mcp/src/internal/teardown.ts` 的 `closeTransport`：不调 `transport.close()` | 全绿（见 N3） | `31c409e5d0533113` |

另有两次运行没有命中目标断言，只留作记录：mC（`tasks.ts` 传 `{}`）不是 json-text 树，`provideTaskInput` 在入口处失败，`d7a837eedd219357`。mD（`factory.ts` 只提供 `2026-07-29`）让 `refresh` 答 `connection-unavailable`，S1 在 `ok()` 处抛出，`1ba9a85956d71f10`。mE（改契约 `listing.ts`）让契约 `testing` 入口在导入时失败，没有运行用例，`5ffdb9b1b1cda208`。

加上交回 4.4 的三处（S3：m1；S6：m2 与 m2b；S7 不停进程：m3），S1 至 S7 每一步都至少有一处变异能打红。

## 3. 发现

### N1 非阻断 · S6 的「请求发出之后」靠固定等待，E-http 上实际走的是占位分支

- 位置：`tests/e2e/journey.spec.ts:31`、`:237`；`tests/e2e/targets.ts:80`、`:88`。
- 反例或缺失：用例在 `invoke` 之后睡 300 ms（`SEND_GRACE_MS`）就 `cancel`，没有证据表明请求已经到达对端。交回 4.4 的 m2 与 m2b 说明：在 E-http 上过了 300 ms，在途表里这次调用仍是 `reserved`（传输的 `call` 还没交回 `SentCall`）。所以闭包验收 3 点名的变异（「发出后的取消不结束等待」，只改 `sent` 分支）打不红 E-http，要再改 `reserved` 分支（m2b）才红。结局本身没问题：传输在「已交给线路」之后收到信号，交出 `SentCall`，`answer` 答 `no-answer`（`abandoned`）（T5）；调用口答 `sent`、`unknown`（`abandoned`）（O6、MC-16）。取消太早只会让用例变红（`not-sent` 时 `sentOutcome` 抛出），不会假绿，所以这是前提不稳，不是错判。
- 建议：让长时工具尽早发进度（例如 `steps` 取到每秒一步），经调用的 `observe` 等第一条进度再 `cancel`。这样请求一定已经到达对端，三个目标都走 `sent` 分支，只改 `sent` 分支的变异就能打红全部三处。
- 依据：闭包第 3 条表 S6「请求发出之后」、验收 3「取消」；契约 S2、T5、O6；MC-12（`reserved` 与 `sent` 两个阶段）。

### N2 非阻断 · S6 观察不到对端是否被告知取消

- 位置：`tests/e2e/journey.spec.ts:238–241`。
- 反例：变异 mG（停止之后不再调 `cancelRequest`，stdio 与旧修订上就不发 `notifications/cancelled`）让三个目标全绿。stdio 上的长时操作照样跑完 60 s，S7 再杀掉进程。
- 说明：第 3 条表的 S6 只要求两个答复，所以不阻断。T5 与 MC-16 要求的「告知对端一次」由 `mcp/tests/cancel.spec.ts`、`invoke.spec.ts` 与 `mcp-host-local/tests/stdio.spec.ts:259` 守住，端到端旅程没有覆盖这一点。SPEC「组合与验证」一行如果写成 S6 证明取消到达了对端，就是说多了（措辞归 B 面）。
- 依据：契约 T5；MC-16。

### N3 非阻断 · HTTP 目标的 S7 只能经报告字面值打红

- 位置：`tests/e2e/journey.spec.ts:255–257`。
- 反例：变异 mH（`release` 不调 `transport.close()`）五个目标全绿。E-sse 的共用 SSE 流与 E-http 的连接留着，S7 与 `afterEach` 都看不到。stdio 一侧有遗留检查兜底；HTTP 一侧只有 `toBe('no-process')`。
- 说明：表里的 S7 不要求核对传输已关闭，所以不阻断。MC-10 的关闭次序由 `mcp/tests/release.spec.ts` 守住。
- 依据：闭包第 3 条表 S7；MC-10。

### N4 非阻断 · 「适用」列只对两个现代目标核了实际跑的步

- 位置：`tests/e2e/journey.spec.ts:55–56`、`:279`、`:321`。
- 缺失：每个目标跑哪些步由 `applies` 决定，用例只断言 E-stdio 跑了 S1 至 S7（:321），E-http 借 MC3-12 的相等也跟着被核到。E-sse、F、P 实际跑的步集合没有断言：从某一步的 `applies` 删掉 `'E-sse'`，那一步会静默不跑，用例照样绿。现在的 `applies` 与规格表一致，所以没有错，只是数据表与「适用」列之间少一道核对。另外，`TargetCalls` 的注释（`targets.ts:18`）说「缺调用的步不适用」，但实际起作用的是 `applies`，缺调用时抛出。两种说法不一致，好在后者只会变红。
- 建议：每个目标带一份期望的步号表，对 `taken.map(r => r.step)` 断言。
- 依据：闭包第 3 条「适用」列、目标与适用表。

### N5 非阻断 · MC3-12 的比较按结构不会因种类不同而红

- 位置：`tests/e2e/journey.spec.ts:279–284`、`:312–322`。
- 说明：它确实只用一个 `toEqual` 比较两个 `步:种类` 数组，满足第 4 条。但是只有每一步都过了 `toBe(step.expected)` 之后，结果才写进 `readings`（:282 在前，:284 在后），所以写进去的两个数组必然都等于同一张期望表。这个比较只会以「`E-stdio journey ran: expected undefined to be defined`」的形式变红（m2 日志与本轮 mA2、mB、mC2、mD2、mE2、mF 都是这样），看不到两种传输在哪一步不同。它还依赖同一文件里的用例次序：用 `-t` 只选它，或打开 `sequence.shuffle`，它会变红（不会假绿）。
- 建议：在逐步断言之前（或在 `finally` 里）记下读数，让 MC3-12 自己报出不同的那一步。
- 依据：闭包第 4 条。

### N6 非阻断 · `closeAll` 拒绝时会跳过关闭目标，并盖掉原来的失败

- 位置：`tests/e2e/journey.spec.ts:288–292`。
- 反例：`closeAll` 可能以 `AggregateError` 拒绝（MC-10）。这时 `finally` 里的 `await started.close()` 不执行：F 的临时目录留下，P 的本机页面服务端留着监听。HTTP 的 server-everything 由 `afterEach` 的 `leftover()` 杀掉。`finally` 抛出的错误还会取代那一步原来的断言失败，失败读数被换掉。
- 建议：`started.close()` 放进内层 `finally`。
- 依据：闭包实施规格（失败路径不留进程）；MC-10。

### N7 非阻断 · 用例超时后旅程仍在后台运行

- 位置：`tests/e2e/journey.spec.ts:303–307`，S6 的 `await invoking`（:239）。
- 说明：每个用例时限 100 s，低于慢层的 120 s，`queryTask` 最多轮询 40 次、间隔 500 ms，满足实施规格。到时限时 vitest 不会中止 `journey()`：`afterEach` 先跑，`leftover()` 杀掉并等完已登记的子进程，所以不会挂住，也不留进程。但旅程的余下部分（`finally` 里的 `closeAll`、迟到的拒绝）会落进下一条用例的时段，可能让 `tests/unhandled.ts` 在下一条用例上报错。只影响失败时的读数。
- 依据：闭包实施规格「等待都有界」。

### N8 非阻断 · 输出校验替身的计数没有用到，旅程也没有走到它

- 位置：`tests/e2e/assembly.ts:82–86`、`:102`。
- 说明：替身形状符合 `OutputValidator`（`outcomes.ts:60`），对任何值答 `conforms` 并计数，符合第 2 条。但 `outputChecks()` 没有被任何断言读取。旅程调用的 `echo`、`read_text_file`、`fetch` 都没有 `outputSchema`，按 O3 不调用校验函数，所以计数永远是 0。端到端旅程没有走到 O3 的 `conforms` 一路。它不影响任何结局种类（`violates` 时种类也是 `complete`），不阻断。
- 依据：闭包第 2 条；契约 O3。

### N9 非阻断 · S5 要求途中必经 `input_required`，比规格严

- 位置：`tests/e2e/journey.spec.ts:210`；`targets.ts:77`（`ambiguous: true`）。
- 说明：规格写的是「途中**若是** `input_required`，用 `provideTaskInput`」。用例要求必须经过。这样 `provideTaskInput` 一定被调用到（mC2 正是靠它变红），这个做法可取。但它是 server-everything 这一个工具的前提：换一个不问输入的任务工具，S5 就会红。建议在步的说明里写明。
- 依据：闭包第 3 条表 S5。

### N10 非阻断 · 落点替身忽略环境与 `cwd`

- 位置：`tests/e2e/assembly.ts:54–62`；`tests/e2e/command.ts:10–11`。
- 说明：`start(_access, launch)` 不读第三个参数 `env`（`ProcessEnvironment`），也不读 `launch.cwd` 与 `facilities`（`values.ts:36–42`）。本旅程的接入点都是 `auth: 'none'`、`env: []`，所以没有后果。`stop()` 答 `root-only` 并等 `exited`，符合 PL1；重复调用答同样的范围，符合 PL5。替身里没有写进被测行为：传输、协商、清单、结局分类与拆除都走真实产品路径，替身只交进程或计数。以后的目标如果需要环境变量，替身会静默丢掉它们。
- 依据：契约 PL1、PL5；`ports.ts:129` 的 `ProcessLanding.start`。

### N11 非阻断 · 交回没有把缺少变异证据的步列为「未验证」，本轮已补

- 位置：交回 4.4、第 5 节。
- 缺失：闭包「性质及证据义务」要求每一步能被变异打红，做不到的写「未验证」与原因。交回只给了 S3、S6、S7（不停进程）的读数，S1、S2、S4、S5 与 S7 的「报告 `no-process`」一支既没有读数，也没有列为「未验证」。本轮 mD2、mE2、mF、mB、mC2、mA2 补上了这些读数（第 2 节），这些步都能打红。另外两件小事：P 的 S3 用的「无监听端口」与页面服务端端口，都是先探测、后使用（`targets.ts:92–105`、`:118–119`、`:199`）。端口在两者之间被占用时，S3 会误红；`server.listen` 出错时没有监听器，会成为未捕获异常。两者都只会误红。
- 依据：闭包「性质及证据义务」、验收 3。

## 4. 对五个问题的结论

1. 断言：第 3 条表的每个期望都有断言，整串比较种类，没有找到错误实现能照样通过的反例。只有 N1、N2、N3 列出的旁路：S6 的时机、对端是否收到取消、HTTP 传输是否关闭，都在表外。
2. 适用与跳过：`applies` 与规格表一致。P 的 `skipIf` 在模块加载时按工作树根 `.venv/bin/mcp-server-fetch` 判定（`targets.ts:59–61`，五级 `..` 落在工作树根），跳过的名字与规格一字不差；本轮与交回都实际执行了 P。MC3-12 是一条 `toEqual` 比较断言，但按结构只会因「没跑完」而红（N5）。E-sse、F、P 的步集合没有断言（N4）。
3. 等待与清理：都有界（100 s、40×500 ms），`afterEach` 用 `leftover()` 核对并杀掉遗留进程，不会挂住。失败路径的两处瑕疵见 N6、N7。
4. 替身：形状都按契约。被测行为没有写进替身（N10）；输出校验替身在旅程里没有被调用到（N8）。
5. 变异：交回的三处加本轮六处有效变异，每一步都能打红。读数见第 2 节。
