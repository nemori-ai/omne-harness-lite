# 身份资格与设置提交的协调

本页拥有 `settings-local/identity` 的本地写入协调与目录捕获共用的资格协调前提。Identity 的成员规则、资格预留和治理恢复归 Identity；设置项与求值归 Settings；目标持有和声明有效性归目标拥有者。精确接口归 [identity.ts](../src/identity.ts)。

## 适用范围与装配

底层 `createSettingsSqlBackend` 消费注入的资格端口，不自行验证 Identity。普通租户装配使用 `createIdentityQualifiedSettings`，要求当前 acting-for-tenant principal 的成员关系及装配指定的既有具名资格。适配器不解释角色，不增加资格名称，也不把成员资格当作登录有效期或 permit 租约。

装配提供可信 PrincipalVerifier、TenantStandingSource、StandingReservations、目标访问策略、目标 SQL 组合与固定 destination。目标域必须是该租户的域；目标的 scopeRef 必须等于 tenantCodec 编码。`principalRef` 使用 Identity 的 `standingPrincipalRef`，不是客户端自由文本。

`createSettingsStandingDestination` 只交给 Identity 的可信恢复装配。它只接受 owner=settings、固定 destination、完整租户、目标、原操作和摘要绑定。它调用目标的终态封口，不接受调用方声称“已经结束”。普通用户和工具不得获得 SQL 存储、目标 resolver 或装配写权限。多个目的地由装配静态路由，不接受客户端模块路径。

