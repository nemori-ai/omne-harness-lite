# 动态治理声明、作用域与生命周期

状态：HJ0 技术采用已于2026-11-06由用户验收。本文拥有本波 Settings、Permissions、Authorization 与装配之间新增的共同协议。既有权限分档、资产持有和配置层序继续由各成员 SPEC 拥有。本文不声明这些跨域协议已经实现，也不把治理服务归入 HITL。

## 责任与独立使用

功能拥有者声明本功能有哪些设置和真实权限关口。公共治理只固定协议、安全边界与求值规则，不维护预知所有功能的枚举。资产可以组合这些声明。独立服务可以直接提供声明和合法目标，不必伪造资产或会话。

| 事实 | 拥有者 | 保存方式与消费方 |
| --- | --- | --- |
| 项含义、类型、默认值、支持范围、真实动作关口 | 功能/资产类别拥有者 | 不可变定义。资产项从合法资产发布派生，独立项从功能定义派生 |
| 资产定义、发布、持有及替换 | Assets | Assets 持久保存，治理通过公开引用与受保护投影消费 |
| 贡献租约、当前逻辑服务的采用集合与代际 | 装配协调者 | 租约属于装配资源。当前采用围栏须能参与目的提交，重启先隔离旧代 |
| 设置配值、属性锁、持久权限规则配值及其操作回执 | Settings | Settings 后端持久保存。Permissions 解释权限规则，不另复制可编辑配值 |
| 具体许可、作用范围、撤回及消费回执 | Authorization | Authorization 后端持久保存。租户持久规则引用 Settings 的权威配值及修订，不形成第二个规则真源 |
| 人的请求、答复及原等待关联 | HITL | HITL 与原等待协调者保管。答复不等于许可 |
| 日程采用的许可及规则依据 | Schedule | 本域保存引用与采用事实，不发行许可、不维护通用授权账本 |

物理持久化由现有 Storage 契约和各 `-local` 后端承载，领域保持语义所有权。共同事务通过具名参与者组合，不跨包修改私表。Cordis fiber 的销毁只释放本实例贡献和执行资源，不拥有用户配值、许可或审计数据的删除权。

## 身份与四类作用域

以下是稳定数据协议的逻辑形状，不是已有 TypeScript 类型名称。所有引用都是值，不包含 Context、fiber、数据库连接或可执行函数。

| 值 | 必需字段与约束 |
| --- | --- |
| DefinitionRef | `ownerId, definitionId, version, digest`。同身份版本的不同摘要冲突。owner 必须来自可信注册主体 |
| ItemRef | `DefinitionRef, itemId, targetKind`。名称和展示分组不能替代稳定身份 |
| OriginRef | `asset {assetId, releaseRef}` 或 `independent {providerId, definitionRef}`。资产项对应已合法采用的固定定义，不能另注册影子字段目录 |
| CatalogScope | `deploymentId, logicalServiceId, visibilityDomain`。visibilityDomain 为具名组织、租户或受信公共定义范围。公共可见不等于允许跨租户配值 |
| AssignmentScope | 具名配置目标、持有/管理关系、允许的治理层及其主体引用。沿 Settings/Permissions 的既有层序，工作区不成为权限配值层 |
| GrantScope | `tenantId, beneficiaryRef, actionSet, targetConstraint, purpose, originBinding, implementationConstraint, extent`。extent 为原调用、原逻辑会话或租户持续范围，另有期限和次数规则 |
| ContributionRef | `CatalogScope, contributorId, generation, registrationId`。只能释放精确租约，不接受“按 itemId 删除” |
| AdoptionBasis | 当前声明摘要、采用集合修订、目标/持有修订、配值修订、权限规则修订及适用授权修订。各轴分别命名，不假造一个全局 version |

权限声明还必须包含人可读标题、解释、批准后果、可选范围说明、合法档位/有序关系、真实 enforcementKey，以及可映射的 Settings 项引用。不存在持久配值语义的权限无需强行注册设置项。设置元数据沿 [Settings 组模型](settings-composition.md)；权限显示不能只有 key 或自动生成的枚举名。

