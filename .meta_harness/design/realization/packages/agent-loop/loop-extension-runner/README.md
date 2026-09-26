# loop-extension-runner

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.loop-extension-runner · v2`（[契约](../../../../spec/capabilities/loop-extension-runner/v2/contract.md)，状态 `accepted`、已冻结）。插件边界、inject 边与贡献的形状取自 [D-059](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 接受的 tools 拆分候选 C 的[装配草图](../../../../record/proposals/capability-split-tools/design.md#装配草图与为什么这样切)（派发器）
- 源码位置：`packages/agent-loop/loop-extension-runner`——尚未建包。第二层 `agent-loop` 由 D-059 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是 `runPass`（对一次经过逐件求值，调用方交链、锚键与端口）、`composeEffect`、三张处置表与 `passKeys`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面** `dispatch` 就是 `runPass` 加绑好的端口——每件恰一条结论、回放、尝试栅栏、句柄只及本会话只在这一层成立，函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：一个插件（候选插件名 `loop-extension-runner`），**只必需 inject 会话日志**（`capability.session-log` v2）；provide `loopExtensionRunner`（`dispatch`、`replay`）与受限的实现登记面 `loopExtensionImplementations`（系统自带实现按 `builtinName` 登记、兼容件的外部命令执行器登记一个；执行环境句柄的两个解析方法也在这个面上）——都是候选名。一次经过跑在调用方（agent runtime，或入站受理方）的协程上，本插件不持有运行实例里的状态（契约 S-8）；装配清单（`capability.assembly-manifest` v2 的 `readHead` 与 `dependencyPresence` 查询）、模型请求运行时的两个判定、放行判断、句柄解析的两个来路（`sessionTenancy`；执行环境先经它取租户、再经 `executionEnvironments`）都在求值那一刻调用时取用，缺席即那一件不可用或这一次 `unavailable`，**不是 runner 不可用**。控制全是逐个 `await` 的直接调用，不走 Cordis 事件。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5（一次经过；锚是调用方交来的不透明键，[D-063 R-12](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）～S-19（链、系统自带件、读面、逐件求值、不可用与报错、合法性、效果、关门表、只跑一轮、提醒）、S-21（`dispatch`，含 `admission.report` 三者核对与 `cancelled`）、S-22（`replay`）、S-50（执行环境句柄的读面）、S-23～S-30 里 runner 这一侧的交接、S-31、S-32 左列、S-33、S-34（含 runner 自身被撤除时在途 `dispatch` 不继续，D-060 §八 M63）。原「有前提地能：G-1」的四条（S-5、S-18、S-21、S-22）随 R-12 解除：锚由调用方给，**锚的算法**归 loop 那一程（契约 G-1 收窄后的那一半），本节点兑现不了调用方的两条义务。逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**
  受阻（[缺口](design.md#实施缺口与消费者影响)）：会话日志**接口已定、真承接者未到**——结论、栅栏、判重、提醒全落在 `capability.session-log` v2 的条款上，真承接者未到，最小提供者节点 `session-log-jsonl` 已立（accepted，RUN-N1）；装配清单**接口已定、读链未约定**——`readHead` 交得回记录，但链与四样值从记录内容里怎样取是 `capability.assembly-manifest` v2 的 G-4，服务面每一次 `dispatch` 在它闭合前 `unavailable`，**函数面 `runPass` 由调用方交链、不受挡**（RUN-N2）；依赖在场判定改为 `assemblyManifest.dependencyPresence` 查询，事实没有来源（那份契约 G-2，RUN-N5）；执行环境句柄两样**真承接者未到、接口已定**（契约 G-20）：产品装配里会话持有租户没有写入方 ⇒ 解析一律失败 ⇒ 兼容件全部「起不来」、含要转的块的消息被否决，兼容件另受阻于宿主机允许（execution-environments G-3）。函数层的行为没有契约条款（RUN-N7）。RUN-N3、RUN-N4 已随 D-060 §八 M38、M39 闭合。
  2026-09-25 修订波（公开面）：处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——回放的行为模型 `Runner.tla` 已触发、尚未建（契约 G-14），没有登记的 formal task 可绑；规范场景 S-36～S-49、S-51、S-52 没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 一个插件两个服务面、实现怎样登记与撤下、一次经过怎样求值与落结论、共同存储对象、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
