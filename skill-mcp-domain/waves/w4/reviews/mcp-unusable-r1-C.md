# w4-mcp-unusable 关口评审 C 面原文

交回时刻 2026-11-06T16:00:00.671Z（会话记录），代理 `ae641da3deb82b39b`。原样保存，裁定见 `mcp-unusable-r1.md`。

---

# w4-mcp-unusable 关口评审 C 面（设计与实践）报告

候选 PR #1159，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable`，head `559be1514`，基线 F `60acfc28b`。只看两件事：标记字段 `unusable?` 的形状；转 `lost` 的条件（`lostOf` 与调用点）。判据：ub-mode、`docs/defensive-patterns.md`、`pstack:typescript-best-practices`。完成时刻 2026-11-06T15:58Z（`date -u`）。

## 结论

两件事都没有阻断项。按「评审阻断只认违反已承诺需求」，下面四条都不阻断。最接近阻断的是 F2，理由见该条。

- **标记的形状：决定成立，理由和代价要重写。** 可选字段是唯一的可加形状，这一条理由单独就足够。表里写的判别联合的好处不成立，可选字段真正的代价没有写出来（F1、F4）。
- **转 `lost` 的条件：** `lostOf` 是全函数：按 `kind` 穷尽，`default` 用 `never`，不按 `cause` 判断，和规格第 1 节第 4 条一致。三个服务一共四个调用点，每个都先问 `lostOf`。有一处输入没有覆盖：`tasks.ts` 的 `resultOf`（F2）。同一段组合在两处各写一遍（F3）。

## 逐条发现

### F1（中，不阻断）ub-mode 取舍表里「可选字段而非判别联合」一行：理由有一半不成立，代价没有写

- **位置**：W4 MCP 规格「原则与约束」ub-mode 表「Model the Domain／Type System Discipline」一行。涉及的类型：`TransportFailure`（`mcp-contract/src/transport.ts:31-39`）、`PeerAnswer`（`outcomes.ts:75-78`）、`WireAnswer`（`decisions.ts:69-75`）。
- **问题与依据**：
  1. 表里说「判别联合能让『标了不可用却仍可用』写不出来」，这不成立。传输可用与否是运行时的事实。「可用答复｜不可用答复」这个联合和 `answer & { unusable?: cause }` 装的是同一个比特，错标照样写得出来。类型能排除的只有一类：标记出现在 `authorization-required`、`error-answer`、`answer-malformed`、`result`、`error` 上。现在按变体放置的可选字段已经排除了这一类。所以真正起作用的理由只有可加改动表（`docs/engineering/integration.md`「可加改动」）：给联合加成员破坏读方，加必填字段破坏写方。这条理由单独成立。
  2. 代价没写，主要是三项：
     - **编译器看不见漏传。** 把答复拆开重组的地方，例如 `{ kind: 'no-answer', cause: x.cause }`，或者交出一个预先造好、不带标记的常量，都能编译通过，标记就静默丢了。`exactOptionalPropertyTypes` 不管这件事。所以闭包规格「实施规格」里「先改类型，让编译器列出每个要处理的地方」对这种形状做不到。本次证据见文末：tsc 接受拆开重组；C1、C2、C3 三个变异体都能编译通过。C1 改的是 `concludeProbe`，被符合性条款杀死。C2 改的是 `callAnswerOf` 的 `not-sent` 分支，只被 `decisions.spec.ts` 的一条单元用例杀死，符合性套件与 `mcp-host-local` 用例都没有发现。C3 改的是 `session.ts` 的 `legacyPath`，把 `this.handedOver(entered)` 改成 `entered`，跑完 `mcp-host-local` 快层 6 个文件共 394 条用例，全部通过（存活）。写者的 U13、U14 各被一条单元用例杀死。存活只说明我跑过的文件没有一条用例走到那个位置，不说明它不可达。
     - **存在性分支。** 在 `exactOptionalPropertyTypes` 下，每次照抄这个可选字段都要写一个分支，现在有 6 处：`settle`、`notSentFailureOf`、`noAnswerFailureOf`、`unusableAnswerOf`、`callAnswerOf` 的 `not-sent` 分支、`testing-transport.ts:1204`。
     - **表里「单调性改由符合性条款与探索器的性质守住」不准确。** P15 在消费方一侧用模型替身查「不带标记的失败不转 `lost`」，不查传输的单调性。传输的单调性只有符合性套件的 `afterwards` 在查。
  3. 原因与标记是两条独立的轴（DP-01「独立事实分别报告」）。这一点是对的，但表里没写。下面这种组合合法，而且确实产生：`no-answer`（`abandoned`）加 `unusable: 'session-ended'`。路径是 S07 之后，调用方停止一个已发出的请求：`stopAnswerOf` 先给出答复，再经 `settle` 与 `handedOver` 带上标记。`session.spec.ts:1700` 已经固定了这条路径。
