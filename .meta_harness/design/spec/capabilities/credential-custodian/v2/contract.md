# capability.credential-custodian v2

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.credential-custodian, 2)`——
  `family = capabilities`、`topic = credential-custodian`、规范路径 `spec/capabilities/credential-custodian/v2/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：已由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 接受；精确资源冻结与采用状态由版本外入口及 registry 维护。
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-016 rev 8**、**PF-002 rev 20**、**PF-013 rev 13** 为准
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v2`（candidate；`HoldingScope`、`CredentialRef`）
  - `omne-harness-lite-design-2026-09-15 · data.mcp-endpoint · v2`（candidate；`OAuthBinding`）
  - `omne-harness-lite-design-2026-09-15 · capability.mcp-bridge · v2`（candidate；绑定的状态与迁移、完成时记下的引用、`oauthPendingTtl`）
  - `omne-harness-lite-design-2026-09-15 · capability.model-profile-directory · v2`（candidate；凭据绑定、秘密只在一个问法里出现）
  - 候选依赖改动时本契约须重核
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如
  `capability.credential-custodian/v2#S-17`；缺口 `G-n` 同理。编号在本版本内只追加、不重排

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 治理中心不可达时已开的会话照常干活，离线时用手上那份副本 | [PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活) · [§6.20](../../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据) | S-1、S-12、S-13 |
| 每台机器上只有自己那一把模型凭据，配在租户层；这台机器再连上中心时取到新值 | [PF-016 §6.20](../../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据) · [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) | S-5、S-12 |
| 同一台机器上两个账号是两个据点、互不可见 | [PF-016 §6.4](../../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离) · [§5.2](../../../../product/PF-016-cli-tui-delivery-surface/design.md#52-一个账号在一处怎么被装起来) | S-6 |
| 秘密不进任何一份呈现；能呈现的只有有没有、哪个范围、什么时候配的 | [PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) | S-8 |
| MCP 凭据一份持有一份、不跨租户身份共用；经 OAuth 取得的续期不要人 | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) | S-5、S-17 |
| 跨租户默认拒绝；身份参数显式携带 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | S-9、S-17 |
| 单机交付、语义不变地可拆 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-19 |
| 统一语言 | [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential) · [登录状态](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state) · [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) · [租户](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant) | 全部正式名。**无词条的规格层名字**：凭据保管方（本能力）、保管条目、副本条目、OAuth 条目、清扫——只在本契约里有定义，不另立，已报主线 |

