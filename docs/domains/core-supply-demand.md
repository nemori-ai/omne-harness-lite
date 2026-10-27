# 核心域供需关系

本页为维护者汇总核心链路及 Runtime Context、Request Context、Execution Environment 与 Session、Agent、Model、Tool 的交接。每行给出事实拥有者、消费者、公开入口、协调者和失败出处。精确行为继续归链接的领域、契约或协调者正文。

状态：本页是 [#802](https://github.com/nemori-ai/omne-harness-lite/issues/802) 的关系导航候选，尚待 PanQiWei 或其授权的 M1.5 reduce 会话接受，见[接受权限](https://github.com/nemori-ai/omne-harness-lite/issues/802#issuecomment-6450209047)。引用不扩大来源的采用范围，也不表示提供者、适配器或组合路径已实现。领域责任的接受范围见[领域入口](README.md#维护与状态)，系统采用范围见[架构入口](../architecture/README.md#采用状态与当前有效源)。

## 核心链路与事实归属

会话路径上，Session 把工作与推进资格交给 Agent。Agent 消费 Model、Tool 的公开能力，并经自己定义的 Journal 保存执行记录。Session 实现这个 Journal，记录承载在同一份只增不改的会话日志里，Session 按 Agent 的公开读取形状消费其中的 Agent 条目。这不是两份日志。独立调用方提供自己的日志及持久依赖，见 [Agent 的拥有者与输入](agent-progression/architecture.md#拥有者与输入)、[会话唯一事实源](../architecture/runtime/session-and-run.md#h1-session-facts)与 [Agent 重装配边界](../architecture/runtime/agent-runtime.md#h1-agent-reassembly)。

| 提供者 → 消费者 | 提供内容与公开入口 | 组合协调者及失败交接 |
| --- | --- | --- |
| Agent → Session | 执行、输入承接、等待、控制与结束事实。经 [agent-contract 的托管协调与运行实例](../../packages/agent/agent-contract/SPEC.md#托管协调与运行实例)、事件读取及 Journal 参加协议提供 | Session 经自己的适配成员映射 Run 与执行引用，不能从 EOF 或实例退出推定业务终态。回执未知先查原操作，见[会话与 Agent 的交接](sessions-and-work/architecture.md#与邻域的交接) |
| Model → Agent（调用能力） | 调用受理、各次真实发出与普通调用面。Agent 作普通调用方经 [model-contract 的调用和各次真实发出](../../packages/model/model-contract/SPEC.md#调用和各次真实发出)发起调用，取得可保存调用引用，经[普通调用面与实例观察](../../packages/model/model-contract/SPEC.md#普通调用面与实例观察)观察 | Agent 实例只发 admit 与 cancel，不驱动调用寿命，见 [H1 调用寿命归 Model](../architecture/runtime/model-runtime.md#h1-model-lifetime)。受理的 denied、unavailable 与 invalid 按 Model 契约交回调用方；结果与账目走下文「Model、Tool → Agent 一侧的结果接收方」一行 |
| Tool → Agent（调用能力） | 调用受理与控制引用。Agent 作普通调用方经 [tool-contract 的公开调用边界](../../packages/tool/tool-contract/SPEC.md#用途调用方与公开边界)发 direct 调用，受理后补 `ToolInvocationRef`，见 [Agent 的 Tool 调用关联与控制引用](../../packages/agent/agent-contract/SPEC.md#tool-调用关联与控制引用) | Agent 不扩大受信面。受理失败按 Tool 契约交回调用方；启动围栏由外层调用方持有，见[外层调用方的启动围栏](../../packages/tool/tool-contract/SPEC.md#外层调用方的启动围栏)。结果与交付责任解除走下文「Model、Tool → Agent 一侧的结果接收方」一行与工具契约的回执 |
| Model、Tool → Agent 一侧的结果接收方 | 原调用的结果版本、真实收场与账目。接收方实现两个生产者各自的结果接收协议，先保管材料，再写 Journal 的 `received` 条目，最后返回 saved，见 [Agent 的结果接收](../../packages/agent/agent-contract/SPEC.md#结果接收) | 结果接收方由 Agent 宿主装配，是 Agent 实例外侧的常驻角色。保存、去重、背压与失联分别按原契约交接。Model 依据 saved 自己取得 ACK，见[长期运行与验证义务](../architecture/runtime/agent-runtime.md#长期运行与验证义务) |
| 生产者 → 公开实时观察者 | 生产者保管的快照与增量。稳定调用引用来自 Session 公开日志读面，当前流目标来自 Model `current`，见[公开观察的组合拥有者](../architecture/runtime/runtime-contract-handoff.md#观察脱离与重附着) | `server-entry` 组合定位、核权、刷新和重附着，Agent 实例不参加。缺项、拒绝、未知与断线保持原含义，不触发业务重发，见[接入的观察脱离与重附着](../../packages/access/server-entry/SPEC.md#观察脱离与重附着746) |
| Agent → 自身事件的观察者 | Agent 是自身事件的生产者。其流不担保汇聚所有 Model、Tool 过程内容，见 [Agent 的流引用与自身事件](../../packages/agent/agent-contract/SPEC.md#流引用与自身事件) | 当前 `stream` 分支的收窄仍由 [#673](https://github.com/nemori-ai/omne-harness-lite/issues/673) 承接。系统观察按上一行及 [H1 观察连续](../architecture/runtime/streaming-and-consumption.md#h1-observation-continuity)组织，瞬时 `StreamRef` 不入会话日志。旧条目的替代范围见 [R1 裁定](https://github.com/nemori-ai/omne-harness-lite/issues/802#issuecomment-6444695754) |

Model、Tool 的内部不用认识 Agent 或 Session 的治理模型。它们以契约中的消费者、消费位置、访问身份和原调用引用交接。运行时结果流向外层，不产生反向源码依赖，见[领域语义依赖与模型边界](../architecture/layers-and-dependencies.md#领域语义依赖与模型边界)与[依赖方向](../package-organization.md#依赖方向与cordis集成)。

## 支撑能力的十二对关系

表中的箭头表示内容供需，不表示源码依赖、共同事务或共同寿命。每行的失败链接也是该交接未知结果的权威入口。间接路径不增加直连端口。

### Runtime Context

本表给出领域目标关系。M1.5 的工具不读取 Runtime Context，阶段约束见 [#675 的 J17 范围](https://github.com/nemori-ai/omne-harness-lite/issues/675)。工具类目标读面不表示本阶段已接线。

块值归生产者，注册决定及提交归作用域持有者。Runtime Context 是供给中介，提供登记、资格、快照与变化材料，不取得原业务事实的治理权，见[事实拥有者与派生范围](runtime-context/architecture.md#2-事实拥有者与派生范围)。

| 关系与供需 | 契约成员及公开入口 | 谁协调 | 失败、未知与未完成责任 |
| --- | --- | --- | --- |
| Runtime Context ↔ Session。中介供注册材料、读取资格及变化材料，Session 是作用域持有者、部分块生产者及变化消费者 | [runtime-context-contract 三面操作](../../packages/context/runtime-context-contract/SPEC.md#三面操作)；[runtime-context-cordis-contract](../../packages/context/runtime-context-cordis-contract/docs/cordis.md#服务定义) 的 `runtimeContext` 持有者面与 `registerProducer` | Session 的 [AD-03](../../packages/session/session-adapters/SPEC.md#ad-03)安排恢复、资格和提醒追加，Session 自己提交注册决定 | 提交未知按同一操作查询，不能先生效后补记。作用域结束协议见 [RC-09](../../packages/context/runtime-context-contract/SPEC.md#rc-09-作用域结束恢复会话与恢复后供值)；Session 产生结束事实的时点仍归 [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756)，AD-03 的补拉前提见 [NP-11](../../packages/session/session-adapters/SPEC.md#np-11) |
| Runtime Context → Agent。提供模型类、扩展类读者需要的合法块投影，Agent 是请求准备协调者 | `runtimeContext.bind` 及 [RC-03](../../packages/context/runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)；Context 一侧适配器实现 Agent 声明的 `ModelContextReader`，见[字段对应](../../packages/context/request-context-contract/docs/context.md#字段对应) | Agent 经适配器读取，再把读取结果用于请求准备。适配器按持有者签发的资格绑定读者 | 读取不可用则不准备请求，资格或来源未知不变成空集合，见[邻域交接](runtime-context/architecture.md#4-与邻域的交接)。[独立适配包尚未建立](../../packages/context/request-context-contract/docs/context.md#适配方案)，建包卡与维护者未指定，#542 是原登记入口 |
| Runtime Context 与 Model 无直接块供给关系。当前档案块由模型选择端口的集成方提供，块值引用 Model 档案投影 | [Context 与模型的交接](runtime-context/architecture.md#4-与邻域的交接)；块方用 `runtimeContext.registerProducer`，请求计算另经 [Model 档案与请求准备协议](../../packages/model/model-contract/SPEC.md#档案与请求准备协议)取得计量和准备能力 | 模型选择的持有方发布当前档案。请求协调者的适配器读取模型类块，再交 Request Context，不能把该路径写成 Model 直接读中介 | 档案不可用表现为缺项，限额未知仍未知，见同一[邻域交接表](runtime-context/architecture.md#4-与邻域的交接) |
| Tool → Runtime Context 提供未结束后台工具块，Runtime Context → Tool 提供工具私有块的合法工具类读面 | [Context 与工具的交接](runtime-context/architecture.md#4-与邻域的交接)；`runtimeContext.registerProducer`、`bind` 及 [RC-07](../../packages/context/runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复) | 工具宿主承担块生产与工具侧读取的集成，注册决定仍归持有者 | 查不到状态不虚构进度，生产者更新与撤除按 RC-07 处理。[邻域表](runtime-context/architecture.md#4-与邻域的交接)只给出生产者与读者角色，具体工具块的声明和更新携带协议仍归块声明方 |

### Request Context

Request Context 消费其他拥有者的事实，给出请求候选、覆盖证据、压缩计划和装入裁定。固定请求、发出调用、保存计划进度及共同提交归相应协调者或持有者。本组采用边界以 [request-context-contract 状态行](../../packages/context/request-context-contract/SPEC.md)为准，其中产品第 4 版派生条款仍随其确认生效，表达评审不代替技术接受。

| 关系与供需 | 契约成员及公开入口 | 谁协调 | 失败、未知与未完成责任 |
| --- | --- | --- | --- |
| Session → Request Context 提供历史与未结工作，Request Context → Session 提供人侧投影和压缩转换材料 | [request-context-contract 历史源读口与 epoch 视图](../../packages/context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)、`projectForHuman` 与 [RQ-06](../../packages/context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界) | Session 实现历史持有者读口，协调者提出压缩转换并与历史持有者共同提交，见[Session 邻域交接](sessions-and-work/architecture.md#与邻域的交接) | 历史不可用不当作空历史，转换与历史不符时不提交，提交未知查原操作。[协调者一侧唯一提交点](../architecture/runtime/session-and-run.md#联合前提与具名待决)仍是具名待决，不能用同库替代共同提交 |
| Request Context → Agent 提供请求准备、压缩计划与步请求，Agent 提供调用身份、用途及各组来源 | `AssemblyOperations` 的 `assemble`、`planCompaction`、`deriveStep`、`resume`；托管适配器经 [request-context-cordis-contract](../../packages/context/request-context-cordis-contract/docs/cordis.md#服务定义) 的 `requestContext.register`、`assembly(target)`；对外实现 `agentRequests` | Agent 保存计划进度、发起摘要步调用并固定最终请求。Context 一侧适配器翻译 Agent 的端口，见[适配方案](../../packages/context/request-context-contract/docs/context.md#适配方案) | [失败对应](../../packages/context/request-context-contract/docs/context.md#失败对应)区分 denied、invalid、unavailable 和 cannot-fit。[对不上的字段](../../packages/context/request-context-contract/docs/context.md#对不上的字段)与适配包未建立仍是缺项，两个服务键存在不证明路径已接线 |
| Model → Request Context 提供档案、限制、计量资源与转换结果，Request Context 给协调者可交 Model 准备的候选 | [RQ-12 来源集合](../../packages/context/request-context-contract/SPEC.md#rq-12-来源集合与登记面)、[RQ-05 候选完成](../../packages/context/request-context-contract/SPEC.md#rq-05-完整预算与候选完成)及 [Model 档案与请求准备协议](../../packages/model/model-contract/SPEC.md#档案与请求准备协议) | 协调者选模型并登记准备资源，适配器取得和交还准备租约。候选可固定时由协调者交 Model 准备，实际调用由协调者另发 | Model 准备的确定拒绝译为 invalid/request，暂不可用保持 unavailable，限额未知在覆盖证据标明，见[结果对应](../../packages/context/request-context-contract/docs/context.md#结果对应)与[失败对应](../../packages/context/request-context-contract/docs/context.md#失败对应) |
| Tool → Request Context 提供定义、绑定与可编程许可，经协调者给第六组读口，不由请求计算直接读取 Tool | [RQ-02 工具侧输入](../../packages/context/request-context-contract/SPEC.md#rq-02-组装的前置输入)、[RQ-13 稳定读取](../../packages/context/request-context-contract/SPEC.md#rq-13-七组的稳定读取)及[邻域交接](../../packages/context/request-context-contract/docs/context.md#邻域交接) | 协调者一侧经装配求值供给完整工具材料。声明投影交 Model，不授予 Tool 执行权 | 两次读取仍不稳定、来源缺席或不可用时按原失败交回。第六组按证据解析完整工具定义的具体途径仍未规定，见[对不上的字段](../../packages/context/request-context-contract/docs/context.md#对不上的字段)，不能增造 Tool 直连填补 |

Runtime Context 到 Request Context 有两条不同路径。模型类读取结果经第三组进入候选计算，持有者另从变化材料形成提醒并可靠追加历史。快照读取成功不表示提醒已追加，见 [Request Context 的邻域交接](../../packages/context/request-context-contract/docs/context.md#邻域交接)与 [AD-03](../../packages/session/session-adapters/SPEC.md#ad-03)。七组按来源计数稳定读取，组间没有整体快照时刻，不能把它们当作同一版本，见 [RQ-13](../../packages/context/request-context-contract/SPEC.md#rq-13-七组的稳定读取)。

### Execution Environment

执行环境拥有落点、获取、租约及受管资源。调用方提供合法身份、作用域、环境要求和原获取记录。租约失效、调用结束及 disposer 完成都不能证明外部效果撤回，见[执行环境寿命对应](sessions-and-work/architecture.md#执行环境的寿命对应)。[执行环境 Cordis 定义](../../packages/execution/execution-environment-cordis-contract/docs/cordis.md)分别标明原已接受部分与成员边界改写后未经技术接受的部分。

| 关系与供需 | 契约成员及公开入口 | 谁协调 | 失败、未知与未完成责任 |
| --- | --- | --- | --- |
| Execution Environment → Session 的释放协调者提供作用域恢复与释放读回。Session 不直接获取执行环境 | [execution-environment-contract 恢复](../../packages/execution/execution-environment-contract/SPEC.md#恢复)；[execution-environment-cordis-contract](../../packages/execution/execution-environment-cordis-contract/docs/cordis.md#服务定义) 的 `executionEnvironment.releaseScope`、`recoverOwned` | 应用装配把维护者角色交 Session 的作用域释放插件，注入恢复授权。环境目标设置经求值，在 Tool 的固定请求中采用，见[Session 邻域交接](sessions-and-work/architecture.md#与邻域的交接) | 未获授权、不可用、待续及不支持分别记录，枚举失败不表示无资源。重启到重新释放之间有联合前提，见[执行环境寿命对应](sessions-and-work/architecture.md#执行环境的寿命对应) |
| Agent 经 Tool 间接使用 Execution Environment。获取与租约归工具执行，没有从 Agent 退出到环境释放的直连 | [Tool P03 环境准备和释放](../../packages/tool/tool-contract/SPEC.md#p03-环境准备和释放)与[工具宿主侧适配](../../packages/execution/execution-environment-contract/docs/context.md#邻域交接) | 工具宿主取得设施并交工具执行者。Agent 控制原 Tool 调用，不能直接接管租约 | Agent 退出或重建时环境一侧没有变化，不能据此推定 Tool、设施操作已停或资源已释放，见[执行环境寿命对应](sessions-and-work/architecture.md#执行环境的寿命对应) |
| Execution Environment 的落点和宿主事实可经 Runtime Context 间接供模型类读者使用，Model 不由此直接依赖 EE | [execution-environment-contract 块声明](../../packages/execution/execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)与 Runtime Context 生产者面，具体键为 `execution.placement`、`execution.host-facts` | 预定由 host-local 的 Service 实现发布，再由模型侧适配器读取。设施提供者本身不发布这两条块，见[提供者作者](../../packages/execution/execution-environment-contract/docs/context.md#提供者作者) | [明确缺项](../../packages/execution/execution-environment-contract/SPEC.md#明确缺项)写明尚无成员发布，生产者读取面也未定义，由执行环境登记表与 host-local 拥有者承接，块声明不表示当前已有值 |
| Execution Environment → Tool 提供落点、获取、采用记录、租约及释放结果，Tool 保存准备与释放记录 | [execution-environment-contract 获取与租约](../../packages/execution/execution-environment-contract/SPEC.md#获取与租约)，`executionEnvironment.resolvePlacement`、`acquire`、`inspectAcquisition` 与 `lease.release()`，对接 [Tool P03](../../packages/tool/tool-contract/SPEC.md#p03-环境准备和释放) | 适配在工具宿主侧。先保存原获取描述，再按同一获取键获取与认回。工具执行者只拿设施，不拿租约，见[经集成方消费](../../packages/execution/execution-environment-contract/docs/context.md#经集成方消费) | pending、unknown 保留原任务，不重发效果。unrecorded 不能证明 excluded，按保存的原描述查询原获取，见[邻域交接的 P03 映射](../../packages/execution/execution-environment-contract/docs/context.md#邻域交接)。[工具宿主适配尚未实现](../../packages/execution/execution-environment-contract/docs/context.md#现在的真实消费者) |

## 约束与维护

租户、主体和读取资格在各实际边界核验，引用及插件配置不授予权限，见[身份与授权](../architecture/security/identity-and-authorization.md)与 [IC-18](../architecture/cordis-integration-conventions.md#ic-18)。共同提交、发起围栏及恢复的组合责任归原协调者，见[共同集成的提交边界](../architecture/runtime/runtime-contract-integration.md)；该页仍是候选，不能由导航引用转为已接受方案。Cordis 只承载装配、依赖与生命周期，不替领域决定事实含义。

本页由核心域供需关系拥有者 PanQiWei 维护。关系变化先改原拥有者正文，再同步本页对应行及登记章节。原来源保留的待决、候选与具名偏离继续有效。历史决定批、逐轮对照和单次检查留在任务交付记录，不能用本导航关闭缺失协议或代替本人接受。
