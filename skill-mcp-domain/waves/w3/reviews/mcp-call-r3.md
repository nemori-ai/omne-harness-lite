# w3-mcp-call 第 3 轮评审（PR #1141，head `fcc955a53`）

简报 `mcp-call-r3-briefs.md`；五面一次派出（`date -u` 读 03:55 时已在跑）。

## E. 交付边界（general-purpose，sonnet，medium）

## w3-mcp-call 第 3 轮 E 面（交付边界）：PR #1141，head `fcc955a53`，基线 `b2ba7dc89`

只读，没改任何文件。判据是卡 #1119 正文和闭包规格 `w3-mcp-call.md` 的验收 1–10 与「性质及证据义务」。证据只认卡评论 6675951054、6676418696、6666710295、6666710680、6665868317、6659833572。`tmp/closures/` 下的原件不算证据。我自己在工作树里核了几项，结果只作旁证，不当证据。

**结论：10 条验收里，8 条达到，2 条未达到（2、9），另有 1 条（10）证据偏薄。性质及证据义务全部达到。未达到项缺的都是卡评论里没写的文字或输出尾部，不是产物。**

### 旁证（我在工作树里核到的）

- `git diff 0b84a0bec..HEAD -- packages/mcp/mcp/src` 只有三处注释（`lost.ts` 两处、`tasks.ts` 一处）。没有可执行代码变化。
- `5204d3799..HEAD` 里契约只改了 `SPEC.md`，契约 `src` 和用例没动。
- 改动文件都在 `packages/mcp/mcp` 和 `packages/mcp/mcp-contract` 之内。
- 9 个提交的作者都是 PanQiWei。trailer 是 `Harness: claude-code`，`Agent-Role: developer`。最后一个提交 `fcc955a53` 是派发者所做，`Agent-Role` 为 main。
- `git ls-files --eol | grep -c w/crlf` 得 0。

### 验收清单

| # | 结论 | 依据与缺项 |
|---|---|---|
| 1 | 达到，有保留 | 6675951054：派发者在 `0b84a0bec` 复跑三包 `build typecheck test` 退出 0（`4896302db3cf48c6`），16 个任务 14 个命中缓存，mcp 用例实际重跑；写者的慢层退出 0（9 passed，12 skipped）；写者的 turbo 16/16。保留：卡上的最后一次测试运行在 `0b84a0bec`，候选是 `fcc955a53`。差别只有 src 的 3 处注释与文档，不影响行为。慢层与写者的 turbo 没写哈希，也没写运行的 head。 |
| 2 | 部分达到，记未达到 | 已补：`invoke.spec.ts:553–638` 有 6 个 `step 12:` 标签用例，`:745–809` 有 3 个 `step 13:` 标签用例。**仍缺**：第 2 轮裁定要求证据评论写一句「已定事项 28 的第 9 步就是 MC-16 第 12、13 步」。6675951054 与 6676418696 都没有这句。成员 SPEC MC-16（第 116 行）只写了「步号是本条自己的编号」，没有对应关系。缺的是这一句，贴在卡评论里即可。 |
| 3 | 达到 | `cancel.spec.ts` 本轮加了 85 行。C15、C18、C30a/b、C46 在 `0b84a0bec` 上重跑（6676418696：79 条中 78 红）。 |
| 4 | 达到 | `continue.spec.ts` 已改，C25–C28 重跑。第 2 轮已达到，没有回退。 |
| 5 | 达到 | `tasks.spec.ts` 里有同一 `unknown` 且不问端口的用例（`:115`）和任务号碰撞用例（`:560`）。C29–C42、C45 与 G 序列重跑。形式守护新增 `task-collision`（711 个状态，深度 20），6675951054 与 6676418696 有记录。冲突见下。 |
| 6 | 达到 | 第 2 轮已达到。我在 head 上跑 `git grep` 查 `createMcpCore`、`McpDiscovery`、`McpCoreOptions`、`internal/canonical`、`doubles/values`，在 `src/` 与 `tests/` 为空。此后源码与用例的改动没有重新引入它们的迹象。 |
| 7 | 达到 | 第 2 轮已达到。本轮的 `table.ts` 只改 19 行，类型用例与 lifecycle 的用例随成员测试跑过。 |
| 8 | 达到 | 契约 `src` 与用例本轮没有改动，第 2 轮的达到仍成立。 |
| 9 | **未达到** | 第 2 轮要求贴七项门禁的输出尾部。本轮仍没有。6675951054 只写「七项轻门禁与 CRLF 全部退出 0」，没有哈希，没有尾部。6676418696 的表给了哈希：`check:docs`、`check:design`、`format:check`、`lint:rules`、`lint:oxlint`（写者列）与 `typecheck`（派发者列），都没有尾部。`lint:deps` 在两条评论里都没有出现；退出 0 的记录只在任务 tmp 的 `owner-docs2/lint-deps.log` 与闭包追加记录里，不算证据。`lint:oxlint` 的派发者复跑记「未复跑」，CRLF 只有写者在 `8d376c0ba` 的 0，派发者列写「未复跑」。派发者列标注的 head 是「`fcc955a53` 之前的工作区」，不是候选 head。缺：各项命令输出的一两行尾部，尤其 `lint:deps`；以及在 `fcc955a53` 上的读数或明说不重跑的理由。 |
| 10 | **未达到（证据偏薄）** | 6675951054 只写「结构 grep 无命中」，没有命令、没有日志哈希。第 2 轮有三条 `git grep` 加哈希（`8d0c662cdc8b67b5`）才算达到。这一轮的 `as` 与 `any` 检查没有对应记录。我自跑查 `src/`，没有 `as`、`any` 或非空断言的代码命中，只有注释里的词。缺：命令与输出，或哈希。 |

### 性质及证据义务

| 义务 | 结论 | 依据 |
|---|---|---|
| 用例 → 缺陷 → 变红表 | 达到 | 成员 `verification/README.md` 的 C 序列。6676418696：在 `0b84a0bec` 上重跑 79 条，78 红，1 条存活（C37，先复用再判关停，等价：`closeAll` 在让出事件循环前同步关闭每个条目）。驱动 `005dd252100974e8`，汇总 `6e7d45e39d24902a`。README 第 252 行写明每行的运行时 head 是 `0b84a0bec`。 |
| 全部手工变异在最终 head 重跑（第 2 轮未达到） | 达到 | 79 条整体重跑。之后 src 只改了注释。F1(d) 的 C53、C54 与 S8 先判的 C64–C67 已补行。C50 退役，改由 C63、C65、C68 承担。 |
| 不重发 | 达到 | C25/C26（换代）、C45（任务）、C46（发出后取消）。 |
| 每个异步副作用有上界或拥有者 | 达到 | P14，探索器与 TLC；传输一侧的有界依赖契约 T5，写作 WF5。 |
| 隔离各有一个失效变异 | 达到 | C30a/b、C32a/b、C33、N4a–d，新增 G 序列与 N8（删碰撞规则，`task-collision` 报 P12）。 |
| 形式化守护 | 达到 | 探索器 12 个场景零违例；N1–N8 都变红（`89e60336263ca10e`）；TLC 29 份配置全部符合判读（`8ac2d3ac5401be7c`，`Calls.tla` 注释改后在 03:44 重跑）。任务键碰撞 TLA 未建模，README 写了「模型未覆盖」。 |
| 并发用 deferred，不用 sleep | 达到 | fix2 新增的逐微任务扫描用例用 `stalls.ts`，没有 sleep。 |

### 冲突项（裁定或修订，对派发时卡文或规格原文）

第 2 轮列的 11 条里，下列几条仍然成立。它们的处置是「波末写回」或「6b」，我不重复展开。

- 第 2 轮冲突 1：卡正文「契约变更：additive」「两契约成员只做可加改动」，与 `McpPorts.checkOutput` 必填同时存在。
- 第 2 轮冲突 4：契约 SPEC R2、S2、决定清单、依据表的改动超出闭包规格的契约写范围（原只许改 S3、O1 与样本列表）。
- 第 2 轮冲突 5：转 `lost` 按原因判断，与闭包规格「按契约 S7」不同，已登记偏离。
- 第 2 轮冲突 10：契约内部，R1「资格非 `granted` 只答 `Refusal`」与 S2 的 `effect-unknown`（`no-connection`）。组页 `architecture.md` 的 `cancelTask` 与 S2 也不一致。
- 第 2 轮冲突 11：卡正文「当前执行与交接」仍写「最近更新：2026-11-04，W2 已收波，准备开 W3」。W3 行写 `w3-mcp-call` 首项是连接表遗忘谓词。验证拥有者表与 C3–C4 判据没有形式化义务。

本轮新增或更新的冲突项：

1. **发出前取消：fix2 的第 8 步与闭包规格「reduce 已定的事」第 3 条、验收 3。**
   - 规格原文：「`markSent` 答 `cancelled`（取消落在第 6 步之后、发出之前）时，调用已在线上：同样按发出后取消处理」，验收 3 要求「两种发出后的取消都得 `unknown`（`abandoned`）且 `cancelRequest` 恰好一次」。
   - 现行：成员 SPEC MC-16 第 8 步，发出前最后核停止信号，已触发则答 `cancelled`，`transport.call` 计数 0。
   - 依据：卡拥有者第 2 轮裁定 3（「第 8 步在 `transport.call` 前核停止信号」）。N1 因此不再报 `P9-sent-after-stop`（6676418696）。
