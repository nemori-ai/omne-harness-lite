# 工程诊断提供者：设计映射

## 坐标、状态和能力边界

本包映射候选 `(omne-harness-lite-design-2026-09-15, capability.engineering-observation, 1)` 的本机被动诊断部分，尤其是 [OB-01～03](../../spec/capabilities/engineering-observation/v1/contract.md)。[D-010](../../decisions/shared-diagnostics/decision.md) 接受共享记录面与 Pino/Sonic/OTel 机制；[D-011](../../decisions/diagnostics-directory-ownership/decision.md) 取代其独立来源目录预算和锁管理。来源设计固定为 `packages/observation/diagnostics/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`、SHA-256 `32e4c2f88dd2c3cc73462347c090ebe0c258fe936e15c0a9431defbc877c2ae6`。本页承接长期提供者规则；实际接口以[包公开入口](../../../../packages/observation/diagnostics/src/index.ts)和固定实现修订为准，证据边界见[验证](verification.md)。

当前由受信应用创建唯一目录 owner 和 source runtime，只将受限 `Diagnostics` 注入消费者；配置、`inspect/close` 和 generation 选择归应用。没有已交付的 Cordis 服务键、logger bridge、全局 OTel manager 或插件装卸验证。未来插件适配必须先取得并验证具体资源，才发布记录面；撤除要观察实际清理结果，不能以 Context 卸载代替关闭。诊断原件是非耐久本地操作记录，关键审计随业务耐久提交或可核实 outbox 保存；本包不掌握业务 writer、授权、query/export 或保留删除权。

## 公共记录面与身份因果

`scope/current/within/log/startSpan/end` 是被动同步记录面，不授予身份或读取权限。受信入口先核实 tenant、principal、operation 与适用的业务关联，再冻结为 context；无效输入只产生安全 system context，不保留原对象。显式 parent 默认 ROOT；parent 的 tenant 或主体不匹配时拒绝继承，另建根并记关联缺口。认证前不能借可信 system principal 伪造入口 operation；无 Session 的工作不虚构 Run。

每个 runtime 有私有 OTel provider 与 ALS manager，不注册进程全局 manager。`current` 只读本 runtime 的词法上下文；排队先 capture，出队由实际执行 owner 恢复，timer/文件流从受信 ROOT 初始化。ALS 不是授权，也不从全局 OTel/DSH initiator 猜测身份或自动传播到 fs/http。`within` 只调用 body 一次，原样保持返回值、Promise 身份、同步抛错和异步拒绝；不读取 `then`、观察结算或等待业务 Promise。只有 body 执行前激活失败时才以显式参数调用一次。span 在真实阶段结束，重复 end 不重复终态；长期 Session、人类等待和宿主寿命不保持活动 span。恢复时建立新实例/span，沿原 work/attempt/parentOperation 延续业务因果，不反序列化旧运行对象。

来源记录标记 generation、单调来源 seq、观测时间、固定 component/phase/code/level 及适用的 tenant、principal、operation、causal parent、writer epoch/revision、Position/Watermark 与 trace/span 关联；关联事实由可信业务 owner 给出，不由诊断推断。来源 seq 不是业务 commit.seq、水位或保存回执；`newId` 由宿主分配的实例身份加实例内计数形成。业务 `rejected/unknown` 保留原结果，不由 Promise resolve 或 span ok 推导成功。投影与后端失败只更新有界健康状态，不调用业务 listener、不递归记录，也不覆盖业务结果。

## 安全投影、预算与健康

受信宿主校验并冻结配置；生产、研发和 debug 共用结构与默认裁剪，debug 只增加具名阶段细节。投影仅读自有数据属性，拒绝 getter、`toJSON`、循环、未知字段和超限值，在进入 Pino、OTel、缓存前完成；Pino 固定 redaction 仅为第二层。禁止 prompt、模型响应、工具参数/结果正文、URL query、headers、密钥和任意 Error/stack/cause 槽位。过长身份不能截成另一有效身份，异常只记安全 code/phase，不自动 `recordException`。

| 预算/机制 | 当前选择；不构成业务耐久保证 |
|---|---|
| 记录/span | 最终 UTF-8 行 ≤8 KiB；活动 span ≤256；每 span ≤32 属性、8 事件、4 links，字符串 ≤256 字符；记录面不开放任意 OTel 字段 |
| 本地输出 | `pino@10.3.1`、`sonic-boom@4.2.1`；`sync:false,minLength:0,maxLength:1048576,maxWrite:16384,fsync:false,retryEAGAIN:()=>false`；log 和结束 span 共用流 |
| Trace/context | `@opentelemetry/api@1.9.1`、`sdk-trace@2.11.0`、`context-async-hooks@2.11.0`；每 runtime 私有，不设 worker transport、远程 exporter 或额外队列 |
| 来源/目录 | 来源路径不取 tenant 或调用者输入；目录 0700、来源和锁 0600；每来源 ≤8 MiB，同目录至多 8 个来源文件加一个零字节锁文件，总量 ≤64 MiB |

单条低流量记录也应立即开始异步 write，不等下一条、4 KiB 门槛或 close。Sonic 可能在同步 `log` 栈发起 `fs.write`，因此实际输出必须在业务短门外。`inspect` 分开呈现 attempted、accepted、dropped、pending、真实写回调字节、活动 span、资源和安全错误；pending 从最近真实进展计时，超过 1000 ms 无进展报 `stalled`，不是丢失或硬时限。部分写、EIO、未知回调保留 failed/degraded/unknown 质量，后续成功不抹除未知；重启仅报 `crash_unknown`，不编造精确丢弃数。每个固定 gap reason 只保留一份有界聚合，合并 seq 区间不声称每条都丢失；可写时附加安全 gap summary，失败仍可查询状态。全源 gap 不能安全归到单一 tenant 时，tenant 读面只能报覆盖未知，不泄漏其他 tenant 的数量或 ID。

