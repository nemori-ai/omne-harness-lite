# diagnostics 当前提供者设计

本页是本包提供者映射的唯一当前正文；已实现签名归 [src/index.ts](src/index.ts)，
内部实现归 [src/runtime.ts](src/runtime.ts)，依赖归 [package.json](package.json)。
它解释如何兑现正式契约，不另定义业务状态机、共享身份或新的持久 Schema。

| 范围 | 采用依据及当前状态 |
|---|---|
| 被动记录面、身份/内容裁剪、Pino/Sonic/OTel、本地来源及生命周期 | [D-010](../../../docs/decisions/D-010-shared-diagnostics.md) 已接受，原设计修订 `99fc7a3`、接受点 `5e81ee8`；本页汇入其提供者映射，接受不等于完整产品验证通过 |
| R1 目录 owner、共同字节/slot 预留、稳定 flock 和创建入口迁移 | 受审 `d4cd27ed33df815179f57af398c8cb6b5444302a`，主调度交接确认独立评审无阻断；仍待主调度接受，本页“R1 候选”各节不是已发布 API |
| 实际实现与证据 | 迁移起点 `1ab8635d57829bb8aed7b32506289285ddd5209a` 仍导出旧 factory，R1 真实 RED 未转 GREEN；本次不改产品代码。主调度已确认 R6 `4fa2c74f4816fe37850a812ca59032cb889d75fd` 窄缺口闭合，不据此声称 R1 或整包交付 |

消费精确正式 [OB v1](../../../spec/capabilities/engineering-observation/v1/contract.md)、
[CD v1](../../../spec/data/core-work/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md) 与
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)。共享类型
直接来自 work-data/records，定义以其公开入口与正式契约为准。

本轮实施目标消费 `1368c52` 的[最小运行基线](../../../docs/proposals/core-capabilities/implementation/runtime-baseline.md)：
真实最小 Session/Agent/工具闭环随共享设施交接后停止。完整 M1/M2 与 A01–A32
保留为后续设计/验收目录；本包基础诊断不要求先交付远程观测或完整 query/export。
四输入与调度归[计划](../../../docs/proposals/core-capabilities/implementation/plan.md)，
本页只维护提供者选择及仍需兑现的责任。

## D-010 已接受的职责与依赖

本包拥有普通结构化日志、短期运行 span/context、安全投影、本地输出资源及
失败快照。业务 owner 在自己的操作/提交边界生成事实；关键审计随所属耐久提交
或可核实 outbox 保存。日志失败不取代业务结果，分配 diagnosticId 不是保存回执。
关键审计失败与 audit_unavailable 仍由 OB/CC 所属 owner 判定。

本包 → work-data/records 的公开类型；本包 → Pino/Sonic/OTel。records 和纯
work-data 不反向依赖 logger、ALS 或 diagnostics。JSONL/admission 和业务 owner
消费本包的记录面，应用持有配置、inspect/close 和 generation 选择。engineering
拥有受治理采集、cursor、处理版本、索引、query/export、gaps 与保留策略；本包
只提供来源原件及失败事实，不获取业务 writer 或执行权。

| 已接受精确库 | 实际采用范围 |
|---|---|
| pino@10.3.1 | 结构化 JSON/等级/固定 redaction；不启用 worker transport、pretty 输出或异常全文 serializer |
| sonic-boom@4.2.1 | 直接依赖，复用有界异步文件流；不另造队列、网络 exporter 或重试框架 |
| @opentelemetry/api@1.9.1 | 标准 span/context 类型和关联 |
| @opentelemetry/sdk-trace@2.11.0 | 私有 TracerProvider 创建标准 span；本地 SpanProcessor 把结束 span 投影至同一日志流 |
| @opentelemetry/context-async-hooks@2.11.0 | 每 runtime 独立 ALS manager，无进程全局注册 |

固定上游事实及 12+7 项机制证据归[研究](../../../docs/research/harness-observability.md)
与[观测证据](../../../docs/proposals/core-capabilities/implementation/evidence/observability-design/README.md)。
这些测量不证明业务审计、完整产品组合或长时间生产稳定性。P1 直接注入本包，
不要求 Cordis logger 桥；P2 的桥映射和原生输入约束仍归对应宿主提供者及其
独立验证，本包不新增 Cordis 服务键、Fiber、原生 exporter 注册或其卸载协议。

