# w3-mcp-host 第 4 轮关口评审记录

简报：`mcp-host-r4-briefs.md`。范围 `720a5d08a..54a2377cb`。按 C-SM-08：A、B、E 必做，C 只看新形状，D 一次。

## E. 交付边界（general-purpose，sonnet，medium）

w3-mcp-host 第 4 轮 E 面（交付边界）报告。PR #1138，head `54a2377cb`，工作树干净。我没有改任何文件，也没有发评论。

**我自己核过的事实**
- `git diff --name-only 72f977c81..HEAD` 里没有 `.ts`、`.json`，只有 `.md`。所以卡上 `72f977c81` 的代码读数适用于 head。
- `git ls-files --eol | grep -c w/crlf` 为 0。
- 我在 head 上重跑了 `src/` 的类型断言、`any`、非空断言 grep。host `src/` 为 0；契约 `src/` 的命中全是字符串（`'as written'` 等）。`AbortSignal.any` 是方法调用，不是 `any` 类型。host `src/` 没有 `@modelcontextprotocol` 导入。
- 契约 `tests/` 自 `720a5d08a` 起只删了 1 行，是 `decisions.spec.ts` 里 `ConnectionView` 的构造辅助，不是断言。
- `turbo.log` 在 `tmp/closures/w3-mcp-host/owner-fix3/`，sha256 前 16 位 `0486e372ce153801`。其中：
  - 契约 669 条，host-local 399 条，`mcp` 254 条。
  - `conformance stdio first: passed 98, not-applicable 1, failed 0`。
  - `conformance streamable-http first: passed 97, not-applicable 2, failed 0`。
  - 这些计数来自日志原件，不在卡上。

## 一、验收清单 1–9

| # | 判定 | 依据或缺口 |
|---|---|---|
| 1 构建、类型检查、测试 | 达到 | 卡评论 6677346854：合并结果 `72f977c81` 上三包 `build typecheck test` 退出 0，254/669/399，日志 `0486e372ce153801`。`vitest run` 不给 mode 时两层都跑，所以慢层含在内。之后到 head 只改文档。 |
| 2 契约套件（MC3-9） | 未达到（轻） | 缺：卡上没有 head 的通过、失败、不适用计数。卡上最近的计数是 6675177331 §2，在 `0695f2ba4` 上（97/1/0、96/2/0）。之后 fix3 改了 `session.ts`、`stdio-line.ts` 和契约，套件多了 T5 用例。6677346854 只写了 399 通过，没引计数。补救：把上面两行计数贴到卡上。不适用理由仍在 `conformance.spec.ts` 的 `NOT_APPLICABLE`；旧 HTTP+SSE 回退另有用例（`http.spec.ts:635`、`:705`、`:746`）。 |
| 3 stdio 用例（MC3-10） | 达到 | `stdio.spec.ts` 里有：丢弃非 JSON 行（:83）、16 MiB 断流（:91）、`process-exited`（:104）、旧对端回退（:160）、探测时限（:183）、取消带 `_meta`（:259）。fix3 新增不读 stdin 的 `close()`（:235）。逐条清单在 6666088522 §2.3，是 `db06b5b70` 上的；新增用例在 6677346854 只有概述。 |
| 4 HTTP 用例（MC3-11） | 达到 | `http.spec.ts` 里有：401、403（`insufficient_scope` 与其他 403，`reportRejection` 次数）、授权发现两段地址、再发与不再发、`x-mcp-header`、会话号与 404、旧 HTTP+SSE 回退。head 上 399 条通过。 |
| 5 复用表 | 达到 | 成员 SPEC「与 SDK 的复用关系」（`SPEC.md:120`）。 |
| 6 凭据不外泄 | 达到 | `http.spec.ts:287`，随 399 通过。 |
| 7 契约 | 达到 | 新根导出 `stopAnswerOf`、`lineGoneAnswerOf`、`fallbackGetConclusionOf` 有 `decisions.spec.ts` 用例，导出集合测试已按新增改写。脚本化传输改用后，契约原有断言未动。PR 正文写了两类例外。但 PR 正文已过时，见第四节第 1 项。 |
| 8 收尾门禁 | 达到 | 6677346854 的 `72f977c81` 表：typecheck、lint:rules、lint:oxlint、lint:deps、format:check、check:docs、check:design、CRLF 0，都有哈希。head 上 6677715557 重跑文档门禁，退出 0。 |
| 9 源码边界 | 未达到 | 缺：head 或 fix3 之后的 grep 输出不在卡上。卡上只有 6666088522 §9（`db06b5b70`）。6675946273 说 `gates-r3/greps.log` 的 `024d26f4f1b5a2ee` 会在「下一份证据评论」贴出，6677346854 没有贴，而且那份读数还是 `720a5d08a` 的。fix3 改了 `session.ts`、`stdio-line.ts` 和契约 `src/`。fix3 规格第 8 项要求「附命令与输出」，卡上没有。产物本身成立（见上方我自跑的结果）。补救：把 head 上的 grep 命令、输出和哈希贴到卡上。 |

## 二、性质及证据义务

- **「用例 → 缺陷 → 变红」：部分达到。**
  - 6675170166 的表在 `720a5d08a` 上，A、B、C 节有用例全名和变红摘录。
  - fix3 之后的证据只有 6677346854 的概述：6 条在基线变红；4 条基线已绿，由负控或手工变异证明敏感；23 个负控全部变红，哈希 `ac51935251bd09c8`。
  - 缺：这 10 条用例的全名与变红输出摘录，以及新增 13 个负控各自抓的缺陷，不在卡上。原件在 `tmp/closures/w3-mcp-host/fix3/red/` 与 `mutants.md`。
  - 缺：docs3 自己列为第 4 轮未覆盖的「红灯表 B 节存活的 `settle` 表守卫变异没在现行代码上重跑」，卡上没有处置。
  - 缺：fix3 簇的「等价理由」（契约 `authorization.ts:20`、host `authorization.ts:37`）只在卡上说「写了」，理由原文在 `fix3/clusters.md`。
- **不重发：达到。** `http.spec.ts:454`、`:432`。
- **进程归落点：达到。** 复用表加 H3、H6、H10。
- **每个异步副作用有上界与拥有者、测试后无遗留：达到。**
  - 依据：6675177331 §3，加 6677346854 的探索器全部场景零违例（`stdio-discover`、`stdio-call` 到达 ended、exited、broken，`sse-fallback` 到达 broken）。
  - 用例 `stdio.spec.ts:235` 与 `http.spec.ts:311`、`:326`、`:347` 断言有界。
- **V1–V6、TLA：达到。** 6677346854：formal3 在分支头复跑，13 份配置、22 个变异全部符合判读，另有 14 个有效动作变异。
- **差分变异：尚无读数。** 第 3 轮卡拥有者裁定在 fix3 最终 head 上只跑一次（`--base 92a8e3cdf --since 720a5d08a`），卡上还没有结果。这是 D 面的事，E 面只记「未交」。
- **结构读数：部分达到。** 6677346854 写「`metrics` 退出 0，哈希 `c5257f3568d35c8a`，本闭包改动函数没有新增超 alert」，两个存量超 alert 有理由。但第 3 轮裁定要求「8 个超 warn 在最终证据里逐条写处置」，卡上只写「在写者交回的第 9 条」，处置原文不在卡上。

## 三、第 3 轮 E 面未达到项复核

- **验收 7 的 PR 正文：** 两类例外已写进正文，已消除。但正文没跟上 fix3，见第四节第 1 项。
- **验收 9 的 head 上 grep：仍未达到。** 缺口如上，承诺过的评论没出现。
- **红灯表 D 节与 D.2 六条：** 卡拥有者已裁定作废或转负控，且 6675946273 更正了 `http-line.ts` 的 4 行，我认为处置成立。D.1 的 4 行已转成负控，在 6677346854 的 23 个负控里。达到（凭裁定）。
- **冲突 6（`vitest.config.ts`）：** host 的已事后纳入。契约的 `vitest.config.ts` 又出现同样情形，见第四节第 2 项。
- **冲突 1–5、7、8：** 仍按卡拥有者「波末写回」维持，卡正文未改。

## 四、冲突项（裁定或修订原文 vs 与之冲突的卡文或规格原句；不是达到或未达到，交卡拥有者）

1. **PR #1138 正文与 fix3 之后的现状冲突。**
   - 正文写「stdio 线路的在途写是计数」「13 个负控入库」。
   - 现状：fix3 删了写计数（`StdioLine.close()` 一律中止写端），负控现为 23 个，还加了缺陷出口、相 → 结局规则归契约。
   - 对应第 2 轮裁定「最终证据与 PR 正文改准」。它不影响验收 7 的两类例外。
2. **契约 `vitest.config.ts`。**
   - 裁定：第 3 轮 D 处置与 fix3 规格写范围，都加了契约 `vitest.config.ts` 的未处理拒绝守卫。
   - 冲突：闭包规格 `w3-mcp-host.md` 写范围对契约只列 `src/`、`tests/`、`SPEC.md`（事后加 `docs/public-api.md`）。host 的 `vitest.config.ts` 也不在原范围。
3. **03:21 裁定（线路断开不动授权发现中的请求）。**
   - 与 `w3-mcp-host-formal3.md` 规格第 3 条「断开之后调用方的等待都放开」冲突。formal3 追加记录已承认「规格的缺陷」，并改读为只对授权中与已交给线路的请求成立。
   - 与 fix3 开头「`dead` 与 `signal`、`close()` 一样只是又一种停」冲突，追加记录已改读。
   - 与闭包规格 `w3-mcp-host.md` 第 4 项「授权发现」条款不冲突。
4. **fix3 规格第 3 项（卡拥有者 05:28 已更正）。**
   - 规格原写：脚本化传输的消费者是 `@omne-harness/mcp` 的 `tests/doubles/`、`memory-store.spec.ts`、`explore.ts`。
   - 更正：真实消费者是调用口分支的 `tests/doubles/peer.ts`。
   - 更正只在卡评论里，fix3 规格正文没改。
5. **第 3 轮结构诊断 / fix3 第 17 条与闭包规格「性质及证据义务」。**
   - 规格原写「`close()` 先关 stdin 写端，再取消 stdout 读取」，暗含优雅关闭。
   - 现规则：一律中止写端，从不等缓冲排空（成员 SPEC H6 已改）。规格原句未同步。
6. **docs3 自裁：成员 SPEC 依据表对契约 SPEC 写「同一分支同批交付」，不钉哈希。**
   - 与卡「依据与实施输入」表头「精确修订/提交及采用状态」、AGENTS「精确版本」冲突。
   - 这一条是否让读者找到唯一依据，留给 B 面判。
7. **第 3 轮 D 处置：「本卡上差分变异对 `mcp-host-local` 与 `mcp-contract` 不下分数结论」。**
   - 与卡「验证方法」表「差分变异 `pnpm run mutation --base <F>`」冲突，且与 `w3-mcp-host.md`「差分变异由 reduce 在最终 head 跑」冲突。
   - 当前约定是读数只当线索，强度证据由负控、TLA 变异与红灯表承担。
