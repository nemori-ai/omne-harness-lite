# connector

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿（按 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.connector · v1`（[契约](../../../../spec/data/connector/v1/contract.md)，状态 `candidate`，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/connector`——**尚未建包**。归 `core`：它是 `data.*`，被资产治理、求值、连接件接入端与受理消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点（[第九节](../../../../spec/data/connector/v1/contract.md#九缺席怎么收)）。它提供连接件正文、来源标识、投递目标、入站信封的类型与表示层校验，推出规则与 asset-model 的 `connector` 类正文端口。**接入端、交接协议、受理、附件解引用都不在这里**

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-1～S-10、S-16～S-19 的形状与表示层面；S-11 推出规则按契约**判不出来**（两项权限的取值域在契约 G-4 上），本节点如实返回「推不出」。**不兑现**：S-14、S-15（接入端与受理）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                 | 阅读入口                            |
| ---------------------------------------- | ----------------------------------- |
| 怎样实现、信封为什么不带归属、推出规则怎样收 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么       | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么               | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
