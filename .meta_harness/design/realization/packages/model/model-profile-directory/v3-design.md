# model-profile-directory v3 候选实现增量

本页为候选，未接受、尚未建包。只增补 v3 的绑定读写、历史判重与独立单机验收读面；[v2 已接受设计](design.md)不被原地改写。全文插件、服务、方法、配置、表和列名均为**候选**，已有契约操作名除外；不把待实现签名当作已存在 API。

## 输入、范围与实现路径

坐标基线均为 `omne-harness-lite-design-2026-09-15`：[capability.model-profile-directory/v3](../../../../spec/capabilities/model-profile-directory/v3/contract.md) 和 [data.model-profile/v3](../../../../spec/data/model-profile/v3/contract.md) 起草时为 candidate，现已由主线 [D-070](../../../../record/decisions/model-adaptation-binding-acceptance/decision.md) 接受并登记；这不接受本提供者候选，也不自动升级 v2 消费者。产品来源沿目录契约的 PF-013 rev 13、PF-001 rev 19、PF-002 rev 20、PF-016 rev 8；本轮机制输入为[适配提案 revision 2](../../../../record/proposals/model-request-adaptation/design.md)及[已提交求值读取链](../../../../record/proposals/model-request-adaptation/read-projection.md)。后者不赋予本节点资产求值责任。

保留 P-1 权威目录插件和旧 P-1r 的独立生命周期划分；P-1r 的中心/据点协议仍受阻。主线明确的本轮接线是 P-1 提供管理面和同存储 `modelCatalogRead`，P-1r 的本机装法只提供 `credentialLookup`，不装中心连接和刷新。**独立评审后修订**：本机取值必须解析实际当前 CredentialRef，并由保管方核对副本对应同一引用；仅复用 readReplica(tenant) 不足。本页给出有限的提供者替代方案，依赖 CCL 新候选增量，尚不能据旧接口实施本机 tenant 成功路径。旧完整据点装法不改。源码位置仍为 `packages/model/model-profile-directory`，尚不存在。

