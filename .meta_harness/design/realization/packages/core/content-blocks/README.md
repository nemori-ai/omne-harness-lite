# content-blocks

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.content-blocks · v2`（[契约](../../../../spec/data/content-blocks/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/content-blocks`——**尚未建包**。归 `core`：它是 `data.*`，被 `model`、`tools`、`assets`、`agent-loop` 四个领域消费，也是本批包依赖图的底（只依赖 identity-values）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作、提交点与状态转移。它提供七类块、`CapabilityId`（形状与相等的唯一家）、媒体类型与模态、表示层校验（六个拒绝值），以及本批共用的两样：**严格的无损 JSON 读写**（[D-060 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）与**不透明标识的词法候选**。**铸号、落盘不改、附件解引用都不在这里**

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-21、S-23～S-27、S-34 的形状、相等、模态判定与表示层面，以及 S-9、S-12、S-24 的无损与严格读法（M36，契约终稿：参数串重复键 ⇒ 解析不了；读块文本重复键 ⇒ `malformed`；数无损）。**不兑现**：S-3、S-14 的铸号与唯一性（归铸号方）、S-22「落盘之后整块不变」的写路径（归会话日志的写入方）、S-21 的解引用与租户判定（归附件存储）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                           | 阅读入口                            |
| -------------------------------------------------- | ----------------------------------- |
| 怎样实现、本批共用的三种写法为什么这样选           | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么                 | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                         | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