8. **仍维持、卡正文未改的前几轮冲突。**
   - 卡 W3 行与 I-04 写「官方 SDK 2.3.1」「只用官方 SDK 的 Transport 层」，与 Q2（HTTP 线路自写、产品源码不导入 SDK）、自裁 1、现行 2.4.0 冲突。
   - 闭包规格已定事项 1「指不出的就复用」，与「规则归契约、不复用 SDK 的 schema 与序列化」冲突。
   - 规格已定事项 36 与 MC3-10 首项「非 JSON 行 → `stream-broken`」，与 F4（丢弃，仅超 16 MiB 断流）冲突。
   - 目标边界「用真实 SDK 服务端夹具跑 `mcpTransportConformance()`」，与 Q3、Q11（A 层自写对端跑套件，B 层证明互通）冲突。
   - 验收 7「原样通过」与 `additive`，与 Q1 的 `wire.spec.ts` 改写、第 2 轮第二类例外冲突。

## 五、给调度者保留的未达到项

1. 验收 2：head 的套件计数贴卡。
2. 验收 9：head 上的 grep 贴卡。
3. 红灯表：fix3 的 10 条用例与新增负控的用例全名与变红摘录；docs3 登记的 `settle` 表守卫变异的处置。
4. 8 个超 warn 的逐条处置原文，以及第 3 轮裁定要求改写的「基线以来的存量」措辞。
5. PR 正文跟上 fix3。
6. 差分变异在最终 head 上的读数（D 面未交）。

子代理的「达到」不是接受。

