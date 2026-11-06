# w3-mcp-call 第 4 轮关口（`fcc955a53..2b895ea2a`，简报 `mcp-call-r4-briefs.md`）

## B. 表达（design-reviewer，expression，opus）

本次做的是「表达」判断，判据只读了 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md` 这一页。

**评审对象**：w3-mcp-call 第 4 轮 B 面，PR #1141。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `2b895ea2a`，对象是 `fcc955a53..HEAD` 改动的文档与文档注释。

**工具输出**：简报写明 `check:docs`、`format:check` 在 `2b895ea2a` 上通过，但没有附输出。这两项只查链接、镜像和格式，不查语义与编号，所以语义部分我照常人工核了。

**完成程度**：范围已覆盖，有两点保留。
- 我这次没有 git 和 shell。哪些句子属于「本轮改动」，是按 worktree reflog 的提交信息、docs3 交回的第 7 节和当前文本推定的，没有看 diff。
- `models/README.md` 只读了前 115 行。

---

### 结论

本次表达与规范范围内未发现阻断问题。

下面的非阻断大多是证据状态和读数 head 的残留，集中出在 `2b895ea2a` 漏改的地方和 `44a218fec` 之后没跟上的地方。只有第 1 条涉及契约对行为的写法。

### 阻断

无。

### 非阻断（按影响排序）

**1. 契约 S8 与第 30 条对 `refresh` 的「在途」写窄了，同一概念在成员侧写得更宽（跨契约一致 / 完整性）**
- **位置**：契约 `packages/mcp/mcp-contract/SPEC.md:362`（S8）、`:93`（第 30 条）。对照成员 `packages/mcp/mcp/SPEC.md:64`（MC-7）、`verification/README.md:254`、`:270`，以及 F12 的用例「closeAll while a page is asked: connection-unavailable, not the listing-incomplete…」。
- **依据**：
  - 契约原句是「在途的操作（发出之前：等关口、读存储、建连的等待）不再开始下一步，答同样的结果；已发出的请求的结局不改」。它的「下一步」清单里有「取页」，没有「发布边界」。
  - MC-7 写的是：未发布时，出口一律答 `connection-unavailable`，「不论那一步本来答什么」。关停读取点有读 `basedOn` 之前、取每一页之前、发布边界之前三处。
  - r3 卡拥有者对 A 面范围外 1 的处置已裁「S8 覆盖 `refresh`……已发布的结果不改」。
- **触发场景**：`refresh` 的页请求已发出、尚未发布时 `closeAll` 到来。
- **后果**：
  - 契约的括号只列了调用口和任务操作的三种等待。`refresh` 的提交点是发布，不是某一页的发出。所以契约对「页已发出、未发布时关停答什么」没有写。
  - 如果把「已发出的请求的结局不改」读成也管 `refresh` 的答复，实现会答 `kept`（`listing-incomplete`），与成员和 F12 相反。按面值读，这是缺口，不是矛盾。
- **作者需明确**（契约拥有者，与 N2 是同一句、同一写范围）：
  - S8 与第 30 条对 `refresh` 的「在途」范围（读 `basedOn`、取页、发布边界之前）和「不改」的对象（已发布的结果）。
  - 「下一步」清单要不要补「发布边界」。成员 `SPEC.md:173` 的同一张清单也一并对齐。

**2. F16、F17 的证据状态在同一批文档里自相矛盾（形式对应 / 表达歧义）**
- **位置**：
  - `verification/README.md:272`、`:274`、`:280`、`:416-417` 写 F16、F17 在 `d966e05c1` 上由刷新口扫描用例变红（k=40、k=45）。
  - 同页 `:291`「未覆盖」仍写「读 `basedOn` 之前与发布边界之前的两处核对没有用例守住（F16、F17 存活）」。
  - `SPEC.md:64` MC-7 的变异句写「读 `basedOn` 之前与发布边界之前不读关停 → 没有用例变红（F16、F17 由 `refresh.spec.ts` 逐个微任务落下 `closeAll` 的扫描用例守住…）」。前半句是旧文，后半句是新文，两者相抵。
- **依据**：`2b895ea2a` 的提交信息是「F16、F17 改记为由刷新口扫描用例守住」，这两处漏改了。
- **后果**：读者看「未覆盖」会以为这两个点没有守护。看 MC-7，同一句里同时有「无用例变红」和「已守住」两种读法。
- **作者需明确**：`:291` 删掉「没有用例守住（F16、F17 存活）」，或改成「在 `035ac8fee` 上存活，`d966e05c1` 的扫描用例补上」。MC-7 改为「→ `refresh.spec.ts`「at whichever microtask closeAll lands, the refresh starts no step after it」变红（F16、F17）」。

**3. 读数 head 的声明已过时（形式对应），简报另核的第三项部分不成立**
- **位置**：`verification/README.md:162`、`:165`、`:167`、`:257`、`:397`。
- **依据**：
  - `:162` 写「PR 的最终 head 是 `035ac8fee`」，实际是 `2b895ea2a`。
  - `:165` 写探索器读数之后「`src/` 只改了 `discovery.ts` 的 `refresh` 出口」。但 `44a218fec` 改了 `calls.ts`、`tasks.ts`，并新增 `internal/caller-values.ts`；探索器驱动的正是 `invoke` 和任务操作。
  - `:167`、`:257` 写「F 序列……运行的 head 都是 `035ac8fee`（F8 除外）」。F16、F17 的表行写的是 `d966e05c1`，而且 `:280` 自己说那次运行时用例还没提交，所以这两行也是例外，正文没有列出。
  - `:397` 开头写「全部在 `035ac8fee` 上重跑（F8 除外）」，后文才补 F16、F17。
- **后果**：
  - 每个读数都写了运行时的 head，这一点成立。
  - 读数 head 与 PR head 的关系写错了。F1–F7、F18、C79、C80 和调用口探索器读数是在 `44a218fec` 之前的 `calls.ts`、`tasks.ts` 上跑的，正文没有交代 `44a218fec` 改了什么、为什么不重跑。C 序列在 `:168`、`:307` 有这样的交代，F 序列缺。
- **作者需明确**：
  - `:162` 改成 `2b895ea2a`。
  - 「读数的 head」补一行：`035ac8fee..2b895ea2a` 之间 `src/` 改了哪些文件（`44a218fec` 的值树判定）、哪些读数因此没在最终 head 上重测。
  - `:167`、`:257`、`:397` 的例外加上 F16、F17（`d966e05c1`）。

**4. 新模块 `internal/caller-values.ts` 没进模块文档（完整性 / 引用与归属，与 r3 N7 同类）**
- **位置**：`docs/architecture.md:7-36` 的模块表没有这一行，`:12`（`calls.ts`）、`:13`（`tasks.ts`）的依赖列也没写它或 `@omne-harness/json-text`；`src/index.md:22-38` 也没有这个文件。
- **依据**：`SPEC.md:117`（MC-16 第 1 步）点了 `internal/caller-values.ts` 的名，`calls.ts:32`、`tasks.ts:31` 导入了它。
- **作者需明确**：在模块表和 `src/index.md` 各补一行，写清它的职责：R2 值树判定，交出判定得到的副本。

**5. R2 的值树判定是新承诺，但没有变异记录，也没标「未验证」（形式对应）**
- **位置**：`SPEC.md:117`（MC-16 第 1 步）、`:148`（MC-17 第 1 步），以及 `SPEC.md:143`、`:154` 的变异列表、`verification/README.md` 的 C/F 序列。
- **依据**：
  - `SPEC.md:25` 约定每条结果都带「让守住它的用例变红的变异」。
  - 用例是有的：`invoke.spec.ts:694`、`continue.spec.ts:275`、`tasks.spec.ts:383`。
  - 但没有「不经 `judgedTree`」或「传输拿到原值而不是副本」这一类变异行。
- **作者需明确**：补变异行（写运行时的 head），做不到就标「未验证」。这与 r3 N5 是同一尺度。

**6. 低影响的同步缺口（完整性）**
- `docs/flows.md:94` 写任务操作次序是「发起者 → 关停 → …」，没写 MC-17 第 1 步前置的 `provideTaskInput` 值树判定。
- `tests/index.md:34` 写探索器核对「P1–P8」，`tests/README.md:29` 写的是 P1–P14。这一处我无法确认是不是本轮改的。
- `tests/index.md:29` 的 `refresh.spec.ts` 一行没有提关停扫描用例。`:35` 的替身列表缺 `transports.ts`，而 `tests/README.md:27` 列了它。

### r3 B 面 N1–N11 账本

| 项 | 结论 | 位置 |
|---|---|---|
| N1 | 已改：任务操作统一在出口答 `effect-unknown`（`no-connection`） | `SPEC.md:147`、`:150`（MC-17 第 3 步：「建连途中关停的由出口答…」）、`:173`；契约 S8 `:362`；F7、F9（C80）在 `verification/README.md:266` |
| N2 | 已改，对调用与任务操作成立；对 `refresh` 写窄了，见非阻断 1 | 契约 `:362`、`:93` 的「发出之前：等关口、读存储、建连的等待」「已发出的请求的结局不改」 |
| N3 | 已改：四行 `\|` 已转义 | `verification/README.md:43`、`:45`、`:46`、`:50` |
| N4 | 已改：只有清单标记晚于 `closeAll`，拆除由 `closeEntry` 汇合，并点名守住它的用例 | `SPEC.md:169` |
| N5 | 已改：C79、C80 两行，head `035ac8fee` | `verification/README.md:392-393`、`:306`；`SPEC.md:143`（C79）、`:154`（C80） |
| N6 | 已改：「关停与停止的判定点」一节逐点列用例与变异。之后又出了新残留，见非阻断 2、3 | `verification/README.md:247-282`；`SPEC.md:221`、`:246` |
| N7 | 已改：`classification.ts` 进了模块表，`TaskTable` 写了「有歧义」，SPEC 改用 `connectionFailureOfBuild`，两份 README 的 S8 模块已同步。新模块 `caller-values.ts` 又缺，见非阻断 4 | `docs/architecture.md:22-23`；`SPEC.md:223`；`README.md:99`、`README_ZH.md:99` |
| N8 | 已改：「它的值没有人使用」 | `SPEC.md:168`、`:151` |
| N9 | 已改：生命周期读数写了「head 未记录，未在 `035ac8fee` 上重测」，并加了「读数的 head」一段。但这一段在 `44a218fec` 之后过时，见非阻断 3 | `verification/README.md:127`、`:160`、`:162-169` |
| N10 | 已改：读法段补了「调用口第 N 轮裁定 <面> <号>」；成员 md 里 grep「本闭包」为 0 处；契约第 26、27 条改用「reduce 已定的事」第 7、4 条；`step 10` 标题在 fix3 已改 | `SPEC.md:19`；契约 `:89-90`；`verification/README.md:307` |
| N11 | 已改：第 28、30 条各有一句性质。第 30 条写明是行为改动，「可加」的问题留给卡拥有者 | 契约 `:87`、`:91`、`:93` |

### 简报另核各项

- **关停与停止的判定点三处说法一致**：基本成立。
  - 三个出口的次序在 MC-7 `:64`、MC-16 第 2、3 步 `:118-119`、MC-17 `:147`、`verification/README.md:251-255`、F 序列（F1、F5、F7、F12、F13、F15）之间一致：已发出或已发布的不改，然后停止信号，然后关停，其余原样；任务操作没有调用方信号。
  - 途中各点在 MC-16 第 3、8、11 步、MC-17 第 2、4 步（关口之后不另判，对应 F8）、MC-7（入口、读 `basedOn`、取页、发布边界）与 `verification/README.md:96`、`:259-274`、`models/README.md:25` 之间一致。
  - 不一致的只有：F16、F17 的守护状态（非阻断 2），以及契约 S8 的「下一步」清单缺「发布边界」（非阻断 1）。
- **每个读数都写了运行时的 head**：每一行都写了。读数 head 与 PR head 的关系过时，见非阻断 3。

### 未覆盖

- 没有 git，看不了 diff：本轮改动的范围是推定的。非阻断 6 的几处可能早于本轮。
- 没有逐句核对契约 `src/` 的改动注释，只核了 `services.ts:150`、`transport.ts:55`、`:99`。
- `models/README.md` 第 115 行之后没读。
- **转交 A（正确性）**：`calls.ts:128-146` 的 `checkedSend` 同步 `throw TypeError`，而 SPEC MC-16 第 1 步与契约 R2 `:282` 承诺「返回的 Promise 以 `TypeError` reject，方法不同步抛出」。这是否成立，取决于调用处是不是 async 边界。表达面不判。

### 超出已要求的需求

- 成员 `SPEC.md:183` 的已知限制只点了 MC-16、MC-17，可以顺带写上 MC-7 的 `refresh`。理由：MC-7 正文已经写明，只是已知限制里少了一个交叉引用，没有消费者因此做错。

### 未决政策与证据缺口的 owner

- 非阻断 1：契约拥有者（S8 与第 30 条在调用口闭包的写范围内）。
- 非阻断 2–6：卡拥有者，或下一个表达修复。
- 证据 head（非阻断 3）与变异缺口（非阻断 5）：交 E、D 面与卡拥有者。

评审完成不代表规格已接受，也不代表实现已验证。

## E. 交付边界（general-purpose，sonnet medium；call 全部与 host 五项）

## w3-mcp-call 第 4 轮 E 面（交付边界）与 w3-mcp-host 修复轮复核

只读，没改任何文件。判据只用卡 #1119 现行正文、闭包规格 `w3-mcp-call.md` 的验收清单与「性质及证据义务」，以及卡评论。tmp 里的东西、我在工作树和 `gh` 里核到的只当旁证，在表里标「旁证」。

- call 候选：PR #1141，head `2b895ea2a`（`gh pr view` 读回一致）。
- host：卡上证据在 `50fc8d146`，派发者说最终 head 是 `ebfedc98a`。我读回 `ebfedc98a` 相对 `50fc8d146` 只多两处：`mcp-host-local/SPEC.md` 的 V4 一句，和 `session.spec.ts` 里一行断言。这两处在卡上没有证据评论。
- 卡正文（revision 1）没变。「当前执行与交接」仍写「最近更新：2026-11-04，W2 已收波，准备开 W3」，也没有任何 W3 判据。这是波末写回项。

### 第一部分：call（head `2b895ea2a`）

#### 验收清单

| # | 结论 | 依据与缺项 |
|---|---|---|
| 1 | 未达到（轻） | 6680037685 §4：`2b895ea2a` 上 `turbo run build typecheck test` 只跑 mcp 与 contract，退出 0，`Tasks: 16 successful, 16 total`，mcp 468、contract 548，日志 `332b9400e5689126`。「两层都跑」成立：`test` 脚本是不带 mode 的 `vitest run`，慢层含在内。缺：规格验收 1 点名三个包，含 `mcp-host-local`。卡上最后一次三包运行是 6675951054，在 `0b84a0bec` 上。fix3 规格的验收 1 把 host-local 去掉了。缺 host-local 在最终 head 的运行，或卡上一句说明。旁证：契约 `src` 在 `fcc955a53..HEAD` 只改了 `services.ts`、`transport.ts` 的注释，`mcp-host-local` 在本分支相对基线没有改动。 |
| 2 | 达到 | 第 3 轮缺的那一句，已在 6676484241 写出：已定事项 28 的第 9 步就是 MC-16 的第 12、13 步。旁证：head 上 `invoke.spec.ts` 有 6 个 `step 12:` 用例，但 `step 13:` 只剩 2 个。卡上写的是「3 个，`:745–809`」。第三个按 docs3 的 N10 改标题为 `step 10`，行号也全部漂移。这是已裁定的改名，不是回退。新增的 R2 值树前提有红灯：6680037685 §3，`592c84b99baf1c91` 与 `3930ccb27febdaa2`。 |
| 3 | 达到 | `cancel.spec.ts`。第 3 轮已达到，head 上的 turbo 468 条通过。发出前取消答 `cancelled`、关停之后不派取消，这两处与规格原文不同，见冲突项。 |
| 4 | 达到 | `continue.spec.ts`。同上。新增的 `inputResponses` 值树用例有红灯（见验收 2）。 |
| 5 | 达到 | `tasks.spec.ts`。关停的出口一处判定有 N9、N10 与新用例，6680037685 §1 给了红灯和绿灯的哈希。新增 `provideTaskInput` 的值树用例有红灯 `3930ccb27febdaa2`。 |
| 6 | 达到 | 卡上最近的记录是第 2 轮。旁证：我在 `2b895ea2a` 上对 `src/` 与 `tests/` 跑 `git grep` 查 `createMcpCore`、`McpDiscovery`、`McpCoreOptions`、`internal/canonical`、`doubles/values`，为空。 |
| 7 | 达到 | 第 2、3 轮已达到。`table.ts` 在 `fcc955a53..HEAD` 没有改动。 |
| 8 | 达到 | 契约用例 548 条通过（6680037685 §4）。契约 `src` 只改了两处注释。 |
| 9 | 未达到（轻） | 最终 head 上卡里有：`typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`，在 `44a218fec`，各有哈希，`lint:deps` 的输出写了「81 个成员」；`format:check` 与 `check:docs`，在 `2b895ea2a`，只写「都通过；PASS 2736 个 Markdown 文件」，没有日志哈希，`format:check` 没有输出行。缺四项：① `check:design` 在 fix3 之后任何一个 head 上的输出尾部与哈希。卡上只有 §2 的一句「在 `a9ddf6742` 上……都退出 0」，没有哈希，之后 `SPEC.md` 又改过两次。② `git ls-files --eol \| grep -c w/crlf` 在 `fcc955a53` 之后的任何 head 上的输出，卡上没有。旁证：我在 `2b895ea2a` 上跑得 0。③ `format:check` 的输出行与哈希。④ `lint:oxlint` 的输出尾部。另外，`44a218fec` 到 `2b895ea2a` 只改了 `mcp/SPEC.md` 与 `verification/README.md`，这一点已核对。 |
| 10 | 达到 | 6680037685 §4：`2b895ea2a` 上用语法树检查，mcp 与 contract 的 `src` 中 `as`、非空断言、`any`、SDK 导入都是 0，`type-escapes.log` `81c0e49e470852b4`。第 3 轮缺的是命令与哈希，这次有哈希，关闭。 |

#### 性质及证据义务

| 义务 | 结论 | 依据与缺项 |
|---|---|---|
| 用例 → 缺陷 → 变红 | 未达到 | 缺：C01–C78 在最终 head（或 `44a218fec` 之后的任何 head）上的重跑，或卡上一条说明这些行的缺陷已由 F、N 序列在新结构上承担。依据：规格写「证明变红时改源码、重建 `dist`、跑、还原」。`verification/README.md:168、307` 自己写明 C01–C78 在 `0b84a0bec` 上运行，没有在 `035ac8fee` 上重跑。理由是 fix3 与 `035ac8fee` 改写了 `calls.ts`、`tasks.ts`、`discovery.ts`、`in-flight.ts`、`task-table.ts`、`build.ts`、`lost.ts`。第 3 轮把这条判达到，前提是 `0b84a0bec` 之后 `src` 只改了注释，这个前提现在不成立。6680037685 没有说重跑，也没有说明替代办法。F1–F19 在 `035ac8fee` 上运行，而 `44a218fec` 之后又改了 `calls.ts`（30 行）与 `tasks.ts`（11 行）。fix3 的 11 条红灯、F16、F17 与深判三条新用例各有基线红灯和哈希，这一部分有证据。差分变异 D 面还没有读数，不计入。 |
| 隔离各有一个失效变异 | 未达到（轻） | 同一缺口：C30a/b、C32a/b、C33 的变异停在 `0b84a0bec`，`task-table.ts`、`tasks.ts` 之后又改过。探索器 N4a–d、N8 在 `035ac8fee` 上有记录，用例在 head 上全绿。缺：C30–C33 在最终 head 上的重跑。 |
| 不重发 | 未达到（轻） | 同一缺口：C25、C26、C45、C46 在 `0b84a0bec` 上；用例在 head 上通过。 |
| 每个异步副作用有上界或拥有者 | 达到 | P14，探索器 13 个场景零违例，探索器在 `tests/model/calls.spec.ts` 里随 turbo 468 条在最终 head 上通过。TLC 29 个配置符合判读，`Calls.tla` 与 `ConnectionTable.tla` 的哈希与 docs3 那次运行相同（`0ad4ccd39d25004c`）。 |
| 形式化守护 | 达到 | 负控 N1–N10 在 `035ac8fee`（`974e5333ed5b1bce`）。N9、N10 守「出口给同一个答复」。旁证：`README.md:165` 写「`deb5a977e` 之后 `src/` 只改了 `refresh` 出口」，这句已过时（之后还有 `44a218fec`）。状态数没有在最终 head 重读，但同一探索器随 turbo 在最终 head 上通过。 |
| 并发用 deferred，不用 sleep | 达到 | 刷新口扫描用例按微任务落点（6680037685 §3），F16、F17 分别在 k=40、k=45 变红。 |

#### 第 3 轮 E 面未达到项复核

- 验收 2：达到（见上）。
- 验收 9：在 `fcc955a53` 上已由 6676484241 补齐，但最终 head 上又出现缺口，见上。
- 验收 10：达到。
- 验收 1 的保留（「合入父分支前在合并结果上跑最终门禁」）：仍待办。

#### 冲突项（裁定或修订，对派发时卡文或规格原文；不是达到或未达到，交卡拥有者）

本轮新增：

1. **关停之后不派取消。**
   - 修订：成员 SPEC MC-16 第 11 步，依据第 3 轮 A 范围外 2 的处置（fix3）。
   - 规格原句：「`cancel` 对已发出的调用……`cancelRequest(requestId)`」，验收 2「发出后 `signal` 触发得 `unknown`（`abandoned`）且 `cancelRequest` 被调用一次」，验收 3「`cancelRequest` 恰好一次」。
   - 这条依赖契约 T5 的「`call` 在信号触发后结算」一句，该句的出处在 PR #1138，没有合入（第 3 轮冲突 6，仍成立）。
2. **关停之后，传输对未发出请求答的原因也改答 `connection-unavailable`。**
   - 修订：甲（fix3 已定的事 1）。
   - 规格原句：「reduce 已定的事」第 2 条「`authorization-required` 原样带 `discovery`」，「`session-ended` ……答 `connection-unavailable`」。
3. **值树前提（`44a218fec`，派发者做，`Agent-Role: main`，没有闭包规格）。**
   - 修订：契约 R2 写明 `args`、`inputResponses` 的值树还必须通过 `judgeJsonValue`，不通过 `TypeError` reject，不占位。
   - 与下列原句冲突：
     - 卡正文「契约变更：additive」；
     - 规格「契约 SPEC：只改 S3、O1 的一句出处、`./testing` 样本构造器的列表」；
     - 规格「契约 `services.ts` 只做第 4、5、7 条」；
     - 规格「排除的调用方」：`mcp-contract/src/transport.ts` 与 T 段，「需要改时停下交回」。
   - 该提交改了 `transport.ts` 两处文档注释与 `services.ts:148` 的注释。
   - 事实：把 `2b895ea2a` 与 host 的 `ebfedc98a` 做 `git merge-tree`，只在 `mcp-contract/SPEC.md` 与 `mcp-contract/docs/public-api.md` 冲突。
4. **契约 SPEC 自己写的性质。** 第 26 条写「对构造 `McpPorts` 的宿主不是可加的改动」，第 30 条写「性质：行为改动。`closeAll` 之后对未采用的接入点，`refresh` 由 `not-available-to-you` 变为 `connection-unavailable`」，与卡正文「`contract:additive`」「两契约成员只做可加改动」冲突。这把第 2 轮冲突 1 说得更直白，是否算「可加」仍未裁（docs3 的 `a9ddf6742` 明说不抢先裁）。
5. **PR #1141 正文与现状。**
   - 正文写「发出后的取消调用 `cancelRequest` 一次」，现在关停之后不派取消。
   - 正文写「契约的可加改动」，见第 4 项。
   - 正文「未覆盖」写「调用口的并发还没进形式化验证；`w3-mcp-call-model` 在扩展探索器与 TLA+ 模型」，但探索器与 `Calls.tla` 早已在分支里，卡评论也有记录。
6. **fix3 规格的验收 1 去掉了 `mcp-host-local`**，与闭包规格验收 1 的三包冲突（见验收 1）。
7. **模型档位。** fix3 规格写 Fable high，实际由 Opus 5.5 high 接手（规格追加记录 04:26，理由是 429 限流）。卡文没有档位要求，只记。

仍成立、未变（处置是「波末写回」或「6b」）：

- 第 2 轮冲突 1、4、5、10、11。
- 第 3 轮冲突 1（发出前取消答 `cancelled`）、2（步号 13 步对规格「1–9」）、3（任务号碰撞时发起者也答 `unknown`）、4（`closeAll` 之后先判关停）、5（决定点核）、6（WF5 出处在 PR #1138）、7（形式化义务的出处）。

### 第二部分：host（只复核 `mcp-host-r4.md` E 节「五」的 1–5 项，证据在卡评论 6679800023）

| 项 | 结论 | 依据与缺项 |
|---|---|---|
| 1 验收 2：head 的套件计数 | 达到 | §4：stdio 在前 通过 98、失败 0、不适用 1；Streamable HTTP 在前 通过 97、失败 0、不适用 2。出处 `fix4/gates/turbo2.log`（`f64e2b8d1f7dbe13`），在 `1ec708899` 上。`50fc8d146` 只改了文档、注释与一条负控文案，卡上有说明。保留：最终 head `ebfedc98a` 另加一行断言与 V4 一句，卡上没有对应记录，计数没有重引。这不在 1–5 项内，只记。 |
| 2 验收 9：head 上的源码边界 | 达到 | §4：在 `50fc8d146` 上，命令（`type-escapes.mjs` 对 host `src` 与契约 `src`）、八行输出（`as`、`nonNull`、`any`、`sdkImport` 各为 0）、哈希 `10f9ab7e3061e604`，写明负控与上一个 head 的读数。`ebfedc98a` 没改 `src`。 |
| 3 红灯表（fix3 的 10 条与新增负控；`settle` 守卫变异） | 未达到（轻） | `settle` 守卫变异：达到。卡上说明它与变异无关、判等价，写出理由，附 `mutant-all.log` 与 `mutant.diff` 的哈希。fix3 的 10 条用例：缺。卡上有用例名与基线红或绿，但三行名字以「…」截断，T5 一行是概括。变红输出摘录一条都没有，只有三份基线日志的哈希（fix4 的四条有摘录）。新增负控各自抓的缺陷：缺。卡上只点名了 `mB1`、`mV6-lineend-keeps-authorizing`、`mV6-lineend-settles-discovery`、`mStdio-close-flushes`，没有逐个列出。 |
| 4 8 个超 warn 的逐条处置 | 达到 | §4 的表：2 个 alert 加 8 个 warn（`concludeProbe`、`eventOf`、`exchangeConclusionOf` 等四个同列、`taskReadOf`、`discoverWith`），每条有读数与处置。写明「早先证据里写的『基线以来的存量』不准，按本句改正」。 |
| 5 PR 正文跟上 fix3、fix4 | 未达到（轻） | 正文已有 fix4 一节、23 个负控、套件计数。仍缺：第 2 轮那一条仍写「stdio 线路的在途写是计数」「13 个负控入库」，而 fix3 删了写计数。后面的 fix3 要点也没有撤回这句。验证一节仍说证据在 `50fc8d146`，PR head 已是 `ebfedc98a`。这一项差距很小，可由调度者判。 |
| 6 差分变异在最终 head 的读数 | 待定 | D 面未交。 |

### 给调度者保留的未达到项

call：

1. 验收 1：`mcp-host-local` 在最终 head 的运行，或卡上一句说明。
2. 验收 9：缺四项，见表。
   - `check:design` 在 fix3 之后任何 head 的输出尾部与哈希；
   - CRLF 计数在 `fcc955a53` 之后任何 head；
   - `format:check` 的输出行与哈希；
   - `lint:oxlint` 的输出尾部。
3. 性质「用例 → 缺陷 → 变红」及其延伸（隔离、不重发）：C01–C78 在 `44a218fec` 或之后的 head 上重跑，或一条卡上的处置说明；F1–F19 在 `44a218fec` 之后同样没有重跑。
4. 合入父分支前，在合并结果上跑最终门禁。
5. 冲突项第 1–7 项，加仍成立项，交卡拥有者；`mcp-contract/SPEC.md` 与 `docs/public-api.md` 两份文件在 call 与 host 合并时会冲突。
6. PR #1141 正文需要改准（冲突项第 5 项），卡正文波末写回。
7. 差分变异（call 在 `2b895ea2a`）还没有读数，不计入以上各项。

host：

1. 项 3：fix3 的 10 条用例的全名与变红摘录，新增负控各自抓的缺陷。
2. 项 5：PR 正文里「在途写是计数」「13 个负控入库」，及证据 head。
3. 项 6：待定（D 面）。
4. 最终 head `ebfedc98a` 的一行断言与 V4 一句，卡上没有证据（不在 1–5 项内）。

子代理的「达到」不是接受。

## D. 差分变异（general-purpose，sonnet high；call `2b895ea2a` 与 host `ebfedc98a`）

两次差分变异都跑完了，退出码都是 1，两次的测量都是「无效」，没有可信的分数。我没有改任何被跟踪的文件，两棵树跑完后 `git status` 仍干净。我也没有判任何存活为等价。

### 共同情况
- 启动前两棵树的 head 与简报一致：call 为 `2b895ea2a`，host 为 `ebfedc98a`，`git status` 干净。
- 名额：我进队时前面有别的代理占着名额，没有绕过，等到轮到才跑。call 等了 10 秒，host 等了 230 秒。我没有观察到别的代理在排队等名额。
- 进程数：两次日志开头都写「Stryker 同时 6 个工作进程（环境变量 VITEST_MAX_WORKERS 指定；预算 5 个进程：本机 8 核…）」。6 个进程，没有告警，无需重启。
- 两次的完整日志都已留存：call 在 `/tmp/mut-r4/call.log`，host 在 `/tmp/mut-r4/host.log`。

### 一、call
- 命令：`VITEST_MAX_WORKERS=6 pnpm run mutation --base b2ba7dc89 --since 5204d3799`，在 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call` 运行，退出码 1（ELIFECYCLE）。
- plan-only 的范围只含 `packages/mcp/mcp`（13 个文件、141 段）和 `packages/mcp/mcp-contract`（2 个文件、3 段），都在 `src/` 下，核对通过。
- 开始 2026-11-06 07:54:00 UTC，结束 08:01:53 UTC（含约 10 秒等名额）。
- 账本：`/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/2b895ea2a/20261106-075411`（`summary.md`、`summary.json`、各成员 `.log`、`.mutation.json`）。
- 各成员读数：
  - `mcp`：变异体 338 个，被杀 304、超时 0、存活 30、无覆盖 0、编译错误 0、运行错误 0、没跑测试 4。「测量无效」的原因是这 4 个「没跑测试」，分数不给。未覆盖 93 段，即改动上没有变异体。
  - `mcp-contract`：变异体 0 个，未覆盖 3 段（`services.ts:148-151`、`transport.ts:54-55`、`transport.ts:97-100`）。
