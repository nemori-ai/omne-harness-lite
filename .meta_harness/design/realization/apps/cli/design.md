# cli 实现设计

本页回答**这个应用选了哪些提供者、动作链上的责任怎么交接、装卸怎么配对**。
它是 [assembly 节点](../../README.md#bindingsyaml)，**不持有任何能力语义**：
每条保证要么指向一份契约坐标，要么写「待立」；每条命令的含义指回
[PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md)。
应用的形状（进程、边、分层、技术栈、分发）在 [architecture.md](architecture.md)，本页不重复。

**贯穿全页的一个事实：源码不存在。**`apps/cli` 与 `packages/frontend/*` 尚未建包；
2026-09-25 起据点一侧多了三个领域（`model`、`tools`、`agent-loop`）与 `core` 纯模块的**候选**契约与 provider 节点（节点已起草并过五批独立评审 N1～N5、candidate、未评审，**包都尚未建**；`core` 的数据契约一契约一包，[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M41），
harness 其余能力族里，**会话日志、装配清单、会话持有租户、尝试与运行的事实、凭据保管方、执行环境、中心连接七处 2026-09-25 起有了窄口接口契约**（[D-043](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1，全部 candidate v1；真承接者未到，最小提供者节点已立（candidate、尚未建包）、本版只进验收装配）；agent loop 与 agent runtime、受理与队列、决策池——**契约尚未起草**。下面每一处「提供者」都是**设计名与责任声明**，
**不是已经存在的东西**——[不从文件名、接口形状或替身推断已兑现](../../AGENTS.md#红线)。

**本程新装的契约全部 `candidate`**（接受待 [D-041](../../../record/decisions/assets-runtimes-contract-acceptance/README.md)），下文引它们的条款写缩写：
TER＝`capability.tool-execution-runtime/v1`、REG＝`capability.asset-registry/v1`、BR＝`capability.mcp-bridge/v1`、TA＝`capability.tool-admission/v1`、
RUN＝`capability.loop-extension-runner/v1`、HI＝`capability.hooks-import/v1`、MPD＝`capability.model-profile-directory/v1`、MRR＝`capability.model-request-runtime/v1`、
MP＝`capability.modality-projection/v1`、SA＝`capability.stream-assembly/v1`；七份接口契约：SL＝`capability.session-log/v1`、AM＝`capability.assembly-manifest/v1`、ST＝`capability.session-tenancy/v1`、RAF＝`capability.run-attempt-facts/v1`、CC＝`capability.credential-custodian/v1`、EE＝`capability.execution-environments/v1`、CN＝`capability.center-connection/v1`。它们装在这里而不另立应用，是 [D-039](../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 的裁决：
两块运行时本质上是 CLI 这个应用里的东西，「可独立运行」是验收要求、不是装配边界。插件边界与服务键照抄三份被接受的拆分提案——
[tools 候选 C](../../../record/proposals/capability-split-tools/design.md#装配草图与为什么这样切)、[model A／A／A](../../../record/proposals/capability-split-model/design.md#装配草图与切分理由)、
[assets 候选 B](../../../record/proposals/capability-split-assets/alternatives.md)（据点只 import 纯模块）——**本页不重新设计**；本页已按各 provider 节点与修复波 3（D-040 §八 M31～M46）对齐，此后两边不一致仍以 provider 节点为准、回改本页。
服务键一律取各 provider 节点的**候选名**（`toolExecution`、`assetRegistry`、`mcpBridge`、`loopExtensionRunner`、`loopExtensionImplementations`、`converterRegistry`、`converterAssembly`、`modelCatalogRead`、`credentialLookup`、`modelRuntime`），**键名归各 provider 节点**；七份接口契约的服务键沿用（`sessionLog`、`assemblyManifest`、`sessionTenancy`、`runAttemptFacts`、`credentialCustodian`（M69）、`executionEnvironments`、`centerConnection`）——**接口已定、真承接者未到**；**`dependencyPresence` 不再是独立服务键**，它是 `assemblyManifest` 的一个查询（AM S-19，[D-040 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②）；仍无契约的 `evaluationInputs`、`toolAdmission` 也用那些节点给的候选名。

## 公开面

**本节点是装配，没有公开函数面**：它不导出任何能力，只把各 provider 的 Cordis 服务面装进一个据点进程（[SYS-OPEN](../../../foundation/cross-system-constraints/requirements.md#sys-open)：runtime 只是核心能力的一种消费者，这里就是那一种）。对本装配有后果的只有三条：

- **各 provider 的「只在运行时层成立」的不变量，由这里的服务面组合兑现**——执行宿主复用 `invokeTool`、P-2 复用 `invokeModel`、派发器复用 `runPass`；外面直接取用那些函数的人拿不到本装配给的「同一进程、同一 `storage`、同一 `clock`」。
- **[SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm) 在这里兑现，不在函数面**：`invokeModel` 发到调用方交来的传输指向的地方；本装配给 P-2 的传输是 `pi-ai-transport` 插件，它恒用构建内常量 `OPENROUTER_BASE_URL`、不收 base URL 配置（A-15）；验收装配的脚本化传输不出网。
- **验收装配可以直接跑函数面**：装配清单的读法未约定（AM G-4）时，派发器与 P-2 的服务面读不出链与时限，验收场景经 `runPass`、`invokeModel` 由测试直接交这些值——这是「有前提」的证据，不替代服务面的场景。

## 选择与动作链

| 消费的契约与版本                                                                                                                                                                                                                                                                                                                | 所选提供者及修订                                                                                              | 配置与作用域                                                                                                                                                                               | 动作链上的责任交接                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `composition.governance-center-entry/v1`（`accepted`，D-028）——据点 ↔ 治理中心这条边的线上投影：信封、四种入口答复、封闭路由表、公开体检、中心标识；对端 [`apps/tenancy-host`](../tenancy-host/design.md)，入口层由 [`packages/tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/design.md) 兑现 | 下面四行共用的**远端客户端代理提供者**；**尚不存在，本节点不设计它**                                          | 按那份契约与它的传输绑定 [`composition.governance-center-entry-https-json` v1](../../../spec/compositions/governance-center-entry-https-json/README.md)（`accepted`、已冻结，D-029）发请求 | 本侧只做契约留给客户端的那几件：传输层故障（超时、断连、解析不了）映射到「问不到」，不折成空结果（[S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) IV S-19 行）；确认不了连上的真是那个中心就不交出登录状态（契约 G-11 的客户端一半）；中心标识的比较与「另一个中心」的呈现归 PF-016；客户端信任中心证书的规则见[下节](#客户端信任中心的规则d-029)。**客户端代理尚不存在，这一行没有可登记的绑定** |
| `capability.account-identity/v2`（`accepted`，D-028；入口契约钉的版本）——登录状态的签发（出示物）、按出示物认人（S-44）、撤销与列出                                                                                                                                                                                             | **远端客户端代理提供者**，装在据点进程的装配根；**尚不存在，无修订**                                          | 据点进程根作用域一份；按「哪个治理中心」配置地址，**地址不是中心的身份**                                                                                                                   | 正常：客户端出示登录状态 → 据点进程校验 → 通过后才接受这条连接上的任何受理。失败：中心不可达时**明确失败并说清是问不到**，不拿副本放行。撤除：代理不可用时依赖方按契约失败，**不是静默降级**                                                                                                                                                                                                                                                                    |
| `capability.organization-governance/v1`（`accepted`）——组织、成员资格、角色、邀请与隶属、当前租户身份                                                                                                                                                                                                                           | 同上一个代理提供者族；**尚不存在**                                                                            | 同上                                                                                                                                                                                       | 正常：治理族的动作**直通中心**，据点一侧不重写语义、不补造请求身份。[三类必须现读](../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)（建新会话 · 改变中心事实的治理动作 · 切换当前租户身份）每次都问；其余读类用副本显示并标明是副本。失败：读不到即失败，**「问不到」不等于「无效」，也不等于「有效」**                                                                                                    |
| `composition.account-registration/v1`（`accepted`）——注册这条组合链                                                                                                                                                                                                                                                             | 同上；**尚不存在**                                                                                            | 同上                                                                                                                                                                                       | 本侧只发起与呈现结果，**组合的内部次序与重跑规则一概归契约**，据点一侧不在失败时自己补一步                                                                                                                                                                                                                                                                                                                                                                      |
| `data.identity-values/v1`、`data.offer-expiry/v1`（`accepted`）                                                                                                                                                                                                                                                                 | 随上面三份一起经协议取得                                                                                      | 同上                                                                                                                                                                                       | 值的形状与过期判定归契约；**跨这条边之后接收方要重新验证**，本侧不把「拿到了这个值」当成资格                                                                                                                                                                                                                                                                                                                                                                    |
| **待立：交付面呈现与受理契约**（拟议名）——下行只读投影、上行受理                                                                                                                                                                                                                                                                | `packages/frontend/facade` 提供服务面，两端传输由 `packages/frontend/transport-socket` 兑现；**全部尚不存在** | 据点进程一份服务实例；每条客户端连接一条独立订阅                                                                                                                                           | 正常：门面订阅据点一侧日志的新增并把只读投影发出去，受理经服务方法返回回执。失败：慢消费者超出有界队列即断，客户端按最后序号续读。**契约未立之前这一行没有任何可登记的绑定**                                                                                                                                                                                                                                                                                    |
| TER（candidate）——承载工具执行：提交一批、等前台、中断与转后台、送达、恢复扫描 | `packages/tools/tool-execution-runtime` 的执行宿主插件 `tool-execution-runtime`（服务 `toolExecution`；**一条 fiber、没有子 fiber**，D-040 §八 M44）；**尚未建包** | 据点根 Context 一份，**直接挂在根上、不在任何 agent runtime 的 fiber 之下**（TER S-46 第 1 行）；必需 inject 只有 `storage`、`clock`；注册表、放行核对面、会话日志追加（SL S-17）、会话持有租户（ST S-8）、执行环境（EE S-12）、尝试与运行的事实（RAF S-9）在调用时取用；具名参数 `executionStopGrace`、`deliveryRetryInterval` 值未定，判定时限 `judgeTimeoutMs` 由本装配的配置给初值 500 ms（执行宿主节点「判定时限是策略配置」；[归装配](#归装配的事项逐条承接) A-16） | 正常：agent loop 交来已放行的一批**连同这一次尝试的可用性报告**（`submit.report`，M33／M46；归装配 A-19）→ 起执行者 → 首胜写收场 → 送达；失败：放行核对不了整批不执行（TA S-34）；撤除：TER S-48（先 `abandon` 在途帧流、再首胜写 `failed{abnormal_interruption}`）——**本节点只在排空重启时撤它**（[关键选择 2](#关键选择)） |
| BR（candidate）——到 MCP 对端的桥：连接、列举与副本、投影、调用、OAuth 落点 | `packages/tools/mcp-bridge` 的两个插件：桥本体 `mcp-bridge`（服务 `mcpBridge`）与执行者贡献插件 `mcp-bridge-executor`（向 `toolExecution` 登记「MCP 来源」那一格，M44）；协议层是官方 SDK（D-037）；**尚未建包** | 根各一份；桥本体必需 inject `storage`、`clock`，贡献插件必需 inject `mcpBridge`、`toolExecution`；凭据保管方调用时取用（CC S-16、S-17；**接口已定、真承接者未到**；C-4～C-6 静态凭据、续期写回、出示名本版不收，CC G-2～G-4）；BR G-12 七个具名参数加节点的 `idleConnectionTimeout` 值未定 | 正常：注册表在尝试开始时经它刷新副本与投影，执行时工具执行运行时调它的 `invoke`；失败：连不上是「不可用」不是故障（BR S-10）；撤除：先给在途 `invoke` 交 `bridgeWithdrawn`、再收口连接（BR S-27）；**何时替换由本节点定：只在排空重启**（BR S-27 ⑥） |
| REG（candidate）——会话资产注册表：六张表的快照、可用性报告、斜杠命令集 | `packages/tools/asset-registry` 的注册表插件 `asset-registry`（服务 `assetRegistry`）；求值调 `packages/core/asset-evaluation` 纯模块；**尚未建包** | 根一份；必需 inject `assemblyManifest`（AM S-16、S-17；**接口已定、真承接者未到**，[缺口 C-2](#实施缺口与消费者影响)）、`clock`，**不 inject `storage`**；快照按（会话, 类别）键控、不持久；`EvaluationRef` 的权威在 AM S-8；求值输入读面 `evaluationInputs` 调用时取用——**求值输入（中心事实副本、工作区承载目录读入）的承接者缺**（REG S-31 第 3、6 行，[缺口 C-3](#实施缺口与消费者影响)），会话事实那一片是 ST S-8 | 正常：`fill`／`reload`／`refreshAvailability`；失败：输入读不到即 `unavailable`、不当空表（REG S-19）；撤除：快照随实例消失，按装配清单重建（REG S-33） |
| TA（candidate）——放行判断的接口 | **本程无提供者**（[D-040 §块 B](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-b-拆分提案报回的推荐-c按拥有者分领域) PB-1；契约 README「本程实现不交付」）；产品据点清单里这一关由派发器的全拒件顶上（RUN S-17）；[验收装配](#验收装配)另装一件只供验收的放行件 | — | 产品据点里每一批动作都被全拒、一个工具也执行不了——**已知后果，不是缺陷**（tools 提案交接缺口第 1 条的第二种收法）；验收放行件**不进产品清单**（[结构检查](verification.md#证据义务)） |
| RUN（candidate）——拓展点派发：逐件顺序求值、结论落日志、效果合成、回放 | `packages/agent-loop/loop-extension-runner` 的派发器插件 `loop-extension-runner`（服务 `loopExtensionRunner` 与实现登记面 `loopExtensionImplementations`）；**尚未建包** | 根一份；必需 inject 只有 `sessionLog`（SL v1；**接口已定、真承接者未到**，[缺口 C-1](#实施缺口与消费者影响)）；`assemblyManifest`（读链 AM S-16——**读法未约定，AM G-4**；判 `needs` 走它的 `dependencyPresence` 查询 AM S-19）、`modelRuntime` 的两道判定、`toolAdmission` 调用时取用（RUN S-32 第 11 行）；五件系统自带件的指定挂件按 RUN S-17 那张表由本装配预先声明 | 派发跑在调用方（agent runtime）的协程上；它拥有的事实全在日志里（RUN S-8），撤下不交接（RUN S-33）；实现在求值中途被撤下按报错记（RUN S-34）。调用方要交来的两样——同一份带 `attempt` 的报告（M33／M46）、叫停（M39，`cancelled`）——**归装配／待 loop 契约**（A-19、A-20，C-8）；执行环境句柄的两样来路（M38）调用时取用 `sessionTenancy`（ST S-8）、`executionEnvironments`（EE S-11，**先取租户再取执行环境引用**，N-37 ⑩）（A-21，C-13、C-7）；**锚是调用方随 `dispatch` 交来的不透明键**（RUN S-5，D-043 R-12），算法归 loop 那一程 |
| HI（candidate）——Claude Code／Codex hooks 的导入与兼容件 | `packages/agent-loop/hooks-import` 的兼容插件 `hooks-compat`（不 provide；导入是包导出的纯函数 `importHostHooks`）；D-033 fork 边界；**尚未建包** | 根一份；必需 inject `loopExtensionImplementations`，向派发器登记外部命令执行器；`executionEnvironments` 调用时取用——起、等、停子进程经 EE S-13～S-15、每次带租户（**接口已定、真承接者未到**，[缺口 C-7](#实施缺口与消费者影响)）；**本版 fail-closed**：拓展件子进程的宿主机允许产品没给（EE G-3，账本 ⑭），每一件兼容件都「起不来」；配置 `hookEnvAllowlist` 由本装配给（值未定，C-9）；运行被取消时的停止信号随派发器的叫停送到（HI S-26 第 2 行，来路 C-8） | 导入是纯翻译（HI S-11）；落成资产走中心的资产治理写面，据点到中心那条路待入口组合 v2（[缺口 C-4](#实施缺口与消费者影响)） |
| MPD（candidate）——**据点一侧只装读提供者 P-1r**；中心一侧的目录 P-1 由 [`apps/tenancy-host`](../tenancy-host/README.md) 装配（D-039） | `packages/model/model-profile-directory` 的 P-1r 插件 `model-catalog-read`，服务 `modelCatalogRead`、`credentialLookup`（候选名，`credentialLookup` 单列只放取值问法，M44）；**尚未建包** | 根**恰一份**；必需 inject `storage`（只读副本）与 `centerConnection`（CN v1 的观察面：三态可达性，**在场不随可达性变**，CN S-7；**向中心发请求**归入口 v2 的据点客户端，[缺口 C-4](#实施缺口与消费者影响)）；断线重连在实例内部处理、**不因中心不可达换代**；租户那一把模型凭据的副本**经凭据保管方落在据点**（加密、按登录状态归属），取值先读本地副本、中心可达时刷新——[D-040 §八 M47](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 改判了 M44 的「P-1r 不持久凭据」；保管方的据点一侧接口已定（CC S-12、S-13；**`readReplica` 只许 P-1r 调**，CC S-19 第 3 行），最小提供者节点 `credential-custodian-local` 已立、本版只进验收装配，产品装配里缺席、离线调模型如实失败（C-5）；**出厂格那一把在本装配里缺席**（[关键选择 4](#关键选择)） | 正常：读副本或现读中心；失败：读不到即 `unavailable`，不当「没配」「不存在」（MPD S-9）；撤除：不持有在途事实 |
| MRR（candidate）——选模型、每一次模型调用的发出与收场、停机对账 | `packages/model/model-request-runtime` 的 P-2（服务 `modelRuntime`）与同包第二个零依赖小插件 P-5 默认重试件；传输是同进程的另一个插件 `pi-ai-transport`（fork 节点 [`pi-ai-transport`](../../packages/model/pi-ai-transport/README.md)，[D-019](../../../record/decisions/model-provider-pi-ai-fork/decision.md)；基线 pi 0.86.1 `3390bd9`，[D-043](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-5；节点已立、尚未建包、比较门未过），登记服务 `modelTransport`、P-2 必需 inject 它；**尚未建包** | 根一份；P-2 必需 inject `modelCatalogRead`、`credentialLookup`、`sessionLog`、`storage`、`clock`（M44）与 `modelTransport`（MRR 节点关键差异之四），`assemblyManifest` 调用时取用、从它拿求值结果；`statusCauseTable` 初值用 `pi-ai-transport` 包导出的 `openRouterStatusCauseTable`；base URL 固定为 OpenRouter（[SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm)；`pi-ai-transport` 插件恒用它，A-15）；P-5（插件 `model-default-retry`）inject `loopExtensionImplementations` 向派发器登记；退避是策略对象 `retryPolicy`（`kind`／`base`／`factor`／`max`／`jitter`），本装配不给即取配置层的默认初值 `exponential, 1000 ms, ×2, ≤ 4000 ms, 无抖动`，次数由 MRR S-35 推出（[D-040 §八 N-36](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；MRR G-8 按它改写为「策略配置项与默认初值」并闭合） | 一次调用是宿主（agent runtime）上的一个 effect，追加口随调用由调用方交来、带尝试栅栏（MRR S-2、S-28）；撤除按 MRR S-36（在途流 `abandon`，收场 `interrupted{run_cancelled}`） |
| MP（candidate）——转换件登记表与落盘前的模态转换那一件 | `packages/model/modality-projection` 的三种插件：P-3 `modality-projection`（服务 `converterRegistry` 与受限面 `converterAssembly`）、声明者 `converter-declarer`、每件转换件一个 P-4\*——**声明者与 P-4\* 由本装配加载、inject `converterAssembly`，不是 P-3 的子 fiber**（M44）；**尚未建包** | 根各一份；P-3 不 inject 任何服务，向派发器登记系统自带转换件的是同包零状态贡献者插件 `modality-conversion-builtin`（inject `loopExtensionImplementations` 与 `converterRegistry`，M68）；**整份转换件声明是声明者插件的配置**，在本机 socket 开闸之前生效（MP S-9 第 2 条、S-17 ②）；P-4\* 够不着 `modelRuntime`（MP S-24，[结构检查](verification.md#证据义务)） | 模态转换那一件钉在 `before_persist_message` 链末（RUN S-6）；P-3 整件不在时只否决含转换件输入类块的消息（MP S-22）；撤除时在途转换按 MP S-28 收 |
| SA（candidate）与工具侧六份数据契约（`data.tool-definition/v1`、`data.loop-extension/v1`、`data.skill-package/v1`、`data.slash-command/v1`、`data.mcp-endpoint/v1`、`data.connector/v1`，均 candidate） | `packages/core/stream-assembly` 与 `packages/core/{tool-definition, loop-extension, skill-package, slash-command, mcp-endpoint, connector}` 纯模块（一契约一包，M41），**不是插件、不进装配清单**；另经 provider 包传递依赖 `packages/core/{content-blocks, messages, call-accounts, arrival-events}`、`packages/core/{model-profile, model-response}`、`packages/core/{asset-model, asset-evaluation}` | 包依赖：两个宿主（执行宿主、P-2）import `stream-assembly`；**交付面与受理面各 import `slash-command` 一次**，做斜杠命令的识别与解析（`data.slash-command/v1` S-12～S-16：两处拿到同一个会话斜杠命令集必得同一结果，以受理那一次为准） | 状态是宿主手里的值、随宿主存续（SA S-29 第 2 行）；纯函数没有撤除责任 |
| **七份窄口接口契约**（全部 candidate v1，[D-043](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）：SL（`sessionLog`）、AM（`assemblyManifest`，含 `dependencyPresence` 查询）、ST（`sessionTenancy`）、RAF（`runAttemptFacts`）、CC（`credentialCustodian`）、EE（`executionEnvironments`）、CN（`centerConnection`） | **最小提供者**（节点已立，candidate、尚未建包）：SL [`session-log-jsonl`](../../packages/session/session-log-jsonl/README.md)（本机 JSONL，属主文件锁）；AM [`assembly-manifest-store`](../../packages/assets/assembly-manifest-store/README.md)、ST [`session-tenancy-table`](../../packages/session/session-tenancy-table/README.md) 经 `core/storage` 落在据点那一份 `storage`；RAF [`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/README.md) 不另存表——两件事实从会话日志算，「已终结」要交进认法 `runEndRecognizer`，产品装配里不给、恒 `unavailable`（N-37 ④）；CC [`credential-custodian-local`](../../packages/infra/credential-custodian-local/README.md) 的副本条目与 OAuth 条目以密文落在**绑定所在的同一 `storage`**、本机只放 `keyFile`（N-37 ⑤）；EE [`execution-environments-host`](../../packages/infra/execution-environments-host/README.md) 本机 POSIX 进程组起停；CN [`center-connection-probe`](../../packages/infra/center-connection-probe/README.md)（产品装法 probe 按公开体检自己探，验收装法同包 `center-connection-replay` 按脚本回放）。**真承接者未到**：C-1、C-2、C-13、C-16、C-5、C-7、C-4 | **本版只进[验收装配](#验收装配)**（[关键选择 5](#关键选择)）；产品据点清单里这七处仍是方括号 | 各自的「装配给」按那份契约 S-19／S-21 等表的左列，由本装配给「同一进程、同一 `storage`、同一 `clock`」；**产品装配里** ST 与 RAF 没有写入方、AM 的在场事实没有来源——装上也只会让依赖方如实失败（ST G-2、RAF G-3、AM G-2） |
| **harness 其余能力族**——agent loop 与 agent runtime、受理与队列、决策池、控制受理、通知（会话日志与装配清单的窄口见上一行；它们的完整契约同属这一族） | **契约尚未起草，提供者尚未设计** | 据点进程根作用域 | **本节点不替它们定义任何语义**。门面与上面各行都是它们的消费者或被它们调用；[装配胶水不得暗中拥有未定义能力](../../AGENTS.md#红线)——它们的缺席怎样挡住上面各行，逐条在[缺口表](#实施缺口与消费者影响) |

**两份装配清单**（客户端 / 据点）是本应用自己的选择，清单本身随源码落地；另有据点清单的一个[只供测试的验收变体](#验收装配)。
**清单里每一项都要能指回上表的一行**，指不回去的说明它在偷偷拥有语义。

## 据点装载清单与顺序

一个根 `Context`，按下列顺序 `ctx.plugin(plugin, config)`（插件名是称呼，不是包的导出名）；方括号是**真承接者尚不存在**的位置——其中带「接口」的七处**接口契约已定**（candidate v1，D-043 R-1），它们的最小提供者本版只进[验收装配](#验收装配)（[关键选择 5](#关键选择)）：

```text
storage-sql → clock
  → [sessionLog：接口 SL] → [assemblyManifest：接口 AM，含 dependencyPresence 查询]
  → [evaluationInputs：中心事实副本与求值输入] → [credentialCustodian：接口 CC]
  → [附件字节存储] → [centerConnection：接口 CN] → [sessionTenancy：接口 ST]
  → [executionEnvironments：接口 EE] → [runAttemptFacts：接口 RAF]
  → 执行宿主 tool-execution-runtime（judgeTimeoutMs = 500，初值）→ 桥本体 mcp-bridge → 执行者贡献 mcp-bridge-executor
  → 派发器 loop-extension-runner → P-3 modality-projection → 声明者 converter-declarer → P-4* × k
  → P-5 model-default-retry（retryPolicy 缺席即取配置层默认初值，N-36）→ hooks-compat（hookEnvAllowlist）
  → 注册表 asset-registry
  → P-1r model-catalog-read → pi-ai-transport（modelTransport）→ P-2 model-request-runtime
  → [agent loop 与 agent runtime] → frontend 门面 → 本机 socket 监听（开闸，在 storage-sql 升级确认之后，A-28）
```

- **顺序 = 依赖序**，装载规矩照 [`apps/tenancy-host`「装载清单与顺序」](../tenancy-host/design.md#装载清单与顺序)同形：`ctx.plugin()` 返回后**同步**读 `fiber.state`，`PENDING` 即清单错误 ⇒ 逆序撤已装的 ⇒ 启动失败；不 `PENDING` 就 `await`，`FAILED` 同样全撤、退出非零——**不半开**（basis [`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)、[`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)）。
- **执行宿主挂在根上**：它与 agent runtime 是兄弟，不是子——回收一副 agent runtime 带不走任何执行（TER S-46 第 1 行；basis [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 只让 inject 下游重跑）。执行宿主自己没有子 fiber（M44），声明者与 P-4\* 也不是 P-3 的子——**本装配不依赖「子 fiber 随父卸载」**（待补 probe 的假设 H-1），只依赖「不是它的子」与 inject 下游重跑。
- **整份转换件声明在开闸之前生效**：声明者插件 `ACTIVE` 即声明已交给 P-3；socket 监听是清单最后一项、全部 fiber `ACTIVE` 才开，所以「第一份声明到位之前答不出」那一段里没有受理（MP S-9 第 2 条）。定时到点、连接件这类不经交付面的入站也在开闸之后才开始受理（受理那一程的提供者缺，本条是对它的要求）。
- **不用 `isolate`、不用 `intercept`**：租户、会话、范围之间差的是数据，不是实现（basis [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)；tools 提案「为什么这样切」第 6 条、model 提案 N-5、N-6）。
- **这份清单今天装不起来**：派发器与 P-2 必需 inject `sessionLog`、注册表必需 inject `assemblyManifest`、P-1r 必需 inject `centerConnection`，产品清单里都没有提供者 ⇒ `PENDING` ⇒ 清单错误；连带 inject 登记面的 P-3、P-5、hooks-compat 也起不来。**这是如实的缺口**：接口已定不等于真承接者到了；最小提供者与替身都只进[验收装配](#验收装配)（关键选择 5）。即使装上最小提供者，P-1r 向中心发请求仍要入口 v2（C-4）、调用方仍是缺席的 agent loop（C-8）。
- **运行期不换代**：本装配不配 loader／HMR，也不在运行中对任何插件调 `fiber.update`；换任何提供者都走[排空重启](architecture.md#分发与升级)（[关键选择 2](#关键选择)）。
- **撤除次序由本应用显式驱动，不依赖内核的逆序**（D-040 §八 M48）：排空重启与正常停机时，在对根 Context 撤除之前，本应用按 **P-2 → 执行宿主 → 桥本体 → hooks-compat → 派发器** 依次撤除各自那条 fiber，每一步 `await` 到它结算完才撤下一步；验收装配在同一驱动里接着撤两个最小提供者：**执行环境**（在兼容件与执行宿主之后——它们撤除时要经它停下起过的组）→ **凭据保管方**（在桥之后、先于 `storage`、`clock`——它的在途清扫事务先收完）（A-32）；`storage`、`clock` 与其余插件随根撤除最后走。兼容件排在派发器之前：它 inject 派发器的登记面，派发器先撤就会把它当 inject 下游卸载，那一路本应用 `await` 不到（C-11 同类）。中心连接的最小提供者不入列：P-1r 必需 inject 它，它随根撤时 P-1r 随之卸载，撤除之后才到的结果丢弃（CN S-11）。**三个最小提供者的次序都不承担正确性**：未按此序时，保管方的在途事务以 `StorageUnavailable` 收成 `custodianWithdrawn`，兼容件的停组得 `environmentsWithdrawn`、按「未确认」交回而执行环境自己的撤除已停组（两节点各自的失败映射）；显式驱动只让验收里的撤除收场确定、可断言。理由：同一 fiber 的各 effect 撤除并发驱动（basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），inject 下游与提供者的撤除谁先结算 basis 没有保证——若 `storage` 先关，执行宿主 S-48 的收场写就落空，只能等下一任扫描（执行宿主节点「归装配」点名的撤除次序）。**这一驱动本身依赖一条待补 probe 的假设**：`await` 一条 fiber 的撤除，会等到它的 async disposer 结算完（登 [C-11](#实施缺口与消费者影响)，与执行宿主节点的 A-1 同类）；不成立时正确性仍由下一任恢复扫描兜住，但排空演练（verification 据点义务第 5 条）的预期不成立。进程被杀时一个撤除都不跑，收口全在下一次启动。

### 升级确认在第一次受理之前

据点带迁移，`storage-sql` 的 config 必须显式给 `upgrade`（该节点[方言配置形状](../../packages/infra/storage-sql/design.md#方言配置形状)：带 `migrations` 而缺 `upgrade` 即启动失败）。本装配给 `{ checks, guard }`：`guard = createUpgradeGuard()`；`checks` 放 `clockPreflight()`（[`infra/clock`](../../packages/infra/clock/design.md#迁移前的只读回拨核对) 导出）与一条数据格式核对——判据同 [tenancy-host 那一条](../tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)（库里的迁移名序列须是本装配合成序列的前缀），函数由本节点自带、不跨应用 import。编排照 tenancy-host 同形：

1. 全部 fiber `ACTIVE` 之后调 `guard.confirm()`，断言 `snapshotTaken ⇒ snapshotRemoved`；确认抛出或断言不成立 ⇒ 不开闸、逆序全撤（撤除时恢复快照）、启动失败；
2. **确认之后才开闸**（A-28）——**升级确认在第一次受理之前**：确认之前没有一次入站被受理，也就没有一条依它写下的事实；
3. 任一次逆序撤完之后调 `guard.pending()`，`pending { location }` ⇒ 启动失败的报告里写明「升级未确认：恢复失败，快照在 X」。

**为什么是这一时点**：确认之前的任何失败或撤除都恢复快照（storage-sql [R-U4](../../packages/infra/storage-sql/design.md#属主实例排他迁移前只读核对升级快照与确认)），那一段写下的 SQL 行全部撤回；确认之后不再恢复。这一句是**三个 SQL 侧最小提供者的共同前提**——会话持有租户「答出之后不变」（ST S-6）、装配清单「提交即持久」与「历史可读、本版不删」（AM S-13、S-24）只在「提交落在确认之后」时成立——也是 A-28（日志不回退、SQL 回退时两侧对不上）的前提。**产品装配与验收装配同一时点**：验收装配走同一个 `boot()`，`boot()` 返回之前已确认，场景测试的第一次调用在确认之后；「杀子进程、重开同一库文件」一类场景看到的是已确认的库，不会被遗留快照撤回。装配忘了确认的后果（快照一直在，下一次撤除恢复它）由结构检查 `assembly.upgrade-confirmed` 挡（[verification](verification.md#证据义务)）。

### 验收装配

「可独立运行」是 [D-039](../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 与 [D-040 §块 B PB-3](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-b-拆分提案报回的推荐-c按拥有者分领域) 定下的**验收要求**：工具执行运行时与模型请求运行时各自能在不起客户端进程、不连治理中心的情况下跑通。
它由据点清单的一个**只在 `apps/cli` 测试代码里存在**的变体体现——同一个 `boot`、同一个顺序、同一个升级确认时点（[上文](#升级确认在第一次受理之前)），方括号的位置换成**七份接口契约的最小提供者**与五件替身（含一件放行件）。**它不是第三个应用，也不是产品装配**。

**最小提供者（接口契约 X）**——兑现那份契约的全部条款，不是替身；节点已立（candidate、尚未建包），每一行链到它的节点：

| 最小提供者（接口契约） | 顶的是谁 | 落在哪、怎样兑现 | 产品装配里的它 | 真承接者 |
|---|---|---|---|---|
| 会话日志（[`capability.session-log` v1](../../../spec/capabilities/session-log/v1/contract.md)）——[`session-log-jsonl`](../../packages/session/session-log-jsonl/README.md) | `sessionLog`：派发器的结论与提醒、P-2 的锚点与结算、执行宿主排空器的消息与条目 | **真实 JSONL 文件**（D-026 不提供 in-memory；[D-035](../../../record/decisions/message-and-stream-baseline/decision.md)「两条链各自能从脚本化输入跑到真实 JSONL 日志」）；判定态由盘上内容折叠、每本日志一条队列、每批 `datasync`、属主文件锁（SL S-8、S-10、S-13、S-14）——即要求 L-a～L-f；不 inject；日志根目录 `dir` 由本装配给、只装一份在根上（A-25） | 本版不装（关键选择 5） | loop 与会话那一程（C-1） |
| 装配清单（[`capability.assembly-manifest` v1](../../../spec/capabilities/assembly-manifest/v1/contract.md)）——[`assembly-manifest-store`](../../packages/assets/assembly-manifest-store/README.md) | `assemblyManifest`：注册表的换表记录（R-M1～R-M9）、派发器读链与 `dependencyPresence`、P-2 读求值结果 | inject `storage`，两张表落在据点那一份 `storage`（迁移片段只在验收装配合成，A-26）；测试预先追加记录；**在场事实经配置 `presenceSource` 交进**（只有验收装配给，A-27；缺席即 `dependencyPresence` 整次 `unavailable`）；**记录内容里怎样取链、层锁、时限未约定**（AM G-4）——派发器与 P-2 的服务面读不出，场景经它们的公开函数面由测试直接交这些值 | 本版不装；装上也答不出在场事实（AM G-2） | PF-004 那一程（C-2） |
| 会话持有租户（[`capability.session-tenancy` v1](../../../spec/capabilities/session-tenancy/v1/contract.md)）——[`session-tenancy-table`](../../packages/session/session-tenancy-table/README.md) | `sessionTenancy`：执行宿主 `submit`（TER G-12）、派发器解析执行环境句柄（RUN S-50）、P-2 的发起租户、注册表的会话事实——同一读面（M48） | inject `storage`，落在同一 `storage`（迁移片段只在验收装配合成）；**经本包 `./seed` 代写**（`seedHoldingTenant`；契约 G-2：没有写面；只许 `apps/cli` 的测试代码 import，A-27） | 本版不装；装上每次读都是 `sessionNotFound` | 会话那一程 PF-015（C-13） |
| 尝试与运行的事实（[`capability.run-attempt-facts` v1](../../../spec/capabilities/run-attempt-facts/v1/contract.md)）——[`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/README.md) | `runAttemptFacts`：执行宿主落账时算 `late`（TER S-13、G-18） | **不另存表**，inject `sessionLog`：「已被取代」从会话日志条目壳算出；「已终结」由**代 loop 写终结的测试驱动交进认法 `runEndRecognizer`，答案仍从日志算**（N-37 ④；A-27） | 本版不装；装上不给认法，「已终结」恒 `unavailable`（RAF G-3） | 会话日志与 loop 那一程（C-16） |
| 凭据保管方（[`capability.credential-custodian` v1](../../../spec/capabilities/credential-custodian/v1/contract.md)）——[`credential-custodian-local`](../../packages/infra/credential-custodian-local/README.md) | `credentialCustodian`：P-1r 的模型凭据副本（`storeReplica`／`readReplica`）、桥的 OAuth 条目（`depositOAuth`／`resolve`） | inject `storage`、`clock`；**两张密文表**（副本、OAuth 条目）落在绑定所在的同一 `storage`、本机只放 `keyFile`（[D-040 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤）——与桥的 `mcp_oauth_binding` 同一约束域（S-h），迁移片段排在桥之后（A-29）；`keyFile` 缺席时启动生成（排他创建、`0600`）；种子经 `storeReplica` 以一个测试登录状态写副本；`sweepInterval` 与 `oauthPendingTtl` 从与桥同一个配置源给（后者两边必须相等，A-30）；值不进任何输出（与产品同一条哨兵检查） | 本版不装 | `infra/secrets` 那一程（C-5） |
| 执行环境（[`capability.execution-environments` v1](../../../spec/capabilities/execution-environments/v1/contract.md)）——[`execution-environments-host`](../../packages/infra/execution-environments-host/README.md) | `executionEnvironments`：执行宿主起执行者第 2 步（`placeExecution`）、派发器 `resolveSessionEnvironment`、兼容件起停子进程 | 不 inject；本机 POSIX 进程组起停，在 `stopReplyBound` 内答复；落点判断照 EE S-6——**执行环境权限值与拓展件子进程的宿主机允许由测试代码里的种子件给**（它提供可选读面 `executionPlacementReadings`，见替身表），引用跨租户即 `referenceNotValid` 是契约自己的判定；撤除排在兼容件与执行宿主之后（A-32） | 本版不装；装上而没有读数来源：工具一律 `unavailable`、兼容件一律 `noLanding{hostNotAllowed}`（EE G-2、G-3，fail-closed） | PF-005 那一程（C-7） |
| 中心连接（[`capability.center-connection` v1](../../../spec/capabilities/center-connection/v1/contract.md)）——[`center-connection-probe`](../../packages/infra/center-connection-probe/README.md) | `centerConnection`：P-1r 的必需 inject | 验收装法用同包插件 **`center-connection-replay`**（inject `clock`）按脚本回放对端行为（立即答／到时限仍无答复／立即断），**不连中心、不以换代表达断线**（CN S-7；verification 据点义务「切断到中心的连接」那一条要用） | 本版不装；产品装法是同包的 `center-connection-probe`（按公开体检自己探），信任方式归本节点、本版 CA 链加主机名（A-34，主线已裁）；产品清单里出现 replay 插件即结构检查失败（A-33） | 入口组合 v2 的据点客户端（C-4） |

**剩下的替身**（顶的是没有契约的位置；只回放消费契约允许的序列）：

| 替身 | 顶的是谁 | 只许做什么 | 真承接者与闭合条件 |
|---|---|---|---|
| 放行件（bypass：全放） | `toolAdmission`：放行判断 `omne-official:admission-judgment` 的 `admit` 与它的 `verifyToken`（派发器经它调，M44） | 对每一项给放行结论、铸与核同一实现里的凭据；**标明「非产品行为、只供本装配验收」**（D-040 PB-1） | 放行判断的提供者，本程不交付（子选择二到它的提供者设计时再定） |
| 求值输入 | `evaluationInputs`（求值输入里的持有、配值、成员资格与角色） | 从测试种子读，**不连治理中心** | [缺口 C-3](#实施缺口与消费者影响) |
| agent loop 驱动 | 调 `openCall`（P-2）、`dispatch`（派发器）、`submit`（执行宿主）的那一方 | 按脚本走一次尝试：对账 → 调模型 → 放行 → 执行 → 落盘；**把同一份带 `attempt` 的可用性报告交给 `openCall`（`report`）、`dispatch` 与 `submit`**，随 `dispatch` 交**锚键**（参数 `anchor`，一批动作时 `anchors`；RUN S-5、S-21，由测试给），能对在途的 `dispatch` 叫停（A-19、A-20） | PF-012 那一程（C-8） |
| 脚本化传输 | 服务 `modelTransport`（P-2 必需 inject 的传输） | **登记 `modelTransport` 的一件**（测试代码里的插件，与 `pi-ai-transport` 登记同一个键、验收装配里替它）：按脚本交 `plan` 的结果、到达事件、状态码与用量、收尾事实 | 不需要：产品装配装 [`pi-ai-transport`](../../packages/model/pi-ai-transport/README.md)（D-043 R-5） |
| 执行环境读数种子件 | 可选读面 `executionPlacementReadings`（无契约；形状是 [`execution-environments-host`](../../packages/infra/execution-environments-host/design.md#对落点读数来路的要求清单) 的 RD-1～RD-4） | 按测试种子答「这个租户下这个工具的权限与目标环境」与「拓展件子进程的宿主机允许」；不缓存、「没有值」与「读不到」分开 | PF-005 那一程与资产设置求值那一侧（EE G-2、G-3，C-7）；产品清单里出现即结构检查失败（A-27） |

- **替身里「看起来合理」的行为都是缺口，不是设计**：每个替身只回放它所顶的那份契约允许的序列；它们的存在不构成任何一行「装配给」的承接，**它们的行为不进任何 `bindings` 作证据**；真承接者一立起来，对应替身就删掉。最小提供者不同：它们兑现接口契约，**但只在测试种子上跑通的场景仍记「有前提」**（D-040 §八 N-35 ①），不计入实际验证完成数。
- **结构检查**：产品据点清单里不得出现上面任何一个替身，**本版也不出现七个最小提供者**（关键选择 5）；**最小提供者的配置不带测试项**（`presenceSource`、`runEndRecognizer`，以及 `./seed` 与 `executionPlacementReadings` 种子件——一条规则，A-27）；放行件与替身不在任何 `packages/*` 里（[verification](verification.md#证据义务)）。
- 本地工具与兼容件子进程落在宿主机上，是**执行环境最小提供者按测试种子给出的答复**，不是装配的前提：执行宿主与兼容层都「不降级、不回退宿主机」（TER S-38 第 2 步、HI S-18），没有那一项允许它们只会收成 `failed{environment_unavailable}` 与「起不来」。
- **替身五件**（2026-09-25：原十个里的七个由接口契约的最小提供者取代，D-043 R-1；最小提供者波又加一件执行环境读数种子件——它顶的是执行环境最小提供者要的、没有契约的读面，EE G-2、G-3）。独立评审给关键选择 1 的翻盘条件是「替身超过八个、或某个替身必须做契约未定义的判断」——前一半随之不再成立；后一半：最小提供者只做它那份契约定义的判断，**但**装配清单的最小提供者交回的记录内容，派发器与 P-2 要按一种未约定的读法取链与时限（AM G-4），验收里由测试经函数面直接交值、不经服务面读，所以**没有一个替身或最小提供者替契约做判断**。

## 契约到 Cordis 的投影（据点一侧）

本节只写**装配这一侧**的投影：谁装在哪、谁 inject 谁、换代时谁被重跑、事件能传到哪、两处存储怎样承接跨 owner 的同一提交、契约「装配给」表的每一行由谁给。
每个插件自己的装卸与在途处置归它的 provider 节点；两边对不上以 provider 节点为准。Cordis 采用版本 4.0.4（[D-025](../../../record/decisions/cordis-adoption-version/decision.md)），
上游语义只引 [basis](../../../basis/README.md) 条目；basis 没有的标**假设**并写出处。

### 插件、服务与 inject 边

| 插件（节点） | provide（候选名） | 必需 inject | 调用时取用（不 inject） | 向谁登记贡献（包进贡献者自己的 `ctx.effect`） |
|---|---|---|---|---|
| storage-sql（[`packages/infra/storage-sql`](../../packages/infra/storage-sql/README.md)） | `storage` | — | — | — |
| clock（[`packages/infra/clock`](../../packages/infra/clock/README.md)） | `clock` | `storage` | — | — |
| 执行宿主 `tool-execution-runtime`（`packages/tools/tool-execution-runtime`） | `toolExecution` | `storage`、`clock` | `assetRegistry`（`lookup`）、`toolAdmission`（`verifyToken`）、`sessionLog`（排空器的幂等追加）、`sessionTenancy`（`submit` 读会话持有的租户）、`executionEnvironments`（起执行者第 2 步）、`runAttemptFacts`（落账时算 `late`，M74） | —（卸载判定那一件本批不建，由指定挂件顶上） |
| 桥本体 `mcp-bridge`（`packages/tools/mcp-bridge`） | `mcpBridge` | `storage`、`clock` | `credentialCustodian`（`depositOAuth`／`resolve`，CC S-16、S-17） | — |
| 执行者贡献 `mcp-bridge-executor`（同上） | — | `mcpBridge`、`toolExecution` | — | 「MCP 来源」那一格执行者 → `toolExecution` |
| 派发器 `loop-extension-runner`（`packages/agent-loop/loop-extension-runner`） | `loopExtensionRunner`、`loopExtensionImplementations` | `sessionLog` | `assemblyManifest`（`readHead` 读链；`dependencyPresence` 查询判 `needs`，AM S-19）、`modelRuntime`（两道判定）、`toolAdmission`（`admit`）、`sessionTenancy` 与 `executionEnvironments`（只在解析执行环境句柄时；执行环境先经 `sessionTenancy` 取租户） | — |
| P-3 `modality-projection`（`packages/model/modality-projection`） | `converterRegistry`、`converterAssembly`（受限面） | — | — | — |
| `modality-conversion-builtin`（同包，零状态） | — | `loopExtensionImplementations`、`converterRegistry` | — | 模态转换那一件 → 派发器（M68） |
| 声明者 `converter-declarer`（同上） | — | `converterAssembly` | — | 整份转换件声明 → P-3 |
| P-4\* × k（同上，由本装配加载，不是 P-3 的子） | — | `converterAssembly` | — | 按转换件引用挂上实现 → P-3 |
| P-5 `model-default-retry`（`packages/model/model-request-runtime`） | — | `loopExtensionImplementations` | — | 默认重试件 → 派发器 |
| `hooks-compat`（`packages/agent-loop/hooks-import`） | — | `loopExtensionImplementations` | `executionEnvironments`（`startProcess`／`processOutcome`／`stopProcessGroup`，带租户） | 外部命令执行器 → 派发器 |
| 注册表 `asset-registry`（`packages/tools/asset-registry`） | `assetRegistry` | `assemblyManifest`、`clock` | `evaluationInputs`（其中「会话事实」那一片与 `sessionTenancy` 是同一读面，M48）、`mcpBridge`、`converterRegistry`（`lookupConverter`） | — |
| P-1r `model-catalog-read`（`packages/model/model-profile-directory`） | `modelCatalogRead`、`credentialLookup` | `storage`、`centerConnection`（CN S-9） | `credentialCustodian`（`readReplica`／`storeReplica`，CC S-12、S-13；租户那一把的据点副本，M47） | — |
| `pi-ai-transport`（[`pi-ai-transport`](../../packages/model/pi-ai-transport/README.md)） | `modelTransport` | — | — | — |
| P-2 `model-request-runtime`（同 P-5 的包） | `modelRuntime` | `modelCatalogRead`、`credentialLookup`、`sessionLog`、`storage`、`clock`、`modelTransport` | `assemblyManifest`、`sessionTenancy`、`assetRegistry`（`openCall` 取工具条目的 `lookup`，MRR S-28 ①） | — |
| （仅验收）`session-log-jsonl` | `sessionLog` | — | — | — |
| （仅验收）`assembly-manifest-store` | `assemblyManifest` | `storage` | — | — |
| （仅验收）`session-tenancy-table` | `sessionTenancy` | `storage` | — | — |
| （仅验收）`run-attempt-facts-derived` | `runAttemptFacts` | **`sessionLog`** | — | — |
| （仅验收）`credential-custodian-local` | `credentialCustodian` | `storage`、`clock` | —（桥的绑定行经桥包子入口 `./tx-reads` 在自己的事务里读，不经服务面） | — |
| （仅验收）`execution-environments-host` | `executionEnvironments` | — | `executionPlacementReadings`（可选读面，每次 `resolveOptional` 现取；验收里由种子件提供） | — |
| （仅验收）`center-connection-replay`（`center-connection-probe` 包） | `centerConnection` | `clock` | — | — |

**依据**：以各 provider 节点 design.md 的「插件、服务键」一节为准（它们照 tools 提案[服务面与依赖边](../../../record/proposals/capability-split-tools/design.md#服务面与依赖边)与 model 提案 [inject 边](../../../record/proposals/capability-split-model/design.md#inject-边以及消费者能不能承受被卸载重跑)起草，与草图不同的几处——执行宿主无子 fiber、桥的独立执行者插件、P-2 inject 会话日志／存储／时钟、声明者插件与 P-4\* 由装配加载、`credentialLookup` 单列——已由主线接受，D-040 §八 M44）。
**目标服务从不 inject 贡献者**——写进 inject 就等于「没有它我不跑」，与「不可用即视作卸载」相反（basis [`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)）。
**七份接口契约的最小提供者**（上表末七行，只在验收装配；节点已立，candidate、尚未建包）各 provide 一个服务键，都不 inject 能力插件（执行宿主、桥、派发器、P-1r、P-2 这一类）；**RAF 是其中唯一 inject 另一个接口服务的**：它必需 inject `sessionLog`，因为折叠缓存只属于一代日志，日志换代它就重跑、缓存丢弃（[`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/design.md#关键选择) 关键选择三；换代表 `sessionLog` 那一行）。**`dependencyPresence` 不再单独 provide**：它是 `assemblyManifest` 上的一个查询（AM S-19，N-37 ②）。
**有意不设的边**：执行宿主不 inject 注册表、桥、会话日志、放行；P-2 不 inject 派发器、模态投影（纯函数）、凭据保管方（**传输改为必需 inject `modelTransport`**：换传输即 P-2 与 agent runtime 重跑，本装配运行期不换）；P-5 不 inject P-2；P-3 不 inject 声明者；P-4\* 与 `modelRuntime` 之间没有边（MP S-24）；注册表不 inject `storage`、不依赖执行者表。

### 提供者换代或缺席时谁被重跑

`inject` 的含义是「提供者换代或不可用，我就卸载重跑」（basis [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）。下表逐行对齐各契约的撤除／在途条款；**本装配的政策是运行期不换代**（[关键选择 2](#关键选择)），所以前六行在 v1 只在排空重启时发生。

| 换代或缺席的是 | 被卸载重跑的（inject 下游） | 收掉的在途事实 | 对齐的条款 |
|---|---|---|---|
| `storage` 或 `clock` | 几乎全部：clock、执行宿主 ⇒ 执行者贡献；桥本体 ⇒ 执行者贡献；注册表（`clock`）；P-1r、P-2 ⇒ 将来 inject `modelRuntime` 的每一副 agent runtime；验收装配另有 AM、ST（`storage`）、保管方（两者）、中心连接最小提供者（`clock`） | 执行宿主有序撤下：在途帧流 `abandon`、首胜写 `failed{abnormal_interruption}`，写不下的留给下一任恢复扫描；桥给在途 `invoke` 交 `bridgeWithdrawn`；P-2 结算每一次在途调用（下面第六行）；注册表的缓存丢弃、按装配清单重建；最小提供者按各自契约的撤除条款收（AM S-23、CC S-20、CN S-11） | TER S-46 第 8 行、S-48；BR S-27；MRR S-36；REG S-33 |
| `toolExecution` | 执行者贡献（只它） | 执行宿主自己的在途按 TER S-48；贡献插件重跑、重新登记「MCP 来源」那一格——**桥本体不重跑、连接不收口** | TER S-48；BR S-27 |
| `mcpBridge` | 执行者贡献 | 桥本体的在途按 BR S-27（`bridgeWithdrawn`）、连接按 S-26 收口；贡献插件随之重登记 | BR S-26、S-27 |
| `loopExtensionImplementations`（派发器换代） | `modality-conversion-builtin`（P-3、声明者、P-4\* 不再连带，M68）；P-5；hooks-compat | 派发器没有活状态（RUN S-8）；正在求值的那一件实现被撤下按**报错**记（RUN S-34）；在途转换交旧件的合法产出或 `converterFailed`，不得 `noConverter`（MP S-28）；hooks-compat 撤除时经执行环境停下它起过的子进程 | RUN S-33、S-34；MP S-28；HI S-27 |
| `converterAssembly`（P-3 换代） | 声明者（再交当前那一份）、P-4\*（重新挂上） | 同上一行的在途转换；声明者重跑时 **P-3 不重跑**，旧表生效到新表替上的那一刻 | MP S-9 第 3 条、S-27、S-28 |
| `modelCatalogRead`／`credentialLookup`／`sessionLog`／`modelTransport` | P-2 ⇒ 连带将来 inject `modelRuntime` 的每一副 agent runtime | 每次在途调用：对在途流 `abandon`，收场 `interrupted{run_cancelled}`，没有回复；账如实追补，不抹掉；日志已撤而写不进的结算不补写、由下一次对账追补 | MRR S-36、S-39 |
| `sessionLog`（缺席：产品清单本版没有它，SL 的真承接者未到；换代：只在验收装配、只在排空重启） | 派发器 ⇒ 它的全部贡献者；P-2；RAF 最小提供者（仅验收） | 缺席：派发器、P-2 与 RAF 停在 `PENDING`，没有一次经过会开始、也没有一次模型调用；执行宿主落账时现取 `runAttemptFacts` 取不到 ⇒ 按执行宿主节点失败映射「`runAttemptFacts` 读不到」那一行收（不给过渡值，M74）。换代：派发器与 P-2 按上面几行；RAF 的折叠缓存随旧实例丢弃、新实例从新一代日志重折，在途调用握着旧日志对象、答 `unavailable` | RUN S-33；MRR S-39；[`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/design.md#关键选择) 关键选择三 |
| 本地执行者撤下（贡献者撤登记） | —— | 在途执行照常跑完，撤下只影响之后的起执行者 | TER S-37 |
| 进程被杀（撤除一个都不跑） | —— | 权威收口在下一次启动：执行宿主恢复扫描（TER S-20）、调用对账由 loop 在新尝试开始时调（MRR S-33）、派发器回放（RUN S-28）、桥回收上次的 stdio 孤儿（BR S-28） | basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) |

**P-1r 为什么必须只有一个实例**：它一换代，P-2 与全部 agent runtime 连带重跑、每一次在途模型调用被放弃——中心不可达不能是换代的理由。断线、重连、读副本都在 P-1r 实例内部处理（P-1r 节点已接下：断线不以换代表达）；**`centerConnection` 的提供者同样不得以换代表达断线**——它是 P-1r 的必需 inject，一换代 P-1r 就连带那一整条链重跑。这条要求已由 CN S-7 写成契约承诺（在场不随可达性变），真承接者是入口 v2 的据点客户端（C-4）；本装配只保证不因连不上中心而撤它们。

### 事件与过滤

**据点上没有一条控制类事件**：放行、否决、重试、中断、换模型全走直接调用或日志里的结论（RUN S-31、MRR S-37、TER S-45、MP S-25、REG S-29、HI S-25）；叫停一次 `dispatch`（RUN S-21 ⑥ `cancelled`，M39）也是调用方随调用交来的通道、不是事件，交换格式归组合契约（A-20）；本装配也不开任何控制事件，**不用 `bail`**（basis [`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)）。

| 事件或推送 | 发出方与派发 | 携带 | 能不能越过租户或会话 | 本装配的约束 |
|---|---|---|---|---|
| `execution.delivered` | 执行宿主，`emit` 不带 `thisArg`，通知（TER S-45） | `tenant`、`session`、`callId`、段、收场——只有标识与收场，不带结果内容 | **能**：据点进程里不按租户或会话开 isolate，一个监听者听得到全部租户的送达。「不带 `thisArg` 的派发不过滤、`global` 监听者绕过过滤」是**假设**（手册最小内核模型据 4.0.2 源码，basis 无条目；tools 提案 H-7），本装配**按「全进程可见」处理，不靠过滤器**。这一读法已进契约：TER S-46 第 11 行「只在本进程内、不得跨进程广播，监听者按载荷自筛」（D-040 §八 M42） | 进程内监听者按载荷的 `tenant`、`session` 自己筛；本装配不把它转发出据点进程（跨进程要知道一次执行结束了，读会话日志）；门面向一条客户端连接转发任何东西之前，按**那条连接出示的登录状态**认出的账号、它的当前租户身份与它订阅的会话核对，不符不转（PF-016 §6.4）；监听者抛错会穿回发送方（basis [`emit-listener-throw-propagates`](../../../basis/cordis/emit-listener-throw-propagates.md)），包住发送是执行宿主节点的义务 |
| 观察者推送（模型回复、工具帧的快照与增量） | P-2、执行宿主经门面推，**不是 Cordis 事件** | 会话、目标 | 宿主按（会话，目标）路由、只推本会话的观察者（MRR S-51 第 1、9 条，TER S-62，SA S-29 第 3 行）；两个会话同一个 `CallId` 不串。P-2 的观察者端口随 `openCall` 由宿主交来；执行宿主那一侧按（租户，会话）订阅的推送面**契约没有**（TER 节点缺口 T-3，M43 留给下一程） | 门面登记观察者时核对连接身份对这个会话的归属，同上 |
| 会话日志的追加通知 | **本版没有**：SL S-20 不发事件 | —— | —— | P-2 本版**不消费**（正确性靠读时追到日志尾，MRR S-13、S-37）；门面要提前推进只能自己追读 |
| `profile.withdrawn`（MPD S-21）、资产治理的 `HoldingChanged`／`AssignmentChanged` | 中心一侧 | —— | **据点上没有这两条**：本应用不做中心到本机的推送（[非目标](architecture.md#交付面与非目标)）；P-1r 靠读看到撤回，注册表的 `onAssetChange` 由副本更新时直接调（REG S-31 第 4 行，承接者缺） | 正确性都不依赖它们（MPD S-21、REG S-28） |
| MCP 对端的 `tools/list_changed` | 对端 → 桥 | —— | 不是 Cordis 事件，只记一笔（BR S-25） | —— |

Cordis 内部事件（`internal/*`）本装配不监听、不改写。

### 存储：要求清单与跨 owner 的同一提交

**据点有两处持久存储**，都在本机、都只有据点进程一个写者：

- **SQL 存储**：[`packages/infra/storage-sql`](../../packages/infra/storage-sql/README.md) 的一份实例（sqlite 文件，[D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md)、[D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md) 持久性 `NORMAL`），据点根作用域**恰一份**；迁移照 tenancy-host 的做法由各 owner 导出片段、本节点合成（执行宿主、桥本体、clock、P-1r 的只读副本、P-2 的投影缓存；注册表不建表；验收装配另合成装配清单、会话持有租户与凭据保管方三个最小提供者的片段——**只在验收装配合成**，保管方的片段排在桥的片段之后、没装桥也合成桥的片段，A-26、A-29）。文件位置候选：操作系统用户的数据目录下，**未钉**。
- **会话日志**：D-026 定为文件系统 JSONL（「本地化持久化——会话日志一类」）；**窄口接口已定**（SL v1），最小提供者节点 `session-log-jsonl` 已立、本版只进验收装配（日志根目录 `dir` 由本装配给，A-25），真承接者未到（[缺口 C-1](#实施缺口与消费者影响)）。

**对存储提供者的要求清单**（SQL 一侧由 `core/storage` 协议与 `storage-sql` 兑现；日志一侧已由 SL v1 的条款接住，右列写对上的条款）：

| # | 要求 | 对应条款 | 由谁兑现 |
|---|---|---|---|
| S-a | 全部 SQL 写入者落在同一个 `storage` 实例上 | TER S-46 第 3 行；BR S-30 第 2、4 行 | 本节点（清单恰一份） |
| S-b | 同一行上的条件写（首胜） | TER S-16、S-46 第 3 行 | `core/storage` 写事务 ＋ 执行宿主节点 |
| S-c | 唯一约束：（会话, `CallId`）至多一条执行记录 | TER S-5 | 执行宿主节点的迁移片段 |
| S-d | 「列举开始时刻更晚才写」的条件写 | BR S-30 第 2 行、P-5 | 桥节点 |
| S-e | 多表原子写：执行记录与出站项（`tool_execution_outbox`，M44）在同一写事务 | TER S-46 第 4 行 | `core/storage` 写事务 ＋ 执行宿主节点 |
| S-h | 跨 owner 的引用约束：保管方的 OAuth 条目指向桥的 OAuth 绑定行、绑定行在被指着时不可删；保管方 `resolve` 在一次一致的读里读绑定行的 `state` 与 `credential_ref` 两列 | BR S-30 第 4 行（桥节点读作「两次提交、一个可见提交点」，M44）；CC S-16 ④、S-17 ④、S-19 第 2 行 | 桥节点 ＋ 保管方最小提供者——**引用约束跨不了存储实例**，所以条目以密文落在**绑定所在的同一 `storage`**、本机只放密钥（[D-040 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤）；最小提供者节点 [`credential-custodian-local`](../../packages/infra/credential-custodian-local/design.md#对存储提供者的要求清单) 已立（它的 K-3 引用约束、K-4 锁定读、K-5 一致快照读；桥经子入口 `./tx-reads` 给它读与锁绑定行），真承接者 `infra/secrets`（C-5） |
| S-i | 同一会话的写入由存储里的一把哨兵序列化（sqlite 写锁；pg 咨询锁） | TER S-16、S-43 | `core/storage` ＋ 执行宿主节点（R-T3） |
| S-f | 不可用可识别，不当成空 | TER S-47；BR S-29；MRR S-39；REG S-32 | `core/storage` 四型失败（`StorageUnavailable`） |
| S-g | 属主排他：一份库只有一个写者进程，锁随进程释放 | 「据点进程是本机唯一的写者」；TER S-46 第 3 行 | `storage-sql` 的属主实例（已实现，sqlite 下有子进程测试） |
| L-a | 多条目原子追加 | MRR S-38 第 1 行；MP S-26 第 5 行 | SL S-13 第 1 条、S-17 ④；最小提供者 `session-log-jsonl`：一行一批（C-1） |
| L-b | 按 `ResponseId`、（`CallId`, 段）、`MessageId` 幂等追加；**判重读的是日志本身或它的持久索引，不是进程内集合** | MRR S-38 第 2 行；TER S-46 第 4、5 行；RUN P-5 | SL S-8（键由各写入方拼、带前缀，SL G-5）、S-14 |
| L-c | 尝试栅栏在写入边界判；结算类记录不设栅栏 | RUN S-32 第 3 行；MRR S-38 第 9、11 行 | SL S-10（在条目壳上判、不另存尝试行） |
| L-d | 无运行的经过按（经过, name）条件写入 | RUN S-32 第 4 行 | SL S-8；经过的锚由调用方随 `dispatch` 交来（RUN S-5，D-043 R-12） |
| L-e | 读到提交这一刻为止；读不到即失败、不返回空 | TA S-33 第 2 行；RUN S-9 第 4 条 | SL S-15 末条、S-18、S-19 |
| L-f | 单写者：与 S-g 同样的属主排他（文件锁随进程释放） | TER S-46 第 5 行 | SL S-21（装配给）——**已由最小提供者写出**：`<dir>/.owner-lock` 上借 `node:sqlite` 的文件锁、随进程死亡释放，同一 `dir` 第二个实例即启动失败（`session-log-jsonl` 的[关键选择五](../../packages/session/session-log-jsonl/design.md#关键选择)）；本装配只保证一个据点进程、日志根只装一份（A-25） |

**跨 owner 的「同一提交」逐条写出共同触碰的存储对象：**

| 保证 | 两个写入者 | 共同存储对象 | 状态 |
|---|---|---|---|
| 收场与账 × 结果消息（TER S-19、S-46 第 4 行） | 执行宿主（执行记录，SQL）× 会话日志（JSONL） | **形状①（日志追加加入执行宿主的事务）在本装配不可得**：D-026 把会话日志放在 JSONL，两者不在一个事务域。**只剩形状②**：执行宿主在同一写事务里写执行记录与一条出站项（SQL，S-e）；日志追加方读出站项、按（会话, `CallId`, 段）幂等追加（L-b），再以条件写把那一行标成已送达。共同对象是**出站项那一行**加上日志一侧（会话, `CallId`, 段）的唯一约束（执行宿主节点的 L-1） | 执行宿主节点已选形状②、执行记录落 SQL（D-040 §八 M44 接受，[D-032](../../../record/decisions/tool-execution-runtime-baseline/decision.md) X-3 由此定）；日志一侧的唯一性是 SL S-8 的判重键（**接口已定**），最小提供者 `session-log-jsonl` 按盘上内容折叠判（节点已立、尚未建包） |
| 回复消息 × 它的响应体（MRR S-38 第 1 行） | agent loop × 会话日志（同一本日志） | 一次多条目追加（L-a）加响应体那一条的判重键（SL S-8 第 3 条：批里任一键已在即整批不写） | 接口已定；受阻于 agent loop（C-8）与日志最小提供者 |
| 转换产出 × 原消息落盘（MP S-26 第 5 行） | 调用方按合成后的 `subject` 落盘（MP 节点 MP-N6）× 会话日志 | 同一次日志追加 | 接口已定；受阻于调用方（C-8） |
| OAuth 绑定 × 保管方记录（BR S-30 第 4 行） | 桥（SQL）× 凭据保管方 | 两次提交、一个可见提交点（M44）：**绑定行上的 `state`、`credential_ref` 两列**（「这份凭据可用」就判在这一行）加上**保管方 OAuth 条目对绑定行的引用约束**（S-h）——保管方若把条目放在别处（系统钥匙串、另一个文件），引用约束立不起来，**两边没有共同对象**；所以最小提供者把密文落在同一 `storage`（N-37 ⑤）。清扫与完成的交错，保管方契约的模型（formal task `credential-custodian-v1-sweep`）把「在绑定行上排序」建成前提、证不到实现，桥节点不借它绑定；证据是在桥与保管方最小提供者上跑 CC S-28 的真并发（桥节点 N-2、保管方节点 N-1） | 接口已定（CC S-16～S-19）；最小提供者节点 `credential-custodian-local` 已立（K-3～K-5） |
| 换表 × 装配清单追加（REG S-31 第 1、2 行） | 注册表 × 装配清单 owner | 快照不持久，**提交点就是装配清单那一条条件追加**（REG S-18）：共同对象是清单的**会话头**与（会话, 序号）唯一（AM S-7、S-12、S-17；注册表节点 R-M1） | 接口已定；最小提供者节点 `assembly-manifest-store` 已立（按会话哨兵 ＋ 主键，它的关键选择一） |
| `ask` 记录 × 卡片（RUN S-32「卡片先于等待可见」） | 派发器 × 决策卡片 owner | 同一存储 | 受阻于 PF-008 契约 |

**反证形状②**：① 执行宿主写完执行记录与出站项、日志追加方追加了那一行之后、标已送达之前进程被杀 ⇒ 重启后追加方再读到那一项、再追加一次——**只有 L-b 的持久判重能挡住第二条消息**，进程内集合挡不住（它随进程没了）。
② 排空重启与新进程重叠：旧进程仍在追加时新进程起来 ⇒ 两个追加方——**只有 S-g／L-f 的属主排他能挡住**，进程内锁挡不住（两个进程互不相知）。两条都写进 [verification](verification.md#证据义务) 作真进程演练，受阻于会话日志最小提供者 `session-log-jsonl` 尚未建包。
**时间谓词、进程内锁、没落盘的「单调事实」一律不作为本表任何一行的依据。**

### 装配给逐行承接

契约「装配给的保证 vs 协议须给的保证」表的**左列**，每一行在本装配怎样给。状态四种：**承接**（本节点的清单、配置或结构检查给出）；**转交**（provider 节点在它自己的实现里给，本节点只保证同进程、同实例）；**受阻**（承接方式已定，承接者尚缺——**其中写「接口已定」的，承接者的接口契约已有，真承接者未到**）；**缺口**（没有单机承接方式，或本来就要协议给）。右两列（跨进程协议给）不在本页，演化到分布式时由协议重新兑现。

**TER S-46**：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 agent runtime 被回收不影响执行 | 执行宿主挂在根 Context，不在 agent runtime 之下（[清单](#据点装载清单与顺序)） | 承接 |
| 2 找得到／找不到 | 执行宿主的活体表；恢复扫描完成才对外服务，本机 socket 在它之后开闸 | 转交 ＋ 承接（次序） |
| 3 收场首胜 | S-a、S-b | 承接 |
| 4 消息追加与执行记录不只成一半 | 形状②（上一小节） | 受阻 |
| 5 结果只送达一次、送到对的调用上 | 执行宿主是唯一送达方；日志一侧按判重键认「已在」（SL S-8） | 转交 ＋ 受阻（接口已定，C-1） |
| 6 放行凭据可核对 | 凭据是日志里放行结论的引用；产品据点没有放行提供者（全拒） | 受阻 |
| 7 `submit` 用的报告就是这一次尝试的那一份、与放行判断同一份（M33／M46） | agent loop 在尝试开始时拿到报告，把**同一个值**交给派发器的 `dispatch.admission.report` 与执行宿主的 `submit.report`（P-2 的 `openCall.report` 也是这一份，MRR S-28 ①）；执行宿主核会话、`runId`、`attempt`——**归装配／待 loop 契约**（[A-19](#归装配的事项逐条承接)） | 受阻（C-8） |
| 8 本能力不随依赖换代而停下（前提） | 运行期不换代 `storage`、`clock`（[关键选择 2](#关键选择)） | 承接 |
| 9 执行者资源随停机一起失去 | 恢复扫描先回收进程组；本装配让执行宿主以据点进程自己的身份起子进程、有权终止它们 | 转交 |
| 10 时刻同一时间源 | 根作用域恰一份 `clock` | 承接 |
| 11 送达通知只在本进程内、只带标识与收场（M42） | 一个据点进程；本装配不把 `execution.delivered` 转发出进程；门面按连接身份核对后才转任何东西（[事件与过滤](#事件与过滤)） | 承接 |

**MRR S-38**（另有传输适配十一条：**转交** fork 节点 `packages/model/pi-ai-transport`（它的 T-1～T-11）；本装配只给 base URL 常量与「传输不另起进程」）：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 回复消息与响应体同一提交 | L-a | 受阻 |
| 2 追加按 `ResponseId` 幂等 | L-b | 受阻 |
| 3 「已开口」先于内容被看见 | P-2 先写锚点再交内容；门面只转发宿主推给它的，与 P-2 同进程 | 转交；门面未建 |
| 4 「已出门」先于出网 | 传输是同进程的 `pi-ai-transport` 插件（P-2 必需 inject `modelTransport`），不另起进程；请求字节只在它的 `sendRequest` 里离开进程 | 转交 ＋ 承接 |
| 5 在册状态变化后按新状态准入 | CLI 形态里目录在中心、调用在据点，**单机「现读同一存储」这一格不成立**；新鲜度上界与单调读归入口组合 v2（MPD S-22 第 2 行） | 缺口 |
| 6 凭据值只在发出时出现；来源如实 | P-2 每次发出前经 `credentialLookup` 现取，P-1r 先 `readReplica`（CC S-13）读据点本地副本（M47），P-2 只交给传输适配；发起租户经 `sessionTenancy`（ST S-8）；出厂格那一把本装配缺席 | 受阻（接口已定，C-5、C-13） |
| 7 一次调用内各次发出用同一份档案快照 | 绑定落在「已出门」 | 转交 |
| 8 投影 = 从日志重算 | 缓存读时追到日志尾（SL S-19） | 转交；受阻（接口已定，C-1） |
| 9 同一次调用只有一个写入者 | 一个据点进程、一个 P-2 实例；S-g／L-f | 承接 |
| 10 调用方身份已核实 | 客户端连接出示登录状态由门面核（[依赖表](#依赖作用域与绑定)）；会话打开时核归属归会话 owner | 受阻 |
| 11 结算写入不被尝试栅栏拒收 | L-c | 受阻 |

**MPD S-22**（据点只装 P-1r；中心那几行归 [tenancy-host](../tenancy-host/README.md)）：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 同一范围内路由名唯一 | 不在据点：P-1r 只读，不提供写面 | 承接（据点不写） |
| 2 在册状态变化后按新状态准入 | 新鲜度上界、单调读未定义；中心不可达时读副本是已接受的代价（PF-016 §6.17） | 缺口（入口 v2） |
| 3 凭据值只在取值问法里出现 | 据点落地按 [D-040 §八 M47](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：P-1r 把租户那一把的副本经凭据保管方落在据点（CC S-6～S-8、S-12、S-13：加密、按登录状态归属、秘密只在两个问法里），值只经 `credentialLookup` 交给 P-2；`readReplica` 只许 P-1r 调（结构检查）；秘密从中心**送到**据点那一段归入口组合 v2（CC G-6） | 受阻（接口已定，C-5；送达 C-4） |
| 4 取值问法只由运行时调用、来源如实 | 进程内只有 P-2 inject `credentialLookup`；来源取自那次调用绑定的有效模型 | 承接（[结构检查](verification.md#证据义务)） |
| 5 取哪一把 | 据点只有租户那一格；读不到即失败，不落到出厂格——本装配根本没有出厂格那一把 | 承接 |
| 6 出厂格那一把不可经写面改 | 据点没有它 | 承接 |
| 7 调用方身份已核实 | 同 MRR 第 10 行；跨到中心那一段归入口 v2 | 受阻 |
| 8 清单只由发布动作装入 | 中心 P-1 的事 | 不在据点 |
| 9 表示层校验 | P-1r 在每个接收边界自己重校 | 转交 |

**MP S-26**：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 登记表只由系统装配层写 | 整份声明只在声明者插件的配置里；受限面 `converterAssembly` 只许声明者与转换件包解析 | 承接（结构检查） |
| 2 答「没登记」当且仅当现行系统装配未声明 | 声明者 `ACTIVE` 即声明已交给 P-3；开闸在它之后 | 承接 |
| 3 声明换代时两份都有的键任何时刻答得出「有」 | v1 运行期不换声明（换 = 排空重启），没有换代窗口；声明者重跑时 P-3 不重跑（节点设计） | 承接 |
| 4 只有模态转换那一件调转换 | `converterRegistry.convert` 只许模态转换那一件的实现模块调 | 转交 ＋ 承接（结构检查） |
| 5 转换产出与原消息同一次落盘 | L-a | 受阻 |
| 6 读引用所指的字节以 `tenant` 进行 | 附件字节存储未定义（`data.content-blocks/v1` G-1、MP G-6） | 缺口 |
| 7 `tenant` 就是这条消息所属会话的租户 | 派发器按这一次经过所在的会话造执行环境句柄，转换件经它解析；租户经 `sessionTenancy`（ST S-8）**归装配**（[A-21](#归装配的事项逐条承接)）；模态转换那一件只在有块要转时才取租户 | 受阻（接口已定，C-13；产品装配里没有写入方） |
| 8 判合法目标用的投影覆盖到日志尾 | 转交 P-2 | 转交；受阻于会话日志 |

**SA S-29**：七行都由「生产者、宿主、本能力在同一进程」给——两个宿主（执行宿主、P-2）与 `packages/core/stream-assembly` 都在据点进程里：第 1、4、6 行**转交**宿主；第 2 行**承接**（宿主不跨进程，运行期不换代）；第 3 行**转交**宿主按（会话，目标）路由 ＋ **承接**门面按连接核会话归属；第 5 行**转交** P-2，门面同 MRR 第 3 行；第 7 行**受阻**（L-b）。

**REG S-31**：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 同一会话换表串行、多表一次成立 | 一个注册表实例；提交点在装配清单的条件追加（AM S-12、S-17） | 受阻（接口已定，C-2） |
| 2 换表先记进装配清单再生效 | 同上 | 受阻（接口已定，C-2） |
| 3 「谁可以用」现读的新鲜度 | 据点上的中心事实副本读面 `evaluationInputs`——**本程不立节点**，随入口组合 v2 一并起草（M43）；陈旧读不得放宽 | 受阻（[C-3](#实施缺口与消费者影响)） |
| 4 资产变化通知转到据点、分发到会话 | 副本更新时直接调 `onAssetChange`；正确性不依赖它 | 受阻（C-3、C-4） |
| 5 一次尝试内报告不变；报告带会话、`runId`、`attempt` | 报告作为值交给那一次尝试的调用方；调用方如实带上 `runId` 与 `attempt`，同一个值交给派发器与执行宿主（M46） | 转交（注册表）＋ 受阻（agent loop，C-8；[A-19](#归装配的事项逐条承接)） |
| 6 求值的输入被收齐 | 副本、工作区承载目录读入的承接者缺（C-3）；会话事实就是 `sessionTenancy`（ST S-8，M48） | 受阻（C-3；ST 接口已定，C-13） |
| 7 调用方身份已核实 | 注册表的面只在据点进程内；门面不直通它 | 承接 |
| 8 提供者的自报 | 桥的可用性、转换件登记表是同进程读面（注册表不依赖执行者表） | 承接 |

**BR S-30**：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 连接不跨租户、按五元组区分 | 桥的连接表；一个据点进程一个桥实例 | 转交 |
| 2 副本单调整份替换 | S-a、S-d | 承接 |
| 3 凭据引用按持有解引用 | 保管方 `resolve`（CC S-17）就地判定；**本版只有 OAuth 条目**，静态凭据的引用一律 `notResolvable`（CC G-2） | 受阻（接口已定，C-5） |
| 4 OAuth 绑定与令牌在据点一侧、同一提交 | S-h：绑定行上的判定列加保管方 OAuth 条目对它的引用约束，两者同一 `storage` 实例（两次提交、一个可见提交点，M44；CC S-19 第 2 行；N-37 ⑤） | 受阻（接口已定，C-5） |
| 5 已发出不重放 | 同进程里的连接对象 | 转交 |
| 6 桥换代时在途落异常中断 | **何时替换由本节点定：只在排空重启**，排空先等在途工具执行到上限 | 承接 |
| 7 中断送得到对端 | 同进程直接发取消通知 | 转交 |
| 8 stdio 服务端在据点机上 | 据点进程拉起（[D-037](../../../record/decisions/mcp-client-adoption/decision.md)）；「能用且未禁用」读作宿主机的显式允许（BR S-6 第 3 条） | 承接 |

**RUN S-32**：

| 行 | 本装配怎样给 | 状态 |
|---|---|---|
| 1 先落后算 | 派发器与会话日志同进程；追加确认即落盘（SL S-13） | 受阻（接口已定，C-1） |
| 2 实现在场 | 清单装上转换件、P-5、兼容件；卸载判定、循环探测、放行判断本程没有实现——派发时按不可用处置，由 RUN S-17 的指定挂件顶上 | 承接 |
| 3 尝试栅栏 | L-c | 受阻（接口已定，C-1） |
| 4 无运行的经过条件写入 | L-d；锚键由调用方交来（RUN S-5） | 受阻（接口已定，C-1；调用方 C-8） |
| 5 一批一次会合 | agent loop 带齐一组 `actions` | 转交（agent loop，缺） |
| 6 放行输入的来路 | agent loop 把这一次尝试开始时拿到的报告（带 `attempt`，M46）、授权上下文与运行模式作为值交给 `dispatch`，**报告与交给执行宿主 `submit` 的是同一个值**——**归装配／待 loop 契约**（[A-19](#归装配的事项逐条承接)） | 受阻（C-8） |
| 7 执行环境句柄只及本会话、只在这一次调用里有效（M38） | 派发器按 `manifest` 指认的会话造句柄、随调用返回失效；解析它要的两样——会话持有的租户身份经 `sessionTenancy`（ST S-8）、这一会话的执行环境先取租户再经 `executionEnvironments.resolveSessionEnvironment`（EE S-11）——**归装配**（[A-21](#归装配的事项逐条承接)） | 转交（派发器）＋ 受阻（接口已定，C-13、C-7） |
| 8 叫停（M39，⑥ `cancelled`） | 调用方与派发器、正在求值的那一件同进程，叫停当场送到；**叫停通道由 agent loop 随 `dispatch` 交来，交换格式归组合契约**——归装配／待 loop 契约（[A-20](#归装配的事项逐条承接)） | 受阻（C-8） |
| 9 调用方身份 | 派发器的面只在据点进程内 | 承接 |
| 10 句柄只及本会话、只在这一次调用里有效 | 派发器的只读视图 | 转交 |
| 11 判定来源在场 | P-2 与派发器同进程，调用时取用 `modelRuntime`，取不到即 `unavailable` | 承接 |
| 12 不可用处置声明与指定挂件在场 | 声明随装配清单读（AM S-16；读法未约定，AM G-4）；指定挂件随派发器在场 | 受阻 ＋ 承接 |
| 13 卡片先于等待可见 | 同一存储 | 受阻（PF-008） |
| 14 链的次序与两处末位 | 次序随装配清单（AM G-4）；末位由派发器强制 | 受阻 ＋ 转交 |
| 15 name 相等、效果合成 | 纯值计算 | 不变 |

**HI S-26**：第 1 行「子进程落在会话级执行环境」**受阻**——起停面接口已定（EE S-13～S-15），但本版没有会话级沙箱、拓展件子进程落宿主机要一项产品没给的允许（EE G-3，账本 ⑭），**fail-closed**：每一件兼容件「起不来」；第 2 行「运行被取消时子进程确实停下」一半**承接**——停止信号随派发器的叫停在同一进程里送到兼容件、按进程组停——一半**受阻**（叫停的来路，A-20、C-8）；第 3 行「超时后子进程确实停下」**承接**——兼容件子进程以据点进程自己的身份起、按进程组停，本装配不以别的用户身份起它们；第 4 行「回放不重跑」**转交**，受阻（接口已定，C-1）；第 5 行纯计算，不变。

**TA S-33**：**产品据点清单没有放行提供者，八行都没有承接者**——代价是每一批都被全拒（RUN S-17），这是 D-040 PB-1 接受的后果。验收装配里的放行件让第 1 行（末位，由派发器强制）、第 3 行（铸与核在同一实现里）成立，其余行随替身而定，**都不作产品证据**。

**数据契约的装配给段**：`data.content-blocks/v1` 第四节、`data.call-accounts/v1` S-26、`data.loop-extension/v1` 第十节、`data.mcp-endpoint/v1` 第五节、`data.arrival-events/v1` S-25 各行，单机的给法都是「同一进程里的同一个值、同一处编号、同一个时间源、同一存储」——
本装配给出其中三样：**一个据点进程**（全部生产者、宿主、写入者同处）、**一份 `clock`**（call-accounts「起止时刻同源」、arrival-events「首个内容步骤的时刻」）、**一份 `storage`**（call-accounts「补账找得到目标」的 SQL 一半）；
落进会话日志的那几行（块标识、`CallId` 唯一、落盘不变、「一份账只落一次」）**受阻**（SL 接口已定，C-1）；「引用可解引用、且解引用受租户判定」**缺口**（附件字节存储）。其余是各 provider 的实现义务。

## 依赖、作用域与绑定

| 消费的精确契约                                                                                                                                  | 实际提供者/解析方式与范围                                                             | 工作中绑定与变更生效点                                                                          | 缺席、撤回和旧引用政策                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 五份租户契约（四份 v1 `accepted`，账号能力 v2 `accepted`（D-028）），经 `composition.governance-center-entry/v1`（`accepted`，D-028）的线上投影 | 据点进程内 `provide` 同名服务，实现走协议；**跨进程的事一律是协议消息，不是内核事件** | 协议版本变化才断连重建；地址与所选登录状态是配置，**账号身份不从操作系统用户推断**              | 连接断开 → 代理**显式标记不可达并保持可解析**，依赖方按契约失败；**不靠「提供者消失」触发重载**——那会把界面一起卸掉（[plugin-body-reruns-on-provider-change](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)） |
| 待立的交付面呈现与受理契约                                                                                                                      | 据点侧是真实现，客户端侧是远端代理；两侧同名服务                                      | 构建标识不一致时据点进程排空重启；界面自己的临时状态由人读那一份**显式持有**，不依赖 fiber 存活 | 断线时代理标记不可达但**不卸载**，重连后按最后序号续读；**收不到不等于没发生**                                                                                                                                                 |
| 本程据点的十份能力契约与工具侧数据契约（全部 candidate，待 D-041） | 本地提供者，据点进程根作用域各恰一份（[插件与 inject 边](#插件服务与-inject-边)）；纯模块是包依赖 | **运行期不换代**：换实现、换版本、换转换件声明、换桥都走排空重启，生效点是重启之后的第一次装配（[关键选择 2](#关键选择)）；凭据轮换、MCP 凭据改值、档案撤回是**数据变化**，按各契约「下一次」生效（MRR 进展性质、BR P-9、MPD S-22），不重载任何插件 | 缺席按各契约的「依赖不可用」条款明确失败（TER S-47、MRR S-39、BR S-29、REG S-32、RUN S-33、MP S-27），**不靠「提供者消失」把依赖方整棵卸掉**；中心不可达不是任何插件换代的理由 |
| 七份窄口接口契约（SL、AM、ST、RAF、CC、EE、CN，全部 candidate v1，D-043 R-1） | **本版只在验收装配**由最小提供者兑现（关键选择 5）；产品清单里是方括号 | 运行期不换代，同上 | 缺席按消费者各自契约的「依赖不可用」收场；**「接口已定」不是「有提供者」**：产品清单里它们缺席，依赖它们的插件 `PENDING` 或那一次明确失败 |
| harness 其余能力族各服务面（agent loop、受理与队列、决策池；会话日志与装配清单的完整契约） | 本地提供者，据点进程根作用域解析 | 契约未立，生效点未定 | **未定**；在契约存在之前这一格不填猜测 |

**不使用 `isolate` 做租户隔离。**[isolate-hides-instances-not-data](../../../basis/cordis/isolate-hides-instances-not-data.md)
说明它隔离的是服务实例的可见性、不是数据；
[租户之间的隔离照 PF-001 在据点里面成立](../../../product/PF-016-cli-tui-delivery-surface/design.md#52-一个账号在一处怎么被装起来)，
靠数据访问层的身份校验，**不靠把据点或上下文拆成两份**。
同理，一台机器上两个账号是两个据点，隔离依据是据点身份，不是操作系统用户。

## 状态、并发与失败映射

**权威在哪一侧**：会话、会话日志、等着的卡片、运行属于据点一侧，且**据点进程是本机唯一的写者**；
账号、组织、成员资格、邀约与组织层/租户层的范围化对象属于治理中心，据点一侧只留用于显示的副本
（[PF-016 §5.6](../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)）。
**交付面自己什么都不持有**（[§6.1](../../../product/PF-016-cli-tui-delivery-surface/design.md#61-交付面不持有任何领域事实)）。

**提交点**：写会话日志的提交点在据点一侧的存储里，序号栅栏在同一处执行；
客户端收到的每条投影都带来源坐标，**它是已发生之事的读面，不是第二份存储**。
治理动作的提交点在治理中心，本侧只有发起与呈现——
[跨进程之后「同一次函数调用」不构成原子](../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)。

**受理是异步控制，因此不走 `bail`。**上行的受理请求要等一个回执，
而 `bail` 不 await、Promise 不会被判为 bail 值——用它做判定等于静默放行
（[async-control-not-bail](../../../basis/cordis/async-control-not-bail.md)）。
本节点的选择：**受理走服务方法的异步返回**；需要拦截式判定时用顺序等待的派发，不用 `bail`。
下行的只读投影是通知，**不承载控制语义**。

**并发**：一条连接一条有界订阅，写日志的路径**从不等待订阅者**；
超出队列上限即断开该订阅，由客户端续读追上。背压与可靠投递**内核不提供**，由传输两端自己兑现——
这一条要写进那份待立的契约，不能留在实现里。

**失败映射**（每一类都要能被人和脚本分辨）：

| 情形                                   | 本节点的收场                                                                                                                                                                             | 归谁                                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 中心不可达，而这件事属于必须现读的三类 | **明确失败，并说清是因为问不到**                                                                                                                                                         | [`organization-governance/v1#S-18`](../../../spec/capabilities/organization-governance/v1/contract.md#s-18-每道准入现读)、[`#S-43`](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)        |
| 中心不可达，而已开会话还在干活         | **照常**：据点用手上那份组织层／租户层值的副本与自己那把凭据继续受理、跑运行、调工具，不设离线时长上限；屏上标明连不上中心。再连上后按新读到的成员资格重算，该收的收，在途那一次跑完即止。**「自己那把凭据」这一半在本版有缺口**：它的据点副本要经凭据保管方落地（M47；CC 接口已定，最小提供者节点 `credential-custodian-local` 已立、本版只进验收装配），保管方缺席时离线调模型如实失败，见下一行 | [PF-016 §6.17](../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)、[§6.10](../../../product/PF-016-cli-tui-delivery-surface/design.md#610-成员资格无效期间本机那些会话不呈现也不删) |
| 据点进程被杀                           | 等同停机：恢复先对账再重算；后台执行随它退出算失败；**退出不是取消也不是失败**                                                                                                           | [PF-012](../../../product/PF-012-agent-loop-and-run/design.md)                                                                                                                                                                        |
| 客户端进程退出                         | 只是观察者走了，**不撤销任何领域动作**；终端必须被还原                                                                                                                                   | 本节点 + 待立契约                                                                                                                                                                                                                     |
| 强制停止一次运行                       | 落请求 → 向该运行的前台进程组发信号、宽限、强杀 → 写终结事实并标「可能有未收尾的外部效果」。**外部效应不假定可回滚**                                                                     | [PF-012](../../../product/PF-012-agent-loop-and-run/design.md)                                                                                                                                                                        |
| 结果未知（发出去了但不知道成没成）     | 按契约的失败集合如实上报，**不折成成功，也不自行重试**                                                                                                                                   | 各契约                                                                                                                                                                                                                                |
| 产品据点里模型要调工具 | 放行判断本程无提供者 ⇒ 全拒件顶上，那一批**一个都不执行**、运行继续，agent 与人看得到否决与来由 | RUN S-17；TA S-34；D-040 PB-1 |
| 租户没配自己那把模型凭据，调官方档案 | `undispatched{credential_unavailable}` 上交，**不落到出厂格那一把**（本装配没有它） | MRR S-19、S-28；MPD S-20；[PF-016 §6.20](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据) |
| 中心不可达时要调模型、调 MCP | 档案与持有读据点上的副本；**凭据取值先读据点本地副本**——P-1r 把租户那一把经凭据保管方落在据点、中心可达时刷新（M47，改判 M44 那一条；PF-016 §6.17、§6.20「离线时用手上那份副本」）；MCP 的 OAuth 令牌同样在保管方（CC S-16、S-17；**静态 MCP 凭据本版没有条目**，引用一律 `notResolvable` ⇒ `credentialUnavailable`，CC G-2）。**保管方缺席的本版**（接口已定、真承接者未到，C-5），离线调模型如实收成 `undispatched{credential_unavailable}`、要凭据的 MCP 操作 `dependencyUnavailable`——**这是显式缺口，不是「照常」**；`readReplica` 读不到（`unavailable`）不当成 `absent`、更不当成「没配」 | MPD S-9、S-20；MRR S-19；BR S-29；CC S-13 ⑧；D-040 §八 M47；缺口 C-5 |
| 排空重启时在途的工具执行、模型调用、MCP 调用 | 执行宿主先 `abandon` 在途帧流、再首胜写 `failed{abnormal_interruption}`；P-2 对在途流 `abandon`、收 `interrupted{run_cancelled}`；桥先交 `bridgeWithdrawn` 再收口连接。**重启之后都不重发** | TER S-48；MRR S-36；BR S-27 |
| 运行被取消时在途的那一次 `dispatch` | 派发器以 `cancelled` 收场：已提交的结论都在，正在求值的那一件收到停止信号、这一次不留记录，后面的件不再求值；兼容件的子进程按进程组停下。**叫停由 agent loop 随 `dispatch` 交来**，本装配只保证它与派发器同进程、当场送到；来路归装配／待 loop 契约（A-20） | RUN S-21 ⑥、S-34；HI S-26 第 2 行；D-040 §八 M39 |
| 存储读写失败 | 各插件按自己的条款明确失败；执行宿主写不下收场即上交并撤下自己（TER S-47），**本节点不自动重启它**，等排空重启或进程重启后由恢复扫描收 | TER S-47、S-48 |
| 配置错误（具名参数缺值或非法、声明不合形状、`retryPolicy` 不合形状、存储文件不可写） | **整个据点进程启动失败**，点名那一项、不含值，没有任何 fiber 留在 `ACTIVE`——与 [tenancy-host 的政策](../tenancy-host/design.md#依赖作用域与绑定)同一条（配置错误一个政策）。**`retryPolicy` 缺席不是错误**（取配置层的默认初值，N-36）；`judgeTimeoutMs` 缺席是错误（执行宿主节点：代码里不放默认，初值由本装配的配置给）。**模型凭据、MCP 凭据没配不是配置错误**，是数据缺席，按各契约在那一次调用上具名失败 | 本节点；basis [`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md) |

**永不替人作答**：没有超时默认答案、没有代答
（[PF-016 §6.7](../../../product/PF-016-cli-tui-delivery-surface/design.md#67-交付面永不替人作答)）；
**秘密值不进任何呈现面与任何机读输出**（[§6.11](../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)）。

## 成对的装载与撤除

**每一项装载都写清撤除时释放什么、交接什么、什么仍然为真。**
[effect 的释放是并发驱动的，异常只写日志不上抛](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)——
**逆序只约束同一个 effect 内部**。因此「先排空再关后端」这类次序必须自己在一个 effect 内组合，
**也不能只靠撤除路径来证明终端已还原**。

| 取得的资源 / 注册贡献                               | 实例拥有者与对外可用时点                                   | 部分初始化失败                                                                | 撤除、静止 / 交接与保留范围                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本机 socket 的监听与套接字文件                      | 据点进程；**监听建立、且能校验登录状态之后**才对外可用     | 监听建立但认证装不上 → 立刻关闭监听并删除套接字文件，不留一个不校验身份的入口 | 停止接受新连接 → 断开现有订阅 → 关闭监听 → 删除套接字文件。**已落盘的会话事实仍然为真**                                                                        |
| 每条连接的订阅与有界队列                            | 据点进程，随连接                                           | 订阅建好但客户端没完成认证 → 连同连接一起丢弃                                 | 断开即释放；**已发出的投影不收回**，客户端按最后序号续读                                                                                                       |
| 治理契约的远端客户端代理                            | 据点进程根作用域；连接可用之前服务面已登记但**自报不可达** | 建连失败 → 保持已登记且不可达，依赖方按契约失败                               | 断开显式标记不可达，**不卸载依赖方**；**这一条是有意为之**，否则依赖它的插件体会被整棵重跑                                                                     |
| 终端 raw mode、键盘协议协商、尺寸变化订阅、渲染循环 | 客户端进程的人读那一份；界面首帧之前不接管输入             | 协商成功但渲染循环起不来 → 立刻还原已改的终端状态再报错                       | 还原序列 + **另挂进程退出钩子与信号处理**；还原失败要在诊断流里说出来，并提供一条兜底还原命令。**`kill -9` 与远程连接中断明确不覆盖**                          |
| 机读那一份对输出流的接管与输入流的读取              | 客户端进程的机读那一份                                     | 接管成功但输入流读不了 → 释放接管再报错                                       | 撤除时把缓冲刷干净；**输出通道只承载契约内容**，诊断一律走另一条流                                                                                             |
| 工具执行的子进程组                                  | 据点进程；前台每个运行一组，后台每次执行一组               | 进程组建了但工具启动失败 → 连同进程组一起回收                                 | 前台组随该运行的取消或强制停止被带走；后台组随会话归档或据点进程退出被带走。**发出信号不等于已静止**，要等收尾或超时后强杀，并如实记「可能有未收尾的外部效果」 |
| agent runtime 协程                                  | 据点进程，每个活跃会话一副（提供者未设计）                 | 起不来按非常态处理，**不伪装成没发生**                                        | 据点进程退出即随之消失；**这不是取消、不是失败**，恢复按 PF-012 的对账规则；它上面挂的每一次模型调用的 effect 按 MRR S-36 结算（在途流 `abandon`，`interrupted{run_cancelled}`） |
| `storage` 与 `clock` 两个实例 | 据点进程根作用域各恰一份；迁移在 `provide('storage')` 之前跑完 | 迁移失败、属主被占、钟回拨 ⇒ 启动失败，已装的逆序撤（同 tenancy-host） | **最后撤**：本应用在根撤除之前按 P-2 → 执行宿主 → 桥本体 → hooks-compat → 派发器（验收装配再接执行环境 → 保管方）依次 `await` 各自撤除（[撤除次序](#据点装载清单与顺序)，M48），它们按各自条款收掉在途之后，`storage`、`clock` 才随根撤除走——**不靠内核对 inject 下游的撤除次序**。已提交的行仍然为真 |
| 执行宿主的核心 effect（活体表、执行者表、调度、排空器；一条 fiber、没有子 fiber） | 据点进程；**恢复扫描完成之后**才对外提供服务 | 扫描抛出 ⇒ `FAILED` ⇒ 整个据点启动失败（不半开） | 有序撤下按 TER S-48：先 `abandon` 在途帧流、再首胜写收场、再发停止收口；**本节点只在排空重启时撤它**；写不下的留给下一任扫描 |
| 桥本体的宿主 effect（连接表、在途操作、续期调度、孤儿回收）与 stdio 服务端进程组；执行者贡献插件的「MCP 来源」登记 | 桥本体；连接惰性建立，列举完成、副本写回之后可用；贡献插件登记即可用，注销函数包进它自己的 effect | 握手失败 ⇒ 那条连接不可用，不是故障（BR S-10）；贡献插件 `PENDING` ⇒ MCP 那一格没有执行者，执行宿主收成 `failed{start_failed}` | 桥撤下按 BR S-27：先给在途 `invoke` 交 `bridgeWithdrawn`、再按 BR S-26 关传输 → 终止进程组 → 排空 stderr；**不迁移、不重发**；据点被强杀留下的孤儿由重启后的桥回收、不复用（BR S-28） |
| 派发器登记面上的登记（模态转换那一件、P-5、兼容件的外部命令执行器）与指定挂件 | 各贡献者 fiber；登记即可用；指定挂件随派发器在场 | 贡献者 `FAILED` ⇒ 没有登记 ⇒ 那一件「此刻不在」，按 RUN S-12／S-17 处置并记一笔 | 注销 ⇒ 下一次经过记「此刻不在」；求值中途被撤下按报错记（RUN S-34） |
| 声明者交给 P-3 的整份转换件声明；P-4\* 挂上的实现 | P-3 持有登记表；声明者 `ACTIVE` 即声明生效，开闸在它之后；P-4\* 挂上即可用 | 声明不合形状（`invalidInput`、`keyTaken`）⇒ 声明者插件体抛出 ⇒ 整个据点启动失败（配置错误一个政策）；同一引用第二件挂上 ⇒ 那个 P-4\* `FAILED` ⇒ 同一收场 | 撤下 P-3 ⇒ 登记表答不出 ⇒ 含转换件输入类块的消息被否决、纯文本照常（MP S-22、S-27）；在途转换按 MP S-28；撤下一个 P-4\* ⇒ 那个引用没有实现 ⇒ `converterFailed`，不是 `noConverter` |
| P-1r 的副本（存储里）与经 `centerConnection` 的读 | P-1r；**只维持一个实例**，断线重连在实例内部；凭据副本不进它自己的副本表，经凭据保管方落地（M47） | 建连失败 ⇒ 读副本；副本没有的一格 ⇒ `unavailable` | 撤下 ⇒ P-2 与 agent runtime 连带重跑——所以只在排空重启时撤；副本是持久的，重启后照旧 |
| P-2 的在途表（一个 effect）；`pi-ai-transport` 的连接池与传输对象（它自己的 fiber 与 effect） | P-2；`pi-ai-transport` 先于 P-2 装载、`ACTIVE` 后 P-2 才能解析 `modelTransport` | P-2 起不来（含 `statusCauseTable`、脱敏三参数缺值）⇒ 据点启动失败；传输插件配置不合形状 ⇒ 同一收场 | P-2：置「停止中」→ 对表里每一次在途调用结算（幂等、先到者赢，MRR S-36）；传输插件：先关接纳、不关在途连接、最后一个在途收场时销毁池（它的交错 X-1：两条 fiber 谁先撤结局相同） |
| 五件替身（含验收放行件）与七份接口契约的最小提供者 | **只在验收装配里**：替身在 `apps/cli` 测试代码；最小提供者是各自节点的包（节点已立），本版只由验收装配加载 | 最小提供者起不来（迁移失败、**启动时**密钥文件判定不过、JSONL 目录不可写或属主锁被占）⇒ 验收装配启动失败，同一政策；**运行期**读不到密钥不是启动失败，只让那一次 `unavailable`（保管方 CCL-9） | 执行环境与保管方按显式次序撤（[撤除次序](#据点装载清单与顺序)，A-32），其余随测试装配撤；最小提供者按各自契约的撤除条款收（SL S-23、AM S-23、CC S-20、EE S-17、CN S-11 等）；产品清单里出现任何一个即结构检查失败 |

## 客户端信任中心的规则（D-029）

这是入口契约 G-11「客户端确认连上的真是那个中心」的客户端一半，由 [D-029](../../../record/decisions/governance-center-transport-binding-acceptance/decision.md#客户端信任中心的规则落在-appscli本决定定) 定；
业界依据见工作区 research 区的 `client-center-mutual-trust-practices` 调研（D-029 的来源研究）。客户端代理立起来时按这五条实现并给出验证义务：

1. **必须核对**：交出任何出示物、接受任何答复之前，确认对端证书属于要连的那个中心；确认不了按「问不到」明确失败、不交出示物（入口契约 [S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)、绑定 [S-17](../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-17-客户端怎样读答复)）。
2. **默认路径**：CA 链加主机名，主机名取配置地址的主机部分；私有 CA 的根证书是客户端配置输入。
3. **替代路径**：首次连接把中心证书公钥（SPKI）的 SHA-256 指纹显示给人、经人确认后记下；之后指纹变了拒绝连接并说明，不自动接受。
4. **跳过校验**只能经显式开关，每次运行都打印警告，只用于自己人开发与实验；不得作为默认，不得静默。
5. 中心标识不是秘密、不证明身份（入口契约 [S-27](../../../spec/compositions/governance-center-entry/v1/contract.md#s-27-governancecenterid-的形状与相等)），不参与上面任何一步。

确认失败时怎样呈现归 PF-016。

## 关键选择

插件边界、服务键与领域落点都是三份提案被 D-039 接受的结果，**不是本节点的选择**；下面五处是本节点在装配这一层自己作的，每处给落选方的最强论证与本方弱点。其中 2、3、4 已由主线接受为推导（[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M44；D-040 的逐条追认仍留产品负责人）。置信度不代替评审。

**1. 「可独立运行」怎样体现**

|          | 各 provider 包自测，不做装配级验收（落选） | 另立一个独立运行的装配（落选；D-039 已否） | **据点清单的只供测试变体（选）** |
| -------- | ------------------------------------------ | ------------------------------------------ | -------------------------------- |
| 最强论证 | 替身最少；各包本来就有自己的场景测试 | 边界最清楚：那份装配里没有交付面，也没有替身顶交付面 | 验收的是**真实的据点清单、真实的装载次序与 inject 边**——「执行宿主不在 agent runtime 之下」「开闸之前声明已生效」「运行期没有换代通路」这类只有装配给得出的性质，包自测看不到 |
| 弱点     | 看不到清单错误与装配给的性质 | 没有 PF，按准入不建节点 | 2026-09-25 起替身五件（放行件、求值输入、agent loop 驱动、脚本化传输、执行环境读数种子件），原十个里的七个由接口契约的最小提供者取代（D-043 R-1）；替身的行为仍有漂成事实语义的风险，只靠「只回放契约允许的序列」、真承接者一立即删、不进 bindings 与结构检查兜住；最小提供者兑现接口契约，但只在测试种子上跑通的场景记「有前提」（N-35 ①）。**翻盘条件**：某个替身或最小提供者必须做契约没定义的判断（例如派发器服务面要按未约定的读法从装配清单记录里取链，AM G-4——本版由测试经函数面直接交链，不走这条路），说明「可独立运行」实际需要一个有 PF 的独立装配。置信度：**中**（框架由 D-039 定，变体的形态是本节点的选择；主线裁定不复议 D-039，N-27） |

**2. 运行期不换代，换任何提供者都走排空重启**

|          | 进程内换代（落选） | **排空重启（选）** |
| -------- | ------------------ | ------------------ |
| 最强论证 | [SYS-DYNAMIC](../../../foundation/fully-dynamic-system/requirements.md) C2 要实现与绑定能动态演化；各契约都已写好换代时在途怎样收（TER S-48、BR S-27、MRR S-36）——换一个桥只该停 MCP 调用，不该连本地工具执行一起停 | 在途外部效应的收场只剩一条路径、一套证据；TER S-46 第 8 行的前提（存储、时钟本版不换代）由装配直接给出；P-1r 换代的连带（P-2 与全部 agent runtime 重跑）不会被一次中心断线触发；转换件声明没有运行期换代窗口（MP S-26 第 3 行） |
| 弱点     | 每一种换代都要各自的演练；存储、时钟一换代，执行宿主就停机（tools 提案候选 D 才能缓解） | 每次更新任何一个插件都是整个据点的停机：长跑的工具执行落 `failed{abnormal_interruption}`、在途 MCP 调用落 `bridgeWithdrawn`，**比必要的多停一批**；这是对「完全动态」的一处 v1 收窄。**改选条件**：出现要单独更新某一插件而不中断别的在途执行的具名需求，或执行宿主改取 tools 提案候选 D。置信度：**中** |

**3. 一份 SQL 实例 ＋ JSONL 会话日志，跨两处只走出站项**

|          | 每个 provider 各一份存储（落选） | 会话日志也进 SQL，让 TER 的形状①可得（落选） | **一份 SQL 实例 ＋ JSONL 日志，跨两处走出站项（选）** |
| -------- | -------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| 最强论证 | 故障与迁移互不牵连 | 执行记录与消息同一事务，最简单地守住 TER S-19；省掉出站项与一次持久判重 | 同一存储能覆盖的都在一处（首胜、多表原子、OAuth 绑定行与保管方凭据行之间的引用约束）；**会话日志落 JSONL 是 [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) 已接受的约束**，本节点不推翻它 |
| 弱点     | 桥的绑定与保管方、执行记录与出站项都跨实例，同一提交无从谈起 | 要一份新决定推翻 D-026 | 多一个出站项、多一次按（会话, `CallId`, 段）的持久判重；日志一侧的属主排他要会话日志提供者另做；日志追加晚于收场提交，中间有一段「已交付、未追加」（执行宿主节点把它读成「有占位」）。执行宿主节点已选执行记录落 SQL、出站项 `tool_execution_outbox`（M44）。置信度：**中高** |

**4. 据点上不放出厂格那一把模型凭据**

|          | 据点也配出厂格那一把（落选） | **据点缺席（选）** |
| -------- | ---------------------------- | ------------------ |
| 最强论证 | MPD S-7、S-20 ⑤ 允许出厂格有一把、只供官方档案，新同事第一天不配凭据也能用官方档案 | [PF-016 §6.20](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)与它的验收「一把不是他自己在租户层配的模型凭据出现在他的机器上」是**绝不能**；MPD 说的是「可有」，本交付面取「无」，两边同时成立 |
| 弱点     | 违反 PF-016 的验收 | 没配自己那一把的人调不了任何模型——PF-016 验收已把它写成可接受的代价。置信度：**高**（产品正文明文） |

**5. 七份接口契约的最小提供者本版只进验收装配，产品据点清单不装**

|          | 产品清单也装最小提供者（落选） | **只进验收装配（选）** |
| -------- | ------------------------------ | ---------------------- |
| 最强论证 | 最小提供者是真实现（JSONL、`core/storage` 上的表、本机进程、密文加本机密钥），逐条兑现接口契约，不是替身；装进产品清单，会话日志、装配清单、执行环境几处立刻有承接者，产品据点离「装得起来」近一步，最小提供者也在产品路径上被演练 | 产品清单里的方括号如实说明「真承接者未到」；验收装配是唯一一处用到它们的地方，出了问题不会被读成产品行为 |
| 弱点     | 装上也起不了产品据点：P-1r 向中心发请求要入口 v2（C-4）、调用方是缺席的 agent loop（C-8）；产品装配里会话持有租户与尝试事实没有写入方（ST G-2、RAF G-3）、在场事实没有来源（AM G-2）、中心连接的最小提供者是脚本化的——装进去只会让依赖方如实失败，却让清单看起来「有承接」 | 最小提供者在产品路径上没被演练；真承接者到来之前产品清单一直装不起来；到时还要再决定一次它们是否进产品清单。**改选条件**：agent loop（C-8）与入口 v2（C-4）其中之一到位、产品清单只差这几处就能装起来。置信度：**中** |

## 「归装配」的事项逐条承接

provider 节点只能写「归装配」的事，在本节点逐条落处；承接不了的写缺口与 owner（`harness-design-handbook` skill「提供者与装配投影」：契约「装配给」表的每一行都要在某个装配节点上有承接者）。

| # | 事项 | 来源 | 本节点怎样承接 | 状态与 owner |
| --- | --- | --- | --- | --- |
| A-1 | SQL 存储 | TER S-46 第 3、4 行；BR S-30 第 2、4 行 | `storage-sql` 一份、开升级守卫，确认在第一次受理之前（[升级确认](#升级确认在第一次受理之前)）；owner 导出迁移片段、本节点合成；要求 S-a～S-i | 承接（设计）；文件位置未钉 |
| A-2 | 会话日志存储 | D-026；要求 L-a～L-f | 接口 SL v1 已定；最小提供者 [`session-log-jsonl`](../../packages/session/session-log-jsonl/README.md)（JSONL）只在验收装配（关键选择 5） | 缺口 C-1（真承接者未到） |
| A-3 | 时钟 | TER S-46 第 10 行；`data.call-accounts/v1` S-26；`data.arrival-events/v1` S-25 | `clock` 一份，与 tenancy-host 同一提供者 | 承接 |
| A-4 | 凭据保管方（模型凭据的据点副本、MCP 静态凭据、OAuth 令牌） | MRR S-19、S-38 第 6 行；BR S-9、S-30 第 3、4 行；[D-040 §S19](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-f | 接口 CC v1 已定：副本条目（S-12～S-15）与 OAuth 条目（S-16～S-18）；**两种条目以密文落在绑定所在的同一 `storage`、本机只放密钥**（[D-040 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤）——对桥的绑定行立引用约束、`resolve` 在一次一致的读里读绑定行判定列（S-h）；值不进任何输出；OAuth 凭据跟机器（BR S-8），退出登录不丢（N-37 ⑦）；**租户那一把模型凭据的据点副本由 P-1r 经它落地**，取值先本地、中心可达时刷新（M47）——它缺席时离线调模型如实 `undispatched{credential_unavailable}`。`readReplica` 只许 P-1r、`depositOAuth`／`resolve` 只许桥本体（结构检查，CC S-19 第 3 行）。**本版不收**：静态 MCP 凭据、续期写回、出示名（CC G-2～G-4）；中心一侧（CC G-7）。服务键 **`credentialCustodian`**（M69）。具名参数 `sweepInterval` 值未定，`oauthPendingTtl` 与桥同值（CC G-8） | 缺口 C-5（接口已定、真承接者未到；最小提供者 [`credential-custodian-local`](../../packages/infra/credential-custodian-local/README.md) 只在验收装配） |
| A-5 | 秘密与中心事实送到据点 | MPD G-7；MRR G-12；REG S-31 第 3、4 行 | 入口组合 v2 | 缺口 C-4 |
| A-6 | 据点上的中心事实副本与求值输入收集 | REG S-31 第 3、4、6 行；assets 提案 MR-3；model 提案 N-10 | P-1r 只覆盖模型目录那一片；资产持有、配值、成员资格与角色那一片（注册表节点的 `evaluationInputs`）**本程不立节点**，随入口组合 v2 起草一并定（D-040 §八 M43） | 缺口 C-3 |
| A-7 | 装配清单的读与追加（含 `dependencyPresence` 查询） | REG S-18、G-1；RUN S-6、S-12 ① | 接口 AM v1 已定（S-16～S-19）；最小提供者 [`assembly-manifest-store`](../../packages/assets/assembly-manifest-store/README.md) 只在验收装配（在场事实经 `presenceSource`，A-27）；**读链与求值结果的读法未约定**（AM G-4） | 缺口 C-2（真承接者未到）；AM G-4 报主线 |
| A-8 | 附件字节存储 | `data.content-blocks/v1` G-1；TER S-36、G-7；MP G-6；BR G-4 | —— | 缺口 C-6 |
| A-9 | 执行环境 `executionEnvironments`（执行宿主、派发器、兼容件三个消费者共用这一个服务键） | TER S-38 第 2 步、G-4；HI S-26 第 1 行；RUN S-50 | 接口 EE v1 已定（S-11～S-15）；产品清单里没有；验收装配由最小提供者 [`execution-environments-host`](../../packages/infra/execution-environments-host/README.md) 给（落点判断照 S-6、权限值与拓展件子进程的允许由测试代码里的读数种子件给，A-31；撤除排在兼容件与执行宿主之后，A-32）；**兼容件本版 fail-closed**（EE G-3，账本 ⑭）；具名参数 `stopGrace`、`stopReplyBound`、`outputBound` 值未定（EE G-6，C-9） | 缺口 C-7（接口已定、真承接者未到） |
| A-10 | 转换件声明 | MP S-9、S-17 ② | 声明者插件 `converter-declarer` 的配置里恰一份整份声明，开闸之前生效；本装配加载声明里指认的每一个 P-4\*；**声明的内容（哪些键、哪几件）归 modality-projection 节点与产品**，本节点不填 | 承接（时点与唯一来源）；内容待定 |
| A-11 | 系统自带件的指定挂件 | RUN S-17；`data.loop-extension/v1` S-33 | 按 RUN S-17 那张表为五件各声明一件，行为就是那张表 | 承接 |
| A-12 | 放行判断件 | TA S-26、S-32；D-040 PB-1 | 产品清单没有；验收装配装只供验收的放行件 | 承接 |
| A-13 | 何时替换或卸载桥 | BR S-27 ⑥、S-30 第 6 行 | 只在排空重启 | 承接 |
| A-14 | 出厂格那一把 | MPD S-7 | 本装配缺席（关键选择 4） | 承接 |
| A-15 | 传输的 base URL | SYS-LLM；MRR S-38 传输第 9 条 | 构建内常量（OpenRouter），不是用户配置项 | 承接 |
| A-16 | 具名参数的部署取值 | TER `executionStopGrace`、`deliveryRetryInterval`、**`judgeTimeoutMs`**；BR G-12 七项加 `idleConnectionTimeout`；MRR G-5 `status_cause_table`（**初值用 `pi-ai-transport` 包导出的 `openRouterStatusCauseTable`**，行未取证）、G-6 脱敏三项；HI 节点 `hookEnvAllowlist`（与 BR 的 `stdioEnvAllowlist` 是两份 `EnvAllowlist` 配值，形状定在 EE S-13）；CC G-8 `sweepInterval`；EE G-6 三项；`pi-ai-transport` 的策略配置项（`routeWireHints` 初值为空，它的 PAT-N17）；保管方 `keyFile` 路径（据点目录下）；CN G-3 `probeInterval`、`probeTimeout` | **`judgeTimeoutMs` 由本装配的配置给初值 500 ms**（执行宿主节点「判定时限是策略配置」：计时归它的判定工作线程、代码里不放默认；来源与 `statusCauseTable` 同一路——测试配置自带、产品装配由据点给）；**其余值未定，本节点不填**；产品清单缺值即启动失败（配置错误一个政策）；`statusCauseTable` 与脱敏三参数由测试配置自带取值（N-33）；验收装配用标明「只供验收」的测试值 | `judgeTimeoutMs` 承接（初值）；其余缺口 C-9 |
| A-17 | 设置项的值（首个 token 等待、首 token 之后停顿两个时限） | MRR G-9、S-21 | 它们是设置、按层求值，**不是部署配置，不归本节点** | 指出不归装配 |
| A-18 | 据点一侧的调用方身份核实 | MRR S-38 第 10 行；RUN S-32 第 9 行；REG S-31 第 7 行 | 本机 socket 每条连接出示登录状态、由门面核对；能力间内部面不直通客户端连接 | 承接（设计已有）；门面与客户端代理未建 |
| A-19 | **同一份可用性报告（带 `attempt`）交给 P-2、派发器与执行宿主** | TER S-46 第 7 行、S-23 ①；RUN S-32 第 6 行、S-21 ②；REG S-31 第 5 行、S-11；MRR S-28 ①③；D-040 §八 M33、M46、N-43 | 调用方（agent loop）在一次尝试开始时从注册表拿到报告，把**同一个值**交给 `openCall.report`（P-2 以它取工具条目）、`dispatch.admission.report` 与 `submit.report`；三个接收方各核会话、`runId`、`attempt`，对不上即 `invalidInput`；接收一侧不现算、不向注册表要「最近一次」。本装配给出的只有「三方同一进程、值在进程内原样传」 | **归装配／待 loop 契约**（C-8） |
| A-20 | **给 `dispatch` 的叫停通道** | RUN S-21 ② 末句、⑥ `cancelled`、S-34；HI S-26 第 2 行；D-040 §八 M39 | 取消请求先落日志，之后 agent loop 经随 `dispatch` 交来的通道叫停；派发器不再开始下一件、把停止转给在途的那一件（兼容件按进程组停子进程）。通道的交换格式归组合契约；本装配给出「同一进程、当场送到」 | **归装配／待 loop 契约**（C-8） |
| A-21 | **按会话作用域造执行环境句柄所需的两样** | RUN S-50、S-32 第 7 行；`data.loop-extension/v1` S-41；MP S-26 第 7 行；HI S-18；D-040 §八 M38 | 句柄由派发器按这一次经过所在的会话造、随调用返回失效；解析它要的**会话持有的租户身份**经 `sessionTenancy.holdingTenant`（ST S-8），**这一会话的执行环境先取租户、再以 (租户, 会话) 调 `executionEnvironments.resolveSessionEnvironment`**（EE S-11；[D-040 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩），派发器调用时取用；取不到即解析失败，不回退宿主机、不拿别的会话那一份顶上。验收装配里两者各由接口契约的最小提供者承接（D-043 R-1） | **归装配**：接口已定；`sessionTenancy` 的真承接者是会话那一程（PF-015，C-13），`executionEnvironments` 的是 PF-005（C-7） |
| A-22 | P-1r 到中心的连接 `centerConnection` | MPD S-22 第 2 行；P-1r 节点 | **观察面接口已定**（CN v1：三态可达性、自己探自己重连、在场不随可达性变，CN S-5～S-9）；验收装配由最小提供者 [`center-connection-probe`](../../packages/infra/center-connection-probe/README.md) 的同包插件 `center-connection-replay` 按脚本回放（产品装法 probe，信任方式 A-34）；**向中心发请求**归入口 v2 的据点客户端（CN G-1） | 缺口 C-4（真承接者未到） |
| A-23 | 默认重试件的策略对象 `retryPolicy`（P-5 的配置，不是设置项） | MRR S-35、G-8；[D-040 §八 N-36](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) | 本装配不给 `retryPolicy`，P-5 取配置层的默认初值 `{ kind: exponential, base: 1000 ms, factor: 2, max: 4000 ms, jitter: none }`（与原候选列表逐次相同）；要改就在这一处给；次数由 MRR S-35 推出，不是配置 | 承接（MRR G-8 按 N-36 改写为「策略配置项与默认初值」并闭合） |
| A-24 | 执行宿主落账时的「尝试与运行的事实」`runAttemptFacts` | TER S-13 `late`、G-18；D-040 §八 M74 | 接口 RAF v1 已定（S-9）；执行宿主调用时取用；产品清单里没有提供者，验收装配由最小提供者 [`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/README.md) 承接（「已被取代」从会话日志条目壳算、「已终结」由代 loop 写终结的测试驱动交进认法 `runEndRecognizer`、答案仍从日志算，N-37 ④）；**`late` 不给过渡值**；漏标窗口仍在（RAF G-2） | 缺口 C-16（接口已定、真承接者未到） |
| A-25 | 会话日志根目录的位置；只装一份在根上 | `session-log-jsonl` 的配置 `dir`（绝对路径、无初值）与属主文件锁（它的关键选择五、SLJ-7） | 验收装配给一个本地 Linux 文件系统上的临时目录；同一 `dir` 只开一个实例（第二个即启动失败）；产品装配本版不装（关键选择 5），装时位置落在据点目录下 | 承接（验收）；产品位置未钉 |
| A-26 | 最小提供者的迁移片段**只在验收装配合成** | `assembly-manifest-store`、`session-tenancy-table`、`credential-custodian-local` 各导出一份迁移片段 | 验收装配经 `composeMigrations` 合成；产品清单不装它们、也不合成它们的片段（关键选择 5） | 承接 |
| A-27 | **最小提供者的配置不带测试项**（`presenceSource`／`runEndRecognizer`／`./seed`／`executionPlacementReadings` 种子件；原 A-31 并入，独立评审 N6 B-5） | [`session-tenancy-table`](../../packages/session/session-tenancy-table/design.md#实施缺口与消费者影响) STT-4（`./seed` 是产品包里的一段写代码）；[`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/design.md#实施缺口与消费者影响) AFD-1、AFD-4（认法是测试自定的形状）；[`assembly-manifest-store`](../../packages/assets/assembly-manifest-store/design.md#实施缺口与消费者影响) AMS-2（在场事实没有产品来源）；[`execution-environments-host`](../../packages/infra/execution-environments-host/design.md#关键选择) 关键选择二（种子件在 `apps/cli` 测试代码里） | 四者都只由 `apps/cli` 的测试代码给出；**一条结构检查守住**：只有 `apps/cli` 的测试代码 import `./seed`；产品清单里 `run-attempt-facts-derived` 不带 `runEndRecognizer`、`assembly-manifest-store` 不带 `presenceSource`；产品清单里不装提供 `executionPlacementReadings` 的种子件。带「故意违反即失败」的自测（[verification](verification.md#证据义务)） | 承接（规则未写） |
| A-28 | **开闸在 `storage-sql` 升级确认之后** | [`session-log-jsonl`](../../packages/session/session-log-jsonl/design.md#实施缺口与消费者影响) SLJ-2、STT-3、AMS-5：升级未确认即撤除时 SQL 恢复快照、日志不回退，日志里已确认的条目可能指着 SQL 一侧已不在的行 | 本机 socket 监听（开闸）排在 `storage-sql` 的升级确认之后；确认之前不受理任何入站（[升级确认在第一次受理之前](#升级确认在第一次受理之前)——同一句也是 ST S-6、AM S-13／S-24 的共同前提） | 承接（次序）；断电那一条来路仍是已知边界 |
| A-29 | 保管方的迁移片段排在桥之后；**没装桥也合成桥的片段** | [`credential-custodian-local`](../../packages/infra/credential-custodian-local/design.md#实施缺口与消费者影响) CCL-2（引用约束的目标表由桥的片段建） | 合成次序：桥 `mcpBridgeMigrations` 在前、`credentialCustodianMigrations` 在后；清单里没有桥插件时照样合成桥的片段 | 承接 |
| A-30 | `oauthPendingTtl` 两边相等 | CCL-3；保管方 S-18 第 2 条、G-8；桥 G-12 | 本装配从同一个配置项交给桥与保管方；一条装配测试断言两边拿到的是同一个值（[verification](verification.md#证据义务)） | 承接；值未定（C-9） |
| A-31 | 执行环境读数种子件只在验收装配 | [`execution-environments-host`](../../packages/infra/execution-environments-host/design.md#关键选择) 关键选择二（种子件在 `apps/cli` 测试代码里） | 并入 A-27（一条规则；编号保留供引用） | 并入 A-27 |
| A-32 | 三个 infra 最小提供者的撤除次序：执行环境在兼容件与执行宿主之后；保管方在桥之后、先于存储与时钟；中心连接不需要 | [`execution-environments-host`](../../packages/infra/execution-environments-host/design.md#成对的装载与撤除) 的装卸（撤除时停下起过的每一组）；[`credential-custodian-local`](../../packages/infra/credential-custodian-local/design.md#成对的装载与撤除) 的装卸（在途清扫事务）；[`center-connection-probe`](../../packages/infra/center-connection-probe/design.md#成对的装载与撤除)（撤除序列在一个 effect 里，CN S-11） | 进[据点装载清单](#据点装载清单与顺序)的显式驱动：P-2 → 执行宿主 → 桥本体 → hooks-compat → 派发器 → 执行环境 → 保管方，再撤根；中心连接随根撤。**次序不承担正确性**：未按此序时两节点的失败映射已兜住（`custodianWithdrawn`；停组「未确认」而执行环境自己的撤除已停组），显式驱动只让收场可断言 | 承接 |
| A-33 | 产品清单不得出现 `center-connection-replay` | [`center-connection-probe`](../../packages/infra/center-connection-probe/design.md#插件边界与服务面)（replay 插件只在验收装配） | 结构检查：产品清单里出现 replay 插件即失败 | 承接（规则未写） |
| A-34 | 中心连接的信任方式（CA 链加主机名） | [`center-connection-probe`](../../packages/infra/center-connection-probe/design.md#实施缺口与消费者影响) CNP-2；传输绑定 G-2 | 归本节点：`entryUrl` 与 `trust.caPem` 从据点配置来；**本版是「信任锚 PEM 加地址里的主机名」**（主线裁，[D-040 §八 N-42](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ③ D-4；与本节点「客户端信任中心的规则」默认路径同一条）；改钉公钥时那个节点的证据重跑 | 承接（本版方式已裁；产品装法本版不装） |

## 实施缺口与消费者影响

**本节点当前全是缺口。**证据义务与 owner 逐条登记在 [verification.md](verification.md)，
这里只写它们挡住了谁。

| 缺口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 挡住什么                                                                                                                                      | owner 与闭合条件                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 交付面呈现与受理契约**尚未起草**                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 人读与机读两个包、传输两端、门面的服务面**全部无从实现**；「两种呈现形式留下同一串记录条目」这条最要紧的性质**没有可绑定的条款**              | 架构与规格设计；起草并接受后回填 [选择与动作链](#选择与动作链)                               |
| **C-1** 会话日志：**接口已定、真承接者未到**（SL v1 接住 L-a～L-f 与条目的壳；D-026 定它落 JSONL，格式、目录归最小提供者节点 [`session-log-jsonl`](../../packages/session/session-log-jsonl/README.md)，已立） | 产品清单里派发器与 P-2 停在 `PENDING`，产品据点清单装不起来；TER S-46 第 4～6 行、MRR S-38 第 1、2、8、11 行、MP S-26 第 5 行、RUN S-32 第 1、3、4 行都受阻；执行宿主的出站项没有追加方。验收装配由最小提供者承接 | 真承接者 loop 与会话那一程（[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M43：下一程）；闭合条件：那一程的会话日志契约与 SL v1 对应、提供者立节点 |
| **C-2** 装配清单：**接口已定、真承接者未到**（AM v1 接住注册表节点 R-M1～R-M9 与 `dependencyPresence` 查询）；**读链与求值结果的读法未约定**（AM G-4） | 产品清单里注册表停在 `PENDING`；派发器的链与不可用处置声明、P-2 的层锁与两个时限，即使有了最小提供者也读不出（AM G-4；从没切换过的会话的选中初值另归 MRR G-20，本版无来路）——验收场景经函数面由测试直接交这些值；在场事实没有来源（AM G-2），产品装配里带 `needs` 的件恒判不出。最小提供者 [`assembly-manifest-store`](../../packages/assets/assembly-manifest-store/README.md) 已立 | 真承接者 PF-004 那一程（M43）；闭合条件：那一程定下记录里求值那一部分的形状与读法 |
| **C-3** **据点上的中心事实副本读面**（注册表节点的 `evaluationInputs`：资产持有、配值、成员资格与角色，工作区承载目录读入；「会话事实」那一片按 M48 归 C-13）**本程不立节点**；model 那一片由 P-1r 承接。本区红线不许[装配胶水暗中拥有未定义能力](../../AGENTS.md#红线)，**本节点不在 `apps/cli` 里补这段逻辑** | 注册表的 `fill`／`reload`／`refreshAvailability`（REG S-31 第 3、4、6 行），经报告连带桥的接入点持有、放行判断的授权上下文；P-2 要的求值输入（MRR 另有 G-19） | **主线**（M43）；闭合条件：**随入口组合 v2（C-4）起草一并定**这份读面的契约与提供者 |
| **C-4** 入口组合契约 v2（路由表开放资产与模型目录各面、凭据跨进程送达）与它的据点客户端**未立**；`centerConnection` 的**观察面接口已定**（CN v1），真承接者就是这个据点客户端（CN G-1） | 产品清单里 P-1r 停在 `PENDING`（必需 inject `centerConnection`）；读得到可达性也问不了中心；C-3 副本的来源、租户那一把模型凭据送到据点（MPD G-7、MRR G-12）、hooks 导入与 OAuth 取得之后落成资产或配值的那一次写 | **主线**（M43，下一程；[D-040](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点) PA-5、PC-3 已记为「归装配」） |
| **C-5** 凭据保管方：**据点一侧接口已定、真承接者未到**（CC v1；最小提供者 [`credential-custodian-local`](../../packages/infra/credential-custodian-local/README.md) 按 N-37 ⑤ 密文落同一 `storage`、本机只放 `keyFile`，节点已立）；中心一侧本版不收（CC G-7） | MRR 取凭据、BR 解引用与 OAuth（BR S-30 第 3、4 行）、MPD S-22 第 3 行；**真承接者到了仍不收**：静态 MCP 凭据、续期写回、出示名（CC G-2～G-4），副本的登录状态与值的来路（CC G-6，入口 v2） | 真承接者 `infra/secrets` 那一程（M43，下一程；D-040 S19-f）；闭合条件：那一程的节点兑现 A-4，CC 出新版本收 G-2～G-4 |
| **C-6** 附件字节存储未定义（`data.content-blocks/v1` G-1） | 执行宿主的 `storeRaw`、帧里的媒体引用、转换件读写字节、MCP 内嵌二进制资源 | **主线**（M43，下一程）；PF-006 与存储那一程 |
| **C-7** 执行环境：**接口已定、真承接者未到**（EE v1：宿主机那一半的落点判断、按进程组起停；沙箱不在本版，EE G-1） | 产品清单里执行宿主起执行者的第 2 步（TER S-38）一律 `failed{environment_unavailable}`；执行环境句柄解析出的「这一会话的执行环境」（A-21）；**兼容件子进程本版 fail-closed**——要一项产品没给的宿主机允许（EE G-3，**产品问题，账本 ⑭**）；那之后还挡在子进程的工作目录与白名单变量没有来路（HI G-15：交不出工作目录即起不来，HI 节点 HI-N7）。最小提供者 [`execution-environments-host`](../../packages/infra/execution-environments-host/README.md) 已立：产品装配里读面缺席 ⇒ 工具 `unavailable`、兼容件 `noLanding{hostNotAllowed}` | 真承接者 PF-005 那一程（M43）；EE G-3 由产品负责人定 |
| **C-8** agent loop 与 agent runtime **没有契约**（受理与队列同在） | 执行宿主、P-2、派发器、注册表的调用方全都不在；RUN S-32 第 5 行、REG S-31 第 5 行转交不出去；修复波 3 新加给调用方的两样归它：同一份带 `attempt` 的报告交给 P-2、派发器与执行宿主（A-19：TER S-46 第 7 行、RUN S-32 第 6 行、MRR S-28 ①）、给 `dispatch` 的叫停通道（A-20：RUN S-32 第 8 行、HI S-26 第 2 行）；执行环境句柄的来路（A-21）按 M48 改归 C-13 与 C-7。P-2 `openCall` 的宿主句柄（effect 登记函数、中止信号、「停止中」读面）的形状也归它（M67 M-4）；`runAttemptFacts` 的真承接者之一也在这里（C-16）。**排空重启的第一步「关闭新运行的准入」也没有承接者**（[architecture 分发与升级](architecture.md#分发与升级)）——只影响升级流程，不影响正确性 | **主线**（M43，下一程）；闭合条件：loop 契约写出这两样的交付方与失败收场，叫停的交换格式进组合契约，受理一侧给出「停止接受新运行」的操作 |
| **C-9** 具名参数的部署取值未定（A-16） | 产品据点清单缺值即启动失败 | 各契约 G 的 owner（TER、BR G-12、MRR G-5／G-6） |
| **C-10** ~~三份契约正文仍写已被 D-039 取代的 `apps/runtime-host`~~ | —— | **已闭合**：修复波 3 已改为 `apps/cli`（D-040 §八 M40） |
| **C-11** 假设待补 probe：`ctx.effect` 的撤除函数可提前调用（本节点编号 H-2，MRR 节点叫 H-1，同一条假设；P-2 依赖它，MRR 节点 MRR-N5）、没有 inject 时插件体不重跑（H-4）、不带 `thisArg` 的派发不过滤（H-7）；**`await` 一条 fiber 的撤除会等到它的 async disposer 结算完**（本装配显式驱动撤除次序时依赖它，与执行宿主节点的 A-1「换代时等旧任 async disposer 结算完再重跑」同类）；子 fiber 随父卸载（H-1）**本装配已不依赖**（执行宿主无子 fiber、P-4\* 不是 P-3 的子） | 「事件与过滤」按不过滤处理；P-2 的「一次调用是宿主上的 effect」按 H-2 写；[撤除次序](#据点装载清单与顺序)与排空演练（verification 据点义务第 5 条）以最后一条为前提——不成立时正确性由下一任恢复扫描兜住，演练预期不成立 | `packages/core/kernel-basis`，按 source-check 补 probe、登 basis |
| **C-12** 本程留给下一程、会牵动本装配的 provider 缺口（M43）：传输 fork 节点 [`pi-ai-transport`](../../packages/model/pi-ai-transport/README.md) 已立、尚未建包、D-019 比较门未过（MRR-N4）、执行宿主落盘前那一关的驱动方与按（租户，会话）订阅的观察者推送面（T-2、T-3）、`late` 读面与模型调用的成本路由（T-4、T-5） | 产品清单里 `pi-ai-transport` 还没有包可装（验收装配用脚本化传输）；门面拿不到工具帧的推送面，只能读日志 | **主线**（M43，下一程） |
| **C-13** 会话持有租户读面 `sessionTenancy`：**接口已定、真承接者未到**（ST v1 S-8；**没有写面**，ST G-2）：执行宿主 `submit`（TER G-12、执行宿主节点 T-8）、派发器解析执行环境句柄（RUN S-50）、P-2 的发起租户（MRR-N10）、注册表的「会话事实」——同一读面的四个消费者（M48、M66） | 产品装配里即使装上最小提供者，每次读也是 `sessionNotFound`：`submit` 恒为整批 `dependencyUnavailable{sessionTenancy}`（TER S-21）；执行环境句柄解析不出租户，要用它的拓展件（模态转换、兼容件）「起不来」或报错；P-2 要发起租户的操作 `unavailable`；REG S-31 第 6 行受阻。验收装配由最小提供者 [`session-tenancy-table`](../../packages/session/session-tenancy-table/README.md) ＋ 它的 `./seed` 代写承接 | 真承接者会话那一程（PF-015）；闭合条件：会话契约写出那一写（ST G-2），提供者立节点 |
| **C-14** 依赖在场判定：**接口已定、事实没有来源**——它是 `assemblyManifest` 的一个查询（AM S-19，N-37 ②；**装载清单里不再有独立键**），语义归属存疑登 AM G-2（派发器节点 RUN-N5；RUN S-12 ①） | 产品装配里声明了 `needs` 的拓展件恒判不出 ⇒ 那一次 `unavailable`；不带 `needs` 的件不受影响。验收装配经最小提供者 [`assembly-manifest-store`](../../packages/assets/assembly-manifest-store/README.md) 的配置 `presenceSource` 交进在场事实 | **主线**（这个查询的家）＋ PF-006 依赖解析与据点装配那一程（事实的来源）；若家不在装配清单，AM 出新版、派发器改钉 |
| **C-16** 尝试与运行的事实读面 `runAttemptFacts`：**接口已定、真承接者未到**（RAF v1 S-9；最小提供者 [`run-attempt-facts-derived`](../../packages/session/run-attempt-facts-derived/README.md) 不另存表、从会话日志算，N-37 ④）：执行宿主落账时要知道「提交这笔账的那次尝试是否已被取代、这个运行是否已终结」，才算得出 TER S-13 的 `late`（TER G-18，[D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M74） | 产品装配里「已终结」恒 `unavailable`（RAF G-3）——**不给过渡值、不改 `data.call-accounts`**（M74），有调用方的操作得 `dependencyUnavailable{runAttemptFacts}`（TER S-47）；读在落账事务之外、漏标窗口仍在（RAF G-2）。验收装配由最小提供者 ＋ 测试驱动交进的认法 `runEndRecognizer` 承接 | 真承接者会话日志与 loop 那一程（C-1／C-8）；闭合条件：运行终结记录的形状定下（RAF G-3）、共同存储对象定下（RAF G-2） |

**编号说明**：C-15 由 [D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M58 的 `infra/clock` 修订占用（时刻严格递增的手段），不在本节点；它改的是本装配根作用域那一份 `clock` 的保证，闭合时本节点只需复核 TER S-46 第 10 行的承接写法。
| 据点 ↔ 治理中心的线上投影 `composition.governance-center-entry/v1` 已 `accepted`（D-028）（五份租户契约里四份 v1 已 `accepted`，账号能力 v2 已 `accepted`（D-028））                                                                                                                                                                                                                                                                                                                           | 路由表与传输绑定都已冻结（D-028、D-029），命令清单可按它们列；客户端代理仍不存在                                                              | 客户端代理的设计另立，不在本程                                                               |
| 治理中心那一侧**节点已立**：[`apps/tenancy-host`](../tenancy-host/README.md) 与 [`packages/tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/README.md)；产品依据 PF-017 rev 2 已接受，契约与传输绑定已冻结（D-028、D-029），两个节点已实现（HUB `c9b5850`）                                                                                                                                                                                                         | 两条跨应用边的对端有了身份与实现；防冒充的客户端确认规则已由 D-029 定（[下节](#客户端信任中心的规则d-029)）；**据点一侧的客户端代理仍无处落** | 客户端代理由据点一侧的设计另立，不在本程                                                     |
| **出示物放在哪**：已定——整个信封含出示物在请求体，跟随冻结的传输绑定（[D-029](../../../record/decisions/governance-center-transport-binding-acceptance/decision.md)）；本节点 [D11](../../../record/proposals/cli-tui/alternatives.md#d11-线上协议与认证) 的「`Authorization: Bearer` 头」候选被取代，其余（HTTPS、JSON、请求／响应、显式版本协商、无推送）不变                                                                                                                                | 已闭合；客户端代理按绑定实现                                                                                                                  | —                                                                                            |
| 五个区分实验**一个都没跑**                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 渲染层、呈现路线与第二阶段分发的采用只是纸面结论                                                                                              | 本节点；见[提案](../../../record/proposals/cli-tui/alternatives.md#进入实施前的最小区分实验) |
| 凭据的值**怎么到据点**：[每台机器上只有自己那一把、配在租户层](../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)已裁，但它随组织层／租户层的值一起同步到据点副本的那条通路**没有契约**。`composition.governance-center-entry/v1` 只投影账号、组织治理与注册的操作（[S-47](../../../spec/compositions/governance-center-entry/v1/contract.md#s-47-本版是首版)），**不承载范围化的值与凭据的同步**；它的 v2 已记为「归装配」（C-4） | 模型请求运行时取租户那一把的据点副本、客户端永不见值——据点落地已按 M47 定为 P-1r 经凭据保管方（C-5 未立），同步那一段（C-4）仍无坐标；观感偏好的中心一侧副本同样无通路 | 同 C-4、C-5 |
| [「一处 = 一台机器」是本形态的落法、不进语义](../../../product/PF-016-cli-tui-delivery-surface/design.md#会话据点)——PF-016 rev 3 已说明它不违反 [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)                                                                                                                                                                                                                                                          | 拓扑一节按字面读法写，**不必复核**；这一行留着只为说明那条回询已闭                                                                            | —                                                                                            |
| DSH `agent` 原语是否假定与会话存储同进程**未核**                                                                                                                                                                                                                                                                                                                                                                                                                                               | 演化边（每会话工作进程）能否直接复用它未知                                                                                                    | 来源核对：读采用版本源码，按 basis 的形状记条目                                              |

**受阻消费**：C-1～C-8 闭合之前，产品据点清单装不起来。本节点能独立推进的只有——
区分实验、待立契约的起草、[验收装配](#验收装配)与它的七个最小提供者、五件替身（替身只回放契约允许的序列；治理那一侧的替身按 `composition.governance-center-entry/v1` 的四种入口答复与路由表回放），
几条不依赖任何缺口的结构检查（据点依赖图、产品清单里没有替身与最小提供者、只有 P-2 取用 `credentialLookup`、`readReplica` 只许 P-1r 调、P-4\* 够不着 `modelRuntime`、`converterAssembly` 只被声明者与转换件包解析），以及与 harness 无关的体检、终端还原与非 TTY 拒绝。
**替身里「看起来合理」的行为都是 gap，不是设计。**

**报给主线**（不在本节点改）：MRR S-38 第 5 行在 CLI 形态下本来就是「协议给」、单机那一格不成立（与 MPD S-22 第 2 行同一件事，入口 v2 要一并兑现）。2026-09-25 修订波新增：① **AM G-4 挡住派发器读链与 P-2 的 `effectiveModel` 锁判、`dispatch` 时限**——MRR G-19 闭合之后，`legalTargets`／`selectModel`／`displayList`（写过切换记录的会话）解阻，`openCall` 按 MRR S-28 ④ 不读求值；层锁（求值里没有「用哪个模型」这一项即没有锁，MRR S-10 第 2 步）、两个时限与链都要从装配清单记录内容里取，读法未约定；建议写入方把求值结果（`capability.asset-evaluation/v1#S-8` 的 `EffectiveAssembly`）放进记录 `content` 的一个具名成员，AM 出一条读法（坐标：AM G-4、MRR S-10／S-21、RUN S-6）；② 七个最小提供者是否进产品清单（关键选择 5）等 C-4／C-8 其中之一到位再定；③ 兼容件 fail-closed 的产品问题（EE G-3，账本 ⑭）；④ **MRR G-20**：「用哪个模型」这项设置的产出方未定，从没切换过的会话 `effectiveModel` 恒 `unavailable`——新会话在第一次切换之前发不出模型请求，验收装配以种子写一条模型切换记录（MRR S-9；MRR 节点 MRR-N13）。已处置、不再报的：C-3 的二选一（M43）、C-10（M40）、形状②与出站项（M44）、A-21 的来路（M48：`sessionTenancy` 归 PF-015，C-13）、离线凭据来源（M47）、保管方服务键（M69：`credentialCustodian`）、`late` 的来路（M74：`runAttemptFacts`，C-16）、默认退避（M67）、替身过八不复议 D-039（N-27）、「`await` 一条 fiber 的撤除等到 async disposer 结算完」登 kernel-basis 待补 probe（N-27，C-11）。
