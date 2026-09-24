# loop-extension-runner

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.loop-extension-runner · v1`（[契约](../../../../spec/capabilities/loop-extension-runner/v1/contract.md)，状态 `candidate`、未冻结）。插件边界、inject 边与贡献的形状取自 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 tools 拆分候选 C 的[装配草图](../../../../record/proposals/capability-split-tools/design.md#装配草图与为什么这样切)（派发器）
- 源码位置：`packages/agent-loop/loop-extension-runner`——尚未建包。第二层 `agent-loop` 由 D-039 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个插件（候选插件名 `loop-extension-runner`），**只必需 inject 会话日志**；provide `loopExtensionRunner`（`dispatch`、`replay`）与受限的实现登记面 `loopExtensionImplementations`（系统自带实现按 `builtinName` 登记、兼容件的外部命令执行器登记一个；执行环境句柄的两个解析方法也在这个面上）——都是候选名。一次经过跑在调用方（agent runtime，或入站受理方）的协程上，本插件不持有运行实例里的状态（契约 S-8）；装配清单、模型请求运行时的两个判定、放行判断、依赖在场判定、句柄解析的两个来路都在求值那一刻调用时取用，缺席即那一件不可用或这一次 `unavailable`，**不是 runner 不可用**。控制全是逐个 `await` 的直接调用，不走 Cordis 事件。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：未接受（候选，待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 可实施范围：声称兑现 S-5～S-19（一次经过、链、系统自带件、读面、逐件求值、不可用与报错、合法性、效果、关门表、只跑一轮、提醒）、S-50（执行环境句柄的读面）、S-21（含 `admission.report` 三者核对与 `cancelled`）、S-22、S-23～S-30 里 runner 这一侧的交接、S-31、S-32 左列、S-33、S-34，逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**受阻（[缺口](design.md#实施缺口与消费者影响)）：会话日志提供者（块 D）不存在，结论、栅栏、条件写入、提醒去重全落在它上面（RUN-N1）；装配清单读面没有契约（RUN-N2），读不到清单即每一次 `dispatch` `unavailable`；一次经过的锚在日志里怎么落是契约 G-1，回放与「只跑一轮」的实现定不了稿；执行环境句柄解析出的租户与执行环境没有来路（契约 G-20），闭合前兼容件全部「起不来」、含要转的块的消息被否决。RUN-N3、RUN-N4 已随 D-040 §八 M38、M39 闭合
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——回放的行为模型 `Runner.tla` 已触发、尚未建（契约 G-14），没有登记的 formal task 可绑；规范场景 S-36～S-49、S-51、S-52 没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 一个插件两个服务面、实现怎样登记与撤下、一次经过怎样求值与落结论、共同存储对象、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