- 运行器的「出错」行原样：`packages/mcp/mcp：4 个变异体有用例覆盖、却一条用例都没跑完，Stryker 报成了存活；判为运行出错`。

存活 30 个（文件:行 算子 原文 → 替换），路径前缀都是 `packages/mcp/mcp/src/`：
1. `calls.ts:68` StringLiteral（static） `'stopped'` → `""`
2. `calls.ts:72` StringLiteral（static） `'shut'` → `""`
3. `calls.ts:79` StringLiteral（static） `'call-breached'` → `""`
4. `calls.ts:117` ConditionalExpression `failure.stage === 'settings'` → `false`
5. `calls.ts:117` StringLiteral `'settings'` → `""`
6. `calls.ts:129` StringLiteral `'the arguments of an MCP action'` → `""`
7. `calls.ts:143` StringLiteral `'the input responses of an MCP action'` → `""`
8. `calls.ts:379` ConditionalExpression `result === STOPPED` → `false`
9. `calls.ts:380` ConditionalExpression `result !== SHUT` → `true`
10. `calls.ts:382` ConditionalExpression `result === SHUT` → `false`
11. `discovery.ts:58` StringLiteral（static） `'shut'` → `""`
12. `discovery.ts:160` StringLiteral `'unavailable'` → `""`
13. `discovery.ts:210` StringLiteral `'unavailable'` → `""`
14. `discovery.ts:229` ConditionalExpression `result === SHUT` → `false`
15. `internal/caller-values.ts:11` StringLiteral 模板串 `` `${what} fail judgeJsonValue: ${judged.rejected} at ${JSON.stringify(judged.path…` `` → ` `` `
16. `internal/classification.ts:12` ConditionalExpression `outputSchema === undefined` → `false`
17. `internal/in-flight.ts:84` ConditionalExpression `cell.place.phase === 'ended'` → `false`
18. `internal/in-flight.ts:84` StringLiteral `'ended'` → `""`
19. `internal/lost.ts:58` ConditionalExpression `losing !== 'not-current'` → `false`
20. `internal/lost.ts:58` CallExpression `table.runtime.scope.spawn(losing.done)` → `;`
21. `internal/lost.ts:132` ConditionalExpression `default: return undefined` → `default:`
22. `internal/table.ts:67` ConditionalExpression `connectBound === undefined` → `false`
23. `internal/task-table.ts:46` ConditionalExpression `existing === 'ambiguous'` → `false`
24. `internal/task-table.ts:46` StringLiteral `'ambiguous'` → `""`
25. `internal/task-table.ts:47` StringLiteral `'ambiguous'` → `""`
26. `internal/task-table.ts:56` ConditionalExpression `entry === 'ambiguous'` → `false`
27. `internal/task-table.ts:56` StringLiteral `'ambiguous'` → `""`
28. `tasks.ts:50` StringLiteral（static） `'shut'` → `""`
29. `tasks.ts:190` ConditionalExpression `answer.failure.kind === 'not-sent'` → `true`
30. `tasks.ts:248` StringLiteral `'the input responses of an MCP task'` → `""`

