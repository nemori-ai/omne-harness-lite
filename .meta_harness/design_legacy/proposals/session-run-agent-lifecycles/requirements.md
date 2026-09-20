# 需求消费与设计覆盖

本提案沿用 D-012 采用的需求基线 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`，保留引用
`refs/tags/requirements-baseline/2026-09-14-agent-loop-inbound`；自该基线起
`docs/requirements/` 没有变更，逐文件哈希见
[agent-loop-inbound 的恢复记录](../agent-loop-inbound/evidence/requirements-baseline.json)。
用户在本轮设计讨论中的裁决记录于[提案入口](README.md#裁决记录2026-09-14用户)，不改写需求正文。

覆盖按三个对象分列；"性质"列指向 [invariants.md](invariants.md) 的编号，"级联"列指向
[lifecycles.md](lifecycles.md#级联矩阵) 的行。已由 D-012 落入 session-run v2 / run-driver v1
的条款只引用，不复述。

| 要求及确认范围 | 对象 | 本轮归属、性质与级联 |
|---|---|---|
| [PF-013.C1](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求) 管理长期 Session：归档/删除在有活动 Run 时明确拒绝、不隐式中断；关闭后的未执行队列项有可审计终态 | Session | S-1、S-2、L-3；级联行 1 |
| PF-013.C2/C3/C4 精确运行控制、紧急停止、传播范围 | Run | R-1、R-2、I-3；级联行 2、4、5 |
| PF-013.C5–C9 追加消息、复合打断、有界保序合批、队列管理、命令协作 | Session（队列） | 沿用 [SR-04～07、SR-11](../../../spec/capabilities/session-run/v2/contract.md)、[I-5～I-7](../agent-loop-inbound/invariants.md)；级联行 11 |
| PF-013.C10 跨端观察并恢复同一事实；临时进度与耐久历史分开 | Session、Run | 事实广播只投递已提交 envelope（L-4），恢复从事实派生（L-5）；客户端流协议仍留后续 |
| PF-013.C11 过滤检索与自主工作管理 | Session | 沿用 SR-01；本轮不展开提供者细节 |
| [PF-017.C5/C6](../../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md#已确认要求) 后台协作有明确受理与接续结果；服从目标会话工作边界 | Session（Inbound） | S-3、I-15、I-17、I-21；启动扫描为 Session 提供者义务 |
| [PF-023.C1/C2/C6/C7](../../requirements/product/user/PF-023-session-model-selection-and-continuity.md#已确认要求) 同一 Session 换模型继续下一轮；当前 Run 不被替换；后台工具保持关联 | Session、Run | I-4（模型固定到 Run，选择保存在 Session）；级联行 9 的"进行中 Run 沿冻结依据继续" |
| [SYS-RUNTIME-CONTINUITY.C1](../../requirements/system/runtime-state-and-continuity.md#已确认要求) 运行时与状态持久化解耦 | 实例 | A-4：实例状态机不耐久，恢复不依赖任何实例事实；L-5 |
| SYS-RUNTIME-CONTINUITY.C2 同构资源下恢复接续 | Run、Session | R-6（重取须过 SR-14 兼容证据）、S-3（裁决先行）；级联行 7 |
| SYS-RUNTIME-CONTINUITY.C3 异构运行时适配 | 实例 | 装配选择归 AR-9/AR-16 与应用装配；本轮只保证 Run 不吸收代际变化 |
| [SYS-KERNEL](../../requirements/system/constraints.md#sys-kernel)、[SYS-SPEC](../../requirements/system/constraints.md#sys-spec) | 三者 | 三个独立插件与组合者的边界（cordis.md，波 2）；权威各落各目录 |
| [SYS-TENANT](../../requirements/system/constraints.md#sys-tenant) | 三者 | 所有流与 arrival 携带 tenant；事实广播按租户/Session 作用域过滤；实例访问沿 AR-1/CB-01 |
| [SYS-DEPLOY](../../requirements/system/constraints.md#sys-deploy) 单机交付且边界可独立扩展 | Run | Run 独立权威的分布前提以 [Lifecycles 模型](lifecycles.md#跨协调域的预期)论证；结论不阻止单机首版 |
| [SYS-LONG-RUNNING](../../requirements/system/long-running-and-evolving.md) | Session（调度） | 调度者不轮询，只响应事实广播与开机扫描（LP-1）；沿用 P-4 |

## 相邻边界与未覆盖部分

- 工具设计延后：归档后后台调用的停止/存续政策、TL→Inbound 端口的精确形状留待工具设计；
  本轮只落"结算进 Inbound 后按 D2 列 closed"（级联行 1）。
- 客户端出站流协议、通知命名空间（U-5）的实现仍留后续；本轮只定义事实广播的义务。
- 多进程部署下旧 epoch 持有者的活性判定不在本轮；跨协调域的模型结论只说明哪些性质
  在拆分后退化，不定义租约或故障接管协议。
- PF-004 三种派发关系、PF-012/016/021 环境变化仍沿 D-012 的边界，不因本轮扩大。
