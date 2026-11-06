# W3 接手计划与进度（2026-11-05 起，本机会话）

接手自云机会话（交接包 `HANDOFF.md`）。负责人 2026-11-05 指示：父分支先同步最新 `integration/mainline`；本会话单会话做主力，能自己做的自己做；守住领域职责与边界、SOLID；代码优雅、正确、可读；把 W3 交付完成。需要负责人定的事，从应然出发自己定，实在定不了再上报。

执行范式仍是 `waves/operating-model.md` r3（下称范式），变化只有两处：写者主要是本会话自己；评审仍派独立子代理（自审不算评审）。

## 进度总览（2026-11-06 11:17 UTC）

**当前状态。** W3 五段的实现与写回全部合入父分支并推送（`706152690`，11:10 UTC），PR #1149、#1151、#1152 显示 MERGED。W3-D、W3-E 的证据已贴卡（评论 6683488904），卡正文已写回（C4 达到）。剩下父分支头准入（在跑）、三张小卡（起草中）、交接报告补准入读数、W3 报告评论、记录分支与清理。W4 的两线 spec、plan 已按模板写好，写者档位已按负责人分档改正，计划类评审在跑；轨道无新提交，W4 的 F 即 `706152690`。

| 阶段 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| W3-A host 收口 | 完成 | PR #1138；卡评论 6680928470 | — |
| W3-B call 收口 | 完成 | PR #1141；卡评论 6681108939 | — |
| W3-C 合入与组合 | 完成，父分支 `3289bee2f` 已推送 | 卡评论 6681699320 | — |
| W3-D 端到端 | 完成，父分支 `706152690` 已推送 | PR #1149（MERGED）；卡评论 6683488904 | — |
| W3-E 波末 | 写回合入并推送（`74511e1ff`、`203cde80e`）；合并结果门禁全绿；卡正文已写回；`handoff.md` 已写（准入一节待补）；准入在跑；三张小卡起草中 | PR #1151、#1152（MERGED）；`tmp/closures/w3e-merge/`；卡评论 6683488904；`handoff.md` | 准入读数补进 `handoff.md`；小卡发布；W3 报告评论；记录分支；清理工作树与 `/tmp` 副本 |
| W4 | 两条线的 `spec.md`、`plan.md` 已按 `claim` 模板与 Matt `to-spec`／`to-tickets` 写成（Opus high 起草，11:10 交回）；写者档位已改为负责人分档（Opus high、Sonnet high）；计划类设计评审在跑；F = `706152690`（轨道无新提交） | `waves/w4/{mcp,skill}/{spec,plan}.md` | 评审闭合后开波：共享写、派 MCP 01 与 Skill 01 |

在跑：父分支头准入（`tmp/closures/w3-admission/`，11:13 起）；W4 计划类评审（design-reviewer，Opus high）；小卡起草（Sonnet high）。

交接时单列给负责人：GS-05、GM-P3 按卡拥有者已选方向写回或不写，可收回；G1–G8 原文未留存，以现行对照取代；卡评论 6657905811 的加注被权限检查拒绝；判据 C3 加了并发守护一句（依据负责人 2026-11-05 指示，W4 方案原写「C3 不变」）。

### 时间线

07:31：host 头 `50fc8d146`、call 头 `44a218fec`，都已推送。下一步：call 第 4 轮关口（A、B、E，C 窄，D 一次）；host 只复核 fix4 与 `50fc8d146` 的改动，D 一次。

07:50：call 头 `2b895ea2a`（F16、F17 文档）。host 证据贴卡 6679800023，PR #1138 正文已跟上；host 修复轮复核（简报 H 节）派出。call 最终头的整组测试在跑，跑完贴 call 证据评论，再派 call 的 A、B、E 与 D（D 两次依次跑，先 call 后 host）。简报 `reviews/mcp-call-r4-briefs.md`。C 不派（理由见简报与 `decisions.tsv`）。

08:47：
- **host 收口完成。** 头 `ebfedc98a`。修复轮复核无阻断，两条非阻断由卡拥有者改。差分变异分类之后没有缺口。最终证据贴卡 6680928470，PR 正文已跟上。等 call 合入父分支之后再合入。
- **call 第 4 轮关口收齐。** B、E、D 无阻断；A 有 1 条阻断（访问器字段读两次）。唯一一轮修复由卡拥有者做：`a556e3374`（边界每个字段只读一次，加两条缺口用例与 `refresh` 出口次序用例）、`ac54ff006`（文档，契约裁定第 31 条）。头 `ac54ff006` 已推送，PR 正文已改。
- 七项门禁、CRLF 与源码边界检查都在 `ac54ff006` 上跑过，结果在 `owner-gate-ac54ff006/`。整组测试在后台跑；对 A 阻断的窄范围独立复核已派出。两者都通过后贴最终证据，合入父分支。处置见 `reviews/mcp-call-r4.md` 末节。

09:30 **W3-C 完成。** 父分支 `3289bee2f` 已推送，PR #1138、#1141 显示 MERGED。证据卡评论 6681699320。
- call 合入 `f5276d707`；host 合入 `158471c17`。冲突在契约 `SPEC.md`（依据表、裁定两节、入口表）与 `docs/public-api.md`（入口表与定义索引），两边的句子都保留，入口表按合并后的 `testing.ts` 与 `public-entry.spec.ts` 核过。
- `3289bee2f`：成员 SPEC 与验证说明里 WF5 的「出处在途」改为链接契约 T5（call 第 3 轮 E 冲突 6）。
- 第一次三包运行在 host 构建上失败：本工作树没装 host 新加的 `eventsource-parser`。按合并后的锁文件安装之后重跑：三包退出 0（contract 680、host-local 402、mcp 472），慢层退出 0，六项轻门禁退出 0，CRLF 0。日志在 `tmp/closures/w3c-merge/`。
- 卡评论 6657905811 顶部加注被权限检查拒绝（改旧评论正文）；改在波末交接与评论里写明它已被 6666088522 更新。

09:38 **W3-D 开工。** `w3-mcp-e2e` 规格写好（`delegate/closures/w3-mcp-e2e.md`，简报检查退出 0），工作树 `.worktrees/w3-mcp-e2e`（基线 `3289bee2f`，三包已构建），写者 Sonnet 5.5 high 后台派出。

09:43：e2e 写者按停止条件停下：用例要 `legal-identity` 的 `TenantId` 与 `Access`，`mcp-host-local` 没声明依赖。派发者在闭包分支加 devDependency（`49f0681f8`），09:45 续用原写者（追加 1）。

09:46：W4 预案写好（`waves/w4/wave-pack.md` 定四件开波设计；`w4/mcp/spec.md`、`plan.md`；`w4/skill/spec.md`、`plan.md`）。W3-E 写回条目分类派出（只读 Sonnet，产出 `writeback-triage.md`）。

09:58：分类表收到（39 行：A 23、B 6、C 2、D 8），卡拥有者裁定写在分类表末节（G1–G8 以现行对照取代，加一次按契约裁定的 grep 核对；GS-05、GM-P3 交接时报负责人复核）。10:00 派出两个文档写者（Sonnet 5.5 high）：`w3-docs-skill`、`w3-docs-mcp`，基线 `3289bee2f`，简报检查都退出 0。

10:11：e2e 交回并核对（head `71b4b02f3`）：五个目标的旅程读数与规格一致，两种现代传输逐步结局种类相同，Python 目标实际执行，对照矩阵八行一致（SDK 2.4.0，09:57）；派发者复跑 MCP 三包 typecheck 与六项轻门禁退出 0、host-local 慢层 246 passed。HTTP 上取消走 `reserved` 分支的疑问已核：符合 T5，不是缺陷。PR #1149；A（Opus high）、E、B（Sonnet high）评审派出。

