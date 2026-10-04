# model-profile-directory v4 候选实现增量

## 输入与边界

本增量接续 [v3 投影](v3-design.md)，不改写旧采用版本。基线为 `omne-harness-lite-design-2026-09-15`，消费已登记的候选 [capability.model-profile-directory/v4](../../../../spec/capabilities/model-profile-directory/v4/contract.md) S-1～S-38 与 [data.model-profile/v4](../../../../spec/data/model-profile/v4/contract.md) S-1～S-33。两份契约尚未接受；[D-096](../../../../record/decisions/model-profile-input-limits-product-adoption/decision.md)只接受 PF-013 rev 14 产品规则，不接受本节点。

源码 `packages/model/model-profile-directory` 已存在；本次核对基线为 `be026d6cc430a891177035a046a4d8aa8a4530a7`，此前节点中的“尚未建包”是历史状态。当前源码仍消费 v3。下文源码名称用于定位已有实现；其 **v4 投影、尚未实施的改动均为候选**，不声称新的签名已经存在。

保留 P-1 权威目录与本机凭据插件、现有三个服务键和十个操作。输入供给与上游事实只是同一档案的字段，不产生新服务、fiber、表或模型认证平台。既有五个公开判定函数继续独立取用；公开 `ProfileRow`、`ProfilePatch`、`OfficialManifest` 沿 `@omne-harness-lite/model-profile` 的 v4 类型消费新增字段，不在目录复制类型或 Schema。共同约定为 core 包根出口切换 v4，并为旧精确消费者保留显式 v3 子路径；本目录新读写只消费根 v4，不同时提供一套 v3 目录服务。目录不做 token 计量、实际输入读取、上下文装配或发送准入。

## 契约到 Cordis 的投影

表内未另标明的条款均为目录 v4。“兑现点”是候选施工位置，不是符合性声明。

| 契约责任 | 插件／服务／操作 | 兑现点与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-14、S-18、S-31、S-36(1～3)；data S-32、S-33 | P-1 内容写入、启动清单 | `input.ts` 的 `parseContent` / `parseManifest` 与 `runtime.ts` 完整结果校验统一消费 core/model-profile v4 表示及数值判定；`parsePatch` 允许整项替换 `upstreamInputLimits` | MP4 核心实现与本增量采用前受 G4-1 阻断；V4-1、V4-2 |
| S-34、S-36(2～3) | 同一 `CatalogImplementation` 写事务 | 保留配置历史判重；新增字段纳入 `contentEqual`；任何非法完整结果在写入前拒绝，批量中业务拒绝沿现有 `Rejected` 异常使整个事务回滚 | 不把输入 cap 纳入配置修订值，不删历史；V4-3、V4-7 |
| S-16、S-17、S-36(4、6) | `modelCatalog` / `modelCatalogRead` 共用读实现 | `records.ts` 无损解码完整行；`readProfile` 一次读事务，`listProfiles` 一次快照读后全部验证才返回；不能提供完整 v4 值的存储行映射既有 `unavailable` | 当前 `decodeProfile` 的 `StorageDefect` 会被外层抛出，必须新增局部失败区分，不能直接沿用；V4-4 |
| S-36(5)、S-37；data S-11、S-28 | 更新、清单处置与建档 | `equality.ts` 的 `upstreamEqual` 补第六项 `upstreamInputLimits`；集合／对象／精确数值相等沿现有比较；`runtime.ts` 写入时校验时钟不早于旧 `updatedAt` | 当前 `this.now()` 未比较旧值，不能只加字段就声称满足时标；V4-5 |
| S-18、S-36(3、4)、S-38 | 清单、更新并发 | 保留 `model_manifest_state(id=1)` 与档案行的现有事务和锁定读；清单各行、配置历史、序号、处置同提交 | 真实 SQLite 交错与进程中断验收 V4-6、V4-7；不以 Cordis 串行保证替代存储 |
| S-36(6～7)、G-12 | 存储版本处理及装配切换 | 不默认升级存量；旧行显式补全之前读面不可用。完整升级来源与执行由 G4-2 承接；已取得快照保持原值 | 新库完整 v4 写读可独立实施；旧数据升级不能由类型替换自动完成；V4-8 |
| S-12、S-19～S-23、S-34、S-35 | 原凭据及生命周期路径 | 本增量不改 `localCredentialLookupPlugin`、共同 Unit 引用匹配、准入关闭／排空、提交后撤回通知 | 继承 [v3 设计](v3-design.md) 与 [D-075](../../../../record/decisions/model-credential-source-projection/decision.md) 的边界，不提升凭据或跨进程交付状态；V4-9 |