无覆盖：0 个。

没跑测试（不计分，原样）4 个：
- `calls.ts:132` ObjectLiteral `{ ...send.request, args }` → `{}`
- `internal/caller-values.ts:7` BlockStatement `{ const judged = judgeJsonValue(value) if ('rejected' in judged) throw new TypeE…` → `{}`
- `tasks.ts:141` ConditionalExpression `answered.kind === 'answered'` → `false`
- `tasks.ts:209` ConditionalExpression `'failure' in answer` → `true`

超时：0 个。

可判定性：我没有改夹具或代码试过，只读了周边代码。下面是读代码得到的线索，不是结论。
- 第 8、9、10、14 项（`answerAtExit` 里与 `STOPPED` 和 `SHUT` 比较）、第 19、20 项（`loseInScope` 里是否 spawn）、第 17、18 项（`conclude` 的 `'ended'` 提前返回）、第 23 到 27 项（`task-table` 的 `'ambiguous'` 冲突分支）、第 29 项（`tasks.ts:190` 的 `not-sent` 分支）都落在状态与失败分支上。这些应该能由夹具逼出可观察差异，建议先按「测试缺口」处理，不当等价。
- 第 4、5、12、13、6、7、30 项里的纯字符串（原因文本、阶段名）要看规格有没有承诺这些文本。有承诺就补断言，没有才可能是等价。
- 第 1、2、3、11、28 项是 static 变异体，分母是常量定义本身。要判定得看哪条断言应该读到这个常量的值。

