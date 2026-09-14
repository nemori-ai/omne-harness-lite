# 本地文件执行提供者设计

状态：**候选，待独立审阅和整合者接受；目标接口尚未实现/编译**。本页是所属包
当前提供者设计，迁自施工稿 `e6c0b8c5d1a7cc3b282c809498a241a66ad71b9d`；
消费目标/验收基线 `8c791b3`，迁入计划 `0703f6e`，本次修订基线 `b585608`。
采用快照与开放门由[施工与证据](../../../docs/proposals/core-capabilities/implementation/tool-decision-interfaces.md)固定，设计文件不建立 workspace 成员。

精确业务语义沿 [catalog](../../../spec/catalog.json) 中的 `capability.tools@1`、`capability.action-authorization@1`、`capability.budget-accounting@1`、`capability.tenant-governance@1`、`capability.durable-records@1`、`composition.core-work-coordination@1`，
共享身份直接复用 `data.core-work@1`、`data.agent-runtime-identity@1`；
[治理接口](../../../docs/proposals/core-capabilities/implementation/governance-interfaces.md)
受审源 `058c77c`、[SR 接口](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md)
受审源 `cd16f1` 的已接受范围保持。以下形状/事件是实施投影，不另立语义规格。
相邻 P2 提供者消费 `runtime-provider-interfaces.md@5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18`
候选及其固定机制证据；该稿尚未接受，完整 P2 生命周期仍归原作者。

## 公开入口与记录权威

| 包 / 目标默认公开入口 | 所有职责与导出 |
|---|---|
| `tools/local-execution` / `@omne-harness-lite/local-execution` | 原执行接纳/取消账本、固定文件计划/真实 I/O/帧与停止事实；本地文件资源身份、当前对象权限/可授予上限及使用责任；导出 createLocalExecutionHost、LocalExecutionPlugin、LocalResourceAccessPlugin、LocalFileToolPlugin、ExecutionProvider 实现与本地资源管理/事实接口、事件 decoder/纯 fold |