2. **步号：闭包规格验收 2 与已定事项 28。** 规格写「次序 1–9 每步失败各一例」，现行 MC-16 是 13 步。第 9 步现指 `transport.call` 的 `not-sent`。这就是验收 2 里缺的那句对应说明。
3. **任务号碰撞：卡拥有者第 2 轮裁定 2 与闭包规格验收 5「发起者可用」及实施规格的任务表键。**
   - 规格键：（租户、主体文本、持有、任务号），不含对端账户。
   - 现行：同一键出现不同对端账户时转「有歧义」，两个引用都答 `unknown`，包括合法发起者。
   - 根因（`TaskRef` 与任务表键不带账户）已进计划 6b，没有改。
4. **`closeAll` 之后的次序：契约 S8 新句与决定清单第 30 条，与闭包规格「reduce 已定的事」第 1、2、4 条。**
   - 规格原文：第 1 条写 `invoke` 次序按已定事项 28，每步失败答未发出；第 2 条写 `ensure` 的 `settings` 阶段原因原样作为 `NotSentReason`；第 4 条写换代后答 `unknown`。我没读已定事项 28 原文，对它的次序判断留给调度者。
   - 现行：`closeAll` 之后 `refresh`、`invoke`、`continueWithInput` 先判关停，答「未发出：`connection-unavailable`」，不问关口与存储。
   - 依据：第 2 轮裁定 1。第 2 轮冲突 8 已列同类项（只列了 `continueWithInput`）。
5. **fix2 自裁 2：`under` 在等待之后不再核，改为在决定点核（每次等待之前与第 8 步）。**
   - 第 2 轮裁定 1 写「在途操作在下一步之前判关停」。调度者在 fix2 追加记录里称这「比裁定字面更强」并采纳。
   - 我判断：这不与卡文冲突，只与裁定字面表述不同，已采纳。列出供调度者确认。
6. **WF5 与契约 T5「`call` 在信号触发后结算」一句。** 成员 SPEC 与 `verification/README.md` 第 95 行写这一句「由 `w3-mcp-host` 第 2 轮补入契约，在它合入父分支之前，出处在途」。本 PR 的前提依赖另一个未合入的 PR #1138。卡文没有写这个依赖。
7. **形式化义务的出处：** 闭包规格追加记录（2026-11-05 13:30）把它加给了 `w3-mcp-call-model`，卡正文没有对应条目。这与第 2 轮冲突 11 同类。

子代理的通过不是接受。未达到项（验收 2、9、10）由父会话保留。

### 卡拥有者对 E 的处置

- 验收 2、9、10：缺的是卡上的文字与输出，不是产物。下一条证据评论补：步号对应一句（已定事项 28 的第 9 步就是 MC-16 第 12、13 步，标签用例 `invoke.spec.ts` 里 6 个 `step 12:`、3 个 `step 13:`）；七项门禁与 CRLF 在 `fcc955a53` 内容上的输出尾部与哈希（`tmp/closures/w3-mcp-call/owner-docs2/`）；结构 grep 的命令与输出（`greps.log` `2aae2ef7d1eece3c`）。
- 验收 1 的保留：`0b84a0bec..fcc955a53` 的 `src` 差别只有三处注释（`git diff` 可核），测试读数沿用 `0b84a0bec` 上的运行；合入父分支前在合并结果上跑最终门禁。
- 冲突 1（第 8 步发出前取消答 `cancelled`）、4（`closeAll` 之后先判关停）、5（决定点核）：都有第 2 轮裁定或已采纳的自裁，维持；闭包规格是过程材料，卡正文波末写回。
- 冲突 2：同验收 2，补那一句。
- 冲突 3（碰撞时发起者也答 `unknown`）：已知限制，根因归 6b，维持。
- 冲突 6（WF5 的出处在 PR #1138）：维持。合入次序是调用口先合父分支、host 后合；host 合入后，调用口 SPEC 里「出处在途」改为条款链接，记为波末待办。
- 冲突 7 与第 2 轮冲突 1、4、5、10、11：波末写回卡正文。

## C. 设计与实践（general-purpose，opus，high）

# w3-mcp-call 第 3 轮 C 面（设计与实践）报告

**对象**：PR #1141，head `fcc955a53`。只评 `git diff 5204d3799..HEAD` 中 `packages/mcp/mcp/src/` 与 `tests/`（含 `tests/model/`）的改动。

**判据**：ub-mode、`pstack:typescript-best-practices`、`docs/defensive-patterns.md`、`layers-and-dependencies.md`「方法依据与采用范围」。

**执行情况**：只读，工作树开始和结束时都干净，HEAD 没有变。探针放在工作树之外：`/tmp/call-c3-probe/s8-decision.spec.ts`，`node_modules` 软链到成员目录。运行方式是在 `packages/mcp/mcp` 下执行 `npx vitest run --config /tmp/call-c3-probe/vitest.config.mts --silent=false --reporter=verbose`。运行时，另一个代理正在 `fcc955a53` 上跑 metrics 覆盖率（看过 `pgrep`）。探针每次约 1 s，没有抢资源。

## 结论

本轮的结构改动基本兑现了第 2 轮的裁定：
- 阶段只存在表里。
- `perform` 只有一个出口。
- 「cancelled」只在 `perform` 一处判定。
- `lose` 的同步前缀写进了签名。
- 三条共用规则各只有一份实现。
- 依赖类型的环已经消除。

但「关停」没有得到与「停止」对称的处理：
- `under` 对停止交出哨兵 `STOPPED`，由 `perform` 统一判定。
- 对关停，`under` 却直接交出公开原因 `fail(CONNECTION_UNAVAILABLE)`（`calls.ts:177`），第 8 步再交一次（`:327`）。
- 等待之后的同步决定点没有读关停：第 4 步 `prepareSettings` 与第 6 步 `issuedOn`。

所以，本轮新写进成员 SPEC MC-16 第 3 步和契约 S8 的「在途操作答同一个答复」不成立。探针给出了三个反例。我把它列为阻断，见下。

## 阻断

**1. `closeAll` 落在调用的等待途中时，答复取决于下一步是不是等待，违反 MC-16 第 3 步与契约 S8 新句。任务操作在发请求之前也不判关停。**

依据：
- 成员 `SPEC.md:119`（MC-16 第 3 步）：「`closeAll` 落在调用等关口、读存储或等建连的途中时，调用在下一步之前答同一个答复……首次调用与续调用相同」。
- 契约 `SPEC.md:362`（S8）与 `:93` 第 30 条：「在途的操作在下一步之前判关停，答同样的结果」。
- `under` 的注释（`calls.ts:163-171`）：「a call in flight at `closeAll` answers as one that started after it」。

探针读数（都在 `fcc955a53` 上）：
- **C3-1a**：续调用在等存储读取时，`closeAll` 完成后放行读取，答 `{"kind":"not-sent","reason":{"kind":"unknown"}}`。
- **C3-1b**（对照）：同样的交错下首次调用答 `connection-unavailable`。
- C3-1a 的路径：存储答复之后，`under` 原样交回（`:179`）。`closeAll` 已经同步关闭条目，所以 `table.current` 为 `undefined`，`issuedOn` 为假，答 `fail(UNKNOWN)`（`:240-241`）。这正是第 2 轮 A 的探针 S8-a 的不一致，只是推迟到了下一次等待。
- **C3-3**：首次调用在等关口时 `closeAll` 完成，设置缺 `connect-timeout`，答 `config-missing`。同一请求在 `closeAll` 之后才开始时答 `connection-unavailable`。路径是 `prepareSettings` 的同步拒绝（`:233-234`）。
- **C3-2**（任务操作，复用连接）：调用 `queryTask` 之后同步调用 `closeAll()`（k=0），结果是 `transport.getTask` 在关停已开始之后被调用（`entered=[true]`），答 `connection-unavailable`。契约 S8 对任务操作规定的是 `effect-unknown`（`no-connection`），并且关停之后不问端口。
  - 路径：`request` 的 `await connectionOf(...)`（`tasks.ts:171`）与 `send(on)`（`:175`）之间没有关停判断。`connectionOf` 为了与 `built` 共用类型，把同步的复用决定包成 `Promise.resolve`（`:126`），这一层包装就是空隙。新建路径在 `ensure` 答复之后也有同样的空隙。
  - 已核实副作用有限：`Connection.close()` 之后 `isCurrent` 为假（`connection.ts:111-114`），所以 `failureOf` 里的 `loseInScope` 是空操作。替身对端收到的 `tasks/get` 为 0。真实传输会不会把请求发出去，取决于传输在 `close` 之后是否立即拒绝请求。
  - MC-17 没有对应 MC-16 第 8 步的一步。调用口用逐微任务扫描要求了这一点（`invoke.spec.ts`「step 3: at whichever microtask closeAll lands」），任务操作没有同样的要求。

根因在设计上：
- 写者的自定第 2 条（fix2 交回第 8 节）把裁定的「`under` 开始之前与等完之后都核」（闭包规格 `w3-mcp-call-fix2.md:22`，那里要求「已停止」「已关停」两种哨兵）改成「在决定点核」。它对「等完之后核关不上微任务窗口」的判断是对的。
- 但选定的决定点只有「下一次等待之前」「第 8 步」和「`perform` 答复时」，而 `perform` 只读停止信号，不读关停。第 4、6 步这两个同步决定点被漏掉了。这违反 ub-mode 的「一个决定只在一处」：关停的答复写在两处，第三处缺失。

