# tenancy-host 验证与证据

本页登记本节点**触发了哪些证据义务、实际跑过什么、覆盖到哪里**。原始配置、输入快照与运行结果归
[record/evidence](../../../record/evidence/README.md)，本页只引用并解释范围。

> **一句话状态：什么都没跑过。**下面每条义务都是「未开始」或「受阻」，[实际执行](#实际执行)是空表，
> [bindings.yaml](bindings.yaml) 是空表。**这不是「还没来得及记」，是真的没有任何运行**——源码不存在。

契约侧的证据义务权威在各契约的 verification（[AI](../../../spec/capabilities/account-identity/verification.md)、
[OG](../../../spec/capabilities/organization-governance/verification.md)、[AR](../../../spec/compositions/account-registration/verification.md)、
[OE](../../../spec/data/offer-expiry/verification.md)）；那里把「装配给」各行记为**结构检查**（核对每条装配给都指向一个具体的装配事实）
或「由别处承担」。本页的义务从 [design.md](design.md) 声称的范围产生，**不从已有测试反推**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| [AI R-7](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单)；[core/storage 覆盖缺口](../../packages/core/storage/verification.md#覆盖缺口)「装配还欠一条检查」 | `assembly.fk-organization-owner-account`：在一个临时 sqlite 文件上跑本节点的全部迁移、经装配出的 `storage` 实例：① 插一条 `organization` 行指向不存在的 `account` ⇒ `ReferenceViolation { kind: 'missing-target' }`；② 插账号行 + 指向它的组织行，再删账号行 ⇒ `ReferenceViolation { kind: 'delete-restricted' }`，账号行仍在；③ **负向运行**：用一个未设 `foreign_keys=ON` 的裸 `DatabaseSync` 句柄对同一文件做②的删除 ⇒ 删除静默成功——证明①②在看的是那条外键而不是别的东西。**套件只证提供者会报两向，这条证真实外键存在** | **未开始** | 本节点；storage-sql 的 sqlite 提供者已存在，**受阻于 AI／OG 的迁移片段（第二程）与本节点建包**。**这是 [S-35 孤儿不可达](../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿)在存储层的唯一直接实证**，领域层的两条交错归 AI S-43 第 2 支 |
| [迁移的所有权与合成规则](design.md#合成规则)；[迁移纪律 M-1～M-3](design.md#迁移纪律每条对应一个提供者要求) | `assembly.migration-composition`：合成后的 provider 在空库上跑 ⇒ 九张表都在、AI 片段的编号在 OG 之前、`organization` 上恰有一条名为 `organization_owner_account_fk` 的外键指向 `account(account_id)`（用 `PRAGMA foreign_key_list`）；`assembly.migrations-idempotent`：同一文件上跑两次不报错、schema 不变；`assembly.constraint-names-resolve`：插重复 `login_identifier` ⇒ `UniqueViolation.constraint === 'account_login_identifier_unique'`；插重复 `account_id` ⇒ `'account_pkey'`；插第二个 `owner_account` 相同的个人组织 ⇒ `'organization_owner_account_unique'`，两个 `owner_account` 为 NULL 的团队组织**都能插**；`membership`／`team_creation_key` 复合主键重复 ⇒ 各自的 `<table>_pkey`——**任何一条映射成 `StorageDefect` 就是片段没按 M-2／M-3 命名** | 未开始 | 本节点；受阻于 AI／OG 片段 |
| [装载清单的整体性](design.md#装载清单与顺序)；[配置错误一个政策](design.md#依赖作用域与绑定) | `assembly.missing-key-fails-boot`：对四份密钥各跑一遍——变量与文件都缺、两者都设（二义）、文件不可读、文件对 group／other 可读、内容不是 Ed25519（用一把 RSA PEM）——每种都断言 `boot()` 拒绝、**没有任何 fiber 留在 `ACTIVE`**、库句柄已关（用 storage-sql 的 disposer 可观察）；`assembly.invalid-config-fails-boot`：`unactivatedRetention` 为 0、`invitationTtlDefault` 为负、`OMNE_TENANCY_STORAGE_FILE` 为 `:memory:`、方言不认识、`OMNE_TENANCY_CREDENTIAL_POLICY` 不是合法 JSON——同样断言；**反向**：`credentialPolicy` 缺席 ⇒ `boot()` 成功（契约 S-27 的例外），`accounts.produce` 得 `credential-rejected` | 未开始 | 本节点；依赖六个插件存在。启动失败的机制依赖 probe `plugin-throw-fails-fiber`（已过） |
| [配对自检](design.md#配对自检起-context-之前签一次核一次)：合法但错配 ⇒ 启动失败 | `assembly.key-pairing-mismatch-fails-boot`：四份 PEM **各自形状合法**（都过 `loadSigningKey`／`loadVerificationKey`）但不配对——① activation 私钥配另一次 `keygen` 的 activation 公钥；② activation 与 purge 的公钥互换；③ 两把私钥互换——每种都断言 `boot()` 在**起 Context 之前**拒绝（没有任何 fiber 被创建、库文件未被打开），错误指明是哪一对；**反向**：配对正确 ⇒ 自检通过、不留任何凭证 | 未开始 | 本节点；依赖 identity-values 的四个原语（源码已有） |
| [装载清单](design.md#装载清单与顺序)：`PENDING` 是清单错误 | `assembly.pending-is-manifest-error`：把 AR 故意排到 AI 之前 ⇒ `boot()` 在装 AR 那一步**同步**拒绝（不等待），已装的 `storage`／`clock`／`credentials` 已撤；错误指明缺哪个服务 | 未开始 | 本节点；kernel-basis `bootAssembly` 的同形测试已在其包内 |
| [时钟装配](design.md#时钟装配)启动期失败 ⇒ 启动失败 | `assembly.clock-write-failure-fails-boot`：库文件只读（或在 `storage` 与 `clock` 之间注入让 `write` 失败的 storage）⇒ `boot()` 拒绝，`storage` 已撤；`assembly.clock-rollback-fails-boot`：先把 `clock_lease.written_at` 写到未来（模拟上一次运行的墙钟更晚）再 `boot()` ⇒ `ClockRollbackDetected` 穿出 ⇒ `boot()` 拒绝，`storage` 已撤；**反向**：`written_at ≤ 墙钟 < lease_until`（快速重启）⇒ `boot()` 成功，`now()` 在追上前返回 `'unavailable'` | 未开始 | 本节点 + clock 节点 |
| [撤除次序](design.md#成对的装载与撤除) | `assembly.dispose-reverse-order`：正常 `dispose()` 后 `clock_lease.lease_until` 已被收回（等于撤除时刻而不是 `+L`）——它证明 clock 的撤除写找到了活的 `storage`；全部句柄已关；`assembly.dispose-with-inflight`：一个在途 `accounts.produce` 未返回时 `dispose()`，断言它按自己那次提交收场（成立或无痕），撤除开始后新发起的调用得该契约的 `storage-unavailable`；`assembly.dispose-timeout`（候选常量定下后）：一个故意挂住的 disposer ⇒ `dispose()` 在上限后仍返回并记录未完成的 fiber | 未开始 | 本节点 |
| [私钥不经服务 store 可达](design.md#私钥不经服务-store-可达)；[IV 覆盖缺口](../../packages/core/identity-values/verification.md#覆盖缺口)「私钥不外泄」的窄形式 | `assembly.keys-only-in-owner-config`：装配出的六个 config 对象里，PEM 字段的归属恰为 AR←activation 私钥、OG←purge 私钥、AI←两把公钥，其余 config 无 PEM；服务 store 里枚举得到的每个值序列化后不含 PEM 头；启动失败日志不含 PEM 头。**证据范围止于此**：它不证同进程别的代码读不到——持钥插件的 config 挂在各自 fiber 上，沿 fiber 树可达 | 未开始 | 本节点。**完整形式没有证据形式** |
| [密钥生成函数](design.md#keygen-与重生的后果) | 单元测试：产出四份文件、权限 `0600`、各自被 `loadSigningKey`／`loadVerificationKey` 接受、两对互相配对（同 `assembly.key-pairing-mismatch-fails-boot` 的正向）、两对不相同；目录已有文件时拒绝覆盖 | 未开始 | 本节点 |
| [AI S-30 第 8 行 / S-22](../../packages/tenancy/account-identity/verification.md#证据义务) 方法级结构检查 | 仓库内 `.produce(` 的调用点只在 `packages/tenancy/account-registration`（及定义包）；文本规则，`ctx.get('accounts')` 动态解析后的调用同样是 `.produce(` 文本，一并覆盖；自带「故意违反就失败」自测 | **已写**：`tools/ts-checks` 的 `restricted-call-sites` 规则（源码已有，接进 `pnpm run check`）；**它的运行尚未登记为 evidence run，登记前不进绑定** | 主线登记 run；本节点回填 `test:` 绑定 |
| [OG S-42 第 4 行](../../packages/tenancy/organization-governance/verification.md#证据义务) 结构检查 | 仓库内出现字符串 `'organization-purge'` 的包只有 `account-registration`（及定义包）——`inject: ['organization-purge']` 与 `ctx.get('organization-purge')` 都是这个字符串，一并覆盖；自带自测。**装载清单那一半**：`assembly.manifest-shape`——清单里恰一个 `storageSqlPlugin`、恰一个 `clockPlugin`、inject `organization-purge` 的插件恰为 AR | 结构检查**已写**（同上，run 未登记）；清单测试未开始 | 主线 + 本节点 |
| [CV 换代演练](../../packages/tenancy/credential-verification/verification.md#证据义务) | `assembly.credentials-swap-no-rerun`：装配就绪后 dispose `credentials` 的 fiber、装载另一实现；断言 AI 与 OG 的插件体**未重跑**（插件体内计数器不变），期间 `logins.issue` 得 `storage-unavailable`、`accounts.read` 照常 | 未开始 | 本节点 + CV；机制依据 probe `inject-has-no-optional-form`（已过） |
| [AI S-32](../../../spec/capabilities/account-identity/v1/contract.md#s-32-退出的持久性) 的「完整重启」支 | `boot()` 在同一文件上起两次：第一次签发并撤销一个登录状态、`dispose()`；第二次 `logins.verify` 得 `login-state-rejected`。**演练本身归 AI**，本节点只保证 `boot()` 可重入同一文件 | 未开始 | AI + 本节点 |
| [AI S-43 第 2 支](../../../spec/capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期) 含两条交错的真并发演练；[OG S-54](../../packages/tenancy/organization-governance/verification.md#证据义务) ⑥⑦ | 本节点提供夹具：同一文件、同一外键、两个提供者实例（并发用例要两个独立连接，[core/storage 套件形状](../../packages/core/storage/design.md#一致性套件的形状)）；演练归三个节点 | 未开始 | AI + OG + AR + 本节点 |
| [AR S-29](../../../spec/compositions/account-registration/v1/contract.md#s-29-规范场景参与方缺席时不放行) | 测试装配单独 dispose OG 的 fiber，区分装配期缺席（AR `PENDING`）与运行期 `unavailable` 两支；本节点的生产 `boot()` 不暴露单条句柄，演练走 `bootAssembly` | 未开始 | AR + 本节点 |
| [D-026「只改配置切 pg」](../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围) | `assembly.pg-wiring`：同一份迁移与装载代码，方言配置切 `postgres` 后 `boot()` 成功且 `assembly.fk-organization-owner-account` 全绿；**本程 `describe.skip`**，前提「有一个可连的 pg ≥ 14」。**跳过不是通过** | 未开始（本程不跑） | 装配，第二程 |
| [产品代码不 import `kernel-basis/testing`](../../packages/core/kernel-basis/verification.md#证据义务) | 静态检查：`apps/tenancy-host/src` 对 `@omne-harness-lite/kernel-basis/testing` 零 import | 受阻：`tools/ts-checks` 现有三条规则**不含**它 | 主线加一条规则（与现有三条同形） |
| 启动失败可观测 | `assembly.boot-failure-log`：每种启动失败落恰一条结构化记录，含失败的 fiber 名与错误类型、不含 PEM；精确形状等[全局观测契约](../../../foundation/observability-and-logging/requirements.md) | 未开始 | 本节点 |

**受阻项写明阻塞原因**：上表的阻塞原因是三族——源码不存在（六个插件的实现、AI／OG 的迁移片段、本节点）、`restricted-call-sites` 的运行未登记为 evidence run、pg 环境本程不建。
不用「待补充」掩盖，也不新设一个「无法验证」的状态。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
| --- | --- | --- | --- |

**本表为空，因为没有任何运行。**两次 formal evidence run（`2026-09-22-formal-tenant-domain`、`-2`）检查的是契约模型，
与本节点无关；kernel-basis 的八条 probe 在 4.0.4 上通过（[basis 当前状态](../../../basis/README.md#当前状态)），
`infra/storage-sql`（sqlite 一致性套件 15 组）与 `infra/clock`（8 条）的包内测试通过（各自节点 README 的转述，均未登记 evidence run），
`tools/ts-checks` 的三条规则接进了 `pnpm run check`——它们是本节点所装的提供者与机制依据的证据，**不是本节点的符合性证据**。

**有限检查不写成无条件证明。**将来填进上表的每一行都在「sqlite 临时文件库、单主机、单进程、WAL、`synchronous=NORMAL`、候选常量」下成立；
pg 上没有任何结论；「回拨」「崩溃」都是用改写存储行或直接丢弃句柄模拟的，不是真的调系统时钟或断电。

## 覆盖缺口

与 [bindings.yaml](bindings.yaml) 的空表一致——两处不给不同说法。

| 缺什么 | 为什么 | 谁能补 |
| --- | --- | --- |
| **入口层身份核实**没有任何义务登记 | 契约未立（客户端–据点），本版不写 | 契约起草后本节点加义务 |
| **一条绑定都没有** | 能否登记绑定待裁（准入张力已上报产品负责人）；本节点没有已存在的测试；`restricted-call-sites` 已存在但运行未登记 evidence run；formal task 与 probe 都不证本节点的条款 | 裁决后、run 登记后，回填 `test:` 证据 |
| **AI／OG 的迁移片段第二程才有** | 外键存在性、迁移合成、约束名三条义务都起不来 | AI、OG 节点各加一行「导出片段」并落包 |
| **pg 方言零运行** | 本程只接线（D-026 范围裁定） | 装配，第二程 |
| **私钥不外泄**只有窄形式 | 单进程无硬隔离 | 跨进程演化时由协议重给 |
| **断电级持久**无证据形式 | `synchronous=NORMAL`，无断电夹具 | D-027 裁 `NORMAL`；需要时切 `FULL` 须新决定（storage-sql 加 config 项） |
| **租约表被外部删除**导致 `now` 不后退失守 | 运维约定，无法在节点内检测 | 运维；无证据形式 |
| **G-13 残留清扫、G-6 清扫提供者**无义务 | 本版不建 | 产品负责人定节奏 / AI v2 枚举读面 |
| **跨进程的锁竞争与 `clock` 先后** | 本版单机 | 投影 Q-8 |
| **本节点与治理中心的关系** | 治理中心无 PF | 产品开题 |
| **四个基础设施节点尚未接受** | 本节点对它们的采用在接受前是前提，不是依据 | 那四个节点的评审与接受 |
