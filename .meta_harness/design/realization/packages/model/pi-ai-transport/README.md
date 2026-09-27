# pi-ai-transport

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；是 `omne-harness-lite-design-2026-09-15 · capability.model-request-runtime · v2`（[契约](../../../../spec/capabilities/model-request-runtime/v2/contract.md)，状态 `accepted`、已冻结）里**传输适配那一层**的提供者——契约只在 [S-38](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 写它须兑现的十一条、实现归提供者设计（契约 S-2 第 11 行）。本节点承接 [model-request-runtime 节点](../model-request-runtime/design.md#实施缺口与消费者影响)的缺口 MRR-N4（那一格仍开着：尚未建包、比较门未过）
- 源码位置：`packages/model/pi-ai-transport`——尚未建包。第二层 `model` 由 D-059 拍板；与节点路径逐字相同
- 公开面：**公开函数面**是 `planRequest`（纯：出网前定下线上请求与改值、丢项）、`sendRequest`（发一次，不重试、不回退、不跟随重定向）、`readStream`（把上游的流译成 `data.arrival-events` 的增量，并交回收尾事实）、`createPiAiTransport`（把三者组成一个传输适配）与候选状态码表 `openRouterStatusCauseTable`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面**是插件 `pi-ai-transport` 登记的服务 `modelTransport`（候选），model-request-runtime 的 P-2 必需 inject 它，验收装配以脚本化传输登记同一个键即可替换（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：
  - **fork 的方向与基线**：[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md)（定向 fork pi-ai 作 OpenRouter 传输，只接受方向）；[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-5 与 [D-019 追加 2026-09-25](../../../../record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-25.md)（基线 pi 0.86.1、提交 `3390bd9`；作为本 monorepo 一个包、许可随包记；**只取传输一层**）；比较门现状见 [D-019 追加 2026-09-23](../../../../record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-23.md)
  - **流片段语法**：[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md)（pi 只在传输适配处被翻译进来；保留前提 1「fork 禁止中间解析」、前提 2「custom grammar 分支」）
  - **Cordis 采用版本** 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）
  - **最小的边界**：本节点只兑现契约留给传输适配的那几条，**不扩展任何契约**；锚点、结算、成因分类、凭据取用、时限计时都仍在 P-2（[model-request-runtime 节点](../model-request-runtime/README.md)）。它不取代任何替身：**脚本化传输仍是验收装配的另一件**，与本插件登记同一个服务键

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现契约 S-38 传输适配十一条（逐条落点见 [design 的投影表](design.md#契约责任到兑现点)），以及生产者一侧的 `data.arrival-events` S-7～S-9、S-11、S-13、S-15、S-20，`data.model-profile` S-17、S-21 的改值与丢项，`data.content-blocks` S-9 `opaque` 的写读与 S-14 `CallId` 的登记，`data.messages` S-35 我们自己那两种消息的线上落点。**尚未建包，没有任何实现。**可实施性的阻断：D-019 比较门一项都没有在真实 OpenRouter 上过（[PAT-N2](design.md#实施缺口与消费者影响)）；状态码表的行、费用单位、用量换算都是待核对主张（PAT-N3、N5、N6）；工具条目来源和 P-2 对排队中止／无码带内错误的分类已由 MRR v2 闭合（PAT-N14、PAT-N18）；真实注册表、调用方与本包的实现和验证仍未完成。原先登的两处契约对不上（PAT-N4、N9）已由契约闭合（D-060 §八 N-40 ④、N-41）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **0 条**——没有任何已登记的形式任务或测试以本节点的代码为对象；十一条的证据形式是本包的符合性测试（脚本化的本机 HTTP 端），见 [verification](verification.md#证据义务)
- 实际验证：**尚无**（源码不存在；本节点不复用 minimal-runtime 或 2026-09-16 那次真实短请求作证据——前者未进 main，后者只覆盖一条路由且早于本基线）

## 2026-09-27 v3 候选增量的分层状态

以下接续本轮模型请求纵线；上面的 v2 接受事实和 [design.md](design.md) 保持原范围。新稿见 [v3-design.md](v3-design.md)，目标源码路径仍为 `packages/model/pi-ai-transport`，尚未建包。

- **语义接受：无。** 消费 `capability.model-request-runtime/v3`、`data.model-profile/v3`、`data.messages/v4`、`data.model-response/v4` candidate；既有 D-062 不接受此增量。runtime v3 的 catalog 登记、整批评审与采用由主线完成。
- **可实施：候选路径已起草，生产实施仍有门。** 共享 plan/send/read、八家家族规则、37 个精确模型窄定义；稳定 `modelTransport` 内管理版本，可信模型插件登记贡献，直接函数消费者也持引用。旧 `routeWireHints`/默认 TTL 由完整 binding 的配置接替。缺口 PAT-V3-1～8 及受阻消费者见 [验证入口](verification.md#v3-候选增量验证)；D-019 比较门不豁免。
- **绑定证据：0 条。** 有限模型、Cordis 原型与研究缓存探针不以本节点生产实现为对象，不填进 `bindings.yaml` 冒充兑现。
- **实际验证：生产实现尚无。** 候选依据已有 [有限生命周期模型、原型反例及修正](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md)及 [37 个模型研究暖读](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-evidence-summary.json)，仅覆盖其标明范围；完整生产路径的逐模型 official 认证尚未开始。

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 精确版本、家族/窄模型适配、动态引用、缓存与有界诊断怎样接续 | [v3 候选设计](v3-design.md)、[逐项验收继承](verification.md#v3-候选增量验证) |
| 从 pi 取了哪些文件、不取哪些、改了什么、许可与上游追踪 | [fork 边界](design.md#fork-边界) |
| 公开函数面与 `modelTransport` 服务面各给什么、函数层不承诺什么 | [公开面](design.md#公开面) |
| 契约十一条各落在哪、上游的流怎样译成到达事件 | [投影表](design.md#契约责任到兑现点)、[流片段翻译](design.md#上游的流怎样译成到达事件) |
| OpenRouter 的费用与用量落到哪、拿不到时写什么 | [费用与用量的落点](design.md#费用与用量的落点) |
| 状态码与八个上交成因 | [状态码与成因](design.md#状态码与八个上交成因) |
| 哪些是策略配置项、初值多少 | [策略配置项](design.md#策略配置项) |
| 装卸、在途请求归谁 | [成对的装载与撤除](design.md#成对的装载与撤除) |
| 哪条承诺有什么证据、还缺什么 | [绑定表](bindings.yaml)、[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-09-27 最终技术采用

[D-076](../../../../record/decisions/model-runtime-delivery-adoption/decision.md)接受对应精确规格与本节点投影。旧候选读数和验证历史保留。此事件不代替源码、真实故障/停止或37模型生产认证；新增实际绑定另附运行证据。