为什么门禁全绿：
- 闭合扫描用例只用首次调用加正常设置，两次等待之间没有会拒绝的同步步骤，所以观察不到。
- 续调用的 S8 用例（`continue.spec.ts`「closeAll while the continuation waits on the gate」）只覆盖等关口，没有覆盖等存储。
- `Calls.tla` 的 `Refused` 不带原因（`:193`），模型把配值与清单读取并进 `gate`，复用到发请求是一个原子步骤，外部动作只在静止时到达。
- `models/README.md:25` 只对「关停之后不问端口」声称代码与模型可观察结果相同，没有对「答同一个答复」这样声称。
- 证据覆盖的主张比 SPEC 写的窄，属于 DP-10 的缺口。派发者在 fix2 追加记录里写的「可观察结果相同」，对答复原因不成立。

可选修法（由卡拥有者选，见下节第 1 条）：
- **甲（对称，一处决定）**：`under` 与第 8 步交出第二个哨兵 `SHUT`，不再交公开原因。`perform` 在收口的同一段同步执行里判定：先按停止信号判 `cancelled`（`:360` 现有），再判「未发出且 `table.isShut()`，或者结果是 `SHUT`」，答 `connection-unavailable`。前置读取只负责「不问端口」，答复只在 `perform` 一处判，三个反例在任何微任务落点上都闭合。
  - 代价：关停开始后，传输对已离开的请求答的 `authorization-required` 或 `session-ended`，也会被改答为 `connection-unavailable`。
- **乙（最小）**：在第 4、6 步（`:233`、`:241`、`:245`）之前补上关停读取。缺点是决定点仍靠人工逐个列举。
- **丙**：把 MC-16 第 3 步与契约 S8 的句子收窄到「不问端口」，承认答复原因可能不同。
- **任务操作**：无论选哪种，`request` 在 `send(on)` 之前都要读一次 `table.isShut()`，答 `NO_CONNECTION`，对应 MC-16 第 8 步。也可以去掉 `connectionOf` 的 `Promise.resolve` 包装，让复用路径同步走到发请求，再补一条任务操作的逐微任务扫描用例。
- **用例**：`invoke.spec` 的闭合扫描应补「续调用」与「第 4 步设置缺陷」两种变体，与 `cancel.spec.ts:304` 对停止信号做的变体同理。

## 待卡拥有者裁定

1. 上面阻断的修法选甲、乙还是丙。选甲时，还要裁定发出之后的传输 `not-sent`（例如 `authorization-required`）在关停开始后是否改答 `connection-unavailable`。
2. 任务操作的关停窗口（C3-2）按调用口的标准处理（逐微任务、发请求之前判），还是只要求「静止时到达的 `closeAll`」。后者会让调用口与任务操作的标准不一致，需要在 MC-17 写明。

## 非阻断

1. **`Losing` 只拦住了常见的退化，类型并不保证同步前缀**（`build.ts:68`、`:165-168`；`table.ts` 的 `lose`）。
   - 能拦住的：把 `markLost` 或 `table.lose` 改成 `async`，或在开头加 `await`，签名就变了，调用方 `losing.done` 不再通过类型检查。这符合裁定第 6 条的字面。
   - 拦不住的：同步函数返回 `{ done: (async () => { await x; entry.connection.lose(reason); … })() }` 照样通过类型检查。`Losing` 注释里「one that awaited first could not answer this shape」说得过满。
   - 剩下的守护只有 `:167` 与 `:168` 相邻这一点。没有用例在调用答复的那一轮同步读状态：P14 用例 `invoke.spec.ts:670-697` 在 5 轮之后才读。
   - 建议：补一条在调用 `.then` 里同步读 `status` 的用例（第 2 轮 A 的探针 SC-a 的写法），或者把注释改成只声称签名层面的保证。
2. **句柄允许在 `conclude()` 之后调用 `sent()`**（`in-flight.ts:77-79`）。
   - 已结束的键会被改回 `sent`，之后 `reserve` 永远答 `in-use`，而且没有人再收口。
   - `perform` 的结构让这条路径不可达（`sendOrder` 在 `finally` 之前全部 await 完），所以只是表示上的漏洞。
   - 另外，撤销之后的孤立 `Cell` 仍写着 `reserved`。
   - 可选修法：`sent` 只在 `reserved` 时迁移；或者撤销时把 `cell.place` 置为一个终态，让孤立句柄的状态如实。
3. **命名**：
   - `sendOrder` 里 `place.sent(…)`（记录发出）紧挨着 `sent(UNKNOWN_ABANDONED)`（构造答复）（`calls.ts:334-335`、`:341`），同名不同义。
   - 探索器用 `Reservation as Place` 导入（`explore.ts`），而 `in-flight.ts` 内部的 `Place` 是阶段并集，指的是另一样东西。
   - 建议给其中一个改名。
4. **`TaskTable.get` 交出 `TaskRecord | Ambiguous | undefined`**（`task-table.ts:51`）。
   - 非法状态已经不可表示：「有歧义」吸收后续登记，类型迫使消费者先收窄。
   - 但唯一的消费者把 `'ambiguous'` 与 `undefined` 等同（`tasks.ts:169`）。可以让 `get` 只交 `TaskRecord | undefined`，把歧义留在表内，接口更小。属于品味项。
5. **小项**：
   - `tasks.ts:158` 的注释行有 141 字符，插入新句子之后没有重新折行。
   - `lostOfOutcome` 的 `default` 没有穷尽检查（`lost.ts`）。这是为了把圈复杂度降回 2 的有意写法。
   - 用例标题「step 3: at whichever microtask closeAll lands…」断言的是第 8 步的行为（发出前核关停），按 SPEC 的步号读法应写 step 8。表达方面归 B。

## 简报的四个重点

- **占位句柄与单一出口：成立。**
  - `reserve` 交出 `Reservation`（`stop`、`sent`、`conclude`），阶段只在 `Cell.place` 里。`perform` 没有可变局部变量，`markSent` 的 `TypeError` 守卫已删除。
  - `perform`（`calls.ts:353-365`）只有一个 `try/finally → place.conclude()`。
  - 再次 `conclude` 由 `place.phase === 'ended'` 与 `this.#cells.get(text) === cell` 两道判断保证幂等，由 `in-flight.spec.ts`「concludes once」用例钉住。
  - 只有句柄写 `Cell`，表的 `cancel` 只读阶段并触发控制器：单写者由结构保证。
- **`under`、`STOPPED` 与 `cancelled`：停止这一侧是一处决定。**
  - `STOPPED` 只在 `stop.aborted` 时产生，`perform` 的 `:360` 一处判为 `cancelled`。
  - `'stage' in` 已删除，`connectionOf` 在等待内部做映射。
  - 关停这一侧不对称，见阻断。
- **`loseOn` 与 `loseInScope` 两个入口：清楚。** 前者等标记（discovery），后者把 `done` 交给作用域（calls、tasks），两者都直接调用同步的 `table.lose`。同步前缀的保证范围见非阻断 1。
- **共用规则各一份实现：成立。**
  - `connectionFailureOfBuild`（`lost.ts`）由 `notSentOfEnsure` 与 `failureOfEnsure` 共用。
  - `classificationOf`（新增 `internal/classification.ts`）由 `applyAnswer` 与 `resultOf` 共用。
  - `ensureOptionsOf`（`table.ts`）由三个服务共用。
  - `CONNECTION_UNAVAILABLE` 只有 `entry.ts:66` 一个。
  - `withdraws(GateDecision)` 改成全函数，删掉了两个调用点的前置判断，是减法。
  - `InvokerDependencies = CallsDependencies & TasksDependencies`，类型环已消除。
  - diff 里没有 `as`、`!` 与 `any`。
- **用例与探索器：**
  - 新用例断言的是公开答复、端口计数（`gateCalls`、`countedReads`、`portCalls`）与 `status`，不断言内部调用。
  - 两条逐微任务扫描只观察：读 `signal.aborted`，以及用例自己持有的 `shut` 标志，然后委托给原方法。每个 k 都建全新的环境。`reshapedTransports` 在 `open` 上多出的微任务只会平移 k 的取值，扫描覆盖了全部 k。
  - `CountedInFlight`（`explore.ts`）包住句柄，先调原方法再报告，只观察。
  - `tests/unhandled.ts` 守卫在绿灯运行时不改变行为。探索器的 `withHooks` 在运行期间先移走全部监听器、结束后再恢复，所以 N 序列负控不会被守卫误判。

## 第 2 轮 C 各项

| 项 | 裁定 | 本轮状态 |
|---|---|---|
| 1 发出与登记之间的 `cancel` 不核代际 | 登记 | 已登记：SPEC 第 11 步（`:126`） |
| 2 阶段两个来源 | 改 | 已消除：`Reservation`/`Cell`；`sent` 在 `conclude` 之后的表示漏洞见非阻断 2 |
| 3 `cancelled` 两处决定 | 改 | 停止一侧已消除；关停一侧不对称，见阻断 |
| 4 建连失败映射写两份 | 改 | 已消除 |
| 5 任务操作关口等待无界 | 登记 | 已登记：SPEC `:185`，「调用口…不在此列」已替换旧对照句 |
| 6 同步前缀只靠注释 | 改 | 签名层面已改；保证范围见非阻断 1 |
| 7 `classify.ts` 裸 `catch` | 6b | 不在本轮 |
| 8 依赖类型环 | 改 | 已消除 |
| 9 `ContinueRequest` | 6b | 不在本轮；`continue.spec` 补了只带 `inputResponses` 的用例 |
| 10 可读性 | 改 | 已改：`applyAnswer`、`loseUnlessStopReply`、`CALL_BREACHED`；`Sent.access` 与 `asIs` 的 `_on` 已删；第 8 步有了对应代码；新的命名小项见非阻断 3 |
| 11 关停先判的时序 | 设计裁定 | 等关口这一种交错已闭合（`tasks.ts:99`，`continue`/`tasks` 用例）；等存储、第 4 步与任务发请求之前仍不一致，见阻断 |