- **改法**：
  1. 保留决定，改写这一行。理由只写可加改动表。代价写三项：编译器看不见漏传，守护是符合性条款加单元用例，同时列出承载标记的位置（`settle`、`unusableAnswerOf`、`notSentFailureOf`、`noAnswerFailureOf`、`interpretAnswer`、`callAnswerOf`、`concludeProbe`、两种传输各自的 `handedOver` 与 `refused`、`legacyPath` 的 `handedOver(entered)`）；存在性分支；单调性只有符合性条款在守。
  2. 补上 C3 那个位置的守护。改法保持小：
     - (a) `mcp-host-local` 加一条用例：内存线路的事件在旧路的 GET 期间 reject，`discover` 答 `not-sent`（`connection-unavailable`）且带 `unusable: 'stream-broken'`。
     - (b) 可选：`enterSse` 与 `refusedGet` 里五处 `return NOT_SENT` 改成 `{ wire: { kind: 'not-sent', failure: this.refused } }`，像 `request()` 已经做的那样，让答复在构造时就带标记。
     - `legacyPath` 的 `handedOver(entered)` 不能删：`enterFrom` 的 `stream` 分支交出的答复没有经过 `settle`。
     - 这个位置对 `mcp` 没有可观察的影响，因为 `discover` 只在建连中调用（MC-5）。它是 T1 对直接使用传输的消费方的义务。

### F2（中低，不阻断，最接近阻断）`tasks.ts` 的 `resultOf` 在转 `lost` 上不是全函数

- **位置**：`packages/mcp/mcp/src/tasks.ts` 的 `resultOf`（约第 228–238 行）；`TaskAnswer`（`transport.ts:80-84`）。
- **问题**：本闭包同时引入了三件互相矛盾的事：
  1. 契约 T1 新加了一句「`TaskAnswer` 的 `finished` 经 `PeerAnswer` 的 `no-answer` 带它」。
  2. 守护写者的违约包装 `remarkTaskAnswer`（`mcp-contract/tests/transport-conformance.spec.ts:293`）把 `finished` 当作承载标记的位置。
  3. `resultOf` 只把 `answer.answer` 交给 `classifyOutcome`，从来不问 `lostOf`。

  tsc 接受 `{ kind: 'finished', answer: { kind: 'no-answer', cause: 'stream-broken', unusable: 'stream-broken' } } satisfies TaskAnswer`。这样一个答复会让连接留在 `ready`。这与契约 S7「任何请求（…任务请求）的答复带 `unusable` 时连接转为 `lost`」矛盾，也与闭包规格已定的事第 3 条「输入覆盖三个服务交给它的全部答复」矛盾。
- **为什么不阻断**：目前没有生产者。`readers.ts:210-212` 只产出 `result` 与 `error`，基线在这里也不转 `lost`。写者在交回的未覆盖项里写了这一条。但在本闭包里，T1 的承诺和转 `lost` 的条件应当说同一件事。
- **改法**：
  - (a) 现在做：在 `resultOf` 里对 `answer.answer` 调用 F3 的共用函数。这是可加改动，只改 `mcp`。先做 F3。
  - (b) 作为 0.1.0 形状项：把 `finished.answer` 收窄为 `Extract<PeerAnswer, { kind: 'result' | 'error' }>`，并删掉 T1 那半句。这属于「从联合删成员」，破坏写方，要 reduce 裁定。

### F3（低，不阻断）「先问 `lostOf`，再交给作用域」的组合写了两遍

