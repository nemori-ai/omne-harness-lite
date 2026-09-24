# slash-command

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿（按 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.slash-command · v1`（[契约](../../../../spec/data/slash-command/v1/contract.md)，状态 `candidate`，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/slash-command`——**尚未建包**。归 `core`：它是 `data.*`，交付面（`apps/cli`）与受理面、注册表、求值都要用同一份识别与解析
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作、提交点与事件（[第九节](../../../../spec/data/slash-command/v1/contract.md#九缺席怎么收)首句）。它提供命令定义的类型与表示层校验、识别文法 `recognize`、解析 `parseInvocation`、两种展开、推出规则与 asset-model 的 `slash_command` 类正文端口。**交付面的呈现、受理面的入站、「什么都不发」的纪律（S-24）与留痕（S-25）的落点都不在这里**

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-1～S-23、S-26～S-29 的识别、解析、展开与形状。**不兑现**：S-24 的「什么都不发」与 S-25 的留痕（交付面与受理面）；S-7 `ServiceName` 解到哪个服务（契约 G-7 未决）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、位置怎样按码点计、整数怎样比界   | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
