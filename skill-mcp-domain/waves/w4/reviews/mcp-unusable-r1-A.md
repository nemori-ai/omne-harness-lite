# w4-mcp-unusable 关口评审 A 面原文

交回时刻 2026-11-06T16:20:40.938Z（会话记录），代理 `aba20afd4a0083b66`。原样保存，裁定见 `mcp-unusable-r1.md`。

---

# w4-mcp-unusable 关口评审 A 面（正确性）报告

## 评审对象与完成程度

- **评审对象**：PR #1159。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable`，分支 `PanQiWei/skill-mcp-w4-mcp-unusable`。
- **范围**：基线 F `60acfc28b640a1535585df1ebccd22bdc87e4d7c` 到 head `559be15145be26a0f549c76333b08b70e61e0149`，共 11 个提交、40 个文件。
- **级别**：L2。转 `lost` 的判断处按 L3 的看法逐行读过。
- **完成程度**：简报 A 节各项都做了，检查表第 1–16 问都问过。第 17–20 问只在 L3 问，本次不适用。
- **工作树**：开工和收工各跑一次 `git status --porcelain`，两次都是空的。开工时没有 `packages/.stryker-tmp*`。
  - 我的产物都在被忽略的 `tmp/review-a/` 下。
  - `metrics` 按工具声明的位置写到主检出的 `/data/qiwei/repos/omne-harness-lite/tmp/metrics/559be1514/`。
  - 主检出里未跟踪的 `docs/blogs/` 不是我留下的。
- **结论**：**本次范围内未发现阻断问题。** 有 4 条非阻断发现、2 条范围外待裁决。这不表示实现正确，也不表示交付已接受或已验证。

## 工具一览

日志都在 `.worktrees/w4-mcp-unusable/tmp/review-a/`，哈希是 sha256 前 12 位。

| 入口 | 命令 | 结果 | 日志（sha256 前 12 位） |
|---|---|---|---|
| 变更清单 | `git diff-tree` 逐提交列文件与 trailer | 产品写者 6 个提交，守护写者 4 个，派发者 1 个（`559be1514`，只改成员 SPEC），都在各自写范围或追加 1 授权之内 | 只看了输出，没有存日志 |
| 测试与验收的改动 | 从差异里筛删去的 `expect`、`it`；在 F 与 head 各 grep 一次 `skip`/`todo`/`only` | 跳过标记 F 与 head 都只有 `journey.spec.ts:343` 的 `describe.skipIf`，没有新增。删去的断言都换成了带标记的形状，或按全函数第 3 条改了期望，见第 4 问 | — |
| `lint:deps` | `pnpm run lint:deps` | 退出 0：依赖违规 0，方向命中 0，352 条成员边，1 个组环按具名例外放行 | `lint-deps.log`（`1c274ea27859`） |
| `lint:rules` | `pnpm run lint:rules` | 退出 0：PASS，6225 个提交的署名没有违反 | `lint-rules.log`（`f8fe8e61ec96`） |
| 结构度量 | `pnpm run metrics --coverage --base 60acfc28b…`，15:45:59–16:05:52 UTC，开始时负载 3.37 | 退出 0。改动函数里超 alert 2 个、超 warn 4 个。覆盖采集中 `mcp` 用了 1178 s，**测试 1 条失败**：`wide` 在 600 s 超时 | `metrics.log`（`fb7316942856`）；`tmp/metrics/559be1514/coverage/packages__mcp__mcp.vitest.log`（`45dfc6e515b7`） |
| 受影响范围的测试 | 我没有复跑三成员 `build typecheck test`，读的是卡上的证据 | 证据评论列的哈希在盘上对得上，见第 2 问 | — |
| 失败归因入口 | 仓库声明的入口是 `pnpm run test:gate` 的失败归因（`docs/verification.md`、`docs/development.md:352`） | 我那次覆盖采集里 `wide` 的超时**没有走归因入口**。下文的归因是我的推断 | — |
| 探索器规模（F 与 head 对照） | 见下文「探索器读数」 | 状态数和重放数两边相同 | `explore/{f,head}.json`（`c6ff14b914a6`、`ea51f2356cba`），`.meta`（`dc5000a299b0`、`0bfe07ff7327`） |
| 手工变异（在副本上） | `tmp/review-a/mut/` 是 head 的 `mcp` 与 `mcp-contract` 副本，契约在副本里重建；`VITEST_MAX_WORKERS=4`，跑契约全部快层与 `mcp` 快层 | M1、M2 两个变异都存活，见非阻断第 1 条 | 副本基线 `mut-contract-base.log`（`b1091d7f9f95`）、`mut-mcp-base.log`（`c09546a200af`）；M1 `02c6fe83dffc`、`7f6dd40191a2`；M2 `ba4ca7934019`、`a19b111095fc` |

