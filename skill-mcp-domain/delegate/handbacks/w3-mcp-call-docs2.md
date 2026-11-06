# 闭包 w3-mcp-call-docs2 交回

## 1. 结论

做完。工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call`，分支 `PanQiWei/skill-mcp-w3-mcp-call`，基线 `0b84a0bec`，最终 head **`8d376c0ba`**，`git status` 干净，未推送。验收 1–4 全部达到；写范围外没有改动，`lost.ts` 的 diff 只有注释行。停止条件没有触发：每条文档要求都能与 `0b84a0bec` 的代码行为对上，每条变异都能在副本上构造。

加载的技能与说明：读了 `asd-ste100` 的 `references/documentation.md`（中文采用范围），没有读 `SKILL.md` 全文和 `writing-rules.md`；`lost.ts` 只改注释，没有加载 `pstack:typescript-best-practices`。`writer-conventions.md` 读了全文。

## 2. 提交（作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code` / `Agent-Role: developer`）

| 提交 | 内容 |
|---|---|
| `7dc0bad95` | `verification/README.md` 与 `verification/models/README.md`：C 序列整体重跑并补行；探索器、N 序列与 TLC 的运行记录写实际的 head；动作与状态映射跟占位句柄；四个键重写 |
| `e2e21d3dc` | 成员 SPEC、契约 SPEC、两种语言的 README、`docs/` 三页、`lost.ts` 注释 |
| `8d376c0ba` | MC-12 第二句变异声明补上 `（C55）`（我自查发现 `e2e21d3dc` 的提交说明比文件写得多） |

`git diff --name-only 0b84a0bec..HEAD`（全部在写范围内）：`packages/mcp/mcp-contract/SPEC.md`、`packages/mcp/mcp/{README.md,README_ZH.md,SPEC.md}`、`packages/mcp/mcp/docs/{architecture,flows,object-model}.md`、`packages/mcp/mcp/src/internal/lost.ts`、`packages/mcp/mcp/verification/README.md`、`packages/mcp/mcp/verification/models/README.md`。`git diff 0b84a0bec..HEAD -- src/internal/lost.ts` 的 `+/-` 行：一行新增注释（文件头）与一段 `/** … */` 注释替换原来的单行注释，没有代码行。

## 3. 验收逐项

**验收 1：变异重跑。**
- 做法：副本是 `git archive 0b84a0bec` 的展开，在工作树之外 `/tmp/docs2-mut/tree`，`node_modules` 以符号链接回指工作树；契约变异（C23、C49）在副本里重建契约 `dist`，还原后再重建。每条改后跑所列用例文件（快层，`--typecheck.enabled=false`，`VITEST_MAX_WORKERS=4`），按字节还原并断言与工作树逐字节相同。
- 驱动：`tmp/closures/w3-mcp-call/docs2/mutations/mutate.py`（sha256 前 16 位 `005dd252100974e8`）；汇总 `logs/table.json`（`6e7d45e39d24902a`）；逐条日志 `logs/<编号>.log`；重跑前 `--check` 核过每个 old 文本在工作树里恰好出现一次。
- 结果：79 条（C01–C78 去掉 C50，C30、C32 各拆 a/b）里 **78 条变红，1 条存活**。存活的是 C37（先复用再判关停），是前一轮已记的等价变异（`closeAll` 在让出事件循环之前同步关闭每个条目，次序不可区分）。每行的 head 都是 `0b84a0bec`。
- 工作树的源码没有被改动（脚本断言 + 提交 diff 为证）。

C 序列表（编号 | 改了什么 | 变红情况 | 日志哈希；head 均为 `0b84a0bec`，用例标题与文件在 `verification/README.md`「调用口闭包的变异记录」和 `logs/table.json`）：

