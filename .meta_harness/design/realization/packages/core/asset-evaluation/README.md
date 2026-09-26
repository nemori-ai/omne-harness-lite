# asset-evaluation

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按 [D-060 §八 M31、M32、M41、M45、N-21](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 对齐契约终稿，并单独导出 S-23 的界与挑选；兑现 `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v2`（[契约](../../../../spec/capabilities/asset-evaluation/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/asset-evaluation`——**尚未建包**。归 `core`：契约是纯计算（[S-11](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-11-纯计算)），被 `assets`（资产治理的设置视图）、`tools`（注册表、MCP 桥）、`agent-loop`（拓展件派发）与据点装配消费（[D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) 接受 assets 候选 B：「资产模型与求值进 `core` 作数据契约与纯计算」）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——两个操作都是输入的函数，不读存储、时钟、文件与进程状态，没有在途工作（[S-11](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-11-纯计算)、[S-30](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-30-本能力没有在途工作)）。**组输入**（一致读、分享此刻成立、调用方已核实、清单就是目录里那份）是前提 PRE-1～PRE-9，归组输入的一方，不在本节点。除两个操作外，另导出 S-23「界与挑选」的三个纯函数，供资产治理的写时守卫用，与 `evaluate` 第 4 步共用同一实现

## 分层状态

**本轮交付边界（2026-09-26，用户进一步明确仅 Connector 一种资产纵线延期）**：其他资产类型的 `evaluate`、`readWorkspaceCarrier`、权限构件与整输入指纹完整实施、交付和验收；只延期 Connector 正文及其相关纵线。当前默认装配不提供 Connector，不用替身宣称六真实正文齐全；五个已提供正文的完整 AM／AE 组合继续。此前整份 AE 两操作延期的口径已作废；技术可用性投影经独立架构复审细化，原冻结领域规则与完整设计接受事实不改。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5～S-28、S-38～S-42 的求值与读入规则（四步、两轮、三条层序、组合根引用集、输入一致性 C1～C14、三个失败值 `invalidInput` → `compositionCycle` → `categoryUnsupported` 与判出结果分开、清单读入与留痕），以及规范场景 S-33～S-37、S-41、S-43、S-44 的实现侧。本版组合里有 plugin 或 sub-agent 的 agent 按契约以 `categoryUnsupported` 失败（[G-3、G-21](../../../../spec/capabilities/asset-evaluation/v2/contract.md#十一已知缺口) 的范围），不是本节点的缺口。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
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
