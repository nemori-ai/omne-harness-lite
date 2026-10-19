# 系统技术基础与公共设施

本页维护系统共同技术路线、版本选择规则、必要理由和复核条件。领域、公开契约、提供者和应用分别维护自己的责任；各业务字段、终态及产品规则不由依赖清单决定。

本路线由PanQiWei于2026-10-13接受[RFC-0001 revision4](../rfcs/RFC-0001-technical-foundations.md#决定范围)。编译与构建一行由 PanQiWei 于 2026-10-14 接受的 [RFC-0002 revision 1](../rfcs/RFC-0002-engineering-toolchain.md#决定范围) 后继。RFC-0001 的决定文字不改。本页及下列规范拥有者独立表达当前承诺。RFC 保留方案与决定关系，不作为实施者必须拼读的第二规范。接受技术路线不表示提供者已实现、性能达标或平台已经支持。精确版本以 lockfile 为准。

## 采用范围与边界

本页承接[项目要求](../requirements.md)、[包组织](../package-organization.md)和既定系统边界。独立能力从纯根入口消费，Cordis绑定沿[IC约定](cordis-integration-conventions.md)。公共表示不导入数据库、网络或运行实例；运行时对象不直接成为数据契约。

共同设施复用成熟机制，业务状态和原调用身份仍由原拥有者决定。time、telemetry及common只在有真实共同需要和具名消费者时建立成员；本页不批量授予包准入或创建空成员。数据、存储、model、MCP、execution与assembly的职责分别可见。

现有依赖的精确版本以catalog和lockfile为准；新增基线须在实施任务锁定发布物及传递依赖，本页不是第二份依赖锁。产品开发和部署机器须支持Node24，原生依赖、数据库制品和具体补丁均按实际环境验证。调查机器的限制只缩小证据范围，不改变产品目标环境；根engines继续表达现有开发工具事实。

## 共同技术选择

| 项目与范围 | 采用路线及版本前提 | 替代与未选理由 | 实施准入和复核 |
| --- | --- | --- | --- |
| 产品与工程运行时 | Node24，产品SQLite发行基线24.21.0；开发工具与成员的engines统一为`>=24`（#290）；它不拦截未验证的Node版本，存储提供者在运行时自行检查最低版本。Cordis保持4.0.4，不跟进DSH alpha | Bun1.4.3可作独立制品对照；完整Worker支持、diagnostics及原生库兼容须验证，不从Claude Code的选择推导兼容 | 精确补丁及制品摘要、原生依赖、ICU/tz、Cordis、Worker及关闭由应用验证。运行与构建归[workspace](../workspace.md) |
| 编译与构建 | 编译和类型检查采用 TypeScript 7，并保留 NodeNext 与 strict。仍调用 createProgram 或 createSourceFile 的工具从 @typescript/typescript6 导入。库默认 tsc 输出 ESM 和声明。应用按需要使用现行 esbuild | 不把这些编程接口直接改到 TypeScript 7 根入口。不把 Issue #227 的测量写成性能保证。tsup 8.5.1 停止积极维护，不新引入。必要库 bundle 可单独比较 tsdown 0.23.1 | 切换时用 TypeScript 6 再检查对外 .d.ts。catalog、声明、独立安装与资源文件必须同步验证。bundle 不代替类型检查。切换在 integration/engineering-toolchain 完成（#310），对外 .d.ts 由 `pnpm run check:declarations` 用 TypeScript 6 再检查。运行中的编译器版本以 lockfile 为准 |
| 配置与数据Schema | 保留现行Zod4及Standard Schema。Zod4.6.5的纯同步支持子集使用显式z.compile并缓存，递归或其他不支持形状走明确的运行时路径。已由JSON Schema拥有形状的边界保留Ajv8，关闭coercion/default/remove。每份形状一个拥有源，派生TS类型 | TypeBox1.3.36及ArkType2.2.8保留为同义编译校验对照；局部耗时不授全仓切换，不能同时手写第三套字段。Standard Schema只是接口，不保证异步/高性能 | Cordis4.0.4配置验证保持同步，网络/文件检查归初始化。编译子集和callback纯度须验证，不能把回退或异步路径记为编译命中。Schema生成拒绝损失精度/未知语义的转换 |
| 严格JSON与数值 | jsonc-parser3.3.1的visitor/scanner；逐对象检测解码后重名键，数值保留原词法后交字段codec | JSON.parse后已丢重名和精度。lossless-json4.3.1裸用会接受等值重复键。大增量输入可比较stream-json3.7.0，必须保留同一拒绝语义 | 禁注释/尾逗号/空输入，任一语法错误整份拒绝，严格UTF-8及项/深度/字符串/数字预算；具体责任见[共同表示](cross-cutting-concepts.md#表示与校验) |
| 数据访问与迁移 | SQL提供者使用现行Kysely作为类型化查询构造与迁移辅助；字段/迁移归数据拥有者，提交归真实事务域 | 不首选统一ORM或全系统事件溯源，避免以对象活体替持久契约；原生参数化SQL可用于Kysely未覆盖路径，只有同一提供者拥有 | Worker内提供者显式适配node:sqlite执行和返回值，通用事务回调不跨线程。SQLite默认Migrator不保证DDL原子回滚。需要原子的迁移须在同连接事务中验证DDL、数据与迁移标记一起回滚；事务外恢复步骤另承诺可恢复性，不能替代原子性。迁移开闸/失败/恢复由[数据架构](data-and-state.md)承接 |
| 本地SQLite | node:sqlite专用Worker，Node24.21.0内嵌SQLite3.53.4为基线；一事务域一写连接。WAL、FULL、foreign_keys开启并读回 | better-sqlite3 13.0.3专用Worker作原生维护成本对照。sqlite3 6.0.1可作需要运行中interrupt的提供者对照。libSQL0.18.0本地file路径仍同线程同步，Promise/池不足以离开控制线程 | 内嵌引擎须含WAL-reset修复，读回sqlite_version、compile_options、PRAGMA和物理存储前提。不扩大为系统唯一后端，见[基础设施采用政策](deployment/infrastructure-policy.md) |
| 其他数据库与大内容存储 | 非local及多节点提供者保持独立接口；PostgreSQL路线使用现行pg/Kysely及其事务租约，按真实任务选择受维护服务端版本和固定制品。附件/制品按受控引用保存 | 没有明确集群需求及消费者时，不建立数据库集群或对象存储依赖。JSONL/JSON文件可用于符合所属契约的内容或导出，不能替代必要同提交与耐久确认 | 后端capability、可达范围、迁移及故障验证须明确。只保存临时URL不足以确认附件耐久；媒体写入/刷新/引用承接归内容拥有者 |
| 可靠队列 | 保留Redis正式后端，采用Streams consumer group和node-redis6.3.0，SQL outbox/inbox为可靠业务交接依据 | Pub/Sub断连可丢，不作可靠工作交接。BullMQ6.3.13在实际需要Job调度时再作为提供者，Job状态不能替代Run/调用事实 | Redis服务端使用含XAUTOCLAIM且若承诺Redis耐久则含WAITAOF的受维护补丁，实施时锁定服务端镜像及配置。XADD/XACK不解除SQL责任，见[可靠交接](data-and-state.md#sql与streams可靠交接) |
| 模型适配 | 模型请求优先使用pi-ai1.1.0统一供应商适配。OMNE拥有调用、结果和费用契约，pi-ai不取得runtime或原调用的所有权 | 官方SDK或受管fetch作为pi-ai不能满足具名供应商要求时的备选，须明确原因及采用范围，不静默切换。pi-ai内部EventStream无容量上限，仅包装外层iterator不能消除内层积压 | 每供应商验证生产端背压、有界流、参数及原结果保真。重试由model runtime统一控制，核对真实发出/首内容/费用/未知；不能关闭的隐式重试须显式纳入该控制。未兑现有界与结果保管的profile不开放，不给默认供应商或付费预热授权 |
| 网络与连接池 | Undici8.11.2，使用同版本fetch并显式注入dispatcher。按origin、代理、TLS/mTLS、连接资格及代际复用 | 不让租户插件修改全局dispatcher或环境。全局策略只可由单一应用拥有者显式控制，并保持原调用资格 | Pool.connections必须有限，独立限制准入/排队字节/响应缓冲/超时。认证头按请求传递；destroy不等于未发出，旧池关闭须真实观察 |
| CPU与阻塞执行 | 可信纯计算选Piscina5.3.2，有界线程/队列，外层租户公平。阻塞SDK、PTY、浏览器和外部工具由execution/Tool选择相称进程与监督 | 不把普通异步I/O放线程池，不把数据库事务随机分发到CPU池。专用Worker可用于固定状态/原生接口，不能由池隐式决定业务寿命 | maxQueue、线程数、项/字节/任务尺寸均有限，受管任务须完成全部异步工作才归还。Worker不是恶意代码安全域 |
| 受限JS与不可信代码 | 受限JS profile选QuickJS WASM0.32.0，专用Worker监督，仅受控数据桥接。默认guest Promise/pending jobs，不用Asyncify | isolated-vm7.0.1保留对照，其memoryLimit不是安全上限且宿主引用泄漏危险。node:vm、Cordis isolate和普通Worker均不作安全保证 | 先满足[执行隔离](security/execution-isolation.md)的准入和否定测试。任意Node插件、原生模块、shell及浏览器使用OS隔离profile，未有合格profile就拒绝对应执行，不静默降级 |
| 缓存、懒加载、预热 | 数据拥有者维护按租户/版本/权限范围的缓存，LRU基线lru-cache11.5.3，Schema按需加载并在首次需要校验时编译；未变更的纯Schema与编译产物在同一执行域全局复用。必需就绪先准备，可选能力懒加载 | 小而固定纯值Map可用；仅TTL无容量界。付费prompt-cache预热没有默认授权 | 计项及大小、单次在途加载、失败移除/有界退避、淘汰及在途租约见[数据与读取](data-and-state.md#缓存懒加载与预热) |
| 日志与遥测 | Node提供者选Pino10.4.0及OTel官方API1.9.1；sdk-node/exporter0.223.0与稳定SDK2.12.0按同发布组锁定 | 不把Node SDK导入所有纯能力，不默认全量auto instrumentation。普通日志/采样不能代替审计、账目及恢复事实 | trace/租户/工作/attempt/实例/代际跨异步边界显式传递；脱敏、有界导出、丢弃可见、关闭与故障责任见[观测约定](cross-cutting-concepts.md#观测与遥测) |
| SDK与接入传输 | SDK用Web标准fetch/ReadableStream/AbortController。技术路线为HTTP JSON控制/查询与fetch SSE单向观察；SSE解析用eventsource-parser4.1.1 | 真正双向需求成立后再采用WebSocket。原生EventSource不能配置任意认证头，stdio不作通用浏览器远程接口 | 公开操作/认证/订阅语义仍归public-contract，本文不造端点。parser的maxBufferSize是字符，原始字节及事件队列另限。取消观察不取消原工作 |
| MCP连接与动作桥接 | 官方@modelcontextprotocol/client与server各2.3.1，固定协议线2026-07-28；客户端显式pin该协议，现代stdio服务使用官方serveStdio。仅实际服务端接入需要node适配2.1.1 | 旧sdk1.32.1属于v1维护线，不作为新设计默认。默认传统stdio接缝不能假定进入现代协议；配套包不要求同版本，其Hono依赖不决定OMNE主服务器选择 | 协商、旧协议兼容与认证由MCP接缝验证。连接/发现/实际调用分责；重连不重放有副作用动作，stdio进程及状态会话由连接拥有者监督。不同协议/发现责任不按启动耗时排名 |
| 时间与TUI | 展示使用Intl，需日历/时区算术时显式import @js-temporal/polyfill0.5.1。TUI采用pi-tui1.1.0，仅应用表现层 | Luxon3.7.2为时间对照，Date不作隐式时区规则。Ink8.0.0为React呈现对照，不以Claude Code采用证明本项目性能 | Clock来源/业务期限/DST歧义由原拥有者规定。TUI验证真TTY、非TTY、宽字符、resize、输入优先及退出恢复，旧1.0.0补丁须按行为复核 |

## 设施机制的拥有者

| 责任 | 现行规范拥有者 | 下层承接 |
| --- | --- | --- |
| 表示、校验与共同身份 | [跨系统约定](cross-cutting-concepts.md#表示与校验) | 每份形状单一拥有源，类型/codec与严格输入由原数据拥有者验证 |
| 真实事务、SQLite异步执行、交接、缓存与迁移 | [数据与状态](data-and-state.md) | storage定义/提供者与具名参加者；精确接口和符合性不因选型成立 |
| 正式后端与治理限定 | [后端采用](deployment/infrastructure-policy.md) | 不扩大SQLite为系统唯一后端，实际部署能力另验证 |
| 准入、容量、公平与网络/MCP/CPU资源 | [执行与通信](deployment/execution-and-communication.md) | 各能力拥有自己的活体池，共同算法可复用，assembly不取得所有资源 |
| 原调用、供应商接缝、结果与费用 | [模型运行时](runtime/model-runtime.md)及[工具运行时](runtime/tool-runtime.md) | pi-ai只承接模型供应商映射，原调用的授权/重试/结果保管归原拥有者 |
| 候选、旧租约、原执行与真实关闭 | [Cordis与生命周期](deployment/cordis-and-lifecycle.md) | 应用按实际依赖协调停收/排空/关闭，disposer不证明业务收场 |
| 受限guest与隔离profile | [执行隔离](security/execution-isolation.md) | execution及域外监督验证实际边界，未合格profile不开放 |
| 日志、遥测与可靠记录 | [跨系统观测](cross-cutting-concepts.md#观测与遥测) | 提供者/导出端由应用选择，遥测不能替代业务持久事实 |
| 构建、制品与实际支持范围 | [workspace](../workspace.md)、[运行环境变化](../engineering/scenarios/dependencies-and-runtime.md) | 工具与产品声明分别核对，bundle不代替类型检查 |

## 实施准入与持续验证

独立公开形状、完整必要行为、真实提供者及装配输入形成可消费的精确版本后，才开放依赖相应保证的能力。共同选择不能关闭STORAGE-T01、SQL-T01、MODEL或KERNEL的精确承接与符合性待办。共享契约、Schema、catalog/lock及装配拓扑具名单写，实际消费者按接口和条件传播，不从目标目录推断实现。

Schema提供者先核支持编译子集、callback纯度、动态输入限制、依赖快照、新旧消费者以及完整编译内存预算；只按定义字节计费不足以证明有界。依赖动态Schema有界保证的消费者须先取得提供者和独立验收依据，静态或不依赖此性质的工作可独立推进。

存储、队列、资源与调用提供者分别验证真实同提交、未知结果认回、旧写者排除、持久交接、有限项/字节/线程/连接界、公平前提、共享整项预留及真实退出。关闭和故障的实际结果分别报告，普通kill、干净重启、已配置FULL或一个名称不能证明断电耐久、跨节点恢复或安全隔离。

自定义并发交接及换代的机制拥有者须维护行为模型和关键性质检查。有限模型未见反例不替代真实提供者、断电环境或安全域证据；模型与实际组合的结论分别声明，并保留各自前提与覆盖范围。

模型与接入提供者验证实际供应商参数/重试/生产端缓冲/原结果与迟到费用，客户端保持独立安装和公开契约。受限JS先验证逃逸/模块/桥接授权/撤权/资源耗尽及域外退出；TUI验证真实终端矩阵、宽字符、resize、非TTY、输入和恢复。时间业务政策仍归原拥有者，不从日历库默认值推导DST规则。

## 比较与复核条件

性能选择使用同义输入和实际输出，分别计工作、预期拒绝和错误。冷加载/首次构造、热复用、运行时修订与完整输入路径分别测量，独立profile定位计时区域和生成器；中位数、范围、物理界及真实用户路径占比均须解释。不同线程配置、协议、制品职责、有效输出数和check后复制适配不能按库名排名。有限输入、固定预热或新进程不证明稳态及任意长期内存上界。

运行时补丁/内嵌引擎、供应商SDK重试或流实现、资源默认值、Schema生成与编译依赖、新部署或真实消费者发生变化时，由相关拥有者复核适用前提。出现反例只停止依赖该前提的开放，保留其他独立可推进范围。版本调整依照[依赖与运行环境变化](../engineering/scenarios/dependencies-and-runtime.md)，持续语义改变须取得拥有者新依据并同步消费者。

原始比较、逐轮数据、负例和profile留任务tmp；持续回归、故障和独立验收资源随实际成员维护。本文不记录一次调查的性能排行或完成计数，不以实验探路替代生产符合性。

## 一手依据

- Node及SQLite机制见[Node24.21.0固定API](https://github.com/nodejs/node/blob/v24.21.0/doc/api/sqlite.md)、[SQLite WAL](https://sqlite.org/wal.html)、[同步设置](https://sqlite.org/pragma.html#pragma_synchronous)和[中断语义](https://sqlite.org/c3ref/interrupt.html)。
- 编译选择见[TS7官方公告](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)、[tsup维护说明](https://github.com/egoist/tsup)、[Bun兼容表](https://bun.sh/docs/runtime/nodejs-compat)。现有版本由仓库catalog核对。
- 数据访问见[Kysely迁移](https://kysely.dev/docs/migrations)，Schema生成见[Zod转换限制](https://zod.dev/json-schema)。SQL执行适配由具体提供者验证，不从查询构造器名称推导事务或后台线程保证。
- JSON接缝见[jsonc-parser固定说明](https://github.com/microsoft/node-jsonc-parser/blob/3c9b4203d663061d87d4d34dd0004690aef94db5/README.md)、[lossless-json重复判断](https://github.com/josdejong/lossless-json/blob/a19ae09763876582d120d2f3de4cbd7741faa427/src/parse.ts#L75)与[Ajv选项](https://ajv.js.org/options.html)。
- 队列见[Streams](https://redis.io/docs/latest/develop/data-types/streams/)、[Redis持久化](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)、[WAITAOF](https://redis.io/docs/latest/commands/waitaof/)与[node-redis配置](https://github.com/redis/node-redis/blob/redis%406.3.0/docs/client-configuration.md)。
- 执行资源见[Piscina机制](https://github.com/piscinajs/piscina)、[Undici Pool固定版本](https://github.com/nodejs/undici/blob/7e016ad7e5bd6540170069a9a28b1e633b29664f/docs/docs/api/Pool.md)、[QuickJS固定说明](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/README.md)与[isolated-vm安全说明](https://github.com/laverdet/isolated-vm/blob/v7.0.1/README.md)。
- 模型/TUI/MCP证据见[Pi模型manifest](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/ai/package.json)、[Pi内部流队列](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/ai/src/utils/event-stream.ts)、[MCP官方分包源码](https://github.com/modelcontextprotocol/typescript-sdk/blob/fcef852f6cdafea07f36cf6fae69b37c8adf85be/README.md)、[Pi TUI](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/tui/src/tui.ts)。
- 观测与读取见[Pino transport](https://github.com/pinojs/pino/blob/b29dbe97820630e7128e464c50263b427965ec99/docs/transports.md)、[OTel](https://opentelemetry.io/docs/languages/js/instrumentation/)、[LRU](https://isaacs.github.io/node-lru-cache/)、[SSE标准](https://html.spec.whatwg.org/multipage/server-sent-events.html)、[Temporal](https://tc39.es/proposal-temporal/docs/)。
- 参考样本见[Claude Code固定CHANGELOG](https://github.com/anthropics/claude-code/blob/3deb873687379f0c199a69fdaccc65f0865f7a29/CHANGELOG.md)、[官方Bun说明](https://bun.sh/blog/bun-joins-anthropic)、[DSH默认装配](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/bundle/base/cordis.patch.yml)。
