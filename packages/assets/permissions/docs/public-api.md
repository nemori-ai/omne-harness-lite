# 公开协议

本页说明 [src/index.ts](../src/index.ts) 的使用条件。业务规则归 [SPEC](../SPEC.md)。采用依据为 [HJ0](../../docs/governance-contributions.md)。

## 声明与身份

`PermissionDefinition.reference` 由 origin、itemId 和 revision 构成。origin 区分固定资产发布与独立提供者定义。标题不能替代稳定项身份，Settings 项 key 不能替代具体来源。

`capabilityId` 与 `enforcementKey` 指认替换实现仍受约束的能力关口。调用方必须核验关口真实存在。`definePermission` 只验证形状及声明内部一致性，不核验注册权或执行器。

`values` 为有限命名值，每项提供人可读标题、解释和 `permitsOperation`。false 表示该项不允许所控操作，true 只表示结构化值未禁止操作，后续仍可能要求人工、环境或其他检查。值标识不是内置业务枚举。

`comparison` 为 null 或完整比较声明。`strictOrder` 按较严到较宽排列每个值，恰好出现一次。`distances` 的行列按 `values` 排列，必须完整、有限、非负、对称，自距为零、异值距离大于零。实现不从数组序号推导距离，也不要求未被采用的三角不等式。合法挑选存在时不需要比较关系；只有全部挑选越界时才使用它。

`defaultRule` 包含可空 pick 与可空 allowedSet。pick 为 null 表示没有挑选。allowedSet 为 null 表示本层未锁，空数组表示锁定空界。无默认挑选且各层也未挑选时，不猜测默认档位。

`supportedScopes` 说明功能支持的原调用、逻辑会话或租户授权范围及后果。它不是实际授权。`assignmentLayers` 说明可配值的治理层；两者分别属于授权寿命与配值来源，不能相互推导。

## Settings 投影

`settings` 为 null 时不生成持久设置。其余声明投影为一个 governance 分类项。返回的 `definition` 经 Settings 的 `defineSettings` 校验，权限原声明在 `permission` 中保留 scope 及档位说明。

Settings 中只存一份 `{pick, allowedSet}` JSON 配值。Settings 的通用属性锁与权限允许集是不同事实，通用 `evaluateSettings` 的单个有效值不能替代权限逐层材料。集成方必须把各层原配值交给 `evaluatePermission`。Settings 写入本身也不能证明权限已放行。

多个声明的 Settings 分组及目录合并由现有注册/装配拥有者负责。组合时必须绑定具体 origin、目标与定义修订，不能因相同 providerId 或 itemId 迁移其他来源的值。

## 求值材料与可信边界

`PermissionEvaluation` 明确本次 tenant、target、organization、session、deployment 和 logicalService。独立服务可将 organizationId、sessionId 置为 null。实际组织/会话来源若可用，必须有对应非空身份。

tenantId、targetId、organizationId 和 sessionId 承载原拥有者的完整引用。引用非空、最长4096字符且不含控制字符，不作 trim 或重新编码。生产租户来源使用 Identity 的规范 tenantCodec 编码，提供者仍须核验其真实资格。目标引用必须绑定完整目标身份，不能只用标题或局部 key。结构合法不等于身份有效。deploymentId 与 logicalServiceId 继续使用命名标识符。

默认来源来自声明。organization、tenant、session 三个必填槽分别为 available、absent 或 unavailable。absent 是调用方核验后的无配值事实，必须携带修订；unavailable 是无法读取，不能转换为 absent。available 携带具体定义引用、完整 scope、来源与修订。任何绑定不一致均拒绝，不借用其他租户、目标、服务或同 key 的值。

`constraints` 为具名可信提供者提供的能力约束。bound 只收紧允许集；prohibition 直接禁止。每个 available 约束必须匹配本次完整 scope、capabilityId 和 enforcementKey。`requiredConstraintIds` 由受信集成方确定，不是用户可删的选项；漏项、unavailable 项和额外出现的不可读约束均阻止放行。调用方必须完整收集适用约束，包括工作区具名类别、AgentDefinition 和历史能力级锁界/主动禁止。

约束的能力身份独立于具体实现 origin。同标识替换后，旧具体来源配值不能作为新定义来源，但能力约束仍须交入。声明缺失时，已知禁止或可证空交集继续拒绝；其余结果不可用。新定义不识别约束档位时为 invalid-input，调用方不得删掉该约束重试。