相关路径：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r3.md`、`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md`、`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/tmp/closures/w3-mcp-host/`。

## A. 正确性与结构读数（implementation-reviewer，opus，high）


### 评审对象与完成程度

- 工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，head `54a2377cb`，基线 `92a8e3cdf`。本轮增量是 `720a5d08a..HEAD`：17 个提交，51 个文件，全部落在 `packages/mcp/mcp-host-local/` 与 `packages/mcp/mcp-contract/` 之内。
- 级别：按 L3 热点处理。
- 简报 A 节的 1–4 条都做完了：
  - 第 3 轮阻断复核。
  - 按相结算的路径搜索。
  - L3 热点逐行读。
  - `lint:deps` 与 `metrics`。
- 探针与输出都在工作树之外，放在 `/tmp/host-r4-a/`：第 3 轮 A、C 探针的副本，加本轮新写的 `scripted-authorize-after-close*.mts`、`line-send-rejects.mts`、`cv.ts`、`intersect.py`。
- 收工时工作树 `git status --porcelain` 为空，head 仍是 `54a2377cb`。我没有改任何受版本管理的文件。这一条是指令约束，宿主没有按路径的写保护。

**本次范围内未发现阻断问题。** 这不等于实现正确，也不等于交付已接受。

### 工具一览

| 入口 | 命令 | 结果 | 输出在哪 |
|---|---|---|---|
| 变更清单 | `git log/diff --stat 720a5d08a..HEAD` | 51 个文件，都在两个成员内 | 终端 |
| 测试与验收的改动 | `git diff 720a5d08a..HEAD -- '*.spec.ts' tests/` 筛删除行 | 删除与改名都对得上裁定，见第 4 问 | 终端 |
| 依赖规则 | `pnpm run lint:deps` | 退出 0：「✔ 没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（81 个成员、343 条成员边；1 个组环按具名例外放行）」 | `/tmp/host-r4-a/lintdeps.log` |
| 结构度量 | `pnpm run metrics --coverage --base 92a8e3cdf` | 退出 0。因为 `pnpm-workspace.yaml` 有改动，按全量跑。`mcp`、`mcp-contract`、`mcp-host-local` 的覆盖率运行退出 0；其他 56 个成员退出 1，与本变更无关，原因没有查 | `/data/qiwei/repos/omne-harness-lite/tmp/metrics/54a2377cb/`（`metrics.json`、`review.html`）；日志 `/tmp/host-r4-a/metrics-54a2377cb.log` |
| 第 3 轮探针在新 head 上复跑 | `node --conditions=source …`，以及 esbuild 打包后跑 | 已无反例，见下表 | `/tmp/host-r4-a/` |
| 本轮新探针 | `scripted-authorize-after-close.mts`（新 head 与 `720a5d08a` 源码各跑一次）、`line-send-rejects.mts`、`cv.ts`（tsc） | 3 个读数，都不构成阻断 | `/tmp/host-r4-a/` |
| 受影响范围的测试 | 我没有重跑，读的是证据 | `docs3/gates/host-fast-72f977c81.log`：159 passed、201 skipped，EXIT 0。`host-slow-72f977c81.log`：240 passed、8 skipped，EXIT 0 | `tmp/closures/w3-mcp-host/docs3/gates/` |
| 全套检查（L2） | 读证据 | `owner-fix3/turbo.log`：3 个包 build、typecheck、test，19 个任务全部成功，exit=0。它跑在哪个 head 上没有记录：运行时间是 04:55:09–04:59:45，`72f977c81` 的提交时间是 04:55:04，我据此推断是 `72f977c81` | `tmp/closures/w3-mcp-host/owner-fix3/` |
| 形式任务与负控（L3） | 读证据，没有重跑 | TLC 12 个 cfg 符合判读，EXIT 0；22 个有效动作变异都符合判读，EXIT 0。负控 23 个全部变红（含 `mB1-session-ended-skips-authorizing`、`mStdio-close-flushes`、`mV6-lineend-settles-discovery`）。探索器慢层 EXIT 0。这些都跑在 `72f977c81` 上；`git diff --stat 72f977c81..HEAD` 在 `src/`、`tests/`、`verification/models` 下只改了 `verification/models/README.md` 一行，所以读数对 HEAD 成立 | `docs3/tlc/run-72f977c81.log`、`docs3/tlc/mutations-72f977c81.log`、`docs3/mutants-run-72f977c81.log`、`docs3/model/` |

### 第 3 轮阻断逐条复核

| 第 3 轮 | 结论 | 证据 |
|---|---|---|
| A-N1：stdio 的 `close()` 等一个不读 stdin 的对端 | **已消失** | **探针 `n1-stdio-buffered-close.ts`**（真实子进程，不读 stdin）：<br>「N1 calls departed: 26 \| node stdin writableLength: 4372 needDrain: false」<br>「N1 close() returned within 3s: **true**」<br>「after SIGKILL … elapsed ms 8」<br>第 3 轮同一探针的读数是 false 与 3012 ms。<br>**实现**：`stdio-line.ts` 的 `close()` 一律 `void this.writer.abort(...)`，`writes` 计数整个删除（grep 无残留）。<br>**用例**：`stdio.spec.ts`「small calls that departed sit in the buffer to a peer that does not read stdin…」。负控 `mStdio-close-flushes` 变红（`mutants-run-72f977c81.log:15`）。<br>**附带**：Q1 两个重叠写，`close()` 3 s 内返回，elapsed 8 ms。 |
| A-N2 / C-B1：会话结束（S07）之后，授权中的请求仍被写上线路 | **已消失** | **探针 `n2-authorizing-after-session-ended.mts`**：<br>「N2 the call that was authorizing: {"failure":{"kind":"not-sent","cause":"connection-unavailable"}}」<br>「…messages the line received after the session ended: 0」<br>**C 的探针 `session-ended.mts`**：「tools/call reached the line after session-ended: 0」；「call: {"failure":{"kind":"not-sent",…}}」。<br>**实现**：`Session.die`（`session.ts:338-344`）对一切原因都经 `lineGoneAnswerOf` 结算；`sendOut` 授权之后只核 `inFlight`，而在途表就是唯一的再核点。<br>**用例**：「a request still being authorized when the session ended (S07) is not-sent and never reaches the line」，负控 `mB1-session-ended-skips-authorizing` 变红。 |
| 第 3 轮 A-NB1（N3）：发现中的请求接受共用流上的应答 | **已消失**，按 03:21 裁定 | 探针 `n3-answer-after-refusal.mts` 现在答「listActions(): "pending"」：结论不再被覆盖，元数据取回挂起时等 `signal` 或 `close()`。`classify` 只对 `sent` 相生效（`session.ts:704`）。用例「a request refused with 401 keeps that conclusion when the shared stream later carries an answer with its id」；手工去掉这行后它变红（`fix3/manual/c-classify-ignores-phase.log`）。 |
| C-P1：脚本化传输没有兑现 T5 | **已消失** | `scripted.mts`：授权挂起或慢授权之后触发 `signal`，都答 `not-sent`（`connection-unavailable`），peer received `[]`。`scripted-close.mts`：「close returned; listActions: {"failure":{"kind":"not-sent",…}}」。第 3 轮这两处都是 pending 500 ms。 |

其余第 2 轮探针也在新 head 上复跑：
- Q2a、Q2b、Q2c：都在界内结算，`reportRejection` 调用 1 次，Q2c 对端没有见过请求。
- P1：`answer` 是 `abandoned`。
- P2：`close` 之后答 `authorization-required`（`metadata: unavailable`）。
- C 的 `authz.mts` 与 `writing.mts`：都已修复，`writing` 1 ms 关闭。

### 简报第 2 条：按相结算

- 契约的 `stopAnswerOf` 与 `lineGoneAnswerOf`（`decisions.ts:423`、`:447`）对三相都有 `case`，并有 `never` 穷尽守卫。`lineGoneAnswerOf` 对每个相与每个原因都给出一个结论或 `undefined`（不动）：
  - `authorizing`：一律 `NOT_SENT`。
  - `sent`：`session-ended` 时不动，其他原因答 `streamGoneAnswerOf(cause)`。
  - `discovery`：不动，与 03:21 裁定一致。
  - 契约单元用例 `decisions.spec.ts:755-787` 逐个原因核对。
- 会话只经这两个函数结算：`stop`（`session.ts:320-331`）与 `die`（`:338-344`）。脚本化传输同样：`stop`（`testing-scripted-transport.ts:393-402`）与 `unusable`（`:405-411`）。
- 逐个找过仍会让调用方等一个端口、或答复与规则不一致的路径：
  - `call` 的先到者竞速；
  - HTTP 已交出但应答头未到时的 `stop`；
  - stdio 写挂在满管道时的 `signal`（`aborted` 之后报 `broken`，再经 `die('stream-broken')`）；
  - `enterSse`、`refusedGet`、`notifications/initialized` 都在 `untilClosed` 之下；
  - 断开之后再发：`begin` 拒绝登记，读类再发也经同一处被拒；
  - 缺陷经 `work` 按相结算。

  没有找到反例。发现中的请求在断开后仍要等取回、`signal` 或 `close()`，这正是 03:21 裁定的有界条件。

### 阻断

无。

### 非阻断

1. **脚本化传输的 `cancelRequest` 另写了一条结算分支**（检查表第 10 问）。
   - 位置：`testing-scripted-transport.ts`，`cancelRequest` 在 `entry.phase.kind !== 'sent'` 时 return，否则直接 `this.settle(entry, { wire: ABANDONED })`。
   - 会话的做法是经 `stop(entry)` 交给 `stopAnswerOf`（`session.ts:957-959`）。
   - 后果：今天两者结局相同。但简报第 2 条要求「只经它们决定，不另写分支」，相 → 结局的规则一旦改动，这一处不会跟着变。会话还对授权中、发现中的项按相结算，脚本化传输则忽略这两相。
   - 实施者要做：改为调用 `this.stop(entry)`。确实要限定 `sent` 相的话，写明理由。
2. **契约成员里 `ScriptedTransport.unusable` 的覆盖是 50%**（度量 `54a2377cb`，CC 3，CRAP 4.1）。
   - 从读数推断，`lineGoneAnswerOf` 答 `undefined` 的那一支没有在脚本化传输上被执行过。也就是说，没有一条套件用例让脚本化传输在 S07 之后留下已发出的请求。
   - 契约单元用例覆盖了规则本身，缺的是替身「不动」那一支的执行。不超线，只列出来。

### 结构读数（只摘 `720a5d08a..HEAD` 改动的函数）

- 统计方法：`git diff -U0 720a5d08a..HEAD` 在两个成员 `src/` 下的 hunk，与 `metrics.json` 的函数行区间求交，共 72 个函数，**全部 `ok`：超 alert 0 条、超 warn 0 条**。
- 最高的五个：

  | 函数 | CC | 覆盖 | CRAP |
  |---|---|---|---|
  | `withheld.ts:87 headerDeclarationInvalid`（第 3 轮 CC 19） | 10 | 100% | 10 |
  | `ScriptedTransport.deliver` | 9 | 85% | 9.3 |
  | `StdioLine.send` | 9 | 100% | 9 |
  | `Session.dispatch` | 8 | 91% | 8.05 |
  | `Session.enterSse` | 8 | 100% | 8 |

- 本轮新加或改动的关键函数：

  | 函数 | CC | 覆盖 | CRAP |
  |---|---|---|---|
  | `stopAnswerOf` | 5 | 67% | 5.9 |
  | `lineGoneAnswerOf` | 6 | 67% | 7.3 |
  | `fallbackGetConclusionOf` | 2 | 100% | 2 |
  | `Session.die` | 3 | 100% | 3 |
  | `Session.stop` | 5 | 100% | 5 |
  | `Session.sendOut` | 7 | 100% | 7 |
  | `Session.classify` | 4 | 100% | 4 |
  | `Session.pump` | 5 | 89% | 5 |
  | `Session.work` | 2 | 100% | 2 |
  | `StdioLine.close` | 2 | 100% | 2 |
  | `declarationInvalid` | 6 | 100% | 6 |
  | `fetchOrNothing` | 2 | 100% | 2 |

  `stopAnswerOf` 与 `lineGoneAnswerOf` 没覆盖的只有 `never` 穷尽守卫，读出来不可达。
- 自基线以来的全部变更函数（度量摘要）：超 alert 2 条、超 warn 8 条，都不在本轮改动里。
  - 超 alert：`wire.ts:301 resultClassOf` CRAP 17.2；`decisions.ts:329 probeErrorConclusionOf` CRAP 13.8。
  - 超 warn：`exchangeConclusionOf` 11、`httpErrorWireOf` 11、`concludeProbe` 11.6、`discoverWith` 10.3、`readDiscoverResult` 11、`taskReadOf` 10.8、`eventOf` 11.1、`StdioLine.readStdout` 11。
- 检查表第 11 问的对照：
  - 卡评论 6677346854 写了 `headerDeclarationInvalid` 已拆开（读数确认是 CC 10）。另外两个 alert 的理由也写了：是判别表，未覆盖的只有 `never`。
  - 8 个 warn 的读数，评论说「在写者交回的第 9 条」。这份交回我在本工作树里没有找到原件，**未核对**。fix3 规格写的是「不改，给读数」，读数本身在上面。
- 度量摘要报「dist 早于源码 1 个」。两个 mcp 成员的 `src/*.ts` 都没有比各自 `dist/index.js` 新的文件，`find -newer` 为空。所以被报的不是这两个包的代码，可能是别的成员，或 `src/index.md`。

### L3 热点逐项结论

- **凭据句柄：成立。**
  - 唯一入口是 `callHandle`（`session.ts:396-406`），它在调用前同步核 `closed`。`authorize` 另核 `usable`。
  - `refusalOf` 只经两处被同步到达：
    - `classify` → `apply` → `enterDiscovery`。这只在 `sent` 相的在途项上发生，而 `close()` 已经同步结算了全部在途项。
    - `enterSse` 的 `usable` 核对 → `enterFrom` → `refusedGet` → `refusalOf`。两步之间没有 `await`。
  - `authorized` 标记删掉之后，「只对授权过的请求报告拒绝」靠结构保证：凡是到了 `sent` 相的项，都经过 `sendOut` → `authorize` → `callHandle` 并返回 true；回退 GET 则先经过 `authorizedToWrite`。
  - 每个在途项至多进一次 `enterDiscovery`，因为进入后相已变成 `discovery`，`classify` 不再作用。所以至多报告一次。探针 Q2b 与 P2 的计数都是 1。
  - 头不进答复与错误：`Answered.headers` 只取应答头。`failedExchange`（`http-line.ts:50-54`）只返回 `{kind}`，不带请求或 `Headers`。元数据取回不经句柄。
- **`StdioLine.close()`：成立。** 它一律中止写端（`void writer.abort`），再取消 stdout 与 stderr 的 reader，等两个读循环结束，最后 `queue.end()`。完成只依赖本地资源，写计数已删除。N1 探针 8 ms 返回。
- **缺陷出口：会话自己的后台工作与事件处理成立，但线路 reject 不走这里（见「范围外待裁决」）。**
  - `work` 的 catch 先按相 `stop` 再交给 `reportDefect`（`session.ts:301-306`）。
  - `pump` 里 `onEvent` 抛出时交给 `reportDefect`，读循环继续（`:357-367`）。`consume` 的 `try` 只包住迭代。
  - 用例组「a defect of the session goes to the defect outlet」有三条。
  - 工厂的缺省是 `queueMicrotask(() => { throw defect })`（`factory.ts:28-32`）。
  - `events.next()` reject 时 `pump` 直接 return，不调用 `die`。生产的两条线路的事件队列从不 `fail`（只有 `memory-line.ts:303` 的消息流用 `fail`），所以读出来不可达，不列为发现。
- **`ConnectionView` 判别联合：部分成立。**
  - `cv.ts` 经 tsc 核对：`{kind:'stdio', mode:'sse'}` 字面量报 TS2353；`streamable-http` 缺 `mode` 报 TS2322。
  - 仍写得出、而现实中不会出现的组合是 `{ kind: 'streamable-http', version: '2026-07-28', mode: 'sse' }`，tsc 通过。SSE 模式只经旧一路进入，版本必是旧修订。两条规则对它的结论都与「旧」一致，没有可观察的差异。归入「超出已要求的需求」。

### 检查表其余各问

- **第 1、3 问**：没有越出写入范围。纯移动提交 `a918b41ed` 单独提交。
- **第 4 问**：测试的删除与改名都对得上卡拥有者在 `mcp-host-r3.md` 里的裁定。
  - `lines.spec.ts`「two overlapping writes…」改名，断言从「被中止」改为「答 `aborted`」：对应 A-N1 裁定。
  - 负控 `mStdio-writes-boolean` 退出、`mStdio-close-flushes` 加入：对应 A-N1 裁定。
  - `session.spec.ts`「a workflow that fails unexpectedly…」换成「a metadata fetch that throws at every address…」：对应 C-NB7（取回抛出改由 R4 承担，不再靠 `work` 兜底）。
  - `properties.ts` 的 V6 改写，变异 `V4-gone-leaves-discovery` 换成 `V6-dead-settles-discovery`：对应 03:21 裁定。
  - 没有发现跳过标记，也没有被放宽的断言。
- **第 6、7 问**：没有发现只执行不断言的新用例。没有红转绿需要归因。
- **第 8 问**：`lint:deps` 无违规。
- **第 12、13 问**：没有发现。

### 范围外待裁决

- **线路 reject 变成了调用方的答复，不进缺陷出口。**
  - 探针 `line-send-rejects.mts`：线路 `send` reject 时，输出「listActions: {"failure":{"kind":"no-answer","cause":"stream-broken"}} | sends: 2 | defects reported: 0」。也就是当作 `aborted`，读类按 D15 再发一次，`reportDefect` 0 次。
  - 位置：`session.ts:614-619`。`write` 的 catch 是同一类做法。
  - 成员 SPEC「失败的处置」（`SPEC.md:187`）明写「会话把发送请求时的 reject 当作 `aborted`」，所以实现与 SPEC 一致，不算发现。
  - 但这与简报 L3 第 3 条「缺陷……不变成调用方的答复」相冲突。是否改为走缺陷出口，交卡拥有者或 design-reviewer 裁定。生产的两条线路读出来都不会 reject，这条路径今天不可达。

### 未覆盖

- 负控、TLC、探索器、受影响测试都只读了证据，没有重跑。`owner-fix3` 的 turbo 运行在哪个 head 上，是从时间推断的。
- 卡评论所说 8 个超 warn 的「写者交回第 9 条」不在工作树里，没有核对。
- 转 D 面：docs3 交回所列「红灯表 B 节存活的 `settle` 表守卫变异没在现行代码上重跑」。
- 转 E 或 B 面：契约慢层 262 条 skipped，文档没有写成慢层覆盖。
- 与 `@omne-harness/mcp` 和调用口分支的真实组合没有运行。卡拥有者裁定在 host 同步父分支之后再跑一次。
- 度量里 56 个其他成员的覆盖率运行退出 1，原因没有查，与本变更无关。

### 超出已要求的需求

- **脚本化传输在 `close()` 之后仍会调用 `authorize`。**
  - 原因：`ScriptedTransport.authorize` 经 `Promise.resolve().then(...)` 推迟了一个微任务。
  - 探针 `scripted-authorize-after-close.mts`：「call: not-sent … handle calls: ["authorize-after-close"] | peer received: []」。在 `720a5d08a` 的契约源码上输出相同，所以不是本轮回归。
  - 契约 T9 限定的是在什么时候调用句柄，没有写「`close()` 之后不调用」；H4 与 V2 只约束 host-local。我找不到一条约束替身的条款。
  - 改法：调用前同步核 `closed` 与在途表，让替身对调用口用例的「释放之后不再调用」不报假红。
- **脚本化传输的 `close()` 不是单飞**：第二次调用在第一次等待 stdin 关闭期间就返回了。T5 写的是「每次调用都在同一次关闭完成后返回」。这是存量，替身也不写 stdin，所以不可观察。
- **`ConnectionView` 仍写得出 `streamable-http` + `mode:'sse'` + 现代版本的组合。** 可以把 `sse` 变体的 `version` 限为旧修订或 `undefined`，让这个组合写不出来。
- **缺陷出口能经 `SessionOptions` 注入，但 `LocalTransportOptions` 没有对应的选项**，工厂写死了「抛出」的缺省。按策略不写死的原则，可以开放给宿主注入。裁定只要求了 `SessionOptions` 注入，这条不作阻断。

### 观察（不是发现）

- 会话的 `die` 结算 `sent` 相的项时走 `settle`，不中止那一项自己的应答流。流只在正文结束或 `close()` 时释放。SSE 模式下 POST 正文通常为空，我没有构造出可观察的后果。


## B. 表达（design-reviewer，expression，opus，xhigh）

本次做的是「表达」判断。判据页只读了一页：`/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/.claude/skills/harness-design-handbook/references/review/expression.md`。这是宿主生成的镜像，不是 canonical 源。

**评审对象、范围与完成程度**
- 对象：PR #1138，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`。head 已核为 `54a2377cbcf02ff4af63944afabbed8857ae4dff`：`.git/worktrees/w3-mcp-host/HEAD` 指向 `refs/heads/PanQiWei/skill-mcp-w3-mcp-host`，该 ref 的值就是这个提交。
- 范围：`720a5d08a..HEAD` 的文档部分。我没有 git，跑不了 diff，只能用下面四样代替「本轮改动」：
  - fix3 交回列出的 hunk：成员 SPEC `:76–79`、`:170–196`、`:229–231`，以及契约 SPEC 的 9 项；
  - formal3 改动的 `verification/models/`；
  - docs3 交回列出的 11 个文件；
  - 派发者在 `54a2377cb` 改的两个文件。
- 读过的文件：
  - 简报清单中成员的 SPEC、README 与 README_ZH、`src/index.md`、`docs/architecture.md`、`docs/flows.md`、`docs/object-model.md`、`tests/index.md`、`tests/fixtures/README.md`、`verification/README.md`、`verification/models/README.md`，都按现文读完；
  - 契约 SPEC 的裁定三表、三个入口、R4、T1–T9、组合与验证、未覆盖，以及契约 `docs/public-api.md`；
  - 为核对名字与映射，读了 `run.py`、`TransportSession.tla` 的不变式与断开动作、`mutants.ts`、`properties.ts`，以及 `decisions.ts` 的 `stopAnswerOf`、`lineGoneAnswerOf`、`UnusableCause`。
- 工具输出：简报附了 `tmp/closures/w3-mcp-host/owner-docs3/` 里的两份日志。
  - `check-docs.log`：`PASS: 2738 Markdown files; local links and skill mirrors.`
  - `check-design.log`：`PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。`
  - 两项只核链接、镜像与拥有者，不核锚点指向的条款对不对，也不核语义。我没有重跑。

**结论：本次表达与规范范围内未发现阻断问题。** 最接近阻断的是非阻断 1（H14 的「四个注入点」），我判了非阻断，理由写在那一条里。因为这是最后一个关口，非阻断 1–5 建议在最后一轮修复里一并带走。

---

## 阻断

无。

## 非阻断（按影响排序）

**1. 「会话只经四个注入点产生效果」漏了缺陷出口**（建议最后一轮带走）
- 类别：跨契约一致（同一份 SPEC 内）、完整性。
- 位置：
  - 写「四个」的地方：成员 SPEC 自定 2（`SPEC.md:44`）、H14（`:116`「只经四个入口」）、「对象与参与者」（`:225`）、`docs/architecture.md:34`；
  - `docs/object-model.md:17` 列出的 `SessionOptions` 没有 `reportDefect`；
  - 同一份 SPEC 的 `:175`、`:187` 写了第五个出口 `SessionOptions.reportDefect`，工厂缺省在 Promise 之外抛出；
  - 代码：`src/session.ts:113`、`:304`、`:365`，`src/factory.ts:28–32`（`queueMicrotask(() => { throw defect })`）。
- 依据：表达页的「跨契约一致」与「完整性」。
- 触发场景：后台工作流或事件处理里出现缺陷时，会话产生了四个点名端口之外的效果：抛给宿主的未捕获处理。
- 后果：读者按 H14 以为测试替身只需要四样，按自定 2 以为效果面已经列全。缺省出口在 Node 默认会让宿主进程终止，这一效果在 H14 的清单里看不到。
- 为什么判非阻断：会话仍然只调用注入的 `options.reportDefect`。H14 这条不变式本身没有被打破，即会话不直接产生全局效果、测试可以排定次序；探索器也注入了它（`tests/model/explore.ts:322`）。过时的只是枚举。
- 作者需明确：上述四处改为五个注入点，写明 `reportDefect` 是缺陷出口、缺省由工厂给出（与 `schedule` 的缺省同形）；或者写明它为什么不算效果入口。`object-model.md:17` 同步。

**2. `docs/object-model.md` 仍写着第 3 轮之前的关闭规则与已删除的字段**（建议最后一轮带走）
- 类别：跨契约一致。
- 位置与原句：
  - `:41`：「stdio 线路等两个读循环结束后才返回，有未完成的写时中止写端」。H6（`SPEC.md:79`）是「中止 stdin 写端……从不等缓冲排空」，`src/index.md:13` 是「关闭时一律中止写端」。
  - `:15`：Pending 带「授权标记」，并把「探测计时的取消函数、stream.abort」列为 Pending 的字段。同一文件 `:25` 写的是它们随 `sent` 相；fix3 已删去 `authorized`。
- 依据：H6、第 3 轮结构诊断（`close()` 是放弃，没有优雅一支）。docs3 交回第 4 节称这两处已改，现文不符。
- 触发场景：维护者按对象模型修改 `StdioLine.close()`。
- 后果：「只在有未完成的写时才中止」正是第 3 轮 A 阻断 1（N1）的旧前提，照它改会重新引入等待不读 stdin 的对端。
- 作者需明确：`:41` 按 H6 改写；`:15` 与 `:25` 统一。

**3. 契约 T5 的 stdio 一句与成员 H8 仍写「其他在途请求答 no-answer」，没有按相限定**（建议最后一轮带走）
- 类别：跨契约一致、表达歧义。
- 位置：
  - 契约 `SPEC.md:485`：「写还没有完成时，传输中止 stdin 写端，这是流断开（S01、S03）：其他在途请求答 `no-answer`（`stream-broken`）」。
  - 成员 `SPEC.md:88`（H8 的 stdio 一项）：「在途请求答 `stream-broken`」。
  - 对照：本轮新加的 T8 前言 `:514` 与 S01–S04 `:566–569` 写的是按 `lineGoneAnswerOf` 结算，授权中的答 `not-sent`（`connection-unavailable`），授权发现中的不动；成员「线路断开」`:184` 与 V6 `:239` 也是这样写。
- 依据：T1 `:453`（`not-sent` 表示没有对端效果），T5 `:480` 的三相分界。我无法确认 `:485` 与 `:88` 是不是本轮改的；列入是因为它们与本轮新增的正文字面冲突。
- 触发场景：stdio 上一次写被 `signal` 中止，或一行越过上界时，另一个请求处在「未交出」相。本会话里授权中只持续一个微任务；写端排队的第二个 stdio 实现里，这一相会更长。
- 后果：照 T5 字面实现，会对对端没见过的请求交出 `no-answer`。方向偏保守，所以非阻断。但它和第 3 轮 NB-1 是同一类，T8 前言修好了，T5 这一句没有跟上。
- 作者需明确：两处都改为「已交给线路的请求答 `no-answer`（`stream-broken`），其他在途请求按相结算（`lineGoneAnswerOf`）」，或者改为指向 T8 前言。

**4. X02 被列进「按相结算其他在途请求」的行，但契约没有写它的原因**
- 类别：完整性、可实施性。
- 位置与原句：
  - 契约 T8 前言 `:514` 把 X02 列在「写『传输不再可用』的行（S01–S04、S07、X02）」里，却只写了流断开、进程退出与 S07 下已交给线路的请求的去向。
  - X02 行 `:574` 本身没有「其他在途请求按相结算」。
  - 裁定 15 `:103` 与 `lineGoneAnswerOf` 的文档注释只列 S01–S04、SSE 模式、S07。
  - 实现 `decisions.ts:141–142`：stdio 上的 `unsent` 以 `stream-broken` 让传输不可用。
- 依据：表达页的「可实施性」。
- 触发场景：stdio 写请求时管道已断，同时还有已写出、在等应答的请求。
- 后果：第二个实现者不知道这些请求答 `stream-broken`、`process-exited`，还是别的。
- 作者需明确：X02 行与前言写明其他在途请求的原因是 `stream-broken`，裁定 15 补上 X02；如果 X02 本不该在这个列表里，就删掉。

**5. 契约「未覆盖」没有登记 T8 前言新加的义务**
- 类别：形式对应（条款 → 验证）、完整性。
- 位置：契约 `SPEC.md:699–713`。T8 前言新加了「其他在途请求按相结算」，对象是 S01–S04、S07、SSE 共用流与 X02。
- 证据：
  - 套件生成的 T8 用例每格只跑一个请求（`src/testing-transport.ts:1252–1283`），也没有 T8 的手写用例；
  - 成员一侧有用例：`session.spec.ts:1619`「leaves another request of the session in flight when one is told the session ended (S07)」、`:1923`，以及进程退出与 SSE 断开的按相用例。
- 依据：第 3 轮 NB-6 的处置口径（契约套件不补，登记到「没有手写用例」，并指向成员的用例）。
- 后果：契约读者看不出这条义务有没有证据。第二个传输即使违反它，套件也是绿的。
- 作者需明确：照 `:709` 的写法列进「没有手写用例」，并指向 `@omne-harness/mcp-host-local` 的用例。

**6. V4 前提的 HTTP 一半指向 H6，但 H6 只写了 stdio**
- 类别：引用与归属、形式对应。
- 位置：
  - V4 `SPEC.md:237`：「stdio 与 HTTP 各自兑现的方式见 H6」；
  - `:228`「（V4 的前提，见 H6）」；
  - `docs/architecture.md:36`。
  - H6 `:79` 只写了 `StdioLine`。HTTP 一半只出现在「关闭」`:183` 的括注「HTTP 中止全部交换」里。V4 证据行 `:248` 与 `verification/README.md:132` 只列了 stdio 的负控 `mStdio-close-flushes`。
- 后果：「HTTP 线路的 `close()` 不等对端」这一半前提，读者既找不到兑现条款，也找不到证据。
- 作者需明确：HTTP 一半指向 `:183`（或者为它立一条 H）；证据一列点名 `http.spec.ts` 里覆盖它的用例，没有就写「未验证」。另外，V4 的「这一条的前提」只约束 `close()` 返回的那一句，`signal` 的结算不依赖它，措辞应把范围写窄。

**7. 名字对照的全称句写宽了；`mB1` 的归属三处不一致**
- 类别：形式对应、表达歧义。
- 位置：
  - 成员 `SPEC.md:232` 与 `verification/models/README.md:64` 都说负控名在三处相同。可是探索器与用例的负控（`mV*`、`mB1`、`mStdio-*`、`mHttp-*`）按设计不出现在 `models/README.md`。
  - `tests/model/mutants.ts:214–215` 写 `mB1-session-ended-skips-authorizing` 破坏的是 `'T8 S07, T1'`；SPEC `:250` 与 `verification/README.md:134` 把它放在 V6，V2 行（`:246`、VR `:130`）又提到它。
- 作者需明确：这句改窄，例如「TLC 负控、变异与不变式名在三处相同；探索器负控名在本节、VR 与 `mutants.ts` 相同」；`mB1` 的 `breaks` 与文档的归属统一。

**8. 两份 TLC 运行记录对不上**
- 类别：形式对应（证据绑定）。
- 位置：
  - `verification/README.md:117` 引的是 05:02 在 `72f977c81` 上重跑的那一次（日志 `e472fec0…`），逐项结果指向 `models/README.md#运行记录`。
  - `models/README.md:114–136` 记的是 03:22 那一次。两次模型 SHA 都是 `3915573bc0e87f8a`。
  - 负控读数不同：`bad-ended-sends-authorizing` 在 `models/README.md` 是 451 个不同状态、785 个生成状态、深度 7；05:02 的 `docs3/tlc/20261106T050221Z/summary.json` 是 495、873、深度 6。`:134` 写「反例有 6 个状态」。
- 后果：读者拿 VR 引的日志去核逐项表，数对不上。正控相同，所以只影响负控。
- 作者需明确：两处记同一次运行；或者 VR 写明逐项表来自哪一次。

**9. 仓库里解析不了的过程引用**
- 类别：引用与归属。
- 位置：
  - `verification/models/README.md:54`「（评审 B1 的形状）」、`:88`「（评审 B1：…）」、`:79` 与 `:80`「修订前的规则」；
  - 契约 `SPEC.md:87`「闭包 `w3-mcp-host` 第一段，reduce 裁定」，这一句本轮改过。同一句与依据表 `:14` 写「2026-11-05」，而第 15 条来自 2026-11-06 的 fix3。
- 依据：「编号要能在仓库里解析」，见 docs3 规格实施规格，也是第 3 轮 NB11 的口径。
- 作者需明确：改成说缺陷本身，或者指向仓库里的条款。

**小项（都不阻断）**
- 成员 `SPEC.md:175`「（下一条的表）」失效了：「取消」一条已经不再列结局表，规则在 `stopAnswerOf`、V6 与 T5。
- `TransportSession.tla:425` 的注释仍是旧标题「V2 关闭之后不碰凭据」，SPEC 是「V2 关闭、断开之后不碰凭据与线路」。
- `verification/README.md:70`「两种断开……两者」指代不清：前半句说的是 `stream-broken` 与 `process-exited`，后半句的「两者」像是指 `LineGone` 与 `SessionEnded`。
- `verification/README.md:76`「如 `line.ts` 所承诺」把元数据取回也算了进去，但它的端口是 `SessionOptions.fetchMetadata`。
- `verification/README.md:67` 把 `cancelRequest`「当即返回」称为「本包自定」，它不在自定 1–9 里；出处是「取消」`:182`。
- V6 行的探索器一列：`LineEndCause` 只含 `stream-broken` 与 `process-exited`（`properties.ts:35`），所以探索器的 V6 不覆盖 S07。S07 下已交给线路的请求不动，只有 TLA 变异 `V6-ended-abandons-sent` 与用例 `session.spec.ts:1619` 承担，V6 行没有点名这条用例。
- 成员「兑现的契约条款」表（`:24–35`）没有一行把 T8 前言的按相结算指向所有权一节「线路断开」。

---

## 第 3 轮账本（NB-1～NB-7 与小项）

| 项 | 结论 | 位置与说明 |
|---|---|---|
| NB-1 | 已改；有残留 | 契约 T1 `:453`、T8 前言 `:514`、SSE 段 `:516`、S01–S04 `:566–569`、S07 `:572`；成员「线路断开」`:184`、V2 `:235`、V4 `:237`、V6 `:239`；`flows.md:52`、`:59`、`:67`；VR `LineGone` `:37`、`SessionEnded` `:38`，`Broken(r)` `:36` 不再承担线路级断开；TLA `LineGone`、`SessionEnded`、`V6_ByPhase` 的断开部分；探索器 V6 的 lineend；负控 `mV6-lineend-keeps-authorizing`、`mB1-…`、`mV6-lineend-settles-discovery`。残留：契约 T5 `:485` 与成员 H8 `:88`（非阻断 3）；X02（非阻断 4） |
| NB-2 | 已改 | 成员 `:228`「元数据取回收到 `signal`，会话不依赖它遵守」；`:181`；V1 `:234` 的可观察形式补上了元数据取回；H11 `:104`；契约 R4 `:298`；VR `:76` 写了「已答 hang 的调用除外」，与 `:228` 一致（措辞小项见上） |
| NB-3 | 已改；有残留 | `:228` 把 `close()` 单列；V4 前提 `:237`；H6 `:79`；自定 9 `:51` 补了两处例外；`:175` 改为「关闭时收场」；`architecture.md:36`。残留：HTTP 一半的指针（非阻断 6） |
| NB-4 | 已改 | 契约裁定 11 `:99`，第 12、13、15 条列为行为改动，并写了各自改了什么 |
| NB-5 | 已改 | `.` 行 `:113` 只指向 `tests/public-entry.spec.ts` 与 `public-api.md`；`./testing` 行 `:115` 与 `public-api.md:11` 都写「六个符合性套件（五个需求端口各一个，另有传输的一个）」 |
| NB-6 | 已改；同类新缺口 | `:704` 授权中的两条套件用例（用例名前缀）；`:709` 授权发现中的结局与 `close()` 不等挂起的端口；`:710` 元数据取回不带凭据头。T8 前言的新义务没有登记（非阻断 5） |
| NB-7 | 已改 | T5 `:480` 的分界与传输无关；T1 `:453` 的 `no-answer` 覆盖「已交出、未必已离开」；`InFlightPhase` 的文档注释与之一致 |
| 小项 `:204` V2–V6 | 已改 | 现 `:200` 写 V1–V6 |
| 小项 `:30`「不发」 | 已改 | `:30`「T5 不要求发 DELETE，本包不发」 |
| 小项 VR `cancelRequest` | 已改 | VR `:67` 改引成员 SPEC「取消」（标签小项见上） |
| 小项：按相结局表复述 | 已改，留一个失效指针 | 「取消」`:176` 与「关闭」`:183` 指向 V6 与 T5；「失败的处置」`:187` 写 `stopAnswerOf`；「线路断开」`:184` 只写怎样兑现。`:175`「（下一条的表）」失效 |
| 小项 README | 已改 | `README.md:62`、`README_ZH.md:61` 指向 `#properties`；目录图 `README.md:83`、`:85`，`README_ZH.md:82`、`:84` 补了 `model/` 与 `verification/models/` |

## 简报另核的各项

1. **相 → 结局的规则说法是否一致。**
   - 停止与关闭一致：契约 T5 `:480–486`、裁定 12 `:100`；成员「取消」`:176–182`、「关闭」`:183`、端口失败模型 `:228`、V4 `:237`、V6 `:239`；`flows.md:69–70`、`object-model.md:40`、`models/README.md:27`、`V6_ByPhase`。
   - 线路断开一致：契约 T1、T8 前言与 SSE 段、S01–S04、S07、裁定 15；成员「线路断开」、V2、V4、V6；`flows.md`、VR、`models/README.md:29–34`、TLA；且符合 03:21 裁定：发现中的不动，V4 的断开子句只管两相。
   - 例外三处：契约 T5 `:485` 与 H8 `:88` 没有按相限定（非阻断 3）；X02 的原因没写（非阻断 4）；V4 前提的 HTTP 指针（非阻断 6）。
2. **性质、不变式与负控名在四处是否一致。** 一致：
   - V1–V6 的标题；
   - 9 个不变式：SPEC 证据表、VR `:136`、`run.py:40–54` 与 `:58–149`、`.tla` 一致；
   - 10 个 `bad-*`、22 个变异：SPEC、VR、`models/README.md:40–93`、`run.py` 一致；
   - 23 个探索器与用例负控：SPEC、VR 与 `mutants.ts` 一致。
   - 例外：非阻断 7 的全称句与 `mB1` 归属；`.tla:425` 的旧标题。
3. **「同一分支同批交付」能否让读者找到唯一依据。**
   - 现状下可以，判非阻断。在同一个提交里，相对链接 `../mcp-contract/SPEC.md` 只解析到一个文件，范围列又钉了 T1–T9、R4 与裁定 1–15，所以依据可定位、唯一。
   - 弱点在合并之后。「分支」「批」是过程词，不随提交留存。契约以后单独改动时，读者在 main 上读到这句，分不清成员当时是对哪一版契约核对的。另外，同一张表的其他行仍钉哈希，两种写法混在一起。
   - 建议改成随提交成立的说法，例如「与本页同一提交的契约 SPEC」，并在维护一节写明「契约 T1–T9、R4 或裁定表变化时重核本页」。契约 `:87`「闭包 w3-mcp-host 第一段」是同类的过程引用（非阻断 9）。约定本身怎样定，见「范围外待裁决」。

## 范围外待裁决

- **同一 PR 内跨成员依据的修订怎样写**，归文档治理（`docs/engineering/documentation.md:72`「适用修订」）的拥有者，或由卡拥有者定。三种做法各有代价，这里不代选：
  - 钉哈希：每轮修复都会过时，第 3 轮 NB6 就是这样来的。
  - 写「同一提交」：任何提交上都唯一，但契约以后单独改动时，留不下「当时核对的是哪一版」。
  - 接受时钉一次：要多一个收尾动作。

## 未覆盖

- 没有 git。改动范围只能用交回清单代替 diff。非阻断 3 里的 `:485` 与 `:88` 可能是旧文字，列入的理由已写明。head 已用 `.git` 的 ref 核实。
- 没有读的文件：成员的 `docs/context.md`、`docs/cordis.md`、`docs/public-api.md`、`tests/README.md`、`verification/proofs/sdk/README.md`（docs3 称没改）；契约 SPEC 中 T 节、R4、裁定、入口与组合以外的部分。`session.spec.ts` 与 `http.spec.ts` 的用例名只抽查了几条。
- 运行读数一律没有复跑。只读了 TLC 05:02 的 `summary.json`，没有核任何日志的哈希。不替任何「通过」背书。
- 转交：
  - `UnusableCause = NoAnswerCause | 'session-ended'`（`decisions.ts:71`）能取 `'abandoned'`，而 SPEC 与文档注释只定义了三种原因：转 C。
  - 缺省缺陷出口在宿主里的后果（Node 默认会终止进程），以及消费者能否替换它：转 C。
  - 探索器的 V6 不覆盖 S07；`session.spec.ts:1619` 有没有对应的负控：转 A 或 D。
  - docs3 记下的红灯表 B 节 `settle` 守卫变异没有在现行代码上重跑：转 D 或 E。

## 超出已要求的需求（不计阻断）

- 在 README 的「Contracts」或「Configuration and operation」写一句：内部缺陷以未捕获异常的形式交给宿主。理由：这是消费者在运维上看得到的失败去向，现在只写在 SPEC `:175`。
- 是否让 `LocalTransportOptions` 允许替换缺陷出口。理由：宿主可能想把缺陷记日志，而不是终止进程。属于 C 面的设计取舍。
- 探索器的 `LineEndCause` 加上 `session-ended`，让 V6 的 S07 一支也有探索器证据。理由：现在只有 TLA 与一条用例承担。
- `docs/architecture.md`「关键机制」补一条缺陷出口。理由：机制已经在 SPEC 里，内部设计文档没有。
- `./testing` 的清单在 SPEC `:115` 与 `public-api.md:11` 各列了一遍，现在一致，可以只留一份。理由：唯一源。

## 各项的拥有者

- 契约 SPEC 的拥有者（T 段由本分支按卡拥有者的裁定维护）：非阻断 3 的 T5 部分、4、5、9 的契约部分。
- 本成员的维护者：非阻断 1、2、3 的 H8 部分、6、7、8、9 的 `models/README` 部分，以及全部小项。
- 文档治理的拥有者：依据修订的写法。

本报告不表示规格已被接受，也不表示证据已核实或实现已验证。

## C. 设计与实践（general-purpose，opus，high，只看新形状与新生命周期）


我只评了简报 C 节列出的四处，范围是 `720a5d08a..54a2377cb`。全程只读：收工时工作树 `git status --porcelain` 为空，head 仍是 `54a2377cb`。判据用了 ub-mode、`pstack:typescript-best-practices`、`docs/defensive-patterns.md`。

探针放在工作树之外的 `/tmp/c-r4-probe/`，共三个：`pump-reject`、`caller-value`、`close-fullpipe`（另有 `child-late-reader.cjs`），各有 `.mts` 源码和 `.out` 输出。运行方法：在 `packages/mcp/mcp-host-local` 目录执行 `node --conditions=source /tmp/c-r4-probe/<名>.mts`。

## 四处的结论

**1. `stopAnswerOf`、`lineGoneAnswerOf`（`mcp-contract/src/decisions.ts:423`、`:447`）**
- 两个函数都对 `InFlightPhase` 的三相做 `switch`，`default` 分支用 `const exhaustive: never` 收尾，相这一轴由类型守住。
- 结局与下列条款一致：契约 T5 第 480 行、T8 第 514 行与 S07 行、03:21 裁定。
  - 授权中：答 `not-sent`。
  - 已交出：`signal` 与 `close()` 下答 `abandoned`；线路断开时按原因答 `no-answer`，会话结束时不动。
  - 授权发现中：`signal` 与 `close()` 下答 `authorization-required`，带 `soFar()`；线路断开时不动。
- 结算点都只经这两个函数：
  - 会话：`stop`（`session.ts:320`）、`die`（`:339`）。
  - 脚本化传输：`stop`、`unusable`。
- 会话的 `Phase` 结构上可以赋给 `InFlightPhase`。会话自己加相时，调用点编译失败；契约加相时，两个函数的 `never` 报错。
- 其余按相的分支都不决定结局：
  - `classify` 的 `phase.kind !== 'sent'` 决定事件归哪个请求，是事件规则。
  - `stop` 里给发现中的请求附 headers 的三元只附头。
  - 唯一的例外是脚本化 `cancelRequest`，见非阻断 5。
- 原因这一轴没有守住，见非阻断 4。

**2. `ConnectionView`（`connection.ts`）**
- 判别联合已经让 `{kind:'stdio', mode:'sse'}` 写不出来。
- 三个规则函数先判 `mode` 再判 `version`，在所有可表示的值上都有结论。
- 消费者有三个：`composition.ts` 的 `listActionsRequest`、会话的 `view`、脚本化传输的 `connection`。
- 剩余两点：
  - `mode:'sse'` 配现代版本仍然可以写。规则对它按旧修订处理，偏保守，无害。
  - 会话内部的状态没有跟上，见非阻断 6。

**3. 缺陷出口与 `StdioLine.close()`**
- 缺陷出口：
  - `work` 的 reject：先 `stop(entry)` 按相结算，再调用 `reportDefect`。
  - `pump` 处理单个事件时抛出：交给 `reportDefect`，读循环继续。
  - 应答正文的单条消息抛出：经 `work`，先结算再报出。
  - 正文迭代 reject：仍按 `http-aborted` 处理，符合 `Exchange` 端口的「断开时 reject」。
  - 以上与闭包 fix3 第 6 条、成员 SPEC 第 175、187 行一致。`session.spec.ts` 有对应的三条用例。
- 错误去向的拥有者是工厂：缺省出口在 `queueMicrotask` 里抛出。
- 等待上界：`work` 路径当场结算；`pump` 路径不结算出错事件对应的请求，由 `signal` 或 `close()` 放开，符合 V4。
- 缺口见非阻断 1–3。
- `StdioLine.close()`：
  - 它中止写端，不等这一步完成；取消两个 reader；等两个读循环结束。
  - 写计数已删。`closing` 只留给 `send` 的竞速用。
  - 上界只依赖本地资源。探针结果：一个 2 MiB 的写在途时，`close()` 3 ms 返回。
  - 上界义务的归属见非阻断 7，对端看到的效果见非阻断 8。

**4. `tests/unhandled.ts`**
- 它不改变被测代码的行为，「只观察」成立。
- 它改变了运行器的报告路径，见非阻断 9。

## 阻断

无。

我核过的来源如下，下列各条都不违反它们：
- 闭包 fix3 第 3、6、13、15、17 条，以及「性质及证据义务」第 89、90 行。
- 闭包主规格第 80 行。
- 成员 SPEC H6（第 79 行），以及第 175、183、187、228、237 行。
- 契约 SPEC：T5、T8 第 514 行与 S01–S07、裁定 15（第 103 行）、T9。
- 卡 #1119 C1–C6：没有一条点名这四处。

## 非阻断（按影响排序）

**1. events 迭代器 reject 时，`pump` 静默返回**（`session.ts:352`，`catch { return }`）

探针 `pump-reject.mts` 的输出：
```
in-flight listActions after the events rejected: pending after 300ms
a new listActions was written to the line: true
the new listActions: pending after 300ms
reportDefect calls: 0
after close: {"failure":{"kind":"no-answer","cause":"abandoned"}} {"failure":{"kind":"no-answer","cause":"abandoned"}}
```
- 注释写「the pending requests settle through `die` or `close`」，但这条路径上没有调用 `die`。注释与行为不符（DP-10），错误也没有去向（DP-06）。
- 不判阻断的理由：
  - 端口 `Line.events`（`line.ts:86`）没说它会 reject。
  - 两条产品线路的 events 都是 `AsyncQueue`。`fail` 只在 `tests/memory-line.ts` 里调用，而且是对应答正文，不是对 events。产品里走不到这条路径。
  - 成员 SPEC 第 175 行说的「读线路事件时的缺陷」，按处理单个事件理解。
- 改法交拥有者二选一：
  - (a) reject 当作线路断开：`die('stream-broken')`，再报出口。这与应答正文 reject 算流断开同形。
  - (b) 在 `Line.events` 的文档里写明它不 reject，reject 当作缺陷交出口，同时改注释。

**2. 调用方的值违反写出前提时，被报成连接问题，并在宿主进程里抛出**（`sendOut` 授权之后才执行 `requestTextOf`）

探针 `caller-value.mts`：`args` 里带 `{kind:'number', lexeme:'NaN'}`。`JsonValue` 类型允许这个值，`writeJsonText` 拒绝它。输出：
```
call: {"failure":{"kind":"not-sent","cause":"connection-unavailable"}}
written to the line: 0
defects reported to the session outlet: ['TypeError: value is not a json-text tree: a number lexeme is not a JSON number']
```
- 调用方看到的是 `connection-unavailable`，而连接其实可用。原因进了会话的缺陷出口，生产缺省会在宿主进程里抛出。
- 按成员 SPEC 第 175 行（工作流意外 reject 按相结算并交出口），这是规定行为，不违反。
- 但这个错误的拥有者是调用方：
  - `json-text/src/write.ts:95` 写明前提：「must already be judged by `judgeJsonValue`」。
  - 契约 R2 第 294 行对同类前提违反的处置是「返回的 Promise 以 `TypeError` reject，不进未发出的原因」。
  - DP-01：未知错误不能兜底映射成普通失败。
- 交拥有者选：
  - 把请求的组成移到 `begin` 里、登记之前做。这时版本已知，可以同步完成；抛出就 reject 调用方的 promise。
  - 或者在 `McpTransport.call` 的契约里写明这个前提，以及违反时的结局。

**3. `work` 的 catch 先 `stop` 再报出口**（`session.ts:301`）
- 如果 `stop` 抛出（例如线路的 `exchange.abort()` 或调度器的取消端口坏了），原来的缺陷到不了出口。catch 返回的 promise 被 `void` 丢掉，变成未处理拒绝。
- 这是读出来的，没有执行。改法：用 `try/finally`，或先报再 stop。

**4. `UnusableCause = NoAnswerCause | 'session-ended'` 含 `'abandoned'`**（`decisions.ts:71`）
- 它自己的注释只列了三个原因。产出它的地方只有 `stream-broken`、`process-exited`、`session-ended` 三种：`decisions.ts:142/150/155/170` 与 `wire.ts` 的 `endedCauseOf`。单元用例也只遍历这三个。
- 结果：`lineGoneAnswerOf({kind:'sent'}, 'abandoned')` 可以写出，返回一个不该有人产出的 `no-answer`。`AnswerConclusion` 的 `unusable` 字段同样如此。
- 原因这一轴没有被类型守住（相这一轴有 `never`），违反 typescript-best-practices「非法值写不出来」。
- 改法：`Exclude<NoAnswerCause, 'abandoned'> | 'session-ended'`，或具名的三字面量类型。

**5. 脚本化 `cancelRequest` 不经相规则**（`testing-scripted-transport.ts:790`）
- 不在已交出相时它什么也不做；已交出时手写 `ABANDONED`。
- 会话在现代 HTTP 上走 `stop`，再到 `stopAnswerOf`。
- 在可达的输入上两者结果一样：调用方只在请求出发之后才拿到 `requestId`。T5 第 480 行的「不另写规则」只管 `signal` 与 `close()`，所以不违反。
- 建议二选一：
  - 脚本化传输也走 `stop`，只在已交出时记 `stream-aborted`。
  - 或者契约写明 `cancelRequest` 只作用于已交出的请求，会话也照此限定。

**6. 会话的 `view`（`session.ts:264`）由两个独立字段投影**
- 两个字段是 `line.kind` 与 `connection.kind`。内部状态仍能表示 stdio 加 `legacy-sse`，投影时 `mode` 被静默丢掉。
- 契约的联合已经收紧，会话自己的状态没有跟上。读出来的，不可达。

**7. `close()` 上界的义务没写在端口上**
- 成员 SPEC H6、第 183、228 行写：「线路的 `close()` 只依赖本地资源」是线路端口对会话的义务，也是 V4 的前提。
- 端口文档 `line.ts:90` 只有「Closes the line. It is idempotent. It does not stop a process.」。第三条线路照端口文档实现，看不到这条义务；上界的拥有者只在 SPEC 正文里。
- 另一点：`StdioLine.close()` 第二次调用在 `if (this.closed) return` 处当即返回，早于读循环结束，与它注释的末句「the read loops … have ended when this returns」不符。会话的 `close()` 只调用一次，所以只有直接用 `Line` 的调用方看得到。

**8. `StdioLine.close()` 对端看到的效果比 H6 说的多一层**

探针 `close-fullpipe.mts`：真实子进程 800 ms 之后才开始读 stdin，一个 2 MiB 的写在途。输出：
```
send after 100 ms: "pending"
close() returned in 3 ms; send: {"kind":"aborted"}
child: EOF after 2097153 bytes at 816 ms
```
- 上界成立。但被放弃的那条消息完整送到了对端，之后才是 EOF。
- 原因：
  - 有在途写时，WHATWG 的 abort 要等这个写完成才调用 sink 的 abort。
  - Node `Writable.toWeb` 在背压下的写要等 `drain`。
  - 所以已经交给 Node 的字节照常冲出。
- 对端一直不读时，写端停在 erroring 状态，直到持有者停止进程。
- H6「中止 stdin 写端（对端看到输入结束）」「从不等缓冲排空」对 `close()` 的返回都成立。没写的是：被放弃的字节仍可能送达，EOF 要推迟到在途写结束。
- 结局不误报：已交出相本来就表示「对端可能收到了」，符合 DP-07。
- 措辞交 B 面。`stdio-line.ts` 注释「which ends the peer's input as closing it would」同理。

**9. 守卫只观察被测代码，但它改变了运行器的报告路径**
- 依据：vitest 4.1.11 的 `dist/chunks/init.k9zZ9sLh.js:98–120`，`listenForErrors.catchError` 里有 `if (processListeners(event).length > 1) return`。
- 所以守卫装上之后，vitest 自己不再报这类错误，守卫成为唯一的报告者。这正是注释说的目的：变异运行里算作被杀，而不是运行错误。
- 对被测行为没有影响：两个监听都不改变 promise 的处理状态，也不改变 Node 是否退出（vitest 本来就有监听）。
- 代价有三点：
  - (a) 晚于一个宏任务才浮出的拒绝，会记到下一个用例或 `afterAll`。不会丢，但归属错。
  - (b) `vitest.tiers.mts:118` 允许 `--sequence.concurrent`。用例并发时 `seen` 是共享的，归属失效。
  - (c) 两个包各有一份，注释声称「byte for byte in its hooks」，但没有检查守住。我 diff 过，当前一致。
- 本包没有用例依赖缺省出口在进程里抛出，所以守卫与缺省出口不冲突。

## 未覆盖

- **脚本化传输的缺陷去向（只当线索，未执行）。**
  - 现在 `send`、`deliver` 把脚本缺陷变成调用方结果的 reject（`entry.fail`）；本范围之前，`deliver` 的缺陷是未处理拒绝。
  - 按 T9，消费者把传输的 reject 当作 `abandoned`。所以调用口分支 `tests/doubles/peer.ts` 上的脚本缺陷可能被吸收成普通的 `no-answer`，测试不会变红。
  - 本树里没有这个消费者，我没有执行。
- **`die` 不释放交换（读出来的，未执行）。**
  - `die` 结算已交出且应答流还在读的请求时，不中止它的应答流和 controller；`stop` 会中止。
  - 只有 SSE 模式下 POST 正文还在流时才走得到；最后由 `close()` 中止全部交换收口。
- **端口 reject 的其他几处。**
  - `sendOut` 把 `send` 的 reject 当 `aborted`，`write` 忽略写出的 reject：这两处是 SPEC 第 187 行明定的。
  - `untilClosed` 把 `openGet` 的 reject 变成 `not-sent`：这在本范围之前就有，我没评。
- **不归 C 面、没做的：** 第 3 轮 B1、N1 的复跑（归 A 面）；TLA、探索器、`mutants.ts`；lint、metrics 与变异。
- **`fallbackGetConclusionOf`：** 只看了签名与实现。

## 超出已要求的需求

- **让相规则成为纯函数。** `InFlightPhase` 的发现相带方法 `soFar()`，所以两条规则都不是纯函数，`lineGoneAnswerOf` 还收一个它从不调用的闭包。可以改为结算时由传输取快照、传值（`{kind:'discovery', fetched}`）。理由：业务逻辑放纯函数；运行时对象不直接成为数据契约。
- **会话的 `Phase` 从契约派生**（`Extract<InFlightPhase, …> & {…}`）。理由：从权威类型派生；现在两个方向里只有一个靠调用点守住。
- **合并重复的附头三元。** `stop` 里给发现中请求附 headers 的三元，会话与脚本化传输各写了一份，可以收成 `...(phase.kind === 'discovery' ? { headers } : {})`。理由：小重复。
- **`fallbackGetConclusionOf` 不再伪造上下文。** 它把合成的 `WireContext{ id: '' }` 从会话搬进了契约：规则现在只有一处，但为了借用 `classifyWireEvent` 而伪造上下文的做法只是搬了家。可以直接按状态码与 `www-authenticate` 判 S05。理由：第 3 轮 NB2 的成因只解决了一半。
- **在公开选项里暴露 `reportDefect`。** `LocalTransportOptions` 现在没有它，宿主想把缺陷送进结构化遥测，只能装进程级的 `uncaughtException` 处理。缺省出口抛出的原缺陷也不带会话代际或请求号。理由：typescript-best-practices「Structured telemetry」。
- **`ConnectionView` 同名不同义。** 它与 `@omne-harness/mcp` 的 `src/internal/table.ts:53` 重名，后者是连接代际的只读视图。理由：同组统一语言里一词两义。
- **两份 `tests/unhandled.ts` 收成一份共享的测试支持。** 理由：消除重复；注释说的「逐字节相同」现在没有检查守住。

## 卡拥有者对第 4 轮的处置（06:34 UTC，按 C-SM-08：关口之后至多一轮修复）

四面都没有阻断。判据：只修违反已承诺需求或不变式的项；其余记成已知限制或停放，不修。修复轮 `w3-mcp-host-fix4` 一次带走下面「修」的各项，之后只复核这一轮的改动，然后跑 D 面。

**修（代码，每项先写会变红的用例）**

1. **脚本化传输的 `cancelRequest` 经相规则**（A 非阻断 1、C 非阻断 5）：同一条「相 → 结局」规则不能写两份。改为取在途项后调用 `this.stop(entry)`，只在已交出相记 `stream-aborted`。会话已是这样做。授权发现中的请求被取消时，两边的结局从此相同。
2. **缺陷总有去向**（C 非阻断 3）：`work` 的 catch 里 `stop` 抛出时，原缺陷仍要交给缺陷出口。用 `try/finally` 或先报后停。
3. **线路事件迭代 reject 不再静默**（C 非阻断 1，选 (a)）：按线路断开处理，`die('stream-broken')`，并把原因交缺陷出口。这让 `pump` 的注释与行为一致，在途请求按相结算。
4. **线路 `close()` 的义务写在端口上并单飞**（C 非阻断 7）：`Line.close` 的文档写明「完成只依赖本地资源（V4 的前提）」；`StdioLine.close()` 第二次调用返回同一次关闭，在读循环结束之后才完成，与注释一致。

**修（文档）**

5. B 非阻断 1–8：缺陷出口算第五个注入点（四处枚举与 `object-model.md:17`）；`object-model.md:41`、`:15`、`:25` 按 H6 与现行字段改；契约 T5 `:485` 与 H8 `:88` 按相限定（已交给线路的答 `no-answer`（`stream-broken`），其他在途请求按 `lineGoneAnswerOf`）；X02 写明其他在途请求的原因，裁定 15 补 X02；契约「未覆盖」登记 T8 前言的按相结算，指向成员用例；V4 前提的 HTTP 一半指向「关闭」一条并点名用例，没有就写「未验证」，范围写窄到 `close()` 返回；名字对照句改窄、`mB1` 的归属统一（文档与 `mutants.ts` 的 `breaks`）；两份 TLC 运行记录对齐到同一次运行。
6. B 非阻断 9 与小项：过程引用改为说缺陷本身或指向条款；契约 `:87` 与依据表日期；失效指针「（下一条的表）」；`TransportSession.tla:425` 的注释标题（只改注释，改后重跑 TLC 记录）；`verification/README.md` 的 `:67`、`:70`、`:76`；V6 行点名 `session.spec.ts` 的 S07 用例；「兑现的契约条款」表补 T8 前言一行。
7. C 非阻断 8：H6 与 `stdio-line.ts` 注释写明：`close()` 不等缓冲排空，但已交给 Node 的字节仍可能送达，对端在在途写结束之后才见 EOF。
8. C 非阻断 2 的契约一半：`McpTransport.call` 写明前提「参数与输入答复的值树已经判定（`judgeJsonValue`），违反是调用方的缺陷」。调用口一侧的边界判定由派发者在调用口分支另改（`checkRequest` 深判值树，违反以 `TypeError` 拒绝，按契约 R2）。
9. 依据写法（B「范围外待裁决」，卡拥有者定）：同一 PR 内的跨成员依据写「与本页同一提交的契约 SPEC」，维护一节写「契约 T1–T9、R4 或裁定表变化时重核本页」。

**不修，记录**

- A 非阻断 2（`unusable` 的「不动」一支在替身上未执行）：已知限制，契约单元用例覆盖规则本身。
- C 非阻断 4（`UnusableCause` 含 `abandoned`）：与已停放的 0.1.0 公开形状项（`AnswerConclusion.unusable` 去掉 `abandoned`）是同一件事，并入停放清单。
- C 非阻断 6（会话 `view` 的投影）、C 非阻断 9（守卫的归属代价）：不可达或只影响报告归属，记已知限制。
- A 范围外（线路 `send` reject 当 `aborted`）：成员 SPEC 明定，维持。
- 三面「超出已要求的需求」各项：进停放清单，不做。

**证据（E 面未达到项，派发者在修复轮之后一次贴卡）**：最终 head 的套件计数（stdio、Streamable HTTP 的通过、失败、不适用）；源码边界检查（语法树脚本 `owner-r4/type-escapes.mjs`，先经反例证明会报红）；fix3 与 fix4 的「用例 → 缺陷 → 变红」明细；红灯表 B 节 `settle` 守卫变异在现行代码上的处置；8 个超 warn 的逐条读数与理由；PR 正文跟上 fix3、fix4。


## 修复轮复核（H 节，implementation-reviewer，opus high；范围 `54a2377cb..50fc8d146`）

### 结论：本次范围内没有发现阻断问题

我复核了 `w3-mcp-host` 修复轮（H 节）：PR #1138，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host`，评审范围是 `git diff 54a2377cb..50fc8d146`，包括 fix4 的 6 个提交和派发者的 `50fc8d146`。

- 处置里第 1–9 条都按裁定做到了。
- 本轮没有引入违反成员 SPEC、契约 T1–T9、R4、「真实传输兑现时的裁定」或 V1–V6 的问题。
- 改动的文档句子和代码行为一致。

有两条非阻断：一条是缺用例，一条是 V4 措辞，见第 3 节。我不判定交付正确，也不做接受。

**我跑了什么。**
- 在工作树之外建了副本 `/tmp/h-r4-impl-review`（`git archive 50fc8d146`，node_modules 和两个 dist 用符号链接指回工作树）。在副本上跑了 4 条新用例，只跑快层、按用例名过滤。
- 在副本上把 `src` 换回基线，跑第 2–4 条的变红用例；另做了 1 次手工变异和 1 次探针。
- 副本已删除，工作树 `git status` 为空。
- 没跑结构读数、差分变异、TLC 和负控，按简报这些不归本面。

**工具一览**

| 入口 | 命令 | 结果 |
|---|---|---|
| 变更清单 | `git log/diff --stat 54a2377cb..50fc8d146` | 7 个提交，17 个文件。fix4 的 16 个都在写范围内。`50fc8d146` 另改了契约 `src/decisions.ts`，只动注释 |
| head 上的新用例 | `vitest run --mode fast`，4 个文件各按用例名过滤 | 全部通过（contract 1、session 2、lines 1） |
| 基线 src 上的新用例 | 同上，副本里把 `session.ts` 或 `stdio-line.ts` 换回 `54a2377cb` | 第 2、3、4 条变红，断言见第 1 节 |
| 第 1 条在基线上变红 | 没有复现（要在基线源码上重建契约 dist） | 读了存档日志 `fix4/red/item1-…log`。哈希 `340dea75923e36a4` 与交回一致，失败行见第 1 节 |
| 证据哈希抽查 | `sha256sum` | 4 份红灯日志、`tlc/run.log` `2975d496e3192163`、`tlc/mutations.log` `bcc146c707ec772e`、`mutants-run.log` `3206b85acce773b0`，都与文档和交回一致 |
| 手工变异 | 把 `work` 里 `reportDefect(stopDefect)` 改成吞掉 | 第 2 条的用例仍然通过（见非阻断 1） |
| 探针 | 让 `abort` 每次都抛出，然后调两次 `close()` | 输出见第 4 节 |

### 1. 第 1–9 条逐条

1. **做到。**
   - 代码：`testing-scripted-transport.ts:797-801` 取在途项后调 `this.stop(entry)`，只在 `sent` 相记 `stream-aborted`；`ABANDONED` 的导入已删。这与会话 `session.ts:976-983` 同形。
   - 用例：contract「cancelRequest on a modern Streamable HTTP request in the authorization discovery settles it as close() does…」在 head 上通过。
   - 基线红灯来自存档日志：`AssertionError: expected 'pending' to deeply equal { settled: { failure: { …(3) } } }`。
2. **做到。**
   - 代码：`session.ts:307-315` 先 `reportDefect(defect)`，再在 `try` 里 `stop`，`stop` 的抛出也交出口。
   - 基线上变红：`expected [] to include 'TypeError: text must be a string'`，外加 `unhandled … [ Error: the exchange abort broke ]`。
   - 后一半「`stop` 的抛出交出口」没有能判出它的用例，见非阻断 1。
3. **做到。**
   - 代码：`session.ts:366-372` 的 catch 先 `die('stream-broken')`，再 `reportDefect(broken)`。
   - 基线上变红：`expected 'pending' to deeply equal { Object (settled) }`。
   - 用例核对了已交出的请求答 `STREAM_BROKEN`、授权中的答 `NOT_SENT`、出口收到原因、之后的请求答 `not-sent`。
4. **做到。**
   - 代码：`line.ts:92-96` 写明「只依赖本地资源、不等对端、是 V4 的前提」，第二次调用不早于第一次完成；`stdio-line.ts:216-219` 用 `closeDone ??= this.shutdown()` 做单飞。
   - 基线上变红：`expected { settled: undefined } to be 'pending'`。
   - 第二次调用返回同一个 promise，而这个 promise 要等 `reading` 和 `draining` 两个读循环，所以「读循环结束之后才完成」由结构保证。
   - 端口用了较弱的说法「no earlier than the first」，这样 `HttpLine.close()`（同步体，每次调用返回新的 promise）也满足。这样写是一致的，不是发现。
5. **做到**，读了逐处 diff：
   - 第五个注入点写进了自定 2、H14、注入端口一节、`architecture.md`、`object-model.md:17`。
   - `object-model.md:15` 与 `session.ts` 的 `Pending`、`SentExchange` 一致。
   - 契约 T5 的 stdio 句、H8 的 stdio 项都按相限定。X02 写为 `stream-broken`，与代码一致：`decisions.ts:141` 对 stdio 的 `unsent` 给 `settle(NOT_SENT, 'stream-broken')`，再经 `lineGoneAnswerOf`。
   - 裁定 15 补了 X02，「未覆盖」补了 T8 前言一项。
   - V4 前提限到 `close()` 返回那一句；HTTP 一半写「未验证」，SPEC 与 `verification/README.md` 两处都写了。
   - `mB1` 的 `breaks` 改为 `V6`。
   - 两份 TLC 记录都指向 06:55 那一次，哈希核对相符。
6. **做到。**
   - `verification/README.md` 的 `:67`、`:70`、`:76` 已改。
   - TLA 那处只改注释（一行拆两行）。
   - V6 行点名了 S07 用例。
   - 「兑现的契约条款」表补了 T8 前言一行。
   - 失效指针「下一条的表」已删。
   - grep 改过的文档，没有剩下评审轮次一类的过程引用。
7. **做到。** H6 和 `stdio-line.ts:204-213` 都写明：不等缓冲排空；已交给 Node 的字节仍可能送达；对端在在途写结束之后才见到输入结束。这和 `shutdown()` 里不 `await` 的 `writer.abort` 一致。
8. **做到。** 前提写在契约 T3「原词形写出」那一条的末尾，`50fc8d146` 把它扩到 `updateTask`。代码没改。
9. **做到。** 依据表写「与本页同一提交的契约 SPEC」，新建「## 维护」一节，写了重核那一句。

### 2. 本轮引入的问题

**阻断：无。**

简报点名的三处逐一核对：
- **`work` 的 catch**：先报出口再停，与 SPEC「调用方只等结算」「失败的处置」两句一致。默认出口在 `factory.ts:28-32` 经 `queueMicrotask` 抛出，不同步抛，所以「先报」不会挡住后面的「停」。
- **`pump` 的 reject**：`die` 只遍历在途表，经 `lineGoneAnswerOf` 结算。授权发现中的请求不动，符合 V6 断开子句和契约 T8 前言。产品线路从不调 `queue.fail`（grep 只在 `tests/` 里命中），所以这条路径只在线路违约时才走到，与注释「a line that broke its port」一致。
- **`StdioLine.close()` 单飞**：`closed = true` 仍在第一次调用里同步置位，所以 `send` 的守卫和 `readStdout` 里「已关闭不报 broken」的时序与之前相同。

### 3. 非阻断

1. **第 2 条后一半没有能判出它的用例**（检查表第 5 问，在副本上执行验证过）。
   - 变异：把 `session.ts:312-313` 的 `catch (stopDefect) { this.options.reportDefect(stopDefect) }` 改成 `catch {}`。
   - 结果：「a defect of a workflow whose stop throws too…」仍然通过（`Tests 1 passed`）。这个用例只断言原缺陷 `toContain`，没有断言 `'Error: the exchange abort broke'` 到了出口。
   - 后果：SPEC「结算时端口抛出的缺陷也交缺陷出口」这句没有测试守着。
   - 实施者要做的：在这条用例里加一条断言，要求 `outlet.seen` 含 `'Error: the exchange abort broke'`。
2. **V4 的「只有这一句有前提」写得比代码宽**（措辞；这一句由 `3327d8439` 引入）。
   - V4 说 `signal` 与 `close()` 对在途请求的结算不依赖线路关闭这个前提。这句本身成立。
   - 但 `50fc8d146` 之后，这些结算还依赖两个释放函数不抛出，见第 4 节的探针。
   - 按端口失败模型的框架读（端口只会按契约答复、答复失败、reject 或挂起），这仍可以读通，所以不判阻断。
   - 建议：在 V4 里写明「端口失败模型之内」，或者指向「失败的处置」里释放函数的义务。

### 4. 第 4 问：把释放函数写成「不抛出」的端口义务

**判断：没有违反已承诺的不变式。**

依据：
- 修复前已经承诺的端口失败模型（SPEC 性质一节）只有四种：按契约答复、答复失败、reject、挂起。同步抛出的释放函数从来不在里面。
- 第 4 轮裁定第 2 条只要求缺陷有去向，代码做到了。
- 两个释放函数都不在公开选项里：`LocalTransportOptions` 和 `index.ts` 都不暴露 `schedule`，工厂只注入自己的缺省。产品实现是 `linked.controller.abort()` 和工厂里包 `clearTimeout` 的取消函数，都不会抛出。
- 所以这条义务只约束包内模块，没有收窄对外部消费者的任何承诺。

这条声明的实际后果（副本上执行的探针：`abort` 每次都抛出，连调两次 `close()`）：

```
PROBE Error: the exchange abort broke Error: the exchange abort broke "pending" 3
```

两次 `transport.close()` 都同步抛出，`listActions` 一直挂着，`abort` 被调了 3 次。也就是说，线路违约会变成传输方法的同步抛出，形态正是契约 T9 说的「同步抛出」：服务按 T9 当作已关闭，继续拆除。所以这不是静默成功。SPEC 那句「本包对这时的结算不作保证」与代码行为一致。

### 5. 未覆盖

- **第 1 条在基线上变红**：没有独立复现（要在基线上重建契约 dist），只核了存档日志的哈希和失败行。head 上的通过我在副本上复现了。
- **没有重跑**：TLC、探索器负控、turbo 全套、仓库检查。只核了证据哈希与文档、交回一致。
- **V4 前提的 HTTP 一半**：文档已写「未验证」，我没有补证。
- **组合用例**：第 1 条改了脚本化传输的行为，调用口 `packages/mcp/mcp` 上的组合用例没跑，交派发者在合入父分支后跑。
- **范围之外**：`50fc8d146` 改了 `decisions.ts` 的注释和 `mutants.ts` 的 `defect` 文案，在 fix4 的写范围之外，但属于派发者自己的提交，内容都是注释或用例数据里的文字，所以只记一笔。

### 超出已要求的需求

- **`stop` 先结算、再释放交换**（交回里也提过）：这样即使释放函数违约，`signal` 与 `close()` 的结算也不受影响，「不作保证」那句可以收窄。理由：现在没有已承诺的需求要求这样做，义务已经写在端口上。
- **`pump` 的 catch 改成和 `work` 同样的先报后停**：现在是先 `die` 再报，如果 `die` 里探测计时的取消违约抛出，线路给出的原因就丢了，`pump` 也会变成未处理拒绝。理由：只有端口违约时才会发生，而这种情况已经声明不作保证。
- **12 ms 静默窗口**：`tests/fixtures/scripted/stdio.ts:104-112` 的 `received()` 在负载下会让计数断言偶发为 0（交回记录了 N01、I01 各一次）。理由：派发者已经转成波末小卡，不在本轮改动的路径上。
