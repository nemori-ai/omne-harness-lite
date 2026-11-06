# w4-mcp-unusable 关口发现的结构分析

2026-11-06 16:02 起写，16:05 补入独立复核的五点（见第 3 节末）。起因是负责人 15:59 的要求：发现的问题要结构化、按第一性原理做本质分析，守住顶层架构、跨领域协作、领域边界与 SOLID，实然向应然靠。对象是 PR #1159（head `559be1514`）的关口评审 B、C、E 三面的发现（A 面未交回，交回后按同一框架归入）。原文在同目录 `mcp-unusable-r1-{B,C,E}.md`。

方法：先列事实，再给每条事实命名它所在的轴与这条轴的拥有者，然后比较实然与应然。修复只朝应然走。同一条轴上两处各写一份的，收成一处。

## 1. 本闭包要建立的东西

W4 MCP 规格第 1 节要消除的缺陷是：调用口不知道传输还能不能用，只能按失败原因去猜。应然是把三个事实分开，各归一个拥有者。

| 事实 | 拥有者 | 表达 |
| --- | --- | --- |
| 传输在交出这个答复时还能不能用 | 传输（只有它知道） | 契约 T1 的标记 `unusable` |
| 已建成的连接因这个答复变成什么状态 | 契约 S7 定规则，`mcp` 的 `lostOf` 是唯一实现 | 全函数三条 |
| 建连失败时 `refresh` 答什么 | 实现的建连规则（成员 MC-5、MC-7），W4 规格第 1 节第 4 条末段与第 5 条已定 | 契约 S5 首句把它交出 |

此外还有一条横切的事实：`lost` 原因的词表与每个词的含义。它归契约 S7，必须在两个阶段都成立。一个词只能有一个含义。

## 2. 发现按轴归类

### 轴 A：传输还能不能用（拥有者：传输；契约 T1）

| 发现 | 实然 | 应然 |
| --- | --- | --- |
| B-2、C 有意不列的第 3 条 | 传输已不可用之后，停止答复（`abandoned`）也带标记，连接转 `lost`，这一行为是对的。但 T1 没写单调规则管哪些答复，也没写 `close()` 与断开同时成立时谁优先；MC-16 第 9 步写的理由「T5 的答复不带标记」在传输已死时不成立 | T1 把标记定义成一条事实：传输交出这个答复时已不可用，而且不是本端 `close()` 造成的。它管传输交出的每一种失败答复，含停止答复。有应答的结局不可能由已死的传输交出，所以类型上没有这个字段。`close()` 之后的答复不带标记；两者都成立时 `close()` 优先，与 host-local 现行一致。服务一侧不需要任何关于停止答复的特殊说法 |
| C-F4 | `not-sent`（`session-ended`）的 `unusable?` 类型是整个 `UnusableCause`，类型系统接受 `process-exited` 这种错误组合 | 让非法状态写不出来：这个变体的字段收窄为 `unusable?: 'session-ended'`。这个字段是本闭包新加的，相对基线仍是可加改动 |
| C-F1 | 选可选字段的决定是对的，但 W4 规格 ub-mode 表写的理由有一半不成立（判别联合也挡不住错标），代价没写：编译器看不见漏传；有存在性分支；单调性只有符合性条款在守。`legacyPath` 的 `handedOver(entered)` 漏掉时没有用例变红（C3 存活） | 规格只留真正的理由（可加改动），把代价写全。漏传既然只能靠用例守，每个承载标记的位置就要有能让它变红的用例：给 C3 的路径补一条 host-local 用例 |
| C 交 A 的一条 | `dead ??= cause` 让之后的请求带第一次断开的原因，第二次断开时 `lineGoneAnswerOf` 给在途请求写第二次的原因 | 待 A 面判定后归入：T1 写的是「它记下的原因」，只能有一个值 |

### 轴 B：已建成的连接的状态（拥有者：契约 S7；`lostOf`）

| 发现 | 实然 | 应然 |
| --- | --- | --- |
| B-4 | 「就绪连接」没有定义，而 `degraded` 的连接照常复用 | S7 定义一次：已建成的连接，状态是 `ready` 或 `degraded`，与建连中相对 |
| B-2（S7 一侧） | S7「其余答复不转：…`abandoned`…」没写以不带标记为前提 | S7 的规则只有一句：答复带标记就转 `lost`（第 2 条另列 `authorization-required`）；「其余」写成「不带 `unusable` 的答复」，例子放在后面 |
| B-7 | 成员 MC-16 第 9 步把全函数完整写了第二遍 | 规则只在 S7 写一次。MC-16 只写 `lostOf` 兑现 S7，以及本包「不按原因判断」这个取舍 |
| C-F3 | 「先问 `lostOf`，再交给作用域」在 `calls.ts` 与 `tasks.ts` 各写一遍 | 一个决定只放一处：在 `internal/lost.ts` 加 `loseIfLost(table, ensured, answer)`，两个服务都调用它。「每个调用点只经 `lostOf`」就由结构保证，不必逐处核对 |