10:19：
- 两份文档写回交回并核对：Skill `773d9f04c`、`8106fed27`，派发者加 `1eab83b81`（删两行已交付的剩余义务），PR #1151；MCP `26ab418a7`、`f2fc80ace`（第 3 条核对没有新的语义分歧），PR #1152。E（Sonnet high）与 B（Opus high）各一个评审覆盖两个 PR。
- e2e 的 E、B 回：B 阻断 2（host-local README 第 17 行过时、SPEC 新行的「C4」指向不清）；E 未达到：S1、S2、S4、S5 没有变异也没写「未验证」，对照日志缺退出码，SSE 上 S4 不适用的依据要写成契约 T3。

10:28–10:33：e2e 的 A 回（阻断 0，非阻断 11，补做了 S1、S2、S4、S5 与 S7 `no-process` 一支的变异）；文档的 E、B 回（Skill 阻断 5，MCP 阻断 3 加 E 未达到 W-4）。三个唯一一轮修复派出（Sonnet high）：`w3-mcp-e2e-fix1`（S6 改为等第一条进度再取消等）、`w3-docs-skill-fix1`、`w3-docs-mcp-fix1`（加派发者点名三处）。

10:39：两份文档修复交回；派发者补 `f55d750d4`（契约「与组页的差异」改为现状说明；领域流程的续传参数）。窄复核派出。

10:44：三个修复都交回，两份窄复核都无阻断（`reviews/docs-writeback-r2-recheck.md`、`reviews/mcp-e2e-r2-recheck.md`）。父分支本地合入：docs-skill `74511e1ff`、docs-mcp `203cde80e`、e2e `706152690`（`mcp-host-local/SPEC.md` 自动合并）。在合并结果上跑六包测试、慢层与七项门禁（`tmp/closures/w3e-merge/`），绿了才推送。派发流水回填与卡正文修订稿起草派出（Sonnet high）。

10:50：卡正文修订稿交回（21 处，`card-body-after.md`、`card-body-changes.md`）；裁定：C3 并发守护句保留，「契约变更：additive」一行不加括注、限定写在「实施输入与约束」。

11:10：合并结果门禁全绿（`tmp/closures/w3e-merge/summary.txt`），父分支 `3289bee2f..706152690` 快进推送，PR #1149、#1151、#1152 显示 MERGED。

11:10–11:13：W3-D、W3-E 证据贴卡（评论 6683488904，C4 达到）；卡正文写回（父分支头 `706152690`，加 r20），读回一致；W4 起草者交回四份文件，写者档位按负责人分档改为 Opus high、Sonnet high，波包附录切片编号同步，派计划类评审；11:13 起父分支头准入；派 Sonnet high 起草三张小卡。

11:17：W3 `handoff.md` 写成（准入一节待补）；`integration/mainline` 无新提交，W4 的 F 定为 `706152690`。

负责人 2026-11-06 10:53：W4 按 Matt 技能与本项目自己的模板，先把 plan 与 spec 写好；等 W3 合入完成后，自主驱动推进。（「主分支」本会话理解为父分支 `PanQiWei/skill-mcp`：范式 r3 不进轨道与 `main`。）

负责人 2026-11-06 06:15：W3 交付边界按 `waves/w4/plan.md` 第 2.2 节定；W4 在 W3 做完后直接开工、自主推进（06:16 改口），开工前先写好 W4 交付方案与实施规格。

负责人 2026-11-05 晚：「继续自主驱动推进 W3 剩下的部分，以你自己作为前台持续推进交付的主力，必要的时候再用 subagents」。

| 闭包 | 线 | 状态 | 头 | 下一步 |
| --- | --- | --- | --- | --- |
| 父分支同步 | — | 完成：第三次同步 integration/mainline `1b017574b`（PR #1142，资产与设置治理后端、identity，与本卡不相交），无冲突；`typecheck` 0（88 个任务，日志 `8be23de4`）；`lint:deps` 先报 2 处 `no-unresolvable`（新包 `settings-local` 未构建），构建后 0（83 个成员、349 条边，日志 `1c5499ee`）；第二次 `5e5e83afb` 是 `cd6cb3cd7` | `3289bee2f`（已推送）；本地 `706152690`（W3-D、W3-E 写回已合入，门禁后推送） | 轨道再有更新时空闲再同步（W4 开波时） |
| `w3-skill-fix` | Skill | 已合入父分支（PR #1135，merge `8b0317ef3`）；第 4 轮复审收口与最终门禁见卡评论 6656358730 | `67373f3b1` → 父 `8b0317ef3` | — |
| `w3-mcp-contract` | MCP | 已合入父分支（PR #1132） | `5c26bc3ae` → 父 `92a8e3cdf` | — |
| `w3-mcp-lifecycle-model` | MCP | L3 阻断已在 lifecycle 处置 | `12c3300cd` | 随 PR #1134 合入 |
| `w3-mcp-lifecycle` | MCP | 已合入父分支（PR #1134，merge `b2ba7dc89`）。三次提交、两轮复审；最终 head 差分变异：static 从 47 降到 1，余下的「没跑测试」经直接运行证明是运行器缺陷，超时 4 处逐个手工复核（2 红、2 等价）；证据卡评论 6657605963 | `81cb0884b` → 父 `b2ba7dc89` | — |
| `w3-mcp-host` | MCP | **已合入父分支**（PR #1138，merge `158471c17`，父分支 `3289bee2f` 已推送）。四轮评审：第 1 轮 A 阻断 5、C 阻断 5（同一根因：T8 决策层没进契约根）；第 2、3 轮结构重做与形式化（`06b98034d`、`72f977c81`）；第 4 轮关口后唯一一轮修复 fix4（`1ec708899`）与派发者的 `50fc8d146`、`ebfedc98a`，复核无阻断，差分变异无缺口。证据卡评论 6657905811（第二段）、6680928470（最终） | `ebfedc98a` → 父 `158471c17` | — |
| `w3-mcp-call` | MCP | **已合入父分支**（PR #1141，merge `f5276d707`，先于 host）。四轮评审：第 1 轮 A 阻断 3、C 阻断 4；第 2 轮 A 阻断 1；第 3 轮 C 阻断按甲做结构修法（fix3 `deb5a977e`、`035ac8fee`）；第 4 轮 A 阻断 1（访问器字段读两次），卡拥有者唯一一轮修复 `a556e3374`、`ac54ff006`，独立复核无阻断。证据卡评论 6680037685、6681108939 | `ac54ff006` → 父 `f5276d707` | — |
| `w3-mcp-listing` | MCP | 未开工：C1 清单容错（单个不合法工具剔除并报告；重名的处置先核 SDK 2.4.0 的事实）| — | host 合入后开，改契约 C1、T2、未封闭项与 refresh 的报告 |
| `w3-mcp-e2e` | MCP | **本地已合入父分支**（PR #1149，merge `706152690`，待门禁后推送）。五个本机真实服务端走 S1–S7；对照矩阵八行与 SDK 2.4.0 一致；评审 A、B、E 一个关口，唯一一轮修复 `64e3ef161`、`e50c356a4`，窄复核无阻断 | `e50c356a4` → 父 `706152690` | 推送；读数贴卡 |
| `w3-docs-skill` | Skill | **本地已合入父分支**（PR #1151，merge `74511e1ff`）。组页、组内流程、组入口、两份领域页写回；契约差异表退出；评审 E、B 一个关口，唯一一轮修复 `7a426a670`，窄复核无阻断 | `7a426a670` → 父 `74511e1ff` | 推送 |
| `w3-docs-mcp` | MCP | **本地已合入父分支**（PR #1152，merge `203cde80e`）。组页、组内流程、组入口、领域页、成员 README 写回；契约差异表改为现状说明；评审 E、B 一个关口，唯一一轮修复 `d543dd236`，派发者 `f55d750d4`，窄复核无阻断 | `f55d750d4` → 父 `203cde80e` | 推送 |
| 波末其余 | — | 进行中：父分支门禁在跑；派发流水回填在做；卡正文修订稿与三张小卡已起草 | — | 准入与回路硬线、卡正文与 W3 报告、小卡、交接、记录分支、清理 |

