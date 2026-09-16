# 核心工作准入与耐久协调 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, composition.core-work-coordination, 1)`。正文从
legacy `composition.core-work-coordination@2` 重基，保留 CC-01～CC-07 及“同协调域内
发布的组合契约可声明原子关系”的当前规则。legacy CC v1 与 D-008/D-014 只作 provenance。

本组合拥有跨能力准入、原子接受/拒绝、提交后事实广播、跨域回执以及取消/补偿边界；
它不取得各业务状态权威，也不把通知、日志或多个独立写入称作共同提交。
personal creation 候选分支依赖同 baseline 的 [DR-01](../../../capabilities/durable-records/v1/contract.md)、
[TG-01/03](../../../capabilities/tenant-governance/v1/contract.md)、
[AI-01/02/02a/04/05/08](../../../capabilities/account-identity/v1/contract.md) 与
[ACR-03～06](../../account-registration/v1/contract.md)。两个受信入口共享一套创建提交机制，
但 Account 身份/凭据、Tenant claim/owner 与 Records 批次仍各有权威。

## 单机共同提交的实现约束

**CC-01**：首版业务协调域由一份明确的准入协调实现服务于本批核心权威，使用
同一有序提交通道，原子关系仅限本契约及同一协调域内发布的组合契约明确声明的
组合。本契约声明：输入/取批与 Run、动作/批准消费与执行许可、等待与决定后果、
预算预留与调用受理、媒体引用与内容受理。Legacy
`composition.session-run-agent-lifecycles@1` 的 LC-04 曾声明 Session 与 Run 之间的同提交行；
新 baseline 尚无该 lifecycle 坐标，因此它当前不是本契约依赖，也不构成新谱系同提交保证。
是否以及如何承接该行须经 S+L joint review；relation
`s-lifecycle-lc04-joint-review-freeze` 的 freeze gate 在此之前机械阻断 release。

这不把权威合成一个业务服务，也不要求将知识、
制品或外部账单纳入统一事件模型。实现可以将多个 typed stream 的一批记录放进同一
JSONL 提交，不能先写多个文件再声称它们已原子成立。能力拆为远程提供者后仍须实现
相同协议或发布新契约。

**CC-02**：准备读取、参数解析、外部资格查询和资源取得均在短提交之外完成，
每项带精确版本、所有者和撤销关系。共同提交验证当前身份权限、对象修订、绑定、
工作 epoch、预算和操作去重，按确定顺序裁决；状态 owner 的纯检查不运行任意
插件回调。权限变更、工具失效和执行准入参与同一撤销屏障；不能先独立询问几个
isValid，再在它们可能变化之后写入"已准入"。

**CC-03**：耐久 I/O 与 D-007 的短运行提交明确分开。可先在短提交内为已准备的
操作分配有序位置并封闭冲突状态，再异步持久化该位置。**分配位置即该操作的
逻辑准入点**，并非等待 fsync 后再作第二次同义准入；当时必须通过全部当前
资格检查，取得精确使用并扣住预算。结果对外显示 pending_durability，在该
位置及全部依赖记录形成耐久前缀前，不确认 committed，不产生受控效果。
尚未持久的授权增加或人类答案不可支持准入；同批预算预留可与调用一起提交。

撤权／撤除在同一短门获得位置时，立即封闭之后的位置；位置 n 的调用先准入、
撤权占 n+1 时，n 在耐久确认后仍可执行，因它已在撤权前准入。若要阻止 n，
必须使用精确取消／执行权撤销；不得将普通撤权重解释为强停。授权增加仅在其
耐久确认后可用。仅异步准备而尚未获得逻辑位置的操作不算准入。

