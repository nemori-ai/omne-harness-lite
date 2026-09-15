# 需求消费与设计覆盖

[提案索引](README.md) · [不变式](invariants.md)

本提案的需求工作区快照为 HUB 分支 `design/dsh-core-adoption` 提交 `ca0d95b`：它在
D-012 采用的基线 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`（保留引用
`refs/tags/requirements-baseline/2026-09-14-agent-loop-inbound`）之上新增了
[PF-025](../../requirements/product/agent/PF-025-external-hooks-compatibility.md) 一页，并按用户裁决
U-47 修订了 [PF-005.C10](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#变更记录)；
其余 `docs/requirements/` 未变。快照之后 2026-09-15 又消费了
[PF-013.C5](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#变更记录)
的"等待期间自动消费排队文本"（工具提案作者裁决 7，本提案的占位与 reminder 派生随之覆盖
`foreground_pending` 一类）与 [PF-009](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#变更记录)
C1 / C2 / C7 的复确认；正式接受时保留引用固定在含这些修订的提交上。正式接受前按
[需求维护](../../maintenance/requirements.md#基线保留)固定新的保留引用。

覆盖按要求分列；"性质"列指向 [invariants.md](invariants.md) 的编号，"落点"列指向波 2 的
文件（未写成前标"波 2"）。已由 session v1 / CD v1 / MC v1 / TL v1 / CT v1 落实的条款只引用，
不复述。

| 要求及确认范围 | 落点 | 性质 |
|---|---|---|
| [PF-013.C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求) 用户可从获准客户端观察并恢复同一事实；临时流式进度与耐久历史分别表达，不承诺每个 token 可重放；每个入口检查租户、用户与对象权限 | envelope-and-cursor.md（游标、补齐）、scope-and-delivery.md（两处核对）；沿用 [SE-03](../../../spec/capabilities/session/v1/contract.md) 历史读面与 [SE-16](../../../spec/capabilities/session/v1/contract.md) 水位 | MS-1、MS-3、MS-4、MS-5、MP-3 |
| [PF-003.C1](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求) 执行状态可感知 | 调用状态变化作为事实提示帧（决定 D）；状态本身归 [工具提案 lifecycle.md](../tool-execution/lifecycle.md) | MS-1、MS-2 |
| PF-003.C2 内部帧按需披露、流式 | 工具帧经 [frames.md](../tool-execution/frames.md) 读面进出站流；`(frames(S), seq)` 并入游标 | MS-9、MS-10 |
| [PF-022.C3](../../requirements/product/agent/PF-022-multimodal-response-and-output.md#已确认要求) 逐步响应并保留顺序 | delta-protocol.md：attempt 内 chunk 稠密序号；块序按 `index` | MS-2、MS-7 |
| PF-022.C4 原件与历史可取回；断线重连取得同一已确认回复；临时流进度与耐久内容区分 | message-model.md（历史投影）、envelope-and-cursor.md（`ended` 指向提交位置）；媒体沿 [CT-04](../../../spec/capabilities/media-content/v1/contract.md) | MS-1、MS-3、MS-8、MS-12 |
| PF-022.C6 部分交付与失败如实可见 | delta-protocol.md：`ended{failed \| abandoned}` 与 [MC-06](../../../spec/capabilities/model-execution/v1/contract.md) partial 对应；缺口词表 | MS-4、MS-7 |
| [PF-009.C3](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求) 附件可持久引用、读取检查权限 | 媒体只发引用（[CT-02/03](../../../spec/capabilities/media-content/v1/contract.md)），取回走 CT 读面 | MS-12 |
| PF-009.C4 用户能知道模型实际接收了什么 | message-model.md：`delivery` 与投影说明进客户端消息；沿 [CD-03](../../../spec/data/core-work/v1/contract.md) | MS-8 |
| [PF-005.C4 / C8](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#已确认要求)、[PF-007.C1 / C4 / C5](../../requirements/product/user/PF-007-system-initiated-hitl.md#已确认要求)、[PF-008.C1 / C4 / C6](../../requirements/product/user/PF-008-unified-decision-pool.md#已确认要求) 人类请求先耐久后呈现、同一身份与真实结果、状态与可答性分别可见 | envelope-and-cursor.md：`hd.request.*` 卡片是 HD 事实的投影帧，不产生请求；答复回到工具结果（[U-44](../tool-execution/README.md#裁决记录2026-09-14用户)） | MS-1、MS-2、MS-11 |
| [PF-003.C4 / C5](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求) 与 [U-46](../tool-execution/README.md#裁决记录2026-09-14用户) 占位与迟到结果 | message-model.md：`deferred_receipt` 与 `system_reminder` 的客户端呈现；一个调用的最终结果在客户端视图里恰出现一次 | MS-11 |
| [PF-025.C1](../../requirements/product/agent/PF-025-external-hooks-compatibility.md#已确认要求) hooks 上下文进入模型 | `system_reminder{hook_context}` 同一块种类（[hooks 提案](../hooks-compat/mapping.md)）；观察事件不进流（决定 F） | MS-8 |
| [SYS-OBSERVABILITY.C1 / C2 / C5 / C6](../../requirements/system/observability-and-logging.md) 链路可诊断、跨边界关联、缺口可见、读面受治理 | 帧带对象身份与去重键（关联）；瞬态缺口词表（缺口可见）；工程观测不经客户端流（[OB-01/03](../../../spec/capabilities/engineering-observation/v1/contract.md)） | MS-2、MS-4、MS-5 |
| [SYS-TENANT](../../requirements/system/constraints.md#sys-tenant) 跨租户默认拒绝 | scope-and-delivery.md：订阅建立与每帧投递前核对；游标不携带授权 | MS-5 |
| [SYS-RUNTIME-CONTINUITY](../../requirements/system/runtime-state-and-continuity.md) 运行时重建后同一事实 | 出站流不持久、不产生事实；重建后客户端按游标补齐 | MS-1、MS-3 |

未覆盖或明确不在本提案：PF-004 子 Session 的流合并（留接口）；PF-019 费用在客户端的
呈现（费用是 BG 事实，进流与否随决定 D 的"小事实"规则）；传输参数与内联阈值（实现阶段）。