### 轴 C：`lost` 原因的含义（拥有者：契约 S7 的词表）

这是 B-1 的本质。先前给 B-1 的裁定是在 S7 加一句「按标记的定义只约束已建成的连接」。这条裁定撤回。理由如下：

- 那样写会让同一个词 `stream-broken` 有两种含义。在已建成的连接上，它表示传输确实不可用；在建连中，它只是失败原因的值。HTTP 建连时 `discover` 遇到一次 5xx，`EndpointStatus` 的读者会读到「到对端的通道断了」，而通道并没有断。
- 建连一侧 `build.ts` 的 `lostOfNoAnswer` 正是按原因去猜，也就是 W4 要消除的那种模式，只是这次猜的是原因而不是可用性。
- 带作用域的说法让偏离表的「没有偏离」只在一种读法下成立。

应然：

- 原因的值在两个阶段由同一个函数给出。`lostOf` 回答的是「这个答复对传输和连接说明了什么」：带标记，原因就是标记；`authorization-required` 就是它自己。这件事与阶段无关。
- 建连失败时，原因取 `lostOf(failure)?.reason`；没有，再按建连的后备规则取：`error-answer` 或 `answer-malformed` 取 `discover-failed`，其余取 `preparation-failed`。清单标记同理，取 `lostOf(failure)?.mark ?? 'connection-unavailable'`。
- 删去 `build.ts` 的 `lostOfNoAnswer`。
- 可观察的变化只有两格：HTTP 建连中 `discover` 答不带标记的 `no-answer`，原因从 `stream-broken` 改为 `preparation-failed`；stdio 建连中遇到 X02（带 `stream-broken` 标记的 `not-sent`），原因从 `preparation-failed` 改为 `stream-broken`。`refresh` 的答复（`reason` 字段）不变，它属于轴 D。
- 这样 S7 每个原因的定义在两个阶段都成立，不需要例外。MC-5 的建连表改为引用 S7 与这条组合，不再自己列原因。

这一处改了 `internal/build.ts`。W4 规格第 1 节第 4 条末段原写「`internal/build.ts` 只给失败的建连标 `LostReason`，本节不改它」，需要更正。理由：W4-1 的验收要求偏离表删空，而且删空必须是如实的。只改正文而保留两种含义，偏离就是被藏起来了，并没有消除。

### 轴 D：建连失败时 `refresh` 答什么（拥有者：实现的建连规则，W4 已定）

| 发现 | 实然 | 应然 |
| --- | --- | --- |
| B 范围外一项 | 问的是这条轴该归契约还是归实现 | W4 规格第 1 节第 4 条末段与第 5 条已经定了：归实现。契约的分工是：定义每个词与每个答复的含义，这些含义处处成立（轴 C）；定义已建成的连接上的规则（轴 B）。实现的分工是：定建连中的处置策略，策略只能使用契约定义的词，并且让这些词的含义成立 |
| B-3 | 契约 S5 末条用成员内部的词（`ensure`、`pending`）替实现定了一条建连规则 | 从契约删去这一条。成员 MC-7 已经写了这一情形（`connect` 阶段为 `pending` 时，答这次连接失败本身）。W4 规格第 6 条的这一半已在 15:56 更正 |

### 轴 E：任务答复的形状（拥有者：契约 T6）

| 发现 | 实然 | 应然 |
| --- | --- | --- |
| C-F2、B-10(c) | T1 新加的半句说「`TaskAnswer` 的 `finished` 经 `PeerAnswer` 的 `no-answer` 带它」，而 T6 规定 `finished` 只装 `completed` 的 `result` 或 `failed` 的 `error`。类型 `finished: { answer: PeerAnswer }` 两种都接受。`resultOf` 不问 `lostOf` | 形状的拥有者是 T6。T1 那半句与 T6 矛盾，删去。类型上的应然是 `finished.answer: Extract<PeerAnswer, { kind: 'result' \| 'error' }>`，让非法状态写不出来；但这是从联合里删成员，对写方是不可加改动。W4 规格只提前了一项 0.1.0 形状项（`UnusableCause` 去掉 `abandoned`），所以这一项登记为 0.1.0 形状项，交负责人决定是否提前。`resultOf` 不加防御性的判断：契约已规定 `finished` 里没有失败，内部类型可以信任 |

