# 身份验证义务

公开解析与 Schema 使用 [规范正反例](../tests/fixtures/identity-values-examples.md)；参与机检86行，所有定义与解析函数的结果必须一致。相等／规范序列化、不可解析身份、父链、不可用、凭证纯函数与非法输入分别由 tests 验证。

运行：`pnpm --filter @omne-harness-lite/identity-values build`、`pnpm --filter @omne-harness-lite/identity-values typecheck`、`pnpm --filter @omne-harness-lite/identity-values test`。

Schema 身份及原规范字节由固定摘要核对；变更此摘要须先明确语义修订及所有消费者，不能从被测文件生成预期。样例读取路径改变不改变实例或拒绝预期。

纯谓词使用明确快照，Alloy派生的祖先／共享关系仅说明固定有界输入；结构模型由组织治理拥有，不建第二份副本。模式匹配不证明部署内唯一、不可伪造、授权、存储事务或跨边界隔离。

实际消费必须覆盖所有权字段、无默认身份、六路径同一判定、必要事实不可用、成员失权不销毁、捕获身份不漂移，以及跨边界复核。受控形状、纯值测试或固定快照不能代替真实消费者验收；单次运行结果留工作树 tmp。

## 交接的真实拥有者验证

产出方和核实方分别验证缺席、错对象、伪造、重放以及提交内现读；注册组合拥有次序守卫的行为模型。身份包的签名或解析测试不能代替组合验证。原规范实例中的 IS 场景不替代下列 CS-1～CS-10 消费者场景。

### CS-1 资产持有的键与属性配值