## 已实现公共记录面的设计含义

`Diagnostics`、`DiagnosticContext`、`DiagnosticSpan`、`DiagnosticsRuntime`
以及 identity/point/status/close 的精确签名只引用 [src/index.ts](src/index.ts)；
这里不复制一份会独立演化的类型。运行对象不可序列化，不授予身份或读取权限。

- `scope` 对可信入口已核对的身份作冻结投影；显式 parent 默认为 ROOT，
  parent 的 tenant/主体必须匹配，否则新建根并记关联缺口。它不认证用户传入值。
  认证前拒绝使用可信 system principal/入口 operation；无 Session 的工作不造 Run。
- `current` 只读本 runtime 的 ALS。排队先 capture，再由实际执行 owner 出队
  恢复；共享 timer/文件流从可信 ROOT 初始化，不继承第一位请求调用者的归因。
  它不读取全局 OTel/DSH initiator，不自动劫持 fs/http 或传播 baggage。
- `log/startSpan/end/scope` 有界、同步且对业务被动；投影/后端失败更新固定
  健康状态，不抛给业务、不调用任意 listener、不递归记录。无效 identity 只返回
  安全 system context，不保留原对象；失效 span 可安全 end，缺失有 gap。
- `within` 只沿 ALS.with 词法边界调用 body 一次，原样返回值/Promise/throw；
  不读取 then、不观察结算、不保留 activeScopes。仅激活在 body 调用前失败时，
  才退回显式参数调用一次。body/Promise 与其资源始终归业务 owner。
- span 使用显式 parent；调用者在真实阶段结束时 end，重复 end 不增终态。
  结束后活动表不持 SDK span/导出回调，context 只保留不可变 identity。整个
  Session、宿主寿命或无限人类等待不保持活动 span。恢复创建新实例/span，沿
  原 work/attempt/parentOperation 保留业务因果，不反序列化运行对象。

每条来源记录含 generation、单调 seq、观测时间、component/phase/code/level、
适用的业务关联与可选 trace/span ID。seq 与 commit.seq/耐久水位不同；newId
以宿主分配的唯一实例身份加实例内递增标识形成，不依赖磁盘保存成功。业务
rejected/unknown outcome 显式保留，不以 Promise resolve 或 span ok 推导成功。

## 已接受的裁剪、容量与输出健康

生产、研发、debug 共用结构与默认裁剪，默认 info；debug 只增加具名阶段细节。
配置经受信装配校验后冻结，非法值在发布前具名失败。结构不提供 prompt、模型
响应、工具参数/结果正文、URL query、headers、密钥或任意 Error 对象槽位。
投影只读自有数据属性，拒绝 getter/toJSON/循环/未知字段和超限；进入 Pino、
OTel、缓存前裁剪，Pino 固定 redaction 仅作第二道保护。身份超长不得截成另一
有效身份；异常只记安全 code/phase，不能自动 recordException 或序列化 stack/cause。

| 初始预算/配置 | 已接受值与解释 |
|---|---|
| 记录与 span | 最终 UTF-8 行 ≤8 KiB；活动 span ≤256；每 span ≤32 属性、字符串≤256 字符、8 事件、4 links；记录面不开放任意 OTel 字段 |
| Sonic | `sync:false,minLength:0,maxLength:1048576,maxWrite:16384,fsync:false,retryEAGAIN:()=>false` |
| 来源文件 | 目录0700/文件0600；部署生成 source generation，路径不取 tenant 或调用者输入；每来源≤8 MiB |
| 目录总量 | 64 MiB，含旧代和未确认写入；R1 候选明确为8个来源文件加1个零字节稳定锁文件，见下文，尚待采用 |

这些是有界资源配置，不是性能测量结论。内部行格式 `omne-diagnostic/1`
不另登记业务 Schema；log 与 span 结束经同一 Pino/Sonic 流，不缓存已结束 span。
流空闲时单条短日志立即开始异步 write，流忙时由原有限缓冲继续排空，不等待
后续日志、4 KiB 门槛或 close，不新增 periodicFlush timer/公共 flush。

inspect 冻结快照区分尝试、接收、丢弃、pending、实际写入、活动 span 与剩余
资源。pendingIdleMs 从最近真实进展计算，首次入流起计时、排空归 null；
有 pending 且超过1000 ms无进展为 stalled，不等于取消或丢失。实际 error
是 failed/degraded，不借后续成功抹掉未知范围；完整可读行以真实写回调核对，
fsync:false 不提供 DR 保存回执。无额外健康轮询；1000 ms 的旧探针观察窗口
不是任意 OS/负载下的硬时限。