关键读数：

- Skill 本机十类语料 190 包：闭包上 190/190 加载且读正文成功；父分支上 189/190。
- Skill TLC v1.7.4：五个正控无反例，状态数与旧记录逐个相同；S7 负控报反例。
- MCP 契约变异 M53–M164 全部变红；K5（`x-mcp-header` 不允许 `number`）已落地并证明会变红。
- MCP 连接表重写：快层 304 例、慢层 3 个场景通过；探索器 7 个场景 P1–P8 零违例。原来的五个已知反例（B1、N2、N3、P2、N1）全部消失。
- 新加的 S9 次序检查找到并修掉一个真缺陷（迟到落地的进程停止前，`closeAll` 提前释放它的句柄）。
- TLC v1.7.4：14 个配置全部符合判读（5 正控、7 负控、2 探针）。
- MCP 契约 PR #1132 已合入；第 6 轮复审的 F4–F8 登记为 `w3-mcp-host` 的未封闭项。

## 本机差异

- 仓库根 `/data/qiwei/repos/omne-harness-lite`。父分支工作树 `.worktrees/skill-mcp`，记录工作树 `.worktrees/skill-mcp-records`。脚本里的云机绝对路径已改；历史记录正文不改。
- 署名用 `git config --worktree`，主检出不受影响。
- 机器 8 核、30G。差分变异只打改动热点（`VITEST_MAX_WORKERS=6`）。
- TLC：仓库钉 v1.7.4。本机 `/opt/tlaplus/tla2tools.jar` 已于 2026-11-05 换成 v1.7.4（SHA-256 `936a2620…`），旧的 2026.09.12 留作 `tla2tools-2026.09.12.jar`；`~/.local/opt/tlaplus-1.7.4/` 是同一文件的副本。

- 2026-11-05 约 14:40 宿主 429 限流，四个写者（call-fix1、call-model、host-docs、host-formal）同时中断；15:05 恢复后续用原写者。教训：四个顶档写者并行会在 5 小时窗口里耗尽额度，之后同时最多两到三个顶档写者。

## 接手裁定（本会话，从应然出发；理由一并写进相应闭包规格的追加记录）

| 号 | 事项 | 裁定 | 理由 |
| --- | --- | --- | --- |
| K1 | P8 T2：`ensure` 的时限都到期后还等不等端口 | 做成承诺：时限到期后 `ensure` 不再等任何端口，立即答复 | 范式「每个异步副作用有等待上界」；已定事项 22 已对采用重读设了上界，T2 是同一承诺的完整形式。调用方拿到的时限必须是真的 |
| K2 | MC-14、MC-15 的吸收范围是否扩到同步抛出 | 扩：端口调用只经一个适配器，同步抛出、reject、挂起、答复都变成类型化结局 | B1、N2、N3 同一根因；契约 R4-3 已对传输方法规定「同步抛出与 reject 同样处置」，两处应一致 |
| K3 | `discover` 途中关停，`ensure` 仍答 ok | 不答 ok：关停开始后完成的 `ensure` 与关停之后才开始的 `ensure` 答同样的拒绝 | 已定事项 23「`closeAll` 之后拒绝建连」；交出一个随即被拆的连接是把失败说成成功 |
| K4 | `w3-mcp-call`、`w3-mcp-e2e` 是否挪到 W4 | 不挪，W3 按原计划交完 C4 | 负责人 2026-11-05「把 W3 交付完成」 |
| K5 | SEP-2243 不允许 `x-mcp-header` 用 `number`，契约 T2 仍允许 | 在 `w3-mcp-contract` 收口时按 SEP Final 定，宽进严出（见该闭包追加记录） | 生态兼容：读对端时不比规范严，自己发出时守规范 |
| K6 | `mcp/verification/gaps-mcp.md` 去留 | 不进仓库，留记录分支（与 Skill 的 `gaps-skills.md` 一致）；有退出条件的项进成员 SPEC「已知限制」 | 差距账本是过程材料；仓库只放承诺与证据 |
| K7 | RFC-0001 r4 仍写 SDK 2.3.1 | 不在本卡写范围；波末另开小卡写回负责人 2026-11-04 的决定 | 卡 #1119 只写两组成员与领域页 |

## 待办

### 0. 接手与同步

- [x] 读交接包、卡 #1119、范式、W3 波包与结构性处置
- [x] 主检出切到 `integration/mainline`，本地 `main` 快进
- [x] 父分支工作树；合并 `origin/integration/mainline`（只有锁文件冲突，按 mainline 锁重算）
- [x] 六成员 build、typecheck、test；`preflight`；提交合并并推送 → 新 F（记下）
- [x] TLC v1.7.4 并排装好，`check:formal-tools` 指向它时通过
- [x] 闭包工作树：`w3-skill-fix`、`w3-mcp-contract`、`w3-mcp-lifecycle-model`，各合入新 F

### 1. Skill：`w3-skill-fix`（第 2 轮收尾）

- [x] 读两个 WIP 的差异，核对 N1、N2 的实现是否完整
- [x] 三成员门禁修到绿
- [x] N2 验收：claude-api 包 `describe` 与 `read` 正文成功；16385 字符拒绝；单一常量从公开根导出
- [x] 本机十类语料 190/190，每包读正文成功（负责人 2026-11-05：用本机可用的 Skill）
- [x] 探索器与 TLC 正控、负控复跑
- [x] 收尾门禁（`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`）：合入前在最终 head 全绿
- [x] 独立评审：L3 无阻断；表达 1 阻断 6 非阻断（`reviews/skill-fix-r2.md`）
- [x] 第 3 轮修复：B1 答 `unknown`、N1–N6、L3 非阻断 1–3；第 4 轮复审阻断 0，非阻断 6 条自改（`67373f3b1`）；最终 head 补跑门禁（`reviews/skill-fix-r3.md`）
- [x] 差分变异（热点）
- [x] 两个 WIP 压成正常提交；PR #1135；merge commit 合入父分支 `8b0317ef3`

### 2. MCP：`w3-mcp-contract`（第 6 轮验收）

- [x] 门禁与剩余变异（M85、M138–M164）
- [x] K5 落地
- [x] 增量表达复审；按停止规则处置（F1–F3、F9–F12 自改，F4–F8 登记未封闭项；`reviews/mcp-contract-r1.md` 第 6 轮）
- [x] PR #1132；merge commit 合入父分支 `92a8e3cdf`

### 3. MCP：`w3-mcp-lifecycle-model`（评审与合入）

- [x] head 上复跑门禁；补 `tests/index.md`、`tests/README.md` 的 `tests/model/`（随 lifecycle 合入）
- [x] K6：移出 `gaps-mcp.md`
- [x] 独立 L3 评审：模型—实现映射与反例（B1、B2 阻断；`reviews/mcp-lifecycle-model-r1.md`）
- [x] 处置并进 `w3-mcp-lifecycle`；两闭包一起合入（连同 `w3-mcp-table` 1160e92c8），父分支 `b2ba7dc89`

### 4. MCP：`w3-mcp-lifecycle`（结构化并发重写，本会话写）

- [x] 设计：端口适配器、作用域、错误去向、等待上界；按 K1–K3 改 SPEC 承诺
- [x] 实现；`cex-*` 退出（同上限并入正控）、`it.fails` 改通过
- [x] 并入 lifecycle-model 的 L3 处置（P5 两个场景、P6 重写、S9 次序、`allSettled`）
- [x] 验收：探索器零反例 + TLC 14/14 + 既有用例
- [x] 手工变异 14 个全部变红，写进 `verification/README.md`
- [x] WIP 压成一个提交 `f8bf19596`；门禁全绿；PR #1134
- [x] 独立评审（L3 实现、设计与实践、表达、交付边界）；修复；最终 head 差分变异；合入 `b2ba7dc89`

