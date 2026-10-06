# model-profile-directory 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`capability.model-profile-directory` v2](../../../../spec/capabilities/model-profile-directory/v2/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的插件名、服务名、方法名、表名与列名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**自建两个插件。**P-1 的全部写操作都是单次存储提交，没有跨提交的在途状态（契约 S-23），形状与 [organization-governance](../../tenancy/organization-governance/design.md) 同类：一个插件、一条 fiber、失败值是闭合字面联合、写后再 `emit` 通知。

- **复用**：档案与建档内容的形状、表示层校验（`data.model-profile`）由同批纯模块 [`packages/core/model-profile`](../../core/model-profile/README.md) 给（一契约一包，D-060 §八 M41）；`CredentialRef` 的形状（`data.asset-model/v2#S-23`）由 `packages/core/asset-model` 给；身份值与 `Instant` 由已实现的 [`identity-values`](../../core/identity-values/README.md)、[`offer-expiry`](../../core/offer-expiry/README.md) 给；插件层共用件 `definePlugin`、`resolveOptional`、`Outcome` 取 [kernel-basis](../../../../../../packages/core/kernel-basis/README.md)；存储走 [core/storage 协议](../../core/storage/design.md#协议)。
- **成员资格判定**取已实现的 [organization-governance](../../tenancy/organization-governance/README.md) 的 `memberships.standing`（契约依赖钉 `capability.organization-governance` v1 的 S-26；那个节点按 v2 修订后，S-26 在两版同文，钉 v1 的调用拿 v1 的答复——同一提供者双版本服务的规则见 [OG v3 第十三节](../../../../spec/capabilities/organization-governance/v3/contract.md#十三版本差异与规范工件)，由装配绑定）。
- **不在本节点**：凭据本体的保管（契约 S-2：保管方归提供者设计）。**据点一侧接口已定**：`capability.credential-custodian` v2（[S-12](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-12-storereplica) `storeReplica`、[S-13](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-13-readreplica) `readReplica`、[S-15](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-15-discardloginstate) `discardLoginState`），P-1r 经它存取租户那一把的副本（D-060 §八 M47）；真承接者未到，最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#实施缺口与消费者影响) 已立（candidate；副本以密文落在据点 `storage`、本机只放 `keyFile`）；**中心一侧本版不收**（那份契约 [G-7](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)）——P-1 在中心把引用换成值没有保管方可调（缺口 MPD-N1）。中心 ↔ 据点的线上形状（契约 G-7）。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：目录本身是一份有状态的权威（档案行、凭据绑定、清单序号都在存储里），只以服务面存在；**它的几条判定是可单独取用的纯函数**，不依赖 Cordis、会话、租户或存储。档案与建档内容的形状、表示层校验本来就在纯模块 [`packages/core/model-profile`](../../core/model-profile/README.md)，那一层全部即公开函数面。名字全部**候选**，**全部尚未实现**。

**公开函数面**（本包入口导出）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `scopeChain(tenant)` | 由 `TenantId` 派生范围链（租户格 → 组织格 → 出厂格） | [S-6](../../../../spec/capabilities/model-profile-directory/v2/contract.md#s-6-范围链)；`data.identity-values/v1` |
| `winningRow(rows, routeName, allowed)` | 链上各格的行 → 一个路由名的胜出行（在册且范围允许）；`allowed` 由调用方交 | S-17 末段；[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：本版 `allowed` 就是那一格登记的全部档案 |
| `manifestDisposition(loaded, manifest)` | 已装入状态与一份清单 → 逐条处置（新增、更新、撤回）或 `manifestNotNewer` | S-8、S-18 ④ |
| `configEligibility(initiator, scope, standing)` | 配置资格：先比发起者与格，再看调用方交来的成员资格答复 | S-10；`standing` 的答复形状照 `capability.organization-governance/v1#S-26` |
| `credentialSlot(binding, origin, factoryConfigured)` | 取哪一格的那一把、「有没有」怎样答（不碰值） | S-20 ④ 的判定部分 |

**Cordis 服务面**：P-1（中心，`modelCatalog`）与 P-1r（据点，`modelCatalogRead`、`credentialLookup`），[下节](#插件服务键与配置)。两个插件的每条判定都调上表的同一个函数。

**只在运行时层成立、函数层不承诺**：同一范围内路由名唯一（S-5、S-14，R-2）；清单序号单调、只由发布装入（S-8、S-18 ②）；每道写准入现读成员资格（S-11）；秘密只在取值问法里出现（S-12——函数面根本不碰值）；`profile.withdrawn` 必发（S-21）；据点副本与凭据副本（P-1r）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **只公开判定的纯函数，目录本身只有服务面**（选）；落选：导出一个 `createModelProfileDirectory(storagePort, clock, standing)` 闭包，服务面包它 | SYS-OPEN 说核心能力是独立函数闭包；给一个存储端口就能在别处起一份目录，服务面也只是一层包装 | 外部要一份目录只能装插件、或自己按判定函数与契约写一份存储层 | 中：目录是治理事实的权威，路由名唯一与清单单调都落在存储约束上（R-2、R-4），闭包化只是把存储换成端口、约束仍要端口兑现——那一层包装没有独立的边界价值；「调用模型」那一侧的函数面在 model-request-runtime 的 `invokeModel`，目录只供它两样输入 |

## 契约到 Cordis 的投影

### 插件、服务键与配置

| 单元 | 插件与服务键（候选） | 必需 inject | 调用时取用（`resolveOptional`） | 配置（`definePlugin` 的 `Config`） |
|---|---|---|---|---|
| **P-1**（中心） | 插件 `model-profile-directory`；provide `modelCatalog`；`serveBaseFaces` 为真时另 provide `modelCatalogRead`、`credentialLookup` | `storage`、`clock`、`memberships` | 中心一侧的凭据保管方：**本版没有契约**（`capability.credential-custodian` v2 只服务据点，它的 G-7）——不取用任何服务，取值问法在中心恒 `unavailable`（MPD-N1） | `officialManifest`：这一次发布的官方档案清单 `{ ordinal, entries }`（发布物，由装配交入）；`factoryCredentialRef`：出厂格那一把的**引用**（可缺席，缺席即部署没配）；`serveBaseFaces`：必填布尔 |
| **P-1r**（据点） | 插件 `model-catalog-read`；provide `modelCatalogRead`、`credentialLookup` | `storage`（只读副本）；`centerConnection`（`capability.center-connection/v2` [S-9](../../../../spec/capabilities/center-connection/v2/contract.md#s-9-reachability) `reachability`：三态与 `reachCount`；**只是观察面**——向中心发请求归未来资产/据点入口（版本未分配） 的据点客户端，真承接者未到，那份契约 G-1、cli 的 C-4；最小提供者节点 [`center-connection-probe`](../../infra/center-connection-probe/design.md#实施缺口与消费者影响) 已立（candidate）：产品装法 `center-connection-probe` 按公开体检自己探，验收装法同包 `center-connection-replay` 按脚本回放对端行为） | `credentialCustodian`（`capability.credential-custodian/v2` [S-12](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-12-storereplica)、[S-13](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-13-readreplica)；D-060 §八 M69 定名）：租户那一把的据点副本经它落地与读取（M47）。接口已定、真承接者 `infra/secrets` 未到，最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#实施缺口与消费者影响) 已立（candidate） | 中心地址等连接参数（归 [cli](../../../apps/cli/README.md) 装配） |

- **一个 Context 里这两个服务键只有一个提供者**：产品装配（[cli](../../../apps/cli/README.md) 据点）装 P-1r、没有 P-1；中心装配（[tenancy-host](../../../apps/tenancy-host/README.md)）装 P-1、`serveBaseFaces: false`；`serveBaseFaces: true` 只供尚无节点的开发装配（D-060 §八 M65），那时不装 P-1r。同一标签下重复 provide 会在装配时抛错（basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) 的 probe ②），错配在启动时暴露。
- **配置错误一个政策**（与 tenancy 各节点、kernel-basis 同一条）：`officialManifest` 外层形状不对、`serveBaseFaces` 缺席 ⇒ 内核让 fiber `FAILED`、不 provide（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）⇒ 装配启动失败。清单条目的表示层校验在 `loadManifest` 里做（它拥有那条判定），不过 ⇒ 插件体抛出 ⇒ 同一收场。**`factoryCredentialRef` 缺席不是配置错误**：契约 S-7「部署装配可以给出厂格配一把」，没配就是 `{ present: false }` 那一支（草图 N-9：缺了就抛等于把可选做成必需）。**凭据的值不进配置**，只有引用；值每次经保管方现取，轮换零重载（N-9）。

### 三个服务键：取值问法单列

契约 S-12 要「取值问法只由模型请求运行时调用，单机由装配保证」。草图把「有没有」与「取值」都放在 `credentialLookup` 上；本节点把「有没有」移到读面、`credentialLookup` 上**只留取值**。

| 服务键（候选） | 方法（候选）与所对应的契约操作 | 谁 inject |
|---|---|---|
| `modelCatalog` | `registerProfile`、`withdrawProfile`、`relistProfile`、`updateProfile`、`readProfile`、`listProfiles`、`bindCredential`、`unbindCredential`、`credentialPresent`（≡ `resolveCredential(…, present)`） | 中心的管理面与治理面（未来资产/据点入口（版本未分配） 的路由，未起草） |
| `modelCatalogRead` | `readProfile`、`listProfiles`、`credentialPresent` | 模型请求运行时（展示列表按每一条的来源问「有没有」）、据点交付面（「有没有、哪个范围、什么时候配的」） |
| `credentialLookup` | `value(tenant, origin)`（≡ `resolveCredential(…, value)`） | **只有模型请求运行时**：静态检查候选规则（同 OG 的 `restricted-call-sites`）——只许 `packages/model/model-request-runtime` 解析这个服务名；随 M47 加一条：P-1r 的副本表（`model_catalog_replica`）与两个读面的返回类型都不含凭据值与引用，**据点上的值只经保管方落地、只经 `credentialLookup.value` 读出**；随 [D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩ 再加一条：**保管方的 `readReplica` 只许 P-1r 调**（`credentialCustodian` 的其余消费者——MCP 桥——只许调 `depositOAuth`、`resolve`；保管方契约 [S-19](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行） |

| | 两种问法同在 `credentialLookup`（草图） | **取值单列（本方）** |
|---|---|---|
| 「只有运行时够得着取值」在单机怎样兑现 | 据点交付面要显示「有没有」，就得 inject `credentialLookup`，于是也够得着取值——装配给的这一条只能靠约定 | 够得着取值的服务名只有一个消费者，结构检查就能守 |
| 落选方最强论证 | 契约 S-20 是一个操作两种问法，一个服务键对一个操作最直接；少一个服务面 | — |
| 本方弱点 | — | 一个契约操作拆到两个服务面上；「有没有」在 `modelCatalog` 与 `modelCatalogRead` 各出现一次（同一个实现） |

置信度：中高。

### 官方清单只经插件体装入

`loadManifest` **不在任何服务面上**：P-1 插件体在 `provide` 之前对 `officialManifest` 调它一次。契约 S-18 ②「单机由装配保证只有发布动作够得着它」于是由结构兑现——没有别的调用路径；发布动作就是「带着这一版清单启动中心」。

- **插件体会重跑**（`storage`、`clock`、`memberships` 任一换代，basis `plugin-body-reruns-on-provider-change`）：同一份清单再装一次按契约 S-18 ⑦ 返回记下的那份处置、不写任何东西、不发事件——重跑安全。
- **三种收场**：`invalidInput`（条目不合形状、路由名重复）⇒ 抛出 ⇒ `FAILED` ⇒ 启动失败，**整份不装**；`unavailable` ⇒ 抛出 ⇒ 启动失败（存储都读不到，中心本来也起不来）；`manifestNotNewer` ⇒ **不抛**，记一条 error 级结构化日志事件（候选名 `model_profile.manifest_not_newer`，带已装入序号与本次序号），照常 provide。

| `manifestNotNewer` 时 | 启动失败 | **记 error、照常服务（本方）** |
|---|---|---|
| 目录状态 | 不变 | 不变（契约：什么都不写） |
| 回滚部署时 | 中心起不来：一次为修 bug 的二进制回滚变成整个中心停摆 | 中心照常；目录保留新清单装入的结果 |
| 落选方最强论证 | 错误尽早暴露：带着旧清单启动说明发布流程出了错，不该默默跑 | — |
| 本方弱点 | — | 发布流程的错只在日志里；运维要看 error 级事件才知道 |

置信度：中。旧清单被拒是契约写明的具名结论、不是配置错误，所以不落进「配置错误即启动失败」那一条；清单序号由谁给是契约 G-9。

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5 档案行；行不删 | 表 `model_profile`（R-2）；**没有删行的写路径**；撤回与恢复只改 `registration` | 尚未实现 | 场景 S-25 |
| S-6 范围链 | 输入只收 `TenantId`，链在方法内派生；列表与读面只查这三格 | 同上 | 场景 S-28、S-30 |
| S-7 凭据绑定 | 表 `model_credential_binding`（R-5）；出厂格那一把只在配置里（引用） | 同上 | 引用不出任何读面 |
| S-8 清单与序号 | 表 `model_manifest_state`（单行，R-4）：已装入最高序号与那一次的处置 | 同上 | 场景 S-27（含重启一支） |
| S-9、S-13 失败与判定次序 | 各方法返回闭合字面联合（`Outcome`），判定次序照各操作 ⑥；授权依赖 `unavailable` 即刻收场 | 同上 | 场景 S-30 故障注入一支 |
| S-10 配置资格 | 一个谓词函数：先比 `initiator` 与格（不读存储），再调 `memberships.standing` | 同上 | `ineffective` ⇒ `notAuthorized`，失败支 ⇒ `unavailable` |
| S-11 每道准入现读 | 每次写操作调一次 `standing`，**不在提交里**（契约写明的窗口） | 同上 | 没有跨 owner 的同一提交（见[下文](#跨-owner-的同一提交没有)） |
| S-12 秘密只在取值问法 | 读面返回类型里没有凭据值与引用；值只在 `credentialLookup.value` 的成功返回里 | 同上 | 场景 S-29 ＋ 静态检查（读面返回类型不含这两样） |
| S-14 `registerProfile` | 写事务：插入行 → 唯一冲突（R-2）⇒ **同一事务里**重读那一行判「认回」还是 `routeNameTaken` | 同上 | 依 [core/storage](../../core/storage/design.md#协议) 协议 P-2「语句级失败不废事务」；**pg 上由 [infra/storage-sql](../../infra/storage-sql/README.md) 承接**（语句级失败要回到保存点才能在同一事务里接着读，D-060 §八 M65）；场景 S-26（真并发） |
| S-15、S-33 撤回、恢复 | 写事务：`lockRow` 那一行 → 读 → 改 `registration`；撤回真的发生了才在提交之后 `emit` | 同上 | 场景 S-25 |
| S-16、S-17 读、列 | `readProfile` 先按链判读边界（不读存储）再读；`listProfiles` 一次只读事务读三格 | 同上 | R-6 快照一致；覆盖规则 `落点(T, r, A)` 在读的一方求，本节点不开操作 |
| S-18 `loadManifest` | 插件体内；写事务开头 `lockRow` 清单状态行 → 比序号 → 算处置 → 写行与状态 → 提交 → 逐条 `emit` | 同上 | 场景 S-27 |
| S-19、S-32 配、解凭据 | 写事务：按租户主键写或删；同引用再绑、本来就没有即不写 | 同上 | 并发时后提交者生效（R-5） |
| S-20 取凭据 | `credentialPresent`：一次只读事务查绑定，没有则看 `origin` 与出厂格是否配了（`credentialSlot`）；`credentialLookup.value`：P-1 查绑定 → 中心一侧没有保管方可调（保管方契约 G-7）⇒ `unavailable`，**绝不落到出厂格**。P-1r（D-060 §八 M47）：`credentialCustodian.readReplica(tenant)`（[S-13](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-13-readreplica)）→ `{ body }` 即交回；`{ absent }` 时看 `centerConnection.reachability`：`reachable` ⇒ 向中心取值、`storeReplica(loginState, tenant, body)`（[S-12](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-12-storereplica)）再交回——**向中心取值与 `loginState` 的来路都在未来资产/据点入口（版本未分配）**（center-connection G-1、保管方 G-6），本版这一支走不通；`unreachable`／`undetermined` 且没有副本 ⇒ **`credentialUnavailable`**（P-2 记 `undispatched{credential_unavailable}`），不给「照常」——读作「这台机器上此刻没有可用的那一把」；`readReplica` 答 `unavailable` 或 `custodianWithdrawn` ⇒ `unavailable`（契约 S-20 ⑧；保管方 S-13 ⑧：「读不到」不是「没有」）；副本在中心可达时刷新（`reachCount` 变大即再连上过；节奏与轮换传播归未来资产/据点入口（版本未分配），C-4） | 同上 | 保管方缺席：中心 ⇒ `unavailable`，据点 ⇒ 没有本地副本，离线即 `credentialUnavailable`（MPD-N1；保管方 S-20 末条）；场景 S-28 |
| S-31 `updateProfile` | 写事务：`lockRow` → 读 → 应用 `patch` → 整份过 `data.model-profile/v2#S-24` → 写；五项上游属性变了才推 `updatedAt` | 同上 | 判定次序照契约 S-31 表后一段 |
| S-21 `profile.withdrawn` | 提交之后 `emit`，发送方包住监听者异常 | 同上 | [事件一节](#事件派发过滤与边界) |
| S-22 左列 | 见[装配给 vs 协议给](#装配给-vs-协议给) | — | 右列是契约 G-7 |
| S-23 | 全部事实在存储；无定时器、无跨提交在途状态 | — | [装卸表](#成对的装载与撤除) |

`updatedAt`、`boundAt` 取写事务里 `clock.now()` 的值（`now` 不后退由 [infra/clock](../../infra/clock/README.md) 兑现）。

### inject 边与换代时收掉的在途事实

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| P-1 → `storage` | 必需 | P-1 插件体重跑；**没有在途事实要收**：每个写操作单次提交，已开始的方法调用跑完、按它那一次提交收场（内核不取消在途调用）；`loadManifest` 重跑是幂等的 | S-23 |
| P-1 → `clock` | 必需 | 同上 | S-23 |
| P-1 → `memberships`（[OG](../../tenancy/organization-governance/README.md)） | 必需 | 同上；在途方法手里那份旧服务引用若已不可用，`standing` 以 `unavailable` 答，按契约收成 `unavailable` | S-23、S-11 |
| P-1（中心）：不取用保管方 | —— | 中心一侧没有保管方契约（保管方 G-7）⇒ 取值问法 `unavailable` | S-20 ⑧、S-23 |
| P-1r ⇢ `credentialCustodian` | 调用时取用 | 不重跑；缺席 ⇒ 据点没有凭据副本：中心可达时照问中心、不落本地，离线即 `credentialUnavailable`（M47，MPD-N1；保管方 S-20 末条）；撤除中答 `custodianWithdrawn` ⇒ 那一次 `unavailable` | S-20 ⑧、S-22 第 3 行 |
| P-1r → `storage`、`centerConnection` | 必需 | P-1r 重跑；副本在存储里，不丢；凭据副本在保管方里，也不丢。**断线不以换代表达**：`capability.center-connection` v2 [S-7](../../../../spec/capabilities/center-connection/v2/contract.md#s-7-在场不随可达性变) 承诺在场不随可达性变、自己探自己重连（S-6），否则每次断线都会连带模型请求运行时与 agent runtime 重跑（草图 inject 表） | S-23 |
| 模型请求运行时 → `modelCatalogRead`、`credentialLookup` | 必需（在那个节点） | 那个节点重跑、在途调用按它的契约 S-36 结算 | 那份契约 S-36、S-39 |
| 中心管理面 → `modelCatalog` | 必需（未来资产/据点入口（版本未分配），未起草） | — | — |

**单进程装配的代价写明**：`serveBaseFaces` 为真时，`memberships` 的提供者换代会连带 P-1 → 模型请求运行时 → agent runtime 一路重跑。**只用于尚无节点的开发装配**（D-060 §八 M65）；产品装配（cli）的据点由 P-1r 隔开这条链，中心装配不开 `serveBaseFaces`。

### 事件：派发、过滤与边界

- **发**：`profile.withdrawn`（契约 S-21 的事件名；Cordis 事件名候选同名），**`emit`、不带 `thisArg`**，在 `listed → withdrawn` 的提交之后发，载荷只有那条档案的 `ModelProfileRef`。发送方包住：监听者抛出的异常穿回发送方会截断本轮派发（basis [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md)），P-1 捕获后记 error 级日志、不改已提交的撤回、不重发（契约 S-21 三条负向承诺）。**必发**：没有监听者也照发。
- **不监听任何事件**。P-1r 本版也不监听（中心的通知跨不过进程，见下）。
- **F③ 能不能越过租户边界**：不带 `thisArg` 的派发对整棵 Context 树可见——这是**假设**（basis 未收录；工具拆分草图记为 H-7；按 D-060 §八 M65 登为 kernel-basis 待补 probe，任何监听者接上之前补上，缺口 MPD-N6），按它的保守读法：**中心进程里任何一个监听者都看得到全部租户的撤回**。本版这条事件**没有监听者**，载荷不含凭据与内容；中心进程里的监听者只能是系统组件。**要越过进程送到据点**（据点副本提前刷新），转发者必须按目标据点上会话的范围链过滤——自建档案的引用带着组织或租户身份，不过滤就把别的组织建了什么告诉了这个据点。这条义务落在未来资产/据点入口（版本未分配） 的转发上，是 G-7 的闭合条件之一（M65；本节点记在 MPD-N2 的闭合条件里），本版不转发。
- **F② 依赖消失时谁被卸载**：见上表；范围只及 P-1 与 inject 它的服务消费者，正确。

### 存储要求

对存储提供者（[core/storage](../../core/storage/design.md#协议)）的要求清单。表由本节点导出迁移片段（候选 `modelProfileDirectoryMigrations`），由[中心装配](../../../apps/tenancy-host/design.md#存储装配迁移由-owner-导出片段本节点合成)合成，与 organization-governance 同一做法。

| # | 要求 | 对应契约条款 |
|---|---|---|
| R-1 | 单次提交原子：一次写操作的多行写同成同败 | 全部写操作 ④；S-22「拒绝之后留下部分效果」 |
| R-2 | **`model_profile` 上 (范围键, 路由名) 唯一**，已撤回的行也占名。**范围键不得含空值**：出厂格要有一个非空的范围键值——SQL 里空值互不相等，出厂格的同名行会漏过约束。所在范围按身份值的分量分列存、复合成范围键（与 organization-governance 同一做法：`TenantId` 没有标量键） | S-5、S-14 ④、S-18 ④ |
| R-3 | 行锁：撤回、恢复、修订在写事务开头 `lockRow` 那一行，读—改—写不被交错 | S-15、S-31 ⑦、S-33 ⑦ |
| R-4 | 清单状态行 `model_manifest_state`（单行）：`loadManifest` 的写事务开头 `lockRow` 它；最高序号、处置与出厂格的行同一提交 | S-8、S-18 ④⑦ |
| R-5 | `model_credential_binding` 以租户为主键（一个租户至多一条）；引用列**不出任何读面** | S-7、S-19 ⑦、S-32 ⑦ |
| R-6 | `listProfiles` 在一次只读事务里读三格，同一个已提交快照 | S-17 ④ |
| R-7 | 提交成立后跨重启仍在 | S-23 |
| R-8 | 不可用可识别：`StorageUnavailable` ⇒ `unavailable`，不返回空结果、不折成 `profileNotFound` 或「没配」 | S-9、各操作 ⑧ |

P-1r 的副本表（候选 `model_catalog_replica`）由[据点装配](../../../apps/cli/README.md)合成迁移；它对存储的要求只有「单写者（P-1r）、只读副本、按中心提交序单调更新（R-9：一行只被更新的中心序号覆盖，不被更旧的覆盖）」——R-9 的序号从哪来是未来资产/据点入口（版本未分配） 的事（契约 G-7），**本版落不了**。**凭据副本不进这张表**：它经保管方落地（M47），对保管方的要求（加密、按登录状态归属、值不进任何输出）已由 `capability.credential-custodian` v2 的 S-6～S-8、S-12～S-15 接住；最小提供者把副本条目以密文落在据点存储（N-37 ⑤），与这张表同库不同表、**不共用约束域也不需要**——P-1r 读副本与写凭据副本之间没有「同一提交」（取值时副本表不参与）。

### 跨 owner 的同一提交：没有

契约 S-11 写明成员资格现读**不在**本契约的写入提交里（撤销管的是下一道准入），所以本节点不需要与 organization-governance 共同触碰的存储对象；同一格里的撞名、并发修订、并发绑凭据都是**单 owner** 的并发，由 R-2～R-5 在同一存储里排序。**不加进程内锁**：理由同 organization-governance（锁随插件实例生灭，重跑后新旧实例互不相知）；两位超管并发建同名档案的交错由 R-2 的唯一约束排序，是场景 S-26 要真跑的那一条。

### 装配给 vs 协议给

契约 S-22 左列，本版单机怎样兑现：

| 契约 S-22 的保证 | 本节点单机的兑现 |
|---|---|
| 同一范围内路由名唯一 | R-2；只有 P-1 写档案行，P-1r 的副本只读 |
| 在册状态变化之后按新状态准入 | **产品装配（cli）：协议给**——中心可达时经 P-1r 读中心，据点副本经保管方；新鲜度上界与单调读未定义，**受阻**（契约 G-7，MPD-N2）。`serveBaseFaces: true` 的同一存储直读只供尚无节点的开发装配（D-060 §八 M65） |
| 凭据值只在取值问法里出现 | 进程内只经 `credentialLookup.value` 交给模型请求运行时。据点落地按 D-060 §八 M47：P-1r 把租户那一把的副本经保管方落在据点（加密、按登录状态归属：保管方 S-6、S-7），取值先本地副本、中心可达时刷新；副本表与读面都不含值与引用。**保管方的最小提供者**按 N-37 ⑤ 把副本条目以密文落在据点存储、本机只放密钥；它装上之前据点没有副本，离线调模型如实 `undispatched{credential_unavailable}`（MPD-N1）；秘密从中心送到据点那一段归未来资产/据点入口（版本未分配）（C-4；保管方 G-6） |
| 取值问法只由运行时调用、来源如实 | 服务键 `credentialLookup` 只给运行时（静态检查）；`origin` 由运行时从绑定的有效模型引用取（它的义务），本节点照收 |
| 取哪一把 | 同一存储里读租户那一格；出厂格那一把的引用在 P-1 的配置里；租户那一格读不到 ⇒ `unavailable` |
| 出厂格那一把不可经写面改 | 它只在配置里，任何写方法的输入域里没有它 |
| 调用方身份已核实 | **归装配**：中心的入口层先把登录状态换成当前租户身份再调；本节点不核实身份值真伪，`modelCatalog` 不得直接暴露为终端 API（与 organization-governance 同一条） |
| 清单只由发布动作装入、序号单调 | 只在插件体里调、没有服务面；序号由发布物给出（契约 G-9） |
| 表示层校验 | 纯计算，在每个方法入口做 |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.organization-governance/v1` S-26 | 必需 inject `memberships`（[organization-governance](../../tenancy/organization-governance/design.md) 的 `standing`） | 每次写操作现读 | `unavailable` ⇒ `unavailable`，绝不折成 `notAuthorized` |
| `data.model-profile/v2` | 包依赖 `packages/core/model-profile` | 随包版本 | — |
| `data.asset-model/v2` S-23（`CredentialRef`） | 包依赖 `packages/core/asset-model` | 随包版本 | — |
| `data.identity-values/v1`、`data.offer-expiry/v1` S-22 | 包依赖 | 随包版本 | — |
| 存储（`storage`） | 必需 inject；R-1～R-8 | 换代 ⇒ 重跑 | 缺席 ⇒ `PENDING` |
| 时间源（`clock`） | 必需 inject | 装配启动时 provide | 缺席 ⇒ `PENDING` |
| `capability.credential-custodian/v2` [S-12](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-12-storereplica)、[S-13](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-13-readreplica)（据点一侧；中心一侧本版不收，那份契约 G-7） | P-1r 调用时取用 `credentialCustodian`；P-1 不取用 | 每次取值现取 | P-1：中心没有保管方 ⇒ `unavailable`。P-1r：`{ absent }` ⇒ 看可达性；`unavailable`／`custodianWithdrawn` ⇒ `unavailable`；缺席 ⇒ 没有本地副本，离线即 `credentialUnavailable`（M47）。**接口已定、真承接者未到，最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#实施缺口与消费者影响) 已立（candidate）**：`storeReplica`／`readReplica` 两行由它兑现（封存 AES-256-GCM、条目身份进附加认证数据、`absent` 与 `unavailable` 分开），本版只进验收装配、种子经 `storeReplica` 写 |
| `capability.center-connection/v2` [S-9](../../../../spec/capabilities/center-connection/v2/contract.md#s-9-reachability) | P-1r 必需 inject `centerConnection` | 每次取值、每次刷新前现读 | `reachable` 才去问中心；`undetermined` 与 `unreachable` 一样不去问（契约 S-9 ⑧：`undetermined` 不填成任何一边，这里两者都是「此刻没有依据去问」）。**向中心发请求不在这份契约**（它的 G-1）⇒ 本版读到 `reachable` 也问不了，P-1r 受阻（MPD-N2）。真承接者未到，最小提供者节点 [`center-connection-probe`](../../infra/center-connection-probe/design.md#实施缺口与消费者影响) 已立（candidate）：产品装法 probe（信任方式归 cli，它的 CNP-2），验收装法同包 replay 插件 |

**被谁消费**：模型请求运行时（`modelCatalogRead`、`credentialLookup`）；中心的管理与治理面（`modelCatalog`，经未来资产/据点入口（版本未分配）——未起草）。

## 状态、并发与失败映射

**写权**全在 P-1 的方法内；P-1r 只写自己的副本。**提交点**每个写操作一次；`loadManifest` 在插件体里一次。
**判定次序**照各操作 ⑥：结构性禁止与授权（不读存储的那一半）在前，读存储才判得出的值在后；成员资格判定 `unavailable` 即刻收场，不再判名字（契约 S-13 与场景 S-30）。
**失败映射**：`StorageUnavailable` ⇒ `unavailable`；`UniqueViolation`（R-2）⇒ 同一事务重读后判「认回」或 `routeNameTaken`；其余存储异常与读出的行形状不对 ⇒ 缺陷，上抛。保管方（P-1r）：`readReplica` 答 `{ absent }` ⇒ 按可达性走（上文 S-20 行）；答 `unavailable`、`custodianWithdrawn` 或缺席 ⇒ 按上文；答 `invalidInput` ⇒ 缺陷（`tenant` 是本插件交的）。没有 catch-all。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（清单外层形状、`serveBaseFaces`、出厂格引用的形状） | 内核在插件体之前校验 | 不过 ⇒ `FAILED`、不 provide、装配启动失败 | — |
| 官方清单装入（P-1 插件体，`provide` 之前） | **不是 effect，是持久写**；P-1 fiber | `invalidInput`／`unavailable` ⇒ 抛出 ⇒ `FAILED`，整份不装、没有服务出现；`manifestNotNewer` ⇒ 记 error、继续 | 撤除时什么都不做：行、序号与处置留在存储里（契约 S-23） |
| `ctx.provide`：`modelCatalog`（及 `serveBaseFaces` 时的另两个键） | P-1 fiber；清单装入之后才 provide | 任一 provide 失败 ⇒ 抛出，已 provide 的随 fiber 撤（kernel-basis probe `provide-is-effect-managed`，未升格为 basis 条目） | 服务消失，消费者重跑或 `PENDING`；已开始的方法调用跑完、按各自那一次提交收场；**保留**全部记录 |
| P-1r：中心连接的使用、副本表、`provide` 两个键；经保管方写下的凭据副本 | P-1r fiber；凭据副本的拥有者是保管方（按登录状态归属） | 连接服务缺席 ⇒ `PENDING` | 撤除只停止副本刷新；副本留在存储里，凭据副本留在保管方里——它随登录状态清除，不随 P-1r 撤除清除（M47） |
| 无定时器 | — | — | 副本刷新节奏归 P-1r 与未来资产/据点入口（版本未分配）（未定） |

## 实施缺口与消费者影响

**消费者影响（[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)，G-19 闭合）**：模型请求运行时的允许集合 `A` 本版就是「这个范围里登记的全部档案」——胜出行存在即在册且范围允许，第二道滤在本版是空滤；它由本节点的读面（`listProfiles`、`readProfile`）直接给出，**本节点不因此加操作**。将来要收窄，那一项走资产求值（PF-002），`winningRow` 的 `allowed` 参数就是为它留的口。

契约自己的 G-n 不在此重抄；下面是本节点的缺口。其中「本程不补、留给下一程」（owner 主线，[D-060 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）的是：MPD-N1（C-5 `infra/secrets`）、MPD-N2（C-3 据点上的中心事实副本读面、C-4 未来资产/据点入口（版本未分配））。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| MPD-N1 | **凭据保管方：据点一侧接口已定、真承接者未到；中心一侧本版不收**。据点：`capability.credential-custodian` v2 的 S-12、S-13 接住 P-1r 的副本存取（`absent` 与 `unavailable` 分开），**最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#实施缺口与消费者影响) 已立（candidate）**（副本条目以密文落在据点存储、本机只放密钥，N-37 ⑤），本版只进验收装配；产品装配里 P-1r 落不了租户那一把的副本，**离线调模型如实 `undispatched{credential_unavailable}`**——PF-016 §6.17／§6.20「离线时用手上那份副本」这一半没有兑现，是显式缺口，不是「照常」；装上之后仍缺副本的来路（`storeReplica` 要的登录状态与值，保管方 [G-6](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)，未来资产/据点入口（版本未分配））。中心：P-1 把 `CredentialRef` 换成值没有保管方（保管方 [G-7](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)），取值问法恒 `unavailable`，出厂格那一把同样取不到 | 主线；`infra/secrets` 与中心装配那一程（中心一侧，C-5） | 模型请求运行时的每一次发出（它的 MRR-N2）；离线的据点 | 据点：副本来路随未来资产/据点入口（版本未分配）（那个节点的 CCL-5），真承接者收下或取代保管方 v1。中心：保管方契约新版本（或另一份）收中心一侧 |
| MPD-N2 | **P-1r 整体受阻**：未来资产/据点入口（版本未分配） 的档案与凭据路由、据点副本的新鲜度上界与单调读（R-9）、秘密从中心送到据点与轮换传播，都在契约 G-7。据点侧的中心连接**观察面接口已定**（`capability.center-connection` v2 [S-9](../../../../spec/capabilities/center-connection/v2/contract.md#s-9-reachability)：三态、`reachCount`、在场不随可达性变），但**向中心发请求不在那份契约**（它的 [G-1](../../../../spec/capabilities/center-connection/v2/contract.md#八已知缺口)，真承接者是未来资产/据点入口（版本未分配） 的据点客户端，cli 的 C-4）——P-1r 读得到「中心在应答」却问不了它。秘密**是否**在据点落地已由 M47 定（经保管方落地） | 主线，下一程（C-3、C-4 未来资产/据点入口（版本未分配）） | 据点装配的模型请求运行时 | 未来资产/据点入口（版本未分配） 成立并逐行兑现契约 S-22 右列；**`profile.withdrawn` 若要转发到据点，转发者按目标据点会话的范围链过滤**（M65，G-7 的闭合条件之一） |
| MPD-N3 | **迁移片段要进中心装配**：`modelProfileDirectoryMigrations` 由 [tenancy-host](../../../apps/tenancy-host/README.md) 合成（D-059：承载已超出租户领域） | 己（tenancy-host 修订） | P-1 启动 | tenancy-host 的装载清单与迁移合成列入 P-1 |
| MPD-N4 | **静态检查规则未写**：`credentialLookup` 只许模型请求运行时解析；读面返回类型与 P-1r 副本表不含凭据值与引用（据点上的值只经保管方落地，M47）；**保管方的 `readReplica` 只许 P-1r 调**（N-37 ⑩；保管方 [S-19](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行，MCP 桥节点 N-14 管 `depositOAuth`／`resolve` 那一半） | 本节点 ＋ 承载仓库 `tools/ts-checks` | 契约 S-12 与保管方 S-11 的装配给 | 规则写成、并在 CI 里跑 |
| MPD-N5 | **发布清单的来源与序号**：发布物怎样交给中心装配、序号由谁给（契约 G-9 的实施一侧） | 装配（tenancy-host）与发布流程 | `loadManifest` | 发布流程写明单一来源 |
| MPD-N6 | **不带 `thisArg` 的派发对谁可见未核**（H-7）：`profile.withdrawn` 的 F③ 读法取保守一边；本版没有监听者，无后果 | [kernel-basis](../../../../../../packages/core/kernel-basis/README.md) 待补 probe（D-060 §八 M65） | 任何将来接上的 `profile.withdrawn` 监听者 | probe 在 4.0.4 上立起；第一个监听者接上之前必须闭合 |
| MPD-N7 | **函数层的行为没有契约条款**：`winningRow`、`manifestDisposition`、`configEligibility`、`credentialSlot` 借本契约的判定写成纯函数，契约写的是服务面（与 TER T-17 同题） | 主线 | 外部取用这几个函数的人 | 契约为函数面给出条款，或明写「函数面不受契约约束」 |
