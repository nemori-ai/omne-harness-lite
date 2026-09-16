# 人类决定提供者设计映射

状态：目标接口尚未实现/编译；只保留接口、状态、门与撤除协议作为后续实现输入。 本页保留后续实现会持续消费的端口、状态、失败与撤除协议；来源中的旧
接受和旧坐标仅作 provenance。本 baseline 对应契约均为 candidate、`acceptance:null`。



## 投影共同约束

- Host 是长期状态与异步责任 owner；Cordis plugin 只注册受限服务/贡献并拥有本代资源。
- 链接插件固定双方 registration/generation，先封闭正向使用再撤回；它不复制业务状态。
- 每次 effect 前核对当前 Fiber、tenant、资格、binding、epoch 和取消；Context/AgentRef 不代授权。
- 撤除先关新工作、排空本代短门与私有资源；已耐久请求、调用、结果、费用与 unknown 留给长期 owner。

## 当前 v1 适配

来源协议没有被提升为实现符合性；其中仍指向旧坐标的内容只作 provenance，必须在实现前映射到当前 candidate 或登记 gap。

| 当前 HD v1 范围 | 本页提供者映射状态 |
|---|---|
| `system_approval` 的原请求、唯一答案、AU/TL/SR 后果与池 | 下文旧 T0-H 施工协议给出候选端口和撤除责任；目标接口未实现 |
| `question`、`agent_approval` 及内建 `human.ask_user` / `human.request_approval` | HD-01～05、HD-08、HD-13 的语言契约已存在；本页旧 Request 形状和 SystemApprovalSource 只映射 `system_approval`，尚缺这两类请求的执行 owner、调用结算及后果端口设计 |
| HD-05 的受信程序化 `system_approval` 作答者 | 尚缺 provider 登记、on-behalf-of 成员修订与 confirm 模式的具体同门映射；不能由普通答复端口代替 |
| HD-10～12 的暂行决定与专属同意 | 没有合格领域来源；下文规定 unavailable，未映射实际 staging/finalize provider |

这张表只标明 provider 覆盖，不缩小[HD v1](../../spec/capabilities/human-decisions/v1/contract.md)
的候选业务语义；缺口未闭合时相关运行入口不可开放。

## 来源协议（重基输入）

## 公开入口与记录权威

| 包 / 目标默认公开入口 | 所有职责与导出 |
|---|---|
| `governance/human-decisions` / `@omne-harness-lite/human-decisions` | HD 请求/评论/唯一决定/消费/后果权威和可重建池；导出 createHumanDecisionHost、HumanDecisionStatePlugin、HumanDecisionsPlugin、HumanDecisionAuthorityLinkPlugin、SystemApprovalSource/DecisionFacts 交接、事件 decoder/纯 fold。Session 与池不各造一个 answer |

本包尚无产品 member/API；默认导出为候选。HD 自己定义 SystemApprovalSource，
由 TL 实现；HD 不 import TL，也不拥有 TL 调用或 LE 执行状态。消费 AU/TG/SR
及 work-data/records/admission/diagnostics 公共类型。记录 owner 为
`human-decisions`，唯一 host 持有 logical/durable 请求/决定/后果；Session/池
只是双入口。投影可重建，不能授权读取/作答。关键审计失败 audit_unavailable，
不报耐久成功；Diagnostics 失败不覆盖已有业务回执。

## 状态与事件投影

身份沿共享 RequestRef/Decision/Action/CallRef，不重新编号原 Step 或 attempt。
request/outcome ID 在原 operation 私有候选分配一次；使用宿主唯一启动命名空间
和不回绕 owner 计数。initiator 不充当 owner/当前答复者，完整嵌套 tenant 逐项核对。

| HD 状态 | 最小值与不变量 |
|---|---|
| Request | `{request,kind:system_approval,contentVersion,revision,action,call,sourceStep,continuationId,missing:MissingPermission[],grantorRule,sourceOperation,content,status:pending|answered|cancelled|superseded,decision:null|Decision,consequence}`；内容从冻结 Action 和 AU 缺口生成，不从自由文本猜对象/效果 |
| Consequence | `{outcomeVersion,delivery:not_ready|pending_delivery|applied|failed|unknown,consumption:unconsumed|consumed|closed,consumedBy:null|CallRef,reason,sourcePosition,targetReceipt}`；交付 q1 ready 不等于消费批准。answered 与其后果关闭分别记录，保留原人类答案 |
| Pool | 原请求的 derived 索引，键为 RequestRef；按水位分页，当前权限变化使旧游标失效。可答性 available/unreachable/not_placed/unknown 独立于 pending |