支持的 scope 是声明能力，实际 scope 是受信输入，两者必须匹配。注册者不能新增没有治理语义的范围、伪造组织/租户/会话身份或放宽外层禁止。`global` 仅表示本租户允许的持续选择。only-session 跟随逻辑会话而非 runtime 实例。one-time-call 跟随原操作及参数绑定，技术重传不能再次获得一次额度。

## 登记、目录与提交端口

接口按用途隔离。本文定义语义，不要求创建一个兼管所有领域的 Registry 类。Settings 已有登记端口应被复用或按差额扩充，不能平行实现第二份设置目录。

| 端口 | 输入 | 成功及关键失败 |
| --- | --- | --- |
| contribute | 可信注册主体、CatalogScope、contributorId/generation、原 operationId、不可变声明及真实关口绑定证据 | `registered {ContributionRef, declarationRevision}`。同操作同摘要返回原租约，同操作异摘要 conflict。同定义同摘要可获独立租约，同版本异摘要 conflict。无真实关口、非法scope 为 invalid-input/denied；来源无法核实为 unavailable |
| withdraw | 可信注册主体、精确 ContributionRef、原 operationId | `released` 或 `already-released`。旧代租约不能移除新代或其他实例租约。先封住本租约的新采用，再释放资源；unknown 按原操作查询 |
| adopt | 受信装配主体、目标逻辑服务、原 operationId/请求摘要、预期采用修订、完整候选声明集和参与者引用 | `adopted {adoptionRevision}`。原操作同摘要认回原发布，不重做，同操作异摘要 conflict。校验冲突、来源、全部必要声明与关口后整份发布并保存原操作回执。失败保留旧份或明确无可用份，不能发布半套 Settings/Permissions。结果不明为 unknown，沿 queryOperation 认回 |
| readCatalog | 可信读者、CatalogScope、management/runtime 模式、目标筛选、分页预算及游标 | `page {items, snapshot, completeness}`。每页重核资格。旧快照 conflict；不可读项不披露；依赖失败标明不完整或 unavailable，不能伪装完整空列表 |
| prepareChange | 可信主体、明确目标/项/定义、预期配值修订、原操作及合法新值 | `prepared {basis}` 或 denied/conflict/invalid-input/unavailable。只是有限期准备，不预留无限期权利 |
| commitChange / consumeGrant | 既有 Settings/Authorization 命令及原操作身份、准备依据、具名目的参与者 | 原领域的 committed/consumed 回执。目的提交内重核全部当前性，失败明确 denied/conflict/unavailable；提交结果不明为 unknown，不换键重做 |
| queryOperation | 可信主体、原操作身份及所属服务 | `committed {originalResult}`、pending、unknown 或有封口证据的 not-committed。不存在记录本身不等于未提交。读取先核当前披露资格 |

每个入口先校验有限输入和预算，再校验受信身份与披露/操作资格，随后处理原操作绑定、版本、状态及业务约束。输入不合法为 invalid-input，预算不足为 limited。贡献和配值命令均不得无限重试。纯读失败不返回“本次提交未知”，原操作查询可报告原命令 unknown。上述结果标签是互斥结果，不允许异常被转换为空成功。

所有有副作用端口都绑定原操作身份与请求摘要。操作身份限于命令拥有者、明确治理/目录范围、可信调用方及 operationId。generation 是受绑定请求内容，不能靠换代把旧原操作变成另一份操作。contribute 重传可认回已释放的原租约，但须明确已释放，不能重新激活。unknown 不授予调用者采用未确认结果的资格。

登记、定义可读、可配置、运行选入及执行实例在线分别呈现。运行目录由当前合法采用集投影。管理目录允许通过仍在线的资产定义/管理提供者展示未启用资产，并标明 disabled/not-adopted/provider-unavailable。没有合法声明来源的旧项只可经获准的历史入口查询，不能表现成当前可配置项。

租约退出只影响该租约。最后一个适用租约退出，才撤下该范围的可用贡献。相同定义在另一服务或租户的合法注册不受影响。定义级注册不替代逐目标持有或管理资格。

## 配值和授权的保存与恢复