这些字段是核验后材料的表示，没有密码学证明或身份品牌。纯函数不能核验输入所声称的资格、完整性、当前性及来源真实性。注册、持有、合法来源收集与采用围栏均为 C3b 的前置责任。

## 顺序与结果

先解析结构和绑定，再检查已知主动禁止及空交集。它们成立时，即使其他必要来源不可读，也可以明确拒绝。其他缺来源返回 unavailable，不掩盖为默认值或空界。

共同界非空且来源完整时，按会话、租户、组织、默认寻找首个合法挑选。全部越界才以最具体非空挑选为锚，按声明距离找最近值，等距取声明中较严者。没有锚或比较关系返回 unavailable。

所有非 invalid-input 结果保留 scope、具体定义引用、能力关口、sourceRefs 及 revisionVector。修订向量分别标识采用、目标、定义、各配值来源和各约束；它不是全局版本或未来提交凭据。denied 的 allowedSet 为 null 表示声明缺失且无已知集合，不能解释为空界。effective 的允许集按声明值顺序输出。

`invalid-input.reason` 区分 structure、definition、binding 和 rule。unavailable 的 missingBasis 标出缺声明、来源、具名约束或比较。此包不接受模式或 HITL 批准输入，调用方不能用这些事实覆盖结构化禁止。

## 后续组合义务

C3b 使用现有 Settings 注册端口，核验真实声明、主体与目标资格，在共同事务域内发布采用集和保护写入。调用方须在原动作点重新核对 revisionVector，并把 `permitsOperation` 与后续授权、环境守卫共同消费。Runtime Context 只能按资格投影结果。

本包不实现贡献租约、ActivationFence、持久配值数据库、SQL 事务、使用资格筛选或执行器。HJ0 的 DG3/DG6/DG8 在本包只覆盖固定材料的绑定与规则性质，完整动态保证仍依赖组合交付。

## 当前来源消费口

`PermissionBasisSource<Context>` 提供 `readCurrent(context, request)`。受信上下文与可序列化请求分开传递。精确形状归 [source.ts](../src/source.ts)。目前只交付协议和结构守护，尚无本包自带的真实来源提供者。

请求固定原操作、实际实现引用、有效参数摘要、能力与关口、具体权限定义以及完整作用域。implementationRef 必须对应受信发行映射中的精确实现，不能从工具名称或模型文本推断。提供者验证实际主体与目标资格，并核对该实现当前采用的定义、真实关口及适用约束。客户端提供的字段不是这些事实的证明。

请求不接收 adoptionRevision、targetRevision、sources 或 requiredConstraintIds。提供者收集这些事实，保持来源缺席与不可读取的区别。调用方不能通过删去约束或自填来源决定允许。来源完整性与当前性仍归提供者，而不是Schema或纯求值函数。

current 结果绑定原请求及 PermissionEvaluation。Schema核对两者的完整scope、具体定义、capabilityId和enforcementKey一致。消费方还必须核对结果中的request与自己发出的原请求完全相同，包括操作、实现和参数摘要。绑定字段回显不能代替来源真实性。current表示取得了本次求值材料，不表示所有材料可用，也不授予未来执行许可。

当某个来源不可读但已有合法禁止事实时，提供者保留该禁止和unavailable来源，交给纯求值器得出拒绝。不能把整份材料丢成默认允许。失败按下述顺序分类。请求不符合Schema时返回invalid-input/structure。随后核验上下文和披露资格；明确主体未获资格或目标不在其范围内时返回denied，资格核验依赖不可用或事实未知时返回unavailable。仅在已有资格读取该原操作后，确认请求的实现、参数、具体定义或关口与真实原动作绑定不一致，才返回invalid-input/binding。不能向无权调用者用绑定错误泄露目标事实。

已建立合法原动作绑定后，提供者收集本次材料。可核实的局部来源失败写入相应unavailable槽，连同已知禁止一起返回current，由求值器决定拒绝或不可用。原动作绑定事实仍未知、或无法建立任何受保护读取依据时返回unavailable，不能假称已确认无权。source端口的denied只表示读取资格已确认不成立；业务规则的denied由evaluatePermission产生。缺少来源实现时不能回退旧静态allow。

原动作的实际启动或写入仍须按对应拥有者的协议重核来源，或取得与精确目的绑定的保留。一次读取、旧Context材料和历史current结果均不能免除该义务。C6的持久grant与同提交消费尚未由此接口交付。