必须先将 `settingsSqlMaterials()` 与真实目标 guard 材料登记到同一目标域，再发布服务。声明了材料不等于已经登记。真实目标 guard 必须与其全部失效写者共享该域的事务；不能拿调用前的访问检查代替这一点。Identity 保持独立的系统事务域，不参加租户 SQL 事务。目录组合还须安装两拥有者投影和中央守卫，具体材料与唯一事实生产者见 [装配入口](../README.md#choose-and-register-an-assembly)。

当前实现是注入式本地后端。串行化的数据绑定可被后续远程适配采用，但现有进程内 PrincipalVerifier 和对象能力不是远程认证。没有交付远程提供者。

## 提交与终态

1. 适配器冻结合法命令，核对 principal、租户、当前读取资格和目标访问策略。原操作绑定包含目标、主体、operationId 与命令摘要；摘要不包含传输 requestId。
2. Identity 原子核对当前成员与资格，保存 held 预留。它若已有成员变更待决门，拒绝新的预留。获得 held 后才发送设置事务。
3. 设置事务包含 `settings.terminal`、真实目标 guard 和 `settings.persistence`。终态参与者提供绑定原操作的 `settings.operation-open`；持久化参与者同时要求它和 `settings.current`。状态、原结果、变更和 committed 终态共同提交或回滚。
4. 协调器请求 Identity settle。Identity 经可信 resolver 调用 seal。seal 仅将 absent 变成 aborted，或返回已存在的 committed/aborted；它不会删除设置或覆盖终态。
5. 只有匹配终态允许 Identity 释放 held。客户端超时、取消观察、查询暂未提交、提供者停止均不是释放依据。目标不可用时保留预留，撤权仍未完成。

原操作先提交时，后来的 seal 返回 committed。seal 先提交时，所有迟到的原操作写入在目标事务内失败。相同操作身份换内容是 operation_conflict，不会得到新的有效预留或终态。

`getOperation` 每次重新授权。已有业务回执保留原业务结果；只有 aborted 封口且没有此前业务回执时，返回 rejected/basis_changed。当前无权读取时可以拒绝披露，不能因此删除历史成功。

`close` 停止协调器准入，等待已接受调用，再关闭内部设置后端。共享 SQL 和 Identity 生命周期归装配拥有者。未完成的预留由 Identity 的持久恢复继续负责；disposer 不能把它视作已释放。

## 目录捕获与历史读取

`createSettingsCatalog` 对每次捕获验证 principal、固定 deployment 与同租户目标。它为本次读取生成独立原操作，并向 Identity 申请短暂 held。捕获事务消费终态、要求两个目标拥有者的绑定投影，再读取 Settings 状态。它不增加配值 revision，也不授予写权限。

Identity 通过同一可信 destination resolver 封口捕获原操作。只有匹配的 committed 终态完成 settlement 后，目录才可交回捕获依据；捕获被先行封口或 settlement 未完成时不能交回成功依据。这里的“短暂”描述预期用途，不承诺故障下的释放期限。目标不可用时，预留仍由 Identity 恢复负责。

每一页都重新执行捕获，不用旧游标的权限。目录捕获前后核对 registry generation，分页依据包含实例、过期 epoch 与当前目标和配值。完整边界见 [SPEC 的目录条款](../SPEC.md#coherent-catalog-capture)。运行显式选择只证明消费意图，不替代 Identity 或目标资格，也不证明执行采用。

`readState`、`getOperation` 和 `readChanges` 是重新授权的存储检查及历史恢复入口。它们不是当前目录求值或采用凭据。`readState` 可向仍获目标权限的可信调用者返回旧 definitionRef 和原状态；目录不会把不匹配的旧值当作当前有效结果。后来的撤权可以拒绝历史披露，不能推翻已经成功的效果。

Registry 卸载影响声明可读性并保留配值。它不与设置写入共用事务，不能替代目标拥有者的失效操作。独立目标 retire 与资产持有变更各自通过拥有者事务守卫生效。

## 可信维护能力不属于租户资格路径

`createSettingsMaintenance` 仅交给可信部署拥有者。它使用固定 `maintenance/<ownerRef>` 身份，刻意不经过本页的 principal、standing 和 reservation 路径。这项能力不能暴露为普通租户或工具命令，不能把它当成对租户授权政策的扩展。部署拥有者负责对象能力的持有、路由与 retain/discard 权限。

重新采用仍在同一租户事务中取得原目标拥有者的当前事实，并消费不可逆终态。它要求精确旧新 reference、预期配值 revision 和完整赋值处置，事务行为归 [SPEC 的维护条款](../SPEC.md#trusted-deployment-rebase)。本页下述资格保持论证适用于获得 Identity 预留的租户写入和目录捕获，不适用于这项部署维护能力。

## 原子关系的证明义务

令 H(o) 表示 Identity 中原操作 o 的 held，T(o) 表示目标终态，Q 表示资格仍满足。两个存储域各自提供原子提交。

- 预留保持：reserve 成功建立 H(o) 与 Q；所有改变该资格的真实 Identity 写者，在相关 H 非空时不能完成变化。
- 释放前提：H(o) 只能在 T(o) 为 committed 或 aborted 时结束。T 不可逆，且绑定唯一原操作内容。
- 目标写前提：设置效果与 T(o)=committed 由同一事务建立，前提是该原操作尚无终态。若 T(o)=aborted，则该事务不能成功。

由此，若设置在时刻 t 新提交，H(o) 不能已结束：如果已结束，目标此前必有终态，而新提交要求尚无终态，矛盾。H(o) 在 t 仍保持 Q，所以该设置提交没有使用已经撤销的资格。若撤权先完成，则没有可用 held 允许之后的新提交。撤权不会推翻先前已经完成的设置效果。

待决门另保护进展：撤权开始排空后不再接受重叠的新预留。在目标最终恢复、恢复调度公平且工作集有限的前提下，已有预留可到终态，治理操作可进行最终授权判断。这里不承诺永久存储故障下的有限撤权延迟。

这些论证依赖所有真实写者参与、不可伪造的装配能力、完整绑定核对和存储原子性。有限模型只检查抽象交错；实际源码、旧组合退役与恢复尝试代际需要真实 SQL 测试和独立评审。模型与具名负控归 [验证资源](../../settings/verification/README.md#资格协调模型)。

## 验证与采用边界

本包已有真实 Identity SQL 与 Settings 两域组合场景，也有持久独立目标、目录和终态的真实 SQLite/Worker 场景。默认 guard 夹具与真实目标拥有者须分开判断；真实资产、设置、Identity 三者组合的场景由 assets-local 拥有。命令、资源和限制见 [测试说明](../tests/README.md)。

上述资源不授予独立接受、系统采用或轨道集成。最终 UI、tools 与 Cordis 插件、Calendar 消费、远程认证和物理断电恢复不在本包交付声明内。
