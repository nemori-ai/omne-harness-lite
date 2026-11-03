# 日程与 Job 实现的复用、依赖和工具边界

本页把功能分配给社区实现、系统公共能力和本域实现。Schedule 的规则依赖已锁定为 rrule 2.8.1、cron-parser 5.10.3 和 Temporal 0.5.1。固定 Python 源的判别探针与纯计算公开根用例验证了下列适配方案。纯规则枚举和 DST 物化已实现；worker 隔离、日历条件流水线和端到端调度尚未交付。已有产品政策与验收以[行为契约](../schedule/SPEC.md)为准。Calendar A1 的实际采用见其[复用规划](../../calendar/docs/reuse-plan.md)。

## 社区与标准库复用

| 功能                        | 首选及状态                                                    | 本域落点                                                                        | 适配与采用条件                                                                                                                             |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 时区、civil 与 instant 转换 | `@js-temporal/polyfill@0.5.1`，ISC，项目技术基础已采用        | `schedule` 时间物化                                                             | 显式 gap/fold 政策；Node24、ICU/tzdb 和固定样例验证。复用[Calendar 日期选择](../../calendar/docs/reuse-plan.md)                            |
| RRULE 解析与候选枚举        | `rrule@2.8.1`，BSD-3-Clause，已锁定；不同时采用第二引擎       | `schedule` 内部薄适配                                                           | 对照固定 Python dateutil 输入，覆盖全部已接受语法、DTSTART、WKST、BYSETPOS 与边界；不同时长期维护两套生产引擎                              |
| cron 解析与候选枚举         | `cron-parser@5.10.3`，MIT，已锁定                             | `schedule` 内部薄适配                                                           | 先按产品限制五字段及允许语法，再枚举；验证 DOM/DOW OR、周日 0/7 与窗口边界。库 strict 模式要求六字段并限制 DOM/DOW，不能直接作为产品验证器 |
| 唤醒与取消等待              | Node `timers/promises`、`AbortSignal`；不额外安装 cron runner | `schedule-local` 扫描唤醒                                                       | 定时器只唤醒扫描，持久事实决定到期工作。长等待分段，唤醒后重读墙钟，区分单调耗时与业务时间                                                 |
| 可终止规则计算 worker | `piscina@5.3.2`，MIT，已锁定并完成取消/队列/退出探针；本域适配待交付 | `schedule-local` 计算隔离 | 显式并发和队列上限；deadline 包含排队；取消中止计算，dispose 等待线程退出；不作为业务队列 |
| JSON 规范化                 | `canonicalize@5.1.0`，Apache-2.0，与现有Calendar采用一致      | `schedule-contract` 的版本化指纹适配；Calendar 如有同义需要直接使用同一社区依赖 | 严格 JSON 前置、RFC8785 测试向量、Unicode、数字与整数形键、跨语言 golden；不为共享函数让 Calendar 反向依赖 Schedule                        |
| SHA-256 与随机身份          | Node `crypto`                                                 | 实际摘要及操作身份拥有者                                                        | 对已规范化字节计算摘要；恢复复用原操作身份，不因重试生成新键                                                                               |
| 测试时间与断言              | 仓库已有 Vitest                                               | 各成员 tests 与 acceptance                                                      | 墙钟、单调钟、等待分别控制；假时钟不代替进程重启与真实存储验证                                                                             |

`rrule` 官方说明其行为源于 python-dateutil，并列出 DTSTART 和 RFC 差异，因此先以它对照源系统。选择不是仅凭下载量或库自报性能。`rrule-temporal` 的 includeDtstart、strict、预算及 Temporal 类型同样必须经过目标语义验证。

