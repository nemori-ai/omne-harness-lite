# w4-mcp-unusable 关口评审 B 面原文

交回时刻 2026-11-06T15:55:27.109Z（会话记录），代理 `a5b2a1f3853928042`。原样保存，裁定见 `mcp-unusable-r1.md`。

---

本次做的是「表达」判断，判据只读了一页：`/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable/.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`。

**结论：本次表达与规范范围内未发现阻断问题。** 下面共 10 条非阻断发现。核心规则（T1 的标记、S5、S7、`lostOf` 三条规则）自身一致，可以照着实施。问题集中在三类：建连期间的 `lost` 原因，`close()`、停止信号与标记的关系，以及没有跟着改的旧说法。

## 对象、范围与完成程度

- **对象**：PR #1159，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable`，head `559be1514`，基线 F `60acfc28b`。
- **基线怎么比的**：我没有 shell，跑不了 `git diff`。基线一侧读的是父分支工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp`（`PanQiWei/skill-mcp` @ `fbe2008f0`）里的同名文件。这里有一个没核实的前提：F 之后父分支只合入了 Skill 闭包，没动这些 MCP 文件。
- **简报附的工具输出**：只有 `check:docs` 退出 0，它只核本地链接与 skill 镜像。没有附类型、Schema、封闭集合、依赖或模型的输出，所以 SPEC 与类型是否一致这一层我没有复核，只读了 `transport.ts`、`outcomes.ts`、`decisions.ts` 的相关片段。
- **读过的范围**：
  - 契约 SPEC：依据表；裁定第 25、32 条与第 88 行引言；R1、R7、S1–S9、T1、T5、T8 的前言与表、T9、失败码索引、组合与验证。
  - 成员 SPEC：依据表、MC-5、MC-7、MC-16、MC-17、偏离一节，「性质与证据」里的 P15、两张证据表和负控段。
  - `mcp/verification/README.md`：动作映射、读数、N 表、N11 段、未覆盖、U 节。
  - `mcp-host-local/SPEC.md`：依据行、H10、「关闭」「线路断开」、V6；`mcp-host-local/verification/README.md` 第 36–38 行。
  - `mcp/docs/architecture.md:25`、`mcp/README.md:82`、契约 `docs/public-api.md`、契约 `verification/README.md`。

### 简报点名要核的三件事

- **全函数是否只有一处规范语气的权威**：契约 S7（`mcp-contract/SPEC.md:374`）是权威。S5 针对 `refresh` 做了细化，并指回 S7。T1 定义标记本身。但成员 MC-16 第 9 步用规范语气把三条规则完整写了一遍，见发现 7。MC-7 与 MC-17 第 4 步是部分复述加引用。
- **偏离一节**：成员 SPEC 第 158–160 行是「没有偏离。」，锚点 `<a id="deviations">` 在第 156 行。入向链接 `README.md:82`、`README_ZH.md:82` 都能解析，但 ZH 版的措辞过时（发现 5）。「没有偏离」要看 S5 与 S7 按哪种读法才成立（发现 1）。
- **条款编号与锚点**：`lostOf` 第 1–3 条的编号在 `lost.ts`、P15、U 表、W4 规格里一致。MC-16 第 9 步按序列出三条但没写编号，能读通。所用锚点 `#services`、`#port-transport`、`#t8`、`#deviations` 都存在。编号问题在发现 6。

## 阻断

本次表达与规范范围内未发现阻断问题。

## 非阻断（按影响排序）

**1. 跨契约一致：S7 的 `lost` 原因定义、S5 把建连交给实现、MC-5 的建连表，三者对不上**
- **位置**：契约 `SPEC.md:373`（S7 `lost`）、`:362`（S5 首句）；成员 `SPEC.md:47–56`（MC-5 表）、`:160`。
- **原句**：
  - S7：「`stream-broken`，到对端的通道断了：答复带 `unusable`（`stream-broken`），即管道或流断开且传输不再可用（T8 S01、S03、SSE 模式），或 stdio 上请求写不进去（T8 X02）……`discover-failed` 的 `lost` 只出现在建连中」
  - S5：「建连中的 `open` 或 `discover` 失败归建连失败：……按服务实现的建连规则处置」
  - MC-5 表：「`discover` 答 `no-answer` → `stream-broken`、`process-exited`」；「`open` 或 `discover` 答 `not-sent`（`connection-unavailable`）→ `preparation-failed`」
