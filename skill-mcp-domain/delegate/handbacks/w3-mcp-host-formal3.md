# 第一次交回（2026-11-06 03:19 UTC）

## 1. 结论
做完了。`TransportSession.tla` 现在有两种断开：线路断开 `LineGone`（流断开、进程退出、旧 HTTP+SSE 共用流结束，三者合成一个动作）和会话结束 `SessionEnded(r)`（T8 S07 的 404）。两种断开都按相当场结算。V2、V4、V6 都加了覆盖断开的断言。新加 8 个有效动作变异和 1 份 B1 形状的负控。13 份配置、22 个变异都符合判读，四项门禁退出 0。没有推送，没有开 PR。

## 2. 提交（分支 PanQiWei/skill-mcp-w3-mcp-host-formal3，基线 720a5d08a）
- `1b3cfb47d` test：模块加两种断开、三条不变式、7 个变异、`bad-ended-sends-authorizing.cfg`，正控 cfg 加入新不变式。
- `b08701383` docs：models/README.md 和 index.md。
- `5af57eabd` test：加第 22 个变异 `V6-gone-sent-abandoned`，README 运行记录换成最终读数。
三个提交的作者和提交者读回来都是 `PanQiWei <594557445@qq.com>`。trailer 只有 Harness 和 Agent-Role 两行，没有 Co-Authored-By。

## 3. 改了哪些文件（都在 packages/mcp/mcp-host-local/verification/models/ 下）
- `TransportSession.tla`：
  - 新变量 `gone`、`ended`、`deadAt`、`deadBy`、`deadOut`、`sendsAtDead`、`authAtDead`，合成元组 `deadVars`。`Dead == gone \/ ended`。
  - 新结局 `ended`。新集合 `Causes`。新缺陷名 `ended-leaves-authorizing`。
  - 新算子 `DeadSettles(own, cut, cause, sentAnswer)` 和 `EndedCuts`。新动作 `LineGone`、`SessionEnded(r)`。
  - `Begin` 在 `Dead` 时当场拒绝。`Broken` 在 `Dead` 时，读类再发当场答 `notSent`。
  - 新不变式 `V2_NoWireAfterDead`、`V4_DeadBounded`。`V6_ByPhase` 加了断开子句。`TypeOK` 已扩充。
  - 原有动作只在 UNCHANGED 里加了 `deadVars`。`CloseSettles`、`Signal` 的文本没动，所以原有 14 个变异的锚点仍然各只出现一次。
- `run.py`：`CASES` 加 `bad-ended-sends-authorizing`，`MUTATIONS` 加 8 个。判读逻辑没改。
- `valid-close.cfg`、`valid-signal.cfg`、`valid-no-handle.cfg`：加 `V2_NoWireAfterDead`、`V4_DeadBounded`。改了两份 cfg 的首行注释。
- `bad-ended-sends-authorizing.cfg`（新建）。
- `README.md`：模型里的名字、两种断开的结算规则、三条新不变式、配置表、变异表、运行记录、本包事实。
- `index.md`：两行描述。
- 没有改名或删除配置。原有 cfg 名不变。

## 4. 验收逐项
所有 TLC 读数都经 `node scripts/with-test-slot.mjs` 跑。环境：`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`，`TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar`（SHA 前缀 936a262061c91469，TLC2 2.19），`FORMAL_WORKERS=4`。
- 基线（HEAD 模型副本，SHA 5090d212…）：13 份里原有 12 份符合，14 个变异符合，两次都退出 0。日志 `tmp/closures/w3-mcp-host-formal3/baseline-head/console.log`，SHA 前缀 6c805b6ecfb496db。读数与旧 README 一致：valid-close 2230 个不同状态，深度 15。
- **第 1 条**：最终运行于 2026-11-06T03:15:57Z，模型 SHA 9197d239f328affe。
  - `run.py` 退出 0，13 份配置都是 as expected。
  - 正控读数（不同状态 / 生成状态 / 深度 / 耗时）：
    - valid-close：9262 / 29306 / 16 / 1.6 s（原为 2230）。
    - valid-signal：305 / 676 / 11 / 1.1 s（原为 107）。
    - valid-no-handle：305 / 676 / 11 / 1.1 s（原为 107）。
  - 原有 9 份负控各只违反自己那一条，照旧变红。新负控读数在第 3 条。
  - 证据：`final/console.log`（SHA 前缀 19c39caa0924cfaf）、`final/runs/20261106T031557Z/summary.json`（e5be9d9689ad3356）。