每个固定 gap reason 只持一份有界聚合，不以 tenant/run/任意文本建立无限 key；
合并 seq 区间不声称每条都丢失。包括 warn/error 的等级/容量/投影/写入/关闭
失败都可查。恢复可写时追加安全 gap summary，失败仍留状态，不制造重试风暴。
崩溃可能丢尾部与内存计数，重启记 crash_unknown，不补造精确丢弃数或业务状态。
原件/来源统计只向可信运维开放；未来 tenant 查询无法安全分摊全源 gap 时
表达覆盖未知，不能泄漏他租户数量/ID；最终读权归 engineering。

## 来源生命周期与消费者约束

应用先停止/结算或明确隔离业务生产者、保存关键终态并关闭 records，再收口
诊断。runtime 关闭时关新 scope/span，既有 span 向原 generation end；等待
有限活动 span、SDK flush、Sonic finish/close，清理自己的等待计时器并 disable
ALS。不等待 within 的业务 Promise，destroy 被调用不能替代真实资源释放。

closing/closed 的 current 返回 null，within 直接调用 body 一次；输出访问
后端前检查原 generation/状态，迟到引用不能碰已释放流或改投新代。仅 ALS.disable
不足以使调用者捕获的 native context 消失。closed 只表示本实例资源释放，
不证明业务 body 停止；deadline 只结束调用者等待，未收口仍 blocked。已确认
保有的清理可加入/重试原责任，真实 raw fd 关闭结果未知的限制见下文 R1 节。

换代由应用先准备/验证新 runtime，再原子切换新工作注入并排空旧代；准备失败
保留旧选择，旧释放不误关新资源。宿主只保留当前代及至多一个待清理旧代，
旧代未释放时拒绝再次换代；目录 owner 的共同额度允许这两个来源并存。

JSONL/admission 用本包 Diagnostics 记录面，实际注入签名由其公共接口拥有。
短门内只收集消费者自己的固定元数据并分配纯诊断 ID，log/startSpan/end、
序列化和 Sonic.write 都在外层门外。Sonic 异步回调不保证 fs.write 在另一栈开始。
admission 外层 enter frame 失效退出后输出并保持原返回/throw；JSONL 沿既有
门外写泵处理，隔离后诊断不能重新开放业务写入。每消费者最多16个固定大小
point加省略计数；JSONL至多一个门外回调，省略以安全 diagnostic.gate_capacity 摘要记录，
不新增公共排队 API。

各业务 owner 定义自己的静态 code/phase，本包不预造全事件目录。首批实际
消费者覆盖 writer取得/恢复、write/sync/回执、隔离/修尾、close/retryRelease，
以及 admission拒绝/发布/retain、late rejection/cleanup；主体、operation、
Position/水位及旧代归因复用原公开数据。普通诊断故障不自动调用 writer.quarantine，
业务结果与诊断关闭结果由应用分别报告。

## R1 候选：唯一目录 owner

本节为受审但待接受的 R1 选择。`diagnostics` 候选直接增加精确依赖 `fs-ext@2.1.1`；依赖方向仍为 diagnostics →
work-data/records 的公开类型及日志/trace 库，不取得 writer 服务。D1 装配顺序为：
取得目录 owner → 创建来源 runtime → 把记录面注入 JSONL/admission。关闭顺序为
业务消费者停止产生诊断 → 子 runtime 收口 → 目录 owner 释放锁。目录初始化
失败由装配返回明确 stage/code，不悄悄启动一个无锁 owner 或静默 no-op。

沿用 [P0 固定锁证据](../../../docs/proposals/core-capabilities/implementation/evidence/p0-lock-probe/README.md)：Node 24.18、Linux 本地
ext4、`fs-ext@2.1.1` 官方 tag `aded976099c2b06c944f0897a9b004dbf266e234`，
两个独立 open file description（含同进程）排他，SIGSTOP 不释放、SIGKILL
释放。原生安装先 ignore-scripts，再只允许并 rebuild fs-ext，使用支持 Node 24
C++20 的工具链；本机 g++ 9 不满足，P0 已验证 GCC 10.5。根锁、构建 allowlist
与独立消费者实装由整合者接入，本次不重新选择原生库或构建整套环境。

