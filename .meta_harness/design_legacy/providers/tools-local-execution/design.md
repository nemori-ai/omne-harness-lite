# 本地执行提供者设计映射

状态：本设计所需的完整 TL/LE/Run 联合实现尚未验证；独立实施线已有受管文件执行及
stop→rename 的局部修复（证据范围见[验证记录](verification.md)）。本页保留后续实现会持续消费的
端口、状态、失败与撤除协议；来源中的旧接受和旧坐标仅作 provenance。当前 v1 契约仍为
candidate、`acceptance:null`。



## 投影共同约束

- Host 是长期状态与异步责任 owner；Cordis plugin 只注册受限服务/贡献并拥有本代资源。
- 链接插件固定双方 registration/generation，先封闭正向使用再撤回；它不复制业务状态。
- 每次 effect 前核对当前 Fiber、tenant、资格、binding、epoch 和取消；Context/AgentRef 不代授权。
- 撤除先关新工作、排空本代短门与私有资源；已耐久请求、调用、结果、费用与 unknown 留给长期 owner。

## 当前 v1 适配

来源协议没有被提升为实现符合性；当前语义按[Tools v1 TL-07～09](../../spec/capabilities/tools/v1/contract.md)、
[Run v1 RN-05](../../spec/capabilities/run/v1/contract.md)和
[DR v1](../../spec/capabilities/durable-records/v1/contract.md)读取。旧格式、旧 probe 与施工编号只作来源定位；
不能为了复用旧实现而增加兼容层。

## 提供者候选（由固定来源重基）

## 公开入口与记录权威

| 包 / 目标默认公开入口 | 所有职责与导出 |
|---|---|
| `tools/local-execution` / `@omne-harness-lite/local-execution` | 原执行接纳/取消账本、固定文件计划/真实 I/O/帧与停止事实；本地文件资源身份、当前对象权限/可授予上限及使用责任；导出 createLocalExecutionHost、LocalExecutionPlugin、LocalResourceAccessPlugin、LocalFileToolPlugin、ExecutionProvider 实现与本地资源管理/事实接口、事件 decoder/纯 fold |

