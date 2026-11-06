# w3-mcp-host-formal2 交回（19:34，head `0caa8b577`；用量：通知 243177 tokens、55 次工具调用、31.3 分钟）

## 1. 结论

做完了。`TransportSession.tla` 重做：在途项与后台工作流分开，V1、V2、V6 改成对有效动作写入的快照的断言，V4 量调用方一层，结算按已定第 1 条。V1–V6 每条都有至少两个「有效动作的变异」让正控变红（共 14 个，`run.py --mutations` 入库可复跑），旧的 `bad-*` 照旧各自变红，新负控「调用方跟着工作流等」两份（close／signal）变红。验收第 4 条用基线模块做了三组对照：同一缺陷下旧写法绿、新写法红。四个门禁在最终提交上退出 0。没有触发停止条件。

工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal2`，分支 `PanQiWei/skill-mcp-w3-mcp-host-formal2`，基线 `db06b5b70`，工作树干净。未推送。

## 2. 提交（自下而上，作者与提交者均为 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code` / `Agent-Role: developer`）

- `e101fed13` test：模型重做、配置改名与新增、`run.py` 加 `--mutations` 与新证据目录缺省（能跑通 TLC 的阶段 2–4）
- `de1a55bba` docs：SPEC「性质与证据」、`verification/README.md`、`models/README.md`、`index.md`（阶段 5）
- `a29b1b87e` docs：运行记录注明负控状态数随调度变化
- `0caa8b577` docs：`models/README.md` 写明 V2 的断言从 `closed` 起，比陈述强（最终提交）

## 3. 改了哪些文件

- `packages/mcp/mcp-host-local/verification/models/TransportSession.tla`：整体重写（见第 7 节「模块里的名字」）。
- `…/models/run.py`：`CASES` 更新；新增 `MUTATIONS` 表与 `--mutations` 模式（在证据目录的副本上替换唯一原文、只查目标不变式、写 `mutations.json`）；`FORMAL_OUTPUT_DIR` 缺省改为 `tmp/formal/mcp-host-local/runs/`（原来指向上一闭包的 tmp，NB11）。
- `…/models/bad-close-after-line.cfg` → `bad-close-settles-after-line.cfg`（改名，Bugs 改为 `close-settles-after-line`）；新增 `bad-caller-waits-workflow-close.cfg`、`bad-caller-waits-workflow-signal.cfg`；四份含 V6 的 cfg 把 `V6_CloseThreePhases` 换成 `V6_ByPhase`。
- `…/models/README.md`：新增「模型里的名字」「有效动作的变异」两节，配置表 12 行（每行写缺陷描述），判读规则加变异，运行记录全部换新，删掉「同一时段另一会话」的过程记述。
- `…/models/index.md`：条目跟随。
- `…/verification/README.md`：动作映射按目标结构写（工作流入口、出发点、按相结算；标明「名字以 `w3-mcp-host-fix2` 交回为准」）；状态映射换成新变量；模型的抽象补「调用方的等待」「挂起的端口留在工作流」；运行命令加 `--mutations`；「两种证据能变红」一节改为「缺陷注入」「有效动作的变异」两列，删掉「第 1 轮阻断」列、A1/A2/A4/A5/B4/B5 编号与 `tmp/...mutate.py` 引用，收回「模型承担 A4」；探索器部分只改了 NB11 的措辞（去掉过程记述、脚本引用改为「随 `tests/` 入库，以 fix2 交回为准」）。
- `packages/mcp/mcp-host-local/SPEC.md`：只改「性质与证据」一节。端口失败模型删掉豁免、换成裁定的承诺句；V4 改为调用方一层；V6 改为 signal 与 close() 同一规则、close() 不等发现、关闭后或信号已触发时开始的请求答 not-sent；证据表 TLA 一列按 NB2 同式；未覆盖改为缺陷描述、A4 只由 `http.spec.ts` 承担；删掉「（代码修复轮交回）」。其余各节字节不变（曾被 `oxfmt` 重排表格，已按 HEAD 还原）。

## 4. 验收逐项

工具链：`/opt/tlaplus/tla2tools.jar`（SHA-256 前缀 `936a262061c91469`，TLC2 2.19），`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`，`FORMAL_WORKERS=4`。模型 SHA-256 前缀 `5090d212e86ec2d0`，在 `e101fed13` 之后四个提交里字节相同。过程产物都在 `tmp/closures/w3-mcp-host-formal2/`。

**第 1 条 正控全部通过。** 命令 `python3 packages/mcp/mcp-host-local/verification/models/run.py`（全部 12 个配置）。最终运行于 `de1a55bba`（模型与 HEAD 同字节），`final-run.log` SHA-256 前缀 `1dd865138091a41b`，退出 0；`summary.json` 在 `tmp/closures/w3-mcp-host-formal2/formal-final/20261105T192617Z/`。