配值的逻辑身份包含持久命名空间、配置目标、具体来源身份、项身份及治理层。命名空间在 provider 换代后稳定，不能用 PID、fiber 路径或临时注册号作为持久主键。不同逻辑服务是否共用同一配置目标须显式绑定，不由同名 key 推导。资产持有重新建立使用新的持有身份，不能认领已结束持有的旧配值。

| 事件 | 目录与新动作 | 已存配值、许可、回执及等待 |
| --- | --- | --- |
| 一个贡献退出，仍有相容贡献 | 重算当前采用依据，其他贡献仍可用 | 保留，不替其他实例撤权 |
| 最后一个运行贡献退出 | 运行目录退出。依赖该能力的新采用/执行 unavailable | 保留业务数据和原等待保管。可以在合法历史入口查结果或撤回许可 |
| 资产禁用 | 不进入运行采用。管理定义仍合法时可显示 | 保留配值，启用后重新核验 |
| 持有移除/配置目标终结 | 对应层配值退出有效集合，后续旧写拒绝 | 沿原 owner 清除/退役规则，不等同临时卸载。审计/原操作回执按保管规则保留 |
| 相同来源、相容定义重新装配 | 新租约和新采用代际，重新取得当前依据 | 可重用仍合法的配值。许可必须未撤回、未过期、范围匹配且尚有额度 |
| 同 key 不同资产/提供者、语义不兼容更新 | 不自动搬值或许可，返回需要迁移/重确认的原因 | 原数据仍属原来源。合法迁移须由原领域显式操作，不能静默扩大许可 |
| 会话终局或一次额度耗尽 | 对应授权停止匹配，即使之后恢复相同插件 | 不因卸载/重启重置次数、撤回或会话终局 |

相容性不能只比较版本字符串或 schema 可解析。相同来源、稳定项含义、目标、动作/参数解释、关口和权限影响须保持相容。功能拥有者声明变更映射，治理端验证不扩大授权和当前范围。未提供可核验映射时不自动沿用。设置默认值变化按当前定义求值，已保存值仍须满足新约束。持久禁止和能力级锁界沿原 Permissions 规则保持，删项、卸载或换实现不能解除它们。

## 卸载与提交的并发协议

装配协调者拥有 `ActivationFence`，记录逻辑服务当前有效贡献与采用修订。它是部署层的采用事实，不是新的权限真源。local 将该围栏作为具名参与者登记到已有共同 SQL 事务域。声明发布、撤除和替换与依赖该采用集的 Settings 提交/Authorization 消费在同一排序边界核验。仅从内存 registry 读取 revision 后另开 SQL 写入不满足本协议。

卸载顺序为 beginClose 封住对应贡献的新采用，认回/完成已经取得提交权的原操作，再释放物理资源。若提交先成立，保留真实回执，卸载不能撤销它。若撤除先成立，旧准备不能产生新有效写入或消费。另一个合法贡献可以支撑重新准备，但不能直接使旧 token 变新。没有结果的操作继续保管为 unknown，不能因关闭而回报成功或失败。

重启时先把旧部署实例的临时采用围栏置为不可供新操作使用，再登记本次实例。多进程失效检测、分布式租约和跨后端事务不是本次算法承诺。未来提供者须兑现相同的受保护提交语义，做不到时返回 unavailable。领域公开协议不暴露 SQL 事务对象。

旧准备因换代或贡献集变化而失效后，可以用同一业务原操作重新取得当前依据，前提是核实原操作尚未提交。未知结果先认回，已提交返回原结果，不再次消费或写入。刷新准备不改变原动作、参数、目标或授权范围。同原操作改业务内容仍为 conflict。

管理操作绑定仍合法的管理定义来源，无须伪造运行实例。原人的答复和 inbox 可以在 runtime 离线时持久成立。只有解释为许可、保存持久规则或恢复执行等依赖关口的后续步骤，需要相应当前定义与采用参与者。历史查询、撤回和关闭不依赖已卸载插件重新上线。

## 函数、守护与采用位置

设 D 为已验证不可变声明，L 为带作用域及代际的有效贡献，A 为已采用集合，V 为持久配值，G 为许可/消费记录，Q 为当前资格和目标事实。

