# D-074：正式接受 PF-015 rev 13 与 PF-020 rev 21

- 当前状态：已接受，仅限这两份产品设计当前已定义的范围。
- 接受者与日期：产品负责人，2026-09-28。
- 实际接受依据：当前会话明确指令，原话如下：

> PF-015 和 PF-020 我看还是 draft 状态的，你帮我翻正，直接主分支上做，完了直接推送远程这块的变更

- 精确输入基线：仓库提交 `bb3df6f01c5ba99b882e4cce4dfaa4cd18e32dcf` 中的 PF-015 rev 13 与 PF-020 rev 21。
- 来源研究：[会话设计研究](../../../../research/agent-harness-session-design/README.md)，2026-09-20 的版本化观察；研究仅提供 PF-015 的前置事实，不代替本次接受。
- 产品裁决来源：[PF-015 decisions](../../../product/PF-015-session-lifecycle-and-ownership/decisions.md) 与 [PF-020 decisions](../../../product/PF-020-workspace/decisions.md)，以及后者所引用的工作区访谈。

## 选择与范围

| 被接受对象 | 精确范围 | 保留边界 |
|---|---|---|
| PF-015 rev 13 | [design.md](../../../product/PF-015-session-lifecycle-and-ownership/design.md) 当前已定义的会话生命周期、关系、类型、运行模式、runtime context、存储要求与工作区适用规则 | [第九节](../../../product/PF-015-session-lifecycle-and-ownership/design.md#九未决项) 及来源问题仍为显式缺口；自动归档时限能否由租户覆盖等事项未因转正获得默认答案 |
| PF-020 rev 21 | [design.md](../../../product/PF-020-workspace/design.md)、[flows.md](../../../product/PF-020-workspace/flows.md)、[acceptance.md](../../../product/PF-020-workspace/acceptance.md) 的首版工作区产品规则、流程与验收含义 | [第九节](../../../product/PF-020-workspace/design.md#九未决项) 的未来扩展、交付面及规格实现交接继续由各自拥有者承接；已知普通目录使用的覆盖缺口保留 |

## 理由与保留前提

产品负责人明确接受当前版本。此次只登记接受事件并校准状态引用，不改变产品规则，故 revision 保持 13 与 21。
本次没有开展新的整包独立评审，不以状态更新声称评审、形式模型或产品运行验证完成。
下游可据已接受范围展开设计；依赖显式缺口的部分仍须先闭合相应缺口。

## 取代与影响

两份 topic 的 `status` 从 `draft` 改为 `active`，同步状态段、产品索引、架构内核索引和下游入口；领域对象地图由生成器更新。
历史 changelog 与访谈中当时的草稿状态继续保留，本决定记录其后的接受事件。
不取代已有正式决定或冻结契约，不修改 catalog 或 frozen 清单；相邻 PF 自身的接受范围不扩大。
技术设计、契约、提供者、应用实现与运行验证均不因产品转正而完成。