采用 Cordis 4.0.4 的依据是 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)。档案验证与无损 JSON 复用 `packages/core/model-profile` 对 v3 的显式实现；目前 v3 采用与实现仍待主线完成，不从旧包存在推定。持久性只依赖 [core/storage 协议](../../core/storage/design.md#协议)，时钟用 [infra/clock](../../infra/clock/README.md)，不在目录节点新增数据库选择。独立验收按主线范围使用已采用的 [infra/storage-sql](../../infra/storage-sql/README.md) SQLite 文件库；其采用版本、方言、耐久档位仍由该提供者和装配声明，SQLite 结果不外推 PostgreSQL。

目录只实现目录契约已有十个操作与通知；不新增适配注册、版本回收、模型认证、配置 TTL 默认值、凭据保管或资产求值 API。公开的五个判定函数沿 [v2 公开面](design.md#公开面)，加入对 v3 完整绑定的透明搬运，历史判重不被包装成无状态 data 校验。

## 契约到 Cordis 的投影

下表的 S-n 均为目录 v3，另标 data 的为档案 v3。表中“兑现点”是实施责任，尚无代码或运行证据。

| 契约责任 | 插件／服务／操作 | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5、S-14、S-34；data S-29～S-31 | P-1 `modelCatalog.registerProfile` | 入口调用 v3 表示校验；授权后在一写事务内建立档案及配置修订事实 | 完整绑定与模型 ID 对齐归 core/model-profile v3；历史比较归目录；V3-1、V3-2 待执行 |
| S-31、S-34 | P-1 `modelCatalog.updateProfile` | 锁定既有档案，整项应用 adaptation，验证完整档案，再查历史并同提交写入 | 不做嵌套补丁、不删 adaptation、不改身份；仅绑定变更不动 updatedAt；V3-3 |
| S-15、S-33、S-34(6) | P-1 `withdrawProfile`／`relistProfile` | 只改同一档案的 registration；不删档案或配置修订事实 | 撤回不是删除；不存在 delete API；V3-4 |
| S-8、S-18、S-34 | P-1 插件体中的 `loadManifest`，不暴露服务方法 | 清单状态行排序；新序号全部条目、判重事实、序号与处置一次提交 | 先处理原样重放／旧序号／同序号不同内容，再对可采用新序号查历史；V3-5、V3-6 |
| S-6、S-16、S-17、S-34(1) | `modelCatalogRead.readProfile`／`listProfiles`，与 P-1 管理读面共用实现 | 同一权威存储，readProfile 精确引用；listProfiles 一个只读事务读租户、所属组织、出厂三格 | 没有名为 readCatalog 的替身面；当前档案含完整 values，无历史读取 API；V3-7 |
| S-10、S-11、S-13 | P-1 方法的授权前置与 `memberships.standing` | 必需 inject，消费 `capability.organization-governance/v1#S-26` | 输入／结构禁令在先；需要 protected 行的判断在授权后；成员现读不是目录提交的一部分；V3-8 |
| S-7、S-19、S-32 | P-1 `bindCredential`／`unbindCredential` | 租户键绑定引用与 boundAt 独立于 profile；只在目录自己的写事务内换／删绑定 | 组织、出厂不在写入域；不在此销毁凭据本体；V3-9 |
| S-12、S-19、S-20 | P-1 `modelCatalogRead.credentialPresent`；P-1r 本机装法的受限制 `credentialLookup.value` | value 经包内受限绑定读取取得实际 ref；CCL 新候选端口锁定该绑定行并核对副本 sourceRef，引用匹配才交出 body | 旧 S-12/S-13 没有 ref，不能兑现；新端口、捕获来源与 CCL 投影受 G3-7 阻断；V3-9、V3-14、V3-15 |
| S-21 | P-1 提交后 `profile.withdrawn` 通知 | 沿用 emit，发送边界捕获监听者异常并记录结构化错误 | 不携带 adaptation/configuration/凭据；不以通知投递承担正确性；V3-11 |
| S-23、S-34(6) | P-1 必需依赖重跑、持久读回 | 插件体可重入；清单原样装入认回；所有判重事实在存储 | 沿旧调用跑完各自提交，不虚构 Cordis 自动取消；V3-12 |
| S-35 | 发布者注册 → 目录提交采用 → 显式停止旧准入 | 目录仅承担中间一个耐久提交，不 inject 适配注册表 | 未注册绑定结构合法也可保存；停止旧准入不回写档案；V3-13 |
| S-34(7)；data S-30 | 可信发布入口及受治理的自建档案写入口 | 只接收声明式数据，不导入模块、求值代码或解析凭据 | 任意字符串秘密不可由 Schema 识别，接收边界要求见 G3-4；不因 schema 通过宣称全闭合 |

### 服务与依赖

P-1 的管理面仍为 `modelCatalog`；只读面仍为 `modelCatalogRead`；取值仍单列 `credentialLookup`，不把凭据值塞进目录 read/list 返回值。`loadManifest` 只在发布配置对应的插件体中、所有服务 provide 之前执行。配置重装和官方新版本采用复用这条入口，不另造“热更新目录”事件。

本增量候选配置为显式模式枚举，替代把不同装法隐含在运行时可达性里的做法：

| 配置（候选） | 提供的键与 required 依赖 | 适用范围 |
|---|---|---|
| P-1 `faceMode: management` | modelCatalog；storage/clock/memberships | 原中心装法，不提供据点键 |
| P-1 `faceMode: singleProcessCatalog` | modelCatalog、modelCatalogRead；同上 | 本轮独立验收；credentialLookup 必须由下面本机装法单独提供 |
| P-1 `faceMode: developmentBaseFaces` | 原 serveBaseFaces=true 的三个键；同上 | 保留旧开发形状的投影；不与 P-1r 同时启用，不作为本轮凭据成功路径 |
| P-1r `mode: localCredentialOnly` | 只提供 credentialLookup；必需 inject 与 P-1 相同的 storage；借用装配唯一拥有的 CCL model-only 技术组件；不装 centerConnection、刷新组件或完整 credentialCustodian | 本轮本机候选路径，CCL 增量尚未采用，G3-7 未闭合前不得以旧 readReplica 替代 |
| P-1r `mode: fullOutpost` | 原 modelCatalogRead、credentialLookup；原 storage/centerConnection 必需边 | 旧完整据点范围；受原 G-7 阻断，本轮不启用 |

装配在应用插件前验证枚举及键的唯一性，并据枚举选择声明好 required 依赖的插件入口；不在一个已注入 centerConnection 的 fiber 内“跳过”它，也不声称 Cordis 有条件 optional inject。无默认模式；拼写错误、重复键、localCredentialOnly 搭配 developmentBaseFaces 都使装配启动失败。上述是候选配置投影，未实现接口不预设为真实 API。

| 依赖 | 解析方式／精确消费 | 换代、缺席与旧引用 |
|---|---|---|
| `storage` | 必需 inject；[存储要求](#对存储提供者的要求) | 缺席 PENDING；换代重跑 P-1；已进入的事务由原存储实例按协议完成或明确失败 |
| `clock` | 必需 inject；只用于契约要求更新的 Instant | 缺席 PENDING；换代重跑；不能拿时间戳充当配置修订历史或提交排序 |
| `memberships` | 必需 inject；organization-governance/v1 S-26 的精确答复 | 缺席 PENDING；失败 unavailable；不缓存授权到下一次操作，不把别的版本答复直接冒充 v1 |
| model-profile/v3、identity-values/v1、asset-model/v2 S-23、offer-expiry/v1 S-22 | 公开包依赖，版本逐项钉定 | 不因现有包默认出口升级就自动升级目录所消费语义；v3 profile 尚未采用为 G3-1 |
| 工厂凭据提供者 | 装配交给取值面的一次取值能力；秘密不进 profile/清单/日志 | 配置可缺席（S-7）；已配置但取值暂不可用返回 unavailable；未配按 S-20，不冒充配置错误 |
| 租户凭据保管组件 | 本机 P-1r 借用装配创建的 [CCL 新候选](../../infra/credential-custodian-local/v2-design.md) `./model-replica` 组件；同一实例也给 bootstrap 写入；不提供完整 credentialCustodian 服务 | 已选 tenant 而副本缺席、sourceRef 不等或旧副本未标引用均 credentialUnavailable；运行期密钥／存储不可用为 unavailable，不改取 factory；keyFile 配置及组件构造失败按启动失败，G3-7 |
| 本机 P-1r → 包内绑定读取 | 与 P-1 同一 storage；`./tx-reads` 候选入口按 tenant 读取实际 CredentialRef，仅 P-1r 与 CCL 本机增量可用 | 读取不可用不取任何值；无绑定且 official 才走 factory；有绑定把 tenant/ref 交 CCL 作最终一致读取。ref 不进入公开目录读面、日志或运行时响应 |
| 适配注册表 | **无依赖** | 目录不验证其当前可用性，不在其撤除时重写档案；运行时打开调用承担取得精确版本 |

机制依据：`plugin-body-reruns-on-provider-change`、`inject-has-no-optional-form`、`plugin-throw-fails-fiber` 和 `effect-disposal-concurrent-not-ordered` 均见 [basis](../../../../basis/README.md)，已记录 4.0.4 probe；其中“可选依赖”用调用时取用，不能写成 optional inject。不 inject、服务键分离或 isolate 都不是权限边界，限制取值消费者仍靠受信装配与有失败自测的结构检查。`ctx.provide` 纳管的 probe 在 kernel-basis，尚无同名 basis 条目；本稿沿既有已核读数，新的撤除组合仍列 V3-12，不能借旧 probe 证明目录实现。

本机取值必须区分目录选择的凭据格与保管方状态：租户格已选择但没有与当前引用匹配的副本，收为 credentialUnavailable；保管方不可用为 unavailable；两者均不能偷偷问 factory。仅在 S-20 已判定不存在租户绑定且 origin=official 时才允许装配出厂格；custom（包括组织建的档案）始终要求调用租户自己的值。**RefA→RefB 后仍取出 A 是本机 S-19/S-20 违反，不得推给中心传播 G-7**；下面的匹配读取必须在不具备 B 副本时拒绝，而非继续交 A。

### 当前绑定与副本引用匹配的有限替代

接口核对结论：credential-custodian/v2 S-12 只有 loginState/tenant/body，S-13 只有 tenant→body/absent；已接受 CCL 副本行只有 tenant、login_state、stored_at、sealed_body。两者都没有 CredentialRef。S-17 resolve 只适用于 MCP OAuth 条目，不能将模型值假扮为 OAuth 持有。**现有接口不足**；以下端口与列只是请求 CCL owner 起草的候选，不是对旧契约或旧设计的改写，也不是已存在 API。

| 有限候选 | 最强理由 | 不能承担的部分／代价 | 本稿处置 |
|---|---|---|---|
| 只在 credentialPresent 后调用 readReplica | 复用现有完整接口，读路径短 | 不知道读到的值属于 RefA 还是 RefB，严格顺序调用也可错 | 否决；原本机成功声明撤回 |
| 绑定一变就丢租户副本，仍无 ref | 缺副本时自然拒绝，可减少旧值窗口 | 旧 A 的延迟 storeReplica 仍可在 B 绑定后写回；清除通知／两次事务无法证明来源 | 否决；不得以清理事件替代引用相等 |
| **副本保存来源 ref，捕获写入比较当前 ref，读取再匹配** | 保留一个租户一条副本的现有生命周期；能从共同持久对象排序绑定变化、捕获与读取 | 需 CCL 新提供者增量、内部端口及跨 owner 存储要求；旧无 ref 副本不能直接复用 | 有条件推荐，置信度高；G3-7 闭合前不可实施成功分支 |

候选动作链：

1. **捕获来源**：受信写入者拿到的是同一来源结果中的 `(tenant, expectedRef, body, loginState)`；expectedRef 必须是该 body 所属的真实引用。不得先取 A 的 body，再在提交时读取最新 RefB 并把 A 标成 B。来源真实性及登录状态归属继续是写入边界义务；当前 storeReplica 的签名表达不了这一关联。
2. **写副本**：CCL `./model-replica` 候选端口 `storeBoundReplica({ loginState, tenant, sourceRef, body })` 接收上述来源，其中 sourceRef 即可信来源的 expectedRef；在自己的 atomic 单元中调用目录的 `readCredentialBindingIn`，锁定 `model_credential_binding` 的 tenant 行，比较当前 ref 与 sourceRef。相等才把 source_ref、sealed_body、login_state、stored_at 整行写入；成功为内部 `{ stored: true, tenant }`，不相等／绑定已删则 `{ stored: false }` 且不写。它是受限技术投影，不扩写 CCL2 S-12 的领域失败集合，也不假称调用旧 storeReplica 已保留引用。
3. **读当前绑定**：P-1r 的 value 开启一次 atomic，调用真实 `readCredentialBindingIn` 取得实际 ref，并把同一个 unit 交给第 4 步，不以 credentialPresent 作为解值依据。包内读取不把引用暴露给 modelCatalogRead 或任意第三方；无绑定才允许继续 S-20 的 factory 分支。body 只能在外层 atomic 成功返回后交给运行时，不在 unit.afterCommit 通知中传秘密；退出／提交失败不得交出已暂取 body。
4. **匹配读取**：CCL `./model-replica` 候选端口 `readBoundReplicaIn(unit, tenant, expectedRef)` 在同一显式 StorageUnit 内经 `readCredentialBindingIn` 锁定实际绑定行，再核对 CCL 自己的副本；当前绑定 ref、expectedRef、副本 source_ref 三者精确相等才开封交出 `{ body }`，返回不含 ref。当前绑定漂移、条目不存在、无 source_ref、不匹配或打不开均 `{ absent }`，目录映射 credentialUnavailable；真正读不到／保管方不可用仍 unavailable。参与操作异常离开 atomic 后才映射，不捕获后继续提交。不得自动改用当前租户最新条目或重新取 ref 后静默重试。
5. **密码学关联及所有权**：CCL 负责 source_ref 与 tenant 进入封存的认证数据；目录不持有明文、密钥或 CCL 写权限。引用不能出日志、错误 cause 或用户返回。CCL 仍拥有副本清除与登录状态归属，目录只拥有绑定。旧未标引用密文不能由读取时贴上当前 ref“升级”，必须重新取得可信来源。

读路径的最终选择点是第 4 步持有绑定行锁时对副本的读取；在此之前 RefA→RefB 必须导致 A 被拒绝。选择点之后的绑定变化不把已经取得的值重新标成 B，也不在本节点制造新的回滚／取消承诺。未来跨进程取证仍须独立协议，但同机路径没有“等将来同步”的旧值豁免。

StorageUnit 采用 [core/storage 的显式共同事务增量](../../core/storage/design.md)：owner 入口用 unit.run、assertStorage 核验同一个存储实例，按序 await unit.mutate／query，不嵌套普通 Storage.read/write，不保存或并行借出 unit。**同一 Unit 本身不保证两个 SQL 读属于相同快照**；其 query 只是写事务的只读类型视图。此方案依靠真实绑定行锁阻止 bind/unbind 和来源捕获在两次读取之间改变选定 ref，在该锁期间读取副本；没有锁的“同 Unit”不足以通过 V3-15。副本清除可以先于或后于读取发生，按已读到的那一行／缺席收场，不会换成另一 ref 的值。

目录 `./tx-reads` 候选导出 `createCredentialBindingReader(storage)`，返回 `readCredentialBindingIn(unit, tenant)`：闭包持有所注入的实际 storage，在 unit.run 内 assertStorage，再 unit.mutate 锁真实 tenant 行，unit.query 返回内部 `{ binding: { credentialRef, boundAt } }` 或 `{ absent }`，读故障沿存储错误协议抛出。锁持有到 unit 结束；即使无行也不得拿缓存 present 顶替。**构造工厂与执行返回闭包是不同许可**，不能以 subpath 整体允许／禁止代替下表。

| 候选 symbol | import／构造／持有许可 | 执行许可与输出去向 |
|---|---|---|
| 目录 `createCredentialBindingReader` | 可信装配 bootstrap 可 import 并以真实 storage 调用，取得真实闭包并传给 CCL/P-1r；目录包拥有实现 | 只有该构造调用获许可；bootstrap 不因此可调用返回的 reader 或取得 CredentialRef |
| 返回的 `readCredentialBindingIn` | 装配仅负责传递；CCL 作为显式函数依赖接收，不反向 import 目录；P-1r 借用 | 仅 CCL 模型副本技术组件、P-1r 可执行。ref 仅供锁定比较／本次取值，不交 bootstrap、runtime、管理或呈现 API |
| CCL `createModelReplicaCustodian` | 可信装配 bootstrap 可 import 并构造唯一组件，交入真实 reader；其他方只借用已构造组件 | 构造及生命周期资源归装配，不把构造许可扩大成取值许可 |
| 组件 `storeBoundReplica` | 可信 bootstrap 持有写入能力；未来目录送达入口须由其明确的采用另行具名 | 本轮仅 bootstrap 执行，持真实 sourceRef/body，结果不包含凭据值或引用；不向产品 caller 开放 |
| 组件 `readBoundReplicaIn` | P-1r 获得本次取值所需借用能力；CCL 拥有方法实现 | 仅 P-1r 调用；CCL 方法体可执行传入的 reader。成功 body 只沿 credentialLookup 交给 runtime 的本次 dispatch |
| 组件 `close` | 装配唯一 owner 持有 | 仅装配清理链执行；P-1r、bootstrap 的普通写入逻辑和产品 caller 不关闭共享组件 |

结构检查按 symbol 与调用点约束：允许 bootstrap 构造并传递真实闭包，同时用失败自测拒绝 bootstrap 执行 reader/readBoundReplicaIn、产品 caller 导入工厂或取值、P-1r close 共享组件，以及把闭包转交给未具名消费者。允许构造不授权换成恒值 reader；制造假闭包仍被真实制品与故障测试拒绝。同进程结构约束不是 Cordis isolate 或安全沙箱。

装配把此真实闭包传给候选 `createModelReplicaCustodian({ storage, clock, keyFile, readCredentialBindingIn })`；CCL 不反向 import 目录包、不复制目录私表布局，目录可以 import CCL 的 `./model-replica`，没有包依赖环。禁止给厂函数传恒值、内存镜像或 fixture reader。**装配是此组件唯一 owner**，bootstrap 和 P-1r 借用同一实例；P-1r 重跑不得自行创建第二份、提前 close 共享组件。model-only 组件要求已有合格 keyFile，不自动建钥，不注入或伪造 MCP 绑定读面，不 provide 完整 credentialCustodian；完整 CCL2 六操作与 MCP OAuth 原路径保持独立。旧 generic storeReplica 写入无 sourceRef，必须清除旧来源标记，防止把新 body 误贴成前一次 ref；它不能用于本机匹配成功路径。完整技术面、封存及模式范围归 [CCL 候选增量](../../infra/credential-custodian-local/v2-design.md#公开技术面与旧六操作的关系)。

## 状态、并发与失败映射

### 持久对象与写权

| 候选对象 | 写入者与内容 | 保留边界 |
|---|---|---|
| `model_profile` | P-1；当前 ModelProfile 及其完整 adaptation | identity 为现有范围＋routeName；撤回不删行；不存完整历史快照 |
| `model_profile_configuration` | P-1 三条内容写路径；键为档案完整身份＋configuration.revision，值为精确 JSON 对象 | 只追加首次成功采用的事实；同修订不同值拒绝；撤回、恢复、重启与迁移都不清除 |
| `model_manifest_state` | P-1 loadManifest；单一最高 ordinal 与该次 dispositions | 与官方档案和新增配置判重事实同提交；重放返回原处置 |
| `model_credential_binding` | P-1 bind/unbind；租户身份、CredentialRef、boundAt | 与配置历史不同生命周期；unbind 仅删绑定，不动档案、历史或凭据本体 |

configuration.values 必须以无损 JSON 读写；不得经过 IEEE-754 有损解码后再持久化。值相等采用 data.model-profile/v3 S-29：对象键顺序无关、数组顺序有意义、十进制数按精确数值、boolean 与 number 不混同。存储可以保留严格文本及经验证的比较表示；摘要只可加速，不能用摘要相同替代完整值比较。实际 codec 沿 core 数据包的公开入口，不在目录另定义 JSON 代数。

### 单次提交如何排序

三条内容写路径由**同一个目录 owner**触碰共同存储对象：档案身份的 `model_profile` 行、对应 `model_profile_configuration` 事实；新档案还依赖相同身份的唯一约束。同档案 update 在已有档案行上锁定后，才读其判重事实；register 的首行竞争由唯一约束排序，语句级冲突依 core/storage P-2 在同一事务内恢复后重读；official loadManifest 先锁 `model_manifest_state`，再处理该次全部官方档案与事实。没有以进程内互斥、clock.now 或缓存“见过某修订”充当持久排他。

两条必须真跑的交错：

1. 两个目录实例针对同一档案、同一新配置修订，分别提出 X／Y。A 成功提交档案和 X 后，B 从共同对象读到 X 并以 malformed 拒绝 Y；B 先提交则对称。不能出现两次成功、profile=Y/history=X，或失败操作先占住修订名。相同值仍由原 register/update 认回规则裁定，不额外制造重复失败。
2. A 的新清单中含两条档案，第一条历史写入完成后、第二条发生修订冲突／存储失败；B 经另一个连接读目录和序号。B 只能看见提交前完整状态；A 不得留下第一条历史、部分官方档案或新 ordinal。A 在提交后丢回执、重启原样重装时，则须返回已记 dispositions，不重复通知。

与 organization-governance 的成员现读没有同提交要求（S-11）；不声明成员撤销与目录写入原子排序。与适配注册提供者也没有同提交要求（S-35）。**本机凭据增量确实存在跨 owner 的共同对象**：P-1 bind/unbind 修改 `model_credential_binding` 的 tenant 行，CCL 捕获副本锁定同一行并写 `credential_custodian_replica`；两者共享同一 storage 约束域。CCL 匹配读取也锁定该行，再读取绑定和副本。不能以先读布尔值、进程锁或两个独立事务的隔离级别替代。

凭据必须额外验证两种交错：① A 捕获持锁先提交、随后 bind RefB 提交，之后读取 RefB 与副本 RefA 不等而拒绝；② bind RefB 先提交，A 的延迟捕获才取得锁，发现 expectedRefA≠currentRefB 而不写。RefB 副本已写入后，A 的延迟捕获不得覆盖它。绑定在匹配快照之后变化时，只允许交出该快照已经选定的 A，下一次读取必须看到 B 或具名失败；不能声称无并发。

### 判定次序和故障

沿 S-13 及各操作 ⑥，不新增拒绝值：register 在授权与存储可读后、名字占用前查配置历史；update 在授权、行解析、完整文档校验后查历史；loadManifest 先做序号认回／拒绝，再查新序号条目历史。历史不可读或写不持久返回 unavailable，不当作首次采用。存储不可用映射 unavailable，约束冲突按被命中的已知约束同事务重读；其他 StorageDefect 不折成业务不可用。

本机凭据技术面的结果／异常由 [CCL 新增量的失败表](../../infra/credential-custodian-local/v2-design.md#失败观测与生命周期)拥有；本节点把它消费为目录 S-20 的既有结果，不由实施者另选：

| 边界与结果／异常 | 目录或装配的明确处置 |
|---|---|
| createModelReplicaCustodian 配置、已有 keyFile 或依赖构造失败 | 可信装配启动失败，不 provide 本机取值面；不以缺省密钥、完整 CCL 或 factory 回退掩盖 |
| storeBoundReplica `{ stored: true, tenant }` | bootstrap 记本次发布成功，不记录值或 ref；P-1r 不消费该写结果 |
| storeBoundReplica `{ stored: false }` | bootstrap 识别来源已漂移／绑定缺席，本次未写；不把它当成功、不改读面、不隐藏重试 |
| storeBoundReplica `{ failure: invalidInput }`／`custodianWithdrawn`／`unavailable` | bootstrap 分别按输入拒绝、组件已撤除、依赖不可用处置；不承诺初始化成功。sourceRef/body/loginState/tenant 非法为 invalidInput，已 close 为 custodianWithdrawn，写入所需 key/clock/storage 不可用为 unavailable；写入异常映射在组件自己的 atomic 结束之后。撤除中事务没有结论时沿 CCL S-20 为 custodianWithdrawn，不能据此声称确定未提交；判定次序及未知提交边界沿 CCL 表 |
| readBoundReplicaIn `{ body }` | 等外层 atomic 成功返回，再交 `{ scope: tenant(T), value: body }`；若退出／提交失败，不交 body |
| readBoundReplicaIn `{ absent }` | 外层 atomic 正常结束后，目录返回 `{ failure: credentialUnavailable }`；包括绑定已变、无行、无来源、错来源或打不开。始终不问 factory |
| readBoundReplicaIn 因 closed、运行期 key 不可读、StorageUnavailable 抛出的 StorageUnavailable | 原异常逃出 unit.run 和外层 atomic，完成回滚后才调用现有 core/storage 的 `mapStorageError(error, 'unavailable')`，得到目录 `{ failure: unavailable }`；不转换成 absent 或 credentialUnavailable |
| read 的坏 tenant／expectedRef、错误／过期／跨实例／重叠 StorageUnit | 属内部接线或状态缺陷，抛 StorageDefect，不映射为目录业务拒绝。外部传入 value 的 tenant/origin 非法仍由 P-1r 在进入该路径前按 S-20 返回 invalidInput；内部坏 ref 不能冒充用户输入错误 |
| 参与 read 的 UniqueViolation、ReferenceViolation、StorageDefect 或其他非预期异常 | 此只读组合没有对应业务恢复分支，原异常须逃出 unit.run 使共同单元失败，直到 atomic 终结后再以脱敏形式抛出／记录；不 catch-all、不当 unavailable/absent。store 的未知约束冲突也不得改报 stored:false |
| clock 暂不可用但读取已有副本 | readBoundReplicaIn 不消费 clock，不把存储中已有匹配副本误判不可用；clock 只影响 store 所需时间取得 |

共同单元内不做会吞掉异常的结果转换：CCL 参与函数、目录 reader 与 P-1r 均保持原异常传播，**先污染并回滚 atomic，后由最外层按异常类型映射**。StorageUnavailable、UniqueViolation、ReferenceViolation、StorageDefect 在最外层诊断／继续上抛前剥除 cause 与动态详情，只保留安全的类型及允许的约束标记；不提前包装成普通成功值。依赖故障不触发 factory、中心请求或旧副本回退。构造和取值均不声称“返回取消”已使实际单元结束。

对于撤回后“再建同名”，本契约没有物理删除：仍是同一身份，register/relist 沿既有规则，历史不能重置。本稿不设计物理删除或删除后的身份重生；验收只要求提供者不得清除既有判重事实。

官方清单仅绑定变化时 disposition 为 updated，updatedAt 仍遵守只反映五项上游属性的规则。旧序号与同序号不同内容返回 manifestNotNewer，哪怕所携配置也与历史冲突，不能抢先改报 malformed。官方发布不读取或改写 custom 行及其历史。一个未注册但结构合法的绑定可以被采用，随后运行时取得失败是 unavailable，不是 profileNotFound 或 withdrawn。

## 对存储提供者的要求

旧 [R-1～R-8](design.md#存储要求)继续对应 v3 同号条款；这里是增量，不复制数据库协议或写具体 DDL。

| 编号 | 要求及共同对象 | 条款／实施方 |
|---|---|---|
| R3-1 | 档案与其新增配置修订事实同一写事务；official 清单还包含 `model_manifest_state`。失败不留任何子集 | directory v3 S-14、S-18、S-31、S-34(5)；本节点迁移与存储 provider |
| R3-2 | 配置事实的复合身份全部非空，并有唯一性约束；新档案身份竞争与历史判重可在同一事务内排序 | S-34(4)(5)；沿旧 R-2，不能让 factory 的 null 漏过唯一性 |
| R3-3 | 既有档案锁定读；清单状态锁定读；冲突语句失败后同一事务可继续读。所有实例共享这些持久对象 | S-14、S-18、S-31；core/storage P-2 及锁协议；SQLite／pg 由各 provider 兑现 |
| R3-4 | 判重事实与档案持久同寿，禁止级联删除历史；重启、撤回／恢复、迁移不得清空。迁移不得凭新默认值改释已有配置 | S-5、S-23、S-34(6)；本节点迁移片段＋装配升级守卫 |
| R3-5 | configuration.values 严格无损存取；快照读出的 profile 与 adaptation 是同一已提交版本，不拼接两个时刻 | S-16、S-17、S-34；data S-29、S-30 |
| R3-6 | 可辨认的不可用；history 缺表、不可读或写失败不得返回空历史／空目录。部署 schema 不匹配在启动诊断中显露 | S-9、S-34(5)；存储错误协议与装配就绪检查 |
| R3-7 | CCL 新候选与本节点共用 `model_credential_binding` 的 tenant 行作为冲突对象；bind/unbind 的写入与副本捕获／匹配读取的锁定读排序。CCL 副本写入原子包含 source_ref/body/loginState/time；匹配读取在同一 Unit 持有绑定锁期间读绑定和副本 | directory S-19、S-20；与 [CCL K-M1/K-M2](../../infra/credential-custodian-local/v2-design.md#存储要求与模式范围) 互指，采用与真实证据为 G3-7 |
| R3-8 | 包内目录绑定读取受限：只交真实 tenant/ref 与缺席／不可用，不缓存、不返回给公开读面；CCL 通过相同 storage 的显式事务读取，不自行复制另一份绑定表 | directory S-7、S-12、S-20；与 [CCL K-M1/K-M4](../../infra/credential-custodian-local/v2-design.md#存储要求与模式范围) 及其函数依赖互指，`./tx-reads` 读权限、迁移装配共同核对 |

这四类目录持久对象仍由本节点拥有写权；CCL 只在受限端口中锁定读绑定行，不取得绑定写权。R3-7/R3-8 与 CCL K-M1/K-M2/K-M4 的候选反向引用已形成，尚未接受或验证。与成员表、会话日志或适配注册内存表没有新跨 owner 外键要求。

## 成对的装载与撤除

| 装载取得／贡献 | owner 与可用时点 | 部分失败 | 撤除与仍为真的事实 |
|---|---|---|---|
| 配置与三条 required 依赖 | P-1 fiber；配置 shape 通过、依赖 ACTIVE 后执行插件体 | 非法配置启动失败；缺依赖 PENDING，验收装配不打开入口 | 撤除不清存储；配置没有 secret value；可选 factory 未配不是失败 |
| 目录迁移片段 | 本节点导出，装配合成，storage provider 执行；P-1 不私自建表 | 依整体升级守卫撤除／恢复，guard.confirm 前不受理 | 本节点不删除表；guard 的确认或恢复结果由装配负责记录 |
| 清单装入 | P-1 在 provide 前作一次耐久提交 | invalidInput/unavailable 抛出、启动失败；manifestNotNewer 沿既有策略记 error 并继续服务 | 成功提交是外部持久事实，后续 provide 失败也不撤销；同清单重跑认回 |
| modelCatalog 及模式开启的读／取值键 | P-1 fiber，在清单步骤完成后发布；本轮 singleProcessCatalog 不提供 credentialLookup | provide 失败由 fiber 收掉已发布贡献；不回滚清单 | 新解析失效；已开始的方法跑完各自一次提交；静止由其实际完成确认，不声称内核取消 |
| 本机 P-1r 的 credentialLookup；借用 model-only 保管组件 | 独立 P-1r fiber；storage 就绪、装配交入有效组件且 CCL 技术投影已采用后才提供服务；clock/keyFile 与组件归装配 owner | 缺必需配置／组件构造失败即启动失败；运行期依赖故障 unavailable，不切 fullOutpost 或 factory；重复服务键启动失败 | P-1r 停新取值并跟踪外层 atomic 实际完成；不 close 借用组件。装配单一清理链等 runtime、P-1r、bootstrap 已开始操作实际结束，再 close 组件，最后关 storage/clock；副本持久保留，不依赖多个 disposer 顺序 |
| 每次取值取得的凭据值 | 凭据保管方拥有本体；本次取值结果交给 runtime 本次 dispatch | 无法取得即具名失败，不切换其他格 | 不留到下一次取用；目录不拥有凭据持久副本，不在 dispose 销毁本体 |
| 提交后通知及结构化诊断 | P-1 发通知；持久诊断 sink 归装配 | 监听者／sink 故障可见，不改目录已提交事实 | 没有自建后台刷新计时器；诊断 owner 不随目录 fiber 销毁；不依赖多 disposer 完成次序 |

配置错误遵守同批启动失败政策；旧 manifest 被拒是具名业务结论，不算非法配置。若存量 v2 custom 档案没有 adaptation，不能自动猜模型策略或替换“最新版”：迁移必须由有权者明确给出 v3 绑定，否则该 v3 启动／迁移受阻；官方档案由明确发布清单提供。没有目录源码的事实不代表用户持久数据可任意重建。

## 关键选择比较

| 本候选选择 | 落选方最强论证 | 本方弱点与改选触发 | 置信度 |
|---|---|---|---|
| 单 owner、一条 P-1 fiber 内保留目录与配置修订事实；不拆“配置历史服务” | 历史服务可独立伸缩、供多个 owner 复用 | 同节点承担额外持久增长；当前无历史公共消费且要求同提交，拆分会新增协调。若有独立历史契约与公共消费者才重查 | 高 |
| 抽象存储上的独立 append-only 判重事实，不只比较当前 profile | 当前值足以发现本次就地复用，少一个持久对象 | 需长期保留精确 JSON；当前值无法发现 c1→c2→c1 改义，故节省存储不满足 S-34 | 高 |
| 本轮使用 P-1 同存储真实读面，不建立单机复制表 | 复用 P-1r 可提前覆盖未来分布式接口 | 与 memberships 的必需注入链联动重跑；范围只到独立验收，不能声称远程协议已实现 | 高 |
| 沿 storage/clock/memberships 必需 inject；注册表不 inject | 全部改调用时取用可减少重跑；inject 注册表可阻止不可用绑定写入 | 重跑半径保留，必须靠持久幂等收口；注册可用性不能越权成为目录写前置 | 高 |
| 登记、采用、停止旧准入分开确认 | 单次发布事务更易给出“一键更新”用户体验 | 发布者承担分阶段失败；当前没有可共同提交的注册持久对象，不能以胶水制造原子性 | 高 |
| 取值服务独立，可信装配与结构检查限消费 | present/value 一个服务最直接且少一层接线 | 多一个候选键；进程内受信组件可反射解析，键隔离并非安全沙箱 | 中高 |
| 本机 P-1r 使用受限绑定读取＋CCL 同 Unit 锁定引用匹配 | credentialPresent＋readReplica 能复用现有公开面 | 增加受限跨包技术接口、共同存储要求和锁开销；旧方案连无并发的 RefA→RefB 都不成立，不能继续采用 | 高 |

## 归装配及缺口

| 编号 | 归属、缺口或待核对主张 | 受阻消费者／闭合条件 |
|---|---|---|
| G3-1 | 主线：D-070 已接受 v3 契约；尚需 core/model-profile v3 实现及本候选独立架构评审／采用 | 目录 v3 开包与所有 v3 runtime 消费；本稿不作接受 |
| G3-2 | 主线与凭据 owner：credential-custodian/v2 G-7 不收中心引用解值；中心 P-1 管理绑定可实现，但中心取值仍 unavailable。本机成功路径另受 G3-7 阻断 | 中心 CredentialRef→body 成功、中心同步及轮换传播；不得以本地种子副本验收冒充它们 |
| G3-3 | 独立验收装配 owner：节点尚未指定；须选择 storage/clock/成员 v1 读面、合成目录迁移、提供官方清单唯一 ordinal 源、入口核实 TenantId；可信本机 bootstrap 持有与实际 body 对应的 sourceRef，CCL 新受限端口建立加密副本；目录绑定经真实 bindCredential 提交。两 owner 使用同一 AtomicStorage，选择两键唯一的本机模式，全部必需 fiber ACTIVE 后 guard.confirm 再受理 | 本地真实读面、tenant/custom 成功路径、目录持久性与正式验收；不以 self-asserted TenantId 授权；bootstrap 是显式本机来源，不冒称中心送达协议 |
| G3-4 | 本节点与写入口 owner：data S-30 禁秘密／代码。目录不执行 configuration 内容；入口只能提交经治理的声明式值，不能开放导入任意租户模块。Schema 不能证明任意字符串没有秘密，接收边界与检测／拒绝范围须有明确输入政策和反例 | 面向非受信写入者的通用配置入口；本稿不发明内容扫描的完全性，V3-10 只覆盖明确哨兵与禁止路径 |
| G3-5 | 本节点与存储 owner：V3-1～V3-16 均未运行，尚无源码；真实并发、崩溃点、无损数值、清单整批失败、许可与异常回滚必须取得实际证据 | 本候选全部实现符合性，bindings 仍 0 |
| G3-6 | 保留旧 MPD-N2／N6：G-7 远端新鲜度、凭据传播未定；不带 thisArg 的通知范围仍为旧 H-7 待核对主张 | 产品 cli 的 P-1r，以及任何新跨租户通知监听／转发者；本轮不接这些监听者、不宣称闭合 |
| G3-7 | [CCL 新候选](../../infra/credential-custodian-local/v2-design.md) 已成稿，保留 CCL2 六个领域操作；实际引用捕获／匹配及 R3-7/R3-8 反向存储要求已对齐，尚未独立复审采用与实施。旧 storeReplica/readReplica 不能顶替 | 本机 tenant/custom 凭据成功路径；两节点需验证同一 Unit、读取权限、漂移拒绝、无 ref 条目失败、可信来源与唯一生命周期 owner。若无法作为提供者精化承载，由主线决定契约演进，本文不造第七领域操作 |

诊断按[全局可观测性](../../../../foundation/observability-and-logging/requirements.md)及[适配提案](../../../../record/proposals/model-request-adaptation/design.md#可观测性)：记录操作类别、授权／提交／认回／拒绝、适用范围、配置修订标记、清单序号和具名失败；不记配置 values、CredentialRef、secret 或请求正文。作用域身份只在受治理日志中关联，不成为高基数指标标签。sink 失败不改已提交结局，sink 生命周期、权限、限额和留存归 G3-3 装配。诊断不代替配置历史或目录权威存储。