```
C01 in-flight reserve 不查重 | 红3 | 3b5d31fbb79c4f7a
C02 in-flight conclude 对未取消的未发出调用结束而不撤销 | 红4 | 0388a1917bbb3bbd
C03 关口拒绝一律 unknown | 红3 | 52690c39fabd03b7
C04 配值拒绝一律 unknown | 红3 | cb63cea7ddf93f3c
C05 不核动作可用性 | 红2 | ed76e8fdd66ceda6
C06 不核摘要 | 红1 | 1736e6ac3d921169
C07 settings 阶段原因改答 unknown | 红2 | 64acd7179e3c2b2c
C08 connectionFailureOfBuild 一律 connection-unavailable | 红1 | 7f1e2c9d607f20fe
C09 connectionFailureOfBuild 原样交出 effect-unknown | 红2 | 7457735f5232b357
C10 加入方到期(pending)改答 unknown | 红2 | f14525cb4c11af94
C11 not-sent 不经 table.lose | 红4 | 01caea203cfdfcd7
C12 session-ended 记成 stream-broken | 红1 | f8403b739f5e197e
C13 authorization-required 改答 connection-unavailable | 红1 | bb4c5bd2f7c41cea
C14 结局 unknown 不经 table.lose | 红3 | fdf9596e1dbb6b66
C15 不调用 cancelRequest | 红7 | ce4790f840f6aed8
C16 cancelRequest 改回 await | 红2 | b2cf208acaf5223b
C17 观察函数错误不吞 | 红1 | 20fa4d3976c2873c
C18 conclude 对停止信号已触发的未发出调用撤销占位 | 红8 | 628afe3941cffc7a
C19 去掉 finally 的收口 | 红23 | 60f8a4295224c9a6
C20 存储读取不经停止信号 | 红2 | 725e05f21b6e5eba
C21 ensure 不经停止信号 | 红2 | 1e96302f354e803b
C22 发出代际改回实时代际(调用口一路) | 红1 | a5838c449ac0ee6f
C23 契约去掉对 checkOutput 抛出的吸收(重建 dist) | 红2 | 0e9a7a2b68ca5588
C24 取消赛跑的 not-sent 仍转 lost | 红1 | 4b6fc8df67b74572
C25 continue 建连前不核代际 | 红1 | d7ed71bbe702a85a
C26 continue ensure 之后不再核代际 | 红1 | caa979fc46ace77c
C27 请求不带 continuation | 红3 | 8f6dfe1d99bad368
C28 两字段都缺也发出 | 红1 | 0b9b73054f54d1a1
C29 task 结局不登记 | 红25 | c367363389c0dfd1
C30a/C30b 在途表键去掉主体/租户 | 红3/3 | 1396f09eaca549e5 / 8c8397d2f34b1958
C31 cancel 不核当前代际 | 红3 | 0bf42187f8cb9ab8
C32a/C32b 任务表键去掉主体/租户 | 红2/1 | aa2ee3b076e85cd3 / 9ed798d35ecb0ffe
C33 不比较对端账号 | 红2 | 2f9af533afdd4b77
C34 不复用现有连接 | 红1 | b8cfa42b81367a61
C35 采用不可读也答 no-connection | 红1 | c423b508f2655d2d
C36 connectionOf 去掉入口关停检查 | 红2 | c4948760f1adce57
C37 先复用再判关停 | 存活(等价) exit 0 | 753bdaf3f2481571
C38 no-answer 子因改 abandoned | 红1 | 9dae4c2bd485d3e0
C39 任务请求不受时限 | 红1 | 55465a7bd53da595
C40 表外任务也发请求 | 红2 | 327b4a58b48067c8
C41 不核 TaskRef.issuedAt | 红2 | 9f24ac6c9203fbc4
C42 资格非 granted 也建连 | 红3 | 10446f907863678f
C43 不读 ports.clock | 红1 | 75ba6e22d7a419bf
C44 isShut 恒假 | 红6 | 6e8c5bff9834c966
C45 no-answer 后重发 | 红1 | d6e6453174c0679c
C46 发出后取消再发一次 | 红1 | 4fc2e73a3bcd409b
C47 存储违约答 action-unavailable | 红1 | e2af049fc3534dae
C48 under 已触发信号仍起等待 | 红1 | a421b7f54bd3220a
C49 分类放回 ask 闭包 + C23 | 红1 | 3f5fe21513c1a17d
C50 无可变异代码(见第 6 节) | —
C51 任务请求 not-sent 答 effect-unknown | 红2 | 64de91a0bae98f8f
C52 T9 违约不记已发出 | 红1 | 7555c7b6298a2e7c
C53 F1(d)：not-sent 后 await loseOn | 红1 | 4ccdad3bb68fd6c5
C54 F1(d)：applyAnswer 里 await loseOn | 红1 | d7ee07606d73ed9c
C55 sent 记视图实时代际(MC-12) | 红2 | 611afbd3ed9e7ea4
C56–C71 = fix2 的 G1–G16：
C56 ensureOptionsOf 不带 connectBound 红1 16db7548fe752b61 | C57 checkRequest 只看 requestState 红1 187ef3dab146fd9b
C58 failureOfEnsure unknown 支 红1 b643ccc3dd357f6c | C59 缺省支原样交出 红1 0cf0462a8423700f
C60 withdraws 恒假 红4 a60359bc389eeaf5 | C61 loseUnlessStopReply 对任何已触发信号不转 lost 红1 9a78774f47a1831d
C62 首次调用带 continuation 红1 80e8439f8ba323e4 | C63 perform 答复时不核停止信号 红3 c821bde0df92867c
C64 under 等待前不核关停(S8 先判) 红4 c42555d1bfdb794c | C65 第 8 步不核关停 红1 fc3aa6a0bb276cde
C66 任务关口后不再判关停 红1 60e2042dc9db8804 | C67 refresh 不先判关停 红1 fcb457bc5d543890
C68 第 8 步不核停止信号 红1 7ca0b152f08a0d28 | C69 任务号碰撞不判 红1 79b7487b9562d7da
C70 第二次 conclude 删键 红1 6a73aee1c33e3dcf | C71 lostOfOutcome 去掉 unknown 支 红3 fa06e5d2a22ed692
C72–C78 = fix2 的 D1–D7：
C72 第 5 步箭头答 undefined 红30 d356f236bda4cc27 | C73 lost !== undefined 翻转 红16 4c14d9850482e911
C74 checkRequest 续调用分支关闭 红47 1abf07b8318a21ed | C75 建连后核代际否定去掉 红34 3087d28345b2f757
C76 放弃块只剩 return(与 C15 同效，D5 对应行) 红7 c6fe5bcdaf6cb2dc | C77 perform try 体清空 红37 e5febb9039b440b4
C78 conclude 去掉 delete 红9 f5658bf25c524efa
```

