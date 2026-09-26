# capability.model-profile-directory v1

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-profile-directory, 1)`——
  `family = capabilities`、`topic = model-profile-directory`、规范路径 `spec/capabilities/model-profile-directory/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：已由 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 接受；精确资源冻结与采用状态由版本外入口及 registry 维护。
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-013 rev 12** 为准，另引 **PF-001 rev 17**、**PF-002 rev 20**、**PF-016 rev 6**；每次改 rev 之前逐版读 changelog 核过受影响的条款，结论记在[验证入口「变化的影响」](../verification.md#变化的影响)
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · data.model-profile · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（candidate，只取 `CredentialRef`）
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（accepted，只取时间点 `Instant`）
  - `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`（accepted，只取成员资格判定；撞名判定不再读隶属关系，上级链读面不再消费）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如
  `capability.model-profile-directory/v1#S-14`；缺口 `G-n` 同理。编号在本版本内只追加、不重排

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 档案是一个对象；属性表；官方与自建；在册／已撤回，已撤回可恢复在册 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) · [在册 / 已撤回](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回) · [官方档案 / 自建档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案) | S-5、S-8、S-14、S-15、S-18、S-33 |
| 档案的身份是所在范围加路由名；同一范围里要再用已撤回档案的路由名就是恢复那一条；**同名的几条在运行时按层覆盖，租户 > 组织 > 官方**；**设置记的是路由名** | [PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) · [decisions 裁决 39、40](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--同路由名的档案并存按层从下往上覆盖) | S-5、S-6、S-14、S-17、S-18 |
| 「这个范围有哪些档案」就是作用域求值，不是新机制 | [PF-013 §5.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#51-一条档案三种身份的人碰得到它) | S-3、S-17（本契约只列行，不判「范围允许」） |
| **本版「范围允许」不收窄**：范围允许 = 这个范围里登记的全部档案，凭据可用即可用；将来要收窄作为设置走资产求值（PF-002） | [D-043 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)（产品负责人，2026-09-25） | S-2、S-3、S-17 末段（本版 `A` 的来路） |
| 凭据只在租户层，一个租户一把，档案不存；组织那一层不持有；自建档案要调它的人自己那一把 | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [组织那一层为什么不持有](../../../../product/PF-013-model-profiles-and-invocation/design.md#组织那一层为什么不持有) · [§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) · [decisions P33、P34](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24) | S-6、S-7、S-19、S-20、S-32 |
| 取值是对档案的引用；路由名定下不可改 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | S-5、S-16 |
| 官方与自建同一份列表 | [PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里) | S-17 |
| 撤回不删行；已撤回的可以恢复在册、谁撤得了谁恢复得了；会话指着它时说「已下架」 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) · [decisions P35、P36](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24) | S-15、S-16、S-18、S-33 |
| 谁能建、撤、恢复、修订、配凭据；官方档案谁都撤不了、恢复不了、改不了；组织超管不配凭据 | [PF-013 flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案) · [flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作) | S-10、S-14、S-15、S-19、S-31、S-32、S-33 |
| 秘密不进任何一份呈现；能呈现的只有「有没有、哪个范围的、什么时候配的」 | [PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) | S-12、S-20 |
| 四层；出厂默认层由系统充当 | [PF-001 §6.1](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) | S-6 |
| 撤销管下一道准入 | [PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) | S-11 |
| 跨租户默认拒绝、显式携带身份 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | S-6、S-10、S-16 |
| 单机交付、语义不变地可拆 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-22 |
| 所有模型请求经 OpenRouter，「一把凭据」即一把 OpenRouter 凭据 | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) | S-7 |
| 统一语言 | [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [官方档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-official-model-profile--官方档案--official-model-profile) · [自建档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-custom-model-profile--自建档案--custom-model-profile) · [档案在册状态](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-profile-listing-status--档案在册状态--profile-listing-status) · [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer) · [治理中心](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center) · [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) | 全部正式名。**无词条的规格层名字**：保管方（凭据本体的持有方）、官方档案清单、发布序号、建档内容（取 `data.model-profile` v1）——都只在本契约与它的依赖里有定义，不另立 |

> **这张表里没有产品行、或产品行不足以单独支撑的条款**（主线裁定的原文在 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)，产品负责人尚未逐条追认；追认或推翻以后续决定为准）：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约作为独立能力、落在治理中心一侧（中心侧目录 ／ 据点侧运行时拆成两份） | 主线裁定，见 [D-040 §块 C 拆分提案（推荐 A/A/A：目录独立插件·中心）](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点) |
> | [S-20](#s-20-resolvecredential) 的出厂格那一把「由装配给、不可经写面改」 | 主线裁定，见 [D-040 §S16 S16-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)；产品正文已写（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)）。**取用次序本身有产品行**：租户那一把，否则（只对官方档案）出厂格那一把——[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) 与 [decisions P33、P34](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24) |
> | [S-31](#s-31-updateprofile) 修订自建档案、[S-32](#s-32-unbindcredential) 解除凭据绑定 | 主线裁定，见 [D-040 §S16 S16-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)；项与前置按 `data.model-profile/v1#S-12`；[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作) 已有这两行 |
> | [S-20](#s-20-resolvecredential) 两种问法（有没有 ／ 取值）；[S-18](#s-18-loadmanifest) 官方清单装入（消失即标撤回、重现即恢复在册）；[S-14](#s-14-registerprofile) 失败值 `routeNameTaken`；读面不返回 `CredentialRef`；`notAuthorized` 不细分；同内容认回 | 主线裁定，见 [D-040 §S16 S16-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)；「重现即恢复」有产品行（[decisions P35](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24)：官方档案的恢复只经清单） |
> | [S-18](#s-18-loadmanifest) 的发布序号与 `manifestNotNewer` | **规格层推导**：旧清单被重放会把新档案撤掉、把已撤掉的恢复——撤回虽可恢复，在下一次正确装入之前指着它们的会话都受影响（[S-8](#s-8-官方档案清单与发布序号)）；失败值名见 D-040 §S16 S16-a |
> | [S-15](#s-15-withdrawprofile)、[S-31](#s-31-updateprofile)、[S-33](#s-33-relistprofile) 的 `officialProfileReadOnly`；[S-33](#s-33-relistprofile) 服务面名 `relistProfile`、[S-18](#s-18-loadmanifest) 服务面名 `loadManifest` 与处置值 `relisted`、恢复在册不加通知；[S-31](#s-31-updateprofile) 已撤回的行也改得动 | 规格层推导，主线接受，见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（原 [G-8](#十已知缺口) 闭合）。前一项的产品行是 [flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)「撤回、恢复或修订官方档案：不可」（对全部四种身份，是结构性禁止，三处用同一个值）；末一项的产品行是 [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)「恢复之后照常修订」——说的是恢复之后可以修订，**不是禁止修订已撤回的行** |
> | [S-13](#s-13-这一节每个操作写全九件事) 判定次序：授权依赖不可用即 `unavailable`、先于一切要解析的值；[S-14](#s-14-registerprofile)、[S-18](#s-18-loadmanifest) 的输入是 `data.model-profile` 的建档内容；[S-17](#s-17-listprofiles) 末段的允许集合是显式参数、元素是路由名 | 主线裁定，见 [D-040 §五 K35、K17、K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**全部[模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)的登记处，以及每个租户的[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)绑在哪。**它住在[治理中心](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)一侧。

| # | 拥有的事实 | 正文 |
|---|---|---|
| 1 | **档案行**：每条档案存在哪一格、它的记录、在册还是已撤回；**行永远不删** | [S-5](#s-5-档案行一条档案在目录里的存储事实) |
| 2 | **同一范围内路由名唯一的执行**：`data.model-profile/v1#S-3` 那条判定在建档与装入官方清单时落到存储上 | [S-14](#s-14-registerprofile)、[S-18](#s-18-loadmanifest) |
| 3 | **官方档案清单的装入**：随系统发布的那一批怎样进目录、消失的怎样被标为已撤回、重现的怎样恢复在册；**已装入的最高序号，与那一次装入的逐条处置** | [S-8](#s-8-官方档案清单与发布序号)、[S-18](#s-18-loadmanifest) |
| 4 | **凭据绑定**：一个租户身上那一把凭据的引用，以及它是什么时候配的；**组织那一层不持有** | [S-7](#s-7-凭据绑定) |
| 5 | **凭据的取用规则**：给发起调用的租户与这次要用的档案的来源，取哪一把；两种问法 | [S-20](#s-20-resolvecredential) |

**十个操作**：登记（`registerProfile`）、撤回（`withdrawProfile`）、恢复在册（`relistProfile`）、修订（`updateProfile`）、读（`readProfile`）、列（`listProfiles`）、
装入官方档案清单（`loadManifest`）、配凭据（`bindCredential`）、解除凭据（`unbindCredential`）、取凭据（`resolveCredential`），见[第四节](#四操作)；
外加一个通知（[S-21](#s-21-profilewithdrawn-是通知)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 档案记录的**形状**、路由名唯一的**规则与失败值名**、引用的形状与解析规则、请求参数词表 | `data.model-profile` v1（本契约执行其中几条，不复述） |
| **合法目标集合、展示列表、选中模型、有效模型、一次模型调用** | `capability.model-request-runtime` v1（据点侧）。本契约只给它读面与取用面 |
| **「这个范围允许哪些路由名」**——锁死与配成不允许 | **本版不收窄**（[D-043 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：范围允许 = 这个范围里登记的全部档案，`A` 的来路见 [S-17](#s-17-listprofiles) 末段）；将来要收窄，作为设置走[作用域求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)（`capability.asset-evaluation` v1）。本契约的[列表](#s-17-listprofiles)**不是**「这个范围可用的档案」 |
| **凭据本体**：存在哪、怎么加密、怎么送到据点、怎么续 | 保管方。**据点上那一份**：窄口接口契约 `capability.credential-custodian` v1（副本条目、加密落地、按登录状态丢；那份契约以坐标依赖本契约的 S-7、S-12，本契约不反向登记——互引按定义引用 ＋ 对齐义务，[验证入口](../verification.md#修订波2026-09-25-公开面)）；**中心一侧**：那份契约的 G-7；跨进程的那一半见 [S-22](#s-22-装配给的保证-vs-协议须给的保证) 与 [G-7](#十已知缺口) |
| 成员关系与角色、隶属关系 | `capability.organization-governance` v1（本契约只消费它的成员资格判定；撞名判定不读隶属关系） |
| 跨进程的线上形状（中心 ↔ 据点） | 把这些操作送过进程边界的那份组合契约（尚未立，[G-7](#十已知缺口)） |

### S-3 本契约明确不承诺什么

- **不判「范围允许」。**[S-17](#s-17-listprofiles) 列出一条范围链上**存在**的档案；它们在那个范围能不能用，是作用域求值（`capability.asset-evaluation` v1）的结果——**本版那一道不收窄**（[D-043 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)），列表上出现的名字都在范围允许里，读的一方从同一次列表读取 `A`（S-17 末段），下面这句「绕过」要等那项设置出现才有对象（[PF-013 §5.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#51-一条档案三种身份的人碰得到它)）。把列表当成可用集合，锁死与配成不允许就被绕过去了。
- **不呈现凭据的值。**除了[取值问法](#s-12-秘密只在一个问法里出现)，本契约的任何返回、事件、失败说明里都没有凭据的值，**也没有 `CredentialRef`**（引用能换来凭据，呈现它就等于绕开 [PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)；与 `data.asset-model/v1#S-23` 第 5 条同一口径）。
- **不提供改身份分量的写面**：[S-31](#s-31-updateprofile) 只改可改的项；官方档案只经[清单装入](#s-18-loadmanifest)变化（撤回、恢复在册、修订都在内）。
- **不改出厂格那一把凭据**：它由装配给（[S-7](#s-7-凭据绑定)），[S-19](#s-19-bindcredential)、[S-32](#s-32-unbindcredential) 都够不着。
- **不保留档案的历史取值。**一次调用用的是哪一份属性，由模型请求运行时绑定在那次调用上、留痕在响应体里（`data.model-response/v1#S-9` 的 `route.profileSnapshot`）；目录只有**当前**那一份。
- **不发出任何控制事件**（[S-21](#s-21-profilewithdrawn-是通知)）。
- **没有以组织为键的凭据**：组织那一层不持有模型凭据（[PF-013 §5.6「组织那一层为什么不持有」](../../../../product/PF-013-model-profiles-and-invocation/design.md#组织那一层为什么不持有)），本契约没有任何写面写得出一条、也没有任何取用会取到一条（[S-7](#s-7-凭据绑定)、[S-20](#s-20-resolvecredential)）。

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 档案形状、身份值、资产形状、过期语义里的时间点、组织治理。**
`capability.model-request-runtime` 消费本契约；本契约**不**消费它。

**下表每个 `#S-n` 前缀省去了坐标 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1`；catalog 的 `clauses` 以它为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `data.model-profile` `#S-1` 档案身份（所在范围 + 路由名）、档案与引用成对交出 | [S-5](#s-5-档案行一条档案在目录里的存储事实)、[S-16](#s-16-readprofile)、[S-17](#s-17-listprofiles) |
| `data.model-profile` `#S-2` 路由名建档后不可改 | [S-5](#s-5-档案行一条档案在目录里的存储事实) |
| `data.model-profile` `#S-3` 撞名判定（同一范围内唯一、含已撤回行、只比同一格）、失败值 `route_name_taken` | [S-5](#s-5-档案行一条档案在目录里的存储事实)、[S-14](#s-14-registerprofile) ④、[S-18](#s-18-loadmanifest) ④ |
| `data.model-profile` `#S-4` 来源由产生方式决定、与所在范围一一对应 | [S-14](#s-14-registerprofile)、[S-18](#s-18-loadmanifest)、[S-20](#s-20-resolvecredential) ①（取用按来源） |
| `data.model-profile` `#S-10` 在册状态：初值、两条转移（撤回、恢复在册）、恢复的是同一行、名字在同一格里仍被占 | [S-15](#s-15-withdrawprofile)、[S-18](#s-18-loadmanifest)、[S-33](#s-33-relistprofile) |
| `data.model-profile` `#S-11` `updatedAt` 何时动 | [S-14](#s-14-registerprofile)、[S-18](#s-18-loadmanifest)、[S-31](#s-31-updateprofile)、[S-33](#s-33-relistprofile) |
| `data.model-profile` `#S-12` 各属性何时定、能不能改 | [S-5](#s-5-档案行一条档案在目录里的存储事实)、[S-31](#s-31-updateprofile) |
| `data.model-profile` `#S-18` 档案参数的输出上限 | [S-31](#s-31-updateprofile) ④ |
| `data.model-profile` `#S-13` `ModelProfileRef` 两支 | 全部操作的输入与返回 |
| `data.model-profile` `#S-14` 引用只精确解析，三种收场不折叠 | [S-16](#s-16-readprofile)、[S-33](#s-33-relistprofile) |
| `data.model-profile` `#S-22` 档案上没有凭据 | [S-7](#s-7-凭据绑定) |
| `data.model-profile` `#S-24`、`#S-25`、`#S-26` 表示层校验、拒绝值与判定分开 | [S-9](#s-9-缺席时的默认答案) 的 `invalidInput` |
| `data.model-profile` `#S-28` 建档内容（不带 `registration`、`updatedAt`，其余同 `ModelProfile`）与它的表示层校验——带了那两个成员即 `malformed` | [S-14](#s-14-registerprofile) ①⑧、[S-18](#s-18-loadmanifest) ①⑧ |
| `data.identity-values` `#S-5` TenantId 的构成与相等 | [S-6](#s-6-范围链)、[S-7](#s-7-凭据绑定)（凭据绑定以 `TenantId` 为键）、[S-10](#s-10-配置资格谁能在哪一格写) |
| `data.identity-values` `#S-8` TenantRole（`superAdministrator`／`member`）、`#S-10` MembershipStanding 与判定结果的两支 | [S-10](#s-10-配置资格谁能在哪一格写) |
| `data.identity-values` `#S-11` ScopeLayerIdentity（组织／租户两支，不含出厂默认） | [S-6](#s-6-范围链)、[S-14](#s-14-registerprofile)、[S-20](#s-20-resolvecredential) ⑤（答出的 `scope` 是租户一支或出厂格） |
| `data.identity-values` `#S-12`、`#S-17`、`#S-18` 缺席不是身份值、身份参数没有默认值、缺席即拒绝 | [S-9](#s-9-缺席时的默认答案) |
| `data.identity-values` `#S-16` 按归属层显式携带身份值 | [S-5](#s-5-档案行一条档案在目录里的存储事实)、[S-7](#s-7-凭据绑定)（绑定按租户层身份存） |
| `data.identity-values` `#S-19` 不可用即明确失败 | [S-9](#s-9-缺席时的默认答案) |
| `data.identity-values` `#S-27` 每道准入现读 | [S-11](#s-11-每道准入现读) |
| `data.identity-values` `#S-30` 跨边界须重新验证 | [S-22](#s-22-装配给的保证-vs-协议须给的保证) |
| `data.identity-values` `#S-32`、`#S-33` 判别式闭合、表示层校验与判定分开 | [S-9](#s-9-缺席时的默认答案) |
| `data.asset-model` `#S-23` 凭据引用：不是明文、不透明、不作为呈现内容 | [S-7](#s-7-凭据绑定)、[S-19](#s-19-bindcredential) |
| `data.offer-expiry` `#S-22` 时间点 `Instant` | [S-7](#s-7-凭据绑定) 的 `boundAt` |
| `capability.organization-governance` `#S-26` 成员资格判定（`effective` 带角色 ／ `ineffective` ／ 失败支 `unavailable`） | [S-10](#s-10-配置资格谁能在哪一格写) |

> **`data.model-profile/v1#S-3` 的撞名范围是「同一范围内唯一」**（PF-013 裁决 35、38）：判定只比同一格，**不读隶属关系**，
> 所以本契约不消费 `capability.organization-governance` 的隶属读面与 `data.identity-values/v1#S-15`。
> 组织层与租户层的自建档案同名并存（[PF-013 裁决 39、40](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--同路由名的档案并存按层从下往上覆盖)）；并存之后谁生效按链的先后覆盖（[S-17](#s-17-listprofiles) 末段）。

---

## 二、概念、身份与必要状态

### S-5 档案行：一条档案在目录里的存储事实

**一条档案行 = (所在范围, `ModelProfile` 记录)。**所在范围是出厂默认层（官方档案），或一个 `ScopeLayerIdentity`（自建档案，组织或租户一支，`data.identity-values/v1#S-11`）。

- **行的键是 (所在范围, 路由名)**（`data.model-profile/v1#S-1`）；同一格里路由名不重复（`data.model-profile/v1#S-3`），官方档案全在出厂默认层，所以**官方档案单凭路由名就挑得出至多一行**，自建档案由（所在范围, 路由名）挑出——**同一个路由名可以在不同的格里各有一行**（官方那一格、组织层、租户层）。
- **记录里不带所在范围**（`data.model-profile/v1#S-1`）；凡本契约交出一条档案，**都与指向它的 `ModelProfileRef` 成对交出**。
- **行不删**：撤回与恢复在册只改 `registration`（[S-15](#s-15-withdrawprofile)、[S-33](#s-33-relistprofile)）；官方清单里消失的条目只标撤回、重现的只恢复在册（[S-18](#s-18-loadmanifest)）。**本契约没有任何删行的写路径**；**恢复的永远是原来那一行，不另起一行**。
- **身份分量建档后不变**：路由名、所在范围、来源（`data.model-profile/v1#S-2`、`#S-12`）。本契约没有改它们的写路径；**改名就是新登记一条、撤回旧的**（[S-31](#s-31-updateprofile)）。
- **`registration` 与 `updatedAt` 由本契约写，不由调用方给**：建档与装入时，输入是 `data.model-profile/v1#S-28` 的**建档内容**——它不带这两个成员（[S-14](#s-14-registerprofile) ①、[S-18](#s-18-loadmanifest) ①）；本契约在提交时补上 `listed` 与提交时刻，写成一份 `ModelProfile`。

### S-6 范围链

**一条范围链以一个 `TenantId` 为锚，恰三格，由具体到一般：**

```text
范围链(T)  ≝  ⟨ 租户层 T ,  组织层 T.organization ,  出厂默认层 ⟩
```

`T.organization` 是 `TenantId` 的组织那一半（`data.identity-values/v1#S-5`）。

- **输入里的范围链就用它的锚给出**：接收 `scopeChain` 的操作收一个 `TenantId`，链由上式派生，**不收一张调用方自排的列表**——一张自排的列表可以把别的租户、别的组织、或本人的个人组织塞进来。
- **链上只有这三格。**别的租户、别的组织、上级组织、**本人在别处的个人组织**（「个人范围」）都**不在**任何一条不以它为锚的链上——凭据的「永不取」（[S-20](#s-20-resolvecredential)）与档案的读边界（[S-16](#s-16-readprofile)）都由这一条兑现，**不靠一个额外的检查**。
- **档案那一侧三格都贡献**：出厂默认层贡献官方档案，组织层与租户层各贡献建在那一格的自建档案。
- **链的先后就是同名覆盖的先后**：同一个路由名在链上有几条时，**越具体的一格越优先——租户层 > 组织层 > 出厂默认层**；已撤回的行不参与，这个范围不允许的名字没有胜出行（[S-17](#s-17-listprofiles) 末段）。
- **凭据那一侧只有两处**：租户层那一格的绑定（[S-7](#s-7-凭据绑定)），与出厂默认层那一把（部署装配配了时）。**组织层那一格不贡献凭据**——组织那一层不持有（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#组织那一层为什么不持有)）。
- **出厂默认层没有身份值**（`data.identity-values/v1#S-11` 刻意不含它）：链上那一格由系统充当；它的那一把凭据由部署装配配置，**任何写面都改不了它**（主线裁定，见 [D-040 §S16 S16-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)），**只供官方档案**（[S-20](#s-20-resolvecredential)）。

### S-7 凭据绑定

**凭据绑定 = (租户 `TenantId`, `CredentialRef`, `boundAt`)；一个租户至多一条。**组织那一层不持有凭据，**没有以组织为键的绑定**（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)、[§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；裁决 33）。

- **绑的是引用，不是凭据本身**：`CredentialRef` 取 `data.asset-model/v1#S-23`——不透明、不是明文、不作为呈现内容。凭据本体由保管方持有（据点上那一份：`capability.credential-custodian` v1 的副本条目；中心一侧：那份契约的 G-7）；**取值问法**（[S-20](#s-20-resolvecredential)）才把引用换成值。
- **一个租户一把**（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)）：同一个租户再绑一次就是**替换**——轮换就是改这一项的值，不并存两把。
- **身份即范围**：这一把是哪个租户的，看它绑在哪个租户上；**用量记在这个租户头上**这件事的账面落点归模型请求运行时与 `data.call-accounts`（`credentialScope`，`data.call-accounts/v1#S-38`）。
- **这个租户发起的调用都用它，不管档案建在哪一层**：组织层建的自建档案，成员调它用的是成员自己那一把（[S-20](#s-20-resolvecredential)）。
- **档案上没有凭据**（`data.model-profile/v1#S-22`）；**官方档案也没有**——它们出门用哪一把见 [S-20](#s-20-resolvecredential)。
- **出厂格那一把**：部署装配可以给出厂格配一把凭据（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)）。**它不是一条凭据绑定**：不以 `TenantId` 为键（出厂格没有身份值），[S-19](#s-19-bindcredential)、[S-32](#s-32-unbindcredential) 都够不着它；它的值与轮换归装配（[S-22](#s-22-装配给的保证-vs-协议须给的保证)）；**只供官方档案**（[S-20](#s-20-resolvecredential)）。
- **解除**：[S-32](#s-32-unbindcredential) 让一个租户回到「没配」——绑定被删掉，不是写一个表示「没有」的值。
- **`boundAt`** 是这条绑定最近一次改变的时刻（`data.offer-expiry/v1#S-22` 的 `Instant`），供「什么时候配的」这一呈现（[PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)）。

### S-8 官方档案清单与发布序号

**官方档案清单是随系统发布的一份数据：一个发布序号，加若干条官方档案的建档内容。**

- **发布序号**是一个 ≥ 1 的整数，**同一部署里后发布的清单序号更大**；目录记下**已装入的最高序号，以及那一次装入交回的逐条处置**——后者是原样重装时要交回的答案（[S-18](#s-18-loadmanifest) ⑦），它从当前的档案行重算不出来：重算只会得到一串 `unchanged`。
- **清单条目是建档内容**（`data.model-profile/v1#S-28`）：不带 `registration` 与 `updatedAt`，`origin` 必须是 `official`。
- **清单是官方档案的唯一来源**：任何组织或租户都建不出 `origin = official` 的档案（`data.model-profile/v1#S-4`）。
- **装入不删行**——清单里新出现的条目被登记，清单里消失的条目**标为已撤回**（不删行），**已撤回的官方行在清单里又出现即恢复在册**，恢复的是原来那一行（`data.model-profile/v1#S-10`；PF-013 rev 10 裁决 37）。**官方档案的撤回与恢复只经清单**——谁撤得了它，谁就恢复得了它（[PF-013 decisions P35](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24)），而撤它的只有发布。
- **序号为什么是必需的**：没有序号，一次回滚部署把旧清单再装一遍，旧清单里没有的新档案就被撤掉、新清单已撤掉的旧档案又被恢复。撤回虽然可以恢复，**在下一次正确的装入之前**，指着被误撤档案的会话都发不出去、被误恢复的档案又能被新选中——旧清单不该有这个效力。

---

## 三、贯穿全部操作的规矩

### S-9 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退。**三类分开：

| 情形 | 收场 | 为什么不能合并 |
|---|---|---|
| **判定得出「不该放行」** | 一个具名的拒绝值（`notAuthorized`、`routeNameTaken`、`officialProfileReadOnly`、`manifestNotNewer`、`profileNotFound`、`credentialUnavailable`） | 成立的结论；同样的状态下重试不会改变答案 |
| **判定做不出来**（存储读不到、成员资格判定以 `unavailable` 失败、保管方够不着） | **`unavailable`** | 没有结论；按当时实际状态重试可能得出不同答案（`data.identity-values/v1#S-19`） |
| **输入不合形状** | **`invalidInput`**，**恰带一个表示层拒绝值** `reason`：建档内容、档案内容与引用取 `data.model-profile/v1#S-25` 的拒绝值之一（建档内容带了 `registration`／`updatedAt` 即 `malformed`，`data.model-profile/v1#S-28`）；身份值取 `data.identity-values/v1#S-33` 的口径；本契约自己的输入（清单形状——含清单条目的 `origin` 不是 `official`、问法取值）不合形状取 `malformed`；**建档的 `origin` 不是 `custom` 取本契约自己的 `origin_not_custom`**（它不是那份文档的形状错，而是这个操作只收自建档案——`data.model-profile/v1#S-28`：「来源必须是哪一个」归本契约；值名由主线接受，见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)） | 表示层校验在任何判定之前，不表示「不存在」或「无资格」，不记成判定结果（`data.model-profile/v1#S-26`）。**唯一的例外**是 [S-31](#s-31-updateprofile) 的「改完的整份文档过 `data.model-profile/v1#S-24`」：要先读出那一行才校验得了，排在授权与解析之后（[D-040 §七 M14](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）；它仍是表示层拒绝值，不是判定结果 |

- **任何身份参数都没有默认值**：`TenantId`、`ScopeLayerIdentity`、`ModelProfileRef` 的 `scope` 缺席即 `invalidInput`，**不得**由「当前租户」「当前组织」或环境值补齐（`data.identity-values/v1#S-17`、`#S-18`）。
- **判别式闭合**：`ScopeLayerIdentity` 的变体、`ModelProfileRef` 的 `origin`、取凭据的问法与来源，集合外的取值一律 `invalidInput`（`data.identity-values/v1#S-32`）。
- **本契约没有带默认值的非身份参数**：取凭据时档案的来源也必给，缺席不当作「官方」（[S-20](#s-20-resolvecredential) ①）。

**本契约的失败值恰八个，没有「其他」**：`invalidInput` · `notAuthorized` · `routeNameTaken` · `officialProfileReadOnly` · `manifestNotNewer` · `profileNotFound` · `credentialUnavailable` · `unavailable`。
各操作的⑥从中取子集。

> **`routeNameTaken` 与 `data.model-profile` 的 `route_name_taken` 是同一个判定结论**：那份契约拥有规则与值名（snake_case，表示层与判定的枚举口径），
> 本契约的操作失败集合沿能力契约的 camelCase 口径把它写成 `routeNameTaken`。**两种拼写指同一件事、不是两个结论**。

### S-10 配置资格：谁能在哪一格写

**「在一格上建档、撤回、恢复在册、修订、配凭据、解除凭据」的授权谓词只有一条**（[PF-013 flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)这几行是同一批角色；凭据那两个写面的格只能是租户层，见 [S-19](#s-19-bindcredential)、[S-32](#s-32-unbindcredential)）：

```text
可写(initiator: TenantId, 格)  ≝
  格 = organization(O)  ⇒  initiator.organization = O
                          ∧ 成员资格判定(initiator) = effective，且角色 = superAdministrator
  格 = tenant(T)        ⇒  initiator = T
                          ∧ 成员资格判定(initiator) = effective（任一角色）
```

- **成员资格判定取 `capability.organization-governance/v1#S-26`**：返回 `effective`（带角色）／`ineffective`，或失败支 `unavailable`。
  **`ineffective` ⇒ `notAuthorized`；失败支 ⇒ `unavailable`，绝不折成 `notAuthorized`**——那会把「读不到」说成「无权」。
- **谓词按式里的次序求**：`initiator` 与格对不上（组织不同、租户不是本人），第一个合取项就不成立，结论是 `notAuthorized`，**不做成员资格判定**——这时成员资格判定可不可用与结论无关。
- **`notAuthorized` 不区分「不是这个组织的成员」「是成员但不是超管」「不是这个租户本人」**：分开会让调用方据失败值反推别的组织的成员名单。
- **出厂默认层不在这个谓词的定义域里**：它没有身份值，没有任何 `TenantId` 能写它；官方档案只经[清单装入](#s-18-loadmanifest)。
- **个人组织不另设禁止**：个人组织的超管就是那个账号自己（`capability.organization-governance` v1），他在自己的组织层建档照上式判；凭据他配在自己的租户层。

### S-11 每道准入现读

**授权谓词里的成员资格在每一次写操作时现读**（`data.identity-values/v1#S-27`），不缓存，不靠「撤销广播」。

- **它不与本契约的写入落在同一提交里**：成员资格在另一个 owner 的存储里。判完到写入之间被撤销，这一次写入照样成立——
  **撤销管的是下一道准入**（[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）。**这是有意接受的窗口，不是遗漏**。
- **读面同理**：档案行的在册状态、凭据绑定，消费者每次准入现读本契约，不缓存到下一次准入之后（[S-22](#s-22-装配给的保证-vs-协议须给的保证) 第二行给出跨进程之后的上界义务）。

### S-12 秘密只在一个问法里出现

**凭据的值只出现在 [S-20](#s-20-resolvecredential) 取值问法的成功返回里，别处一概没有。**

- 「有没有、哪个范围的、什么时候配的」由**有没有问法**给出（[PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) 允许呈现的恰是这三样）。
- **`CredentialRef` 也不出本契约**：[S-19](#s-19-bindcredential) 收它，任何读面都不返回它。
- **取值问法只由模型请求运行时在一次发出之前调用**，值只交给它的传输适配（`capability.model-request-runtime` v1 的义务）；
  **单机由装配保证只有它够得着这个问法**，跨进程之后见 [S-22](#s-22-装配给的保证-vs-协议须给的保证)。

---

## 四、操作

### S-13 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | 输入 |
| ② | 前置与授权 |
| ③ | 结构性禁止（不适用写「无」） |
| ④ | 提交点与原子性 |
| ⑤ | 成功返回 |
| ⑥ | 失败集合（取自 [S-9](#s-9-缺席时的默认答案) 的八个，闭合） |
| ⑦ | 幂等与重复 |
| ⑧ | 缺席时的默认答案 |
| ⑨ | 事件 |

**判定次序**：凡一个操作可能同时命中几个失败值，按 ⑥ 里**从左到右**的次序取第一个成立的——同一个坏输入在两个实现里报同一个值。
**`unavailable` 在每一张 ⑥ 里都排在一切要读存储才判得出的值之前**（主线裁定，见 [D-040 §五 K35](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：授权所依赖的成员资格判定以 `unavailable` 失败，**立即**以 `unavailable` 收场——
此时 `notAuthorized` 不成立（没判出来），而排在后面的 `routeNameTaken`、`profileNotFound`、`manifestNotNewer`、`credentialUnavailable` 一个也不取，哪怕它们各自的条件此刻读得出来；
否则一次授权依赖的抖动就把「那一格里有没有这个名字」交给了一个无权的调用方（[S-30](#s-30-无权者探不到名字)）。
存储读不到时，要读它才判得出的值一个也不成立，同样以 `unavailable` 收场；已经判出的 `notAuthorized`（它只读成员资格与输入里的格）仍排在 `unavailable` 之前。

**十个操作**：写七个（[S-14](#s-14-registerprofile)、[S-15](#s-15-withdrawprofile)、[S-33](#s-33-relistprofile)、[S-31](#s-31-updateprofile)、[S-18](#s-18-loadmanifest)、[S-19](#s-19-bindcredential)、[S-32](#s-32-unbindcredential)），
读三个（[S-16](#s-16-readprofile)、[S-17](#s-17-listprofiles)、[S-20](#s-20-resolvecredential)）。[S-31](#s-31-updateprofile)、[S-32](#s-32-unbindcredential)、[S-33](#s-33-relistprofile) 是后加的，编号追加在末尾、写在本节里。
服务面名见[设计依据](#设计依据)末表。

### S-14 registerProfile

**在一个组织层或租户层建一条自建档案。**

| # | 内容 |
|---|---|
| ① | `initiator: TenantId`；`scope: ScopeLayerIdentity`（`organization` 或 `tenant` 一支）；**建档内容**（`data.model-profile/v1#S-28`：不带 `registration` 与 `updatedAt`，其余同 `ModelProfile`，[S-5](#s-5-档案行一条档案在目录里的存储事实)），`origin` 必须是 `custom` |
| ② | `可写(initiator, scope)`（[S-10](#s-10-配置资格谁能在哪一格写)） |
| ③ | 无。**出厂默认层不是 `scope` 的取值**——`ScopeLayerIdentity` 没有那一支，官方档案只经 [S-18](#s-18-loadmanifest) |
| ④ | **单次提交**：按 `data.model-profile/v1#S-3` 判路由名——**比较范围是 `scope` 那一格里的全部档案行（在册与已撤回）**，不读别的格、不读隶属关系——再写入行（`registration = listed`，`updatedAt` = 提交时刻）。**判定与写入在同一个提交边界里，这个边界覆盖 `scope` 那一格的档案行**；否则同一格里两次并发的同名建档都判「未被占」、各自写入。不同格上的建档（以及官方清单装入）互不相干。**授权那次现读不在这个边界里**（[S-11](#s-11-每道准入现读)） |
| ⑤ | `{ ref: ModelProfileRef（custom 支，scope 与 routeName 取自输入）, profile: 写下的那份 ModelProfile }`——成对交出 |
| ⑥ | `invalidInput` · `notAuthorized` · `unavailable` · `routeNameTaken` |
| ⑦ | **认回**：已有一行与本次输入**所在范围相同、路由名相同、建档内容逐成员相等且仍在册**时，返回那一行，**不写第二行、不报 `routeNameTaken`**——一次回执丢失之后原样重发，得到的是同一条档案。**任何一处不同**（内容不同、那一行已撤回）⇒ `routeNameTaken`；**那一行已撤回时要再用这个名字，走[恢复在册](#s-33-relistprofile)**，不另建（`data.model-profile/v1#S-3`、`#S-10`）。「逐成员相等」按 `data.model-profile` 各成员的相等规则比建档内容的成员——那一行的 `updatedAt` 与 `registration` 不在建档内容里，不参与比较 |
| ⑧ | 成员资格判定以 `unavailable` 失败、那一格的名字读不到 ⇒ `unavailable`，**立即**，不再判名字（[S-13](#s-13-这一节每个操作写全九件事)）；**不得**把「读不到已有的名字」当成「未被占」（`data.model-profile/v1#S-3` 九件事第 4 行）。身份参数缺席或不合形状、建档内容过不了 `data.model-profile/v1#S-28` 的表示层校验（带了 `registration`／`updatedAt` 即 `malformed`）⇒ `invalidInput`；`origin` 不是 `custom` ⇒ `invalidInput{reason: origin_not_custom}` |
| ⑨ | 不发 |

**判定次序的一处要说清**：授权先于名字判定。一个无权在那一格写的人拿到的是 `notAuthorized`，**拿不到 `routeNameTaken`**——否则他可以借建档去探别处有没有某个名字。
**授权判不出来时同样拿不到**：成员资格判定以 `unavailable` 失败，这一次就以 `unavailable` 收场，名字是否已被占不再判（[S-13](#s-13-这一节每个操作写全九件事)）。
在自己那一格有权的人从 `routeNameTaken` 得知的只是「**这一格里**已有这个名字（在册或已撤回）」——那一格他本来就列得出来（[S-17](#s-17-listprofiles)），这不是探针；**别的格建过什么名字，建档探不到**：判定不读别的格。

### S-15 withdrawProfile

**把一条自建档案标为已撤回。行保留、名字仍被占。**

| # | 内容 |
|---|---|
| ① | `initiator: TenantId`；`ref: ModelProfileRef` |
| ② | `ref` 为 custom 支：`可写(initiator, ref.scope)`（[S-10](#s-10-配置资格谁能在哪一格写)）——**只有那一格有写资格的人撤得动那一格的档案**（[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)「自己那层建的」） |
| ③ | **有**：`ref.origin = official` ⇒ **`officialProfileReadOnly`**。**这不是权限判定**——任何角色都没有这个动作（[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)「撤回、恢复或修订官方档案：不可」对全部四种身份）；官方档案只因[清单里消失](#s-18-loadmanifest)而撤回。[S-31](#s-31-updateprofile) ③、[S-33](#s-33-relistprofile) ③ 用同一个值 |
| ④ | **单次提交**：`registration` 由 `listed` 改为 `withdrawn`。**行不删，`updatedAt` 不动**（`data.model-profile/v1#S-11`：它只随五项上游属性动） |
| ⑤ | `{ ref, registration: withdrawn }` |
| ⑥ | `invalidInput` · `officialProfileReadOnly` · `notAuthorized` · `unavailable` · `profileNotFound` |
| ⑦ | **幂等**：那一行已经是 `withdrawn` ⇒ 同样返回 ⑤，不写任何东西、**不再发事件**。要回到在册，走[恢复在册](#s-33-relistprofile)（`data.model-profile/v1#S-10`） |
| ⑧ | 读不到那一行、成员资格判定失败 ⇒ `unavailable`，**不得返回 `profileNotFound`**（读不到 ≠ 不存在） |
| ⑨ | `profile.withdrawn`（**只在真的发生了 `listed → withdrawn` 时发**，[S-21](#s-21-profilewithdrawn-是通知)） |

**次序：结构性禁止 → 授权 → 解析。**授权只依赖 `ref.scope`（引用里就有），不必先读行；先授权再解析，**无权者得不到「这一格有没有这条档案」的答案**。
「会话指着它时说已下架」「已撤回的不能被新选中」是读它的那些能力的义务（`data.model-profile/v1#S-10` 末段），本契约只保证它们读得到 `withdrawn`。

### S-16 readProfile

**按引用读一条档案，已撤回的也读得出。**

| # | 内容 |
|---|---|
| ① | `scopeChain: TenantId`（[S-6](#s-6-范围链)）；`ref: ModelProfileRef` |
| ② | **读边界**：`ref` 为 official 支 ⇒ 任何链都读得；`ref` 为 custom 支 ⇒ `ref.scope` 必须是范围链(`scopeChain`)上的组织层或租户层那一格，否则 **`notAuthorized`**。**跨租户默认拒绝**（[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)）：别的租户层、别的组织层、本人在别处的个人组织层，都不在链上 |
| ③ | 无 |
| ④ | 只读，无提交；**每次现读**（[S-11](#s-11-每道准入现读)） |
| ⑤ | `{ ref, profile: ModelProfile }`——**`registration` 可能是 `listed` 或 `withdrawn`**，调用方据此说得出「已下架」 |
| ⑥ | `invalidInput` · `notAuthorized` · `unavailable` · `profileNotFound` |
| ⑦ | 只读，天然可重复 |
| ⑧ | **三种收场不折叠**（`data.model-profile/v1#S-14`）：解析到一行（在册或已撤回）⇒ ⑤；**查无此条**（引用从未指向过一行，或存储丢了一行）⇒ `profileNotFound`；**读不到** ⇒ `unavailable`。**不得**把 `unavailable` 说成 `profileNotFound`、把任何一种说成「已撤回」，**也不得**回退到别层的同名档案 |
| ⑨ | 不发 |

**`notAuthorized` 先于解析**：只看 `ref.scope` 与链就判得出，不读行；链外的人拿不到「那里有没有这条」。
**本操作按引用读一行，供目录内部与治理面用，不做同名覆盖**：从一个路由名到一行只走 [S-17](#s-17-listprofiles) 末段的按层覆盖（「用哪个模型」那项设置与[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的记录都只记名字）；它落到的那一行，读的一方再按本操作以引用读。⑧ 管的是按引用读：读不到、查无此条都不去别层找同名的，读到一条已撤回的就交出那一条——覆盖不放宽它。

### S-17 listProfiles

**列出一条范围链上存在的全部档案——官方与自建在同一份列表里。**

| # | 内容 |
|---|---|
| ① | `scopeChain: TenantId` |
| ② | 无授权前置——列表只含链上三格的行，**链本身就是边界**（[S-6](#s-6-范围链)） |
| ③ | 无 |
| ④ | 只读，无提交。**一次列表读自同一个一致的快照**：不出现「官方的读自旧状态、自建的读自新状态」拼起来的一份 |
| ⑤ | 一个集合，每项 `{ ref, profile }`，恰含：全部官方档案行；所在范围为「组织层 `scopeChain.organization`」的自建行；所在范围为「租户层 `scopeChain`」的自建行。**在册与已撤回都在**，由 `profile.registration` 区分。**同一个路由名可以出现不止一次**（在不同的格里），每项的 `ref` 带着来源与所在范围，靠它分得开（`data.model-profile/v1#S-13`）。**次序没有含义** |
| ⑥ | `invalidInput` · `unavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 任一部分读不到 ⇒ `unavailable`，**不返回部分列表**——少了一格的列表会被读成「那一格没有档案」 |
| ⑨ | 不发 |

**它不是合法目标集合，也不是展示列表**：两者都要再经「范围允许」与「模态兼容」两道（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)），那是 `capability.model-request-runtime` 的求值；本列表只是它们的输入之一。

**同名按层覆盖：从一个路由名到一行档案，只有这一个入口。**「用哪个模型」那项设置与[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的记录记的是路由名（`data.model-profile/v1#S-14`）；
这个名字在一条范围链上落到哪一行，只按下式定——**先滤掉已撤回的，再滤掉这个范围不允许的，然后取最具体一格**（租户层 > 组织层 > 出厂默认层）。
**式子有三个参数**：锚 `T`、路由名 `r`、**这个范围的允许集合 `A`**——**本版就是本列表 ⑤ 里出现的全部路由名**（[D-043 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：不收窄，范围允许 = 这个范围里登记的全部档案；将来收窄时是「用哪个模型」那项设置在读的一方那个会话格上的允许集合，`capability.asset-evaluation` 的求值），**元素是路由名**（主线裁定，见 [D-040 §五 K42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)：与「设置记路由名」一致）。
同一个 `T` 下的两个会话格可以有不同的 `A`，所以胜出行按 `(T, r, A)` 定，**不按 `(T, r)` 缓存**：

```text
C(T, r)        ≝  范围链(T) 上路由名为 r 的全部行          （每格至多一行，至多三行）
C₁(T, r)       ≝  C 里在册的
C₂(T, r, A)    ≝  C₁      若 r ∈ A
               ≝  ∅       否则                             （A 的元素是名字：同名的几行一起允许或一起不允许）
胜出行(T, r, A) ≝  C₂ 里所在那一格最具体的那一行          （C₂ 为空则没有胜出行）
落点(T, r, A)   ≝  胜出行；没有胜出行时，C₁ 里最具体的那一行；C₁ 也为空时，C 里最具体的那一行
```

路由名当能力标识、像资产一样从下往上在运行时覆盖：[PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)、[裁决 39、40](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--同路由名的档案并存按层从下往上覆盖)。
两道滤是 PF-013 §4 那一节「先滤已撤回的与这个范围不允许的，模态对不上的与缺凭据的不滤」，类推 [PF-002 §5.6](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算) 第 1 步三小步「禁用滤 → 谁可以使用它滤 → 取最具体」（推导见 [D-040 §二 S-U24-5a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#二2026-09-24-用户在场期间主线随用户裁决所作的自定账本-二-原文标主线自定的行)）。

- **落点的三种收场不折叠**：有胜出行 ⇒ 这个名字此刻就是那一行；没有胜出行、`C₁` 非空 ⇒ **这个名字这个范围不允许**（`r ∉ A`），落点是 `C₁` 里最具体的那一行；`C₁` 也为空 ⇒ **链上同名的都撤回了**——「已下架」说的是这个名字（PF-013 §6.4）。`C` 为空 ⇒ **这条链上没有这个名字的任何一行**，读的一方以「查无此条」收场，不自造一个落点。
- **只滤这两样**：已撤回的行不参与，所以它们不会把链上更一般一格的同名档案一直挡住（行不删）；这个范围不允许的名字没有胜出行。模态合不合、凭据有无**都不参与挑胜者**——胜出行用不了由读的一方以相应成因挡下（[`capability.model-request-runtime/v1#S-10`](../../model-request-runtime/v1/contract.md#s-10-有效模型四步每步来源可查)）。
- **`A` 不另开一个操作**（[S-3](#s-3-本契约明确不承诺什么)）：本契约拥有滤的次序与层序这条规则——读的一方在本列表（⑤）上带着 `A` 按上式求。**本版 `A` 由读的一方从同一次列表读直接取**（⑤ 里出现的全部路由名；与列表出自 ④ 的同一个快照），不另问资产求值；所以本版 `r ∈ A` 恰当 `C(T, r)` 非空，「这个名字这个范围不允许」这一种收场**本版不出现**（[D-043 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。将来收窄时 `A` 改由读的一方经 `capability.asset-evaluation` 求，那时本条出新版本。**`A` 读不到时读的一方明确失败**（本版即列表读不到，⑧），**不以空集或全集顶替**：空集会把每个名字都判成这个范围不允许，全集会绕过将来的锁死与配成不允许。
- **本列表照旧列出全部行**（⑤）：被盖住的、已撤回的也在，靠 `ref` 的来源与所在范围分得开——展示列表要把被盖住的同名行列在那个名字之下（[`capability.model-request-runtime/v1#S-12`](../../model-request-runtime/v1/contract.md#s-12-展示列表)）。
- **同一格里不重名**（`data.model-profile/v1#S-3`），所以每一格至多一行，「最具体的那一行」至多一行。
- **覆盖不是读边界的放宽**：链上只有三格（[S-6](#s-6-范围链)），覆盖只在这三格之间比先后；按引用读一行仍是精确的（[S-16](#s-16-readprofile)），那是目录内部与治理面用的。

### S-18 loadManifest

**装入官方档案清单：把一份官方档案清单装进目录。**服务面名 `loadManifest`。

| # | 内容 |
|---|---|
| ① | **清单**：`{ ordinal: 整数 ≥ 1, entries: 建档内容[] }`；每条是 `data.model-profile/v1#S-28` 的建档内容（不带 `registration` 与 `updatedAt`），`origin` 必须是 `official`；**`entries` 里路由名两两不同** |
| ② | **调用方是这个部署的发布动作**，不是任何租户——本操作不收 `TenantId`。**单机由装配保证只有发布动作够得着它**；跨进程见 [S-22](#s-22-装配给的保证-vs-协议须给的保证) |
| ③ | 无 |
| ④ | **单次提交**，覆盖**出厂默认层那一格的全部档案行**、「已装入的最高序号」与「那一次装入的处置」——`data.model-profile/v1#S-3` 只比同一格，官方装入不读、不写别的格。逐条处置见下表；**整份清单的处置、新的序号与这一份处置在一次提交里一起成立或一起不成立** |
| ⑤ | `{ ordinal, dispositions }`：每条 `entries` 恰一个处置、每条**因本次装入而被撤回**的官方行恰一个处置（下表五种之一） |
| ⑥ | `invalidInput` · `unavailable` · `manifestNotNewer` |
| ⑦ | **同一份清单重装**（序号等于已装入的最高序号，**且内容逐条相等**）⇒ 返回**记下的那一份** `dispositions`（[S-8](#s-8-官方档案清单与发布序号)）、不写任何东西——回执丢失之后可以原样重发，重启之后同样如此。**「内容逐条相等」对照的是出厂默认层此刻在册的官方行**：官方行只经本操作变化、每条在册的行整份取自条目（表下「装入是整份取条目」），装入第 N 份之后在册的官方行恰是第 N 份的条目，所以这一比较不需要另存清单原文。**序号更小，或序号相等而内容不同** ⇒ `manifestNotNewer`，不写任何东西 |
| ⑧ | 出厂默认层的档案行、已装入序号或记下的处置读不到 ⇒ `unavailable`，**什么都不装**；清单形状不合、任一条目过不了 `data.model-profile/v1#S-28` 的表示层校验、条目里路由名重复 ⇒ `invalidInput`，**整份不装**（不做「装能装的那几条」——那会让一份坏清单留下半套官方档案） |
| ⑨ | 每一条因本次装入而 `listed → withdrawn` 的官方行各发一次 `profile.withdrawn`（[S-21](#s-21-profilewithdrawn-是通知)）；**恢复在册（`relisted`）不发事件**，同 [S-33](#s-33-relistprofile) ⑨ |

**逐条处置（闭合五种）：**

| 出厂默认层里已有 | 清单里 | 处置 | 结果 |
|---|---|---|---|
| 没有这个路由名的行 | 有 | `added` | 新官方行，`listed`，`updatedAt` = 提交时刻 |
| 同名官方行，`listed` | 有 | `updated` 或 `unchanged` | **行的内容整份取自条目**（身份分量、`registration`、`updatedAt` 除外；见表下）；**五项上游属性里至少一项变了才推动 `updatedAt`**（`data.model-profile/v1#S-11`）；什么都没变即 `unchanged` |
| 同名官方行，`withdrawn` | 有 | `relisted` | **`withdrawn → listed`，恢复的是原来那一行**（`data.model-profile/v1#S-10`；PF-013 rev 10 裁决 37）；行的内容同样整份取自条目，五项上游属性变了才推动 `updatedAt` |
| 官方行，`listed` | **没有** | `withdrawn` | `listed → withdrawn`，行不删 |
| 官方行，`withdrawn` | **没有** | （无处置） | 不变，也不报在返回里 |

- **别的格里的同名自建档案不参与**：官方档案与自建档案同路由名并存（`data.model-profile/v1#S-3`；PF-013 rev 10 裁决 35、38），清单装入**不读自建行**，一条自建档案也就挡不住、也改不了任何官方条目。
- **官方档案的撤回与恢复都只经这里**：谁撤得了它，谁就恢复得了它（[PF-013 decisions P35](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24)）——撤它的只有发布，恢复它的也只有发布；[S-15](#s-15-withdrawprofile)、[S-31](#s-31-updateprofile)、[S-33](#s-33-relistprofile) 都够不着官方行。
- 清单里一条条目的**身份分量**（路由名、来源、出厂默认层）与已有官方行相同即「同名官方行」；**身份分量不可改**，所以不存在「把一条官方档案改名」这种处置。
- **装入是整份取条目，不是逐项改写**：`updated`、`relisted` 的行内容除身份分量、`registration`、`updatedAt` 外逐成员等于条目。`data.model-profile/v1#S-12` 对 `maxOutputTokens` 的那一个例外（上游把输出上限降到档案 `parameters.maxOutputTokens` 之下时这一项不跟着降）**不适用于装入**：条目已整份过了 `data.model-profile/v1#S-28` 的表示层校验（含 `#S-18` 输出上限与参数的关系），不会出现「降到参数值之下」；按例外保留旧值，行就与条目不相等，⑦ 的对照随之失效（第二轮评审 R2-MPD-3，取其第一种改法；本条是**本契约推导**）。

### S-19 bindCredential

**给一个租户配上他那一把模型凭据（的引用）；同一个租户再绑即轮换。**组织那一层不持有凭据，本操作没有组织那一支。

| # | 内容 |
|---|---|
| ① | `initiator: TenantId`；`tenant: TenantId`（配给哪个租户）；`credential: CredentialRef`（`data.asset-model/v1#S-23`） |
| ② | `可写(initiator, tenant(tenant))`（[S-10](#s-10-配置资格谁能在哪一格写)）——即 `initiator = tenant` 且成员资格有效。[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)「配或换凭据」：租户可（自己那把）；组织超级管理员**不可**——他在自己的租户下配自己那一把 |
| ③ | 无。**组织层与出厂格都不在输入的定义域里**：输入只收一个 `TenantId`；给出组织身份（或 `ScopeLayerIdentity` 的组织一支）是形状不合，`invalidInput`，**不是**一次权限判定 |
| ④ | **单次提交**：把 `tenant` 的绑定设为 `(credential, boundAt = 提交时刻)`，**替换**原有的那一条（[S-7](#s-7-凭据绑定)）。**本契约不校验这个引用此刻解得出值**——那要够到保管方；解不出值的后果在 [S-20](#s-20-resolvecredential) 的取值问法里以 `credentialUnavailable` 显形 |
| ⑤ | `{ tenant, boundAt }`——**不回显引用** |
| ⑥ | `invalidInput` · `notAuthorized` · `unavailable` |
| ⑦ | **同一个租户、同一引用再绑** ⇒ 不写、`boundAt` 不动，返回原来的 ⑤。**不同引用** ⇒ 轮换，`boundAt` 更新。两个并发的绑定对同一个租户**后提交者生效**，都返回自己的 ⑤ |
| ⑧ | 成员资格判定失败、存储写不进 ⇒ `unavailable`；引用缺席或不合 `data.asset-model/v1#S-23` 的形状、`tenant` 缺席或不是一个 `TenantId` ⇒ `invalidInput` |
| ⑨ | 不发。**绑定的变化不以事件告知任何人**：取用方每次现取（[S-20](#s-20-resolvecredential)），轮换零通知就生效于下一次取用 |

**在途的那一次发出不受轮换影响**：它已经带着旧值出门；下一次发出取的是新值。这是取用方的现取规则给出的结果，本契约不为它另设条款。

### S-20 resolveCredential

**给发起调用的租户与这次要用的档案的来源，取那一把。两种问法：有没有、取值。**

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`（发起调用的租户）；`origin: ProfileOrigin`（这次要用的档案的来源，`data.model-profile/v1#S-4`——取自那次调用绑定的有效模型引用的 `origin`，`capability.model-request-runtime` v1 的义务）；`ask ∈ { present, value }`——`present` 有没有、`value` 取值 |
| ② | `present`：无授权前置。`value`：**只由模型请求运行时在一次发出之前调用**（[S-12](#s-12-秘密只在一个问法里出现)；单机装配给，跨进程协议给） |
| ③ | 无 |
| ④ | 只读，无提交；**每次现取**，不缓存到下一次取用之后 |
| ⑤ | **取哪一把**（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)、[§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；[decisions P33、P34](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24)）：<br>• `tenant` 有绑定 ⇒ **取它，不论来源**——这个租户发起的调用都用它，不管档案建在哪一层；<br>• 否则，`origin = official` 且部署装配给出厂格配了一把 ⇒ **取出厂格那一把**；<br>• 否则 ⇒ **没有可用的凭据**。**自建档案不落到出厂格那一把**：自建档案要调它的人带自己的 key（裁决 3、P33），建在组织层的也一样。<br>`present` ⇒ `{ present: true, scope: tenant(T), boundAt }`、`{ present: true, scope: factory }` 或 `{ present: false }`；`value` ⇒ `{ scope, value }`，`value` 是凭据本体，由保管方按那条绑定的引用交出（出厂格那一把由装配交出） |
| ⑥ | `invalidInput` · `unavailable` · `credentialUnavailable` |
| ⑦ | 只读，天然可重复 |
| ⑧ | **租户那一格读不到 ⇒ `unavailable`，绝不落到出厂格**——落下去会让一个配了自己凭据的租户在一次存储抖动里用部署的钱、记在部署头上。`value` 问法：没有可用的凭据 ⇒ **`credentialUnavailable`**；租户的绑定在、保管方判定这个引用解不出值（已被清掉、不属于这个租户）⇒ **`credentialUnavailable`**，**不改取出厂格那一把**；保管方够不着 ⇒ `unavailable`。`present` 问法：没有可用的凭据 ⇒ `{ present: false }`，**这是一个结论，不是失败**；读不到 ⇒ `unavailable`，**不得**返回 `{ present: false }`。`origin` 缺席或不在两值之内 ⇒ `invalidInput`——**缺它不当作「官方」** |
| ⑨ | 不发 |

- **「永不取」由锚兑现**：取用只读 `tenant` 那一格与出厂格；组织层、个人范围、别的租户都不在取用里，所以没有任何一次取用会取到它们——**也不存在「组织那一把」可取**（[S-7](#s-7-凭据绑定)）。
- **`present` 问法里的 `present: true` 不保证取值成功**：绑定在，保管方仍可能判「解不出」。展示「调它时有没有凭据可用」（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)）用的是有没有；真正出门以取值问法为准。
- **出厂格那一把只供官方档案**：它和官方档案一样随部署而来（[PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)、P34）；自建档案本来就要自己的 key。**所以同一个租户在没配自己那一把时，官方档案可用、自建档案标明缺凭据**——展示列表按每一条的来源各问一次。

### S-31 updateProfile

**修订一条自建档案的可改属性。**（主线裁定，见 [D-040 §S16 S16-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）

| # | 内容 |
|---|---|
| ① | `initiator: TenantId`；`ref: ModelProfileRef`（custom 支）；`patch`：要替换的成员与新值，外加要去掉的可缺席成员——成员只能取自 `data.model-profile/v1#S-12` 标为「可改」或「随上游变化更新」的那几项（`providers`、`allowFallback`、`parameters`，以及五项上游属性）；**给出的成员整项替换，没提到的不动**；`patch` 至少提到一项。`patch` 的交换表示随 [G-7](#十已知缺口) 那份组合契约定 |
| ② | `可写(initiator, ref.scope)`（[S-10](#s-10-配置资格谁能在哪一格写)）——只有那一格有写资格的人改得动那一格的档案 |
| ③ | **有**：身份分量（路由名、所在范围、来源）、`registration`、`updatedAt` **不在 `patch` 的定义域里**，出现即 `invalidInput`——改名就是用新名字 [registerProfile](#s-14-registerprofile) 再 [withdrawProfile](#s-15-withdrawprofile) 旧的，**不存在「把一条档案改名」**。`ref` 是 official 支 ⇒ `officialProfileReadOnly`：官方档案只经[清单装入](#s-18-loadmanifest)改，与 [withdrawProfile](#s-15-withdrawprofile) ③、[relistProfile](#s-33-relistprofile) ③ 同一个值 |
| ④ | **单次提交**：读出那一行、应用 `patch`、**改完的整份文档过 `data.model-profile/v1#S-24`**（尤其输出上限与参数的关系，`data.model-profile/v1#S-18`）、写回。五项上游属性里至少一项的值变了 ⇒ `updatedAt` = 提交时刻；否则不动（`data.model-profile/v1#S-11`）。`registration` 不动：**已撤回的行也改得动，改了也不回到在册**——回到在册走[恢复在册](#s-33-relistprofile)。[flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)「恢复之后照常修订」说的是恢复之后可以修订，不是禁止修订已撤回的行 |
| ⑤ | `{ ref, profile: 改完的那份 ModelProfile }` |
| ⑥ | `invalidInput`（**只看输入本身**：`ref`、`patch` 的形状，提到定义域以外的成员）· `officialProfileReadOnly` · `notAuthorized` · `unavailable` · `profileNotFound` · `invalidInput`（**改完的整份文档过不了 `data.model-profile/v1#S-24`**）——同一个值在两个位置，按判定次序各在各处（主线裁定，见 [D-040 §七 M14](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） |
| ⑦ | **改完与原样逐成员相等** ⇒ 不写、`updatedAt` 不动，返回 ⑤——回执丢失之后原样重发，得到同一份。**两次并发的修订按提交先后依次作用在那一行上**（每次都是同一提交里的读—改—写），各自返回自己提交之后的那一份；同一项被两次改，后提交者的值留下 |
| ⑧ | 那一行读不到、成员资格判定失败 ⇒ `unavailable`，**不得返回 `profileNotFound`**；`patch` 不合形状、提到定义域以外的成员 ⇒ `invalidInput{reason}`，**在授权之前**；授权成立、那一行解析到了、**改完的文档过不了 `data.model-profile/v1#S-24`** ⇒ `invalidInput{reason}`，**在解析之后**（reason 取那份契约的十个之一或 `malformed`）。两处都**不写任何东西** |
| ⑨ | 不发。**在途调用不受影响**：它们在打开时绑定了档案快照（`capability.model-request-runtime` v1）；下一次打开读到的是改完的那一份 |

**次序：输入形状 → 结构性禁止 → 授权 → 解析 → 改完的整份文档**。前四步同 [S-15](#s-15-withdrawprofile)：无权者得不到「这一格有没有这条档案」的答案。**第五步要读出那一行才判得出**（例如 `patch` 只给了 `parameters.maxOutputTokens`，要拿行上的 `maxOutputTokens` 比，`data.model-profile/v1#S-18`），所以排在 `profileNotFound` 之后——排在授权之前，无权者就能拿一个会让整份文档非法的 `patch` 探出那一行在不在、甚至二分出它的输出上限（主线裁定，见 [D-040 §七 M14](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

### S-32 unbindCredential

**解除一个租户的凭据绑定：让他回到「没配」。**（主线裁定，见 [D-040 §S16 S16-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)；按 PF-013 裁决 33 只有租户那一支）

| # | 内容 |
|---|---|
| ① | `initiator: TenantId`；`tenant: TenantId`（解除哪个租户那一把） |
| ② | `可写(initiator, tenant(tenant))`（[S-10](#s-10-配置资格谁能在哪一格写)）——[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)「解绑凭据」：租户可（自己那把）；组织超级管理员不可 |
| ③ | 无。**组织层与出厂格都不在输入的定义域里**：组织那一层没有凭据可解绑；出厂格那一把由装配给（[S-7](#s-7-凭据绑定)） |
| ④ | **单次提交**：删掉 `tenant` 的绑定。**本契约不处置凭据本体**：保管方是否、何时丢弃那份本体，归提供者设计 |
| ⑤ | `{ tenant, present: false }` |
| ⑥ | `invalidInput` · `notAuthorized` · `unavailable` |
| ⑦ | **幂等**：这个租户本来就没有绑定 ⇒ 不写，返回同样的 ⑤。与并发的 [bindCredential](#s-19-bindcredential) 按提交先后，后提交者的效果留下 |
| ⑧ | 成员资格判定失败、存储写不进 ⇒ `unavailable`，绑定保持原样；`tenant` 缺席或不是一个 `TenantId`（含给了组织身份）⇒ `invalidInput` |
| ⑨ | 不发。取用方每次现取（[S-20](#s-20-resolvecredential)）：**下一次取用按「没配」取**——官方档案取出厂格那一把（部署配了时），自建档案没有可用的凭据；这是「回到没配」的本义（[PF-013 §6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)「解绑就是把这一项清空，此后照『没配』处理」），不是回落 |

- **在途的那一次发出不受影响**：它已经带着旧值出门。
- **解除不等于撤销那把凭据在上游的效力**：要让它在 OpenRouter 那边作废，是配它的人在上游做的事；本契约只让本系统不再取用它。

### S-33 relistProfile

**恢复在册：把一条已撤回的自建档案恢复在册，还是原来那一条。**服务面名 `relistProfile`。
依据：[PF-013 §4 在册 / 已撤回](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回)、[§6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)、[flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)、[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)（裁决 37；P35、P36）。

| # | 内容 |
|---|---|
| ① | `initiator: TenantId`；`ref: ModelProfileRef`（custom 支） |
| ② | `可写(initiator, ref.scope)`（[S-10](#s-10-配置资格谁能在哪一格写)）——**谁撤得了它，谁就恢复得了它**：与 [withdrawProfile](#s-15-withdrawprofile) 同一条谓词（P35） |
| ③ | **有**：`ref.origin = official` ⇒ `officialProfileReadOnly`——官方档案的恢复只经[清单装入](#s-18-loadmanifest)（清单里重现即 `relisted`），与 [withdrawProfile](#s-15-withdrawprofile) ③、[updateProfile](#s-31-updateprofile) ③ 同一个值；[flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作)「撤回、恢复或修订官方档案：不可」对全部四种身份 |
| ④ | **单次提交**：`registration` 由 `withdrawn` 改为 `listed`。**同一行**：身份分量、其余成员一个不变，**`updatedAt` 不动**（`data.model-profile/v1#S-11`：它只随五项上游属性动）。**不做撞名判定**——恢复不写新名字，那一格里这个名字本来就只属于这一行（`data.model-profile/v1#S-3`） |
| ⑤ | `{ ref, registration: listed }` |
| ⑥ | `invalidInput` · `officialProfileReadOnly` · `notAuthorized` · `unavailable` · `profileNotFound` |
| ⑦ | **幂等**：那一行已经是 `listed` ⇒ 同样返回 ⑤，不写任何东西。与并发的 [withdrawProfile](#s-15-withdrawprofile) 按提交先后，后提交者的效果留下 |
| ⑧ | 读不到那一行、成员资格判定失败 ⇒ `unavailable`，**不得返回 `profileNotFound`**（读不到 ≠ 不存在）；引用不合形状 ⇒ `invalidInput{reason}` |
| ⑨ | 不发。恢复之后，读的一方每道准入现读（[S-11](#s-11-每道准入现读)）就看到 `listed`；**正确性不靠通知**。据点侧若有只读副本，它在新鲜度上界之内看到恢复（[S-22](#s-22-装配给的保证-vs-协议须给的保证) 第二行）。**恢复在册不另发通知**：本版只有撤回那一个通知，恢复的正确性靠现读 |

**次序：形状 → 结构性禁止 → 授权 → 解析**，同 [S-15](#s-15-withdrawprofile)：授权只依赖 `ref.scope`，无权者得不到「这一格有没有这条档案」的答案。
**恢复之后，还指着它的会话自然接上**：选中模型一直是这条引用、没有谁替用户改选过；它又在册了，只要这个范围允许、模态兼容，合法目标的求值就把它算回来（`capability.model-request-runtime` v1）。本契约只保证它们读得到 `listed`。
**同一格里要再用一个已撤回档案的路由名，就是走这里**——[registerProfile](#s-14-registerprofile) 对它给 `routeNameTaken`（⑦）。

---

## 五、事件

### S-21 profile.withdrawn 是通知

| 事件 | 何时发出 | 携带什么 |
|---|---|---|
| `profile.withdrawn` | 一条档案行 `listed → withdrawn` 的提交**之后**（[S-15](#s-15-withdrawprofile)、[S-18](#s-18-loadmanifest)） | 被撤回的那条档案的 `ModelProfileRef` |

- **必发，不是可选**：一个发的部署与一个不发的部署在消费者看来是两份契约；必发让消费者写得出一条会失败的断言（与 `capability.organization-governance/v1` 事件条款同一口径，本契约不引为依据）。**必发不等于必达**。
- **三条负向承诺**：发出方不等待、不读取任何监听者的返回；监听者失败、缺席或根本没有，不改变已经提交的撤回；**没有任何一条性质靠某个监听者收到了它**——「撤回之后不再被新准入」靠的是每道准入现读（[S-11](#s-11-每道准入现读)），不靠这个事件。
- **它的用处是让据点侧提前刷新**；刷新是性能，不是正确性。
- **恢复在册不发事件**（[S-33](#s-33-relistprofile) ⑨、[S-18](#s-18-loadmanifest) 的 `relisted`）：本版只有这一个通知；恢复靠现读被看到。
- **本契约没有控制类事件**：建档、撤回、配凭据的放行全是操作自身的同步前置。

---

## 六、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **（所在范围, 路由名）不重复**（含已撤回行；`data.model-profile/v1#S-3`）；官方档案全在出厂默认层，因而官方档案之间路由名不重复 | [S-14](#s-14-registerprofile) ④、[S-18](#s-18-loadmanifest) ④：判定与写入同一提交、边界覆盖那一格的档案行 | 存储兑现每一格的那个提交边界（[S-22](#s-22-装配给的保证-vs-协议须给的保证) 第一行） | [PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（rev 10，裁决 35） |
| **行不删；在册状态只经撤回与恢复在册两条边变化，恢复的是同一行** | 本契约没有删行的写路径；`listed → withdrawn` 只由 [S-15](#s-15-withdrawprofile)、[S-18](#s-18-loadmanifest) 写，`withdrawn → listed` 只由 [S-33](#s-33-relistprofile)、[S-18](#s-18-loadmanifest) 写，都改同一行（[S-5](#s-5-档案行一条档案在目录里的存储事实)） | —— | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)、[flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案) |
| **官方档案只来自清单，也只经清单变化；自建档案只来自有写资格的建档** | [S-14](#s-14-registerprofile) ①③（只收 custom、不收出厂层）、[S-18](#s-18-loadmanifest) ①（只收 official）；[S-15](#s-15-withdrawprofile)、[S-31](#s-31-updateprofile)、[S-33](#s-33-relistprofile) ③ 对 official 支一律 `officialProfileReadOnly` | 发布动作是清单装入唯一的调用方（装配给） | [PF-013 §4 官方档案 / 自建档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案) |
| **一个租户至多一把凭据；没有以组织为键的凭据** | [S-19](#s-19-bindcredential) ④：再绑即替换；[S-32](#s-32-unbindcredential) 删掉即「没配」；两者的输入只收 `TenantId` | 存储上「租户 → 绑定」一一；出厂格那一把由装配给 | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)（rev 10，裁决 33） |
| **已装入的最高发布序号只增；记下的处置恰是那一份清单装入时交回的** | [S-18](#s-18-loadmanifest) ④⑥⑦：序号、处置与档案行同一提交 | 单一装入点（装配给） | 规格层推导（[S-8](#s-8-官方档案清单与发布序号)） |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **凭据的值、或它的引用，出现在任何读面、事件、失败说明里** | [S-12](#s-12-秘密只在一个问法里出现)；取值只在 [S-20](#s-20-resolvecredential) `value` | 取值问法只由运行时调用（装配给）；运行时把值只交给传输适配（`capability.model-request-runtime` v1） | [PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)、[PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) |
| **取到别的租户、组织层、或本人个人组织的凭据** | [S-20](#s-20-resolvecredential)：只读锚那个租户与出厂格 | 调用方给的锚就是发起调用的租户（运行时的义务，`capability.model-request-runtime` v1） | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)；[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **自建档案用上出厂格那一把** | [S-20](#s-20-resolvecredential) ⑤：出厂格那一把只在 `origin = official` 时取 | 调用方给的来源就是这次调用绑定的有效模型的来源（运行时的义务） | [PF-013 decisions P33、P34](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#rev-10-随裁决-3338-推出的2026-09-24)；裁决 3 |
| **租户那一格读不到时落到出厂格那一把** | [S-20](#s-20-resolvecredential) ⑧ | —— | [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)「目标范围不可用时不静默回退」同一形状 |
| **读别的租户的自建档案** | [S-16](#s-16-readprofile) ②、[S-17](#s-17-listprofiles) ⑤ | —— | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **任何人经写面撤回、恢复或修订一条官方档案** | [S-15](#s-15-withdrawprofile) ③、[S-33](#s-33-relistprofile) ③、[S-31](#s-31-updateprofile) ③ | —— | [flows §4](../../../../product/PF-013-model-profiles-and-invocation/flows.md#四角色与操作) |
| **一份旧清单把新的官方档案撤掉、把已撤掉的恢复** | [S-18](#s-18-loadmanifest) `manifestNotNewer` | 发布序号由发布方单调给出（[G-9](#十已知缺口)） | 规格层推导 |
| **「读不到」被说成「不存在」「无权」「没配」** | [S-9](#s-9-缺席时的默认答案)；各操作的⑧ | —— | `data.identity-values/v1#S-19` |
| **拒绝之后留下部分效果** | 全部写操作的④：单次提交 | 存储原子性 | [PF-013 flows §2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#二分支与异常) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 撤回成功返回之后，**下一次**读这条档案得到 `withdrawn` | 下一次读 | 单机：同一存储现读；跨进程：新鲜度上界（[S-22](#s-22-装配给的保证-vs-协议须给的保证) 第二行，未定义） | [PF-013 §6.9](../../../../product/PF-013-model-profiles-and-invocation/design.md#69-合法目标算不出来时不替用户改选)「撤权管的是下一道准入」 |
| 恢复在册成功返回之后，**下一次**读这条档案得到 `listed`（同一行） | 下一次读 | 同上 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)「恢复原来那一条，指着它的会话不用换就接得上」 |
| 绑定成功返回之后，**下一次**取值问法取到新值 | 下一次取用 | 同上；秘密送到据点的方式（[G-7](#十已知缺口)） | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)「轮换就是改这一项的值」 |
| 被拒的操作**立即**返回一个具名失败值，且不留部分效果 | 该次返回 | 存储原子性 | [PF-013 flows §2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#二分支与异常) |

---

## 七、装配给的保证 vs 协议须给的保证

### S-22 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要求领域语义在分布式演化中不变。**本契约住在治理中心，它的消费者（模型请求运行时）住在会话据点**——第一版单机开发装配时同进程，**交付形态本来就跨进程**。右两列因此不是「以后再说」，是本契约已经记下的待兑现项（[G-7](#十已知缺口)）。

| 保证 | 单机由谁给（装配给） | 跨进程之后谁重新兑现（协议给） | 做不到会怎样 |
|---|---|---|---|
| **同一范围内路由名唯一**（[S-14](#s-14-registerprofile)、[S-18](#s-18-loadmanifest)） | 中心单一存储，判定与写入同一提交 | **只在中心写**：据点不持有可写的档案行；任何据点侧缓存只读。每一格须有单一裁决点或条件写入（按格分片成立） | 同一格里两处各放行同一个名字：两条同一身份的档案，引用指不清 |
| **在册状态变化之后按新状态准入**（[S-11](#s-11-每道准入现读)、[S-15](#s-15-withdrawprofile)、[S-33](#s-33-relistprofile)） | 运行时现读同一存储 | 中心 → 据点的读须定义**新鲜度上界**，并把「上界之内仍可能按旧状态准入」写进契约；读须**按写入先后单调**：读到过某一次转移之后的状态的一方，此后不得再读到那次转移之前的状态 | 撤回之后一段时间内仍被选中、仍被发出，且没人知道这段时间有多长；或恢复之后时而在册、时而「已下架」 |
| **凭据值只在取值问法里出现**（[S-12](#s-12-秘密只在一个问法里出现)） | 进程内交给运行时 | **秘密怎样送到据点、是否在据点落地、轮换怎样传播**（[G-7](#十已知缺口)）。组织层不持有凭据，只剩租户那一把与出厂格那一把两种要送 | 值留在用户本机之外的地方；或轮换之后据点仍用旧值 |
| **取值问法只由运行时调用、来源如实**（[S-20](#s-20-resolvecredential) ①②） | 装配：只有运行时够得着；来源取自那次调用绑定的有效模型 | 接收边界**鉴别调用方是某个据点上的模型请求运行时**，并按那次调用的发起租户重验锚（`data.identity-values/v1#S-30`）；来源随那次调用的有效模型引用一起到达、不由调用方另填 | 任何够得着接口的一方都能取出任意租户的凭据值；或借一个假的「官方」来源让自建档案用上部署那一把 |
| **取哪一把**（[S-20](#s-20-resolvecredential)） | 同一存储里读租户那一格，出厂格那一把在装配里 | 租户那一格读不到即失败；**不得**以「租户那一格暂时读不到」落到出厂格 | 用错的凭据，账记到错的头上 |
| **出厂格那一把不可经写面改**（[S-7](#s-7-凭据绑定)） | 装配：它不在任何写面的输入域里 | 部署凭据怎样送到据点、怎样轮换，归装配与组合契约（[G-7](#十已知缺口)） | 一个租户借写面改掉整个部署的凭据 |
| **调用方身份已核实**（全部写面与读面的 `initiator`、`scopeChain`、`tenant`） | **装配给**：这些是能力间内部面；入口层先把登录状态换成当前租户身份再带着它来调 | 携带授权依据、**在接收边界重新验证**（`data.identity-values/v1#S-30`）；不得只靠「上游已经验过了」 | 任何拿到一个 `TenantId` 的调用方都能以那个身份建档、撤回、配凭据、读别人的自建档案 |
| **清单只由发布动作装入、序号单调**（[S-18](#s-18-loadmanifest)） | 装配：只有发布动作够得着；单一装入点 | 鉴别发布方；序号由单一来源给出（[G-9](#十已知缺口)） | 任何一方都能借「清单里没有」撤掉官方档案、借「清单里又有」恢复已下架的——在下一次正确装入之前一直如此 |
| **表示层校验**（[S-9](#s-9-缺席时的默认答案)） | 纯计算 | **不变**；但每个接收边界各自重校，上游校验过不算数 | —— |

---

## 八、交接、缺席与恢复

### S-23 依赖不可用、撤除与重启

- **成员资格判定、存储、保管方不可用时，依赖它们的操作明确失败**（各操作⑧的 `unavailable`），不静默降级：不跳过授权、不把「读不到」当「未被占」「没配」「不存在」。
- **本能力被撤除或替换时，它拥有的全部事实都在存储里**（档案行、绑定、已装入序号与那一次装入的处置）；**没有一条只活在运行实例里**，没有定时器承担正确性，没有跨提交的在途事务。**重启不改变任何判定结果，也没有在途工作要交接。**
  这是**全部写操作都在单次提交内结算**（[S-13](#s-13-这一节每个操作写全九件事)）的直接结果，也是一条**可被推翻的承诺**：任何引入跨提交在途状态的修改都会使它失效，那时回到本节重写交接责任。
- **`profile.withdrawn` 的发出在提交之后**：提交成功而事件没发出（进程在两者之间没了）时，撤回照样成立；据点侧靠现读（[S-11](#s-11-每道准入现读)）看到它，**不靠补发**。恢复在册本来就不发事件，同样靠现读。

---

## 九、规范表达与验证义务

### S-24 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| 同一格里路由名唯一的判定与写入同提交 | **规范场景**（[S-26](#s-26-同名两条只有先成的一条成立)，必须真跑并发） | 这是一条**单写者、单存储里的唯一约束**：判定与写入落在同一提交里，交错就被存储的串行化排除了。行为模型里它只会是一个原子动作，**被建模方式吸收**——写出来也没有一条会在条款被违反时失败的断言。去掉同提交会怎样，只有真实存储上的并发演练看得见 |
| 撤回与恢复在册：同一行、两条边 | **规范场景**（[S-25](#s-25-建档撤回再读已撤回仍读得出)） | 两条边都是对同一行的单次写，没有交错；要证的是「恢复的是同一行」与「只有这两条边」 |
| 取哪一把（租户那一把，否则只对官方档案取出厂格那一把）、读不到不落到出厂格 | **规范场景**（[S-28](#s-28-取最具体的一把读不到不回落)，故障注入） | 这是一次两处读的纯判定，没有交错；要证的是「读不到」那一支真的不落下去、自建档案真的取不到出厂格那一把 |
| 清单的五种处置、序号单调 | **规范场景**（[S-27](#s-27-清单的五种处置与旧清单被拒)） | 判定表，逐支演练 |
| 秘密不出本契约 | **规范场景**（[S-29](#s-29-秘密不出本契约)）＋ 静态检查（读面返回类型里没有凭据与引用） | 「不出现」只能对真实输出核对 |

**不建 TLA+、不建 Alloy、不建 Schema。**本契约没有跨提交的状态机（每个写操作单次提交）；结构约束（同一格里路由名唯一、一个租户一把）都是**单存储里的唯一性谓词**，在 Alloy 里写出来只是同义复述；
数据形状全部归 `data.model-profile`、`data.identity-values`、`data.asset-model`；**线上形状**归把这些操作送过进程边界的组合契约（[G-7](#十已知缺口)），capability 不发布 Schema（[规格入口](../../../README.md#准入门槛与停止条件)）。
操作输入里的两个本契约自有的值——清单 `{ ordinal, entries }` 与问法 `ask ∈ { present, value }`——**以散文定义**，交换表示随那份组合契约定。
执行状态与结果在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

#### S-25 建档、撤回、再读：已撤回仍读得出

租户 T 在自己那层建一条档案 → 读它（`listed`）→ 撤回 → 再读 → 再撤回一次 → 在同一格用同一个路由名再建一次 → 恢复在册 → 再读 → 再恢复一次。

**必须观察到**：撤回之后读得到同一行、`registration = withdrawn`、`updatedAt` 与第一次相同；再撤回返回同样结果且**没有第二次 `profile.withdrawn`**；再建得到 `routeNameTaken`；
恢复之后读得到**同一行**（同一个引用、其余成员逐个相等）、`registration = listed`、`updatedAt` 仍与第一次相同；再恢复返回同样结果、什么都没写；恢复不发事件。
**绝不能观察到**：读不出那一行（行被删了）；恢复另起了一行、或改了身份分量；没经恢复在册就回到了 `listed`。

#### S-26 同名两条只有先成的一条成立

组织 O 的两位超管**同时**在 O 的组织层建同一个路由名的档案；再让 O 里的租户 T 在自己那层建同名的一条；再让另一个组织 Q 的超管在 Q 的组织层建同名的一条（判定不读隶属关系，Q 与 O 的隶属与此无关）；最后让发布动作装入一份含这个路由名的官方清单。

**必须观察到**：O 组织层那两次建档恰一次成功，另一次 `routeNameTaken`；T 那一次**成功**（不同的格，同名并存：PF-013 裁决 39、40）；Q 那一次**成功**；装入的处置里这一条是 `added`（官方那一格里没有这个名字）；**O 的组织层里这个名字恰一行，全目录四行**，每一行的引用各不相同。
**这条必须真跑并发**，两次顺序调用不经过同提交要保护的那个窗口。
**另跑一支**：同一个超管把成功那次原样重发 ⇒ 认回同一行，不报 `routeNameTaken`（[S-14](#s-14-registerprofile) ⑦）。

#### S-27 清单的五种处置与旧清单被拒

按 [S-18](#s-18-loadmanifest) 的表构造一份清单，使五种处置各至少出现一次；再装一份序号更小的清单；再把第一份原样重装一次。

**必须观察到**：五种处置逐条对得上；被撤回的官方行各有一次 `profile.withdrawn`；`relisted` 的那一行是**原来那一行**、没有事件；某一格里与清单条目同名的自建档案**不影响**任何处置；序号更小的那份 `manifestNotNewer`、**什么都没变**；原样重装返回相同处置、什么都没写。
**重启一支**：装入之后重启目录的提供者，再原样重装——返回的仍是第一次的那一份处置（不是一串 `unchanged`），什么都没写。
**绝不能观察到**：一份含不合形状条目的清单装进了一半（[S-18](#s-18-loadmanifest) ⑧）。

#### S-28 取最具体的一把，读不到不回落

组织 O 里的租户 T1 配了 K_T1，T2 没配。另有同一账号在个人组织 P 里的租户 T_P，配了 K_P。部署分两种跑：出厂格配了 K_F，与没配。

**必须观察到**（出厂格配了 K_F）：锚 T1 取值，官方档案与自建档案都得 K_T1、`scope = tenant(T1)`；锚 T2 取值，**官方档案得 K_F、`scope = factory`，自建档案得 `credentialUnavailable`**；
`present` 问法对 T2 答：官方 `{ present: true, scope: factory }`，自建 `{ present: false }`；**锚 T2 永远取不到 K_P 与 K_T1**。
**没配出厂格那一把时**：锚 T2 取官方档案的值 ⇒ `credentialUnavailable`，`present` 答 `{ present: false }`。
**故障注入**：让 T1 那一格的绑定读不到，锚 T1 取官方档案的值 ⇒ **`unavailable`，不是 K_F**。
**另跑两支**：`unbindCredential(T1, T1)` 之后，锚 T1 下一次取官方档案的值得 K_F、自建档案得 `credentialUnavailable`——**这是回到没配，不是回落**（[S-32](#s-32-unbindcredential) ⑨）；以组织身份调 `bindCredential` ⇒ `invalidInput`（组织那一层没有凭据可配，[S-19](#s-19-bindcredential) ③）。

#### S-29 秘密不出本契约

用一段已知的凭据原文 V 配上绑定，然后调用本契约的**全部**读面与写面（含各种失败），并收集全部事件。

**必须观察到**：除 `resolveCredential(…, value)` 的成功返回之外，**任何返回、失败说明、事件里找不到 V，也找不到那条 `CredentialRef`**。

#### S-30 无权者探不到名字

一个不在组织 O 的租户 X，用 O 的组织层为 `scope` 调 `registerProfile`，路由名分别取「O 里已有的」与「从未有过的」。

**必须观察到**：两次都是 **`notAuthorized`**，**逐字相同**——无权者据失败值分不出那个名字在不在。
**故障注入一支**：换 O 的一位普通成员 B（`T_B`）按两个名字各调一次，并让成员资格判定以 `unavailable` 失败——两次都是 **`unavailable`**，逐字相同；**「O 里已有的」那个名字绝不能得到 `routeNameTaken`**（[S-13](#s-13-这一节每个操作写全九件事) 判定次序）。
同一时刻 X 再调仍是 `notAuthorized`：X 不在 O，谓词的第一个合取项就不成立，用不着成员资格判定（[S-10](#s-10-配置资格谁能在哪一格写)）。

---

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合**：产品负责人裁定（[PF-013 裁决 35–38](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--档案的身份是所在范围加路由名列表每条带来源已撤回的可以恢复在册)）——已撤回可恢复在册，恢复的是同一条；官方档案与自建档案同路由名并存。落为：[S-33](#s-33-relistprofile) 恢复在册（自建）、[S-18](#s-18-loadmanifest) 处置表的 `relisted`、清单装入不读自建行、[S-15](#s-15-withdrawprofile) ⑦ 改指 S-33。当时的另一读法「撞名的自建件改名前官方件不进该组织的展示列表」没有采用 | — | — |
| G-2 | **已闭合**：`data.model-profile` 的 S-3 是「同一范围内唯一」，不读隶属关系；本契约不消费上级链读面 | — | — |
| G-3 | **已闭合**：出厂格可有一把由部署装配配置的凭据、不可经写面改（D-040 §S16 S16-f）；**只供官方档案**（见 G-10） | — | — |
| G-4 | **已闭合**：产品负责人裁定组织那一层不持有凭据、每人租户层自取（[PF-013 裁决 33](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--组织那一层不持有凭据每人租户层自取)）——「组织层那一把下不下发」不再存在；租户那一把怎样送到据点仍在 [G-7](#十已知缺口) | — | — |
| G-5 | **已闭合**：加 [S-32](#s-32-unbindcredential) `unbindCredential`（D-040 §S16 S16-e） | — | — |
| G-6 | **已闭合**：加 [S-31](#s-31-updateprofile) `updateProfile(ref, patch)`，只改 `data.model-profile/v1#S-12` 允许改的项；路由名不可改，改名 = 新登记 + 撤回旧的（D-040 §S16 S16-e） | — | — |
| G-7 | **中心 ↔ 据点的线上形状与协议义务未定义**：[S-22](#s-22-装配给的保证-vs-协议须给的保证) 右两列全部；本契约是能力间内部面，线上形状归一份组合契约（尚未立） | 架构（组合契约起草） | 那份组合契约成立，逐行兑现 S-22 右两列，并命名线上成员；**转发 `profile.withdrawn` 到据点的一方须按目标据点会话的范围链过滤**（不带 `thisArg` 的派发对整棵树可见，[D-040 §八 M65](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |
| G-8 | **已闭合（2026-09-25 修复波 2）**：`origin_not_custom`、官方清单条目 `origin` 不是 `official` 取 `malformed`、`officialProfileReadOnly` 三处同值、`relistProfile`／`loadManifest`／`relisted` 的名字、恢复在册不发通知、已撤回的行可修订，主线接受，见 [D-040 §六 N-9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；[设计依据](#设计依据)末表那一行与 [S-9](#s-9-缺席时的默认答案) 改为链接 | — | — |
| G-9 | **发布序号由谁、怎样给出**；发布动作的身份与鉴别 | 架构／运维（发布流程） | 提供者设计与发布流程写明序号的单一来源；跨进程时鉴别方式进 G-7 那份组合契约 |
| G-10 | **已闭合（2026-09-24 规格修订批）**：出厂格那一把只供官方档案——PF-013 rev 10 decisions P33（自建档案要自己的 key，不落到出厂那一把上，裁决 3）、P34；[S-20](#s-20-resolvecredential) 的输入加这次要用的档案来源 `origin` | — | — |
| G-11 | **已闭合（2026-09-24 产品负责人裁定）**：组织层与租户层的自建档案可同路由名并存（`data.model-profile` v1 G-13 同题）。原话：「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」。落为：[S-14](#s-14-registerprofile) ④ 仍只比同一格（不变）；[S-6](#s-6-范围链) 与 [S-17](#s-17-listprofiles) 末段写明链的先后就是同名覆盖的先后；[S-16](#s-16-readprofile) 写明按引用读不做覆盖。PF-013 rev 12 已写进 §4「档案的身份」 | — | — |

---

## 十一、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **模型请求运行时：合法目标、展示列表与有效模型** | 这个会话的范围链上有哪些档案、各自在册否、各自的模态、各自的来源与范围；同名几条谁覆盖谁；每一条「调它时有没有凭据可用」 | [S-17](#s-17-listprofiles)（每项带引用；末段是从路由名到一行的唯一规则，允许集合 `A` 由它带来）＋ [S-20](#s-20-resolvecredential) `present`（按每一条的来源问） | **够**。`A` 不在这里（[S-3](#s-3-本契约明确不承诺什么)），归 `capability.asset-evaluation` |
| **模型请求运行时：出门前检查与绑定快照** | 有效模型那一条的当前取值（含已撤回、恢复在册） | [S-16](#s-16-readprofile) | **够**。快照由运行时在打开调用时绑定，本契约不存历史 |
| **模型请求运行时：一次发出** | 这一次发出用的凭据值与它来自哪一格 | [S-20](#s-20-resolvecredential) `value`（带有效模型的来源） | **够**，前提 G-7（秘密送达） |
| **交付面（PF-016）：管理员与用户建档、撤回、恢复、配凭据** | 写操作；「有没有、哪个范围、什么时候配的」 | [S-14](#s-14-registerprofile)、[S-15](#s-15-withdrawprofile)、[S-33](#s-33-relistprofile)、[S-19](#s-19-bindcredential)、[S-20](#s-20-resolvecredential) `present` | **够**（修订 [S-31](#s-31-updateprofile)、解绑 [S-32](#s-32-unbindcredential)、恢复在册 `relistProfile`） |
| **Agent 定义「用哪个模型」那项设置的取值校验** | 一个路由名在一条链上有没有行、落到哪一行、在册否 | [S-17](#s-17-listprofiles) 末段（设置记路由名，PF-013 rev 12） | **够**。那项设置的求值归 `capability.asset-evaluation` |
| **系统发布** | 装入官方清单，看得到每一条的处置 | [S-18](#s-18-loadmanifest) | **够**，前提 G-9 |
| **据点侧的只读副本**（若提供者设计采用） | 撤回的提前通知 | [S-21](#s-21-profilewithdrawn-是通知) | **够**；正确性不靠它 |

---

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**来历**：起草之初档案登记、撤回与凭据绑定与据点侧运行时并在一份契约里；因两者不在同一进程、写面带管理授权、变化原因与消费者不同，主线把它拆成中心侧本契约与据点侧 `capability.model-request-runtime` v1（[D-040 §块 C 拆分提案](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-c-拆分提案报回的推荐-aaa目录独立插件中心运行时选择与调用同在据点模态转换独立登记表据点)）。拆分前的草稿从未成稿，不构成前身。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)（逐操作的正反例与手算）。接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。[已知缺口](#十已知缺口)任一项在冻结之后被裁决，凡改变本契约语义的，都出新版本；冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
