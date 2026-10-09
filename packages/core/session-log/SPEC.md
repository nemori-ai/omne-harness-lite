# Session Log：可信装配借用

本页拥有 SessionLogBackingOperations、受权 SessionLogOwnerOperations、SourceToken、typed payload 与 SessionLogParticipant 的行为。
普通三操作遵循下述共同日志行为；参加端口不使普通append自动加入调用者事务。

## 固定日志坐标

SourceToken 是日志接口拥有的已提交范围坐标，闭合字段为 tenant、session、journalGeneration、tail。
其公开类型及表示校验由根入口维护。取得坐标或通过表示校验不授予读取、写入或提交权限。

SLT-1：tenant 和 session 沿现行 TenantId 和 SessionRef 身份规则。
journalGeneration 是存储拥有者给日志事实源分配的不透明身份，不是物理 ownerGeneration。
读取适配器的重载或缓存失效不能自行改变日志代际，也不能用当前物理 owner 代号替代日志代际。
projectionRuleVersion 由投影消费者单独携带，不属于日志坐标。

SLT-2：tail 是非负精确 JSON 整数，0 表示该代日志的空范围。
校验保留既有 JsonNumber 表示，不经 Number 转换。外部 JSON 文本须先经严格无损读取，
已在调用者处丢失的数字精度不能由本校验恢复。相等按精确整数值判断，不按数字的文本写法判断。

SLT-3：校验只接受闭合字段及合法 JSON 数据，返回独立不可变坐标。
拒绝缺字段、多余字段、访问器及非法嵌套值，不执行访问器或 toJSON。
tail 的无损数值只接受既有 LosslessNumber 自身，不接受能覆写 source 读取的自定义子类。
坐标相等须同时满足 tenant、session、journalGeneration 和 tail 相等。
同尾号、不同租户、会话或日志代际不能命中同一来源；坐标相等不证明该来源目前可用。

SourceToken、固定前缀读取、事务参加与事实判别已有 F0 实现；完整交付验收尚未完成。

## 消息与事实

SLP-1：显式日志封装的闭合字段为 owner、version、kind、value。kind=message 只接受 messages 拥有者的当前版本 9，并由 Message 公开校验器验证正文。messages 拥有者不接受 kind=fact，不得以该分支绕过 Message 校验。其他 kind=fact 的正文由具名拥有者按其版本验证。未知普通 JSON 保留为 other，不自动成为消息。已声明拥有者但封装非法时明确拒绝，不降级为 other。

SLP-2：事件属于事实。Session attempt 开始事实不属于 Message，不包装成 SystemReminderMessage。业务提醒由其消息拥有者明确创建；日志或投影不能凭事件类型自行创建提醒。持久事实的保留与待消费工作副本的移除分别由各能力承诺约束。

## 共同事务与固定前缀

SLP-3：SessionLogParticipant 绑定具体 AtomicStorage。appendIn 只接受该实例尚可用的 StorageUnit；在同一单元内核当前授权、Session 顺序、尝试栅栏与提交条件后暂存。staged 不是已受理或已提交，成功回执必须等外层提交。实例不符、失效 unit 或未取得必需来源时不得假成功。

SLP-4：可选 expectedSource 对比完整 tenant、session、journalGeneration、tail。坐标不匹配拒绝暂存，不能只比较尾号。普通去重命中不证明同键异正文相等；业务认回必须自行核原完整值。

SLP-5：source 返回当前受权日志的持久代际及已提交尾号。participant.readPrefix 返回所指定代际的固定完整范围 1..tail；后来追加不使该旧固定范围失效。缺位置、跨归属、代际不符或无法取得完整范围均不得返回部分成功。读取每次仍须核当前授权，固定坐标不是历史访问许可证。

SLP-6：外层提交未知时，参与者和业务调用者各保留自己的原批次与责任。观测到本地提交操作结束不证明远端事务停止。一次缺席不是未写证明；未知责任的释放沿 SLB-2/3，不能自行重新生成身份重发。

## 可信装配借用

SLB-1：backing 属于可信应用装配面。借用不携带物理关闭权，不授予用户或工具访问权。
受租户约束的入口必须另行完成当前授权；取得 Cordis Context 的可信插件处于此装配边界内。

SLB-2：release 开始即拒绝该借用的新 IO，包括通过缓存引用发起的调用。
成功必须等待已接纳 IO 和未知追加认回。认回须核验原批次的全部成员、顺序和内容；
一次缺席、新尾或另一追加的拒绝不证明原追加未写。

SLB-3：无法认回时 release 可以失败，但须保留借用责任和物理 owner，旧引用仍不能接纳新 IO。
后续 release 可以再次认回；并发重试不能撤销已成功释放的状态。
应用即使已撤除服务，也必须持有未完成清理的责任；不得仅因 fiber 不再可见而关闭物理 owner。

SLB-4：物理 owner 只有在所有借用和各直接使用者的责任都已排空后才能关闭。
backing 排空不替代直接使用者的未知写核验。release 不承诺有界完成：已有 IO 或核验读取
不返回时仍可能等待。无法确认旧进程停止时，冷恢复不得伪造退出证据。

