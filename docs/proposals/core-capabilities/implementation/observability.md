# 共享诊断、日志与 trace 施工候选

本稿消费 [scope](scope.md)、[acceptance](acceptance.md)、
[implementation-spec](implementation-spec.md)、[plan](plan.md) 的 `d95052c`，以及
[共享实施接口](shared-interfaces.md) 的已接受 `8f4cfa9` 子集。P1 施工选择已由
[D-010](../../../decisions/D-010-shared-diagnostics.md)接受，依据见[接受与验证](#接受与验证)。
本页保留消费者实施输入、验收与历史依据；提供者当前正文归包设计，D-011
限定修订目录创建/额度/关闭前提。P2 桥和 P3 查询不作为本次基线的全量前置。
2026-09-14 的新增输入要求生产、研发、debug 共享 log/trace 基础，并优先交出
其它设计会话所需的最小 Agent/Session/工具运行闭环。

沿用 [OB v1](../../../../spec/capabilities/engineering-observation/v1/contract.md)、
[CD v1](../../../../spec/data/core-work/v1/contract.md)、
[CC v1](../../../../spec/compositions/core-work-coordination/v1/contract.md) 及
[SYS-OBSERVABILITY.C1–C7](../../../requirements/system/observability-and-logging.md)。
本次不改变冻结规格及业务授权/状态/审计语义；本会话范围按最小运行基线收口，
完整 M1/M2 的 A01–A32 保留原含义并后置。
选型事实和实际探针归[研究记录](../../../research/harness-observability.md)。

## 目标、范围与沿用边界

P1 的消费者能用同一注入接口留下 writer/准入的阶段、关联和失败证据，诊断
输出失效不覆盖原业务结果，也不被隐藏。此时不要求先完成 collector、OTLP
网络、仪表盘或工程查询平台。P1 的范围是共享公共面、一个本地有界日志提供者、
真实 writer/admission 的异常路径接入及组合反例；P3 仍完成 OB 查询/导出/保留。

| 责任 | 唯一拥有者与本次处理 |
|---|---|
| 受理/拒绝/等待/决定/控制/终态/unknown 的业务事实 | 原业务 owner 在自己的提交边界生成，关键记录随同一耐久提交或可核实 outbox 保存。不能改成调用 logger 后视为已保存 |
| 规范记录、operation/commit/水位 | records/业务协调域；诊断可以引用，不另造 EventLog 或提交协议 |
| 普通结构化 log、运行时 span、裁剪、诊断输出资源与失效状态 | 候选新增 `packages/observation/diagnostics`，承载下面明确的保护边界 |
| 采集 cursor、处理版本、来源水位、索引、当前权限 query/export、gaps 和保留策略 | 既定 `packages/observation/engineering`，P3 实现；diagnostics 提供底层来源事实，不能替它授予读取权或宣称完整覆盖 |
| 工具过程帧、Session 历史、预算/费用真相 | 仍由 TL/SR/BG 等 owner 负责，日志及 span 不替代它们 |

`diagnosticId` 只是定位一次诊断的标识。分配、返回或在内存看见该 ID 均不是
保存回执；其日志可能被丢弃，查询必须结合缺口。业务 unknown/cleanup owner
即使日志丢失也保留原责任，不能依赖诊断文件重建执行权。

## 依赖、复用与配置

当前依赖、资源配置、来源格式与输出实现由
[diagnostics/design.md](../../../../packages/observation/diagnostics/design.md)维护。
原 `99fc7a3` 的完整提供者稿保留在 Git；其 D-010 选择继续有效，目录创建与共同
容量的采用变化见 [D-011](../../../decisions/D-011-diagnostics-directory-ownership.md)。
本页保留消费者交接、验收与历史依据，不维护另一份包接口或提供者实现规则。

## P1 公共消费面

记录面 `Diagnostics` 及不透明 context/span、受信管理面和已实现类型的精确
签名引用 [diagnostics 公开源码](../../../../packages/observation/diagnostics/src/index.ts)。
当前目录创建和关闭责任归包设计；目标是唯一目录 owner 创建多个来源，源码中
尚未迁移的 `createLocalDiagnostics` 只代表当前未接受产品的旧实现，不能成为新
消费者的施工输入。记录面不授予身份、执行权或审计披露权。

目录 owner 修订固定前后的类型与设计原件分别保留在 Git，迁移依据归
[目录来源与采用](observability-directory.md)。具体调用签名以产品交付时的精确
公开产物为准；没有真实共享实现时不借本页的文字开放消费者。

### 消费者签名细化及短门约束

共享实施稿的两个目标 factory 增加必需的第二参数：
`createJsonlProvider(options, diagnostics: Diagnostics)` 与
`createAdmissionCoordinator(writer, diagnostics: Diagnostics)`。这改变**实施注入**，
不改变 RecordProvider、AdmissionCoordinator、提交格式或正式 v1；整合者已同步
共享稿，消费者不可各自增加不同 logger 参数。Diagnostics 类型从其所属包公开入口导入。

每个 provider 使用创建时绑定的 system scope；请求边界先显式 current/capture，
异步写泵保存已冻结 context，出队时恢复，不能继承写泵创建者身份。已准备的操作携带的可信 Principal/
Causality/OperationRef 用来建立操作 scope。从 PreparedOperation 取得关联使用
records 已有的冻结规范输入/验证入口，不从任意日志字符串恢复。diagnostics
本身不解析业务 Action 或 OperationInput 来决定授权。

短门内只更新消费者自己的有界元数据、分配纯诊断 ID 并收集固定字段；不得调用
Diagnostics.log/startSpan/end、Pino 或 Sonic.write。Sonic 的异步模式只说明写入
回调异步：4.2.1 达到 minLength 后会在同一调用栈开始 fs.write，不能拿它充当
门外调度保证。scope 准备、大对象投影、序列化和所有真实输出都在门外。

admission 的元数据归外层 enter 调用：frame 先失效并退出门，再在受保护的
finally 中输出，保持 enter 的原返回值/throw；内层 submit/callback 返回不算
已退出外层门。jsonl.commit 可能被这个门调用，它只收集自己的结果/故障元数据，
由既有写泵的门外调度段处理；即使没有业务待写或已隔离，诊断段也可收口，不能
为诊断重新开放业务写入。每个消费者至多保留 16 个待输出的固定大小 point 和
一个省略计数；jsonl 至多排定一个门外处理回调，不为每次拒绝创建微任务。溢出
合并为 `diagnostic.gate_capacity` + measures.count 的安全摘要，出门后经同一
日志面输出；未分配来源 seq 的省略不补造连续水位。它是所属消费者的短暂字段
收集，不新增公共日志排队 API、通用队列或第二个后台输出框架。

late rejection 只用原冻结关联和 code，由原 admission owner 接管，在门外
被动记录。诊断器失败不改变 publication blocked、quarantine 或旧 use 的释放
责任；消费者的门外输出也不能将原同步结果改成 Promise。

## 真实接入责任与最小测量

P1 不预造业务全事件目录。下面是已经存在的真实边界，code 字面量在各 owner
实施时固定并逐交付记录，不按类名/异常文本自动生成。

| 消费者 / 测量边界 | 必留诊断、关联与终结 |
|---|---|
| jsonl：acquire/epoch | 取得/竞争拒绝、恢复起止、epoch write/sync 失败；system principal、域、cleanupId 对应 diagnosticId；失败不发出 writer |
| jsonl：排位→write→sync→回执 | operation、完整 Position、logical/durable 水位、pending 字节/条数和分段耗时；pending 不能写成 committed，未知范围不被后续成功覆盖 |
| jsonl：隔离与修尾 | 原失败阶段、保全/截回/同步分别有结论；只记录 evidence 的受控引用/类别，不写原损坏正文或宿主绝对路径 |
| jsonl：close/retryRelease | 原清理 owner、阶段、未核实操作/锁责任的安全定位；失败后保留同一 diagnosticId，不借新日志 ID 换掉清理身份 |
| admission：短门拒绝/发布/retain | operation/owner/阶段、条件冲突/同步契约违规、publication blocked；采用原业务判定，不让 logging 参与资格矩阵 |
| admission：late reject/cleanup/close | 晚到拒绝归原 operation/use/generation；关门、排空、发布与锁关闭分别观测；业务错误保留，诊断错误另列 |

P2 的 Agent/Session owner 接同一个 `Diagnostics`：激活/发布/清理、输入/Run
claim、恢复 epoch、等待与控制都在原权威边界生成。P3 的工具/执行/审批 owner
追加 manifest/Action/call/attempt、绑定、等待/控制与终态；P4 的模型 owner
追加实际模型/路由/usage 质量的安全关联。它们的具体业务事件仍由本来 owner
在各自开工前定义。绑定中已有的定义/实现/配置/环境引用直接复用，不再定义
一份观测专用 SessionRef/RunRef/AgentRef。

`packages/observation/engineering` 只从 records 受限读取端及 diagnostics 本地
来源读取原件/失效快照；不倒调业务效果。P1 交给 P3：行格式版本、来源 generation/
seq、起止/缺口标记、文件保留预算、已关闭/未完成状态、`diagnosticId` 检索字段。
它们是内部来源适配信息；P3 开工前再固定其受治理的 query/export API、采集 checkpoint
与快照语义，P1 不发明与 OB 争权的 cursor 服务。

## 身份、异步 parent、恢复与内容

提供者如何裁剪身份/内容、维护 parent、恢复后建立新 trace，统一归
[包内设计](../../../../packages/observation/diagnostics/design.md)。消费者在可信入口
核对身份后传入关联；恢复保留业务因果，不把运行 context 序列化成工作许可。

## 有限资源、缺口与关闭

来源、目录额度、gap summary、关闭与残留资源的当前规则归同一包设计，
[D-011](../../../decisions/D-011-diagnostics-directory-ownership.md)固定目录修订的采用范围。
消费者保有自己业务工作的责任；诊断 deadline 只限制调用者等待，未知释放不可
虚报成功，真实 raw fd 关闭未知不可盲重试。应用持有目录管理面，先确认子来源、
准备和扫描静止并完成资源核对，再关闭最后锁 fd。

### Cordis 输入桥的独立边界

P1 jsonl/admission 直接注入 diagnostics，**不依赖 Cordis logger 桥**。P2 的
内核接入另外交付以下受限桥及其反例，不能在 P1 缺证据时默认启用：

- 一个 Cordis root 生命周期内只注册一个受信 exporter，显式 `levels.default=3`，
  回调有被动边界；唯一注册归宿主，不让动态业务插件自行注册第二个 exporter。
- exporter 闭包只指向当前安全投影目标；更换时同步切换目标，旧代照原协议排空。
  撤除桥先将目标置空并登记来源不可用。此永久 root 回调不持 fd/timer/tenant
  context；之后不会调用旧目标，不调用已知有缺陷的上游 disposer 来完成换代。
- root 被释放前停止相应生产者，断开目标后仅剩随 root 可回收的注册对象；不把
  “回调还在 registry”冒充尚有文件资源，也不把未知 native 清理宣称已验证。
  第二个原生 exporter 的动态注册/独立卸载在本映射中明确不可用；需要该动作
  时先取得新版本验证或新的受审映射，不静默采用有缺陷的 disposer。
- 仅投影 Cordis source/sn/type/时间及安全 fiber 标识；不格式化 raw args，不把
  fiber 当 Session/Run/principal。无法核对关联时标 system/uncorrelated。

该映射维护官方包边界，不 fork/原地 patch Cordis，不靠改写私有序号或 exporter
Map 修复上游。Cordis 内置内存 buffer 先于桥接持有原 args，桥端裁剪不追溯清除
它；`bufferSize=0` 还会因 `slice(-0)` 无法清空。P2 须审查进入原生 logger 的
调用和异常来源，不能输出 payload/秘密，不能将原 buffer 接入 query/export。
若需要保证原生输入也有严格字节界限/敏感值消除，而受信调用限制无法兑现，
这是桥接的**阻断条件**，需向整合者报告并核对官方升级或其它正式映射；不得
声称本页已解决上游所有缓存行为。P1 的独立诊断提供者不受该桥未完成影响。

## 原 O01–O12 验收范围

以下行为 ID 保留 D-010 的原验证范围，当前提供者接口归 diagnostics；跨提供者
消费必须使用实际 writer、准入和业务 owner，不能从单组件通过推定组合通过。

| 场景 | 直接适用的验收刺激与必须观察的结果 |
|---|---|
| O01 / A28、A31 | 后端 write/processor/projection 抛错或失败；业务正常返回、同步 throw、异步 rejection 各自保持原结果/身份；跨 4 KiB 输出及内层 submit 退出仍不在外层门内启动 fs.write，门外输出后返回仍严格同步；body 仅运行一次，健康状态独立 |
| O02 / A01、A28 | 两 tenant 异步穿插、排队出队、root timer、旧 parent 恢复；来源不串租户、共享任务无调用者 initiator，新运行 epoch 仍能关联原 work/attempt |
| O03 / A28 | 嵌套/循环/getter/toJSON、超长字段、SECRET/BODY 哨兵分别送入 scope/log/span/error 边界；真实文件、OTel 属性及缓存不含原文，投影失效显式可见；debug 不放宽 |
| O04 / A28 | 持续写超过单条/活动 span/缓冲/磁盘/文件数预算，含 warn/error；内存资源有界，实际写入和 drop/gap 对得上；编码字节与字符差异被覆盖，不只断言配置值 |
| O05 / A28 | 单条短失败日志无后续流量/无 close 即可在实际 write 后读到；阻塞/失败时 pending age、stalled/failed 可查。写前/部分写/close 前失败、重启无 clean end、保留容量耗尽只能声明实际确认范围，关键业务回执保持独立 |
| O06 / A29 | 活动 span 未结束、磁盘回调迟到、关闭失败/重复关闭/超时；原 owner 可 inspect/retry。大量零 span 停滞 Promise 不生成诊断观察器/任务表；关闭不伪造 body 结束，旧 current/输出受原实例状态封闭，无新增未处理拒绝 |
| O07 / A18、A29 | 新代准备失败、成功切换、旧代关闭失败、旧句柄迟到和再次更换；新工作归新代，旧失败不关新资源，同时代数保持有界 |
| O08 / A30 | 独立安装精确产物，用公开入口消费；work-data/records 无日志反向依赖，目标包不从源码路径偷 import；配置和来源/许可可追溯 |
| O09 / A05–08、A28 | 真实磁盘 fsync 失败且诊断输出同时失败；业务仍 unknown/quarantined、关联原 operation/Position，未完成 cleanup 仍具名；新效果不越耐久缺口 |
| O10 / A08、A28 | publishLogical/retain/publishDurable 的同步违规和晚到拒绝，另注入 logging 失败；原 publication blocked/隔离、原 use/清理责任、错误身份不被改写 |
| O11 / A04、A18、A29 | 官方 Cordis 级别过滤/抛错/错误 disposer 原反例；受限单桥 A→B→撤除、root 关闭、两 tenant、raw buffer 暴露反例；旧 exporter 不再到旧资源且未知来源不冒充业务身份 |
| O12 / A28、A32 | P3 当前权限撤回、相同 ID 无正文权限、采集/存储/索引失败、快照导出和 retention gone；业务审计故障阻止效果，入口拒绝也失败为 audit_unavailable；逐项对账实际覆盖 |

D1/D2 不替代 A28 的业务审计、权限和 P3 查询。相称证据按
[验证规范](../../../maintenance/verification.md)绑定真实源码与结果；机制探针不充当产品符合性。

## 作者检查与评审输入

[原探针归档](evidence/observability-design/README.md)记录精确发行物安装及 `node probe.mjs`，Node
`v24.18.0`，12 项可行性/反例通过；具体输出和局限见研究。未读取 .env/密钥，
未调用模型或外部 exporter。它核对第三方 API 和反例，尚未验证正式 diagnostics、
P1 持久提供者、P2 桥、动态完整关闭或 P3 的 OB 查询/权限。
`make docs-check BASELINE=d95052c` 使用本 spoke 的临时 uv 环境通过 398 份
Markdown 及关联结构检查；`git diff --check` 通过。检查不等于架构选择已接受。

本稿请求独立评审的选择是：一个共享包及无环依赖；Pino/Sonic/OTel 的最小组合；
被动同步端口及 factory 注入；有限来源状态/输出和旧代责任；P1/P2/P3 的明确
交付分界与受限 Cordis 桥。沿用业务审计/CD/CC 的部分不重新表决。库性能、实际
100 次资源循环、跨进程 trace carrier、完整保留查询均未被本次探针验证；没有
证据支持扩成 collector/仪表盘平台或修改正式数据 Schema。

### 独立评审修订 O-R1–O-R3

本节处理对 `1c60feb` 的三项反馈，不重开其它选择。O-R1 的同栈 I/O 反例由
真实 Sonic/fs.write 探针复现；修改为消费者在短门内只收集有界字段，外层门退出
或既有门外写泵才输出。O-R2 去掉 minLength=4096，固定 0，补足低流量的写入
触发及积压/失败状态，并删除不存在的公开 flush 声称。O-R3 移除 activeScopes
和 Promise 结算观察，以原业务 owner + 诊断 generation/关闭守卫约束晚到工作。

归档中的 `review-probe.mjs` 在同一 Node/依赖环境通过七项
定点检查。两个 minLength 配置各输出 6983 字节，fs.write 在门内启动次数均为
0；单条 55 字节日志在未 close 下读回；注入 EIO 后健康状态 failed；10000 次
停滞 Promise 原样返回且没有 then 观察器、没有新增未处理拒绝。首轮关于
ALS.disable 会清空所有调用者 context 的过强断言实际失败，修订后以公开关闭
守卫验证，原失败保留。详细事实及局限见研究的“独立评审后的定点证据”。
这些仍是机制可行性探针；正式 consumer、关闭/故障组合与产品 TDD 尚待实施，
本作者不自行认定评审闭合或接受。

修订后的 `make docs-check BASELINE=1c60feb` 通过同一 398 份 Markdown 及关联
结构检查，`git diff --check` 通过；日志为 `docs-check-review.log`。

## 接受与验证

`99fc7a3` 相对 `1c60feb` 经同一 architecture-reviewer 定点复核，O-R1–O-R3
设计缺口闭合，没有新阻断。主调度经 `9cd78a0` 合入后，以独立安装目录重跑
原 12 项及新增 7 项机制探针，全部通过；[证据](evidence/observability-design/README.md)
保全 38 份作者资产、来源/锁、原失败和本次结果，原产品依赖锁未改。

[D-010](../../../decisions/D-010-shared-diagnostics.md)接受本稿的 P1 公共面、
五项直接库依赖、两处 factory 注入及其有限资源/关闭责任，作为 D1/D2 施工输入。
D1 必须先消费已验证 records 和 work-data，实际实现仍按 O01–O08 进行 TDD；
D2 再接真实 writer/admission 验证 O09/O10。P2 桥的原生缓存/卸载和 P3 query/export
保留原独立门；这些待实施范围及 O11/O12 不由机制探针计为产品通过。
