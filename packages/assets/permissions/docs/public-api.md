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
