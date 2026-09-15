---
kind: proposal
id: P-hooks-compat
status: draft
scope: Claude Code / Codex 命令式 hooks 体系的兼容适配层：上游事件到本系统循环站点的逐项映射与降级表、S1 受理后守卫协议、handler 与配置来源、执行主体与执行边界、失败与观察、Stop 续跑刹车；作为 run-driver / tools / session 扩展点的消费者，不新建第二套事件机制
---

# 外部命令式 hooks 兼容层

[提案索引](../README.md) · [PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md) · [run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md) · [tools v1](../../../spec/capabilities/tools/v1/contract.md) · [session v1](../../../spec/capabilities/session/v1/contract.md) · [六系统研究](../../research/agent-loop-events-and-hooks/README.md) · [工具执行提案](../tool-execution/README.md)

[PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md) 要求用户以
Claude Code、Codex 的事件名、配置形状与 stdin/stdout JSON 协议写的 hook 能在本系统运行。
形态沿 DeepSeek Harness `c291e79` 的 `dsh-hooks-claude-code` / `dsh-hooks-codex`
（[DSH 笔记](../../research/agent-loop-events-and-hooks/notes/dsh.md)）：**进程内扩展点是
权威，命令式 hook 是它的一个适配器**。两条约束不因兼容而破：(1) 扩展点只有"收紧"与
"选择投影"两种权力（[RD-17](../../../spec/capabilities/run-driver/v2/contract.md)、
[TL-13](../../../spec/capabilities/tools/v1/contract.md)），兼容层不能借上游语义拿到更多；
(2) 已耐久的输入、参数、结果不因 hook 改写。上游允许而这里不允许的效果按降级处理并
逐项可查，不静默忽略。

## 范围

- 在范围内：两家事件全集到站点 S0～S9 与旁路的逐条映射（兑现 / 降级 / 不支持），决定字段、
  输入字段与配置字段的对照；S1 受理后守卫协议；handler 首版集合；配置来源、装配者、执行
  边界与进程环境；串行、合并、async、超时与失败语义；每次运行的观察事件；`Stop` 续跑的
  刹车；对 RD-17 / SE-04 / SE-12 / SE-13 / SE-14 / HD-05 的措辞缺口；Cordis 视角与提供者归属；
  性质与证据义务。
- 不在范围内：http / mcp_tool / prompt / agent 四类 handler（各随其依赖能力）；子 agent 事件
  （归 PF-004）；沙盒隔离本身（归 PF-012）；转录文件导出；上游事件目录的演化跟踪。

## 文件

- [mapping.md](mapping.md)：站点与权力、S1 守卫协议、事件映射两表、终态与事件、可见差异、
  配置字段、机制对照、字段映射、续跑刹车、观察事件、装配与信任、场景 HS-01～HS-12。
- [requirements.md](requirements.md)：需求快照与按要求的覆盖表。
- [review.md](review.md)：2026-09-14 独立评审的发现、处置与转给用户的决定点。

## 裁决记录

