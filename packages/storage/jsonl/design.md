# JSONL 持久记录提供者设计

本页拥有 `@omne-harness-lite/jsonl` 的 P1 writer 提供者映射，来源是
[共享接口实施稿](../../../docs/proposals/core-capabilities/implementation/shared-interfaces.md) 在迁移前固定提交
`7af250ee19df1077a5143cac817558caa959a392` 的相关正文。
原 `8f4cfa9` 的接口与机制选择已接受为施工输入；
[D-010](../../../docs/decisions/D-010-shared-diagnostics.md) 增加必需 Diagnostics。
本次只迁移归属，尚待独立复核与整合接受；不改变原行为、记法或采用版本。

精确承诺沿 [DR v1](../../../spec/capabilities/durable-records/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[core-work v1](../../../spec/data/core-work/v1/contract.md) 和
[identity v1](../../../spec/data/agent-runtime-identity/v1/contract.md)。
本页实现 DR-01–05 在一个本机 coordinationDomain 的映射；跨 owner 组合归
[admission](../../coordination/admission/design.md)，业务状态归各能力。
当前终点是[最小运行基线](../../../docs/proposals/core-capabilities/implementation/runtime-baseline.md)，
不因保留原共享协议的覆盖而继续扩大为完整 M1/M2。

## 公开入口、依赖与实际状态

现有 [README](README.md)、[源码](src/index.ts) 仅提供普通 JSONL 的
`/baseline` 行为，尚未实现本页 writer、锁、恢复或默认目标入口。
本页 factory 是已接受、**待实现**的声明记法，不是已编译的公开产品 API：

```ts
import type { JsonlProviderOptions, RecordProvider } from "@omne-harness-lite/records";
import type { Diagnostics } from "@omne-harness-lite/diagnostics";

export declare function createJsonlProvider(options: JsonlProviderOptions, diagnostics: Diagnostics): RecordProvider;
```

输入配置、返回端口与结果的精确现有类型归
[records 公共源码](../records/src/index.ts)，消费说明归其 [README](../records/README.md)；
这里不再复制另一套声明：

| 现有公开类型 / 函数 | 本提供者承担的运行责任 |
|---|---|
| JsonlProviderOptions、NamespaceBinding、RecordLimits | 受信装配指定域、目录、namespace/owner/system scope 绑定及有界容量 |
| RecordProvider、AcquireResult、AcquisitionCleanup | 暴露受信 reader，取得唯一 writer；失败保有和查询原清理责任 |
| RecordPreparation、PreparedOperation、PreparedCommit | 同一 writer 发行真实准备对象，门外验证/冻结/预编码 |
| RecordWriter、Submission、PendingCommit、CommitResult、CloseResult | 同步排位与去重，按序写入/耐久，关门、隔离和关闭结果 |
| RecordReader、Head、ReadResult、OperationLookup、Watermark | 仅在已核实前缀内提供完整批次、精确水位及原操作结果 |
| CommitEnvelope、RecordedOutcome、Receipt、Position、StreamRef、UseRequirement | 沿已有数据形状记录序号、epoch、stream 修订、结果与精确使用要求 |
| encodeEnvelope、decodeLine、CodecLimits | 复用已实现严格单行 codec；前缀/epoch/锁的有效性仍由本提供者验证 |

[work-data 公共源码](../../core/work-data/src/index.ts) 与其
[README](../../core/work-data/README.md) 拥有 DTO、Checked、JsonLimits、严格 JSON 和
规范编码。jsonl 只沿这两个公共包及 diagnostics 消费；records/work-data 不反向依赖
jsonl、admission 或诊断。没有新增 Cordis 插件、服务键或 Context/Fiber 生命周期：
受信应用直接调用 factory，持有 provider/取得的 writer，再把 writer 交给唯一
admission；业务不取得完整 writer。

Diagnostics 是 factory 的必需注入，精确消费面与关闭管理归
[diagnostics 当前设计](../../observation/diagnostics/design.md) 及
[D-011](../../../docs/decisions/D-011-diagnostics-directory-ownership.md)。
应用拥有目录与来源的管理责任；本提供者只消费受限诊断，不另建目录 owner，
不复制其创建/关闭签名。普通诊断沿 D-010 在短门外输出，不承担业务审计。
D1 的 R1/关闭/锁/原生消费者最终产品接受仍是 P1 实际消费前提；本次迁移不表示该门已通过。

## 纯准备与同步提交

原操作的 namespace、Principal 编码、canonicalInput 与跨租户/多 stream 数据边界
继续引用[共享 records 边界](../../../docs/proposals/core-capabilities/implementation/shared-interfaces.md#records-的批次身份和读取边界)。
本提供者据此实施以下行为。

`prepare` 是无 I/O 的批次验证、冻结和预编码，在短门外调用。它不占修订/seq、
不读取授权、不开始写。PreparedOperation/PreparedCommit 都是 writer 实际创建的值；
伪造 TS cast、反序列化或其它 writer 创建的值均不能通过运行时身份检查。
最后编码所需的 seq/epoch/commitId 由 writer 在 commit 时填入；大块输入和记录
已在 prepare 编码，门内只做有界元数据组装，不重复解析大内容。
prepare 同时从已冻结 appends 计算排序去重的 owners；requiredUses 是具名组合
明确声明的资源要求，每项 recordOwner 必须在 owners 中，binding 精确元组不得
重复。该小型元数据和深冻结数组随 opaque token 只读公开，消费者不能自行传入
另一个 owner 集合。UseBinding/UseRequirement 是 records 的实施数据，admission
复用；没有 records 反向 import admission。业务 owner 仍须证明自己的记录完整
表达所需授权/预算/资源，存储不会从工具语义推导漏写的业务事件。

`commit` **同步**返回 Submission；其中 pending 的 completion 才返回 DR-02 的
最终结果。同步段先查去重/状态和批次完整性，再比较当前修订；正常批次或需要
记录的修订冲突都分配连续位置并入队，仅正常批次封闭原业务 stream 修订。真实 I/O
在退出当前 JS 栈后按序启动，不能在 commit 内调用业务代码或同步写盘。
单独的基础设施消费者可等待 completion；业务应用只从 admission 取得提交入口，
不能持 RecordWriter 绕过当前权威。没有多域事务或通用用户插件 hook。
lookupPrepared 是同一 writer 内同步去重查询，核对对象真实性、operation 与规范
输入，返回原 pending/成功/修订冲突结果或同键异输入 conflict；not_seen 不代表跨故障的
未提交证明。隔离/关闭时不能返回可继续提交的 not_seen。quarantine 同步关掉新
提交和未启动写泵，保留已在途 I/O 的核实责任；此方法必须无业务回调、幂等，
不能假称撤回已耐久记录。所有 completion 对预期 I/O 故障 resolve 具名结果，
不以未处理的 Promise rejection 丢失操作责任；内部缺陷另有诊断并隔离。

## 结果何时占用 operation 身份

“创建 PreparedOperation”只证明输入可比较，不是接纳，也不占 operation 去重键。
以下分界对 commit、lookupPrepared、lookupOperation 和恢复一致适用：

| 情况 | 接纳与回执规则 |
|---|---|
| 非法 JSON/Schema、不可信 namespace/主体、伪造 token、非法 owner/数据/超限批次 | prepare 的 Checked 失败，或 commit 返回 rejected 且 receipt=null；没有合法接纳、没有新位置/去重项。修正输入是新的准备，不能拿失败准备证明原对象/效果存在 |
| writer 关闭、隔离、未获得写权或在途容量暂不可接纳 | 返回 unavailable（兼容入口的 closed/stale_writer 等 rejected 同样 receipt=null），不宣称取得 operation；客户端保留原键并查询，不能据此判断其它旧 attempt 无效果 |
| 原 operation 已占位，相同规范输入 | 返回原 pending 或耐久终结结果，包括原 revision conflict；不比较新的拟提交 appends/result，也不改写原结果 |
| 原 operation 已占位，不同规范输入 | 返回 operation_input conflict、receipt=null；它是对冲突重试的拒绝，不取代原键对应的操作或新建第二份结果 |
| 新的合法 commit，全部 stream 修订匹配 | 入队 disposition=apply；原批次耐久后 committed；业务拒绝也可作为其 owner 的正常审计记录和 result 保存，此时 DR 的存储结果仍为 committed |
| 新的合法 commit，至少一个 stream 修订不匹配 | **接纳的是本次条件提交的确定冲突结果**，入队 disposition=record_conflict，冻结当时全部不匹配 stream 的 current revision；原业务 appends 全不应用。只在冲突结果耐久后返回 conflict + Receipt |
| 已占位结果写入/同步未知 | 返回原 operation 的 unknown，停止域；不能当作未接纳释放键。完整有效行恢复并重新同步后，按其 outcome 认回 committed 或 conflict；确认修尾未提交后才可认回 not_committed |

本提供者所有 rejected 都发生在**未接纳**边界，receipt 必为 null；它不产生
“已接纳后却未保存的最终 rejected”。业务能力的授权拒绝、资格拒绝等由该 owner
提交普通的拒绝审计事实及确定 result，因而也沿存储 committed 回执耐久去重。
这种分界不省去业务拒绝的审计义务；无法保存时返回 audit_unavailable。
同 operation 同输入返回原结果适用于已经接纳的条件提交，不能把无效准备或
暂不可用当作已有耐久操作；后续提供者若要增加已接纳的 rejected 必须先扩展
RecordedOutcome 与恢复映射，不能仅向运行时返回新的未保存分支。

修订冲突结果使用 provider-owned stream：namespace=`core.records`、
owner=`durable-records`、streamId=`operation-outcomes`，scope 沿原操作的 tenant
或 system。该保留 namespace 不对业务开放；其 current revision 由串行 writer
取得，固定 kind=`operation.conflict`、version=`"1"`、data 为原 RevisionConflict。
该 envelope 保存原 operation/canonicalInput、`outcome={status:"conflict",conflict}`、
`requiredUses=[]`；appends 仅有这个结果记录，绝不混入原业务 appends。
Receipt.streams 也仅报告实际被写的结果 stream。普通成功 envelope 则保存
`outcome={status:"committed",result}` 与实际 requiredUses。
恢复验证冲突 outcome 与此 provider 记录完全相同，并按稳定 operation 键重建结果；
不能把所有完整行统一映射成 committed。内部结果记录仍服从容量、同步和原子性，
保存它失败则 unknown/unavailable，绝不提前返回可当作最终事实的 conflict。
writer 在分配位置前检查正常批次或结果记录所需的实际容量；结果记录也装不下
则 unavailable、尚未接纳，不先占位置再静默丢掉结果。provider-owned 结果 stream
由 writer 自己维护修订和耐久索引，不要求业务提交一个虚假的 durable-records
publication；coordinator 只推进其日志水位，绝不执行原业务 publications/uses。

## 精确前缀读取

readRange 是**受信 owner 的域内原始恢复接口**，返回整份批次，不提供会破坏
原子关系的逐事件分页；应用不能直接暴露给用户。用户历史/池读取由业务 owner
做当前授权后投影。limit 限完整 envelope 数量，单 envelope 容量在准入前检查。
through 是先前 readHead 得到的精确水位；只返回 `afterSeq < seq <= through.seq`，
不存在或不匹配的 commitId/域返回 rejected，已知但尚不可达的水位返回
not_at_watermark。较新的 writer 不把读者水位静默改成最新值。

provider.reader 只读最近被本实例持锁核实/同步的完整前缀，在 writer 关闭后仍可
使用。新实例未能取得锁并确认前缀时读取返回 unavailable，不把看到完整 LF 当
耐久证据；首批不开放多个独立进程之间的实时历史读一致性协议。服务端一个进程
可以持续提供已确认历史，模型不可用不关闭该读面。JsonlProviderOptions 由受信
装配给定；缺失/非法 limits 拒绝建立提供者，无隐含不限量队列。队列容量只限制
在途提交并返回 capacity，不限制已保存人类请求总数或设答复超时。

lookupOperation 必须按原 outcome 区分 committed 与 conflict，返回原 Receipt，
不得只建成功操作索引。not_committed 只能来自持锁核实并同步的完整索引及水位；
有待写项为 pending，有未核实损坏/截尾为 unknown，普通索引 miss 不能作未提交
证明。not_committed 只证明该存储操作，不证明外部 attempt 无效果。若旧 writer
仍可追加或独立只读者不能确认当前前缀，返回 unknown/unavailable。

## writer epoch、锁、恢复与关闭

writer epoch 使用同一 journal 的 records owner 管理批次，不新增需跨文件原子
提交的 epoch sidecar。初始化空 journal 的 epoch 批次是 seq=1；每次持锁恢复
并重新取得 writer 后，读取最后 epoch 值，加一并追加/同步新的 epoch 批次，再
返回 writer。epoch 使用 Counter、从 `"1"` 起，不凭 PID/时间生成或复用。

该批次固定 operation.namespace=`core.writer`、系统 principalId 按共享 records 边界的编码，
operationId=`epoch:<十进制epoch>`；`operationKind="writer.acquire"`、tenantId=null、
target 为 coordinationDomain、arguments 含新 epoch，preconditions 含上一 epoch。
append 指向 `{namespace:"core.writer",owner:"durable-records",scope:{kind:"system"},
streamId:"writer-epochs"}`，记录 kind=`writer.epoch`、version=`"1"`、
data=`{epoch:<字符串>}`，outcome 为 committed、其中 result 同样含 epoch，
requiredUses 为空。前置 stream 修订按一般规则加一。
所有普通批次必须属于最近一次已出现的 epoch，epoch 批次必须严格加一，恢复
时不接受普通写入伪造 epoch 事件。`core.writer` namespace 和该 stream 仅 provider
可写。首次失败而未获 writer 的 acquire 不产生可外传 epoch；完整未回执 epoch
批次在恢复认回后继续加一，决不回退覆盖。

writer epoch 和运行/执行 epoch 不同：前者隔离文件写入权，后者由 AR/SR/TL/MC
权威分配。核心数据的 incarnationId 同样不拿此计数替代。

锁端口只在 jsonl 内部实现与故障夹具之间使用，不成为业务包依赖：

```ts
export interface DomainLock {
  release(): Promise<Readonly<{ status: "released" }> | Readonly<{
    status: "failed"; diagnosticId: OpaqueId;
  }>>;
}
export interface DomainLockProvider {
  tryAcquire(): Promise<Readonly<{ status: "acquired"; lock: DomainLock }> |
    Readonly<{ status: "busy" }> | Readonly<{ status: "unavailable"; reason: string }>>;
}
```

tryAcquire 绑定部署预先打开/核对的固定域目录和稳定锁文件 inode，不接受用户
任意路径；真实进程内也登记 owner，防同进程误建两份 writer。锁在读取/修尾/
epoch 同步/普通提交/关闭排空期间连续持有。锁文件不删除或替换，暂停进程
不能按超时被偷锁；OS 进程死亡释放文件描述符后其它进程才可能获得。
P1 固定采用 `fs-ext@2.1.1`。独立探针 `f712e025` 已由主调度整合至 HUB
`04b8dbf` 并验收，证据正文位于该版本的
`docs/proposals/core-capabilities/implementation/evidence/p0-lock-probe/README.md`。
其环境是 Node 24.18.0、Ubuntu 20.04.6、Linux 5.15.0-1084-aws、x86-64、本地
ext4；默认 g++ 9.4 构建失败，隔离 GCC 10.5 构建/加载通过。实际锁竞争、暂停、
死亡/关闭释放、稳定 inode 及文件/目录同步有证据。安装继续默认禁用脚本，
只 allowlist 并 rebuild fs-ext，正式 workspace/独立消费者由整合者复现该路径。
它是已验证的锁与环境前提，尚不表示正式 writer/codec/恢复/关门协议已实现。

acquire 的所有非成功路径都必须归还资源或交出**同一具名清理责任**。尚未取得
锁且没有残留资源的 busy/unavailable 不创建 cleanup owner；取锁之后的扫描、
修尾、epoch write/sync 或资源关闭失败，若已确认完全释放则返回
`unavailable.cleanup.status="released"`，否则返回 retained 与 AcquisitionCleanup。
该 runtime owner 保存真实 fd/lock、在途 I/O 和诊断，cleanupId 在本次取得尝试内
稳定，不因重复 acquire 或 retryRelease 更换；没有把未验证 writer 交给调用者。

retained owner 的 inspect 精确报告 retained/releasing/released 和锁的
held/released/unknown；调用者不凭一次 release 抛错就猜锁已释放或仍可靠持有。
retryRelease 只接管并等待原在途 I/O 收口、关闭/释放原资源，不重新恢复/写入
epoch，不复用失败 attempt 当新 writer。并发/重复 retryRelease 共用一个清理
过程，最终状态可重复查询；再次失败仍保留相同 owner，不返回假成功。
provider 在该 owner 未 released 前封闭该域的再次 acquire，并返回同一 retained
责任（不能仅返回无归属 busy）；确认 released 后新的 acquire 重新持锁扫描，
完整未回执 epoch 仍按原日志核实。释放成功不把先前 unknown 写入改成未提交。
进程死亡由 OS 释放 fd，下一进程仍必须正常持锁恢复，不从清理句柄反序列化权利。

提供者串行写，处理短 write 直至完整行，文件 sync 及首次创建文件/目录必要
sync 完成后才提升 durable 水位。为区分局部失败，测试故障点至少包含写前、
部分字节、完整 LF 后、file sync 前/后、目录 sync 前/后、回执前。
任何 I/O 失败立即隔离域；即使后续位置还未 write，也不越过它继续执行。
明确未开始写的排队项可在诊断中保留 not_started，但对外完成不能用此推断所有
相关资源可释放；先完成同域未核实前缀和业务责任核对。

恢复在持锁下扫描**连续**前缀，未结束 LF 的最后字节片段才是可修尾部。
先将故障原件复制到新 evidence 文件、sync 文件与目录，核对已保存内容，再截回
最后完整行边界并 sync；保全/截回/同步失败均停止恢复。完整 LF 行哪怕只有一个
坏字节也不截掉；中间断序、摘要错、未知版本、完整无效 epoch 均拒绝写恢复。
完整有效但未回执的所有批次重新 sync 后成为耐久事实，lookup 根据 outcome 返回
原 committed 或 conflict 及 Receipt；不把存储中的冲突记录误还原为成功调用。
恢复期间崩溃时保全文件不覆盖；下一次从仍存在的 journal 重复核对，不根据文件名
或“上次开始修复”标志直接宣称修尾成功。

closeWriter 同步先封闭新提交，异步排空和同步，再释放锁；同一次关闭重试认回
同一责任。失败返回 blocked 与 pending/lockHeld 真实状态，不谎报 closed；
锁释放失败则继续登记 owner。旧 PreparedCommit/RecordWriter 通过实例身份和
已关闭 epoch 状态拒绝。故障后读者可以读已确认完整历史，无法确认的范围具名
拒绝；读可用不表示可以接管执行。未知数据禁止自动迁移或重新建空文件。

## 实施验收与已有证据的范围

先消费真实 records 产物与已接受原生锁前提，再实现真实磁盘和两进程的
A05/A06/A07 去重、冲突、断点、恢复、完整前缀、水位、unknown 与关闭测试。
[共享黄金样例](../../../docs/proposals/core-capabilities/implementation/shared-interfaces.md#黄金样例与反例)
保留 G01–G10 原字面量；不能把 codec 通过当作 fsync 或持锁恢复通过。

R3 覆盖原冲突结果在业务修订后来匹配时仍不变、完整无回执冲突行的重启认回，
以及断尾未提交/完整损坏 unknown 的不同分支。R5 组合注入 acquire 取锁后的
恢复/epoch sync 失败，再注入 release 失败，观察同一清理 owner、阻止新 acquire、
重复 retryRelease 和实际 fd/锁释放；只检查对象中有 cleanup 字段不构成通过。

独立组合验证还须将本提供者与真实 admission 连接，覆盖 A05–08/A30/A31 中的
fsync 阻塞/失败、关闭重入、旧 writer 和旧 frame；不能用替身接管真实资源清理。
admission 的[关闭义务](../../coordination/admission/design.md#关闭与失败责任)
先收口自身待发布责任，再完成本 writer 的排空/同步/释放；应用先处理在途效果。

原 [P0 设计证据](../../../docs/proposals/core-capabilities/implementation/evidence/p0-shared-interfaces/README.md)
与 `f712e025` / HUB `04b8dbf` 的锁证据保持原版本和环境范围，字节不改。
前者证明声明/样例/局部机制，后者证明锁及采用环境前提；均不证明本提供者已交付。
本轮仅执行[迁移关系与文档检查](../../../docs/proposals/core-capabilities/implementation/evidence/p1-provider-mapping/README.md)，
没有运行新的机制探针、TDD 或产品验证。P1 真实实施、独立组合、公开产物消费与
最终接受仍按[计划](../../../docs/proposals/core-capabilities/implementation/plan.md)推进。