streamId 候选为规范元组 `request(RequestRef)`。来源稿采用 `core-journal/1`、
`core-operation/1`、事件 version `"1"` 与 Counter；这些是旧记录协议的 provenance，
不是本 baseline 的可写格式或恢复兼容承诺。HD 目标 envelope、operation/fact
版本及 decoder/fold 须与 DR 候选的实际采用格式另行闭合；在此之前不能凭旧
字节或旧 decoder 宣称新代 HD 已具备可写恢复。
sourcePosition 指耐久事实；本批关系沿 SR 的 `{kind:this_batch,stream,recordIndex}`，
不预猜 seq；未知版本/缺 fold 关闭入口，不恢复成空池。

| owner / 事件族（全部 /1） | 保存与合法转移 |
|---|---|
| human-decisions.request_created/commented/answered | 原 Request 或评论，或完整唯一 Decision+pending_delivery；answered 仅从 pending、按当前资格和精确修订转移 |
| human-decisions.request_closed / consequence_changed / decision_consumed | pending 的取消/取代或 answered 的后果关闭分别保存；approve 在 action_execution 中 consumedBy=原 CallRef，唯一消费；applied/failed/unknown 附原目标回执/原因 |
| 各 owner.operation_denied | 具名操作、目标、code、当前依据/水位，原 owner 关键拒绝审计；写失败为 audit_unavailable，不报已耐久拒绝 |

## 公开操作与当前资格

变更统一接 `{invocation,operationId,target,expectedRevision,...}`；invocation 是
治理 AuthenticatedInvocation 的私有凭据，不接受正文传主体。业务提交返回现有
AdmissionResult，receipt 内业务结果区分 published/proposed/waiting/admitted/
settled/stopping/denied；committed 不自动等于工具执行成功。内部候选过期为
prepare_again，用户 expected 冲突保存原条件结果；unknown 只查询原操作，不换键。
读取返回 `{value,watermark,availability}`，私有不存在与无权统一 inaccessible。

| HD 方法 | 实际消费面与错误 |
|---|---|
| list/get/subscribeRequests；pool.list/get | 同一原请求权威/当前可披露对象权限，池是索引；无权 tenant 不泄漏计数。Session owner 不是对所有资源均有授予权；不可达不离线代收 |
| answer | `{request,contentVersion,expectedRevision,response:approve|reject|comment,comment?}`；当前真实作答者须符合 AU 缺口每项的合法 grantor 和源工作资格，整个 Action 的缺口均能合法授予，不能代设备/账号专属同意。comment 不抢 outcome；其它自由文本 invalid_answer |
| closeRequest | 源 TL 的具名取代/失效/控制，或当前有明确关闭资格的用户；不修改已存在 Decision，不授予后续重试。管理员治理关闭不包含代答或正文权限 |
| readConsequence | 按获准范围显示 pending_delivery、消费/关闭/approved_but_not_admitted 及来源水位；后果失败不要求用户重复回答 |

Session 与池将同样的 operation/RequestRef 交同一 HD.answer；第一个合法决定
在 logical 根即封闭竞争，必须耐久才使继续权可用。第二个不同决定返回已决定的
当前结果，原 operation 重放返回原回执；同键异输入仍冲突。每次读/答/订阅投递
重新核对认证、TG 成员、SR 对象、资源 grantor 当前事实，scope 可见不代授权。
read 不拥有 outcome 更改权，单次 stop 不拥有批量 Session 设置写权。
answer 的源工作检查不要求活体 Agent、active DriverClaim 或 AR WorkPermit：等待
事实由长期 owner 认回。hold 允许获准答复保存局部 ready，但仍阻止取 claim；
cancel/强停/已随工具取消的 system_approval 则返回原关闭事实，不复活请求。
用户 closeRequest 复用 SR 的该调用控制资格并走 TL 停止/执行前取消联合路径，
不能只关闭 HD 行而遗留 SR 等待；治理关闭有独立具名资格，仍不获得代答权。
confirm 下持久 grant 已足时 missing 可以为空，仍须 AU 的当前合法 grantor 规则；
空缺口清单不表示所有同租户成员都可答复。