## 未覆盖

- 结构读数、`lint:deps` 与差分变异没有跑，归 A、D。
- `discovery.ts` 的 `refresh` 在关口与 `ensure` 之后、取页之前有没有同样的微任务空隙：没有探，`refresh` 这条路径归 A 读。
- `tests/model/explore.ts` 只读了 `CountedInFlight`、`loseOn` 的替换和键 E 的定义；`TASK_COLLISION` 的探索与 TLC 没有重跑。
- 阻断里的修法甲、乙没有手工实现验证；三个反例只在当前 head 上复现过。
- 契约 SPEC 与成员文档的表达归 B。


### 卡拥有者对 C 的处置

**阻断（`closeAll` 落在等待途中时答复不一致；任务操作发请求之前不判关停）：成立，选甲。**

- **卡拥有者的核对失误。** 采纳 fix2 自裁 2（「在决定点核」）时，派发者只读了「关停之后不问端口」这一半（fix2 追加记录 03:05），没有核「答同一个答复」这一半；模型 README 的「可观察结果相同」也只对端口成立。C 的三个探针（`mcp-call-r3-probes-c/s8-decision.spec.ts`）在 `fcc955a53` 上给出反例。
- **同类第二次。** 第 2 轮 A 的探针 S8-a（续调用在关停之后答 `unknown`）与本轮 C3-1a 是同一类：`closeAll` 落在途中时，答复由「下一步碰巧是什么」决定。按收敛阶梯不再补检查点（乙），从结构上改。
- **第一性原理。** 关停与停止信号是同一种东西：一件外部事件让调用结束。停止那一侧已经是一处决定（`under` 交哨兵，`perform` 在收口的同一段同步执行里读 `stop.aborted` 判 `cancelled`）。关停应当同形：途中各点只负责「关停之后不问端口」，不负责决定答复；答复只在 `perform` 一处，从当时的状态读出。这样决定点不必逐个列举，任何微任务落点都闭合。
- **做法（甲）。**
  - `under` 与第 8 步对关停交哨兵（例如 `SHUT`），不再交公开原因。
  - `perform` 判定次序：停止信号已触发 → `cancelled`；否则结果是 `SHUT`，或结果是「未发出」且 `table.isShut()` → 「未发出：`connection-unavailable`」；其余原样。
  - 代价已裁：关停开始之后，传输对未发出的请求答的 `authorization-required`、`session-ended` 等也改答 `connection-unavailable`。依据是契约 S8 的「在途的操作答同样的结果」：本实例不会再连接，传输特有的原因已无用处。已发出的结局（`ok`、`unknown`）不改。
  - 任务操作同形：在与 `send` 同一段同步执行里核关停（对应 MC-16 第 8 步），去掉 `connectionOf` 复用路径上只为对齐类型的 `Promise.resolve` 空隙；任务操作的出口一处判定：没有发出且 `table.isShut()` → `effect-unknown`（`no-connection`）。MC-17 写明这一步，与调用口同一标准（逐微任务）。
  - 用例：`invoke.spec` 的逐微任务关停扫描补「续调用等存储」与「第 4 步设置缺失」两个变体；任务操作补一条逐微任务关停扫描。三个探针转成用例，在 `fcc955a53` 上变红。
  - 形式守护：探索器的 P13 加答复一侧的断言：`closeAll` 之后结算、没有发出的调用答 `connection-unavailable`（`cancelled` 除外），任务操作答 `effect-unknown`（`no-connection`）；配负控（`perform` 不读关停）。`Calls.tla` 的 `Refused` 不带原因，模型不覆盖答复原因，README 写明「模型只覆盖不问端口，答复由探索器与用例守」。
- 成员 SPEC MC-16 第 3、8 步与 MC-17、契约 S8 第 30 条的句子按此核一遍；句子本身（「答同样的结果」）不收窄。

**待裁 2（任务操作按调用口的标准）：** 是，按调用口的标准（逐微任务），见上。

**非阻断：**
1. `Losing` 只在签名层面保证同步前缀：改。注释收窄到签名层面的保证；补一条在调用的 `.then` 里同步读 `status` 的用例。
2. `conclude()` 之后仍可 `sent()`：改。`sent` 只在 `reserved` 时迁移；撤销时把格子置为终态。
3. 命名：改。句柄的 `sent` 改成说出副作用的名字（如 `recordSent`），探索器的 `Reservation as Place` 去掉别名。
4. `TaskTable.get` 交出 `Ambiguous`：改。歧义留在表内，`get` 只交 `TaskRecord | undefined`。
5. 小项：注释折行；`lostOfOutcome` 的 `default` 维持（有意，圈复杂度）；用例标题「step 3: at whichever microtask closeAll lands」按断言内容改为 step 8。

## B. 表达（design-reviewer，expression，opus，xhigh）

本次是「表达」判断。我读的判据页是 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/.meta_harness/.claude/skills/harness-design-handbook/references/review/expression.md`，只读了这一页。它是宿主投影，canonical 源在同树 `.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`，两者我没有逐字比对。

**评审对象**：w3-mcp-call 第 3 轮 B 面，PR #1141。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `fcc955a53`，增量起点 `5204d3799`。

**范围**：
- 成员：`packages/mcp/mcp/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`（architecture、flows、object-model）、`verification/README.md`、`verification/models/README.md`。
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的前言、依据表、根入口一行、新节「调用口闭包的裁定」、S1、S2、S8、R1、R2、R6、R7、T5、T9。
- 只沿依赖读了：`src/calls.ts`、`src/tasks.ts`、`src/internal/lost.ts`、`src/internal/table.ts`（`closeEntry`）、`Calls.tla:69-70`，以及用例标题。

**完成程度**：范围已覆盖。我没有 git 和 shell。「本轮改动」的范围是我根据 fix2、docs2 两份交回的文件清单与第 2 轮报告的原句推定的，不是 diff。

**工具输出**：
- 简报附了 `tmp/closures/w3-mcp-call/owner-docs2/`。`check:docs` PASS（2736 个文件），`check:design` PASS。这两项只核链接、镜像、出处与拥有者，不核表格形状、编号读法与语义。
- 我另外读了 `owner-docs2/tlc-all.log` 与 `tlc/20261106T034439Z/summary.json`，以及 `docs2/mutations/logs/table.json`。

---

## 阻断

本次表达与规范范围内未发现阻断问题。

---

## 非阻断（按影响排序）

**N1　契约 S8 的新句说在途的任务操作「答同样的结果」，成员 MC-17 与用例却答另一个结果，偏离表没有登记**
- **类别**：跨契约一致。
- **位置**：
  - 契约 SPEC `:362`（S8）与 `:93`（第 30 条）。
  - 成员 SPEC MC-17 第 3 步 `:150`，以及「所有权」`:173`。
  - `src/tasks.ts:66-67`。
  - `tests/tasks.spec.ts:429`「a shutdown under way while the connection is built is connection-unavailable」。
- **依据**：
  - S8 原句：「`closeAll` 之后……四个任务操作答 `effect-unknown`（`no-connection`）……在途的操作在下一步之前判关停，答同样的结果」。
  - 成员 `:173` 原句：「建连途中关停仍按 MC-17 第 3 步答 `connection-unavailable`」。
  - `failureOfEnsure` 把 `settings` 阶段的 `connection-unavailable` 原样交出。
- **触发场景**：任务操作经关口新建连接，`closeAll` 落在 `ensure` 建连途中。
- **后果**：
  - 照契约实现得到 `effect-unknown`（`no-connection`），照成员实现得到 `ConnectionFailure`（`connection-unavailable`）。
  - 同一次 `closeAll`，同一个操作随落点不同有两种答复。第 2 轮 C 11 的探针指出的正是这个样子，第 2 轮的裁定只闭合了「等关口途中」那一段。
  - 成员与契约不一致，却没有登记偏离。
- **作者需明确**：先由有权者在「范围外 1」里选定答复，再把契约与成员改成同一句；在改好之前，在偏离表登记这一行。

**N2　S8 的「在途的操作」没有限定在发出之前**
- **类别**：可实施性 / 表达歧义（契约侧）。
- **位置**：契约 SPEC `:362`、`:93`。
- **依据**：
  - R2 `:276`：「未发出」没有对端效果。
  - R5、O6：已发出的调用只能答 `sent`。
  - T5 `:470`：关闭时在途的请求答 `no-answer`（`abandoned`）。
  - 成员 MC-16 第 3 步 `:119` 自己把这条限定在等关口、读存储、等建连三处。
- **触发场景**：调用已在线上等应答时 `closeAll` 到来。任务请求已发出时同理。
- **后果**：照字面，实现者可以在应答到达之后「判关停，答同样的结果」，也就是对一个已发出的请求答「未发出：`connection-unavailable`」，谎报效果。现在的成员实现没有这样做，但契约文字允许这样做。
- **作者需明确**：在 S8 与第 30 条里写明「发出之前（等关口、读存储、建连的等待）」。

**N3　动作映射表有四行把代码跨度里的 `|` 当成了分隔符，「实现」列会被渲染丢掉**
- **类别**：引用与归属 / 表达歧义。
- **位置**：`verification/README.md:43`（`Ask call`）、`:45`（`Ask answer`）、`:46`（`Abandon`、`SpawnCancelReq`）、`:50`（`TaskOp`）。前两行是本轮改写的（fix2 交回第 7 节点名 `:43-47`）。
- **依据**：
  - `` `answer transport.call:tA1 ok | fail | reject` `` 里的 `|` 没有转义。prettier 已经把 `fail`、`reject` 对齐成独立的列，表头只有三列。
  - GFM 规则：代码跨度里的 `|` 也分格，超出表头列数的格被丢弃。
- **触发场景**：在 GitHub 上读这张表。
- **后果**：这四行的第三列显示的是 `fail` 这样的碎片，`sendOrder`、`answerOf`、`request` 等实现映射看不到。SPEC 链到 `#动作映射` 时落到的是这张坏表。这条是按规则推断的，我没有实际渲染核对。
- **作者需明确**：把这些 `|` 写成 `\|`。