- **触发场景**，有两个方向相反的反例：
  - HTTP 建连时 `discover` 走 D15（重发后再断）或 D16（5xx），得到不带标记的 `no-answer`（`stream-broken`）。`build.ts:101` 的 `lostOfNoAnswer` 给出 `lost(stream-broken)`；按 S7，`stream-broken` 要求带标记，这里应落到 `preparation-failed`。
  - stdio 建连时 `discover` 遇 X02，得到带 `stream-broken` 标记的 `not-sent`。MC-5 给 `preparation-failed`；S7 点名 X02 是 `stream-broken`。
- **后果**：
  - S7 已把 `stream-broken` 定义成「传输不再可用」；`EndpointStatus` 的读者会对一条传输从没不可用的 HTTP 连接读到这个原因。
  - 第二个服务实现照 S7 写，原因会和 `mcp` 不同。
  - 「没有偏离」只在「S5 的委托覆盖 S7 对建连的定义」这一读法下成立；而 S7 自己仍在约束建连（`discover-failed`）。
  - X02 这一格在基线就不一致；HTTP 这一格原来由被删的偏离第 1 行兜着。本闭包把 `stream-broken` 改成按标记定义，又删了这一行。`refresh.spec.ts:400` 只断言 `kind: 'lost'`，不断言原因。
- **作者需明确**：选一种做法，不由我代选。
  - 在 S7 写明各原因定义是否约束建连，像已有的 `discover-failed` 那样单独开口子；
  - 或让 MC-5 这两格对齐 S7；
  - 或登记一条偏离。

**2. 跨契约一致：传输已不可用之后，停止答复带不带标记**
- **位置**：契约 `:462`（T1 第二段）、`:374`（S7）；成员 `:125`（MC-16 第 9 步）、`:128`（第 12 步）；`mcp-host-local/SPEC.md:189`、`:247`（V6）。实现在 `session.ts:325–357`、`testing-scripted-transport.ts:391–417`。
- **原句**：
  - T1：「传输一旦在一个答复上标出，之后交出的每个答复都带它记下的原因。本端调用 `close()` 之后的答复不带标记」
  - S7：「其余答复不使连接转为 `lost`：……、`abandoned`（本端的决定）……」
  - MC-16 第 9 步：「传输对已触发信号的答复（T5）不带标记，所以连接不变，不需要另一条分支」
  - MC-16 第 12 步：「不带标记的 `no-answer`……与 `abandoned` 不转」
  - host-local `:189`：「之后会话交出的每个答复都经 `handedOver`……会话已关闭时，答复不带标记」
- **触发场景**：HTTP 走 S07 之后，同一会话上已交给线路的请求还在等应答。这时调用方的 `signal` 触发：`stopAnswerOf` 给出 `no-answer`（`abandoned`），`handedOver` 再写上 `unusable: 'session-ended'`。
  - T1 的「每个答复」照字面也覆盖不了带标记之后才结束的 `authorization-required`、有应答的结局（类型上带不了这个字段），也没写关闭与断开同时成立时谁优先；host-local 定为关闭优先。
- **后果**：
  - 现在 `mcp` 的行为没错：传输已死，第 1 条规则转 `lost` 是对的；调用口在自己停止后也丢弃了传输的答复。
  - 但 MC-16 写的理由是一句被传输成员否定的事实。追加 1 第 4 条的核实只覆盖了传输仍可用的情形。
  - 第二个传输可能不给停止答复打标记；第二个服务若照 S7 的 `abandoned` 一项，可能对带标记的 `abandoned` 不转 `lost`。
- **作者需明确**：
  - T1 的单调规则管哪些答复种类；`close()` 与 `signal` 停止各自是否例外；二者同时成立时谁优先。
  - S7 的 `abandoned` 一项是否以不带标记为前提。
  - MC-16 第 9、12 步的理由按 T1 改写。

