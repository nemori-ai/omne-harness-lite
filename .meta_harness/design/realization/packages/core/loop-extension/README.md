# loop-extension

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `data.loop-extension · v3`，精确 [规范](../../../../spec/data/loop-extension/v3/contract.md) 与 [接受](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 已冻结；采用依据为 [D-068追加](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/loop-extension` 已建立；当前公开产物仍是已核的2采用实现，新3 Schema／消费者闭包正在升级，不能以规格接受当实现完成。
- 验证：旧2原证据保留其精确输入；当前3需包内回归、公开dist／旧Schema闭包、W6真实组合及逐ID独立签收。2实现现有575测试通过只作旧范围证据。用户最后总体接受未发生。

## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.loop-extension · v2`（[契约](../../../../spec/data/loop-extension/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/loop-extension`——**尚未建包**。归 `core`：它是 `data.*`，被 `agent-loop`（派发器、兼容层）、`model`（模型请求运行时、模态投影）、`tools` 与 `assets` 消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点。它提供位置、维度、干预力、声明、输入、八种结论与三种记录的类型，两张合法组合表，结论的表示层校验（十个拒绝值），推出规则与 asset-model 的 `loop_extension` 类正文端口。**逐件派发、结论落日志、报错处置都不在这里**，归拓展件派发器

## 分层状态

**当前实施补充（2026-09-26）**：源码已进入 HUB，build／typecheck、555 项测试、26 规则实际源码扫描及格式门通过，纯值接口已释放。下列初稿「未建包／无源码／未开始」是设计接受时基线，实际证据待逐项保全和登记；不据本地门通过声称 runner 的落盘、资格或回放已经完成，也不替代用户最终总体接受。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-29、S-36～S-40 的形状、合法组合表、推出规则与表示层面，以及 S-41 执行环境句柄的**形状**（解析归 runner）。**不兑现**：S-30～S-35（每件的结论必留、记录形状落日志、不可用与报错两分、不合法结论按报错处置、跨过等待只带已落日志的东西）——归派发器与写拓展件的人。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、两张合法组合表怎样驱动判定       | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
