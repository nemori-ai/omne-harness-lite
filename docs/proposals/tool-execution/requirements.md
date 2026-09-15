# 需求消费与设计覆盖

[提案索引](README.md) · [不变式](invariants.md) · [生命周期](lifecycle.md)

本提案的需求工作区快照为 HUB 分支 `design/dsh-core-adoption` 提交 `18026b2`：它在
D-012 采用的基线 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`（保留引用
`refs/tags/requirements-baseline/2026-09-14-agent-loop-inbound`）之上只新增了
[PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md) 一页及其
索引条目，其余 `docs/requirements/` 未变。正式接受前按
[需求维护](../../maintenance/requirements.md#基线保留)固定新的保留引用。用户在本轮的裁决记录于
[提案入口](README.md#裁决记录2026-09-14用户)，不改写需求正文。

覆盖按要求分列；"性质"列指向 [invariants.md](invariants.md) 的编号，"落点"列指向
[lifecycle.md](lifecycle.md) 的节或波 2 的文件。已由 tools v1 / run-driver v2 / session v1 /
HD v1 落实的条款只引用，不复述。

| 要求及确认范围 | 落点 | 性质 |
|---|---|---|
| [PF-003.C1](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求) 执行状态可感知 | 五维状态机与读面（[lifecycle.md](lifecycle.md#五个正交维度)）；沿用 TL-07 状态 | T-1、T-3 |
| PF-003.C2 内部帧按需披露、流式 | 帧事实侧（frames.md，波 2）；沿用 TL-12 | F-1～F-3 |
| PF-003.C3 单独中断一次调用 | [控制表](lifecycle.md#控制与级联表)：stop 只作用原 call/attempt | T-3 |
| PF-003.C4 符合声明的调用可手动转后台 | [等待关系维度](lifecycle.md#五个正交维度)、[前台上限与转后台](lifecycle.md#前台上限与自动转后台)；转后台后的占位与迟到结果进入模型的形态见[占位与迟到结果](lifecycle.md#占位与迟到结果的投影)；沿用 TL-10 | T-4、T-11、T-14 |
| PF-003.C5 自动转后台 | 同上：有效阈值、计时归属、`onLimit` | T-11 |
| PF-003.C6 恢复后重新关联后台调用 | [恢复窗口](lifecycle.md#恢复窗口)；沿用 TL-11、RD-16 | T-4、T-5 |
| [PF-005.C1～C3](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md) 主动提问、一次性批准、能力授权申请 | [内建人类请求工具](lifecycle.md#内建人类请求工具)：恰好两条命令 `human ask_user` / `human request_approval`（U-44），HD 为执行 owner；C3 的能力授权申请由 `ask_user` 表达需要，授予走系统发起的专属同意流程（HD-05），C2 的批准不建立会话权限 | H-1～H-4、T-9 |
| PF-005.C4～C9 请求耐久、长期等待、多请求独立、首答胜出、决策池 | 归 HD v1（HD-01～09）；本提案只消费 HD-03 的接续绑定与 HD-08 的同提交 | H-1、H-3 |
| PF-005.C10 批准与实际动作可追溯，越界重新请求 | 用户裁决 U-44：Agent 发起的批准是提示层语义，不是系统机制。可追溯 = 批准请求与答复都作为耐久工具事实在历史里按顺序可核对；受控动作的权威授权记录是系统门（AU 审计、必要时的 system_approval）；越界时重新请求是 Agent 的提示纪律，受控的越界动作会被系统门再次拦住。C10 中"由系统权威记录对精确请求及批准结果的引用"这半句在 U-44 下没有系统机制承接，需求措辞是否调整待用户确认（[未决项](README.md#未决项)） | T-9 |
| [PF-007.C4～C7](../../requirements/product/user/PF-007-system-initiated-hitl.md) 阻塞请求长期等待、决策池、暂行资格与后果 | 系统审批沿 TL-07 ask 门与 HD-06/07；暂行不加 Schema 字段，由 AU-03 `authorization.confirmation: provisional` 与 `provisionalContract` 承担（[schema.md](schema.md#维度总表)），承载归 HD-10～12 | T-9 |
| [PF-013.C4](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) 运行控制的传播范围与工具处置 | [控制与级联表](lifecycle.md#控制与级联表)逐行落实 interrupt / interrupt_then_run / cancel / force_stop 对三种关系的处置 | T-3、T-4 |
| [PF-024.C1/C2](../../requirements/product/agent/PF-024-multi-command-tool-definition.md#已确认要求) 多命令范式、单槽位 | 单/多命令统一定义两种投影（schema.md，波 2）；沿用 TL-01 | T-6、T-8 |
| [PF-022.C2/C5/C6](../../requirements/product/agent/PF-022-multimodal-response-and-output.md#已确认要求) 工具产出可交付、治理覆盖、部分交付如实 | 输出结果三层与媒体引用（schema.md，波 2）；结算时 CT 引用耐久 | T-12 |
| [PF-009.C3/C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md) 附件持久引用、模型实际接收可知 | 输入参数的内容引用类型与模态声明（schema.md，波 2） | T-12 |
| [PF-012.C1/C3/C6/C7](../../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md) 三类 use、环境选择、副作用如实、可用性相符 | 环境能力声明只作门输入与 discover 原因（schema.md，波 2）；本提案不定义动作目录 | — |
| [PF-014.C4/C5](../../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md#已确认要求) 装载能支持实际工作、变化可辨认 | 沿用 TL-03/06；本提案只消费 stale_binding / unavailable 的结算 | T-7 |
| [PF-015](../../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md) 制品引用 | 结果中的制品引用沿 CT/PF-015，不另存 | T-12 |
| [PF-019](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md) 逐 Step 归因与迟到费用 | 结算交付维度：费用随 attempt 归原调用/Step；沿用 BG-03 | T-2 |
| [PF-025.C1/C2](../../requirements/product/agent/PF-025-external-hooks-compatibility.md#已确认要求) 兼容外部命令式 hooks | S5 `PreToolUse` → TL-13 守卫（只收紧、不改参数），S7 `PostToolUse` → 投影选择（cordis.md，波 2）；其余站点归 hooks 兼容提案 | T-6 |
| [SYS-KERNEL](../../requirements/system/constraints.md#sys-kernel)、[SYS-SPEC](../../requirements/system/constraints.md#sys-spec) | 复用 tools fork 的 DSL/校验/呈现与 DSH `user-questions` 词汇；语义语言无关，模型与场景在 evidence/ | — |
| [SYS-TENANT](../../requirements/system/constraints.md#sys-tenant) | 调用、attempt、帧、请求均带 tenant；订阅投递前核当前读权 | F-3 |
| [SYS-DEPLOY](../../requirements/system/constraints.md#sys-deploy) 单机交付且边界可独立扩展 | 执行 owner 是独立边界；首版同进程（决定 a/b），跨进程只留接口 | T-4 |
| [SYS-OBSERVABILITY](../../requirements/system/observability-and-logging.md) | 每个转移一条三段式事件带去重键；帧与终态分开；控制与停止进度分别记录 | F-2 |
| [SYS-RUNTIME-CONTINUITY](../../requirements/system/runtime-state-and-continuity.md) | 调用与请求耐久、实例不耐久；恢复按 RD-16 窗口从事实派生 | T-4、T-5、H-1 |
| [SYS-LONG-RUNNING](../../requirements/system/long-running-and-evolving.md) | 等人不占执行预算；hooks 续跑有刹车；后台调用有上限（数值实现阶段） | H-4、TP-4 |

## 相邻边界与未覆盖部分

- PF-014.C6 必需 skill 的激活/撤回与依赖图、PF-016 插件在线部署：沿用 TL-05/06 的条款，
  提供者生命周期另开。
- PF-004 派发形态、子 Session 的作答者：只固定"派发是一次调用、结果走 call_settlement"。
- PF-012 六种环境组合、Browser/Computer 执行 owner：不在本提案；环境声明只作门输入。
- 出站流协议与游标（U-36）、JSON Schema 文件（U-35）：实现阶段。
- 通用工具体中途 `interrupt()`：用户裁决不纳入首版（U-41）。