本包尚无产品 member/API；以上默认入口是候选。只实现本批具名 Linux 本地
read/write，ToolDefinition/Command 仍保持[工具提供者的通用声明面](../tools-tools/design.md#定义声明handler-与-skill-的同一发布单位)。
不执行 shell/任意 callback/网络文件系统/后台脱离；Node 24.18.0 FileHandle
是实际 I/O，不用 AbortSignal 或内存 Map 代替停止协议。本包消费 TL 定义的
ExecutionProvider/PermitFacts 及治理公共类型；TL 不 import 本包。记录 owner
为 local-execution，唯一 createLocalExecutionHost 持有执行/取消/资源根与真实
I/O 责任，projection/帧只作观察。运行 incarnation 不能从持久数据复活。

## 身份、状态与事件投影

ExecutionRef/CallRef/Action 消费[共享身份与动作](../../spec/data/core-work/v1/contract.md)和
[TL 提供者身份投影](../tools-tools/design.md#身份状态与事件投影)，不在 LE 重定义。
executionEpoch、原 Step.createdEpoch、当前 Run.epoch 与 provider incarnation
分别核验；重复 operation 认原计划，同键异输入 conflict，未知不换 ID 重发。

| 本地执行状态 | 最小值与不变量 |
|---|---|
| Attempt ledger | `{execution,phase:absence|accepted|dispatch_intent|terminal,acceptedOperation,planDigest,controlRevision,tombstone:null|StopFence,terminal:null|ExecutionTerminal,deliveries}`；phase 单向前进，stop 墓碑可先于 accepted。数据恢复不复活 Permit、ExactUse 或 FileHandle |
| StopFence | `{execution,controlOperation,revision,requestedAt}` 并绑定原 execution epoch；即使 absence 也可创建，在 start 的同一账本/共同门排序；单调用 stop 不自行宣称 Run epoch 已关闭。墓碑按原 execution 身份永久保留或可证明压缩，不能按时间过期 |
| ExecutionTerminal | 原执行结果、实际 I/O、清理、效果和 sourceVersion 的内部证据；对 TL 输出封闭的 `physical/cleanup/effect` 三轴，不能把内部 `active/sealed/released/happened` 直接当成 TL-09 值 |
| ExecutionExposure | `{call,attempt,owner,ownerGeneration,executionEpoch,state:open|closed,closedBy?,fenceRevision?}`；取得执行许可**或**接纳即由执行 owner 持有 open，只有同 call/attempt/execution epoch/owner generation/fence 的 quiescent 或 verified isolation 关闭；业务 settlement 独立 |
| Live task | 原 provider 私有 `{incarnation,execution,launches,issuedIO,openHandles,cleanup}`；每个异步取得从开始前即有原 owner，迟到 handle 回原 cleanup；计数只是索引，必须对应实际 task/handle 及完成证据 |

execution、environment、file 是 LE owner 的逻辑记录流；实际 `StreamRef`、
`core-operation/1` 操作输入、`core-journal/3` envelope、批内事实位置与编码
由[当前 DR v1](../../spec/capabilities/durable-records/v1/contract.md#记录结构与编码)给出。
来源的 `core-journal/1` 和事件 `/1` 不获新 v1 的可写恢复承诺；旧源码尚未兑现
[v3 codec 与 writer/replay 映射](../storage-jsonl/design.md#待代码与环境验收)。
LE 自有的事实种类、版本与校验仍须按当前 DR 格式定义，不能凭来源事件名直接写入。
decoder/纯 fold 要检查原 owner、身份、状态与来源；缺精确格式或 required fold
不开放 start，不能恢复成空墓碑。

| owner / 旧来源逻辑事件族（不是新记录编码） | 保存与合法转移 |
|---|---|
| local-execution.accepted / dispatch_intent / terminal_recorded | 精确计划/准入来源，实际 I/O 前的保守意图，实际终止事实；不能先写 succeeded 再做文件操作。终态经 TL-15 同域提交或 CC-05 跨域交付，BG 后果另按真实来源及回执收口 |
| local-execution.stop_fenced/progressed / delivery_changed | 原取消墓碑、真实任务/handle/迟到启动隔离结果，目标回执；stop 的否定屏障不等同步等待 I/O |
| local-execution.environment_registered/file_registered/rights_changed/file_observed | 原对象/owner/根与注册版本，权限上限合法变更，已核实内容修订或 unknown；读取文件内容本身不成为授权事实 |
| 各 owner.operation_denied | 具名操作、目标、code、当前依据/水位，原 owner 关键拒绝审计；写失败为 audit_unavailable，不报已耐久拒绝 |

上述是旧稿的语义分组；新事实身份、三段式 kind 与同批关系以 TL-15/DR-01 为准。
旧事件名和版本不是持久字节或新 decoder 的采用依据。

## 本地资源与真实执行

### 最小资源权限提供者

LocalFileResources 是 local-execution 内具名责任，不是通用资源/ACL 框架。
可信部署通过实际 `registerEnvironment/registerFile/setResourceRights` 条件操作
建立 `{ResourceRef,owner:UserRef,tenant,rootIdentity,targetName,allowedOperations,
grantorLimits,revision,state}` 并耐久审计；TG 当前成员/原 owner 才可管理，组织
管理权不隐含文件读写/代授予。AU grant 仍由 AU 管理，这里只拥有对象当前资格/
硬上限，不再保存另一份动作 grant。真实凭据/TG 管理适配由应用/治理 owner 提供；
缺这些产物时资源不能以测试表初始化为全允许。

root 是部署创建、仅宿主控制的本地目录，登记 device/inode/规范路径和环境版本；
每个 targetName 是预登记单层 basename，不接受 slash、dot traversal、任意路径。
禁止 root 内其它不受管写者；拒绝 symlink、非普通文件及外部 hardlink，打开叶子
使用 O_NOFOLLOW 并核对实际 fd/根事实。恶意宿主/OS 管理员越权改盘属于可信部署
边界，本方案不声称沙箱。需要任意路径、可被其它进程改写的目录或远程 FS，换
合格 provider 并重新验证，不靠字符串 realpath 一次检查宣称消除 TOCTOU。

`prepareResourceFacts/checkResourceFacts` 向 AU 给精确对象/环境/权限/授予上限与
current stamp；`prepareFileUse/checkFileUse/acquireFileUse` 在实际准入同门给原
资源 ExactUse。固定目标一次仅一项文件工作使用，冲突 busy，不引入通用队列。
未知效果/未关闭 fd 保留原使用；按真实停止/核实才能释放。修改权限的收紧同门
封闭新准入，既有许可停止另走 control。ResourceRef.version 指注册版本，内容
修订另存；unknown 内容不冒充新的已知版本。

LocalFileToolPlugin 提供一个多命令工具，read `{targetId}` 为 none，write
`{targetId,text,expectedContentRevision}` 为 before_effect；两者都声明实际资源
权限。LocalFilePlan 为这两种具名闭合计划，绑定完整 Action/目标版本和长度限制；
不解释任意 shell/JS 或可变回调。handler 不能在许可外产生动态子动作；需要别的
效果须新 Action 和合格 provider。输入/输出大小、执行时限和并发是明确部署容量，
不冒充人类请求上限；超限在作用前拒绝或按原停止协议收口。
这个 read/write 限制属于本批 local-execution 提供者；ToolDefinition/Command 的
通用声明面和其它合格 ExecutionProvider 的注册边界仍保留，不能把所有工具改成
文件专用数据契约。缺相应 provider 的命令显示 unavailable，不能自动改用文件实现。

### start、inspect、stop 与 I/O 交接

`start({execution,permit,binding,plan,operation})` 只给受信 TL 派发 owner；
`inspect(execution)`、`requestStop({execution,controlOperation})`、`subscribe`
是 ExecutionProvider 的窄方法。inspect 返回 absence/accepted/dispatch_intent/
terminal、真实停止/清理/效果证据与 watermark；start 重复返回原
ExecutionRef/接纳回执，同键异计划或旧 permit 为 conflict/invalid_permit。
detach 固定 unsupported，不改变前台关系。
本地 read/write 命令声明 `stop.capability = cooperative_fence`：可同步封闭未发出的
新文件动作，已发动作须等待真实收口，不能承诺时限内强隔离。`force` 单调用升级仅属于
已核实 `forced_isolation` 能力的 owner，本提供者不得把超时、进程失联或内部
`sealed` 标签当作 verified isolation，也不对 unknown 自动升级。
原宿主另持 `requestClose/inspectExit`：返回 provider 的 closing/quiescent/
releasing/closed、原未收口 execution/准备/handle 责任及最近错误。开始关闭先
同步关新 start，真正关闭按下述证据推进；调用者等待超时不转 closed。普通
用户不取得该宿主管理能力，单次 inspect 只按其权限披露对应工作。

TL-07 的 exposure 从**执行许可取得或目标接纳两者中先发生者**开放，不等到
`start` 回执。TL-08 要求 exposure 与 attempt 账本由同一执行 owner、同一代恢复；
因此 LE 的记录根持有本地执行的 exposure，TL 的列表只是按权查询与聚合，不能另造
第二份物理执行权威。首版本地 LE 与 TL 使用同一协调域：LE Host 在 TL 准入准备时给出
绑定原 call/attempt、执行 epoch、LE owner generation 和执行绑定的 exposure-open
候选；共同门检查本代 LE/TL 挂载、原许可与当前根，把 LE owner 的
`execution.exposure.opened` 事实及
`tools.call.admitted`、Run 工作关系、授权审计与预算预留放进同一个批次。
这只是 CC-01 已声明的调用受理／执行许可同批关系中的执行 owner 投影。
完整耐久前缀及全部 owner publication 可消费之前不交付许可或发出 `start`。
因此许可至 LE accepted 的空窗已有 LE 持久 owner；即使尚无 accepted，原
`requestStop` 仍可在该账本建立墓碑，并与迟到 start 排序。LE 换代须先认回
open exposure 与 fence，不能把未接纳或业务已 `settled(unknown)` 当作空集合。
stop 先于 start 时，只有墓碑耐久、未曾 dispatch/launch，且同账本栅栏能保证
任何迟到 start 都被拒绝，才能给该 exposure 记同代 quiescent 并释放原执行许可/资源责任；
`cancelled_before_execution` 标签本身不替代这份物理证据。
其它执行 provider 若不与 TL 同域，在具备等价的 CC-05 耐久交接、可查询认回
和 RN-05 不漏项证明之前不交付许可，报告 unavailable；本地 LE 不冒充跨域原子性。
LE open/close fact 的精确版本化 codec、真实 publication 安装和跨域协议仍属
[Tools/LE/records 联合验证](verification.md#当前-v1-反例与阻断)，不是已实现保证。

1. TL 的耐久 dispatch 意图在原 authority 下保留至执行目标接纳回执。LE 在同一
   coordinator 短门核验私有 permit、精确 Binding/原执行 epoch、自己的墓碑及
   去重，提交 local-execution.accepted；该批耐久前不启动任何目标文件 I/O。
   start 回执丢失查同一 ledger，不能新建调用。本地共同提交消费同一 DR 协调域
   及唯一 writer，不另建 writer 或假定两文件原子提交；其它 provider 的跨域
   准入在上述交接闭合前 unavailable。
2. 真正 I/O 前 LE 保存 dispatch_intent 及给 BG 的具名预算暴露交付意图；BG 通过
   recordExposure 认回这条真实 possibly_emitted 来源并耐久确认后，才继续启动。
   无回执保留原意图/预留且不发 I/O，不要求 BG 从执行帧猜暴露。随后在原执行屏障同步确认尚未 stop、
   登记一个原 launch/task；退出门后立即调用固定 Node I/O，无中间 await/插件
   回调。stop 先封闭则不发出，已登记的 launch 则仍由原 owner 收口，不能从
   任务表先删除再等待。rename 发出前，每个**尚未发出**的 read/write/open/fstat/
   临时文件 sync/rename 等新文件动作都用同一原 host 串行门完成“核对 stop/lease → 登记 task/handle
   接收责任 → 立即调用固定 Node API”；这三步间不得 `await`。Node Promise 的
   等待在门外，门不等待 I/O；stop 墓碑与各次发出按该门排序。
3. read/write/open/sync/close 的每个 Promise 和迟到 FileHandle 从发起前就有
   原 task。write 写原目标同目录的专用临时文件，sync 后 rename，再同步目标/
   必需目录，实际结果才可报告已完成。**rename 尚未发出时**，stop 先过门就禁止
   rename；**rename 已发出后**，目标/目录 fsync、revision 复核、fd close 是该已发
   动作必要的完成与收口，stop 不应拦截这些步骤，也不得据此启动另一个独立文件
   效果。stop 不把已发生 rename 当回滚；已核实效果与结果结算分开。结果
   经完整 output Schema 校验，非法输出/呈现错误结算 failed 并保留实际效果。
   最后关闭 fd、核实任务已静止，保存 terminal 和 TL/BG 待交付后果。
4. requestStop 即使早于 start 也在同账本写墓碑；logical 时关闭全部尚未发出的新效果/
   迟到启动，耐久后才确认该封闭可恢复。已发出 I/O 必须等待实际 settle/close，
   只发 AbortSignal、Promise.race 超时、not_found 或计数变零都不算 stopped。
   未 rename 的临时文件清理和已取得 handle 的 close 仍由原 owner 做；I/O 卡住时
   保留 stopping/retained，时限只结束等待，不虚报可强制中止内核。
5. 本地安全停止证据为原墓碑耐久、原 launch 均已收口、实际 I/O 不再进行、所有
   通道禁止迟到 start 且 handle 已关闭；其它 provider 的强隔离须另有合格证据。
   效果 none/happened/possible
   单独保存。成功先耐久成立则 stop=ended；先 stop 后迟到成功按真实已发生事实
   入账，不能自动重写成成功或声称外部效果已撤销。

TL-09 的公开进展只写同一事实中的封闭三轴：`physical = quiescent | isolated | unknown`、
`cleanup = done | retained`、`effect = none | possible | confirmed`。本地 cooperative
owner 只有实际无在途效果和迟到启动时给 `quiescent`；仍在活动是中间观察，
有界等待到期给 `unknown`，**不**输出 `isolated`。全部必需 fd/临时资源和原清理
责任真实释放才给 `done`，否则 `retained`；能证明未产生效果给 `none`，已核实
文件效果给 `confirmed`，发出后未核实、崩溃/回执丢失或原内部 `unknown` 给
`possible`。已发 rename 后若 fsync/revision/close 失败或崩溃，保留真实
`effect: confirmed | possible` 与 `cleanup: retained`（若尚未清理），业务结果
按可恢复证据确定，否则 unknown，不能因 target 字节看似相同而填 succeeded。
若未来另有 forced-isolation provider，只有强隔离资格在装载时已验证、同一
call/attempt/epoch/generation/fence revision 的隔离证据可核验，才给
`physical: isolated` 并关闭 TL-07 exposure；效果与清理仍分别报告。

本地只执行这些受管文件操作，不创建可逃逸子进程/网络任务；任意 native callback
不具有该停止声明。它支持可靠封闭和等待真实收口，**不承诺有时限的强制停止**。
新的 provider 若声明强制停止，须另给实际隔离/迟到启动证据；API 字段不授资格。

恢复先由 DR 的独占 writer 验证完整前缀，并沿 CC-06 在同水位 fold
TL/HD/Session/Budget/执行/资源与必需 owner 事实。LE 未恢复墓碑和 permission-time
exposure 前不可接收 start；旧运行 permit/handle 作废。
CC-06 的同水位 required-owner 基线必须包含持有该 exposure/fence 的 LE durable root；
缺 LE root、旧 generation 未隔离或来源关系未核实，既不开放新 `start`，也不向
RN-05 返回“没有开放 exposure”。同一执行的 `execution.exposure.closed` 仅凭
同代、同 call/attempt/epoch/fence 的 quiescent 或 verified isolation 事实提交，
不由 `tools.call.settled` 或 Run 终态推导。原 accepted 且无
dispatch_intent 的完整前缀可证明未进入效果位置，通过
TL 的[受限 recovery permit 交接](../tools-tools/design.md#原调用与邻包的窄交接)核对原耐久
准入/控制及实际精确绑定后继续，不以普通 grant 撤回重新裁决旧位置；已有
dispatch_intent 但终态不明，则 possible_effect/unknown，
不靠文件内容相同猜“恰好一次”，不自动重发。旧宿主是否仍有能力发出 I/O 也要
按实际退出/OS 独占证据核实，未核实保持隔离，不能仅以 PID 或进程内 Map 判断。
真实工具效果与业务 journal 不能原子成立的窗口见[固定 kill 探针](verification.md#固定来源证据与限制)。

原执行终态已耐久则重交同一 sourceVersion/operation，直到 TL/Session/BG 回执认回；
无 Agent 也保留它们。Session SE-18 的执行前 deny 恢复只有原结算接续，LE
不能凭有 attemptId 就创建执行记录。原取消/强停/已关闭后果不随重启复活。

### 本地费用与帧

本地执行 owner 向 BG 提供真实 CostSource：本固定文件实现没有供应方计费，
证据绑定 provider/artifact/命令/计价版本，maximum=明确币种的 0；租户必须通过
enableSource 建立实际 observe/soft/hard 立场，所有适用预算仍参与联合 reserve。
测试任意另一有价来源不能继承该 0。未知 I/O 效果和费用质量分开；只有真实
来源能证明完整零费用才可 final 0，不能因没有 usage 默认归零。非零/未知来源
沿治理 BG 的 knownReserve、当前暴露、原 period 和 late fact 去重规则。
releaseBeforeStart 仅接受原耐久墓碑+never_started 证明；断连/unknown 不释放。
owner 重启先恢复 attempt ledger、fence 与全部 open exposure；错代、迟到或重复 stop evidence 只审计，不关闭当前项。`settled(unknown)` 继续暴露，供 RN-05 门读取。

LE 分配每 attempt 单调 frame seq；frame 是执行观察，非模型思考。保留量按
条数/字节/时限配置，裁剪返回明确 gap/earliest/latest，重启无法保留的旧帧报告
crash gap。每订阅独立 cursor；TL 当前读权通过后转交，投递前再次核对，撤权
结束该订阅而不 stop 工作。终态在 journal，与最后一帧/100% 进度分开；模型只
取原 Run/Step 按[TL-19](../../spec/capabilities/tools/v1/contract.md#结果恢复与投影)
明确消费的结果/摘要，不因 UI 展开而注入全帧。无帧返回 empty/unsupported。

## Cordis 映射与撤除责任

| 导出 plugin / service key | inject、Context/Fiber/effect 归属 |
|---|---|
| LE LocalExecutionPlugin / `omneLocalExecution`,`omneLocalResources` | inject `omneAdmission`,`omneDiagnostics`；受信 options 指定原 createLocalExecutionHost。宿主 sibling Fiber 与 Agent/Tools 操作 Fiber 无父子拥有关系；恢复接纳/墓碑/资源后提供两个有真实职责的表面。全部 I/O/task/fd 归原 host，一个具名复合 effect 驱动其有序关闭并保留未完责任 |
| LE LocalResourceAccessPlugin / 不新增 service | inject `omneLocalResources`,`omneTenant`,`omneAuthorization`,`omneBudget`,`omneIdentity`；连接当前认证/TG、AU ResourceFacts/可授予上限及 BG 所需来源事实。对象管理政策在 LocalFileResources，桥只装配；任一当前来源缺失，依赖它的操作 unavailable；原 I/O 清理仍归 LE |
| LE LocalFileToolPlugin / 精确工具贡献、无新 service | inject `omneTools`,`omneLocalExecution`,`omneLocalResources`,`omneAuthorization`；定义/Schema/声明/handler 选择一起 prepare/publish。该 Fiber 只拥有贡献注册和未转移准备，不拥有已准入 I/O；原执行实现和 FileUse 的资源归 LE |

ToolExecutionLinkPlugin 由 TL 提供，双端 PermitFacts/ExecutionProvider 的当前
代次和撤回义务见[TL 提供者映射](../tools-tools/design.md#cordis-映射与撤除责任)。LE 自己
提供 createLocalExecutionHost 的恢复/关闭和精确资源/来源管理能力；应用仅将
指定双端能力交 link options，不把管理能力混进普通 service。受信 factory/options
注入唯一 coordinator、diagnostics、真实 RecordReader/恢复水位。prepare 只从
omneAdmission，reader 不给工具 body；无 omneRecords，也无第二 writer。

每个挂载保存原 host/generation/revision、单调 closed、canonical Fiber 和
必要 provider/link 的精确挂载。稳定宿主 internal/status 观察调用本包具名
closeMount/closeLink 同门关闭原代；**start 最后门自行同步检查原 LE 操作挂载、
TL PermitFacts/ExecutionLink、Admission 等必要挂载的当前代次和实际 Fiber
ACTIVE**，不能等 effect 第一次执行。已 prepared start 和捕获旧闭包同样检查；
依赖重现重新 apply 分配新 generation，不能用旧许可进入新 provider incarnation。
同步状态/通知/异步 disposer 的固定机制及 canonical identity 依据见
[T-R1 探针](verification.md#固定来源证据与限制)；这项存活检查随后仍需
原耐久准入/停止屏障/ExactUse/原执行 epoch，不代表重新裁决普通 grant。

恢复/装载先纳管 async 准备，再同门核对当代存活才发布。LocalFileToolPlugin
仅建立本代声明/handler/skill 贡献；其移除先关闭新选用，原 I/O 与 FileUse 留
原 LE host。LocalResourceAccessPlugin 只撤本次 AU/BG/TG/身份链接，不能删除
已登记资源或未结算费用。部分准备失败/迟到 fd 归原尝试，旧 disposer 不碰新代。
LocalExecutionPlugin 的单一复合 effect 按实际 task→fd→provider 顺序驱动
host 关闭，不能拆成并行 disposer。突失先由 final current 检查封闭新 start；
已接纳工作通过独立保有的控制/终态交付能力收口，不因操作挂载消失擦账。

**T-R2：真实终态/停止事实交 TL/Session 不需要已交还的 DriverClaim 或活体 Agent。**
原来源执行 epoch/terminalVersion 与当前受信接收者/原调用控制分别核验；原
同域按 TL-15 将 `execution.attempt.terminal`、`tools.call.settled` 与相应
`inbound.arrival.accepted` 放进同一完整提交；跨域按 CC-05 交接而不伪造原子性。
Session 按 SE-14 独立裁决接续/上下文/入队/关闭，LE 不直接置 Run/Step ready。
已关闭的事实只按迟到效果与计量保留，不复活原工作。
接收端 unavailable 时保存稳定待交付责任，不能让旧 Agent callback 代行，也
不能在重启后重新 start 一个已完成 attempt。执行新动作才需原 TL/Run 工作许可。

计划关闭先关新 start、保存墓碑/移交并等真实收口；DR writer 关闭次序由受信应用装配
负责，不能先撤 writer 再宣称停止记录已耐久。timeout/cleanup 失败保留原
requestClose/inspectExit/retained；宿主持续持有实际资源和后果直至合法释放。
旧 D06/D07/D09/D11/D12 是施工编号，不是当前 v1 验证清单；实施线已有局部
真实 stop→rename 检查，但 TL/Run/预算/恢复/权限/帧的联合符合性尚未执行。
证据与剩余反例见[验证记录](verification.md)。