完整表（含用例标题、退出码、head、哈希）已写进 `verification/README.md` 末节；`tmp/closures/w3-mcp-call/docs2/mutations/rows.md` 是同一份。

**探索器负控 N1–N8**：在 `0b84a0bec` 的副本上重跑（工具 `tmp/closures/w3-mcp-call/docs2/model/controls.py`，日志 `docs2/model/controls-run.log` `89e60336263ca10e`，`controls/table.json` `d094db37402333a6`），签名与 fix2 的记录逐字相同（两个哈希也相同）。N1 只报 P14 的三条（`P14-stopped-waits[adoption.endpoint]`、`[eligibility.check]`、`[store.read]`），不再报 `P9-sent-after-stop`——第 8 步挡住了发出。N8（删碰撞规则）→ `task-collision` 报 P12 `P12-task-on-foreign-connection` 与 P5 `P5-crossing`。N5 报 P13 两条加 P1、P2、P3、P4。
**探索器读数**：调用口 12 个场景取自 fix2 在 `0b84a0bec` 上的一次运行（`fix2/gates/turbo-0b84a0bec.log`，02:17 起），已写进表。
**TLC**：29 个配置的读数取自 fix2 的运行（证据目录 `fix2/model/tlc/20261105T194113Z`，`tlc-all.log` `e61f1a2f61787715`，4 个工作线程）。我核对了两个 `.tla` 与 29 个 `.cfg` 的 SHA-256 与 `0b84a0bec` 上的文件逐个相同。

**验收 2：门禁**（在最终 head `8d376c0ba` 上跑，03:43 UTC；日志 `tmp/closures/w3-mcp-call/docs2/gates/*-8d376c0ba.log`）：

| 命令 | 退出码 | 输出尾部 | 日志哈希 |
|---|---|---|---|
| `pnpm run check:docs` | 0 | `PASS: 2736 Markdown files; local links and skill mirrors.` | `370623577405c36b` |
| `pnpm run check:design` | 0 | `PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | `07b0af04fe75d967` |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | `31711f1660fe1456` |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6079 个提交的署名，无违反。`（日志里的计数以日志为准） | `2e57e0953d535197` |
| `pnpm run lint:oxlint` | 0 | 无输出 | `3bb45224ba2ce5d7` |
| `git ls-files --eol packages/mcp \| grep -c w/crlf` | 计数 0 | `0` | `9a271f2a916b0b6e` |

