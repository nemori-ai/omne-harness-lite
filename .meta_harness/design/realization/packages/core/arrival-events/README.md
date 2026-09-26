# arrival-events

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.arrival-events · v2`（[契约](../../../../spec/data/arrival-events/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/arrival-events`——**尚未建包**。归 `core`：它是 `data.*`，被 `model`（传输适配、模型请求运行时）与 `tools`（发帧入口、工具执行运行时）两侧的生产者与 [stream-assembly](../stream-assembly/README.md) 消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——到达事件不是记录条目（[S-4](../../../../spec/data/arrival-events/v2/contract.md#s-4-到达事件不是记录条目)），契约没有操作与提交点。它提供信封与六种事件的类型、一块的归约、表示层校验（九个拒绝值）。**序列语法的判定与命名归 stream-assembly**（S-24「由消费一方判定并命名」），节流与「封口块等于归约」归生产者

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-4～S-16、S-19 的形状与归约，S-26～S-29 的表示层面。**不兑现**：S-17～S-18、S-21、S-23～S-24 的序列判定（stream-assembly）、S-20 与 S-22 的生产者义务（传输适配与发帧入口）、S-25 左列（宿主）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、要借开块的两项怎样判             | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
