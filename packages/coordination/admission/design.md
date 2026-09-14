# 同步准入提供者设计

本页拥有 `@omne-harness-lite/admission` 的 P1 同步短门、双视图发布与精确使用映射。
来源是[共享接口实施稿](../../../docs/proposals/core-capabilities/implementation/shared-interfaces.md) 在迁移前固定提交
`7af250ee19df1077a5143cac817558caa959a392` 的相关正文；
原 `8f4cfa9` 已接受为施工输入，
[D-010](../../../docs/decisions/D-010-shared-diagnostics.md) 后续增加必需 Diagnostics。
`2c3aede7` 的归属迁移已通过主调度独立内容核验并接受，依据见
[迁移采用](../../../docs/proposals/core-capabilities/implementation/shared-interfaces.md#p1-映射迁移的采用)；
不更改原公开记法或行为，产品仍未交付。

精确承诺沿 [CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md)、
[core-work v1](../../../spec/data/core-work/v1/contract.md) 与
[identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)。
本页负责 CC-01–07 的共同协调机制；业务状态、正负向事实和每种具名组合的事件
仍由原 owner 实现。当前交付终点沿[最小运行基线](../../../docs/proposals/core-capabilities/implementation/runtime-baseline.md)；
保留的 request/answer 等共享协议形状不表示完整 HD 或 M1/M2 已进入本批实施。

## 公开入口、依赖与实际状态

本基线尚无 admission 产品实现。下列声明是已接受、**待实现**的默认公开入口
`@omne-harness-lite/admission` 记法；迁入包目录不等于已编译 API 或产品通过。
已实现的 DTO、Checked 与规范值归
[work-data 公共源码](../../core/work-data/src/index.ts) 和
[README](../../core/work-data/README.md)；records 数据、准备/读写端口与回执的精确签名归
[records 公共源码](../../storage/records/src/index.ts) 和
[README](../../storage/records/README.md)，本页只 import，不另定义这些类型。

本包依赖 work-data、records、diagnostics；真实 writer 由
[JSONL factory](../../storage/jsonl/design.md#公开入口依赖与实际状态) 提供。
jsonl 不依赖 admission，业务通过本包消费共同准入。受信应用直接调用
createAdmissionCoordinator 并保管返回的 AdmissionHost；这里不新增 Cordis
插件、服务键或 Context/Fiber 作用域。应用如何向业务提供 coordinator 归
[应用装配设计](../../../apps/local-harness/design.md)，不因此取得业务状态转移权。

Diagnostics 是 factory 的必需注入，精确消费面与应用管理资源归
[diagnostics 当前设计](../../observation/diagnostics/design.md)、
[D-010](../../../docs/decisions/D-010-shared-diagnostics.md) 与
[D-011](../../../docs/decisions/D-011-diagnostics-directory-ownership.md)。
本包只消费受限诊断，普通输出在短门外；不取得目录管理面，不把日志写入当作业务审计。
D1 的 R1/关闭/锁/原生消费者最终产品接受与真实 writer 组合仍待完成。

## 业务消费的窄边界

业务能力只持 AdmissionCoordinator，使用其继承的 RecordPreparation 面；coordinator
保管 writer 并通过同一个 writer 的纯准备实现创建 token，不向业务暴露 commit、
quarantine、closeWriter 或完整 reader。RecordPreparation 是窄能力边界，不是另建
一个具有状态的转发服务。后文业务调用示例均使用 coordinator.prepareOperation /
coordinator.prepare；基础设施测试才可直接持有 RecordWriter。

prepareOperation 只规范化并冻结原操作身份/输入，不要求当前工具实现或其它
业务资源存在。入口先在门外取得此值，再经短门 lookupPrepared 认回原操作；
只有 not_seen 才准备新的业务后果。这样已提交重试不会因为新版本装载失败而
丢失旧回执。返回旧内容前仍须核对当前读取资格；重新进入提交门时再查一次去重。

## 同步短门、两份视图与精确使用

本批一个 coordinator 独占一个 writer 的提交能力。业务 owner 保存自己的
immutable logical/durable 根；coordinator 仅保存有序票据、参与 owner 的发布动作
与资源责任，不读取它们的业务字段，也不提供任意 key/value 状态或自动事务回滚。
跨能力组合必须是下列具名关系之一，单 owner 管理变更也经过同一门以建立撤销序。

```ts
import type { OpaqueId, OperationRef } from "@omne-harness-lite/work-data";
import type {
  Position, Receipt, UseBinding, PreparedCommit, CommitResult, CommittedReceipt,
  Watermark, RecordPreparation, PreparedOperation, CloseResult, RecordWriter,
} from "@omne-harness-lite/records";
import type { Diagnostics } from "@omne-harness-lite/diagnostics";

export type CompositionKind = "owner_change" | "input_run" | "action_execution" |
  "request_wait" | "answer_consequence" | "budget_call" | "content_media";
export type AdmissionFailure = Readonly<{
  status: "denied" | "conflict" | "unavailable"; owner: string; code: string;
}>;
declare const gateFrameBrand: unique symbol;
export type GateFrame = Readonly<{ [gateFrameBrand]: true }>;
export type OwnerPublication = Readonly<{
  owner: string;
  publishLogical: (position: Position, frame: GateFrame) => undefined;
  publishDurable: (receipt: Receipt, frame: GateFrame) => undefined;
}>;
export type ReleaseResult =
  | Readonly<{ status: "released" }>
  | Readonly<{ status: "retained"; diagnosticId: OpaqueId }>;
export type ExactUse = Readonly<{
  [exactUseBrand]: true;
  binding: UseBinding;
  retainAt: (position: Position, frame: GateFrame) => undefined;
  release: (reason: "not_admitted" | "verified_not_committed" | "settled") => Promise<ReleaseResult>;
}>;
declare const exactUseBrand: unique symbol;
export interface ExactUseIssuer {
  capture(binding: Omit<UseBinding, "owner">, callbacks: Readonly<{
    retainAt: ExactUse["retainAt"]; release: ExactUse["release"];
  }>): ExactUse;
}
// Private admission bookkeeping; not an exported data contract or resource owner.
type ExactUseClaim = Readonly<{
  operation: OperationRef; canonicalInput: string; position: Position;
}>;
type ExactUseLifecycle =
  | Readonly<{ phase: "fresh" }>
  | Readonly<{ phase: "claimed"; claim: ExactUseClaim; retainInvoked: boolean }>
  | Readonly<{ phase: "releasing"; claim: ExactUseClaim | null; completion: Promise<ReleaseResult> }>
  | Readonly<{ phase: "retained"; claim: ExactUseClaim | null; diagnosticId: OpaqueId }>
  | Readonly<{ phase: "released"; claim: ExactUseClaim | null }>;
export type PreparedAdmission = Readonly<{
  composition: CompositionKind;
  commit: PreparedCommit;
  publications: readonly OwnerPublication[];
  uses: readonly ExactUse[];
}>;
export type AdmissionCompletion = Exclude<CommitResult, { status: "committed" }> |
  Readonly<{
    status: "committed"; receipt: CommittedReceipt; publication: "ready" | "blocked";
    diagnosticId?: OpaqueId;
  }>;
export type PendingAdmission = Readonly<{
  status: "pending_durability"; position: Position; operation: OperationRef;
  disposition: "apply" | "record_conflict";
  completion: Promise<AdmissionCompletion>;
}>;
export type AdmissionResult = PendingAdmission | AdmissionCompletion | AdmissionFailure;
export type CoordinatorStatus = Readonly<{
  phase: "open" | "closing" | "quarantined" | "closed";
  logical: Watermark; durable: Watermark; diagnosticId?: OpaqueId;
}>;
export interface AdmissionCoordinator extends RecordPreparation {
  enter<T>(work: (frame: GateFrame) => T): T;
  lookupPrepared(frame: GateFrame, operation: PreparedOperation): AdmissionResult | Readonly<{ status: "not_seen" }>;
  submit(frame: GateFrame, prepared: PreparedAdmission): AdmissionResult;
  status(): CoordinatorStatus;
  close(): Promise<CloseResult>;
}
export type AdmissionHost = Readonly<{
  coordinator: AdmissionCoordinator;
  createUseIssuer: (owner: string) => ExactUseIssuer;
}>;
export declare function createAdmissionCoordinator(writer: RecordWriter, diagnostics: Diagnostics): AdmissionHost;
```

这是**受信内部组合接口**，不交给工具 body、声明 resolver、通知监听器或用户代码。
createAdmissionCoordinator 的 AdmissionHost 仅由受信装配持有；装配只把 coordinator
给业务组合，把绑定 owner 的 ExactUseIssuer 给相应生命周期 owner，不把发行能力
交给其它业务或工具。createUseIssuer 对同一 owner 只绑定一次，输入非空且取自
装配清单；不提供按任意 owner mint 使用的消费方入口。capture 仅在原生命周期
owner 已同步扣住资源后包装原 pin；它固定 issuer/owner/binding/函数引用，在本
coordinator 的私有实例表登记对象身份。submit 同时查实例表与完整元组，不能靠
symbol 字段、TS cast、拷贝或反序列化伪造 ExactUse。这里没有全局静态注册表；
coordinator 只保管原 pin 的身份/责任，不代替 owner 取得或清理资源。capture 返回
包装后的 retainAt/release，原 owner 回调只留在私有表；所有调用必须经过下述
单次交接/释放守卫，不能把原始 release 函数直接作为公开句柄的方法。包装内部
调用 retainAt 原回调时也执行严格 undefined 检查，不能重新引入丢弃 Promise 的漏洞。
enter 只调用已绑定的受信组合代码；它拒绝重入和 thenable 返回，frame 退出即失效，
每次 owner 方法/submit 验证 frame 的真实归属与活动性。受信代码不得安排延迟工作
继续使用 frame。TS 无法证明无 await/无副作用，代码审阅和针对 Promise/重入的
运行测试是实现义务；检测违规后隔离域并具名报告，不吞异常当作普通拒绝。

每个 publishLogical、publishDurable、retainAt 也必须分别经过同步调用边界，
返回值**严格为 undefined**；TS 签名使用 `=> undefined`，不能用允许丢弃返回值的
`=> void`。普通 JS/any 传入的 Promise/thenable 或其它返回值仍由运行时立即拒绝，
随后隔离域并封闭该 frame；不等待它完成后称发布成功。已产生的 Promise/thenable
必须接管其拒绝通道，将晚到 reject 关联原 operation/owner/阶段的诊断；不能留下
unhandled rejection，也不能把晚到 resolve 改成 publication ready。该拒绝观察在
门外进行，且没有状态发布权。此检查逐个覆盖内层回调，不仅检查 enter 的返回值。

owner 的任何可变状态发布入口都验证活动 frame；回调不得以闭包绕过这些入口
在未来继续赋值。同步函数暗中启动工作也违反受信 owner 契约；类型/thenable
检测不声称能证明任意恶意 JS 无副作用，隔离执行插件仍是另一个产品范围。

每次准备先在门外完成外部查询、Schema 校验、资源取得、记录/候选根计算与
coordinator.prepare。进入门后，具名组合按固定顺序调用 owner 的**同步、纯条件
检查**：认证/租户与硬资格 → 对象修订与去重身份 → 定义/绑定/工作 epoch →
模式/grant/一次决定 → 预算及精确使用可取得性。owner 的精确版本和当前根必须
匹配准备的候选根；不匹配就退出重准备，不在门内做外部读取或运行 resolver。
纯检查不得改变状态；拒绝后按 owner 的审计路径提交具名拒绝结果，无法记录关键
拒绝则返回 audit_unavailable。未完整通过的操作没有逻辑准入位置或效果许可。

所有检查通过后由生命周期 owner 在同一 frame 内同步取得 ExactUse（只是将已准备
资源扣住，不执行 I/O）。使用者立即交给本次 PreparedAdmission；submit 成功前
仍是具名组合的责任。submit 首先验证 opaque commit 的真实 writer 归属，随后
验证 publication owner 集合与 PreparedCommit.owners **完全相等且每个恰好一次**；
空列表、漏预算 owner、多余 owner、重复 owner 都在写入排位前拒绝。它还核对
ExactUse.binding 的集合与 requiredUses.binding 完全相等、不重复，并核对每个
运行时使用句柄的真实原 owner/generation/epoch；字符串相同的伪造对象不算有效使用。
recordOwner 负责将该资源要求与自己的记录对应，资源 owner 可以不同于 recordOwner。
这些组装错误返回 AdmissionFailure 的 unavailable / owner=admission，并使用
invalid_participants、invalid_use 或 invalid_snapshot 代码及关联诊断；没有新的
位置/operation 占位，不能伪装成正常业务授权拒绝后让应用继续效果。

submit 在执行任何 retain/publication、调用 writer.commit 前，捕获本次输入的
不可变快照：复制并冻结 publications/uses 两个数组，读取并固定 owner/binding
数据和所有回调函数引用；拒绝 accessor/非法句柄，不保留随后可被改写的描述对象。
不得冻结调用者数组后继续依赖其可变子对象。真正的生命周期句柄不能深克隆，
只保留经过归属校验的原身份与当时捕获的方法，未来调用者替换数组/方法/metadata
不影响本票据。owner 候选根和记录本身由 owner 在准备时深冻结；回调不能捕获
随后可变的业务快照。coordinator 保管所有使用责任后才开始任何可能失败的回调。

通过上述检查后，submit 作 writer 的去重/当前修订判定，只有新的
pending 且 disposition=apply 才在同一短门把全部 fresh 使用一次性绑定到原
operation、规范输入与精确 Position，然后调用 retainAt 与全部 publishLogical。
任一使用已经归另一票据、正在释放、释放失败待处理或已释放，都在新的写入排位
前拒绝；不能因句柄 authentic 且 binding 相同就再次 claim。

duplicate 返回原票据/结果，不重复消费批准、预算或使用。同一 PreparedAdmission
在未耐久前再次 submit，原 claim 的 operation/规范输入/Position 全相同，因此
只认回票据，**绝不 release 原票据已持有的 pin**。若重试另外取得了 fresh pin，
这些 pin 没有转移给原票据，只清理本次快照中 fresh 且最终未被本次新票据 claim
的项；不清理其它票据拥有的项。无论重复、拒绝还是组装失败，都不能将传入 uses
数组整体当作“本次可释放资源”。从 lookupPrepared 认回旧结果不需要使用句柄；
把 released 句柄再传 submit 是非法使用，不影响单独查询原操作结果。

需要清理的 fresh 项在当前短门内先转为 releasing，禁止下一次 submit 抢先 claim；
只有实际 owner 的异步释放调用排到门外。其 not_admitted 成功后成为 released，
失败则 retained 并保留 owner 的诊断/清理责任，不回到 fresh、不允许假称已释放。
disposition=record_conflict 时不发布原业务根、不 retain 原使用；coordinator
仅按相同规则封闭并在门外释放本次未转移的 fresh 使用，只有 provider-owned 冲突记录在等待
耐久。它的 completion 返回带原 Receipt 的 conflict；相同 operation 重试和恢复
仍返回这个 conflict，不会因业务 stream 后来达到期望修订而改成成功。

| ExactUse 私有生命周期 | 允许的转移与不变量 |
|---|---|
| fresh | 原生命周期 owner 已扣住、尚未转移的一个 pin；只能 claim 到一份新 apply 票据，或封闭后按 not_admitted 清理。owner 对同一个实际 pin 只 capture 一次，不能重新包装旧 pin 来制造 fresh |
| claimed | 永久保留原 operation/规范输入/Position；retainAt 最多调用一次，调用前即记 retainInvoked，抛错/异步误用也不自动重试。同票据重复只认回，不再 retain；不同票据拒绝，不能覆盖 claim |
| releasing | 已同步封闭后等待原 owner 释放；并发 release 共享该次 completion，不重复调用 owner，不允许 claim。not_admitted 不能作用于已有 claim；原因字符串本身不是释放证明 |
| retained | 释放失败或无法确认释放，保留原 claim（若有）与 owner 责任；禁止复用。后续 release 只可重试原资源的合法清理，不得以不同 operation 换走责任 |
| released | 终态，保留失效标记/原 claim，永不重新 claim 或 retain；重复 release 只返回已确认结果。新工作须由真实 owner 重新取得新 pin，再 capture 新句柄 |

有 claim 的使用只允许在原 owner 持有该工作真实 settled 或 verified_not_committed
依据时开始释放；存储/效果 unknown 不授权释放。缺少依据的 release 返回 retained
诊断并保留原 claim，不触发实际资源释放：claimed 上的 not_admitted 由包装守卫
直接拒绝、状态仍为 claimed；settled/verified_not_committed 的实际证明由原 owner
在回调中先核对，拒绝或释放失败返回 retained 后，表项转 retained，绝不清除 claim。
原 owner 的 throw/reject 或无法确认释放同样有诊断并停在 retained；不能将错误
吞掉后转 released。coordinator 跟踪 claim、释放调用和结果以封闭句柄；是否安全释放及
真正关闭资源仍由原生命周期 owner 的事实与回调兑现，不建立第二份资源所有者。

publishLogical/publishDurable 只允许安装已经计算好的不可变根/水位及简单责任
指针；不做用户通知、资源清理、Schema 编译或权限查询。所有 owner 发布在同一
短门内完成，外部读取也经该门读取一致快照，不能观察半批发布。任何 publication
或 retainAt 抛错都是内部缺陷：立刻隔离 coordinator/writer，当前/后续票据按
实际写入分类，禁止效果，保留占位与资源；不能靠通用 undo 猜测回滚。
writer 已 committed 的记录仍返回 committed，附 `publication:"blocked"` 和诊断；
未能核实的记录返回 unknown。不得把已耐久事实因本地发布失败改称未提交。
正常拒绝应发生在纯检查阶段，不能把 throw 作为某一 owner 的 veto 协议。

writer 的入队与 coordinator 安装 logical 根在同一 JS 栈；写泵在栈退出后才能
启动，因此逻辑发布失败可以停止尚未开始的 I/O。队列中的确切位置即逻辑准入点，
对外只显示 pending_durability。writer 耐久 completion 由 coordinator 接收，
依 seq 顺序在另一短门提升全部参与 owner 的 durable 根，然后才完成**coordinator
自己的** completion 并允许通知/后续执行。不得直接把 writer 的 Promise 暴露给
业务，否则可能先收到 committed 却读到尚未安装的业务耐久状态。
只有 publication=ready 才能继续相关效果；blocked 允许认回提交事实，相关业务
读/写入口保持不可用，恢复重新建立根后才开放。查原 pending 时返回 coordinator
同一票据，不能临时包装原 writer Promise 绕过发布步骤。

每个 owner 的根只替换本 owner 在该位置的状态，不覆盖后来 logical 根；例如
耐久前缀推进到 n 时，logical 已在 n+2，不能把 n 的旧快照写回 logical。
owner 保留有序待确认候选根，或用纯 fold 重建对应水位。持锁恢复后先重放完整
耐久前缀，全部业务 owner 成功装载后才能 reopen；缺失/未知事件 owner 可以
阻止相关运行入口，但不能跳过记录后宣称恢复完成。

| 状态/交错 | 可供当前检查的含义 |
|---|---|
| 预算占用、对象修订、Run/批准消费占位已在 logical | 后续位置不能再消费同一余额/对象/决定，即使尚未 fsync |
| grant、成员资格增加、人类答案仅在 logical | 可显示 pending，但不能支持新的执行准入；使用 durable 正向事实 |
| revoke、停用、绑定撤除已在 logical | 立即封闭后续位置；不能因 durable 视图仍旧而允许新调用 |
| 调用 n 已准入，普通撤权 n+1 | n 形成耐久前缀后仍可使用原准入；不再次同义判权。阻止 n 须走精确控制 |
| 某次设置既收紧又放宽不同动作 | 按 owner 的确定语义，当前允许集合是 durable 允许集合与全部 pending 修改允许集合的交集；不能用笼统 revision 新旧推定它只放宽或只收紧 |
| 任一写/同步/发布失败 | 整个域 quarantined，未确认项不能执行；不越过缺口、释放未知预算/使用或自动重新准备 |

正向/负向含义由对应 owner 实现，不给 coordinator 一个“这个事件是 grant”
的全局业务枚举。瞬时失联/计划撤除也要在同一个 enter 短门关掉 owner 的当前
可用性，外部准备的 TTL 事实不能冒充已加入撤销屏障。

ExactUse 保留原 generation/epoch 的**真实资源责任**；普通撤除关新门但不销毁
已持有资源。耐久后，它由原调用/运行 owner 接管，直到原工作实际结算、停止/
隔离或可证明该批次未提交才允许 release。unknown 不释放；settled 必须有原
owner 的终态/安全证据，coordinator 不自行从 Promise resolve 推断。
此运行对象不可持久化；磁盘保存原绑定、attempt 和已准入事实，重启先由所属
owner 核实并重新关联，不从 JSON 复活 ExactUse。

Receipt、Position、Action 和 ExactUse 都不单独成为启动许可。P3/P4 的执行 owner
只接受本进程受约束、绑定原 call/model attempt 与执行 epoch 的许可，并核对已
耐久业务准入记录和自己的接纳/取消墓碑。它们的 start 原子段不能夹入 stop；
普通撤权不改旧准入，精确 stop 可以关掉旧执行许可。这是 TL/MC 实施端口的职责，
P1 不发明一个能从任意已提交记录铸造许可的通用 API。

### 调用顺序实例

下面是组合顺序，owner 函数名由其 P2/P3 接口确定，不是新的公开 API。

```text
门外：coordinator.prepareOperation(original operation/input)
enter(frame)：当前读取资格 + lookupPrepared；已知结果立即认回
门外：仅 not_seen 才解析 Action、准备候选 owner 根/记录/结果；coordinator.prepare(batch)
enter(frame)：
  从原 operation 认回已知票据；有结果时走当前读取资格，不生成新后果
  当前 TG/AU/SR/TL/HD/BG 纯检查；核对准备根和精确版本
  同步取得原工具/执行 owner 的 ExactUse
  submit(frame, action_execution + prepared batch + owner publications + uses)
门外：
  未准入/重复 => 仅清理本次 fresh 且未转移的临时使用；原票据的 claim 不动
  pending => 呈现 pending_durability；等待 coordinator completion
  conflict + Receipt => 这是已耐久的原条件提交结果；不重用原 operation 改判
  committed + publication ready => 原执行 owner 核对墓碑，接纳精确 attempt
  committed + publication blocked => 保留已提交事实，隔离并恢复本地根；禁止效果
  unknown => 保留责任，只查询原 operation/attempt，不换键重发
```

这里的“调用 n 已准入”只指 disposition=apply，记录拒绝/冲突取得日志位置不会
产生调用执行权。若调用 n 与撤权 n+1 均 pending，writer 依序同步，n 完成时允许启动而所有 n+2
新调用已经被 logical 撤销封闭。若 n 的同步失败，n、n+1 都无 committed 回执，
域隔离；恢复持锁认回完整有效 n/n+1 后，旧 attempt 是否已发出仍由执行 owner
查询。本页不让存储恢复替执行者决定“再执行一次”。


## 关闭与失败责任

coordinator.close 先同步关新准入，等待已排位票据的记录结论与 owner durable
发布，再完成 writer 的排空/同步/释放；它不能直接转发 writer.closeWriter 而
遗漏自身待发布责任。已移交执行 owner 的在途效果由应用关闭协议先停止/结算或
明确隔离，不能先释放日志再让效果写回终态；人类待办保留耐久事实，不等待用户
回答才允许关闭。关闭失败仍有具名 owner/操作/资源与可诊断结果。

## 实施验收与已有证据的范围

P1 作者消费固定的 data/records 公共产物，先以 A08 的 n/n+1、pending grant、
预算/决定双消费、publication 失败建立目标失败测试，再落实单门/双视图、
使用清理与隔离。约束替身不把 TG/AU/BG 业务规则写进共同核心，真实 writer
组合完成前不能称协调链交付。

同步门测试还需覆盖：返回 Promise 不能形成有效提交、通知重入只发生在门外、
prepare 与 enter 间撤权导致拒绝、门内已排位的同键重试不二次扣款/占位、
某 owner durable 发布失败后 committed 标明 publication blocked 且禁止效果、unknown 使用
仍有 owner、settled 清理失败不释放贡献。约束替身保留真实修订/去重/不越缺口
条件；真正 writer/恢复与资源清理结果必须在组合层交叉验证。
R1/R2 的正式测试覆盖每个 publication/retain 阶段、遗漏/重复 owner、错配/伪造
use、submit 后改数组/descriptor/方法引用和异步晚到拒绝；不能只测试外层 enter。
ExactUse 还须覆盖同一 PreparedAdmission 在未耐久前重复 submit（同票据、retain
只一次、原 pin 不释放）、同一真实句柄给不同 operation（排位前拒绝）、重复操作
新取得的临时 pin 仅自身释放，以及 released/retained/releasing 句柄不可再 claim。
释放并发共用一次 owner 调用；失败/unknown 保留原 claim 与真实资源责任，后续
合法清理只处理原 pin。不得仅检验 issuer 品牌或相同 binding 就称使用语义通过。

独立组合验证用真实 writer/admission 覆盖 A05–08/A30/A31 的 fsync 阻塞/失败、
关闭重入、旧 frame/旧 writer/异 owner 伪造值，观察用户可见状态及原资源责任。
JSONL 的[结果/恢复反例](../../storage/jsonl/design.md#实施验收与已有证据的范围)
保留 R3/R5 的冲突和双重故障，不用类型品牌或模拟 map 代替实际跨边界结果。

原 [P0 设计证据](../../../docs/proposals/core-capabilities/implementation/evidence/p0-shared-interfaces/README.md)
保持固定版本与字节；claim-probe 的九个内存票据/模拟资源场景只验证可表达的私有协议。
本轮仅执行[迁移关系与文档检查](../../../docs/proposals/core-capabilities/implementation/evidence/p1-provider-mapping/README.md)，
没有重做机制探针、TDD 或产品测试。真实共享实现、独立组合、公开产物消费及
最终接受按[计划](../../../docs/proposals/core-capabilities/implementation/plan.md)推进，未运行场景继续保留为实施义务。
