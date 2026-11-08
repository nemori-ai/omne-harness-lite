# 权限读取的来源保管不变量

本论证覆盖 [GL-25](../../SPEC.md#gl-25-权限读取的来源保管) 的持久关系和状态转换。它是源码对应的归纳论证，不是新的机器证明，也不证明实际权限来源或 Agent/Tool 准入已经接通。

## 前提与状态

SqlStorage 将一个拥有者事务的写入原子提交，未提交写入回滚。Settings 来源回执来自受信装配，遵守其公共协议。Governance 是相关表的唯一写者。读取使用同一事务快照。摘要比较以规范编码与哈希不碰撞为前提。

设原操作键为 K，完整命令为 Q，摘要为 H(Q)。原操作状态 O 属于 accepted、submitted、committed、aborted。只有 committed 和 aborted 是终态。

带来源命令的保管状态 C 属于 requested、held(R,S)、settled(R,T)。R 是来源请求，S 是不可变来源快照，T 是 committed 或 aborted。无来源命令没有关联行。函数 R=f(K,Q,SQLDomain) 只依赖已保存的原身份和命令。客户端回执不提供新的计划。

## 不变量与归纳步骤

1. **原请求绑定**。每份已保存回执的 request 等于 f 的结果。接受事务先保存 Q 和 requested 关联行；held/settled 写入均比较完整 request。读回再次核验公共回执 schema、reservationId 和原绑定。因此修改 route、principal、domain、source、attempt 或摘要不能替换原责任。
2. **终态一致**。C=settled(R,T) 蕴含 O=T。唯一 settled 写入先读取原操作并检查该等式；原操作终态不可改变，故后续转换继续保持该性质。损坏行在读回时抛错，不能静默恢复成有效状态。
3. **不复活**。settled 没有返回 requested 或 held 的转换。相同 settled 重传认回；相同请求的迟到 held 只返回既有 settled。晚到 held 可以在 O=aborted 时保存，但来源保管函数不写 O，因此不会复活业务。
4. **快照不替换**。held(R,S) 再收到 held(R,S') 时，只接受 S'=S。公共 schema 验证快照所属 source；完整回执比较阻止同一个保留身份换入另一份材料。
5. **恢复不遗漏**。恢复集合是待决业务、未结算 Identity 和未结算来源三个集合的并集。来源关联行从接受事务起即进入部分索引，仅 settled 回执使它退出。O 进入终态不删除该行，因此来源责任仍可扫描。

不存在已保存 held 的 requested 可以在 O=aborted 后认回合法 settled/aborted。这处理请求尚未到达源或回执丢失的情况，不允许把 not-found 自行解释成 settled。

## 跨域协调与关闭

令 I 表示原操作的 Identity 责任，S 表示 Settings 实际来源保留。首次调用来源 reserve 要求 I=held。目的 recognize 仅返回与已保存 R 完全相等的请求；来源回执的 R 经二次校验后才进入 C。因此跨域返回不能改写原计划。

Settings 完成结算不自动更新 C。回包丢失时 C 仍为 requested 或 held，恢复集合继续包含它。重传相同 R 可读回来源终态，然后以原 source-settled 阶段保存；来源终态与原 O 不同则写者拒绝。该步骤保留终态一致和恢复不遗漏。

关闭判据为 I∈{settled,unplanned} 且 C∈{settled,not-required}。任一来源服务缺失、失败或回复不合法均不能满足判据。启动历史恢复采用同一结算函数。这里证明的是完成声明的必要条件，不保证故障服务一定恢复，也不保证有限时间内关闭。

## 原组合缺失时的保管

令 E(K,s) 为原操作 K 的已保存阶段 s 封套，M 为当前元数据组合。阶段单赋值要求重复保存只接受相同 E。公开协调器发送前读回 E，并直接向 SqlStorage 提交它；M 只用于尚未保存的元数据阶段，不能重建 E。因此更换 M 不改变原请求的身份、组合摘要或命令。

原业务材料不可用时，存储拒绝不能产生业务终态，协调器也不以该拒绝删除 E 或来源保管。原操作仍在恢复集合中。材料恢复后发送 E，原身份与输入摘要使重复发送认回同一回执。这项条件论证依赖阶段保管和 SqlStorage 身份协议，不保证缺失材料最终可用。[SQL 阶段测试](../../tests/sql-stage.spec.ts)以真实 Worker 和不同元数据组合验证该机制。

## 有界归并

两条 SQL 查询分别按相同的完整键顺序取 n+1 个候选。归并比较使用 UTF-8 字节序，与 SQLite BINARY 一致。去重之后取前 n 个。

若任一分支还有未读取候选，则该分支已经返回 n+1 个不同键，归并后的集合至少有 n+1 个键。因此交回的后继游标不会遗漏继续分页的需要。若归并后不超过 n 项，则两个分支均已读尽本次快照中的剩余候选。分页跨事务发生的新记录仍需下一轮从头扫描，不能据此声称全局冻结。

每页 n≤64，最多读一行 scope 加两组各65行候选。来源分支通过完整主键连接原操作。查询计划测试检查两个分支均使用部分索引，没有历史全表扫描或临时排序树。该结论不是吞吐或延迟基准。

## 当前结果与来源完整性的分离

令 L 是同一 SQL 事务中拥有者提供的本地当前材料，I 是原读取的 Identity 保管状态，B 表示 L 与原请求、epoch、事务域和目标精确绑定。当前结果写入要求 I=held、B 成立且纯求值材料合法。该条件不从客户端回显推导。

在这些前提下，写者按 C 的状态总化来源选择。C=held(R,S) 时，只从 S 提取组织槽；C=requested 时，组织槽为 unavailable，保存 O=aborted 与 current；无来源计划但原组织存在时，组织槽仍为 unavailable。来源完整时可保存 O=committed。两种终态都不等于业务许可。

该转换不改变 R 或 C，因此保持原请求绑定和恢复不遗漏。后续 settled 仍要求终态等于 O。若另一事务先将 O 置为终态，submittedOperation 先返回该原状态，不再执行当前结果写入，故 seal 与 current 竞争不能覆盖先完成的结果。

本地 Settings 观察失败时只发布该槽的 unavailable，不提交旧配值或空配值。组合保留其他拥有者已确认的禁止。evaluatePermission 在缺源判定前处理已知禁止，所以局部不可用不会把已知禁止变成许可或吞掉它。该论证以事实生产者的绑定、资格和真实性为前提，不证明任意插件可信。

本节是源码对应的结构性论证，不是新的机器证明。原事务的错 epoch/domain/target/source/binding、同次 Identity 和 seal 次序由 permission-operation.spec.ts 验证；真实组织快照、租户提交、声明撤下及局部失败由 harness-server 的 permission-native-current.spec.ts 验证。后者原动作资格仍为具名适配夹具，不证明 Agent 端到端。

## 验证映射与未覆盖范围

- [来源保管测试](../../tests/permission-capture-custody.spec.ts) 覆盖重开、封口后仍可恢复、错绑、提前结算、快照替换、迟到回执和无来源计划。
- [生产 SQL 协调测试](../../tests/sql-coordinator.spec.ts) 覆盖来源阶段保存、授权读取、发送与重传。
- [迁移测试](../../tests/permission-capture-migration.spec.ts) 检查旧行字节、旧阶段、主外键和新增阶段。实际 Worker 安装由 [材料测试](../../tests/materials.spec.ts) 覆盖。
- [关闭测试](../../tests/scope-lifecycle.spec.ts) 检查身份已结算但来源未结算时仍报告 pending。
- [恢复测试](../../tests/recovery-read.spec.ts) 检查有限页、去重责任、历史数据下的查询计划。

- [来源协调测试](../../tests/source-coordinator.spec.ts) 组合真实 Identity、Settings 和 Governance，覆盖来源回包及 SQL 确认丢失、重开、错绑、拒绝和来源主动恢复。
- [目的路由测试](../../tests/source-destination.spec.ts) 覆盖原请求认回、错绑定拒绝与封口终态观察。
- [来源生命周期测试](../../tests/source-lifecycle.spec.ts) 覆盖缺少服务的启动拒绝、恢复结算、关闭及借用服务所有权。

未证明的部分包括旧装配摘要下的 pending envelope 重放、来源协调器的活性、任意外部故障、进程强杀、完整权限求值及准入消费者。迁移保留字节不能替代这些验证。

## 外部拥有者写意图的保管投影

GL-27 只增加原命令的一个标记变体，不增加上述 O 或 C 的状态。令 Q 包含外部 owner、protocol、targetRef、commandDigest、command、qualification、source 和 sourceRoute。原请求绑定仍比较 H(Q)，来源请求仍由已保存的 Q 与 K 派生。区别是 f 按原操作类型选择目的回调协议；完整 request 比较仍包含这个协议。因此不能把 capture 的来源回执当作 external-write 的回执，或用新资格替换原资格。

新迁移逐字段复制原 Q、H(Q)、O、C 和原 SQL 封套，不解析再序列化这些值。以迁移事务原子性、原关系约束成立及无外部写者为前提，升级前后上述抽象状态相同。升级任一阶段失败则回滚到原状态。`external-write-migration.spec.ts` 验证字节相等、外键保持和子表恢复失败回滚；真实 Worker 用例验证原操作重试及进程重启后的认回。

这个投影不证明资格真实有效，也不证明外部业务写入与治理终态同提交。前者依赖受信接入，后者依赖外部拥有者专属组合；普通 mutation planner 拒绝此类操作。

## 外部执行封套不替换

令 E 为原 submitted execution，X 为 E.authority.commands，B 为原 business request。X 的参加者唯一，且与治理协调集合 G 不交叠。G 恰好包含 basis(B)、terminal(B) 和 activation(H(B))。GL-28 在原 SQL 身份与 E 匹配的前提下，要求最终封套的参加者映射等于 X ∪ G。因此替换任何外域 fact、协调绑定或遗漏与新增参加者，均不能通过此相等关系。

保存第一份封套 P 后，后续保存仅在完整规范值等于 P 时认回。虽然 SQL inputDigest 对参加者顺序可能归一化，该保存比较不归一化数组顺序，故相同 inputDigest 不能授权换入另一份封套。事务回滚不建立 stage；进程重启只读回原 P。该论证沿用规范编码及哈希不碰撞前提，不证明 E 的业务资格，也不证明该组合执行成功。

## 受信写入口与恢复闭合

GL-29 将原请求扩展为 Q=(意图, qualification, required, source, route)。执行入口先复制意图，再核验真实主体对象和装配租户。仅在受信 resolver 交回资格后受理 Q。由受理不替换规则，已存在原操作只能继续采用同一个 Q；重试不调用 resolver 生成替代资格。prepare standing 要求 required=Q.required，read standing 也从 Q.required 重建预期请求。因此即使低层调用者传入空资格集合，也不能在同一原操作下得到较弱保留。

设 P 为已保存 execution，I 为 standing 状态，C 为来源状态。调用外域 plan 的前提是 I=held 且 C∈{held,not-required}。submitted 之后仅从 P 生成 apply 封套，不再调用 plan。由 GL-28，后续提交无法替换 P 的任一外域 fact。这个结论以受信 plan 正确解释业务协议为前提，不证明外域业务写入的含义。

终态与清理分别归持久操作及保留记录。异常只触发 seal 和终态观察，不直接构造 committed/aborted。读到终态后才交回 terminal；结算失败保留原 held 或 requested。恢复扫描的操作类型直接取自原 operationRefSchema，不再维护一份可能遗漏新变体的枚举。以可用存储、目的路由及最终恢复调用为前提，历史扫描可再次找到未结算原责任。这里证明责任不会因新类型被解析器遗漏，不保证故障服务最终恢复或固定时间内完成。

`external-write-provider.spec.ts` 验证真实 Identity 保留、拒绝、关闭竞争、既存 execution 重试以及结算失败后的 Worker 重启与工厂恢复。`external-write-source.spec.ts` 验证真实 Settings 来源保留、回执丢失、错绑回执及原责任结算。业务资格解析器和外域业务计划仍为具名夹具；这些测试不替代 Session 同提交组合、真实原登录适配或全链独立验收。这是源码对应的归纳论证和执行验证映射，不是新增机器证明。


## 外域效果与治理终态的原子性

令 X 为外域拥有者状态，O 为原操作状态，E 为保存的执行，I/C 为身份及来源保管。执行前提 P 为 O=submitted、scope/epoch 仍开放、实际执行等于 E、I=held 且 C∈{held,not-required}。basis 仅在 P 成立时发布依据。外域写者须核对自身实际完整 facts 与依据，并提供本事务实际结果 R。terminal 要求 R.binding 等于原绑定，R.executionDigest=H(E)，R.writer 等于 E 指定的写者。

在 SqlStorage 原子性及依赖排序前提下，业务转换 X→X′ 与终态转换 O→R.outcome 属于同一事务。若任一参加者停止，则持久状态仍为事务开始时的 X/O；原受理和保管不受回滚影响。若事务提交，则二者一同可见。后续独立 seal 可以把尚未完成的 O 终结，但不会声称业务已提交。seal 先提交时 P 不成立，业务写者无法取得依据。apply 先提交时 seal 只认回已存终态。

SqlStorage 同身份回执认回保证一次原业务事务最多产生一次效果。即使观察者失去回执，协调器也只从持久原操作认回结果。这个论证不证明业务资格的真实性、外域转换的领域含义或故障后的活性。它依赖受信适配器和存储契约，不是新增机器模型检查。

[真实 Session 组合](../../../../../apps/harness-server/tests/rows/governance/external-session-commit.spec.ts) 检查成功、实际写者后的失败、三种结果错绑、seal 在先、完整 facts 替换及丢回执。用例断言停止参加者和实际 Session 公开状态，避免把初始化失败误判为业务回滚。业务资格与定义是具名夹具，生产接线需单独验证。

## 原业务回执的认回

令 K 为原操作绑定，T 为原记录保存的 sqlIdentity。受理后 K 与 T 不变，终态返回直接读取该 T。按 T 查询的回执由 SqlStorage 的同身份认回协议保护；重复 execute 不分配新的业务事务身份。因此应用可读取同一失败回执，而不需要重复业务判断。

治理 aborted 不提供外域具体原因，也不能通用于推断 SQL 回执种类。本 Session 组合的成功结果适配固定发布 committed；其余失败由原操作封口。应用只从原 SQL 回执的实际停止参加者恢复 Session 失败；若停止者是其他参加者，不能把其 basis 当作 Session 失败解释。缺回执或读取失败也不证明某一业务拒绝。该结论依赖受信 SQL 查询及不可变原绑定，不赋予查询权。

真实 Session 修订不一致场景验证原 rolled_back 回执、changed 失败、同意图重试及状态不变。成功场景还拒绝错 SQL 身份、错操作、错命令摘要、终态冲突及查询未知。它们不证明生产资格和当前来源已经接齐。

## 当前注册声明的独立读取

令 S 为当前 scope 记录，e 为请求代次，d 为精确定义引用，C 为贡献关系。当前注册可用谓词为 S 开放、S.epoch=e，且 C 中存在同 scope/e/definitionKey(d) 的 active 贡献。读取还要求完整正文引用等于 d，并满足正文大小预算。查询使用同一 SQL 事务快照。

独立 definition-projection 直接返回该谓词下的观察。target-projection 共用此观察，runtime 时额外要求同一代次的 selected target；management 不添加 runtime 条件。因此拆分没有放宽原 runtime 选择条件，也没有要求独立声明存在 Settings target。

在贡献撤下已提交之后开始的新事务不再满足 active 谓词；关闭或新代次使 scope 谓词失败。与修改并发的读取按 SQL 事务顺序观察其中一个合法状态。旧读取结果不保证随后写入仍合法，写入组合必须在自身事务中重新取得并消费绑定事实。

这段论证以原发布准入、唯一 Governance 写者、SQL 事务语义和关系约束为前提。它不证明真实发布者当前可执行、持有合法、外部来源缺席或动作获得许可。实际注册/撤下测试及共享 SQL 查询计划守护分别验证行为与索引使用，不替代完整 C3b 独立验收。