### 二、host
- 命令：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf --since 720a5d08a`，在 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host` 运行，退出码 1。
- plan-only 的范围只含 `packages/mcp/mcp-contract`（9 个文件、111 段）和 `packages/mcp/mcp-host-local`（5 个文件、65 段），都在 `src/` 下，核对通过。范围里有 `mcp-contract/src/testing-scripted-transport.ts` 与 `testing-transport.ts`。它们是 `src/` 里的测试夹具文件，被当作产品源码变异。
- 开始 2026-11-06 08:02:34 UTC，结束 08:13:22 UTC（含 230 秒等名额）。
- 账本：`/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/ebfedc98a/20261106-080628`（含 `summary.md`、`summary.json`、各成员 `.log`、`.mutation.json`，以及 host-local 的 `.recheck.*`）。
- 各成员读数：
  - `mcp-contract`：变异体 353 个，被杀 228、超时 0、存活 52、无覆盖 17、编译错误 0、运行错误 0、没跑测试 2、超时未复核 54；未覆盖 70 段；测量无效，分数不给。
  - `mcp-host-local`：变异体 138 个，被杀 108、超时 0、存活 21、无覆盖 2、编译错误 0、运行错误 0、超时未复核 7，其中复核 4；未覆盖 38 段；测量无效，分数不给。
- 运行器的「出错」行：
  - `mcp-contract`：2 个变异体有用例覆盖、却一条用例都没跑完，Stryker 报成了存活，判为运行出错；54 个变异体只因时限到了而超时，没有得到单独复核的判定。
  - `mcp-host-local`：7 个超时变异体超出复核上限。上限是每个成员复跑 8 个，全部复核要复跑 18 个。运行器提示调大 `test-runs.config.json` 的 `mutation.recheckMaxMutants` 或设环境变量 `OMNE_MUTATION_RECHECK_MAX` 后复跑，或缩小范围。
  - 这两个成员的第 54 个和第 7 个「超时」都没有计分，需要父会话决定要不要加大复核上限复跑。我没有私自改配置或环境变量复跑。

#### mcp-contract 存活 52 个（路径前缀 `packages/mcp/mcp-contract/src/`）
- `authorization.ts:132` BlockStatement `{ return undefined }` → `{}`
- `decisions.ts:303` ArrayDeclaration `[]` → `["Stryker was here"]`
- `decisions.ts:474` ObjectLiteral `{ id: '', request: 'initialize', session: false, versions }` → `{}`
- `decisions.ts:474` StringLiteral `''` → `"Stryker was here!"`
- `decisions.ts:474` StringLiteral `'initialize'` → `""`
- `decisions.ts:474` BooleanLiteral `false` → `true`
- `decisions.ts:479` StringLiteral `'streamable-http'` → `""`
- `discovery.ts:65` ConditionalExpression `first.wire.kind === 'no-answer'` → `true`
- `testing-scripted-transport.ts:299` ConditionalExpression `reply.kind === 'unsent'` → `false`
- `testing-scripted-transport.ts:299` StringLiteral `'unsent'` → `""`
- `testing-scripted-transport.ts:300` ConditionalExpression `reply.status < 300` → `false`
- `testing-scripted-transport.ts:300` EqualityOperator `reply.status < 300` → `reply.status <= 300`
- `testing-scripted-transport.ts:361` ConditionalExpression `this.material.kind === 'streamable-http'` → `true`
- `testing-scripted-transport.ts:368` StringLiteral `'streamable'` → `""`
- `testing-scripted-transport.ts:385` ConditionalExpression `!this.pending.delete(entry.id)` → `false`
- `testing-scripted-transport.ts:392` ConditionalExpression `!this.pending.has(entry.id)` → `false`
- `testing-scripted-transport.ts:394` ConditionalExpression `phase.kind === 'discovery'` → `false`
- `testing-scripted-transport.ts:394` StringLiteral `'discovery'` → `""`
- `testing-scripted-transport.ts:394` CallExpression `phase.abort()` → `;`
- `testing-scripted-transport.ts:397` ConditionalExpression `phase.kind === 'discovery'` → `true`
- `testing-scripted-transport.ts:397` ConditionalExpression `phase.kind === 'discovery'` → `false`
- `testing-scripted-transport.ts:397` EqualityOperator `phase.kind === 'discovery'` → `phase.kind !== 'discovery'`
- `testing-scripted-transport.ts:397` StringLiteral `'discovery'` → `""`
- `testing-scripted-transport.ts:426` BooleanLiteral `false` → `true`
- `testing-scripted-transport.ts:427` ConditionalExpression `method !== 'initialize'` → `true`
- `testing-scripted-transport.ts:427` StringLiteral `'initialize'` → `""`
- `testing-scripted-transport.ts:453` ConditionalExpression `signal.aborted` → `false`
- `testing-scripted-transport.ts:454` ObjectLiteral `{ once: true }` → `{}`
- `testing-scripted-transport.ts:454` BooleanLiteral `true` → `false`
- `testing-scripted-transport.ts:455` ArrowFunction `() => signal.removeEventListener('abort', onAbort)` → `() => undefined`
- `testing-scripted-transport.ts:455` StringLiteral `'abort'` → `""`
- `testing-scripted-transport.ts:471` ConditionalExpression `!this.pending.has(entry.id)` → `false`
- `testing-scripted-transport.ts:474` CallExpression `this.pending.delete(entry.id)` → `;`
- `testing-scripted-transport.ts:553` ConditionalExpression `!this.pending.has(request.id)` → `false`
- `testing-scripted-transport.ts:554` ConditionalExpression `probeTimeoutMs !== undefined` → `true`
- `testing-scripted-transport.ts:555` ConditionalExpression `reply.kind === 'result'` → `true`
- `testing-scripted-transport.ts:560` ConditionalExpression `reply.kind === 'http' || reply.kind === 'result'` → `true`
- `testing-scripted-transport.ts:625` ConditionalExpression `credential !== undefined && this.authorized.has(entry.id)` → `true`
- `testing-scripted-transport.ts:625` LogicalOperator `credential !== undefined && this.authorized.has(entry.id)` → `credential !== undefined || this.authorized.has(entry.id)`
- `testing-scripted-transport.ts:625` ConditionalExpression `credential !== undefined` → `true`
- `testing-scripted-transport.ts:640` ArrowFunction `() => controller.abort()` → `() => undefined`
- `testing-scripted-transport.ts:769` ConditionalExpression `signal.aborted` → `false`
- `testing-scripted-transport.ts:774` ConditionalExpression `observe === undefined` → `false`
- `testing-transport.ts:455` ObjectLiteral `{ purpose: 'http-authorization', authorize() { asked() return new Promise(() => …` → `{}`
- `testing-transport.ts:456` StringLiteral `'http-authorization'` → `""`
- `testing-transport.ts:457` BlockStatement `{ asked() return new Promise(() => undefined) }` → `{}`
- `testing-transport.ts:2267` StringLiteral `'tools/call'` → `""`
- `testing-transport.ts:2273` StringLiteral（static） `'T5'` → `""`
- `testing-transport.ts:2279` ObjectLiteral `{ calls: { echo: result(DONE) } }` → `{}`
- `testing-transport.ts:2279` ObjectLiteral `{ echo: result(DONE) }` → `{}`
- `withheld.ts:52` ConditionalExpression `type !== undefined` → `true`
- `withheld.ts:71` MethodExpression `(declared.name ?? '').toLowerCase()` → `(declared.name ?? '').toUpperCase()`

#### mcp-contract 无覆盖 17 个
- `decisions.ts:431` ConditionalExpression `default: { const exhaustive: never = phase return exhaustive }` → `default:`
- `decisions.ts:431` BlockStatement `{ const exhaustive: never = phase return exhaustive }` → `{}`
- `decisions.ts:458` ConditionalExpression，同上形状 → `default:`
- `decisions.ts:458` BlockStatement，同上形状 → `{}`
- `testing-scripted-transport.ts:299` BooleanLiteral `false` → `true`
- `testing-scripted-transport.ts:406` BlockStatement `{ const wire = lineGoneAnswerOf(entry.phase, cause) if (wire !== undefined) this…` → `{}`
- `testing-scripted-transport.ts:408` ConditionalExpression `wire !== undefined` → `true`
- `testing-scripted-transport.ts:408` ConditionalExpression `wire !== undefined` → `false`
- `testing-scripted-transport.ts:408` EqualityOperator `wire !== undefined` → `wire === undefined`
- `testing-scripted-transport.ts:408` ObjectLiteral `{ wire }` → `{}`
- `testing-scripted-transport.ts:568` BlockStatement `{ this.pending.delete(entry.id) entry.fail(defect) }` → `{}`
- `testing-scripted-transport.ts:569` CallExpression `this.pending.delete(entry.id)` → `;`
- `testing-scripted-transport.ts:570` CallExpression `entry.fail(defect)` → `;`
- `testing-scripted-transport.ts:769` ObjectLiteral `{ failure: NOT_SENT_FAILURE }` → `{}`
- `testing-transport.ts:503` BlockStatement `{ events.push('stdin-closed') await writer.abort(reason) }` → `{}`
- `testing-transport.ts:504` StringLiteral `'stdin-closed'` → `""`
- `withheld.ts:71` StringLiteral `''` → `"Stryker was here!"`