**N4　「所有权」说拆除可以落在 `closeAll` 返回之后，与 MC-10、MC-14 相反**
- **类别**：表达歧义（同一份 SPEC 内的文字冲突）。
- **位置**：成员 SPEC `:169`；对照 MC-10 `:76` 与 MC-14 `:97`。
- **依据**：
  - `:169` 原句：「这些拆除与标记可以落在 `closeAll` 返回之后」。
  - MC-10：`closeAll`「等全部释放与拆除结束后报告」；`lose` 在途时的关闭等这次拆除完成。
  - MC-14：一条连接同时只有一次拆除，后来的加入它。
  - `table.ts:206-214`：`closeEntry` 对每个条目都走 `teardown(entry)`。
  - 第 2 轮 A 的探针只看到清单写入晚于 `closeAll`。
- **触发场景**：调用答 `not-sent`，`loseInScope` 发起拆除，宿主随即 `closeAll`，拆除的 `close()` 挂起。
- **后果**：宿主读 `:169` 会以为 `closeAll` 不等调用发起的拆除。按 MC-10、MC-14 它要等，挂起也已列在「已知限制」里。
- **作者需明确**：
  - 如果只有清单标记会晚于 `closeAll`，`:169` 改成「标记」，并写明拆除由 `closeAll` 经条目唯一的拆除汇合。
  - 如果拆除也可能晚于 `closeAll`，改 MC-10。
  - 实际是哪一种，代码事实转交 A。

**N5　两条变异声明既没有 C 行，也没有标「未验证」**
- **类别**：形式对应。
- **位置**：
  - 成员 SPEC `:143`：「`checkOutput` 不交给 `classifyOutcome` → `invoke.spec.ts`「declared output schema」变红」。
  - `:154`：「`settings` 阶段的 `connection-unavailable` 答 `no-connection` → 「a shutdown under way」变红」。
- **依据**：
  - C01–C78 里没有这两种变异。C23 改的是契约的吸收，C58、C59 改的是 `unknown` 支与缺省支。
  - `table.json` 里这两个用例只在别的变异的连带变红里出现：「a shutdown under way」在 `:612`，「declared output schema」在 `:1461` 之后。
  - docs2 闭包的「性质及证据义务」：没有运行记录的写「未验证」。
- **后果**：读者以为这两条映射各有一个能翻转它的变异守住，实际没有记录。
- **作者需明确**：补两行 C 记录，或者把这两句标为「未验证」。

**N6　「三个决定点由扫描用例守住」只给了其中两个点的证据**
- **类别**：形式对应。
- **位置**：成员 SPEC `:220`、`:245`；`verification/README.md:174`；`models/README.md:68`。
- **依据**：
  - 这几处说：`under` 等待之前、第 8 步、`perform` 答复时三个决定点，由逐微任务扫描用例守住（变异 C63、C65、C68）。
  - C63 是 `perform`；C65、C68 是第 8 步。
  - `under` 的等待前核对由 C48 与 C64 守住，它们变红的都不是扫描用例：C48 是「a signal that fired before the call starts no wait」，C64 是四条 `after closeAll` 与 `waits on the gate` 用例。
- **后果**：同一轮里一次等待的答复与停止信号或关停一起到来时，「下一次等待之前不问端口」这一条有没有扫描证据，没有记录，而这句话说有。
- **作者需明确**：把 C48、C64 及其用例写成 `under` 这一点的证据，或者把这句话收窄为两个点。

**N7　本轮的结构改动没有同步到 docs 与 README**
- **类别**：完整性 / 引用与归属。
- **位置与缺口**：
  - `docs/architecture.md` 模块表（`:9-35`）没有 `internal/classification.ts` 一行，而 SPEC `:128` 点名了它。
  - `docs/architecture.md:22` 的 `TaskTable` 行与 `docs/object-model.md:89` 没有写「有歧义」，而 SPEC `:168` 写了。
  - 成员 SPEC `:222` 写「同一个 `failureOfEnsure`」。共用的函数现在是 `connectionFailureOfBuild`（MC-17 第 3 步 `:150`），`failureOfEnsure` 只在 `tasks.ts` 里。
  - `README.md:99`、`README_ZH.md:99` 的维护段写「S8 是 `connections.ts` 与 `internal/table.ts`」。S8 的新句现在由 `calls.ts`（`under` 与第 8 步）、`tasks.ts`、`discovery.ts` 承载。
- **后果**：维护者按入口找不到新模块与新状态，改 S8 时漏改承载它的模块。
- **作者需明确**：在这四处补上。

**N8　R2-3 的残留：「总经 `ask` 读取」与「没有人读它」在同一句里相抵**
- **类别**：表达歧义。
- **位置**：成员 SPEC `:168`：「对端的应答总经 `ask` 读取……停止信号触发之后只丢弃它的值，没有人读它」。MC-17 第 4 步 `:151`「迟到的应答交给作用域、没有人读」。
- **后果**：第 2 轮担心的那种读法（不给应答挂处理，重现 F2）还能从「没有人读」读出来。
- **作者需明确**：删掉「没有人读它」「没有人读」，或改成「它的值没有人使用」。

**N9　读数的 head 还有一个缺口**
- **类别**：形式对应。
- **位置**：`verification/README.md:127-140`（生命周期探索器表）与 `:159`。
- **依据**：表头只写「2026-11-05」，没有 head。之后 `table.lose` 与 `markLost` 改了签名。`:159` 已经自认没有重测。
- **后果**：状态数绑不到修订。「有限范围通过」由 `0b84a0bec` 上的通过支持，状态数不由它支持。
- **作者需明确**：写出读数的 head，或者写「head 未记录，状态数未在 `0b84a0bec` 上重测」。

另外建议在 `verification/README.md:252` 补一句：`0b84a0bec` 到 `fcc955a53` 之间 `src/` 只改了注释（`lost.ts`、`tasks.ts:132`）。C、N 表与探索器读数都在 `0b84a0bec` 上，PR head 是 `fcc955a53`，正文现在没有交代两者的关系。

**N10　引用形式的残留**
- **类别**：引用与归属。
- **位置与缺口**：
  - 成员 SPEC 有「第 2 轮裁定 C 1」`:127`、「C 2」`:84`、「A 1 与范围外 1」`:147` 这种形式，读法段 `:19` 没有定义它。按 `:19` 的例子，不带「调用口」的「第 N 轮裁定」读作生命周期轮次；「C 1」还与契约条款 C1 相近。
  - `verification/README.md:233`、`:255` 与 `models/README.md:107` 写「本闭包」，没有写闭包名。
  - 契约 `:89`、`:90` 写「W3 调用口闭包已定事项 7、4」。闭包规格自己的节名是「reduce 已定的事」，正文里「已定事项 N」指的是 W3 线的条目。
  - `invoke.spec.ts:809` 标题是「step 13」，但它断言的是第 10 步（发出代际）与 MC-12 的行为；SPEC `:116` 规定「step N」指 MC-16 的步号。`:745`、`:780` 也断言了收口，标 step 13 成立。
- **作者需明确**：`:19` 补「调用口第 2 轮裁定 <面> <号>」的读法，并在这几处加上「调用口」；「本闭包」换成闭包名；契约第 26、27 条改用「「reduce 已定的事」第 7、4 条」；`:809` 改成 step 10。

**N11　契约新节只说明了第 26、27、29 条的性质，没有说明第 28、30 条**
- **类别**：完整性。
- **位置**：契约 SPEC `:87`、`:14`。
- **依据**：
  - 第 30 条改变了可观察的答复：`closeAll` 之后对未采用的接入点，`refresh` 由 `not-available-to-you` 变成 `connection-unavailable`。
  - 第 28 条加了契约值，并把 O1 加强为全函数。
- **后果**：消费者看不出这两条要不要适配。
- **作者需明确**：在 `:87` 为第 28、30 条各写一句性质。它们算不算「可加」，属于卡上「契约变更：additive」的冲突，转交 E。

---

## 范围外待裁决（只列出，不据此否决）

1. **任务操作在建连途中遇到关停，答哪一个**（N1 的根）。第 1 轮裁定 N7 定为 `connection-unavailable`；第 2 轮的设计裁定和第 30 条写成「答同样的结果」。两条都已采纳，现在互相冲突。
   - 甲：契约 S8 加例外「建连途中的关停按建连失败映射」。代价：同一次 `closeAll` 对任务操作有两种答复。
   - 乙：成员改答 `no-connection`。代价：推翻 N7，要改 `failureOfEnsure` 与 `tasks.spec.ts:429`。
   - 拥有者：契约拥有者与卡拥有者。