宿主使用部署控制的专用本地目录；factory 规范化/realpath 后在其中打开固定
`.diagnostics.lock`，拒绝符号链接或非普通锁文件，核对已打开 fd 与路径的
device/inode。一旦创建，任何 generation、重启、关闭和维护都不得删除、替换
或截断该锁文件；目录本身也不在活动期替换。锁由具体 fd 持有，先成功取得
`exnb` 才扫描或开来源文件。另一个 factory 即使使用路径别名或不同配置，也
必须独立打开同一 inode 并因内核锁冲突返回 unavailable；不依赖第一次调用者
通知它。没有等待锁的后台任务、PID stale lease、超时接管或隐式 registry。

这是合作调用者经唯一公开入口、部署控制路径、本机文件系统的保证；advisory
lock 不防护绕过库直接写目录的外部程序、敌对文件替换或 NFS。实际装配禁止
直接访问私有文件 sink；维护工具同样遵守稳定锁路径，活动 owner 期间不自行
删除来源文件。P3 保留策略仍由 engineering 拥有，未来必须与这个 owner 协调
或在其释放后取得同一锁；D1 不预增删除接口。

候选把 `maxFiles` 精确定义为**来源文件数**，固定零字节控制锁文件另占一个
目录项；因此默认是 8 个来源文件加 1 个锁文件，目录总字节仍最多 64 MiB。
锁文件必须长度 0，非零时拒绝开放且保留原件，不截断。其字节实际为 0，不另
借隐藏空间。未知文件、子目录、符号链接或不能辨认的来源文件导致扫描失败并
保留原件，不把它们忽略为可用余额。这一固定元数据项是原稿额度措辞需要明确
接受的实现修订，不能把既有“8 文件”悄悄当作任意额外文件许可。

## R1 候选：单一公共创建与管理面

以下为待接受的 TypeScript 实施面，复用当前公开 `OpaqueId`、`Counter`、
`DiagnosticsRuntime`、`DiagnosticStatus`；不是新的持久 DTO/Schema。原记录面
`Diagnostics`、span/context/identity 和裁剪规则不变。

```ts
type LocalDiagnosticsDirectoryOptions = Readonly<{
  directory: string; maxDirectoryBytes: number; maxFiles: number;
}>;
type LocalDiagnosticSourceOptions = Readonly<{
  instanceId: OpaqueId; sourceId: OpaqueId;
  level: 'debug' | 'info' | 'warn' | 'error';
  maxRecordBytes: number; maxActiveSpans: number;
  maxBufferBytes: number; maxFileBytes: number;
}>;
type DirectorySourceState = Readonly<{
  sourceId: OpaqueId | null; // 仅尚未开放的原件可无可确认身份
  phase: 'preparing' | 'live' | 'closing' | 'retained';
  chargedBytes: Counter; reservedBytes: Counter;
  resource: 'held' | 'released' | 'unknown';
}>;
type DiagnosticDirectoryStatus = Readonly<{
  phase: 'preparing' | 'active' | 'failed' | 'closing' | 'closed';
  lock: 'held' | 'released' | 'unknown';
  scan: 'incomplete' | 'complete';
  chargedBytes: Counter | null; // incomplete 时不声称目录余额
  reservedBytes: Counter;
  materializedFiles: number; reservedFiles: number;
  sources: readonly DirectorySourceState[];
  lastErrorCode: string | null;
  resource: 'held' | 'released' | 'unknown';
}>;
interface DiagnosticsDirectoryCleanup {
  inspect(): DiagnosticDirectoryStatus;
  close(options: Readonly<{ deadlineMs: number }>): Promise<Readonly<{
    status: 'closed' | 'blocked'; state: DiagnosticDirectoryStatus;
  }>>;
}
interface LocalDiagnosticsDirectory extends DiagnosticsDirectoryCleanup {
  create(options: LocalDiagnosticSourceOptions): Promise<
    | Readonly<{ status: 'invalid'; code: string }>
    | Readonly<{ status: 'unavailable'; code: string }>
    | Readonly<{ status: 'created'; runtime: DiagnosticsRuntime }>
  >;
}
declare function createLocalDiagnosticsDirectory(
  options: LocalDiagnosticsDirectoryOptions,
): Promise<
  | Readonly<{ status: 'invalid'; code: string }>
  | Readonly<{ status: 'unavailable'; code: string;
      cleanup: DiagnosticsDirectoryCleanup | null }>
  | Readonly<{ status: 'created'; owner: LocalDiagnosticsDirectory }>
>;
```