### 5. MCP：`w3-mcp-host`（本地传输，本会话写）

- [x] 第一段设计交回；Q1–Q11 与 T9 义务裁定（闭包规格追加记录）
- [x] stdio、Streamable HTTP（含旧 HTTP+SSE 回退）；复用按硬承诺判据，产品源码不导入 `@modelcontextprotocol/*`
- [x] 用契约的归类函数与 T8；契约套件在两种材料上跑（A 层真实线路对端），B 层 SDK 服务端跑 MC3-10/11 与互通
- [x] 门禁全绿（契约 553、mcp 254、host-local 310）；PR #1138；证据卡评论 6657905811
- [x] 第 1 轮五路评审收齐：A 阻断 5、C 阻断 5、B 非阻断 16、E 未达到 3 项、D 测量无效（`reviews/mcp-host-r1.md`）
- [x] 卡拥有者裁定：E 冲突 8 条、A 的 P7、B 的 P1–P5、根因诊断与修复分法；卡评论 6658386591
- [x] 代码修复 `w3-mcp-host-fix1`（14:25 交回，5 个提交，head `9893bebea`；契约 630、mcp 254、host-local 327）（Fable high，12:48 派出）：决策层进契约根、两种传输共用；等待点受 `signal` 与关闭管辖、`close()` 有界；词形、P7、16 MiB 每行；13 条先红后绿的用例（规格 `delegate/closures/w3-mcp-host-fix1.md`）。13:27 核查：红灯用例已提交（`058b2e670`），契约 `decisions.ts` 在写、走向与裁定一致，脚本化传输的重复已删，`session.ts` 未改；13:30 追加 1：探测计时改为注入端口，为会话探索器做准备
- [x] 读 fix1 的 diff，`grep` 核结构性声明（已核：写范围、12 个名字的定义为 0、会话无全局计时、`testing-transport.ts` 17 行事后接受），复跑门禁：七项中六项与三包测试退出 0（契约 630、mcp 254、host-local 327），CRLF 0；`check:docs` 两处断链指向删掉的 `message.ts`，交文档闭包（日志 `gates-fix1/`）
- [x] 文档闭包 `w3-mcp-host-docs` 交回（5 个提交 `51bb48168`…`f0b884299`）。交回发现 1（`verification/sdk` 没有模板槽位，结构扫描 fail）的裁定：模板的 `proofs/` 只收证明文件，探针是可复现的观测脚本，脚本移到 `tests/probes/`，论证、命令与输出摘录留在 `verification/proofs/sdk/`。余下几处小改本会话自己做：契约 T5 按传输写清 `signal` 触发后对端看到什么，stdio 写到一半被中止是 S01、S03 的断流；`limits.ts` 注释只说 2xx 正文与 SSE 事件越界是断流；包索引、夹具索引。提交 `1c2bdbb89`、`b9c8a9a62`、`7b1125000`；结构扫描 `structure=pass`（未打模板标记的成员 `--check` 一律退出 1，契约、mcp、modality 相同），`check:docs` 0，格式 0，探针在新位置能跑。原规格：（Opus high，规格已写、简报检查 0，14:36 在 host 工作树派出）：两个成员的 SPEC、README、docs 按 B 的 N1–N16 与 P1–P5 裁定改写；契约 T2/T3（词形）、T5（`signal` 释放交换、不发 DELETE）、T9（含答复）补句；新根导出同步 `docs/public-api.md`；PR 正文与验收 7 的措辞；成员 `verification/` 收探针 p3–p5
- [x] 形式化 `w3-mcp-host-formal` 交回（16:22，5 个提交到 `e75ec99d1`，21 个文件全在写范围，SPEC 只新增「性质与证据」一节），已合入 host 分支（merge `f04851ce4`，无冲突）。V1–V6（恰好结算一次、关闭后不碰凭据、拒绝至多一次、有界、不代调用方重发、关闭时三相的去向）在探索器与 `TransportSession.tla` 各有正控与负控：探索器 8 个场景在真实 `Session` 上无反例，6 个源码变异各让一条性质变红；TLC 3 正控通过、7 负控各违反指定不变式。实现缺陷：无。第 1 轮的 A1/B4、A2/B5 由 V4 的两个变异重现。A4（回退 GET 的 401 头与 `close()` 的次序）与 A5（stdio 行上界）在会话层探索器的粒度之外，由用例与模型负控承担。第 2 轮评审要看：探索器引擎是生命周期探索器的第二份（写者说明了异同，抽共用设施与否待定）。
- [x] 测试强度闭包 `w3-mcp-host-strength` 18:13 交回并合入 host 分支（merge `aba91c15b`，12 个提交，`src/` 未改；host 369 例、慢层 235）。运行错误的值本来就是 `Error`，是 Stryker 对序列化克隆调 `String()`；用例侧守卫 `tests/unhandled.ts` 让未处理拒绝变成用例失败（采纳，运行器缺陷记进波末缺陷卡）。D 线索逐项补用例并各有被杀的变异；MC3-10/11 每条用例有变红日志（`exited before open` 是四层防御纵深）；H1–H14 变异句逐条执行，H12、H13、H14 三句改正。SPEC「组合与验证」由本会话跟随（`db06b5b70`）。原规格：`w3-mcp-host-strength`（Sonnet high，16:41 派出，基线 `f04851ce4`，规格 `delegate/closures/w3-mcp-host-strength.md`：运行错误的来源、D 的线索逐项补用例、MC3-10/11 与 H1–H14 的变红证据）（负责人 13:27 要求新代码的并发都在形式化守护之内；形式化部分已由上一项完成）。原规格：
  - 会话的有界穷举探索器：驱动真实 `Session`，由探索器排线路答复、凭据调用、元数据取回、计时触发、`signal` 与 `close()` 的次序；性质：每个请求恰好结算一次；`close()` 返回之后不再调用凭据句柄；`reportRejection` 每次 401 至多一次且只对授权过的请求；`close()` 与每个请求在中止或关闭之后有界结算；写类不再发
  - `verification/models/` 加会话请求生命周期的 TLA+ 模型，负控配置证明每条性质会变红，写模型与实现的映射
  - 消除 Stryker 运行错误的来源；按 D 的线索补输入夹具；每条 MC3-10/11 用例的变红证据（改源码、重建 `dist`、跑、还原、重建）