`Catalog(D,L,A,Q,mode) -> Page | denied | unavailable | conflict | invalid-input | limited`。

`PlanChange(D,L,A,V,G,Q,command) -> PreparedEffect | Rejection`。

`Commit(PreparedEffect,currentBasis) -> committed | consumed | denied | conflict | unavailable | unknown`。

偏函数的成功定义域要求声明存在、来源身份一致、scope 合法、目标有效、采用未过期、配值有效及当前许可满足。全化把每个失败前提映射成显式结果。一次旧求值不是以后提交的凭据。

安全证明按转移归纳。初态没有活跃租约且持久事实独立存在。登记只增加本作用域的租约。撤除只删除精确租约并改变采用围栏。提交同时检查围栏和业务资格，并写业务事实及原操作回执。重装配仅建立新代租约，不清除历史或重置许可。由此保持下面的不变量，前提是全部写者都兑现共同提交与精确租约规则。

| ID | 必须守住的性质 | 实现闭包 |
| --- | --- | --- |
| DG1 | 无当前合法声明的项不出现在可用运行目录，无运行依据不新执行 | C3/C8 |
| DG2 | 释放一租约不删除兄弟贡献，旧代不能撤新代 | C3 |
| DG3 | 目录、配值和授权均不越租户、服务绑定与业务 scope | C3/C6 |
| DG4 | 卸载/重装配不丢配值和回执、不复活已撤回或已消费许可 | C3/C6 |
| DG5 | 撤除先于提交时，旧准备不写入或消费；先提交则保留结果 | C3/C6 |
| DG6 | 相同 key 的替换实现不能继承原具体来源的配值或许可 | C3/C6/C8 |
| DG7 | 相容恢复在重新核验后可采用合法保存值，不要求永远受阻 | C3/C6/C8 |
| DG8 | 声明冲突不发布混合目录，定义删除不能解除已有禁止 | C3 |

有限模型、正负控及条件活性在 [HJ0 verification](../../human-intervention/human-intervention/verification/README.md) 登记。该位置承载本波跨域组合检查，不转移语义所有权。真实源码提交点、故障恢复、provider 重装配和 Settings 注册资源预算仍由 C3/C6/C8 验证。模型不证明任意规模、真实 SQL 或 Cordis 内部行为。


## 组织来源与原修改终结

组织权限配值由Settings在唯一组织来源持久保存。不同租户消费同一来源，不能各复制一份可编辑组织规则。读取和修改仍由Identity核验具名资格；组织配置管理使用独立的organization-settings-manage，不借用账目读取资格。

Settings提供来源保留，绑定确切来源修订、原业务操作、目的attempt及稳定目的身份。它不授予身份资格或许可。目的未确定终态时保持来源，只有具名目的resolver建立aborted或认回committed才能释放；不存在记录、超时、卸载都不是释放证明。

所有改变来源的写入，包括首次设置、锁、解锁、删除和rebase，先拒绝新的重叠保留，再等待已有held有界结算。提交时重核原管理资格和定义，在同一来源事务写唯一配值、原结果并清精确门。数据库不可得时保留pending与原身份，不改用系统授权继续。

组织源修改占门之后，最终拒绝、合法取消或外部seal当前attempt，须在同一源事务完成attempt封口、根操作aborted和精确清门。提交先成立则认回committed；seal先成立则迟到写拒绝。取消不删除旧held或撤销已成立目的效果。恢复分别枚举pending源和held，包含零held但根尚待决的源。旧根的迟到收尾不能清后继根的门。

普通配值因临时依据失效而重新准备，与上述持门根操作的最终终结分开。累计准备预算耗尽返回limited并保管原结果；unknown先沿原attempt认回。允许重新准备的保证以尚有预算为前提，不能声称无限换代仍必定成功。

来源保留的状态模型、具名负控及证明前提归 [Settings验证入口](../settings/verification/README.md#组织来源保留与源修改恢复)。本节是技术承诺，真实SQL组合与跨库恢复仍须实现和验收。它不把当前治理采用扩成执行清单协调者的新增操作。
