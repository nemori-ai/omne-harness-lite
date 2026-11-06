# w3-mcp-host 第 3 轮评审（PR #1138，head `720a5d08a`，第 2 轮 head `db06b5b70`）

简报：`mcp-host-r3-briefs.md`。五面 02:25 派出。

## E. 交付边界（general-purpose，sonnet，medium）

W3 本地传输 PR #1138 第 3 轮 E 面（交付边界）报告。head 720a5d08a，工作树干净。

我没有改任何文件。我没有重跑 turbo、慢层和变异，那些读数只认卡上的证据。我自己跑了这几项：head、`git ls-files --eol | grep -c w/crlf`（结果 0）、`src/` 的 `as`/`any`/非空断言/`@modelcontextprotocol` 的 grep（只命中注释与 README 文字）、`git diff 0695f2ba4..HEAD` 在 `src/` 上无改动、契约 `tests/` 的 diff、范围外文件、复用表与用例是否存在。

## 一、验收清单 1–9（第二段）

| # | 判定 | 依据 |
|---|---|---|
| 1 构建、类型检查、测试 | 达到 | 评论 6675177331 §2：turbo 在 `720a5d08a` 上 `Tasks: 19 successful, 19 total`，退出 0，契约 662、mcp 254、host-local 381 通过，日志 `119bd1b5eed21168`。 |
| 2 契约套件（MC3-9） | 达到 | 同评论 §2：stdio first 通过 97、不适用 1、失败 0；streamable-http first 通过 96、不适用 2、失败 0。慢层在 `0695f2ba4` 上跑，之后 `src/` 没有改动（我核了 diff）。不适用集合钉在 `conformance.spec.ts:52` 的 `NOT_APPLICABLE`，带理由。旧 HTTP+SSE 回退单列，计数在 6666088522 §2.2。 |
| 3 stdio 用例（MC3-10） | 达到 | 用例存在，慢层通过。逐条清单在 6666088522 §2.3，是 `db06b5b70` 上的，本轮评论没有重述。变红证据见下文第二节。 |
| 4 HTTP 用例（MC3-11） | 达到 | 同第 3 条，清单在 6666088522 §2.4。`reportRejection` 恰好一次、两种 403、两段授权发现地址、再发与不再发、`x-mcp-header`、会话号与 404、回退的用例都在 `http.spec.ts`。 |
| 5 复用表 | 达到 | 成员 SPEC「与 SDK 的复用关系」（`SPEC.md:120` 起）逐行有决定、违反的承诺、`文件:行`、接入或替代。 |
| 6 凭据不外泄 | 达到 | `http.spec.ts:287` 的用例「the credential value appears in no answer, failure or discovery」在 head 上随 381 通过。 |
| 7 契约 | 未达到，只缺 PR 正文 | 实质成立。`db06b5b70..HEAD` 契约 `tests/` 只有 `decisions.spec.ts` 新增 195 行和 `public-entry.spec.ts` +22/-1（删的一行是注释），没有改原有断言。第 2 轮裁定要求「最终证据与 PR 正文改准」，卡证据 §4 已写。但 PR #1138 正文仍只写「一条按 F4 改写，其余原样通过」。它没有写第二类例外：`wire.spec.ts` 里原有断言经 `classify` 剥去 `message` 后比较，相对基线 `92a8e3cdf` 共 96 行改动。这是第 2 轮留下的同一口径缺口，PR 正文仍待改准。 |
| 8 收尾门禁 | 达到 | §2 表每条有命令、尾行、退出码和哈希：`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`typecheck`、`check:design`。CRLF 为 0，我自跑也是 0。 |
| 9 源码边界 | 未达到，只缺卡上证据 | 产物成立：我在 head 上 grep，`src/` 无 `as`、`any`、非空断言、`@modelcontextprotocol`。但本轮评论没有这个读数。卡上能认的只有 6666088522 §2.9，它是 `db06b5b70` 的，而 `session.ts` 之后重做了。要补成达到，把 head 上的 grep 输出和哈希贴到卡上。 |

## 二、性质及证据义务

| 项 | 判定 | 说明 |
|---|---|---|
| 「用例 → 缺陷 → 变红」表（评论 6675170166） | 部分达到，MC3-10/11 部分未达到 | 表现在有用例全名、变红输出摘录、head 和日志哈希，格式达标，较第 2 轮明显改善。A 节 12 个负控在 `06b98034d` 上重跑，加 B 节第 13 个 `mV1-sends-after-settled`。C 节是 fix2 的 9 条红灯用例，在 `db06b5b70` 的 `src/` 上变红，在新 head 上变绿。这两节达到。问题在 D 节（m10、m11 的 stdio.spec、http.spec 变异）：表头自己写明「引用原日志，未在本闭包重跑」，日志来自第 1 轮 `f04851ce4`，当时的 `session.ts` 之后被 fix2 整体重做。我在 head 的 `session.ts` 里查了 D 节变异的原文，至少这些已经不存在：`first.wire.kind === 'no-answer' && first.wire.resend`（m11-06a/b）、`AbortSignal.any([this.closing.signal, signal])`（m11-05b/c）、`if (this.stdio && PROBE_REQUESTS`（m10-09）、`? 'process-exited'`（m10-03/07）、`params: { ...params, _meta: this.envelope(version) }`（m10-11）、`if (!this.usable) {`（m11-05e）。所以这些变异在新结构上做不出来。D 节证明的是旧代码上用例能变红，没证明 head 上 stdio.spec 与 http.spec 的这些用例仍对对应缺陷变红。要补成达到：在 head 上重做这些变异（或等价变异）并把摘录贴到卡上，或由卡拥有者裁定旧日志仍然有效。 |
| D.2 没变红的 12 条 | 未达到（无处置） | m10-05 系列六条是防御纵深，已有裁定。另外 m11-01c、m11-05d、m11-05f、m11-05g、m11-05h、m11-09a 在表里写「没有变红……本表不重新判断」。我在卡上没找到这六条的处置：等价变异的理由，或补用例。 |
| 不重发 | 达到 | `http.spec.ts` 的再发与不再发用例存在并通过。 |
| 进程归落点 | 达到 | 复用表「`StdioClientTransport` 不复用」一行，加 H3、H6、H10。 |
| 异步副作用有上界、测试后无遗留 | 达到 | 评论 §2 说明每个等待点受 `signal` 与 `close()` 管辖。第 2 轮缺的两项补上了：慢层 8 个 skipped 说明为快层的 8 条用例被标签过滤排除，`test:triage` 写明未执行及原因（需要 `--run` 目录）。 |

## 三、第 2 轮 E 面未达到项复核

- 第 7 条：实质已消除，PR 正文口径仍未改，见上，仍未达到。
- 「用例 → 缺陷 → 变红」表：用例名列和摘录补齐了，A、C 节达到。D 节在重做后的 head 上失效，D.2 无处置，仍未达到。
- 慢层 skipped 的说明：已达到。

## 四、冲突项（给调度者，不是达到或未达到）

以下前五项是追加记录与卡文的冲突，卡正文没有同步，其中 1、2、4 的「波末写回」与第 2 轮同。后三项是第 3 轮新增，卡拥有者可以采纳或裁定。

1. 卡正文 `additive`、验收 7「原样通过」、停止条件「破坏性契约改动」，与 Q1（F4 改写 `wire.spec.ts` 一条）和第 2 轮 E 的两类例外冲突。
2. 卡正文 W3 行「只用官方 SDK 2.3.1 的 Transport 层」与 I-04「官方 TypeScript SDK 2.3.1」，与 Q2（HTTP 线路自写）、自裁 1（产品源码不导入 SDK）、Q6、现行 2.4.0 冲突。
3. 闭包规格已定事项 1「指不出的就复用」「自写部分用 SDK 导出的常量与 schema」，与第 1 轮裁定 3 和自裁 1 冲突（规则归契约，不复用 SDK 的 schema 与序列化）。
4. 闭包规格已定事项 36 与 MC3-10 首项「非 JSON 行 → `stream-broken`」，与 Q1 F4（丢弃，只有超 16 MiB 才断流）冲突。波段规格 `waves/w3/mcp/spec.md` 的 MC3-10 一行还没同步。
5. 目标边界「用真实 SDK 服务端夹具跑 `mcpTransportConformance()`」与卡 C4，与 Q3、Q11 冲突：套件跑在 A 层自写对端，SDK 互通由 B 层证明。
6. 闭包规格写范围未列 `packages/mcp/mcp-host-local/vitest.config.ts`（`package.json` 只许改 `exports`、`files`、`scripts`）。fix2 改了 `vitest.config.ts`，把 `tests/unhandled.ts` 挂成 setup 文件，这是第 2 轮裁定采纳的设计问题 (2)，但闭包原范围里没有这个文件，需要事后纳入。另外 `package.json` 的依赖段改动由 reduce 做，范围内成立。
7. 第 2 轮裁定「`close()` 不再等授权发现」修订了第 1 轮已采用规则，闭包规格「授权发现」条款与契约 T5、T9 的新句子同步。我在 docs2 的追加记录里没找到卡文冲突，只提醒卡正文的验收 4「授权发现的两段 URL」措辞不变，不冲突。
8. 评论 6657905811（第一段）「未覆盖」里的「H12 没有能变红的用例」，被 6666088522 更新为「H12 后半成立、H13、H14 现在有用例」。后者晚于前者，是更新而非冲突，但 6657905811 没有标注已被取代。

子代理的「达到」不是接受。父会话至少保留这几项：验收 7 的 PR 正文、验收 9 的 head 上 grep 证据、D 节变异在 head 上的重做或裁定、D.2 六条无处置的存活变异、冲突项 6 的范围纳入。


### 卡拥有者对 E 的处置

- 验收 7：PR #1138 正文已改准（两类例外都写出），并补了第 2 轮之后结构重做的说明。
- 验收 9：在 `720a5d08a` 上跑了源码边界的 grep（`gates-r3/greps.log` `024d26f4f1b5a2ee`）：两个成员 `src/` 的类型断言、`any`、非空断言都是 0（契约一处命中是字符串 `'as written'`），host `src/` 导入 `@modelcontextprotocol` 0 处，`dist` 的声明文件 0 处。随第 3 轮的处置一起贴卡。
- 红灯表 D 节与 D.2：裁定如下（D 面交回后更正，见「卡拥有者对 D 的处置」）。第 1 轮的 m10、m11 是对第 1 轮 `src/` 的手工变异。`session.ts` 第 2 轮之后整体重做，落在它上面的那些变异原文已不存在，不再复跑；D.2 的六条（m11-01c、m11-05d、m11-05f、m11-05g、m11-05h、m11-09a）随之作废。`http-line.ts` 自 `2e4659c8f` 起没有改动，D.1 里落在它上面的 `m11-06c`、`m11-06d`、`m11-06e`、`m11-09e` 对现行代码仍成立，fix3 把它们转成可复跑的负控。现行代码上用例的变异强度由入库的负控（13 个，fix3 增补）、TLA 的 14 个有效动作变异与红灯表现行各节承担；第 3 轮差分变异测量无效，按产品语义的簇当线索用，不逐个处置。红灯表保留 D 节作为历史，并标明哪些行仍对现行代码成立。
- 冲突 6（`vitest.config.ts` 不在原写范围）：事后纳入，依据是第 2 轮 C 设计问题 (2) 的裁定（守卫改为 setup 文件）。
- 冲突 1–5、7：维持，波末写回。冲突 8：波末在评论 6657905811 顶部注明已被 6666088522 更新。

## C. 设计与实践（general-purpose，opus，high）

范围是 `db06b5b70..720a5d08a` 里两个成员的 `src/` 与 `tests/`（含 `tests/model/`）。判据用 ub-mode、`pstack:typescript-best-practices`、`docs/defensive-patterns.md`，以及 `layers-and-dependencies.md`「方法依据与采用范围」。工作树里没有改任何文件。

探针放在工作树之外：
- 本轮新写的在 `/tmp/c-r3-probe/` 下：`scripted.mts`、`scripted-close.mts`、`session-ended.mts`。
- 第 2 轮的探针在 `reviews/mcp-host-r2-probes-c/` 下。
- 运行方法：在 `packages/mcp/mcp-host-local` 或 `packages/mcp/mcp-contract` 目录执行 `node --conditions=source <脚本>`。

## 结论：第 2 轮结构根因是否在结构上消除

三条根因在 `Session` 与 `StdioLine` 上都已在结构上消除。但目标结构第 3 条只做了一半，留下了本轮的阻断 B1。

- **根因 1（调用方跟着工作流走）：已消除。**
  - 在途项的 `answered` 与 `departed` 在任何 `await` 之前就建好；`once` 与 `call` 只等这两者。
  - 授权、写出、读应答、拒绝报告与取回，都经 `work` 成为会话拥有的后台工作。
  - 没有在途项的交换（`legacyPath` 的 `notify`、`enterSse`、`refusedGet`）经同一个辅助 `untilClosed` 受 `close()` 管辖。
  - 第 2 轮探针在新 head 上复跑：
    - `authz.mts`：`call after signal: {"failure":{"kind":"not-sent","cause":"connection-unavailable"}}`；`close()` 之后 `listActions` 同样答 `not-sent`。
    - `writing.mts`：`closed 2 ms`。
- **根因 2（线路的写状态不是数据）：已消除。**
  - `StdioLine.writes` 是在途写的计数；新增的 `closing` 信号让仍在等管道的 `send` 答 `aborted`。
  - 用例：`lines.spec.ts`「two overlapping writes, the first completes, then close()」，负控 `mStdio-writes-boolean`。
- **根因 3（形式守护量错了层）：已消除。**
  - 探索器的 V4（`unsettledAfterStop`）观察的是调用方的 promise；`hang` 成为凭据句柄两个方法与元数据取回的一种答复；`authorizing` 的豁免已删。
  - V6（`stopAnswers`）在 `signal` 触发与 `close()` 两个时刻各记一次相，再断言结局。
  - TLA 的 V4 断言调用方状态 `cw`，并有 `caller-waits-workflow` 缺陷与两份负控 cfg。
  - 探索器只经端口账本观察，`phaseAtStop` 读的是挂起的端口调用，不读会话内部，所以不改变被测行为。
- **没有做完的一半：目标结构第 3 条的「每次调用端口之前同步核 `usable`」仍是手写约定，不是结构。**
  - `work` 只承担了「意外的 reject 按相结算」。
  - 「授权 → 再核 `!this.usable`」在 `respond`、`notify`、`enterSse` 各写一份。
  - `sendOut` 把第 2 轮 `send` 里的 `!this.usable` 再核换成了 `inFlight(entry)`。只有当每一次转入不可用都结算授权中的在途项时，两者才等价，而 `die('session-ended')` 不结算。阻断 B1 就出在这里。

## 阻断

**B1. S07（会话结束）之后，授权中的请求仍被写上线路，`call` 交出 `SentCall`**（`Session.die`、`Session.sendOut`）

- **位置：**
  - `die` 对 `session-ended` 提前 `return`（`if (cause === 'session-ended') return`），授权中的在途项不被结算。
  - `sendOut` 在 `authorize` 之后只核 `this.inFlight(entry)`，不核 `usable`。
- **探针 `session-ended.mts`：** 旧 Streamable HTTP 会话。`listActions` 收到 404，`call` 的第 5 次授权被扣住，到 404 之后才放行。输出：
  ```
  listActions {"failure":{"kind":"not-sent","cause":"session-ended"}}
  tools/call reached the line after session-ended: 1
  call: {"ok":"r4"}
  a later listActions: {"failure":{"kind":"not-sent","cause":"connection-unavailable"}}
  ```
- **违反的判据：**
  - 契约 T8 S07「传输不再可用」。
  - 成员 SPEC「身份与状态」对 `dead` 的定义。
  - 成员用例组 `session.spec.ts:1425` 的标题「a session that cannot be used any more sends nothing and asks no credential」。
  - T5 的相模型：请求还没交给线路，不应交出 `SentCall`。
  - ub-mode「Fix Root Causes」与 DP-10（结构换了，相邻路径没有核对）。
- **性质：回归。** 第 2 轮 `send` 有这条再核，注释是「It may also have died while authorizing」。本轮重做后它消失了，没有用例变红：`:1490` 只覆盖共用流断开，不覆盖 S07。
- **结构上的改法（一处）：**
  - `die` 对所有原因都把 `authorizing` 的在途项结算为 `NOT_SENT`；只有 `sent` 一支按原因区分，`session-ended` 时保持不动。
  - 这样 `inFlight` 成为唯一的再核点，`dead` 和 `signal`、`close()` 一样只是又一种「停」。随后可以收掉 `respond`、`notify`、`enterSse` 里手写的 `!this.usable`（见非阻断第 4 条）。
  - 补一条用例：照 `:1490` 的写法，用 `SESSION_SCRIPT` 加 `'tools/list': [status(404,'gone')]`，扣住第 5 次授权。再加一个负控：恢复 `die` 的提前返回。
- **交卡拥有者裁定措辞（不归 C 面）：** S07 之后的新请求，本实现答 `connection-unavailable`（探针最后一行）。契约 SPEC 第 365 行对 `session-ended` 的说法可以读成后续请求也答 `session-ended`，需要对齐。

## 待卡拥有者裁定（我倾向非阻断，但必须二选一）

**P1. 契约的脚本化传输没有兑现本 PR 新加的 T5 句子；套件也测不出来**（`mcp-contract/src/testing-scripted-transport.ts` 的 `call`、`once`、`close`；`src/testing-transport.ts:2229` 的用例）

- **成因：**
  - `ScriptedTransport.call` 与 `once` 先 `await this.authorize(id)`，再由 `dispatch` 登记，这正是第 2 轮根因 1 的形状。
  - `close()` 一律结算为 `ABANDONED`，不按相区分。
- **探针输出：**
  - `scripted.mts`：
    ```
    hanging-authorize call after signal: pending after 500ms
    slow-authorize call after signal: SentCall answer={"kind":"no-answer","cause":"abandoned"}
    slow-authorize peer received: ["request:tools/call"]
    ```
  - `scripted-close.mts`：`close returned; listActions: pending after 500ms`。
- **与契约的冲突：** 契约 SPEC 第 100 行与 T5 正文要求：授权中 `signal` 触发答 `not-sent`，对端没见过请求；`call` 不等凭据句柄。
- **套件为什么测不出：** 唯一的相关用例「a call still being authorized when close() ran…」在 `close()` 之后先 `open()` 了闸门，正是第 2 轮 C 对 `session.spec.ts:1148` 指出的模式。所以 T5 在契约套件这一层仍「量错了层」，套件不能替任何宿主证明 T5。
- **违反的判据：**
  - 第 2 轮裁定 C 非阻断第 2 条（「两个传输共用的规则各一处实现」）：相 → 结局的规则（`Session.stopAnswerOf`）只在会话里，契约里没有。`properties.ts` 与 TLA 里的那两份是有意的预言副本，不算在内。
  - Laziness「One decision lives in one place」。
  - DP-10（规格、参考实现与证据不一致）。
- **为什么倾向非阻断：** 契约 SPEC 第 665 行把它定为测试替身，不是 host-local 的传输；本工作树里也只有契约自己的用例消费它。
- **拥有者要选一条：**
  - (a) 契约导出相 → 结局的规则；脚本化传输改为先登记再授权、按相结算；套件补一条闸门永不放开的 T5 用例。
  - (b) 在契约 SPEC 写明脚本化传输与套件对 T5 的覆盖边界，交 B 或 E 面落句。

## 非阻断

1. **`Session.work` 丢掉了原因**（`.catch(() => { if (entry !== undefined) this.stop(entry) })`）。
   - 会话自身的缺陷与一次 `signal` 在结局上分不开；没有在途项的工作出错时，整条原因静默消失。
   - 判据：DP-06「错误去向」、DP-01「原错误写进诊断」、typescript-best-practices「Structured telemetry」。
   - 按相结算是第 2 轮已裁的做法，保留；但应留下原因（例如注入一个诊断端口，或至少让用例可观察）。
2. **`Session.refusedGet` 伪造了一个 `WireContext`**（`id: ''`、`request: 'initialize'`），只为借用 `classifyWireEvent` 与 `concludeAnswer` 判断 GET 的状态。
   - 这和第 2 轮 NB1 已修掉的 `causeOfEnded` 是同一种做法。
   - 判据：Boundary Discipline、「一个决定一处」。
   - 建议契约导出「GET 状态按 `initialize` 归类」这条规则（例如 `getStatusConclusionOf`）。
3. **`Pending` 仍有可选字段袋。**
   - `stream?`、`cancelProbe?` 只在 `sent` 相才有意义，却挂在 `Phase` 之外；`phase` 是可变槽，由 `sendOut` 与 `enterDiscovery` 赋值。
   - `authorized` 恒等于 `this.credential !== undefined`（`makeEntry`；`enterSse` 里也同样计算）。于是 `refusalOf` 里的 `credential !== undefined && authorized` 是同义反复，会让读者以为存在「有句柄而未授权就上线」的情形。
   - 判据：typescript-best-practices「Discriminated unions / no optional-field bags」、Subtract Before You Add。
   - 建议改成 `Phase` 的 `sent` 变体带 `release?`；删掉 `authorized`。
4. **「授权 → `!this.usable`」在 `respond`、`notify`、`enterSse` 手写了三份。** 这是上面「没有做完的一半」的残留。B1 改好之后，可以让 `work` 或一个 `authorized(headers)` 辅助统一承担。判据：Laziness「One decision lives in one place」。
5. **`classify` 不看相。**
   - `onEvent` 的 `line` 分支把每一行对全部在途项归类，包括 `authorizing` 相。请求号可以预测（`r1`、`r2`…），对端对一个还没写出的请求号作答，就会把它结算掉；对一个 `call`，结果是交出 `SentCall`，而请求从没离开。
   - 这是读出来的，没有执行：stdio 上的窗口只有一个微任务，SSE 模式下窗口是整个授权。
   - 判据：Model the Domain（相已经是判别联合，却没有用来限定哪些事件可以作用于它）。
   - 建议 `classify` 只对 `sent` 相生效。
6. **`consume` 的 `try` 范围过宽**（这种写法第 2 轮已有，本轮重写时保留了）。
   - `classify` 与 `concludeAnswer` 的「不该发生」型 `TypeError`（`messageOf`、`resultWireOf`、`partsOf`、`httpErrorWireOf`）会被当成正文中断，归入 `http-aborted`，读类请求因此会经 D15 再发一次。
   - `pump` 也一样：`onEvent` 里抛出的缺陷会让读循环永久停止，而且不调用 `die`。
   - 判据：DP-01「未知错误不能兜底映射」。
   - 建议 `try` 只包住对 `exchange.messages`、`line.events` 的迭代。
7. **`startAuthorizationDiscovery`（契约 `authorization.ts`）对同步抛出与 reject 处理不同。**
   - `fetchMetadata(url, signal).catch(...)` 接不住同步抛出：整个循环 reject，后面的地址不再取。
   - 用例「a workflow that fails unexpectedly…」变绿，靠的是 `work` 的兜底，而不是 R4 的「取不到算没取到」。
   - 改法：`Promise.resolve().then(() => fetchMetadata(url, signal))`。
8. **并发用例靠计时与有界自旋排次序，不用 deferred 或 `reached`。** 位置：
   - `session.spec.ts` 新增组「the caller waits on the settlement…」里的 `for (round < 50 && credential.rejections() === 0) await tick()`。
   - 「close() settles a discover that waits to authorize the fallback GET」里的 `for (round < 20) await tick()`，后面接一个缺席断言 `line.sseAttempts`。
   - 「close() settles a request in the authorization discovery…」里的 `setTimeout(60)`。
   - 多处 `settledWithin(x, 30) === 'pending'`。
   - 都不算错，但在慢机器上可能误报，也偏离了简报要求的排序方式。
   - 建议端口替身在被调用时兑现一个 `reached` deferred。
9. **`tests/model/mutate.ts` 把变异直接写进工作树的 `src/`，跑完再写回。**
   - 进程被 SIGKILL 或中断时 `finally` 不执行，源码会留在变异状态。
   - 期间同一棵树里的其他读者（IDE、其他测试或检查）会读到变异体。
   - 结尾的「已还原」核对只检查 `find` 文本是否出现，不比较字节。
   - 判据：ub-mode「If a concurrent writer would matter, do not share state」。
   - 建议在临时副本或覆盖目录里变异，结尾按字节比较。
10. **契约 `ConnectionView` 仍是 `{kind, version, mode?: 'sse'}`**，可以写出 `{kind:'stdio', mode:'sse'}`。会话内部的 `Connection` 已经是判别联合，投影成契约的视图时又放宽了。归 0.1.0 形状项。
11. **琐碎：** `mcp-host-local/src/authorization.ts` 文件头写「the session runs the contract's `discoverAuthorization`」，实际调用的是 `startAuthorizationDiscovery`。

## 契约拆分是否内聚、一条规则是否一处

- 按 grep 结果，新导出各只有一处实现，会话与脚本化传输都用它们：
  - `composition.ts`：请求组成、`requestMetaOf`、`callRequestOf`、四个任务请求。
  - `answer-readings.ts`：读法。
  - `discovery.ts`：`discoverWith`。
  - `authorization.ts`：`startAuthorizationDiscovery`，`discoverAuthorization` 是它的薄包装。
  - `wire.ts`：`endedCauseOf`、`WIRE_LIMITS`。
- 「旧修订」只有 `isLegacyConnection` 一个定义。`readInitializeResult` 保证旧一路只接受旧修订，所以会话里的 `legacy` 种类与这个定义一致。
- `limits.ts` 与 `authorization.ts` 不再复制上限。
- 例外有三项：
  - T5 的相规则，见 P1。
  - `decisions.ts` 仍混着两样不属于 T8 的东西：按连接的规则（`ConnectionView`、`checksListingHeaders`、`cancelsByNotification`），以及带端口的编排 `withOneResend`。按第 2 轮裁定的四组划分，后者应归 `discovery.ts` 那一组。
  - `composition.ts` 从 `decisions.ts` 取 `RequestMethod`、`METHOD_NOT_FOUND`、`OFFERED_LEGACY_VERSION` 这些组成用的词。
- 这三项都不阻断。

## 未覆盖

- 没有通读 `http.spec.ts`、`stdio.spec.ts`、`memory-line.ts`，以及 TLA 里不变式之外的动作。纯移动提交 `9ae28f6e6` 没有核，归 A 面。
- 没有用真实子进程复现，B1 与 P1 都是在内存线路或脚本化对端上复现的。
- 没有跑 `lint:deps`、metrics 与变异（归 A、D 面）。D 面的 stryker 沙盒正在这棵树里运行，我没有碰它。
- 非阻断第 5 条只是读出来的，没有执行。


### 卡拥有者对 C 的处置（A、B、D 交回后与它们一起进一次集中修复）

- 结论：第 2 轮的三条结构根因在 `Session` 与 `StdioLine` 上已在结构上消除（第 2 轮探针在新 head 上复跑：`authz.mts` 答 `not-sent`，`writing.mts` 2 ms 关闭）。
- **B1（S07 之后授权中的请求仍上线路）：改。** 判定成立，是重做时丢掉的再核，属于回归，类别与前两轮的「等待点不受管辖」不同。修法按 C 给的一处：`die` 对一切原因都把 `authorizing` 的在途项结算为 `not-sent`，只有 `sent` 一支按原因区分；`inFlight` 成为唯一的再核点。补用例（`SESSION_SCRIPT` 加 404，扣住授权）与负控（恢复 `die` 的提前返回）。S07 之后新请求答 `connection-unavailable` 与契约 SPEC 对 `session-ended` 的读法：契约写明「会话结束的那次请求答 `session-ended`，之后的请求答 `connection-unavailable`」。
- **P1（脚本化传输没有兑现 T5 的相规则，套件测不出）：选 (a)，改。** 理由：脚本化传输随契约的 `./testing` 入口发布，不只是契约自测的替身：`@omne-harness/mcp` 的用例替身（`tests/doubles/ports.ts`、`world.ts`）、`memory-store.spec.ts` 与探索器（`tests/model/explore.ts`）都用它搭世界（父分支 `9b60aad9e` 上 `grep` 核过，MCP 组之外没有消费者）。参考替身违反本 PR 新加的 T5，会让调用口的取消路径测得不真实，也让套件不能替第三方传输证明 T5。做法：契约导出「相 → 结局」的规则，会话与脚本化传输共用；脚本化传输先登记再授权、`close()` 与 `signal` 按相结算；套件补一条闸门永不放开的 T5 用例（`call` 的 `signal` 与 `close()` 各一）。消费者的用例要跑：本分支上的 `@omne-harness/mcp`，以及调用口合入、host 同步父分支之后再跑一次。（更正：先前这里写的四个包是模型契约同名替身的消费者，与本替身无关。）（再更正，05:28：上面列的 `ports.ts`、`world.ts`、`memory-store.spec.ts`、`explore.ts` 只用契约 `./testing` 的内存替身，不用脚本化传输，fix3 写者的消费者核对是对的。脚本化传输的真实消费者在调用口分支：`tests/doubles/peer.ts` 经 `createScriptedTransportFactory` 给调用口用例搭对端。改法 (a) 与「host 同步父分支之后再跑一次」都不变，后者正好覆盖这个组合。）
- 非阻断 1（`work` 丢掉原因）：改。会话加一个缺陷出口（`SessionOptions` 注入，缺省在 Promise 之外抛出、让宿主的未捕获处理看到，与 `@omne-harness/mcp` 的作用域 `afterExit` 同形）；按相结算照旧。
- 非阻断 2（`refusedGet` 伪造上下文）：改，契约导出 GET 状态按 `initialize` 归类的规则。
- 非阻断 3（`Pending` 的可选字段袋、`authorized` 同义反复）：改。`stream`、探测计时的取消随 `sent` 相；删 `authorized`。
- 非阻断 4（「授权 → 再核」三份手写）：改，B1 之后收成一个辅助。
- 非阻断 5（`classify` 不看相）：改，只对 `sent` 相生效；补一条对端对未写出的请求号作答的用例（SSE 模式）。
- 非阻断 6（`consume`、`pump` 的 `try` 过宽）：改，`try` 只包迭代；`onEvent` 的缺陷走第 1 条的缺陷出口。
- 非阻断 7（`startAuthorizationDiscovery` 接不住同步抛出）：改。
- 非阻断 8（用例靠计时与自旋排次序）：改为端口替身在被调用时兑现 `reached`；改不了的逐条说明。
- 非阻断 9（`mutate.ts` 写进工作树的 `src/`）：改。在临时副本里变异；做不到就在原地变异但开工前要求工作树干净、收到中断信号也还原、结尾按字节比较。
- 非阻断 10（契约 `ConnectionView` 能写出非法组合）：改。它是本 PR 新加的根导出，没有外部消费者，直接写成判别联合。
- 非阻断 11（`authorization.ts` 文件头）：改。
- 契约拆分的余项（`withOneResend` 归编排一组、按连接的规则与组成用词的位置）：改，纯移动单独提交。

## B. 表达（design-reviewer，expression，opus，xhigh）

本次做的是「表达」判断。判据页只读了 canonical 源 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`。

**评审对象、范围与完成程度**
- 对象：PR #1138，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`。head 是 `720a5d08a`，已用 `tmp/closures/w3-mcp-host/gates-r3/head.txt` 核对。第 2 轮 head 是 `db06b5b70`。
- 我没有 git，所以不能把哪一行归到本轮。做法有三条：
  - 第 2 轮的结论以 `reviews/mcp-host-r2.md` 的原句为准。
  - 简报清单里的文件，我按现文全部读完。
  - 契约 SPEC 只读 T1–T9、R4、三张裁定表、三个入口、组合与验证，以及 `docs/public-api.md`。
- 卡评论 6675177331：用公开的 GitHub 页面只读到了一部分。第 1 节的提交清单只拿到尾段，归属是：fix2 共 7 个；formal2 共 4 个，加合并 `06b98034d`；docs2 共 3 个（`3ff69c68d`、`6775998d3`、`a31a05ee7`）；调度者 1 个（`720a5d08a`）。compare 页 `06b98034d...720a5d08a` 列出 4 个提交，主题都是 `docs(mcp-host-local)` 或 `test(mcp-host-local)`，页面没有列出改了哪些文件。
- 工具输出：简报附了 `gates-r3/check-docs.log`（PASS: 2738 Markdown files）与 `gates-r3/check-design.log`（PASS）。我没有重跑。这两项只核链接、镜像与拥有者，不核锚点指向的条款对不对，也不核语义。

**结论：本次表达与规范范围内未发现阻断问题。**

---

## 阻断

无。

## 非阻断（按影响排序）

**NB-1　线路级断开对「授权中」请求的结局：契约与成员文档给了两种答法（与第 2 轮 B1 同类，触发面窄）**
- 类别：跨契约一致、可实施性、形式对应。
- 位置与原句：
  - 契约 `SPEC.md:513`（T8 SSE 段）：「共用的流结束或断开是每个在途请求的流断开：读类与写类都 `no-answer`（`stream-broken`）…传输不再可用」。S01–S04（`:563-566`）同样不分相。
  - 契约 T5 `:484` 在本轮把「在途」明确为包含「已登记、还没有交给线路」的请求。
  - 成员 `docs/flows.md:52`：「GET 流结束或断开 ──► 'broken' ──► 所有在途请求 no-answer (stream-broken)」；`:59`：「会话把所有在途请求答 `stream-broken` 或 `process-exited`」。
  - 成员 `verification/README.md:36`：「线路级的断开经 `die` 结算 `sent` 相的项…`authorizing` 相的项当场答 `not-sent`」。
  - 实现 `src/session.ts:332-333` 与 `:36` 一致；授权发现中的项不动。
  - 成员 SPEC 正文没有写按相处理：所有权一节 `:174`、`:191`，H9 `:96`「`die` 结算在途请求」。
- 证据也不覆盖这一段：
  - TLA 的 `Broken(r)`（`.tla:188-190`）要求 `wf[r]="line"` 且 `st[r]="sent"`，没有建「线路断开时结算授权中的项」。所以 `:36` 把这一支映射到 `Broken(r)` 是映射过宽。
  - 探索器的 V6（`tests/model/properties.ts:268-288`）只看 `signal` 与 `close()`。
  - `sse-fallback` 场景（`tests/model/scenarios.ts:156-172`）带句柄、`lineEnds: ['broken']`，可能走到这条交错，但没有性质断言它的结局。这一点是读出来的，没有运行验证。
- 依据：表达页的「跨契约一致」「可实施性」；T1 `:452`「`no-answer`，请求已离开」；第 2 轮 B B1 的裁定理由（对端没见过的请求不能读成已离开）。
- 触发场景：旧 HTTP+SSE 模式、材料带凭据句柄，某个请求的 `authorize` 还没返回时，共用的 GET 流结束或断开。stdio 上授权中只持续一个微任务，实际到不了。
- 后果：照契约字面实现的传输会对一个对端从未见过的 `call` 交出 `SentCall` 与 `no-answer(stream-broken)`，调用方还可能对它 `cancelRequest`，这正是第 2 轮 B1 的形状。本成员的代码答 `not-sent`，它自己的 `flows.md` 写的却是另一种。方向偏保守，触发面窄，所以判非阻断。
- 作者需明确：
  1. 契约 T8 的 SSE 段与 S01–S04 写明：线路级断开只对已交给线路的请求给出流断开；授权中的请求按 T5 同形答 `not-sent`（`connection-unavailable`）；授权发现中的请求按 T5「先到者定」保持 `authorization-required`。
  2. 成员 SPEC 所有权一节补这一句，并改准 `flows.md:52`、`:59`。
  3. `verification/README.md:36` 去掉对 `Broken(r)` 的这层映射（或让模型建出这一支），并写明这一结局没有性质断言（或补一条用例或性质）。

**NB-2　元数据取回收不收 `signal`：成员 SPEC 三处说法互相冲突**
- 类别：表达歧义（字面冲突）、形式对应。
- 位置与原句：
  - 成员 `SPEC.md:232`：「凭据句柄的 `authorize`、`reportRejection` 与元数据取回不收 `signal`，可以一直挂着。」
  - 同页 H11 `:104`：「授权元数据的取回受三样约束：请求的 `signal`、传输的关闭（两者合成一个 `AbortSignal` 交给 `fetchMetadata`）…」。
  - `verification/README.md:71`：「带 `signal` 的端口调用（线路的 `send`、`openGet`，元数据取回）在 `signal` 触发时当即收场」。
  - 契约的 `MetadataFetch` 是 `(url, signal)`。
  - 另外，`:181`：「`signal` 结束元数据的取回…；拒绝报告与取回在后台继续到结束，结果丢弃」。读不出 `signal` 之后是否还会按 R4 去取下一个候选地址（根地址）。
  - V1 `:238` 的可观察形式只列「再发请求、再调用凭据句柄」；探索器 V1（`properties.ts:94-108`）还把「为已结算请求做的元数据取回」算作违例。
- 依据：表达页的「表达歧义」「形式对应」。
- 后果：照 `:232` 实现会不传信号；照 `:181` 实现会在信号之后继续取根地址，探索器的 V1 就会变红。SPEC 的定理与探索器量的不是同一件事。
- 作者需明确：
  - `:232` 改成「元数据取回收到 `signal`，会话不依赖它遵守」。
  - `:181` 写明信号之后不再发起新的取回，已发起那一次的结果丢弃。
  - V1 的可观察形式补上元数据取回，与 `properties.ts` 一致。

**NB-3　「线路挂起不改变 `close()` 的结算」说过了头；「调用方只等在途项」也不全**
- 类别：表达歧义，以及进展性质的前提没写。
- 位置与原句：
  - 成员 `SPEC.md:232`：「承诺：调用方能看到的每一个等待（…、`close()`）在 `signal` 触发或 `close()` 之后结算，凭据句柄、元数据取回、线路或对端挂起都不改变这一点。」`docs/architecture.md:36` 是同一句：「凭据句柄、元数据取回、线路或对端挂起都不让调用方等」。
  - 对照的原句：
    - 成员 `:187`「只等线路的 `close()`」。
    - V4 `:241`「`close()` 在线路的 `close` 答复之后返回」。
    - 契约 T5 `:484`「`close()` 不等凭据句柄、元数据取回或对端：它们挂起时也在线路关闭后返回」。
    - TLA 的 `V4_CloseBounded` 不要求 `closeDone`；探索器的 `closeOrder` 只核次序。
  - 自定 9 `:51`：「会话的调用方只等在途项的结算，不等工作流」。但 `:175` 写了 `discover`「另有两处在关闭之下等待、到期即收场的交换」，这两处交换没有在途项。「到期」也没有对应的时限，实际意思是「关闭时」。
- 依据：表达页的「表达歧义」；「有前提的进展性质，前提要同时写在配置与正文」。
- 后果：读者会以为线路的 `close()` 挂起时会话的 `close()` 照样返回。实际上它的上界依赖线路自己的关闭（stdio 按 H6，HTTP 线路中止全部交换），而这一点没有写成前提。
- 作者需明确：
  - 承诺句把 `close()` 单列，写成「只等线路的 `close()`」，并把「线路的 `close()` 会答复」写成 V4 对 `close()` 的前提，归线路端口的义务。
  - 自定 9 补上 `discover` 的两处例外，或改为指向 `:175`。
  - 「到期即收场」改为「关闭时收场」。

**NB-4　契约裁定 11 的闭合句又不成立了（第 2 轮 NB5 的残留）**
- 类别：完整性、引用与归属。
- 位置与原句：契约 `SPEC.md:99`：「连同第 1 条，这些是本表里改变传输行为的条款；其余只加导出、字段或条款。」
- 依据：
  - 第 12 条（`:100`）改了 T5 的结局。第 2 轮的 T5 原文是「关闭时在途的请求答 `no-answer`（`abandoned`）」，不分相；授权中触发 `signal` 时，第 2 轮的代码答 `abandoned`。这是行为改动。
  - 第 13 条约束了传输的出站头。
  - 第 2 轮的裁定 NB5 要求删改这类全称句。
- 后果：读裁定表的人，包括依据第 12 条的调用口 WF5，会把第 12 条读成「只加条款」。
- 作者需明确：改写闭合句，把第 12 条（以及第 13 条，如果算行为改动）列进行为改动。

**NB-5　契约根导出有两份清单，且不一致**
- 类别：引用与归属（一份现行源）。
- 位置：
  - 契约 `SPEC.md:112`「三个入口」的 `.` 行没有列裁定 14 的导出：`requestMetaOf`、`callRequestOf`、`listActionsRequest`、`getTaskRequest`、`getTaskResultRequest`、`updateTaskRequest`、`cancelTaskRequest`、`isLegacyConnection`、`checksListingHeaders`、`cancelsByNotification`、`withOneResend`、`streamGoneAnswerOf`、`authorizationRequiredAnswerOf`、`startAuthorizationDiscovery`、`endedCauseOf`、`WIRE_LIMITS`，以及类型 `ComposedRequest`、`RequestValues`、`ConnectionView`、`AuthorizationDiscoveryRun`。
  - 这些都在 `docs/public-api.md:26-33` 与 `src/index.ts:100`、`:118-120`、`:137-148`、`:165-178` 里。
  - 契约 `docs/public-api.md:11` 写「五个符合性套件与各自的内存替身（传输的是 …）」；SPEC `:114` 写「五个需求端口与传输的符合性套件」；`src/testing.ts` 导出 6 个套件。
- 后果：按 SPEC 表核对根导出的人，会把这些导出判为没有登记。
- 作者需明确：`.` 行或者补齐，或者改为指向 `public-api.md` 或 `tests/public-entry.spec.ts`，只留一份清单。`public-api.md:11` 的数目改准。

**NB-6　契约「未覆盖」没有登记本轮新增的 T5、T9 义务**
- 类别：完整性、形式对应（条款→验证）。
- 位置：契约 `SPEC.md:701-708`。手写用例只列了「授权中被关闭的调用」（套件 `src/testing-transport.ts:2229`）。下面四项既不在手写用例里，也不在「没有手写用例」的清单里：
  - 授权中触发 `signal` 答 `not-sent`；
  - 授权发现中触发 `signal` 或 `close()` 答 `authorization-required`，并带已取到的部分；
  - `close()` 不等挂起的句柄或元数据取回；
  - T9 的元数据取回不带凭据头。
- 依据：第 2 轮裁定 8 的口径是「契约套件不补，host 自有用例」。成员一侧确实有用例：`session.spec.ts:1072`、`:1383`、`:1590`、`:1704`。
- 后果：契约的读者分不出这些义务有没有证据，也不知道证据在哪里。
- 作者需明确：照 `:707` 的写法，把这四项列进「没有手写用例」，并指向 `@omne-harness/mcp-host-local`。

**NB-7　契约用「交给线路」来分结局，但契约里没有定义它**
- 类别：可实施性、表达歧义。
- 位置：
  - 契约 T5 `:479`、`:484`，裁定 12 `:100`，裁定 10 `:98`。「线路」与「交给线路」只靠括注「（授权中）」解释。
  - T1 `:452` 把 `no-answer` 定义为「请求已离开」，而 T5 把「已交给线路、未必已离开」的请求（HTTP 连接还没建立、stdio 写还没完成）也答 `no-answer`（`abandoned`）。
- 后果：第二个传输实现（例如写端串行排队，或有另一个出发前步骤）会不知道分界在哪，两个实现者可能在同一交错下一个给 `SentCall`、一个给 `not-sent`。
- 作者需明确：T5 用与传输无关的话定义分界，例如「对端可能收到请求的任何部分之前与之后」，或者写明「授权是唯一的未交出阶段」。T1 的 `no-answer` 措辞要覆盖「已交出、未必离开」。

**小项（都不阻断）**
- 成员 `SPEC.md:204`「H6、H8 与性质 V2–V6 的负控」：`mutants.ts:37` 已经有 `mV1-sends-after-settled`，应改为 V1–V6。
- 成员 `SPEC.md:30`「T5 的取消与关闭，含不发 DELETE」：T5 `:484` 写的是「不要求」，「不发」是本包的做法（H7）。这是 NB10 的残留。
- `verification/README.md:63`「`cancelRequest`：它当即返回（契约 T5）」：契约 T5 `:478` 没有「当即返回」，这是成员 SPEC `:176` 自己定的。应改引成员 SPEC。
- 按相结算的结局表写了六遍：成员「取消」`:176-181`、「关闭」`:182-187`、「失败的处置」`:191`、V6 `:243`，以及契约 T5 与裁定 12。这与 `:3`「本页不复制条款正文」不符，是 NB11/N1 的残留。建议成员一侧只写怎样兑现，结局指向 T5；V6 作为定理可以保留自己的陈述。
- `README.md:62`、`README_ZH.md:61`「性质…见 SPEC「组合与验证」」：性质在「性质与证据」（`#properties`）。目录图 `README.md:83`、`:85`（中文 `:82`、`:84`）没有列 `tests/model/` 与 `verification/models/`。我无法确认这几行是不是本轮改的。

---

## 第 2 轮账本（B1、NB1–NB13）

| 项 | 结论 | 位置与说明 |
|---|---|---|
| B1 | 已改 | 契约 T5 `:479`、`:484`，裁定 12 `:100`；成员 `:176-187`、V6 `:243`；TLA `Signal` `:222-233`、`CloseSettles` `:238-252`、`V6_ByPhase` `:337-343`；探索器 `properties.ts:246-289`，负控 `mV6-authorizing-abandoned`（`mutants.ts:189-205`）；VR `:38` 的映射改为 `stop` 与 `stopAnswerOf`。同类问题延伸到了线路级断开，见 NB-1 |
| NB1 | 已改 | V1、V2、V6 改为对快照 `settles`、`credAtClose`、`cutAt` 的断言（`.tla:306-343`），快照由有效动作写入（`:110-114`、`:229`、`:250`、`:261`）。有 14 个有效动作变异（`models/README.md:53-68`、`run.py:57-115`）。VR `:118` 的全称说法现在成立：V1 有了探索器负控。V2 的 TLA 断言从 `closed` 起算，比定理强，`models/README.md:23` 已写明 |
| NB2 | 已改 | SPEC `:249-254` 写成「有限范围通过（valid-*）；负控找到反例；变异变红」 |
| NB3 | 已改 | 「A4 由模型承担」已删（grep 无 A4）。两个 `close-settles-after-line` 现在注入同一缺陷（`.tla:262-273`，`mutants.ts:107-124`），VR `:131` 写明 |
| NB4 | 已改 | 契约 T9 `:579`、裁定 13 `:101`；成员 H4 `:71` 指向 T9，自定里已经没有这一条 |
| NB5 | 部分仍成立 | 第 10–14 条已登记（`:98-102`）。闭合句的问题见 NB-4 |
| NB6 | 已改；前提未验证 | 成员 `:9` 钉 `06b98034d`。之后的 4 个提交主题都是 docs 或 test，`720a5d08a` 改的是契约 `docs/public-api.md`。没有 git，不能证实契约 SPEC 在 `06b98034d` 之后没有改动 |
| NB7 | 已改 | T5 链接改为 `#port-transport`，T8 为 `#t8`，T9 为 `#t8-end`（锚点在 T9 之前，可用）；探针命令 `:205`；「契约裁定 2」改为带 `#decisions-host` 的「第 2 条」（`:199`） |
| NB8 | 已改 | `:167` 补了 I06、O06 |
| NB9 | 已改 | H8 `:89`、自定 6 `:48` |
| NB10 | 已改，一处残留 | 契约 `:484`、`:612`、`:632`、`:706` 都是「不要求」；成员 H7 `:83`。残留在成员 `:30`（见小项） |
| NB11 | 大部分已改 | 评审轮次、卡内编号与运行过程记述，grep 无匹配；`mutate.py` 换成入库的 `tests/model/mutate.ts`；`FORMAL_OUTPUT_DIR` 缺省改为仓库 `tmp/formal/…`（`models/README.md:79`、`run.py:218`）。残留：按相结局表的复述（见小项） |
| NB12 | 已改 | `README.md:13`、`README_ZH.md:13` |
| NB13 | 已改 | `index.md:8`；`tests/index.md:13`、`:18`；`tests/README.md:7`；`fixtures/README.md:19`；`architecture.md:38`；`context.md:10`；`flows.md:3` 与失败表的条款列；契约 `public-api.md:11` 的 `./testing` 清单（「五个」的计数见 NB-5） |

## 简报另核的各项

1. **T5 的新结局与成员「取消」「关闭」「端口失败模型」、V4、V6 是否一致**：`signal` 与 `close()` 的三相结局在下列各处一致：契约 T5、裁定 12、成员 `:176-187`、V6、TLA、探索器、VR 映射、`flows.md:69-70`、`object-model.md:40-41`。V4 与 T5 也一致（`close()` 只等线路的 `close()`）。不一致之处有三：端口失败模型说元数据取回不收 `signal`（NB-2）；承诺句与自定 9 说过了头（NB-3）；线路级断开不在这张按相表里（NB-1）。
2. **`close()` 不再等授权发现**：两份 SPEC 都写清了。契约裁定 12 `:100`「`close()` 不等发现结束」，T5 `:484` 用「不等凭据句柄、元数据取回」覆盖。成员「关闭」`:185`、V6 `:243`、`flows.md:70` 都写了；TLA 变异 `V4-close-waits-discovery` 标作「修订前的规则」（`models/README.md:62`）。
3. **四处的名字是否一致**：一致。四处是 SPEC「性质与证据」、`verification/README.md`、`verification/models/README.md` 与 `tests/model/mutants.ts`，其中性质名 V1–V6，不变式名（与 12 份 cfg 一致），9 个 `bad-*` 负控，14 个变异，9 个探索器负控及签名。例外只有 SPEC `:204` 的「V2–V6」（见小项）。

## 范围外待裁决

- **线路级断开对授权中请求的结局（NB-1）**，归契约 T5、T8 的拥有者。两种做法各有代价，这里不代选：
  - 写成 `not-sent`（`connection-unavailable`）：契约 T8 的 SSE 段与 S01–S04 要加一句；`flows.md` 的两行要改；需要补一条性质或用例。
  - 维持字面的 `no-answer`（`stream-broken`）：与 T1 和裁定 12 的理由冲突，`session.ts:333` 与 `verification/README.md:36` 要随之改。
- **「交给线路」的定义（NB-7）**，归契约拥有者。

## 未覆盖

- 没有 git，不能逐行把改动归到本轮。卡评论 6675177331 只读到一部分，compare 页也没有列出改动的文件。
- 证据绑定只是前提，没有验证：探索器的记录钉在 `06b98034d`（VR `:95`），TLC 的记录是 2026-11-05 19:19、模型 SHA `5090d212…`（`models/README.md:89-108`）。「`src/` 与 `.tla` 在 `06b98034d` 之后没变」只是从提交主题推出来的。我没有读任何原始运行输出，除 `check:docs` 与 `check:design` 之外，也不替任何「通过」背书。
- 没有读全文的：`session.spec.ts`、`http.spec.ts`（只核了用例名）；`explore.ts`、`ports.ts`、`session-model.spec.ts`；`run.py`（只读了变异名与缺省值）；契约 SPEC 中 T 节、裁定、入口与组合以外的部分；`docs/README.md`、`cordis.md`（只 grep 过）。
- 转交：
  - `die` 对授权中请求的实际行为，以及 `sse-fallback` 场景是否走到这条交错：转 A。
  - `mV1-sends-after-settled` 实际能否变红：转 A 或 D。
  - 卡上证据与 PR 正文：转 E。

## 各项的拥有者

- 契约 SPEC 的拥有者（mcp-contract 维护者，T 段由本分支按卡拥有者的裁定维护）：NB-1 的契约一句、NB-4、NB-5、NB-6、NB-7，以及两项范围外裁决。
- 本成员的维护者：NB-1 中成员 SPEC、`flows.md` 与 `verification/README.md` 的部分，NB-2、NB-3，以及全部小项。

本报告不表示规格已被接受，也不表示证据已经核实或实现已经验证。

### 卡拥有者对 B 的处置

无阻断。全部「改」，进同一次集中修复；文字项归表达闭包，牵涉代码与模型的归代码闭包。

- NB-1（线路级断开对授权中请求的结局）：结局定为与 T5 同形：流断开、进程退出、旧 HTTP+SSE 共用流结束只对已交给线路的请求给出 `no-answer`（按原因）；会话结束只让触发它的请求答 `not-sent`（`session-ended`），其余已交给线路的请求由各自的应答决定；四种断开下，授权中的请求都答 `not-sent`（`connection-unavailable`）；授权发现中的请求保持 `authorization-required`（先到者定）。契约 T8 的 SSE 段与 S01–S04、S07 加这一句；成员 SPEC 所有权一节、`flows.md` 两行同步。证据：探索器的 V6 扩到线路级断开（含 `sse-fallback` 场景）；TLA 加线路断开的动作并按相结算，正控通过、配一个有效动作的变异。与 C 的 B1 是同一修法（`die` 对一切原因按相结算）。
- NB-2（元数据取回收不收 `signal`）：取回收到 `signal`，会话不依赖它遵守；信号之后不再发起新的取回，已发起的结果丢弃。代码按这句核一遍（R4 的第二个候选地址），V1 的可观察形式补上元数据取回。
- NB-3（承诺句说过了头）：`close()` 单列为「只等线路的 `close()`」，「线路的 `close()` 会答复」写成 V4 对 `close()` 的前提，归线路端口的义务；自定 9 补 `discover` 的两处例外；「到期即收场」改为「关闭时收场」。
- NB-4：契约裁定表的闭合句改写，第 12、13 条列为行为改动。
- NB-5：契约根导出只留一份清单（SPEC「三个入口」的 `.` 行指向 `docs/public-api.md` 与 `tests/public-entry.spec.ts`）；`public-api.md:11` 的套件数改为「六个（五个需求端口与传输）」。
- NB-6：契约「未覆盖」按现状登记：脚本化传输改好、套件补 T5 用例之后（C 的 P1），授权中 `signal`、`close()` 由套件覆盖；授权发现中的结局、`close()` 不等挂起的句柄、元数据取回不带凭据头列进「没有手写用例」并指向 `@omne-harness/mcp-host-local` 的用例。
- NB-7：T5 用与传输无关的话定义分界：「对端可能收到请求的任何部分之前」为未交出（本传输里就是授权中），之后为已交出；T1 的 `no-answer` 措辞覆盖「已交出、未必已离开」。
- 小项：全部改（`:204` 写 V1–V6；`:30` 改「不要求」；`verification/README.md:63` 改引成员 SPEC；成员一侧的按相结局表只留 V6 的陈述，其余指向 T5；README 的性质链接与目录图）。

## D. 差分变异（general-purpose，sonnet，high）

## D 面 差分变异：测量无效，本轮没有可计分的读数

**结论**：两个成员的测量都无效，退出 1，不能当「零存活」也不能当分数。原因是第一遍就出现「运行错误」和「没跑测试」，工具规定这时不再复核超时，141 个超时变异体因此全部「未复核」。如何收尾由调度者定，我没有重跑。

### 命令与设置
- 工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `720a5d08a`，status 为 `bound:false`，所以给 `--base 92a8e3cdf`，不给 `--since`。
- `pnpm run mutation --base 92a8e3cdf --plan-only`：contract 14 个文件 134 段，host-local 11 个文件 11 段。`git diff --name-only` 核对过，只含两包 `src/` 下的 `.ts`，范围正确。
- 正式运行：`VITEST_MAX_WORKERS=6 pnpm run mutation --base 92a8e3cdf`。日志写明「Stryker 同时 6 个工作进程（环境变量指定）」，两个成员各 3 个，进程数没问题，没有告警。
- 运行名额：启动前锁目录为空，没有别的代理在排队。但 `w3-mcp-call` 工作树里有一个 `vitest --mode slow` 在跑（02:17 起，约 1 核），没有走名额。这可能让超时偏多，我没法证实。
- 运行 02:25 到 02:40，约 15 分钟。
- 账本：`/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/720a5d08a/20261106-022559/`（含 `summary.md`、`summary.json`、两个 `*.mutation.json`、`*.log`）。运行日志：工作树 `tmp/closures/w3-mcp-host/mutation-r3/run.log`。
- 我另写了一份逐条清单 `r3-survivors-nocov-timeouts.tsv`，放在账本目录里。755 行，列为「状态、文件:行、算子、替换」，状态含 Survived、NoCoverage、NoTestsRan、Timeout、RuntimeError。

### 计数
| | mcp-contract | mcp-host-local |
| --- | --- | --- |
| 变异体 | 1675 | 1205 |
| 被杀 | 1404 | 721 |
| 超时（已判定，按测出来算） | 1 | 7 |
| 存活 | 149 | 260 |
| 无覆盖 | 43 | 133 |
| 运行错误 | **1** | 0 |
| 没跑测试 | **27** | **1** |
| 超时未复核 | 50 | 83 |
| 分数 | 无效 | 无效 |

简报预期运行错误为 0，实际 contract 有 1 个，host 为 0。另外两个成员都出现了「没跑测试」。

### 运行错误与没跑测试：我手工复现了两例，都是工具产物
**1. contract 的运行错误：`testing-scripted-transport.ts:439` `event === undefined` → `false`（id 1249）**
- Stryker 报错 `TypeError: Cannot convert object to primitive value`，出在 `errorToString` → `String(err)`，在 vitest-runner 里。`guarded-vitest.ts` 的守卫接住了它，所以记为运行错误而不是拒绝。
- 我在包副本（已删除）上手工变异并重建 dist（`tsc --noEmitOnError false`）后，fast 层 15 个文件 655 项用例全过，但出现 97 个未处理拒绝（`TypeError: Cannot read properties of undefined (reading 'kind')`，在 `classifyWireEvent` 里）。
- 这个变异体实际被杀，靠的是未处理拒绝让 vitest 退出码非 0，不是用例失败。Stryker 的 vitest runner 格式化这类错误时崩了。
- 守卫没有让它消失，因为崩在守卫之内、被转成了 Error 结果。这是工具对未处理拒绝的报告缺口。

**2. host 的没跑测试：`options.ts:17` `version === ''` → `version !== ''`**
- 手工复现：fast 层 7 项用例失败（`RangeError: clientInfo.version must be a non-empty text`）。任何构造工厂的用例都会抛错，明显应被杀。
- Stryker 却报成「存活、有 10 条覆盖用例、0 条跑完」。

**3. contract 的 27 个没跑测试**
- 位置：answer-readings.ts 32/97；composition.ts 39/77/93/214；decisions.ts 214/243/343/344/355/371/374/454；discovery.ts 39；readers.ts 117/206/210；wire.ts 314/370/392x3/400/402；authorization.ts 43 等。
- 我只复现了上面两例，其余没逐个核。它们的特征相同：覆盖用例多，却一条没跑完。我推测多半是同一类运行器产物，但没有验证。

### 超时 141 个（全部落在测并发与线路的代码上）
- host：session.ts 71、stdio-line.ts 10、queue.ts 6、body.ts 3，共 90，其中 7 个已判定、83 个未复核。
- contract：testing-scripted-transport.ts 49、authorization.ts 1、envelope.ts 1。其中 1 个已判定，50 个未复核。
- 逐条在 tsv 里。典型例子：`session.ts:641/642` 的整块变空、`:671` 的 `classified.kind !== 'answer'` 各变体、`:940` `entry !== undefined`、`stdio-line.ts:109/143/193`。
- 只凭一次超时分不出是真挂起（算测出来）还是负载下的存活。要复核，必须先让第一遍有效。

### 存活与无覆盖：这是无效读数，只作线索
存活 409（含 28 个没跑测试的）、无覆盖 176。逐条见 tsv。按文件和行汇总如下，括号内 x 数表示同一行的变异体数。

**host-local**（存活 260、无覆盖 133）
- **http-line.ts**：存活 42，无覆盖 101，是最大的洞。
  - 无覆盖行：58, 59, 65, 69, 72, 78, 82x2, 87x8, 148-151, 174, 175, 179-181, 211x10, 212-214, 220, 223x8, 226-228, 232, 234x4, 237-241, 250-252, 254-256, 261, 262x5, 268, 277, 279, 282-285。
  - 存活行：56, 64, 65x6, 76, 78x4, 82x5, 94, 115, 116, 118, 123, 132, 133, 136x2, 137, 141, 144, 148, 157, 171, 195, 198, 201, 202, 205, 208, 266, 269, 270。
  - 例：`:87` 的 `event.event === 'message'` 判断一族（无覆盖）。
- **session.ts**：存活 127，无覆盖 24（还有 71 个超时）。
  - 无覆盖行：305x2, 359x2, 396, 447, 504x2, 622x2, 645, 646, 679, 687x2, 700, 718x2, 843, 844, 856x2, 889, 897。
  - 存活行（节选）：186, 209x2, 228, 232, 236, 239, 240, 249x2, 250, 256, 265, 282, 317, 333, 373x4, 375x5, 390, 411, 427x3, 430, 445, 447x3, 459, 482, 485, 499-502, 514, 523, 524, 534, 538x3, 539x2, 553, 554x2, 574, 582, 588, 590x2, 597, 645, 651, 656-659, 669x2, 673, 679, 683, 700, 736-737, 749, 752x2, 756, 758x2, 775-779, 786x2, 795, 805, 806, 817x2, 820, 821, 825x2, 829, 843, 847, 869-872, 879, 880, 882, 889x2, 890x7, 893x2, 896, 916, 922, 969。
  - 其中 `:890` 一行有 7 个存活。
- **stdio-line.ts**：存活 63，无覆盖 6（行 116x2、169x2、203x2）。存活集中在 70-227（写计数与关闭一带：97, 100, 104, 112, 116-123, 131-135, 140-142, 150-152, 168-169, 177, 184, 188, 197-207, 217-227）。
- **queue.ts**：存活 14（行 14, 25, 29x2, 32-35, 38, 46, 53, 54x2）。
- **options.ts**：存活 6（行 15, 16, 17x2, 18, 21）。其中 `:15/:17` 的 `typeof name !== 'string'` → `false` 是类型位置的冗余守卫，更像等价；`:16/:18/:21` 的消息文本变空串，没有用例断言消息。
- **body.ts** 存活 5（9x2, 17, 19x2）、**factory.ts** 存活 3 加无覆盖 2（无覆盖行 19, 21；存活行 26, 36, 38）、**authorization.ts** 存活 1（`:37` `read.kind === 'ok'` → `true`）。

**mcp-contract**（存活 149、无覆盖 43）
- **testing-scripted-transport.ts**：存活 64，无覆盖 7，超时 49，运行错误 1。这是脚本化传输夹具，是测试设施，不是产品语义。
- **decisions.ts**：存活 37，无覆盖 14。存活行：131, 183, 198x2, 202x2, 213, 214x2, 218x3, 225, 226, 238, 266x2, 302x4, 311x2, 325, 383, 385x2, 456 等。
- **wire.ts**：存活 21，无覆盖 1。
- **plain.ts**：存活 13（行 16-22 的 `isPlainJson`、`isRecord` 一族）。
- **readers.ts** 9、**composition.ts** 8（行 48/49/52 是 JSON 类型判断）、**authorization.ts** 7（行 20 的 `name !== undefined && value !== undefined` 四个，45, 68）、**withheld.ts** 6、**answer-readings.ts** 4、**envelope.ts** 4（含 `:59` `index < value.length` → `<=`）、**discovery.ts** 2、**testing-transport.ts** 1。
- 无覆盖：decisions.ts 14、testing-scripted-transport.ts 7、composition.ts 6、discovery.ts 6、readers.ts 5、answer-readings.ts 4、wire.ts 1。

### 等价性判断：没有逐个判
本轮读数无效，所以我没有给任何存活标「等价」。已看出的几类：
- 错误消息文本变空串（options.ts 16/18/21，decisions.ts 226/266）：补一条断言消息的用例就能判定，不是等价。
- 类型守卫冗余（options.ts 15/17 的 `typeof name !== 'string'` → `false`）：运行时被后一个 `name === ''` 部分覆盖，可能等价。要判定，夹具要传非字符串的 name。
- `decisions.ts:311` `.filter(isModernProtocolVersion)` 整个去掉后仍存活：夹具缺「列表里有旧版本」的用例，可补。

### 结构性发现（调度者须知）
1. **快层看不到线路与模型的主要证据。** `http.spec.ts`、`stdio.spec.ts`、`conformance.spec.ts` 文件头都是 `@module-tag slow`，`session-model.spec.ts` 的 V1–V6 用例带 `tags: ['slow']`。差分变异只跑快层，所以 http-line.ts 一半无覆盖（101/244），stdio-line、session 的并发相存活多，这很可能是工具范围的限制，不一定是测试缺口。要量这些，只能换工具范围，或另用手工变异。我没有这么做。
2. **运行器产物阻断了复核。** 「未处理拒绝或抛错使 Stryker 无法记录用例结果」让 28 个变异体读成「运行错误」或「没跑测试」，进而让 141 个超时无法复核。这个缺口在 `tools/test-runner`，不在本卡的 `packages/mcp/`。若要拿有效读数，需要先处理它，或把这些变异体手工判杀，再重跑。
3. 若要重跑，建议先在没有别的 vitest 在跑时执行，因为超时 141 个可能含负载下的假超时。同一命令，`--no-incremental` 不必要，增量快照没有复用任何结果（复用 0）。

### 手工复现的副本
我在 `packages/mcp/` 下建过两个 `.stryker-tmp-manual-*` 副本，做完已删除，`git status` 干净。受跟踪文件没有改动。

### 卡拥有者对 D 的处置

- **测量无效，按「同一类连续出现」缩窄承诺。** 同一类运行器产物（逃出用例的错误让 Stryker 记成运行错误或「没跑测试」，于是不复核超时）在本卡已第三次让差分变异无效：host 第 1 轮、调用口第 2 轮、host 第 3 轮。按 review-code「连续两轮出现同一类阻断」一段，不再逐个补洞：本卡上差分变异对 `mcp-host-local` 与 `mcp-contract` 不下分数结论。变异强度的证据改由下列各项承担，并在证据评论里点名：
  - 入库的负控（`tests/model/mutants.ts`，13 个，fix3 增补 `http-line.ts` 的几个）。
  - TLA 的 14 个有效动作变异与两份负控配置。
  - 红灯表现行各节，以及 D.1 里落在 `http-line.ts` 上的 4 行（该文件自 `2e4659c8f` 起没有改动，转成可复跑的负控）。
  - fix3 按簇补的用例与它们的变红记录。
- **本卡范围内能去掉的根因，去掉。** 契约成员的 `vitest.config.ts` 没有未处理拒绝的守卫：host 与调用口都有，契约没有。D 复现的运行错误（`testing-scripted-transport.ts:439`，97 个未处理拒绝只让 vitest 以非 0 退出）正是这一类。fix3 给契约加同一个 setup 文件。它去掉「运行错误」这一类，不去掉「没跑测试」（变异体在模块加载或构造时抛出，如 `options.ts:17`），所以单靠它不能让重跑有效。
- **存活按产品语义成簇处理，tsv 是线索不是计分板。** 进 fix3 的簇：
  - `decisions.ts:311`：去掉 `.filter(isModernProtocolVersion)` 仍存活。补一条 `supported` 里只有旧修订、或旧修订排在前面的用例。
  - 契约 `authorization.ts:20` 的参数对检查，与 host `authorization.ts:37` 的 `read.kind === 'ok'` → `true`：读清楚变异之后的行为；若结果相同，改写代码让判定只出现一次（不留只为收窄类型的冗余守卫），不能改就写明等价理由。
  - `session.ts:890` 一行 7 个存活（`heldEndpoint` 对状态码、内容类型与 `target` 的判断）：快层没有旧回退的反例。补非 200、非 `text/event-stream`、首个事件不是 `endpoint` 的用例，各自断言不进旧一路。
  - `http-line.ts`：把 D.1 的 4 行转成负控；再从 D 的簇里取 `:87` 的事件过滤与 `:211`、`:223` 两块各一个负控（负控在慢层的 `http.spec.ts` 上变红即可）。`mutants.ts` 的 `file` 联合加 `src/http-line.ts`。
  - `session.ts` 与 `stdio-line.ts` 里 fix3 不改写的行：按相结算、关闭、写计数、归类四类各挑存活最集中的簇，补快层用例，或写明哪条慢层用例杀它（手工变异的运行记录），或写等价理由。不要求逐个清零。
  - 不处理：`testing-scripted-transport.ts`（P1 (a) 重写它）；`options.ts` 的消息文本（SPEC 不承诺文本，记一句即可）。
- **fix3 之后只跑一次差分变异。** 在 fix3 的 head 上，`--base 92a8e3cdf --since 720a5d08a`，等别的 vitest 都停了再跑（本轮与调用口写者的慢层重叠过）。再无效就照实记录，不跑第四次。
- **运行器缺陷进卡。** 波末的 test-runner 缺陷卡加两条机理：Stryker 的 vitest 运行器在格式化逃出用例的错误时 `errorToString` 崩溃；变异体在构造时抛出被记成「没跑测试」（`options.ts:17` 是最小复现）。

## A. 正确性与结构读数（implementation-reviewer，opus，high）

# w3-mcp-host 第 3 轮 A 面：正确性与结构读数（implementation-reviewer）

## 评审对象与完成程度

- 工作树：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，PR #1138。
- 提交：基线 `92a8e3cdf`，交付 head `720a5d08a`，第 2 轮 head `db06b5b70`。本轮增量 16 个提交、56 个文件，全部落在 `packages/mcp/mcp-host-local/` 与 `packages/mcp/mcp-contract/` 之内，没有越出写入范围（检查表第 1 问）。
- 级别：按 L3 热点处理。
- 简报 A 节的五条都已做完：第 2 轮阻断逐条复核、公开方法逐个读、L3 热点逐行读、规则归契约与纯移动核对、结构读数。
- 探针都在工作树之外跑：用 esbuild 加 `--conditions=source` 打包 `src`，或用 `node --conditions=source` 直接跑。源码与输出存档在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3-probes-a/`。
- 收工时 `git status --porcelain` 为空，head 仍是 `720a5d08a`。

## 工具一览

| 入口 | 命令 | 结果 | 输出 |
|---|---|---|---|
| 变更清单 | `git log/diff --stat db06b5b70..HEAD` | 56 个文件，都在两个成员内 | 终端 |
| 验收与测试的改动 | `git diff db06b5b70..HEAD -- '*.spec.ts'` 筛 `^-` | 五个 spec 各删 2 行，都是 `failOnUnhandledErrors` 的导入，按裁定 C-(2) 移进 setup。`session.spec.ts` 有两条断言改动，各对应一条裁定，见「非阻断」后的说明 | 终端 |
| 依赖规则 | `pnpm run lint:deps` | 第一次退出 2：另一代理的 `packages/.stryker-tmp-*` 沙箱让 dependency-cruiser 报 ENOENT。变异结束后重跑退出 0：「✔ 没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（81 个成员、343 条成员边；1 个组环按具名例外放行）」 | 存档 `lintdeps.log` |
| 受限调用点与署名 | `pnpm run lint:rules` | 退出 0：「PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6048 个提交的署名，无违反」 | 存档 `lintrules.log` |
| 结构度量 | `pnpm run metrics --coverage --base 92a8e3cdf` | 第一次退出 2：stryker 沙箱让 turbo 报重复包名。重跑时等了一次名额（`w3-mcp-call` 的 metrics 占着），然后退出 0。因为 `pnpm-workspace.yaml` 有改动，按全量跑。`mcp`、`mcp-contract`、`mcp-host-local` 三个成员的覆盖率运行退出 0；其余 55 个成员的覆盖率运行退出 1，与本次变更无关，原因没有查 | `/data/qiwei/repos/omne-harness-lite/tmp/metrics/720a5d08a/`（`metrics.json`、`review.html`）；存档 `metrics.log` |
| 受影响范围的测试 | 同上（覆盖率跑了两个成员的快层） | 两个成员退出 0 | 同上 |
| 第 2 轮探针复跑 | A 的 Q1、Q1b、Q2、P1–P7、P9、Q3；C 的 `writing.mts`、`authz.mts` | 全部显示已修复。P8 引用的旧字段已经不存在，改用 P8b | 存档 `r3-rerun-*.out` |
| 本轮新探针 | N1、N2、N3、P8b | 3 处反例 | 存档 `n1-*.out`、`n2.out`、`n3.out`、`p8b.out` |
| 全套检查（L2） | — | 未验证：我没有跑全套检查或准入。卡评论 6675177331 附了 head `720a5d08a` 的 turbo 与常驻门禁（`gates-r3/`），我读了 `turbo.log`、`lint-deps.log` 的尾部 | `tmp/closures/w3-mcp-host/gates-r3/` |
| 形式任务（L3） | 读证据，没有重跑 | TLC 在 `de1a55bba` 上跑。HEAD 的 `TransportSession.tla` 的 sha256 是 `5090d212…`，与 `formal-final/20261105T192632Z-mutations/mutations.json` 的 `model_sha256` 一致；之后 `.cfg` 没有改动。12 个配置与 14 个有效动作的变异都符合判读（`final-run.log`）。探索器（`docs2/explorer-*.log`，在 `06b98034d` 上）与 13 个负控（`fix2-check/mutate.log`、`owner/mutate-v1.log`）是实施者跑的，我没有复现：变异运行占着同一棵树，而 `mutate.ts` 会写 `src/` | 各原件路径 |

## 第 2 轮阻断逐条复核

| 第 2 轮 | 结论 | 证据 |
|---|---|---|
| A 阻断 1 / C B1：两个写重叠，先完成一个，`close()` 挂住 | **这一交错已消失** | Q1（真实子进程）：「Q1 close() returned within 3s: true」，SIGKILL 前就返回了。`writing.mts`（流替身）：「closed 1 ms」。实现：`stdio-line.ts:31` 的 `writes` 是计数，`:222` 在计数不为零时中止写端。用例 `lines.spec.ts:224`「two overlapping writes…」，负控 `mStdio-writes-boolean` 变红。**同一承诺的另一交错仍然成立，见阻断 1（N1），单列。** |
| A 阻断 2 / C B2：授权的等待点不受 `signal` 与 `close()` 管辖 | **已消失** | Q2a：`call` 在 `signal` 之后、`close` 之后，`listActions` 在 `close` 之后，都在 1 s 内结算。Q2b：`reportRejection` 挂起，「reportRejection calls: 1」，`close()` 在 2 s 内返回，`listActions` 也结算了。`authz.mts`：「call after signal: not-sent」，`close` 之后 `listActions` 答 `not-sent`。P2：元数据挂起时 `close` 之后答 `authorization-required`（`metadata: unavailable`）。结构：`once` 与 `call` 只等 `entry.answered` 或 `departed`（`session.ts:724-731`、`:925`）；工作流经 `work` 托管（`:280`）。 |
| B B1：授权中一相的结局 | **已消失** | Q2c：「call(): {"failure":{"kind":"not-sent","cause":"connection-unavailable"}} \| peer saw: []」。实现 `stopAnswerOf`（`session.ts:293-310`）按相结算，`signal` 与 `close()` 都走同一个 `stop`（`:316`、`:552`、`:972`）。契约 T5（`mcp-contract/SPEC.md:482-487`）写明了三相。 |

第 2 轮 A 面非阻断的裁定核对：
- stdio 的三处分支（跨块越界、写被拒绝、EOF 尾行）已有用例和负控，`mutate.log` 三条变红，`readStdout` 与 `send` 覆盖 100%。
- `test:triage` 没有执行，交付说明第 2 节已写明。
- `close()` 已改为单飞：`session.ts:969-977` 只调用一次 `line.close()`，所有调用方拿到同一个 promise。

## 阻断

**1.（N1）stdio：`close()` 仍会等一个不读 stdin 的对端。** 写已经被线路「收下」，但还在 Node 的缓冲里。
- 检查表：第 15 问。
- 违反的条款：
  - 契约 T5（`mcp-contract/SPEC.md:483`）：「`close()` 不等凭据句柄、元数据取回或对端：它们挂起时也在线路关闭后返回」。
  - 成员 SPEC H6（`mcp-host-local/SPEC.md:79`）把「`close()` 等一个不读 stdin 的对端」列为反例。
  - 卡拥有者的承诺：`close()` 在线路或对端挂起时也结算。
  - 交付说明第 3 节声称这一承诺已经兑现。
- 位置：`stdio-line.ts:182-191` 与 `:222-223`。web `writer.write()` 一 resolve，`writes` 就减 1。`close()` 在 `writes === 0` 时走 `await this.writer.close()`。
- 机制：
  - 本包夹具用 `Writable.toWeb(child.stdin)` 造 `stdin`（`tests/fixtures/process.ts:55`）。它的 sink 在 Node 的 `write()` 返回 true（缓冲没到 16 KiB 的 highWaterMark）时就让 web 写 resolve，块其实还在 Node 的缓冲里，没有进管道。
  - 于是 `writes` 归零、`departed` 触发，但 `writer.close()` 要等 Node 把缓冲冲进一个没人读的管道。
  - 契约端口只约定了 `WritableStream<Uint8Array>`（`mcp-contract/src/ports.ts:111`），线路看不到下层的缓冲。凡是在 sink 之下有缓冲的实现都同形。本树里没有生产的 `ProcessHandle` 产生处可核。
- 反例（探针 `n1-stdio-buffered-close.ts`，真实子进程 `setInterval` 不读 stdin，连续发 4 KB 的 `call`）：
  ```
  N1 calls departed: 26 | node stdin writableLength: 4372 needDrain: false
  N1 close() returned within 3s: false
  N1 after SIGKILL: the same close() returned within 1s: true elapsed ms 3012
  ```
- 测试缺口：
  - `stdio.spec.ts:210`「the pipe is full」只有一个 1 MiB 的写，而且由 `signal` 中止。
  - `lines.spec.ts:224` 用的是永不完成的流替身。
  - 两条都到不了这个交错。探索器与 TLA+ 都不经 `StdioLine`。
- 后果：与第 1、2 轮相同。`@omne-harness/mcp` 的拆除先 `await transport.close()`，进程停不下来，凭据句柄也释放不了。这是同一承诺上第三次出现「`close()` 等对端」。
- 实施者要做：裁定第 6 条「无在途写就关闭写端」本身不够，需要拥有者定一条规则，不是再加一个条件。可选做法，不代选：
  - `close()` 一律 `abort()` 写端：被关闭的传输上已结算的请求不需要冲缓冲。
  - 或者让 `writer.close()` 与一个有界的收场竞速，到期就 `abort()`。
  - 或者在契约里给 `stdin` 的「写完成」下定义。
- 另补一条用例：多个小写已经 departed、对端不读 stdin，然后 `close()`。

**2.（N2）`sendOut` 在授权之后不再核传输是否可用：会话已结束（S07）时，仍在授权中的 `call` 被写上线路，并交出 `SentCall`。** 这是本轮重做引入的回归。
- 检查表：第 9、15 问。
- 违反的条款：
  - 成员 SPEC H4（`SPEC.md:71`）：「每个等待点返回之后，工作流再核这个请求是否已结算、传输是否可用」。
  - 契约 T1（`mcp-contract/SPEC.md:452`）：「『传输不再可用』指之后的每个请求答 `not-sent`（`connection-unavailable`）」。
- 位置：
  - `session.ts:569-570`：`authorize` 返回之后只核 `inFlight`。
  - `session.ts:330`：`die('session-ended')` 直接返回，不结算 `authorizing` 项。
  - 同一文件的 `respond`（`:474`）、`notify`（`:484`）、`enterSse`（`:821`）在授权之后都核了 `usable`。
  - 第 2 轮 `db06b5b70` 的 `send` 有「`if (!this.usable) settle NOT_SENT`」，重做时丢了。
- 反例（探针 `n2-authorizing-after-session-ended.mts`）：SSE 模式；`call` 的授权被闸住；同时 `listActions` 收到 404，按 S07 结束会话；然后放开授权。
  ```
  N2 listActions: {"failure":{"kind":"not-sent","cause":"session-ended"}}
  N2 a request begun now: {"failure":{"kind":"not-sent","cause":"connection-unavailable"}}
  N2 the call that was authorizing: {"ok":{"requestId":"r4","answer":{}}}
  N2 tools/call messages the line received after the session ended: 1
  ```
  - 读代码可知，带 `Mcp-Session-Id` 的旧 Streamable HTTP 走同一条路：404 经 S07 进 `apply`，再进 `die`。
- 后果：
  - 传输已经宣布不可用，调用口据此把连接记为 `lost`（`session-ended`），一个请求却还是离开了，调用方拿到的是「已发出」。
  - 在 SSE 模式下，按 S07 的既定行为，已发出的项不被结算（用例「leaves another request of the session in flight」），这个 `answer` 只能等共用流的应答或 `close()`。
  - 探索器与 TLA+ 都没有 `session-ended` 的 `die`，所以看不到这一点。
- 实施者要做，二选一：
  - `sendOut` 在授权返回后加一行 `!this.usable` 的检查，答 `NOT_SENT`。
  - 或者让 `die('session-ended')` 也把 `authorizing` 项结算为 `not-sent`。
- 补一条会失败的用例：会话已结束时，仍在授权中的 `call`。

## 非阻断

**1.（N3）授权发现中的请求仍接受共用流上的应答，先到的 401 结论被后来的应答覆盖。**
- 检查表：第 10 问。
- 违反的条款：契约 T5「先发生的那个决定结论，后来的丢弃」；T4 规定失败是 `not-sent`（`authorization-required`）。
- 位置：`session.ts:668-669` 的 `classify` 只核 `inFlight`。`discovery` 相的项仍在在途表里，`onEvent` 的 `line` 分支（`:351-352`）会把共用流上带它 id 的应答交给它。
- 反例（探针 `n3-answer-after-refusal.mts`）：SSE 模式；`tools/list` 的 POST 答 401，元数据取回挂着；共用流上随后来了带同一 id 的 `result`。
  ```
  N3 tools/list refused; reportRejection calls: 1 | id r4
  N3 listActions(): {"ok":{"tools":[]}}
  ```
- 不判阻断的理由：
  - 只在 SSE 模式可达（共用流是唯一的后续事件源），而且要对端先 401、再在流上作答，属于对端失常。
  - 第 2 轮的 `classify` 同形，是存量。
  - 凭据不变式（`reportRejection` 至多一次、只对授权过的请求）仍然成立。
- 后果：`reportRejection` 已经调用过，调用方却得到成功；对 `call` 来说是带 `result` 的 `SentCall`。
- 实施者要做：`classify` 或 `onEvent` 跳过 `phase.kind === 'discovery'` 的项，并补一条用例。

**2. 超线项没有逐条交代**（检查表第 11 问）。
- 第 2 轮裁定要求「其余超 warn 的逐条在最终证据里写处置」。本次度量（基线以来变更的函数）有超 alert 3 条、超 warn 8 条：
  - alert：`withheld.ts:39 headerDeclarationInvalid` CC 19；`wire.ts:301 resultClassOf` CC 16（CRAP 17.2）；`decisions.ts:337 probeErrorConclusionOf` CC 11（CRAP 13.8）。
  - warn：`concludeProbe` 11.6、`eventOf` 11.1、`exchangeConclusionOf` 11、`httpErrorWireOf` 11、`readDiscoverResult` 11、`StdioLine.readStdout` 11、`taskReadOf` 10.8、`discoverWith` 10.3。
- 交付说明第 5 节只写了 3 个 alert，8 个 warn 一条也没有处置。
- 交付说明称这 3 个 alert「都是基线以来的存量」，措辞要改准：它们不在 `db06b5b70..HEAD` 的改动里，但都是本 PR 第 1 轮引入的（例如 `withheld.ts` 唯一的改动提交是 `f46bcbe5c`），不是基线前就有的存量。

**3. 交付说明里与证据不符的一句。** 第 3 节称调用方能看到的每个 promise，包括 `close()`，在线路与对端挂起时都结算。阻断 1 是反例。

关于两条断言改动（检查表第 4 问，不是发现）：`session.spec.ts` 的「…one that fires while it is authorized…」把 `abandoned` 改为 `not-sent`，对应裁定 B-B1；「close() settles a request in the authorization discovery…」去掉了「等发现结束」，对应裁定「`close()` 不再等授权发现」。两处都有卡拥有者的裁定。

## 结构读数（只摘 `db06b5b70..HEAD` 改动的函数）

- 统计方法：按 `git diff -U0 db06b5b70..HEAD` 的 hunk 与 `metrics.json` 的函数行区间求交，共 111 个函数。新拆出的 `composition.ts`、`answer-readings.ts`、`discovery.ts` 整文件都算在内。
- 超 alert：0 条。
- 超 warn：1 条。`discovery.ts:22 discoverWith` CC 9，覆盖 75%，CRAP 10.3。它由 `9ae28f6e6` 纯移动过来；没覆盖的是第二次 `retry` 与 `default`，读出来是不可达。
- 接近线的：

  | 函数 | CC | 覆盖 | CRAP |
  |---|---|---|---|
  | `ScriptedTransport.call` | 10 | 100% | 10 |
  | `classifyWireEvent` | 9 | 80% | 9.6（第 2 轮是 CC 18，已按裁定拆开） |
  | `callAnswerOf` | 8 | 71% | 9.5 |
  | `Session.enterSse` | 9 | 100% | 9 |
  | `StdioLine.send` | 9 | 100% | 9 |
  | `interpretAnswer` | 8 | 78% | 8.7 |
  | `Session.onEvent` | 8 | 90% | 8.1 |
  | `Session.dispatch` | 8 | 92% | 8.0（第 2 轮是 12） |

- `session.ts` 与 `stdio-line.ts` 没有覆盖满的函数：`stopAnswerOf`、`onEvent`、`versionOf`、`dispatch`、`apply`、`enterFrom`、`heldEndpoint`。它们没覆盖的都是穷尽检查的 `default`，读出来是不可达。`Session.work` 已是 100%（在 `c8a78f888` 上是 50%）。

## 规则归契约与纯移动（简报第 4 条）

- 契约新增的根导出都由两个传输共用，各只有一处实现：`callRequestOf`、`listActionsRequest`、四个任务请求、`requestMetaOf`、`withOneResend`、`cancelsByNotification`、`streamGoneAnswerOf`、`authorizationRequiredAnswerOf`。会话与 `testing-scripted-transport.ts` 各引用一次。
- `WIRE_LIMITS`、`endedCauseOf`、`startAuthorizationDiscovery` 只有会话用：脚本化传输不读线上文本，也没有进程事件。
- `authorization.ts` 与 `limits.ts` 已改用 `WIRE_LIMITS`，不再抄上限。
- 会话里看不到「旧修订」的第二份判断：连接状态经 `view` 交给契约。
- 纯移动提交 `9ae28f6e6`：在 `--color-moved=plain --color-moved-ws=allow-indentation-change` 下，非移动行共 81 行，全部是文件头注释、import 与 export 的胶水、`malformed` 与 `errorFailureOf` 加的 `export`、`index.md` 条目，没有逻辑行。

## L3 热点（逐行读 `session.ts`、`stdio-line.ts`，对照契约 `authorization.ts`）

- **凭据句柄。** `authorize` 与 `reportRejection` 只在 `callHandle` 的 lambda 里调用（`session.ts:410`、`:428`）；`release` 从不调用。`callHandle` 在调用之前同步核 `closed`（`:390`）。
  - `refusalOf` 被同步调用：从 `dispatch` 经 `classify`、`apply`、`enterDiscovery`；从 `enterSse` 在核 `usable` 之后经 `enterFrom`、`refusedGet`。所以 `close()` 之后不会再有调用。
  - `reportRejection` 每次进入发现只调用一次，而且只在 `entry.authorized` 时。请求只有授权成功才会离开，所以只对授权过的请求调用（Q2b、P2 计数都是 1）。
  - 凭据头只写进出站的 `Headers` 交给线路。答复里只有应答头，失败分类不带头。元数据取回只带 `accept`（`authorization.ts:16-21`）。
- **按相结算。** `stop` 是 `signal`、`close()`、`cancelRequest`（现代 HTTP）与 `work` 的 reject 共用的唯一入口，所以 `signal` 与 `close()` 同形。缺口是 `die('session-ended')`，见阻断 2。
- **`close()` 单飞。** 已成立（`:969-977`）。
- **`StdioLine` 的写计数。** 写成功、写失败与中止之后计数都会递减，`AbortSignal.any` 的监听在 `finally` 里移除。P8b：「abort listeners on the line closing signal after 50 writes: 0 | on teardown: 0」。关闭的缺口见阻断 1。
- **`work` 的错误去向。** 有在途项的工作 reject 时按相结算（DP-06）。没有在途项的工作吞掉错误，这与 SPEC「没有在途项的工作没有结局」一致。`pump` 的 `catch` 会在 `onEvent` 同步抛出时停掉读循环。我没有找到能抛出的路径，所以不列为发现。

## 范围外待裁决

- 阻断 1 的修法涉及卡拥有者裁定第 6 条（「否则关闭写端」）本身。可能还需要契约给 `ProcessHandle.stdin` 的「写完成」下定义。由拥有者裁定。

## 未覆盖

- `ScriptedTransport` 对 T5 三相的处理没有评：它的 `close()` 对所有在途项都答 `ABANDONED`，`call` 仍先 `await authorize`。
- 与 `@omne-harness/mcp` 的真实组合没有运行。阻断 1、2 的拆除后果是读代码推出来的。
- 全量度量里 55 个成员的覆盖率运行退出 1，原因没有查，与本变更无关。
- 探索器、负控与 TLC 没有重跑，只读了证据，并核了模型的哈希。
- 转交 design-reviewer：阻断 1 是否要求契约修订（`stdin` 的写语义）。

## 观察（不是发现）

- 变异账本里 `session.ts:333` 的 `else if (entry.phase.kind === 'authorizing')` 改成 `true` 后存活，说明「`die` 时发现中的项继续完成」没有用例（账本 `/data/qiwei/repos/omne-harness-lite/tmp/mutation-ledger/720a5d08a/20261106-022559/r3-survivors-nocov-timeouts.tsv`）。转 D 面。
- 我自己的后台等待命令被 `pgrep -f` 匹配到自身，空等了一段时间，已终止，不影响读数。

阻断 1、2 给出了具体反例，所以这一轮不是「未发现阻断问题」。接受与否由派发者决定。

### 第 3 轮结构诊断：`close()` 等对端（同一承诺第三次出现）

- **三轮的同一类。** 第 1 轮：`close()` 等在途写。第 2 轮：两个写重叠，先完成的那个把布尔的「在写」清掉，`close()` 走了等待的一支。第 3 轮（A 阻断 1）：写已被 web 流「收下」、计数归零，字节还在 Node 的缓冲里，`writer.close()` 要等它冲进一个没人读的管道。
- **三次修法共有的前提。** 「web 写完成，字节就离开了本进程；所以没有未完成的写时，优雅关闭（冲完缓冲再结束 stdin）有界。」这个前提不成立：web 写的完成只表示下层收下，不表示对端读了。前两轮的修法都是把「什么时候可以优雅关闭」的条件收窄（无在途写、写是计数），条件观察的始终是错的一层，和第 2 轮「形式守护量错了层」同形。
- **挑战前提的观察。** A 的探针 `mcp-host-r3-probes-a/n1-stdio-buffered-close.ts`（真实子进程不读 stdin，26 个 4 KB 的 `call` 已出发，`writableLength` 4372）：原代码 `close()` 3 s 内不返回，进程被杀后才返回（3012 ms）。卡拥有者在副本上把 `close()` 改为一律中止写端，同一探针 7 ms 返回（`/tmp/owner-n1/`，记录于 03:16 UTC）。
- **第一性原理。** `close()` 是放弃：会话在关闭线路之前已按相结算全部在途请求，关闭之后没有任何字节需要送达；stdio 协议的收场信号是 stdin 的结束，中止写端（销毁管道）同样给出这个信号。所以线路的关闭不应有「优雅」一支：stdio 线路的 `close()` 一律中止写端，再取消两个读；它的完成只依赖本地资源，不依赖对端。HTTP 线路的 `close()` 已经只中止本地请求。这条规则也就是 B NB-3 要的「线路的 `close()` 会答复」这一前提的来源：它由线路的结构保证，不是对对端的假设。
- **因此删去的东西。** `writes` 计数在关闭时的作用消失；若它别无用处就删掉，负控 `mStdio-writes-boolean` 随之退出，换成「关闭时又走优雅关闭」的负控。`closing` 信号保留：仍在等满管道的 `send` 要在关闭时答 `aborted`。

### 卡拥有者对 A 的处置

- **阻断 1（N1，stdio `close()` 等不读 stdin 的对端）：改，按上面的结构诊断。** `StdioLine.close()` 一律中止 stdin 写端，不走 `writer.close()`；删掉只为关闭而存在的计数；成员 SPEC H6 改写（关闭中止写端、对端看到输入结束、从不等缓冲排空），「线路的 `close()` 只依赖本地资源」写成线路端口对会话的义务（V4 的前提，B NB-3）。用例：真实子进程不读 stdin，多个小 `call` 已出发（`writableLength` 大于 0），`close()` 在进程停止之前、有界时间内返回。负控 `mStdio-close-flushes`（恢复无在途写时的 `writer.close()`）在这条用例上变红。conformance「stdio: close() closes stdin, then cancels stdout」的次序照旧，「closes」指结束写端。
- **阻断 2（N2）：与 C 的 B1 同一件事**，按 fix3 第 1 条改。
- **非阻断 1（N3，发现中的请求接受共用流上的应答）：改**，并进 C 非阻断 5（`classify` 只对 `sent` 相生效）；补「先 401、再在共用流上作答」的用例，断言结论仍是 `authorization-required`。
- **非阻断 2（超线项）：改。** 3 个超 alert（`withheld.ts:39 headerDeclarationInvalid` CC 19、`wire.ts:301 resultClassOf` CRAP 17.2、`decisions.ts:337 probeErrorConclusionOf` CRAP 13.8）进 fix3：能按领域结构（表、判别联合）拆开就拆，CRAP 高于 CC 的补未覆盖分支的用例；拆不开的写理由。8 个超 warn 在最终证据里逐条写处置。证据里「基线以来的存量」改为「本 PR 第 1 轮引入，不在第 2 轮之后的改动里」。
- **非阻断 3（证据里与反例不符的一句）：改**，最终证据重写那一句。
- **观察（`session.ts:333` 存活，`die` 时发现中的项继续完成没有用例）：改**，进 fix3 第 2 条的用例。
- **范围外待裁决（契约是否要给 `stdin` 的写完成下定义）：不需要。** 关闭一律中止写端之后，线路不再依赖写完成的语义；契约 T5 已有「`close()` 不等对端」。

### 卡拥有者裁定（03:21 UTC，formal3 交回引出）：线路断开不动授权发现中的请求

formal3 的模型让线路断开与会话结束当场把授权发现中的请求结算为 `authorization-required`（自裁 1，理由是「与 `signal`、`close()` 同形」与 V4 有界）。这与 fix3 第 2、18 条（断开时发现中的请求不被结算，之后照常以 `authorization-required` 结束）冲突；冲突出在卡拥有者给两份规格的措辞不一致（formal3 第 3 条要求「断开之后调用方的等待都放开」）。裁定：

- **线路级断开只结算命运取决于线路的请求。** 授权中的请求会被写上线路：答「未发出：`connection-unavailable`」。已交给线路的请求的应答经线路回来：按原因答 `no-answer`；会话结束时 HTTP 上各请求有自己的应答，不动。授权发现中的请求：结论已由先到的 401 定为 `authorization-required`（T5「先发生的那个决定结论」），发现走单独的取回、不经线路，断开不是这个请求上的事件：不动，发现做完照常结束。
- **`signal` 与 `close()` 当场结算发现中的请求，理由是调用方放弃了；断开不是放弃。** 对端在 401 之后关掉共用流是现实情形，这时让发现做完，调用方拿到完整的授权信息去走授权流程。
- **有界性。** 发现中的请求在断开之后与断开之前一样，由取回答复、`signal` 或 `close()` 放开（V4 原有的触发条件）；断开不新增无界等待。V4 的断开子句只覆盖授权中与已交给线路的请求。
- 因此 fix3 开头「`dead` 与 `signal`、`close()` 一样只是又一种停」改读为：`dead` 与它们共用同一条「相 → 结局」规则，但只作用于依赖线路的两相。formal3 的 `LineGone`、`SessionEnded` 不切 `disc`；变异 `V4-gone-leaves-discovery` 换成「断开结算了发现中的请求」，由 `deadOut` 快照在 V6 上打红。
- formal3 待定项 (a)：`V2_NoWireAfterDead` 留在 V2 名下，V2 的定理句扩写为「`close()` 返回之后不再调用凭据句柄；会话断开之后不再调用 `authorize`，也不再把请求交给线路」，由 docs3 写。
