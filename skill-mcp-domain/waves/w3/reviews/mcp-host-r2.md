# w3-mcp-host 第 2 轮评审（PR #1138，head `db06b5b70`，第 1 轮 head `8f9016fd8`）

简报：`mcp-host-r2-briefs.md`。

## E. 交付边界（general-purpose，sonnet，medium）

E 面（交付边界）第 2 轮结论：验收清单 1–9 里 8 条达到，第 7 条未达到。「用例 → 缺陷 → 变红」表和异步副作用两项都有缺口。以下按 `review-delivery` 判，只认卡 #1119 评论 6666088522（本轮）与 6657905811（第一段），对照 head `db06b5b70`。我只读，没改文件。

我核对了：工作树 head 是 `db06b5b70`；`git ls-files --eol | grep -c w/crlf` 我自跑为 0；`gates-r2/` 的日志哈希和评论里写的一致，`turbo-3.log` 是 `514a30175c32c83f`，`test-slow.log` 是 `41b57e3682518d7f`。卡上读数和日志一致。

## 一、验收清单（闭包规格 `w3-mcp-host.md` 第 1–9 条）

| # | 判定 | 依据 |
|---|---|---|
| 1 构建、类型检查、测试 | 达到 | 评论 6666088522 §2.1：「`Tasks: 19 successful, 19 total`，exit 0；mcp 254、契约 653、host-local 369」；慢层「`Tests 235 passed \| 8 skipped (243)`，exit 0」。 |
| 2 MC3-9 | 达到 | §2.2：「stdio first: passed 97, not-applicable 1, failed 0」「streamable-http first: passed 96, not-applicable 2, failed 0」，不适用集合钉死在 `NOT_APPLICABLE`（`conformance.spec.ts:55`）并给了理由。SSE 回退单列：「5 条（A 层 4 条、server-everything sse 1 条）」，另有 `session.spec.ts` 7 条。第 1 轮 E 指出的缺口已补。 |
| 3 MC3-10 | 达到 | §2.3 与 §3 的 m10-01 到 m10-13：F4 丢弃与 16 MiB 上界、进程退出、旧对端回退、取消 `_meta`、探测时限。 |
| 4 MC3-11 | 达到 | §2.4：「`reportRejection` 恰好一次」由 `m11-01a/b` 变红，「其余 403 不调用」由 `m11-02a` 变红。授权发现两段 URL、再发规则、`x-mcp-header`、会话号和 404、旧 HTTP+SSE 回退都列了变异号。第 1 轮 E 指出的缺口已补。 |
| 5 复用表 | 达到 | 成员 SPEC「与 SDK 的复用关系」（`SPEC.md:121` 起）逐行有决定、理由类别、违反的硬承诺或条款、SDK `文件:行`、接入或替代。卡 §2.5 有指针。理由类别的措辞按卡拥有者裁定 3。 |
| 6 凭据不外泄 | 达到 | §2.6：`http.spec.ts` 用例「the credential value appears in no answer…」由变异 `m11-04-leak` 变红。 |
| 7 契约 | **未达到** | 见下。 |
| 8 收尾门禁 | 达到 | §2.8 每条有命令、尾行和哈希。`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`typecheck`、`check:design` 都是 exit 0，CRLF 为 `0`。第 1 轮 E 指出的缺 crlf 读数已补。`lint:oxlint` 只写「没有输出，exit 0」，没有哈希，可接受。 |
| 9 源码边界 | 达到 | §2.9 给了 `gates-r2/greps.log` 和哈希；我读到 `as`、`any`、`@modelcontextprotocol` 的计数都是 0，`dist/*.d.ts` 里 `modelcontextprotocol` 也是 0。第 1 轮「只有陈述」的缺口已补。 |

### 第 7 条未达到：缺什么

按卡拥有者裁定 1 改后的措辞，第 7 条是「契约原有用例原样通过，Q1 关闭 F4 改写的一条除外」。实际改动不止一条：

- `packages/mcp/mcp-contract/tests/wire.spec.ts`（`git diff 92a8e3cdf..HEAD` 是 +77/-19）里，原有的 `classifyWireEvent` 断言有十几处被改成经新增的 `classify` 辅助函数。该函数把 `message` 字段剥掉再比较。
- 原因是 fix1 让 `WireClassification` 的 `answer` 带上已解析的消息，这对应卡拥有者裁定 B-N3。
- 这些改动没有写进卡，也不在闭包规格的追加记录里。
- 评论 §2.7 和 PR 正文 #1138 仍写「其余原有用例原样通过」，与 diff 不符。
- 契约的其余测试文件只有新增：`public-entry.spec.ts` 为 +43/0，`transport-conformance.spec.ts` 为 +32/0。

要补成达到，二选一：卡拥有者把这类「断言经辅助函数、断言内容不变」的改动补进裁定的例外，并把 PR 正文和 §2.7 改准；或者提供逐条证明，说明这些断言去掉辅助函数后语义不变。

## 二、性质及证据义务

| 项 | 判定 | 说明 |
|---|---|---|
| 「用例 → 缺陷 → 变红」表 | **未达到（较第 1 轮大幅改善）** | 卡 §3 给了做法（改源码、重建 `dist`、只跑一条、还原、重建），也有 m10、m11 的变异号与缺陷说明，并写明「清单 `final-mutants.tsv` `62fe49b3555c459e`；日志 289 份」。但它是变异号到缺陷的分类，不是「用例名 → 缺陷 → 变红输出」。没有一列写具体用例名，没有变红输出的摘录。逐条对应只在 tmp 的 TSV 和日志里，按 `review-delivery` 的规则不算证据。(a) `m10-09`写作「探测时限回退」，没有明说「探测时限后的迟到应答」是否各有变异，而第 1 轮 E 点了这一条。(b) `m10-05h` 要四层同时去掉才变红，卡拥有者判为防御纵深，这是裁定，不算缺证据。(c) H7（不发 DELETE）没有用例，卡 §8 已写明。 |
| 不重发 | 达到 | `m11-06a/b`（读类再发一次，写类不再发）。 |
| 进程归落点 | 达到 | 复用表「`StdioClientTransport` 不复用」一行，加 H3、H6 与 H10。 |
| 异步副作用有上界或拥有者、测试结束无遗留 | **部分未达到** | §5 写了每个等待点受 `signal` 与 `close()` 管辖，并说明了 `drain`，还写了慢层 `afterEach` 断言 `leftover()` 与 `leftoverServers()`。我在 `conformance.spec.ts:67-69` 读到了这个断言。缺口：慢层日志是「235 passed \| 8 skipped」，8 个 skipped 在卡上没有解释。我在 `mcp-host-local/tests` 和 `vitest*.ts` 里 grep 不到 `skip`、`runIf`、`todo`，来源不明。 |

### 其他缺口（对照第 1 轮 E）

- 提交号：已补（§1 列了 `8f9016fd8..db06b5b70` 共 33 个提交，第二段也列了）。
- 自裁 3–11：已补（§6）。
- 结构性改动清单：已补（§7）。
- 文件数更正：已补，卡上写 65 个文件中 62 个在写范围。我核到 `92a8e3cdf..HEAD` 共 99 个文件，范围外只有 `pnpm-lock.yaml`、`pnpm-workspace.yaml`（reduce 的依赖提交），外加已事后接受的契约 `docs/public-api.md`。fix 轮没有新增范围外文件，`packages/mcp/mcp` 没有改动。
- `mcp-host-local/src/README.md:19`：已改成 `@modelcontextprotocol/client` 在 `devDependencies`。

## 三、冲突项（调度者裁定、追加记录与派发时卡文、规格的冲突）

下列 1–6 项（含 3a）都已在闭包规格追加记录里登记，唯独卡正文尚未同步。6 项里有 2 项（1 和 2）卡拥有者标了「波末写回卡正文」。

1. **契约变更「additive」、验收 7「原样通过」、停止条件「破坏性契约改动」**，与裁定 1 / Q1（F4 改写 `wire.spec.ts` 一条原有用例）冲突。卡正文「契约变更：additive」没限定，PR 正文已改。
2. **卡正文 W3 行「只用官方 SDK 2.3.1 的 Transport 层」与 I-04「官方 TypeScript SDK 2.3.1」**，与 Q2、自裁 1、Q6 冲突。现行是 2.4.0，HTTP 线路自写，client 在 `devDependencies`。裁定 2 说「波末同步」，RFC-0001 的版本归 K7 小卡。
3. **闭包已定事项 1 末句「自写部分的线上解析用契约的 `classifyWireEvent`、SDK 导出的常量与 schema」**，与裁定 3 / 自裁 1 冲突。SDK 的 schema 比 T2 严，产品源码不导入 SDK。
3a. **闭包已定事项 1「指不出的就复用」**，与裁定 3 对 `serializeMessage` 的处理也冲突：它是「规则归契约」类，而不是三条硬承诺之一。
4. **目标边界「用真实 SDK 服务端夹具跑 `mcpTransportConformance()`」及卡 C4「两种真实传输在本地真实服务端上端到端一致」**，与 Q3 / Q11 / 裁定 4 冲突。套件跑在 A 层自写对端，SDK 真实服务端的互通由 B 层证明。
5. **已定事项 36「stdout 出现一行非 JSON 视为流损坏」与 MC3-10 第一项「非 JSON 行 → `stream-broken`」**，与 Q1 / F4 冲突，改为丢弃，只有超 16 MiB 行缓冲上界才断流。波段规格 `waves/w3/mcp/spec.md` 的 MC3-10 一行还没同步（波末写回）。
6. **闭包规格写范围**（`mcp-contract/src`、`tests`、`SPEC.md`）与裁定 8：契约 `docs/public-api.md` 在范围外，已事后接受。
7. **第 1 轮裁定与本轮简报 D 的 `--since 8f9016fd8` 冲突。** 第 1 轮卡拥有者对 D 的处置写的是「不给 `--since`：第 1 轮测量无效，没有可以收窄的有效基准」。第 2 轮简报 D 写的是 `--base 92a8e3cdf --since 8f9016fd8`。这不是卡文冲突，是裁定之间不一致，请你定用哪个。
8. **裁定 6（T9 新义务没有契约套件的用例）与闭包规格追加记录「加一条用例」**，不冲突（用例在 `public-entry.spec.ts`），但两处口径要保持一致：契约套件不补，host 自有用例。
9. **fix1 追加 1（会话经注入的计时端口 `schedule`，不直接用全局计时器）、w3-mcp-host-strength 对 `tests/unhandled.ts` 的采纳。** 我在 `w3-mcp-host-formal`、`w3-mcp-host-docs` 的追加记录里没找到与派发时卡文冲突的内容。`unhandled.ts` 改成 `vitest.config.ts` setup 文件，是交第 2 轮设计评审判断的事，不是卡文冲突。
10. **卡正文「未覆盖」**与成员 SPEC 已知限制对 H12 的写法。证据评论 6657905811 的「未覆盖」写「H12 没有能变红的用例」，而 6666088522 §3 写「H12 后半成立、H13、H14 现在有用例」。后一条晚于前一条，是更新，不算冲突，但 6657905811 没有标注已被取代。

## 四、汇总

- 未达到：验收 7（见上）；「用例 → 缺陷 → 变红」表缺用例名列和变红输出摘录；异步副作用一项里的 8 个 skipped 没解释。
- 父会话要保留的项：以上三条，外加冲突项里 1、2、5 的波末写回，以及冲突项 7 的口径。
- 子代理写的达到不是接受。

### 调度者对 E 的核对（收齐各面后一并裁定）

- 验收 7：`git diff 92a8e3cdf..HEAD -- packages/mcp/mcp-contract/tests/wire.spec.ts` 读过。原有断言改为经 `classify` 比较，`classify` 只剥去 B-N3 让 `answer` 新带的 `message` 字段，比较的类别不变；`carries the message` 一条另钉消息。只有 F4 一条改了断言（Q1 的例外）。缺口是口径：证据 §2.7 与 PR 正文写「原样通过」不准。
- 慢层 8 个 skipped：`tests/model/session-model.spec.ts` 有 11 条用例，3 条带 `{ tags: ['slow'] }`，其余 8 条属于快层；慢层按 `tagsFilter: ['slow']`（`vitest.tiers.mts:305`）只跑带标签的，另 8 条记为 skipped，快层运行它们。不是遗漏，是证据缺说明。
- 冲突 7（差分变异范围）：以第 1 轮裁定为准，不给 `--since`；简报 D 已改。

### 调用口第 2 轮带过来的一项（归本分支的修复轮）

- 契约 T5 补一句：`call` 进行中、请求还没离开时 `signal` 触发，`call` 尽快结束（以 `not-sent` 答已触发的信号，或请求已经发出时按已发出处理）。调用口的端口前提 WF5 依据这一句（调用口第 2 轮 B R2-7，卡拥有者裁定见 `mcp-call-r2.md`）。T 段的拥有者是本分支。

## C. 设计与实践（general-purpose，opus，high）

本轮范围是 `8f9016fd8..db06b5b70`。我在工作树之外跑了两个探针，用的是 `src`（`node --conditions=source`），不是 `dist`。脚本在 `/tmp/c-r2-probe/writing.mts` 与 `/tmp/c-r2-probe/authz.mts`，从 `packages/mcp/mcp-host-local` 目录运行：`node --conditions=source /tmp/c-r2-probe/<名>.mts`。

## 结论：第 1 轮 C 的两条根因是否在结构上消除

- **根因 1：决策层没进契约根。已在结构上消除。**
  - `mcp-contract/src/decisions.ts` 是 T8 决策的唯一一份实现，包括 `concludeAnswer`、`concludeProbe`、`discoverWith`、`retryVersionOf` 与读法。会话和脚本化传输都消费它。
  - 会话里已经没有 `isModern`、`supportedOf`、`answerWireOf` 的第二份判断，`limits.ts` 不再复制 JSON 上限。
  - 剩下两处小残留，见非阻断第 1 条。
- **根因 2：等待点不受管辖。只对「已发出」相是结构性的，其余仍是约定。**
  - 已发出的请求由三样东西结构性管辖：`Pending.phase`、每个请求自己的 `AbortController`，以及线路端口都收 `signal`。
  - 请求离开之前的路径靠手写约定：「核 `usable` → `authorize` → 再核 `usable` → 设头 → 写出」在 `respond`、`sendNotification`、`send`、`enterSse` 里各写了一遍。
  - 两个探针打中的正是这条约定的缺口：stdio 写端的计数，以及授权等待。所以这是「大部分结构化，剩余靠补洞」。

## 阻断

**B1. 两次写重叠时 stdio `close()` 无界挂起：`StdioLine.writing` 用布尔值表示一个计数**（`stdio-line.ts`，`send` 与 `close`）

- **次序：**
  1. `send(a)` 置 `writing=true`，`send(b)` 再置 `writing=true`。
  2. `a` 的 `.then` 把 `writing` 置回 `false`，这时 `b` 还排在 WritableStream 里。
  3. `close()` 于是走 `await this.writer.close()` 分支，去等对端读走 `b`。
- **探针 `writing.mts`：** 第一块被接受、第二块永不完成。结果是 `a { kind: 'sent' }`，然后 `still waiting after 2s 2002 ms`。
- **违反的条款：**
  - `close()` 自己的文档注释：「A write that has not completed is aborted, not waited for」。
  - 成员 SPEC H6、契约 T5 的关闭次序、DP-04（以可观察终态为准）。
  - ub-mode「Get the data shape right」：两个写在途而标志为 false 这一非法状态可以表示出来。
- **影响：** 会话不串行化写。`dispatch`、对端 ping 的答复 `respond → write` 与 `sendNotification` 都直接调 `line.send`，所以重叠写是常态。第 1 轮的 A1/B4 只对单个在途写修好了。`stdio.spec.ts:213` 只发一个写，抓不到这种情形。探索器用的是 `ExplorerLine`，不覆盖 `StdioLine`。
- **改法：** 用在途写的计数或待决写的集合代替布尔值。`close()` 只在计数为 0 时 `writer.close()`，否则 `writer.abort()`。补一个「两个重叠写、先完成一个、再 `close()`」的用例。

**B2（待卡拥有者裁定，我倾向阻断）。授权等待不受 `signal` 与 `close()` 管辖：结算值调用方拿不到**（`Session.send`、`Session.once`、`Session.call`）

- **简报的判据：** C 面的根因判据与 A 面第 2 条都要求每个等待点受请求的 `signal` 与 `close()` 管辖，A 面把「授权」列在第一位。
- **SPEC 的豁免：** 修复轮写的 SPEC 第 230 行（「`authorize`、`reportRejection` 不收 `signal`，可以挂起，由句柄的持有者承接」）给自己开了豁免。探索器的 V4（`tests/model/properties.ts:157-160`）照此排除了 `authorizing` 相。
- **探针 `authz.mts`：** `authorize` 永不返回。
  - `call()` 之后立刻触发 `signal`：1 s 后 `call()` 仍 pending。
  - `listActions()` 之后 `close()`：`close()` 返回了，`listActions()` 1 s 后仍 pending。
- **原因：**
  - `close()` 与 `abandon()` 已经按 V6 把 `Pending.deferred` 结算为 `not-sent` 或 `abandoned`。
  - 但调用方的 promise 跟的是 `send()` 的流程。`send` 仍停在 `await this.authorize(headers)`，所以结算值调用方拿不到。
  - SPEC 第 176 行（「登记之后任何时刻触发，传输都不再等待」）与第 182 行（「授权中…答 `not-sent`」）对调用方并不成立。
  - `session.spec.ts:1148` 在 `close()` 之后先 `release()` 了闸门，所以看不到这一点。
- **改法（结构已经具备）：** 在途项和它的 `deferred` 在 `authorize` 之前就建好了。`send` 让 `authorize` 与 `entry.deferred.promise` 竞速，或者让 `once`/`call` 跟随 `deferred`，把授权加写出作为有主的后台流程。这样 V4 的豁免可以删掉。`respond`、`sendNotification`、`enterSse` 可以用同一个 helper，并带上 `closing.signal`。
- **违反的条款：** DP-04、DP-06，以及简报给出的根因判据。SPEC 在修复轮自定的豁免不能免除派发者的判据。是否降级由卡拥有者定。

## 非阻断

1. **决策层的残留。**
   - `Session.die` 自己构造 `{kind:'no-answer', cause, resend:false}`，是 S01/S03 结论的一份手抄，没有经过 `concludeAnswer`。
   - `Session.causeOfEnded` 伪造了一个 `WireContext`（`id:''`、`request:'tools/list'`），只为借 `classifyWireEvent` 取退出窗口这一条规则。契约应该直接导出这条规则（例如 `endedCauseOf(event)`）。
   - 违反 Laziness「一个决定只在一处」。
2. **T2/T3/T5 的组成规则在两个传输里仍各写一份**（`Session` 与 `ScriptedTransport`）：
   - `call` 的 params 与 values 组成；
   - `tools/call` 的 `_meta.progressToken`；
   - `request()` 的一次再发循环；
   - `listActions` 的 `streamable-http && !legacy`；
   - `cancelRequest` 按传输的分支；
   - `getTask`、`getTaskResult`、`updateTask`、`cancelTask` 的方法体。
   - 「旧修订」的定义已经分叉：会话用 `legacy` 标志，脚本化传输由 `!isModernProtocolVersion(version)` 推出。
   - 按已定事项 2 的字面，这些属于同一类。我不判阻断，理由有二：契约套件对两边跑同一批手写用例（契约 SPEC 第 696 行），目前没有观察到结局分歧；会话多出的 `sse` 分支是本成员独有的。建议抽成 `callParamsOf`、`checksListingHeaders(kind, legacy)`、`cancelsByNotification(kind, legacy)`。
3. **`WireClassification.message?` 是可选字段，加上四处「不该发生」的抛出**（`decisions.ts` 的 `messageOf`、`resultWireOf`、`partsOf`、`httpErrorWireOf`）。
   - 根源：`AnswerClass` 是模板字面量字符串，`wire.ts` 拼出来，`partsOf` 又用 `startsWith`/`indexOf` 拆回去。`concludeAnswer` 的 `default → partsOf` 让新类别在运行时抛错，而不是在编译期报错。
   - 违反 typescript-best-practices 的「Discriminated unions」「Exhaustiveness」「Simplest total type」。
   - 第 1 轮 N3 已裁定走可加形状，这一条作为 0.1.0 的形状项登记。
4. **`WireAnswer` 让只属于探测与 `initialize` 的 `legacy-peer`、`legacy-http` 出现在每个请求上。**
   - `callAnswerOf` 把 `not-sent`、`legacy-peer`、`legacy-http` 映射成 `no-answer(abandoned)`。
   - `discoverWith` 的 `case 'retry'` 不可达，却编出 `discover-shape`。
   - 不可达状态被映射成普通结局。违反「Make illegal states unrepresentable」，也与 DP-01 的「不兜底映射」相悖。
5. **会话的连接模式是四个独立字段**（`version`、`legacy`、`sse`、`session`）。
   - `sse` 在 `send` 的 context、`plainHeaders`、`setMcpHeaders`、`cancelRequest`、`enterSse` 里各读一次，`!this.sse` 守卫说明非法组合可以表示出来。
   - 建议改成 `mode: modern | legacy-http{session?} | legacy-sse` 联合（Model the Domain）。
   - `Dispatch` 是可选字段袋。`Deferred` 暴露可变的 `settled`/`value`。`call()` 靠同步窥视 `entry.deferred.value` 与 `entry.phase === 'discovery'` 来判定 not-sent，依赖 `apply` 在第一个 `await` 之前同步置相，比较脆弱。建议由 `dispatch` 返回一个判别结果。
6. **`apply` 经 `void` 托管（`Session.classify`）。** 授权发现分支若 reject，在途项永远停在 `discovery`，`close()` 的 `await Promise.all(flows)` 永不返回。目前没有能 reject 的路径，探索器也查未处理拒绝。建议用 `try/finally` 保证结算（DP-06：每项异步工作有错误去向）。
7. **上限仍有拷贝。**
   - 第 1 轮裁定删掉 `limits.ts` 里复制的上限。删了，但 `authorization.ts` 的 `METADATA_LIMITS` 又抄了契约 `wire.ts` 的 `LIMITS`，注释也写明是「the contract's shape limits」。
   - `BYTE_LIMIT` 也与契约的 16 MiB 各写一份。
   - 建议契约导出 `WIRE_LIMITS`。
8. **`signal` 在授权中触发时，`call` 答 `ok`（`SentCall`，answer 为 `abandoned`），同一相上 `close()` 答 `not-sent`。** 同一事实（请求没离开）报出两种结局。结局偏保守，所以安全，但不精确（DP-01）。`Session.abandon` 没有按 `phase` 区分。契约 T5 没有规定这一段，交卡拥有者定。
9. **授权发现的 R4 规则分在两个文件。** `contract/src/authorization.ts` 文件头写「the fetching itself is the transport's; the rules are here」，取回循环 `discoverAuthorization` 却放在 `decisions.ts`。

## 第 1 轮 C 的阻断逐条复核

| 项 | 状态 | 证据 |
|---|---|---|
| B1（`isModern` 分歧） | 已消失 | `session.spec.ts:981`、`:993` |
| B2（T8 决策层两份） | T8 已消失 | 残留见非阻断第 1、2 条 |
| B3（大整数词形） | 已消失 | `requestTextOf` 的 `values`、`responseTextOf`；`session.spec.ts:1036` |
| B4（stdio 写端忽略 `signal`） | 单个写已修 | 重叠写由本轮阻断 B1 重新打开 |
| B5（HTTP 应答头之前 `signal` 无效） | 已消失 | 线路收 `entry.controller.signal`；`session.spec.ts:1275` |

## 契约决策层是否内聚

`decisions.ts` 的文件头称它是「T8 决策层」，实际装了四组变化原因不同的东西：

1. **T8 结论：** `requestClassOf`、`concludeAnswer` 及其辅助、`concludeProbe`、`unsupportedVersionOf`、`probeErrorConclusionOf`、`retryVersionOf`、`discoverWith`、`PROBE_REQUESTS`、`RESENT_REQUESTS`。
2. **已结算应答的读法（T2/T6/T7）：** `readerOf`、`interpretAnswer`、`errorFailureOf`、`callAnswerOf`、`listingPageOf`、`taskReportOf`、`taskAnswerOf`、`legacyIdentityOf`。应归 `readers.ts`。
3. **T3 的写法与组成：** `legacyInitializeParamsOf`、`peerRequestAnswerOf`、`requestTextOf`、`notificationTextOf`、`responseTextOf`、`treeOf`。应归 `envelope.ts` 或新的 `writing.ts`。
4. **带端口的异步编排：** `discoverWith`、`discoverAuthorization`。它们不是纯函数；后者应归 `authorization.ts`。

建议在下一次碰到这个文件时按这四组拆开。不阻断：规则仍然只有一份。

## 两个设计问题

**(1) 探索器引擎该不该抽成共用设施：该抽，但不在本闭包，抽到 `tools/` 下的开发期工具包。**

- **该抽的理由：**
  - 两份骨架相同：`explore`、`visit`、`collect`、`withHooks`、`drain`、`siteOf`、`Nondeterminism`、`Visit`/`Queued`/`Violation` 类型，加起来约 150 行。
  - 它们已经分叉：mcp 一份有 `Step.throws`/`Visit.offered`（端口在调用当下抛出的兄弟分支）与 `AsyncLocalStorage`，本成员没有。
  - 引擎缺陷要修两次。`verification/README.md:66` 也把这个问题明确交给了派发者。
- **不在本闭包的理由：** mcp 那份正在并行闭包里改（`skill-mcp` 上 897 行，`w3-mcp-call` 工作树里 1446 行）。现在抽就是和一个并发写者共享同一对象（ub-mode「Separate before serializing shared state」，项目的共享单写规则）。
- **建议：** W3 收口后另立小卡。只抽 BFS 驱动，以 `Run` 工厂为参数，接口是 `enabled`/`perform`/`projection`/`rest`/`reports`/`rejectedUnhandled`；把 throws 兄弟分支做成可选能力；`siteOf` 收源码路径的正则。`Run`、端口和性质留在各成员。
- **放在哪：** `tools/` 下新建一个不发布的开发期包（`tools/README.md`：开发、验证工具在此成包），用包模板生成。不放的地方：
  - `packages/common`：那里接纳的是被至少两个具名消费者确认的纯产品表示，测试设施不是。
  - `mcp-contract/testing`：那是端口实现方的符合性入口（契约 SPEC 第 109 行），引擎没有 MCP 语义，放进去还会把 `node:` 进程钩子带进契约的 testing 入口。

**(2) `tests/unhandled.ts` 是否改为 `vitest.config.ts` 的 setup 文件：应改。**

- **该改的理由：**
  - 六个文件各调用一次，是同一个决定写了六处。
  - 新用例文件会漏掉它，`session-model.spec.ts` 现在就没有调用。改成结构比约定可靠。
- **可行性：**
  - `vitest.tiers.mts` 只保留 `exclude`/`reporters`/`outputFile`/`env` 给自己，不设 `setupFiles`，成员可以自加。先例是 `tools/test-runner/vitest.config.ts:14`。
  - 在 setup 文件顶层注册的 `beforeAll`/`afterEach`/`afterAll` 对每个用例文件生效，语义与现在相同。
- **与探索器兼容：** `withHooks` 先 `removeAllListeners('unhandledRejection')`，结束后恢复原列表。所以探索期间 setup 的 `record` 监听不在，不会重复计数；探索器之外的拒绝仍进 `stray`。`uncaughtException` 监听在探索期间仍在，与现在相同。
- **要同步的：** `tests/README.md` 第 7、11 行对 `unhandled.ts` 的登记。
- **另立小卡：** 差分变异的 RuntimeError 问题是全仓的，长期归属是 `vitest.tiers.mts`/test-runner。把守卫提到 `testTiers` 会让其他成员潜在的泄漏变红，所以不在本 PR 做。

## 未覆盖

- 未跑 `lint:deps`、metrics 与变异，那些归 A 和 D 面。
- `session.spec.ts` 与 `tests/model/ports.ts` 没有逐条读完。
- 没有用真实子进程复现 B1，只在 `StdioLine` 的流替身上复现。真实管道的满写场景与之等价：小写先完成，紧接着大写阻塞。

## 结构根因诊断（卡拥有者，两轮同类阻断之后）

第 1 轮 A、C 的阻断是「等待点不受 `signal` 与关闭管辖」（stdio 写端、HTTP 应答头之前）。第 2 轮 C 的 B1（重叠写使 `close()` 挂住）与 B2（`authorize` 挂起时调用方放不开）是同一类。按评审—修复收敛阶梯，这一轮不逐点补洞，先问评审判定是否成立，再做结构诊断。

### 评审判定成立

- B1：探针在 `StdioLine` 上复现（第一块写完、第二块不完成，`close()` 2 s 后仍在等）；违反 `close()` 自己的注释、H6 与 T5 的关闭次序。会话不串行化写，答复对端 ping、通知与请求都直接写线路，重叠写是常态。阻断。
- B2：`authorize` 永不答复时，`call()` 之后触发 `signal`、`listActions()` 之后 `close()`，调用方都一直等。违反契约 T5「`signal` 触发后传输不再等待」；调用口 `@omne-harness/mcp` 的端口前提 WF5（`call` 在停止信号触发后最终结算）就依据这一句。修复轮在 SPEC 里自加的豁免（「凭据句柄可以挂起，由句柄的持有者承接」）把挂起的端口调用与调用方的等待混为一谈：端口调用可以挂着，调用方的等待不可以。阻断，豁免删去。

### 承诺

调用方能看到的每一个 promise（`call` 的结果与 `answer`、读写类操作、`discover`、`cancelRequest`、`close()`）在 `signal` 触发或 `close()` 之后结算；凭据句柄、元数据取回、线路或对端挂起都不改变这一点。挂起的端口调用本身留在后台，由会话拥有，结果作废。

### 根因

1. **调用方跟着工作流走，不跟着结算走。** 在途项与它的 `Deferred` 在授权之前就建好了，`signal`（`abandon`）与 `close()` 也已经按阶段结算它；但 `once`、`call` 先 `await this.send(...)`，`send` 依次 `await authorize`、`await dispatch`，调用方拿到的是工作流的完成，不是结算。于是工作流里每一个 `await` 都成了调用方的挂起点，必须逐个接上 `signal` 与关闭；这是一张开放的清单，每轮评审都找到新的一项（第 1 轮写端与应答头，第 2 轮 `authorize`；还有没被点名的：发现流里 `await reportRejection` 让 `close()` 与带 `signal` 的调用一起挂住，`cancelRequest` 经 `sendNotification` 等 `authorize`，`discover` 的旧一路经 `enterSse` 等 `authorize`）。
2. **线路的写状态不是数据。** `StdioLine.writing` 用一个布尔值表示在途写的个数；两个写重叠时出现「有写在途而标志为 false」这个本不该能表示的状态。
3. **形式守护量错了层，也没有挂起的凭据端口。** 探索器的 V4 观察的是会话内部的 `Pending` 结算，不是调用方的 promise，并照 SPEC 豁免排除了 `authorizing` 相；端口模型里凭据句柄只有 `ok`、`fail`、`reject` 三种答复，没有挂起。所以 B2 在探索器里不可能被看到。探索器用 `ExplorerLine` 代替真实线路，`StdioLine` 的关闭规则在探索器与 TLA+ 模型之外，只由一条单写的用例覆盖，B1 也看不到。

### 目标结构（修复轮的施工依据）

1. 在途项在每个阶段都有确定的结算，`signal` 与 `close()` 当场同步施加：授权中 → `not-sent`（`connection-unavailable`）；已交给线路 → `no-answer`（`abandoned`）；授权发现中 → `not-sent`（`authorization-required`），发现按当时已取到的内容交出，没取到的地址按 R4 是 `unavailable`。`close()` 不再等发现结束。
2. 调用方只等结算：读写类操作等在途项的结算；`call` 等一个「出发点」：线路收下请求（stdio 写完、HTTP 2xx 应答流开始）或在途项结算，二者先到者；答复 `not-sent` 时交失败，否则交 `SentCall`。不再同步窥视 `deferred.value` 或 `phase`。
3. 工作流（授权 → 组成 → 写出；拒绝报告 → 元数据取回；答复对端请求；通知）是会话拥有的后台工作，经一个入口启动：它把意外的 reject 按阶段转成结算（DP-06），每次调用端口之前同步核 `usable`（V2），结算之后的结果丢弃。
4. 没有在途项、但有调用方在等的交换（`cancelRequest` 的通知、`discover` 旧一路的回退 GET）经同一个辅助在 `closing.signal`（与调用方信号）下等端口，到期即收场。
5. `close()`：标记关闭，按阶段同步结算全部在途项，中止各控制器与 `closing`，然后只等线路的 `close()`。
6. 线路：在途写是数据（计数或集合）；`close()` 时有在途写就中止写端，否则关闭写端。
7. 形式守护跟着改：探索器 V4 观察调用方的 promise（含 `close()`），凭据句柄的两个方法与元数据取回加「挂起」一种答复，删掉 `authorizing` 的豁免；V6 按第 1 条重述；`TransportSession.tla` 同步第 1、5 条，并加一个负控（调用方跟着工作流等）；`StdioLine` 加重叠写再关闭的用例，并做「计数改回布尔」的变异。
8. 契约 T5 补句（调用口第 2 轮 B R2-7 的落点）：`call` 进行中 `signal` 触发，请求还没交给线路时答 `not-sent`（`connection-unavailable`），已交给线路时答 `SentCall`、`answer` 以 `no-answer`（`abandoned`）兑现；两种情形 `call` 都在信号触发后结算，不等凭据句柄或对端。

## B. 表达（design-reviewer，expression，opus，xhigh）

本次做的是「表达」判断，依据的判据页是 harness-design-handbook 的 `references/review/expression.md`。宿主技能根里没有这一页，按角色规定读的是 canonical 源 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`。

**评审对象**
- PR #1138，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `db06b5b70`（`gates-r2/head.txt` 已核对），第 1 轮 head 是 `8f9016fd8`。
- 我没有 git，第 1 轮的原文用 `tmp/closures/w3-mcp-host/docs/host-SPEC.before.md` 与 `contract-SPEC.before.md` 作基线。这两份的行号与第 1 轮记录的 N 条一致（例如成员 `:133`、`:145`、`:117`，契约 `:448`、`:698`），但没有用 git 证实。
- `evidence-r2.md` 只有提交清单，没有逐个文件的清单。所以范围内的成员文档我按现文全部读完，契约只读改过的句子与 `docs/public-api.md`。

**工具输出**
简报附了，我没有重跑：
- `gates-r2/check-docs.log`：`PASS: 2738 Markdown files; local links and skill mirrors`，只证明链接与镜像一致，不证明语义正确。
- `gates-r2/check-design.log`：PASS。
- check:docs 只核锚点存在，不核锚点指向的条款对不对。NB7 里的 `#t8` 就是这一类，工具放过了。

---

## 阻断（1 条）

**B1 「已登记、尚未写出（授权中）」这一段的结局没有拥有者，三份工件给了三种答法**
- **类别**：完整性、跨契约一致、可实施性，并涉及形式对应。
- **位置与原句**：
  - 契约 `SPEC.md` T5 `:474`：「`call` 的 `signal` 在调用前已触发时，`call` 答 `not-sent`……在发出后触发时……`answer` 以 `no-answer`（`abandoned`）兑现」。`:479` 写「关闭时在途的请求答 `no-answer`（`abandoned`）」，不分相。
  - 契约 T1 `:447`：「`no-answer`，请求已离开而没有应答」。
  - 契约套件 `src/testing-transport.ts:2229`「a call still being authorized when close() ran is not-sent」。T5 正文没有这条规则。
  - 成员 `SPEC.md:176`：「登记之后任何时刻触发……`answer` 答 `abandoned`」。V6 `:241` 与 `:182` 则写「授权中……答 `not-sent`（契约 T5）」。
  - 实现：`src/session.ts:224-230` 的 `abandon()` 对 authorizing 相直接结算为 ABANDONED。`tests/session.spec.ts:1330-1348` 把它钉死：授权中 signal 触发时，`call` 交出 SentCall，answer 是 `abandoned`，而 `line.sent` 为空。
  - 模型：`verification/models/TransportSession.tla:145-158` 的 `Signal(r)` 把 authorizing 相答成 `"notSent"`。VR `verification/README.md:36` 却把它映射到 `wireSignal → abandon`。
  - 探索器：`tests/model/properties.ts:157-160` 明写不检查 authorizing 相。
- **依据**：表达页「可实施性：两个实现者是否会因缺决定而做出不同结果」。契约是所有传输的唯一规则源。
- **触发场景与后果**：
  - 场景：Streamable HTTP 材料带凭据句柄，`authorize` 还没返回，调用方的 signal 就触发了。
  - 本成员交出带 requestId 的 SentCall 与 `no-answer(abandoned)`。`@omne-harness/mcp` 按 T1 会读成「请求已离开、效果未知」，还可能对一个对端从未见过的 id 调 `cancelRequest`。
  - 同一相遇到 `close()` 时却答 `not-sent`。
  - 模型按 notSent 建模，但没有任何不变式观察 `out`：`V4_SignalBounded` 只看 `st`，V6 只管 close。探索器又跳过这一相。所以 V4、V6 的「有限范围通过」对这一相不算证据。
  - 两个实现者已经做出了不同结果（模型与代码）。第二个传输实现照 T5 字面可以任选一边。
- **作者需明确**：契约 T5 要为「登记之后、写出之前」这一相分别给 `signal` 与 `close()` 定结局。close 这一半套件已经钉成 not-sent，但正文没写。两边的代价：
  - 改成 not-sent：要改 `session.ts` 的 `abandon` 与 `call`，以及 `session.spec.ts:1330` 的断言。
  - 保留 abandoned：要放宽 T1 里 `no-answer` 的「请求已离开」，把模型的 `Signal` 改掉，并给 V4、V6 补能分辨这一相结局的断言。
  - 另外，成员 `:176` 的总括句与它自己的子项「授权发现中……答 `not-sent`（`authorization-required`）」相反，要一并改写。这里不代选，由契约 T5 的拥有者裁定。

---

## 非阻断

**NB1 形式对应：TLA 的 V1、V2、V6 是只在缺陷分支里写入的幽灵标志**
- **位置**：`TransportSession.tla`
  - `resettled` 只在 `"resettle" ∈ Bugs` 分支置真（`:99-110`）。
  - `credAfterClose` 只在 `Begin` 的 closed 分支置真（`:78-89`），而进这个分支要求 `"cred-after-close" ∈ Bugs`。
  - `closeAnswerBad` 只在 `"close-not-sent" ∈ Bugs` 时置真（`:182-183`）。
  - 对应不变式在 `:215`、`:218`、`:233`。
  - 相关说法：SPEC `:245-252`；VR `:104`「每条性质在两边都有能使它变红的缺陷」；VR `:115`「V1 的负控放在 TLA+ 模型」。
- **依据**：表达页说「模型有无违反该条款会失败的断言？建模吸收身份……不是对应证据」。
- **后果**：
  - `Bugs = {}` 时，这三条不变式与 `Close`、`Answer`、`Signal` 怎样给 `out` 赋值无关，永远成立。比如把 `Close` 里 auth→notSent 写成 abandoned，`valid-close` 照样通过。负控只证明缺陷分支置了它自己的标志。
  - V1 在探索器一侧也没有负控（SPEC `:247` 自己承认），所以 V1 两边都没有有效的变红证据。V2、V6 的有效证据只有探索器这一边。
- **作者需明确**：二选一。
  - 把 V1、V2、V6 改写成对状态的断言。例如关闭时记下每个请求所处的相，断言 `out` 与相对应；凭据动作只要发生在 `closeDone` 之后就置位。
  - 或者在 SPEC 表与 VR 里如实写明：这三条在 TLA 一侧只做了缺陷注入。同时收回 VR `:104`、`:115` 的全称说法。

**NB2 形式对应、表达歧义：SPEC 性质表的 TLA 列每行只写「有限范围内找到反例（`bad-…`）」**
- **位置**：SPEC `:247-252`；`:243` 声明用词沿用 `docs/verification.md` 的六种状态。
- **依据**：`docs/verification.md:121` 的六种状态里没有「找到反例」。正控 `valid-close`、`valid-signal`、`valid-no-handle` 都已通过（`verification/models/README.md:55-57`）。
- **后果**：照这张证据状态表，读者看到的是「TLA 对 V1–V6 全部找到了反例」，也就是性质被违反了。
- **作者需明确**：写法与探索器那一列同式：「有限范围通过（valid-*）；负控 bad-* 找到反例」，再按 NB1 修正 V1、V2、V6。

**NB3 形式对应：「A4 由模型承担」不成立；两个不同的缺陷共用一个名字**
- **位置**：SPEC `:257`；VR `:109`（第 1 轮阻断列的 A4）、`:117`。
- **依据**：
  - 模型的 `Refuse` 要求 `st = "sent"`（`.tla:116`），而 `Close` 把 sent 置成 done（`:175-176`）。
  - `cred-after-close` 只作用于 `Begin` 的 authorize。所以模型表达不了「`close()` 返回之后调用 `reportRejection`」。
- **后果**：A4 实际上只由 `http.spec.ts:396` 承担，SPEC 把覆盖说大了。
- **同名不同缺陷**：SPEC `:250` 与 VR `:111` 把以下两个变异并列为同一缺陷，实际是两个缺陷用了一个名字：
  - 探索器的 `mV4-close-after-line`：`close()` 先等线路再结算；签名含义见 `properties.ts:191-197`。
  - TLC 的 `bad-close-after-line`：不结算在途请求就返回；见 `.tla:172-174`。
- **作者需明确**：收回「模型承担 A4」。给两个变异各起与其缺陷相符的名字，或在表里分别写明各自注入的缺陷。

**NB4 跨契约一致，涉及安全：T9 的新句与成员自定 9 对元数据取回读法不一**
- **位置与原句**：
  - 契约 `:574`：「传输只在两种时候调用凭据句柄：发出 HTTP 请求时调用 `authorize`，含答复对端请求的 POST」。
  - 契约 `:462`：「这个 GET 与其他出站请求一样先经凭据句柄授权（T9）」。
  - 成员自定 9（`:51`）与 H4（`:72`）：元数据的 well-known 取回「不经句柄」。
  - R4 `:292`：元数据地址可以由对端的 `resource_metadata` 指定。
- **依据**：九问第 1 问「输入与授权」。
- **后果**：
  - 照 T3、T9 字面，「出站 HTTP 请求」也包括 R4 的元数据取回。第二个实现者会把凭据头发到对端点名的任意地址。
  - 契约根的 `MetadataFetch = (url, signal) => …`（`src/decisions.ts:567`）不带头，经决策层实现的传输走不到这一侧，所以定为非阻断。
- **作者需明确**：在 T9 或 R4 写明元数据取回不经凭据句柄、不带凭据头，与成员自定 9 对齐。之后成员这一条就成了「兑现契约」，不再是「自定」。

**NB5 完整性、引用与归属：契约「真实传输兑现时的裁定」没有登记第 1 轮之后的条款改动**
- **位置**：
  - 契约 `:87`：「每条只加导出、字段或条款；`classifyWireEvent` 对不是 JSON 的 stdio 行的归类是唯一的行为改动」。
  - `:96` 的第 8 条只列 13 个读法函数。
  - 现文另外新增了四项：
    - T8 决策层的根导出（`:107`、`docs/public-api.md:27`）
    - T3 按原词形写出（`:470`）
    - T5 按传输释放交换（`:474-478`）
    - T9 答复对端的 POST 也经 authorize（`:574`）
- **依据**：维护约定「语义修订有授权，公开接口……与消费者同步」。这些改动的授权是第 1 轮的裁定 P3、P7、B3 与根因裁定。
- **后果**：
  - 读契约的人找不到这些新义务的出处与日期。
  - 「唯一的行为改动」已不成立：原词形写出与答复授权都改变了传输行为，脚本化传输也随之改了。
  - 成员 `:9` 写的「T8 的决策层是契约的根导出」在契约的裁定列表里没有对应条目。
- **作者需明确**：把这几项登入裁定列表（或另起一组带日期的条目），并删改「唯一的行为改动」这一句。

**NB6 引用与归属：成员钉的契约修订早于它依赖的 T5 文本**
- **位置**：成员 `:9` 钉的契约修订是 `51bb48168`。
- **依据**：按 `evidence-r2.md` §1 的提交次序，`7b1125000`「契约 T5 按传输写清对端看到什么」在 `51bb48168` 之后。成员 `:176-179` 的分传输写法与改动后的 T5 `:474-478` 一致。
- **后果**：按钉住的修订去读契约，T5 很可能还没有分传输的写法。这是推断，没有用 git 核实。
- **作者需明确**：把修订改钉到实际兑现的那一版契约。

**NB7 引用与归属：锚点、路径与编号**
- 成员 `:230`、`:241` 的 `[T5](../mcp-contract/SPEC.md#t8)` 与 `:238` 的 `[T4](…#t8)` 指错了位置。`#t8` 在契约 `:492`，而 T4、T5 在 `:471-479`，应当指向 `#port-transport`。
- 成员 `:203` 的命令「在包根运行 `node verification/proofs/sdk/<探针>.mjs`」指向的路径已不存在。探针已移到 `tests/probes/`（提交 `1c2bdbb89`），`verification/proofs/sdk/README.md:17-21` 写的就是 `node tests/probes/…`。
- 成员 `:198` 的「契约裁定 2」没说是哪张表。契约有三张编号表（`#decisions`、`#decisions-w3`、`#decisions-host`），每张都有第 2 条；这里指的是 `#decisions-host` 第 2 条。

**NB8 完整性：bad ports 偏离的受影响行不全**
- **位置**：成员 `:168`「受影响的行：X01 读成 D15、O05……，C04……」。
- **依据**：契约 X01（`:565`）适用于「除通知外的各类」。HTTP 流断开时，`initialize` 落在 I06，`tasks/update`、`tasks/cancel` 落在 O06。
- **后果**：按这张表核对偏离范围时，会漏掉 `initialize` 与两个写类任务操作。它们的方向同样在保守一侧。
- **作者需明确**：把 I06、O06 补进受影响的行。

**NB9 表达歧义：H8 里 HTTP 那一条前后句冲突**
- **位置**：成员 `:90`：「只有 2xx 的正文按上界读……错误状态的正文超过上界时，线路交出空正文」。
- **依据**：同页自定 7（`:49`）写的是「只有 2xx 正文越界是流断开」。
- **后果**：第一句可以读成错误状态的正文不设上界，与同条后一句以及自定 7 冲突。
- **作者需明确**：第一句改成「只有 2xx 正文越界是流断开」。

**NB10 表达歧义：契约里 DELETE 的情态不一致**
- **位置**：
  - T5 `:479` 写「不发 DELETE」，是禁止。
  - 理由 `:627` 与未覆盖 `:701` 写「T5 不要求 DELETE」，是不作要求。
  - 偏离表 `:607` 写「`close()` 不发 DELETE（T5）」。
- **后果**：一个实现发了 DELETE 算违反 T5 还是允许，读不出来。套件不核这一点，所以也不会被发现。
- **作者需明确**：T5 只用一种情态。

**NB11 N1、N10、N12 在成员与 verification 里的残留**
- **N1**：
  - 自定 4（`:46`）现在已经写在契约 T5 `:478` 与 T2 `:450` 里，不再是「契约没有写」。
  - H12 `:109` 与契约 T8 `:502` 几乎逐句相同。
  - H9 `:97` 复述了 T3 `:462` 的回退条件与 T8 `:508` 的 SSE 模式规则。
  - 这些都与 `:3`「本页不复制条款正文」不符。
- **N10、N12**：
  - 评审轮次与卡内编号只能在 tmp 里解析，括号里的缺陷描述已经够用。出现的位置：`:213`「MC3-10」、`:227`「（代码修复轮交回）」、`:256-257`「第 1 轮评审阻断 A5/A4」、VR `:106` 的「第 1 轮阻断」列与 `:117`。
  - VR `:83` 与 `verification/models/README.md:66` 的「同一时段本机另有会话……」是运行过程的记述。
- **与 P5 同类**：VR `:104` 引用的探索器变异脚本 `tmp/closures/w3-mcp-host-formal/mutate.py` 不入库；`verification/models/README.md:41` 中 `FORMAL_OUTPUT_DIR` 的缺省值指向闭包的 tmp。探索器一侧「能变红」的复核因此依赖不入库的脚本。

**NB12 N6 的残留**：`README_ZH.md:13`「读不懂的行丢弃」、`README.md:13`「unreadable lines dropped」。契约现在把这类行叫「解析不了」，「读不懂」专指 `answer-malformed`（契约 `:450`）。

**NB13 导航与单一源的小项**
- 导航遗漏：
  - 根 `index.md:8` 没列「性质与证据 V1–V6」与「与契约的已知偏离」。
  - `tests/index.md` 与 `tests/README.md:7` 没列 `model/`（SPEC `:221` 与 VR 引用的探索器）和 `probes/`。
  - `tests/fixtures/README.md:19` 漏了 `settle.ts`。
- `docs/architecture.md:37`「没有应答时等到 `close()` 或 `signal`（契约 D14、I05、O04）」：这三行写的是「等到 `close()`」，`signal` 只用于 `call`（C03）。
- 复述未挂条款指针：`docs/context.md:10` 复述了 T9 的凭据调用时机；`docs/flows.md:56-71` 的失败表复述了结局，多数行没有条款指针（`flows.md:3` 自称「只画顺序」）。
- 契约 `docs/public-api.md:11` 列的 `./testing` 运行时导出比契约 SPEC `:109` 少：缺 `TRANSPORT_TABLE`、`transportCells`、`rowsOf`、`cellsOf`、样本构造器、脚本化传输。我无法确认这一行是不是本轮改的。

---

## 第 1 轮账本

**N1–N16**

| 项 | 结论 | 位置与说明 |
| --- | --- | --- |
| N1 | 部分仍成立 | 见 NB11 |
| N2 | 已改 | 成员 H7 `:84`、偏离表 `:159` 只指向契约 T5；契约 `:627`、`:701`。情态残留见 NB10 |
| N3 | 已改 | 自定 7 `:49`、H8 `:90`、architecture `:39`、flows `:61`。措辞问题见 NB9 |
| N4 | 已改 | H10 `:101`、H11 `:105` |
| N5 | 已改 | 契约 T2 `:450`、decisions-host 第 1 条 `:89` |
| N6 | 两份 SPEC 已改，README 仍成立 | 契约 `:450`、H2 `:64`；README 见 NB12 |
| N7 | 已改 | 契约 T2 `:451`、T8 `:503` |
| N8 | 已改，但引出 B1 | 契约 T5 `:474-478`、成员 `:176-180`、flows `:68` |
| N9 | 已改 | 成员 `:164-170`；受影响行不全见 NB8 |
| N10 | 部分仍成立 | F4–F8 与「已定事项」已退出两份 SPEC；`:213` MC3-10 与 `:198`「契约裁定 2」还在 |
| N11 | 已改 | `:123-127` 定义三类理由，每行都有类别与条款；「无协议行为」一类目前没有行用到，不构成问题 |
| N12 | 部分仍成立 | 原列各项已删，「stdio 优先」已在 `:200` 定义；新增同类见 NB11 |
| N13 | 已改 | 契约 `:85-97` 现为 9 条，成员 `:9`、`:35` 引的是 1–9 |
| N14 | 已改 | 契约未覆盖 `:699`、`:701`；已关闭的说明移到 `:99` |
| N15 | 已改 | 契约 `:450` 改引 client `dist/src-CeKsbNLO.mjs:6773` |
| N16 | 已改，一处小残留 | README `:44`、ZH `:43`、public-api `:20` 不再称「决定」；architecture `:36` 已含「2xx 而没有应答」；成员 `:151` 依赖说明已更新；契约 T9 `:574` 与 T4 一致；SSE 模式 `:508` 逐行列出、不含 D16；S07 `:564` 含 endpoint 会话。残留见 NB13 的 architecture `:37` |

**P1–P5**

| 项 | 结论 | 位置与说明 |
| --- | --- | --- |
| P1 | 已改 | 契约 decisions-w3 第 25 条 `:81`；decisions-host 9 条 `:89-97` |
| P2 | 已改 | 契约 `:627`、`:701`；成员 H7 与 `:159` 只指向 T5。情态残留见 NB10 |
| P3 | 已改 | 契约 T5 `:474-478`（旧修订写成「对端看到流断开」，比裁定原句更细）；成员 `:176-179`、flows `:68` 指向 T5。由此暴露出 B1 |
| P4 | 已改 | 成员 `:164-170`，写明受影响的行与方向，不另判端口；受影响行不全见 NB8 |
| P5 | 已改 | 探针在 `tests/probes/`，摘录在 `verification/proofs/sdk/README.md`，复用表 `:129` 改引那里；SPEC `:203` 的命令路径没有跟着改，见 NB7 |

---

## 简报另核的各项

- **单一源**：基本成立。行为条款只在两份 SPEC 里，docs 多数指向 SPEC 的 H 条。例外有三处：
  - NB13 里两处复述没有挂条款指针。
  - 成员 H9、H12 复述了契约条款（NB11）。
  - B1 的授权中一相规则只写在成员 SPEC 与契约套件里，契约正文没有。
- **V1–V6 与不变式名**：
  - 性质名在 SPEC `:236-241`、VR `:106-113`、models/README `:20-29` 三处一致。
  - 不变式名在 VR、models/README、`TransportSession.tla:214-233` 与 10 份 `.cfg` 里一致。
  - 探索器变异名在 SPEC 与 VR 之间一致，签名在 `properties.ts` 里都有对应。
  - 同名不同缺陷一处，见 NB3。
- **H1–H14 变异句的用例名**：逐条都在用例文件里找到了：
  - `session.spec.ts:981`、`:728`、`:1593`
  - `public-entry.spec.ts:108`、`:143`
  - `http.spec.ts:396`、`:457`、`:680`、`:482`、`:290`
  - `lines.spec.ts:59`、`:131`、`:93`
  - `stdio.spec.ts:213`、`:138`
  - 契约 `testing-transport.ts:2178`：H6 引的是前缀，全名还带「, and does not stop the process (item 9)」。
  - H7 没有变异句，与 `:212` 的未覆盖一致。
- **check:docs、check:design**：读数如开头所列，都是 PASS。不覆盖锚点语义（见 NB7）。

## 范围外待裁决

- B1 的结局选择：归契约 T5 的拥有者。两边的代价已写在 B1 里，这里不代选。

## 未覆盖

- 没有 git。第 1 轮基线用的是 `docs/*.before.md`，没有用 git 证实。其余文件只能按现文判断，分不清每一行是本轮新增还是原有（例如契约 `public-api.md:11`）。
- 没读全文的部分：`tests/model/` 的 `explore.ts`、`scenarios.ts`、`ports.ts`、`session-model.spec.ts`；`run.py`；契约 SPEC 中 T 节与裁定节以外的部分。`decisions.ts` 只看了 `MetadataFetch`，`properties.ts` 只看了 V4–V6 段。
- 转交给其他评审：
  - 探索器引擎要不要抽成共用设施、`unhandled.ts` 要不要改成 setup 文件：转 C。
  - 裁定 B1 之后，`abandon()` 的实现与用例是否符合新的 T5：转 A。
  - 差分变异：转 D。交付边界：转 E。
- 机械范围：check:docs 不核锚点所指的条款是否正确。

**各项的拥有者**
- B1、NB4、NB5、NB10、契约 `public-api.md:11`：契约 SPEC 的拥有者（mcp-contract 维护者，或按卡拥有者的裁定）。
- NB1–NB3：本成员维护者（形式工件出自 `w3-mcp-host-formal`）。
- NB6–NB9、NB11–NB13（契约 `public-api.md:11` 除外）：本成员维护者。

本次评审的结论不代表规格已被接受，也不代表证据已被核实。

## 卡拥有者的裁定（E、C、B；A 交回后补）

处置词同调用口记录：改、登记、6b、0.1.0（公开形状项，进 K7 一并处理）、波末。

### 阻断

- C B1（stdio 重叠写使 `close()` 挂住）：改，按诊断第 6 条。
- C B2（`authorize` 挂起时调用方放不开）：改，按诊断第 1–5 条；SPEC「端口失败模型」里的豁免删去，换成承诺句：没有 `signal` 的操作（`discover`、`listActions`、任务操作）只由 `close()` 放开；没有 `close()` 时，挂起的句柄由它的持有者负责。
- B B1（「已登记、尚未交给线路」一相的结局没有拥有者）：改。契约 T5 定结局：这一相上 `signal` 触发或 `close()`，都答 `not-sent`（`connection-unavailable`）；交给线路之后 `signal` 触发，`call` 交 `SentCall`、`answer` 以 `no-answer`（`abandoned`）兑现，`close()` 同样答 `abandoned`。理由：请求还没交给线路，对端不可能见过它，按 T1 不能读成「已离开、效果未知」，也不应对它 `cancelRequest`。`session.ts` 的 `abandon` 按阶段结算，`session.spec.ts:1330` 的断言随裁定改为 `not-sent`。成员 `:176` 的总括句同步。
- **修订第 1 轮的一条已采用规则**：`close()` 不再等授权发现结束。授权发现中的请求在 `close()` 或 `signal` 时当场结算为 `not-sent`（`authorization-required`），发现按当时已取到的内容交出，没取到的地址按 R4 是 `unavailable`。另一种做法（让拒绝报告与元数据取回都在 `closing.signal` 下竞速，保留「等发现结束」）也能有界，但 `close()` 的有界就要依赖注入的取回函数遵守信号；当场结算不依赖任何端口，而且让每一相的结算规则同形。成员 SPEC「关闭」第三项、V6、`valid-close.cfg` 同步。

### C 面非阻断

1. `die` 手写 S01/S03 结论、`causeOfEnded` 伪造上下文：改。契约导出退出窗口的规则（例如 `endedCauseOf`）与流断开时在途请求的结论，会话不再手写。
2. T2/T3/T5 的组成规则在会话与脚本化传输各写一份：改。`call` 的参数与值的组成、`tools/call` 的 `progressToken`、读类再发一次的规则、清单是否核 SEP-2243 头、`cancelRequest` 走通知还是中止、四个任务请求的组成，各一处实现在契约，两个传输共用；「旧修订」只有一个定义。
3. `WireClassification.message?` 与模板字面量的 `AnswerClass`：0.1.0。
4. `WireAnswer` 让 `legacy-*` 出现在每个请求上、`discoverWith` 的不可达分支：0.1.0。
5. 连接模式四个独立字段、`Dispatch` 可选字段袋、`Deferred` 暴露可变状态、`call` 同步窥视：改。连接模式改成判别联合（现代、旧 Streamable HTTP 带可选会话号、旧 HTTP+SSE）；`call` 等出发点（诊断第 2 条）；`Deferred` 只读暴露。
6. `void apply` 没有错误去向：改，由诊断第 3 条的工作流入口承担。
7. 上限仍有拷贝：改。契约导出线上上限，`authorization.ts` 与 `limits.ts` 改用它。
8. 授权中 `signal` 与 `close()` 结局不同：随 B B1 改。
9. 授权发现的 R4 规则分在两个文件、`decisions.ts` 装了四组东西：改。`discoverAuthorization` 移到契约 `authorization.ts`；`decisions.ts` 按 T8 结论、已结算应答的读法、写法与组成、带端口的编排四组拆开（纯移动，`git diff --color-moved` 可核）。

设计问题：

- (1) 探索器引擎抽共用设施：该抽，不在本卡。W3 收口后另立小卡，抽到 `tools/` 下不发布的开发期包，只抽 BFS 驱动；进波末待办。
- (2) `tests/unhandled.ts` 改为 `vitest.config.ts` 的 setup 文件：改；`tests/README.md` 的登记同步。调用口同样采用（`w3-mcp-call-fix2` 第 11 条）。

### B 面非阻断

- NB1（TLA 的 V1、V2、V6 只在缺陷分支置位）：改。三条改写成对状态的断言（例如关闭时记下各请求的相，断言答复与相对应；凭据动作发生在 `closeDone` 之后就置位）。每条不变式都要能被一个「有效动作的变异」（不是缺陷分支）打红，例如把 `Close` 里授权中 → `notSent` 改成 `abandoned`，`valid-close` 必须变红。
- NB2（TLA 列写成「找到反例」）：改，同探索器一列的写法。
- NB3（「A4 由模型承担」、同名不同缺陷）：改。收回 A4 的说法；两个 `close-after-line` 各起与缺陷相符的名字。
- NB4（元数据取回经不经凭据句柄）：改，安全相关。契约 T9 或 R4 写明元数据取回不经凭据句柄、不带凭据头；成员自定 9 改为兑现这一句。
- NB5（契约「真实传输兑现时的裁定」没有登记第 1 轮之后的改动）：改。登记 T8 决策层根导出、T3 原词形写出、T5 按传输释放交换、T9 答复对端的 POST 也授权，以及本轮的 T5 结局与元数据句；删改「唯一的行为改动」一句。
- NB6（成员钉的契约修订过早）：改，钉到最终兑现的修订。
- NB7（锚点 `#t8`、探针路径、「契约裁定 2」）：改。
- NB8（偏离受影响的行缺 I06、O06）：改。
- NB9（H8 首句）：改为「只有 2xx 正文越界是流断开」。
- NB10（DELETE 的情态）：改。按第 1 轮 P2 的裁定，契约 T5 写「不要求」：`close()` 不要求发 DELETE；本成员不发，这是对协议 SHOULD 的偏离，登记在成员偏离表。T5 不再写「不发」。
- NB11（N1、N10、N12 的残留，`mutate.py` 不入库）：改。删复述，只指条款；评审轮次与卡内编号换成缺陷描述；去掉运行过程的记述；探索器的变异做法入库（`tests/` 下可复跑的脚本或用例参数），不再依赖 tmp 里的脚本。
- NB12（README「读不懂的行」）：改为「解析不了的行」。
- NB13（导航、`architecture.md:37`、复述无条款指针、`public-api.md:11`）：改。

### E 面

- 验收 7：裁定 1 的例外扩为两类：Q1 关闭 F4 改写的一条；B-N3 让 `answer` 带消息之后，原有断言经 `classify` 剥去 `message` 再比较、比较的类别不变。最终证据与 PR 正文改准。
- 「用例 → 缺陷 → 变红」表：最终证据贴到卡上，每行写变异号、用例全名、变红输出的一两行摘录；不只给 tmp 的 TSV。
- 慢层 8 个 skipped：最终证据写明来源（快层的 8 条用例被慢层的标签过滤排除）。
- 冲突 1–6、8–10：波末写回或已裁，维持。冲突 7：以第 1 轮裁定为准，差分变异不给 `--since`；在修复轮的最终 head 上跑。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

## 评审对象与完成程度

- 仓库与工作树：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，PR #1138。
- 提交：基线 `92a8e3cdf`，交付 head `db06b5b70`。增量范围是 `8f9016fd8..db06b5b70`，共 33 个提交、76 个文件。级别按 L3 热点处理，简报 A 节。
- 完成程度：
  - 简报 A 的 1–4 条都已做完：第 1 轮阻断逐条复核；L3 热点逐行读 `session.ts`、`stdio-line.ts`、`http-line.ts`、`decisions.ts`；单一决策层核对；结构读数。
  - 探针都放在工作树之外。用 esbuild 按 `--conditions=source` 打包 `src/` 直接跑，第 1 轮 C 的探针跑已构建的 `dist`。`dist` 是 18:22 构建的，晚于 head 提交时刻 18:14，工作树干净。
  - 探针源码与本次输出存档在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2-probes-a/`，共 38 个文件。
  - 收工时 `git status --porcelain` 为空，head 仍是 `db06b5b70`。

## 工具一览

| 入口 | 命令 | 结果 | 输出 |
|---|---|---|---|
| 变更清单 | `git log/diff --stat 8f9016fd8..HEAD` | 76 个文件都在 `packages/mcp/mcp-host-local/` 与 `packages/mcp/mcp-contract/` 内，本轮没有新的越界文件（`docs/public-api.md` 已由第 1 轮裁定 8 接受） | 终端 |
| 验收与测试改动 | `git diff 8f9016fd8..HEAD -- '*.spec.ts' testing-*.ts` | 14 个文件，+2521/−38；契约原有断言有改动，见非阻断 1 | 终端 |
| 依赖规则 | `pnpm run lint:deps` | 退出 0：「✔ 没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（81 个成员、343 条成员边；1 个组环按具名例外放行）」 | 存档 `lintdeps.log` |
| 受限调用点与署名 | `pnpm run lint:rules` | 退出 0：「PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6032 个提交的署名，无违反」 | 存档 `lintrules.log` |
| 结构度量 | `pnpm run metrics --coverage --base 92a8e3cdf` | 退出 0。为另一棵树的变异运行排队 245 s。因为 `pnpm-workspace.yaml` 有改动，判为全量。mcp-contract 覆盖率 646 条用例退出 0；mcp-host-local 369 条用例退出 0，含 conformance 慢层 | `/data/qiwei/repos/omne-harness-lite/tmp/metrics/db06b5b70/`（`metrics.json`、`review.html`）；存档 `metrics.log` |
| 受影响范围的测试 | 见上一行（覆盖率运行跑了两个成员的全部 7+15 个用例文件） | 全绿 | 同上 |
| 第 1 轮探针复跑 | A 的 P1–P9（10 个文件）、C 的 modern/bigint/stdio-stuck/probe/leak | 全部显示已修复，见下节 | 存档 `r1-rerun-*.out`、`r1c-rerun-*.out` |
| 本轮新探针 | Q1、Q1b、Q2、Q3 | 3 处反例 | 存档 `q*.out` |
| 全套检查（L2） | — | 未验证：没有全套检查或准入输出（卡上只有 3 个成员的 turbo、慢层与常驻门禁），简报也没要求我跑 | — |
| 形式任务（L3） | — | 未验证：探索器与 TLC 没有重跑，`formal/20261105T160226Z/` 的原件没有读 | — |

## 第 1 轮阻断逐条复核

| 第 1 轮 | 结论 | 证据 |
|---|---|---|
| A1 stdio 写未完成时 `close()` 挂住 | 单个写已消失；两个写并发时仍成立，见阻断 1 | P3b：「close() settled within 3s: true」。P3：「close() settled within 3s: true」。用例 `stdio.spec.ts:213`。实现 `stdio-line.ts` 的 `close` 在 `writing` 时中止写端 |
| A2 发送期间 `signal` 不起作用 | 已消失 | P1：「call settled within 3s after abort at 200ms: true elapsed 207」。P2：signal 结束元数据取回，`reportRejection` 1 次。用例 `http.spec.ts:314`、`:329`、`:350`。`call` 的 signal 在登记时接到 entry（`session.ts:395`、`:742`） |
| A3 会话自己再判一遍错误类 | 已消失 | P4：session 得 `discover-shape`，只发 `server/discover`。P9：discover、`listActions` 都是 `error-shape`，call 交出整条消息。`session.ts` 里没有 `supportedOf`、`isModern` 或自己的 parse，只调契约的 `classifyWireEvent`、`concludeAnswer`、`discoverWith`。用例 `session.spec.ts:980-1033` |
| A4 回退 GET 401 后 `close()` 返回了还调 `reportRejection` | 已消失 | P6：「authorize > authorize > authorize > close() resolved」，没有 reportRejection。实现 `session.ts:628` 在 `openGet` 返回后核 `usable`。用例 `http.spec.ts:396` |
| A5 只量块里的第一行 | 已消失 | P5：discover 是 `stream-broken`，下一个请求是 `not-sent`。实现 `stdio-line.ts` 在切行循环里逐行累计字节。用例 `lines.spec.ts:59` |
| A6 写范围 | 已裁定（裁定 8），本轮没有新的越界 | 变更清单 |
| C-B1 `'2027-01-01x'` 当作现代版本 | 已消失 | modern.mjs：scripted 与 session 都是 `answer-malformed(discover-shape)`，session 只发 `server/discover`。用例 `session.spec.ts:981` |
| C-B2 T8 决策层两份 | 已消失 | `decisions.ts` 是唯一一份。`testing-scripted-transport.ts:11-35` 与 `session.ts:13-56` 都从契约导入 `concludeAnswer`、`discoverWith`、`interpretAnswer`、读法与文本写法。grep `supportedOf\|isModern\|JSON.parse` 在 host `src/` 里 0 处 |
| C-B3 大整数词形被改 | 已消失 | bigint.mjs 线上是 `"arguments":{"id":1234567890123456789,"price":1.10}`。回显 id 经 `responseTextOf` 以 `JsonValue` 原样写出（`decisions.ts:668`） |
| C-B4 stdio `send` 丢掉 `signal` | 单个写已消失（stdio-stuck：「total ms 210」），同 A1 的保留 | — |
| C-B5 HTTP 头前 signal 碰不到请求 | 已消失 | probe.mjs：「call() returned after ms 101 … fetch signal aborted at ms: 100」 |

第 1 轮非阻断复核：
- 监听增长已消失：P8 为 0，leak.mjs 为 0。
- `seen` 累积已消失：`consume` 结算后只 `continue`。
- P7 答复 ping 的 POST 已经授权：「response:p1[auth]」。

## 阻断

**1. stdio：两个写并发时 `close()` 仍然无界挂住**（检查表第 15 问；契约 T5，成员 SPEC H6「stdin 有未完成的写时，close() 中止写端，不等对端读 stdin」）

- 位置：
  - `packages/mcp/mcp-host-local/src/stdio-line.ts:123` 的 `writing` 是一个布尔值。
  - `:270-279` 每次写开始置 `true`，任何一次写结束都置 `false`。
  - `:310-311` 在 `writing === false` 时走 `await this.writer.close()`。
- 反例：对端是真实子进程，不读 stdin。同时发两个 `call`，小的在前、1 MiB 的在后。小写先完成，把 `writing` 置成 `false`，这时大写仍堵在满管道上。`close()` 于是去等 `writer.close()`，而它要等那次永远完成不了的写。
- 探针 Q1 输出：
  ```
  Q1 small call returned within 1s: true
  Q1 large call returned within 1s: false
  Q1 close() returned within 3s: false
  Q1 after SIGKILL: the same close() returned within 1s: true elapsed ms 3009
  ```
- 对照 Q1b：只发大的那一个时，「close() returned within 3s: true」。
- 后果：与第 1 轮 A1 相同。`@omne-harness/mcp` 的拆除先 `await transport?.close()`，再 `stopProcesses`，再 `credential?.release()`（`packages/mcp/mcp/src/internal/table.ts:351-355`），于是进程不被停止，凭据句柄不被释放。
- 测试缺口：`stdio.spec.ts:213` 只有单个写。探索器经内存线路驱动，不经 `StdioLine`，看不到这条交错。
- 实施者要做：按未完成写的计数或最后一个写的 promise 判断，而不是一个布尔值；补一条两个写并发、对端不读 stdin 的 `close()` 用例。

**2. 授权的等待点不受 `signal` 与 `close()` 管辖**（检查表第 9、15 问；契约 T5「关闭时在途的请求答 …；关闭后的请求答 not-sent」，简报第 2 条明列「授权」；交付说明第 5 节声称「每个等待点受请求的 signal 与 close() 管辖」）

- 位置：
  - `session.ts:397`：`send` 里 `await this.authorize(headers)`，没有与 entry 的结算或 `closing` 竞速。
  - `:723`：`call` 先 `await this.send(...)`。
  - `:577`：`once` 同样先等 `send`。
  - `:545-549`：`authorizationRequired` 直接 `await reportRejection()`。
  - `:796`：`close()` 要 `await Promise.all(flows)` 等这些授权发现结束。
- 反例（探针 Q2，HTTP 材料带句柄）：
  ```
  Q2a call() returned within 1s after its signal: false
  Q2a close() returned within 1s: true
  Q2a call() returned within 1s after close(): false
  Q2a listActions() returned within 1s after close(): false
  Q2b reportRejection calls: 1
  Q2b close() returned within 2s: false
  Q2b listActions() returned within 1s after close(): false
  ```
  - Q2a：`authorize` 永不答复。entry 已经被结算，但 `call()` 与 `listActions()` 的 promise 永不兑现，`signal` 与 `close()` 都结束不了它们。
  - Q2b：对端答 401，`reportRejection` 永不答复，`close()` 本身挂住。
- 后果：
  - 调用方用 `signal` 给 `call` 设的时限对卡在授权里的调用无效。
  - 拆除在 `transport.close()` 上挂住，与阻断 1 的后果相同，T9 里「持有者在时限到期后释放句柄」也做不到。
- 与成员 SPEC 的冲突：成员 SPEC 第 230 行与 V4 写了豁免（「凭据句柄的 authorize、reportRejection 不收 signal，可以挂起，由句柄的持有者承接」），探索器 `properties.ts:159` 也据此不检查。但这条豁免没有登记在「与契约的已知偏离」表里（表里只有 bad ports），而且与 T5 和交付说明的声称冲突。
- 实施者要做，二选一：
  - 让 `authorize` 与 `reportRejection` 的等待与请求的结算、`closing.signal` 竞速：方法按已结算的结论返回，`close()` 不等挂起的句柄调用。
  - 或者请卡拥有者裁定维持豁免。那样要把它登记为与契约 T5 的偏离，并改正交付说明第 5 节；本条随之降为「范围外」。

## 非阻断

1. **契约原有断言被改，交付说明写的是「原样通过」**（检查表第 2、4 问）
   - `packages/mcp/mcp-contract/tests/wire.spec.ts` 加了 `classify()`，丢掉新的 `message` 字段后再比（diff 第 234-245 行起，10 余处原有 `classifyWireEvent(...)` 被替换）。
   - 套件 `src/testing-transport.ts:1238-1251` 从比较整个归类的 `deepStrictEqual` 改成只比类别的 `strictEqual`。
   - 对类别的强度不变，`message` 只由新增的一条「the message a classification carries」钉住。
   - 交付说明第 2 节第 7 条写「其余原有用例原样通过」，与差异不符。这些改动是卡拥有者采纳的 N3 可加字段带来的，但验收 7 的例外只列了 Q1，需要卡拥有者认可并改正说明。

2. **有行为没有会失败的用例**（检查表第 5 问；依据本次覆盖率 `tmp/metrics/db06b5b70/coverage/packages__mcp__mcp-host-local/coverage-final.json`）
   - `stdio-line.ts:91` 的真分支没有被执行过：一行跨多个块、还没有换行就超过上界。
     - 这是读出来的，没有执行验证：`stdio.spec.ts` 用的行正好是 16 777 217 字节加换行，按 64 KiB 一块正好是 256 块加 1 字节，在 `:80` 的切行循环里被拦下，到不了 `:91`。
     - 删掉 `:89-94` 的检查，现有用例应当仍然全过。
     - 后果：对端写一条永不换行的行时，`buffered` 无界增长。
   - `stdio-line.ts:190` 的 `'failed'` 分支（写被 reject 时答 `unsent`，X02）没有被执行过。
   - `:98` 的 EOF 处没有换行的尾行投递也没有被执行过。

3. **结构红项交代不完整**（检查表第 11 问；本轮改动的函数共 157 个，阈值 warn 10、alert 12）
   - 超 alert：
     - `mcp-contract/src/wire.ts:384` `classifyWireEvent`：CC 18，覆盖 88%，CRAP 18.5。
     - `mcp-contract/src/decisions.ts:439` `probeErrorConclusionOf`：CC 11，覆盖 71%，CRAP 13.8。唯一没覆盖的分支是穷尽检查的 `default`。
     - `mcp-host-local/src/session.ts:425` `Session.dispatch`：CC 12，覆盖 94%，CRAP 12.0。
   - 超 warn：
     - `ScriptedTransport.call` 12
     - `concludeProbe` 11.6（没覆盖的是 `legacy-http` 与 `default`）
     - `eventOf` 11.1
     - `StdioLine.readStdout` 11.0
     - `exchangeConclusionOf` 11
     - `httpErrorWireOf` 11
     - `taskReadOf` 10.8
     - `discoverWith` 10.3（没覆盖的是第二次 `retry` 与 `default`，读出来是不可达）
   - 第 1 轮的红项已有改善：`answerWireOf` 与 `tryEnterSse` 已删除，`enterSse` 从 14 降到 8，`dispatch` 从 13 降到 12，`readStdout` 从 12 降到 11。
   - 交付说明第 7 节只列了结构性改动，没有逐条交代上面这些超线项。
   - `session.ts:445` 的真分支没有被覆盖，读出来也到不了：凡是中止 `entry.controller` 的路径都先结算 entry，`:432` 已经提前返回。差分变异会把它报成存活或无覆盖。

4. **第 1 轮裁定要求的 `test:triage`**（检查表第 2、7 问）
   - 有人试跑过：`tmp/closures/w3-mcp-host/fix1/logs/test-triage.log` 是「triage 需要 --run <运行目录>」，ELIFECYCLE 退出 2。
   - 卡评论 6666088522 没有写它没有执行成。裁定原文是「跑不了就写明未执行」。

## 范围外待裁决

1. **`call` 的 `signal` 在授权中触发**：`call` 答 `ok`（SentCall），`answer` 是 `no-answer(abandoned)`，而对端什么也没收到。
   - 探针 Q2c：「call(): {"ok":{"requestId":"r1",…}} {"kind":"no-answer","cause":"abandoned"} | peer saw: []」。
   - 同一阶段被 `close()` 结束时，按 V6 答 `not-sent`，两种结束方式结论不同。
   - 契约 T5 只定了「调用前已触发」答 not-sent 与「发出后触发」答 abandoned，授权中的这段窗口没有定义。T1 又写「调用已发出后，结局经 answer 交出」，而这里交出的 SentCall 等于声称请求已发出。
   - 用例 `session.spec.ts:1330` 钉住了现在的行为。需要契约拥有者定这段窗口。
2. 阻断 2 是否接受成员 SPEC 第 230 行的豁免，见阻断 2。

## 未覆盖

- 全套检查与准入：没有输出。与 `@omne-harness/mcp` 的真实组合没有运行；阻断 1、2 的拆除后果是读 `packages/mcp/mcp/src/internal/table.ts:345-356` 推出来的。
- L3 形式证据（探索器 8 个场景、TLC 的正控与负控）：没有重跑，原件没有读。
- 我没有通读 `session.spec.ts`、`http.spec.ts`、`tests/model/` 全文，只按发现定位抽读。
- 转交 design-reviewer：成员 SPEC V4 与第 230 行的豁免措辞，以及 T5 授权中窗口的条款缺口。
- 转交 qa：验收清单逐条判定。

## 单一决策层（简报第 3 条）

本次范围内成立：
- T8 的归类与结论只在 `decisions.ts` 与 `wire.ts`。
- 会话与脚本化传输都导入它，会话不 parse、不判 `supported`、不判修订。
- `readPeerMessage` 只有会话一个使用方：脚本化传输的对端请求是脚本对象，不读线上文本，所以没有第二份读法。
- 回退是否成立（`heldEndpoint`）留在会话里，这是第 1 轮 N8 裁定允许的。

## 观察（不是发现）

- `cancelRequest` 选「发通知」还是「中止流」的 T5 判断在会话（`session.ts:754`）与脚本化传输（`testing-scripted-transport.ts:687`）各写一次，后者没有 SSE 模式。
- 两个调用方同时调 `close()` 时，第二个立即返回，这时第一个可能还没关完线路（`session.ts:785`）。

## 卡拥有者的裁定（A）

- 阻断 1、2：与 C 的 B1、B2 同一缺陷（A 用真实子进程复现），按「结构根因诊断」改；豁免不维持。
- 非阻断 1（契约原有断言经 `classify` 比较、套件 `deepStrictEqual` 改为 `strictEqual`）：同 E 验收 7 的裁定，例外扩为两类，最终证据与 PR 正文改准。
- 非阻断 2（`stdio-line.ts` 三处分支没有会失败的用例：跨块未换行越界、写被 reject 答 `unsent`、EOF 处无换行的尾行）：改，各补一条用例，并给出让它变红的变异。
- 非阻断 3（超线项）：改或交代。`Session.dispatch` 随结构重做；`classifyWireEvent`（CC 18）按事件种类拆成一张表或各自的函数（Model the Domain）；`probeErrorConclusionOf` 唯一未覆盖的是穷尽检查的 `default`，交代即可；其余超 warn 的逐条在最终证据里写处置。`session.ts:445` 的不可达分支随重做消失。
- 非阻断 4（`test:triage` 没执行成）：最终证据写明未执行与原因。
- 范围外 1（授权中 `signal`）：已由 B B1 的裁定定下（答 `not-sent`）。
- 观察：`cancelRequest` 的判断两处，随 C 非阻断 2 收进契约；两个调用方同时 `close()` 时第二个提前返回：改，`close()` 单飞，重复调用拿到同一次关闭的结果，在线路关完之后返回。