Tenant personal creation 使用同一逻辑排位、提交、lookup 与恢复机制。受信装配只
提供两种封闭来源。两者都须先由 Account 权威耐久确认不复用的 `UserRef`、唯一
凭据绑定、原操作/摘要、personal target 与 AI-02a 的一次创建源后果，再按 CC-05
受信导入目标协调域。首次 `deployment_init` 在此基础上额外核 Tenant 尚未建立的
权威前态、受信 seed 与独占部署初始化资格；后续 `account_registration` 核普通
注册入口政策。来源事实的稳定身份、原操作、摘要、`UserRef`、target 与一次授权
必须逐项匹配。seed 文本、Tenant 自分配的 `UserRef`、旧 session、客户端
`UserRef`/`origin`/`owner`/`operationKind` 字符串均不能授予资格；较早 pending 分配或
凭据碰撞也不构成来源后果。
Account 注册入口关闭、logout、pending 后来变 active、provider 暂时失联或换代不撤销
已成立的耐久授权；首版没有取消注册或关闭账号后撤销未排位创建的操作。若未来
增加撤销，须另定跨 owner 排位顺序与屏障，不能追溯改写已准入位置。

两种来源均在原操作首次逻辑排位前冻结输入和 target。已存在同 operation/input 的
占位或耐久结果先认回原 target/status，不重跑首次前态；有可核实占位或耐久 outcome
时同键异输入冲突。首次新排位的短门只读已耐久导入的来源事实和 Tenant/Admission
当前 roots，执行纯检查：两者的精确来源授权和唯一 claim，以及 init 的未初始化/
受信 seed/部署资格，或 registration 的普通注册来源，
同 `UserRef`/target 的目标 head，并核对当前 host/owner/writer generations。
不得在门内等待 Account provider I/O、使用 TTL 缓存或把未耐久交付当成授权；
未导入、来源未核实或无法证明同代根时，新操作 unavailable/unknown。门内成功才
颁发 `capability.durable-records@1` DR-01 的单次封闭混合写资格：registration
恰为 personal-index system 与目标 tenant 二流；init 另含 bootstrap system 三流。
绑定原操作、摘要、来源、`UserRef`、target、精确流集合/expected revisions 和
Admission/Tenant/writer 代际，不能复用于别的输入、流、代际或 commit。

逻辑占位只封闭 user/target/初始化竞争，不能当作新成员、账号激活或管理资格。
claim、personal tenant、creator 和唯一有效 owner 须在同一 durable 批次成立；
完整耐久前缀及 owner publication 可消费后才有创建回执。写入 unknown 不释放占位；
暂时 `not_seen` 不证明未提交。只有旧 writer 的完整前缀被核实、原操作确实未提交，
且占位安全解除，才能沿同一原操作/摘要/target 重备。释放后不得虚构旧输入仍有
durable conflict。历史 committed 结果只证明创建发生；租户 closing/closed 时同操作
仍认回历史结果，但当前业务资格由 Tenant 再核。首版不开放同 `UserRef` 的另一新
个人创建操作；未来是否允许须另定政策。

写入失败使受影响协调域待核实，未确认位置不能执行，后续位置不能越过缺口。
崩溃恢复在独占 writer 下解释连续、完整、校验有效的 envelope 前缀，包括
崩溃前没有返回回执的完整批次；重新同步确认后，lookupOperation 返回该原批次
committed。可证明尾部仅有不完整批次并已安全截回时，原操作才可返回未提交；
完整损坏或无法确认截回时保持 unknown，不假定没发生。完整有效但未曾回应
的记录可能成立，调用者须接受此未知收敛语义。恢复后实际 attempt 是否已开始
仍另行核实。实现须给出内存状态、水位、失效封闭与恢复映射，不持锁等待 I/O。

**CC-04**：纯粹在内存检查后先执行再异步补授权／调用日志不符合协议。实际
提供者开始前持有已耐久关联的精确 attempt 和受约束执行许可；许可与撤权有
确定准入先后。授权撤回只影响尚未准入动作；已准入动作后续停止归显式控制。
远端身份/许可必须由其权威保证可用到准入点；无法形成等价撤销屏障时返回
unavailable，不能把 TTL 缓存当作"当前授权"。

## 跨能力后果交付与恢复

**CC-05**：不能共同提交的交接使用具体耐久意图：源提交原始事实及待交付后果，
目标用该事实的稳定身份接纳并返回可查询回执，源确认后更新交付状态。响应丢失
查原目标操作；目标拒绝、失联、待重试和已接纳分别可见。源不因发送了通知便
丢弃责任；目标不能从重复通知生成第二份 Run／工具／决定。此协议只保证事实
交付与去重，不保证任意外部副作用恰好发生一次。