- **第 2 条**：`--mutations` 退出 0，22 个变异各只违反目标不变式。证据：`final/runs/20261106T031611Z-mutations/mutations.json`（73a7309e5c6310fd），表在第 6 节。
- **第 3 条**：`bad-ended-sends-authorizing` 违反 `V2_NoWireAfterDead`，447 个不同状态，深度 6，用时 1.1 s。`.out` 的 SHA 前缀 413feca4e85b70c1。r1 是读类，r2 是写类（tools/call）。最短轨迹如下：
  1. Init：st = (init, init)，sends = (0, 0)，ended = FALSE。
  2. `Begin(r1)`：st r1 = auth，cred.auth = 1。
  3. `AuthDone(r1)`：st r1 = sent，sends r1 = 1。
  4. `Begin(r2)`：st r2 = auth，cred.auth = 2。
  5. `SessionEnded(r1)`：out r1 = ended，ended = TRUE。r2 仍是 auth，没有被结算（缺陷就在这里）。
  6. `AuthDone(r2)`：st r2 = sent，sends r2 = 1。会话不可用之后，请求被交给了线路，不变式变红。
- **第 4 条**：在 `5af57eabd` 上跑，时间 2026-11-06T03:16:58Z 到 03:18:41Z。
  - `pnpm run check:docs` 退出 0，输出 `PASS: 2738 Markdown files`。日志 SHA 前缀 f2edb27f440fdd08。
  - `pnpm run check:design` 退出 0，输出 PASS。日志 3616a97a3edba1ec。
  - `pnpm run format:check` 退出 0。日志 7411f2f4bd3490d0。
  - 另跑了 `pnpm run lint:rules`，退出 0，署名检查无违反。日志 f5605e072fa2f149。
  - 换行：改过的文件都是 `w/lf`。

## 5. 门禁日志与提交号
- 四项门禁日志都在 `tmp/closures/w3-mcp-host-formal3/gates/`，跑在 `5af57eabd`，开始时间写在 `head-and-time.txt`。
- 最终 TLC 运行时 HEAD 是 `b08701383`，但 run.py 已经加了第 22 个变异，还没提交。这次运行用的模型和 run.py 内容，与 `5af57eabd` 的完全相同。核对依据：模型 SHA 是 9197d239…，从 `1b3cfb47d` 起没变过；run.py 现在的 SHA 前缀是 595821e8df7c8941，运行之后没有再改。提交之后只改了 README 的运行记录。
- 名额（P29）：
  - 第一次排队，名额先被 w3-mcp-call 的 `metrics --coverage` 占了约 14 分钟，又被 w3-mcp-host 的一次 coverage 占着，共等了 660 秒。
  - 那次排队的运行拿到名额时，模块已经改到一半，读数作废，证据目录已经删掉。
  - 于是用 `git archive HEAD` 拷出模型副本，在副本上重跑了干净的基线。
  - 开发时用 1 个线程直接跑过一次 TLC，只为确认模块能解析，用时 1 秒。交回里的所有读数都经名额。
- tmp 目录布局：`baseline-head/`（基线），`dev/`（开发运行，以及加第 22 个变异之前的一次完整运行），`final/`（正式读数），`gates/`（门禁日志）。

## 6. 变异表
基础配置都是 valid-close。每行带 run.py 的输出摘录。

原有 14 个照旧变红：
| 变异 | 变红的不变式 | 摘录 |
| --- | --- | --- |
| V1-close-resettles-done | V1_SettleOnce | 56 个不同状态，深度 5 |
| V1-late-answer-resettles | V1_SettleOnce | 127，深度 5 |
| V2-begin-ignores-closed | V2_NoCredentialAfterClose | 98，深度 5 |
| V2-late-refusal-reports | V2_NoCredentialAfterClose | 244，深度 5 |
| V3-discovery-reports-again | V3_RejectAtMostOnce | 116，深度 5 |
| V3-report-without-handle（基础配置 valid-no-handle） | V3_RejectAtMostOnce | 58，深度 6 |
| V4-close-keeps-caller | V4_CloseBounded | 50，深度 5 |
| V4-close-waits-discovery | V4_CloseBounded | 135，深度 5 |
| V4-signal-leaves-discovery | V4_SignalBounded | 128，深度 5 |
| V5-write-resends | V5_NoResendForCaller | 261，深度 5 |
| V5-read-resends-twice（基础配置 valid-signal） | V5_NoResendForCaller | 224，深度 8 |
| V6-close-auth-abandoned | V6_ByPhase | 56，深度 5 |
| V6-close-disc-not-sent | V6_ByPhase | 194，深度 6 |
| V6-signal-sent-not-sent | V6_ByPhase | 80，深度 5 |