没有跑成员全量、`typecheck`、`admission`、仓库全量测试与差分变异：本闭包除 `lost.ts` 注释外不改代码。

## 4. B R2-2～R2-11 逐条

| 项 | 状态与位置 |
|---|---|
| R2-1 | 不在本闭包（fix2 已改代码与 SPEC）。 |
| R2-2 | 已改。`verification/README.md` 末节整体重跑，每行写 `0b84a0bec` 与日志哈希；「最终 head」一词不再出现；F1(d)=C53/C54、S8 先判=C64–C67、第 8 步=C65/C68、占位句柄=C70/C78、碰撞=C69；SPEC MC-16 映射表第 1 行（C07）改引「step 7: a call that joins a build past its join bound, and one queued past its section bound」（排队到期，经 `ensure` 的 `settings` 阶段）与「step 3: at whichever microtask closeAll lands」（`closeAll` 落在建连途中）。 |
| R2-3 | 已改。MC-16 第 11 步在 fix2 已写；本闭包在 SPEC「所有权」第一条补一句：应答总经 `ask` 读取，reject 被吸收，停止之后只丢弃它的值。 |
| R2-4 | 已改。契约 SPEC：第 26 条起另列「调用口闭包的裁定」（`#decisions-w3-call`），新增第 28 条（O1/O3 吸收与两个常量）、第 29 条（R2 的 `cancelled`）、第 30 条（S8 次序），均带出处；前言计数改正（第 1–25 条），依据表加「调用口闭包的决定（2026-11-05）」一行；根入口 `.` 行补 `OUTPUT_CHECK_FAILED`、`STRUCTURED_CONTENT_MISSING`；S8 删掉重复的「任务操作仍先按 S2 判发起者。」。`docs/public-api.md` 已列两个常量，不用改。 |
| R2-5 | 已改（SPEC 部分）。读法段补 WF1–WF5、P14 T1/T2 与闭包规格条目的写法；`:130`「已定事项 2」改为「闭包规格 `w3-mcp-call`「reduce 已定的事」第 2 条」；MC-17 抬头改为「…「reduce 已定的事」第 5、6 条」「修复轮规格 `w3-mcp-call-fix1` 已定的事第 8 条」。用例标题 `step 7: after closeAll` → step 3 在 `tests/`，是 fix2 做的，不是本闭包。 |
| R2-6 | 已改。SPEC「未覆盖」那条与「性质与证据」的前提那条说同一句：决定点（`under` 等待之前、第 8 步、`perform` 答复时）由服务层逐微任务扫描用例守住（变异 C63、C65、C68），探索器与模型不是证据；`verification/README.md`「发现」里的 C50 段同口径。 |
| R2-7 | 已改。成员 SPEC 的 WF5 写明是对传输的前提，依据契约 T5「`call` 在信号触发后结算」一句，该句由 `w3-mcp-host` 第 2 轮补入，合入父分支之前出处在途；`verification/README.md` 的抽象列表、F1(b) 同口径。 |
| R2-8 | 已改。`verification/models/README.md` 的 `Keys`：A=(home, alice, main)、B=(away, mallory, main)、C=(home, bob, other)、D=(away, alice, main)；A 与 B 差在租户和主体，A 与 C 差在主体和账户，A 与 D 只差租户；探索器的键 E 只用于 `task-collision`。 |
| R2-9 | 已改。`README.md:95`、`README_ZH.md:95` 的验证段只链接 SPEC「性质与证据」与 `verification/README.md`，不列编号。 |
| R2-10 | 已改。S8 的变异编进 C 序列（C64–C67）；C21、C47、C48 的「自裁」在末节说明指修复轮 `w3-mcp-call-fix1` 写者自裁 1、6、2（卡拥有者已采纳）；MC-12 两句变异声明：第一句原文「`reserve` 查后经 await 再占」构造不出（`reserve` 是同步函数，类型不允许在两步之间 `await`），改成「不查重 → C01」并写明原因，第二句对上 C55。 |
| R2-11 | 已改。`lost.ts` 文件头加一句、`lostOfNotSent` 的注释重写成与文件头同一口径（按原因判断、偏安全，已触发信号下的 T5 例外由调用口处理）；偏离表那一行 fix2 已补 T5 例外，核对无需再改。 |
| fix2 交回第 7 节 | 已改：`docs/flows.md`、`docs/object-model.md`、`docs/architecture.md` 跟占位句柄与第 8 步；`verification/README.md` 的动作映射、状态映射、探索器近似、F2 叙述、C50、N 表（N1 去 P9 签名、加 N8）、探索器读数表；`verification/models/README.md` 注明 `gateW`/`tgateW` 在关口之后读 `shut` 与代码读取点不同、两者对「关停之后不问端口」的可观察结果相同；任务键碰撞 TLA 未建模，P12 行与 `verification/README.md` 同口径；成员 SPEC 依据表契约修订钉 `f34077cec`。 |