### 探索器读数（`explore(WIDE)`，单线程，各跑一次，依次运行）

- **运行方式**：副本用 `git archive` 取出，在 `tmp/review-a/explore/{f,head}/packages/mcp/{mcp,mcp-contract}` 下。两份副本都用本修订的 `mcp` 与 `mcp-contract` 源码，其余依赖是绝对软链接，指向工作树里的成员。这些成员在 F 与 head 之间没有改动。
- **命令**：`node --conditions=source --experimental-strip-types tmp/review-a/explore/drive.mjs <副本> <标签>`。

| 修订 | 状态 | 重放 | 深度 | 耗时 | 违例 | 时段（UTC）与负载均值 |
|---|---|---|---|---|---|---|
| F `60acfc28b` | 55392 | 177108 | 26 | 176.8 s | 0 | 16:07:00–16:09:33，负载 2.31 → 4.79（`w4-mcp-cordis` 的写者在跑单个用例文件，另有 `skill-mcp` 的 stop-hook） |
| head `559be1514` | 55392 | 177108 | 26 | 160.3 s | 0 | 16:09:38–16:12:19，负载 4.57 → 2.08 |

**判断**：

- 本闭包没有让 `wide` 的状态数和重放数增加，两边一样。
- `ports.ts` 新加的 `fail-usable` 只在场景带 `deviations` 时才提供，而 `WIDE` 的 `deviations` 是空的。P15 的检查只给每个答复步加一次 `observe()`，不改投影。
- 两次耗时的差别在负载噪声以内。
- README 第 136 行的 60950／194223／158.1 s 出自 `0418cd72b`（2026-11-05）。F 已经是 55392。所以那一行的差别在 F 之前就有，与本闭包无关。
- 这里用的是 node 直跑，不经 vitest。绝对耗时不能和守护写者在 vitest 里测的约 360 s 比，能比的只有状态数和重放数。

### 改动函数的圈复杂度与 CRAP（`metrics.json`，阈值 warn 10、alert 12）

| 函数 | CC | 覆盖 | CRAP | 级别 |
|---|---|---|---|---|
| `mcp-contract/src/decisions.ts:144 unusableAnswerOf`（新） | 11 | 75% | 12.9 | **alert** |
| `mcp-contract/src/testing-transport.ts:1224 checkOperation` | 13 | 97% | 13.0 | **alert** |
| `mcp/src/internal/lost.ts:98 lostOf`（新） | 9 | 71% | 10.9 | warn |
| `mcp-contract/src/answer-readings.ts:65 callAnswerOf` | 10 | 78% | 11.1 | warn |
| `mcp-contract/src/decisions.ts:409 concludeProbe`（只改一行） | 10 | 75% | 11.6 | warn |
| `mcp-contract/src/testing-transport.ts:1041 checkProbe` | 11 | 98% | 11.0 | warn |
| 其余改动函数 | ≤8 | — | ≤8.7 | ok |

