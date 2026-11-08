# @omne-harness/governance-local 行为规格

## 范围与依据

本包实现 [治理贡献契约](../governance-contract/SPEC.md) 的本地持久提供者。领域职责和同提交要求归 [动态治理贡献](../../assets/docs/governance-contributions.md)。根入口提供迁移和 SQL 材料、Identity 与 Settings 目的解析器、普通应用服务工厂及当前权限依据读取。受信装配提供真实发布、当前事实和原动作资格，组合测试不替代完整消费者验收。

## 结果与不变量

### GL-01 单一关系拥有者

`governance.activation` 拥有全部 `gc_*` 表。迁移不建立指向 Settings、Assets 或 Identity 私表的外键，不读取这些领域的表。声明、注册、当前采用和操作回执在同一租户物理写域。

### GL-02 独立身份

声明唯一键为 owner、definition、version，不包含 digest。原操作键包含 scope、command owner、principal 和 operationId，不包含 epoch 或 generation。注册租约独立于声明，同声明可有多个租约。Schema 的唯一约束只守护本地一致性；声明来源和跨租户不可变性仍由定义权威核验，不由数据库表声称提供。

### GL-03 精确目标支持

每条支持记录绑定 scope、registration、definition、epoch 和 target。关系外键拒绝错误声明、错误 epoch 和不存在的成员。多个注册可以共同支持同一目标，多个相容声明也可选择同一目标。相容性由业务参与者判断。

撤除时只删除该注册的支持，选中目标等于当前支持关系的投影。投影的完整性属于单事务写者义务；外键并不能单独保证两者相等。

### GL-04 操作状态

accepted 保存原输入、受理 epoch 和原 SQL 身份，execution 为空。submitted 要求完整执行信封。committed 同时保存执行信封和原结果；aborted 保存终止结果，允许在形成执行信封前终止。pending 不得携带最终结果。持久状态形状不代替状态转换或身份资格校验。

### GL-05 有界读取

当前贡献通过 scope、epoch、state 索引访问。目标支持按 scope、epoch、definition、target 定位。恢复按 GL-10 的业务、身份及来源责任部分索引做 keyset 分页。声明历史不得成为当前目录的无条件全表输入。数据库规模测试的查询计划不构成端到端延迟保证。

## 所有权、失败与生命周期

`governanceSqlMigrations()` 返回固定模块、文件摘要和先决条件，不启动数据库或 Worker。装配者负责把材料加入真实 SqlStorage 组合并声明表拥有者；迁移执行和回滚归 SqlStorage。文件读取失败直接抛出，不返回假迁移。

关系使用 STRICT 和 WITHOUT ROWID。修订上界与公开契约一致。数据库不开放客户端任意 SQL。应用服务核验当前主体、声明来源、预算和原结果，生命周期协调执行精确撤除及重装围栏。来源权威和当前事实由受信装配提供。`./cordis` 的贡献服务与关闭义务见 GL-23；当前权限依据由普通工厂提供。

## 组合与验证

[关系测试](tests/schema.spec.ts) 检查约束、支持边、磁盘重开及历史数据下的查询计划。[材料测试](tests/materials.spec.ts) 将实际迁移交给真实 SQLite Worker，并重开同一域。该测试的 mutation participant 是具名夹具，只用于证明安装和保管，不证明业务服务。