新加 8 个（改法 old → new；反例的动作序列）：
| 变异 | 改法 | 变红的不变式 | 反例 |
| --- | --- | --- | --- |
| **V4-ended-leaves-authorizing**（规格第 4 条第一个：断开时不结算授权中的请求，即 B1 的提前返回） | `EndedCuts` 里 `ELSE InFlightPhases` → `ELSE {"sent","disc"}` | V4_DeadBounded | Begin、AuthDone、Begin、SessionEnded（195，深度 6） |
| **V6-gone-auth-broken**（规格第 4 条第二个：授权中的请求答成 no-answer） | `ELSE IF st[r] = "auth" THEN "notSent"` → `THEN sentAnswer`（线路断开时就是 broken） | V6_ByPhase | Begin、LineGone（66，深度 5） |
| V2-begin-ignores-dead | Begin 去掉 `\/ Dead` | V2_NoWireAfterDead | LineGone、Begin（105，深度 5） |
| V2-dead-read-resends | `THEN IF CanResend(r) /\ Dead` → `THEN IF FALSE` | V2_NoWireAfterDead | Begin、AuthDone、Begin、AuthDone、SessionEnded、Broken（1295，深度 8） |
| V4-gone-leaves-discovery | LineGone 只切 `{"auth","sent"}` | V4_DeadBounded | Begin、AuthDone、Refuse、LineGone（124，深度 5） |
| V4-dead-keeps-caller | 放开等待的条件只剩 `IF r \in own` | V4_DeadBounded | Begin、LineGone（39，深度 4） |
| V6-gone-sent-abandoned | `"gone", "broken")` → `"gone", "abandoned")` | V6_ByPhase | Begin、AuthDone、LineGone（107，深度 5） |
| V6-ended-abandons-sent | `"ended", "none")` → `"ended", "abandoned")` | V6_ByPhase | Begin、Begin、AuthDone、AuthDone、SessionEnded（583，深度 6） |

## 7. 模块里的名字
- 动作：`LineGone`、`SessionEnded(r)`，两者共用 `DeadSettles`。
- 状态：`gone`、`ended`、`Dead`、`deadAt`、`deadBy`、`deadOut`、`sendsAtDead`、`authAtDead`。
- 新结局 `ended`，意思是 not-sent（session-ended）。`broken` 现在也表示线路断开时已交给线路的项按原因答 no-answer。
- 不变式：`V2_NoWireAfterDead`、`V4_DeadBounded`，以及 `V6_ByPhase` 的断开子句。
- 缺陷名 `ended-leaves-authorizing`，配置 `bad-ended-sends-authorizing`。

