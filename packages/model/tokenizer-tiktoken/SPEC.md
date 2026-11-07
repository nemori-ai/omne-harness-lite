# @omne-harness/tokenizer-tiktoken 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包是 `ModelTextTokenizer` 的 tiktoken 引擎 adapter。它在有界 worker 池中初始化固定词表并计数，供家族成员取得独立的计量租约。宿主拥有 executor，租约只拥有本次计量的任务和缓存。

本包依据下列已接受的正文：

- `ModelTextTokenizer`、`TokenizerDefinition`、`TokenizationSegment` 与 `TokenizationFailure` 的形状归 [model-contract](../model-contract/docs/public-api.md)。计数的共同规则归 [model-contract SPEC“分词与完整请求计量”](../model-contract/SPEC.md#分词与完整请求计量)。本文件不改变这些规则，只写明本引擎怎样兑现它们。
- 成员职责、资源与计量分工归[组架构“Tokenizer 的资源与计量分工”](../docs/architecture.md#tokenizer-的资源与计量分工)。词表、特殊 token 表与模板归家族成员。本包不收录任何厂商词表。
- 引擎依赖是 `js-tiktoken`，版本由仓库目录钉在 `1.0.21`（`pnpm-workspace.yaml` 的 `catalog`）。升级须另有依据。

本包不做下列事情：

- 不计量完整请求，不渲染模板，不处理媒体或回放。这些归家族成员的计量器。
- 不判断请求可否发出，不读档案，不取得凭据。
- 不提供加载本地任意路径或下载词表的入口。

## 结果与不变量

<a id="初始化"></a>

### 初始化

`createTiktokenExecutor({ resources, limits })` 异步启动明确数量的 worker。每个 worker 只在初始化时核对固定资源并构造词表。主线程不构造词表。所有 worker 就绪后返回 executor；任一初始化失败时，等待已启动线程退出后返回 `unavailable`。三项资源核对如下，任一不成立即为版本失配。

1. 实现：`definition.implementation.revision` 必须等于本模块实际加载的 js-tiktoken 包的版本。本包从该包自己的 `package.json` 读取版本。
2. 词表：`definition.vocabulary.digest` 必须等于 `ranks` 的规范 JSON 的 SHA-256。
3. 配置：`definition.configuration.digest` 必须等于 `specialTokens` 的规范 JSON 的 SHA-256。

核对按上面的顺序进行，第一项不成立时就返回。核对不成立时，本包不得换用另一套编码，不得用同名的其他版本补齐，也不得用字符倍率估算。

<a id="规范-json"></a>
规范 JSON 的写法：

- 没有空白。
- 对象的键按 UTF-16 码元排序。
- 字符串按 `JSON.stringify` 的写法。
- 数只能是非负安全整数，按十进制写出。
- `ranks` 的规范 JSON 是对象 `{"bpeRanks":…,"patStr":…,"specialTokens":{…}}`，只含这三个键。

对这些值，这个写法与 RFC 8785（JCS）相同。摘要是规范 JSON 的 UTF-8 字节的 SHA-256，写成 64 位小写十六进制。比较区分大小写。

如果 `ranks.specialTokens` 或 `specialTokens` 中有一个 id 不是非负安全整数，该值没有规范 JSON 形式。这时初始化返回 `unavailable`。

`definition.adoption` 不参加核对。本包不核对 `implementation` 的 `owner`、`name` 与 `digest`，也不核对 `vocabulary` 与 `configuration` 的 `owner`、`name` 与 `revision`。这些值由家族成员给出并负责。

初始化调用同步取得资源和 limits 的自有快照。随后修改调用方对象，不改变采用身份、词表、配置或限制。`acquire(definition, signal)` 按四份完整 adoption 的全部字段匹配已初始化资源，返回的 tokenizer 持有冻结的 definition 副本。未匹配、已取消、无可用 worker、达到租约上限或 executor 已关闭时返回 `unavailable`。

<a id="计数"></a>

### 计数

`count(segments)` 返回 Promise，词表计数只在线程中计算。它不读文件，不读当前工作目录，不访问网络。失败不隐式重试，不回退到主线程同步计数。

1. `text` 段按普通文本编码。文本中形似特殊 token 的文字（例如 `<|endoftext|>`）按普通文本计，不激活特殊 token，也不被拒绝。
2. 相邻的 `text` 段先连接成一段，再编码。分段计数不能相加。
3. `special-token` 段只查初始化时传入的 `specialTokens` 表。查到时，该段计 1。查不到时，`count` 返回 `unsupported-token`，`name` 是该段的名字。词表 `ranks.specialTokens` 中有该名字，不使它成为可用的特殊 token。
4. 特殊 token 表只看自有键。`toString`、`__proto__` 等原型上的名字不是特殊 token。
5. `text` 段的文本不是良构的 Unicode（例如有孤立的代理码元）时，`count` 返回 `invalid`。本包不替换字符，不做规范化、去空白或大小写转换。
6. 空序列计 `"0"`。空文本计 0。
7. 成功的结果是 `{ tokens }`，`tokens` 是非负十进制整数串，没有前导零。

`count` 遇到第一个失败就返回，不计其余段。

### 有界调度与缓存

所有 limits 必须显式给出，包不提供宿主默认值。字段只接受非负安全整数。workers、maxLeases、maxInputBytes、jobTimeoutMs、maxWorkerOldSpaceMb 必须大于零。jobTimeoutMs 不超过 Node 定时器的 2147483647ms 上限。资源集非空，重复的完整 definition 被拒绝。

- `maxLeases` 限制尚未完成释放的租约数。每个租约固定在一个 worker 槽，同一租约最多一个 count 执行。
- 空闲槽可直接接纳一个 count。等待任务同时受全局 `maxQueuedJobs`、`maxQueuedBytes` 和每租约 `maxLeaseQueuedJobs` 约束。超限立即返回 `unavailable`。
- 输入的保守保留字节数是 `32 + sum(128 + 2 * string.length)`。字符串是 text 或 special-token 的 name；按 UTF-16 码元计费。`maxInputBytes` 限制每次输入，`maxQueuedBytes` 只计尚未交给 worker 的等待输入。这不是 UTF-8 字节数或进程 RSS。
- 每个 worker 按等待租约轮转。一个租约完成后，剩余任务排到该槽其他等待租约之后。固定槽避免一份 lease 缓存乘以 worker 数；不同槽之间不迁移缓存。
- `jobTimeoutMs` 从 count 接纳开始计时，覆盖排队和执行。超时结束调用者等待，但物理容量仍保留至计数确认或线程实际退出。
- 相邻普通文本仍先合并。缓存只复用完整 ordinary run 上原 regex 的完整 match 计数，不能把任意文本块或消息的计数相加。非有限 ranks 保留原 reference fallback，不缓存这条路径。
- 每个 worker 的缓存字节和条目上限分别是全局上限除以 worker 数向下取整。余数不分配。每份租约另受 `maxLeaseCacheBytes`、`maxLeaseCacheEntries` 限制。LRU 淘汰同时满足两级上限。
- 每片缓存按 `2 * piece.length + 256` 字节计费，包含保守条目开销。排队字符串和缓存片段均复制为独立字符串，避免切片隐式保留完整上游文本。大于 `maxPieceBytes` 或任一字节上限的片段不缓存。零缓存上限禁用相应缓存。不同租约即使文本和 definition 相同也不共享明文缓存。
- `maxWorkerOldSpaceMb` 传给 Node worker 的 old-generation heap 限制；它不等于进程总内存限制。词表数量由固定 resources 决定。

## 所有权、失败与生命周期

宿主拥有 executor 和全部物理线程。调用方拥有 `acquire` 返回的租约，并须等待 `release()`。家族或应用借用 executor，不获得关闭其他消费者资源的权限。线程不知道 tenant、principal、Session 或 lineage，缓存不能判断当前权限。

`release()` 同步停止本租约的新计数，取消等待和在途调用，并返回同一份幂等 Promise。调用者可先收到 `unavailable`。取消不归还物理槽；release 等待在途计算结束，再等待 worker 的缓存清除确认。线程故障时，实际 exit 同时确认该线程中的缓存和在途计算已销毁。释放后迟到结果不能成为成功。

取消会设置共享原子标志。普通 BPE 内循环与每片计数检查该标志。regex 和非有限 rank fallback 可能无法及时检查，达到显式配置的 `cancellationGraceMs` 后仍未结清则终止 worker；此值是0至2147483647的整数毫秒，应用默认25ms。终止请求不等于退出确认。

worker 消息必须匹配当前代际、任务和租约。旧代际消息被忽略；当前代际的错误任务身份导致 worker 停止。故障使当次 count 失败，不隐式重试。租约和任务标识达到 JavaScript 安全整数上限后拒绝新准入；代际达到该上限后不再替换线程，不能回绕或复用旧身份。槽只有在实际 exit 后才能建立替换线程。每槽滚动一分钟内的替换次数受 `maxReplacementsPerMinute` 限制，等待任务也有原截止时间。替换额度耗尽或替换无法初始化时，无可用槽的等待任务全部失败，不无限等待。

`close()` 同步关闭准入并取消全部租约，停止所有线程，再等实际 exit 后返回。重复调用返回同一 Promise。close 完成后，snapshot 的 workers、leases、queuedJobs、queuedBytes、runningJobs、cacheBytes、cacheEntries 都为零。

snapshot 只返回冻结的数量和累计时延。workers 包含正在停止但尚未退出的线程；runningJobs 包含已向调用者返回失败但尚未物理结束的任务。缓存量在任务或清理确认时更新，退出时归零。pieceHits、pieceMisses 是完整 regex 片段的累计缓存命中与计算次数。completedJobs、failedJobs 统计已接纳任务的结果，rejectedJobs 统计 count 准入拒绝。queueMs、serviceMs 分别累计等待与物理执行毫秒数，不能从总数推断分位数。snapshot 不含文本、摘要、采用定义或身份。

失败分类：

- 资源、初始化、队列、取消、截止、worker 和生命周期失败返回 `unavailable`，不静默转为成功。
- 计数保留 `unsupported-token` 和 `invalid` 的原含义与顺序。
- 资源校验、引擎构造、固定运行时形状或 regex 抛错，由 worker 转为有诊断的 `unavailable`。不换用其他编码。
- 引擎版本在每个 worker 第一次初始化时读取并复用，count 不读取它。

## 组合与验证

并发状态与缓存隔离的形式资源见 [verification](verification/index.md)。其中参数化安全性采用人工归纳论证，TLC 检查具名有限配置及故障负控。代码动作映射和行为守护是实现符合性证据，不构成 TypeScript 全程序精化证明。

本包消费 model-contract 的 tokenizer 类型与 `@omne-harness/operation-result` 的 `Outcome`，以及 js-tiktoken `1.0.21` 的 `js-tiktoken/lite` 入口。

每项义务的持续验证见 [tests/README.md](tests/README.md)：

| 义务                           | 验证                                                                                     | 前提与未覆盖                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [初始化](#初始化)的三项核对    | `initialization.spec.ts`（快层）                                                         | 摘要常量在本包以外独立算出                                                                   |
| [规范 JSON](#规范-json) 的写法 | 两份词表的摘要常量与 Python 独立算出的值一致                                             | 只覆盖字符串、非负整数与对象                                                                 |
| 有界调度、隔离、物理取消与关闭 | `executor.spec.ts`（真实 worker）、`executor-lifecycle.spec.ts`（可控 worker 故障 seam） | 最多两个 worker；不等于应用全负载接受                                                        |
| [计数](#计数)的各条规则        | `count.spec.ts`（快层），用 o200k 与合成词表                                             | o200k 的计数与完整 js-tiktoken 编码器比较                                                    |
| 固定引擎语义与局部合并         | `differential.spec.ts`、`engine-shape.spec.ts`（快层）                                   | 未改 js-tiktoken 为 oracle；合成穷举与两个家族资源固定 seed 差分；计数相等不单独证明分区相等 |
| 大重复片段的有界回归           | `performance.spec.ts`（慢层）                                                            | 构建产物在可外部杀死的进程中计数 24 KiB 空白；不代替完整请求或服务性能验证                   |
| 发布后资源读取                 | `published.spec.ts`（慢层）：构建产物在子进程与临时目录中初始化并计数，结果与源码一致    | 需要先构建本包                                                                               |

未覆盖：

- 本包不声明完整应用预发送 200±50ms 目标达成。Linux 负载、应用装配关闭与独立接受由宿主组合验证。

- Anthropic 资源的采用与参考计数 150 仍由 `pi-ai-anthropic` 验证。本包只读它的词表作算法差分，不验证它与厂商现行 tokenizer 一致。
- 家族成员给出的采用值是否与厂商实际的 tokenizer 一致，由家族成员验证。本地精确分词不证明上游计量精确。
- `count` 不读文件、不访问网络，由源码结构保证，没有运行时探测。