配置先检查有限安全整数及原有记录/缓冲约束，无 I/O 时 invalid 不造 cleanup。
目录 cap 可小于各来源 cap 的和，由共同余额限制实际使用；不要求均分或保留一
整个新文件额度。`owner.create` 是唯一可创建来源的实现入口；close/inspect
只给装配 owner，业务消费者仍只拿 `runtime.diagnostics`。

相同 sourceId、相同规范化配置的并发 create 加入同一次准备；相同 sourceId
但不同配置返回 `source_conflict`。已创建的同一来源返回原 handle（包括 closed
状态），不重新开文件；扫描遇到历史同名来源时返回 `source_exists`，不追加旧
原件。一次已确认没有留下文件/fd 的失败可重新尝试，不永久保存无资源失败表。
每个实际来源、待创建来源及其等待共享同一准备 Promise；表大小受来源 slot
上限约束，不为重复调用保存调用者任务。失败准备若已有文件或未释放 fd，返回
created 的 degraded runtime 供 inspect/close，且由目录 owner 持有同一责任。

## R1 候选：字节、slot 与失败记账

私有目录账本不进持久数据，不向消费者暴露 reserve/commit 操作。对完成扫描的
owner 始终保持：`chargedBytes = 已确认物理字节 + 尚不能排除的预留字节`，
`chargedBytes ≤ maxDirectoryBytes`；`materializedFiles + reservedFiles ≤ maxFiles`。
原件已超限时拒绝开放新来源并保留现场；不宣称历史超限已被修复。

| 边界 | 唯一 owner 的动作与释放依据 |
|---|---|
| 初始扫描 | 持锁后读取所有原来源大小，计入 materializedFiles/chargedBytes；仅全部检查成功且扫描临时资源已收口才开放 create |
| create 开始 | 在第一次 await/open 前同步预留 1 slot，登记来源和准备责任；并发来源不能消费该 slot |
| `open('wx')` 成功 | 预留 slot 转物理 slot，总额不变；立即登记 fd；新代准备失败也不能删除原件或抹掉 slot |
| open 失败 | 只有确认没有新文件且无未释放 fd 才退 slot；EEXIST 保留已有原件并拒绝来源，无法解释的碰撞使 owner 停止创建并报错 |
| 每条实际输出 | 先完成安全投影/编码，以最终 UTF-8 字节在同一同步调用中检查并借记目录与来源额度，再调用 Sonic.write；日志、span.end、clean-start/end 全部经过此处 |
| 真实 write 确认 | 实际已写入的字节从 reserved 转物理，charged 总额不变；短写只转换已确认部分，余量仍 reserved |
| 已确认未提交的 drop | 仅 Sonic 同步拒收且确认没有交给 fs 的那一条可退对应预留；throw/error/timeout 本身不能证明没写入 |
| 部分写/回调未知 | 保留不能排除的字节上界，停止该来源继续写；gap/failed 明确可查，不能用物理 lstat 的短暂较小值再借出 pending |
| 来源最终收口 | 所有可能写入路径已静止、fd 已确认关闭后核对该文件最终大小，只释放经核对未使用的预留；物理文件和 slot 留在目录账本中 |

无 await 横跨额度检查与借记。实际输出仍须在 consumer 的短门**外**，保持
已接受的 Sonic `minLength: 0`、有界缓冲和单条低流量行为；目录账本不添加排队
框架。Sonic 的缓冲/写入机制不负责共享额度，产品必须正确绑定其真实写回调、
drop 与关闭边界，避免重计、过早释放及 `stream.write` 已同步触发 fs.write 的
竞态。不要求 fsync 诊断记录，不把成功 callback 当业务耐久回执。

旧代活动 span 结束时仍向原子 runtime 输出并向同一目录借记；新代 prepare
失败不影响原代，旧代失败不关闭新代。目录额度不足只让相关诊断被拒收并留下
`retention_capacity` 缺口，不覆盖业务结果。单来源 runtime.close 只关闭本来源，
不释放目录锁，也不把该文件的物理容量还给其他来源。

## R1 候选：初始化、关闭与责任保留