## 唯一目录 owner、来源身份与共同账本

唯一公开 factory 在部署控制的本机目录打开固定 `.diagnostics.lock`，规范化/realpath 后核对普通零字节文件、无符号链接、fd/path 同一 device/inode，以 `fs-ext@2.1.1` 的真实 `flock(exnb)` 独占后才扫描原件或创建来源。锁文件和目录在 generation、重启、关闭、维护期间不替换、不截断、不 unlink。同进程第二个 open file description 及跨进程竞争均由内核锁拒绝，不靠 PID、过期租约或内存 registry。保证仅限合作调用者、唯一入口、部署控制路径及已验证的本机 Linux/ext-family；不覆盖 NFS、敌对目录写入或绕过库的程序。

持锁扫描旧来源与大小，扫描 fd 收口后才开放 create；未知文件、子目录、符号链接、非零锁或不可辨来源使开放失败并保留原件，部分扫描结果不作为可用余额。同一 sourceId 与规范化配置的并发 create 加入同一准备；异配置报 `source_conflict`，已创建 handle 即使 closed 也不重新开文件，历史同名报 `source_exists`。仅确认无文件、无 fd 的失败可重新尝试。首次 I/O 前同步预留来源 slot；`open('wx')` 成功即登记物理文件和 fd。准备失败若留下文件/fd，归 owner 的 degraded runtime 或可 `inspect/close` cleanup，不把孤儿资源当作 unavailable。

共同账本令 `chargedBytes = 已确认物理字节 + 尚不能排除的预留字节 ≤ maxDirectoryBytes`、`materializedFiles + reservedFiles ≤ maxFiles`。每次输出先投影和编码，在同一同步段按最终 UTF-8 字节向来源及目录借记，再交 Sonic；真实写回调只把已确认部分从 reserved 转物理。仅同步拒收且确认未交给 fs 的记录可退对应预留。短写、回调错误、超时或暂时较小的 `lstat` 不能证明未写入，保留上界并停写该来源。所有可能写入路径静止、fd 确认关闭且最终 stat 后，只退确证未用的 byte reservation；物理文件、slot 和实际字节仍占额度，直到后续受治理删除。来源额满只拒收诊断并报 `retention_capacity`，不改变业务结果。

## 换代、关闭与未知释放

source runtime 先封新 scope/span，既有 span 向原 generation end；等待有限活动 span、SDK flush、Sonic finish/close，清理自身 listener/timer 并 disable ALS，不等待 `within` 的业务 Promise。closing/closed 的 `current` 返回 null，`within` 仍直接调用 body 一次；迟到引用不能访问已释放流或写入新代。deadline 仅停止调用者等待；`destroy()` 调用不等于 fd 释放。raw fd close 结果未知时不能盲重试可能已复用的数字 fd，保留原责任。

应用先准备/验证新 runtime，再原子切换新工作注入并排空旧代；准备失败保留旧选择。宿主至多保留当前代和一个待清理旧代，旧代未释放时拒绝再次换代。这是[装配政策](../../assemblies/local-harness/design.md)，不是目录 owner 的业务 generation 管理。旧代晚到输出仍向原 runtime 与共同额度借记，旧释放不关新资源。

directory owner.close 同步封 create，接管迟到 open、加入正在准备的来源，等待所有 runtime、pending write、扫描 handle 和 fd 静止并核对最终占用，**最后**关闭持锁 fd。任一子资源、准备、最终 stat 或锁释放未知都不能报 `closed`；保留可 `inspect/close` 的 blocked/unknown 责任，只重试仍可识别的原资源。初始化/扫描/open 失败亦然：确认完全释放才返回无 cleanup 的 unavailable；锁竞争 loser 的自身 fd 关闭未知也要交 cleanup。最后锁 fd close 未知时旧 owner 永久封写并保留 `release_unknown`，不盲重试数字 fd；新 factory 只凭真实 flock 判定接管，未知报告本身不虚构持久禁止权。

## 消费者交接与仍缺证据

| 边界 | 提供者交付与其他 owner 责任 |
|---|---|
| 应用宿主 | 唯一 factory、受信配置、代际选择和关闭顺序；业务生产者与 records 结算后才收诊断，不能以 Cordis disposer 调用代替真实释放。插件映射和装卸仍待验证。 |
| JSONL / Admission | 本包只交受限记录面；二者短门内只收固定元数据和纯 ID，`log/startSpan/end`、编码和 Sonic I/O 在门外。每消费者 ≤16 个固定 point、JSONL 至多一个门外回调与失效 frame 处理归[JSONL](../storage-jsonl/README.md)和[Admission](../coordination-admission/README.md)。诊断故障不得隔离业务 writer 或覆盖回执。 |
| 工程观测读面 | 受治理 cursor、索引、query/export、保留/删除和 tenant 读权由后续提供者拥有；本包只给原件及健康/gap，不声称闭合 OB v1 全部。 |

当前候选 v1 的精确符合性、应用装配、短门消费者和 Cordis 生命周期分别需要证据，不由 D-010/D-011 接受或旧 P1 日志直接推出。