其余改动函数包括 `lostPageOf` 4、`failureOf`（tasks）7、`loseIfLost` 2、两个传输的 `handedOver`/`refused` 2–3、`settle`、`notSentFailureOf`、`noAnswerFailureOf`、`streamGoneAnswerOf`、`lineGoneAnswerOf` 6。

在各成员自己的覆盖里，`unusableAnswerOf`、`callAnswerOf`、`lostOf` 没覆盖到的行只有 `default: never` 分支（`decisions.ts:159-160`、`answer-readings.ts:83-84`、`lost.ts:111-112`）。所以超线来自 `switch` 的分支计数，没有找到实际的覆盖缺口。

## 逐项核对（简报 A 节）

**1. `lostOf` 的三条规则：次序、穷尽、重叠。** 已读 `lost.ts:98-119`。

- 按 `kind` 穷尽，`default` 是 `never`。没有一条规则按 `cause` 判断可用性，只有第 2 条读 `authorization-required`。
- 第 1、2 条不重叠：`transport.ts:31-39` 里 `authorization-required` 变体没有 `unusable` 字段。
- `not-sent` 一支先判第 2 条再看标记，与规格写的次序相反。因为类型上两者不相交，这个差别只对越界输入成立，放在「观察」。
- `lost.spec.ts` 覆盖了三条规则的每一类输入。

**2. 调用点。** `git grep -n -E 'loseOn\(|loseInScope\(' …` 有三处：

- `calls.ts:311`：`loseIfLost` 里直接取 `lostOf`。第 9 步传 `called.failure`；第 12 步在 `applyAnswer:325` 传分类之前的 `PeerAnswer`。
- `discovery.ts:154`：`page.lost` 来自 `lostPageOf:107` 里的 `lostOf`。
- `tasks.ts:152`：`failureOf` 里的 `lostOf`。
- 每处转 `lost` 之前的判断都只来自 `lostOf`。T5 的跳过分支已删。
- `internal/build.ts` 不在 diff 里。`transport.discover()` 只在 `build.ts:308`。`refresh.spec.ts` 新加的 4 条用例显示，建连中的 `discover` 失败不论带不带标记，建连都失败。
- 验收第 2 条的两个 grep 都没有输出，退出码 1。`lostOfNoAnswer` 只剩 `build.ts:101` 的同名私有函数，以及 `verification/README.md:390` 变异表里的历史行。

**3. 标记只由决策层写，传输原样交出。**

- 写标记的地方：`settle`（`decisions.ts:122`）、`lineGoneAnswerOf`、`streamGoneAnswerOf`、`unusableAnswerOf`、`notSentFailureOf`。
- `session.ts` 交出答复只走两个口：`settle:339` 经 `handedOver`，`refused:331` 经 `notSentFailureOf`。旧回退的几处 `NOT_SENT` 都经 `:864` 的 `handedOver`。文件里 `NOT_SENT_FAILURE` 只剩导入和 `:205` 的常量。
- 脚本化传输同样只走两个口：`entry.resolve` 只在 `:403` 经 `handedOver`，`refused` 在 `:398`。`:876` 是工厂 `open`，那时传输还不存在。
- `close()` 之后不带标记：两个传输都先判 `this.closed`。
- 单调：`dead ??= cause` 之后，`begin` 因为 `usable` 是假而返回 `undefined`，走 `refused`，带标记。之后结算的都经 `handedOver`。
- `session.spec.ts` 新加的用例显示：停止信号在会话结束之后触发时，答复是 `no-answer`（`abandoned`）且带 `unusable: 'session-ended'`。这符合单调性。

**4. `UnusableCause` 去掉 `abandoned` 之后。** `git grep "unusable: 'abandoned'"` 没有命中。每个 `UnusableCause` 的使用处我都列出来看过，没有生产者或消费者还依赖 `abandoned`。`NoAnswerCause` 保留 `abandoned`，这是对的。

**5. 写者自定的两件。**