2. **第 2 轮范围外 3、4 本轮没有动**：R1 `:274`「控制操作……只答 `Refusal`」与 S2 `:317` 的 `effect-unknown` 冲突；R7 `:300` 对 `no-connection` 的定义。仍归计划 6b。

---

## 第 2 轮逐条结论

- **R2-1 已改**：MC-7 `:64`、MC-16 第 3 步 `:119`、「所有权」`:173`、契约 S8 `:362` 与第 30 条 `:93` 同一口径。S1 `:310` 没有加指引，但 S8 自己写明「先于 S1」，与 S7 的写法一致，可以接受。新句的范围问题见 N1、N2。
- **R2-2 已改**：C 序列每行都写了 `0b84a0bec` 与日志哈希，grep「最终 head」「e510d444f」「变异 S1」都是 0 处。补的行：F1(d) 是 C53、C54；S8 是 C64–C67；第 8 步是 C65、C68；占位句柄是 C70、C78；碰撞是 C69。映射表第 1 行 `:135` 改引的两个用例，在 `table.json` 的 C07 里都变红。
- **R2-3 已改**：第 11 步 `:127`、`:168`。残留见 N8。
- **R2-4 已改**：依据表 `:14`、前言 `:55`、新节 `:83-93`（第 28–30 条带出处）、根入口 `:101` 补了两个常量、S8 的重复句已删。残留见 N10、N11。
- **R2-5 已改**：`:19` 补了 WF4–WF5 与 P14 T1/T2；`:131`、`:147` 写明了来源；用例标题已改为 step 3（C64 的变红清单里可见）。残留见 N10。
- **R2-6 已改**：`:220`、`:245`、`verification/README.md:174`、`models/README.md:68` 说的是同一句。残留见 N6。
- **R2-7 已改**：`:255`、`verification/README.md:95`、`:169` 写成对传输的前提，并写明「出处在途」。契约 T5 现文 `:469` 确实没有这一句。闭合要等 `w3-mcp-host` 合入，届时核对引用的措辞。
- **R2-8 已改**：`models/README.md:19` 与 `Calls.tla:69-70` 相符。
- **R2-9 已改**：两种语言的 README `:95` 只链接，不列编号。
- **R2-10 已改**：S8 的变异编进 C64–C67；自裁的来源写在 `:254`；MC-12 `:84` 的两句对上 C01（并说明原句构造不出）与 C55；`:342` 与 C01 的三条变红一致。残留见 N5。
- **R2-11 已改**：`lost.ts` 文件头 `:1-11`、`lostOfNotSent` `:84-89`、`lostOfNoAnswer` 与文件头口径相同；偏离表 `:164` 有 T5 例外；`tasks.ts:132` 由 `fcc955a53` 改正。

## 简报另核的三项

- **编号三处一致**：
  - C01–C78：SPEC 引用的 C01、C07–C14、C37、C55、C63、C65、C68 与 verification 的表与 `table.json` 相符；`models/README.md` 引用的 C63、C65、C68 相符；计数 79 条、78 条变红、C37 存活，前后一致。
  - N1–N8 与 P9–P14、TLC 负控的对应，在 verification `:216-233` 与 models 配置表之间相符。
  - WF1–WF5 在 SPEC `:251-255`、models `:68`、verification `:95` 之间相符。
  - TLC 29 份配置：`owner-docs2` 重跑的正控不同状态数、生成状态数与深度，与 models README 两张表逐项相同（`summary.json` 已核），负控的差异由 `:107`、`:109` 解释。
  - 读数的 head：缺口只有 N9 一处；TLC 重跑绑定的是模型 SHA-256，没有写提交号。
- **契约新节与前言、依据表、根入口**：互相自洽（`:14` ↔ `:55` ↔ `:87` ↔ `:101`）。缺口见 N10（第 26、27 条的引用形式）与 N11（第 28、30 条的性质）。

---

## 未覆盖

- **没有 git**：
  - 哪些句子是本轮改的，是推定的。N5、N10 中契约第 26、27 条可能是本轮之前就有的句子，我仍列出，因为 docs2 的义务覆盖全部变异声明，而且这两条是本轮移进新节的。
  - 无法核对成员依据表钉的契约 `f34077cec` 是否已含现行的 O1、O3、R2、S8 句子。
- **没读**：`teardown.ts`、`discovery.ts`、`in-flight.ts`、`task-table.ts`、`tests/model/*`、`src/README.md`、`src/index.md`、`tests/README.md`、契约 `docs/public-api.md`，以及契约的「组合与验证」「未封闭项」。
- **转交 A（正确性）**：
  - 续调用在第 7 步答复之后、代际再核之前，同一轮里遇到 `closeAll`，答 `unknown` 而不是 `connection-unavailable`，与 MC-16 第 3 步「首次调用与续调用相同」不符（只读代码推得，未验证）。
  - 任务操作在 `ensure` 答复之后、发请求之前没有再判关停，对照契约 S8「下一步之前判关停」。
  - `teardown(entry)` 是否汇合条目的 `tearing`（N4）。
  - `refresh` 在关口之后是否再判关停。
- **转交 E（交付边界）**：N5 对照 docs2 的「性质及证据义务」；第 30 条算不算「可加」；C 表的 head 与 PR head 的关系。
- 我没有运行任何检查、变异、探索器或 TLC。

## 未决政策与缺口的拥有者

- N3–N10 的成员侧修补：卡拥有者（reduce）或下一个表达闭包。
- N1、N2、N11 与 N10 的契约部分：契约拥有者。契约 SPEC 的这几句在调用口闭包的写范围内。
- 范围外 1：契约拥有者与卡拥有者。范围外 2：计划 6b。
- WF5 的引用：契约 T 段拥有者（`w3-mcp-host`）合入之后核对。
- 证据缺口（N5、N9 与 head 绑定）：E、D 面的评审者与卡拥有者。

评审完成不代表规格已接受，也不代表实现已验证。

### 卡拥有者对 B 的处置

无阻断。全部「改」。

- **N1 与范围外 1（任务操作在建连途中遇到关停答哪一个）：选乙，与 C 阻断的甲一并定。** 任务操作的出口一处判定：没有发出且 `table.isShut()` → `effect-unknown`（`no-connection`），不论关停落在等关口、建连还是发请求之前。第 1 轮 N7「建连途中关停答 `connection-unavailable`」由本裁定取代：同一次 `closeAll` 对同一个操作只有一种答复。`failureOfEnsure` 与 `tasks.spec.ts:429` 随之改。
- **N2：改。** 契约 S8 与第 30 条写明「发出之前（等关口、读存储、建连的等待）」；已发出的请求的结局不改（与 C 阻断的甲一致）。
- **N3：改。** 表格里代码跨度中的 `|` 转义为 `\|`。
- **N4：先查事实再改。** 写者查清 `closeAll` 的 `closeEntry` 是否汇合调用或任务操作经 `loseInScope` 发起的拆除：只有清单标记晚于 `closeAll` 时，「所有权」一句改为「标记」并写明拆除经条目唯一的拆除汇合；拆除也可能晚于时，改 MC-10。交回写明查到的代码位置。
- **N5：改。** 补两行 C 记录（变异在最终 head 上运行），做不到的标「未验证」。
- **N6：改。** 修法甲落地后，决定点的证据按新结构重写（`under` 的等待前核对、第 8 步、`perform`），每个点写守住它的用例与变异。
- **N7：改。** `docs/architecture.md` 模块表补 `internal/classification.ts`；`TaskTable` 的「有歧义」按 C 非阻断 4 的新接口写；SPEC `:222` 改为 `connectionFailureOfBuild`；README 维护段的 S8 承载模块改为 `calls.ts`、`tasks.ts`、`discovery.ts` 与 `internal/table.ts`。
- **N8：改。** 删「没有人读它」「没有人读」，或改成「它的值没有人使用」。
- **N9：改。** 生命周期探索器读数写出 head；最终 head 上重跑并记录，做不到就写「head 未记录，状态数未在 <head> 上重测」。另在 `verification/README.md:252` 交代读数 head 与 PR head 的关系。
- **N10：改。** 读法段补「调用口第 N 轮裁定 <面> <号>」；「本闭包」换成闭包名；契约第 26、27 条改用「「reduce 已定的事」第 7、4 条」；`invoke.spec.ts:809` 标题改 step 10。
- **N11：改。** 契约新节为第 28、30 条各写一句性质（第 30 条是行为改动：`closeAll` 之后对未采用的接入点 `refresh` 由 `not-available-to-you` 变为 `connection-unavailable`）。是否「可加」的卡文冲突波末写回。
- 范围外 2（R1 与 S2、R7 的 `no-connection`）：维持，归 6b。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

## w3-mcp-call 第 3 轮 A 面：正确性与结构读数（implementation-reviewer）

**结论：有 2 条阻断。** 两条都是新的 S8 句子「在途的操作在下一步之前判关停，答同样的结果」被违背，各有探针反例。第 2 轮的阻断和 A、C 标「改」的非阻断都已消失。结构读数没有新红项。

