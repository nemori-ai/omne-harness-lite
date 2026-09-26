# mcp-endpoint

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿（按 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.mcp-endpoint · v1`（[契约](../../../../spec/data/mcp-endpoint/v1/contract.md)，状态 `candidate`，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/mcp-endpoint`——**尚未建包**。归 `core`：它是 `data.*`，被资产治理、MCP 桥、注册表与求值消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点。它提供接入点正文、动作清单副本（两支）、对端动作描述、OAuth 绑定与凭据配值的类型与表示层校验，动作条目名的拼法，登记时的名字收窄，推出规则（正文＋动作集）与 asset-model 的 `mcp` 类正文端口。**拉起连接、取清单、写副本、投影成工具定义、生成 OAuth 绑定号都不在这里**（MCP 桥与资产治理）

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）；已对齐 2026-09-25 修复波 3 的契约终稿（S-10 末段 `schema_unsupported` 的动作不被排除）
- 可实施范围：声称兑现 S-1～S-21、S-26 的形状、条目名拼法、登记时收窄、推出规则与表示层面。**不兑现**：S-12 绑定号的唯一与不可猜（单一生成点）、S-4 的拉起（MCP 桥）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、条目名怎样拼、副本两支怎样分开   | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
