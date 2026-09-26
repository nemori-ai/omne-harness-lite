# model-profile

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码 `cd67215b`），2026-09-25 首稿（按 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.model-profile · v1`（[契约](../../../../spec/data/model-profile/v1/contract.md)，状态 `accepted`，接受由 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/model-profile`——**已实现（`cd67215b`、HUB `735ee728`）**：公开 `.` 与 `./schema`，judge、refMatches、parameterNames与固定Schema校验面。归 `core`：它是 `data.*`，被 `model`（档案目录、模型请求运行时）、`tools`（拓展件的 `select_model`）、`agent-loop`、`assets`（档案目录的设置取值）消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点；表示层校验明写是「一次纯计算」（[S-24](../../../../spec/data/model-profile/v1/contract.md#s-24-表示层校验是一次纯计算)）。它提供档案、引用、参数词表、快照与建档内容的类型，表示层校验，以及引用的精确匹配。**建档、撞名判定、按层覆盖、在册状态的转移都不在这里**，归模型档案目录

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-041 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：已实现 S-1～S-2、S-4～S-9、S-12～S-20、S-24～S-28 的形状、词表、引用匹配与表示层面；数值采用content-blocks JsonNumber，原值精确核界。custom引用的scope由目录显式交入，快照不属于四种judge文档。**不兑现**：S-3撞名、S-10在册转移、S-11更新行为、S-21三种处置、S-22外部写入纪律与S-27原样复制。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的formal task。证据义务见 [verification.md](verification.md)，本模块范围的实际结果已登记，目录与runtime责任另列
- 实际验证：[`2026-09-26-tests-core-values`](../../../../record/evidence/2026-09-26-tests-core-values/README.md)：作者与HUB包build/typecheck/test均退出0，**185/185**、零跳过，含155冻结fixture与固定seed有界数字oracle。HUB另以公开dist消费声明／runtime、真实24规则扫描通过。首次作者环境smoke不是冻结基线验收；消费者、目录与真正模型请求责任保持在各owner，不表示用户最终接受

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、公开面是什么、引用怎样匹配       | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
