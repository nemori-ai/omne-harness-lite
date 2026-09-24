# asset-evaluation

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v1`（[契约](../../../../spec/capabilities/asset-evaluation/v1/contract.md)，状态 `candidate`，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/asset-evaluation`——**尚未建包**。归 `core`：契约是纯计算（[S-11](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-11-纯计算)），被 `assets`（资产治理的设置视图）、`tools`（注册表、MCP 桥）、`agent-loop`（拓展件派发）与据点装配消费（[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) 接受 assets 候选 B：「资产模型与求值进 `core` 作数据契约与纯计算」）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——两个操作都是输入的函数，不读存储、时钟、文件与进程状态，没有在途工作（[S-11](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-11-纯计算)、[S-30](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-30-本能力没有在途工作)）。**组输入**（一致读、分享此刻成立、调用方已核实、清单就是目录里那份）是前提 PRE-1～PRE-8，归组输入的一方，不在本节点

## 分层状态

- 语义接受范围：**未接受**（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-5～S-28、S-38～S-42 的求值与读入规则（四步、两轮、三条层序、输入一致性 C1～C13、`invalidInput` 与判出结果分开、清单读入与留痕）。**有两处按契约现状兑现不了**：[G-3](../../../../spec/capabilities/asset-evaluation/v1/contract.md#十一已知缺口)（Agent Definition 的两条规则缺席，第 2 步从 `root` 起不了步）使 `evaluate` 对任何合法输入都给不出合规的结果；G-1（成环的收场值没有名字）使含环输入没有合规的返回——见 [design.md 缺口 AE-1、AE-2](design.md#实施缺口与消费者影响)。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task（`Evaluation.als` 是 Alloy 模型，不是 formal task，不可绑定）；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、正文规则从哪来、哪里兑现不了     | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