扫描顺序执行，最多同时拥有锁 fd、一个目录扫描 handle 和一个旧文件检查 fd；
扫描关闭失败即停止展开，保留准确 handle/阶段。创建 slot 限制并发 source
prepare，打开 fd 后先登记所有权再配置/转交 Sonic，不能靠 catch/finally 丢弃
失败清理。目录 owner 记录每个仍可访问目录的子资源，`inspect` 的来源列表有界，
扫描达到超额项即失败，不为超限历史目录建立无限来源列表；扫描失败的部分和
不作为可用余额。所有错误码为安全分类，不保存路径/原异常全文。

factory 取得锁或打开 fd 后失败，先尝试收口；完整释放才能返回 unavailable+
cleanup:null。任一失败保有返回 cleanup handle，供重复 close/inspect；扫描失败
先由该 handle 收口，再重新调用 factory 扫描，不另增 retryPrepare。锁冲突的
loser 也要关闭自己刚打开的 fd，关闭未确认就返回 cleanup，不能只返回 busy
然后遗忘描述符。初始化失败若已持锁且仍有扫描/准备责任，锁持续归该 cleanup。

owner.close 同步关 create 入口，加入正在准备的来源并调用所有子 runtime.close；
超时只返回 blocked。活动 span、pending write、迟到 open、扫描 fd、关闭失败、
最终大小核对失败仍归原 owner，重复 close 加入/重试同一实际责任。目录 owner
不接管业务 body，不增加 Promise observer 或等待任意 caller 的 Promise。
来源 runtime 的 O06/O07 关闭、隔离和 generation guard 保持原语义。

**锁最后释放**：只有来源/准备/扫描路径全部确认不会再访问目录、所有相应 fd
已收口且最终占用核对完成，才能关闭持锁 fd；不用先 unlock 再清理。此前 owner
尚未收口时，第二 factory 必须被真实 flock 拒绝。close 返回 closed 要求全部
资源确认释放；任一失败均不能报 closed，原管理 handle 仍可查。

最后锁 fd 的 close 若返回结果不确定，保留 `lock/resource: unknown` 与
`release_unknown` 事实；不得盲重试可能已复用的数字 fd。此时业务/扫描/来源已
全部静止且永久封闭，旧 handle 不能恢复写入。后继 factory 仍以实际 flock
判断排他：若旧 fd 真未释放则拒绝，若已释放则可取得。仅 flock 无法让一个
**已经静止但锁释放结果未知**的旧报告同时强制阻止新 owner；本稿显式区分这个
报告未知与仍有写入责任的 blocked，不引入额外持久协调协议伪造保证。此边界
及零字节锁目录项已随 d4cd27e 受审，仍待主调度明确接受。

与 D1-R2 的区别有可核对来源：`fefb6c5` 的 R2 注入在调用 originalClose **前**
直接回调 EIO，测试中的原 fd 因而确定仍保有。它支持该已知前置失败的 close
重试，不能证明实际 syscall close 的任意错误也保留同一个 fd。真实结果未知
不根据数值 fd 的当前可用性猜测身份，不盲重试；inspect/close 保留 unknown，
重试只针对能证实仍由原 handle 拥有且尚未完成的清理。这个区分同样适用于
扫描和来源 fd；对 R2 产品处理的影响已交回原实施者与主调度核对，本稿不替其
补丁作接受判断，也不将模拟错误推广成操作系统保证。

装载与撤除逐项对应如下，遵循[生命周期指南](../../../docs/architecture-guide/runtime/lifecycle.md)
的责任划分；实例退出不恢复目录装载前快照：

| 本次装载的效应及发布时点 | 撤除、完成判据及必须保留的事实 |
|---|---|
| 打开稳定控制文件并取得 flock；未扫描完成不发布可创建 owner | 所有子资源静止后关闭持锁 fd；锁文件原件永不 unlink/截断，未知释放保留事实 |
| 扫描原件建立本实例账本；扫描临时 fd 先收口再开放 create | 清理本次扫描 handle；不修改旧原件、不回滚其它已合法来源，失败责任归 cleanup |
| 创建前预留 slot，open 成功后建立来源文件及 fd | 未建文件且清理确定完成才退 slot；文件存在则保留原件和实际占用，迟到 open 仍被正在关闭的 owner 接管 |
| 子 runtime 建立 sink/listener/OTel/ALS，完成准备后才由装配选择为当前代 | 沿原 O06/O07 使旧入口失效并关闭该子资源；不关闭同目录新代，不等待/撤销 caller body，不删除已输出事实 |
| 每条输出先借记，真实文件写入逐步产生可确认事实 | 停止新借记、等待或隔离 pending；仅核对后退未用预留，物理字节保留给 P3，不因卸载伪称写入已撤销 |