用户裁决 [U-40](../tool-execution/README.md#裁决记录2026-09-14用户)（2026-09-14）：要像 DSH
那样兼容 Claude Code / Codex 的命令式 hooks；决定点 o～v 按作者建议拍板：

| # | 问题 | 采纳的选择 |
|---|---|---|
| o | `SessionStart` 退出码 2 | 不兑现为 Run 级阻断，只注入上下文：Session 创建是治理操作，没有对应的上游语义 |
| p | `PermissionRequest` 代人作答 | 允许，作答主体是装配 hook 资产的租户成员且须持有该请求的作答资格（[HD-05](../../../spec/capabilities/human-decisions/v1/contract.md)）；否则降级为观察 |
| q | `Stop` 续跑刹车 | 连续续跑计数上限（缺省 8，租户可配）+ `stop_hook_active` 输入；租户费用预算沿 BG 对每个续跑 Run 照常预留（没有 Run 级执行时长预算，见工具提案 [U-45](../tool-execution/README.md#评审后的决定点用户裁决2026-09-15)）；续跑是新 Run 而非同 turn，接受这一可见差异 |
| r | `PreCompact` 阻断 | 不兑现，只把 `custom_instructions` 作为辅助 Step 输入 |
| s | 超时 | 沿上游：命令超时不阻断；`PreToolUse` 超时按 fail-open 记失败并放行到 TL-07 门 |
| t | `transcript_path` | 首版省略并在兼容说明列明 |
| u | handler 首版集合 | 只有 command |
| v | 执行主体与隔离 | 主体 = 装配 hook 资产的租户成员；命令在 [live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md) 执行信任前提下运行，兼容层不声称隔离 |

## 评审后的决定点（用户裁决，2026-09-15）

来源见 [review.md](review.md)；正文按裁决写。

| # | 问题 | 裁决 |
|---|---|---|
| U1 | 无 PF-012 沙盒映射时，哪些装配者类别可装载 command handler | 受管 hook 与个人租户 owner 装配的 hook 可载；组织普通成员装配的拒绝（`execution_boundary_required`），待沙盒映射后放开 |
| U2 | 程序化作答能否越过 AU-04 确认模式与组织强约束 | 不能：Session 为 `confirm` 或组织策略要求人工确认时 hook 的 allow 无效，只在 `standard` 下生效 |
| U3 | `hook_continuation` 不受 SE-16 容量拒绝，其有界性依据 | 确认："刹车计数 + 去重键 `(RunRef, handler)`"即为有界性证据 |
| U4 | 受管 hook 的 fail-closed 租户策略 | 先不做：不过早引入复杂度与未确定有真正受益的优化；不再作为候选记录 |
| U5 | S1 守卫的形状 | take 前内联求值（受理立即成功、稍后可能 `closed_by_guard`），interrupt_then_run 项例外地在受理准备阶段先求值 |

## 性质与证据义务

| 编号 | 性质 | 来源 | 保护点 | 证据义务 |
|---|---|---|---|---|
| HK-1 | 权力上界：兼容层的任何效果只能是关闭队列项、收紧门（deny / ask）、排除模型投影、注入下一 Step 的 `system_reminder{hook_context}`、入队 trigger、有资格的程序化作答；不存在改写耐久输入 / 参数 / 结果或阻止 Run 结算的路径 | PF-025.C1、RD-17、TL-13、[T-6](../tool-execution/invariants.md#调用) | 适配器只能调用扩展点的封闭 API（[站点与权力](mapping.md#站点与权力)） | API 结构检查；run-driver 场景 S20；每站点一个"越权字段被记为 unsupported"的测试，含 S1 的 `suppressOriginalPrompt` 与 S8 的"阻止结算" |
| HK-2 | 逐项可查：上游两家的每个事件、决定字段、输入字段与配置字段在映射表里恰有一种状态（兑现 / 降级 / 不支持）；配置里出现不支持项时写 `hooks.config.unsupported`，不静默 | PF-025.C1 | 映射表与配置装载 | 映射表对照研究笔记里的上游目录快照（CC 33 个事件、`SyncHookJSONOutput` 字段、CX schema）的检查；装载测试 |
| HK-3 | 失败不静默：每次 hook 运行恰写一条 `hooks.run.completed`；阻断理由对用户与模型都可见；命令级失败不阻断但可查；守卫提供者不可用时插件不 ready，不出现无守卫放行 | PF-025.C2、TL-13、SYS-OBSERVABILITY | command runner、各站点适配器、插件 ready 条件 | 单测（崩溃、超时、非法 JSON）；HS-10 |
| HK-4 | 刹车：同一 Session 连续由 `hook_continuation` 触发的 Run 数不超过上限；第上限次时 `stop_hook_active = true` 已给出；观察者重跑不产生第二个 trigger；租户费用预算沿 BG 对每个续跑 Run 照常预留 | PF-025.C2、决定 q、U3 | SE-10 projection 计数、去重键（[刹车](mapping.md#stop-续跑的刹车)） | HS-06、HS-09；计数在归档 / 恢复后由 fold 重建的测试 |
| HK-5 | 主体、来源与边界：hook 配置只从租户资产经 TG 资格发现，不读工作目录 settings；执行主体是装配者且每次触发前重验；command handler 只在部署对该装配者类别授予宿主级执行信任时装载；进程环境不含供应方凭据与 records 路径；跨租户配置不会被装载 | PF-025.C2、PF-010、live-agent v1 执行信任前提、决定 v、U1 | 装配准入与 spawn 环境（[装配与信任](mapping.md#装配与信任)） | 装配测试；跨租户否定测试；HS-07、HS-12；环境变量白名单测试 |

## 与已接受契约的关系

登记在[工具执行提案的缺口表](../tool-execution/lifecycle.md#契约措辞缺口表)，随闭环一次发版：

| 契约与条款 | 缺口 | 处理 |
|---|---|---|
| [RD-17](../../../spec/capabilities/run-driver/v2/contract.md) 输入准入 | S1 需要"受理后、取用前的守卫"，只能关闭项不能改写（[协议](mapping.md#s1-守卫协议)） | run-driver v3 |
| RD-17 停止边界 | 保持"无阻止停止 hook"；`Stop` block 兑现为入队 trigger；`superseded` 不触发 `Stop` | 无改动 |
| [RD-06](../../../spec/capabilities/run-driver/v2/contract.md) 切点来源 | `additionalContext` 的正文进切点需要新来源 `system_reminder{hook_context}`，与工具提案的 `system_notice` 并列（[工具提案缺口表](../tool-execution/lifecycle.md#契约措辞缺口表) RD-06 行） | run-driver v3 |
| [SE-04](../../../spec/capabilities/session/v1/contract.md) / [SE-12](../../../spec/capabilities/session/v1/contract.md) closed 词表 | 队列项与 arrival 都加 `closed_by_guard`；trigger 项加 `closed(source_invalid)` | session v2 |
| [SE-13](../../../spec/capabilities/session/v1/contract.md) / [SE-14](../../../spec/capabilities/session/v1/contract.md) | 来源枚举加 `hook_continuation`（内部来源，意图 queue，dedupKey `(RunRef, handler)`）；决定表加一行（终态 → C 列；归档 → closed） | session v2 |
| [SE-06](../../../spec/capabilities/session/v1/contract.md) takeTrigger | `hook_continuation` 的来源权威重查项 | session v2 |
| [SE-10](../../../spec/capabilities/session/v1/contract.md) | 续跑计数作为 projection 注册 | 提供者设计 |
| [HD-05](../../../spec/capabilities/human-decisions/v1/contract.md) 作答认证 | 程序化作答者：actor 为受信提供者、on-behalf-of 为装配者 membership，提交时重验资格，审计可辨 | HD v2 |
| [TL-13](../../../spec/capabilities/tools/v1/contract.md) 守卫、[TL-12](../../../spec/capabilities/tools/v1/contract.md) 投影选择 | 无：守卫与投影选择已定义 | 无改动 |
| 新能力 `hooks` | 事件目录、handler 声明、`hooks.run.*` / `hooks.config.*` 观察事件、映射表 | 接受后发 hooks v1 |

## Cordis 视角

| 对象 | 落点 |
|---|---|
| 提供者 | 新包候选 `packages/agent/hooks-compat`：`HooksCompatPlugin` 装载一个 command runner、一个适配器（站点翻译、决定合并、观察事件）与两个配置装载器（Claude Code settings 形状、Codex `hooks.json` / `config.toml [hooks]`） |
| 登记的扩展点 | S0 / 旁路 A：驱动器准备阶段的同步贡献者；S1 `omneSession.registerArrivalGuard`；S5 `omneTools.registerGuard({site: pre_execute})`；S7 `omneTools.registerProjectionSelector({site: post_execute})`；S8 / S9 / 旁路 B：`records.envelope.committed` 观察者；`PermissionRequest`：HD 程序化作答者登记 |
| ready 条件 | 全部登记成功且 command runner 可用；任一扩展点不可用 → 插件不 ready，`hooks.config.rejected{guard_unavailable}`（不是 fail-open） |
| 装载效应与撤除 | 效应：站点登记、hook 资产索引、进行中的 hook 进程。撤除：先封闭准入（AR-16），撤登记，abort 进行中的进程并 drain（DSH 同），最后撤索引；`hooks.run.completed` / `hooks.config.*` 记录保留；不撤销已生效的关闭项、拒绝或入队 trigger |
| 依赖变化 | 命令级失败沿决定 s；扩展点动态撤除 → 插件退出 ready 并封闭准入；TG 撤回 hook 资产或装配者失效 → 下次触发前重验失败并跳过，进行中的不中断；执行环境不可用 → command handler 不可载 |
| 不做的事 | 不建第二套事件机制；不给 hook 进程 records 写权、服务句柄或供应方凭据；不读宿主 settings 文件 |

## 未决项

- 子 agent 事件（`SubagentStart/Stop`）与 `agent_id` 输入随 PF-004。
- http / mcp_tool / prompt / agent handler 各随其依赖能力（PF-020、MCP、PF-004）另开。
- `PreModelSwitch` 守卫、`PostToolBatch` 的 Step 级贡献、`transcript_path` 只读导出：需要时另开。

## 接受记录

尚未接受。2026-09-14 完成映射、机制、字段、刹车与 Cordis 视角；独立评审同日完成，2 项
阻断与 9 项应修已按 [review.md](review.md) 处置；决定点 U1～U5 由用户 2026-09-15 裁决，正文
已按裁决写。
