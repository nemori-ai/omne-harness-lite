# tool-model

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现六份数据契约，都是 `omne-harness-lite-design-2026-09-15` 基线下的 v1、状态 `candidate`、接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)：
  `data.tool-definition`（[契约](../../../../spec/data/tool-definition/v1/contract.md)）、`data.loop-extension`（[契约](../../../../spec/data/loop-extension/v1/contract.md)）、`data.skill-package`（[契约](../../../../spec/data/skill-package/v1/contract.md)）、
  `data.slash-command`（[契约](../../../../spec/data/slash-command/v1/contract.md)）、`data.mcp-endpoint`（[契约](../../../../spec/data/mcp-endpoint/v1/contract.md)）、`data.connector`（[契约](../../../../spec/data/connector/v1/contract.md)）
- 源码位置：`packages/core/tool-model`——**尚未建包**。归 `core`：六份都是 `data.*`，被 `tools`、`assets`、`agent-loop`、`model` 四个领域消费（[两层布局](../../../README.md#packages-的两层布局)）。**与另三个 core 节点成环**，按现划分建不出来，见 [message-model 缺口 MSG-1](../message-model/design.md#包级依赖成环)
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——六份契约都没有操作、提交点与状态转移。它提供工具侧六类正文的类型、表示层校验（各自闭合的拒绝值与次序）、模型面条目与名字转写（`ModelToolName` 的家）、**一次调用的参数判定**、`SKILL.md` 与技能包目录的读法、斜杠命令的识别与解析、各类的属性项推出规则与引用，以及交给 asset-model 的正文端口实现。**派发、执行、放行判断、拉起 MCP 接入点、受理信封都不在这里**

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现六份契约的形状、相等、纯函数与表示层面：`data.tool-definition` S-1～S-28、S-31（S-29、S-30 是「不在定义里」的界）；`data.loop-extension` S-1～S-29、S-36～S-40 的形状、合法组合表与推出规则（S-30～S-35 的落日志与处置归派发器）；`data.skill-package` S-1～S-25、S-32 的形状、文本形式读法与目录形式读法的纯半；`data.slash-command` S-1～S-29 的识别、解析与形状（S-24 的「什么都不发」、S-25 的留痕归交付面与受理面）；`data.mcp-endpoint` S-1～S-21、S-26；`data.connector` S-1～S-19 的形状与推出规则（S-14、S-15 归接入端与受理）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——六份契约都没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                             | 阅读入口                            |
| ---------------------------------------------------- | ----------------------------------- |
| 怎样实现、参数判定怎样做、名字转写与 YAML 读法怎样选 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么                   | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                           | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