目录 owner 是具体资源能力，不另造 Cordis 服务键、动态插件框架或清理引擎。
将来挂载到既定宿主生命周期时，装配持有其管理 handle 并按以上先后收口；
框架撤除注册不替代 owner.close 的实际结果。依赖模块的进程代码缓存也不等于
本实例仍拥有活动 fd/回调，不要求为释放 owner 卸载整个 native 模块。

## 验证范围与未关闭义务

已有原语保证限于 P0 的实际锁语义及原观测证据的 Sonic/OTel/Pino 行为。共享
账本、fd 转交、同源 create 合并、owner 关闭及真实装配是**新增产品责任**；
本次小探针只验证有界记账与真实文件交错可以成立，不抵扣下列产品 TDD。

| 最低新增场景 | 必须可观察的结果 |
|---|---|
| D1-R1 原 2 条 RED 原样迁移唯一入口 | 挂起旧 span 写入再开新代、并发 create 截留真实 open；总字节不超过 2400，来源数不超过 1，失败/gap 对账 |
| 共同动态额度 | 两来源同时活跃，旧代最后 span 与新代日志竞争最后字节；编码字节/单源/目录 cap 均不突破，不靠均分通过 |
| 预留回收 | 同步 drop、短写后 error、回调迟到、最终 stat 失败；只退已证实未使用字节，来源 close 后实际文件/slot 仍在 |
| 来源准备与身份 | 同源同配置重复/并发只一次 open；冲突配置拒绝；新代 open/config 失败保留空原件及 fd，旧代仍运行；清理成功前不能借出 slot |
| 唯一目录 owner | 同进程两个公开 factory、路径别名、两个进程；未释放 owner 的第二创建实际失败；稳定 dev/inode，不替换/删除锁；复用 P0 原语场景并测真实包接入 |
| 初始化/关闭资源 | 锁 loser fd、扫描目录/旧文件 fd、新文件 fd 各注入关闭失败，handle 可查；迟到 open/活动 span/pending 时 owner.close blocked 且第二 factory 被拒绝；重试成功后才能新建 owner |
| 原件与重启 | 空/非 clean-end/部分文件保留并计容量；未知文件与非零锁拒绝，锁释放未知的报告与实际再获取分开；重启扫描重建账本，业务因果与原件身份不改 |
| O08 精确公开消费 | 独立 tarball 安装并显式构建 fs-ext，实际加载/两个 factory 排他；无旧独立创建入口、无 records/work-data 反向依赖 |


当前创建入口仍是源码中的旧 factory；R1 接受并实现后只开放
`createLocalDiagnosticsDirectory → owner.create`，删除旧入口及重复目录预算参数，
不保留未上线兼容层。JSONL/admission记录面类型不变；应用和独立消费者必须
迁移目录 owner 的创建、inspect/close 和退出顺序，不能从私有 sink 绕过它。

[目录修订来源](../../../docs/proposals/core-capabilities/implementation/observability-directory.md)
记录固定 RED、选型比较及待接受差异；
[证据目录](../../../docs/proposals/core-capabilities/implementation/evidence/observability-directory/README.md)
保留 d4 的4个机制 case及原始产品 RED，后者仍需真实包 GREEN。O01–O08及
R1新增场景按[验收来源](../../../docs/proposals/core-capabilities/implementation/observability.md#四输入细化tdd-与交接顺序)
和[总体验收](../../../docs/proposals/core-capabilities/implementation/acceptance.md)的基线子集执行，
O09/O10 由真实消费者组合兑现。R6窄缺口闭合不替代 R1、O08独立产物或组合证据。

主调度负责 D-010 的限定采用、原施工输入/README/契约可变入口导航、根依赖锁
及 native 构建 allowlist、应用装配引用与交付对账；原 D1 作者在该输入固定后
实现 R1。包 design 的归属迁移不自动接受候选，不改 OB/CD/DR/CC v1，不将完整
query/export、远程观测或真实模型请求增成本次基线硬门。