- [x] 卡上补证据（卡评论 6666088522）：CRLF 读数、验收 9 的命令、提交号、自裁 3–11 内容、结构性改动清单、异步副作用一条、SSE 回退计数单列
- [x] 第 2 轮增量评审（简报 `reviews/mcp-host-r2-briefs.md`，记录 `reviews/mcp-host-r2.md`）：E、C、B 已交回，A 18:48 派出、19:02 交回（同样两条阻断，真实子进程复现）。C 阻断 2（stdio 重叠写使 `close()` 挂住；`authorize` 挂起时调用方放不开），B 阻断 1（授权中一相的结局没有拥有者），与第 1 轮同一类（等待点不受管辖）→ 按收敛阶梯做了结构根因诊断（记录「结构根因诊断」一节：调用方跟着工作流走而不跟着结算走；线路写状态不是数据；探索器 V4 量错了层、凭据端口没有挂起），裁定全部写下；修订第 1 轮一条规则：`close()` 不再等授权发现。A 交回后派 `w3-mcp-host-fix2`（代码，Fable high）与 `w3-mcp-host-formal2`（TLA 与验证文档，并行）；差分变异等修复轮的最终 head，`--base 92a8e3cdf`、不给 `--since`
- [x] `w3-mcp-host-fix2`（01:47 交回 `0695f2ba4`，派发者复跑：三个成员 19/19、慢层 235 通过、`lint:rules` 通过、12 个负控全部变红；与 formal2 合并为 `06b98034d`，SPEC 证据表冲突取 formal2；自裁 9 条全部采纳）。原规格：（代码：诊断第 1–6 条、C 非阻断 1、2、5、6、7、9、契约 T5／T9／R4／DELETE／裁定登记、setup 文件、探索器 V4 改到调用方一层与挂起的凭据端口、`StdioLine` 重叠写用例）与 `w3-mcp-host-formal2`（TLA：V1、V2、V6 改成状态断言、V6 新规则、负控「调用方跟着工作流等」；SPEC「性质与证据」与 `verification/`）并行，A 19:02 交回后补入规格第 14–16 条（线路三处分支用例、超线项、`close()` 单飞），19:04 两个闭包同时派出（formal2 在新树 `.worktrees/w3-mcp-host-formal2`）；19:22 检查：fix2 在写红灯用例与探索器新 V4（未提交，约 400 行），formal2 已提交模型重写 `e101fed13`（工作流与结算分离、V1/V2/V6 改成快照断言、V4 量调用方），都健康；formal2 19:34 交回（head `0caa8b577`），派发者复跑：12 个配置符合判读、14 个有效动作的变异各自变红，等 fix2 交回后合进 host 分支；19:43 检查：fix2 有 4 个提交（红灯与探索器新 V4 `75809c54c`、`decisions.ts` 纯移动拆分 `9ae28f6e6`、规则归契约 `f856c8f55`、会话按结算重做与线路写计数 `cd605e85f`），健康；19:47 起 429 中断，2026-11-06 01:15 续用原写者；评审与裁定已贴卡评论 6666710680
- [x] 表达与证据闭包 `w3-mcp-host-docs2`（Sonnet high，01:56 派出，02:16 交回 `a31a05ee7`，派发者补 `720a5d08a`：V1 负控入库、`public-api.md` 对齐；基线 `06b98034d`；B NB6–NB13 剩余项、探索器证据按 fix2 重写、「用例 → 缺陷 → 变红」表带用例全名与摘录、慢层 skipped 说明）；第 3 轮候选 `720a5d08a` 已推送，全套轻门禁通过（turbo 19/19、typecheck 86/86、七项轻门禁与 CRLF），证据卡评论 6675177331、红灯表 6675170166；第 3 轮五面（简报 `reviews/mcp-host-r3-briefs.md`）02:25 派出；host 同步父分支（调用口合入之后）；最终 head 门禁与差分变异；合入
- [x] 第 3 轮评审（简报 `reviews/mcp-host-r3-briefs.md`，记录 `reviews/mcp-host-r3.md`，02:25 派出五面）：E 交回并处置（验收 7 PR 正文已改、验收 9 的 grep 证据、冲突 6 纳入）；C 交回：第 2 轮三条结构根因已消除，阻断 B1（会话结束之后授权中的请求仍上线路，目标结构第 3 条只做了一半），P1 选 (a)（相 → 结局归契约，脚本化传输兑现 T5）；B 交回：无阻断，NB-1～NB-7 全部改（NB-1 线路级断开按相结算）；D 交回：测量无效（本卡第三次同类运行器产物），按缩窄规则不计分，契约缺守卫一项放进修复，存活按簇处理；A 03:10 交回：阻断 2 即 C 的 B1，阻断 1 是 stdio `close()` 等不读 stdin 的对端（同一承诺第三次）→ 第一性原理结构诊断：三次修法共有「web 写完成即字节离开」的错前提，规则改为关闭一律中止写端（副本上验证 7 ms 返回）。五面与处置已贴卡评论 6675946273
- [x] `w3-mcp-host-formal3`（已合入 host 分支 `72f977c81`）（Opus high，02:56 派出，工作树 `.worktrees/w3-mcp-host-formal3`，基线 `720a5d08a`）：TLA 加线路断开按相结算、两个有效动作变异、B1 形状的 `bad-*`
  - 03:19 第一次交回（3 个提交到 `5af57eabd`，13 份配置与 22 个变异符合判读）；自裁 1（断开时当场结算发现中的请求）与 fix3 冲突，03:21 裁定「断开只结算依赖线路的两相，发现中的不动」，续用原写者改模型重跑；03:25 第二次交回 `09d552661`，派发者读模块并复跑（13 份配置、22 个变异全部符合判读，`/tmp/owner-formal3/`），验收通过，等 fix3 交回后合进 host 分支
- [x] `w3-mcp-host-fix3`（04:54 交回 `3a79454d0`，9 个提交；结构声明逐条 grep 成立，自定 7 条采纳；合入 formal3 后在 `72f977c81` 上复跑七项门禁、CRLF 与三包测试全部退出 0；已推送，卡评论 6677346854）（Fable high，03:17 派出；03:21 追加澄清断开时发现中的请求不动；04:18 后被 429 中断，此时 7 个提交到 `184a29b9a`、树干净；04:26 续用原写者）：stdio 关闭一律中止写端（第 17 条）、B1、线路断开按相结算、相规则归契约与脚本化传输、元数据取回收信号、T5 分界、缺陷出口、C 非阻断 2–11、契约守卫、D 的簇与 `http-line.ts` 负控
- [x] `w3-mcp-host-docs3`（05:17 交回 `f022dfb98`，两个提交，11 个文件全在写范围内，自裁三条采纳；派发者改两处排除文件的过时句子 `54a2377cb`，四项文档门禁复跑全过，已推送）（Sonnet high，05:00 派出，基线 `72f977c81`）：B NB-3～NB-6 与小项、SPEC「性质与证据」、`verification/` 文档、红灯表
- [x] 第 4 轮关口（简报 `reviews/mcp-host-r4-briefs.md`，记录 `reviews/mcp-host-r4.md`；A、B、C、E 06:17 派出，06:33 前收齐，四面都没有阻断；06:34 处置：修 1–9、其余记录）（`720a5d08a..54a2377cb`）：A、B、C、E 四面；D 即最终 head 的差分变异一次（`--base 92a8e3cdf --since 720a5d08a`，调用口 fix3 不跑 vitest 时跑；按第 3 轮缩窄，读数只当线索，强度证据归负控、TLA 变异与红灯表）
- [x] `w3-mcp-host-fix4`（Opus high，06:35 派出，基线 `54a2377cb`）：关口后唯一一轮修复，处置第 1–9 条加 `settle` 守卫变异重跑。07:2x 交回（6 个提交到 `1ec708899`，四条红灯用例，`settle` 守卫变异判等价），07:31 接受；范围外观察由派发者处置（`50fc8d146`：释放函数不抛出写成端口义务，值树前提扩到 `updateTask`，三处过时文字），`received()` 12 ms 窗口转波末小卡；已推送 `50fc8d146`
- [x] fix4 交回后：只复核本轮改动；D 面差分变异一次（`--base 92a8e3cdf --since 720a5d08a`）；E 面缺的证据一次贴卡；PR 正文跟上（复核无阻断，`ebfedc98a`，卡评论 6680928470）
- [x] 最终 head 门禁；合入父分支（merge commit `158471c17`，`Agent-Role: main`）
- [x] 合入后在父分支跑（09:30：三包退出 0，mcp 472，`cancel.spec.ts`、`invoke.spec.ts` 都通过；卡评论 6681699320） `@omne-harness/mcp` 全部用例：调用口分支的 `tests/doubles/peer.ts` 用契约的 `createScriptedTransportFactory`，host 的 fix3 改了它（授权前登记、按相结算）。两个分支各自都没跑过这个组合（05:28 跨模型评审引出，P1 理由更正见 `decisions.tsv`）

### 6. MCP：`w3-mcp-call`（调用口，本会话写）

