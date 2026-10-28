# Session 组的协作入口

本页列出跨成员、跨邻域的十条流程，以及各读者的起点。单个成员内部的流程归该成员的 `docs/flows.md`，这里不复制。每条流程的提交、重试、恢复和状态协议以[公共规格](../session-contract/SPEC.md)为准；本页只说明谁参加、按什么顺序、数据去哪里、失败时怎样，以及每一步归哪个成员。成员之间的依赖与落位见[组架构](architecture.md)。

## 跨成员流程

### F-SE01 一条输入从受理到推进

| 项 | 内容 |
| --- | --- |
| 参与者 | 入站调用方；`session-adapters`；`session` 的受理流水线、推进触发调度器与 Agent 推进协调器；`session-storage-sql`；Agent |
| 时序 | 到达经受理前拓展点 → 分流与推进裁定 → 一次日志提交 → 受理后拓展点 → 提交通知唤醒推进触发 → 没有 Run 时 Session 提交 Run 开始与首个 attempt，Agent 推进以首条输入发起执行；有执行时按到达顺序逐条交入 → 交入回执作为新事实提交 → Agent 按输入水位线承接，Session 读到承接事件后解除待处理资格 |
| 数据去向 | 输入与受理事实进会话日志；交入回执与承接事实作为新事实提交；批界由 Agent 决定 |
| 失败分支 | 受理提交未知时按操作身份认回，查不到不等于未提交；提交后出站调用未发出，由推进触发按同一操作身份重放；首条输入被消息准入拒收时 Run 以失败结束，其余输入留给下一个 Run；后续输入被拒收时只有这条输入失去资格，Run 继续 |
| 来源成员 | 受理与裁定：`session-contract`、`session`；入站与出站：`session-adapters`；提交：`session-storage-sql` |
| 成员流程 | 契约协议 [F-SC01](../session-contract/docs/flows/scenarios.md#f-sc01-打开执行与交入输入)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[输入受理与分流](../../../docs/architecture/runtime/session-and-run.md#输入受理与分流)与[受理流水线与业务流程拓展点](../../../docs/architecture/runtime/session-and-run.md#受理流水线与业务流程拓展点)。

### F-SE02 Agent 事件到日志条目

本流程为同日志候选，当前源码支持范围仍以成员状态行为准。

| 项 | 内容 |
| --- | --- |
| 参与者 | Agent；session-adapters 的 Journal 提供者与解释器；Session 日志提交者 |
| 时序 | 首次发布共同保存 Agent 事实、适用四类 CallerCommit 参加事实及 Agent 操作答案；received、材料、绑定、saved 同批。open/submit/tryFinish 的 Session 参加只读核对。后续经同一提供者 output.read/events 读事件正文，load 读 entries/results 等快照；另一笔 Session 提交共同保存后果、进度与该次答案 |
| 数据去向 | 共用会话日志，只存原来源身份或引用，不复制事件正文。事件序号用于 readThrough，entries 提交顺序/results 快照不作事件 cursor。ended 尚未解释时 cancel 可先写 cancelled；后续 ended 只留原 Run 引用，不改终态或后继 |
| 失败分支 | 首次发布失败该批全无；后续解释失败不撤销 Agent 已提交事实且不推进解释进度，各批未知均认回自身原操作。每次读核对当前资格、租户与 execution/Run；缺口隔离，不可用保持未知，未解释事实计入未结工作 |
| 来源成员 | 语义归 session-contract；Journal 形状与翻译归 session-adapters；持久实现另行兑现 |
| 成员流程 | [EC-01](../session-contract/SPEC.md#ec-01)、[F-SC07](../session-contract/docs/flows/scenarios.md#f-sc07-从-agent-事件派生事实)、[AD-02](../session-adapters/SPEC.md#ad-02) |

### F-SE03 控制传播

| 项 | 内容 |
| --- | --- |
| 参与者 | 控制调用方；`session` 的控制范围裁定、控制传播协调器与控制重放调度器；`session-adapters`；Agent；Tool 的启动围栏 |
| 时序 | 控制命令 → 裁定控制范围 → 控制意图与撤销资格提交 → 经 Agent 送达原执行；以 ToolStartAuthority 资格版本拥有者的身份调用 Tool 的 `invalidate` → 收集各生产者的实际结果，等到失效已生效 → 全部核对后标为已对账 |
| 数据去向 | 控制意图与对账结果进会话日志；失效生效计入对账进度；Run 状态按 Run 两层状态机转换 |
| 失败分支 | 送达未确认、部分生产者未答复或失效尚未确认生效时，控制重放按间隔重放；超过策略上限时，控制停在传播中并报告；Session 不直接控制模型调用或工具执行 |
| 来源成员 | 裁定与状态机：`session-contract`；协调与重放：`session`；送达与 `invalidate`：`session-adapters` |
| 成员流程 | 契约协议 [F-SC08](../session-contract/docs/flows/scenarios.md#f-sc08-条件终结与-run-终态)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[取消与归档](../../../docs/architecture/runtime/control-and-recovery.md#取消与归档)。

### F-SE04 归档级联与作用域释放

| 项 | 内容 |
| --- | --- |
| 参与者 | 归档调用方或空闲与自动归档调度器；`session` 的级联裁定、归档与级联协调器、级联推进调度器；`session-adapters` 的作用域释放插件；Tool 的启动围栏；执行环境；子会话 |
| 时序 | 归档提交，同批产生级联任务与作用域释放任务 → 传播控制，撤销资格之后调用 Tool 的 `invalidate`，推进子会话级联 → 作用域释放插件以维护者身份、凭装配注入的恢复授权请执行环境释放作用域 → 读回结果作为新事实提交 |
| 数据去向 | 级联与释放的读回结果进会话日志；释放读回事实是已释放作用域的耐久账本；对人的时间线只记「已发起释放」与读回结果 |
| 失败分支 | 读回结果按五类处置：已释放、待续、不支持、不可用、未获授权；还有待续或不可用的部分时任务保留，由级联推进再次驱动；超过策略上限时，释放与级联任务保持未结并报告维护拥有者。执行环境提供者换代时，释放插件对已归档会话的作用域按页重新释放；执行环境重启到重新释放之间的窗口是与执行环境契约拥有者的联合前提 |
| 来源成员 | 级联裁定：`session-contract`；协调：`session`；`invalidate` 与释放调用：`session-adapters` |
| 成员流程 | 契约协议 [F-SC16](../session-contract/docs/flows/scenarios.md#f-sc16-作用域释放与换代后重新释放)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[作用域释放](../../../docs/architecture/runtime/control-and-recovery.md#作用域释放)。

### F-SE05 恢复

| 项 | 内容 |
| --- | --- |
| 参与者 | 进程启动或恢复扫描调度器；`session` 的恢复协调器与待决认回调度器；`session-storage-sql`；Agent |
| 时序 | 分页扫描待对账的会话 → 读取恢复快照 → 按类别交给对应协调器 → 结果未知的提交按操作身份查询 → 已提交的回执交回原协调器 |
| 数据去向 | 认回的事实与恢复结论进会话日志 |
| 失败分支 | Agent 记录无法解释时，有界恢复者依据会话已保存的事实把 Run 收束为失败；Agent 执行已结束而会话没有 Run 终态时，读取结束事实，按 Agent 的结论写终态；执行尝试已授予而 Agent 尚未受理时按同一操作身份重放发起 |
| 来源成员 | 恢复快照读取：`session-storage-sql`；协调与扫描：`session`；Agent 侧发现：`session-adapters` |
| 成员流程 | 契约协议 [F-SC09](../session-contract/docs/flows/scenarios.md#f-sc09-推进映射与换代)、[F-SC06](../session-contract/docs/flows/scenarios.md#f-sc06-交付责任解除与重发)、[F-SC10](../session-contract/docs/flows/scenarios.md#f-sc10-迟到结果与终态后的后台结果)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[恢复的发现与收束](../../../docs/architecture/runtime/control-and-recovery.md#恢复的发现与收束)。

### F-SE06 压缩共同提交与模型视图新代

| 项 | 内容 |
| --- | --- |
| 参与者 | Request Context 的压缩转换；`session-adapters` 的历史持有者插件；`session` 命令处理；`session-storage-sql` |
| 时序 | 转换计划交给历史持有者 → 校验保留名单与压缩覆盖范围 → 压缩消息作为派生消息提交 → 模型视图开新一代 → 通知新代 |
| 数据去向 | 压缩消息进会话日志；原消息保留，人读历史按压缩记录加标记 |
| 失败分支 | 校验失败时拒绝这次提交，原模型视图不变 |
| 来源成员 | 派生消息形状与判定（`decide` 调 `judgeCompaction`）：`session-contract`；在事务内调用 `decide` 与写新代索引：`session-storage-sql` |
| 成员流程 | 契约协议 [F-SC03](../session-contract/docs/flows/scenarios.md#f-sc03-压缩转换的共同提交与-epoch-新代)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[压缩记录的提交](../../../docs/architecture/runtime/session-and-run.md#压缩记录的提交)。

### F-SE07 模型可见历史的读取

| 项 | 内容 |
| --- | --- |
| 参与者 | Request Context 的历史源读口；`session-adapters`；`session-storage-sql` |
| 时序 | 带证据、位置与预算读取 → 按当前一代的模型视图与前缀摘要取页 → 返回页与下一位置 |
| 数据去向 | 只读，不写日志 |
| 失败分支 | 证据过期或代已更换时拒绝，调用方按新代重读；读路径不可用时如实返回不可用 |
| 来源成员 | 读口形状：`session-contract`；读路径：`session-storage-sql`；对接：`session-adapters` |
| 成员流程 | 契约协议 [F-SC13](../session-contract/docs/flows/scenarios.md#f-sc13-epoch-视图读取)；机制见 [session 的机制流程](../session/docs/flows.md) |

### F-SE08 时间线投影与在途收敛

| 项 | 内容 |
| --- | --- |
| 参与者 | 人读调用方；`session` 投影；`session-storage-sql`；在途实时增量通道 |
| 时序 | 反向分页或前向小页读取 → 已提交历史与在途增量按调用键合并 → 日志条目到达后替换同一调用键的在途内容 |
| 数据去向 | 只读，不写日志 |
| 失败分支 | 故障后只可能缺从未展示过的在途片段；恢复后的展示说明缺口，不补造 |
| 来源成员 | 投影：`session`；分页与预加载：`session-storage-sql` |
| 成员流程 | 契约协议 [F-SC11](../session-contract/docs/flows/scenarios.md#f-sc11-时间线投影与在途收敛)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[用户可见内容的两处来源](../../../docs/architecture/runtime/streaming-and-consumption.md#用户可见内容的两处来源)。

### F-SE09 三条流到日志

| 项 | 内容 |
| --- | --- |
| 参与者 | Model、Tool 与 Agent 的流；`session-adapters`；`session` |
| 时序 | 模型回复流、工具内部事件流和 Agent 的 `stream` 事件都不逐块落盘 → 在途内容由生产者保管 → 收场后终态事实与结果消息进日志 → 保管或处理证据成立后确认 |
| 数据去向 | 收场事实、经准入的消息、保管或处理事实与账目进会话日志 |
| 失败分支 | 各阶段崩溃时，按生产者已保管的批次与日志已提交的事实对账；迟到结果由消费适配器读生产者事实后补交 |
| 来源成员 | 事件映射：`session-contract`；消费与确认：`session-adapters` |
| 成员流程 | 契约协议 [F-SC12](../session-contract/docs/flows/scenarios.md#f-sc12-流到日志)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[三条流不逐块进会话日志](../../../docs/architecture/runtime/streaming-and-consumption.md#三条流不逐块进会话日志)。

### F-SE10 新 Run 开始的求值与重装判定

| 项 | 内容 |
| --- | --- |
| 参与者 | 预求值与预热调度器；`session` 的推进裁定；装配协调者；Agent 宿主（以宿主创建实例的入口为前提） |
| 时序 | 来源变化时比对采用变更计数 → 计数变化时请装配协调者对本会话预求值；装配协调者求值、校验并缓存已校验装配候选 → 新 Run 开始时计数与会话选择全等就沿用，否则取候选或当场求值 |
| 数据去向 | 采用依据随 Run 开始的事实进会话日志；候选的缓存与「对哪些会话预求值」的策略归装配协调者 |
| 失败分支 | 候选校验失败时保留原合法采用并说明原因；会话租户失效时拒绝新 Run。Agent 宿主创建实例的入口定义之前，调度器只触发预求值，不调用 Agent 预建实例，见[联合前提与具名待决](../../../docs/architecture/runtime/session-and-run.md#联合前提与具名待决) |
| 来源成员 | 裁定：`session-contract`；调度：`session`；预热请求：`session-adapters` |
| 成员流程 | 契约协议 [F-SC09](../session-contract/docs/flows/scenarios.md#f-sc09-推进映射与换代)、[F-SC14](../session-contract/docs/flows/scenarios.md#f-sc14-会话冻结)；机制见 [session 的机制流程](../session/docs/flows.md) |

系统层说明见[何时重装](../../../docs/architecture/runtime/assembly-and-change.md#何时重装)。

## 按读者选择阅读路径

下表按读者列出起点、接着要读的页和停止点。精确规则只在各页的拥有者处读取，本页不复述。全组设计是候选。

| 读者 | 起点 | 接着读 | 读到这里就够 | 这些路径不提供 |
| --- | --- | --- | --- | --- |
| 调用方：创建会话、提交输入、读取历史 | [公开操作](../session-contract/docs/public-api.md) | [公共规格](../session-contract/SPEC.md)；流程 F-SE01、F-SE08 | 知道自己用哪个面、每个操作的结果与未知怎样认回 | Session 内部的协调与存储 |
| 邻域设计者：确认 Session 在本邻域扮演什么角色 | [会话与工作的邻域角色](../../../docs/architecture/runtime/session-and-run.md#session-的三层与邻域角色) | [共同提交与参加关系](../../../docs/architecture/runtime/session-and-run.md#共同提交与参加关系)；流程 F-SE02、F-SE04、F-SE06、F-SE09 | 知道 Session 经本邻域哪个公开契约、以哪个通用角色参加 | 本邻域自己的协议，它归本邻域 |
| 实现者：实现通用机制或协调器 | [组架构](architecture.md) | [session 架构](../session/docs/architecture/README.md)与 [SW-M01](../session/docs/architecture/mechanisms.md#sw-m01-技术兑现义务)；十条流程 | 知道每段逻辑落哪个成员、要兑现哪些跨能力义务 | 公开行为规则，它归公共规格 |
| 装配者：把 Session 装进 Cordis 宿主 | [Cordis 落位](architecture.md#cordis-落位) | [Cordis 服务定义](../session-cordis-contract/README.md)；[Cordis 集成约定](../../../docs/architecture/cordis-integration-conventions.md) | 知道服务键、注入关系、适配插件与存储插件怎样接上 | 各邻域的内部设计 |
| 存储提供者：实现事务端口 | [session-storage-sql](../session-storage-sql/README.md) | [公共规格](../session-contract/SPEC.md)；流程 F-SE05、F-SE07、F-SE08 | 知道要提供的事务、读路径与符合性要求 | 治理判断，它归契约与通用机制 |