## 8. 自定裁定与理由（下面多条要派发者拿去核 fix3）
1. **授权发现中的项，断开时当场结算为 authReq，不等发现结束。** 依据有三条：规格第 3 条要求「断开之后等待都放开，元数据取回可以一直挂着」；闭包首段说「与 signal、close() 同形」；T5 里 close 和 signal 对授权发现中的项就是当场结算。如果改成等发现结束，元数据取回挂起时 V4 就写不成。**注意：基线代码的 `Session.die` 不碰 discovery 项**（session.ts:323 的注释写着 "finishes that"）。fix3 如果只把 authorizing 一支改掉，代码就和模型不一致。这是要核 fix3 的第一项。
2. **会话不可用之后，读类再发的结局是 `notSent`，不是 `broken`。** 按目标代码的路径：`withOneResend → once → begin`，`begin` 发现会话不可用，答 NOT_SENT，不调用句柄，也不写线路。这一支只在会话结束之后可达：那时其余已交给线路的读类遇到流断开。变异 `V2-dead-read-resends` 的反例证实这一支可达。
3. **会话结束之后，`LineGone` 仍然可以发生，结束后还在途的已交给线路的项答 `broken`。** 这对应 `die` 里 `dead ??=` 只记第一个原因、但结算循环每次都跑的行为。
4. 会话结束时，触发它的那个请求答 `ended`，不记入快照。基线代码里，触发请求在 `die` 之前已经由 `apply` 结算。
5. 「其余已交给线路的项不受影响」用 `deadOut[r] = "none"` 断言，意思是这一步没有结算它。只看当前答复分不出「被这次断开结算」和「之后被自己的应答结算」，所以加了这个由有效动作写入的快照。它在所有分支里都会写，不是缺陷标志。
6. B1 负控的目标选 `V2_NoWireAfterDead`，不选 `V4_DeadBounded`。原因是只有前者的最短轨迹会走到 `AuthDone(r2)` 把请求交上线路，与验收第 3 条要的形状一致。同一个缺陷对 V4 的覆盖由变异 `V4-ended-leaves-authorizing` 承担。
7. 迟到的 404（在途项已经结算）被丢弃，会话不转为不可用。依据：基线代码的 `classify` 在项不在途时直接返回 true，不调用 `apply`。
8. 两种断开在每个配置里都可能发生，不区分 stdio、HTTP 和 SSE。这是对安全性质的上近似。

## 9. 待定项
- **`V2_NoWireAfterDead` 挂在 V2 名下，只有 docs3 或派发者能定。** 成员 SPEC 的 V2 只讲 close() 与凭据，这条还含「不交给线路」。三处同名的规矩要求两边一致，有两条路：
  - (a) 扩写 V2 的定理句。建议措辞：「`close()` 返回之后，不再调用凭据句柄的 `authorize` 与 `reportRejection`。会话断开之后，不再调用 `authorize`，也不再把请求交给线路。会话结束之后仍在途的请求被拒绝时，`reportRejection` 照 T4 调用一次。」
  - (b) 另立编号。那样要把模型、cfg、run.py 和 README 里的名字一起改掉。
  - 三问去不掉它的原因：定理编号归 SPEC 的拥有者，本闭包不能写 SPEC。
- V4 的定理句要加一句：会话结束一侧比线路断开一侧弱。会话结束之后，仍在途的已交给线路的请求合法地等自己的应答。线路断开之后，所有等待都放开。

## 10. 交给 docs3 和 fix3 的事项（不在我的写范围内）
- `verification/README.md` 的动作映射表：
  - 加 `LineGone` 一行。探索器一列对应 `event broken/ended`。实现一列按目标结构写：一个按相结算的入口（现行名字是 `Session.die`），authorizing 答 not-sent，sent 按原因答 no-answer，discovery 当场答 authorization-required（按已取到的内容）。
  - 加 `SessionEnded(r)` 一行。探索器一列是对带旧会话的请求答 404。实现一列：`apply` 结算触发请求（session-ended），再调用同一个入口，authorizing 和 discovery 照上面结算，sent 不动。
  - 这两行都要注明「名字以 w3-mcp-host-fix3 的交回为准」。
  - `Broken(r)` 一行删掉「线路级的断开经 die…」那半句。再加一句：会话不可用之后，读类再发经 `begin` 被拒，答 not-sent。
- 状态映射表：给 `gone`、`ended`（对应 `Session.dead` 的原因）、`deadAt`、`deadBy`、`deadOut`、`sendsAtDead`、`authAtDead` 各加一行。后五个只为性质而设，由有效动作写入。
- SPEC「性质与证据」表的 TLA 一列：
  - V2 加负控 `bad-ended-sends-authorizing`，加变异 `V2-begin-ignores-dead`、`V2-dead-read-resends`。
  - V4 加变异 `V4-ended-leaves-authorizing`、`V4-gone-leaves-discovery`、`V4-dead-keeps-caller`。
  - V6 加变异 `V6-gone-auth-broken`、`V6-gone-sent-abandoned`、`V6-ended-abandons-sent`。
  - `verification/README.md`「两种证据能变红」的对应行也同步。