| 配置 | 结论 | 不同状态 | 深度 | 判读 |
| --- | --- | --- | --- | --- |
| valid-close | 完成，没有错误 | 2230 | 15 | 符合 |
| valid-signal | 完成，没有错误 | 107 | 10 | 符合 |
| valid-no-handle | 完成，没有错误 | 107 | 10 | 符合 |
| bad-resettle | V1_SettleOnce 被违反 | 56 | 7 | 符合 |
| bad-cred-after-close | V2_NoCredentialAfterClose 被违反 | 86 | 5 | 符合 |
| bad-report-twice | V3_RejectAtMostOnce 被违反 | 30 | 7 | 符合 |
| bad-signal-dead | V4_SignalBounded 被违反 | 22 | 5 | 符合 |
| bad-close-settles-after-line | V4_CloseBounded 被违反 | 18 | 5 | 符合 |
| bad-caller-waits-workflow-close | V4_CloseBounded 被违反 | 25 | 5 | 符合 |
| bad-caller-waits-workflow-signal | V4_SignalBounded 被违反 | 24 | 5 | 符合 |
| bad-resend | V5_NoResendForCaller 被违反 | 58 | 8 | 符合 |
| bad-close-not-sent | V6_ByPhase 被违反 | 63 | 7 | 符合 |

正控状态数两次运行相同；负控是找到第一条反例时的计数，随线程调度略变（README 已注明）。基线读数（改动前，`baseline-run.log` `d117f865a5f47e68`）：valid-close 544 状态、10 个配置全部符合判读。

**第 2 条 有效动作的变异表。** 命令 `python3 …/run.py --mutations`，最终运行 `20261105T192632Z-mutations/mutations.json`，退出 0；阶段 4 首跑 `mutations-stage4.log` `8e4deab267e468f9`。每行：改了什么（`TransportSession.tla` 的位置） | 变红的不变式 | 配置 | TLC 退出码与输出摘录。

| 变异 | 改了什么 | 变红 | 配置 | 退出码 / 摘录 |
| --- | --- | --- | --- | --- |
| V1-close-resettles-done | `CloseSettles` 的 `InFlight` 集合加入 `"done"`：close() 把已结算项再结算一次 | V1_SettleOnce | valid-close | 12 / `Error: Invariant V1_SettleOnce is violated.` |
| V1-late-answer-resettles | `Answer` 的结算条件 `st[r] = "sent" \/ …` 改 `TRUE`：迟到应答不核对已结算 | V1_SettleOnce | valid-close | 12 / 同上 |
| V2-begin-ignores-closed | `Begin` 的 `IF closed \/ r \in signalled` 去掉 `closed`：关闭后走正常授权路径 | V2_NoCredentialAfterClose | valid-close | 12 / `Invariant V2_NoCredentialAfterClose is violated` |
| V2-late-refusal-reports | `Refuse` 的迟到分支 `UNCHANGED <<st, refusals, cred>>` 改为 `report + 1` | V2_NoCredentialAfterClose | valid-close | 12 / 同上 |
| V3-discovery-reports-again | `DiscDone` 加 `report + 1` | V3_RejectAtMostOnce | valid-close | 12 / `Invariant V3_RejectAtMostOnce is violated` |
| V3-report-without-handle | `Refuse` 的 `cred'` 去掉 `IF HasHandle` | V3_RejectAtMostOnce | valid-no-handle | 12 / 同上 |
| V4-close-keeps-caller | `CloseSettles` 的 `cw'` 改 `cw`：结算但不放开调用方 | V4_CloseBounded | valid-close | 12 / `Invariant V4_CloseBounded is violated` |
| V4-close-waits-discovery | `CloseSettles` 的 `InFlight` 去掉 `"disc"`（修订前的规则） | V4_CloseBounded | valid-close | 12 / 同上 |
| V4-signal-leaves-discovery | `Signal` 的相集合去掉 `"disc"`（修订前的规则） | V4_SignalBounded | valid-close | 12 / `Invariant V4_SignalBounded is violated` |
| V5-write-resends | `CanResend` 去掉 `r \notin Writes` | V5_NoResendForCaller | valid-close | 12 / `Invariant V5_NoResendForCaller is violated` |
| V5-read-resends-twice | `CanResend` 的 `<` 改 `=<` | V5_NoResendForCaller | valid-signal | 12 / 同上 |
| V6-close-auth-abandoned | `CloseSettles` 的 `"auth" -> "notSent"` 改 `"abandoned"`（规格给的例子） | V6_ByPhase | valid-close | 12 / `Invariant V6_ByPhase is violated` |
| V6-close-disc-not-sent | `CloseSettles` 的 `"disc" -> "authReq"` 改 `"notSent"` | V6_ByPhase | valid-close | 12 / 同上 |
| V6-signal-sent-not-sent | `Signal` 的 `"sent" -> "abandoned"` 改 `"notSent"` | V6_ByPhase | valid-close | 12 / 同上 |

