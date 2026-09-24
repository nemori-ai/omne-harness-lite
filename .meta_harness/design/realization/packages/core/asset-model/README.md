# asset-model

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（[契约](../../../../spec/data/asset-model/v1/contract.md)，状态 `candidate`，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/asset-model`——**尚未建包**。归 `core`：它是 `data.*`，中心的资产治理与据点的装配、注册表两侧都 import（[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) 接受 assets 候选 B：「资产模型与求值进 `core` 作数据契约与纯计算」）。**与另三个 core 节点成环**，按现划分建不出来，见 [message-model 缺口 MSG-1](../message-model/design.md#包级依赖成环)
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约写明它[没有操作、没有提交点、没有状态转移，因此不需要插件](../../../../spec/data/asset-model/v1/contract.md#这份契约拥有什么)。它提供资产领域全部静态形状的类型、表示层校验（十个拒绝值加嵌着的正文契约的值，固定次序）、能力标识的规范串、保留的两条属性声明、工作区提供的资产的记录号导法。**标识唯一、所有者至多变一次、版本线只增、一格一份持有这些行为约束不在这里**，归资产治理的写路径与存储

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-1～S-28、S-36 的**形状、词法、相等、规范串、保留声明、表示层拒绝与次序、接收边界上能判的跨成员约束**，以及 S-4 例外支（工作区提供的资产的记录号导法，契约交给实现）与 S-17 的目录规范化（契约交给实现）。**不兑现**：S-4／S-22／S-23 的「部署内唯一、不回收」、S-7 第 1～3 条、S-9「已发布不变」、S-18 的键唯一——它们归写路径与存储（资产治理）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在，没有测试。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                       | 阅读入口                            |
| ---------------------------------------------- | ----------------------------------- |
| 怎样实现、公开面是什么、怎样不 import 正文契约 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么             | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                     | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
