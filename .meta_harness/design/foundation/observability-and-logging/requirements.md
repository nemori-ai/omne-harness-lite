---
kind: system-requirement
ids: [SYS-OBSERVABILITY]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/system/observability-and-logging.md
source_sha256: 5bd5a170d6e36db1d7c907abcf70e1ca7700baed1311980a40f8aafec8115da6
source_anchor: "heading:# SYS-OBSERVABILITY：全链路可观测与日志完备"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---

# SYS-OBSERVABILITY：全链路可观测与日志完备

2026-09-12 用户明确新增：系统要全链路可观测、日志完备，这是对工程研发的
要求，并纳入架构约束。本条是独立系统要求，约束所有能力及其组合的设计、
实现与验证；不以单个工具状态界面或面向用户的会话查询代替工程观测。

## 已确认要求与工程含义

- **SYS-OBSERVABILITY.C1：完整链路可诊断。** 工程研发应能追踪一次工作
  从入口到实际结局，判断是否已接受、到达哪个阶段、正在等待什么、发生了
  哪种失败以及哪些结果仍未知。覆盖用户/外部信号/日程触发、身份与授权、
  配置和能力装配、Session/Run/Step、模型与工具、Sub-agent、后台工作、HITL、
  Connector 与知识/认知服务、制品读写、状态持久化与恢复以及回复/通知交付；
  没有 Session 的系统工作同样可观测。
- **SYS-OBSERVABILITY.C2：跨边界关联不中断。** 适用的租户、主体、工作
  身份及因果关系应能贯穿异步消息、排队、派发、后台脱离、进程/节点边界和
  运行时重建。能区分同一逻辑工作、各次尝试及运行实例，关联实际模型、插件/
  配置版本和执行环境；时间戳顺序、因果先后与同一流程归属分别表达。
- **SYS-OBSERVABILITY.C3：关键状态和异常有完整日志依据。** 接受/拒绝、
  开始、等待、恢复、取消/中断请求与实际结果、完成/失败、重要配置/权限/插件
  变更，以及不可确定的外部效果，均有可定位和解释的记录。不得吞错、仅记录
  “操作结束”而抹去失败，或以缺少终态记录冒充仍在运行。失败信息应能定位
  所属阶段和组件，日志不只依赖某个已销毁运行时的控制台输出。
- **SYS-OBSERVABILITY.C4：性能、资源和成本能够关联分析。** 具备观察
  延迟、等待/队列、吞吐、失败、资源压力、能力就绪及持久化/交付进度的必要
  数据，与日志和工作轨迹可关联。逐 Step 金额及财务真相归额度与账目的 owner；遥测估计
  或采样不能直接冒充完整账单，也不能仅靠一张总量仪表图声称链路完整。
- **SYS-OBSERVABILITY.C5：观测系统自身的缺口可见。** 采集、传输、存储、
  导出或查询失败，以及延迟、采样、丢弃、保留期到期造成的覆盖缺口有可辨认
  状态。关键生命周期、失败和审计依据不能因普通诊断采样而无声缺失；缓存、
  资源占用及保留策略有边界。故障时按明确策略阻止依赖必要记录的动作、保留
  待补记录或报告未知，不能让监控故障制造假成功。
- **SYS-OBSERVABILITY.C6：读面可用且受治理。** 获准研发、评估和诊断
  主体能通过可查询/导出的程序化记录定位问题，展示界面可建立在同一依据上。
  采集、保留、查询和导出均遵循租户与内容权限，秘密值应脱敏或排除；日志完备
  指关键事实、结果及关联覆盖，不要求无限保留所有原始 payload，也不要求
  获取模型未提供的内部推理过程。
- **SYS-OBSERVABILITY.C7：设计和验证检查观测覆盖。** 新增或修改能力、
  插件和跨边界流程时，一并明确正常、拒绝、异常、中断、重试和恢复路径的
  观测责任及缺口处理。验证应能凭所留记录判断已发生结果，不能只证明代码
  打过日志；未覆盖范围及采用故障假设应如实报告。

以上 C1–C7 是本轮要求结合既有真实性、租户隔离和来源观察的工程细化。
具体事件契约、指标、留存时限、故障策略和性能目标待逐能力定义；不预选
OpenTelemetry、日志后端、统一 EventLog 或特定部署拓扑。

## 关联与边界

支撑 [SYS-LONG-RUNNING](../long-running-and-evolving/requirements.md) 的稳定运行和演进判断、
[SYS-RUNTIME-CONTINUITY](../runtime-state-and-continuity/requirements.md) 的恢复诊断，以及
[SYS-DYNAMIC](../fully-dynamic-system/requirements.md) 的装配和运行变化可解释性。
架构侧引用本条，不再维护另一份同义要求。

工具过程的对外披露、Agent 的历史查询、账单与单步金额，分别归各自的产品设计；
本条只拥有工程观测本身的义务，不替它们规定披露形式。
观测读取不重执行动作；业务持久事实、工程遥测与面向用户的披露权限分别判断，
不能因研发需要诊断便默许跨租户内容访问。

返回[基础前提](../README.md)。
