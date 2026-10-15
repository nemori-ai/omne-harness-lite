---
id: RFC-0001
title: 系统技术基础与公共设施
revision: 4
status: accepted
owner: PanQiWei
---

# RFC-0001：系统技术基础与公共设施

规则与维护责任见[RFC入口](README.md)。PanQiWei于2026-10-13接受本提案revision4，精确范围见[技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/197#issuecomment-6135131457)。方案和接受范围固定，当前规范从下方写回表定位实际拥有者；规范写回定位于工作分支，main运输另行办理。技术采用、规范切换、Git运输、实现及任务接受分别判断。

## 问题与有效输入

系统需要明确公共设施的技术路线、异步执行、事务与结果保管、可靠队列、容量和真实关闭机制。依赖清单须配合可实施机制，才能让提供者保全长期运行、租户隔离和已确认事实。

所核输入为main `02c0fc82dfc254fe598922daabf319b18e39b600`。开发和部署环境须支持Node24，调查执行机的运行限制只影响调查证据覆盖。在该输入修订中，packages/apps只包含文档；目标消费者不等同于已实现消费者。

| 要求或承诺 | 核对条款与源 | 本提案受什么约束 |
| --- | --- | --- |
| 项目全局保证 | [SYS-OPEN、SYS-TENANT、SYS-DURABILITY等](../requirements.md) | 独立能力、身份隔离、已确认事实及真实结果不因技术选择降低 |
| 包责任与准入 | [包组织](../package-organization.md)、[领域责任](../domains/README.md) | 全部22目标组及apps/tools已核覆盖；不把common/time/telemetry/assembly变成杂物，不造空成员 |
| 数据与生命周期 | [数据与状态](../architecture/data-and-state.md)、[生命周期](../architecture/deployment/cordis-and-lifecycle.md)、[IC](../architecture/cordis-integration-conventions.md) | 同提交、原调用、在途责任和Cordis4.0.4边界保留 |
| 后端、执行与安全 | [基础设施采用政策](../architecture/deployment/infrastructure-policy.md)、[执行与通信](../architecture/deployment/execution-and-communication.md)、[执行隔离](../architecture/security/execution-isolation.md) | Redis正式队列政策、治理SQLite限定及恶意代码设防继续有效 |
| 文档唯一源 | [文档治理](../engineering/documentation.md)、[成员文档](../member-documentation.md) | 采用后回真实拥有者，不新增中央全模块SPEC；原始调查/矩阵/评审/日志继续留任务tmp |

## 建议与改变范围

建议采用下面的共同技术路线和设施机制。以下内容是拟写回设计的完整审议范围，未经采用不构成正式实施依据。字段、公开函数、各领域终态及产品政策仍由相应成员和原拥有者细化。

| 受影响拥有者 | 现行保证或机制 | 拟细化内容 | 保持的条件 |
| --- | --- | --- | --- |
| 系统架构与工程环境 | 已接受异步、有界、独立能力要求 | Node24及编译/Schema/网络/观测/客户端共同选型 | catalog/锁仍唯一，支持Node24的开发和部署机器，真实提供者未实施 |
| 存储与共同提交协调者 | 已接受真实事务域与可靠确认 | SQLite专用Worker、参加者、原身份回执、outbox/inbox、缓存/迁移 | 业务事实归原拥有者，不由数据库取得领域权威 |
| 原Model/Tool与保管提供者 | 原结果/费用独立生命周期 | 发出前同提交整项容量预留，跨换代及未知保留 | 无法兑现上界不准入，不授截断、丢结果或无界存储例外 |
| 各资源与应用协调者 | 控制/结果/清理必须有机会，退出结果真实 | 能力自有池、租户DRR、显式准入、旧租约及关闭报告 | 不从disposer、超时或租约推断实际终止和回滚 |
| 执行与观测提供者 | 不可信代码设防、获准诊断 | 受限JS profile及结构化观测设施 | profile符合性不足不开放，日志/遥测不代替业务持久事实 |

## 共同技术选择

本提案定义系统共同技术选择、必要理由和复核条件。它承接[项目要求](../requirements.md)、[包组织](../package-organization.md)及已接受系统边界，不定义各业务模块的字段、终态或产品规则。领域、公开契约、提供者与应用分别维护自身责任。

### 范围与采用边界

共同设施复用成熟机制，业务状态与原调用身份仍由原拥有者决定。纯能力根入口独立消费，Cordis绑定沿[IC约定](../architecture/cordis-integration-conventions.md)，不把数据库、网络或运行实例导入共同表示。time、telemetry、common只有真实共同需要及具名消费者时才建立成员，不由本页批量授予包准入。

下表列出技术基线及选择规则。现有依赖的精确版本以catalog和lockfile为准，新增基线须在实施任务中锁发布物和传递依赖；本文不是第二份依赖锁。采用路线不表示提供者已实现、性能达标或平台已支持。产品制品须在支持Node24的机器验证；调查执行机的限制只缩小调查证据范围，不改变开发和部署环境要求。

### 共同选择与替代

| 项目与范围 | 采用路线及版本前提 | 替代与未选理由 | 实施准入和复核 |
| --- | --- | --- | --- |
| 产品与工程运行时 | Node24，产品SQLite发行基线24.21.0；现有开发工具engines保持原声明。Cordis保持4.0.4，不跟进DSH alpha | Bun1.4.3通过局部ESM、Cordis和Worker关闭探路；完整Worker支持、diagnostics及原生库兼容仍须验证，不从Claude Code的选择推导兼容 | 精确补丁及制品摘要、原生依赖、ICU/tz、Cordis、Worker及关闭由应用验证。运行与构建归[workspace](../workspace.md) |
| 编译与构建 | 保留catalog的TypeScript6与NodeNext/strict，库默认tsc输出ESM和声明，应用按需要使用现行esbuild | TS7.0.2根入口不能直接承接现有createProgram/createSourceFile消费者，另有unstable API但须迁移验证，不全仓替换。必要库bundle可单独比较tsdown0.23.1；tsup8.5.1停止积极维护，不新引入 | 现有TS API工具消费者、声明、独立安装与资源文件必须同步验证；bundle不代替类型检查，不按不同制品职责的耗时排名 |
| 配置与数据Schema | 保留现行Zod4及Standard Schema。Zod4.6.5的纯同步支持子集使用显式z.compile并缓存，递归或其他不支持形状走明确的运行时路径。已由JSON Schema拥有形状的边界保留Ajv8，关闭coercion/default/remove。每份形状一个拥有源，派生TS类型 | TypeBox1.3.36及ArkType2.2.8保留为同义编译校验对照；局部耗时不授全仓切换，不能同时手写第三套字段。Standard Schema只是接口，不保证异步/高性能 | Cordis4.0.4配置验证保持同步，网络/文件检查归初始化。编译子集和callback纯度须验证，不能把回退或异步路径记为编译命中。Schema生成拒绝损失精度/未知语义的转换 |
| 严格JSON与数值 | jsonc-parser3.3.1的visitor/scanner；逐对象检测解码后重名键，数值保留原词法后交字段codec | JSON.parse后已丢重名和精度。lossless-json4.3.1裸用会接受等值重复键。大增量输入可比较stream-json3.7.0，必须保留同一拒绝语义 | 禁注释/尾逗号/空输入，任一语法错误整份拒绝，严格UTF-8及项/深度/字符串/数字预算；具体责任见[共同表示](../architecture/cross-cutting-concepts.md#表示与校验) |
| 数据访问与迁移 | SQL提供者使用现行Kysely作为类型化查询构造与迁移辅助；字段/迁移归数据拥有者，提交归真实事务域 | 不首选统一ORM或全系统事件溯源，避免以对象活体替持久契约；原生参数化SQL可用于Kysely未覆盖路径，只有同一提供者拥有 | Worker内提供者显式适配node:sqlite执行和返回值，通用事务回调不跨线程。SQLite默认Migrator不保证DDL原子回滚。需要原子的迁移须在同连接事务中验证DDL、数据与迁移标记一起回滚；事务外恢复步骤另承诺可恢复性，不能替代原子性。迁移开闸/失败/恢复由[数据架构](../architecture/data-and-state.md)承接 |
| 本地SQLite | node:sqlite专用Worker，Node24.21.0内嵌SQLite3.53.4为基线；一事务域一写连接。WAL、FULL、foreign_keys开启并读回 | better-sqlite3 13.0.3专用Worker作原生维护成本对照。sqlite3 6.0.1可作需要运行中interrupt的提供者对照。libSQL0.18.0本地file路径仍同线程同步，Promise/池不足以离开控制线程 | 内嵌引擎须含WAL-reset修复，读回sqlite_version、compile_options、PRAGMA和物理存储前提。不扩大为系统唯一后端，见[基础设施采用政策](../architecture/deployment/infrastructure-policy.md) |
| 其他数据库与大内容存储 | 非local及多节点提供者保持独立接口；PostgreSQL路线使用现行pg/Kysely及其事务租约，按真实任务选择受维护服务端版本和固定制品。附件/制品按受控引用保存 | 没有明确集群需求及消费者时，不建立数据库集群或对象存储依赖。JSONL/JSON文件可用于符合所属契约的内容或导出，不能替代必要同提交与耐久确认 | 后端capability、可达范围、迁移及故障验证须明确。只保存临时URL不足以确认附件耐久；媒体写入/刷新/引用承接归内容拥有者 |
| 可靠队列 | 保留Redis正式后端，采用Streams consumer group和node-redis6.3.0，SQL outbox/inbox为可靠业务交接依据 | Pub/Sub断连可丢，不作可靠工作交接。BullMQ6.3.13在实际需要Job调度时再作为提供者，Job状态不能替代Run/调用事实 | Redis服务端使用含XAUTOCLAIM且若承诺Redis耐久则含WAITAOF的受维护补丁，实施时锁定服务端镜像及配置。XADD/XACK不解除SQL责任，见[可靠交接](#设施层可靠交接) |
| 模型适配 | 模型请求优先使用pi-ai1.1.0统一供应商适配。OMNE拥有调用、结果和费用契约，pi-ai不取得runtime或原调用的所有权 | 官方SDK或受管fetch作为pi-ai不能满足具名供应商要求时的备选，须明确原因及采用范围，不静默切换。pi-ai内部EventStream无容量上限，仅包装外层iterator不能消除内层积压 | 每供应商验证生产端背压、有界流、参数及原结果保真。重试由model runtime统一控制，核对真实发出/首内容/费用/未知；不能关闭的隐式重试须显式纳入该控制。未兑现有界与结果保管的profile不开放，不给默认供应商或付费预热授权 |
| 网络与连接池 | Undici8.11.2，使用同版本fetch并显式注入dispatcher。按origin、代理、TLS/mTLS、连接资格及代际复用 | 不让租户插件修改全局dispatcher或环境。全局策略只可由单一应用拥有者显式控制，并保持原调用资格 | Pool.connections必须有限，独立限制准入/排队字节/响应缓冲/超时。认证头按请求传递；destroy不等于未发出，旧池关闭须真实观察 |
| CPU与阻塞执行 | 可信纯计算选Piscina5.3.2，有界线程/队列，外层租户公平。阻塞SDK、PTY、浏览器和外部工具由execution/Tool选择相称进程与监督 | 不把普通异步I/O放线程池，不把数据库事务随机分发到CPU池。专用Worker可用于固定状态/原生接口，不能由池隐式决定业务寿命 | maxQueue、线程数、项/字节/任务尺寸均有限，受管任务须完成全部异步工作才归还。Worker不是恶意代码安全域 |
| 受限JS与不可信代码 | 受限JS profile选QuickJS WASM0.32.0，专用Worker监督，仅受控数据桥接。默认guest Promise/pending jobs，不用Asyncify | isolated-vm7.0.1保留对照，其memoryLimit不是安全上限且宿主引用泄漏危险。node:vm、Cordis isolate和普通Worker均不作安全保证 | 先满足[执行隔离](../architecture/security/execution-isolation.md)的准入和否定测试。任意Node插件、原生模块、shell及浏览器使用OS隔离profile，未有合格profile就拒绝对应执行，不静默降级 |
| 缓存、懒加载、预热 | 数据拥有者维护按租户/版本/权限范围的缓存，LRU基线lru-cache11.5.3，Schema按需加载并在首次需要校验时编译；未变更的纯Schema与编译产物在同一执行域全局复用。必需就绪先准备，可选能力懒加载 | 小而固定纯值Map可用；仅TTL无容量界。付费prompt-cache预热没有默认授权 | 计项及大小、单次在途加载、失败移除/有界退避、淘汰及在途租约见[数据与读取](#缓存懒加载与预热) |
| 日志与遥测 | Node提供者选Pino10.4.0及OTel官方API1.9.1；sdk-node/exporter0.223.0与稳定SDK2.12.0按同发布组锁定 | 不把Node SDK导入所有纯能力，不默认全量auto instrumentation。普通日志/采样不能代替审计、账目及恢复事实 | trace/租户/工作/attempt/实例/代际跨异步边界显式传递；脱敏、有界导出、丢弃可见、关闭与故障责任见[观测约定](#观测设施与因果关联) |
| SDK与接入传输 | SDK用Web标准fetch/ReadableStream/AbortController。技术路线为HTTP JSON控制/查询与fetch SSE单向观察；SSE解析用eventsource-parser4.1.1 | 真正双向需求成立后再采用WebSocket。原生EventSource不能配置任意认证头，stdio不作通用浏览器远程接口 | 公开操作/认证/订阅语义仍归public-contract，本文不造端点。parser的maxBufferSize是字符，原始字节及事件队列另限。取消观察不取消原工作 |
| MCP连接与动作桥接 | 官方@modelcontextprotocol/client与server各2.3.1，固定协议线2026-07-28；客户端显式pin该协议，现代stdio服务使用官方serveStdio。仅实际服务端接入需要node适配2.1.1 | 旧sdk1.32.1属于v1维护线，不作为新设计默认。默认传统stdio接缝不能假定进入现代协议；配套包不要求同版本，其Hono依赖不决定OMNE主服务器选择 | 协商、旧协议兼容与认证由MCP接缝验证。连接/发现/实际调用分责；重连不重放有副作用动作，stdio进程及状态会话由连接拥有者监督。不同协议/发现责任不按启动耗时排名 |
| 时间与TUI | 展示使用Intl，需日历/时区算术时显式import @js-temporal/polyfill0.5.1。TUI采用pi-tui1.1.0，仅应用表现层 | Luxon3.7.2为时间对照，Date不作隐式时区规则。Ink8.0.0为React呈现对照，不以Claude Code采用证明本项目性能 | Clock来源/业务期限/DST歧义由原拥有者规定。TUI验证真TTY、非TTY、宽字符、resize、输入优先及退出恢复，旧1.0.0补丁须按行为复核 |

### 公共设施的拥有者

存储定义与提供者拥有真实事务域、连接、迁移执行和提交查询。业务拥有者维护自己的Schema、迁移内容及参加者；同提交协调者组合已明确的参加者，不接管业务规则。可靠交接和缓存机制由[数据与状态](../architecture/data-and-state.md)维护。

model拥有供应商client和原调用保管，MCP拥有端点/会话/子进程，execution拥有可信计算及执行环境。资源容量与租户公平由[执行与通信](../architecture/deployment/execution-and-communication.md)维护。应用拥有就绪和整体退出，稳定执行入口拥有在途责任，Cordis绑定接入其已定义生命周期，见[生命周期](../architecture/deployment/cordis-and-lifecycle.md)。

### 证据与复核范围

参考实现只提供候选事实。Pi固定提交的durable使用同线程DatabaseSync和NORMAL，coding-agent并不直接消费durable；DSH默认JSONL/JSON存储、SQLite搜索可选，并使用不同Cordis vendor；Claude Code核心内部的模型/网络/存储与线程结构未公开。不能把这些事实推广为OMNE确认、背压或兼容保证。

提供者验证应覆盖真实事务与回执、通知丢失补交、旧推进者拒写与原结果保留、容量饱和、缓存失效、热替换和真实关闭。自定义并发交接及换代须维护行为模型和关键性质检查。有限模型未见反例不替代真实提供者、断电环境或安全域证据；实现按相关机制逐项取得准入。

本页没有性能排名。复核触发包括运行时补丁/引擎更新、pi-ai或供应商SDK重试、流实现变化、资源默认值改变、Schema生成损失语义、新部署或新的真实消费者。出现反例时暂停依赖该前提的采用，保留独立可推进范围。

### 一手依据

- Node及SQLite机制见[Node24.21.0固定API](https://github.com/nodejs/node/blob/v24.21.0/doc/api/sqlite.md)、[SQLite WAL](https://sqlite.org/wal.html)、[同步设置](https://sqlite.org/pragma.html#pragma_synchronous)和[中断语义](https://sqlite.org/c3ref/interrupt.html)。
- 编译选择见[TS7官方公告](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)、[tsup维护说明](https://github.com/egoist/tsup)、[Bun兼容表](https://bun.sh/docs/runtime/nodejs-compat)。现有版本由仓库catalog核对。
- 数据访问见[Kysely迁移](https://kysely.dev/docs/migrations)，Schema生成见[Zod转换限制](https://zod.dev/json-schema)。SQL执行适配由具体提供者验证，不从查询构造器名称推导事务或后台线程保证。
- JSON接缝见[jsonc-parser固定说明](https://github.com/microsoft/node-jsonc-parser/blob/3c9b4203d663061d87d4d34dd0004690aef94db5/README.md)、[lossless-json重复判断](https://github.com/josdejong/lossless-json/blob/a19ae09763876582d120d2f3de4cbd7741faa427/src/parse.ts#L75)与[Ajv选项](https://ajv.js.org/options.html)。
- 队列见[Streams](https://redis.io/docs/latest/develop/data-types/streams/)、[Redis持久化](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)、[WAITAOF](https://redis.io/docs/latest/commands/waitaof/)与[node-redis配置](https://github.com/redis/node-redis/blob/redis%406.3.0/docs/client-configuration.md)。
- 执行资源见[Piscina机制](https://github.com/piscinajs/piscina)、[Undici Pool固定版本](https://github.com/nodejs/undici/blob/7e016ad7e5bd6540170069a9a28b1e633b29664f/docs/docs/api/Pool.md)、[QuickJS固定说明](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/README.md)与[isolated-vm安全说明](https://github.com/laverdet/isolated-vm/blob/v7.0.1/README.md)。
- 模型/TUI/MCP证据见[Pi模型manifest](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/ai/package.json)、[Pi内部流队列](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/ai/src/utils/event-stream.ts)、[MCP官方分包源码](https://github.com/modelcontextprotocol/typescript-sdk/blob/fcef852f6cdafea07f36cf6fae69b37c8adf85be/README.md)、[Pi TUI](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/tui/src/tui.ts)。
- 观测与读取见[Pino transport](https://github.com/pinojs/pino/blob/b29dbe97820630e7128e464c50263b427965ec99/docs/transports.md)、[OTel](https://opentelemetry.io/docs/languages/js/instrumentation/)、[LRU](https://isaacs.github.io/node-lru-cache/)、[SSE标准](https://html.spec.whatwg.org/multipage/server-sent-events.html)、[Temporal](https://tc39.es/proposal-temporal/docs/)。
- 参考样本见[Claude Code固定CHANGELOG](https://github.com/anthropics/claude-code/blob/3deb873687379f0c199a69fdaccc65f0865f7a29/CHANGELOG.md)、[官方Bun说明](https://bun.sh/blog/bun-joins-anthropic)、[DSH默认装配](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/bundle/base/cordis.patch.yml)。

## 公共设施机制

### 事务域与异步SQLite执行

事务域由存储提供者绑定真实数据库身份、配置和能力，不从文件路径相等推导共同提交。本地SQLite提供者由专用Worker持有写连接，主控制线程只传版本化数据和原操作身份。读连接池由同一提供者管理，默认不增加读连接；需要独立读并发时按读负载和checkpoint前提显式增加有限只读连接。WAL只有一个写者，多写连接不能提高同库写并行度。

必须同提交的组合，由业务协调者登记具名参加者及组合版本。参加者随领域拥有者维护，在Worker内经受管模块装入，在同一连接的BEGIN IMMEDIATE内执行同步命令。命令的解析、授权依据及领域不变量由参加者核对，存储提供者限制参加域及事务资源。禁止跨线程传闭包、Cordis Context或数据库句柄，禁止持事务锁等待网络、模型、工具或HITL。公开业务入口隐藏SQL和运输，事务参加入口仅供有资格的组合协调者使用。

事务同时保存必要业务事实、原操作身份及其输入/组合依据、提交回执和待交接记录。原身份作用域至少区分租户、事务域、操作及协议版本。相同身份绑定不同内容拒绝；相同操作重入先取得旧回执，不能重复产生事实。对外确认只在达到所属耐久能力之后作出，记录包含恢复查询所需的内容或可靠引用。

回包前Worker退出、通信断开、超时及取消观察均可能留下已提交事实，调用方保持原身份并查询。查询无回执仅在旧代际已被排除、旧事务已确定终止、原数据库完成恢复、权威查询成功且该操作未仍在其他受理队列后才可判未提交。无法确证任何前提时保持结果未知，不以不存在或失败代替。新写代际不得与未排除的旧写者并存；跨进程提供者必须兑现相同资格和恢复屏障。

SQLite配置采用WAL、FULL及foreign_keys，并逐连接读回。内嵌引擎须含WAL-reset修复，具体版本及路线归[系统技术基础](#共同技术选择)。本地WAL不用于跨机共享网络文件系统。存储提供者记录VFS、文件系统和设备刷新前提，装配不满足时不能开放依赖断电确认的操作。FULL和普通kill验证仍不等于所有部署环境的断电证据。

Worker内同步SQL不占主控制线程，但占用本事务域。操作、分页、事务尺寸、锁等待和维护均有有限预算。排队取消可撤下尚未开始操作；node:sqlite路线不承诺AbortSignal中断在执行SQL。取消观察只释放观察资源，原操作仍有结果拥有者。需严格执行终止的契约必须另选已经验证的interrupt或独立进程边界，终止后仍按原身份认回提交。超时不伪报连接已经关闭。

### 设施层可靠交接

正式消息队列沿Redis后端政策，Streams只负责通知运输及消费者组位置，不成为领域业务事实的第二权威。需要可靠交接的业务变更、稳定通知身份、具名接收责任和outbox同SQL事务保存。通知包含获准引用与事实位置，内容本身仍由原拥有者保管。不能把Redis入队回复或网络发送当作业务耐久受理。

relay从未承接outbox恢复扫描，在有限容量内向Streams发送并记录尝试及运输位置。发送成功不释放SQL责任。断信、重复发送及Redis数据丢失允许再次通知；通知不自行授予推进权，接收者回原事实源核对当前资格。

接收者将inbox去重身份、可靠承接内容或引用、后续处理责任及消费位置共同保存，再返回承接证明并XACK。承接证明可恢复，关联原通知、实际接收者及其提交依据。inbox同一作用域的重复请求返回同一承接结果，不重复执行业务推进。授权变化或无法保存时不发成功证明，保持原责任或形成明确拒绝，拒绝处置由原交接契约决定。

生产方仅在核实持久承接证明并持久记录解除依据后，按原保留规则清理outbox。XADD、XACK、Redis PEL或易失游标均不足以解除。接收方的承接记录和生产方解除记录不能在各自重放/恢复窗口内丢掉去重依据；删除或归档遵循数据拥有者的保留规则，不为省空间截掉恢复所需记录。缺少证明时继续保管、有限重投和对账。定期扫描未解除记录及拥有者待办索引，消除通知丢失造成的无限等待。

Streams认领只转移运输位置，不证明旧消费者停止。业务推进仍由原事实拥有者以持久条件更新检查有效代际；旧消费者不能推进新工作，但可报告自己原调用的真实收场及费用。外部效果不在inbox数据库事务内，必须由原调用查询或按明确恢复协议核实，不能声称exactly-once。

SQL outbox/inbox交接不依赖Redis独立断电耐久，SQL受理和outbox承担可靠责任。Redis应关闭无界离线排队、设置客户端队列和消息字节预算、按能力分离普通命令与阻塞读连接。若队列提供者自行承诺耐久受理，须固定AOF/刷盘/故障转移及回复条件，使用WAITAOF时在同连接核对应写入与返回阈值，超时返回不算满足；其语义也不成为强一致证明。

### 缓存懒加载与预热

缓存由数据拥有者维护权威输入、租户和授权范围、源版本或事实位置、计项及计量大小、失效和重建。数据库投影、Schema编译、解析值和活体资源缓存分别设计，不能用一个全局key/TTL代替语义。资格、权限及推进条件使用权威当前值或有证明的版本检查，不能只用允许滞后的展示缓存。

Schema模块按实际使用需求动态加载，不在启动时遍历加载和编译全部Schema。需要校验或转换的消费者触发加载，编译型校验器在首次使用时编译并缓存；并发请求共享同一加载与编译任务，不重复编译。启动就绪所必需的Schema在对应就绪检查使用时加载，纯能力入口不能因懒加载而依赖Cordis装配。

Zod提供者区分原生编译、运行时解析和异步解析。首次加载时核对支持子集，使用严格编译检查辨认不支持形状，再选择已经声明的运行时路径。Zod4.6.5的递归、异步refinement、coercion及callback catch不能计为原生编译成功，异步解析和codec反向编码也不能套用同步编译收益。refinement和codec函数必须符合对应的纯度要求；编译失败后的运行时回退不能以重复执行callback改变外部事实。TypeBox、Ajv或ArkType的Boolean check与check后clone适配分别计量，不能把适配后的parse当作原生parse等价证据。

纯Schema定义与编译产物由所属Schema提供者在同一进程或执行域全局复用，不为每个请求、Session或Cordis Context重建。缓存键包含Schema身份及内容修订、编译器版本、影响语义的选项和编译依赖修订。依赖范围包括递归引用的Schema、已解析的$ref目标、格式/关键字实现及参与校验的codec；提供者固定这些依赖的有效修订并跟踪其变更。这些输入均未变更时复用同一编译产物；定义、选项或依赖变更时，使受影响的编译缓存失效并建立新缓存项，旧产物保留到使用它的消费者释放；加载或编译失败不保存成功缓存。函数不能跨Worker直接共享，各执行域分别维护编译缓存。

全局复用只适用于可安全共享的纯定义和编译产物，不混入租户凭据、请求值或授权结果。租户专属Schema按租户和访问范围隔离。Schema登记及动态输入限制项数、构造深度、编译成本及缓存大小；仍有有效消费者的未变更编译产物不因普通LRU淘汰而重复构建，预算不足时限制新增Schema准入。运行时校验不默认coercion、填默认或删除字段。同一公共Schema的TS类型与编码由拥有源派生，转换无法保留字段语义时显式拒绝，不产生第二套“近似相同”形状。

编译提供者从不可变的定义与依赖快照构造产物。新版本只接收新消费者，旧租约继续引用旧快照，直到所有有效消费者释放。预算同时考虑定义、编译产物、引擎占用及仍持有的旧版本，不能只按定义JSON字节数宣称编译缓存内存有界。持续变更使旧版本占满预算时，限制新增准入并报告原因，不覆盖旧产物，也不以淘汰活跃条目换取重复编译。有限修订实验和新进程采样不能证明任意长寿命内存上界。

并发首次加载同一key共享受管的在途初始化。失败移除未成功条目并按有限退避重试，单个观察者取消不撤销其他有效消费者。缓存淘汰与资源关闭分开，持有租约的旧资源先停新借用，已有调用按原归属完成后释放。重建/失效事件可提示回源，通知丢失时仍由版本/进度核对恢复正确性。

长历史保持当前值、待处理资格、追加位置及上下文前缀的索引/投影，查询按游标、内容大小及实际读取范围付出成本。压缩和派生缓存固定源范围，不把展示缓存暗换成模型输入。附件大内容避免跨线程整体复制，受控引用的权限、寿命和读取失败明确承接。

冷启动先准备必需配置、身份依据、迁移、恢复屏障和可履约的基础连接；只对满足条件的能力开闸。罕用提供者、SDK、大历史或搜索索引按需准备。可选初始化失败只降低对应能力就绪，不伪报全部就绪。预热是有界受管工作，前台、控制与结果承接优先获得容量，退出时仍须排空或明确取消。默认仅本地准备；付费模型、外传租户内容或真实工具动作须由原授权和预算另行准入。

### 迁移维护与恢复屏障

业务拥有者提供版本化迁移及其必要不变量，存储提供者协调排他迁移、数据库格式、参加者版本和连接代际。先停受影响准入及写者，核原格式，按可恢复步骤执行，再记录完成标记并核对参与者与投影资格后开闸。使用Kysely迁移时检查返回的error及逐项结果，不能因未抛异常报告成功，具体接口见[官方迁移说明](https://kysely.dev/docs/migrations)。非事务步骤明确中断点和重入，不把多个库的迁移伪装成同提交。失败不带病确认已升级，也不因工程演进政策丢弃仍需保护的业务事实。

Kysely0.29.6的SQLite默认迁移接缝在后续步骤失败时可能保留前一步DDL。提供者对需要原子的迁移显式建立同连接事务，并验证DDL、数据和迁移标记一起回滚。必须在事务外执行的步骤保留完成位置、部分变更与恢复依据。仅检查Migrator的error不足以证明库已恢复原状态。

checkpoint、备份、长读和清理使用有限维护窗口，实际busy/剩余页及失败可观察，不能只看方法无异常。备份使用SQLite受管备份或符合其协议的方式，不直接复制仍在写的主文件；备份和业务恢复仍分别验收。关闭前核在途读取、语句、备份和消息的责任，再观察连接关闭及Worker真实退出，必要详细状态归[生命周期](#设施换代与关闭报告)。

上述共同机制不关闭STORAGE-T01及SQL-T01的精确公开契约、提供者和符合性承接。实施任务须把实际行为与验证资源就近交给真实拥有者，不另建中央全模块SPEC。


### 资源池准入与租户公平

资源提供者拥有创建、借用、归还、配置代际、停止准入和真实关闭。数据库连接由storage拥有，HTTP/供应商client由model或具名网络提供者拥有，MCP端点/会话/子进程由MCP拥有，CPU/环境由execution拥有。共同调度算法可以复用，活体池不放common，assembly不接管所有资源。

每个部署profile须明确有限正值的活跃数、租户并发、等待项数、等待字节、单项大小和持有资源预算。缺值、无限默认、非法组合或保留容量不能满足必要控制路径时拒绝启动相应能力。额度是配置与测量输入，不能伪装成已证明的吞吐目标。已受理工作通过持久待办保存，内存队列只调度引用，容量不足延迟派发；未受理请求按公开契约有界等候或拒绝，不静默丢弃。

公平策略采用按租户的deficit round robin。计费单位由执行器声明，至少覆盖计量输入字节或有界任务工作量，配置有限正quantum、单任务上限及租户并发。各租户队首得到累积额度且轮转，长期等待适度老化，不允许优先级永久取消普通工作的服务份额。大任务分段或受执行上界约束，不能以调度公平证明不可抢占任务会及时结束。进展以有限可执行任务、资源最终释放及无永久故障为前提；容量饱和、长期等待及前提失效必须可诊断。

控制、结果保管与清理各有显式保留容量和积压预算，普通工作保留最低服务机会，控制也不能无限独占。在存储域内仍必须经过真实连接，控制消息不能抢占正在执行的同步SQL。结果保管将满或必需审计无法承接时先停相关新准入，不在外部效果已经产生后丢弃结果。

结果保管容量由实际保管后端的提供者统一核算，范围覆盖共享该容量的所有Model、Tool及其他已受理调用，而不是各池分别看“当前空闲”。调用发出前，原调用拥有者申请一个覆盖结果、可靠引用、必要收场及迟到费用记录的可兑现上界；业务受理记录与该容量预留在同一真实事务域、同一提交中成立。local装配把原调用参加者和保管容量参加者绑定到该事务域，缺少共同提交能力就不开放此受理模式；不以两个独立reserve/accept RPC假装原子。

提供者持久保存按原调用身份与容量域绑定的预留依据，并在串行提交中保证未分配预留的存量占用加所有未解除调用的整项预留额度不超过有限总预算。预留内实际落盘字节是该额度内的占用，不重复相加，也不因只收到部分结果而减小整项额度。重复受理返回原预留，不新增额度。预算覆盖磁盘、内存缓冲、必要维护及最坏编码开销，各实际保管层有对应保护，不能把有限内存降级为未定额磁盘。已经收回结果但未获准清理的调用仍保留整项预留，不因Agent退出、租约到期或消费者ACK就释放空余额。

输入输出限额须由原调用契约及执行profile说明并由提供者实际兑现。未知或不能保证结果/记录上界的提供者，不准入需要该有限保管保证的调用，不能等外部效果发生后再临时决定截断、丢弃或增加无界存储。对允许有限输出的调用，profile须在发出前固定限制及超限的既定失败/未知语义，验证实际生产端、传输缓冲和保管过程；本页不为原契约新增未经授权的截断例外。

预留与原调用一起跨runtime和资源换代保留。旧执行者可使用已绑定额度承接真实结果，新实例从持久账本认回，不重复计算空闲额。只有原执行和所有迟到收场义务已确定收束、合法承接/保留条件满足且实际删除/归档释放容量后，提供者才以原身份幂等解除相应预留。清理失败仍占额度并停相关新准入，不把期满或ACK当作物理释放。未知提交按原操作查询，不能在结果未知时回收预留。

CPU池只用于可信、可限制的计算，完成所有受管异步活动后才归还Worker，禁止留下跨任务continuation。数据库写Worker保持域亲和，不进入随机CPU池。普通异步网络/文件等待使用可挂起I/O，不为每个等待Session或HITL常驻一个忙等线程。阻塞原生调用、PTY、shell、浏览器及不可合作任务根据故障与终止要求选独立进程或其他已验证边界，监督实际子进程和后代退出。

HTTP池按连接资格复用，显式限制connections、请求和响应缓冲。SDK内部流、SSE parser、消费者队列及reader各自有界；parser字符数不等于原始字节。未消费响应按协议排空或释放，超时/abort/destroy分别报告实际发出与结果未知。热替换后原请求保留旧租约，不给新租户或新凭据偷偷重用旧状态。

MCP按端点和访问范围管理连接，发现结果按端点/协议/能力版本缓存。有状态会话、工作区和stdio子进程不跨租户复用。可复用连接必须满足同一连接资格和可验证状态重置；取消或断连不重放已发出的工具动作，实际效果归Tool及原调用能力认回。隔离边界仍沿[执行隔离](../architecture/security/execution-isolation.md)核对。


### 设施换代与关闭报告

每个物理资源具有拥有者、配置代际、准入状态、在途租约和关闭状态。资源池代际与领域对象版本、推进代际、runtime实例分别表达。创建者保证候选准备失败可定位并清理已创建部分；只在新候选能兑现该能力必要条件后切换新准入，旧租约保持原提供者和必需依赖。

稳定模型和工具执行拥有者的寿命超过Agent观察者。Agent退出、reload或释放订阅只撤除观察，不将SDK AbortSignal直接绑定到观察者disposer。原调用的业务取消、结果保存、费用和可靠交接继续由原拥有者处理。旧推进者失效后不能推动新工作，但原调用收场及真实费用仍可按独立完成资格提交。

应用关闭协调者依据实际依赖分支先停相关新准入，再结束或持久交接在途责任，随后停止relay、关闭网络/MCP/执行环境、停止存储维护并关闭数据库。各分支的必要顺序显式等待，分别收集失败；disposer的注册顺序、Promise.all或Cordis卸载完成不能代替这个协议。

关闭报告区分停收、排空/交接、关闭已完成、关闭失败和结果未知，记录未释放资源、仍运行Worker/子进程、未承接调用与恢复定位。期限到达只产生超时或未完成，不能产生closed。node:sqlite同步SQL未提供本路线可用的interrupt保证，Worker terminate请求也不证明原生调用已经退出。宿主监督者可继续有限等待，或按已授权进程profile进行整进程终止及崩溃恢复；强制终止不称干净关闭，不证明提交回滚。

重建提供者先核旧执行者退出或被有效隔离、原操作的提交查询和持久待办，再开放新写者。尚不能排除旧写者时不放行冲突新写；依赖该设施的动作报告不可用，其余不受影响能力继续工作。可重建缓存的淘汰不能代替未完成义务的交接。

测试须覆盖候选准备失败、局部资源创建失败、旧租约晚到结果、观察者撤除而原执行继续、关闭超时、多项清理失败及实际进程退出。自定义换代/恢复协议维护行为模型与关键性质；有限模型与真实提供者的证据分别声明，不把声明字段或干净Git状态当作资源释放证明。


### pi-ai模型请求适配

模型请求以pi-ai作为供应商适配入口，按获准模型加载所需适配器。OMNE的model runtime固定原调用身份、访问依据、结果容量预留和重试政策，随后通过pi-ai发出请求。pi-ai负责供应商协议和流事件映射，原调用的准入、取消、恢复、费用、晚到结果及可靠保管仍归OMNE。

提供者须处理pi-ai内部EventStream无容量上限的已知限制，在实际生产与入队位置落实有限项数、字节数及受控消费。消费端再包一个有界队列不足以证明内部队列有界。所选供应商路径须验证慢消费者、暂停、取消、超限及迟到结果；不能兑现有界流和已发生结果保管时，不开放依赖这些保证的profile。需要修改或补充pi-ai接缝时，由model提供者维护并验证，不把库内部行为当成已兑现保证。

每条供应商路径核对pi-ai及其下层SDK的自动重试、取消、参数映射、原始响应和用量。可关闭的自动重试关闭；不能关闭的重试必须纳入同一原调用的可观察控制，不能形成第二套隐式发出。pi-ai无法满足必要协议或语义时，提供者提交具体差异及替代范围再选择官方SDK或受管fetch，不自行改变优先路线。

统一事件映射不能代替原结果保管。提供者须按原调用契约保留所需供应商字段、原始响应或可恢复引用，并实际核对映射前后的差异。pi-ai1.1.0的离线OpenAI路径保留responseId，但没有保留探针中的original_extension；不同下层SDK版本和供应商路径须分别验证。显式核对每次真实发出，不能从一个路径省略重试参数时的请求数推断其他路径的默认行为。

### 受限JS技术profile

受限JS路线及具体引擎基线归[系统技术基础](#共同技术选择)。该profile只接纳受限guest代码与获准模块，不能声称能够安全执行任意Node插件。QuickJS WASM置于专用Worker，由域外监督者控制期限、输入/输出字节和退出。guest runtime限制内存、栈及计算中断，WASM、ArrayBuffer、宿主回调和外部动作的资源另计，不能用Worker resourceLimits覆盖全部内存。

默认不开放文件、网络、进程、Node模块、Cordis Context、宿主对象引用或原生扩展。桥接只接受经过边界校验的数据、范围受限的操作身份及受控返回值，每次实际动作重新核对授权和代际。许可不由guest自报tenant或过去的加载检查授予。宿主请求和返回、并发及pending jobs有有限预算，异常路径释放guest handles并保存原动作实际结果。

默认采用guest Promise及受管pending jobs，不以Asyncify扩大接口。guest销毁只关闭其执行域，不撤回已经获准发出的模型、工具或通知动作。原调用拥有者继续保管晚到结果与费用，取消及未知效果按原协议处理。

桥接预算包含所有emit和最终返回的累计编码字节，也覆盖错误诊断及传输封装。先dump或序列化再检查只能限制已转换的结果，不能证明转换前的分配有界。提供者须另验证大对象、循环引用、BigInt、异常及宿主回调成本，不能把有限算术返回的Worker启动试验当作CPU、安全或完整输出预算的证明。

profile开放前须验证死循环、内存/栈/输出耗尽、恶意模块加载、宿主对象逃逸、桥接权限绕过、撤权竞争、超时和实际退出。QuickJS/Worker名称本身不证明隔离成立，符合性失败就拒绝该profile的执行。需要一般shell、原生扩展或浏览器时，使用明确OS隔离与可终止设施，不回退为未经验证的同进程执行。本页不声明Windows、macOS或任意容器环境已经支持。


### 观测设施与因果关联

能力通过注入的结构化观测接口记录行为，Node提供者和输出端由应用选择，具体库及基线归[系统技术基础](#共同技术选择)。纯能力不导入Node遥测SDK。OTel提供上下文和运输，不取得业务事实权威；Pino普通输出也不承担账目、授权决定和恢复记录的唯一耐久保存责任。

跨异步等待、线程/进程消息、队列及重建，显式保留获准的租户、主体、原工作、调用、attempt、实例、配置与提供者代际。AsyncLocalStorage仅方便同进程关联，IPC接收方核验显式身份，不把自报trace字段当授权。指标避免无限租户/工作标签，必要明细通过获准日志与trace定位。

输出端、采样、队列项/字节及刷新期限均有界，普通遥测丢弃、延迟、导出失败和保留期造成的缺口可观察。关键生命周期、失败、审计及业务账目按各自可靠责任保存；不能因普通采样或logger transport关闭静默消失。必要记录不可得时按原动作的阻止、保留待补或未知规则执行，不无条件停全部系统，也不伪报动作成功。

秘密和未经授权内容在采集边界排除或脱敏；导出时再次核接收方、处理目的和内容范围。对象toJSON或完整请求dump不成为默认记录接口。输出端故障使用有限本地诊断路径，不能递归记录同一输出失败直至占满资源。关闭核对最后记录、flush实际结果及transport退出，截止时间到达不冒充导出成功。

OTel的forceFlush完成不自动表示每条记录导出成功。提供者核对实际导出数、队列丢弃数、失败诊断及最后未承接记录，导出器报告失败时不能只凭Promise完成声称刷新成功。Pino文件写入与OTel采样/队列导出的职责和有效输出数分别验证，不按发出次数相同就比较吞吐。


## 实质备选

技术表分别给出具体库的备选和不选理由。公共设施还比较了不同整体结构。

| 方案 | 如何满足目标 | 代价和失败后果 | 建议 |
| --- | --- | --- | --- |
| 具名事务域、专用SQLite写Worker、能力自有池及原调用保管 | 必要共同事实在同一真实连接内提交，资源控制离开主控制线程，原结果不依赖Agent寿命 | 写域串行，必须约束SQL尺寸；在执行SQL不能假定可中断；共同保管容量须与受理同提交 | local路线，保持独立根入口和显式参加者 |
| 每owner独立数据库和执行进程，持久saga协调 | 加强故障隔离，允许跨库逐步交接 | 跨owner消费者需中间状态、恢复和补偿；不能兑现已经要求的同提交 | 无同提交要求的组合可另设计，不能替代必要共同提交 |
| 主线程同步SQLite或Promise包装同步驱动 | 实现路径短，省运输 | 锁等待和大查询占控制线程；Promise、WAL及池均不能消除此阻塞 | 不作为异步local路线 |
| Redis通知回复即解除SQL责任，或只在保管将满时停收 | 状态少、准入表面简单 | Redis丢数据造成责任空档；总容量100、两个已发出各60结果无法同时保管 | 不采用，分别用持久承接和发出前联合预留保护 |

## 验证与消费者切换

采用技术路线不表示提供者保证已经兑现。固定版本探路分别核对同义输出、实际工作与预期拒绝，再对可运行片段做五轮交错采样及独立profile。Schema的check、parse、冷加载、动态修订和完整JSON输入分别计量；不同协议、线程数、制品责任或有效输出数的路径不按耗时排名。环境为Linux x64、Node24.21.0、8逻辑CPU及glibc2.31，宿主存在背景负载。固定预热不证明稳态，整体profile也不自动定位计时区域的瓶颈。

这些实验支持本提案中的有限机制与限制，未证明生产性能达标。局部Schema缓存不等于实际跨Session或Cordis Context装配；SQLite、Redis和PostgreSQL的本地重启不等于断电、故障转移或分布式恢复。容量算术及有限模型仍以原子持久提交、可兑现上界、有限故障和相应公平前提为条件。真实供应商、安全域、生产端上界、租户公平、任意规模及完整终端支持继续由实际提供者验证。仪器、临时依赖锁、方法修订、逐轮数据、失败和profile留任务tmp，不作为本RFC的永久执行记录。

### 实验对技术路线的约束

Schema同义子集支持保留Zod并显式使用其原生编译接缝，同时保留TypeBox、Ajv和ArkType对照。动态版本实验核对共享首次构造、定义与依赖变化、新旧租约并存及加载失败重试。由此保留按需加载和全局复用路线，增加不可变快照、callback纯度、真实编译路径辨认及旧版本计费条件。没有足够证据按局部耗时切换全仓Schema库，定义大小计费也未证明编译内存有界。

严格JSON的两条接缝核对了非法UTF-8、解码后重名键及数值原词法。保留jsonc-parser路线，增量输入继续要求stream-json兑现同一拒绝语义。消费最终JSON对象、检查输出或复制对象的成本须计入完整输入路径，不能只比较Boolean check。

本地SQL实验核对事实、回执和outbox同提交、失败回滚及提交后丢回包的身份认回。默认SQLite Migrator的部分DDL残留要求提供者显式兑现迁移原子性。PostgreSQL18.6实际服务与Redis8.2.3实际Streams支持本地事务、重复交接及干净重启的有限路线。better-sqlite3和sqlite3的发布物受本机glibc限制，未获得运行比较；该缺口不改变支持Node24的目标机器要求，也不授其他后端自动符合。

CPU和SQLite Worker探路显示控制线程阻塞与后台执行必须分别观察。有限池的突发准入、排队取消和实际退出支持能力自有池路线。HTTP空请求体未验证输入字节预算，池配置和线程数不同的耗时不授库性能排名。内容文件读回、共享容量算术和缓存假值租约不替代内容耐久、持久准入账本或真实资源关闭。

模型适配保留pi-ai优先。离线真实库请求支持文本、用量及显式重试的有限映射；内部未消费队列积压和扩展字段缺失要求提供者补足生产端预算与原结果保管。SSE实际网络读取分别验证UTF-8和原始字节预算，取消观察后原工作继续。MCP现代与传统协议分别验证，空闲重连未重复调用不证明调用中断后的结果认回。受限JS的有限输出和pending jobs支持该探路路径，转换前分配及完整安全仍未证明。

工程制品实验支持保留现有TS6 API消费者，并分别验证ESM、声明及实际消费。OTel故障与丢弃要求刷新时核对有效导出和诊断，不以forceFlush完成授全部成功。时间对照只采用探针中明确拒绝DST重叠和缺失的规则，不替业务拥有者决定政策。终端输入、resize、非TTY和退出恢复的本地fixture不授完整终端矩阵或OMNE表现层接受，固定驱动等待也不产生渲染性能结论。

实施必须在对应消费者依赖事实之前取得以下输入与证据。

- 工具拥有者须使Service定义、纯入口及IC扫描支持相应能力组；存储/接入等成员不能绕过模板限制手写骨架。
- 存储定义、领域参加者及共同提交协调者先形成可消费契约，验证两owner事实/回执/outbox同提交、重复身份、未知提交及旧写者排除；原SQLite/Storage限制不因提案消失。
- 迁移、长读/checkpoint、备份、关闭和断电profile由存储/应用提供者核对真实引擎、配置及物理前提。普通进程kill不代替断电。
- relay/inbox及业务拥有者验证真实Redis丢失/重复/重建、持久承接证明、旧认领者并存、容量满和慢消费；外部效果不自动重放。
- 原Model/Tool和保管后端验证共享容量同受理预留、上界强制、跨换代/unknown/ACK/清理失败不提前释放，pi-ai所选供应商的生产端积压有界，调用参数、首内容、重试、费用和晚到结果保持真实。公开函数须在不构造runtime、Session或存储的独立消费者中实际调用。
- execution、model网络及MCP连接拥有者分别验证CPU/连接/项/字节界、租户公平与饥饿、保留容量及真实退出。受限JS先验证逃逸、模块/桥接权限、撤权、死循环/内存/栈/输出耗尽，不合格profile不开放。
- Schema/codec拥有者验证转义等值重复、数值精度、UTF-8、未知变体、预算、生成限制及独立安装闭包；缓存/Context验证Schema未使用不加载、不编译，并发首次使用只加载和编译一次，未变更时跨请求/Session/Context复用，变更后重编译及旧消费者保留；按源版本与权限失效、长历史成本及淘汰不破坏在途租约。
- 观测能力验证关联、脱敏、导出故障/丢弃可见及flush结果。SDK/server-entry共用公开契约，验证HTTP/SSE断线和纯客户端闭包；应用TUI验证真实终端矩阵、宽字符、resize、非TTY和退出恢复。

共享契约、Schema、catalog/锁和装配拓扑均具名单写。实现者维护回归，适用的独立验收者维护接受场景，实际组合的版本和环境明确后才可开放依赖保证。正式派发和增量计划由#197调度者维护，不在RFC建立第二队列。此处不授新成员、付费调用、共享发布、部署或卡片接受。

## 决定范围

- 有权决定者为PanQiWei，作为#197具名技术采用者及系统/工程要求拥有者。
- 决定日期为2026-10-13，接受revision4。接受时方案固定于提交 `d50eef8a17b086668af2e068e795cdfd898412f4`，原RFC SHA-256为 `637a67506c06e340de7756fcec49a4b23bb5230fc0b9ac11747b8a3d51a98157`；[真实决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/197#issuecomment-6135131457)依据本会话明确指令代笔。
- 采用范围为本提案共同技术选择、公共设施机制、成立前提、限制、持续复核及规范写回范围全部。Node24、Schema按需加载、首次编译缓存和未变更同执行域复用、模型请求优先pi-ai保持。
- 文档落位授权包括更新实际规范拥有者、新增技术基础正文、同步导航、必要章节和真实消费者。写回关系只维护规范切换事实，不把方案接受推成实现或运行证明。
- 不包含业务实现、产品依赖或lockfile修改、性能达标、真实断电、完整安全、真实供应商或完整终端矩阵验证、SDK公开操作或DST业务规则。相关精确契约和产品未决仍归原拥有者。
- D-02具名技术采用已记录。获准规范写回、C6检查、C7/D-04 main运输及C8完整结果接受按各自条件分别确认；本决定不授权自动合并、main ref发布或关闭#197。

## 写回现行正文

下表定位已采用条款的规范拥有者，各规范独立表达当前承诺，不要求实施者拼读本提案。

全部下列范围于2026-10-13写回工作分支，精确规范切换修订为[9db073521abcf79db504cb29af0590ca58e89ec6](https://github.com/nemori-ai/omne-harness-lite/commit/9db073521abcf79db504cb29af0590ca58e89ec6)，依据PanQiWei的revision4具名接受及文档落位授权。此修订定位规范字节；进入main、提供者实现及完整任务接受仍分别办理。

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换依据及确认者 |
| --- | --- | --- | --- |
| 共同技术选择 | 系统架构，[技术基础](../architecture/technical-foundations.md) | 已写回 | PanQiWei，2026-10-13接受revision4；规范切换见上述修订 |
| 事务/异步SQL/可靠交接/缓存/迁移 | [数据与状态](../architecture/data-and-state.md) | 已写回 | PanQiWei，2026-10-13；STORAGE-T01精确承接继续 |
| 池/公平/联合结果预留 | [执行与通信](../architecture/deployment/execution-and-communication.md) | 已写回 | PanQiWei，2026-10-13；真实提供者未验证 |
| 换代/排空/关闭 | [Cordis与生命周期](../architecture/deployment/cordis-and-lifecycle.md) | 已写回 | PanQiWei，2026-10-13；独立原调用不改 |
| pi-ai供应商适配 | [模型运行时](../architecture/runtime/model-runtime.md) | 已写回 | PanQiWei，2026-10-13；原调用/结果/费用责任及真实供应商验证保持 |
| 受限JS及观测 | [执行隔离](../architecture/security/execution-isolation.md)、[跨系统约定](../architecture/cross-cutting-concepts.md) | 已写回 | PanQiWei，2026-10-13；验证与产品未决分别保留 |
| 后端实施路线 | [基础设施采用政策](../architecture/deployment/infrastructure-policy.md) | 已写回 | PanQiWei，2026-10-13；不扩大SQLite为系统唯一后端 |
| 编译构建/Node24 | [workspace](../workspace.md)、[依赖与运行场景](../engineering/scenarios/dependencies-and-runtime.md) | 已写回 | PanQiWei，2026-10-13；当前根声明及TS API消费者仍有效 |
| 内容导航及登记 | [架构入口](../architecture/README.md)及 `docs/documentation.json` | 已写回 | 跟随获准拥有者正文同步；规范切换见上述修订 |

## 后继关系与维护

[RFC-0006](RFC-0006-json-canonical-text.md) revision 1 于 2026-10-15 接受。它只增加规范写出，采用 RFC 8785。本提案的读取决定保持原范围，不改 status。revision 4 方案与接受范围固定。pi-ai 供应商接缝已在本次接受范围内，写回表补充模型运行时是准确拥有者定位，不增加方案范围。新增技术决定另开提案。更正和导航维护不能静默扩大采用。当前要求与系统保证继续从[项目要求](../requirements.md)和[已接受架构](../architecture/README.md)读取。