#### mcp-contract 没跑测试 2 个
- `connection.ts:37` ConditionalExpression `connection.kind === 'stdio'` → `false`
- `discovery.ts:65` ConditionalExpression `first.wire.kind === 'no-answer' && first.wire.resend` → `true`

#### mcp-contract 超时未复核 54 个
全部在 `testing-scripted-transport.ts`（行 299、300、384 到 392、444、445、451、452、454、468 到 475、508、516、529 到 536、553、554、558、567、641、778、801、827）和 `testing-transport.ts`（行 452、458、2262、2284、2285）。逐条的「文件:行 算子 原文 → 替换」在账本 `summary.md` 里，也在 `/tmp/mut-r4/host.log`。

#### mcp-host-local 存活 21 个（前缀 `packages/mcp/mcp-host-local/src/`）
- `session.ts:183` ObjectLiteral（static） `{ kind: 'line' }` → `{}`
- `session.ts:183` StringLiteral（static） `'line'` → `""`
- `session.ts:272` StringLiteral `'streamable-http'` → `""`
- `session.ts:274` ConditionalExpression `this.connection.kind === 'legacy-sse'` → `false`
- `session.ts:274` StringLiteral `'legacy-sse'` → `""`
- `session.ts:274` StringLiteral `'sse'` → `""`
- `session.ts:274` StringLiteral `'streamable'` → `""`
- `session.ts:309` ConditionalExpression `entry === undefined` → `false`
- `session.ts:337` ConditionalExpression `phase.kind === 'discovery'` → `true`
- `session.ts:337` ConditionalExpression `phase.kind === 'discovery'` → `false`
- `session.ts:337` EqualityOperator `phase.kind === 'discovery'` → `phase.kind !== 'discovery'`
- `session.ts:337` StringLiteral `'discovery'` → `""`
- `session.ts:471` ConditionalExpression `credential === undefined` → `false`
- `session.ts:697` ObjectLiteral `{ kind: 'http-aborted' }` → `{}`
- `session.ts:697` StringLiteral `'http-aborted'` → `""`
- `session.ts:703` ArrayDeclaration `[]` → `["Stryker was here"]`
- `session.ts:709` ConditionalExpression `peer !== undefined` → `false`
- `session.ts:710` BooleanLiteral `false` → `true`
- `session.ts:721` BooleanLiteral `false` → `true`
- `session.ts:921` ConditionalExpression `target === undefined` → `false`
- `stdio-line.ts:225` StringLiteral `'the line closed'` → `""`

#### mcp-host-local 无覆盖 2 个
- `factory.ts:28` BlockStatement `{ queueMicrotask(() => { throw defect }) }` → `{}`
- `factory.ts:29` BlockStatement `{ throw defect }` → `{}`

#### mcp-host-local 超时未复核 7 个（不计分，超复核上限）
- `session.ts:374` ConditionalExpression `next.done` → `false`
- `session.ts:703` ObjectLiteral `{ kind: 'http-stream', messages: [], ended: true }` → `{}`
- `session.ts:703` StringLiteral `'http-stream'` → `""`
- `session.ts:703` BooleanLiteral `true` → `false`
- `session.ts:721` ConditionalExpression `entry.phase.kind !== 'sent'` → `true`
- `session.ts:721` EqualityOperator `entry.phase.kind !== 'sent'` → `entry.phase.kind === 'sent'`
- `session.ts:721` StringLiteral `'sent'` → `""`

复核后判为被杀的 4 个：`session.ts:270` 两条（`this.line.kind === 'stdio'` → `true`；`=== 'stdio'` → `!== 'stdio'`）和 `session.ts:274` 两条（`this.connection.kind === 'legacy-sse'` → `true`；→ `!== 'legacy-sse'`），原因都是「第一遍超时，单独复核判为被杀」。

host 的可判定性：这次我没读 host 一侧的代码，不下判断。有两点只凭输出就能说：
- `mcp-contract` 的存活与超时大多落在 `testing-scripted-transport.ts` 和 `testing-transport.ts` 里，也就是 `src/` 下的测试替身。是否算产品行，该由父会话判。
- 54 个超时需要复核才能计分。

### 要父会话处理的事
1. 两个 head 的差分变异都没有可用分数。原因：call 有 4 个「没跑测试」，host 的 `mcp-contract` 有 2 个「没跑测试」加 54 个超时，host 的 `mcp-host-local` 有 7 个超时超出复核上限。
2. 如要得到有效读数，需要父会话决定是否调大 `OMNE_MUTATION_RECHECK_MAX`、是否缩小 host 范围（排除 `testing-*.ts`），然后复跑。我没有重跑。

## 卡拥有者对差分变异的处置（08:2x UTC）

不调大复核上限复跑，也不逐个补洞。按 C-SM-08 与第 3 轮缩窄，读数只当线索。存活先分类，只有 G 类写用例。

**判据。** 一个存活是缺口（G），当且仅当存在一串公开端口调用加端口替身的答复（不往包内部注入故障），使某条已承诺条款下的可观察结果（答复、端口调用的次数或次序、`closeAll` 的结果）与原代码不同，并且快层、慢层、负控、TLC 都没有守住它。其余各类：

| 类 | 含义 |
| --- | --- |
| E 等价 | 对单调状态的冗余编码、标识用的哨兵字符串、落空的 `default`、不会再进入的幂等守卫、不被读的载荷 |
| T 文本 | `TypeError` 消息与标签，R2 不承诺文本 |
| S 慢层 | 差分变异只跑快层；该分支由慢层用例、探索器场景或负控守住 |
| N 未承诺 | 可观察，但不在任何已承诺条款里 |
| D 替身 | 契约 `src/` 下的测试替身 `testing-*.ts`，不是产品行 |
| R 运行器 | 没跑测试、超时未复核：运行器缺陷，并入波末的测试运行器小卡 |

**call（`2b895ea2a`，338 个变异体，被杀 304，存活 30，没跑测试 4）**

| 存活 | 类 | 理由 |
| --- | --- | --- |
| `calls.ts:68`、`:72`、`:79`，`discovery.ts:58`，`tasks.ts:50`（哨兵 `'stopped'`、`'shut'`、`'call-breached'`） | E | 只作标识比较，换成另一个字符串仍互不相同 |
| `calls.ts:379`（`result === STOPPED` → false） | E | `STOPPED` 只在 `stop.aborted` 时返回（`calls.ts:199`、`:202` 到期即信号已触发、`:352`），落到下一行同样答 `cancelled`；字符串没有 `.kind` |
| `calls.ts:380`（`result !== SHUT` → true） | E | 字符串没有 `.kind`，不会被当作已发出 |
| `calls.ts:382`、`discovery.ts:229`（`result === SHUT` → false） | E | `SHUT` 只在 `table.isShut()` 时返回（`calls.ts:200`、`:353`，`discovery.ts:115`、`:198`、`:208`、`:214`、`:245`），关停单调，`table.isShut()` 仍为真 |
| `calls.ts:117`（`stage === 'settings'` → false，及 `'settings'`） | E | `connectionFailureOfBuild` 对不是 `effect-unknown` 的原因原样返回，设置阶段的原因不会是 `effect-unknown` |
| `discovery.ts:160`、`:210`（`'unavailable'`） | E | `ask` 的缺省失败载荷不被读，只判 `'failure' in` |
| `internal/classification.ts:12` | E | 契约 `classifyOutcome` 判 `outputSchema === undefined`，键在不在不影响 |
| `internal/in-flight.ts:84`（两条） | E | 一个占位只在 `perform` 的一个 `finally` 里收口一次，守卫不会再进入 |
| `internal/lost.ts:58`（两条，不交作用域） | E | `losing.done` 只在本包有编程错误时 reject（端口都经 `ask`）；这是 P7 的兜底，不注入故障看不到 |
| `internal/lost.ts:132` | E | 落空的 `default` 同样返回 `undefined` |
| `internal/table.ts:67` | E | 缺省时限按 `connectBound` 是否为 `undefined` 取，键在不在不影响 |
| `internal/task-table.ts:47`、`:56`（两条） | E | 读出的「记录」不是对象，调用方随后按 `issuedAt` 不符答 `unknown`，结果相同 |
| `calls.ts:129`、`:143`，`caller-values.ts:11`，`tasks.ts:248`（消息文本） | T | R2 只承诺 `TypeError`，不承诺文本 |
| **`internal/task-table.ts:46`（`existing === 'ambiguous'` → false，及 `'ambiguous'`）** | **G** | MC-17 第 1 步「该键转为『有歧义』并一直保持」。已有歧义的键再登记一次时，变异体对字符串取 `.account`，`accountTextOf` 抛出。没有用例做第三次登记 |
| **`tasks.ts:190`（`failure.kind === 'not-sent'` → true）** | **G** | MC-17「已发出的结局（传输的答复、`no-answer` 的 `effect-unknown`）不改」。任务请求已发出、答 `no-answer` 时 `closeAll` 落进来，变异体把它当作未发出，答 `no-connection`。没有用例 |
| 没跑测试 4 个（`calls.ts:132`、`caller-values.ts:7`、`tasks.ts:141`、`:209`） | R | 例如 `calls.ts:132` 把请求换成 `{}`，每条调用口用例都挂住，实际是被杀 |

**host（`ebfedc98a`）**

- `mcp-host-local` 存活 21 个：
  - `session.ts:183`（`{ kind: 'line' }` 哨兵）：E，只按 `stream`、`probe` 两种行动。
  - `session.ts:272`、`:274`（视图的模式字符串与判断）：E，SSE 模式的取消由协议版本决定，快层「in the SSE mode cancelRequest sends notifications/cancelled」通过。
  - `session.ts:337`（四条，停下时带不带 `headers`）：E，答复的 `headers` 只在协商成功时读 `mcp-session-id`（`:846`），被停下的发现永远不是成功。附带观察：这一支带上的 `headers` 从不被读，是可删的死数据，留给 W4 的清理，不在 W3 改。
  - `session.ts:309`（`entry === undefined` → false）：N，多报一个缺陷，没有条款承诺出口收到的缺陷个数。
  - `session.ts:471`（`credential === undefined` → false）：E，没有句柄时的抛出被 `callHandle` 吸收，V3 的计数对象不存在。
  - `session.ts:697`、`:703`、`:709`、`:710`、`:721`（正文断开、空正文结束、正文里的对端消息）：S。这些分支由慢层 `http.spec.ts`「broken streams and re-sending」与真实 SDK 对端的用例驱动。这是按用例内容推断的，没有在慢层上跑这几个变异体。
  - `session.ts:921`（`target === undefined` → false）：S，SSE 回退的 GET 由慢层驱动，同样是推断，没有跑。
  - `stdio-line.ts:225`（`'the line closed'`）：T。