- V6 的定理句加断开：线路断开和会话结束都按相结算，授权中答 not-sent（connection-unavailable），授权发现中答 authorization-required。线路断开时，已交给线路的按原因答 no-answer。会话结束时，只有触发它的那个请求答 not-sent（session-ended），其余已交给线路的不受影响。断开之后开始的请求答 not-sent（connection-unavailable）。
- 要核 fix3 的点：
  1. `die` 对所有原因都结算 authorizing 和 discovery 两相，sent 一支按原因区分。
  2. `begin` 和 `authorize` 有 usable 守卫，所以断开之后既不登记新请求，也不调用句柄。
  3. 再发经 `begin` 被拒，结局是 not-sent。
  4. 迟到的 404 不触发 die。
  5. 探索器的 V6 扩到断开时，按相断言的形式与本模型相同。

## 11. 未覆盖
- 模型不区分 stream-broken 和 process-exited，两者都是 `broken`。不区分 stdio、HTTP 和 SSE 模式。
- 模型写的是裁定后的目标结构，不是基线 `720a5d08a` 的代码。基线代码有两处不符合模型：会话结束时的 B1，以及断开时不结算 discovery 项。
- 模型与实现之间没有精化证明。这是有界穷举（最多 2 个请求，MaxSends = 2），不是证明。
- 我没有改探索器、`verification/README.md`、SPEC 和代码。它们分别归 fix3 和 docs3。
- 「会话结束之后仍在途的请求等自己的应答」在 V4 里只是放宽（不要求它们已结算），没有专门的正面断言。


# 第二次交回（2026-11-06 03:25 UTC）

## 1. 结论
03:21 裁定要的补做已经完成：断开不再结算授权发现中的请求，V4 断开子句只覆盖依赖线路的两相，变异已替换，README 已同步。经运行名额重跑：13 份配置与 22 个变异都符合判读，四项门禁退出 0。没有推送。

## 2. 提交
- `09d552661`：test(mcp-host-local)：按 03:21 裁定，断开不结算授权发现中的请求，V4 断开子句只覆盖依赖线路的两相，`V4-gone-leaves-discovery` 换成 `V6-dead-settles-discovery`，运行记录重跑（#1119）。
- 作者与提交者读回都是 `PanQiWei <594557445@qq.com>`。
- 前面三个提交不变：`1b3cfb47d`、`b08701383`、`5af57eabd`。

## 3. 改动（都在 `packages/mcp/mcp-host-local/verification/models/`）
- `TransportSession.tla`：
  - `DeadSettles` 对 `disc` 相给出 `"none"`，也就是这一步不结算（原来是 `"authReq"`）。授权发现中的项仍记入快照：`deadAt` 记为 `disc`，`deadOut` 记为 `none`。
  - `LineGone` 和 `SessionEnded` 都不再结算 `disc`。
  - `V4_DeadBounded` 的线路断开子句由 `st[r] \in {"init","done"}` 改为 `st[r] # "sent"`。加上原有的 `st[r] # "auth"`，断开之后授权发现中的项可以照常存在。会话结束一侧仍按原来的放宽处理：已交给线路的项可以继续在途。
  - `V6_ByPhase` 的 `disc` 子句改为 `deadOut[r] = "none" /\ out[r] \in {"none", "authReq"}`：断开那一步没有结算它，之后由发现、`signal` 或 `close()` 结算时答复只能是 `authReq`。
  - 头注释与各动作的注释已按裁定改写。
- `run.py`：
  - 删去 `V4-gone-leaves-discovery`。
  - 加 `V6-dead-settles-discovery`：old 是 `ELSE IF st[r] = "disc" THEN "none"`，new 是 `ELSE IF st[r] = "disc" THEN "authReq"`，基础配置 valid-close，目标 `V6_ByPhase`。
  - 变异总数仍是 22。
- `README.md`：两种断开的结算规则、`V4_DeadBounded` 与 `V6_ByPhase` 的说明、变异表（删一行、加一行）、运行记录。
- 配置文件、`index.md` 都没有改。

## 4. 新读数
- 运行时间与环境：2026-11-06T03:22:23Z 起，经 `with-test-slot`。TLC2 2.19，4 个工作线程。
- 版本对应：模型 SHA 前缀 `3915573bc0e87f8a`，run.py SHA 前缀 `2f1fc35ee9f1c89b`。两者都与 `09d552661` 中的文件相同。运行之后只改了 README 的运行记录。
- `run.py` 退出 0，13 份配置都是 as expected。正控读数（不同状态 / 生成状态 / 深度 / 耗时）：
  - valid-close：9922 / 29306 量级 / 16 / 1.6 s（上一版 9262，加断开之前 2230）。生成状态数见 `summary.json`。
  - valid-signal：315 个不同状态，深度 11，1.1 s。
  - valid-no-handle：315 个不同状态，深度 11，1.2 s。
