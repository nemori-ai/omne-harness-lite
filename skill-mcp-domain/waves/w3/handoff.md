# W3 交接报告（Skill 线与 MCP 线）

格式沿 `.meta_harness/human/map-reduce-delivery/templates/handoff-report.md`，按[范式 r3](../../operating-model.md) 变通：没有线父卡与 gate，PR 是给负责人看差异的载体，闭包以 merge commit 合入父分支。

- 波：W3 调用、传输与目录。冻结输入分三段：F0 = `05f281394`（A 段与 Skill 线），F1、F2 见[波包](wave-pack.md) §1。
- 候选：父分支 `PanQiWei/skill-mcp` 头 **`706152690`**（2026-11-06 11:10 UTC 推送）。
- 结果：ready。准入读数见「波末补记」。
- 停写：全部闭包已停写。工作树清理见「波末补记」。

## 1. 做了什么

| 闭包 | 线 | 合入父分支 | 轮次与收口 | 写者 |
| --- | --- | --- | --- | --- |
| `w3-skill-catalog` | Skill | PR #1122 → `e0b68a7c3` | `SkillCatalog` 的 `summaries` 与 `search`，端口答复边界解析，真实目录示例 | Fable high → Opus high |
| `w3-skill-model` | Skill | → `49e984dd8` | Skill 性质账本、`ReadGate` 模型与有界穷举探索 | Opus high |
| `w3-skill-fix` | Skill | PR #1135 → `8b0317ef3` | 生态兼容放宽、引用身份、带依据时的内容摘要。本机语料 190/190 加载且读正文成功。4 轮；卡评论 6656358730 | Opus high |
| `w3-mcp-contract` | MCP | PR #1132 → `92a8e3cdf` | 传输应答的全决策表（T8）、线上事件归类、服务条款衔接。6 轮 | Fable high、Opus high |
| `w3-mcp-lifecycle` | MCP | PR #1134 → `b2ba7dc89` | 连接表结构化并发重写，含 W2 已知限制；有界穷举探索器与 TLA+ 模型（`w3-mcp-lifecycle-model` 随它合入）。两轮复审；卡评论 6657605963 | 本会话写；模型 Opus xhigh |
| `w3-mcp-call` | MCP | PR #1141 → `f5276d707` | `ActionInvoker`、任务表、`createMcp`。4 轮，第 3 轮做结构修法；卡评论 6680037685、6681108939 | 本会话写 |
| `w3-mcp-host` | MCP | PR #1138 → `158471c17` | stdio 与 Streamable HTTP（含旧 HTTP+SSE 回退）的 `McpTransportFactory`。4 轮，第 2、3 轮把 T8 决策层移进契约根并形式化；卡评论 6657905811、6680928470 | 本会话写 |
| `w3-mcp-e2e` | MCP | PR #1149 → `706152690` | 五个本机真实服务端上的 S1–S7 旅程；兼容矩阵八行与 SDK 2.4.0 一致。一个关口（A、B、E），一轮修复，窄复核无阻断 | Sonnet high |
| `w3-docs-skill` | Skill | PR #1151 → `74511e1ff` | 组页、组内流程、组入口、两份领域页写回；契约差异表退出。一个关口（E、B），一轮修复，窄复核无阻断 | Sonnet high |
| `w3-docs-mcp` | MCP | PR #1152 → `203cde80e` | 组页、组内流程、组入口、领域页、成员 README 写回；契约差异表改为现状说明。同上 | Sonnet high |

父分支同步 `integration/mainline` 三次：`799b72395`（`f79aab4d4`）、`5e5e83afb`（`cd6cb3cd7`）、`1b017574b`（`9b60aad9e`）。都没有冲突。

判据（卡正文）：
- C4 达到。证据：卡评论 6680928470、6681699320、6683488904。
- C5 在 W4。
- C6 的本波一次见「波末补记」。

产品意义上，W3 交出的能力：
- 调用方能在本机经 stdio 与 Streamable HTTP（含旧 HTTP+SSE）对真实 MCP 服务端走通协商 → 刷新 → 调用（完成、动作错误、多轮输入、任务）→ 取消 → 释放。
- 结论与官方 SDK 2.4.0 客户端在八个目标上一致，含三个远程厂商服务。
- Skill 目录能按请求列摘要与检索，本机 190 个真实 Skill 包都能加载并读正文。

## 2. 没做什么

按 2026-11-06 的范围原则（只满足已要求的需求）停放，各项的重开条件写在 [W4 方案](../w4/plan.md) §2.4：
- `w3-mcp-listing`：单个不合法工具剔除并报告。SDK 2.4.0 整份拒绝，重名取最后一个，本卡尚未定处置。
- 契约形状项：`TaskRef` 带对端账户、`TaskControl` 加 `signal`、`classify.ts` 的诊断出口与封闭联合、`ContinueRequest` 的「至少一个」联合。
- 0.1.0 公开形状项：`WireClassification`、`AnswerClass`、`legacy-*`、`AnswerConclusion.unusable` 去掉 `abandoned`。
- 探索器引擎抽成开发期包：出现第三个使用者时再看。

移到 W4-1：传输答复的「传输不再可用」标记；调用口、任务、建连按标记转 `lost`；契约 S5 的两句；R1 与 S2 的冲突句。