## 答复与后果交接

所有 prepare 在门外返回原 owner 私有冻结候选/记录/publication/依据 stamp；
check 在同一 GateFrame 只重检当前根，返回 ready/prepare_again/具名失败。
下面方法不让消费者直接 append，也不把 TS brand 或一份 Action 当真实性证明。

| 消费方定义的端口 / 实际提供者 | 必需数据与职责 |
|---|---|
| HD prepareSystemRequest/checkSystemRequest / HD | `{call,action,continuationId,sourceStep,missing,grantorRule,sourceOperation}`，加 AU ask/源 TL 私有候选；仅 system_approval，同原调用/Action 的重复创建认回原 request。创建等待不 reserve 执行预算 |
| HD prepareDecisionFacts/checkDecisionFacts、prepareConsume/checkConsume / HD | 向 AU 给治理已固定的 DecisionFacts；向 TL 给原耐久 approve/完整 Action/缺口/资格依据、expected request/outcome、unconsumed/private 候选；消费事件只有本次 action_execution 能提交 |
| HD SystemApprovalSource / TL 实现 | prepareSource/checkSource 核验原 call/Action/等待/全 Run 控制；prepareAnswerConsequence/checkAnswerConsequence 给 approve 的 SR adjudicate ready，或 reject 的 TL 执行前终态+SR 原结果 ready；prepareClose/checkClose 给原等待/批准后果的关闭片段 |

SystemApprovalSource、DecisionFacts 注册只给装配指定的双端管理能力。源失联显示
unreachable；TL ask 为 human_decisions_unavailable，不把通知/持久 DTO 当活资格。

**T-R2：HD answer 与后果交付不需要 active DriverClaim 或 AR WorkPermit。**
answer 末门核原 request/Action/CallRef/continuation、当前认证/TG/AU 完整授予
资格、TL 源当前控制与 SR 接收资格/原等待；不会伪造已经 yield 的 claim。批准
消费发生在 TL 的下一次 adjudicate，由 TL/SR 核当前 active adjudicate claim；
HD prepareConsume 只验证原唯一未消费 approve 及本次完整 Action/CallRef。
comment 不改变继续权。fullRun control 是 SR 组合者的精确原列表/当前控制资格，
HD 贡献关闭片段时也不要求在途 driver claim。原 epoch 和当前接收代次分别核对。

HD 是 answer_consequence 的唯一组合者，门外准备 HD/TL/SR 记录和私有根，
coordinator.prepare 整个 RecordBatch；最后门同步检查所有来源/当前权限/去重，
一次 submit、多 owner 各一份 publication。门内无 await；不另建事务协调器。

| 原路径 | 必须同批成立 |
|---|---|
| answer approve | HD answered/唯一 outcome/pending_delivery + SR 同一 adjudicate ready，answer_consequence 一批；不发许可/不 reserve、不写 grant。目标源当前不可达则拒绝本次提交，不离线代收 |
| answer reject | HD answered/后果 + TL denied_before_execution 终态 + SR 同一 consume_result ready，answer_consequence 一批；只有该调用结束，q2 保持原 pending |

TL 的 ask 创建 request、waiting 和 SR yield 以及批准消费/预算/工具准入关系，
由 TL 设计（legacy source: `../../tools/tools/design.md#一个实际-batch-中的裁决`）维护；原请求不得
先展示后落盘。准备过期重准备；unknown 只查原 operation，committed+blocked
保留原回执。尚未真实交付的 source/共同门不能由 DTO 或 mock 抵扣。

原 call 单次 stop/fullRun 关闭由 TL/SR 提交精确范围，HD 给 request_closed 或
answered 的 consequence closed，保留原答案。q1 ready 不等待 q2 回答，hold
只阻止取得执行 claim；结果/强停/late fact 依 SR 原控制语义，不将局部 ready
当全 Run 解锁。请求/消费与后果水位持久恢复，失去 Agent/客户端不取消请求；
维护 cursor/来源改变由 TL 具名 reconciliation 驱动，不做自动答案或业务总线。