- 就绪连接上 `discover` 答 `error-answer` 或 `answer-malformed` 时转 `degraded`：它与全函数第 3 条一致（不转 `lost`），也与规格第 5 条的对称写法一致。但本成员没有这条代码路径，A 面无法拿行为核对，见「未覆盖」。
- `streamGoneAnswerOf` 收窄为 `Exclude<UnusableCause, 'session-ended'>`：它把参数原样写进 `unusable`，所以参数必须是 `UnusableCause`。唯一的调用方 `lineGoneAnswerOf:510` 在 `cause === 'session-ended'` 的分支之后才调它，类型已经收窄。这一件与契约一致。

**6. 探索器规模。** 见上面的读数。状态数没有增加。

**7. 结构读数。** 见上面两张表。

## 检查表

**第 1、3 问（写入范围、顺手清理）：通过。**

- 产品写者在 `testing-transport.ts` 和 `tests/model/ports.ts` 的改动由追加 1 第 1、6 条授权。
- `tests/index.md` 在 `packages/mcp/mcp/tests/` 写范围之内。
- 守护写者对 `docs/architecture.md` 只改第 25 行，对 `README.md` 只改第 82 行。

**第 2 问（声称的输出对得上吗）：通过。** 证据评论列的哈希都在盘上找到了：

| 哈希 | 文件 |
|---|---|
| `6174c3d1e08b` | `tmp/closures/w4-mcp-unusable/logs/acc1-test.log` |
| `3fb7238ccb0f` | `…-guard/logs/accept1.log`（尾部 23/23 任务成功） |
| `73cbfff7645f` | `…-guard/logs/accept1-slow.log` |
| `79cdbe00dc2e` | `…-guard/logs/restored-test.log`（`wide` 超时，501 passed） |
| `d7ffc82b07d0`、`b2008c834168` | 负控 N11 变异前与变异后的运行 |
| `280c137ecfbb`、`044549990373`、`f8fe8e61ec96`、`3dbb26bcdd76` | `gate/` 下的 `lint-deps`、`typecheck`、`lint-rules`、`lint-oxlint` |

我本次跑的 `lint:rules` 日志哈希也是 `f8fe8e61ec96`，和派发者的一样。

**第 4 问（验收与既有断言）。** 改动的用例都是闭包规格「已知会受影响的现有用例」一类，或者按全函数第 3 条把期望改成「连接不变」。

- `races.spec.ts` 的 B2 把输入改成带标记的 `GONE`，所以这条用例仍然走转 `lost` 的路径。
- 没有新增跳过、`todo` 或快照。

**第 5 问（坏掉时会失败的测试）。** 见非阻断第 1 条。写者的 U1–U14 覆盖了 `lostOf` 三条规则、调用点与 `session.ts` 的 `refused`/`handedOver`（`mut/logs/driver.out`）。

**第 6、13、14、15、16 问：** 没有找到可指证的问题。

**第 7 问（红过的测试怎么变绿）。**

- 派发者 15:36 裁定，`79cdbe00dc2e` 里的 `wide` 超时归因于负载。
- 我那次覆盖采集里 `wide` 也在 600 s 超时（负载约 5，有覆盖插桩）。
- 两次都没有归因入口的输出。我的推断是：状态数 F 与 head 相同，单独运行 160–177 s，所以超时不是本闭包引入的。这是推断。

**第 8 问（依赖方向与环）：** `lint:deps` 通过。

**第 9、10 问（替契约补东西、改写契约语义）：** 见非阻断第 3 条与范围外第 1 条。

**第 11 问（超线的红项交代了吗）：** 见非阻断第 2 条。

**第 12 问（同一段逻辑出现两处以上）：** 两个传输的 `handedOver`/`refused` 各有一份 4 行左右的薄封装，都调用决策层的同一对函数。这是两个独立成员各自的接线，不算重复逻辑。

## 发现

### 阻断

无。

### 非阻断

**1. T1「`close()` 之后的答复不带标记」在脚本化传输上没有用例守护。（第 5 问）**