- **位置**：`calls.ts` 的 `loseIfLost`（约第 309–312 行）；`tasks.ts` 的 `failureOf`（第 151–152 行）。F2 的 (a) 会加第三处。
- **依据**：ub-mode「One decision lives in one place」。另外，`failureOf` 名字像一个映射，却带副作用。这一点基线就有。
- **改法**：在 `internal/lost.ts` 的 `loseInScope` 旁边加 `loseIfLost(table, ensured, answer)`。`calls.ts`、`tasks.ts`（`failureOf` 与 `resultOf`）都用它。这样闭包验收第 2 条「每个调用点之前的判断来自 `lostOf`」由结构保证，不靠逐处核对。

### F4（低，不阻断）`not-sent`（`session-ended`）上的 `unusable?: UnusableCause` 多放进了两个错误的原因

- **位置**：`transport.ts:33`。
- **问题**：tsc 接受 `{ kind: 'not-sent', cause: 'session-ended', unusable: 'process-exited' }`。按 T8，S07 这一行用 `session-ended` 结束传输。唯一的生产者是 `settle(SESSION_ENDED, 'session-ended')`（`decisions.ts:213`），它本来就是对的。
- **改法**：这个变体改为 `unusable?: 'session-ended'`。这个字段本闭包才新加，相对基线 F 仍是可加改动。这样 `unusableAnswerOf` 的 `not-sent` 分支必须把这种情形单独写出来，编译器会指出这个组合。字段缺席仍然写得出来：T1 允许 `close()` 之后的答复不带标记，所以不能改成必填。
- **交给 B**：S5「不带 `unusable` 的 `not-sent`（…`session-ended`）」这一句描述的状态只在 `close()` 之后出现，是否保留这样写由 B 判断。

## 有意不列为发现

- **`lostOf` 在 `not-sent` 分支里先判 `authorization-required`，后读标记，和规格第 1、2 条的次序相反。** 这是 TS 收窄逼出来的：那个变体没有 `unusable` 字段。两条不重叠，JSDoc 写明了，`lost.spec.ts` 的第 2 条与第 3 条用例固定了它。
- **不带标记的 `session-ended` 与 `process-exited` 按第 3 条处理，连接不变。** 原因本身没有歧义，按原因判断也不会猜错，但规格的根决定是「不按 `cause` 判断可用性」，可用性只由传输判断，这样一个决定只在一处。漏标的后果已经写在失败语义表里。和 `defensive-patterns.md` 不冲突：DP-01 支持把原因与标记分开报告；没有一条 DP 要求不信任契约的实现方。
- **带标记的 `abandoned` 按第 1 条转 `lost`。** 这是对的，传输确实已经不可用。W4 规格第 3 条、契约 S7 的「其余答复」列表、成员 MC-16 第 12 步写「`abandoned` 不转」，都缺「不带标记的」这个限定。生产者见 F1 第 3 点，措辞交给 B。在 `mcp` 里，`calls.ts` 的 `answerOf` 在停止信号先到时丢掉迟到的答复，所以这个组合进不了 `lostOf`。
- **`callAnswerOf` 的 `not-sent` 分支给出 `no-answer`（`abandoned`）带标记（`answer-readings.ts:73-78`）。** 我跑过的传输级用例都没有走到它（见 C2）。我读代码的结论：调用离开之后不会再以 `not-sent` 结算。HTTP 只在收到 2xx 流时记为离开；stdio 写完才记为离开。可达性交给 A 判断。
- **调用方停止、页或任务的时限先到之后，迟到的带标记答复被丢掉，这一次不转 `lost`。** 单调性保证下一次请求会带出标记。这和规格里「传输级单调信号」不采用的理由及重开条件一致。
- **`discovery.ts` 的 `lostPageOf` 在 `lostOf` 之后另算 `ConnectionFailure`。** 这是两个决定：要不要转 `lost`，答复什么。分成两处是对的。
- **`classify.ts:155`、`tasks.ts:157` 在给调用方的结局里不带标记。** 这是有意的：转 `lost` 的判断已经在分类之前做完，结局是调用方的视图。
- **两种传输各写一份 `handedOver` 与 `refused`，「关闭优先」的规则写了两遍；`AnswerConclusion.unusable` 与答复上的标记并存。** 前者在 A 面「标记只由决策层写入」的范围内；后者是闭包规格已定的事第 2 条。
- **`dead ??= cause` 让之后的请求带第一次的原因，而第二次断开时 `lineGoneAnswerOf` 给在途请求写第二次的原因。** 标记出现与否是单调的，原因的值不一定一致。交给 A 对照 T1「它记下的原因」判断。