## 5. 自定决定与理由

1. **C 序列整体重跑，不只重跑「至少」清单**：fix2 改写了几乎每处被变异代码，我逐行把旧 old 文本换成新结构里对应的一行，C01–C52 沿用旧编号与意图；新行 C53–C55，fix2 的 G1–G16、D1–D7 编成 C56–C78。能自己定，依据是闭包规格第 1、12 条「并入 C 序列，不另起编号体系」。
2. **C50 退役**：`under` 等待之后再核的那行已不存在，C50 在 `verification/README.md`「发现」里改写为「无可变异代码，判定点现由 C63/C65/C68 变异」。依据是 fix2 自裁 2。
3. **MC-12「查后经 await 再占」**：构造不出，改写声明，不是标「未验证」。
4. **成员 SPEC 的契约修订钉 `f34077cec`**：这是 S8 最后一次语义改动；本闭包改契约 SPEC 只是出处登记、新增决定条目与删一句重复，没有行为变化。由派发者决定是否改钉。
5. **契约 SPEC 的新结构**：把原第 26、27 条移进新节 `#decisions-w3-call` 与新增的 28–30 同列，是为了让「第 1–25 条每条只加」的前言保持成立。能自己定，依据是 R2-4「前言计数改正」。

## 6. 未覆盖与要派发者知道的事

- **探索器的生命周期场景表**（`rebuild`、`bounds`、`wide` 等）仍是 2026-11-05 的读数，没有 head：`tests/model/lifecycle.spec.ts` 不打印读数；fix2 只改了 `table.lose`/`markLost` 的签名，探索器与用例在 `0b84a0bec` 上通过，但读数我没有重测，`verification/README.md` 里写了这句。
- **TLC 读数**：生命周期表换成了 fix2 的 4 线程运行；正控的状态数与旧的 6 线程运行逐项相同，负控的不同状态数略不同（TLC 并行调度造成，模型未变，`.tla` 与 `.cfg` 的哈希相同），README 里写了这一句。TLC 运行早于提交 `f34077cec`，哈希核对是本闭包做的。
- **WF5 与契约 T5**：T5 现文没有「`call` 在信号触发后结算」一句，出处在途，直到 `w3-mcp-host` 合入父分支。契约 T 段不在本闭包范围。
- **C37** 等价存活；**C50** 无代码；C76 与 C15 同效，是 D5 的对应行。
- **范围外的陈旧文字**（需拥有者改）：`verification/models/Calls.tla` 第 71–72 行的注释仍写「A 与 B 只差租户，A 与 C 只差对端账户」，与同文件定义不符（`.tla` 不在本闭包写范围，改注释会改变模型文件哈希，需连带重跑 TLC 记录）；`packages/mcp/mcp/tests/model/scenarios.ts` 的注释已正确。`src/tasks.ts:132` 的注释仍写「the connection is gone」，不在写范围（`lost.ts` 只授权改注释，`tasks.ts` 不在清单里）。
- **过程产物**：`tmp/closures/w3-mcp-call/docs2/{mutations,model,gates}/`（被 `.gitignore` 忽略）；副本 `/tmp/docs2-mut/`（含 `tree`，在工作树之外，可检查或删除）；`/tmp/docs2-block.md`、`/tmp/docs2-head.md`、`/tmp/docs2-tail.md`、`/tmp/docs2-tlc.md` 是生成 README 片段的临时文件。
- 没有改 `tests/`、`src/`（除 `lost.ts` 注释）、`acceptance/`；没有推送、开 PR 或合并。