- [x] 规格（裁定 1–12、写范围、单一源约束）；简报检查退出 0；Fable high 写者 12:16 派出
- [x] 施工：`ActionInvoker`、任务表、`createMcp`；删成员内绕道（13:35 交回，6 个提交）。13:27 核查：6 个提交，已到文档（`7d91a330c`）；写范围无越界；`calls.ts` 一条发送次序、拒绝即归还占位、复用 `ask`/`within`/`waitAtMost`，没有新机制；探索器只为新 API 改了 27 行，调用口的并发没有进模型（规格缺口，已登记）
- [x] 读 diff、核写范围与结构性声明；门禁七项与三包测试在 head 上复跑全绿；PR #1141；证据卡评论 6659833572
- [x] `w3-mcp-call-model` 交回（15:40，4 个提交到 `c28c502f1`；28 个文件全在写范围，署名与 trailer 正确，树干净）。P9–P14 进探索器与 `Calls.tla`；TLC 16 个新配置全部符合判读，原 14 个重跑也符合；每条新性质至少一条负控变红（N1–N6），M17 判等价。在基线 `7d91a330c` 上找到两类实现缺陷：**F1** 停止之后调用仍等无时限的端口（关口三端口、传输 `call`、`cancelRequest`、`lose` 的拆除），违反 P14 T2，5 个场景红；**F2** 发出后被放弃的调用，`answer` 无人读，对端 reject 时是未处理的拒绝，违反 P7。fix1 正好重写了这一段（一个停止信号、`cancelRequest` 交作用域），所以 F1、F2 的判定等合回之后在 fix1 的代码上重跑探索器再定。原规格：（验证设施，Fable high，13:38 派出，工作树 `.worktrees/w3-mcp-call-model`，与评审并行）：探索器加 `invoke`、`continueWithInput`、`cancel`、调用方中止与任务操作；性质：发出前取消则 `call` 计数 0；`cancelRequest` 只对已发出的调用且至多一次；占位恰好结束一次；租户、主体与账户隔离；中止或取消之后有界答复；`verification/models/` 加 TLA+ 模型、负控配置与映射
- [x] 第 1 轮评审：A、B、C、E 收齐并裁定（`reviews/mcp-call-r1.md`，卡评论 6660127599）；D 按 review-code 留到最终 head
- [x] 代码修复 `w3-mcp-call-fix1` 交回（16:09，12 个提交到 `67b653a7f`，23 个文件全在写范围，树干净；`conclude` 唯一调用、`cancelRequest` 不再被等、`stopOf`/`markEnded`/`release` 已删，逐条 grep 核过）。写者门禁：三包 turbo 退出 0（mcp 416）、`test:slow` 退出 0、七项轻门禁退出 0、变异 54 条 52 红（C37 等价、C50 交探索器）。覆盖率运行里 `lifecycle wide` 600 s 超时（与评审 A 的运行同一现象，未归因）。
- [x] F1(d) 本会话自己改（卡拥有者裁定见 `delegate/closures/w3-mcp-call-model.md` 追加记录）：`lost.ts` 加 `loseInScope`，调用与任务操作的转 `lost` 交给表的作用域，不等拆除；发现照旧等 `loseOn`（它报告清单标记）。新用例「a lost connection whose close() never answers」两例在 fix1 的 `src` 上变红（`pending`，`f1d/red.log` `31630179…`），改后变绿。成员 SPEC MC-16 第 9、12 步、MC-17 第 4 步与已知限制「拆除的端口挂起」同步。
- 原规格：代码修复 `w3-mcp-call-fix1`（Fable high，14:20 派出，规格 `delegate/closures/w3-mcp-call-fix1.md`）：`perform` 从占位起拥有调用的生命周期（一个出口、一个停止信号、`cancelRequest` 交作用域、发出代际）；`checkOutput` 抛出在契约 `classifyOutcome` 吸收（`violates`/`output-check-failed`）；任务操作的次序与映射；偏离表登记转 `lost`；全部变异在最终 head 重跑并补齐
- [x] 合回（17:59，merge `5204d3799`；F1(a)、F1(c)、F1(d)、F2 在修复后的代码上消失，11 个场景零违例，TLC 15 份配置符合判读）。原计划：合回 `w3-mcp-call-model` 分支：16:36 续用原写者（闭包规格追加 1），由它把调用口分支头 `1a143a4d4` 合进模型分支、对齐新的 `InFlightCalls`、在新代码上重跑探索器与 TLC 并确认 F1、F2 消失；之后派发者把模型分支合回调用口分支
- [x] 文档闭包 `w3-mcp-call-docs` 16:54 交回（3 个提交，9 个文件全在写范围），已合入调用口分支（merge `0c094e6f1`）。它报的待裁项：契约 S8 写明 `closeAll` 之后续调用答「未发出：`connection-unavailable`」而实现答 `unknown`，契约是语义拥有者，本会话改实现（`104261a42`，关停在第 3 步之前判、不问端口，新用例先红后绿，mcp 419 例）；契约 S2 的取消一句与 R2 对齐、依据表「可加调整」改正（同一提交）；成员依据表钉契约修订 `104261a42`（`2678b21b5`）；模型写者追加 3 改合 `2678b21b5`。原规格：`w3-mcp-call-docs`（Sonnet high，16:44 派出，基线 `1a143a4d4`，规格 `delegate/closures/w3-mcp-call-docs.md`）：README 两种语言、`docs/` 的复述与漂移（B 清单逐条在基线上核过）、契约 R2 的 `cancelled` 定义与 S2 一句（fix1 自裁 2、3 采纳）、契约出处 N12、新常量登记。B 第 14 条（`verification/README.md`）归模型写者（追加 2）。B 全文从会话记录取出存为 `reviews/mcp-call-r1-b-full.md`
- [x] 第 2 轮增量评审（18:27 派出五面，18:55 收齐，记录 `reviews/mcp-call-r2.md`）：C 判第 1 轮根因在结构上消除；A 阻断 1（两个对端账户给出同一任务号时，A 的引用经 B 的凭据发请求）；B、C、E 无阻断；D 测量无效（2 个运行错误、5 个没跑完，与 host 第 1 轮同一现象）。裁定全部写下：关停之后不问端口（`refresh`、调用口、任务操作，含在途操作的下一步），占位句柄，`lose` 同步前缀，碰撞答 `unknown` 等。修复闭包 `w3-mcp-call-fix2`（Fable high）18:58 派出，规格 `delegate/closures/w3-mcp-call-fix2.md`；之后一个表达与 C 序列重跑的闭包；最终 head 差分变异 `--since 5204d3799`。原记录：简报 `reviews/mcp-call-r2-briefs.md`；head `5204d3799` 已推送，证据卡评论 6665868317；门禁三包与慢层、七项轻门禁全部退出 0）；最终 head 差分变异（D，`--since 7d91a330c`）；合入
- [x] `w3-mcp-call-fix2` 交回、核对（03:05 交回 `0b84a0bec`，写者直接提交在卡分支上；派发者读 `under`、`prepare`、`sendOrder`、`perform` 核实关停之后不问端口，自裁 12 条全部采纳；派发者复跑 `lint:rules`、`typecheck`、三包测试全部退出 0，日志 `tmp/closures/w3-mcp-call/owner-fix2/`；已推送，卡评论 6675951054）（18:58 派出；评审与裁定已贴卡评论 6666710295）。19:22 检查：2 个提交（红灯用例 `c9851cfe7`；结构整理 `38eb40b92`：句柄按格闭包住阶段、收口核身份，`markLost` 同步交回 `Losing`），正改行为，健康；19:43 检查：3 个提交（行为 `b3b806020`：碰撞转有歧义、关停之后不问端口、发出前核停止信号），在做 SPEC、用例缺口、探索器与变异（19:41 有新日志），健康；约 19:47 起两个 Fable 写者都被 429 限流中断（5 小时额度到顶），2026-11-06 01:15 额度恢复后续用原写者（追加记录写明工作树事实与理由）；02:06 最后一个提交 `0b84a0bec`（`lostOfOutcome` 圈复杂度回到 2），之后写者在后台按序重跑最终 head 的门禁：turbo、慢层、七项轻门禁、CRLF 与结构 grep 全部退出 0（日志 `tmp/closures/w3-mcp-call/fix2/gates/*-0b84a0bec.log`），度量排队等名额后在跑；改动 29 个文件全在写范围内，提交署名与 trailer 正确；契约 S8 新句与下一句重复「任务操作先按 S2 判发起者」，并进 docs2 第 4 条
- [x] 表达与 C 序列重跑闭包 `w3-mcp-call-docs2`（03:44 交回 `8d376c0ba`：C 序列在 `0b84a0bec` 上整体重跑 79 条、78 红 1 等价存活，N1–N8 重跑签名逐字相同；派发者改正两处范围外的陈旧注释 `fcc955a53`，`Calls.tla` 29 个配置重跑全部符合判读；七项门禁派发者复跑全部退出 0；已推送，卡评论 6676418696）（Sonnet high，03:19 派出，基线 `0b84a0bec`；B R2-2～R2-11、E 验收 2 的说明、fix2 交回的过时句子、G/D 变异表并入 C 序列；C07、C11–C14、C24、C36、C38、C44、C51 与新 C 行在最终 head 上重跑）
- [x] 第 3 轮增量评审（`5204d3799..fcc955a53`，简报 `reviews/mcp-call-r3-briefs.md`，记录 `reviews/mcp-call-r3.md`）：A、B、C、D、E 五面一次派出（`date -u` 03:55 时已在跑）；D 即最终 head 的差分变异 `--base b2ba7dc89 --since 5204d3799`。E 03:58 前交回：验收 2、9、10 缺卡上文字（步号对应句、门禁尾部、结构 grep），已补卡评论 6676484241；冲突项已处置。C 04:10 前交回：阻断（`closeAll` 落在等待途中时答复取决于下一步，任务操作发请求前不判关停；与第 2 轮 S8-a 同类，第二次）→ 选甲：关停与停止同形，途中只管不问端口，答复只在 `perform` 一处从状态读出；任务操作同形；探索器 P13 加答复断言。派发者承认采纳 fix2 自裁 2 时漏核「答同一个答复」。非阻断 5 条处置完。B 交回无阻断（N1 由甲一并裁定，任务操作建连途中关停改答 `no-connection`）；A 交回两条阻断与 C 同一件事，另三处（关口粒度定为编号的一步、`refresh` 同形、关停之后不派取消）；D 在旧 head 上被停掉，修复后最终 head 上 `--since 5204d3799` 跑一次。处置已贴卡评论 6676778437
- [x] `w3-mcp-call-fix3`（06:19 交回 `deb5a977e`，10 个提交；结构声明与甲的两半逐条核过，自裁 3 不采纳：refresh 出口次序与调用口不一致，派发者改正 `035ac8fee`，已推送）（04:19 派出 Fable high，被 429 中断、没有改动；04:26 换 Opus 5.5 high 新写者，偏离记进规格）：关停与停止同形（调用口、任务操作、`refresh`）、P13 加答复断言、C 与 B 的代码项
- [x] `w3-mcp-call-docs3`（Sonnet high，06:26 派出，基线 `035ac8fee`）：B N3–N11 的表达项与 fix3 交回的过时句子。交回（`a9ddf6742`）并接受；F16、F17 存活 → 派发者补逐微任务关停扫描用例（`d966e05c1`，两个变异分别在 k=40、k=45 变红）
- [x] docs3 之后派发者自改：`checkRequest` 对参数与输入答复深判值树（`judgeJsonValue`），违反以 `TypeError` 拒绝（契约 R2；host 第 4 轮 C 非阻断 2 的调用口一半），先写红用例。`44a218fec`：改为 `checkedSend` 返回判定副本；`provideTaskInput` 同一缺口一并修（`internal/caller-values.ts` 共用）；三条新用例先红后绿；已推送
- [x] （第 4 轮关口与唯一一轮修复之后，`ac54ff006` 门禁全绿，差分变异 2 个缺口补用例；09:30 合入父分支 `f5276d707`，卡评论 6681108939）最终 head 门禁；差分变异 `--base b2ba7dc89 --since 5204d3799`（无别的 vitest 时跑）；最终证据贴七项门禁的输出尾部；合入父分支（先于 host）

