# model-model

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现两份数据契约，都是 `omne-harness-lite-design-2026-09-15` 基线下的 v1、状态 `candidate`、接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)：
  `data.model-profile`（[契约](../../../../spec/data/model-profile/v1/contract.md)）、`data.model-response`（[契约](../../../../spec/data/model-response/v1/contract.md)）
- 源码位置：`packages/core/model-model`——**尚未建包**。归 `core`：两份都是 `data.*`，被 `model`、`tools`（拓展件的 `select_model`）、`agent-loop`、`assets`（档案目录的设置取值）消费（模型拆分提案的装配草图：「两份数据契约进 `packages/core`」）。**与另三个 core 节点成环**，按现划分建不出来，见 [message-model 缺口 MSG-1](../message-model/design.md#包级依赖成环)
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——两份契约都没有操作与提交点；`data.model-profile` 的表示层校验明写是「一次纯计算」（[S-24](../../../../spec/data/model-profile/v1/contract.md#s-24-表示层校验是一次纯计算)）。它提供档案、引用、参数词表、响应体的类型，两份契约各自的表示层校验，引用的精确匹配，以及几处副本定义的对齐测试。**建档、撞名判定、按层覆盖、写响应体、脱敏、发号都不在这里**，归模型档案目录与模型请求运行时

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 `data.model-profile` S-1～S-2、S-4～S-9、S-12～S-20、S-24～S-28 的形状、词表、引用匹配与表示层面（S-3 撞名、S-10 在册转移、S-11 `updatedAt`、S-21 三种处置、S-22 归写入方与目录）；`data.model-response` S-4～S-15、S-17～S-19、S-35 的形状与 S-26～S-28 的表示层面（S-16、S-20～S-24 的写入纪律归模型请求运行时）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——两份契约都没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、公开面是什么、副本定义谁来对齐   | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