- **位置**：`packages/mcp/mcp-contract/src/testing-scripted-transport.ts:392`（`handedOver`）、`:398`（`refused`）。
- **证据**：本次在副本上跑的变异，跑完已按字节还原，`cmp` 一致。
  - M1：把 `if (this.closed || this.dead === undefined)` 改成 `if (this.dead === undefined)`。
  - M2：把 `notSentFailureOf(this.closed ? undefined : this.dead)` 改成 `notSentFailureOf(this.dead)`。
  - 两个变异下，契约 676 条全部通过；`mcp` 快层的失败集与副本基线相同，都只有 `public-entry.spec.ts` 的 2 条。那 2 条失败是因为副本里没有构建 `@omne-harness/mcp` 的 dist，与变异无关。
  - 日志：M1 是 `02c6fe83dffc`、`7f6dd40191a2`；M2 是 `ba4ca7934019`、`a19b111095fc`。
- **后果**：符合性套件没有「先不可用、再 `close()`，之后答复不带标记」这一条款。第三个传输实现，或脚本化替身以后的回归，把关闭后的答复标成不可用，不会有任何用例变红。`mcp-host-local` 由 `session.spec.ts` 和写者的 U7 守护，不受影响。
- **需要做的**：在 `testing-transport.ts` 的符合性套件里加一条，在两种传输上都跑：传输进入不再可用之后调用 `close()`，在途请求与之后请求的答复都不带 `unusable` 字段。

**2. 改动函数里的超线红项没有交代。（第 11 问）**

- **证据**：本次 `metrics` 输出（见上表）。`unusableAnswerOf` 是 alert（CC 11，CRAP 12.9），`checkOperation` 是 alert（CC 13），`lostOf`、`callAnswerOf`、`concludeProbe`、`checkProbe` 是 warn。
- 交回要点与证据评论都没有提到度量。
- 已知事实：在各成员自己的覆盖里，没覆盖到的只有 `default: never` 分支。
- **需要做的**：在交付说明里逐条交代。可以写成「CC 来自穷尽 `switch` 的分支数，未覆盖的只有不可达的 `never` 分支」，或者给出处置。

**3. `tasks.ts` 的 `resultOf` 不问 `lostOf`，而契约 T1 写了 `finished` 会带标记。（第 9 问）**

- **位置**：`packages/mcp/mcp/src/tasks.ts:227` 前后的 `resultOf`；契约 `SPEC.md` T1 新加的一段：「`SentCall.answer` 与 `TaskAnswer` 的 `finished` 经 `PeerAnswer` 的 `no-answer` 带它」。
- **反例**：传输的 `getTaskResult` 答 `{ ok: { kind: 'finished', answer: { kind: 'no-answer', cause: 'stream-broken', unusable: 'stream-broken' } } }`。这个形状类型允许，T1 也写了。按 S7「任务请求的答复带 `unusable` 时，连接转为 `lost`」，连接应转 `lost`。实际上 `resultOf` 只做分类，连接仍是 `ready`。
- **生产者**：本仓库没有。`readers.ts:210-212` 对 `finished` 只产出 `result` 或 `error`。写者已在「未覆盖」里写明。
- **后果**：目前不可达。但契约的一句话和全函数「覆盖三个服务交给它的全部答复」，与这个调用点不一致。
- **需要做的（二选一，交派发者定）**：
  - 让 `resultOf` 对 `finished.answer` 也问 `lostOf`；
  - 或者从 T1 删去「`TaskAnswer` 的 `finished`」这一句。删句归 B 面。

**4. `verification/README.md:136` 的 `wide` 读数过期。（第 2 问）**

- **证据**：
  - 该行是 60950 状态、194223 次重放、158.1 s，`git blame` 指向 `0418cd72b`（2026-11-05）。
  - 本次读数是 F 和 head 都为 55392、177108。
  - 本闭包在同一文件改了第 250 行一带（N11 段，写了 `wide` 的 367 s 和 360 s 计时），但没有更新第 136 行，也没有记 head。