本包尚无产品 member/API；以上默认入口是候选。只实现本批具名 Linux 本地
read/write，ToolDefinition/Command 仍保持 [TL 通用声明面](../tools/design.md#定义声明handler-与-skill-的同一发布单位)。
不执行 shell/任意 callback/网络文件系统/后台脱离；Node 24.18.0 FileHandle
是实际 I/O，不用 AbortSignal 或内存 Map 代替停止协议。本包消费 TL 定义的
ExecutionProvider/PermitFacts 及治理公共类型；TL 不 import 本包。记录 owner
为 local-execution，唯一 createLocalExecutionHost 持有执行/取消/资源根与真实
I/O 责任，projection/帧只作观察。运行 incarnation 不能从持久数据复活。

## 身份、状态与事件投影

原 ExecutionRef/CallRef/Action 与来源 TL 恒定，直接消费 [TL 身份](../tools/design.md#身份状态与事件投影)。
executionEpoch、原 Step.createdEpoch、当前 Run.epoch 与 provider incarnation
分别核验；重复 operation 认原计划，同键异输入 conflict，未知不换 ID 重发。

| 本地执行状态 | 最小值与不变量 |
|---|---|
| Attempt ledger | `{execution,phase:accepted|dispatch_intent|terminal,acceptedOperation,planDigest,controlRevision,tombstone:null|StopFence,terminal:null|ExecutionTerminal,deliveries}`；absence 独立于任一状态。数据恢复不复活 Permit、ExactUse 或 FileHandle |
| StopFence | `{execution,controlOperation,revision,requestedAt,epochClosed:true}`；即使 absence 也可创建，在 start 的同一账本/共同门排序；墓碑按原 execution 身份永久保留或可证明压缩，不能按时间过期 |
| ExecutionTerminal | `{resultCandidate,acceptance:accepted|never_accepted,physical:active|quiescent|unknown,isolation:sealed|pending|unknown,cleanup:released|retained,effect:none|happened|possible|unknown,sourceVersion}`；unknown 不等于已停止，安全停止也不保证效果撤销 |
| Live task | 原 provider 私有 `{incarnation,execution,launches,issuedIO,openHandles,cleanup}`；每个异步取得从开始前即有原 owner，迟到 handle 回原 cleanup；计数只是索引，必须对应实际 task/handle 及完成证据 |

streamId 为规范元组 execution(ExecutionRef)、environment(ResourceRef)、
file(ResourceRef)；core-journal/1、core-operation/1、Counter、事件字符串 version
`"1"` 和 SR 同批 sourcePosition 不再另定义。decoder/纯 fold 检查原 owner/状态
与来源；缺版本或 required fold 不开放 start，不能恢复成空墓碑。

| owner / 事件族（全部 /1） | 保存与合法转移 |
|---|---|
| local-execution.accepted / dispatch_intent / terminal_recorded | 精确计划/准入来源，实际 I/O 前的保守意图，实际终止事实；不能先写 succeeded 再做文件操作；终态与待交付 TL/BG 后果同批 |
| local-execution.stop_fenced/progressed / delivery_changed | 原取消墓碑、真实任务/handle/迟到启动隔离结果，目标回执；stop 的否定屏障不等同步等待 I/O |
| local-execution.environment_registered/file_registered/rights_changed/file_observed | 原对象/owner/根与注册版本，权限上限合法变更，已核实内容修订或 unknown；读取文件内容本身不成为授权事实 |
| 各 owner.operation_denied | 具名操作、目标、code、当前依据/水位，原 owner 关键拒绝审计；写失败为 audit_unavailable，不报已耐久拒绝 |

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
terminal、真实 physical/isolation/cleanup/effect 与 watermark；start 重复返回原
ExecutionRef/接纳回执，同键异计划或旧 permit 为 conflict/invalid_permit。
detach 固定 unsupported，不改变前台关系。
原宿主另持 `requestClose/inspectExit`：返回 provider 的 closing/quiescent/
releasing/closed、原未收口 execution/准备/handle 责任及最近错误。开始关闭先
同步关新 start，真正关闭按下述证据推进；调用者等待超时不转 closed。普通
用户不取得该宿主管理能力，单次 inspect 只按其权限披露对应工作。

1. TL 的耐久 dispatch 意图在原 authority 下保留至执行目标接纳回执。LE 在同一
   coordinator 短门核验私有 permit、精确 Binding/原执行 epoch、自己的墓碑及
   去重，提交 local-execution.accepted；该批耐久前不启动任何目标文件 I/O。
   start 回执丢失查同一 ledger，不能新建调用。跨域 provider 以后沿 CC-05，
   本地使用同一 core-journal，不另建 writer 或假定两文件原子提交。
2. 真正 I/O 前 LE 保存 dispatch_intent 及给 BG 的具名暴露交付意图；BG 通过
   recordExposure 认回这条真实 possibly_emitted 来源并耐久确认后，才继续启动。
   无回执保留原意图/预留且不发 I/O，不要求 BG 从执行帧猜暴露。随后在原执行屏障同步确认尚未 stop、
   登记一个原 launch/task；退出门后立即调用固定 Node I/O，无中间 await/插件
   回调。stop 先封闭则不发出，已登记的 launch 则仍由原 owner 收口，不能从
   任务表先删除再等待。每次下一文件系统步骤均检查原停止屏障；真实 syscall
   与 async await 都在门外，门不等待 I/O。
3. read/write/open/sync/close 的每个 Promise 和迟到 FileHandle 从发起前就有
   原 task。write 写原目标同目录的专用临时文件，sync 后 rename，再同步目标/
   必需目录，实际结果才可报告已完成；stop 不把已发生 rename 当回滚。结果
   经完整 output Schema 校验，非法输出/呈现错误结算 failed 并保留实际效果。
   最后关闭 fd、核实任务已静止，保存 terminal 和 TL/BG 待交付后果。
4. requestStop 即使早于 start 也在同账本写墓碑；logical 时关闭全部后续步骤/
   迟到启动，耐久后才确认该封闭可恢复。已发出 I/O 必须等待实际 settle/close，
   只发 AbortSignal、Promise.race 超时、not_found 或计数变零都不算 stopped。
   I/O 卡住时保留 stopping/retained，时限只结束等待，不虚报可强制中止内核。
5. 安全停止证据为原墓碑耐久、原 launch 均已收口、实际 I/O 不再进行、所有
   通道禁止迟到 start、handle 已关闭或具名安全隔离。效果 none/happened/possible
   单独保存。成功先耐久成立则 stop=ended；先 stop 后迟到成功按真实已发生事实
   入账，不能自动重写成成功或声称外部效果已撤销。

本地只执行这些受管文件操作，不创建可逃逸子进程/网络任务；任意 native callback
不具有该停止声明。它支持可靠封闭和等待真实收口，**不承诺有时限的强制停止**。
新的 provider 若声明强制停止，须另给实际隔离/迟到启动证据；API 字段不授资格。

恢复先由 P1 独占 writer 验证前缀，再在同水位 fold TL/HD/SR/BG/执行/资源事实。
LE 未恢复墓碑前不可接收 start；旧运行 permit/handle 作废。原 accepted 且无
dispatch_intent 的完整前缀可证明未进入效果位置，通过
[TL prepareRecoveryPermit/checkRecoveryPermit](../tools/design.md#原调用与邻包的窄交接)核对原耐久
准入/控制及实际精确绑定后继续，不以普通 grant 撤回重新裁决旧位置；已有
dispatch_intent 但终态不明，则 possible_effect/unknown，
不靠文件内容相同猜“恰好一次”，不自动重发。旧宿主是否仍有能力发出 I/O 也要
按实际退出/OS 独占证据核实，未核实保持隔离，不能仅以 PID 或进程内 Map 判断。
真实工具效果与业务 journal 不能原子成立的窗口见设计证据中的实际 kill 探针。

原执行终态已耐久则重交同一 sourceVersion/operation，直到 TL/SR/BG 回执认回；
无 Agent 也保留它们。SR S18 执行前 deny 恢复只有原 consume_result 接续，LE
不能凭有 attemptId 就创建执行记录。原取消/强停/已关闭后果不随重启复活。

### 本地费用与帧

本地执行 owner 向 BG 提供真实 CostSource：本固定文件实现没有供应方计费，
证据绑定 provider/artifact/命令/计价版本，maximum=明确币种的 0；租户必须通过
enableSource 建立实际 observe/soft/hard 立场，所有适用预算仍参与联合 reserve。
测试任意另一有价来源不能继承该 0。未知 I/O 效果和费用质量分开；只有真实
来源能证明完整零费用才可 final 0，不能因没有 usage 默认归零。非零/未知来源
沿治理 BG 的 knownReserve、当前暴露、原 period 和 late fact 去重规则。
releaseBeforeStart 仅接受原耐久墓碑+never_started 证明；断连/unknown 不释放。

LE 分配每 attempt 单调 frame seq；frame 是执行观察，非模型思考。保留量按
条数/字节/时限配置，裁剪返回明确 gap/earliest/latest，重启无法保留的旧帧报告
crash gap。每订阅独立 cursor；TL 当前读权通过后转交，投递前再次核对，撤权
结束该订阅而不 stop 工作。终态在 journal，与最后一帧/100% 进度分开；模型只
取 SR 明确选择的结果/摘要，不因 UI 展开而注入全帧。无帧返回 empty/unsupported。

## Cordis 映射与撤除责任

| 导出 plugin / service key | inject、Context/Fiber/effect 归属 |
|---|---|
| LE LocalExecutionPlugin / `omneLocalExecution`,`omneLocalResources` | inject `omneAdmission`,`omneDiagnostics`；受信 options 指定原 createLocalExecutionHost。宿主 sibling Fiber 与 Agent/Tools 操作 Fiber 无父子拥有关系；恢复接纳/墓碑/资源后提供两个有真实职责的表面。全部 I/O/task/fd 归原 host，一个具名复合 effect 驱动其有序关闭并保留未完责任 |
| LE LocalResourceAccessPlugin / 不新增 service | inject `omneLocalResources`,`omneTenant`,`omneAuthorization`,`omneBudget`,`omneIdentity`；连接当前认证/TG、AU ResourceFacts/可授予上限及 BG 所需来源事实。对象管理政策在 LocalFileResources，桥只装配；任一当前来源缺失，依赖它的操作 unavailable；原 I/O 清理仍归 LE |
| LE LocalFileToolPlugin / 精确工具贡献、无新 service | inject `omneTools`,`omneLocalExecution`,`omneLocalResources`,`omneAuthorization`；定义/Schema/声明/handler 选择一起 prepare/publish。该 Fiber 只拥有贡献注册和未转移准备，不拥有已准入 I/O；原执行实现和 FileUse 的资源归 LE |

ToolExecutionLinkPlugin 由 TL 提供，双端 PermitFacts/ExecutionProvider 的当前
代次和撤回义务见 [TL 设计](../tools/design.md#cordis-映射与撤除责任)。LE 自己
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
[TL T-R1 映射](../tools/design.md#当前代次的最后门内检查)；这项存活检查随后仍需
原耐久准入/停止屏障/ExactUse/原执行 epoch，不代表重新裁决普通 grant。

恢复/装载先纳管 async 准备，再同门核对当代存活才发布。LocalFileToolPlugin
仅建立本代声明/handler/skill 贡献；其移除先关闭新选用，原 I/O 与 FileUse 留
原 LE host。LocalResourceAccessPlugin 只撤本次 AU/BG/TG/身份链接，不能删除
已登记资源或未结算费用。部分准备失败/迟到 fd 归原尝试，旧 disposer 不碰新代。
LocalExecutionPlugin 的单一复合 effect 按实际 task→fd→provider 顺序驱动
host 关闭，不能拆成并行 disposer。突失先由 final current 检查封闭新 start；
已接纳工作通过独立保有的控制/终态交付能力收口，不因操作挂载消失擦账。

**T-R2：真实终态/停止事实交 TL/SR 不需要已交还的 DriverClaim 或活体 Agent。**
原来源执行 epoch/terminalVersion 与当前受信接收者/原调用控制分别核验；原
有效结果使原 Step 接续 ready，已关闭的事实只按 SR late_fact/效果/计量保留。
接收端 unavailable 时保存稳定待交付责任，不能让旧 Agent callback 代行，也
不能在重启后重新 start 一个已完成 attempt。执行新动作才需原 TL/SR 工作许可。

计划关闭先关新 start、保存墓碑/移交并等真实收口；P1 关闭次序由相邻 P2/app
负责，不能先撤 writer 再宣称停止记录已耐久。timeout/cleanup 失败保留原
requestClose/inspectExit/retained；宿主持续持有实际资源和后果直至合法释放。
D06/D07/D09/D11/D12 的真实 I/O/停止/恢复/费用/帧验证及类型编译仍未执行；
[现有 kill 观察](../../../docs/proposals/core-capabilities/implementation/evidence/tool-decision-design/README.md)
只支持独立文件效果与业务结果间有崩溃窗口。
