# pi-ai-transport

当前计量映射：[v10-token-estimate-design.md](v10-token-estimate-design.md)，MP6/RT8计量政策；已由[D-101](../../../../record/decisions/model-token-estimate-adoption/decision.md)技术采用；新增绑定0，真实发送尚未验收。下列接受/候选段分别按所述版本读取。

2026-09-28：[D-100](../../../../record/decisions/model-runtime-current-generation-adoption/decision.md) 采用 [v9-current-design.md](v9-current-design.md) 的当前迁移范围；绑定不新增，实际组合验证待实施。

## v8 统一公开面与破坏性迁移候选（2026-09-28）

按用户“不需要兼容任何旧版”的最新要求，[v8 增量](v8-input-limits-design.md)撤销下面 v7 的过渡子入口与旧执行保留方案：当前根、插件、八家定义、runtime 消费和 demo 一起迁到 MP4/RT6；不保留旧 Pro 特例，不为历史兼容保留旧 schema/codec。用户数据不删除，不兼容输入明确失败。缺可靠计量时新版请求发前拒绝，不能通过旧执行旁路保持成功发送。

本后继**语义接受尚无、可实施路径候选、新增绑定 0、实现验证尚无**；精确采用由主线负责。纯完整声明可独立交付，成功发送仍受 IL-G2 等约束；验收见 [v8 验证](verification.md#v8-统一公开面破坏性迁移验证)。下方 v7 段是旧修订记录，不能继续用其过渡方案指导当前实施；冻结 v7 文件保持原字节。

## v7 输入声明与最终计量候选（2026-09-28）

[v7-input-limits-design](v7-input-limits-design.md)接续 D-082 完整定义与 D-095 来源/头交接。**语义接受：无**，消费 MP4/RT6 candidate；**可实施：候选投影已起草，待独立评审及采用**；**新增绑定：0**；**新增实现验证：尚无**。它明确八家共同的六项 capabilities、纯读取/建档/全值等价与迁移，并把声明发布与实际输入计量、缓存/模态认证分开。

rev 2 明确分段：先提供纯 `./definitions/v4` 的 MP4 读取/Schema/建档及八家完整数据，既有根与插件执行明确消费 core `/v3`；新六项原值不能进入旧 register/plan，只有旧贡献的宿主不能取得新 binding，不提供剥字段桥接。core 根供给 MP4，不增 `/v4` 别名。RT6 与计量就绪后才显式切根代际；当前 demo 的 MP3 Pro 不冒充 MP4。该新增选择待独立定点复核。

计量依据 IL-G2 只阻塞不能证明限额合规的新版发送，不阻塞合法完整声明收齐；unknown 上游事实须有显式有限项目 cap。精确范围、计量前提及归装配事项见该稿；IL-V1～9 和 IL-G1～4 见[验证入口](verification.md#v7-完整输入限制候选验证)。已有接受与运行证据继续保持各自原范围。

## D-091 结构切片实际实施签收（2026-09-27）

源码 `300309fd` 已并入 HUB `2fd302ce`，实际成功 R 只含 stop/stopped，Node 响应与请求留在私有 WeakMap；实际 stop/stopped 均返回/兑现 undefined，同 plan 单 reader 保留。主调度据 D-091 限定采用签收该切片：[作者、独立 TLS、编译行为负控和原始证据](../../../../record/evidence/2026-09-27-tests-model-transport-opaque-response/README.md)。HUB transport178/runtime147、build/typecheck/格式/规则通过，独立切片 Pass，294 归档成员逐项核对。

本段替代下方起草时“源码与真实 JS 尚未完成”的结构切片口径，保留旧事件。成功 rawHeaders 仍不公开；G6/S-20 完整政策、PH-G1/G2、完整 PH-V9、H 的真实交接及37认证保持未完成，新增绑定0。

## RT5 同次响应头增补候选（2026-09-27）

后续 [D-091](../../../../record/decisions/model-transport-response-resource-adoption/decision.md) **部分技术采用** rev2 的真实不透明 R、私有 Node 资源、单 reader 和 `stop()` 实际不泄漏请求对象的结构，独立架构复评 PH-AR1 在设计层无阻断。原候选标签记录起草时状态；PH-G2 完整 S-20 政策取值／匹配仍未采用，公开 `rawHeaders` 的生产出值不可据此施工，源码与 PH-V9 真实 JS 验证均未完成。

- **语义接受**：[D-090](../../../../record/decisions/model-headers-v5-adoption/decision.md) 已接受 `capability.model-request-runtime/v5` 与 `data.model-response/v5`；本节点 [v5-headers-design rev2](v5-headers-design.md) 仍为候选，尚未采用，不自动升级既有 D-076／D-082 消费。
- **可实施范围**：候选明确 response 回调先保留、同次 `SendResult.rawHeaders` 唯一交出、错误体／取消分支保全及既有资源 owner；不新增 Cordis 服务或 fiber。rev2 针对独立评审 PH-AR1，将公开 R 改为实际仅 stop/stopped 的句柄，原始 stream／request 留在包内私有 owner，stop 不返回 request；修稿待复评。runtime 公共类型迁移与完整 S-20 政策接线 PH-G1／PH-G2 尚缺，依赖部分不可径直施工。当前源码 revision7 已存在，尚无本增量实现。
- **绑定证据**：本增量新增 **0 条**，既有绑定不换版本标签；[PH-V／PH-J 验证义务和覆盖缺口](verification.md#v5-响应头证据义务) 区分 transport、invoke 与完整日志写方责任。
- **实际验证**：本增量尚无产品运行；本次仅设计结构检查，结果见验证入口。旧 `StreamEnd.headers` 设计及当前 `RawResponse.headers`／`TransportFailure.headers` 不能作 RT5 双源消费依据；取代范围在增补正文中明确。RT5-H5、codec 历史格式、全部写方、真实停止和 37 模型认证仍各归原 owner。

## revision7 公共完整定义增量签收（2026-09-27）

D082的公共实现已由09417eaf合入HUB976534bf，implementation revision7；旧默认37五字段贡献和两pilot删除，供给必须显式完整定义。只读完整声明、逐route配置Schema／解释器、精确参数规则、全值身份固定和lease已实施。[当前实际签收](../../../../record/evidence/2026-09-27-tests-model-request-runtime-definitions/README.md)保全HUB175／6、两个独立仓库外制品各50次HTTPS、12双语README块、真r6 A与完整B排空、8行为负控及全部失败；新增有限绑定沿本轮范围，不作为正式37定义、P2整阶段或生产认证。

ND-G1～3及G22保持：37完整能力／配置、跨项约束、实际模态、TTL到期、目录采用／耐久服务未闭合，official认证0／37。下方“未施工／默认pilot／旧37贡献”的段落是其各自历史checkpoint，不是当前供给状态。根及四纯面不建资源；显式空factory可建自有Agent且必须close，不混称纯面。

## revision6 有限实施验收（2026-09-27）

主线技术签收已合入 HUB `a6285a7f` 的关闭准入、诊断故障隔离、递归脱敏／键碰撞、extra 原项名和全未知 Usage 来源修复；D-076 的精确传输义务不变。[本次实际证据](../../../../record/evidence/2026-09-27-tests-model-request-runtime-boundaries/README.md)保全所有失败、262／6 项集成、两个独立仓库外副本各 23 场景、共 84 次本机 TLS 和七类预期失败负控。新增六条有限绑定，均带前提；不是全传输门或耐久 runtime 服务验收。

HUB 共享实现 revision6、定义 revision1，仍是旧五字段 37 窄定义及两 pilot 默认。D-082 完整定义迁移正在独立 spoke 施工，尚未合入；本 run 不成为新代际或实际 OpenRouter 认证。新增付费0，正式37生产认证仍0／37。

## 完整定义增量采用（2026-09-27）

[D-082](../../../../record/decisions/model-definition-projection-adoption/decision.md) 已采用 [v4-definition-design](v4-definition-design.md) 精确增量：core 能力复用、逐 route 参数／缓存声明与 Schema／解释器同源、四个纯公开面、完整 definitions 及旧集合／默认的迁移。该页历史 candidate 字样保留，实际采用依本决定；旧 v3 字节不变。

可实施公共增量尚未施工，新增绑定0、ND-V1～9未执行；只能先用完整具名非官方 fixtures，不能把37目标ID或旧五字段值当完整官方清单。ND-G1～3事实／配置／模态和G-22仍在，37生产认证0/37。下列实现与证据记录按其各自观察时点读取，不自动升级至新定义代际。

## 当前分层状态：P2 局部构件（2026-09-27）

- 语义接受仍为 D-076 精确 v3-design；本次仅沿已定规格实现，冻结设计未改。
- 已实施：共享公开传输、进程内 register/acquire/retire 与固定 lease、稳定 Cordis 服务和可信模型贡献插件；37 个显式身份/reminder/路由缓存窄定义已导出，当前 implementation revision 5、definition revision 1。默认静态集仍为两 pilot，完整逐模型参数/模态 offer 与配置 Schema 尚未交付。
- 绑定与证据：新增具体可失败的局部绑定，见 [bindings.yaml](bindings.yaml)。[本轮实际 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-p2/README.md)保存 transport 196 项、实际 Cordis/双 HTTPS 取消与回调排空、仓库外制品、双语示例和失败记录；不是完整 T/SC/G 或 P2 放行。
- 实际验证：HTTP 脱敏头与负 usage 关系、37 个离线规划、版本保留/超时/强制实际停止取得局部证据；目录 adopt、完整服务宿主替换、耐久收口、全部观测、TTL 到期和官方认证仍待，完整认证 0/37。本轮无付费请求；之前 r2 上游读数只属于 revision 2。

追加 [revision 4 符合性 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-conformance/README.md)：独立实际反例发现推理明细身份／未知元数据丢失和 provider 变更诊断名失配；沿既有 T-16／T-8 修复，公共 parser 换修订。最终 transport 209 项、runtime 6 项及两包双语 10 示例通过；仓库外实际制品根入口与 Cordis 消费通过。旧 revision 3 run 保留原字节与范围，不能用它认证 revision 4 的上游行为；新 run 无付费请求，不关闭完整 P2／T／SC／G 或带 Run 耐久结算缺口。

## P1 历史实施读数（2026-09-27）

- 语义接受：精确 runtime3 与本节点 [v3-design.md](v3-design.md)由 [D-076](../../../../record/decisions/model-runtime-delivery-adoption/decision.md)接受；冻结设计不变。
- 已实施：`packages/model/pi-ai-transport` 提供公开 plan/send/read/factory，保存 pi 0.86.1 精确来源、许可与修改说明；使用显式配置及凭据、一次 OpenRouter HTTPS 与严格无损 SSE。当前只有 OpenAI/Anthropic 各一个 pilot 定义，implementation revision 2、definition revision 1；其余 35 模型与动态贡献/引用租约、Cordis 插件尚未交付。
- 绑定与证据：[bindings.yaml](bindings.yaml)新增五条有前提的 v3 传输局部测试绑定。[P1 实际证据](../../../../record/evidence/2026-09-27-tests-model-request-runtime-p1/README.md)记录 plan 12＋TLS HTTPS 27 项、仓库外制品及八次实际 OpenRouter 请求。不是完整 T/SC/G 门通过。
- 实际验证：r2 OpenAI/Anthropic 暖读分别报告 5837/9382 cache token，显式 TTL 来自本次 configuration values；TTL 到期未测，官方完整认证 0/37。

下面保留 v2 与 D-076 之前的历史观察；“尚未建包/无实现/0 条绑定”只指当时，当前状态以本节及验证入口 P1 节为准。

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；是 `omne-harness-lite-design-2026-09-15 · capability.model-request-runtime · v2`（[契约](../../../../spec/capabilities/model-request-runtime/v2/contract.md)，状态 `accepted`、已冻结）里**传输适配那一层**的提供者——契约只在 [S-38](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 写它须兑现的十一条、实现归提供者设计（契约 S-2 第 11 行）。本节点承接 [model-request-runtime 节点](../model-request-runtime/design.md#实施缺口与消费者影响)的缺口 MRR-N4（那一格仍开着：尚未建包、比较门未过）
- 源码位置：`packages/model/pi-ai-transport`——尚未建包。第二层 `model` 由 D-059 拍板；与节点路径逐字相同
- 公开面：**公开函数面**是 `planRequest`（纯：出网前定下线上请求与改值、丢项）、`sendRequest`（发一次，不重试、不回退、不跟随重定向）、`readStream`（把上游的流译成 `data.arrival-events` 的增量，并交回收尾事实）、`createPiAiTransport`（把三者组成一个传输适配）与候选状态码表 `openRouterStatusCauseTable`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面**是插件 `pi-ai-transport` 登记的服务 `modelTransport`（候选），model-request-runtime 的 P-2 必需 inject 它，验收装配以脚本化传输登记同一个键即可替换（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：
  - **fork 的方向与基线**：[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md)（定向 fork pi-ai 作 OpenRouter 传输，只接受方向）；[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-5 与 [D-019 追加 2026-09-25](../../../../record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-25.md)（基线 pi 0.86.1、提交 `3390bd9`；作为本 monorepo 一个包、许可随包记；**只取传输一层**）；比较门现状见 [D-019 追加 2026-09-23](../../../../record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-23.md)
  - **流片段语法**：[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md)（pi 只在传输适配处被翻译进来；保留前提 1「fork 禁止中间解析」、前提 2「custom grammar 分支」）
  - **Cordis 采用版本** 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）
  - **最小的边界**：本节点只兑现契约留给传输适配的那几条，**不扩展任何契约**；锚点、结算、成因分类、凭据取用、时限计时都仍在 P-2（[model-request-runtime 节点](../model-request-runtime/README.md)）。它不取代任何替身：**脚本化传输仍是验收装配的另一件**，与本插件登记同一个服务键

## v2 历史分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现契约 S-38 传输适配十一条（逐条落点见 [design 的投影表](design.md#契约责任到兑现点)），以及生产者一侧的 `data.arrival-events` S-7～S-9、S-11、S-13、S-15、S-20，`data.model-profile` S-17、S-21 的改值与丢项，`data.content-blocks` S-9 `opaque` 的写读与 S-14 `CallId` 的登记，`data.messages` S-35 我们自己那两种消息的线上落点。**尚未建包，没有任何实现。**可实施性的阻断：D-019 比较门一项都没有在真实 OpenRouter 上过（[PAT-N2](design.md#实施缺口与消费者影响)）；状态码表的行、费用单位、用量换算都是待核对主张（PAT-N3、N5、N6）；工具条目来源和 P-2 对排队中止／无码带内错误的分类已由 MRR v2 闭合（PAT-N14、PAT-N18）；真实注册表、调用方与本包的实现和验证仍未完成。原先登的两处契约对不上（PAT-N4、N9）已由契约闭合（D-060 §八 N-40 ④、N-41）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **0 条**——没有任何已登记的形式任务或测试以本节点的代码为对象；十一条的证据形式是本包的符合性测试（脚本化的本机 HTTP 端），见 [verification](verification.md#证据义务)
- 实际验证：**尚无**（源码不存在；本节点不复用 minimal-runtime 或 2026-09-16 那次真实短请求作证据——前者未进 main，后者只覆盖一条路由且早于本基线）

## 2026-09-27 v3 候选增量历史（D-076 之前）

以下接续本轮模型请求纵线；上面的 v2 接受事实和 [design.md](design.md) 保持原范围。新稿见 [v3-design.md](v3-design.md)，目标源码路径仍为 `packages/model/pi-ai-transport`，尚未建包。

- **语义接受：无。** 消费 `capability.model-request-runtime/v3`、`data.model-profile/v3`、`data.messages/v4`、`data.model-response/v4` candidate；既有 D-062 不接受此增量。runtime v3 的 catalog 登记、整批评审与采用由主线完成。
- **可实施：候选路径已起草，生产实施仍有门。** 共享 plan/send/read、八家家族规则、37 个精确模型窄定义；稳定 `modelTransport` 内管理版本，可信模型插件登记贡献，直接函数消费者也持引用。旧 `routeWireHints`/默认 TTL 由完整 binding 的配置接替。缺口 PAT-V3-1～8 及受阻消费者见 [验证入口](verification.md#v3-候选增量验证)；D-019 比较门不豁免。
- **绑定证据：0 条。** 有限模型、Cordis 原型与研究缓存探针不以本节点生产实现为对象，不填进 `bindings.yaml` 冒充兑现。
- **实际验证：生产实现尚无。** 候选依据已有 [有限生命周期模型、原型反例及修正](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md)及 [37 个模型研究暖读](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-evidence-summary.json)，仅覆盖其标明范围；完整生产路径的逐模型 official 认证尚未开始。

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| RT5 响应头何时捕获、怎样唯一交接，错误和取消后由谁保留 | [v5 头交接候选](v5-headers-design.md)、[增量验证与缺口](verification.md#v5-响应头证据义务) |
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

## RT5来源政策与头交接采用（2026-09-28）

[D-095](../../../../record/decisions/model-credential-path-adoption/decision.md)精确采用[v6-credential-path-design rev3](v6-credential-path-design.md)，消费已接受RT5/MR5并复用D093完整纯政策。文件v6不是RT6采用；实际实现/CP-V及PH-V/TLS收口尚待，新增bindings0。

2026-09-28：[D-098](../../../../record/decisions/model-input-limit-provider-adoption/decision.md)完成独立架构复评后的分段技术采用；精确范围见决定。MP4 已由 D-097 接受，其余消费者已由 D-099 接受；起草状态文字保留，实施和验证仍须单独交付。

## 2026-09-29 注册表诊断增补

[D076增补](../../../../record/decisions/model-runtime-delivery-adoption/decision.md#2026-09-29-注册表诊断源计数增补)技术采用 [v11 revision2](v11-registry-diagnostics-design.md)。语义沿RT9，公开record借用和实例inspect源计数已明确可施工；新增bindings0，实际实现/运行验收待完成。候选正文保留受审字节，接受范围以决定为准。