**评审对象**
- 仓库与检出：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，head `fcc955a53`，基线 `b2ba7dc89`。
- 本轮范围：`git diff 5204d3799..HEAD`。
- 级别：简报要求读 L3 热点，我按 L3 的问法做。
- 完成程度：简报第 1–4 项都做了。检查表第 1–20 问中，第 1–3 问只看了范围内的文件，逐条对照归 E 面；第 20 问没有重跑形式证据。
- 工作树：开始与结束时 `git status --short` 都为空，HEAD 不变。
- 探针与日志放在 `/tmp/ir-call-r3/`。度量产物由脚本写到主检出的 `tmp/metrics/fcc955a53/`，该目录被忽略。

### 工具一览

| 入口 | 命令 | 结果 | 输出在哪 |
|---|---|---|---|
| 变更清单 | `git diff --stat 5204d3799..HEAD`；`git log --oneline` | 36 个文件、9 个提交，全部在 `packages/mcp/mcp` 与 `packages/mcp/mcp-contract`。与写入范围的逐条对照归 E | 本会话 |
| 验收与测试改动 | 在 diff 里筛被删的 `it`/`expect`/`describe`，以及 `.skip/.only/.todo` | 没有新增 skip、only 或 todo。被删的都可解释，见表下 | 本会话 |
| 依赖规则 | `pnpm run lint:deps` | exit 0：「没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（81 个成员、340 条成员边；1 个组环按具名例外放行）」 | `/tmp/ir-call-r3/lintdeps.log` |
| 结构度量 | `pnpm run metrics --coverage --base b2ba7dc89` | exit 0，04:15 UTC 结束。mcp 覆盖率运行用时 1148 秒、退出码 0，`Tests 438 passed (438)`；第 2 轮的 600 秒超时这次没有出现 | `/tmp/ir-call-r3/metrics.log`；`/data/qiwei/repos/omne-harness-lite/tmp/metrics/fcc955a53/` |
| 受影响测试 | 即上面那次覆盖率运行 | 438/438 通过 | 同上 |
| 全套检查（L2） | 未跑 | 读了卡评论 6675951054 与 6676418696 的门禁表，没有复算哈希：**未验证** | — |
| L3 形式证据 | 未重跑 | 探索器与 TLC 只读卡上的记录：**未验证** | — |
| 第 2 轮探针在新 head 上复跑 | `npx vitest run --config /tmp/ir-call-r3/r2probes/vitest.config.mts --silent=false` | 6/6 运行完，读数见下文 | `/tmp/ir-call-r3/r2probes/run.log` |
| 本轮探针 | `npx vitest run --config /tmp/ir-call-r3/probe/vitest.config.mts --silent=false` | R3-a～g，读数见下文。R3-e 和 R3-g 第一版是探针自己写错了才超时，已改正后重跑 | `/tmp/ir-call-r3/probe/run*.log` |

被删的用例与断言分三类：
- `markSent` 的 `TypeError` 前提用例，以及「T9 没有记录也算发出」用例。两者随第 2 轮裁定 C 2 的 API 一起删除，由 `in-flight.spec`「concludes once …」等句柄用例接替。
- 步号或标签改名：「step 7: after closeAll」改为「step 3」；分类用例加上「step 12/13」。
- `table.lose` 改为 `loseOn`，用例跟着改。

### 结构读数（`5204d3799..HEAD` 改动的 40 个函数，取自 `metrics.json`）

- 全部是 `ok`。
- 最高的几个：

| 函数 | CC | CRAP |
|---|---|---|
| `calls.ts:223 prepare` | 10 | 10 |
| `in-flight.ts:94 cancel` | 7 | 7.23 |
| `sendOrder` | 7 | 7 |
| `tasks.ts:90 built` | 7 | 7 |
| `tasks.ts:162 request` | 7 | 7 |
| `refresh` | 6 | 6 |
| `perform` | 5 | 5 |
| `conclude` | 5 | 5 |
| `failureOfEnsure` | 5 | 5 |

- 其余：`under` 4、`applyAnswer` 4、`TaskTable.record` 4、`lostOfOutcome` 3、`table.lose` 3、`markLost` 1。
- `prepare` 从 9 升到 10，正好在 warn 线上，没有超过。
- 摘要里「变更函数超 alert 1、超 warn 1」是 `discovery.ts:130 publish`（CC 17）与 `table.ts:318 begin`（CC 12）。这是相对基线 `b2ba7dc89` 的读数，两个函数本轮都没改，卡评论 6675951054 已交代。
- `failureOfEnsure` 的覆盖从 67% 升到 100%。
- `lost.ts` 三个函数的覆盖在 50% 到 67% 之间，原因是 coverage-final 对同一分支重复记录了两条。真实的那条两侧都命中：第 43、58、81 行分别是 `[31019, 62250]`、`[221, 1]`、`[95, 100296]`。所以这不是缺口。

### 第 2 轮各项的复核

- **A 阻断 1（任务号跨账户碰撞）：已消失。**
  - 第 2 轮探针 `account.spec.ts` 在新 head 上复跑：`ACC issuedAt A= 1 B= 1 opens= 2`，`ACC queryTask(refA)= {"failure":{"kind":"unknown"}} tasks/get sent= 0`。
  - 代码：`task-table.ts:41-48` 碰撞转为 `'ambiguous'`，`tasks.ts:169` 对它答 `unknown`。
  - 用例：`tasks.spec.ts`「a task id the peer gave again on another peer account makes the key ambiguous …」，以及「… same account is the newer record …」。
- **A 非阻断 1（第 8 步）：已消失。**
  - `calls.ts:326-327` 在 `transport.call` 之前，在同一段同步执行里核停止信号与关停。
  - 第 2 轮 `step8.spec.ts` 复跑：`STEP8 rows with call entered on a fired stop: 0`。
  - 本轮 R3-f 逐微任务扫描 `closeAll` 的落点，`invoke` 一侧 0 行，k=36 时已在关停前发出。
- **A 非阻断 2（MC-17 `settings` 阶段两支）：已消失。** `tasks.spec.ts` 新增 `it.each`「read again before the build, cannot be read again: unknown / is withdrawn …」，`failureOfEnsure` 覆盖 100%。
- **A 非阻断 3（S8 对 `invoke` 不问端口）：已消失。** `invoke.spec.ts`「step 3: after closeAll nothing is asked …」断言了 `gateCalls` 与存储读次数不变；另有「step 3: closeAll while the call waits on the gate …」。
- **A 非阻断 4（`publish`、`begin`）：已交代。** 卡评论 6675951054 写了「在基线上读数相同，不是本轮新增」。这只说明了现状，没有写处置。
- **A 范围外 1（S8 管在途操作）：在等关口这个落点上已落地，其他落点仍有反例，见阻断 1、2。** 第 2 轮 `s8.spec.ts` 复跑：S8-a（续调用）答 `connection-unavailable`，之后存储读 0 次；S8-b（首次调用）相同；S8-c（任务操作）答 `effect-unknown(no-connection)`，`tasks/get=0`。
- **C 2（占位句柄）：已消失。** `in-flight.ts` 的 `Reservation` 与 `Cell`：阶段只存在表里，`markSent` 及其守卫已删，`perform` 不再有可变的 `phase`。
- **C 3（`cancelled` 两处决定）：已消失。** `under` 只交出 `STOPPED` 或关停失败，`perform`（`calls.ts:360`）一处判定。
- **C 4（一条规则一处）：已消失。**
  - `connectionFailureOfBuild`（`lost.ts:78`）由调用口与任务操作共用。
  - `classificationOf` 只在一处构造。
  - `ensureOptionsOf` 由三处共用。
  - `src` 里 `{ kind: 'connection-unavailable' }` 只剩 `entry.ts:66` 一个常量（grep 结果）。
- **C 6（同步前缀）：已消失。** `table.lose` 与 `markLost` 都是同步函数，返回 `Losing | 'not-current'`。`markLost`（`build.ts:165-169`）先同步执行 `entry.connection.lose`，再把拆除放进 `done`。第 2 轮 `scope.spec.ts` 复跑，答复时状态已是 `lost`。
- **C 8（类型环）：已消失。** `invoker.ts` 合成 `CallsDependencies & TasksDependencies`，`calls.ts` 与 `tasks.ts` 不再导入 `invoker.ts`；`lint:deps` exit 0。
- **C 10（可读性）：已消失。** 改名为 `applyAnswer`、`loseUnlessStopReply`；哨兵改为 `CALL_BREACHED`；`Sent.access` 已删；`asIs` 去掉了 `_on`。
- **C 11：已按裁定落地。** `tasks.ts:99` 在关口之后再判关停；`tasks.spec`「closeAll while the operation waits on the gate …」。

### 简报第 2 项：「在决定点核」是否在每个落点都成立

调用口里，三次 `under` 等待之前与第 8 步的核对成立：
- R3-b：首次调用在读存储时遇到 `closeAll`，答 `connection-unavailable`，之后没有任何传输调用。
- R3-f：`invoke` 一侧扫描到的违例是 0 行。

在下面四个落点不成立：阻断 1、阻断 2、非阻断 1，以及范围外 1、2。

---

## 阻断

