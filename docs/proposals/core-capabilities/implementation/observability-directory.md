# D1 诊断目录的共同额度与所有权修订候选

状态：待独立评审及主调度接受。输入固定为 `82b2baf7f88bcbe8b089b9c53278135a545169b7`
的 [scope](scope.md)、[runtime-baseline](runtime-baseline.md)、[observability](observability.md)
O01–O08 和 [plan](plan.md) 的 D1-R1。沿用已接受
[D-010](../../../decisions/D-010-shared-diagnostics.md)（`5e81ee8`）与
[OB v1](../../../../spec/capabilities/engineering-observation/v1/contract.md)、
[DR v1](../../../../spec/capabilities/durable-records/v1/contract.md)、
[CC v1](../../../../spec/compositions/core-work-coordination/v1/contract.md)。
只修目录额度与实际资源责任的实现选择，不修改正式规格，不缩减 M1/M2 A01–A32。
另按主调度指定的 HUB `8c72067` 只读核对 `spec-maintenance` skill、规格维护
规范及生命周期指南的新装载效应要求；当前授权仍限本候选及专属证据，包内
长期 `design.md` 由后续同步后的定点修订落位。

## 原因、选择与替代范围

`diagnostics@66d92a9` 按每次 factory 的物理扫描给新来源余额，随后只累计该
runtime 的输出。独立反例 `fefb6c5` 挂起旧 span 的真实写入后创建新来源，得到
单文件各自未超限、目录 **3356 > 2400 bytes**；两个 create 都扫描完才放行
`open('wx')`，得到 **2 > 1 source files**。这违反原稿包含旧代和 pending 的
额度保证。[固定 RED 与新机制证据](evidence/observability-directory/README.md)
分别记录产品失败和有限可行性；后者不能替代产品 GREEN。

候选选择一个显式 `LocalDiagnosticsDirectory`。目录 owner 先取得本地排他锁、
扫描旧原件，再创建并拥有多个来源 runtime。所有来源共享逐条编码后的字节
记账与创建前的 slot 预留；单来源上限继续独立生效。公开入口只保留
`createLocalDiagnosticsDirectory → owner.create`，删除原独立
`createLocalDiagnostics`，不保留未上线产品的兼容入口。

| 机制 | 判断 |
|---|---|
| 仅约定宿主创建一次 | 两个公开 factory、两个模块副本或两个进程无法发现误装配，不满足实际拒绝 |
| 隐式全局 Map | 不是目录资源 owner，跨进程/模块副本失效，本次不采用 |
| `mkdir`/`wx` 作为所有权锁 | 进程死亡留下原件；自动恢复需要另加 stale lease/删除协议，本次不采用 |
| 借用 JSONL writer 的锁 | D1 要先于 writer 初始化；引入反向依赖且诊断目录并非业务 journal |
| 稳定锁文件上的 `fs-ext@2.1.1` `flock(exnb)` | 采用候选：复用 P0 已测的同进程、跨进程排他和死亡释放，只新增具体目录 owner 的集成责任 |

不静态均分额度，不为每个来源预占整个 maxFileBytes，不以开文件后再扫修补竞争，
也不禁止新旧 generation 并存。无需新的日志队列、持久预留账本或通用锁服务。

## 唯一 owner 的成立范围

`diagnostics` 直接增加精确依赖 `fs-ext@2.1.1`；依赖方向仍为 diagnostics →
work-data/records 的公开类型及日志/trace 库，不取得 writer 服务。D1 装配顺序为：
取得目录 owner → 创建来源 runtime → 把记录面注入 JSONL/admission。关闭顺序为
业务消费者停止产生诊断 → 子 runtime 收口 → 目录 owner 释放锁。目录初始化
失败由装配返回明确 stage/code，不悄悄启动一个无锁 owner 或静默 no-op。

沿用 [P0 固定锁证据](evidence/p0-lock-probe/README.md)：Node 24.18、Linux 本地
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

## 单一公共创建与管理面

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

## 字节、slot 与失败记账

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

## 初始化、关闭与责任保留

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
及零字节锁目录项均需独立评审和主调度接受。

与 D1-R2 的区别有可核对来源：`fefb6c5` 的 R2 注入在调用 originalClose **前**
直接回调 EIO，测试中的原 fd 因而确定仍保有。它支持该已知前置失败的 close
重试，不能证明实际 syscall close 的任意错误也保留同一个 fd。真实结果未知
不根据数值 fd 的当前可用性猜测身份，不盲重试；inspect/close 保留 unknown，
重试只针对能证实仍由原 handle 拥有且尚未完成的清理。这个区分同样适用于
扫描和来源 fd；对 R2 产品处理的影响已交回原实施者与主调度核对，本稿不替其
补丁作接受判断，也不将模拟错误推广成操作系统保证。

装载与撤除逐项对应如下，遵循[生命周期指南](../../../architecture-guide/runtime/lifecycle.md)
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

## 实施交接与最低验收

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

主调度接受后需精确对账：

1. `observability.md` 的配置/额度（原 97–99 行）、公共 factory（原 180–193 行）、
   owner 关闭和 O04–O08，改为本稿的共同目录 owner；其它 O01–O03 与 O09–O12
   仍按原稿验收。D-010 记录此次限定替代与证据，不改冻结 OB/DR/CC。
2. `implementation-spec.md`、`runtime-baseline.md`、`plan.md`、`delivery.md` 的
   D1 输入/顺序/证据，以及根 workspace/lock/原生构建 allowlist，由整合者更新；
   不把本文探针当 D1 产品交付。正式包作者只修改 diagnostics 的 R1 实现与测试。
3. D2/P2/P3 应用装配输入改为 root 目录 owner 创建多个来源并持有 inspect/close；
   jsonl/admission 的记录面注入类型不变。所有测试/独立消费者迁移唯一 factory，
   shutdown 先收消费者和子来源再释放目录；P3 维护须协调同一目录 owner。

本稿作者不接受自己的选择；独立评审后由主调度固定受审提交，再交原实施者
完成 R1 的实际 RED/GREEN。其余五项既有产品缺陷继续由原实施者负责，本稿不
重审其修补，也不扩展 collector、平台、业务审计或正式规范发布范围。
