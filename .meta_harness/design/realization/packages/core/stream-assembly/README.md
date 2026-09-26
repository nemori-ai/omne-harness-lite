# stream-assembly

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按 [D-040 §八 M36、M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 对齐（严格无损解析；依赖 arrival-events、content-blocks、call-accounts 三包）；兑现 `omne-harness-lite-design-2026-09-15 · capability.stream-assembly · v1`（[契约](../../../../spec/capabilities/stream-assembly/v1/contract.md)，状态 `accepted`，接受由 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/stream-assembly`——**尚未建包**。归 `core`：它是纯计算（[S-1](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-1-本契约拥有什么)），被 `model` 领域的模型请求运行时与 `tools` 领域的工具执行运行时两个宿主 import（[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 选择表第三行「落 core、纯计算、自写」；[两层布局](../../../README.md#packages-的两层布局)）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——五个操作都作用于调用方持有的状态值，没有提交点、不持有任何一条流、不发事件（[S-1](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-1-本契约拥有什么)、[S-17](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-17-每个操作写全九件事)）。路由、持有、包消息、只记一次、首个内容的时刻都归宿主（[S-3](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-3-本契约不拥有什么)、[S-28](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-28-宿主要兑现的前提)），不在本节点

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-041 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现 S-4～S-27（装配状态与位置、一块在状态里是什么、快照、收尾结算、一块怎样落、封口那一下的唯一解析、解析不了只标记、被砍过的调用落成半截、账与砍的汇总、首个内容的位置、五个操作、八个判定失败值、表示层拒绝值原名引用、判定次序、被拒不改状态、一次到达装配等于一次性到达），逐条见 [design.md 投影表](design.md#契约到-cordis-的投影)。**S-28、S-29 不在本节点兑现**：它们是宿主前提与部署表，本节点只写清单机时它提供了什么让宿主兑现得了。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **2 条**，都指向 formal task `stream-assembly-v1-assembly`（run [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md)，退出 0、无反例）：P-1 块次序（S-6）与 P-7 一次到达装配等于一次性到达（S-27）；两条的有效性前提（三份变异配置给得出反例）由 run [`2026-09-25-validity-stream-assembly`](../../../../record/evidence/2026-09-25-validity-stream-assembly/README.md) 支撑（全部退出 12，D-040 §八 M54）。**它们证的是模型，不是实现**；实现侧的一致性用例、性质测试、规范场景与静态检查一条也没有，缺口见 [verification.md「覆盖缺口」](verification.md#覆盖缺口)
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                      |
| ------------------------------------------ | ----------------------------- |
| 怎样实现、公开面是什么、状态值怎样表示     | [实现设计](design.md)         |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)       |
| 实际跑过什么、覆盖到哪里、还缺什么         | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
