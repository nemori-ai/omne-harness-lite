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

## 已采用的准备操作恢复边界

本节规定动态治理提交需要满足的恢复边界。上文描述的现行提供者尚未实现根操作与准备 attempt 分离，不能据本节声称该保证已经可用。动态采用与来源保留的共同责任归[治理贡献协议](../../docs/governance-contributions.md)。

Settings 区分目录捕获、业务根命令和一次准备 attempt。目录捕获只取得受保护读数，不创建配值根或源修改门。change 与维护 rebase 都必须绑定一个不可变根命令，并通过精确 attempt 提交。维护主体仍归部署拥有者；维护能力不能绕过当前目标、采用与来源事实。

Settings-local 在 Identity 的 opaque targetRef 中编码版本化恢复引用。引用使用封闭种类区分 capture 和 attempt。Identity 只保存、核对和交回该引用，不拥有 Settings 操作种类。普通目标可以合法使用 catalog 这个 policyId，因此 resolver 不得从 policyId 或 ID 前缀推断操作。

capture 的外层 operationId 是 captureId。attempt 的外层 operationId 是提供者分配并持久保存的精确 attempt ID，其引用还绑定根操作、根命令摘要、命令种类及目标。values 与 authority 的区别由捕获输入摘要绑定。重新准备不得改变原命令的 expectedRevision、来源、目标或内容。

Identity 的去重身份不含 destination。因此单独注册两个 destination 不能证明两个操作已经隔离。Settings 的逻辑终态键必须区分域、主体、操作种类和精确操作身份。同键异绑定应当冲突；存储缩短为摘要时仍核对保存的完整绑定。这个约束同时作用于正常提交、封口、原操作查询和重启恢复。

恢复入口只接受匹配固定装配的持久预留。合法 capture 进入独立捕获封口，合法 attempt 进入根操作终结组合。未知协议或种类、额外字段、非规范编码、不一致绑定及不可用存储均不能转入旧封口作为回退。入口返回 unavailable 时，Identity 继续保留 held。

attempt 封口必须在一次物理提交中组合 terminal、只读 intent-plan、source-retention 和 persistence。持有组织源门的修改被封口时，其根和 attempt 共同终结，并清除精确属于该根的门。源修改身份来自持久根及目标拥有者事实，不能由客户端布尔参数决定。旧 attempt 或旧 resolver 不能释放后继根的门。普通根的旧 attempt 明确 aborted 且根仍 pending 后，可以沿原命令重新准备。unknown 不授予分配后继 attempt 的依据。

组织目的域固定为 system.settings 时，StandingBinding.scopeRef 仍保持真实主体的 tenantCodec 编码。组织适配器核验当前 organization-settings-manage 资格及目标所属组织。resolver 按持久绑定核对组织关系，不要求已撤权成员重新取得资格才允许封口。它是可信恢复能力，不能交给普通客户端。

切换恢复格式前，旧提供者必须停止受理，并由原 resolver 排空仍由它负责的 held。未能证明终结时不得宣称切换完成。不得猜测旧裸 targetRef 的操作种类，不得把旧终态改写为新 attempt，也不得删除仍有责任的记录。已确认业务结果和配值的迁移需单独验证。当前阶段不因此引入长期双协议兼容路径。

逻辑键的不同分量保证不同种类、主体、域和 attempt 不混同。该论证依赖规范编码、摘要抗碰撞、完整绑定核对和可信路由。既有来源保留模型固定了身份；它不能替代上述绑定精化义务。实现验收应分别制造去掉 kind、换 attempt、跨域、同名 catalog 目标、旧 resolver 清新门和 unknown 分配后继的反例，并用真实数据库观察效果。


恢复引用的内部编解码现位于 recovery-reference.ts。它严格接受 settings-recovery/1 的 capture/attempt 形状，要求规范 JSON，并按 Identity 的16384 UTF-8字节上限拒绝超限输入。恢复键区分完整域、主体、种类及精确操作身份。当前 resolver 与 terminal 仍使用旧路径，新编码尚未接入完整准备提供者；解码成功不证明资格或持久尝试存在。

目标投影现携带 enabled。Assets 的禁用目标保留管理读取及配值管理能力，运行捕获拒绝该目标。独立 Settings 目标在现行提供者中投影 enabled=true；retire、声明撤除和运行采用仍由各自状态决定，不能以该字段替代。snapshot 和 catalog 保留字段，公共条目以 targetEnabled 展示，避免与同名配置项混淆。

### 准备阶段与终态写入顺序

提供者必须先在目的事务保存根及preparing尝试，再向Identity或来源服务发起保留。该记录包含精确恢复地址、不可变命令及固定准备计划。活跃唯一性覆盖preparing、prepared和submitted。所有外部请求按原绑定认回；回执丢失不授予分配新attempt的权限。准备中的held检查点是保管事实，不是许可。最终ready事务须重新取得本域当前事实并核验完整保留绑定。

ready只读检查业务terminal仍开放，不能复用consume写入committed。正常业务提交先由只读commit-plan消费当前事实和本域状态，决定apply、abort-root或abort-attempt，再由terminal、source-retention和persistence共同落实。已确认业务失败属于这次事务成功保存的aborted结果，不能返回SQL conflict回滚后声称根已经终结。原配值决定继续复用Settings纯函数。

来源门的只读readiness投影先进入commit-plan，实际检查和清门由后续source-retention负责。同一事务内不允许它们之间插入另一写入。外部seal继续使用terminal、intent-plan、source-retention和persistence的既定组合。两种plan分开登记材料依赖，可共享纯读取/决定代码；不能用命令分支隐藏requiresFacts反向成环。数组排列不等于SqlStorage执行顺序。

当前这部分是持久提供者的实现义务。intent-migration与preparing-migration已安装基础关系及preparing字段，intent-records提供私有分配/读取写者。standing-custody已提供Identity完整请求和回执的私有保管写者。真实协调调用、来源保留、ready/commit组合和生产接线尚未完成。

### Identity请求与回执的持久保管

准备计划保存Settings比较依据。保管记录另保存完整Identity请求，包含固定destination、真实tenant scope、原principal、精确attempt、恢复封套、命令摘要和资格集合。两者不能互相替代。planned表示请求已保存，requested表示外部调用可能已经发生。持久化requested成功后，协调器才能发出reserve。

回包丢失后，协调器读回并重试同一个请求。Identity决定它是原held、已settled还是拒绝。Settings只核对并保存该结果。旧attempt结束后仍能接收其迟到回执，但不能恢复准备、修改后继attempt或重新授予权限。已有settled记录不接受迟到held回退，也不接受矛盾的终态。

保管模块不对外暴露客户端写接口。它消费可信参与者从Identity实际取得的回执；回执形状和可计算ID都不是授权证据。Identity的释放动作仍要求目的终态，保管写入不能替代该验证。当前测试覆盖真实reserve与丢失回包后的重试，终态回执和旧attempt场景使用夹具。完整终态路由与生产协调尚须组合验收。
