# Model 领域实现规格

本包非 pi-ai 实现设计已接受，源码尚无运行能力。pi-ai 相关细化保留候选，具体范围见[组架构](../docs/architecture.md)。共同领域行为与提供者协议由 [model-contract](../model-contract/SPEC.md) 唯一维护；本页只补本实现的执行、配置及资源义务。

## 独立执行

独立函数 `executeModel` 执行一次供应商请求，不重试、不保管、不 ACK。其 signal 请求该次传输停止，返回事实仍须区分请求取消与真实停止。托管模式的观察 signal 不传给它。托管模式只有原调用的有效控制可以请求传输停止。

`executeModel` 选用 request.suppliers 的首项，仅执行一次。需要另一供应商时调用者必须形成新的明确执行，不能把此函数冒充托管 fallback。

独立调用在 start 前观察到 signal 已取消时，只返回 not-started/cancelled，不调用 start。prepare 或 materialize 的四种声明失败原样放入 not-started/rejected，不改成托管提交失败，也不抛异常代替该结果；准备或物化过程意外抛错映射为 unavailable 及安全诊断。materialize 返回后、start 前再次检查取消及当前资格，已取消则 not-started/cancelled，失权则 not-started/rejected。已取得资源始终 close。开始发送后不再允许 not-started，signal 仅请求停止；只有传输确认停止才返回 ended/interrupted，未确认且失联返回 ended/failed 的 stream-lost，不虚构停止。竞争中实际 completed 仍报告 completed。流上恰好一个终结结果，消费者主动放弃读取不代表已取得终结事实，释放时仍关闭本次资源。

发送准备、物化回执、同步 start 与两级资源关闭的完整协议见 [传输协议](../model-contract/SPEC.md#342-独立执行与提供者操作)。其余托管行为直接遵循该规格，不另写状态机。

## 工厂与配置

createModelRuntime 的构造形状由 [公开入口](docs/public-api.md) 唯一维护。outputBatchBytes、observerBufferBytes、resultPageBytes、readIdleMs 为正整数；outputBatchDelayMs、retryBackoffMs、cleanupRetryMs 为非负整数。一次已取得 read 沿原期限，不因配置换代缩短。

构造所需 Commands、send、retry、instances 和 clock 必须显式取得；缺失时不得装成可用实例。工厂返回 ModelRuntimeProvider，普通消费者只取得其 runtime；恢复和 quiesce 的权限及原身份协议沿共同规格。

| 构造依赖 | 取得与义务 | 缺席、换代和释放 |
| --- | --- | --- |
| commands | 必需构造注入。提供者拥有本域存储、当前资格及提交组合 | 不可用时不能认成功；替换先排除旧写者并接续原操作，不靠清空缓存恢复 |
| send | 必需构造注入。内部组合当前授权、#279 凭据、真实传输和发送围栏 | 缺席不发；在途连接的资源与未知归旧传输负责，新边界不得复制旧 dispatch |
| retry | 必需策略实现；原 request 的采用和允许范围约束每次决定 | 不可用则不再试并以 policy-unavailable 收场；替换不能重做已持久的决定 |
| instances | 必需实例宿主。登记能力只供 Model 提供者，目录供消费者 | 宿主退出撤路由；事实/保管不消失。后继先接管原责任再发布新实例 |
| clock | 必需时钟/等待能力；时间值为 UTC instant | 时钟不可用不虚构超时或许可；取消等待不取消原调用 |
| configuration | 构造时校验的纯数据，原实例固定采用 | 数值为有限整数，容量/页/空闲期限须正；延迟/退避可为零。替换只影响新实例，恢复读取已固定的在途期限 |

retryBackoffMs 是本实现的默认退避；次数、接收方及首内容边界沿共同重试协议。

配置不设未经测量的生产默认值。发行装配必须显式提供全部字段并注明来源，策略默认仍严格采用 SPEC 的供应商顺序与次数规则。缺配置是加载失败，不是隐式无界队列。输出队列满时背压，观察者落后时结束该观察并允许快照重连；不能因慢观察者无限保存重复快照。resultPageBytes 限制页内联大小，超大单块通过原已获准的耐久附件引用读取，不任意截掉块内容。

outputBatchBytes 与 outputBatchDelayMs 控制持久输出批次。未确认批次不向观察者发布，首内容窗口与游标仍沿[共同协议](../model-contract/SPEC.md#展示诊断与实施证据)。

## 实现与验证

[内部架构](docs/architecture.md)、[流程](docs/flows.md)和[构造对象](docs/object-model.md)描述具体协调。框架目录定义归 model-cordis-contract；宿主装配设计暂在[本成员装配页](docs/cordis.md)，model-host-local 尚未初始化。当前测试只核模板入口为空，不证明发送、耐久、恢复或取消。

## 构造与关闭的可观察行为

本实现的三个独立能力工厂只组合算法，不启动运行。createModelRuntime 返回带driver的 ModelRuntimeProvider，普通runtime不暴露driver。装配者须完成显式host绑定，才能公开受理；绑定失败不得返回“可用runtime”。既有替代提供者无需复制这些工厂，但必须符合领域协议。

调用已经持久受理而schedule失败时，返回原受理事实，不伪装未受理。提供者记录唤醒失败并由恢复扫描续排。query和recover不得为了返回可用状态创建第二次逻辑调用。quiesce停止新的业务受理，仍允许已受理工作调度，不撤销原责任；现有查询、控制、结果保管及清理按可用依赖继续。

本地关闭期限属于宿主配置，不是业务取消期限。到期时只能报告仍有未决资源；不能借超时宣称物理停止。故障恢复、真实执行者排除及旧写核实的前提由[宿主设计](docs/cordis.md#本地调度与执行者排除)维护。受理、发送和保管已承诺的事实不因构造方式改变。