### 暂行与专属资格的边界

资格登记需由对应领域提供 `{contract:ResourceRef,version,executionProvider,
stagingProtocol,forbiddenEffects,revokeProtocol,dependencyRegistration,feedbackPolicy,
verificationEvidence}`，并由其真实 owner 同门提供 current/revoke 检查；完全撤销
与补偿不能互换。这里固定 HD-10–12 的输入义务，不实现暂行产物或 DAG 服务。
本批没有合格领域提供者，不能接受“已注册”的自报 Boolean；任何 provisional
声明/登记请求为 unavailable(provisional_contract_unavailable)，且不作为普通 ask
发布。specialized_consent 同理，普通 HD.answer 不铸造专属资格；这些仍属排除项。

## Cordis 映射与撤除责任

| 导出 plugin / service key | inject、Context/Fiber/effect 归属 |
|---|---|
| HD HumanDecisionStatePlugin / `omneHumanDecisionState` | inject `omneAdmission`,`omneDiagnostics`；受信 options 指定原 createHumanDecisionHost，恢复就绪后提供受限运行面。宿主 sibling Fiber 独立于 Agent/客户端/模型；请求/决定/交付权威与恢复根归原 host |
| HD HumanDecisionsPlugin / `omneHumanDecisions` | inject `omneHumanDecisionState`,`omneTenant`,`omneSession`,`omneIdentity`；公开读答/池归此代；作答还必须具备下行链接的当前授予资格，缺席只关闭答复并显示 unknown/unreachable，不能清掉 durable request |
| HD HumanDecisionAuthorityLinkPlugin / 不新增 service | inject `omneHumanDecisions`,`omneAuthorization`；连接 HD 当前 grantor/缺口资格及向 AU 注册 DecisionFacts；撤回先封闭本代 answer/消费检查，已有答案/剩余后果保留 |

createHumanDecisionHost 通过受信 options 获取唯一 coordinator、diagnostics、
真实 reader/恢复水位；prepare 只用 omneAdmission，reader 不在普通 service。
请求权威不随 facade Fiber 销毁。应用持有恢复/关闭/精确 link 管理能力，仅把
具名双端注册权交 Authority/Approval link；HD 不定义另一组 P2 服务或宿主装配。
ToolApprovalLinkPlugin 由 TL 提供，其装载/撤回映射见 TL 设计（legacy source: `../../tools/tools/design.md#cordis-映射与撤除责任`）。

每次挂载保存原 host/generation/revision、单调 closed、canonical Fiber 和
实际必需 provider/link 挂载。稳定宿主的 internal/status 观察在同门关闭原
挂载；**answer/consume/source check 在最后门仍直接同步核对原操作代次和全部
捕获 Fiber 的 ACTIVE 状态**，不依赖 effect 已执行。HD 答复必须具备当前
Identity/TG/SR/AU/Authority link 和 TL source/Approval link；无 Agent 不是这些
来源失联。重复 apply 建新代，旧 request 可恢复，旧方法/准备/注册能力不复活。
固定官方状态变更先于通知、disposer 延后和 traced proxy 处理的依据见
TL 的 T-R1 映射（legacy source: `../../tools/tools/design.md#当前代次的最后门内检查`）及共用机制证据；
本包实现自己的 closeMount/closeLink，不引入通用生命周期权限框架。

装载完整恢复后才 provide，held 双端注册需双方及 link ACTIVE 才可用；部分
准备失败/晚到结果归原 HD 尝试。卸载撤本代 facade、池订阅及事实注册，已经
保存的请求/唯一答案/待交付和消费责任留 host，不回滚期间其它合法操作。
计划退出先关新答复/消费，再收口或具名移交；突失 final check 即刻关闭新操作，
effect 仅回收本代资源。已准入工作与未交付后果仍由原 owner 保有；清理失败
requestClose/inspectExit 维持 retained，不能从 dispose resolved 推导完成。
D04/D05/D08/D10 的真实双入口/重启/撤权/q1q2/迟到结果仍待产品执行。