## 持久化、并发与失败

### 已有存储对象与要求

存储继续是 [core/storage](../../core/storage/design.md) 的独立抽象；本稿不新增数据库选型。单机验证使用已采用的 [storage-sql](../../infra/storage-sql/README.md)。下表为源码实际已有对象；v4 不改其身份或引入新列。

| 存储对象 | 本增量要求及对应条款 |
|---|---|
| `model_profile`：复合主键 `scope_layer, organization_id, account_id, route_name`，值列 `profile_json` | 无损保存整个合法 v4；更新锁定同一主键行后比较并替换整个 JSON。唯一约束、持久性与错误可识别保持；S-14、S-31、S-36(1～5) |
| `model_profile_configuration`：同档案主键加 `revision`，值列 `values_json` | 档案与配置修订事实在同一写事务提交；改变 cap／事实不修改同修订的 configuration.values；S-34、S-36(3) |
| `model_manifest_state`：`id=1`，`ordinal_json, dispositions_json` | 发布者锁定此行，再读官方档案；整份清单、档案与历史事实共同提交。失败不能推进序号或返回半份处置；S-18、S-36(3)、S-38 |
| `model_credential_binding`：租户主键与 `credential_ref, bound_at` | 无 v4 字段变化；现有绑定写者和本机凭据读取者仍共同触碰此行，后者沿原 StorageUnit 锁定读取再核对副本来源，不退化成读后另开事务；S-19、S-20 |

目录三条内容写路径没有新增跨 owner 同提交要求。组织权限现读仍是现有前置条件，不声称与档案提交串行化；模型注册表和 session 历史不参与目录事务。存储提供者须继续支持写事务回滚、锁定读、范围内唯一约束、单快照列表与持久提交；目录本身的进程内计数器仅管理排空。

更新仍按“输入结构 → 授权 → 锁定解析 → 完整结果 → 配置历史 → 提交”；新增数值关系检查不得提前读取被保护旧值。`inputConstraints`、`upstreamInputLimits` 整项替换，不做深合并。输出上限例外沿原条款，不扩散为输入字段不可改。清单中的非法项使整份拒绝；授权失败、输入失败、不可用和缺行保持可区分。

六项时标比较不变时保留旧时间；变化时必须取得不早于旧值的时刻。同精度相等允许。若本次时钟早于旧值，按时钟无法提供合规时刻收成 `unavailable`，在零写入或事务回滚后返回；不伪造递增一毫秒。这是主线确认的 S-36(5) 与 data S-11 的失败投影，不增加失败值；未知提交仍沿原存储和调用结果责任，不冒充已回滚。正常更新和清单共用此判定。

旧行处理必须区分“物理行不存在”和“有行但无法提供合法 v4”。后者由目录解码边界发出具名内部失败（名称候选），公共读面转为 `unavailable`，诊断只记录失败类别，不回显整行；JSON、身份或完整值不能交出时同样不得成为半份成功。不能把所有存储缺陷全局吞成业务失败。`listProfiles` 在整次读取成功前不发布任何行；当前 `map` 的一次性返回方式可保留。

### 存量切换

`model_profile_directory_v3` 是既有建表迁移名，不是行的语义版本证明；不得改写已经应用的迁移。`profile_json` 已能容纳新字段，无需为本增量造新表。完整 v4 校验是新读面的门，不从缺字段猜 `unknown`，也不把现目录值写回旧调用快照。

有存量时，装配在开放 v4 读面前须提供经核实的**逐行完整升级内容及来源**，覆盖受影响范围，包括已撤回行；升级要保留身份、在册状态、配置修订历史与历史调用。候选执行路径是关闭准入、排空原目录后，在现有存储写事务中锁定并核对原行，再提交显式完整结果；同一次升级失败全部回滚。它是部署升级任务，不新增目录公开操作、后台猜补器或常驻服务。正式官方内容仍由发布者给出，涉及新发布清单的序号、处置须走既有清单规则；不得在升级脚本内伪造一次清单成功。具体输入、旧值比较和清单切换顺序在 G4-2 尚未交付前，**不宣称旧库可升级**；新库 v4 目录不受此实际资料缺口阻断。