**3. 归属越界、表达歧义：S5 最后一条用了成员内部的词**
- **位置**：契约 `:368`；同一个词「清单标记」也出现在 `:374`。
- **原句**：「建连的时限先于清单标记到期时，`ensure` 的失败带的清单标记是 `pending`：标记还在进行，`refresh` 答这次连接失败本身。」
- **依据**：
  - `ensure`（`mcp/src/internal/table.ts:380`）与 `'pending'`（`entry.ts:62`）都只在成员内部，契约没有这两个名字。契约页自己写着「不点名任何调用方」，只写类型表达不了的行为。
  - 「清单标记」在 `:374` 指 `markUnavailable` 的原因，在 `:368` 指标记的过程和结果。
  - S5 首句刚把建连失败交给实现，`:368` 又替其中一种情况定了规则。
  - MC-5 给 `pending` 两个来源（建连时限、加入时限），`:368` 只写了前一个。
  - 措辞来自 W4 规格第 6 条与闭包规格第 7 条。
- **后果**：第二个 `ActionDiscovery` 实现找不到 `ensure` 与 `pending` 的对应物。真正的公开承诺被埋在成员词汇里：时限到了还不知道标记结果时，`refresh` 答连接失败本身，而不是 `kept`（`superseded`）或 `unknown`。
- **作者需明确**：用契约的词改写（`refresh`、`markUnavailable`、连接失败）；写明是否包括加入时限的情形；它是不是契约层规则，见「范围外待裁决」。

**4. 表达歧义：「就绪连接」没有定义**
- **位置**：契约 `:362`、`:374`；成员 `:279`（P15）；`docs/architecture.md:25`；`verification/README.md:298`。
- **原句**：「传输不再可用：就绪连接上任何请求（……）的答复带 `unusable`（T1）时，连接转为 `lost`」
- **依据**：S7 列的状态是 `none`、`preparing`、`ready`、`degraded`、`lost`。「就绪」是本闭包才引入的词。`degraded` 的连接照常复用（MC-5「状态是 `ready` 或 `degraded` 时复用」）。
- **触发场景**：`degraded` 连接上的一次调用得到带标记的 `no-answer`。
- **后果**：如果「就绪」只指 `ready`，S7 对 `degraded` 连接上带标记的答复就没有规则；某个实现可能让一条传输已死的连接一直停在 `degraded`。`lostOf` 不看状态。P15（`properties.ts:480` 的 `state !== READY`）取窄义，对一条性质来说可以。
- **作者需明确**：在 S7 定义一次「就绪连接」，例如「状态是 `ready` 或 `degraded`，与建连中相对」。