SLB-5：ownerGeneration 标识物理 owner 的寿命。应用每次取得物理 owner 时建立一份 backing，
全部适配器和借用使用该 backing 的固定代号。重载适配器、撤除服务或认回未知写不得换代。
下一任物理 owner 使用新代号；持有旧代核验结果不授予向下一任追加的权利。
代号是身份值，不是授权或日志前缀完整性的证明。

SLO-1：enumerate 只接受本任 owner 私有维护令牌，返回完整持有范围，包括没有观察者
及尚无日志记录的会话。无法确认范围完整时返回 unavailable，不返回部分成功。
复制令牌或另一 owner 的令牌不授予权限。

SLO-2：readPrefix 和 borrow 可使用本任维护令牌，或持有 session.log.coordinate
权限的 SessionAccess。每次 IO 核验当前权限与持久持有租户；tool.read 权限不够。
借用固定租户、会话及 ownerGeneration，不得访问同租户的另一会话。
关闭、释放及撤权后，缓存引用不得接纳新的 IO。

SLO-3：readPrefix 只返回同一 ownerGeneration 下完整、有序、逐项解码的日志前缀及尾号。
按键片段、跨租户记录、缺失位置不能作为共同提交边界。未知写责任沿 SLB-2/3 保留。

SLO-4：维护令牌与普通访问令牌分离。维护权限只收尾已归属的责任；业务恢复写者
须依据完整前缀核验可恢复对象，不得创建新执行意图或新的 Run。低层日志借用不代替
这些业务核验。发布 runtime Ready 前，全部持有会话的恢复均须成功。

## 普通日志操作

- **L1 共同身份、只增与精确值**：每Session一本；已提交壳/载荷/位置不可改删，跨会话不可读写，位置从1起连续、同日志才可比，空尾0。run/attempt同在同缺，壳如实归写方；载荷保持合法严格JSON值，数无损，不规范化成不同值。判重键与readKeys逐码点精确、不解析；dedupe不自动成为readKey，写方若要按它读需显式同时放readKeys。未知普通JSON保持opaque/other；**SLP-1具名typed封装校验优先**，不能从“日志不校验业务载荷”恢复旁路。当前受权participant/owner每次核实际holding与资格，不能把“首条租户由写方填写”读成免核当前授权。
- **L2 append与出口**：表示→当前适用授权→tenantMismatch→attemptSuperseded→alreadyRecorded{keys}→tailChanged{tail}→整批成功；任一所需事实不可得或提交未确认是unavailable，不假定前项通过。empty批、批内不同tenant/重复dedupe、条目读取键重复、run/attempt不配对、fenced壳不匹配、非法JSON/附position、缺fence/condition等表示先拒。全批依原序取连续位置，同步可见/持久；判租户/栅栏/键/尾和写不可插入其他追加。已确定拒绝（invalidInput、tenantMismatch、attemptSuperseded、alreadyRecorded、tailChanged及适用授权拒绝）全零写；unavailable或提交未确认仍可能整批已写，沿L5保留未知责任。tailChanged不占键/分配位置/初始化日志租户，actual tail只是该判定点事实。tailEquals可合法大于actual tail后冲突，无隐式unconditional、不舍入。无键追加合法但不幂等，不为所有caller新增业务ID/必填dedupe。
- **L3 栅栏和判重**：dedupe看耐久已提交内容/同成败索引，非进程Set；任何撞键整批拒，keys只说明撞上的键存在，不证明旧完整内容等值。fenced只比较同Run已提交壳上的更大attempt，不验证该attempt已开始；先写尝试开始是其owner责任。结算是否unfenced及late归业务owner，日志不判。重启在同前缀同输入下判定不变，不交活状态。
- **L4 两个读面**：表示先拒，随后当前读取授权；readByKey返回含该readKey的**全部**条目升序+同一读取点真实tail；readSince返回after之后至同次tail的全部连续条目，after必填非负精确整数，after==tail或>tail均合法空结果并照实返回tail。不可读/缺片/中途失败unavailable，不交部分或假空。原窄口读从未追加日志可得空日志，但不免除当前SessionAccess资格；不能以空日志证明Session不存在。合法1..a原前缀可接连续a+1..tail，身份/来源/无缺号成立才算完整；按键片段不是完整前缀。
- **L5 未知与恢复**：unavailable/无回执可能全写或全不写，绝非半批；后来的tail/tenant/fence拒绝只证明后来调用，不能证明原调用零写。需业务唯一性的写方保留稳定原ID/完整批，权威认回所有原值；旧writer未实际停/隔离时一次缺席不关闭未知。tailChanged对本次合法调用确定零写，允许没有先前未知的caller合法重读重构，不改成强制有键重试。存在先前未知仍守其责任。条件消费者须由合法完整前缀解释业务并构完整批，尾比较不保护错误解释/未授权读/同批新增边界；无限争用不承诺无饥饿，显式策略耗尽保有未完成责任。
- **L6 持久边界与未闭**：成功后进程/提供者重启原批/位置不丢，后续读见成功批；本窄口没有归档封存政策，归档后合法追加/读不自行禁止。普通三操作不发业务事件。OS崩溃/断电耐久强度沿实际存储提供者声明，不能迁移时升级承诺。完整Session日志产品（额外壳、创建/封存/通知/投影/Run事实认法）、跨进程鉴别、新鲜度、跨写方键分配仍归其真实owner，不在此开发。


模型与实际验证义务见[verification](verification/README.md)。
