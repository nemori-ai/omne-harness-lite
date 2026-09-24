# asset-registry

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.asset-registry · v1`（[契约](../../../../spec/capabilities/asset-registry/v1/contract.md)，状态 `candidate`，未接受、未冻结；设计依据 PF-002 rev 20、PF-006 rev 19、PF-004 rev 12）
- 源码位置：`packages/tools/asset-registry`——**尚未建包**。第一层 `tools` 由 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板（tools 取候选 C，注册表归 `tools`）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject 装配清单与时钟，不 inject 存储**（它没有自己的表：[S-18](../../../../spec/capabilities/asset-registry/v1/contract.md#s-18-快照不持久装配清单是唯一权威)「快照不持久，装配清单是唯一权威」）。
  求值与资产形状**纯 import**（D-039 assets 取候选 B：`core/asset-evaluation`、`core/asset-model` 是纯模块），不 inject——这取代了 [capability-split-tools 草图](../../../../record/proposals/capability-split-tools/design.md#装配草图与为什么这样切)里「inject 资产求值」那一格。
  据点读面（求值输入、版本正文、会话事实）、MCP 桥、模态转换登记、提供者自报都是**调用时现取的可选依赖**，缺席按契约 [S-32](../../../../spec/capabilities/asset-registry/v1/contract.md#s-32-依赖的提供者不可用) 收场

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**未接受（候选，待 D-041）**。契约仍是 `candidate`；[D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md) 是待产品负责人签字的草案，契约里的主线裁定长期落点 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/README.md) 尚未逐条追认。本节点的设计同样未被接受
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)：S-5～S-34 的全部操作与规矩。**尚未建包、没有一行源码**。
  **整个节点受阻于装配清单**：契约的每个换表操作以「记进装配清单」为提交点，而装配清单没有契约、没有提供者（契约 G-1）——本节点必需 inject 它，所以**在它出现之前本插件停在 `PENDING`，服务不出现**。
  另受阻：据点读面（求值输入、版本正文、会话事实）**没有 provider 节点**（缺口 A-2，归装配）；提供者自报与「有效模型」没有读面（契约 G-6），本批凡声明了这些项的工具与技能一律是替换件。装配清单与据点读面按 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 本程不补。
  2026-09-25 随契约修复波 3 对齐：`fill` 的过时重试答 `invalidInput{evaluationSuperseded}`（M34，原 A-5 闭合）；`within = run{report}` 只在报告所依的快照里找（M35，原 A-6 闭合），由此带来的留存义务以装配清单的历史换表记录承接（design 关键选择四、R-M9）；报告带 `attempt`（M46）；求值的 `compositionCycle`／`categoryUnsupported` 原样转交（M32、M45）；MCP 动作的 `stand_in{for: schema_unsupported}`（M37）；原 A-7 随 M33 闭合。受阻项在 [verification](verification.md#覆盖缺口) 登记
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（[S-35](../../../../spec/capabilities/asset-registry/v1/contract.md#s-35-本版选用哪些形式工件)：性质被建模方式吸收），没有可绑的 formal task；十二条规范场景与本节点自己的交错演练**一条都没有**
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 插件边界、为什么不 inject 存储、缓存怎样对着装配清单校验、换表怎样串行、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
