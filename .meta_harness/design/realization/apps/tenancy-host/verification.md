# tenancy-host 验证与证据

本页登记本节点**触发了哪些证据义务、实际跑过什么、覆盖到哪里**。原始配置、输入快照与运行结果归
[record/evidence](../../../record/evidence/README.md)，本页只引用并解释范围。

> **一句话状态：什么都没跑过。**下面每条义务都是「未开始」或「受阻」，[实际执行](#实际执行)是空表，
> [bindings.yaml](bindings.yaml) 是空表。**这不是「还没来得及记」，是真的没有任何运行**——源码不存在。

契约侧的证据义务权威在各契约的 verification（[AI](../../../spec/capabilities/account-identity/verification.md)、
[OG](../../../spec/capabilities/organization-governance/verification.md)、[AR](../../../spec/compositions/account-registration/verification.md)、
[OE](../../../spec/data/offer-expiry/verification.md)、[入口契约](../../../spec/compositions/governance-center-entry/verification.md)——`composition.governance-center-entry/v1`）；那里把「装配给」各行记为**结构检查**（核对每条装配给都指向一个具体的装配事实）
或「由别处承担」，治理中心入口的 V-15（起来即整体、停机）归装配与 governance-center-entry 节点一起。本页的义务从 [design.md](design.md) 声称的范围产生，**不从已有测试反推**。
PF-017 rev 1 已接受（2026-09-23），入口契约仍是 `candidate`：下面每条将来全绿，也不提升入口契约与各节点设计的接受状态；绑定仍为 0，因为眼下无已存在的证据可绑（契约 `candidate`、源码未建），某条测试写成并登记 run 之后才进绑定。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| [AI R-7](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单)；[core/storage 覆盖缺口](../../packages/core/storage/verification.md#覆盖缺口)「装配还欠一条检查」 | `assembly.fk-organization-owner-account`：在一个临时 sqlite 文件上跑本节点的全部迁移、经装配出的 `storage` 实例：① 插一条 `organization` 行指向不存在的 `account` ⇒ `ReferenceViolation { kind: 'missing-target' }`；② 插账号行 + 指向它的组织行，再删账号行 ⇒ `ReferenceViolation { kind: 'delete-restricted' }`，账号行仍在；③ **负向运行**：用一个未设 `foreign_keys=ON` 的裸 `DatabaseSync` 句柄对同一文件做②的删除 ⇒ 删除静默成功——证明①②在看的是那条外键而不是别的东西。**套件只证提供者会报两向，这条证真实外键存在** | **未开始** | 本节点；storage-sql 的 sqlite 提供者已存在，**受阻于 AI／OG 的迁移片段（第二程）与本节点建包**。**这是 [S-35 孤儿不可达](../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿)在存储层的唯一直接实证**，领域层的两条交错归 AI S-43 第 2 支 |
| [迁移的所有权与合成规则](design.md#合成规则)；[迁移纪律 M-1～M-3、M-9](design.md#迁移纪律每条对应一个提供者要求) | `assembly.migration-composition`：合成后的 provider 在空库上跑 ⇒ 十张表都在（含 `governance_center`）、AI 片段的编号在 OG 之前、`organization` 上恰有一条名为 `organization_owner_account_fk` 的外键指向 `account(account_id)`（用 `PRAGMA foreign_key_list`）；**编号名快照**：合成序列与上一个发布版的序列比，只多不改、不重排（M-9）；`assembly.migrations-idempotent`：同一文件上跑两次不报错、schema 不变；`assembly.constraint-names-resolve`：插重复 `login_identifier` ⇒ `UniqueViolation.constraint === 'account_login_identifier_unique'`；插重复 `account_id` ⇒ `'account_pkey'`；插第二个 `owner_account` 相同的个人组织 ⇒ `'organization_owner_account_unique'`，两个 `owner_account` 为 NULL 的团队组织**都能插**；`membership`／`team_creation_key` 复合主键重复 ⇒ 各自的 `<table>_pkey`；`governance_center` 第二个 `slot = 'center'` ⇒ `'governance_center_pkey'`——**任何一条映射成 `StorageDefect` 就是片段没按 M-2／M-3 命名** | 未开始 | 本节点；受阻于 AI／OG 片段与 governance-center-entry 建包 |
| [升级的整体性](design.md#升级的整体性迁移前只读核对快照与确认) R-U1、R-U2：只读核对不过 ⇒ 不碰数据 | `assembly.upgrade-preflight-refuses`：① 库的迁移登记里多一个本版本不认识的名字（模拟更新的版本写过这份库）⇒ `boot()` 拒绝，失败说明写「数据格式本版本接不了」并点名那个迁移，**库的内容不变**（逐表比对，含迁移登记）、没有建快照、没有任何 fiber 被创建之外的写；② 把 `clock_lease.written_at` 写到墙钟之后 ⇒ `boot()` 在跑任何迁移之前拒绝，说明写「钟比中心用过的最晚时刻早」，库的内容不变；**逐字节不变**只在夹具的上一次是干净关闭（预写日志为空）时另加断言——否则关最后一个句柄的检查点会改字节、不改内容；**反向**：登记序列是本次序列的真前缀 ⇒ 核对通过、只跑差的那几条 | 未开始 | 本节点；受阻于 storage-sql（`upgrade.checks`）与 clock（`clockPreflight`）落包，两边设计已有 |
| 同上 R-U3、R-U4：确认之前的任何启动失败都撤回升级 | `assembly.upgrade-restore-on-boot-failure`：用上一版的合成序列建一份有数据的库；本版多一个片段，让入口层端口被占（另测一次 clock 启动检出回拨、一次运维面套接字目录权限过宽）⇒ `boot()` 拒绝；断言库的迁移登记、schema 与业务行都回到升级前（逐表比对），**附属文件里没有升级后的写**，用上一版的合成序列 `boot()` 照常成功、中心标识不变。**首次启动支**：空目录启动、让运维面或入口层失败（套接字目录权限过宽、端口被占、注入一次铸标识的写失败）⇒ 库文件与附属文件都不存在，下一次启动仍是第一次（S-28 ③）。**撤除路径上恢复失败支**（R-U8；与 storage-sql 的 `upgrade.dispose-restore-failure-visible` 同一件事的装配一侧）：迁移之后让快照所在目录不可写、再让入口层端口被占 ⇒ 逆序撤完、`fiber.dispose()` 照常 resolve，本节点调 `pendingUpgrade` 见快照仍在 ⇒ `boot()` 拒绝，阶段为「升级未确认」、说明里写出快照位置、快照仍在，**不报「已恢复」** | 未开始 | 本节点 + storage-sql；受阻同上 |
| 同上 R-U5：启动途中崩溃 | `assembly.upgrade-crash-recovery`：在子进程里 `boot()`，迁移跑完、确认之前 `SIGKILL`（在 storage-sql 的建快照与迁移之间、迁移之后各一次）⇒ 下一次启动先恢复遗留快照、再按升级前的库重走一遍；恢复本身失败（快照所在目录只读）⇒ 启动失败、说明里写出快照位置、快照仍在 | 未开始 | 本节点 + storage-sql |
| 同上 R-U6：确认之后不再恢复 | `assembly.upgrade-confirmed`：`boot()` 成功（确认经 `confirmUpgrade`）后快照已不存在、`pendingUpgrade` 报无；此后 `dispose()` 与再次 `boot()` 都不动库 | 未开始 | 本节点 + storage-sql |
| 同上 R-U7（pg） | `assembly.pg-upgrade-atomic`：让第二条迁移失败 ⇒ 登记与 schema 都回到迁移前；**本程 `describe.skip`**，前提同 `assembly.pg-wiring`。**跳过不是通过**；迁移提交之后的撤回没有测试形式——pg 上 §6.9 本程不兑现（缺口 U-3） | 未开始（本程不跑） | 装配 + storage-sql，第一次跑 pg 时 |
| [两步开闸](design.md#两步开闸就绪与开闸分开)：确认之前没有对外提交；缺口 U-1 的反面 | `assembly.no-commit-before-open`：给确认处加一个测试钩子让它停住——① 此时八条 fiber 都已 `ACTIVE`，向入口层发公开体检与一条注册请求、向运维面发一次请求 ⇒ 连接一律关闭不答，库里没有新行，`serving` 尚未发出；② 在子进程里于此刻 `SIGKILL` ⇒ 下一次启动恢复遗留快照：非首次时库与升级前逐表相等，首次时标识被重铸，而此前没有任何一次答复出现过旧值；③ 让确认失败（快照不可删）⇒ `openSignal` 以拒绝结束、入口层从未开闸、其余全撤、库回到升级前，说明写「升级确认失败」；④ 正常路径的事件次序恰为「全部 `ACTIVE` → 确认 → 兑现 → `serving` → 第一条答复 → `boot()` 返回」；⑤ **等 `serving` 有界，已接受的残余情形 U-4**（该节点 N-12）：让入口层开闸那一刻钟读不到 ⇒ `boot()` 在 `clockReadyTimeoutMs` + 1 s 之后拒绝，失败说明点名原因是钟、写「钟读不到，重启即可」；八条 fiber 按逆序撤完、端口已释放；快照已不存在、**没有恢复**（库是新版本的完整数据，此前没有任何答复）；恢复钟之后用**同一版本**再 `boot()` ⇒ 成功（无遗留快照、无待跑迁移、中心标识不变）。②③⑤ 与 governance-center-entry 的 T-12（`gce.lifecycle` 的 `openSignal` 各支与「崩溃落在开闸之前」）是同一组联合演练 | 未开始 | 本节点 + governance-center-entry + storage-sql；受阻于该节点建包与 storage-sql 落包（`confirmUpgrade` 已设计） |
| [装载清单的整体性](design.md#装载清单与顺序)；[配置错误一个政策](design.md#依赖作用域与绑定) | `assembly.missing-key-fails-boot`：对四份密钥各跑一遍——变量与文件都缺、两者都设（二义）、文件不可读、文件对 group／other 可读、内容不是 Ed25519（用一把 RSA PEM）——每种都断言 `boot()` 拒绝、**没有任何 fiber 留在 `ACTIVE`**、库句柄已关（用 storage-sql 的 disposer 可观察）；`assembly.invalid-config-fails-boot`：`unactivatedRetention` 为 0、`invitationTtlDefault` 为负、`OMNE_TENANCY_STORAGE_FILE` 为 `:memory:`、方言不认识、`OMNE_TENANCY_CREDENTIAL_POLICY` 不是合法 JSON、PF-003 两项部署参数任一缺或非正、`OMNE_TENANCY_ENTRY_LISTEN` 缺、TLS 证书链或私钥两个来源都缺或都设、TLS 私钥文件对 group／other 可读、`OMNE_TENANCY_OPS_SOCKET_DIR` 缺、排空上界不小于撤除总超时、等钟上界缺或不大于租约宽度——同样断言，且**失败说明点名是哪一项、不含任何值**；**反向**：`credentialPolicy` 缺席 ⇒ `boot()` 成功（契约 S-27 的例外），`accounts.produce` 得 `credential-rejected`；五项部署参数与运维面完整体检里的 `deploymentParameters` 逐项相等 | 未开始 | 本节点；依赖八个插件存在。启动失败的机制依赖 basis `plugin-throw-fails-fiber`（probe 已过） |
| [配对自检](design.md#配对自检起-context-之前签一次核一次)：合法但错配 ⇒ 启动失败 | `assembly.key-pairing-mismatch-fails-boot`：四份 PEM **各自形状合法**（都过 `loadSigningKey`／`loadVerificationKey`）但不配对——① activation 私钥配另一次 `keygen` 的 activation 公钥；② activation 与 purge 的公钥互换；③ 两把私钥互换——每种都断言 `boot()` 在**起 Context 之前**拒绝（没有任何 fiber 被创建、库文件未被打开），错误指明是哪一对；**反向**：配对正确 ⇒ 自检通过、不留任何凭证 | 未开始 | 本节点；依赖 identity-values 的四个原语（源码已有） |
| [装载清单](design.md#装载清单与顺序)：`PENDING` 是清单错误 | `assembly.pending-is-manifest-error`：把 AR 故意排到 AI 之前 ⇒ `boot()` 在装 AR 那一步**同步**拒绝（不等待），已装的 `storage`／`clock`／`credentials` 已撤；错误指明缺哪个服务；**入口层支**：清单里拿掉 `credentials`（或 AR）⇒ 入口层在装它那一步 `PENDING` ⇒ 同步拒绝，入口层的监听从未打开 | 未开始 | 本节点；kernel-basis `bootAssembly` 的同形测试已在其包内 |
| [入口契约 S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁) 起来即整体；契约 V-15 装配那一半；governance-center-entry T-12 | `assembly.entry-loads-last`：入口层开闸（第一条客户端请求得到答复）那一刻，其余七条 fiber 都已 `ACTIVE`、快照已确认；运维面在 `serving` 之前与 `stopped` 之后不答；入口层插件体抛出（端口被占）⇒ 其余七条全撤、库回到启动前；清单里运维面排到入口层之后 ⇒ 本节点的清单形状测试红 | 未开始 | 本节点 + governance-center-entry；受阻于该节点建包 |
| [时钟装配](design.md#时钟装配)启动期失败 ⇒ 启动失败 | `assembly.clock-write-failure-fails-boot`：库文件只读（或在 `storage` 与 `clock` 之间注入让 `write` 失败的 storage）⇒ `boot()` 拒绝，`storage` 已撤；`assembly.clock-rollback-fails-boot`：先把 `clock_lease.written_at` 写到未来（模拟上一次运行的墙钟更晚）再 `boot()` ⇒ `ClockRollbackDetected` 穿出 ⇒ `boot()` 拒绝，`storage` 已撤；**反向**：`written_at ≤ 墙钟 < lease_until`（快速重启）⇒ `boot()` 在入口层等钟可读之后成功（至多一个租约宽度），`startedAt` 不早于 `lease_until`，开闸之前没有任何客户端请求得到答复 | 未开始 | 本节点 + clock 节点 + governance-center-entry |
| [入口契约 S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)「启动成功以钟可读为条件」；[其余 config](design.md#其余-config候选变量名) 的 `clockReadyTimeoutMs` | `assembly.clock-ready-timeout`：① `OMNE_TENANCY_CLOCK_READY_TIMEOUT` 缺、或不大于 `LEASE_WIDTH_MS` ⇒ `boot()` 在装任何插件之前拒绝，说明点名这一项；② 让钟在界内一直读不到（clock 的续约写持续失败，或把 `clock_lease.lease_until` 推到界之外）⇒ 入口层插件体超界抛出 ⇒ `boot()` 拒绝、其余七条已撤、快照已恢复，说明点名原因是钟；③ 钟在界内变得可读 ⇒ `boot()` 成功 | 未开始 | 本节点 + governance-center-entry；受阻于该节点建包 |
| [撤除次序](design.md#成对的装载与撤除)；S-36「停机时先停收、再等在途、再关闭」行 | `assembly.dispose-reverse-order`：正常 `dispose()` 后 `clock_lease.lease_until` 已被收回（等于撤除时刻而不是 `+L`）——它证明 clock 的撤除写找到了活的 `storage`；入口层的监听先于运维面的套接字关闭，运维面在入口层撤完之前仍答完整体检；全部句柄已关、套接字文件已删；`assembly.dispose-with-inflight`：经入口层发一个未返回的注册请求时 `dispose()`，断言排空上界内答完的照常答、超时的连接被销毁，而那次注册按自己那次提交收场（成立或无痕），撤除开始后新到的连接得不到答复；`assembly.dispose-timeout`：一个故意挂住的 disposer ⇒ `dispose()` 在总超时后仍返回并记录未完成的 fiber | 未开始 | 本节点 |
| [私钥不经服务 store 可达](design.md#私钥不经服务-store-可达)；[IV 覆盖缺口](../../packages/core/identity-values/verification.md#覆盖缺口)「私钥不外泄」的窄形式 | `assembly.keys-only-in-owner-config`：装配出的八个 config 对象里，PEM 字段的归属恰为 AR←activation 私钥、OG←purge 私钥、AI←两把公钥、入口层←TLS 证书链与私钥，其余 config（含运维面）无 PEM；服务 store 里枚举得到的每个值序列化后不含 PEM 头；启动失败说明、工程记录、完整体检答复都不含 PEM 头（并入 governance-center-entry T-11 的输出搜索）。**证据范围止于此**：它不证同进程别的代码读不到——持钥插件的 config 挂在各自 fiber 上，沿 fiber 树可达 | 未开始 | 本节点。**完整形式没有证据形式** |
| [密钥生成函数](design.md#keygen-与重生的后果) | 单元测试：产出四份文件、权限 `0600`、各自被 `loadSigningKey`／`loadVerificationKey` 接受、两对互相配对（同 `assembly.key-pairing-mismatch-fails-boot` 的正向）、两对不相同；目录已有文件时拒绝覆盖 | 未开始 | 本节点 |
| [AI S-30 第 8 行 / S-22](../../packages/tenancy/account-identity/verification.md#证据义务) 方法级结构检查 | 仓库内 `.produce(` 的调用点只在 `packages/tenancy/account-registration`（及定义包）；文本规则，`ctx.get('accounts')` 动态解析后的调用同样是 `.produce(` 文本，一并覆盖；自带「故意违反就失败」自测 | **已写**：`tools/ts-checks` 的 `restricted-call-sites` 规则（源码已有，接进 `pnpm run check`）；**它的运行尚未登记为 evidence run，登记前不进绑定** | 主线登记 run；本节点回填 `test:` 绑定 |
| [OG S-42 第 4 行](../../packages/tenancy/organization-governance/verification.md#证据义务) 结构检查 | 仓库内出现字符串 `'organization-purge'` 的包只有 `account-registration`（及定义包）——`inject: ['organization-purge']` 与 `ctx.get('organization-purge')` 都是这个字符串，一并覆盖；自带自测。**装载清单那一半**：`assembly.manifest-shape`——清单里恰一个 `storageSqlPlugin`（五个消费 `storage` 的插件解析到同一个实例，`governance_center` 与治理事实同库：[R-GC6](../../packages/tenancy/governance-center-entry/design.md#对存储提供者的要求清单)）、恰一个 `clockPlugin`、inject `organization-purge` 的插件恰为 AR、运维面与入口层是最后两项且运维面在前、运维面的 config 里没有任何服务句柄 | 结构检查**已写**（同上，run 未登记）；清单测试未开始 | 主线 + 本节点 |
| [CV 换代演练](../../packages/tenancy/credential-verification/verification.md#证据义务) | `assembly.credentials-swap-no-rerun`：装配就绪后 dispose `credentials` 的 fiber、装载另一实现；断言 AI 与 OG 的插件体**未重跑**（插件体内计数器不变），期间 `logins.issue` 得 `storage-unavailable`、`accounts.read` 照常 | 未开始 | 本节点 + CV；机制依据 probe `inject-has-no-optional-form`（已过） |
| [AI S-32](../../../spec/capabilities/account-identity/v1/contract.md#s-32-退出的持久性) 的「完整重启」支 | `boot()` 在同一文件上起两次：第一次签发并撤销一个登录状态、`dispose()`；第二次 `logins.verify` 得 `login-state-rejected`。**演练本身归 AI**，本节点只保证 `boot()` 可重入同一文件 | 未开始 | AI + 本节点 |
| [AI S-43 第 2 支](../../../spec/capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期) 含两条交错的真并发演练；[OG S-54](../../packages/tenancy/organization-governance/verification.md#证据义务) ⑥⑦ | 本节点提供夹具：同一文件、同一外键、两个提供者实例（并发用例要两个独立连接，[core/storage 套件形状](../../packages/core/storage/design.md#一致性套件的形状)）；演练归三个节点 | 未开始 | AI + OG + AR + 本节点 |
| [AR S-29](../../../spec/compositions/account-registration/v1/contract.md#s-29-规范场景参与方缺席时不放行) | 测试装配单独 dispose OG 的 fiber，区分装配期缺席（AR `PENDING`）与运行期 `unavailable` 两支；本节点的生产 `boot()` 不暴露单条句柄，演练走 `bootAssembly` | 未开始 | AR + 本节点 |
| [D-026「只改配置切 pg」](../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围) | `assembly.pg-wiring`：同一份迁移与装载代码，方言配置切 `postgres` 后 `boot()` 成功且 `assembly.fk-organization-owner-account` 全绿；**本程 `describe.skip`**，前提「有一个可连的 pg ≥ 14」。**跳过不是通过** | 未开始（本程不跑） | 装配，第二程 |
| [产品代码不 import `kernel-basis/testing`](../../packages/core/kernel-basis/verification.md#证据义务) | 静态检查：`apps/tenancy-host/src` 对 `@omne-harness-lite/kernel-basis/testing` 零 import | 受阻：`tools/ts-checks` 现有三条规则**不含**它 | 主线加一条规则（与现有三条同形） |
| 启动失败可观测；[PF-017 §6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)「告诉运维者差的是哪一样」；[S-29](../../../spec/compositions/governance-center-entry/v1/contract.md#s-29-秘密不进任何输出) | `assembly.boot-failure-log`：每种启动失败落恰一条结构化记录，含失败的阶段（config／配对自检／遗留快照恢复／只读核对／建快照／迁移／哪条 fiber，入口层等钟超界单列为「钟读不到」／恢复快照）、错误类型与点名的那一项、不含 PEM 与任何 config 值；恢复失败时含快照位置；精确形状等[全局观测契约](../../../foundation/observability-and-logging/requirements.md) | 未开始 | 本节点 |

**受阻项写明阻塞原因**：上表的阻塞原因是五族——源码不存在（八个插件的实现、AI／OG 的迁移片段、governance-center-entry 包、本节点）、storage-sql 与 clock 还没补升级整体性的那几项（R-U1～R-U8、只读回拨核对）、`restricted-call-sites` 的运行未登记为 evidence run、pg 环境本程不建、PF-017 与入口契约未接受（挡绑定，不挡测试）。
不用「待补充」掩盖，也不新设一个「无法验证」的状态。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
| --- | --- | --- | --- |

**本表为空，因为没有任何运行。**两次 formal evidence run（`2026-09-22-formal-tenant-domain`、`-2`）与入口契约的 formal task `governance-center-entry-v1-decision` 检查的都是契约模型，
与本节点无关；kernel-basis 的八条 probe 在 4.0.4 上通过（[basis 当前状态](../../../basis/README.md#当前状态)），
`infra/storage-sql`（sqlite 一致性套件 15 组）与 `infra/clock`（8 条）的包内测试通过（各自节点 README 的转述，均未登记 evidence run），
`tools/ts-checks` 的三条规则接进了 `pnpm run check`——它们是本节点所装的提供者与机制依据的证据，**不是本节点的符合性证据**。

**有限检查不写成无条件证明。**将来填进上表的每一行都在「sqlite 临时文件库、单主机、单进程、WAL、`synchronous=NORMAL`、候选常量」下成立；
pg 上没有任何结论；「回拨」「崩溃」都是用改写存储行、直接丢弃句柄或杀子进程模拟的，不是真的调系统时钟或断电；升级快照的恢复只在「同一份库同一时刻只有一个属主进程」下有意义，那由 storage-sql 的属主独占保证（已设计、源码尚无，U-2）。

## 覆盖缺口

与 [bindings.yaml](bindings.yaml) 的空表一致——两处不给不同说法。

| 缺什么 | 为什么 | 谁能补 |
| --- | --- | --- |
| **一条绑定都没有** | 无已存在的证据可绑：入口契约 `candidate`、源码未建，本节点没有已存在的测试；`restricted-call-sites` 已存在但运行未登记 evidence run；formal task 与 probe 都不证本节点的条款（PF-017 rev 1 已于 2026-09-23 接受，准入不再挡绑定） | 测试写成、run 登记后，回填 `test:` 证据 |
| **入口层怎么认人、怎么推导身份、怎么映射答复**不在本页 | 那是 governance-center-entry 的 T-1～T-19；本页只登记装配那一半（装载次序、同起同停、撤除、config、同一存储） | 该节点 |
| **U-1 开闸到确认之间的窗口——设计上已闭合，无证据** | 两步开闸已写进本节点与 governance-center-entry 的设计，两边都未建包；`assembly.no-commit-before-open` 未开始 | governance-center-entry 实现 `openSignal`、本节点实现 `boot()` 之后跑那条演练 |
| **U-2 同一份库的排他——已设计、无源码**：两个进程同时升级同一份库 | storage-sql 的属主独占已设计（sqlite 那一半待核），源码尚无，写不出会通过的测试 | storage-sql 落包并过 `upgrade.exclusive-owner` 后，本节点加一条两进程同时 `boot()` 的真并发演练 |
| **U-3 pg 上 PF-017 §6.9 本程不兑现（显式缺口）**：「迁移单事务」成立（R-U7，`assembly.pg-upgrade-atomic` 本程跳过），「迁移后装配失败回滚」不成立 | 迁移事务提交之后撤不回，没有手段就没有会通过的测试；**受阻消费者：pg 部署** | 本节点 + storage-sql；闭合条件：pg 首跑前定手段（候选：升级前逻辑备份钩子；或老版本可对新 schema 运行的兼容窗口），定了之后加一条「迁移后入口层端口被占 ⇒ 旧版本照常能起」的 pg 演练 |
| **U-4 确认之后到开闸之间的失败支——已接受的残余情形（裁 (b)）：无已确认提交丢失、老版本不能再起、重启即可** | 入口层在开闸时再读钟、超界即放弃开闸（其 N-12）；本节点等不到 `serving` 即启动失败，快照已确认、不恢复。§6.9 的「旧版本照常能起」在这一支上**没有证据形式，也不再要求**；已接受的结果本身由 `assembly.no-commit-before-open` 第 ⑤ 支断言 | 无须补；裁决变了再改 ⑤ 支 |
| **AI／OG 的迁移片段第二程才有** | 外键存在性、迁移合成、约束名三条义务都起不来 | AI、OG 节点各加一行「导出片段」并落包 |
| **pg 方言零运行** | 本程只接线（D-026 范围裁定） | 装配，第二程 |
| **运行中墙钟回拨**无义务——已设计、无源码 | clock 的 `now()` 每次现读墙钟并与用过的最晚时刻比对（设计已定），已建包的源码仍按单调钟推算；本节点只转交 | clock 节点落包后，由它与 governance-center-entry 的 T-18 一起登记 |
| **私钥不外泄**只有窄形式 | 单进程无硬隔离 | 跨进程演化时由协议重给 |
| **断电级持久**无证据形式 | `synchronous=NORMAL`，无断电夹具 | D-027 裁 `NORMAL`；需要时切 `FULL` 须新决定（storage-sql 加 config 项） |
| **租约表被外部删除**导致 `now` 不后退失守 | 运维约定，无法在节点内检测 | 运维；无证据形式 |
| **G-13 残留清扫、G-6 清扫提供者**无义务 | 本版不建 | 产品负责人定节奏 / AI v2 枚举读面 |
| **跨进程的锁竞争与 `clock` 先后** | 本版单机 | 投影 Q-8；入口契约 G-8 |
| **四个基础设施节点、governance-center-entry 节点与入口契约尚未接受** | 本节点对它们的采用在接受前是前提，不是依据 | 各自的评审与接受 |