[目标支持模型](../../human-intervention/human-intervention/verification/models/GovernanceTargetSupport.tla) 及其 [证明范围](../../human-intervention/human-intervention/verification/README.md#按租约保留目标支持) 定义集合不变量。真实当前事实、跨域消费者和完整独立验收仍须交付。公开入口、原操作恢复、Identity及Cordis生命周期已有组合验证。

### GL-06 原操作和租约事务

私有操作写者接受已核验主体的原命令，不承担主体认证。accepted 记录保存固定 SQL 身份和请求摘要；同原键不同业务内容或事务域拒绝。submitted 后固定执行内容不可替换。封口只终止已受理原操作，缺记录保持 absent，不能据此发出未提交证明。

实际业务写入必须核对 submitted、原执行内容和当前开放 epoch。原终态先于当前 epoch 认回，重装不改写历史成功。已失效 epoch 的在途业务变成 aborted，不产生新租约。普通封口和迟到执行竞争同一原操作记录。

协调器命令和执行材料各自规范编码最多1 MiB。此处私有输入已是 SqlStorage 接受的 JSON；公开入口仍须在解析前核对原传输字节和嵌套预算。

贡献登记同时保存定义副本、项、租约、声明修订和原结果。每份声明合计最多128项，规范编码最多256 KiB；每 scope 最多128个当前租约和1024个不同在线声明项。在途 accepted/submitted 最多32个，已有原操作认回不再消耗容量。发布者的摘要保持原值，本包只用自己的规范摘要作内部绑定。

精确撤除同时删除该租约的目标支持、退出成员、清理无支持的采用投影、推进声明与采用修订并保存原结果。重复释放不重复推进修订。不同 registrar 或 generation 不可撤除。原注册结果保留，不被后续退出改写；公开contribute的当前观察单独读取租约状态。

根入口导出材料、普通工厂与Identity目的解析器，Cordis子入口提供生命周期装配。生产发布权威仍待接通；execution.authority 只保管协调器材料，其 JSON 形状本身不授予权限。内部目录捕获与关闭协调按 GL-18/19 实现；普通组合与Cordis生命周期分别按GL-20/23实现，完整跨域消费者尚待接通。

### GL-07 原发布比较

私有 `resolveDefinition` 消费公共来源端口。它在第一次异步等待前复制并固定已解析的请求正文，只按 ownerId、definitionId、version 读取原发布。来源返回错误身份、非法声明或异常时返回 unavailable。来源返回合法声明但完整 reference 或正文不同，返回 definition conflict。相同摘要不能掩盖不同正文。

成功值使用来源的隔离副本，后续修改请求或来源对象不能改变本次比较结果。原发布摘要保持原值；本包不以内部 SHA-256 替换它。来源声明继续受256 KiB及合计128项限制。该消费函数不写数据库，也不认证来源装配者。

该机制的真实性依赖装配注入原发布权威及该权威遵守不可变版本规则。当前只有具名来源夹具测试；具名功能producer及Assets完整发布适配仍待接线，公共应用协调器已消费来源协议。

### GL-08 完整采用事务

私有采用写者读取当前 scope/epoch 的全部 active 租约。命令的 complete 必须恰好覆盖其精确引用。重复、遗漏、多项、旧 generation 或其他 scope 均拒绝。每个租约可以不选择目标，但整个 bundle 仍进入采用，不能只发布 Settings 或只发布 Permissions。

collection.digest 覆盖 scope、声明修订及按规范 JSON 文本排序的完整租约/DefinitionRef/目标集合。输入顺序不改变该集合摘要；重复项仍非法。写者同时核对两个预期修订与 collection 的 scope/声明修订。GovernanceBasis 的 declarationSetDigest 保存声明集合摘要，adoptionRevision 单独表示采用变化。

采用消费当前事务的具名目标和关口投影，核对原操作完整绑定、事务域与 epoch。每个目标必须 enabled，origin 和完整 Settings 定义必须与声明相同。所有声明关口必须匹配当前实现、动作和解释映射。相同 Settings 身份的不同来源或不同定义、相同权限身份的不同定义、相同关口的不同映射拒绝整份采用。投影是受信参与者的输入，不是客户端许可。

所有检查先于关系替换。成功在同一事务替换成员、逐租约目标支持、选中定义和选中目标，推进采用修订并保存原回执。失败保留旧选择。两个请求持相同采用修订，至多一个成功；原操作重传先认回已提交结果。重装后的采用清理旧 epoch 的选中投影，不删除历史贡献、配值或原回执。

累计目标支持最多128条。候选读取最多129条当前索引记录，按去重定义的正文总字节检查2 MiB预算，再逐定义主键读取。当前投影材料也最多2 MiB；关口条数上界由128个租约、每份最多128个关口推出，不把单份声明上限误当整个scope上限。主体真实性、投影真实性和共同提交装配仍须后续生产提供者兑现。

### GL-09 身份保留与精确恢复

身份保留路径先受理原操作，再持久化完整 Standing 请求，之后才调用 Identity。请求固定原操作、主体、租户、目的地址、事务域、请求摘要和资格集合。原操作标识包含命令族和完整 scope，不只采用调用方 operationId。目的地址或资格集合改变时拒绝替换。资格由受信政策提供，Governance 不自行解释组织角色。

保管状态为 requested、held、settled，存于原操作的 held_json。held 回执必须匹配完整原请求和确定的 reservationId。该 ID 只用于绑定，不证明回执来自 Identity。真实来源必须由受信协调器保证。迟到回执可以保管，但不能复活原操作，也不能把 settled 降回 held。

身份保留路径的业务入口先认回原终态，再要求 held，最后调用同事务业务写者。缺少 held 返回 unavailable，保留待处理原操作。业务提交和目的端封口竞争同一原操作，先提交者确定原终态。开始结算本身不表示业务已取消；Identity 只有取得确定终态才能释放保留。

恢复入口消费 Identity 的受信目的路由，核对固定目的地址、事务域、版本化恢复引用及完整原请求。记录缺失或错绑返回 unavailable，不能作为释放依据。封口只终止同一个原操作，已有 committed 或 aborted 则返回该原终态。本地记录 settled 时必须已有相同终态。

上述事务入口由 GL-14 的私有服务协调。真实 Identity、SqlStorage 和 SQLite 组合验证生产恢复适配器；受信装配必须在Identity启动前注册目的解析器，Cordis入口按GL-23组合。

### GL-10 恢复集合

可信恢复读取包含三类原操作：业务仍为 accepted/submitted、原操作仍保管 requested/held 身份请求，或权限读取仍保管 requested/held 设置来源请求。业务终态不表示外部保留已经结算，终态未结算记录不得遗漏。无保留或已 settled 的历史终态不进入恢复集合。

业务和身份责任使用 gc_operation_recovery，设置来源责任使用 gc_permission_source_pending。索引成员随对应事务更新。只读处理器在同一读事务内分别读取最多65个候选，按 SQLite BINARY 的 UTF-8 顺序去重归并，交回最多64项及后继游标。它只交回完整原键、摘要及受理 epoch，不读取业务正文、执行信封或完整回执。游标绑定同一 scope，按命令族、主体和原 operationId 排序。

分页不是跨页冻结快照。并发新增或重新进入恢复集合的记录可能排在旧游标之前，恢复者须在一轮结束后从头进行后续扫描。枚举只给出待处理候选，不证明业务未提交，不授予重试权限，也不证明外部保留已经释放。

### GL-11 固定计划依赖

生产 SQL 材料保留一个 governance.activation 写者。该写者固定要求 governance.plan/1。元数据、贡献变更和采用使用各自的只读计划参与者，同一组合只能选择其中一个 PLAN 生产者。组合登记包含某参与者，不表示它会执行；调用写者时必须同时调用其所需的计划参与者。

元数据计划只承接初始化、原操作受理、保管、提交信封和封口，不产生业务变更计划。贡献变更计划只承接 contribute/withdraw，采用计划只承接 adopt。业务计划从持久原操作取得原 epoch 和事务域。写者核对完整请求摘要及原记录，再调用已有身份保留业务入口，保持业务、修订和终态同提交。

采用计划只能从同次 SQL 的 ADOPTION_CURRENT fact 取得当前证据。调用方请求不得携带证据替代该 fact。证据规范编码最多2 MiB，解析前后内容必须相同；Schema 的文本修整不能掩盖来源正文变化。完整绑定及目标语义继续由采用写者检查。

已有原终态先认回，不重复执行业务。元数据组合不依赖目标当前事实，封口不因目标提供者缺失而失去执行路径。SQL 依赖缺失、计划错绑或非法计划导致拒绝或回滚，不能伪装成已保存的业务终态。

这些材料是提供者内部接缝。原 SQL 阶段保管、Standing 协调及公开入口分别履行持久化、资格与应用准入责任。PLAN 不替代真实发布来源及当前事实拥有者的证明。

### GL-12 原 SQL 请求保管

原操作的每个阶段至多保存一份完整 CommitRequestV2。阶段限定为 standing-prepare、standing-held、submit、apply、seal、standing-seal、standing-settled。主键包含完整 scope、命令族、主体、原 operationId 和阶段，外键指向原操作。不得以新组合版本或新命令替换已有请求，即使 SqlStorage 的输入摘要相同也须比较完整正文。

apply 采用原业务 SQL 身份。其他阶段采用 governance.meta 加固定阶段名，operationKey 仍由完整原操作计算。SqlStorage 的 inputDigestV2 不包含完整 SQL identity，故身份和输入摘要分别核对。首次保存核对原操作及请求摘要、事务域、组合绑定、对应 planner 和唯一 writer。元数据阶段只允许 metadata-plan 与 writer 两条命令，并核对其原绑定或精确 Standing 恢复请求。apply 可以包含当前事实生产者，不能混入另一个治理 planner。

每份请求最多4 MiB和128条命令，不允许重复 participant。解析前后正文必须相同。阶段读取按主键取一行，重新核对正文、原身份、输入摘要和命令绑定。阶段保管值不嵌入 Execution，避免完整请求递归包含自身。新增迁移不改写原关系迁移或恢复索引迁移。

生产业务写者先认回原终态，再要求已保存的 apply 请求和匹配的 Execution。缺少请求时回滚，不执行业务。保存请求本身不把操作推进到 submitted 或 committed，也不改变身份资格。业务终止后仍允许保管迟到的身份回执及其结算阶段，不能因此复活业务。

公开协调器必须先确认保存成功，再读取和发送该完整请求。回包丢失时查询同一 SQL identity，或原样重送；核对回执的完整身份和 inputDigest。阶段表存在不证明调用者实际发送了相同请求，此项仍是公开协调器的履约责任。旧组合材料不可用时保留恢复责任，不得采用新材料重建旧请求。bootstrap 和首次 accept 尚无原操作外键，其固定身份及未知回包处理归启动和受理协议，不伪造阶段行。

持久写者、只读材料和业务前置守护由公开工厂组合。装配须为保存请求及读回设置足够的 SqlStorage 输入、输出预算；存储拒绝不能作为保存成功。该机制不宣称解决首次受理前的未知提交或缺失旧组合材料的问题。

### GL-13 SQL 协调与当前观察

SqlOperationCoordinator 是提供者内部对象，注入 SqlStorage、固定租户写域和元数据组合。它不验证 Access，不发行资格，不调用定义来源，也不作为第二套公开治理服务导出。公共入口须先履行 GC-01 等准入承诺，再消费该对象。

受理前固定输入，点查完整原操作及当前 Standing 保管。已有原操作返回当前观察，异业务摘要冲突；不因新 epoch 或新组合重做已受理工作。原记录不存在时查询固定 governance.meta.accept 身份。unknown 保持未知；只有存储提供的 not_committed 才允许发送本次初始受理请求。rolled_back 不改用另一个身份重跑。

生产受理回执包含完整规范受理输入和受理结果，失败结果也保留其原输入。这样才能在换 epoch 或 metadata 配置后核验原拒绝；同业务认回原失败，异业务仍冲突。回执中的 accepted 是历史观察。确认受理成功后再次点查当前原操作，不能把旧回执覆盖到已提交或已封口的状态。并发受理发生在首次点查之后时，协调器可从原受理回执的完整原请求、原 epoch 和原组合核验其输入摘要，再点查当前记录。成功回执存在但原记录缺失时返回不可用，不重建该记录。

阶段保存使用 governance.custody 加固定阶段名，键绑定完整原操作。重复保存须比较整份请求。保存确认后点查保管结果，不能把旧元数据回复当成当前值。executeControl 使用已保存阶段的原组合构造比较依据，同阶段改参冲突；未保存阶段使用当前配置。发送只使用已确认读回的完整请求，固定阶段之间的等待不由随机键建立。requestKey 的随机值仅用于只读相关标记，不是持久身份。

每份 SQL 回执须分别匹配完整 identity、inputDigest、combinationVersion 和 manifestDigest。成功回执必须有且仅有一个治理写者的 participated 回复。提交回包未知时只查询同一身份；适配器异常仍保留未知结果。明确的存储回滚与领域 aborted 不相同。not_committed 原样携带存储提供的证明，不自行构造，也不直接授予 Identity 保留释放。

方法在一次调用中执行有限步骤，不无限轮询。调用方可以沿相同原身份继续恢复。原请求的单赋值允许复用刚取得的持久读回值发送，不必为同一不可变值再次查询。业务 writer 的原终态与当前性检查仍在提交时执行。

该内部路径已有真实 Worker 的受理、并发观察、阶段保存、重开、丢失回包和错回执检查。GL-14的私有协调器将Identity reserve/settle接入此对象。公共准入、目录与Cordis生命周期已有组合验证，真实发行与当前事实仍待接通。不能据此宣称公开服务或完整 C3b 已验收。


### GL-14 Standing 服务协调

提供者内部的 Standing 协调器必须先通过 SQL 阶段保管完整原请求，再调用受信 Identity。原调用的主体由 Identity 验证，恢复结算只使用持久 StandingRequest，不换主体或重新取得资格。reserve 被 denied/blocked 时保留 requested，交调用者决定重试或结束原操作；拒绝不是结算证明。

Identity 的 held 或 terminal 回复必须匹配完整原请求与确定身份。协调器只保管匹配回复，持久成功后重新读取当前保管状态。历史回复不得让 settled 退回 held。原操作已经终态时不再新发 reserve，按原请求结算或认回已有结算。SQL未知与Identity不可用分别保留其拥有者，不声称源预留不存在。

恢复目的适配器注入固定路由及 SQL 协调器，不反向依赖 Identity。它核对规范恢复引用及原主体、租户、摘要、目的地址和事务域，再读取不可变原请求并比较完整绑定、资格集合和确定身份，之后才进入原 standing-seal 固定写阶段。SQL即使回滚也可能保存失败回执，故不能用阶段行缺失作为允许错误输入先尝试的依据。最终事务内的完整核对仍须保留。只有 SQL 写者返回且匹配完整请求的终态可交给 Identity。不存在请求或错误路由不能作为释放依据。

这些对象仍是提供者内部实现。它们不替代公开命令准入、当前政策、来源发行、恢复路由注册或 Cordis 生命周期装配。

### GL-15 公开入口的身份准入

本地提供者消费受信装配固定的有限委托关系。每项绑定完整 principalRef、scope、一个应用 action 和所需 Identity qualification。登记关系另外绑定每个 ownerId 允许使用的完整 EnforcementBinding 集合。匹配必须保留 owner 与关口的关系，不能将两组白名单交叉组合。每个 scope/principal/action 只能有一项，重复配置拒绝。空配置默认拒绝，没有通配符或从客户端接收委托关系的入口。

准入先固定调用输入并核验 Identity 主体。Access tenant、主体 tenant、本地存储 tenant 和 scope tenant 必须一致。租户可见性必须指向该 tenant，组织可见性必须指向其组织。public publisherRef 必须在精确受信 scope 委托中出现。原主体引用不能代替真实 verifier。每次读取当前成员与资格，缺项拒绝，Identity 无法判断时返回 unavailable。

登记准入比较同一冻结声明的 owner 和完整关口集合，随后来源核验仍必须确认同一份声明的真实发布。身份、委托范围、来源真实性是独立条件。来源核验不能补发登记权，Identity 的设置管理资格不能隐式授予治理登记权。目录管理读、运行读、原操作查询、贡献、退出和采用分别授予，不从一个动作推出其他动作。

构造参数及调用输入在异步等待前隔离，返回值不可暴露内部委托集合。委托在实例期间不可变，扩大范围须由受信装配按 GC-08 换代；已有范围内的动态发布不要求换代。该本地构造能力不等于终端用户授权，也不是跨进程身份凭证。

准入是一次当前读取，不能证明后续提交仍有资格。写路径必须将同一委托所需资格交给 GL-14 的 Standing 保留，继续执行同提交 epoch、原登记归属、来源及当前目标检查。旧原结果披露亦先核验相应动作，但成功的历史事实不要求旧发行插件在线。

### GL-16 贡献与退出命令组合

应用入口在首次异步等待前固定完整命令及 Access 的主体和租户引用。有限结构、字节、当前准入及完整原操作绑定先于业务执行；声明解析不能改变规范正文。已有终态先认回，不要求旧来源仍在线。首次准备贡献时必须通过 GC-03 的完整来源验证，退出仍由 SQL 核验精确租约与原 registrar。

来源或准备失败后重新观察原操作。已确认的 operation conflict 优先于来源失败；原操作观察不可用或已受理但未终结时返回 unknown。只有明确缺失原记录时才返回原准备失败。Standing 对原保留的明确拒绝仍可返回 denied 或 basis conflict，并保留待决原操作的恢复责任；不得在再观察之前将其与来源失败混为同一结果。已确认的原终态优先于两者。

应用入口只在首次执行准备时产生 authority，绑定已核主体、scope、资格、完整声明摘要及原发布引用。它不消费调用方自报 authority。已保存 submit 阶段或已提交到 operation.execution 的内容是恢复依据；重试不得用新组合、manifest 或来源回复替换。原 scope epoch 已变化的待决操作只可封口并结算，不以新主体重演。

Standing 请求先保管后获取。业务提交先确认 submit 的持久 execution，再保存完整 apply 信封，只发送保存的请求。每次不明确结果均保留原操作 unknown；SQL 回滚不等于业务 aborted。已确认终态的业务结果不因源结算暂不可用而改写，未结算责任继续由持久恢复记录承担。纯 sealed 的命令结果为 basis conflict，查询原操作时仍须提供实际未提交证明或封口引用。

贡献重传返回原 ContributionRef 及当前逻辑 state。状态点读核验完整租约、主体及 scope；当前 epoch 不匹配则投影 released。历史成功回执不变。点读只访问本域 scope 与 contribution 的主键，最多两行业务记录；未知与无权租约统一 denied。

内部停止受理只关闭应用入口，不等于完整提供者关闭。停止后不开始新受理；已经保存的待决操作在下一可观察边界走 seal/settle。GC-08 的持久 scope 围栏、精确贡献撤除及资源排空仍由完整生命周期装配承担，不能用入口 promise 已结束替代该证明。


### GL-17 采用命令与原操作查询

采用命令复用登记、退出的身份准入、Standing 和原请求保管路径。装配者注入固定的当前事实命令工厂，工厂只接受完整操作绑定、原 epoch 和采用命令；它不接收客户端证据。首次 apply 保存整份 SQL 请求，后续恢复使用已保存请求，不重新调用工厂。已有终态先认回，因此发行或当前事实提供者离线不改变历史结果。实际当前事实仍须由同事务拥有者产生。

queryOperation 每次核验 operation-read 资格，只访问已核主体自己的完整原键。查询不推进、封口或结算原操作。committed.original 保留提交时结果，与 contribute 重传返回当前租约状态的职责不同。accepted/submitted 返回 pending，持久 aborted 返回具名封口引用。领域记录缺失时须取得 SqlStorage 的五项未提交证明并再核对原记录；没有有效证明则返回 unknown。查询证明引用标明 sql-proof，不能被消费者当成持久关闭操作或新的执行许可。

### GL-18 精确 scope 关闭

关闭事务核对完整 scope 与当前 epoch。旧实例的关闭不能改变后继 epoch。当前实例在同一事务退出本 epoch 的贡献与选择关系、封口尚未终结的原操作并关闭 scope。已提交原回执和 Identity 保管记录不改写，Settings 值和权限不由本事务删除。修订达到上界时仍必须关闭，关闭状态本身拒绝后续业务。

本地生命周期协调在开放回执之后重新观察当前 scope，防止旧开放回执掩盖已经关闭的状态。关闭恢复按既有索引每页至多64项，只封口、结算自身 epoch 的记录。每页返回后继位置和未结算数；一页完成不表示整个提供者已排空。关闭协调同步停止新调用，然后依次等待持久隔离、已接收调用和恢复分页。单次恢复有页数预算，后继位置跨重试保留；发现未结算责任时必须从首页再核对。超时或依赖失败返回 pending，旧引用保持关闭，未完成的关闭任务不会重复启动。只有隔离、调用排空和完整恢复扫描均确认后才返回 closed。共享 SQL 与 Identity 仍由装配拥有者关闭。调用方清理控制由GL-22定义，Cordis适配由GL-23定义。

### GL-19 目录捕获与分页

内部目录捕获在同一 SQL 事务读取当前 scope、贡献和采用关系，并消费装配方提供的完整当前事实。管理目录可以列出尚未采用的贡献及禁用目标；运行目录只列出实际采用且当前可用的贡献。相同定义的未采用兄弟租约不能借另一个租约进入运行结果。selectedTargets 只表示真实采用关系，不把管理查询匹配的目标伪装成已采用。

每页核验独立的目录披露动作。游标绑定 scope、主体、模式、目标集合、epoch、声明和采用修订及实际目标与关口见证。新 capture 身份不进入跨页基准。任何绑定变化使旧游标失效。分页按定义键递增，每页最多100项、1MiB；单项超过预算返回 limited，不能跳过该项。来源不全返回 partial 和 unavailableOwners，不能返回完整空结果。返回回执核验原 SQL 身份、输入摘要、组合、manifest，以及页面 scope 和 epoch。

目录在私有 internal.capture 原操作中保管完整请求及准入主体。该命名空间不进入公开三命令协议。受理后保存 Standing 计划并取得真实 held，再保存原 execution 和 apply 信封。只读目录参与者生成同事务计划，唯一治理写者核对原操作、held、scope/epoch 和原信封后保存 page/failure 终态；不能给目录第二份业务写权，也不能借目录改变采用集合。

返回页面前必须确认原终态并完成资格结算。未知回包或结算失败对外 unavailable，持久恢复索引继续保管责任。恢复和关闭识别 internal.capture，晚到请求在原操作已封口时不能再次捕获。普通工厂提供目录及历史恢复；Cordis生命周期由GL-23提供。真实发行和当前关口事实仍由应用组合交付，不由调用者自报。

### GL-20 普通工厂与启动恢复

createGovernanceLocal 每次构造产生不可复用的新 epoch，调用者不能指定旧代。装配须保证同一 scope 只有一个合法启动者。工厂读取当前 epoch，再以该 epoch 为比较依据开放新代。普通业务调用不能重新开放 scope。

启动恢复与当前调用使用不同代次。每页在同一 domain-serial 读取中取得 currentEpoch 及每条候选的 acceptedEpoch；最多读取一行 scope 和两组各65行候选。只有 currentEpoch 等于本实例 epoch 时，启动恢复才处理该页。它跳过本代记录，并在封口前核对原操作键、请求摘要及 acceptedEpoch。后继实例产生的记录不能进入已经读回的旧页，后续页面须重新核对 currentEpoch。游标始终取最后扫描项，不能改成最后处理项。

发送封口后必须重新观察原操作的持久终态，再结算资格。没有 Standing 请求只表示没有该项资格责任，不证明原操作已终结。封口未知且原操作仍待决时，恢复继续报告未完成，不公开服务。

历史恢复完成整轮且没有未结算责任后，工厂再次核对本代仍开放，才返回 created 和应用服务。依赖不可用、页数预算耗尽或被继任实例替换时返回 unavailable，不公开服务。失败不会删除持久待恢复责任，后续构造可继续恢复。旧实例关闭仍能处理自己的代次，不以当前 scope 属于自己为结算前提。

五个应用方法共用 GovernanceProviderLifetime。进入方法时先登记在途责任，再同步进入应用层的输入捕获，不能把输入捕获推迟到下一个微任务。同步异常仍通过该调用的 Promise 拒绝并退出在途集合。close 同步停受理，不以调用已返回替代持久隔离或资格结算。

createGovernanceLocalDestination 可在 Identity 装配之前构造。它只消费固定 SQL 域、元数据组合和目的标识，提供已有 StandingDestinationResolver 协议，不授予 Identity 治理命令权限。普通工厂借用这些依赖，不负责销毁它们。

### GL-21 精确生命周期撤除与退出额度

内部 retire-contribution 命令只接受已有原贡献操作的完整绑定，不作为公开业务命令。协调器先点查原操作及摘要，再发送固定身份的元数据请求，防止 absent 或异摘要结果占用合法清理身份。命令不重新申请 Identity 业务资格，也不重新查询声明来源。此能力只能由受信提供者使用。

写者对待决原操作封口。对已提交原操作，写者从原命令及原身份导出完整租约，再复用精确撤除逻辑。该事务不修改原 committed 回执，不撤除兄弟租约。旧代或已经关闭的 scope 只确认原贡献失去当前效力，不修改后继实例。retired 只证明治理事务内的封口或撤除，调用协调仍须确认原 Standing 结算及在途资源排空，才能报告生命周期 closed。

每个 scope 至多128个 active 租约。最大修订为 Number.MAX_SAFE_INTEGER−1，新增贡献和采用要求两个修订都严格小于该上限减128。最后一次允许的新发布最多到达该阈值，给全部在线租约保留128次精确退出。每次真实退出各消耗一次修订并减少一个租约；重复退出不消耗修订，在最大修订上仍返回 already-released。

该保证从满足预留规则的状态开始成立。旧实现或损坏数据若已耗尽退出额度，真实退出返回 revision limit，不饱和伪装新修订、不撤除兄弟、不报告清理完成。整体 scope 关闭仍按 GL-18 处理，不作为单个调用方退出的替代品。


### GL-22 调用方贡献的清理责任

内部贡献控制器在首次异步等待前登记调用方清理承担者。每次调用有独立的 registrar 入口闸门。准入核验主体和 scope 后，registrar 从捕获的命令导出完整原绑定，再交给控制器。此绑定只确定清理归属，不证明来源有效或业务成功。未获准调用不能加入已有责任，异摘要调用不能撤除原租约。

相同完整绑定的调用共享一个幂等清理组。任一已附着调用方关闭，便同步关闭组内全部入口；不以引用计数延长原租约。其他原操作的入口保持独立。单次关闭超时返回 pending，提供者继续持有责任并按有界批次重试。每组最多一项在途清理，悬挂组不占用其他组的重试机会。

缺失原记录时，必须先确认组内调用均已返回，再查询原 accept 的 SQL 身份。只有权威证明未提交且不在队列中，才能完成清理。业务 apply 未提交不足以证明 accept 不会晚到。已有原记录按 GL-21 撤除或封口，再确认原持久终态和 Standing 结算。清理期间有新调用附着，必须重新核对该组，不能沿用较早的排空判断。

等待本地调用返回时，控制器由调用完成事件唤醒，不持续查询悬挂的声明来源。提供者关闭同时关闭普通入口及所有调用方入口，最后汇合 scope 恢复与贡献排空；任何一项待决都不报告 closed。共享 SQL 和 Identity 仍归外部装配拥有。控制器通过私有运行时供Cordis适配器消费，公共普通工厂不暴露内部清理权柄。


### GL-23 Cordis装配与待决关闭

Cordis插件只注入storage、principalVerifier、tenantStanding和standingReservations。其余来源与组合由受信配置提供。插件先登记提供者清理责任，再启动普通运行时；启动恢复完成后才构造唯一服务实现。显式卸载后的晚到启动不能发布服务。依赖变更期间的旧服务不能越过内核激活边界。

contribute使用追踪后的调用方ctx登记清理。已失效ctx的INACTIVE_EFFECT映射为unavailable，其他异常保留。插件卸载关闭运行时入口，并调用同一幂等关闭任务。待决或异常后由后台驱动继续重试；一个任务尚未返回时不得另起同一关闭。只有运行时确认隔离、原责任结算和调用排空后才通知closed。

配置的observeClose接收首次pending及最终closed。通知不构成业务确认，也不阻塞清理；观察失败只形成诊断。框架dispose完成不等于业务closed。受信装配须保持借用依赖可用，直至业务关闭确认；异常停机后的责任由已有持久恢复处理。

### 采用集合的公开编码

createGovernanceCollection是本后端的公开引用构造器。输入完整成员仅用于计算collection，不改变adopt命令的形状。摘要对象包含scope、declarationRevision和complete。每个成员包含contribution、definition及selectedTargets；definition是完整GovernanceDefinitionRef。先按各目标的规范JSON文本排序selectedTargets，再按成员的规范JSON文本排序complete，对整个对象取RFC8785规范JSON的UTF-8字节，计算SHA-256小写十六进制摘要。重复项不由构造器静默删除，实际adopt仍拒绝重复或不完整集合。

该构造器不访问存储、不取得资格、不选择当前版本，也不返回允许。它让独立应用无需导入本包私有采用算法即可构造公开协议输入。未来其他后端必须遵守相同wire编码；当前仅提供local实现辅助。

### GL-24 Transaction-local target projection

The optional `governance.target-projection` material reads Governance-owned relations for one exact scope, epoch, definition and target. `governanceTargetProjectionCommand` binds the principal, capture and transaction domain as well. The complete output repeats this binding.

Management mode requires an active contribution of the exact immutable definition. Runtime mode additionally requires the exact target in that epoch's adopted selection. A missing or closed scope, old epoch, missing declaration, mismatched full definition reference, absent selection or exceeded body budget returns a named unavailable observation. Invalid input or corrupt canonical bytes fails the transaction.

The projection uses the existing scope key, current-contribution index, immutable-definition key and selected-target primary key. It checks the body size before loading the immutable declaration and reads at most one row per lookup. It does not scan historical operations or copy adoption state into another table.

This material observes Governance state only. It does not establish the caller's authority, the target owner's current enablement or publication, Settings assignments, external constraints, interpreter presence or a future execution permit. A trusted composition must obtain those owners' facts with the same capture binding. A serialized earlier observation cannot substitute for a fresh read in a later operation.

The local guarantee assumes the existing single-writer adoption/retirement invariants and SqlStorage transaction ordering. No remote retention protocol or cross-database atomicity follows from this read.


### GL-25 权限读取的来源保管

内部 capture 的 catalog 与 permission 命令是两个独立变体。旧 catalog 命令不增加默认字段，不改变原摘要。permission 命令保管原动作的 PermissionBasisRequest、独立 qualification 观察信封、完整 SettingsTarget、组织来源计划和恢复路由。每次 current 读取使用新的 capture operationId；同一次读取的恢复保持原身份。

接受带来源的 permission 命令时，唯一治理写者在同一事务建立 gc_operation 和 gc_permission_source 关联行。关联行的完整主键及外键绑定原操作。SQL NULL 回执表示 requested；明确 source=null 的命令不产生该责任。缺失关联行是损坏，不能解释为无来源。

来源请求仅由原命令、完整原操作绑定、主体和 SQL 域派生。回执必须通过 Settings 公共协议校验，并与该请求精确匹配。held 重传必须保留同一 snapshot；原操作终结后到达的 held 只能用于清理，不能复活原操作。settled 必须对应原 committed 或 aborted 终态。尚未收到 held 的 requested 也可以在原操作 aborted 后认回合法的 aborted 来源回执。

source-held 和 source-settled 分别保管完整 SQL 阶段信封。只读认回声明所需 Governance 表及迁移，不通过额外写权读取。来源已 settled 后，迟到 held 返回既有终态，不降级保管状态。来源责任从恢复集合退出，只证明本项责任已结算，不替代其他身份或业务责任。

来源协调器只消费 Settings 的 reserve/settle 公共端口。首次 reserve 前必须观察同一 capture 的 Identity held。Settings 回执经公共 schema 校验并精确匹配原 request，才可保管；拒绝保持原含义，异常或错绑返回 unavailable。保存后重新观察当前保管状态，不能把旧 SQL 重传的 held 回包当作最新状态。

createGovernanceLocalSourceDestination 可在运行时启动前用固定 SQL 域、元数据组合和 sourceRoute 构造。recognize 只承认完整匹配的已保存请求；seal 只封口该原操作并观察其持久终态。恢复不依赖原客户端在线，也不重新构造业务主体。

普通工厂可借用 sourceReservations。未装配来源服务只适用于没有来源责任的使用范围；已有 requested 或 held 责任不得因此消失。启动恢复及关闭必须分别结算 Identity 和 Settings 来源，任一责任待决时均不得报告恢复完成。Governance 不关闭借用的来源服务。来源端主动恢复可先封口原操作，Governance 随后仍须保管相同终态回执。

该保管机制本身不产生 PermissionCurrentBasis，也不授予业务动作权限。当前结果的写入见 GL-26。生产消费者及历史装配恢复仍须完成，不能以本节协议组合验证替代完整提供者验收。性质与证据范围见[来源保管证明](verification/proofs/permission-capture-custody.md)。

### GL-26 受保护的当前权限读取

普通工厂的 permissionBasis 遵循 Permissions 的读取协议。未配置受信解析器与当前事实组合时返回 unavailable。读取context由装配定义，可以携带原动作定位。入口先解析请求，经principalOf取得真实主体，再独立核验主体、租户、组织、部署与服务范围。resolve取得同次已核验主体、请求与原context，认回拥有者事实并核对披露资格和完整动作绑定。context的形状、摘要和请求回显都不能作为资格证明。Governance不解释Agent或Tool原生模型，也不将context写入SQL封套；恢复继续使用原持久命令及结果。

resolve 必须给出 qualification，包含具名 owner、protocol 与严格 JSON observation。该字段独立于 Settings 来源；Governance 只保管和比较完整值，不解释外域动作，也不因信封存在而授予资格。原请求摘要覆盖它，后续请求、当前事实或恢复不得替换观察。

受信 project 端口接收原绑定、epoch、事务域及已固定 command，一次返回组合标识与当前事实命令。读取器在 await 前复制输入并解析输出快照，将选定组合固定到 execution 与原 SQL envelope。不同动作来源可使用同域已登记的不同具名组合，恢复只使用原 stage，不重跑 project 或重新取得 context。非法形状与未知组合不能返回成功。未固定的原上下文不写进封套。

每次合法读取创建独立 capture，复用原操作、同次 Identity 保留和来源保管。只读 permission-snapshot 消费带绑定的当前事实；唯一写者在同一事务核原 submitted execution、当前 epoch、事务域、目标、来源计划、完整 qualification 和 PermissionBasisRequest。无同次 Identity held 不保存 current。错绑定或非法求值材料使该写入失败，不能修正输入后冒充原读取。带 qualification 的当前事实与 snapshot 参加者采用协议 2。

组织配值只从原 capture 已保管的 held snapshot 取得。实际组织存在但没有来源计划或尚未取得快照时，该槽必须是 unavailable，不能信任输入的 absent。source 仍为 requested 时，写者保存 aborted 与局部 current，保留原来源责任；来源已 held 或明确不需要时保存 committed 与 current。业务终态、材料完整性与实际许可分开表达。

原事务已保存结果后，清理失败不改写结果。读取可返回包含已知禁止的局部 current，恢复继续结算原责任。seal 若先胜出，迟到 apply 只能认回原终态，不能添加 current。provider close 仍按 GL-25 结清双重责任。

current 不授予后续启动或写入许可。实际消费关口须重新读取或采用其拥有者的精确保留协议。Session 模式、AgentDefinition 约束和 HITL 决定不由本包解释；缺少对应拥有者事实不能解释成空约束。

### GL-27 外部拥有者写意图的保管

`internal.external-write` 是独立的内部原操作类型。治理保管外部拥有者的协议、目标引用、原命令摘要、完整 JSON 命令和结构化资格。外部拥有者解释命令与资格，治理不从 JSON 内容推导授权。受信装配必须先取得拥有者的资格，再受理原操作。

治理请求摘要覆盖完整封套，包括 scope、operationId、write、source 和 sourceRoute。原操作按既有复合主键认回；同一定位下替换任何材料均冲突。重启不改变原请求、摘要、SQL 身份和受理代次。普通贡献、采用和目录捕获的 planner 不处理此类写意图；受保护业务效果须由外部拥有者的专属组合完成。

需要 Settings 来源时，受理同时建立原来源责任。目的回调使用 `governance-external-write/1` 与完整原操作绑定。既有 capture 继续使用原协议，其持久请求不重写。认回必须匹配原路由与完整来源请求，seal 只终结原操作；尚未结算的 held 继续保留，不能将终结解释为清理已完成。

`governance-external-write-1` 原子扩展操作和来源关系的 owner 约束。迁移保留三张关系的原字段值，含原命令、资格、身份、执行材料、held、结果、完整 SQL 封套及摘要。迁移按外键依赖重建关系和既有索引，任何失败均回滚。迁移备份表不成为运行时查询来源。既有迁移及已持久摘要不变。

### GL-28 外部写意图的 SQL 封套

外部意图的 submitted execution 固定 `governance-external-write-execution/1` 材料。该材料绑定原 requestDigest、指定外域 writer 和全部外域 SQL commands。writer 必须位于唯一参加者集合中；该集合不得包含治理 basis、terminal、唯一写者或其他治理业务 planner。

保存 apply stage 时核对原 SQL 身份、binding、execution、组合版本与 manifest 摘要。最终封套必须精确包含原外域 commands 和三项治理协调命令。basis 与 terminal 必须携带相同的原 business request，治理写者必须携带该 request 的摘要。额外、重复、缺失或替换任何 facts 都使保存失败，不能静默修正。

首次保存后沿用原完整封套。即使重排 commands 后 SqlStorage 的 inputDigest 相同，也不能替换已保存的顺序。重启认回保持原封套和摘要。此规则保护受信适配器已经确定的执行计划，不验证外域命令与资格的业务含义，也不使尚未装配的组合具备执行能力。SqlStorage 仍负责验证组合材料及提交，外域拥有者仍负责解释命令，治理终态仍由唯一治理写者保存。

### GL-29 受信外域写协调出口

可选 externalWrites 装配发布 execute(context, intent)。读取与写入各自保留独立 context 类型。调用者只提交原业务意图；入口在首次等待前复制意图，核验原主体对象及装配租户。受信 resolver 取得业务资格和来源，返回拒绝或不可用时不受理。Governance 不解释外域命令，也不以请求回显代替拥有者的资格核验。

首次受理保存 qualification、source 和 required，原请求摘要覆盖全部材料。内部重试按租户、服务范围、主体和操作标识查找原记录，核对意图后采用原资格。prepare standing 的 required 必须等于原请求保存的资格集合，不得降低要求。公开贡献应用服务不因此获得内部操作查询入口。

只有 Identity standing held，且来源 held 或明确不需要来源，才能计划外域执行。submitted 以后采用原 execution 与完整封套，不因 resolver 或装配配置改变而替换。terminal 仅在观察到持久 committed 或 aborted 后返回原 binding、持久原操作的 sqlIdentity 和 JSON 结果。无法确认终态时返回 unavailable，不声称未受理或已回滚。

受信外域适配器可按 sqlIdentity 查询原业务回执，恢复具体业务失败。该身份不授予查询资格，不随重试或重装配改变。治理 sealed 不能替代业务的具体回滚原因；尚未提交业务或暂无法读取回执时，调用者不得重算或猜测原失败。

提供者关闭停止新受理和新 apply。已受理操作的封存及结算继续由原协调器保管。结算暂时失败不改变已经确认的业务终态；关闭及重装配必须完成原责任恢复。此协调出口不替代外域业务参加者的资格、同提交及语义校验。


### GL-30 外域效果与治理终态同提交

外域写组合必须在原 transactionDomain 内依次取得治理 basis、外域拥有者依据、业务结果和治理 terminal，最后由治理唯一写者保存终态。治理 basis 只接受仍为 submitted、原 scope/epoch 开放、execution 与原 apply stage 一致、Identity held 且来源 held 或 not-required 的操作。已封口的原操作不能向业务写者供应依据。

根入口导出的 basis/result SQL 事实协议使用 JSON 值。basis 携带原请求、代次、事务域、原命令和已保留来源快照。业务拥有者或其受信适配器验证完整实际业务 facts、原资格及当前领域约束。Governance 不解释外域命令，不读取外域私有表。

结果必须精确匹配原 binding、execution 摘要和指定 writer。terminal 只发布治理计划，治理唯一写者再次核对原状态及保管后写入 committed 或 aborted。持久结果使用具名 external-write-result 封套，即使业务 result 为 JSON null，也不能与未有终态混淆。业务结果语义及 aborted 对业务效果的要求归外域拥有者。

该组合中任一参加者停止，业务效果和本次治理终态一起回滚。事务外先前保存的受理及保管责任仍然存在，协调器按原操作封口与结算。按原 SQL 身份重试须认回同一回执；调用方丢失回执不授权再次产生效果。以上依赖 SqlStorage 的事务原子性、事实依赖排序和回执契约，不保证任意插件提供的资格或结果真实。

### GL-31 当前注册声明与 Settings 目标分离

当前声明事实不要求 Settings target。声明可包含不生成 Settings 投影的权限项。读取必须绑定完整 scope、epoch、原 principal/capture、事务域和精确定义引用，不借另一个声明的名称或局部标识匹配。

只有 scope 开放、epoch 相同，且存在该 scope/epoch 下该精确定义的 active contribution，才能返回完整声明及注册/采用修订。声明撤下后，新读取返回 unavailable/definition；scope 关闭或代次不符返回 unavailable/scope。超过读取大小预算返回 unavailable/limit，损坏的存储正文不得冒充合法声明。

本事实只证明当前注册声明。它不证明主体资格、运行时采用、资产持有、执行器存活或组织/租户无配值。原 target-projection 复用同一声明读取，并继续在 runtime 模式核对 selected target。Settings 原配值及外域适用约束仍由各自拥有者提供，不能从 settings=null 推导来源 absent。

SQL 消费组合必须核对该事实与原受保护请求的完整绑定，并在同一事务中消费。单独持有旧事实、captureId 或 principalRef 不授予写入权，也不构成以后操作的当前依据。


### GL-32 当前采用声明的事务事实

`governanceSelectedDefinitionCommand` 读取与 GL-31 相同绑定下的声明，并额外核对当前 scope/epoch 的 `gc_selected_definition`。未采用、已撤回、旧 epoch、关闭 scope 或缺失声明均为 unavailable。它以独立的 `governanceSelectedDefinitionFact` 输出，不能用仅证明注册的 GL-31 事实替代。

该事实不要求 Settings target，也不证明资产持有或执行资格。无配置权限的应用组合还须消费同事务的真实资产持有/选中发行事实、受信声明映射与执行支持、原 Agent/Tool/Session 守卫。只有具名组合已经证明当前声明没有 Settings 映射且无需配置来源时，组织/租户配置层才可记为不适用的 absent；实际应存在的配值来源缺失仍为 unavailable。无配置不得省略 Session 配值或 Agent 上界。

查询使用原 scope/definition 主键并核 epoch，随后复用有大小上限的当前声明读取；不扫描历史操作，不新增业务表。原回执认回和新调用捕获仍分别履约。
