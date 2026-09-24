# message-model

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现四份数据契约，都是 `omne-harness-lite-design-2026-09-15` 基线下的 v1、状态 `candidate`、接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)：
  `data.content-blocks`（[契约](../../../../spec/data/content-blocks/v1/contract.md)）、`data.messages`（[契约](../../../../spec/data/messages/v1/contract.md)）、`data.call-accounts`（[契约](../../../../spec/data/call-accounts/v1/contract.md)）、`data.arrival-events`（[契约](../../../../spec/data/arrival-events/v1/contract.md)）
- 源码位置：`packages/core/message-model`——**尚未建包**。归 `core`：四份都是 `data.*`，被 `model`、`tools`、`assets`、`agent-loop` 四个领域消费（[两层布局](../../../README.md#packages-的两层布局)）。**这个包界限与另三个 core 节点成环**，按现划分建不出来，见 [design.md 缺口 MSG-1](design.md#包级依赖成环)
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——四份契约都写明自己没有操作、没有提交点、没有状态转移（各自「这份契约拥有什么」）。它提供值的类型、表示层校验（各契约闭合的拒绝值与固定次序）、几项纯判定（此刻模型可读、合法名单、有效费用与汇总、到达事件的归约），以及金额与不透明数据的无损读写。**写日志、铸标识、记账只记一次、翻译出门都不在这里**，归各消费者节点

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现四份契约的**形状、相等、表示层拒绝值与次序、纯判定**这一面：`data.content-blocks` S-1～S-27、S-34（不含 S-22「落盘之后整块不变」的写路径与 S-23 的租户判定）；`data.messages` S-1～S-40、S-49、S-50 的形状与判定面（不含 S-32 的追加与去重、S-34～S-36 的翻译）；`data.call-accounts` S-4～S-29、S-37 的形状与求值面（不含 S-19「恰一份」的落盘、S-25 的归组）；`data.arrival-events` S-5～S-29 的形状、归约与表示层面（S-17～S-24 的序列判定归 [stream-assembly](../stream-assembly/README.md)）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——四份契约都没有登记的 formal task（`data.messages` 的 Alloy 模型 `Readable.als` 不是 formal task，退出码不判断言）。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                       | 阅读入口                            |
| ---------------------------------------------- | ----------------------------------- |
| 怎样实现、公开面是什么、为什么现划分建不出来   | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么             | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                     | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