变异在证据目录的副本 `mutant-<名字>/` 上做，本目录模块不改。每个变异的 cfg 只列目标不变式（避免被别的不变式先判）。变异设施自检（`mutation-selfcheck.log` `fd7d4478cf5ec29c`，退出 1，符合预期）：无害改动（记录字段换序）→ `NOT AS EXPECTED; violated no invariant`；原文出现 21 次 → 拒绝执行；目标不变式填错（V6 的变异写成 V3）→ `NOT AS EXPECTED`。所以设施能看见存活的变异与错配的目标。

**第 3 条 新负控。** `bad-caller-waits-workflow-close`：反例轨迹 `Begin → Close`：Begin 后 `wf = auth`（凭据句柄已被问、没有答复，即挂起），Close 把在途项结算为 `notSent`（`st = done`, `cutAt = auth`），`cw = waiting` → `V4_CloseBounded` 违反。`-signal` 同形，`Signal` 一步。模型里挂起 = 答复端口的动作不被选中，每个配置都允许；见第 8 节裁定 c。

**第 4 条 对照。** 基线 `db06b5b7` 的模块取自 git，三个与新模块同义的有效动作变异写进旧模块，用旧 `valid-close` 常量只查旧不变式（`contrast/contrast.log` `82b9c2c0c4b876d2`，每个 `contrast/<名>/tlc.out`）：

| 缺陷 | 旧模块 + 旧不变式 | 新模块 + 新不变式 |
| --- | --- | --- |
| close() 把授权中答成 abandoned | `V6_CloseThreePhases`：`Model checking completed. No error has been found.`（524 状态） | `V6-close-auth-abandoned`：`Invariant V6_ByPhase is violated` |
| close() 把已结算项再结算（旧模块：done 的 out 改写为 abandoned） | `V1_SettleOnce`：No error（544 状态） | `V1-close-resettles-done`：`Invariant V1_SettleOnce is violated` |
| Begin 不核对 closed，关闭后照常授权 | `V2_NoCredentialAfterClose`：No error（760 状态） | `V2-begin-ignores-closed`：`Invariant V2_NoCredentialAfterClose is violated` |

为什么旧写法恒真：三个旧标志只在 `IF "<bug>" \in Bugs` 分支里置真，不变式量的是「进没进那个分支」，与 `Close`、`Answer`、`Begin` 怎样给 `out`／调用句柄无关。V2 一行旧模块要改两处（去掉守卫，并把 `IF closed` 改成 `IF FALSE`）：因为旧 `Begin` 的「关闭后」路径只能经缺陷分支到达、而标志就写在那条分支里，只去掉守卫会误置标志，看起来像变红，其实量的仍是分支；要表达「忘记核对 closed」这个真实缺陷，只能绕开那条分支。新模型里同一缺陷是一处改动。

**第 5 条 门禁**（最终提交 `0caa8b577`，日志在 `tmp/closures/w3-mcp-host-formal2/gates/`）：
- `pnpm run check:docs`：`PASS: 2738 Markdown files; local links and skill mirrors.` exit 0，`check-docs.log` `836d59ccb62f787e`（2026-11-05 19:31 UTC）
- `pnpm run check:design`：`PASS: current source links and explicit owners.` / `PASS: 354 个词条…对账一致。` exit 0，`check-design.log` `482c2fad7d3503a0`（19:32 UTC）
- `pnpm run format:check`：`All matched files use the correct format.` exit 0，`format-check.log` `5fd5e309ab7c6356`（19:31 UTC）
- `pnpm run lint:rules`：`PASS: product-checks … 6035 个提交的署名，无违反。` exit 0，`lint-rules.log` `d866cf97f7c464a7`（19:31 UTC）
- `git ls-files --eol`：改过的文件全部 `w/lf`。

## 5. 门禁日志的时间与提交

见第 5 条；四份都跑在 `0caa8b577`。TLC 最终运行（`final-run.log`）跑在 `de1a55bba`，之后两个提交只改 `models/README.md` 的两句，模型、cfg、run.py 字节不变（SHA 同为 `5090d212e86ec2d0`）。

## 6. 变异表

见第 4 节第 2 条。

## 7. 模块里的名字