Account→Tenant personal creation 的两个来源后果均按 AI-02a 由 Account 在凭据唯一
绑定、稳定 `UserRef`、原 operation/摘要和 personal target 均耐久后一次发出，稳定 source fact
identity 绑定上述字段与 schema/version。受信 CC 接收者在门外向 Account 权威核验
来源、版本、签发权与完整绑定，然后以 source fact identity 在目标协调域耐久导入；
重复交付返回同一接纳结果，错字段/错版本拒绝，响应丢失按原 identity 查接纳结果。
导入事实只是 Account 授权的不可变投影，不是第二个 Account 权威或账号 active 证明。
未核实或未耐久导入时 Tenant 新排位不可用；已导入后 Account 暂时不可达不抹去
该授权，账号 active 仍须 Account 自身后续耐久确认。旧接收者、Admission/host
或 writer generation 不得拿历史导入事实直接写入新代；新代须经 CC-06 完整基线
安装后在当前根中核验它。源与目标两次提交没有跨协调域原子性，pending/unknown
时 Account 交付方与注册协调者保留查询、重试和可观察责任。

**CC-06**：恢复读取 Session、队列、Run、请求、调用、预算、媒体引用和装配意图
的已提交事实，核对格式/契约、定义/实现版本、环境能力和当前权限，再取得新的
运行 epoch。旧运行对象不反序列化。未开始工作可从其合法位置继续；可能已发出
的模型/工具请求先按原 attempt 查询或重新关联，无法核实标 unknown，不自动重发。
明确 cancelled／deleted／superseded 的工作不因恢复、迟到答复或提供者重现复活。

writer 已提交而 owner durable publication 未完整安装时，原 operation 是
`committed_blocked(owner_publication_required)`：它既不是 pending，也不是未提交。
该状态封闭协调域的新效果和 committed broadcast，并保留原 operation、receipt、result、
批次身份、占位与资源责任。普通重试或局部 owner 回调不能把它改成 ready。

恢复发布只能由受信恢复宿主完成。宿主须在同一 `coordinationDomain` 的已核实完整耐久
前缀和一个精确 watermark 上，验证全部批次的跨 owner 关系，按 canonical envelope 顺序
重建该协调域所需的**全部** owner durable roots，并把基线绑定到 domain、watermark、
owner generation 集、恢复 host generation 与新取得的 writer epoch。owner 缺失、部分安装、
关系不一致、前缀未核实或旧 generation 确认均 fail closed。各 owner 的 fold 与候选根校验
在门外完成；最终只在一个短门中一次切换完整 owner roots 与协调者消费水位，不能靠依次
调用可单独发布的 owner 回调来模拟原子安装。外部不能观察或使用部分基线。

重新开放前，恢复宿主还须按原 claim 核实并处置旧 `ExactUse` 与资源责任；未结算、无法
证明可释放或仍可能承载外部效果的责任继续阻断开放。只有完整基线已安装、遗留责任已收口，
且新 writer/epoch 已取得后，协调域才可开放。恢复不逐 operation 重放 publication 回调，
不重提事实，也不重放外部效果。

原 operation 的历史 completion 始终保留 `publication=blocked`。新 generation 的受信 lookup
可在精确恢复基线覆盖其 position 后，另行报告该原 committed 结果已可消费，并返回基线引用；
这不是改写历史 completion，也不产生第二份 operation/receipt/result。可消费 publication 只
允许工作进入 CC-06 的当前资格、关联、墓碑与 attempt 核实流程；它不证明旧 attempt 未开始，
也不直接授予执行许可。

**CC-07**：工程关联包含 operation、commit、水位、tenant、可信主体、Session/
Run/Step/attempt、定义与实现版本、环境及阶段；关键成功/拒绝/未知与控制事实
随所属提交保存，诊断事件可以有界采样但必须显式报告缺口。内容与秘密分别裁剪，
财务汇总不授予正文权限。通知与缓存故障不改变源状态，对外读面显示真实水位
与可达性；需要关键记录却无法保存时阻止新的相关效果。