- 负控：原有 9 份各只违反自己那一条。`bad-ended-sends-authorizing` 违反 `V2_NoWireAfterDead`，451 个不同状态，深度 7。反例形状与上次相同，共 6 个状态：
  1. Init
  2. `Begin(r1)`
  3. `AuthDone(r1)`，r1 发出 1 次
  4. `Begin(r2)`，r2 在授权中
  5. `SessionEnded(r1)`：r1 答 `ended`，`ended = TRUE`，r2 仍在授权中
  6. `AuthDone(r2)`：r2 交给线路，`sends` 中 r2 = 1，不变式变红
- `--mutations` 退出 0，22 个变异各只违反目标不变式。不同状态数在 32 到 1096 之间，深度 4 到 8，共用时约 23 秒。
- 证据（SHA-256 前 16 位）：
  - `tmp/closures/w3-mcp-host-formal3/final/console.log`：e8c36c76527e609b
  - `final/runs/20261106T032223Z/summary.json`：c6ac4d7f9d8553e8
  - `final/runs/20261106T032238Z-mutations/mutations.json`：6336b5ec13ea1859
  - `bad-ended-sends-authorizing.out`：79eba9fec42dbeb9
- 上一版正式读数已移到 `dev/final-before-disc-ruling/`。

## 5. 变异表中改动的行
| 变异 | 改法 | 变红的不变式 | 配置 | 摘录 |
| --- | --- | --- | --- | --- |
| 删去 `V4-gone-leaves-discovery` | — | — | — | — |
| 新加 `V6-dead-settles-discovery` | 断开把授权发现中的请求当场结算为 `authReq` | `V6_ByPhase` | valid-close | 122 个不同状态，深度 5；反例 Begin、AuthDone、Refuse、LineGone |

其余 21 个照旧，各只违反自己的目标不变式，读数见 `mutations.json`。规格第 4 条点名的两个变异仍然对应：`V4-ended-leaves-authorizing` 违反 `V4_DeadBounded`（174 个不同状态，深度 6）；`V6-gone-auth-broken` 违反 `V6_ByPhase`（62 个不同状态，深度 5）。`V4_DeadBounded` 现在由两个变异打红：`V4-ended-leaves-authorizing` 和 `V4-dead-keeps-caller`（58 个不同状态，深度 5）。

## 6. 门禁
都在 `09d552661` 上运行，时间 03:23:19Z 到 03:25:02Z。
| 命令 | 退出码 | 输出 | 日志 SHA 前缀 |
| --- | --- | --- | --- |
| `check:docs` | 0 | PASS 2738 | f2edb27f440fdd08 |
| `check:design` | 0 | PASS | 3616a97a3edba1ec |
| `format:check` | 0 | — | b66da60c47468e06 |
| `lint:rules` | 0 | — | 7e9935fd58a96908 |

## 7. 对上次交回的修正
- 自裁 1 作废，以 03:21 裁定为准：两种断开只结算授权中和已交给线路的两相。授权发现中的项由发现做完、`signal` 或 `close()` 结算。
- 上次交给 docs3 与 fix3 的事项中，凡写「discovery 当场答 authorization-required」的，一律改为「不动」。具体有三处：
  - 动作映射表 `LineGone` 行的实现一列。
  - 动作映射表 `SessionEnded(r)` 行的实现一列。
  - 要核 fix3 的第 1 点。现在只需核 `die` 对所有原因都结算 authorizing 相；discovery 不动。基线代码的 `die` 原本就不碰 discovery，在这一点上与裁定一致。
- V6 定理句的建议改为：断开时，授权中的请求答 not-sent（connection-unavailable）；授权发现中的请求不被断开结算，之后照常以 authorization-required 结束。
- V4 的建议：断开子句只覆盖授权中和已交给线路的两相。
- 待定项 (a) 已由派发者采纳，我这边不再改动。

## 8. 未覆盖
与上次交回相同，删去其中关于授权发现中项的说法。新加一项：断开之后，授权发现中的项由发现放开。如果元数据取回一直挂着、调用方又不发 `signal` 也不调用 `close()`，这个等待就没有上界。按裁定，这与断开之前相同，断开没有新增无界等待。V4 不断言这一段。