### 轴 F：证据与记录（拥有者：各成员的 `verification/`；执行证据在卡上）

B-5（三处旧说法）、B-6（依据表、第 32 条、`streamGoneAnswerOf` 收窄、成员钉的契约修订、`public-api.md` 与失败码索引）、B-8（`mcp/verification/README.md` 的六处）、B-9（契约「组合与验证」没写标记核对的范围与两个违约实现）、B-10(a)(b)（措辞）、E 面的卡上证据缺口。

这一轴没有结构问题，问题都是正文没跟上。修复轮把成员正文改到与代码一致。卡上的证据由派发者在关口结果评论里补齐。U6–U11、U13、U14 的长期记录放在卡评论里，`mcp/verification/README.md` 指向那条评论，不再指向任务 tmp。

## 3. 修复轮的形状

一个写者（developer，Opus 5.5 high）在 `.worktrees/w4-mcp-unusable` 上做。拆成下面这些提交，每个提交闭合一条轴：

1. 轴 C：`build.ts` 的原因与清单标记改为经 `lostOf` 加建连的后备规则；删去 `lostOfNoAnswer`；为两格变化补用例；同步 MC-5。
2. 轴 B：`internal/lost.ts` 加 `loseIfLost`，`calls.ts` 与 `tasks.ts` 都用它；MC-16 第 9、12 步与 MC-17 第 4 步改为引用 S7。
3. 轴 A：`not-sent`（`session-ended`）的字段收窄；为 C3 的路径补 host-local 用例；T1 改写标记的定义（事实、范围、`close()` 优先、原因的值）。
4. 契约正文：S7（「就绪连接」的定义、原因在两阶段统一、「其余」带限定）、删 S5 末条、删 T1 关于 `finished` 的半句、S8 措辞、`settle` 改为公开路径的名字、「组合与验证」写明标记核对的范围与两个违约实现、第 32 条与依据表、`public-api.md` 与失败码索引。
5. 成员正文：依据表钉的契约修订、三处旧说法、`verification/README.md` 的六处。

派发者自己做：更正 W4 规格（第 1 节第 4 条末段，ub-mode 表的标记形状一行）；在最终 head 上跑差分变异；在空闲时原样重跑负控的「同一命令」；写关口结果评论，补齐 E 面的各条证据。

A 面交回后，按同一框架归入以上各轴，再写修复规格。

独立复核（16:05）补的五点，写进修复规格：

1. **轴 E 的第三处。** 守护写者的 `remarkTaskAnswer`（`mcp-contract/tests/transport-conformance.spec.ts:293`）把 `finished` 当作承载标记的位置。删去 T1 那半句时，这个包装要同时停止给 `finished` 加标记，并核对套件里没有一行期望带标记的 `finished`。否则套件与它所测的契约相互矛盾。
2. **轴 C 的用例替身。** `mcp/tests/` 里有替身在建连时答 `no-answer`（`process-exited` 或 `stream-broken`）。如果它们不带标记，原因会从 `process-exited` 或 `stream-broken` 变成 `preparation-failed`。正确的改法是让替身按 T1 与 T8 带上标记（替身也守契约），不是放宽断言。探索器的替身 `ports.ts` 已带标记，`wide` 与 `faults` 的原因不应变；写者重跑探索器快层，交回状态数。
3. **`lostOf` 的 JSDoc。** 现在写「A build does not ask it: a failed build is lost by MC-5」，改后不成立。改写成：这个答复对传输说明了什么；在已建成的连接上决定是否转 `lost`；建连失败时在传输不可用的情形给出原因。
4. **写范围。** W4 规格第 1 节第 4 条末段把 `build.ts`、它的用例与 MC-5 排除在产品写者的写范围之外。派发者先更正这一行，修复规格列出这些路径，跑简报检查。切片 02 只改 `mcp-host-local` 与 `mcp-cordis-contract`，`mcp/src/` 没有并发写者。
5. **改裁定只追加，不改旧条。** 15:56 对 B-1 的裁定留在原处。`mcp-unusable-r1.md` 与 `decisions.tsv` 各追加一条取代它的记录，时刻取自 `date -u`，并写明起因是负责人的要求。

## 更正（18:09，B 面窄复核转来）

轴 A 一段写「有应答的结局不可能由已死的传输交出」，不对：T8 S07 之后，别的已交给线路的请求由各自的应答结算，可能是 `result`、`error-answer`。结论不变：有应答的结局类型上没有标记，它们不说明传输的状态；连接已由 S07 那次带标记的答复转 `lost`。