未验证：远程对端的 TLS、代理与鉴权。三个远程目标只在 2026-11-05、11-06 有网络时跑过对照，没有进成员测试。

## 3. 发现的冲突（交负责人）

以下由卡拥有者按应然定了方向并落地，列给负责人复核，都可收回：

1. **GS-05。** Skill 组页「调用方中止后答 `aborted`」加了前提：每次端口调用都会结束，端口不结束时操作不答复。卡拥有者在 `w3-skill-fix` 规格第 4 条选了 A，已落进契约与成员 SPEC。
2. **GM-P3。** 关停落在 `discover` 途中时 `ensure` 仍答 ok。来源写「只有负责人能定」。组页不写回，现行行为按已定事项 5 不变。
3. **G1–G8。** 原文在早期云端会话里，本机取不到。以按当前契约的现行对照（分类表 W-4 至 W-9、TP-4、GM-5）取代，登记为「原文未留存」。
4. **卡评论 6657905811。** 想在顶部注明「未覆盖」一节已被 6666088522 更新。编辑旧评论被权限检查拒绝，没有绕过。本报告与 W3 报告评论写明这一点。
5. **判据 C3。** 加了一句「新代码的并发在探索器与 TLA+ 模型的守护之内」，依据负责人 2026-11-05 的指示。W4 方案原写「C3 不变」。
6. **「主分支」的读法。** 负责人 10:53 说「等待 w3 向主分支的合并完成后自主推进 W4」。按范式 r3，本卡不进轨道与 `main`，我读作父分支 `PanQiWei/skill-mcp`。若指 `main`，W4 开波要等本卡整体集成。
7. **卡正文「契约变更：additive」。** 一行保留原样，限定写在「实施输入与约束」：指公开形状；F4 由 Q1 关闭；`McpPorts.checkOutput` 必填与 `inputResponses` 可选按 0.x 同步真实消费者。

## 4. 给集成节点的提示

- 本卡所有成员只在父分支，未进轨道。进轨道前：W4 的 C5、C6，负责人技术接受（D-01、D-02），API 语义复核签名。
- MCP 组外没有成员依赖 `@omne-harness/mcp*`（按各 `package.json` 的 `git grep`）。
- 新依赖：`eventsource-parser`（mcp-host-local）；SDK 2.4.0 只在 mcp-host-local 的 devDependencies，产品源码不导入。
- 慢层用例要本机 Python 参考服务端：先 `uv sync --group mcp-fixtures`。

## 5. 评审闭合

- 每个闭包按 C-SM-08：最终 head 上一次关口，至多一轮修复，复审只核阻断。host、call 在接手前已有 3 轮，第 4 轮按此收口。
- 评审报告在 `waves/w3/reviews/`，派发流水 `delegate/flow.jsonl` 156 行，`ledger.py check --flows` 退出 0。
- 三张波末小卡：RFC-0001 的 SDK 版本行、测试运行器的差分变异缺陷、夹具 12 ms 静默窗口。卡号见「波末补记」。

## 波末补记

### 合并结果上的门禁（`706152690`，`tmp/closures/w3e-merge/`）

六包 `build typecheck test` 退出 0（30 个任务）；慢层退出 0（18 个任务）；`typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 都退出 0；CRLF 0。日志哈希见卡评论 6683488904。

### 准入（父分支头 `706152690`，证据 `tmp/closures/w3-admission/`）

2026-11-06 11:13–11:31 UTC。哈希是 SHA-256 前 16 位。

- `pnpm run admission`：退出 1（`admission.log` `bb1030b2aa239063`）。17 步里除 `test` 外 16 步通过。`test` 跑了 88 个成员、25984 条用例，有 11 处失败，分布在四个成员：`assets-local` 4、`settings-local` 5、`sqlite-provider` 1、`apps/cli` 1。Skill 与 MCP 的成员都通过。因为快层没过，慢层没有跑。
  - 这 11 处都是基线既有，不是本卡引入的。四个成员的代码与 `integration/mainline` `1b017574b` 相同：`git diff 1b017574b 706152690` 在这四个成员所在的范围里只有 `packages/assets/assets/SPEC.md` 的一行文字（Skill 契约成员改名为 `skill-contract` 之后的包名，`68c9e5eeb`），不影响用例。
  - 隔离重跑（`pnpm run test:triage`，`triage.log` `12f2bba231f460e0`）：11 处各单独跑三次都过，整个文件单独跑也过。工具把它们归为与并行负载或用例次序有关，不是用例本身的逻辑错误。
- `pnpm run acceptance`：退出 0（`acceptance.log` `c73cf61c16a496ac`）。
- `pnpm run loop:status --strict --base 05f281394c9179ecb9427fb1d5b97cc2f808a789`：第一次退出 2，因为严格模式现在要求 `--out`。加 `--out tmp/closures/w3-admission/loop-out` 后退出 0（`loop-status-2.log` `232d6013d070d585`）。四条硬线：依赖违规 0；环 0（组环按例外 GCX-AGENT-CONTEXT 放行）；验收锁无未解决违规；传感器有数据。比基线变差的成员：无。
- 准入期间本会话没有并跑测试或评审；W4 的计划评审是只读子代理，没有占测试名额。
