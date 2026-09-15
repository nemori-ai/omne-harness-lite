# Run 驱动器

**当前正式契约为 [capability.run-driver v3](v3/contract.md)**，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
[v2](v2/contract.md)（[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md)）与
[v1](v1/contract.md)（[D-012](../../../docs/decisions/D-012-run-driver-and-inbound.md)）保持冻结
与可引用，标为 superseded。v3 是语义变化版：Run 的等待收敛到 [run v2](../run/README.md) 的
等待登记簿（`waiting_human` / `waiting_gate` 不再是 Run 状态），Step 收束只看 attempt 与提议
登记、开下一 Step 改由合批与占位规则控制，切点来源扩展为六类，Step 结算补
`invalid_proposal`，不可恢复失败不再处置已准入调用，新增等待期间取入排队文本（RD-18）与
Agent Loop 扩展点站点表（RD-19）。精确版本、状态与接受依据以 [catalog](../../catalog.json)
为准。

| 对象 | 当前状态与依据 |
|---|---|
| run-driver 设计与规格 | v1 由 D-012 接受，v2 由 D-014 接受（仅引用变化），v3 由 D-015 接受（语义变化）；[设计来源与评审](../../../docs/proposals/agent-loop-inbound/README.md)、[工具执行提案](../../../docs/proposals/tool-execution/README.md)、[hooks 兼容提案](../../../docs/proposals/hooks-compat/README.md)、[Cordis 视角](../../../docs/proposals/agent-loop-inbound/cordis.md)、[验证范围](verification.md) |
| 形式模型 `RunDriver.tla` | v3 目录内的模型按等待登记簿重写（问答并入调用、合批与占位、`invalid_proposal`、空闲点取入）；六个配置在各自时限内完整探索通过，四个否定变体给出预期反例，范围与未建模条款见验证说明；不是无条件证明。v2 目录内的模型与配置是 v1 的逐字节副本，保持冻结 |
| 目标实现 | 尚未开始；提供者设计归 [run-driver 包](../../../packages/agent/run-driver/design.md)（按 v3 重写是接受之后的一波）；DSH agent-loop 的[源基线](../../../docs/proposals/core-capabilities/fork/loop-source.md)按 [取舍表](../../../docs/proposals/agent-loop-inbound/loop.md#对-dsh-agent-loop-源码的取舍)只保留算法思想 |

[规范场景](v3/scenarios.md)列出提供者验收条件。设计接受、模型检查与实现验收
分别记录；本页不代替精确契约。

## 差异表来源裁决的出处

[v3 差异表](v3/contract.md#与上一版的差异)的"来源裁决"列只写编号，链接在此维护（契约正文
不引用候选材料）：

| 编号 | 出处 |
|---|---|
| U-43、U-44、U-46、U-59 | [工具执行提案的用户裁决记录](../../../docs/proposals/tool-execution/README.md#裁决记录2026-09-14用户) |
| 作者裁决 2、3、7 | [按用户工作风格的作者裁决](../../../docs/proposals/tool-execution/README.md#作者裁决2026-09-15按用户工作风格) |
| 作者裁决 8、9、10 | [第二轮作者裁决](../../../docs/proposals/tool-execution/README.md#第二轮作者裁决2026-09-15架构复核后) |
| 作者裁决 17、18 | [第三轮作者裁决](../../../docs/proposals/tool-execution/README.md#第三轮作者裁决2026-09-15第三轮架构复核后) |
| §2.6 词表、占位与迟到结果 | [占位与迟到结果的投影](../../../docs/proposals/tool-execution/lifecycle.md#占位与迟到结果的投影)、[等待期间的排队用户输入](../../../docs/proposals/tool-execution/lifecycle.md#等待期间的排队用户输入作者裁决-7) |
| hooks 提案站点与权力表、hooks RD-17 行 | [站点与权力](../../../docs/proposals/hooks-compat/mapping.md#站点与权力) |
| S1 守卫协议 | [S1 守卫协议](../../../docs/proposals/hooks-compat/mapping.md#s1-守卫协议) |
| hooks 提案性质 HK-1 | [性质与证据义务](../../../docs/proposals/hooks-compat/README.md#性质与证据义务) |
| RD-19 站点词表（用户要求本批带上） | 用户 2026-09-15 的要求；站点表沿 hooks 提案站点与权力表扩为封闭枚举 |