- `mcp-host-local` 无覆盖 2 个（`factory.ts:28-29`，生产缺省的缺陷出口）：已知限制。进程内测它要关掉未处理拒绝守卫，读代码核过：`queueMicrotask` 里抛出。
- `mcp-contract`：
  - 存活 52 个，其中 44 个在 `testing-scripted-transport.ts`、`testing-transport.ts`：D。
  - 其余 8 个：
    - `decisions.ts:474`、`:479`（四条，回退 GET 伪造的 `WireContext` 字段）：E，这些字段不被读。这印证了第 4 轮 C 的「超出已要求」一项：回退 GET 可以直接按状态码判。
    - `decisions.ts:303`（缺省的 `supported` 列表换成 `["Stryker was here"]`）：E，任何真实版本都匹配不到它，结果同样是 `undefined`。
    - `authorization.ts:132`（`{ return undefined }` → `{}`）：E，隐式返回同样是 `undefined`。
    - `discovery.ts:65`（`kind === 'no-answer'` → true）：E，只有 `no-answer` 带 `resend`，其他答复读到 `undefined`，不重发。
    - `withheld.ts:52`（`type !== undefined` → true）：E，`HEADER_TYPES.includes(undefined)` 同样为假。
    - `withheld.ts:71`（`toLowerCase` → `toUpperCase`，以及缺省 `''`）：E，重名检测换成大写同样不分大小写；`name` 已由 `wellFormed` 核过不是 `undefined`，缺省值走不到。
  - 无覆盖 17 个：
    - `decisions.ts:431`、`:458` 是 `never` 穷尽守卫：E。
    - 其余在替身里：D。
  - 没跑测试 2 个、超时 54 个：R。

**结论。** call 有 2 个 G，并进 call 的修复轮，各写一条先红后绿的用例。host 没有 G，不再改代码。

E 面「C01–C78 停在旧结构」一项的处置：
- `--since 5204d3799` 包含 `0b84a0bec` 之后全部改动行，所以差分变异在 `2b895ea2a` 上把 C 序列碰过、之后又改动的行重新变异了一遍：338 个变异体被杀 304 个，30 个存活按上表处置，4 个是运行器问题。
- `0b84a0bec` 之后没改的行，代码不变，C 序列的证据仍然有效。
- C01–C78 不再手工重跑。

## A. 正确性与结构读数（implementation-reviewer，opus high）

## w3-mcp-call 第 4 轮 A 面：正确性与结构读数（implementation-reviewer）

### 结论

**有 1 条阻断**：R2 的值树前提还有一条路径没有关上。如果 `ContinueRequest.inputResponses` 是访问器属性，调用方的值可以不经判定就到达 `transport.call`，探针 R4-3 给出了反例。

第 3 轮的 2 条阻断和 A 面另列的 3 处都已消失。甲在三个出口都成立。L3 热点没有找到破口。结构读数没有新红项。另有 2 条非阻断，需要卡拥有者裁定。