### 6a. MCP：`w3-mcp-listing`（停放，2026-11-06 范围原则，见 `waves/w4/plan.md` 第 2.4 节）

- [x] 先核 SDK 2.4.0 对重名与单个不合法工具的处置（15:50 本会话读 client `dist`）：
  - 单个不合法工具：`tools/list` 的结果按 `ListToolsResultSchema`（`tools: z.array(ToolSchema)`）整份校验，一项不合法整份报 `SdkError(InvalidResult)`（`src-CeKsbNLO.mjs:3918`、`:4004`）。SDK 不逐项剔除。唯一逐项剔除的是 SEP-2243 的 `x-mcp-header`（`public-CvV4ZHkX.mjs:3989`，stdio 与旧修订不剔），与传输的 `withheld` 对应。
  - 重名：不拒绝、不去重。多页结果直接拼接（`_walkPages`，`public-CvV4ZHkX.mjs:3405` 起），按名索引 `byName.set(tool.name, tool)` 后者覆盖前者（`:1891`、`:1930`），`callTool` 的头镜像与输出校验用的是最后一个同名定义。
  - 结论：6a 的「单个不合法工具剔除并报告」是比 SDK 更宽容的选择，理由（一个坏工具不该让整个服务不可用）与依据要写进契约 C1；重名的处置要自己定（SDK 静默取最后一个，不能作为依据）。
- [-] （停放，见 `waves/w4/plan.md` 第 2.4 节）规格：单个不合法工具剔除并报告；`CompleteListing` 加剔除字段（与传输的 `withheld` 分开）；`RefreshResult` 报告它；契约 C1、T2 与未封闭项同步
- [-] （停放）施工、评审、变异、合入

### 6b. MCP：契约补「传输不再可用」标记（核心移到 W4-1；附带的形状项停放，见 `waves/w4/plan.md`）

来源：call 第 1 轮表达评审 B1（`reviews/mcp-call-r1.md`）。传输的答复不带 T8 的「传输不再可用」，`mcp` 只能按原因猜，HTTP 上 C04、C05、O06–O08 因此误拆连接、误标整份清单。call 本轮先登记偏离（偏安全）。

- [-] （移到 W4-1：`waves/w4/mcp/spec.md` 第 1 节已定标记放在答复上，传输级信号不采用并写了重开条件）设计：标记放在答复上还是传输上（传输自己报告「不再可用」与请求结局是两条轴，按维度分解选）；契约 T 段、`McpTransport` 或答复形状的改动；对生命周期模型 P1–P8 的影响
- [-] （移到 W4-1）两种传输（脚本化、host-local）给出标记；`mcp` 的调用、任务、发现改按标记转 `lost`；删偏离表那一行
- [-] （移到 W4-1）同一闭包改契约 R1 与 S2 的冲突句（资格非 `granted` 时任务操作答 `effect-unknown(no-connection)`）
- [-] （停放，见 `waves/w4/plan.md` 第 2.4 节）第 2 轮带过来的契约形状项（`reviews/mcp-call-r2.md`、`mcp-host-r2.md` 的「6b」）：`TaskRef` 与任务表键带对端账户（去掉碰撞答 `unknown` 的退路）；`TaskControl` 加 `signal`；`classify.ts` 裸 `catch` 的诊断出口与 `OutputCheck.violates.reason` 的封闭联合；`ContinueRequest` 写成「至少一个」的联合；R7 的 `no-connection` 定义含「资格不是 `granted`」
- [-] （移到 W4-1）评审、变异、合入

### 7. MCP：`w3-mcp-e2e`