### 两条反例交错

1. A 更新同一档案 cap／事实，B 更新该行另一份完整值。若 B 在事务外读取旧值、A 提交后 B 只写局部字段，就可能得到混合状态；必须在同一行锁后读、校验完整结果并整体替换。V4-6 用两个独立数据库连接控制交错，接受串行结果或明确不可用，拒绝混合值。
2. A 清单已写第一条档案及配置历史，B 列表读取，随后 A 在第二条拒绝或被进程终止。B 只能见 A 前的整份提交快照或 A 成功后的整份快照；A 失败时档案、历史、序号与处置都不能残留。V4-7 包含事务屏障、故障注入与关闭重开；先顺序写后顺序读不能覆盖此窗口。

## 依赖、装卸与取舍

Cordis 继续采用 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。P-1 必需依赖 `storage`、`clock`、`memberships`，本机凭据插件只必需依赖 `storage`；类型／校验的 v4 依赖是包依赖，不是新服务。配置错误继续启动失败；可缺席的工厂凭据不算配置错误，调用时按原目录失败集合收场。

机制依据为 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)，均有 4.0.4 probe。`provide` 纳管沿既有实现和 kernel-basis probe；尚无对应 basis 条目，不新增上游保证。

| 装载贡献 | 拥有者及可用时点 | 失败与撤除配对 |
|---|---|---|
| 目录实例、管理／读服务 | P-1；检查存储并完成合法清单装入后 provide | 初始化失败不发布服务；已成功提交的事实不回滚成旧快照。`OperationOwner.close()` 拒绝新工作并等待已接纳操作跑完各自事务 |
| `credentialLookup` 及借用的 reader | 原本机凭据插件；原表检查后 provide | 保持旧准入／排空机制，不关闭装配拥有的凭据组件；本增量不改变来源核对 |
| 数据库、时钟、迁移输入及密钥 | 归装配；目录只借用 | 装配须先观察目录排空再释放存储；Cordis effect 并发释放不能代替该顺序。档案、历史和清单状态永久保留 |

| 关键选择 | 落选方的最强论证 | 本方弱点与置信度 |
|---|---|---|
| 同目录值扩展，保留插件／服务 | 独立限制服务可单独更新策略 | 目录仍需随 data 契约升级；但本次没有独立事实或生命周期，新增服务只增加一致读取边，置信度高 |
| 复用完整 JSON 行及既有事务 | 拆列便于 SQL 检索与约束 | 完整值校验依赖 core 校验器；当前无按限制检索需求，拆列增加同步责任，置信度高 |
| 显式升级，缺完整值时不可用 | 自动填 unknown 可快速恢复旧库读取 | 需要发布者提供真实来源及有限 cap；自动补全不能兑现 data S-32/S-33，置信度高 |

## 归装配及缺口

| 缺口 | 条款与受阻消费者 | owner 与闭合条件 |
|---|---|---|
| G4-1：v4 契约与本投影未采用，core v4 校验未交付 | S-36；所有 v4 目录消费者 | 主线完成契约及投影采用；core/model-profile owner 交付合法类型、完整校验与数值比较，再显式切换目录依赖 |
| G4-2：存量完整升级资料及执行证据未交付 | S-36(6～7)、G-12；现有库升级 | 正式清单 owner／装配 owner 提供逐行来源和完整值、清单切换策略；目录实施者提供原子升级验证，不能假设旧库为空 |
| G4-3：新增存储、时标与读取失败分支尚未验证 | S-36～S-38；新目录供给与 runtime v6 选择 | 本包实施者完成 V4-1～V4-9，补开源包 README 与 README_ZH 的完整 v4 建档／整项替换／失败示例 |
| G4-4：产品装配的存储、时钟、身份和发布来源 | S-22、G-7、G-9；产品中心／据点 | 继承 [tenancy-host](../../../apps/tenancy-host/README.md)、[cli](../../../apps/cli/README.md) 的边界与缺口；开发示例可验单机组合，不能代替产品装配采用或跨进程协议 |

本增量不增加证据绑定；验收义务见 [verification](verification.md#v4-候选增量2026-09-28)。