## 未覆盖

- 没跑慢层（`test:slow`、`e2e/journey.spec.ts`），没跑探索器，没取结构读数与 lint：这些归 A。
- P15 的 `REQUEST_PORTS`（`mcp/tests/model/properties.ts`）不含 `transport.listActions`。页请求「不带标记不转 `lost`」只由 `refresh.spec.ts` 的单元用例固定（写者 U4）。W4 规格第 8 条只说「单个请求」，是否需要扩到页请求交给 A 与 E。
- TLA+ 模型与 `Calls.tla` 是否能表达 P15，没有看。
- C2、C3 的可达性只做了读码推理，没有构造运行反例。

## 证据（本次运行）

手工变异全部在一份副本 `/tmp/c-review-w4mu` 上做。副本是 tar 复制，排除 `.git`、`node_modules`、`tmp`，根 `node_modules` 用符号链接指回候选，工作区链接在副本内解析。每个变异体都先 build（`tsc`），再跑指定的用例文件，`VITEST_MAX_WORKERS=4`、`--typecheck.enabled=false`，最后按字节还原。驱动脚本是 `/tmp/c-review-scripts/mut.sh`。副本已删除。候选工作树 `git status` 为空，head 仍是 `559be1514`。

- **类型演示**：在副本里加一个临时文件，跑 `tsc -p tsconfig.build.json --noEmit`，退出 0。它接受了下面五种值：
  - `not-sent`（`session-ended`）带 `unusable: 'process-exited'`；
  - 不带标记的 `not-sent`（`session-ended`）；
  - 拆开重组 `{ kind: 'no-answer', cause: f.cause }`；
  - `finished` 里带标记的 `no-answer`；
  - `no-answer`（`abandoned`）带标记。
- **C1**：`mcp-contract/src/decisions.ts` 中，`return { kind: 'final', failure: noAnswerFailureOf(wire) }` 改为 `return { kind: 'final', failure: { kind: 'no-answer', cause: wire.cause } }`。build 退出 0。契约 `decisions.spec.ts` 与 `transport-conformance.spec.ts`：311 条中 7 条失败，失败的是 S01、S02 两种材料。`mcp-host-local` 的 stdio、http、session：165 条中 5 条失败。结果：杀死。日志 `/tmp/c-review-scripts/C1.log`，sha256 前 16 位 `5efa6d05e1e7738d`。
- **C2**：`mcp-contract/src/answer-readings.ts` 中，`: { kind: 'no-answer', cause: 'abandoned', unusable: failure.unusable }` 改为 `: ABANDONED_ANSWER`。build 退出 0。契约 311 条中只有 1 条失败：`decisions.spec.ts`「a reading of a marked answer keeps the mark…」。`mcp-host-local` 165 条全部通过。日志 `C2.log`，`93f9fa409911d4d2`。
- **C3**：`mcp-host-local/src/session.ts` 中，`: this.handedOver(entered)` 改为 `: entered`。build 退出 0。stdio、http、session、lines 共 185 条全部通过（日志 `C3.log`，`e884e69dac422efb`）；conformance 与 `model/session-model` 共 209 条全部通过（日志 `C3b.log`，`f2c5d55f7d402933`）。结果：存活。
- **读过的原件**：
  - 代码：`lost.ts`、`calls.ts`、`tasks.ts`、`discovery.ts`、`decisions.ts`、`answer-readings.ts`、`transport.ts`、`outcomes.ts`、`readers.ts:195-220`、`session.ts`（`handedOver`、`refused`、`die`、`stop`、`dispatch`、`legacyPath`、`enterSse`、`refusedGet`）、`testing-scripted-transport.ts`；
  - 用例与性质：`lost.spec.ts`、`session.spec.ts:1700`、`transport-conformance.spec.ts:270-300`、`properties.ts` 的 P15；
  - 文档：契约 SPEC 的 diff、`integration.md`「可加改动」、`defensive-patterns.md` DP-01 至 DP-10。