直接来源：[rrule](https://github.com/jkbrzt/rrule#differences-from-icalendar-rfc)、[rrule-temporal](https://github.com/ggaabe/rrule-temporal)、[cron-parser strict](https://github.com/harrisiirak/cron-parser#strict-mode)、[Node24 timers](https://github.com/nodejs/node/blob/v24.x/doc/api/timers.md)、[canonicalize](https://github.com/erdtman/canonicalize)、[RFC8785 参考实现](https://github.com/cyberphone/json-canonicalization)。版本最终以采用时锁定的发布物为准。

### 规则库的适配责任

固定源为 omne-next `a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0`，对应 dateutil 2.9.0.post0 与 croniter 6.2.2。探针覆盖全部标准RRULE关键字的判别样例，不是组合穷举。合法源表达范围不能缩为常用频率。

- RRULE的DTSTART、COUNT、UNTIL继续由外部字段表达。库只枚举civil，不能自行扣合格次数或处理实际IANA时区。
- BYEASTER列表按同一锚定年份收集库的子流，先并集去重再统一BYSETPOS，最后筛起算边界。不能对子流分别取位置，也不能先裁起算再把后面的日期提升为第一位。
- cron的W、L/#、多序数、环绕步进与同端点范围使用有界规范化和库枚举。W是周一至周五的cron条件，不代表法定工作日。W与显式DOW同时受限时按目标DOM/DOW OR并集，固定源忽略DOW的行为是具名适配差异。
- 随机R/H、非正间隔、越界时间字段按目标确定性和合法值政策拒绝。合法但不存在日期的规则不能因为库提前拒绝而误报语法错误。
- rrule的内部搜索可能不产生候选回调。外层候选计数不能证明计算有时间上限。local须用可终止worker守住执行deadline；超时明确不完整，不能报完整空集。

rrule 2.8.1 的内部 `Date.UTC` 会把 0–99 年解释成 1900–1999 年，使合法有限规则误报耗尽。工作区通过 `patches/rrule@2.8.1.patch` 修正 CJS 和 ESM 发布物的 UTC 日期构造；规则算法和版本不变，补丁哈希由锁文件固定。公开根回归覆盖 0000、0001、0099、0100 年、零年闰日和 Easter。升级时若上游已修复，须先在无补丁版本通过这些用例，再删除补丁与登记。该补丁属于本域采用责任，不建立第二套规则引擎。

Piscina 的线程管理和 AbortSignal 行为以锁定发布物为准，来源见[官方文档](https://github.com/piscinajs/piscina)。外层只补本域容量、截止时间和结果分类。取消结果不宣称线程已经物理退出；dispose 完成才表示池已停止。线程启动或替换期间仍可能需要内部排队，容量必须按本域已接纳任务计算，不能把内部零队列误作零等待保证。

新增传递依赖包括 Piscina 使用的 `@napi-rs/nice` 及平台可选包、rrule使用的tslib及cron-parser使用的luxon，实际版本以锁文件为准。独立探针的tslib版本与工作区可能不同，正式验证必须运行工作区确切发布物。只比较明确反例所需的替代方案，不额外维护cron runner、通用队列或工作流平台。

## 系统能力与实际状态

| 能力                               | 复用入口和状态                                                                                                                                    | 本域工作及边界                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 日历事实与计算                     | Calendar A1 提供公开值、查询与计算入口，形状由 calendar-contract 源码拥有；Schedule 实现与真实跨域采用未交付                                      | Schedule 消费版本、覆盖与计算结果，不复制三历供应或维护第二套日历表                                                  |
| 身份、时间、JSON、Schema、操作结果 | [Calendar 公共能力表](../../calendar/docs/reuse-plan.md#系统公共能力)列出的已有入口                                                               | 按 codec/Schema 协议使用，本域只定义自己的结构和业务约束                                                             |
| 内容块、采用和耐久引用             | [content-block](../../common/content-block/README.md) 已实现；[exchange-refs](../../common/exchange-refs/SPEC.md) 为纯类型                        | 反馈和成果复用内容形状，引用不替代授权读取或真实耐久保管                                                             |
| 本地持久化                         | [sql-contract](../../storage/sql-contract/SPEC.md) 与现有 [sqlite-provider](../../storage/sqlite-provider/SPEC.md)                                | local 实现本域迁移、唯一约束、参加者、outbox 和恢复查询；装配选择介质。保留 L-1/L-4 等限制，不自建通用队列或分布式锁 |
| 授权与同意                         | [authorization](../../identity/authorization/README.md) 有公开实现                                                                                | 复用判断与证据协议；不能把一次判定当成未来执行授权。所需当前资格、撤权或跨服务围栏若不满足，交回原拥有者             |
| 生效设置                           | [settings](../../assets/settings/README.md) 为草稿                                                                                                | 本域只消费有效环境快照与依据，不实现用户设置服务                                                                     |
| 会话承接与 Agent 执行              | [Session 契约](../../session/session-contract/README.md)、[Agent 契约](../../agent/agent-contract/README.md)存在；完整 JobExecutor 接缝需逐项验证 | 只有 local 中外部执行适配认识这些公开契约。核心不导入外域运行实现，不自建 Session/Run 或推进循环                     |
| 程序调用                           | [执行环境契约](../../execution/execution-environment-contract/README.md)及装配提供的已登记程序能力                                                | 将固定 program 意图交给具名执行器；不另造 shell/进程宿主。所需设施未实现时保留依赖缺口                               |
| 通知、成果准备与发布               | [notification](../../notification/notification/README.md) 当前为空导出；结果提供者按实际拥有者供给                                                | 本域保留交接意图、关联与结算，不能补写渠道、内容仓或发布服务来冒充集成完成                                           |
| Tool 运行与注册                    | [tool-contract](../../tool/tool-contract/README.md)、[tool-cordis-contract](../../tool/tool-cordis-contract/README.md)                            | tools 使用贡献、调用和结果协议；不实现注册表、调用账本、授权或并发运行器                                             |
| HTTP/SDK、DRB 与最终应用装配       | 由接入、DRB 和应用拥有者接入；现有 SDK transport 仅支持其已声明的位置和 loopback 范围                                                             | 本域提供协议及符合性样例，不进入这些包补消费者。现在没有可直接复用的 Calendar/Schedule 跨机器客户端                  |

## 规范化与公共值

复用公共语义不等于传递内存对象。legal-identity 和 utc-instant 的 opaque 值经各自 encode/parse 跨边界；SchemaRef、Clock、AbortSignal、Service 和 SQL 参加者只用于进程内接口。instant 的精度、闰秒及 wire 限制必须显式校验，不能静默损失信息。

json-text 保留 JSON 表示信息，并不提供 JCS。仓库里的存储和模型私有 canonical 函数不能深导入。authorization 的 canonicalText 服务于授权语义，不能直接认作严格 RFC8785。本域优先使用经过严格输入验证和测试向量核对的社区 canonicalize，不复制第三份通用实现，也不自行扩建 common 包。

公共成功/失败结构优先消费 operation-result，但 pending、blocked、unknown 与终态仍是本域必须明确的联合分支，不能为了适配包装器而丢失信息。

## 本域必须实现的政策与协调

- civil 候选、日期边界、排除、日历 predicate/adjust、结果日期复核、DST 物化、同刻合并的确定顺序。社区库只提供算法步骤，不决定整条业务管线。
- D3 环境选择、D4 eligible/job 双计数、D5 草稿与替换、D9 补执行及重叠政策。RRULE 的 COUNT 不能代替本域 eligibleLimit。
- 人、Agent、调度器的来源，program/agent 执行意图，新/已有会话目标，冻结 instruction 与动态 AgentDefinition 采用关系。
- Job 接受、原操作查询、业务取消、履约和结果阶段的状态，以及本域 outbox、恢复扫描和幂等约束。
- 本域执行/通知/成果适配和诊断。适配器必须保留原操作身份与 unknown，不推测外域已经失败或完成。

这些是本产品的规则，复用通用队列不能替代。当前不引入 BullMQ、pg-boss、Agenda、Temporal workflow 或 Inngest，也不自制同类平台。需要新增独立调度基础设施时，先证明既有 SQL 与本域最小恢复扫描不能满足具名需求，再由系统拥有者决定。进程内 cron runner 不能成为持久调度权威。

## schedule-tools 提供什么

本包提供 Agent 工具贡献插件和结果投影。目标动作沿[已有工具映射](../schedule/docs/public-api-design.md#8-独立-agent-tools)，不在这里维护第二份签名。

| 提供或排除的工具面                                | 本包责任                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `schedule`                                        | 查询、预览、agenda、历史；创建、草稿修订、更新、暂停、恢复、停止、转正、丢弃、替换及同意重确认；按动作分别授权          |
| `job`                                             | 创建、查询、取消及查询原创建操作；Agent 来源会话由可信上下文提供，不允许模型填写可信来源                                |
| `schedule_subscription`                           | 已确认订阅能力的查询和控制，消费相应应用契约                                                                            |
| 当前 Job 的内部反馈                               | 如需工具形式，只能采用受信执行绑定和独立能力准入；普通工具不能凭模型提供的 jobId 获得写权。精确动作由相应契约采用后实现 |
| `session_wake`                                    | 属于 Session 工具，明确不进入本包                                                                                       |
| 供应发布、调度 tick/admit、数据库管理、提供者恢复 | 系统内部或管理能力，不默认成为普通 Agent 工具                                                                           |

tools 不提供 HTTP 服务、业务存储、定时扫描、Job 执行器或 Tool runtime。它通过 Cordis inject 消费服务定义，运行时可注入 local 服务或未来远程客户端。创建和修改的稳定操作键由可信适配器按原调用保管；查询操作不会重新执行命令。输出保留 kind、原操作定位、状态和必要依据，不能为压缩内容删掉 unknown 或失败信息。

工具描述和公开 schema 是声明，不是已经注册。Calendar 与 Schedule tools 均有独立贡献实现。Schedule 的原调用恢复、固定结果披露与宿主配置沿 [tools SPEC](../schedule-tools/SPEC.md)；生产宿主仍须接入可信提供者和通用读取 guard。

## 派发前的依赖决定

每个实施闭包先列“现成能力、实际公开入口、版本、状态、自有差额、验证和停止条件”。没有这张表，不派发通用 parser、时区算法、存储引擎、DI、队列、重试平台或 RPC 框架的自研任务。

| 时点                    | 必交证据                                                                                   | 决定                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 日历纵切前              | 目标 Node24/ICU/tzdb 与日期、CSV/编码、ICS 的固定输入探针                                  | 选定唯一生产实现，只有实际需要才加入备选库                     |
| 日程规则纵切前          | 固定 Python source/dateutil corpus；RRULE 全合法语法与 cron 产品子集的差分，DST 和候选预算 | 主候选可薄适配则采用；否则以具体反例比较替代库，不能静默砍语法 |
| 原操作指纹实现前        | 严格 JSON、RFC8785 向量、跨语言字节和 source/target fingerprint 区分                       | canonicalize 通过后采用；不借用外域私有函数                    |
| local 恢复实现时        | 提交前后、丢回执、重复唤醒、时钟跳变、取消与重启的本域验证                                 | 只补本域机制，不扩大底层存储承诺                               |
| 外域适配与 tools 接入前 | 已采用公共契约、能力矩阵与本域符合性测试                                                   | 缺口形成交接文档；不跨出 Calendar/Schedule 写入边界            |

探针是有界选型工作，不重复做完整库评测。每个候选先跑与本域有关的最小判别样例，再随实施纳入完整回归。没有稳定输入前不比较性能；优先语义、维护、许可证、依赖成本，再看满足实际负载的性能。

本域真件测试、替身符合性测试与跨域真实联调分别记账。系统集成由装配拥有者负责，消费者接入由各消费领域负责。未完成部分保持具名责任，不把本域测试通过写成系统级交付完成。
