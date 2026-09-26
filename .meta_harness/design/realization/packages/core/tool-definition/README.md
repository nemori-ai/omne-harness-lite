# tool-definition

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.tool-definition · v3`，精确 [规范](../../../../spec/data/tool-definition/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/tool-definition` 已完整采用3；作者 `29abb185` 的末段交付已集成至 HUB `fad84ef3`。默认3及完整原字节 `schema/v2` 均保留；实际 AM 固定图和保留2消费者闭包已通过。
- 实际验证：[当前源 HUB 复验](../../../../record/evidence/2026-09-26-tests-core-current-v3/README.md) 中本包 **282 tests**、构建、严格类型与公开消费者通过，六包合计2410；原2证据保留原坐标。W6最终两真实链、逐ID技术接受及用户总体接受仍待，不从局部通过推到外部责任。


## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.tool-definition · v2`（[契约](../../../../spec/data/tool-definition/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/tool-definition`——**尚未建包**。归 `core`：它是 `data.*`，被 `tools`（执行运行时、注册表、MCP 桥）、`model`（传输适配投成供应商工具声明）、`assets` 与 `agent-loop` 消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点。它提供工具定义与返回值的类型、模型面条目与名字转写（`ModelToolName` 的家）、**一次调用的参数判定**、表示层校验、依赖声明与属性项推出规则，以及交给 asset-model 的 `tool` 类正文端口。**派发、执行、放行判断、收场都不在这里**

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-28、S-31 的形状、纯函数、参数判定与表示层面（S-29、S-30 是「不在定义里」的界），并为契约 G-16 **登记 `schema_unsupported` 的上限候选值**（[U-1～U-8](design.md#schema_unsupported-的上限登记g-16)：`pattern` 先不带 `u`、再带 `u` 试编的方言（M56）、`pattern` ≤ 1024 码点、嵌套无界量词、反向引用、计数量词上界 1000、判一次调用的判定时限 500 ms）。参数判定的编译产物归消费者持有的判定对象（`createParameterJudge()`，候选名），**不设模块级缓存**（[D-060 §八 M50](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。**不兑现**：`help` 与 `inspect` 的一致、声明与实际对得上、裸字符串只兑现一次、卸载、后台许可——归执行运行时与注册表。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                           | 阅读入口                            |
| -------------------------------------------------- | ----------------------------------- |
| 怎样实现、参数判定怎样做、名字怎样转写与逆转写     | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么                 | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                         | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
