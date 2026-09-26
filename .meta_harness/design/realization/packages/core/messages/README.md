# messages

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.messages · v3`，精确 [规范](../../../../spec/data/messages/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/messages` 已建立；HUB `585b0078` 已采用默认3资源与完整原字节 `schema/v2`。HUB `eabfff0f` 实际公开闭包试点通过（AM3全25定义、六保留2消费者全定义），源依赖已释放给后续spoke；六包完整回归、逐义务签收仍在进行，依赖试点不代替完成。
- 验证：旧2原证据保留其精确输入；当前3需包内回归、公开dist／旧Schema闭包、W6真实组合及逐ID独立签收。2实现现有469测试通过只作旧范围证据。用户最后总体接受未发生。

## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.messages · v2`（[契约](../../../../spec/data/messages/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/messages`——**尚未建包**。归 `core`：它是 `data.*`，被 `model`、`tools`、`agent-loop` 与连接件消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作、提交点与状态转移。它提供七种消息与五种运行时记录的类型、两段式表示层校验、「此刻模型可读」与「合法名单」「配对与唯一」三项纯判定。**铸 `MessageId`、追加与去重、翻译出门都不在这里**，归会话日志的写入方与模型请求运行时

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-40、S-49、S-50 的形状与判定面（S-28 此刻模型可读、S-29 合法名单、S-32 配对与唯一的判定、S-37～S-40 两段式拒绝值）。**不兑现**：S-3 的铸号与唯一、S-32 的追加与幂等、S-34～S-36 的翻译（归写入方与传输适配）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task（Alloy 模型 `Readable.als` 不是 formal task，不可绑定）；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、三项判定要调用方给什么           | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