- 相 `st[r]`：`init`／`auth`（已登记、未交给线路）／`sent`（已交给线路）／`disc`（授权发现中）／`done`。答复 `out[r]`：`none`／`result`／`abandoned`／`notSent`（connection-unavailable）／`authReq`（authorization-required）／`broken`。
- 工作流阶段 `wf[r]`：`none`／`auth`／`line`／`disc`／`end`；`AuthDone`、`Answer`、`Refuse`、`Broken`、`DiscDone` 由 `wf` 使能，在途项已结算时走「丢弃」分支。
- 调用方等待 `cw[r]`：`none`／`waiting`／`answered`。
- 快照：`cutAt[r]`（signal／close() 结算时的相；`init` = 关闭后或信号已触发时开始、当场拒绝）、`firstOut[r]`、`settles[r]`、`credAtClose`。
- 其余：`sends[r]`、`signalled`、`refusals`、`cred = [auth, report]`、`closed`、`closeDone`。动作 `Begin`、`AuthDone`、`Answer`、`Refuse`、`Broken`、`DiscDone`、`Signal`、`Close`（含 `CloseSettles`）、`LineClosed`（原 `CloseFinish`）。
- 不变式：`V1_SettleOnce`（settles ≤ 1、done ⇔ settles = 1、out = firstOut、未结算 out = none）、`V2_NoCredentialAfterClose`（closed ⇒ cred = credAtClose）、`V3_RejectAtMostOnce`（report ≤ refusals）、`V4_SignalBounded`、`V4_CloseBounded`（在途项已结算且 cw ≠ waiting）、`V5_NoResendForCaller`、`V6_ByPhase`（原 `V6_CloseThreePhases`，cutAt → out 映射）。
- Bugs：`resettle`、`cred-after-close`、`report-twice`、`signal-dead`、`close-settles-after-line`（原 `close-after-line`）、`resend-any`、`close-not-sent`、新 `caller-waits-workflow`。

## 8. 自定裁定与理由（都是「能自己定」）

a. V6 扩到 signal 与 close() 同一规则。依据：已定第 1 条写的是「signal 与 close() 当场同步按相结算」，裁定正文「让每一相的结算规则同形」，诊断第 7 条「V6 按第 1 条重述」。
b. V2 在模型里从 `closed` 起断言（快照在 `Close` 取），比 SPEC「返回之后」强。依据：目标结构第 3 条每次调用端口前同步核 `usable`；取在 `CloseFinish` 会让 `closed` 与 `closeDone` 之间的凭据调用混进快照。SPEC 的 V2 句未动（第 5 条只授权改 V4、V6），`models/README.md` 写明了强弱关系。
c. 挂起不加常量。模型里挂起 = 答复端口的动作不被选中，TLC 检查每个前缀，每个配置都含挂起行为；加显式「挂起」状态只缩小行为集合，不改安全性质的结论。反例轨迹本身就是凭据句柄没答复的前缀。
d. `cw[r]` 建为调用方对该请求的最后一个等待（`call` 的 `answer`、操作的结果）；`call` 自己的 promise 在出发点或结算时兑现、不晚于 `answer`，不单独建。
e. 工作流的 `line` 阶段在 signal／close() 中止时不收拢：线路迟到的应答仍可到达并被丢弃。这样「迟到应答不再结算」在正控里可达，V1 的变异才能变红；对应「线路可能在中止后仍答复」的抽象。
f. TLC 负控改名 `close-settles-after-line`，注入的缺陷与探索器 `mV4-close-after-line` 相同（close() 先等线路、后结算）。NB3 的「同名不同缺陷」以缺陷趋同解决，两边名字各自说明缺陷。
g. 变异表放在 `run.py` 的 `MUTATIONS`，不另开文件：在写范围所列文件内，满足 NB11「入库」。
h. `FORMAL_OUTPUT_DIR` 缺省改为 `tmp/formal/mcp-host-local/runs/`（同 `packages/mcp/mcp` 的约定）。
i. V1 同时用 `settles` 计数与 `firstOut` 快照：计数抓「再结算一次（即便值相同）」，快照抓「答复被改写」。
j. 凭据句柄答失败／reject（T9）、线路 `send` reject、`cancelRequest` 的通知、旧 HTTP+SSE 回退 GET 仍不在模型里（与上一版相同），已写进「模型的抽象」。

## 9. 没覆盖到的项 / 待后续闭包对齐

- SPEC 证据表与 `verification/README.md` 的探索器一列仍引用 `mV4-signal-dead`、`mV4-close-after-line` 等旧名与旧 V4；探索器的新 V4、新负控与运行记录由 `w3-mcp-host-fix2` 交回后，由表达与证据闭包写入。文中已标「以 fix2 交回为准」。
- 动作映射「实现」一列按目标结构写，没有函数名；对齐归后面的闭包。
- 本闭包未改 `src/`、`tests/`；`tests/model/properties.ts:195` 仍有签名 `V4-close-after-line`（fix2 范围）。
- 清理候选（写范围外，未动）：无；`git grep` 旧名在写范围外只命中上述 `properties.ts`。
- 模型没有活性性质：「调用方最终得到答复」只以安全形式（结算当场发生）表达。