**1. 续调用在读存储（第 5 步）时遇到 `closeAll`，答「未发出：`unknown`」，不是 `connection-unavailable`**
- 检查表：第 10 问、第 5 问。
- 位置：`calls.ts:240-241`。第 6 步的 `table.current(...)` 与 `issuedOn` 在 `under` 之外同步执行，前面没有关停判断。
- 为什么会这样：`closeAll` 在让出事件循环之前，同步执行 `shut = true`（`table.ts:473`），并经 `closeEntry` 同步执行 `connection.close()`（`table.ts:211`）。此后 `current` 答 `undefined`，`issuedOn(continue, undefined)` 为假，答 `fail(UNKNOWN)`。
- 反例（R3-a）：先让第一次调用答 `inputRequired`；再让续调用的存储读取停住；这时 `await closeAll()`；最后放开读取。输出：`R3-a continueWithInput = {"kind":"not-sent","reason":{"kind":"unknown"}}`。对照 R3-b，首次调用在同一落点答 `connection-unavailable`。
- 违背的条款：
  - 契约 S8 新句与决定第 30 条「在途的操作在下一步之前判关停，答同样的结果」。
  - 成员 SPEC MC-16 第 3 步「`closeAll` 落在调用等关口、读存储或等建连的途中时，调用在下一步之前答同一个答复……首次调用与续调用相同」。
  - 第 2 轮裁定「首次调用与续调用同答」。
- 后果：答复仍是「未发出」，不谎报效果，也不问端口。但它与 SPEC 写明的落点直接矛盾，第二个调用方无法按原因区分「关停」与「代际不对」。
- 缺的用例：`continue.spec` 只覆盖了等关口的落点（「closeAll while the continuation waits on the gate」），没有覆盖读存储的落点；`invoke.spec` 的 step 3 微任务扫描也只扫首次调用。
- 实施者需要做的：在第 6 步之前读一次关停，判法同第 8 步；补一条「续调用读存储时 closeAll」的用例，或把扫描扩到续调用。

**2. 任务操作走复用连接时，`closeAll` 落在取到连接与发请求之间，传输照样被调用，答复也与关停之后不同**
- 检查表：第 10 问、第 5 问。
- 位置：`tasks.ts:171-176`。`await connectionOf(...)` 之后，`ask(() => send(on))` 之前没有关停判断。MC-17 第 4 步里没有对应调用口第 8 步的那一步。复用路径上的 `connectionOf`（`tasks.ts:121-126`）只在入口判一次。新建路径在 `table.ensure` 答复之后也有同样的空隙，这一条我只读了代码，没有执行验证。
- 反例（R3-c）：`const q = queryTask(alice, task); const closing = closeAll();`，两句在同一段同步执行里。输出：
  - `R3-c queryTask in flight = {"failure":{"kind":"connection-unavailable"}} … log= …,getTask shut=true`
  - 紧接着的同一操作：`{"failure":{"kind":"effect-unknown","cause":"no-connection"}}`
  - R3-f 扫描：`queryTask k=0 … portAfterShut=["getTask shut=true"]`，k=1 时已在关停前发出。
- 违背的条款：
  - 契约 S8「`closeAll` 之后……四个任务操作答 `effect-unknown`（`no-connection`）」，以及新句「不问端口」「在途的操作在下一步之前判关停，答同样的结果」。
  - 成员 SPEC「所有权」一段第 173 行。
  - 这正是第 2 轮 C 11 被裁「改」的那种不一致，只是落点从等关口后移到了复用路径。
- 后果：
  - 关停开始之后，传输的 `getTask` 仍被调用。替身的传输已在关闭，所以对端收到 0 条 `tasks/get`；真实传输关闭得慢时，请求可能离开本机。
  - 同一时刻的两次同一操作答复不同。
- 实施者需要做的：在 `request` 里与 `send` 同一段同步执行中读关停；按 `invoke.spec` 的 step 3 扫描法补任务操作的逐微任务用例。

## 非阻断

**1. 关口的两个端口之间遇到 `closeAll`，资格端口仍被问一次**
- 检查表：第 10 问。
- 位置：`gate.ts:139-147`。`admit` 先问 `adopted`，再问 `judge`，中间没有关停判断。对调用口来说这整段是一次 `under` 的工作。
- 反例（R3-g）：让采用读取停住，`await closeAll()` 之后放开。输出：
  - `R3-g invoke = {"kind":"not-sent","reason":{"kind":"connection-unavailable"}} eligibility checks after closeAll = 1`
  - `R3-g refresh = {"failure":{"kind":"connection-unavailable"}} eligibility checks after closeAll = 1`
- 后果：答复正确。但它是契约 S8「不问端口」与写者自裁第 2 条「关停之后不问端口」的反例。
- 成员 SPEC 第 3 步写的是「不读存储、不建连、不发出」，没有承诺「不问资格」，与契约 S8 的宽口径不一致。
- 实施者需要做的：二选一。在 `admit` 的两问之间读关停；或者由卡拥有者确认「下一步」的粒度是整个关口，并让契约与成员 SPEC 用同一种说法。

## 范围外待裁决

1. **刷新在发布途中遇到 `closeAll`**
   - 反例 R3-d：读存储时 `closeAll`。输出 `R3-d refresh = {"ok":{"kind":"kept","reason":{"kind":"superseded"}}} … log= …,listActions shut=true`。传输的 `listActions` 在关停之后被调用，答 `kept`（`superseded`），不是 `connection-unavailable`。
   - 位置：`discovery.ts:130 publish`。本轮只改了 `refresh` 入口；`publish` CC 17，本轮没动。
   - 契约第 30 条的「在途的操作」字面上覆盖 `refresh`，但成员 SPEC 第 173 行只引了 MC-16、MC-17，MC-7 没写在途的情形，裁定也没要求。
   - 需要卡拥有者裁定：S8 新句是否覆盖 `refresh` 的取页与发布阶段。

2. **已发出的调用在 `closeAll` 之后、调用方中止时，仍向传输发 `cancelRequest`**
   - 反例 R3-e：输出 `R3-e invoke = {"kind":"sent","outcome":{"kind":"unknown","cause":"abandoned"}} log= call returned,cancelRequest shut=true peer cancels= 1`，对端收到了 `notifications/cancelled`。
   - 而同一时刻的 `ActionInvoker.cancel` 走 `sent` 分支，`isCurrent` 为假，答 `unknown`，不通知对端。两条路径对「关停后告不告诉对端」的做法相反。
   - 位置：`calls.ts:300-302`。
   - 需要卡拥有者裁定：S8「不问端口」是否覆盖告知对端取消。

## 未覆盖

- 全套门禁、`test:slow`、探索器与 TLC 都没有重跑，只读了卡上的记录。
- 差分变异归 D 面；表达与编号一致性归 B 面；写入范围与验收逐条对照归 E 面。
- 新建路径在 `ensure` 答复后到发请求之间的空隙，只读了代码，没有探针。
- 转交 C（设计）：`Losing` 只排除了 `async` 函数。同步函数仍可以返回 `{ done: (async () => { await …; lose() })() }`，所以「标记在返回前完成」并不完全由类型保证。

## 观察（不是发现）

- 关停之后，一个已发出的调用如果靠 `cancel` 收场，`cancel` 答 `unknown` 且不触发停止信号。之后是否结束，取决于传输关闭时是否结算在途的应答（T 段）。我没有用探针确认。
- 度量运行的覆盖日志里有 `src/README.md` 与 `src/index.md` 的解析报错，这两个文件被排除出覆盖；不影响读数。

### 卡拥有者对 A 的处置

- **阻断 1、2：与 C 的阻断同一件事**，按 C 处置的甲改（`call-fix3` 第 1、2、4 条）。A 的探针 R3-a、R3-c 与 C 的探针互为印证，转成用例。
- **非阻断 1（关口的两个端口之间遇到 `closeAll`，资格端口仍被问一次）：定粒度，不改代码。** S8 的「下一步」以成员 SPEC 编号的一步为单位：MC-16、MC-17 的关口一步（采用与资格）、读存储、建连、发出，MC-7 的关口、建连、取页。关停之后开始的操作一个端口都不问；在途的操作不再开始下一步，已开始的一步内部的本地端口调用照常走完。资格端口是本地治理判断，没有对端效果。契约 S8 与成员 SPEC 用同一句写明这个粒度。
- **范围外 1（刷新在发布途中遇到 `closeAll`，仍向传输取页，答 `kept`（`superseded`））：S8 覆盖 `refresh`，按甲同形处理。** `refresh` 是要连接的操作，取页是向对端发请求，正是 S8 要禁止的。取页的每一页之前核关停（与调用口第 8 步同形，在发请求的同一段同步执行里）；`refresh` 的出口一处判定：没有发布且 `table.isShut()` → `connection-unavailable`；已发布的结果不改。MC-7 补这一步；R3-d 转成用例。
- **范围外 2（已发出的调用在关停之后被中止，仍向对端发取消）：不发。** `answerOf` 的停止分支在 `table.isShut()` 时不派 `cancelRequest`，与 `ActionInvoker.cancel` 对已失效连接的做法一致；传输关闭时自己结算在途的应答（契约 T5）。MC-16 第 11 步补一句；R3-e 转成用例。
- 结构读数：无新红项。`publish`（CC 17）与 `begin`（CC 12）在基线上相同、本轮未改，处置维持「本轮不改」，写进最终证据。
- 转交 C 的 `Losing` 一项：已在 C 非阻断 1 处置。

### 本轮差分变异（D 面）的处置

D 面排队等名额 1292 秒（A 面的度量占着），04:15 起正式运行；修复轮随即开始，按 review-code「修复轮一开始就停掉旧 head 上还在跑的差分变异」，派发者停掉它并清掉残留的 Stryker 进程（`date -u` 读 04:18 时已停），工作树干净，没有读数。修复轮之后在最终 head 上只跑一次，范围 `--base b2ba7dc89 --since 5204d3799`，一次覆盖 fix2 与 fix3 的全部改动行。