- [x] 规格 `delegate/closures/w3-mcp-e2e.md`（旅程 S1–S7 × 目标 E-stdio、E-http、E-sse、F、P；对照矩阵八行）；简报检查退出 0；09:38 派出 Sonnet 5.5 high
- [x] 两种传输上 `createMcp` 旅程；六个兼容目标与官方 SDK 客户端结论一致（10:11 交回：五个目标 S1–S7，对照矩阵八行一致；10:39 修复后重跑一致）
- [x] 交回核对、独立评审（A、B、E 一个关口）、唯一一轮修复（`64e3ef161`、`e50c356a4`）、窄复核无阻断、本地合入父分支 `706152690`
- [x] （11:10 推送，卡评论 6683488904）父分支门禁绿后推送；读数贴卡（草稿依据：`delegate/handbacks/w3-mcp-e2e.md` 与 `w3-mcp-e2e-fix1.md`）

### 8. 波末

- [x] 组页、领域页写回（差距账本的组页项、表达评审 G1–G8）；review-docs（分类表 `writeback-triage.md` 与裁定；`w3-docs-skill`、`w3-docs-mcp` 各过 E、B 一个关口与唯一一轮修复，窄复核无阻断；本地合入 `74511e1ff`、`203cde80e`）
  - Skill 组页「读取」第 5 步仍写不带内容摘要答 `unsupported`（带不带依据都一样），与契约 `bf1544e91` 的 S7、PR3 不同；组页「描述」五处（`:164`、`:182`、`:363`、`:441`、`:480`）写无包材料的 `describe` 不带材料依据，带依据时也与契约不同（契约差异表 `67373f3b1` 已登记）；写回后把 skill-host-local SPEC 第 11 行、skill SPEC 第 12 行、skill-contract SPEC 第 11、13 行的组设计钉一起移到写回的提交
  - MCP 组页的连接时限起点（交付边界冲突 4）：建连时限在 `attempt()` 之后起计时，临界区与加入另有各自的时限
  - `packages/mcp/mcp` 的 README 两种语言删掉对 SPEC 机制的复述（`internal/table.ts` 一段等），只留用法、装配与指向 SPEC 的链接；卡正文「MCP 的关键承诺」的连接时限起点改为与 SPEC 一致（lifecycle 第 2 轮冲突 1）
  - 卡正文 W3 行与 I-04 的「SDK 2.3.1、只用 Transport 层」改为现行依据（波段 MCP 规格第 28 行、SDK 2.4.0 按硬承诺例外自写）；「契约变更：additive」加限定：指公开形状，F4 由 Q1 关闭，`McpPorts.checkOutput` 必填与 `inputResponses` 可选按 0.x 同步真实消费者（host 第 1 轮裁定 1、2；call 第 1 轮 E 冲突 1）
  - 卡正文「测试/验证拥有者」与 C3–C4 判据加「新代码的并发在探索器与 TLA+ 模型的守护之内」（负责人 2026-11-05）；W3 行的闭包分法与「当前执行与交接」按实际更新（call 第 1 轮 E 冲突 5、6）
  - [x] 波段规格 `waves/w3/mcp/spec.md` 同步：已定事项 19、27（脚本化传输的收窄）、31 与 MC3-7（`cancelTask` 按契约 S2）、MC3-10（F4）。完成：五处各加「2026-11-05 同步」说明与出处
- [ ] 父分支头 `admission` + `acceptance` + `loop:status --strict --base <F>`
- [x] （11:01 完成：追加 105 行，写者 40、评审者 65；W2 旧行 30 处既有格式错误由派发者按口径改正——`reviewer`、`researcher` 记伪角色 `read-only`，纯文档写者记 `docs`，伪角色的 `work` 为 `none`、`role_source_tree` 为 `null`，第 42 行 `escalation` 改用 `to_model`、`to_effort`、`trigger_report` 与 `takeover`；`ledger.py check --flows` 156 行退出 0。未写行的派发与取不到的字段见回填交回）派发流水回填：`delegate/flow.jsonl` 停在 W2（2026-11-03），本会话接手 W3 之后的写者闭包都没有记行。用脚本从会话记录取每次派发的模型、档位、起止时刻与完成通知里的 token 与工具调用数，缺陷从各轮评审记录与卡评论归属（写者、规格、环境）；`ledger.py check --flows` 退出 0；之后每次独立验收当场追加一行
- [-] （改旧评论被权限检查拒绝，改在 W3 报告评论与 `handoff.md` 里写明）卡评论 6657905811（host 第二段证据）顶部注明「未覆盖」一节已被 6666088522 更新（host 第 3 轮 E 冲突 8）
- [x] （`3289bee2f`）host 合入父分支之后：调用口 SPEC 与 `verification/README.md` 里 WF5「出处在途」改为契约 T5 的条款链接（call 第 3 轮 E 冲突 6）
- [x] （11:12 写回并读回，填父分支头 `706152690`，C4 改为达到并加 r20）卡正文写回 call 第 3 轮 E 冲突 1、4、7 与第 2 轮冲突 1、4、5、10、11：第 8 步发出前取消答 `cancelled`、`closeAll` 之后先判关停、形式化义务的出处、R1 与 S2 的不一致、「当前执行与交接」更新
- [ ] `waves/w3/handoff.md`；卡 #1119 正文与 W3 报告评论；记录分支推送
- [ ] （草稿在 `small-cards.md` 第 2 张，另两张：RFC-0001 的 SDK 版本、12 ms 静默窗口）测试运行器缺陷建卡（按卡流程）：差分变异把「工厂返回 `{}`」这类使整个成员失效的变异体记成「没跑测试」，成员测量因此无效；直接跑 vitest 是 176 条失败（lifecycle 第 3 次提交的证据，卡评论 6657605963）。另一个来源（host 第 1 轮与 call 第 2 轮的 D 面）：Stryker 的 vitest runner 在 `errorToString` 上对序列化后无原型的错误对象调用 `String()`，抛 `TypeError: Cannot convert object to primitive value`，变异体记为运行错误；成员侧的规避是让未处理拒绝作为用例失败的 setup 文件，长期归属是 `vitest.tiers.mts` 或 test-runner。host 第 3 轮 D 面（账本 `tmp/mutation-ledger/720a5d08a/20261106-022559/`）再添两例：契约没有 setup 守卫时 `testing-scripted-transport.ts:439` 的变异体只靠未处理拒绝让 vitest 非 0 退出，被记成运行错误；`options.ts:17` 的变异体让每个构造工厂的用例在构造时抛 `RangeError`，被记成「存活、10 条覆盖、0 条跑完」（构造时抛出的最小复现）。两类都让「超时未复核」整批不能计分（本卡第三次）
- [ ] （S5 两句并入 W4-1，其余已由 lifecycle 与 call fix3 兑现的波末核对后删）K7 小卡：契约 S5 的 `pending` 与 `degraded`、`closeAll` 可以 `AggregateError` 拒绝、K2 的同步抛出、S8 对已在途 `refresh` 的适用（`reviews/mcp-lifecycle-r1.md`「不在本轮修」）；mcp SPEC 偏离表的两行随它删除
- [ ] （停放，0.1.0 公开形状评估时再看）0.1.0 公开形状项并入 K7（host 第 2 轮 C 非阻断 3、4）：`WireClassification.message?` 与模板字面量 `AnswerClass` 改判别联合；`WireAnswer` 不让 `legacy-*` 出现在每个请求上，`discoverWith` 的不可达分支；`AnswerConclusion.unusable` 的类型去掉 `abandoned`（`streamGoneAnswerOf` 因此暂收 `abandoned`，host fix2 自裁 5）
- [ ] （停放，出现第三个使用者时再看）探索器引擎抽成 `tools/` 下不发布的开发期包（host 第 2 轮 C 设计问题 1）：只抽 BFS 驱动，`Run`、端口与性质留在各成员；`mcp` 与 `mcp-host-local` 两份迁过去