**5. 引用与归属：成员里还有三处旧说法没同步**
- **位置与原句**：
  - `mcp/src/index.md:26`：「对调用与任务请求按原因判断，比契约 S7 宽，是登记的偏离」
  - `mcp/docs/flows.md:101`：「页取得失败：`not-sent` 使连接 `lost` 并标记清单；其他失败与取页超时使连接 `degraded`」
  - `mcp/README_ZH.md:82`：「与契约的偏离及其退出条件在 [SPEC.md](SPEC.md#deviations)」（英文版已改）
- **依据**：成员 SPEC `:160`「没有偏离。」；MC-7 的页规则。
- **触发与后果**：照 flows.md 读的人会以为 HTTP「4xx+纯」的页（不带标记的 `not-sent`）转 `lost`，带标记的 stdio `no-answer` 页转 `degraded`，现在两者都错了。src/index 说还有一条已登记的偏离，实际已经没有。
- **作者需明确**：同步这三处。它们不在两个写者的写范围里（守护的第 8 条只给了 `README.md:82` 与 `architecture.md:25`），不是写者的缺陷。

**6. 引用与归属：变更记录与依据**
- **位置**：契约 `:14`、`:88`、`:97`；成员 `:9`；契约 `docs/public-api.md:37`；契约 `:671`。
- **原句**：
  - `:14`：「……带出的契约改动（第 26–31 条）」
  - `:88`：「第 32 条……改动 T1、S5、S7 的写法」
  - `:97`：「性质：类型是可加改动……见 T1、T8、S5、S7、S8、R1、R7」
  - 成员 `:9`：「[契约 SPEC] | `f34077cec`」
- **具体问题**：
  - (a) 依据表里没有第 32 条，也没有 W4 规格或本闭包这一行。
  - (b) 第 88 行只列三条款，第 32 条本身列了七条。
  - (c) 第 32 条没记录根导出 `streamGoneAnswerOf` 的参数收窄（从 `NoAnswerCause` 收成 `Exclude<UnusableCause,'session-ended'>`，写者自定第 2 条）。这是一次不可加的公开签名改动，却写在「类型是可加改动」之下。
  - (d) 成员 SPEC 固定的契约修订和基线相同，那一版没有 `unusable` 条款，而 MC-7、MC-16、MC-17、P15 兑现的是改写后的 T1、S5、S7。host-local 写的是「与本页同一提交」，没有这个问题。
  - (e) `public-api.md:37` 中带 `UnusableCause` 的一行指向 R1–R6，不是 T1；失败码索引没有 `UnusableCause`。
- **后果**：用 `'abandoned'` 调 `streamGoneAnswerOf` 的调用方会坏，而查不到授权记录；成员的依赖修订会误导读者。
- **作者需明确**：补齐以上各项。`:56` 的「第 26–30 条」在基线就已过时，不算本闭包的问题。

**7. 引用与归属：MC-16 第 9 步把全函数完整写了第二遍**
- **位置**：成员 `:125`；另有 `:64`（MC-7）、`:151`（MC-17 第 4 步）。
- **原句**：「连接是否转 `lost` 只由 `lostOf`……判断，它是传输答复的全函数，按序取第一条成立的：答复带 `unusable` 时转 `lost`……；答复是 `not-sent`（`authorization-required`）时转 `lost`……；其余连接不变（契约 S7、T1）。」
- **依据**：成员 SPEC `:3`「本页不复制条款正文」；判据页「同一概念被定义两次」；闭包规格第 8 条要求「改为引用全函数」。
- **后果**：同一条规则有两处规范陈述，而且已经开始走样：S7 单列 `abandoned`，MC-16 第 12 步写「与 `abandoned` 不转」，见发现 2。
- **作者需明确**：第 9 步只写 `lostOf` 兑现 S7 的哪一条，以及本包「不按原因判断」的取舍，规则本身引用 S7；或者明确标为复述。

**8. 形式对应：`mcp/verification/README.md` 自身不一致**
- **(a)** `:43` 的动作映射还写着 `loseUnlessStopReply`（「T5 对已触发信号的答复不转 `lost`」）。这个函数按追加 1 第 4 条已删，现在是 `calls.ts:309` 的 `loseIfLost`。本闭包改过这一行（加了 `fail-usable`），但没改这一处。SPEC `:324` 把这张表称为逐项对应。
- **(b)** `:298`：「`refresh` 的页请求与就绪连接上的 `discover` 由 `refresh.spec.ts` 的用例与 U4 承担」。本包没有就绪连接上的 `discover`（MC-5 `:56`）。`refresh.spec.ts:367–410` 的 `discover` 用例都在建连中，U4 只改 `lostPageOf`。宣称的覆盖超过了证据。
- **(c)** `:166`：「之后的 `src/` 改动是 `refresh` 的出口与上面两次入口判定……不改变行为」。这句没算本闭包对 `calls.ts`、`tasks.ts` 的改动，而探索器驱动的正是它们。同页 `:161` 报 `call-faults` 932/2306，与表里的 914/2279 不同，并把差别归因到 `deb5a977e` 之后的源码。`:167` 的「N1–N10：`035ac8fee`」也没列 N11。
- **(d)** `:190` 写「本页有四个变异序列」、`:307` 写「探索器的 N1–N10」，都没算上 U 序列与 N11。
- **(e)** `:136` 记 `wide` 158.1 s（没记 head），`:250` 记 360/367 s，两处没有对上。
- **作者需明确**：逐项更新。(e) 的状态数对照归 A 面。

**9. 形式对应：契约一侧没写明 T1 新义务的证据范围**
- **位置**：契约 `:700`、`:712–719`；契约 `verification/README.md`（仍全是占位）；`mcp/verification/README.md:429`。
- **原句**：
  - `:700`：「用违约传输证明套件会变红」
  - `:712`：「T1 的四种失败与 T7 的 `what` 都经 T8 的行核对」
  - `:429`：「契约与 `mcp-host-local` 的 U 行（U6–U11、U13、U14）记在闭包的交回里」
- **事实**：
  - 套件核对的是该行请求本身与之后一个请求的标记（`testing-transport.ts:808–843`、`:1001`）。
  - 套件不核：`lineGoneAnswerOf` 结算的其他在途请求（每格只跑一个请求，`:719`）、`close()` 例外、断开后的停止答复。
  - 漏标与错标两个违约实现没有写进契约 SPEC。简报说「两份 verification/README 新加的节」，实际只有 `mcp` 那份加了节；host-local 那份只改了映射表第 36–38 行。
- **后果**：通过套件的第二个传输，可能误以为 `close()` 与在途请求的标记也被核过；契约与 host-local 的 U 行只存在于任务 tmp。
- **作者需明确**：在契约的「组合与验证」与「未覆盖」里写明标记核对的范围和两个违约实现；定下 U6–U11、U13、U14 的长期记录放在哪里。

**10. 表达歧义（措辞，影响小）**
- **(a)** S8 `:378`「`closeAll` 有本包自己的错误时」：在契约页里「本包」指 `mcp-contract`（参照 `:718`），这里想说的是实现方自己的编程错误，不是端口违约。
- **(b)** T1 `:462` 把 `settle` 列为写入方，但 `settle` 是模块私有函数（`decisions.ts:122`），公开路径是 `concludeAnswer`。
- **(c)** T1 写「`TaskAnswer` 的 `finished` 经 `PeerAnswer` 的 `no-answer` 带它」，而 T6 `:499` 规定 `finished` 只装 `completed` 的 `result` 或 `failed` 的 `error`。
- **作者需明确**：改写这三处措辞。

## 范围外待裁决

- **建连失败的答复归契约还是归实现**：S5 现在写「按服务实现的建连规则处置」，于是建连中 `discover` 失败时 `refresh` 答什么，不再由契约约束。`mcp` 对 `no-answer` 答 `effect-unknown`（MC-5、MC-7）；照 R6「协商失败」去读，会答 `connection-unavailable`。基线的 S5 是约束这一点的。
  - 归契约：所有实现一致，代价是 MC-5 的内容要上移进契约。
  - 归实现：契约更小，但 S7 的原因定义和 `:368` 都要写明不约束建连。
  - 这个决定也决定发现 1、3 怎么改。只列出来，不据此否决方案。负责人：#1119 卡拥有者。

## 未覆盖

- **机械层**：类型、Schema、封闭集合、依赖、模型这几类工具输出都没附，SPEC 与类型的逐项对应没有复核。`check:docs` 只证明链接能解析。
- **没读到的**：host-local 的 `docs/flows.md`、`docs/architecture.md`、object-model 文档；T8 表与代码的逐格对应；证据评论 6688727559（没取）；U6–U11、U13、U14 的记录（在 tmp 交回里）。基线比对依赖上面说的父分支前提。
- **转交 A 面（正确性）**：
  - 传输已死之后，`handedOver` 给停止答复打标记、调用口又丢弃传输的停止答复，这是否符合 W4 规格第 4 条第 3 款（「`abandoned`……T5 的停止信号也在此」→ 不变）的意图。
  - `wide` 的状态数，以及 README `:250`「所以超时来自负载，不来自 P15」这一因果说法。
- **转交 E 面（交付边界）**：发现 5 的三处在写范围外，是否计入验收。
- **已知待清理**：`Calls.tla:14–16` 的注释（「`fail` is `not-sent`」）与 README 的「带 `unusable` 的」不一致，派发者已在守护闭包 15:36 的裁定第 3 条决定延后，这里不算新发现。

## 各项归谁

- 契约 `mcp-contract/SPEC.md` 的文本（发现 1、2、3、4、6、9、10）：由卡拥有者定改法，交下一个写者，写范围需新给。
- 成员 `mcp` 的 SPEC 与 verification（发现 1、2、7、8）：同上。
- 发现 5：reduce 或卡拥有者，这几处不在已派发的写范围里。
- 「范围外待裁决」一项：#1119 卡拥有者。
- 证据缺口：A 面与 E 面各自那一项。

评审完成不代表规格已接受，也不代表实现已验证。