**评审对象**
- 工作树：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`。
- head：`2b895ea2a`。基线：`b2ba7dc89`。
- 本轮范围：`git diff fcc955a53..HEAD`，共 17 个提交、33 个文件。
- 接受级别：按 L3 的问法做。
- 完成程度：简报 A 节第 1–5 项都做完了。检查表第 1–3 问只看了范围内的文件，逐条对照归 E 面。

**工作树状态**
- 开始与结束时 `git status --short` 都为空，HEAD 不变。
- 探针都在工作树之外的副本上运行：`git archive 2b895ea2a packages/mcp` 解到 `/tmp/r4a/src`；对照副本是 `fcc955a53`，解到 `/tmp/r4a/base`。
- 探针源码与日志另存在 `…/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-call-r4-probes-a/`，这是被忽略的路径。

### 第 3 轮阻断与三处，逐条

第 3 轮的探针 `r3a.spec.ts` 与 `r3c.spec.ts` 在 `2b895ea2a` 的副本上复跑过，07:57 UTC，日志见 `r3-probes-rerun.log`。R3-f 原本是 `it.skip`，由下面的 R4-1 扫描取代：7 种操作，每个 k 都扫到第一次在关停之前发出为止。

1. **阻断「`closeAll` 落在等待途中时，答复取决于下一步」：已消失。**
   - 第 3 轮的反例现在的答复：
     - `C3-1a continueWithInput = {"kind":"not-sent","reason":{"kind":"connection-unavailable"}}`
     - `R3-a … = connection-unavailable`
     - `C3-3 invoke = connection-unavailable`，与关停之后才开始的调用相同。
   - 代码：`calls.ts:378-383` 的 `answerAtExit` 读 `table.isShut()`。`under` 与第 8 步只交出 `SHUT` 哨兵（`calls.ts:200`、`:353`）。
   - 用例：
     - `continue.spec.ts`「closeAll while the continuation waits on the store」
     - `invoke.spec.ts:293`「…a call that step 4 would refuse…」
     - `invoke.spec.ts:304`「…a continuation that is not sent…」
     - `invoke.spec.ts:333`
   - R4-1 扫描：没有发出的答复全部是 `connection-unavailable`。三种操作分别是 invoke-fresh 72 个 k、invoke-reused 43 个、continue 43 个，各自扫到第一次发出为止。
2. **阻断「任务操作发请求之前不判关停」：已消失。**
   - 探针读数：
     - `C3-2 k=0 entered=[false] answer=effect-unknown(no-connection) tasks/get at peer=0`
     - `R3-c queryTask in flight = effect-unknown(no-connection) tasks/get received by peer= 0 log=…getTask shut=false`
   - 代码：
     - `tasks.ts:187` 在发请求的同一段同步执行里核关停。
     - 复用路径改为同步（`tasks.ts:184-185`，`succeed(reused)`）。
     - 出口在 `outcomeOf`（`tasks.ts:206`）。
   - 用例：`tasks.spec.ts:428` 与 `:440-464`（reused 与 built 两种逐微任务扫描）。
   - R4-1：queryTask-built 59 个 k、queryTask-reused、provideTaskInput-reused，答复全部是 `effect-unknown(no-connection)`。
3. **关口粒度按 MC-16 编号的一步：已按裁定落地，不再是不一致。**
   - `R3-g … eligibility checks after closeAll = 1` 仍然出现，但这正是裁定允许的：采用与资格两问算一步。
   - 契约 S8 与成员 SPEC 所有权一段用同一句话写明了这个粒度。
4. **`refresh` 与调用口同形：已消失。**
   - 探针读数：`R3-d refresh = {"failure":{"kind":"connection-unavailable"}} tools/list received by peer= 0`。
   - 代码：
     - `discovery.ts:115` 在取每一页之前核关停。
     - `:198` 在发布边界之前核，`:208` 在读 `basedOn` 之前核。
     - 出口 `answerAtExit`（`:226-230`）的次序是：已发布 → 调用方中止 → 关停。
   - 用例：`refresh.spec.ts:410`、`:429`、`:444`（扫描）、`:515`、`:531`。
5. **关停之后不派取消：已消失。**
   - 探针读数：`R3-e invoke = sent unknown(abandoned) … peer cancels= 0`。
   - 代码：`calls.ts:326`。用例：`invoke.spec.ts:639`。

### 甲在三个出口的核对

我沿 `perform`、`sendOrder`、任务操作的 `exchange`、`refresh` 逐条路径读了代码，又用 R4-1 扫描验证（`r4.spec.ts`，07:59 UTC）。

**每条路径的读法**
- 调用口：
  - 答复只在 `answerAtExit` 决定，次序是 `STOPPED` → `sent` 原样 → `stop.aborted` → `SHUT` 或 `isShut()`。
  - 在出口之前直接返回的只有 `correlation-key-in-use`，P13 允许这一项。
- 任务操作：
  - 在出口之前直接返回的只有发起者核对的 `unknown`（`tasks.ts:226`），S8 写明它先于关停。
  - 其余都经 `outcomeOf`。
- `refresh`：
  - 所有路径都经 `answerAtExit`，`published` 不改。

**关停之后有没有开始下一步、问端口**

R4-1 记录了关停之后被问到的端口，分两类：

- **与第 3 轮非阻断 1 的处置一致，不是发现。**
  - 读数：`eligibility.check shut=true`（每种操作 5 个 k），以及 `refresh` 的 `adoption.endpoint shut=true`。
  - 原因：都落在已开始的一步内部。
  - R4-2 的日志：`…adoption.endpoint false, eligibility.check false [closeAll], adoption.endpoint shut=true`。这是 `stillAdmitted` 的第 4 次采用读取。
  - 之后 `isCurrent` 已同步变为假，`store.write` 没有被调用，答 `connection-unavailable`。
- **`transport.discover shut=true`**：invoke-fresh 与 queryTask-built 各 4 个 k。见非阻断第 2 条。

### R2 值树前提的核对

- **正常路径成立（R4-6）。** 传输拿到的是冻结的、与调用方不同的副本：
  - `invoke args: same object = false frozen = true`
  - `continue args same = false frozen = true`
  - `inputResponses same = false frozen = true`
- **非法树的处理成立（R4-4）。** 下面三种情况都以 `TypeError` reject，方法不同步抛出：
  - invoke 带非法 args：`sync throw = false promise = TypeError`。不占位：`cancel(k1) = unknown`。
  - `provideTaskInput` 带非法树：同样 `TypeError`。
  - 对表外任务 `provideTaskInput` 时也答 `TypeError`，说明判定先于查任务表。
  - 两种 `provideTaskInput` 都没有调用 `updateTask`（计数 0）。
- **不受影响的两处。**
  - `args`：`calls.ts:132` 与 `:140` 无条件覆盖。
  - `provideTaskInput`：参数是值，不是被读两次的字段。
- **反例：见阻断 1。**

### L3 热点

**占位句柄**（`in-flight.ts:76-88`）
- `recordSent` 只在 `phase === 'reserved'` 时迁移。
- `conclude` 是幂等的：已 `ended` 时直接返回。
- `conclude` 只在「reserved 且信号未触发」时删除键。删的一定是自己的格子：格子没有 `ended` 时，`reserve` 不会替换它。
- 不论哪一支，格子最后都置为 `ENDED`。
- 没有找到反例。

**任务表**（`task-table.ts:55-71`）
- 跨账户碰撞会粘滞为 `ambiguous`，`get` 对它答 `undefined`。
- 键包含租户、主体、持有与任务号。
- 复用连接时按账户文本匹配（`tasks.ts:127-132`）。新建连接时比较账户（`:113`）。
- 没有找到隔离破口。

**第 8 步与 `perform`**
- 都是先读停止信号、再读关停（`calls.ts:352-353`、`:379-382`）。
- `ask` 在同一段同步执行里调用传输（`port.ts:10-19`），所以核对与发出之间没有让出。
- 用例：`cancel.spec.ts:206`。

**形式证据**
- mcp 的覆盖率子运行显示 `461 passed (461)`，没有 skipped 行。所以带 slow 标签的探索器场景应当都在 `2b895ea2a` 上跑过了，包括 `calls.spec.ts:67` 的 `CONTINUE_SHUTDOWN`（P13 答复一侧）与 lifecycle `wide`。这一点是从计数推断的，没有逐例的日志。
- TLC 没有重跑。

### 结构读数

| 入口 | 命令 | 结果 | 输出在哪 |
|---|---|---|---|
| 依赖规则 | `pnpm run lint:deps` | exit 0：「没有依赖违规…（81 个成员、340 条成员边；1 个组环按具名例外放行）」。这个组环是 GCX-AGENT-CONTEXT，与 mcp 无关 | `mcp-call-r4-probes-a/lint-deps.log` |
| 结构度量（第一次） | `pnpm run metrics --coverage --base b2ba7dc89` | exit 2，07:54 UTC。原因不是名额：D 面变异的沙箱 `packages/.stryker-tmp-packages__mcp__mcp-164346/sandbox-*/package.json` 与 `@omne-harness/mcp` 同名，turbo 报「Failed to add workspace…already exists」 | `/tmp/r4a/metrics.log`（已被覆盖） |
| 结构度量（重跑） | 同上，等 D 面 call 变异结束、沙箱清掉之后运行 | exit 0，08:32:05 UTC。排队 520 s。mcp 覆盖率子运行 1110 s，exit 0，24 个文件、461/461 通过 | `mcp-call-r4-probes-a/metrics.log`；`/data/qiwei/repos/omne-harness-lite/tmp/metrics/2b895ea2a/` |

**`fcc955a53..HEAD` 改动的函数**
- 共 30 个，从 `metrics.json` 按差异行筛出。全部是 `ok`，覆盖率都是 100%。
- 圈复杂度与 CRAP 最高的几个：
  - `calls.ts:246 prepare`：10 / 10
  - `discovery.ts:168 published`：10 / 10
  - `listPages`：8 / 8
  - `sendOrder`、`calls.answerAtExit`、`written`、`discovery.answerAtExit`、`tasks.exchange`：7 / 7
  - `checkedSend`、`refreshOrder`、`built`、`outcomeOf`：6 / 6
  - `publish`：5 / 5
- 其余都在 4 或以下。
- 第 3 轮的 `publish`（CC 17）这次拆成了 `publish`（5）与 `published`（10），读数变好了。
- 摘要里「变更函数超 warn 1」是 `table.ts:318 begin`（CC 12）。本轮没有改它，第 3 轮的处置仍然适用。

**fix3 的红项（lifecycle `wide` 在插桩下超过 600 s）：本次没有复现。** mcp 覆盖率运行 1108 s，测试全部通过，没有超时。

### 阻断

**1. `ContinueRequest.inputResponses` 是访问器时，调用方没有判定过的值树到达了 `transport.call`**

- 检查表：第 9、10 问。
- 位置：`calls.ts:133` 与 `:136-145`（`checkedSend`）。
- 机制：
  1. `:133` 解构 `send.request`，第 1 次读 getter，得到 `undefined`，于是跳过 `judgedTree`。
  2. `:139` 的 `...send.request` 第 2 次读 getter，把没有判定的树复制进新请求。
  3. `:141-143` 的条件覆盖用的是第 1 次读到的局部变量，所以没有替换它。
  4. `continuationOf` 把这棵树交给传输。
- 反例（R4-3，`r4b.spec.ts`，08:00 UTC）：`requestState` 有效；`inputResponses` 的 getter 第 1 次答 `undefined`，第 2 次答 `{kind:'number', value: NaN}`。输出：
  - `answer = {"kind":"sent","outcome":{"kind":"unknown","cause":"abandoned"}} getter reads = 2 transport.call continuation = {"requestState":"s1","inputResponses":{"kind":"number","value":null}} frozen = false`
  - 对照组直接给同一棵非法树：`rejected TypeError`。
  - 所以 `44a218fec` 只修了普通字段，访问器这一条路径没有修到。
- 违背的条款：
  - 契约 R2（本轮 `44a218fec` 改的句子）：「调用方给的值树（`args`、`ContinueRequest.inputResponses`…）还必须通过 `judgeJsonValue`：传输按原词形写出它们，以已判定为前提（T3）。不通过时同样以 `TypeError` reject，不发请求」。
  - 成员 SPEC MC-16 第 1 步：「之后各步与传输拿到的是判定得到的副本」。
- 为什么这条要算数：`json-text/src/judge.ts:338-343` 写明 `judgeJsonValue` 只读自有数据属性，从不调用 getter。值树本身按这个标准判定；包住它的请求对象却被读了两次。
- 后果：请求真的发了出去，结局 `unknown`。传输按原词形写出一棵没有判定过的值，可以是 NaN、环或 Proxy。T3 的前提被打破。
- 实施者需要做的：
  - `send.request` 只读一次：把用到的字段全部解构到局部变量，用局部变量构造新对象，不展开调用方的对象。
  - 补一条用例：`inputResponses` 是访问器（先答 `undefined`，再答非法树）时以 `TypeError` reject，传输计数为 0。
  - 这个改动可以在 C-SM-08 允许的那一轮修复里完成。

### 非阻断

**1. `refresh` 的出口在没有关停时，也让调用方中止优先于关口拒绝（需卡拥有者裁定）**
- 检查表：第 10 问、第 5 问。
- 位置：`discovery.ts:228`，来自派发者的 `035ac8fee`。
- 反例（R4-5，接入点未采用，信号在调用 `refresh` 之前已中止）：
  - 在 `fcc955a53` 上：`{"failure":{"kind":"not-available-to-you"}}`（`run3-base.log`）
  - 在 `2b895ea2a` 上：`{"ok":{"kind":"kept","reason":{"kind":"cancelled"}}}`
  - 信号没有中止时，两个 head 都答 `not-available-to-you`。
- 来源之间的冲突：
  - 成员 MC-7（同一提交改的）写了「没有发布时，调用方 signal 已中止答 kept（cancelled）」，与代码一致。
  - 契约 S5 只列了三个途中核对点（等建连、取每一页、发布边界），没有说出口可以压过关口的拒绝。
  - 对调用口，契约第 29 条明确放宽到「不论那一步本来会以什么原因拒绝」；对 `refresh` 没有对应的裁定。
  - 契约第 30 条列出的「行为改动」里也没有这一项。
- 没有用例覆盖「中止 + 没有关停 + 关口拒绝」这个组合。
- 需要卡拥有者二选一：
  - 给 `refresh` 补一条与第 29 条对应的裁定，并写进契约；
  - 或把出口的 `cancelled` 一支收窄到「途中等待被信号结束」。
- 如果卡拥有者认定 S1 或 S5 是有效的承诺，这一条升为阻断。

**2. 契约 S8 的新句说「已开始的一步内部的本地端口调用照常走完」，但建连在关停之后仍会调用对端的 `discover`（需卡拥有者裁定）**
- 证据（R4-1）：
  - invoke-fresh：`4x {"kind":"not-sent","reason":{"kind":"connection-unavailable"}} | after=["transport.discover shut=true"]`
  - queryTask-built：同样 4 次。
- 位置：`build.ts:301-315`。`negotiate` 在 `transports.open` 与 `transport.discover` 之间没有调用 `deps.shut()`。`discover` 是向对端发 `initialize`，不是本地端口。
- 归属：`build.ts` 不在本轮差异范围内（只改了 `Losing` 的注释），行为由 MC-5 与已定事项 5 管辖（「a build goes no further than the step it is in」）。
- 所以这是本轮交付的 S8 措辞与既有建连行为不一致，不是本闭包的代码缺陷。答复本身没有错，都是关停的答复。
- 需要卡拥有者裁定：二选一。
  - S8 的「本地」改为把建连内部的协商也算在内；
  - 或在建连里于 `discover` 之前核关停。后者归 MC-5 与连接表的拥有者。

### 未覆盖

- TLC 没有重跑。
- 全套门禁没有跑。卡评论 6680037685 的门禁表与哈希我没有核对，归 E 面。
- 差分变异归 D 面。
- 表达、编号与三处说法是否一致，归 B 面。
- `requestState` 是品牌字符串，不是值树，我没有探它在运行时的形状。
- 发布边界里 `stillAdmitted` 的第 3 次采用读取（`guard.ts:84`）算不算关口那一步的一部分：我按「发布边界是一步」处理，与 `refresh.spec.ts:444` 的注释一致，没有另外请人裁定。

### 超出已要求的需求

- `written` 之前不另判关停，是靠 `closeAll` 同步关闭连接、使 `isCurrent` 为假来挡住写入。建议在 `isCurrent` 核对处加一行注释或断言，说明这个依赖：以后如果关闭改成异步，这道防线会静默失效。
- `begin`（CC 12）维持第 3 轮的「本轮不改」。它不在本轮差异里，列在这里只是提醒。

### 观察（不是发现）

- 度量运行的覆盖率日志里仍有 `src/README.md` 与 `src/index.md` 的解析报错。这两个文件被排除出覆盖率，不影响读数。
- D 面变异运行期间，它的 Stryker 沙箱放在被检出的 `packages/` 下，会让同一检出上的 turbo 失败。这是两个评审面的入口在同一检出上互相干扰。

本次范围内的结论只针对上述条目，不代表实现正确，也不代表交付已被接受。

## 卡拥有者对 A、B、E 的处置与修复轮（08:4x UTC，C-SM-08：关口之后唯一一轮）

修复由卡拥有者自己做，两个提交：`a556e3374`（代码与用例）、`ac54ff006`（文档）。

**A 阻断 1，访问器字段读两次：修。** 根因是边界把调用方的请求对象读了不止一次，不是少判了一个字段。改法：`checkedSend` 把每个字段解构一次，用局部值构造新请求，不展开调用方的对象，之后各步只读这份记录。用例「reads each field of the request once…」在修复前变红（`owner-r4fix/before.log` `12783c34b7c756db`）。

**A 非阻断 1，`refresh` 出口里调用方中止先于关口的拒绝：维持代码，写进契约。** 这是 `035ac8fee` 有意对齐调用口的次序，与第 29 条是同一条「状态 → 答复」规则。新增契约裁定第 31 条，写明行为改动；S5 指向它；补用例「a caller that stopped before the refresh answered is told cancelled…」。

**A 非阻断 2，建连在关停之后仍向对端 `discover`：改 S8 的措辞，不改代码。** 建连是 MC-5 的一步（「a build goes no further than the step it is in」）。已开始的一步照常走完，向对端的协商也在这一步里；答复都是关停的答复。S8 与成员所有权一段改为「已开始的一步照常走完，包括这一步内部的端口调用，以及建连这一步里向对端的协商」。

**B 非阻断 1–6：全改。**
1. S8 与第 30 条写全 `refresh` 的在途（读存储、取页、发布边界），以及「已发布的清单不改」。
2. F16、F17 的残留句已改。
3. 读数的 head 写明 `035ac8fee` 之后 `src/` 的两次入口改动、哪些读数没有重测，以及差分变异的读数与账本。
4. `caller-values.ts` 进了模块表与 `src/index.md`。
5. MC-16、MC-17 的变异列表补四条；「交原值而不是副本」写明未验证与理由。
6. `flows.md` 与 `tests/index.md` 已同步。

B 的「超出已要求」（已知限制补 MC-7）不做。

**D 的两个 G：修。** 见上文差分变异的处置。两条用例在对应变异上变红：`owner-r4fix/mutant-task-table-46.log` `b55d15e75c0f61e3`，`mutant-tasks-190.log` `071d77a8bd95b282`。

**E call 未达到项：**
1. 验收 1，`mcp-host-local` 在最终 head 上的运行：本分支没有改它。三个包合在一起，在两个 PR 合入父分支之后跑，那是 W3-C 的验收。
2. 验收 9 缺的四项：在 `ac54ff006` 上一次贴卡。
3. 「用例 → 缺陷 → 变红」与 C01–C78：用差分变异替代，见差分变异处置末段。
4. 合入前在合并结果上跑最终门禁：W3-C 做。

**E 冲突项，卡拥有者裁定：**
- 冲突 1、2（关停之后不派取消；关停之后未发出的一律答 `connection-unavailable`）：按甲已定，波末写回卡正文。
- 冲突 3（值树前提超出闭包规格的契约写范围，卡文写「契约变更 additive」）：
  - 这个前提原本就在 `writeJsonText` 的约定里（「must already be judged by `judgeJsonValue`」），R2 只是把它写明。
  - 合法的值树不受影响。原来不合法的值会被误报成连接问题，现在以 `TypeError` 交还调用方，与 R2 对前提违反的处置一致。
  - 判为前提的写明，不是对合法消费者的破坏性改动。卡正文的「additive」在波末写回时改成按第 26–31 条逐条写性质。
- 冲突 4（第 26、30 条与卡文的「additive」）：同上，波末写回。
- 冲突 5（PR 正文过时）：已改，见 PR #1141。
- 冲突 6（fix3 规格的验收 1 去掉了 `mcp-host-local`）：host-local 的回归由 W3-C 在父分支上跑三个包补上。
- 冲突 7（模型档位）：只记，没有要求。

**E host 未达到项：**
- 第 3 项（fix3 的十条全名与变红摘录、负控逐个）与第 4 项（最终 head 的证据）：并在 host 的最终证据评论里。
- 第 5 项（PR 正文）：已改。

按 C-SM-08，复审只核阻断。唯一的阻断是 A 阻断 1，修复是卡拥有者自己做的，自己核不算复审。所以派一次窄范围的独立复核（implementation-reviewer）：在 `ac54ff006` 上重跑 A 面的探针 R4-3，核对 `2b895ea2a..ac54ff006` 有没有引入新的违反。

## 阻断复核（implementation-reviewer，opus；`2b895ea2a..ac54ff006`，只核 A 阻断 1）

### 评审了什么、做到哪一步

- 仓库与工作树：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，PR #1141。
- 修复前的头是 `2b895ea2a`，修复提交是 `a556e3374`（改了代码与用例），交付头是 `ac54ff006`（相对 `a556e3374` 只改 `index.md` 等文档）。
- 范围是窄复核，只核 A 面 R4 报的那一条阻断，只读，三项全部做完。

### 结论

**R4-3 那条阻断在 `ac54ff006` 上消失了。本次范围内没有发现新的阻断问题。** 本次没有核其余条款，所以不能据此说实现正确或交付已经接受。

### 工具一览

| 入口 | 命令 | 结果 | 输出在哪 |
|---|---|---|---|
| A 面探针 R4-3、R4-4、R4-5（`r4b.spec.ts`），R4-6（`r4c.spec.ts`），加上我新写的 R4-7、R4-8（`r4v.spec.ts`），在 `ac54ff006` 的副本上 | 在 `/tmp/ir-r4v/src/packages/mcp/mcp/zprobe` 下运行 `<工作树>/packages/mcp/mcp/node_modules/.bin/vitest run --config vitest.config.mts --silent=false --reporter=verbose r4b r4c r4v` | 退出码 0，6 条全过，输出见下 | `/tmp/ir-r4v/src.log` |
| 同一组探针，在 `2b895ea2a` 的副本上（作对照） | 同上，副本在 `/tmp/ir-r4v/base` | 退出码 0，R4-3 复现了原缺陷 | `/tmp/ir-r4v/base.log` |
| 单文件快层 | `vitest run --mode fast tests/continue.spec.ts`（在 `ac54ff006` 副本里） | 退出码 0，1 个文件 13 条用例全过，类型检查没有错误。新用例 "reads each field of the request once…" 跑了，结果是 ✓ | `/tmp/ir-r4v/continue-fast.log` |

关于环境，有四点要说明：
- **探针文件位置更正：** R4-6 在 `r4c.spec.ts` 里，不在简报写的 `r4.spec.ts` 里。
- **`pnpm exec vitest` 在副本里起不来：** 报 MODULE_NOT_FOUND，因为副本不是 pnpm 工作区。我改用工作树里 vitest 的绝对路径运行。
- **另外补进副本的文件：** 从 `ac54ff006` archive 出根目录的 `vitest.tiers.mts` 和 `tools/test-runner`，并加了根 `node_modules` 的符号链接。快层配置要用到这些。
- **工作树没有改动：** `git status --short` 是 0 行。

### 探针输出原文

**`ac54ff006`（修复后）：**
```
R4-3 answer = {"kind":"sent","outcome":{"kind":"complete",...}} getter reads = 1 transport.call continuation = {"requestState":"s1"} frozen = n/a
R4-3 control (plain NaN tree) = "rejected TypeError"
R4-6 invoke args: same object = false frozen = true | continue args same = false frozen = true | inputResponses same = false frozen = true
R4-7 invoke answer kind = sent args getter reads = 1 transport.call args = {"kind":"object","entries":[{"key":"a","value":{"kind":"number","lexeme":"1"}}]}
R4-7 continue answer kind = sent args getter reads = 1 calls = 1 transport.call args = {..."lexeme":"2"...}
R4-7 invoke (bad first) answer = rejected TypeError: the arguments of an MCP action fail judgeJsonValue: unknown-field at ["value"] reads = 1 calls = 0
R4-8 invoke kind = sent reads = {"ref":1,"action":1,"args":1,"expectedDefinition":1,"correlationKey":1,"signal":1,"connectBound":1,"observe":1} call keys = ["action","args"] continuation = undefined
R4-8 continue kind = sent reads = {"ref":1,"action":1,"args":1,"requestState":1,"inputResponses":1,"issuedAt":1,"correlationKey":1,"signal":1,"connectBound":1,"observe":1} call = {"action":"read","args":{...},"continuation":{"requestState":"s1","inputResponses":{"kind":"object","entries":[{"key":"q","value":{"kind":"string","value":"y"}}]}}}
R4-4 invoke bad args: sync throw = false promise = TypeError cancel(k1) = unknown
R4-4 provideTaskInput bad: sync throw = false promise = TypeError unknown task + bad = TypeError updateTask seen = 0 calls after first = 1
```

**`2b895ea2a`（对照，修复前）：**
```
R4-3 answer = {"kind":"sent","outcome":{"kind":"unknown","cause":"abandoned"}} getter reads = 2 transport.call continuation = {"requestState":"s1","inputResponses":{"kind":"number","value":null}} frozen = false
R4-7 invoke answer kind = sent args getter reads = 2 transport.call args = {...lexeme "1"...}
R4-8 continue ... reads = {"args":2,"requestState":2,"inputResponses":2,...}
```

**怎样读这些输出：**
- **R4-3：** 修复前，访问器被读了两次。第二次读到的树没有经过判定，却被交给了 `transport.call`，这就是原阻断。修复后只读一次，第一次的答复是 `undefined`，所以续调只带 `requestState` 发出。这符合 S2：两个字段各自可选。
- **R4-7（`args` 访问器，先答合法对象，再答非法树）：** 修复后，`invoke` 和 `continueWithInput` 都只读一次，发出的是那次读到的合法值。顺序反过来（先答非法树）时，调用以 `TypeError` reject，同样只读一次，也不发请求。
  - 修复前 `args` 也被读两次，但那时 `{ ...send.request, args }` 用判定过的副本覆盖了原值，所以 `args` 当时没有构成破口。破口只在 `inputResponses`（还有 `requestState` 的两次读）上。
- **R4-8：** 我用 Proxy 对两个请求的每个字段计了读取次数。修复后每个字段恰好读 1 次。

### 字段核对表

对照契约 `packages/mcp/mcp-contract/src/services.ts` 第 93–115 行，以及 `a556e3374` 里 `calls.ts` 的 `checkedSend`。

| 字段 | InvokeRequest | ContinueRequest | 修复后读几次（R4-8） | 是否进了新记录 |
|---|---|---|---|---|
| `ref` | 有 | 有 | 1 | 是 |
| `action` | 有 | 有 | 1 | 是 |
| `args` | 有 | 有 | 1 | 是，经 `judgedArgs`：先 `judgeJsonValue`，再 `isActionArgs` |
| `expectedDefinition` | 有 | — | 1 | 是（invoke） |
| `requestState?` | — | 有 | 1 | 是，缺省时省略 |
| `inputResponses?` | — | 有 | 1 | 是，有值时经 `judgedTree`，缺省时省略 |
| `issuedAt` | — | 有 | 1 | 是（continue） |
| `correlationKey` | 有 | 有 | 1 | 是 |
| `signal` | 有 | 有 | 1 | 是 |
| `connectBound?` | 有 | 有 | 1 | 是，缺省时省略 |
| `observe?` | 有 | 有 | 1 | 是，缺省时省略 |

**没有字段被丢掉。**

R4-8 是在提供了每一个可选字段的情况下计数的。continue 那次的 `transport.call` 载荷同时带着 `requestState` 和判定过的 `inputResponses`。可选字段为 `undefined` 时被省略：调用方原本给的是显式 `undefined`，省略后语义等价，我没有看到哪个读点会区分「缺省」和「显式 `undefined`」。

### 新路径核对（读出来的，结合上面的探针）

- **之后各步只读新记录：** `perform` 的第一句是 `const send = checkedSend(given)`。这一行之后，`calls.ts` 里对请求的读取都经 `send.request`，包括第 189–191、249、253、264、273、387、426–427 行，以及 `continuationOf(send.request)`。`given` 只在 `checkedSend` 里读过。
  - continue 分支解构了两次 `given.request`（第 150、151 行），但两次取的是不同字段。而且 `given` 是 `perform` 自己构造的 `{ kind, request }`，`request` 是普通属性。R4-8 的 Proxy 计数也印证了每个字段只读 1 次。
- **R2：**
  - 非法树仍然以 `TypeError` reject，而不是同步抛出：`perform` 是 async 函数，R4-4 显示 `sync throw = false`。
  - reject 时不占位：R4-4 显示 `cancel(k1) = unknown`。
  - 两个字段都缺时仍然 reject：在 `checkedSend` 第 152–153 行，读的是同一次解构得到的值。
- **MC-16 第 1 步：** 与 SPEC 第 117 行现在的写法一致（每个字段只读一次，组成新请求，传输拿到判定过的副本）。R4-6 显示副本已冻结，并且与调用方给的对象不是同一个。
- **MC-17：** 这次 diff 没有动 `tasks.ts`。`provideTaskInput` 的 `inputResponses` 是函数参数，不是请求对象上的字段，第 248 行 `judgedTree` 只读它一次，访问器问题不适用。R4-4 显示非法树仍以 `TypeError` reject，不发 `updateTask`。

### 发现

- **阻断：** 无。
- **非阻断：** 无。
- **范围外待裁决：** 无。

### 没有覆盖的部分

- 只核了 `calls.ts` 的 `checkedSend` 这条路径。其余三项操作 `queryTask`、`cancelTask`、`getTaskResult` 的任务定位对象（`ref`、`taskId`、`issuedAt`）有没有被多次读取，本次没有核。这些不是 R2 所说的「值树」，也不在这条阻断的范围里。
- 请求对象本身是 Proxy、并且对同一个键前后给出不同答复的情形：R4-8 的计数说明每个键只读一次，所以已经涵盖了。没有试值树内部嵌套访问器的情形，因为 `judgeJsonValue` 产生副本，这一点是读出来的，没有执行验证。
- 简报限定只跑单个文件，所以只跑了 `continue.spec.ts` 的快层。`tasks.spec.ts` 和 `refresh.spec.ts` 新增的用例，以及全套检查、变异测试与结构度量，都没有跑。
- R4-1、R4-2（关停扫描）不属于这条阻断，没有重跑。

探针源码与日志在 `/tmp/ir-r4v/`：`r4v.spec.ts.tmpl`、`src.log`、`base.log`、`continue-fast.log`。