> **这张表里没有产品行、或产品行不足以单独支撑的条款**：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约作为一份**窄口**能力存在：只收「存、取、撤」与 OAuth 条目的三条要求 | 产品负责人裁定 [D-063 R-1](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)（替身改为「接口契约 ＋ 最小提供者」，接口按消费者的需要定窄口）；真承接者见 [D-060 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；最小提供者的落法见 [N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤（条目密文落在绑定所在的同一存储，本机只放密钥） |
> | 租户那一把模型凭据的据点副本经本能力落地、加密、按登录状态归属；取值先本地副本 | 主线裁定 [D-060 §八 M47](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（改判 M44 的「P-1r 不持久凭据」） |
> | [S-16](#s-16-depositoauth)、[S-17](#s-17-resolve)、[S-18](#s-18-清扫) 的三条 OAuth 要求：收成「待生效」、可用判在绑定上、清扫只删三种 | `capability.mcp-bridge` v2 的 S-23 ④ 落成两次提交之后的形状（[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤：条目密文落在绑定所在的同一存储）；清扫的三种是主线裁定 [D-060 §八 M72](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；「与完成在同一个绑定上排序、过期按排到之后读的时刻判」是两次提交之后「对外同成同败」的安全条件，本契约把它写成性质；过期谓词的运算符与开闭区间是主线裁定 N-42。演变过程见[验证入口修订波表](../verification.md#修订波2026-09-25-公开面) |
> | [S-6](#s-6-据点隔离与按登录状态归属) 登录状态归属是**生命周期**，不是读的判据 | **规格层推导**：一个据点只属于一个账号，另一个账号的据点本来就读不到（S-6 第 1 条）；再拿登录状态卡读，同一个账号重新登录之后离线就取不到自己那一把，与 PF-016 §6.17 相抵 |
> | [S-7](#s-7-加密落地) 用密钥也打不开的条目按「没有」答、并留工程记录 | **规格层推导**：它不是「判不出来」（本能力判得出这一条不能用），按「没有」答让副本在中心可达时被重取覆盖；留记录不让损坏静默。OAuth 条目没有覆盖路径，本版留下、不作废绑定（主线裁定 D-060 §八 N-42，[G-10](#十一已知缺口)） |
> | 操作名、失败值名、具名参数 `sweepInterval` | 起草时的候选名（服务键 `credentialCustodian` 见 [D-060 §八 M69](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），**主线已接受**（同节 N-37 ①） |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**会话据点上凭据本体的保管：存下、按条件交出、丢弃，并且落地时只以加密形式存在。**一个据点一份，只服务这一个据点。

| # | 拥有的事实或义务 | 正文 |
|---|---|---|
| 1 | **副本条目**：每个租户那一把[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)在这个据点上的副本，归属写下它的那个登录状态 | [S-5](#s-5-保管条目)、[S-6](#s-6-据点隔离与按登录状态归属) |
| 2 | **OAuth 条目**：经 OAuth 取得的 [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)本体，与它的引用、它属于的那份持有和那个绑定 | [S-5](#s-5-保管条目) |
| 3 | **交出的条件**：副本按租户交出；OAuth 条目只在绑定此刻 `granted` 且记下的就是它时交出 | [S-13](#s-13-readreplica)、[S-17](#s-17-resolve) |
| 4 | **清扫**：只丢三种没用的 OAuth 条目，有界地丢 | [S-18](#s-18-清扫) |
| 5 | **加密落地**；秘密与引用只在各自那一个问法里出现 | [S-7](#s-7-加密落地)、[S-8](#s-8-秘密与引用只在各自那一个问法里出现) |

**六个操作**：写副本（`storeReplica`）、读副本（`readReplica`）、丢副本（`discardReplica`）、按登录状态丢（`discardLoginState`）、收下 OAuth 凭据（`depositOAuth`）、按持有交出（`resolve`），见[第四节](#四操作)。**没有事件。**

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| **凭据绑定**：一个租户配的是哪一把、换、解除 | `capability.model-profile-directory`（`#S-7`）；本能力只保管那一把在据点上的副本 |
| **OAuth 绑定的状态与迁移**、发起与完成、续期调度 | `capability.mcp-bridge`（`#S-8`、`#S-22`～`#S-24`）；本能力只读绑定 |
| **秘密从中心送到据点**、副本何时刷新、轮换怎样传到据点 | 未来资产/据点入口（版本未分配）（下一程）；模型档案读提供者据中心可达性决定何时写副本 |
| **静态 MCP 凭据的收下、出示名、续期写回** | **本版不收**（[G-2](#十一已知缺口)、[G-3](#十一已知缺口)、[G-4](#十一已知缺口)） |
| **中心一侧的凭据保管**：中心上 `CredentialRef` 换值、出厂格那一把 | **本版不收**（[G-7](#十一已知缺口)）；本能力只在据点 |
| **密钥怎样保管** | 提供者设计（[G-9](#十一已知缺口)）；本契约只要求「没有密钥读不出」 |
| **谁能调用本能力的取值问法** | 装配（[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 3 行）：只有模型档案读提供者读副本、只有 MCP 桥收下与交出 OAuth 条目 |

### S-3 本契约明确不承诺什么

- **不防同一操作系统身份下的别的进程直接读落地的东西**：宿主机那一层不隔离（[PF-016 §6.4](../../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离)）。加密防的是没有密钥的拷贝、备份与另一个据点经本能力来读；密钥与密文都够得着的进程，本契约不挡。
- **不判「这把凭据还有没有效」**：副本是写下时的那一把；中心上换过、撤过，据点要等再连上中心、重写副本才知道（[PF-016 §6.20](../../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据)「这台机器再连上中心时取到新值」）。
- **不判引用是不是配在那份持有上**：`resolve` 按调用方交来的持有判归属；持有的配值里是不是这个引用，是交来持有的一方（桥按求值结果）的事（`capability.mcp-bridge/v2#S-5`）。
- **不推送**：条目被写、被丢，都不发通知。

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 身份值、持有与引用、OAuth 绑定、桥的绑定语义、模型档案目录的凭据绑定。**
本契约的消费者（模型档案读提供者、MCP 桥）依赖本契约的操作；**本契约依赖桥的，只是绑定的状态语义**。catalog 里只有本契约 → 桥这一条边；桥 v1 对本契约的引用（`resolve` 的答复、两次提交、过期谓词）只作定义引用、不登依赖——登了成环，按 [registry 互引成环的登记口径](../../../../registry/README.md#covers)处置，两边各在验证入口记对齐义务。

**下表每个 `#S-n` 前缀省去了坐标 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1`；catalog 的 `clauses` 以它为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `data.identity-values` [`#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等) `TenantId` · [`#S-9`](../../../data/identity-values/v1/contract.md#s-9-loginstateid) `LoginStateId` | [S-5](#s-5-保管条目) 副本的键与归属 |
| `data.identity-values` [`#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值) · [`#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝) · [`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) | [S-9](#s-9-缺席时的默认答案) 三类缺席 |
| `data.identity-values` [`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证) · [`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) · [`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | [S-19](#s-19-装配给的保证-vs-协议须给的保证) 右列；[S-16](#s-16-depositoauth) 引用的表示；[S-10](#s-10-失败值) `invalidInput` |
| `data.asset-model` [`#S-16`](../../../data/asset-model/v2/contract.md#s-16-持有范围) `HoldingScope` | [S-5](#s-5-保管条目) OAuth 条目的持有只在租户格 |
| `data.asset-model` [`#S-23`](../../../data/asset-model/v2/contract.md#s-23-凭据引用) `CredentialRef`：不是明文、不透明部署内唯一不复用、只在配上去的持有上有效由保管方按持有判、引用不呈现、续期不算换值 | [S-8](#s-8-秘密与引用只在各自那一个问法里出现)、[S-16](#s-16-depositoauth)、[S-17](#s-17-resolve) |
| `data.mcp-endpoint` [`#S-12`](../../../data/mcp-endpoint/v2/contract.md#s-12-oauth-绑定) `OAuthBinding`：绑定号、三态 | [S-5](#s-5-保管条目)、[S-17](#s-17-resolve)、[S-18](#s-18-清扫) |
| `capability.mcp-bridge` [`#S-5`](../../mcp-bridge/v2/contract.md#s-5-接入点持有的寻址) 接入点持有 (`tenant`, `endpoint`, `scope`) | [S-16](#s-16-depositoauth)、[S-17](#s-17-resolve) 的 `holding` |
| `capability.mcp-bridge` [`#S-8`](../../mcp-bridge/v2/contract.md#s-8-oauth-绑定状态与迁移) 绑定的迁移；`revoked` 是终态；`oauthPendingTtl` 过期读时判定 | [S-18](#s-18-清扫) 三种可丢的条目 |
| `capability.mcp-bridge` [`#S-9`](../../mcp-bridge/v2/contract.md#s-9-凭据的出示与取用) 第 2 条：只按租户格上这个租户自己的持有解引用，组织格、工作区格、出厂格不持有 MCP 凭据 | [S-16](#s-16-depositoauth) ③、[S-17](#s-17-resolve) ③ |
| `capability.mcp-bridge` [`#S-23`](../../mcp-bridge/v2/contract.md#s-23-completeoauth) 完成：绑定迁 `granted` 并记下那个引用 | [S-17](#s-17-resolve)「记下的就是它」 |
| `capability.mcp-bridge` [`#S-30`](../../mcp-bridge/v2/contract.md#s-30-装配给与协议给) 第 3 行：引用跨节点不得变成持票即可用的令牌 | [S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 3 行右列 |
| `capability.model-profile-directory` [`#S-7`](../../model-profile-directory/v2/contract.md#s-7-凭据绑定) 一个租户至多一把，替换即轮换 | [S-5](#s-5-保管条目) 一个租户一条副本 |
| `capability.model-profile-directory` [`#S-12`](../../model-profile-directory/v2/contract.md#s-12-秘密只在一个问法里出现) 秘密只在取值问法里出现 | [S-8](#s-8-秘密与引用只在各自那一个问法里出现) |

---

## 二、概念、身份与必要状态

### S-5 保管条目

**保管条目（无词条）是本能力保管的一份凭据本体，恰两种，按用途分开，互不转换。**

| 种类 | 键与身份 | 带什么 | 谁写、谁读 |
|---|---|---|---|
| **副本条目** | **租户**（`TenantId`）：一个租户在一个据点上至多一条 | 本体（那个租户的凭据绑定所指的那一把的值，`capability.model-profile-directory/v2#S-7`）；**归属的登录状态**（写下它的那一次 `storeReplica` 交来的 `LoginStateId`）；写下的时刻 | 模型档案读提供者写、读、丢 |
| **OAuth 条目** | **引用**（`CredentialRef`，本能力在收下时发出） | 本体（经 OAuth 取得的那一份 MCP 凭据）；**所属持有** (`tenant`, `endpoint`, `scope`)——`scope` 恒是租户格（`data.asset-model/v2#S-16` 的 `tenant` 那一格）；**所属绑定**（`OAuthBinding` 的绑定号） | MCP 桥收下、交出；本能力自己清扫 |

- **一个租户一条副本**：再写就是整条替换（轮换就是换值，`capability.model-profile-directory/v2#S-7`）。
- **OAuth 条目一经收下，持有与绑定不再改**；本体本版也不改（续期写回不在本版，[G-4](#十一已知缺口)）。
- **没有第三种**：静态 MCP 凭据、中心一侧的凭据本版都没有条目（[S-2](#s-2-本契约不拥有什么)）。

### S-6 据点隔离与按登录状态归属

1. **据点隔离**：本能力的一次在场只服务一个[会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)；它的条目**只经这个据点的本能力读得到**。同一台机器上另一个账号的据点、另一个中心的据点，经它们自己的本能力读不到这里的任何一条（[PF-016 §6.4](../../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离)）。
2. **按登录状态归属**：每条副本条目归属写下它的那个登录状态。**那个登录状态在这个据点上结束时，归属它的副本条目全部丢弃**（[S-15](#s-15-discardloginstate)）；谁在什么时候告诉本能力「结束了」，本版未定（[G-5](#十一已知缺口)）。
3. **归属不是读的判据**：`readReplica` 按租户读，不核调用这一刻的登录状态——同一个账号重新登录之后、中心可达之前，仍读得到自己那一把（离线照常，[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)）。读的判据是据点（第 1 条）与租户。
4. **OAuth 条目不按登录状态归属**：它的寿命跟它的绑定走（[S-18](#s-18-清扫)），「凭据跟机器」（`capability.mcp-bridge/v2#S-8`）。

### S-7 加密落地

- **条目的本体在本能力之外的任何持久介质上，只以加密形式存在。**拷走、备份落地的东西而没有密钥，读不出任何一条的本体。
- **密钥怎样保管归提供者**（[G-9](#十一已知缺口)）；本契约要求：**密钥此刻取不到 ⇒ 要读或要写本体的操作 `unavailable`**，不以明文落地代替，也不答「没有」。
- **用密钥也打不开的条目**（损坏、密钥已换）：按**这一条不存在**答（`readReplica` 答 `absent`，`resolve` 答 `notResolvable`），**并留一条可观察的工程记录**——不静默当作没有过。**副本条目**在下一次写入同一键时被替换。**OAuth 条目本版留下、不作废它的绑定**：它不属于 [S-18](#s-18-清扫) 的三种可丢（绑定 `granted` 且记下的就是它时不丢），本能力也不迁绑定——**产品后果：人重新授权之前，旧绑定仍是 `granted`，但交不出**，桥那一次 `credentialUnavailable`（[G-10](#十一已知缺口)；主线裁定，D-060 §八 N-42）。

### S-8 秘密与引用只在各自那一个问法里出现

- **本体只出现在两处成功返回里**：`readReplica` 的 `{ body }`、`resolve` 的 `{ body }`。**不出现在**任何失败值、任何其他操作的返回、任何工程记录、日志与呈现里（[PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)；`capability.model-profile-directory/v2#S-12` 同一口径）。
- **OAuth 条目的引用只出现在 `depositOAuth` 的成功返回里**；本能力之外它归配值（`data.asset-model/v2#S-23` 第 5 条：引用也不呈现）。工程记录要指认一条条目时，不写引用本身。
- **引用不可猜、部署内唯一、不回收不复用**（`data.asset-model/v2#S-23` 第 3 条）。另一个据点即便拿到同一个串，经它自己的本能力也交不出这里的本体（[S-6](#s-6-据点隔离与按登录状态归属) 第 1 条）。

---

## 三、贯穿全部操作的规矩

### S-9 缺席时的默认答案

| 缺席的是什么 | 答案 | 依据 |
|---|---|---|
| **身份参数**（`loginState`、`tenant`、`holding` 的三个成员、`binding`、`ref`） | **`invalidInput`**——没有默认值，不补「当前租户」「当前登录状态」 | `data.identity-values/v1#S-17` |
| **交出的条件**：没有这条副本、没有这个引用的条目、条目不属于交来的持有、绑定不是 `granted`、绑定记下的不是它 | **不交**：副本答 `absent`，OAuth 条目答 `notResolvable`——**不回退到别的条目、别的租户那一把** | `data.identity-values/v1#S-18` |
| **读不到**：存储、密钥或绑定此刻取不到 | **`unavailable`**——与「不交」是两个值 | `data.identity-values/v1#S-19` |

### S-10 失败值

**本契约的失败值恰五个，没有「其他」。**每个操作的 ⑥ 是它的子集，按判定次序从左到右。

| 失败值 | 含义 |
|---|---|
| `invalidInput` | 输入不合形状，或身份参数缺席（表示层拒绝值，与判定分开：`data.identity-values/v1#S-33`）；含 OAuth 条目的持有不在租户格、`holding.tenant` 与租户格载荷不是同一个租户 |
| `custodianWithdrawn` | 本能力正在撤除，这一次没有结论；写操作「提交了没有」不确知（[S-20](#s-20-撤除重启与在途)） |
| `unavailable` | 存储、密钥或绑定此刻读不到；这一次没有提交 |
| `bindingUnknown` | 收下 OAuth 凭据时，交来的绑定号在这个据点上不存在 |
| `notResolvable` | 按持有交出 OAuth 条目的条件不成立（[S-17](#s-17-resolve) ⑥ 列的五种，**不分这几种**） |

**`absent` 不是失败值**：它是 `readReplica` 的一个结论（这个据点上没有这个租户的副本）。

---

## 四、操作

### S-11 这一节每个操作写全九件事

①输入 · ②前置与授权 · ③结构性禁止（不适用写「无」）· ④提交点与原子性 · ⑤成功返回 · ⑥失败集合（闭合枚举，按判定次序）· ⑦幂等与重复 · ⑧缺席时的默认答案 · ⑨事件。

**授权**：本能力不判调用方是谁；**只有具名的消费者够得着各个操作**由装配给（[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 3 行）。

### S-12 storeReplica

**把一个租户那一把模型凭据的副本写进这个据点，归属交来的登录状态。**模型档案读提供者在中心可达、向中心取到值之后调用。

| # | 内容 |
|---|---|
| ① | `loginState: LoginStateId`、`tenant: TenantId`、`body`（非空字节序列）；都必带 |
| ② | 调用方保证 `tenant` 是这个据点上这个登录状态所属账号的一个租户身份，`body` 是中心此刻那个租户凭据绑定所指的值（来路归未来资产/据点入口（版本未分配），[G-6](#十一已知缺口)） |
| ③ | 无 |
| ④ | **一次提交整条替换**这个租户的副本条目：本体、归属的登录状态、写下的时刻一起换；本体加密后落地（[S-7](#s-7-加密落地)）。并发两次写同一个租户，后提交的那一次整条胜出，**不出现两次各写一半** |
| ⑤ | `{ tenant }`——不回显本体 |
| ⑥ | `invalidInput` · `custodianWithdrawn` · `unavailable` |
| ⑦ | 同一输入重复写，结果与写一次相同（写下的时刻取最后一次） |
| ⑧ | 身份参数缺席 ⇒ `invalidInput`；密钥或存储取不到 ⇒ `unavailable`，**不以明文落地** |
| ⑨ | 不发 |

### S-13 readReplica

**读一个租户那一把模型凭据在这个据点上的副本。**

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`；必带 |
| ② | 无（调用方只能是模型档案读提供者，[S-11](#s-11-这一节每个操作写全九件事)） |
| ③ | 无 |
| ④ | 只读 |
| ⑤ | 恰一种：`{ body }`——这个据点上这个租户的副本本体；`{ absent }`——这个据点上没有这个租户的副本（含 [S-7](#s-7-加密落地) 打不开的那一种） |
| ⑥ | `invalidInput` · `custodianWithdrawn` · `unavailable` |
| ⑦ | 只读，任意重复 |
| ⑧ | **读不到 ⇒ `unavailable`，不答 `absent`**；没有 ⇒ `absent`，**不拿别的租户那一把顶上** |
| ⑨ | 不发 |

- **`absent` 与 `unavailable` 对调用方的后果不同**：前者说「这台机器上没有」，调用方可以去问中心；后者说「此刻判不出」，调用方如实失败（`capability.model-profile-directory/v2` 的 S-20 ⑧）。

### S-14 discardReplica

**丢掉一个租户的副本条目。**

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`；必带 |
| ② | 无 |
| ③ | 无 |
| ④ | 一次提交删掉这个租户的副本条目（本体一并不可再读） |
| ⑤ | `{ tenant, present: false }` |
| ⑥ | `invalidInput` · `custodianWithdrawn` · `unavailable` |
| ⑦ | **幂等**：没有这条也是同一个成功返回 |
| ⑧ | 身份参数缺席 ⇒ `invalidInput` |
| ⑨ | 不发 |

### S-15 discardLoginState

**一个登录状态在这个据点上结束：丢掉归属它的全部副本条目。**

| # | 内容 |
|---|---|
| ① | `loginState: LoginStateId`；必带 |
| ② | 调用方是这个据点上知道「这个登录状态结束了」的那一方（本版未定，[G-5](#十一已知缺口)） |
| ③ | 无 |
| ④ | **一次提交**删掉归属这个登录状态的全部副本条目；不动别的登录状态的、不动 OAuth 条目 |
| ⑤ | `{ loginState }` |
| ⑥ | `invalidInput` · `custodianWithdrawn` · `unavailable` |
| ⑦ | **幂等**：再做一次、或这个登录状态从没写过副本，同一个成功返回 |
| ⑧ | 身份参数缺席 ⇒ `invalidInput` |
| ⑨ | 不发 |

- **只删「归属它」的**：同一个租户的副本后来被另一个登录状态重写过，它就归属那一个，这里不删。

### S-16 depositOAuth

**收下一份经 OAuth 取得的 MCP 凭据，收成「待生效」，交回一个新的引用。**MCP 桥在完成一次 OAuth 流程、换到凭据之后、迁绑定之前调用（`capability.mcp-bridge/v2#S-23` ④）。

| # | 内容 |
|---|---|
| ① | `holding = { tenant, endpoint, scope }`（`capability.mcp-bridge/v2#S-5` 的前三个成员）、`binding`（绑定号）、`body`（非空字节序列）；都必带 |
| ② | 无 |
| ③ | **`scope` 不是租户格、或它载的租户不是 `holding.tenant` ⇒ `invalidInput`**——组织格、工作区格、出厂格不持有 MCP 凭据（`capability.mcp-bridge/v2#S-9` 第 2 条） |
| ④ | **一次提交**：写一条 OAuth 条目（本体加密落地），记下持有与绑定，发出一个新的 `CredentialRef`。**提交那一刻这个绑定号在这个据点上存在**；此后这个绑定在还有条目指着它时不消失（[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 2 行）。**收下即「待生效」**：绑定迁 `granted` 并记下这个引用之前，它交不出（[S-17](#s-17-resolve)） |
| ⑤ | `{ ref }`——新的引用（[S-8](#s-8-秘密与引用只在各自那一个问法里出现)） |
| ⑥ | `invalidInput` · `custodianWithdrawn` · `unavailable` · `bindingUnknown` |
| ⑦ | **不幂等**：每次成功都是一条新条目、一个新引用。重试多出的那一条永远不会被绑定记下，由清扫丢弃（[S-18](#s-18-清扫)） |
| ⑧ | 身份参数缺席 ⇒ `invalidInput`；绑定号不存在 ⇒ `bindingUnknown`；读不到 ⇒ `unavailable` |
| ⑨ | 不发 |

- **本操作不看绑定此刻的状态**：绑定已经 `revoked`、已经过期，也照样收下——那一条不会被交出，由清扫丢弃。收下与迁 `granted` 之间的一切交错，结局都由 [S-17](#s-17-resolve) 的判据与 [S-18](#s-18-清扫) 的三种决定。

### S-17 resolve

**按持有交出一条 OAuth 条目的本体。**MCP 桥在连对端要出示凭据时调用（`capability.mcp-bridge/v2#S-9` 第 2 条）。

| # | 内容 |
|---|---|
| ① | `ref: CredentialRef`、`holding = { tenant, endpoint, scope }`；都必带 |
| ② | 无（调用方只能是 MCP 桥，[S-11](#s-11-这一节每个操作写全九件事)） |
| ③ | `scope` 不是租户格、或载的租户不是 `holding.tenant` ⇒ `invalidInput` |
| ④ | 只读。**在一次一致的读里**判下面五条并交出本体——判定所读的绑定状态与交出的本体属于同一时刻（绑定的迁移与这一次读排得出先后，[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 2 行） |
| ⑤ | `{ body }` |
| ⑥ | `invalidInput` · `custodianWithdrawn` · `unavailable` · `notResolvable`——**`notResolvable` 恰指五种，不分**：这个据点上从没发过这个引用；这条已被丢弃；条目的持有不等于交来的持有；条目的绑定此刻不是 `granted`；绑定是 `granted` 而它记下的引用不是这一个 |
| ⑦ | 只读，任意重复；两次之间绑定迁了，两次答案可以不同 |
| ⑧ | **读不到**（存储、密钥、绑定任一）**⇒ `unavailable`**，不答 `notResolvable`；条件不成立 ⇒ `notResolvable`，**不回退到同一持有上的另一条、别的持有上的同一个引用** |
| ⑨ | 不发 |

- **持有按 `data.asset-model/v2#S-16` 的相等判**：租户按 `TenantId` 的两个分量，接入点按能力标识。**跨租户拿引用来换，与引用从没发过同一个值**——不透露它属于谁。
- **在途的照常完成**：一次读已经判定交出，其后绑定迁 `revoked`，这一次照样交出；撤销管的是下一次（`capability.mcp-bridge/v2` 的 S-24 ③ 同一口径）。
- **本版只有 OAuth 条目可交出**：静态 MCP 凭据的引用本版没有条目，一律 `notResolvable`（[G-2](#十一已知缺口)）。

---

## 五、清扫

### S-18 清扫

**本能力自己丢弃没用的 OAuth 条目。恰三种可丢，别的一条都不丢。**

| 可丢的条目 | 为什么它没用 |
|---|---|
| **它的绑定已 `revoked`** | 终态（`capability.mcp-bridge/v2#S-8`）；它再也交不出 |
| **它的绑定仍 `pending`，而已过 `oauthPendingTtl`** | 过期即作废（同上）；过期按清扫判定那一刻的时刻判 |
| **它的绑定已 `granted`，而记下的引用不是它** | 同一个绑定只认一个引用；它是崩溃、重试或并发完成留下的另一条 |

1. **绑定仍 `pending` 且未过期的不丢**——它正等着桥迁 `granted`。**绑定 `granted` 且记下的就是它的不丢**。
2. **与完成排得出先后**：清扫判一条条目，与桥对同一个绑定的完成（迁 `granted`）**在那个绑定上排出次序**；**过期按排到之后读的时刻判**，与桥判过期用**同一个时间源、同一个 `oauthPendingTtl` 值、同一个谓词**（[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 2 行）：**过期 ⇔ `now > since + oauthPendingTtl`**——严格大于，恰等于那一刻**不算**过期（`since` 是绑定进 `pending` 的时刻，`capability.mcp-bridge/v2#S-8`；与 [`formal/Sweep.tla`](formal/Sweep.tla) 的 `Expired` 同一式；主线裁定，[D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。两边的运算符或开闭区间一不同，同一时刻就可能一边判过期丢了条目、另一边判未过期迁了 `granted`。由此：**不会出现「绑定 `granted` 却交不出」**——清扫先到而未过期就不丢；清扫先到而已过期就丢，桥随后排到、读到的时刻不早于那一刻，同样判过期、不迁 `granted`。这一条由形式模型检查（[S-21](#s-21-本版选用哪些形式工件)）。
3. **读不到绑定就不丢**：绑定此刻读不到，这一轮跳过那一条，**不按「可丢」处置**。
4. **有界**：一条条目成为可丢之后，不晚于具名参数 `sweepInterval` 被丢（本能力在场、存储读得到；**且一轮清扫能在 `sweepInterval/2` 之内做完**——提供者按半个间隔起一轮，一条刚错过这一轮的条目最迟在下一轮被判到；一轮做不完时这个上界不成立，见第七节进展性质的前提列；主线裁定，D-060 §八 N-40 ③）。取值未定（[G-8](#十一已知缺口)）。
5. **丢弃之后**：本体不可再读；那个引用从此 `notResolvable`。清扫不改绑定、不发通知。

---

## 六、事件

**本版不发任何事件。**写下、丢弃、清扫都不通知——没有消费者要它。

---

## 七、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| 一个租户在一个据点上至多一条副本 | [S-5](#s-5-保管条目)、[S-12](#s-12-storereplica) ④ | —— | `capability.model-profile-directory/v2#S-7` |
| 每条 OAuth 条目指着一个存在的绑定 | [S-16](#s-16-depositoauth) ④ | 绑定在还有条目指着它时不消失（[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 2 行） | `capability.mcp-bridge/v2#S-23` ④（收成「待生效」、指着绑定） |
| **绑定 `granted` ⇒ 它记下的那条条目在、交得出**（`GrantedResolvable`） | [S-18](#s-18-清扫) 第 1、2 条 | 清扫与完成在绑定上排序；两边同一时间源、读数不回退；同一个 `oauthPendingTtl`、同一个过期谓词；**记下的条目可开封**（密钥未换、条目未损——打不开的按 [S-7](#s-7-加密落地) 第三条答 `notResolvable`，本版留下，[G-10](#十一已知缺口)） | `capability.mcp-bridge/v2#S-23` ④ 的两次提交；[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤；**形式模型检查**（模型里条目恒可开封，这条前提被建模方式吸收） |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **交出一条绑定不是 `granted`、或绑定记下的不是它的 OAuth 条目** | [S-17](#s-17-resolve) ④⑥ | 判定与交出在一次一致的读里 | `capability.mcp-bridge/v2#S-23` ④（`granted` 且记下的是它才交出） |
| **一个租户换出另一个租户、另一份持有的本体** | [S-13](#s-13-readreplica) ⑧、[S-17](#s-17-resolve) | —— | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)、[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **另一个据点经它的本能力读到这里的条目** | [S-6](#s-6-据点隔离与按登录状态归属) 第 1 条 | 每个据点的本能力各有自己的条目与密钥（提供者，[G-9](#十一已知缺口)） | [PF-016 §6.4](../../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离) |
| **本体以明文落地**；读不到时把「判不出」答成 `absent` 或 `notResolvable` | [S-7](#s-7-加密落地)、[S-9](#s-9-缺席时的默认答案) | —— | D-060 §八 M47；`data.identity-values/v1#S-19` |
| **本体或引用出现在成功返回之外的任何地方** | [S-8](#s-8-秘密与引用只在各自那一个问法里出现) | —— | [PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) |
| **清扫丢掉一条仍在等（`pending` 未过期）或正在用（`granted` 且记下的是它）的条目** | [S-18](#s-18-清扫) 第 1 条 | —— | [D-060 §八 M72](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 可丢的 OAuth 条目被丢（`OrphanEventuallySwept`） | `sweepInterval` | 本能力在场；存储与绑定读得到；时间源推进；**一轮清扫能在 `sweepInterval/2` 之内做完**（提供者按半个间隔起一轮；[S-18](#s-18-清扫) 第 4 条） | [D-060 §八 M72](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；**形式模型检查**（弱公平性作前提；只检查「终将」，不检查上界） |
| 登录状态结束之后，归属它的副本条目不再读得出 | `discardLoginState` 那一次提交 | 有人调用它（[G-5](#十一已知缺口)） | D-060 §八 M47 |

---

## 八、装配给的保证 vs 协议须给的保证

### S-19 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版单机，语义不变地可拆。

| 保证 | 单机由谁给（装配给） | 跨进程之后谁兑现（协议给） | 做不到会怎样 |
|---|---|---|---|
| **加密落地**（[S-7](#s-7-加密落地)） | 提供者：落地前加密；密钥的保管归提供者设计（[G-9](#十一已知缺口)） | **不变**：任何部署形态下落地都只有密文 | 拷走一份备份就拿到了每个租户的凭据 |
| **OAuth 条目的可用判在绑定上**：绑定在还有条目指着它时不消失；`resolve` 的判定与交出在一次一致的读里；清扫与完成在同一个绑定上排序、用同一时间源（[S-16](#s-16-depositoauth)、[S-17](#s-17-resolve)、[S-18](#s-18-清扫)） | **装配**：OAuth 条目与桥的绑定在同一个存储、同一个约束域里，本能力读绑定与桥迁绑定排得出先后（[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤）；**两边判过期共用同一份谓词实现**（[S-18](#s-18-清扫) 第 2 条那一式，D-060 §八 N-42），不各写一份 | 保管方与桥分在两个进程或两份存储时，**两边须共有一个排序点**（绑定所在的那一处），读绑定与迁绑定都经它；过期谓词与 `oauthPendingTtl` 的值随协议定死一份、两端逐字相同；做不到就不能拆开 | 绑定 `granted` 却交不出（人不知道要重取）；或已作废的凭据被交出；两边谓词一不同（例如一边 `≥`、一边 `>`），恰在边界的那一刻就出现前一种 |
| **只有具名消费者够得着取值问法**（[S-11](#s-11-这一节每个操作写全九件事)） | 装配：`readReplica` 只有模型档案读提供者够得着，`depositOAuth` 与 `resolve` 只有 MCP 桥够得着（由静态检查守，同 D-060 §八 N-37 ⑩ 那一条静态检查） | 跨进程之后，取值请求须携带调用方身份并在接收边界重新验证（`data.identity-values/v1#S-30`）；引用不得变成持票即可用的令牌（`capability.mcp-bridge` v2 的 S-30 第 3 行） | 任何插件都能把一个租户的凭据读出来 |
| **据点隔离**（[S-6](#s-6-据点隔离与按登录状态归属)） | 装配：每个据点装自己的一份本能力，条目与密钥不共用 | **不变** | 同一台机器上另一个账号的据点读到这份副本（cli 验证入口 M47 第 ③ 条） |
| **写副本的租户与登录状态属实**（[S-12](#s-12-storereplica) ②） | 装配：模型档案读提供者从据点当前的登录状态与中心答复取值 | 未来资产/据点入口（版本未分配） 送达秘密时携带租户与登录状态，在接收边界重新验证 | 一个租户的副本写到另一个租户名下 |

---

## 九、交接、缺席与恢复

### S-20 撤除、重启与在途

- **条目是耐久事实**：本能力撤除、替换、据点进程重启，条目都还在；下一次在场照样读得到（密钥取得到的前提下）。**撤除不丢任何条目**——副本随登录状态清除（[S-15](#s-15-discardloginstate)），不随本能力撤除清除（模型档案目录节点同一口径）。
- **撤除时在途的操作**：已提交的算数；这一次没有结论的以 `custodianWithdrawn` 收。**写操作的调用方拿到 `custodianWithdrawn` 时不确知提交了没有**：`storeReplica`、`discardReplica`、`discardLoginState` 幂等，可重做；`depositOAuth` 重做会多一条，由清扫丢弃。
- **崩溃**：同撤除；一次提交要么整体在、要么整体不在（[S-12](#s-12-storereplica) ④、[S-16](#s-16-depositoauth) ④）。**收下之后、绑定迁 `granted` 之前崩溃**：那条条目留在「待生效」，绑定随后过期，清扫丢弃（[S-18](#s-18-清扫)）。
- **清扫不承担正确性**：它不跑，交出的判据照样成立（[S-17](#s-17-resolve) 不看条目是否已被清扫）；它只让无用的本体不长期留在据点上。
- **本能力不在场时**：消费者按自己的契约收——模型档案读提供者据点没有副本（离线即 `credentialUnavailable`），桥要凭据的操作 `dependencyUnavailable`（`capability.mcp-bridge/v2#S-29`）。**不当成「没有凭据、照常」**。

---

## 十、规范表达与验证义务

### S-21 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| **清扫与完成交错时不出现「`granted` 却交不出」**（`GrantedResolvable`）；可丢的终被丢（`OrphanEventuallySwept`） | **TLA+ 行为模型** [`formal/Sweep.tla`](formal/Sweep.tla)，映射见 [`formal/README.md`](formal/README.md) | 两个写入者（桥的完成、本能力的清扫）在同一个绑定上交错，时刻与过期参与判定；**去掉「只丢三种」或「按排到之后的时刻判」任一处，断言都有反例**——这是一条会失败的断言 |
| 交出的五个条件、跨租户与跨持有 | **规范场景**（[S-25](#s-25-oauth-条目待生效时不交出granted-才交出)） | 一次一致读里的纯判定；在模型里是一个守卫，**被建模方式吸收** |
| 据点隔离、按登录状态丢弃 | **规范场景**（[S-23](#s-23-另一个账号的据点读不到)、[S-24](#s-24-登录状态结束副本随之清除)） | 要观察的是两个真实据点与真实的登录状态结束 |
| 加密落地、秘密不出本契约 | **规范场景**（[S-26](#s-26-加密落地)、[S-27](#s-27-秘密不出本契约)） | 只有对真实落地内容与真实输出核得出 |

**不建 Alloy、不建 Schema**：条目的结构约束（一个租户一条副本、条目指着存在的绑定）是单存储里的唯一性与引用谓词，写进 Alloy 只会是被建模方式吸收的约束；capability 不发布 Schema（[规格入口](../../../README.md#准入门槛与停止条件)）。执行状态与结果在[验证入口](../verification.md)。

### 规范场景

#### S-22 离线用副本

据点在线：模型档案读提供者向中心取到租户 `T` 那一把，`storeReplica(L, T, 值)`。切断到中心的连接，发起一次模型调用。

**必须观察到**：`readReplica(T)` 交回那个值，调用照常发出（cli 验证入口 M47 第 ①、② 条的这一半）。
**绝不能观察到**：离线时读副本答 `absent` 或 `unavailable`（副本在、密钥取得到的前提下）。

#### S-23 另一个账号的据点读不到

同一台机器上账号 A、B 各一个据点；A 的据点写下 A 的租户 `T_A` 那一把。B 的据点 `readReplica(T_A)`；再把 A 据点落地的**条目**拷到 B 的据点下再读——**只拷条目，B 的密钥不变**：B 用自己的密钥打不开 A 的密文。

**必须观察到**：两次都是 `absent`。
**不在本场景里**：连 A 的密钥一起拷过去——那是 [S-3](#s-3-本契约明确不承诺什么) 明说不挡的情形（密钥与密文都够得着，本契约不挡）；本场景不以「连密钥也拷了仍读不到」为通过条件（主线裁定，D-060 §八 N-40 ③）。
**绝不能观察到**：B 读出 A 的本体（cli 验证入口 M47 第 ③ 条）。

#### S-24 登录状态结束，副本随之清除

登录状态 `L1` 下写 `T1`、`T2` 两条副本；换到登录状态 `L2` 后重写 `T2`。`discardLoginState(L1)`。

**必须观察到**：`readReplica(T1)` 为 `absent`；`readReplica(T2)` 仍交回 `L2` 下写的那个值。

#### S-25 OAuth 条目：待生效时不交出，`granted` 才交出

绑定 `b` 为 `pending`。`depositOAuth(h, b, 值)` 得 `r`。依次：`resolve(r, h)`；桥把 `b` 迁 `granted` 并记下 `r`，再 `resolve(r, h)`；换一份持有 `h'`（另一个租户）`resolve(r, h')`；桥把 `b` 迁 `revoked`，再 `resolve(r, h)`；存储读失败时 `resolve(r, h)`。

**必须观察到**：`notResolvable` · `{ body }` · `notResolvable` · `notResolvable` · `unavailable`。

#### S-26 加密落地

写下几条副本与 OAuth 条目，拷出本能力落地的全部内容；另让密钥取不到。

**必须观察到**：拷出的内容里找不到任何一条本体的明文（以已知原文逐字节扫）；密钥取不到时 `readReplica`、`resolve`、`storeReplica`、`depositOAuth` 都是 `unavailable`。

#### S-27 秘密不出本契约

以已知原文作哨兵，走完 [S-22](#s-22-离线用副本)～[S-26](#s-26-加密落地) 全部路径。

**必须观察到**：哨兵只出现在 `readReplica`、`resolve` 的成功返回里；引用只出现在 `depositOAuth` 的成功返回里——**任何失败值、工程记录、日志与呈现里都没有**（cli 验证入口 M47 第 ④ 条）。

#### S-28 清扫与完成交错

绑定 `b` 为 `pending`，条目 `r` 已收下；让清扫与桥的完成**真并发**，分别在 `b` 未过期、**恰在边界**（两边读到的都是 `since + oauthPendingTtl`，不算过期）、刚过期三种时刻下各跑多轮；另造一条 `granted` 却记着别的引用的、一条 `revoked` 的。

**必须观察到**：每一轮结局要么「`b` 为 `granted` 且 `resolve(r, h)` 交出」，要么「`b` 未迁 `granted` 且 `r` 被丢」；后两条在 `sweepInterval` 之内被丢。
**绝不能观察到**：`b` 为 `granted` 而 `resolve(r, h)` 得 `notResolvable`；`pending` 未过期的那条被丢。

---

## 十一、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **与真承接者那一程的关系**：本契约是凭据保管方的**窄口**，真承接者是 `infra/secrets` 那一程（[D-060 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：本程不补、留给下一程）。**本版不收**：静态 MCP 凭据（G-2、G-3）、续期写回（G-4）、中心一侧（G-7）、密钥保管的细节（G-9）。那一程出本契约的新版本；本版的条目两种、交出的条件、清扫三种、加密落地与秘密只在两处出现，在新版本里保留 | 主线 → `infra/secrets` 那一程 | 那一程立节点与新版本 |
| G-2 | **凭据最初怎样进来**：静态 MCP 凭据由谁、经哪个面收下（人在交付面上配一把 API key 的那条路）；中心的模型凭据怎样送到据点（副本的来路）。本版静态凭据的引用一律 `notResolvable`——**要静态凭据的 MCP 接入点本版连不上**；副本的值由调用方交来 | 主线 → 未来资产/据点入口（版本未分配）＋ 交付面 | 收下静态凭据的操作与秘密的送达各有契约 |
| G-3 | **静态凭据的出示名**（环境变量名、请求头名） | `capability.mcp-bridge` 的 G-7 | 形状定下，本契约新版本让条目带它 |
| G-4 | **本版已知缺口已获产品负责人接受（[D-064 ⑰](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)），仍未闭合**。**续期写回**（同一个引用、本体换新、给出到期时刻）：本版 OAuth 条目的本体不改——**令牌到期之后续不上，桥那一次 `credentialUnavailable`，人要重新取** | 主线 → `infra/secrets` 那一程 | 本契约新版本加续期写回，与 `capability.mcp-bridge/v2#S-24` 对齐 |
| G-5 | **谁在什么时候调用 `discardLoginState`**：登录状态在据点上结束（退出、被撤销、失效）由谁观察到 | 主线 → 未来资产/据点入口（版本未分配） 与 `capability.account-identity` 在据点一侧的读面 | 那一侧给出「登录状态结束」的来路 |
| G-6 | **`storeReplica` 的登录状态与值从哪来**：据点当前的登录状态、中心交来的那一把 | 未来资产/据点入口（版本未分配） | 送达契约定下 |
| G-7 | **中心一侧的保管**：中心上把凭据绑定里的 `CredentialRef` 换成值（模型档案目录 P-1、出厂格那一把） | 主线 → 中心装配那一程（`apps/tenancy-host`）与 `infra/secrets` | 中心一侧有保管方契约（可能是本契约新版本的另一半） |
| G-8 | **具名参数的取值**：`sweepInterval`；`oauthPendingTtl` 取 `capability.mcp-bridge` 的同一个值 | 主线／装配（部署配置，缺值即启动失败） | 装配给值 |
| G-9 | **密钥保管**：谁能取、换钥怎样重加密。**放在哪已由主线定到最小提供者**：条目（两种）以密文落在绑定所在的同一存储、本机只放密钥（[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤）——这不改 [S-7](#s-7-加密落地)，只说明它的第一句在最小提供者上怎样成立 | 提供者设计（`infra/secrets` 节点） | 节点写明取用与换钥；本契约 [S-7](#s-7-加密落地) 不变 |
| G-10 | **打不开的 OAuth 条目怎样收**（2026-09-25，主线裁定 D-060 §八 N-42）：密钥换了或条目损了，`resolve` 答 `notResolvable`（[S-7](#s-7-加密落地) 第三条），而那条条目不属于三种可丢、它的绑定仍 `granted`——**本版留下、不作废绑定**；产品后果：人重新授权之前，旧绑定仍 `granted` 但交不出，桥那一次 `credentialUnavailable` | 主线 → `infra/secrets` 那一程（与桥感知绑定失效、续期写回同一版，[G-4](#十一已知缺口)） | 本契约新版本加一种可丢（打不开的 OAuth 条目），桥那一侧能感知绑定失效、迁 `revoked` |

---

## 十二、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **模型档案读提供者**（据点；D-060 §八 M47 的 P-1r） | 先读本地副本；没有时中心可达就取值、写成副本；中心不可达且没有副本 ⇒ `credentialUnavailable`；保管方在而读失败 ⇒ `unavailable`；副本随登录状态清除、不随它自己撤除清除 | [S-12](#s-12-storereplica)、[S-13](#s-13-readreplica)（`absent` 与 `unavailable` 分开）、[S-15](#s-15-discardloginstate)、[S-20](#s-20-撤除重启与在途) | **够**。写副本要交登录状态——来路是 [G-6](#十一已知缺口) |
| **取值问法的静态检查**（据点上的值只经保管方落地） | 据点上的本体只在本能力里 | [S-7](#s-7-加密落地)、[S-8](#s-8-秘密与引用只在各自那一个问法里出现)、[S-19](#s-19-装配给的保证-vs-协议须给的保证) 第 3 行 | **够**；那条静态检查要加一条：`readReplica` 只许模型档案读提供者解析（主线已接受，[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩） |
| **MCP 桥**（`capability.mcp-bridge` v2：[S-9](../../mcp-bridge/v2/contract.md#s-9-凭据的出示与取用) 第 2 条解引用、[S-23](../../mcp-bridge/v2/contract.md#s-23-completeoauth) ④ 两次提交） | 收成「待生效」、指着绑定、交回新引用；同一读里判绑定 `granted` 且记下的是它才交出；清扫只删三种、与完成在同一个绑定上排序、过期按排到之后读的时刻判、两边同一个过期谓词 | [S-16](#s-16-depositoauth)、[S-17](#s-17-resolve)、[S-18](#s-18-清扫) | **够**。静态凭据按持有交出——交得出的条件本版已有、条目没有，本版不收（[G-2](#十一已知缺口)：静态凭据的引用一律 `notResolvable`）；续期写回、出示名本版不收（[G-4](#十一已知缺口)、[G-3](#十一已知缺口)）。三项的「本版不收」与桥同口径（[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩）。**打不开的 OAuth 条目**本版留下、桥那一侧看到的是 `credentialUnavailable`（[G-10](#十一已知缺口)） |
| **据点验收装配的替身**（「给测试凭据；值不进任何输出」） | 交出测试凭据 | 测试种子写成副本条目与 OAuth 条目，按 [S-13](#s-13-readreplica)、[S-17](#s-17-resolve) 交出；[S-8](#s-8-秘密与引用只在各自那一个问法里出现) | **够**；替身不判归属之外的任何事 |

---

## 十三、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`examples.md`](examples.md) 与 [`formal/`](formal/README.md) 下的模型与配置。接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

**发布后**：本目录下的规范正文、实例与模型不可原地覆盖；修改发布新版本。冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
