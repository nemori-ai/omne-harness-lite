本次是「表达」判断。判据页是 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`，只读了这一页。

**评审对象**：闭包 w3-mcp-call（PR #1141）。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `7d91a330c`，基线 `b2ba7dc89`。

**范围**：
- 成员 `packages/mcp/mcp/` 下的 `SPEC.md`（MC-1、MC-11、MC-12、MC-16、MC-17、所有权、未覆盖、偏离表）、`README.md`、`README_ZH.md`、`docs/`、`src/README.md`、`tests/README.md`、`verification/README.md`。
- 契约 `packages/mcp/mcp-contract/SPEC.md` 本闭包改的句子：S3 第 313 行、O1 第 217 行、`./testing` 列表第 90 行。
- 依赖条款只沿用到的地方展开：R1、R2、R7、S1–S9、T1、T5、T6、T8 各行、T9。

**完成程度**：范围已覆盖。我没有 git 工具，基线一侧的比较借用 `.worktrees/skill-mcp` 的检出代替 `b2ba7dc89`，见「未覆盖」。

**工具输出**：简报附了 `tmp/closures/w3-mcp-call/gates-r/`，`check:docs` 与 `check:design` 都退出 0。两者只核本地链接、技能镜像、现行出处与拥有者，不核语义、用例名的引用和编号读法。后两项是我人工核对的：MC-1、MC-12、MC-16、MC-17 引用的用例名，在 `tests/` 里都能以子串找到。

---

## 阻断

**B1 调用与任务请求转 `lost` 的规则比契约 S7 宽，且没有登记为偏离**

- **类别**：跨契约一致。
- **位置**：
  - 成员 SPEC MC-16 映射表第 5 行（第 137 行）与第 7 行（第 139 行）；第 13 步（第 127 行）；MC-17 第 4 步（第 149 行）。
  - 偏离表（第 156–161 行）没有对应行。
  - 依据表（第 9 行）把 S1–S9 列为「被兑现的条款」。
  - 附带：`docs/architecture.md:23`、`src/internal/lost.ts:1-2,25` 的注释。
- **原句**：
  - 第 137 行：「`transport.call` 答 `not-sent`（`connection-unavailable`、`session-ended`）……经 `table.lose` 转 `lost`（`stream-broken`、`session-ended`），清单标记 `connection-unavailable`」
  - 第 139 行：「发出之后 `no-answer`（`stream-broken`、`process-exited`）……转 `lost` 带子因，清单标记 `connection-unavailable`」
  - 第 149 行：「`not-sent` 按 MC-16 的表转 `lost`……`stream-broken` 与 `process-exited` 转 `lost`」
- **依据**：
  - 契约 S7（第 344 行）：只有「T8 结论带『传输不再可用』时」连接才转 `lost`；第 343 行列举的 `stream-broken` 情形里，`not-sent` 只出现在 X02 与页请求上。
  - 契约 T8 中不带「传输不再可用」的行：C04（HTTP 调用流断开或 5xx+纯 → `no-answer(stream-broken)`）、C05（HTTP 调用 4xx+纯 → `not-sent(connection-unavailable)`）、X01、S06、O06–O08（任务请求同类情形）。
  - `TransportFailure`/`PeerAnswer` 不带这个标记，成员只能按原因字段代替判断。
  - 闭包规格「reduce 已定的事」第 2 条写的是「按契约 S7『传输不再可用』一条处理」。
- **触发场景**：Streamable HTTP 上，对端对一次 `tools/call` 答 400 且正文是纯文本（C05），或答 5xx（C04）。任务请求的 O06–O08 同理。
- **后果**：
  - 一条仍然可用的连接被判 `lost(stream-broken)` 并拆除。
  - `markUnavailable` 把整份清单的每个动作都标为不可用（契约 C7）。
  - 之后对该接入点任一动作的 `invoke`，都在第 5 步答 `action-unavailable`，直到下一次 `refresh` 重新发布。
  - 状态视图报告「通道断了」，与事实不符。
  - 依据表声称兑现 S7，但实现行为与 S7 原文不同，阅读契约的消费者无法预见这一点。
- **作者需明确**：在偏离表登记这条按原因判断的规则：成员实际采用的判定、原因（服务看不到 T8 的标记）、退出条件。或者等契约拥有者改 S7 后再对齐。改 S7 属于「范围外待裁决 1」，本闭包不得改 T 段，只能登记偏离。同时把 `docs/architecture.md:23` 与 `lost.ts` 注释里「等于传输不再可用」的说法改成同一口径。

---

## 非阻断

**N1 发送次序的步号有两套读法，测试标题指错了 SPEC 的步**

- **类别**：引用与归属。
- **位置**：
  - SPEC MC-16 第 114–127 行：自己的第 1–13 步，括号注「28.n」。
  - 同一节第 133、137、141 行引用的用例名：「step 3」「step 5: after closeAll」「step 7: a call the transport could not send」「step 8: the signal after the send」。这些「step N」是已定事项 28 的第 N 步，不是 MC-16 的第 N 步。
  - `tests/cancel.spec.ts:82`「(SPEC S2, MC-16 step 6)」与 `:101`「(SPEC S2, MC-16 step 8)」：MC-16 第 6 步其实是 `continueWithInput` 核代际，第 8 步是 `ensure`。
  - `src/calls.ts:111,132,147,160,228`（「The send order of SPEC MC-16, steps 1–6」）也一样。
  - SPEC 第 17 行的编号读法没有收「28.n」「step N」「闭包规格第 n 条」。
- **依据**：表达页「引用与归属」；简报要求核对编号读法是否一致。
- **触发场景**：读者从用例或源码注释按「MC-16 step 6」回查 SPEC。
- **后果**：落到不相干的步骤上，证据与条款的对应断开。
- **作者需明确**：统一一种读法，例如用例与注释一律写「28.n」，或改用 SPEC 的步号。在第 17 行补上这几种编号的读法，并说明 MC-17 标题里「闭包规格第 5、6 条」指的是哪份闭包规格。

**N2 `verification/README.md` 一页里有两套 M 编号，号码冲突**

- **类别**：引用与归属。
- **位置**：
  - `verification/README.md` 第 100–128 行：生命周期的 M1–M28。
  - 第 150–187 行：调用口的 M01–M34。
  - 第 130 行「编号里没有 M11」「27 个变异」。
  - 第 3 行把本页范围写成「连接表生命周期的性质证据」。
  - 第 148 行「基线 `b2ba7dc89` 之上的闭包提交」。
- **依据**：表达页「形式对应」要求证据绑定实际输入修订；简报要求核对 M 编号的读法。
- **触发场景**：评审或验收引用「M17」。
- **后果**：
  - M10、M12–M28 在两张表里含义不同。旧 M17 能变红，新 M17 存活，引用时分不清。
  - 第 130 行在同一页内已不成立，因为新表有 M11。
  - 新变异记录没有绑定执行时的精确提交。
- **作者需明确**：给其中一套加前缀或换号段；更新第 3 行的范围说明与第 130 行；写明变异运行时的 head。

**N3 MC-12 的一条变异声明与 SPEC 自己的「未覆盖」和运行记录矛盾**

- **类别**：形式对应。
- **位置**：SPEC MC-12 第 82 行；同一页第 214 行；`verification/README.md:169`（M17，退出码 0）；`tmp/closures/w3-mcp-call/red/M17.log`（「Test Files 1 passed (1) / Tests 7 passed (7)」）。
- **原句**：第 82 行「`markSent` 不看取消标记 → `cancel.spec.ts`「between the send and its record」变红」。
- **依据**：表达页「范围是否超过证据」。第 214 行已经承认这条变异「在服务层存活」，所以整份文档没有隐瞒，只是这一句没跟着改。
- **后果**：按条款查证据的人会读到一条与运行记录相反的声明。替代说法「由 `in-flight.spec.ts` 在聚合上验证」也没有变红记录，因为 M17 只跑了 `cancel.spec.ts`，应标为未验证。
- **作者需明确**：把这一句改成实际守住它的用例，并补上能使它变红的运行；没有运行前写「未验证」。

**N4 映射表第 1、2、4 行的「每行一个能翻转它的变异」没有证据**

- **类别**：形式对应。
- **位置**：SPEC 第 133、134、136 行；`README.md:95` 与 `README_ZH.md:95`（「each row of the mapping of connection failures」）。
- **依据**：
  - 闭包规格「reduce 已定的事」第 2 条要求每行一个能翻转它的变异。
  - `verification/README.md` 的 M01–M34 里没有对应第 2 行（connect 阶段原因改答 `unknown`）和第 4 行的记录。
  - 第 1 行引用的「step 3」用例测的是 `calls.ts` 的 `prepareSettings`，即 SPEC 第 4 步、在 `ensure` 之前，不是 `ensure` 的 `settings` 阶段（对应 M04）。「step 5: after closeAll」的变红来自 M32（`isShut` 恒假），是另一种缺陷。
- **后果**：README 与 SPEC 声称的覆盖范围超出了证据。
- **作者需明确**：为这三行各补一个改动映射本身的变异与记录；或者改写声明，只写已有证据支持的部分。

**N5 三个答 `cancelled` 的出口没写键的去向，与本节开头的规则冲突**

- **类别**：表达歧义 / 可实施性。
- **位置**：
  - SPEC 第 114 行：「每步失败答『未发出』并撤销占位（键立即可再用），注明的除外」。
  - 第 7 步（第 121 行）、第 8 步（第 122 行）、第 10 步的取消赛跑（第 124 行）都答 `cancelled`，没有注明例外。
  - 只有第 9 步（第 123 行）写了「这个键转为已结束」。
  - 第 141 行的变异「发出前取消把键删除而不是结束」又暗示这几处都应「结束」。
- **依据**：契约 S2（第 299 行）：已结束答 `no-call-in-flight`，不在表里答 `unknown`。
- **触发场景**：调用方中止，或 `cancel` 在建连前、建连中、与发出赛跑时到达，之后再对同一关联键调用 `cancel`。
- **后果**：按开头规则实现的人答 `unknown`，按第 9 步实现的人答 `no-call-in-flight`。两种实现对消费者给出不同答复。
- **作者需明确**：在第 7、8、10 步各写明「键转为已结束」，或者在开头把 `cancelled` 列为例外。

**N6 `cancel` 能否打断第 8 步的建连等待，两种读法**

- **类别**：表达歧义。
- **位置**：SPEC 第 116 行「从这里起……合成一个停止信号」；第 122 行「在调用方 `signal` 下等待」；第 172 行「取消」一条；`docs/architecture.md:51`「`cancel` 与调用方的中止走同一条路」。
- **触发场景**：`cancel` 在建连期间到达，并答了 `signalled`。
- **后果**：
  - 照第 122 行实现：调用要等到建连结束，最长等一个连接上界，才答 `cancelled`。
  - 照第 116 行或 docs 实现：立即答 `cancelled`。
  - 消费者看得见这段延迟，而 SPEC 没有说明。
- **作者需明确**：写明 `cancel` 在第 8 步是否结束等待；如果不结束，说明理由与最长延迟。实现意图交 A 核对。

**N7 任务操作对 `ensure` 失败的映射，与 R7 和 MC-16 不一致**

- **类别**：跨契约一致。
- **位置**：SPEC MC-17 第 3 步（第 148 行）：「`ensure` 的 `settings` 阶段失败答 `effect-unknown`（`no-connection`）……`connect` 阶段的 `ConnectionFailure` 与 `EffectUnknown` 原样交出」。
- **依据**：
  - 契约 R7（第 287 行）：`effect-unknown` 指「请求已发出而没有应答」，或「没有可重建连接的采用材料」（`no-connection`）。
  - 成员 MC-16 映射表第 3 行把 `discover` 的 `EffectUnknown` 改答 `connection-unavailable`，理由是「调用本身没有发出」。
- **触发场景**：
  - 任务操作新建连接时 `discover` 无应答。
  - 或者临界区时限先到、建连途中关停。
- **后果**：
  - 前者：`provideTaskInput`/`cancelTask` 答 `effect-unknown(stream-broken)`，消费者按 R7 与 O6「不重发」放弃一次其实可以安全重试的请求。
  - 后者：采用材料还在，却答「没有可重建的材料」，消费者可能断定这个任务再也够不着。
  - 两个实现者会做出不同映射。
- **作者需明确**：MC-17 对这两种来源取与 MC-16 相同的口径，或写明不同的理由。如果需要 R7 扩大 `no-connection` 的含义，交契约拥有者裁决。

**N8 MC-17 没写 `TaskRef.issuedAt` 怎么处理**

- **类别**：完整性。
- **位置**：契约 `src/services.ts:127-132`（`TaskRef.issuedAt: Generation`）；SPEC MC-17；SPEC 第 165 行「任务表项记发出代际」。
- **后果**：
  - 调用方给的代际与表里记的发起代际不同时，可以忽略、拒绝或答 `unknown`，两个实现者会分歧。
  - 现有实现忽略它。
  - 表里的「发出代际」也没有写出用途。
- **作者需明确**：写明这一字段的处置，以及表中发起代际的用途。

**N9 SPEC 内有过时或重复的句子**

- **类别**：表达歧义。
- **位置与原句**：
  - MC-11（第 78 行）列出会自动关闭连接的操作「`refresh`、`current`、`peer`、`release`、`inspect` 与发布边界」，没有 `invoke`、`continueWithInput` 与任务操作；而 MC-16 第 3 步、MC-17 第 3 步都说它们会关闭。
  - 第 169 行「`closeAll` ……之后……要连接的操作答 `connection-unavailable`」：任务操作答的是 `effect-unknown(no-connection)`（MC-17 第 2 步、契约 S8）。
  - 第 165 与第 166 行重复「连接表拥有每条连接的 `Connection` 聚合……」。
- **作者需明确**：更新 MC-11 的列表与第 169 行；合并重复的两行。

**N10 「未覆盖」没写调用口的并发没有形式化证据**

- **类别**：形式对应 / 完整性。
- **位置**：SPEC 第 205–215 行；「性质与证据」第 221–228 行（参与者只有 `ensure`、`close`、`closeAll`、`lose`）。
- **依据**：闭包规格追加记录（13:30）。
- **后果**：读者可能以为 P5 一类的隔离性质也覆盖了在途表、任务表与取消。
- **作者需明确**：在「未覆盖」写明：MC-12、MC-16、MC-17 的并发与隔离目前只有示例用例，模型与探索器归 `w3-mcp-call-model`。

**N11 单一源约束：README 守住了，docs 有新增复述**

- **类别**：归属越界。
- **位置**：
  - `docs/architecture.md:51–53`：三条机制复述，本闭包新增；其中第 51 行有漂移，见 N6。
  - `docs/flows.md:94`。
  - `README.md:95` 的覆盖声明。
  - README 的「The call port」一节（第 85–87 行）只链接 SPEC，符合要求。
- **依据**：闭包规格「实施规格」第一条。
- **作者需明确**：docs 只留模块、装配与链接，删去或改成链接到 MC-16、MC-17；具体漂移见下方清单。

**N12 契约的两处新改动没有记录依据**

- **类别**：引用与归属。
- **位置**：
  - 契约 SPEC S3 第 313 行，新增必填的 `McpPorts.checkOutput`。
  - `ContinueRequest.inputResponses` 改为可选（`services.ts:108-110`）。
  - 范围与依据表（第 9–18 行）与两份裁定清单都没有它们的条目。
  - 第 54 行前言「只有一处改了已有签名的必填性」读起来像涵盖全部改动。
- **后果**：消费者找不到这两项改动的决定出处。宿主构造 `McpPorts` 现在多了一个必填字段，对构造方不是「可加」改动。PR 正文把它叫「可加」。
- **作者需明确**：在依据表或裁定清单补一条出处（闭包规格第 4、7 条），并限定第 54 行前言的适用范围。

**N13 `ContinueRequest` 两个字段都缺时怎么办，没有写**

- **类别**：可实施性。
- **位置**：SPEC 第 124 行；契约 S2 第 300 行。
- **后果**：两个字段都缺时，可以发空 `continuation`、拒绝或答「未发出」。实现发出了 `{}`，SPEC 没有定义。
- **作者需明确**：写明这种情况的答复。

---

## 跨文件矛盾与复述漂移清单

1. `docs/architecture.md:51`「走同一条路」与 SPEC 第 8 步（建连时只受调用方 `signal`）矛盾。见 N6。
2. `docs/architecture.md:37`「src/ 里只有两个 `class`」与 `src/internal/task-table.ts:29`（`export class TaskTable`）、`docs/object-model.md:3`、`src/README.md:27` 矛盾。
3. `docs/flows.md:94`「调用『未发出』时……占位撤销」与 SPEC 第 9 步（`cancelled` 转为已结束）矛盾。
4. `docs/architecture.md:23` 与 `src/internal/lost.ts:1-2,25` 把这些映射说成等于「传输不再可用」，与 T8 的 C04、C05、X01、S06 矛盾。见 B1。
5. `README.md:95` 与 `README_ZH.md:95` 的「映射表每行都有变异」与证据不符。见 N4。
6. `README.md:99` 与 `README_ZH.md:99` 的 S2 模块对照漏了 `internal/task-table.ts`。
7. `README.md:64` 与 `README_ZH.md:64` 把 `continueWithInput` 列为会建连的操作；SPEC 第 6 步写的是「不建连」，它只复用连接，只有在第 6 步与第 8 步之间连接丢失时才会建。
8. SPEC MC-11（第 78 行）的操作列表与 MC-16 第 3 步、MC-17 第 3 步矛盾。见 N9。
9. SPEC 第 169 行与 MC-17 第 2 步、契约 S8 矛盾。见 N9。
10. SPEC 第 165 行与第 166 行重复。
11. SPEC 第 82 行与第 214 行、`verification/README.md:169` 矛盾。见 N3。
12. 契约 R2（第 265 行）把 `cancelled` 定义为「收到了 `cancel`」；MC-16 第 7、8、9 步对调用方自己中止也答 `cancelled`。
13. 用例标题与 `calls.ts` 注释的步号（28.n）与 SPEC MC-16 的步号不一致；`tests/cancel.spec.ts:82,101` 指错步号。见 N1。
14. `verification/README.md:3` 的范围、`:130` 的「没有 M11」与第 146 行之后的新节矛盾。见 N2。

---

## 范围外待裁决（只列出，不据此否决）

1. **S7 的触发条件，服务看不到**。契约 S7 以「T8 结论带『传输不再可用』」为条件，但 `TransportFailure`/`PeerAnswer` 不带这个标记。有两种做法：
   - 在传输答复里加这个标记。代价是改 T 段，本闭包不允许，`w3-mcp-host` 也在改这一段。
   - 把 S7 改写成按请求类别与原因判断的规则。代价是重新核对每一行 T8。

   同一根源已经让早先的 MC-7 与 S7 分开：stdio 页请求遇到 S01 时，S7 说转 `lost`，MC-7 说转 `degraded`。拥有者：契约拥有者 / reduce（波末小卡 K7 或另立）。
2. **契约 R1 与 S2 冲突**。R1 第 261 行「控制操作在资格不是 `granted` 时只答 `Refusal`」，而 S2 第 303 行规定任务操作在这种情况下答 `effect-unknown(no-connection)`。组页 `packages/mcp/docs/architecture.md:497,504` 关于 `cancelTask` 的写法也与 S2 不一致。拥有者：契约拥有者，组页波末写回。
3. 如果 N7 需要 R7 的 `no-connection` 覆盖「时限先到或关停」，交契约拥有者裁决。

---

## 未覆盖

- **转交 A（正确性）**：
  - `src/tasks.ts:68-72` 先判复用、后判 `isShut`，与 MC-17 第 2→3 步、S8「先判发起者再判 `closeAll`」之后的次序是否一致。
  - `tasks.ts:77` 中正文不能解析时，关口裁决的种类是否得出 MC-17 写的 `no-connection`。
  - `calls.ts:261` 在建连时只用 `request.signal`，是不是有意为之（N6）。
  - N4 那三行的变异实际能否让用例变红。
- **转交选择判断**：HTTP 上一次 4xx 或 5xx 是否应该让连接 `lost` 并标记整份清单，这是方案选择，不是表达问题。
- **证据缺口**：
  - 我没有 git，基线一侧用 `.worktrees/skill-mcp` 代替 `b2ba7dc89`，没有确认两者逐字节一致。「本闭包新增或未改」的判断都依赖这个代替：MC-12 改了、MC-11 没改、`docs/architecture.md:51–53` 是新增、契约的基线句子。
  - 成员依据表钉的契约修订 `e5c5ef5a1` 是本闭包第 1 个提交（工作树 reflog 可证），但我无法确认它已经包含 S3 与 O1 的新句子。
  - 变异没有复跑。
  - TLA+、探索器与 `w3-mcp-call-model` 不在本次范围。
- **没有审读**：`src/index.md`、`tests/index.md`；契约 SPEC 中 S3、O1、`./testing` 以外的部分（只当作依赖读了 R1、R2、R7、S1–S9、T1、T5、T6、T8 各行、T9）。

## 未决政策与缺口的 owner

- **B1 与 N1–N13 的成员侧修补**：本闭包写者，在修复轮处理。
- **N12 契约出处**：本闭包写者（契约 SPEC 的 S3 在写范围内），由 reduce 确认。
- **范围外 1–3**：契约拥有者 / reduce。
- **N6 实现意图、N4 变异复跑**：A 与 E 的评审者。

评审完成不代表规格已接受，也不代表实现已验证。