**资产领域的 owner** 在**为一份[资产持有](../../../../.meta_harness/design/ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)建键、并在其上挂[属性配值](../../../../.meta_harness/design/ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)**时，
依赖 [ScopeLayerIdentity](../SPEC.md#身份与相等)、[TenantId 的构成与相等](../SPEC.md#身份与相等)、[TenantId 的规范序列化形式](../SPEC.md#身份与相等)、[按归属层显式携带身份值](../SPEC.md#每个消费者的隔离义务)、[六条路径同一判定](../SPEC.md#每个消费者的隔离义务)，得到：

**持有的键是 (归属层身份, 资产)**——组织级那份以 OrganizationId 为分量、租户级那份以 TenantId 为分量，
两者**互不相等**。
**「归属层身份」那一半按 [按归属层显式携带身份值](../SPEC.md#每个消费者的隔离义务) 存成一个带判别式的 `ScopeLayerIdentity`**
（`{"layer":"organization","organization":…}` 或 `{"layer":"tenant","tenant":{…}}`），
**不是**两个可空列加一句「谁不为空算谁」——后者在形状上就允许「两个都空」与「两个都非空」，
而这两种都不是合法的归属。
**配值挂在那份持有上**，因此**配值不需要自己的租户字段**——
它的归属由宿主持有决定，持有没了配值跟着没。
因为 TenantId 只有一种规范形式，同一份持有**不会因为写法不同被记成两份**。
[「组织的设置」是这批配值的投影，不是一个对象](../../../../.meta_harness/design/product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)，
所以也没有第二处需要校验身份的地方；
[几级都配了听谁的由那一维的层序决定](../../../../.meta_harness/design/product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)，
不是由键碰撞决定。

#### CS-2 作者与所有者分记

**资产领域的 owner** 在**记录一份资产是谁做的、归谁**时（成员在组织范围创作、此后被降级、再此后退出组织），
依赖 [TenantId 的构成与相等](../SPEC.md#身份与相等)、[TenantId 无生灭路径](../SPEC.md#身份与相等)、[ScopeLayerIdentity](../SPEC.md#身份与相等)，得到：

| 情形 | 所有者字段 | 作者字段 |
|---|---|---|
| 成员在组织范围创作 | OrganizationId | TenantId |
| 成员在自己的租户范围创作 | TenantId | 同一个 TenantId |
| agent 产出 | 它运行所在范围的所有者 | 它运行所在的那个 TenantId，另加「是 agent 产出」的标记 |
| official 资产 | 平台 | 平台，**没有租户**——该字段**缺席**，不是空值 |

并且：**作者字段不随角色变动而变**（[TenantId 的构成与相等](../SPEC.md#身份与相等)：角色不进身份），
**不随成员关系解除而失效**（[TenantId 无生灭路径](../SPEC.md#身份与相等)：无销毁路径，引用永不悬空，署名不会成为孤儿）。
`official` 那行的作者字段**缺席**，由 [缺席与空值都不是身份值](../SPEC.md#身份与相等) 保证它不会被读成某个空租户。

> **这次缺席是合法的，不触发 [缺席即拒绝](../SPEC.md#每个消费者的隔离义务)。**
> 它不是「一次没带身份的访问」，而是**记录里的一个合法取值组合**——
> official 资产本来就没有租户。[身份输入与记录缺席的边界](../SPEC.md#身份与相等)：
> **一律拒绝只在身份的输入位置成立。**
> 读到这一行的消费者该做的是**按「没有作者租户」呈现**，
> **不是**拒绝这次读，也**不是**给它补一个默认租户。

#### CS-3 资产复制的前提

**资产流转的 owner** 在**判断一次[资产复制](../../../../.meta_harness/design/ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)能不能发起**时，
依赖 [sameAccountDistinctTenants](../SPEC.md#上级链与纯谓词)、[MembershipStanding](../SPEC.md#身份与相等)、[不可用即明确失败](../SPEC.md#每个消费者的隔离义务)，得到：

`sameAccountDistinctTenants(源, 目标)` 是一个**不读任何记录的纯值判定**，先于一切存储访问即可算出——
为假就直接拒，**不必也不应**去读成员资格。
为真则继续：两侧的成员资格效力都必须是 `effective`；任一侧的读面以**「不可用」失败**时**明确失败**，
**不当作「不允许」也不当作「允许」**；流转边界（[分享边界场景](#cs-4-分享边界有共同上级)）另判。

**本条是必要不充分条件**，消费者不得据此单独放行。
[同一自然人](../../../../.meta_harness/design/product/PF-003-asset-transfer-and-sharing/design.md#63-复制的通则同一自然人的两个租户身份)
这个前提因此落成一个可判定的结构条件，**不需要引入「自然人」这个第三种身份**。

#### CS-4 分享边界有共同上级

**资产流转的 owner** 在**判断一次[资产分享](../../../../.meta_harness/design/ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)是否越界**时，
依赖 [shareAncestor](../SPEC.md#上级链与纯谓词)、[OrganizationKind](../SPEC.md#身份与相等)、[OrganizationId](../SPEC.md#身份与相等)，得到：

`shareAncestor(o1, o2)` 为真即[在同一棵隶属树内](../../../../.meta_harness/design/product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)——
**两者是同一个判据，不是两个**（[shareAncestor](../SPEC.md#上级链与纯谓词)）。
谓词的输入是稳定的 OrganizationId（不回收、不复用）。
**含个人组织、两者不同的一对恒为假**——所以「两个个人组织之间的分享」必须走它自己那条规则，
**不能靠放宽共同上级的判据来兼容**（那把尺子量不到它们）。
**一个组织与它自己**恒为真，但那不是一次跨组织流转，**不构成放行依据**。
**祖先与后代那一对为真**——[团队与它所属的公司在同一棵树上](../../../../.meta_harness/design/product/PF-001-identity-scope-and-agent-constraints/design.md#组织)，
按不含自身的旧读法它会被判成假，那是本版已被否掉的读法。
关系解除之后该谓词转假，分享随之失效——**失效是这个求值条件的结果，不依赖任何事件送达**
（[每道准入现读](../SPEC.md#每个消费者的隔离义务)：现读）。

**这次求值会读组织记录，因此会失败。**
任何一跳读不到 ⇒ **明确失败**（[不可用即明确失败](../SPEC.md#每个消费者的隔离义务)所规定的必要读失败），
**不得**把一条截断的[上级链](../SPEC.md#表示边界与未实现责任)算出的 `false` 当成「不在同一棵树上」交上去——
那两种收场在调用方看来一模一样，**读失败会被完美伪装成一次越界拒绝**。
求上级链的操作面归 [组织治理](../../organization-governance/src/index.ts)；谓词定义归本包，不另写一份。

#### CS-5 成员无效时不可达但不销毁

**资产领域的 owner** 在**某个 TenantId 的成员关系被解除之后又被邀请回来**时，
依赖 [MembershipStanding](../SPEC.md#身份与相等)、[TenantId 无生灭路径](../SPEC.md#身份与相等)、[成员无效使租户级持有不可达但不销毁](../SPEC.md#每个消费者的隔离义务)、[不可用即明确失败](../SPEC.md#每个消费者的隔离义务)，得到：

- 效力为 `ineffective` ⇒ **拒绝以该 TenantId 发起的一切访问**，
  且**不得删除任何以该 TenantId 为键的数据**——没有东西被删过，重新加入之后也就没有东西需要恢复；
- 读面以**「不可用」失败** ⇒ **明确失败**，**尤其不得据此执行上一条的任何清理**；
- 重新加入之后，[TenantId 的构成与相等](../SPEC.md#身份与相等)/[TenantId 无生灭路径](../SPEC.md#身份与相等) 保证回来的是同一个 TenantId，
  那些持有与配值**原样可用**，[分享失效而复制留着](../../../../.meta_harness/design/product/PF-003-asset-transfer-and-sharing/design.md#612-关系解除之后)按资产流转自己的规则。

**「不可达」与「销毁」分开的责任落在资产 owner 身上**：本契约只保证身份值永远指得回去。

#### CS-6 工作区宿主为租户

**资产领域与执行环境的 owner** 在**为一个工作区建身份、并判断谁能访问它**时（同一宿主机、同一 OS 用户，
两个租户身份先后挂上同一个目录），依赖 [路径是地址不是钥匙](../SPEC.md#每个消费者的隔离义务)、[判定依据的构成封闭](../SPEC.md#每个消费者的隔离义务)、[ScopeLayerIdentity](../SPEC.md#身份与相等)，得到：

**工作区的归属键含 TenantId 分量**，所以同一个目录换一个租户身份挂上就是另一份，两边互相看不见；
**目录本身只是地址**，换个 OS 用户、换个 cwd 进到同一个目录**不产生任何资格**。
并且 [ScopeLayerIdentity](../SPEC.md#身份与相等) 提醒：工作区**不是** ScopeLayerIdentity 的一个变体——
它不是一重身份，消费者不得为它造一个作用域层身份，只能用它自己那两条层序。

> **目录那一半靠什么标识，本契约不供**，见 [未实现责任](../SPEC.md#表示边界与未实现责任)。

#### CS-7 会话持有创建时的 TenantId

**会话领域的 owner** 在**创建一个会话、随后账号切到另一个租户身份**时，
依赖 [当前租户身份在创建那一刻捕获](../SPEC.md#每个消费者的隔离义务)、[身份参数没有默认值](../SPEC.md#每个消费者的隔离义务)、[TenantId 的构成与相等](../SPEC.md#身份与相等)、[TenantId 无生灭路径](../SPEC.md#身份与相等)，得到：

创建流程在**开始时**从组织治理契约的查询面取一次 TenantId 并**存进会话**，此后一切以它计；
账号后来切到别的租户身份，这个会话**不跟着变**——成本、归属、可见性都不漂移。
会话**不得**只存 LoginStateId 而把归属留给「现在查一下这次登录选的是谁」，那就是随人漂移。
即便那个租户身份此刻失效，归属字段**仍然解析得回一个存在的身份**（[TenantId 无生灭路径](../SPEC.md#身份与相等)）；
失效之后的收场（归档与否）归 PF-015 自己的规则，**本契约不定**。

#### CS-8 计量按 TenantId

**计量的 owner** 在**把一次调用的成本记到某个租户头上**时，
依赖 [当前租户身份在创建那一刻捕获](../SPEC.md#每个消费者的隔离义务)（用的是创建那一刻捕获的值，不是此刻的选择）、
[TenantId 的构成与相等](../SPEC.md#身份与相等)、[TenantId 的规范序列化形式](../SPEC.md#身份与相等)（一种规范形式，明细可按它聚合而不分裂），得到：
**每一条明细都能携带一个稳定、可永久引用、可作聚合键且不漂移的 TenantId。**

**但「一次调用的成本怎么算、何时结算、明细怎么归集」没有 topic，是缺口 [未实现责任](../SPEC.md#表示边界与未实现责任)**——
本契约只承诺 TenantId 可被每次调用携带且不漂移，**不填任何口径**。

#### CS-9 全局授权表达落成租户层配值

**meta 能力的 owner** 在**处理一笔作用域为「全局」的[授权表达](../../../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)**时，
依赖 [ScopeLayerIdentity](../SPEC.md#身份与相等)、[按归属层显式携带身份值](../SPEC.md#每个消费者的隔离义务)、[每道准入现读](../SPEC.md#每个消费者的隔离义务)、[层事实只以显式身份值为键](../SPEC.md#每个消费者的隔离义务)，得到：

那一笔**不留在会话流水里**，而是写成**租户层的一个属性配值**——以 TenantId 为归属层身份、
挂在对应的资产持有上（[资产持有场景](#cs-1-资产持有的键与属性配值)）；这一笔落地时**显式携带 TenantId**，
且**不因为它来自某次会话就以 LoginStateId 或 AccountId 为键**。

**写这个值要有写它的权限**，那是另一道判定：资格按 [每道准入现读](../SPEC.md#每个消费者的隔离义务) 现读，不足则失败——
[会话里坐着的那个人，未必是设权限的那个人](../../../../.meta_harness/design/product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度)。
本契约保证那个键是什么，**不保证谁写得了**。

#### CS-10 成员资格读不到

**任何持有租户范围对象的 owner** 在**调用成员资格读面却拿到 `{ failure: "unavailable" }`** 时，
依赖 [MembershipStanding](../SPEC.md#身份与相等)、[不可用即明确失败](../SPEC.md#每个消费者的隔离义务)、[缺席即拒绝](../SPEC.md#每个消费者的隔离义务)、[每道准入现读](../SPEC.md#每个消费者的隔离义务)，得到：
**一个与任何效力值都不同形的失败**，调用方据此明确失败、不回退、不返回空集、不写缓存。
它**分不掉**——`MembershipStandingResult` 的两支在形状上互斥。

**同一次调用还有第三种收场，走查要一并走到**：读面
（[组织治理的公开成员资格操作](../../organization-governance/src/index.ts)）
的返回是一个**闭合和** `invalidInput` **|** `MembershipStandingResult`
（**那个和的形状归组织治理公开接口**，[MembershipStanding](../SPEC.md#身份与相等) 只拥有右项）。
`invalidInput` 是**表示层拒绝，判定没有发生**（[表示层校验与判定分开](../SPEC.md#表示边界与未实现责任)），
因此**不在 `MembershipStandingResult` 里**，也**不得被记成一次判定结果**；
但它**同样以返回值承载、同样不走带外通道**，调用方**同样明确失败**。
**三种收场，三个分支**：`invalidInput` / `{ failure: "unavailable" }` / 一个 `MembershipStanding`。
**走查要确认调用方先分和、再分右项的两支**——少分一层，`invalidInput` 就会沿着
「没拿到 standing ⇒ 当作没有」滑进 `ineffective` 那一侧，与本条要挡的是同一件事。

同理，某组织的超管尝试读取一位成员个人组织下的东西时，访问点显式携带那个个人组织的 TenantId 去读，
而超管的账号不是该个人组织的成员，效力为 `ineffective` ⇒ **拒绝**；
[超管的作用域恰是该组织](../../../../.meta_harness/design/product/PF-001-identity-scope-and-agent-constraints/design.md#角色)
这件事因此**不需要一条额外规则**，它是判定的自然结果。

**这一条是全部隔离义务共用的那个前提**——它不成立，其余条款都会在一次存储抖动时集体失守。