- **后果**：读者会拿过期的状态数，去和本闭包的计时或以后的计时做归因比较。派发者 15:36 裁定第 4 条就碰到了这个问题。
- **需要做的**：把第 136 行更新为当前读数，并记下修订与运行方式。

### 范围外待裁决

**1. 同一条线路第二次断开时，答复带的原因不唯一。（交 B 面或卡拥有者）**

- **交错**：HTTP 旧会话进入 SSE 模式，A 已发出。
  1. B 收到 404 并且带着旧会话，`die('session-ended')`。A 是 `sent`，按 `lineGoneAnswerOf` 留下不动。
  2. 随后共用流断开，`die('stream-broken')`。`dead` 仍是 `session-ended`（`session.ts:367` 用 `??=`）。
  3. A 得到 `no-answer`（`stream-broken`，`unusable: 'stream-broken'`）。之后的新请求经 `refused` 带 `unusable: 'session-ended'`。
- **契约里的两句给出不同答案**：
  - T1 写「之后交出的每个答复都带它记下的原因」，按它 A 应带 `session-ended`。
  - T8 前言写「`lineGoneAnswerOf` 结算的请求……值是该行的原因」，按它 A 应带 `stream-broken`。
  - 实现按 T8；`unusableAnswerOf` 保留已有的标记。
- 这是写者自定的第 3 件。证据评论里派发者只认可了另外两件，这一件没有裁定。
- **对 `mcp` 的后果**：没有。两种原因都转 `lost`，连接也已由 B 的答复先转。

**2. `wide` 场景离时限的余量。**

- 本次 `metrics --coverage` 里，`mcp` 的覆盖采集在覆盖插桩和负载约 5 的条件下，`wide` 在 600 s 超时（`packages__mcp__mcp.vitest.log`，`45dfc6e515b7`），所以 `metrics` 报「测试未通过 1 个」。
- 状态数 F 与 head 相同，所以不是本闭包引入的。
- 要不要调时限、拆场景，或者在度量的覆盖采集里排除慢层，归派发者决定。按简报，我没有改时限，也没有改场景。

### 未覆盖

- **就绪连接上 `discover` 的契约新句**（S5、S7 的 `degraded(discover-failed)`；带标记时转 `lost`）：本成员没有这条代码路径，A 面无法拿行为核对。这一设计选择对不对，转 B。
- **三成员 `build typecheck test` 与 `test:slow`**：我没有复跑，以卡上附的输出为准（第 2 问已核对哈希）。差分变异（D 面）由派发者自跑，不在本面。
- **符合性套件对 `authorization-required` 只比较 `kind` 与原因，不比较标记**：证据评论已自认。
- **探索器 `marks` 场景只驱动 `getTask`**：另外三个任务方法与 `refresh` 的页请求不由探索器驱动，由服务层用例承担。证据评论已自认，我没有另外核对。
- **真实组合、HTTP OAuth 对端**：没有验证（证据评论原话）。
- **我没读的范围**：两份 SPEC 文字本身的表达（归 B 面）；`mcp-host-local/verification/README.md`；守护写者的违约实现内部；`properties.ts` 里 P15 以外的部分。

## 观察（不是发现）

- `calls.ts:306-307` 的注释说「T5 停止信号的答复不带标记」。传输已经不可用时，停止答复其实带标记（见 `session.spec.ts` 新用例）。行为没有问题，因为 `waitAtMost` 过期那条路径不读这个答复。删跳过分支的结论成立，只是注释给的理由不准确。
- `lostOf` 在 `not-sent` 一支先判 `authorization-required` 再读标记，与规格写的「第 1 条先于第 2 条」次序相反。类型上两者不相交，只有越界的运行时输入才会看出差别。
- 守护写者在 vitest 里测的 `wide` 约 360 s，我用 node 直跑是 160–177 s，差了约 2 倍。原因没有查，只是记下来。

