# composition.governance-center-entry v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, composition.governance-center-entry, 1)`
- **状态**：`candidate`。主责产品依据 [PF-017](../../../../product/PF-017-governance-center-as-deployable-application/README.md) **rev 1 已接受（2026-09-23）**（[PF-017 decisions §一「正式接受」](../../../../product/PF-017-governance-center-as-deployable-application/decisions.md#2026-09-23--正式接受)；rev 不升，正文就是第二轮修订之后的那一版）。本契约自身的接受另行决定。
  **所依赖的 `capability.account-identity` v2 仍是 `candidate`**（它的主责产品依据同是 PF-017 rev 1）；它被接受之前，本契约不进入接受。
- **设计依据**：
  - PF-017 rev 1（已接受，2026-09-23）：[§部署前提](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署前提)、
    [§4 五个概念](../../../../product/PF-017-governance-center-as-deployable-application/design.md#四概念定义)、
    [§5.1](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)、
    [§5.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#53-认出一个来者只有一条路)、
    [§6.2](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)～[§6.6](../../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)、
    [§6.12](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)、
    [§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)、
    [§6.16](../../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说)、
    [§6.17](../../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)、
    [§8](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)、
    [flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来)、
    [acceptance](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md)
  - [PF-016](../../../../product/PF-016-cli-tui-delivery-surface/README.md) rev 3：[§4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)、
    [§5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)、
    [§6.9](../../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)、
    [§6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)
  - [PF-001](../../../../product/PF-001-identity-scope-and-agent-constraints/README.md) rev 15：[§4 登录状态](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)、
    [§4 当前租户身份](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)、
    [§6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)、
    [§6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)、
    [flows §2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)
  - [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
    [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、
    [SYS-OBSERVABILITY C1／C3／C6](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)
- **参与方契约**（坐标与消费 clauses 见 [S-2](#s-2-参与方与精确承诺)）：
  `capability.account-identity` **v2**（`candidate`）、`capability.organization-governance` v1、`composition.account-registration` v1（两份 `accepted`）
- **精确语义依赖**：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`——
  本契约**不复述**任何身份值的定义，线上用它们的规范形式原样传；消费 clauses 见 [S-2](#s-2-参与方与精确承诺)。
  `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`——读邀请、读隶属请求与三条列表的返回里带着邀约的两个时刻与派生状态，
  线上形状引用它的 Schema，不复述；列表项的 `issuedAt` 与完整体检的 `startedAt` 引用它的时间点 `Instant`；`offerTtl` 的含义取它的 `offer_ttl`。消费 clauses 同见 [S-2](#s-2-参与方与精确承诺)。
- **缩写**：**AI** = `capability.account-identity` **v2**、**OG** = `capability.organization-governance` v1、**AR** = `composition.account-registration` v1、
  **IV** = `data.identity-values` v1、**OE** = `data.offer-expiry` v1。「AI S-44」就是坐标 `capability.account-identity/v2#S-44` 的简写，同一段或同一表行里首次出现时带链接；
  **不带缩写的 `S-n` 只指本契约自己的条款**。
- **为什么是一份组合契约**：判定次序、四种入口答复与身份推导对**每一个**请求都一样，横跨三份契约，
  任何一个单项能力都拥有不了；理由的长期家是
  [提案 · 入口契约为什么是一份 composition 契约](../../../../record/proposals/governance-center-entry/alternatives.md#入口契约为什么是一份-composition-契约)
  与[为什么不拆、为什么不并](../../../../record/proposals/governance-center-entry/design.md#为什么不拆为什么不并)。
- **本契约用到的四个技术名**，都**没有词条**（无词条），只在本契约里当技术名用，不是统一语言的正式名：
  **入口层**（无词条：兑现本契约客户端那一面的提供者）、**运维面**（无词条：[运维者](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)那一面在运行中的中心上唯一的部分）、
  **出示物**（无词条：信封成员 `presentedLoginState` 里携带的那个值，就是 AI 的「登录状态出示物」）、**列表句柄**（无词条：成员 `loginStateHandle` 的值，就是那个登录状态的 `LoginStateId`）。
- **条款编号**：`S-n`，只在本契约本版本内有效；外部引用写全坐标，如 `composition.governance-center-entry/v1#S-10`。
  编号在本版本内只追加、不重排。缺口 `G-n`、证据义务 `V-n`、静态检查 `SC-n` 同此作用域；**已闭合的缺口号保留、标「已闭合」，不复用**。
- **本契约不拥有任何产品正文里没有的产品政策。**凡正文未定、需要产品负责人或别的 owner 裁定的，一律写成[显式缺口](#十三已知缺口)，不填默认值。

## 一、含义与使用范围

### S-1 本契约拥有什么

本契约拥有**客户端 ↔ [治理中心](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)这条边在中心一侧的整体性质与交接**：

| 拥有 | 条款 |
|---|---|
| 请求信封、出示物、四种入口答复、答复集合的闭合 | [S-4](#s-4-请求信封)～[S-9](#s-9-列表句柄) |
| 判定次序：版本 → 认人 → 身份推导 → 补授权 → 路由到领域操作；「判不了优先于无效」 | [S-10](#s-10-判定次序)～[S-14](#s-14-失败映射) |
| 每个请求现读、入口不跨请求缓存（中心一侧 δ = 0）；不记住来访、不区别对待来者 | [S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)、[S-16](#s-16-不记住来访不区别对待来者) |
| **封闭的路由表**：逐条投影三份契约的操作，每条写明身份怎么推、补什么授权、失败怎么映射；有意不投影的清单 | [S-17](#s-17-路由表封闭每条路由的九件事从哪读)～[S-24](#s-24-有意不投影) |
| 公开体检；运维面（只在中心所在的机器上、没有治理路由）与完整体检 | [S-18](#s-18-公开体检)、[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由)、[S-26](#s-26-完整体检) |
| [治理中心标识](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)的形状、相等、铸造与存放 | [S-27](#s-27-governancecenterid-的形状与相等)、[S-28](#s-28-铸造存放与不变) |
| 输出枚举与工程记录的边界 | [S-29](#s-29-秘密不进任何输出)、[S-30](#s-30-工程记录) |
| 这条边的「装配给 vs 协议给」 | [S-36](#s-36-装配给的保证-vs-协议须给的保证) |

**本契约不拥有任何治理语义。**账号、登录状态、组织、成员资格、邀约、当前租户身份的全部判定仍在各自的能力契约里；
本契约只决定**一个到达中心的请求按什么次序被判、以谁的身份交给哪一个领域操作、领域的答复怎样变成线上的答复**。

### S-2 参与方与精确承诺

| 参与方 | coordinate 与消费 clauses（`rebase_relation` 一律不适用：首版，无前身） | 向本组合提供的保证 | 本组合对它的前提 |
|---|---|---|---|
| `capability.account-identity` | `omne-harness-lite-design-2026-09-15 · capability.account-identity · v2`（`candidate`）；[`#S-3`](../../../capabilities/account-identity/v2/contract.md#s-3-明确不承诺什么)（时序侧信道不在范围）、[`#S-8`](../../../capabilities/account-identity/v2/contract.md#s-8-凭据材料)（凭据材料的内部格式属实现选择，入口层不解析它的含义）、[`#S-26`](../../../capabilities/account-identity/v2/contract.md#s-26-credential_policy)（`credential_policy`：凭据方案由它的 owner 定，入口层的表示层校验用该 owner 给出的同一条解析规则，见 [S-19](#s-19-免认人的两条路由注册登录)）、[`#S-10`](../../../capabilities/account-identity/v2/contract.md#s-10-撤销是持久记录不是内存生命周期)（撤销是持久记录）、[`#S-15`](../../../capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态)（登录：返回出示物与它的 LoginStateId）、[`#S-16`](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态)（撤销：目标按 LoginStateId 指认、可以来自线上载荷；发起方按来源读，是认人所得 LoginStateId）、[`#S-17`](../../../capabilities/account-identity/v2/contract.md#s-17-校验登录状态)（校验登录状态：AI S-44 的判定就是它的判定——查不到、已撤销、所属账号未激活收成同一个拒绝，撤销提交之后必拒；本组合**不调用**它，它只对进程内开放，见 [S-11](#s-11-认人)）、[`#S-20`](../../../capabilities/account-identity/v2/contract.md#s-20-已激活不回退不消失)（已激活不回退、不消失——调用方本人的 `accountNotActivated`／`accountDoesNotExist` 因此记缺陷，见 [S-14](#s-14-失败映射)）、[`#S-29`](../../../capabilities/account-identity/v2/contract.md#s-29-撤销不等于强制停止)（撤销只影响下一道准入）、[`#S-30`](../../../capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)（v1 的第 3、6、8 行，以及 v2 新增的「只有 S-44 认出示物」「出示物猜不中」「出示物只交到调用方手里」三行）、[`#S-37`](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态)（列出：调用方的 LoginStateId 按来源读，是认人所得 LoginStateId）、[`#S-44`](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（第 ② 步认人：按出示物换取身份）、[`#S-45`](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物)（出示物的性质与交换表示；LoginStateId 由它派生、不可逆、不是秘密）、[`#S-46`](../../../capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物)（存储与诊断输出里翻不出能用的出示物：[S-41](#s-41-规范场景列表不给能直接用的东西) 把持久内容那一搜交给它，[S-46](#s-46-规范场景输出里搜不到秘密) 沿用它的三种搜法） | [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 的四个出口封闭（判定就是 AI S-17 的判定）、`login-state-rejected` 不区分原因、撤销提交之后必拒；[AI S-15](../../../capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态) 三种登录失败逐字相同，成功时一次交出出示物与它的 LoginStateId；[AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) 列出此刻全部有效的、必含调用方自己那一个，列出的 LoginStateId 不是出示物 | **出示物猜不中**——出示物安全的地基（[AI S-30](../../../capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) 的「出示物猜不中」行、[AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 的熵下限）。**这是本组合的前提，由 AI 的提供者兑现，本组合不兑现它**（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「出示物猜不中」行）。LoginStateId 本版不承担任何安全性，可以被看见 |
| `capability.organization-governance` | `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`；[`#S-16`](../../../capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案)（拒绝／不可用／表示层三类收场）、[`#S-10`](../../../capabilities/organization-governance/v1/contract.md#s-10-邀请)／[`#S-11`](../../../capabilities/organization-governance/v1/contract.md#s-11-隶属请求)（两种邀约的标识不透明、方向两支——命名表的出处）、[`#S-21`](../../../capabilities/organization-governance/v1/contract.md#s-21-创建团队组织)～[`#S-37`](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份)（十七个操作，其中 [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 兼作补授权、[`#S-36`](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 兼作身份推导）、[`#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)（第 4、5、6、8、9 行）、[`#S-55`](../../../capabilities/organization-governance/v1/contract.md#s-55-读邀请)～[`#S-60`](../../../capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求)（六个读面） | 每个操作的失败集合封闭；「判不出来」一律 `unavailable`、表示层一律 `invalidInput`，不与拒绝合并；[OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 给出当前租户身份或 `loginStateNotValid`／`unavailable` | **它的面是能力间内部面**，调用方身份由本组合核实后才交给它（[`#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 8、9 行）——本组合就是那道核实 |
| `composition.account-registration` | `omne-harness-lite-design-2026-09-15 · composition.account-registration · v1`；[`#S-2`](../../account-registration/v1/contract.md#s-2-参与方与精确承诺)（「注册入口」一行）、[`#S-4`](../../account-registration/v1/contract.md#s-4-注册成功)、[`#S-5`](../../account-registration/v1/contract.md#s-5-终结结果集合)、[`#S-6`](../../account-registration/v1/contract.md#s-6-每个终结结果的含义与对应的存储状态)、[`#S-8`](../../account-registration/v1/contract.md#s-8-三步次序与责任交接)（被投影的那条动作链）、[`#S-12`](../../account-registration/v1/contract.md#s-12-重试规则)（重发）、[`#S-25`](../../account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) | 一次注册尝试的终结结果恰为四个值；`identifier-held-by-expired-record` 在它内部就地消化 | **本组合就是它的「注册入口」**：表示层校验归本组合；四个终结结果原样呈现；`interrupted` 不改写 |
| `data.identity-values` | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`；线上形状引用的值类型 [`#S-1`](../../../data/identity-values/v1/contract.md#s-1-accountid)、[`#S-2`](../../../data/identity-values/v1/contract.md#s-2-登录标识不是-accountid)、[`#S-3`](../../../data/identity-values/v1/contract.md#s-3-organizationid)、[`#S-4`](../../../data/identity-values/v1/contract.md#s-4-organizationkind)、[`#S-8`](../../../data/identity-values/v1/contract.md#s-8-tenantrole)、[`#S-10`](../../../data/identity-values/v1/contract.md#s-10-membershipstanding)，[`#S-12`](../../../data/identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)（可选项缺席不写 `null`）；[`#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式)、[`#S-9`](../../../data/identity-values/v1/contract.md#s-9-loginstateid)、[`#S-11`](../../../data/identity-values/v1/contract.md#s-11-scopelayeridentity)、[`#S-16`](../../../data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)～[`#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)、[`#S-23`](../../../data/identity-values/v1/contract.md#s-23-不得冒充隔离)、[`#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)、[`#S-28`](../../../data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)、[`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)、[`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 身份值的形状与规范形式；隔离义务 | — |
| `data.offer-expiry` | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`；[`#S-4`](../../../data/offer-expiry/v1/contract.md#s-4-offertiming)（`OfferTiming`）、[`#S-7`](../../../data/offer-expiry/v1/contract.md#s-7-派生状态)（派生状态四值）、[`#S-14`](../../../data/offer-expiry/v1/contract.md#s-14-offer_ttl)（`offer_ttl` 的含义与正值约束）、[`#S-17`](../../../data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证)（第 4 行「默认 `offer_ttl` 为正」：本版由承载装配在启动时校验兑现，[完整体检](#s-26-完整体检)据此只会显示正值；其余四行在这条边上不触发）、[`#S-22`](../../../data/offer-expiry/v1/contract.md#s-22-schema-的范围)（`Instant` 时间点的规范形式——`issuedAt`、`startedAt` 引用它） | 邀约两个时刻与派生状态的形状；时间点的形状；这一份时长的含义 | —（逐行见 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的两行 OE） |

**消费者**（本契约的兑现者与使用者，不是参与方）：兑现客户端一面与运维面的**入口层**（无词条），实现映射节点是 [`realization/packages/tenancy/governance-center-entry`](../../../../realization/packages/tenancy/governance-center-entry/README.md)（`candidate`）；
承载它的装配 [`realization/apps/tenancy-host`](../../../../realization/apps/tenancy-host/README.md)（已按本契约修订）；据点一侧的客户端代理 [`realization/apps/cli`](../../../../realization/apps/cli/README.md)（不在本程实施边界）。

### S-3 本契约明确不承诺什么

- **送达。**请求—答复，答复丢了由客户端重发；本契约不承诺任何一次答复送达，也不提供按请求去重（各路由的重发语义见 [S-17](#s-17-路由表封闭每条路由的九件事从哪读) 的第 5 件事）。
- **推送。**中心从不主动向据点发任何东西（[PF-016 §5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)）。领域能力的通知事件**不上线**。
- **限流与背压。**[产品非目标](../../../../product/PF-017-governance-center-as-deployable-application/design.md#非目标)。
- **跨协议版本的兼容窗口。**对不上就明说（[S-8](#s-8-协议版本与跨版本不变的两样)），不承诺新中心配旧客户端或反之。
- **传输机制。**信封与答复怎样落到某种传输上（头、路径、状态码、体、帧）归实现映射；本契约只约束[那次落地必须保持的性质](#s-4-请求信封)与[跨协议版本不变的两样](#s-8-协议版本与跨版本不变的两样)。传输绑定作为版本化工件发布之前，是缺口 [G-10](#十三已知缺口)。
- **防冒充的具体手段。**「客户端确认连上的真是那个中心」是[产品交给技术设计的硬要求](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)，归传输那一层；它用到的材料是部署配置输入，**不是**[部署密钥](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-deployment-key--部署密钥--deployment-key)。本契约既不兑现它，也不以它为任何条款的前提；手段与它的验证义务是缺口 [G-11](#十三已知缺口)。
- **会话。**路由表里没有任何会话操作；中心不知道任何会话（[PF-016 §4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)：来往里没有会话）。
- **时序侧信道。**与 [`capability.account-identity/v2#S-3`](../../../capabilities/account-identity/v2/contract.md#s-3-明确不承诺什么) 同一口径：「逐字相同」只约束答复本身，不约束耗时。
- **客户端一侧。**标识比较、「问不到」的呈现、三类现读的放行归 PF-016；本契约只给它们判定依据。
- **存储里的登录状态不可被直接冒用。**这一条**由账号能力兑现，不由本组合兑现**：存储与备份里只有出示物的不可逆形式（[AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物)），本组合也不保存出示物（[S-5](#s-5-出示物)）。原缺口 [G-1](#十三已知缺口) 因此闭合。

## 二、信封、出示物与答复

### S-4 请求信封

客户端一面的每个请求（[公开体检](#s-18-公开体检)除外）是一个**信封**，恰含下列成员，**没有别的成员**：

| 成员 | 必需 | 含义 |
|---|---|---|
| `protocolVersion` | 是 | 客户端声明的线上协议版本 |
| `presentedLoginState` | 否 | **出示物**（无词条）：以哪一个[登录状态](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)的名义，见 [S-5](#s-5-出示物) |
| `operation` | 是 | 路由标识，取值恰为 [S-17](#s-17-路由表封闭每条路由的九件事从哪读) 的路由表 |
| `payload` | 是 | 这条路由的载荷；路由没有载荷项时是一个空对象 |

`protocolVersion` 的交换表示是一个非空字符串；`payload` 里各项的成员名见 [S-17](#s-17-路由表封闭每条路由的九件事从哪读) 的成员名规则。

**时间不进信封。**信封里没有任何时刻或时长字段是「现在」的依据；过期与到期只量中心的钟
（[PF-017 §5.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#54-中心自己的时间)）。
载荷里的「这一份邀约的时长」是一个时段，不是时刻，它不告诉中心现在几点。

**传输落地的约束**：信封的每个成员在传输上各有唯一的承载位置，**不丢、不并、不重排出第二份**。
同一成员在传输上出现不止一次，**不由实现挑其中一个**，按成员各归判定次序的那一步（[S-10](#s-10-判定次序)）：

| 出现不止一次的成员 | 答复 | 在哪一步 |
|---|---|---|
| `protocolVersion` | `version-mismatch` | ① 版本：看不懂是哪一版 |
| `operation` | `invalid-input` | ①′ 信封 |
| `payload` | `invalid-input` | 载荷——要认人的路由在**认出人之后**；免认人的路由在 ①′ 之后 |
| 出示物 | `login-state-rejected` | ② 认人：[「多个出示物」](#s-5-出示物)那一支 |

形状由 [Schema](governance-center-entry.schema.json) 的 `Envelope` 给出。**Schema 校验不过对应哪一种答复，由 [S-10](#s-10-判定次序) 按不过的是哪个成员决定**，不是一律 `invalid-input`。

### S-5 出示物

- **出示物就是 [AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 的「登录状态出示物」**：[AI S-15](../../../capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态) 签发一个登录状态时一次性交出的那个不透明字符串，
  按持有者即被认的方式使用（bearer；[PF-001 §4 登录状态](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)）：持有它本身就是 [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 校验的那件事。
  **它不是 `LoginStateId`**：`LoginStateId` 是它的不可逆形式，可以被看见（列表里就有，[S-9](#s-9-列表句柄)），拿来当出示物过不了 AI S-44。
  这是产品负责人把登录态的合法性、鉴权与保存交给业界通行做法之后的形状（[PF-017 INT-011](../../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-23-rulings.md#int-011)）。
- **交换表示就是 AI S-45 的「交换表示」一行，入口层用同一条判、不另立一条**：Unicode 标量值序列（不含孤立的代理码点）、非空、至多 1024 个标量值、首末字符都不属于 [`data.identity-values/v1#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 列出的空白码点集合；逐码点相等，不做任何规范化。上界 1024 是 AI S-45 的候选值，随它的接受一起定。入口层不解析它、不对它的字母表设任何限制。
- **恰好一个。**一个请求带了不止一个出示物 ⇒ [S-11](#s-11-认人) 判「无效」。
- **出示物不是「输入」，是身份。**它在表示层就不合格（不满足上一条的交换表示）时，
  **答 `login-state-rejected`，不答 `invalid-input`**——它属于「带的登录状态从没被这个中心签发过」那一种情形。
  这与 [`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) 不冲突：那条说表示层拒绝不是一次判定结果；
  这里是一次**不用查就判得了的判定**——一个不合形状的值不可能是本中心签发的任何一个登录状态。
- **缺席没有默认值**（[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)）：不从「上一次请求」「这台机器」「这条连接」补。
- **出示物只在一个输出里出现一次**：[登录路由](#s-19-免认人的两条路由注册登录)成功时交出新签发的那一个。此外任何答复、体检、工程记录里都没有它（[S-29](#s-29-秘密不进任何输出)）。
- **入口层不保存出示物**；它只在处理这一个请求的期间存在。

### S-6 四种入口答复

| 值 | 它是什么 | 来者该做什么 | 产品措辞依据 |
|---|---|---|---|
| `version-mismatch` | 版本对不上：中心没有去判这个请求的任何别的东西 | 升级 | [§6.16](../../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说) |
| `login-state-rejected` | **一个成立的结论**：这次来的身份此刻不作数 | 重新登录 | [§6.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)、[§6.5](../../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说) |
| `unavailable` | **没有结论**：此刻判不了（数据所在够不着、时钟读不到或倒退、中心自身的故障） | 稍后再试；**不要重新登录** | 同上 |
| `invalid-input` | 看得懂是哪一版，但信封不合格（`operation` 缺席、出现不止一次或不在路由表内，或有表外成员），或那件事的输入（`payload`）在表示层就不合格；判定没有开始 | 改输入 | [§6.4 ④](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复) |

- **四个值不得合并，不得互相冒充。**尤其：**判不了永远不说成 `login-state-rejected`**；`unavailable` 既不是放行，也不是拒绝。
- **`unavailable` 对来者不带原因。**原因只在[完整体检](#s-26-完整体检)与[工程记录](#s-30-工程记录)里。
- **同一个值的每一次答复逐字相同**，覆盖**整个线上答复**——传输层的状态、头与体一并算，不只是一句文案。
  实现为每个值固定一份字节序列；除此之外答复里没有任何随请求变化的部分（没有请求编号、时间戳、原因码）。
- `login-state-rejected` 沿用 [`capability.account-identity/v2#S-44`](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 的字面；四个值与领域失败值同形（kebab-case）。

### S-7 答复集合闭合

对一个信封，中心的答复**恰为下列三类之一**，没有第四类、没有「其他」：

```text
客户端一面的答复  ≝  四种入口答复之一（S-6）
                  |  路由结果：成功   —— { result: <被投影操作的成功返回> }
                  |  路由结果：具名失败 —— { failure: <被投影操作失败集合里的一个具名值> }
```

对[公开体检的请求](#s-18-公开体检)，答复恰为公开体检答复，别无他物。
路由结果里的具名失败值**原样透传**领域契约的名字（[S-14](#s-14-失败映射)），全集在 Schema 的 `RouteFailure` 里枚举、封闭；
`failure` 沿用 `data.identity-values` v1 结果包装的既有写法；`result` 里的形状由 [S-17](#s-17-路由表封闭每条路由的九件事从哪读) 的成员名规则决定。

### S-8 协议版本与跨版本不变的两样

- **哪些 `protocolVersion` 算对得上，是具名参数 `accepted_protocol_versions`**：一个非空的版本集合。**本契约不填值**；取值与「哪些版本算对得上」归技术设计（[§6.16](../../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说)）。
  它随中心的构建定下，运行期间不变；**没有它，中心不起来**（缺即启动失败，不取任何默认集合）。
- **跨所有协议版本不变的，恰有两样**：
  1. [公开体检](#s-18-公开体检)的请求形状与答复形状；
  2. `version-mismatch` 这个答复的形状与字节序列。
  理由：版本对不上的客户端正要靠这两样看见「对不上的是哪一版」「连的还是不是原来那个中心」
  （[§6.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)）。后续任何版本**不得改动这两样**，只能在它们之外演化。
- **这两样在传输上也跨版本稳定**：无论传输绑定怎样定、怎样演化（[G-10](#十三已知缺口)），**客户端认出「这是 `version-mismatch`」的办法**与**发出公开体检请求的办法**（落到传输上的路径、状态码、帧等一切细节）必须跨协议版本不变。
  只把信封与答复的形状钉住而让它们的传输落地随版本变，版本对不上的客户端照样认不出对不上。

### S-9 列表句柄

**列表句柄**（无词条，成员 `loginStateHandle`）是[登录状态列表](#s-20-登录状态的两条路由撤销列出)与[撤销](#s-20-登录状态的两条路由撤销列出)在线上指认某一个登录状态用的值。
**它就是那个登录状态的 [`LoginStateId`](../../../data/identity-values/v1/contract.md#s-9-loginstateid)**，入口层不另派生任何东西。

| 性质 | 内容 | 由谁保证 |
|---|---|---|
| 就是 `LoginStateId` | 列表里每一项的句柄、登录成功答复里的句柄，都是 AI 给出的那个 `LoginStateId` 原值；入口层不改写、不另算 | 本契约 |
| 不是出示物、得不到出示物 | `LoginStateId` 是出示物的不可逆形式；拿它当出示物，AI S-44 答 `login-state-rejected`（[S-11](#s-11-认人)） | [AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 的派生规则 |
| 不是秘密 | 可以出现在答复里与工程记录里 | 同上：本版登录状态的安全性在出示物的熵上，不在 `LoginStateId`（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「出示物猜不中」行） |
| 部署内唯一 | 两个登录状态不会有同一个句柄，所以按句柄撤销不会多撤 | AI S-45（由存储的唯一约束兑现）；`data.identity-values` v1 [`#S-9`](../../../data/identity-values/v1/contract.md#s-9-loginstateid) |
| 跨重启、升级、换密钥稳定 | 同一个登录状态的句柄在重启、升级、更换[部署密钥](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-deployment-key--部署密钥--deployment-key)之后**不变**——换密钥[什么都不该丢](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署密钥) | AI S-45 的派生式：确定、不加盐、**不以任何密钥为键**，且 `LoginStateId` 写进登录状态记录、跟着数据走 |
| 交换表示 | `data.identity-values` v1 的 `LoginStateId`（[`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)）；比较逐码点，不做规范化。**消费者不得解析它**——它恰是 64 个十六进制字符这件事只让 AI 的派生可复现，不是给线上读的结构。入口层判撤销载荷里的句柄也只用 IV S-31，**不收紧到 64 个十六进制字符**，与 AI S-45 对 AI S-16／AI S-17／AI S-37 表示层的要求同一条词法 | IV；AI S-45 |

**客户端须把句柄与出示物一起保存**：两样只在登录成功时一并交出（[S-19](#s-19-免认人的两条路由注册登录)），此后客户端据句柄在列表里认出自己那一项、用它退出；
线上没有「凭出示物换句柄」的路由，客户端也**不自行按派生式去算**——派生规则只归 AI S-45 一处。
**为什么列表可以直接给 `LoginStateId`**：[登录状态](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)按持有者认，持有的是出示物；
列表里的 `LoginStateId` 过不了 AI S-44，同一账号的一台设备列一次，**拿不走**其余设备能用的东西（[§8 不交出能直接用的凭证](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)；[AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态)：列出的 `LoginStateId` 不是出示物）。

## 三、判定次序

### S-10 判定次序

**一个请求到达中心，恰按下面的次序走；任何一步判不了，就停在那一步答 `unavailable`，不再往下，永不改说成 `login-state-rejected`。
不用查就判得了的，照判。**
这是[产品写死的先后](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)与[认出一个来者只有一条路](../../../../product/PF-017-governance-center-as-deployable-application/design.md#53-认出一个来者只有一条路)在线上的落点；来者一侧看到的流程见 [flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来)。

| 步 | 做什么 | 要查吗 | 这一步的出口 |
|---|---|---|---|
| **0 公开体检** | 请求是[公开体检的形状](#s-18-公开体检) ⇒ 直接答公开体检 | 不查 | 公开体检答复。**不看版本，不看出示物，不读存储** |
| **① 版本** | 信封不可解析、缺 `protocolVersion`、它出现不止一次（[S-4](#s-4-请求信封)）、或它不在 `accepted_protocol_versions` 内 | 不查 | `version-mismatch`。**出示物一眼都不看** |
| **①′ 信封** | `operation` 缺席、出现不止一次或不在路由表内，或信封有表外成员。（`payload` 缺席、出现不止一次或不是对象不在这一步，属于下面的「载荷」） | 不查 | `invalid-input` |
| 免认人的路由（[S-19](#s-19-免认人的两条路由注册登录)） | 载荷表示层校验 ⇒ 直接到第 ③ 步。**出示物不看**（带了也不看，既不因它放行，也不因它拒绝） | 不查 | `invalid-input` |
| **② 认人**（[S-11](#s-11-认人)） | 其余路由 | 视情形 | 通过 ⇒ 下一步；`login-state-rejected`；`unavailable` |
| **载荷** | 载荷表示层校验——**认出人之后才看输入** | 不查 | `invalid-input` |
| **身份推导**（[S-12](#s-12-身份推导)） | 交给领域操作的身份值从认人结果推出 | 要查的路由才查 | 下一步；`login-state-rejected`；`unavailable` |
| **补授权**（[S-13](#s-13-补授权)） | 只对四条读路由 | 查 | 下一步；路由结果 `notAuthorized`；`unavailable` |
| **③ 办事**（[S-14](#s-14-失败映射)） | 调被投影的那一个领域操作，映射它的答复 | 领域自己查 | 路由结果；`unavailable`；`invalid-input`；`login-state-rejected` |

**由这张表直接推出、且都是本意的三条**（[PF-017 §6.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)、[§6.5](../../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说)）：

1. 判不了的时候，**什么都没带**的来者仍得到 `login-state-rejected`（不用查）；他去登录，登录要查，得到 `unavailable`。
2. 同一份格式不对的载荷，配有效的登录状态得 `invalid-input`，配已撤销的得 `login-state-rejected`，配存储此刻读不到时的任何要查的出示物得 `unavailable`。
3. 注册与登录的载荷不合格，存储此刻读不到也照样得 `invalid-input`。

**「看不懂的请求」答 `version-mismatch`，不答 `invalid-input`**：信封都解析不出来的请求，中心不知道它是哪一版、要办哪件事，
[它不会试着把一个看不懂的请求猜着办了](../../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说)。
`invalid-input` 在「看得懂是哪一版，但信封不合格（`operation` 缺席、出现不止一次或不在路由表内，或有表外成员），或那件事的输入（`payload`）在表示层就不合格」时给出——与 [S-6](#s-6-四种入口答复) 那一格同一句。

**「输入」指载荷，信封不是输入；信封不合格在认人之前拒绝。**[§6.4 ④](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)说「要登录状态的事，认出人之后才看输入」，
那里的「输入」是**那件事本身的输入**，在线上就是 `payload`；`operation` 与表外成员是**信封**的事——不知道要办哪件事，就谈不上「那件事的输入」，
所以 ①′ 排在认人之前、答 `invalid-input`，与 ④ 不冲突。这一读法是产品负责人 2026-09-23 的裁定（[PF-017 INT-013](../../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-23-rulings.md#int-013)：认人之前拒绝）。

### S-11 认人

第 ② 步只看两件事：**是不是本中心签发的**、**此刻是否仍有效**（[§6.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)）。
它是[认出一个来者的那一条路](../../../../product/PF-017-governance-center-as-deployable-application/design.md#53-认出一个来者只有一条路)，对应 [flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来) 里中心那一侧。

| 出示物的情形 | 要查吗 | 答复 |
|---|---|---|
| 没带 | 不查 | `login-state-rejected` |
| 带了不止一个 | 不查 | `login-state-rejected` |
| 表示层不合格 | 不查 | `login-state-rejected`（[S-5](#s-5-出示物)） |
| 恰一个、形状合格 | 现读 [`capability.account-identity/v2#S-44`](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（按出示物换取身份），输入就是出示物 | 见下 |

| [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 的出口 | 本步的收场 |
|---|---|
| `{LoginStateId, AccountId}` | **认出了人**，带着这两个值往下走（[S-12](#s-12-身份推导)：认人所得 `LoginStateId`、认人所得 `AccountId`） |
| `login-state-rejected`（查不到、已撤销、所属账号未激活——**从没签发过、已退出或撤销、别的中心签的**，以及**拿一个 `LoginStateId`（例如列表里的一项）当出示物**，都落在这里） | `login-state-rejected` |
| `invalid-input` | `login-state-rejected`。**本版到不了**：入口层判出示物的表示层用的就是 AI S-44 的那一条（[AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 的交换表示）；前提一旦不成立，收场已经写在这里——出示物是身份，不是输入 |
| `storage-unavailable` | `unavailable` |
| 失败集合之外的任何东西（未列出的值、返回了却没有值、抛出——「一直不返回」不在这一行，归 [S-32](#s-32-进展性质与前提) 的进展前提，本契约不设超时） | `unavailable`，**并记为缺陷**（[S-14](#s-14-失败映射)） |

**认人只走 AI S-44**：本组合从不以线上收到的任何 `LoginStateId` 调 [AI S-17](../../../capabilities/account-identity/v2/contract.md#s-17-校验登录状态) 来认人——那是 AI 只对进程内开放的面（[AI S-30](../../../capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) 的「只有 S-44 认出示物」行）。

**六种不认的情形——没带、带了不止一个、表示层不合格、从没签发过、已退出或撤销、别的中心签的——在版本对得上、判得了时，整个线上答复逐字相同**（[§6.5](../../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说)）。
从中心的任何拒绝里，读不出一个名字存不存在，也读不出一个登录状态曾经有没有过。
「别的中心签的」在本中心看来就是「查不到」，本中心不去、也无从分辨它是别处签发的还是从没存在过。

**认人时没有第四个出口**：「客户端已经验过了」「刚才还有效」「这台机器可信」「运维者说放行」都不是本步的输入，信封里也没有能承载它们的成员（[§6.2](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)）。

### S-12 身份推导

**交给领域操作的每一个身份值，都只从认人的结果推出；线上载荷里的身份值从不作授权依据。**

| 交给领域的身份值 | 从哪来 | 读不到／读到不作数时 |
|---|---|---|
| 调用方的 `AccountId`——下文称**认人所得 `AccountId`** | 第 ② 步 [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 给出的那一个 | —（已在第 ② 步定下） |
| 出示物所属那个登录状态的 `LoginStateId`——下文称**认人所得 `LoginStateId`** | 同上，AI S-44 一并给出 | —（已在第 ② 步定下） |
| 行事的 `TenantId`（发起者、调用方、接受者 `TenantId`）——下文称**推导所得 `TenantId`** | 现读 [OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)，参数是认人所得 `LoginStateId`——即登录状态上[当前选中的租户身份](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)（[PF-001 §4 当前租户身份](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)） | `unavailable` ⇒ `unavailable`；`loginStateNotValid` ⇒ `login-state-rejected`（其间被撤销，见 [S-33](#s-33-认出人之后登录状态被撤销)）；`invalidInput` 本版到不了，出现即 `unavailable` 并记为缺陷；返回的 `TenantId` 的 `account` 分量不等于认人所得 `AccountId` ⇒ `unavailable` 并记为缺陷（[S-14](#s-14-失败映射) 的矛盾清单）；**失败集合之外的任何东西（未列出的值、没有返回、抛出）⇒ `unavailable`，并记为缺陷** |
| 被传给领域的 `LoginStateId`（[OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)、[OG S-37](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份)、[AI S-16](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态)、[AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) 四条路由的发起方、调用方） | 认人所得 `LoginStateId`。**出示物本身从不交给领域**：收出示物的面只有 AI S-44 | — |

- **推导发生在请求到达的那一刻，每个请求推一次，随请求交下去**；领域操作不在使用点重取当前租户身份
  （[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`#S-28`](../../../data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)）。
  **请求到达就是流程开始**，所以在这里取一次当前租户身份不是「在使用点现取」。
- **只有需要行事 `TenantId` 的路由才现读 [OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)**（逐条见路由表）；只需要 `AccountId` 的路由不读它。
- **载荷里出现的身份值只作「对象」**（邀请谁、切到哪个租户身份、读哪个组织），由领域操作自己判它能不能被这样用；
  **载荷里没有「以谁的身份」这一格**——发起者、调用方、接受者的身份一律推导，不收（[PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)：跨范围操作显式携带的租户身份须有所有权或成员资格依据）。
- **载荷里的 `TenantId` 与 `ScopeLayerIdentity` 按 [`data.identity-values/v1#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式) 的规范形式原样传**：
  带判别式、两个分量，**不压平成两个可空字段**（[`#S-16`](../../../data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)），入口层不改写、不补齐。
- **请求显式携带一个「以哪个租户身份行事」、而它与当前选中的不一致时怎么答，本版不定**（[G-2](#十三已知缺口)）。
  本版的信封与载荷**没有**这一格；带了就是表外成员，按 [S-10](#s-10-判定次序) 答 `invalid-input`——**这是表示层的收场，不是对 G-2 的回答**。

> **已知后果，照实写**：同一个登录状态被同一台机器上的两个客户端进程共用、其间一个切换了当前租户身份，
> 另一个进程随后的请求会以**切换之后**的那个租户身份行事，哪怕它屏上显示的还是切换之前的。
> 这是「以登录状态上当前选中的租户身份行事」的直接后果；要消除它，得先闭合 [G-2](#十三已知缺口)。

### S-13 补授权

四条被投影的读操作在能力契约里**没有授权前置**（[`capability.organization-governance/v1#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 9 行）。
上线之前，本组合给它们补一道：**调用方在该组织里有效。**

**这是本契约按隔离原则给四条读面加的前置**，依据是 [PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)：
没有明确所有权或成员资格依据时，跨租户访问默认拒绝。一个组织的类型、它的上级链、别人在它里面的成员资格效力，都不向与那个组织无关的人开放。
产品负责人 2026-09-23 裁定这是隔离原则的自然延伸，由架构与规格设计自定、不需要产品另提需求（[PF-017 INT-014](../../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-23-rulings.md#int-014)）。

| 路由 | 「该组织」是哪个 | 补的那一道 |
|---|---|---|
| [`#S-22`](../../../capabilities/organization-governance/v1/contract.md#s-22-读组织) 读组织 | 载荷里的那个 `OrganizationId` | 现读 [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)`((该组织, 认人所得 AccountId))` |
| [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 成员资格判定 | 载荷里那个 `TenantId` 的组织分量 | 同上 |
| [`#S-34`](../../../capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) 上级链／有共同上级 | 载荷里的**每一个** `OrganizationId`（一个或两个） | 对每一个都现读，**全部读完、不短路**；按下表合成 |
| [`#S-35`](../../../capabilities/organization-governance/v1/contract.md#s-35-层身份) 层身份 | 载荷里那个 `TenantId` 的组织分量 | 同上 |

| 那次现读的结果（多个组织时全部读完，按本表行序取第一条成立的） | 收场 |
|---|---|
| 任一次得到失败集合之外的东西，或 `invalidInput`（补授权是入口层自己发起的现读，交进去的组织已按 IV 的形状核过；领域仍判它不合形状，是两边的形状规则不一致，错不在来者） | `unavailable`，**并记为缺陷**（[S-14](#s-14-失败映射)） |
| 任一次 `{ failure: "unavailable" }` | `unavailable`——**不得收成 `notAuthorized`**，那是把判不了说成失权；**哪怕另一个组织已经读出 `ineffective`** |
| 任一次 `ineffective` | 路由结果 `{ failure: "notAuthorized" }`，**不调**被投影的操作。产品反馈是[「你不在这个组织里」](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常) |
| 每一次都 `effective`（任一角色） | 过，往下调被投影的操作 |

**为什么不短路**：先读到 `ineffective` 就停，答复就取决于读的先后——同一个请求，两个组织换个次序，一次得 `notAuthorized`、一次得 `unavailable`。全部读完再合成，答复只取决于各次读数，「判不了优先于无效」在补授权里同样成立。

- 「调用方」是认人所得 `AccountId`；**不是**当前租户身份——读一个组织不需要先切过去。
- 因为补授权排在前面，**一个不存在的组织在线上得到的是 `notAuthorized`**（没有人在不存在的组织里有效），
  `organizationDoesNotExist` 在这两条路由上到不了；这不泄漏任何组织的存在性。
- 本组合给 [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 路由补的这一道，使一个人**问自己在一个他不在的组织里的效力**得到 `notAuthorized` 而不是 `ineffective`。这是这一道补授权的直接后果。
- [`#S-27`](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) 与 [`#S-57`](../../../capabilities/organization-governance/v1/contract.md#s-57-列出账号收到的待接受邀请) 不在此列：它们以「输入的 `AccountId` 就是调用者本人」为界，本组合交给它们的正是认人所得 `AccountId`。

### S-14 失败映射

**第 ③ 步的共同映射**，每条路由照此办，路由表只写例外：

| 领域给出的 | 线上答复 |
|---|---|
| 成功返回（该条款 ⑤），且合本契约 Schema 的 `Result_<路由>` | `{ result: … }` |
| AI 的 `storage-unavailable`；OG 的 `unavailable`（[三类收场之一](../../../capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案)）；`MembershipStandingResult` 的 `{ failure: "unavailable" }` | `unavailable` |
| 表示层不合格：AI 的 `invalid-input`、OG 的 `invalidInput`（[同上](../../../capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案)）——**这一次请求实际交给领域的输入里有来自载荷的项** | `invalid-input` |
| 同上——**这一次请求实际交给领域的输入里没有来自载荷的项**（交进去的全是入口层产出的值：认人所得 `AccountId`、认人所得 `LoginStateId`、推导所得 `TenantId`） | `unavailable`，**并记为缺陷**：入口层自己产出的值被领域判为不合形状，错不在来者 |
| **「出示的那个登录状态此刻不作数」**：[AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) 的 `login-state-rejected`、[AI S-16](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 的 `not-authorized`、[OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)／[OG S-37](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份) 的 `loginStateNotValid` | `login-state-rejected`（[S-33](#s-33-认出人之后登录状态被撤销)） |
| **在本组合里结构上到不了的具名值**：AR 的 `identifier-held-by-expired-record`（[S-19](#s-19-免认人的两条路由注册登录)）；[OG S-21](../../../capabilities/organization-governance/v1/contract.md#s-21-创建团队组织)、[OG S-25](../../../capabilities/organization-governance/v1/contract.md#s-25-接受邀请) 就**调用方本人**给出的 `accountNotActivated`、`accountDoesNotExist`——认人所得 `AccountId` 必属一个已激活账号（[AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 对未激活账号答 `login-state-rejected`），而[已激活不回退、不消失](../../../capabilities/account-identity/v2/contract.md#s-20-已激活不回退不消失) | `unavailable`，**并记为缺陷**。与空列表同一口径 |
| 该条款失败集合里的其余具名值 | `{ failure: <原名> }`，**原样透传**，不改名、不合并、不加原因 |
| **失败集合之外的任何东西**（未列出的值、返回了却没有值、抛出；「一直不返回」归 [S-32](#s-32-进展性质与前提) 的进展前提） | `unavailable`，**并记为缺陷** |
| **与该条款承诺矛盾的返回——封闭清单，恰下列三样，此外不检**：① 成功返回不合本契约 Schema 的 `Result_<路由>`；② [OG S-27](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) 或 [AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) 返回空列表；③ [OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 返回的 `TenantId` 的 `account` 分量不等于认人所得 `AccountId`（[S-12](#s-12-身份推导)） | `unavailable`，**并记为缺陷** |

**「记为缺陷」**的全部情形就是：[S-11](#s-11-认人) 出口表里「失败集合之外」那一行、[S-12](#s-12-身份推导) 推导所得 `TenantId` 那一行写「记为缺陷」的各支、[S-13](#s-13-补授权) 合成表的第一行、上表标了它的四行，以及 [S-19](#s-19-免认人的两条路由注册登录)～[S-23](#s-23-当前租户身份的两条路由) 各表里写「缺陷」的格；它们计入[完整体检](#s-26-完整体检)的 `defectCount`，细节只在[工程记录](#s-30-工程记录)里。

- **缺陷答 `unavailable`**，不答 `login-state-rejected`（人会白白重新登录），也不答成功（在出错的地方给出看起来对的答案；[§6.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)「答不出」含中心自身的故障）。
  代价照实写：人被叫「稍后再试」，而缺陷不会自己好，要等运维者处理（[§6.6](../../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）。
- **「出示的登录状态不作数」为什么不原样透传**：那三个值只可能出自第 ② 步之后、第 ③ 步读到之前的一次撤销。
  透传出去，同一个「已撤销」就有了两种线上答复，[S-11](#s-11-认人) 的逐字相同在这个窗口里被打破。
- **结果为什么是封闭的**：路由结果的具名值全集就是各被投影条款失败集合的并，减去上表映射掉的那些；Schema 的 `RouteFailure` 把它枚举出来，没有「其他」。

### S-15 δ = 0：每个请求现读，入口不跨请求缓存

- **每个请求都现读**：第 ② 步现读 [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)，身份推导现读 [OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)，补授权现读 [OG S-26](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)；领域操作按各自契约现读成员资格与角色。
  这就是[只信此刻仍有效的](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)在中心一侧的样子。
- **入口层不跨请求缓存任何认人结果、授权判定、推导出的身份或成员资格效力**——一条都不缓存。
  撤销、退出、解除、降级、切换在提交之后，**下一个到达中心的请求**就看得到（[`data.identity-values/v1#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)、[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）。
- **这是中心一侧的承诺。**据点上的副本与它们的陈旧窗口归 PF-016（[§5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧) 的分界；[§6.9](../../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行) 的三类现读由据点放行、本契约只保证中心此刻的答案是现读的；[§6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)：撤销在一台机器上生效的时刻，是它再连上中心的那一刻）。
- **将来要缓存，须发新版本**，并在其中写明失效条件与最大陈旧窗口；读面以「不可用」失败时不写入缓存。

### S-16 不记住来访，不区别对待来者

- **中心不因一次来访改变此后的任何判定**，也不登记来者是哪台机器、哪个程序（[flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来)）。入口层没有任何按来者保存的状态。
- **对端地址、机器、客户端程序一律不作资格**，不进任何判定（[`data.identity-values/v1#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)、[§6.2](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)）。
  同一个有效登录状态、同一件事，从哪里来都得到同一个答复；人用的那份客户端与一段脚本走同一条路（[PF-016 §6.5](../../../../product/PF-016-cli-tui-delivery-surface/design.md#65-人能做的脚本能做脚本能做的人能做)）。
- **中心上不存在「可信机器」「可信程序」的登记，也不存在接受外部担保的成员。**

## 四、路由表

### S-17 路由表封闭；每条路由的九件事从哪读

**路由表是一张封闭的、逐条写明的映射**：每条路由对应一个被投影的操作，**没有泛化的分派**
（没有「按名字调用某个能力的某个操作」这种路由；[§5.1](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)：客户端那一面只有这些门）。表外的 `operation` ⇒ `invalid-input`（[S-10](#s-10-判定次序) ①′）。

**路由标识**：被投影条款的坐标，写成 `<contract_id>/v<version>#S-n`；本契约自有的公开体检是
`composition.governance-center-entry/v1#S-18`。

**每条路由的九件事**按下表合成：「共同」一栏对每条路由都成立，路由表那一行只写这条路由自己的那几格。

| 九件事 | 共同 | 路由表那一行给什么 |
|---|---|---|
| **1 输入与授权** | 信封（[S-4](#s-4-请求信封)）。授权 = 判定次序的各关（[S-10](#s-10-判定次序)）＋ 被投影条款自己的授权前置 | 经不经第 ② 步；身份怎么推；补什么授权；载荷携带被投影条款 ① 的哪几项 |
| **2 前置** | 版本对得上、信封合格；经 ② 的路由认出了人；载荷合格；推导与补授权都过 | —（被投影条款的前置照原样） |
| **3 提交点与原子性** | **入口层不提交任何东西**。路由的提交点就是被投影条款 ④ 的那一次单次提交；入口层的现读都是纯读 | 有多于一步领域调用的路由写明哪一步提交 |
| **4 返回与失败集合** | 成功 ⇒ `{ result: 被投影条款 ⑤ }`；失败 ⇒ 按 [S-14](#s-14-失败映射)。这条路由可达的入口答复：不经 ② 的路由不会得到 `login-state-rejected` | 透传的具名值（被投影条款 ⑥ 减去映射掉的）；例外 |
| **5 幂等边界与重发** | 入口层不加任何幂等机制；幂等与重复照被投影条款 ⑦。**答复丢了、客户端重发，就是再发一次请求**，得到的是它在那一刻的答案 | 重发时可观察到什么 |
| **6 事件** | **入口层不发、不订阅、不转发任何事件**；领域的通知事件不上线 | — |
| **7 缺席时的默认答案** | 出示物缺席 ⇒ `login-state-rejected`（经 ② 的路由；[`data.identity-values/v1#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝)）；**载荷里的身份值缺席 ⇒ `invalid-input`，不从任何地方补**；被投影条款写明「缺席取默认」的非身份项（时长、指定角色、过滤开关、创建键）缺席时**原样作缺席交下去**，由领域取它自己的默认，入口层不替它填 | — |
| **8 在途归属** | 入口层没有按请求保存的状态。领域操作按它自己那一次提交收场；答复没送达时，事实要么已提交、要么没发生（[§6.8](../../../../product/PF-017-governance-center-as-deployable-application/design.md#68-停机已确认的都在没确认的等于没发生)）；其间的撤销见 [S-33](#s-33-认出人之后登录状态被撤销) | 多步路由写明中途失败留下什么 |
| **9 装配给／协议给** | [S-36](#s-36-装配给的保证-vs-协议须给的保证) 里**每条路由都读**的四行：「读不到即明确失败」「表示层校验与判定分开」「起来即整体」「中心一侧 δ = 0 只是中心一侧」；**经 ② 的路由另读**六行：「跨边界须重新验证」「只有 AI S-44 认出示物」「出示物猜不中」「判定依据不含物理位置」「每道准入现读」「六条路径同一判定；不得冒充隔离」 | 「第 9 件事」一列：这条路由**另外**读 S-36 的哪几行 |

**线上形状归本契约**：三份参与契约 v1 不发布 Schema，**27 条路由的载荷与成功返回的线上形状由本契约定义**；
成员名从各条款 ①／⑤ 的散文措辞推出，列在下面的命名表里，Schema 里每条路由各一个 `Payload_<路由>` 与 `Result_<路由>`，成员封闭。
身份值一律按 `data.identity-values` v1 的规范形式、引用它的 Schema；邀约的两个时刻与派生状态引用 `data.offer-expiry` v1 的 Schema。
**载荷里没有「以谁的身份」这一格**（[S-12](#s-12-身份推导)）：下表「推导」一栏的身份值不在载荷里。
这张表的成员名是本契约**首次命名**，2026-09-23 已由主线认可进命名账本（[G-9](#十三已知缺口) 已闭合）；此后任何改名都是本契约的语义变更。

#### 命名原则

- camelCase。**标识按它指认的东西取名，不带 `Id` 后缀**，与 `TenantId` 的两个分量 `organization`／`account` 同式：`organization`、`tenant`、`invitation`、`affiliationRequest`。
- **同一个概念跨路由同名**：发起方组织一律 `issuerOrganization`（与 `issuerIsPersonalOrganization` 同词）；被邀请的账号一律 `invitedAccount`（与 `notTheInvitedAccount` 同词）；接收方组织 `recipientOrganization`；角色一律 `role`（与 `MembershipStanding` 的 `role` 同）；这一份的有效时长 `offerTtl`（`data.offer-expiry` v1 的 `offer_ttl`，与部署参数 `…TtlDefault` 同式）；过滤开关 `includeConcluded`（与 `alreadyConcluded` 同词）、`includeIneffective`（与 `ineffective` 同词）。
- **已有账本名不另起**：`loginState`、`loginStateHandle`、`issuedAt`；值类型沿用它在 `data.identity-values`／`data.offer-expiry` 里的名字：`organizationKind`、`offerTiming`、`offerState`。
- **⑤ 是一个值就直接给那个值**，不包一层对象；⑤ 是 `ok` 就是字符串 `"ok"`。**可选项缺席就是不出现**，不写 `null`。

#### 路由的线上成员（命名表）

「IV」= `data.identity-values` v1 的 Schema 定义，「OE」= `data.offer-expiry` v1 的；`?` = 可选（缺席时原样作缺席交给领域，[S-17](#s-17-路由表封闭每条路由的九件事从哪读) 第 7 件事）。

| 路由 | 载荷成员 · 类型 · ← 参与条款 ① 的哪一项 | 推导（不在载荷里） | 成功返回 · ← ⑤ |
|---|---|---|---|
| 注册 `composition.account-registration/v1#S-8` | `loginIdentifier` · IV `LoginIdentifier` ← 登录标识；`credential` · 非空字符串（内部格式见下注 1） ← 凭据材料 | — | `"registered"` ← `registered`（[AR S-4](../../account-registration/v1/contract.md#s-4-注册成功)、[AR S-5](../../account-registration/v1/contract.md#s-5-终结结果集合)） |
| 登录 `capability.account-identity/v2#S-15` | `loginIdentifier`、`credential`，同上 ← ① 登录标识、凭据材料 | — | `{ loginState, loginStateHandle }` ← `{出示物, LoginStateId}`（句柄就是 LoginStateId，[S-9](#s-9-列表句柄)） |
| 撤销 `capability.account-identity/v2#S-16` | `loginStateHandle` · IV `LoginStateId` ← 目标 LoginStateId（[S-20](#s-20-登录状态的两条路由撤销列出)） | 认人所得 LoginStateId（发起方） | `"ok"` ← `ok` |
| 列出 `capability.account-identity/v2#S-37` | 无 | 认人所得 LoginStateId | `[{ loginStateHandle, issuedAt }]`，至少一项 ← 每项的 LoginStateId、签发时间（OE `Instant`） |
| `capability.organization-governance/v1#S-21` | `creationKey?` · `CreationKey` ← 创建键 | 认人所得 AccountId（创建者） | IV `OrganizationId` ← `OrganizationId` |
| `capability.organization-governance/v1#S-22` | `organization` · IV `OrganizationId` ← `OrganizationId` | — | `{ organization, organizationKind, parentOrganization? }` ← `{ OrganizationId, OrganizationKind, 上级组织（有或无） }` |
| `capability.organization-governance/v1#S-23` | `invitedAccount` · IV `AccountId` ← 目标 AccountId；`role?` · IV `TenantRole` ← 指定角色；`offerTtl?` · 整数毫秒 ← 这一份的有效时长 | 推导所得 TenantId（发起者） | `InvitationId` ← `InvitationId` |
| `capability.organization-governance/v1#S-24` | `invitation` · `InvitationId` ← `InvitationId` | 推导所得 TenantId（发起者） | `"ok"` |
| `capability.organization-governance/v1#S-25` | `invitation` ← `InvitationId` | 认人所得 AccountId（接受者） | IV `TenantId` ← `TenantId` |
| `capability.organization-governance/v1#S-26` | `tenant` · IV `TenantId` ← `TenantId` | — | IV `MembershipStanding` ← 一个 `MembershipStanding` |
| `capability.organization-governance/v1#S-27` | 无 | 认人所得 AccountId | `[TenantId]`，至少一项 ← `TenantId` 列表 |
| `capability.organization-governance/v1#S-28` | `targetTenant` · IV `TenantId` ← 目标 TenantId；`role` · IV `TenantRole` ← 目标角色 | 推导所得 TenantId（发起者） | `"ok"` |
| `capability.organization-governance/v1#S-29` | `targetTenant` ← 目标 TenantId | 推导所得 TenantId（发起者） | `"ok"` |
| `capability.organization-governance/v1#S-30` | `recipientOrganization` · IV `OrganizationId` ← 接收方 OrganizationId；`direction` · `recipientAsParent`／`recipientAsChild` ← 方向；`offerTtl?` ← 这一份的有效时长 | 推导所得 TenantId（发起者） | `AffiliationRequestId` ← `AffiliationRequestId` |
| `capability.organization-governance/v1#S-31` | `affiliationRequest` · `AffiliationRequestId` ← `AffiliationRequestId` | 推导所得 TenantId（发起者） | `"ok"` |
| `capability.organization-governance/v1#S-32` | `affiliationRequest` ← `AffiliationRequestId` | 推导所得 TenantId（接受者） | `"ok"` |
| `capability.organization-governance/v1#S-33` | `childOrganization` · IV `OrganizationId` ← 被解除的那条隶属关系（下级 OrganizationId） | 推导所得 TenantId（发起者） | `"ok"` |
| `capability.organization-governance/v1#S-34` | `organizations` · 一或两个 IV `OrganizationId` ← 一个或两个 `OrganizationId` | — | 一个 ⇒ `[OrganizationId]`（上级链，不含自己）；两个 ⇒ 布尔（有共同上级） |
| `capability.organization-governance/v1#S-35` | `tenant` ← `TenantId` | — | `{ organizationLayer, tenantLayer }`，各一个 IV `ScopeLayerIdentity`（`layer` 分别是 `organization`／`tenant`）← 组织级、租户级 |
| `capability.organization-governance/v1#S-36` | 无 | 认人所得 LoginStateId | IV `TenantId` ← `TenantId` |
| `capability.organization-governance/v1#S-37` | `targetTenant` ← 目标 TenantId | 认人所得 LoginStateId | `"ok"` |
| `capability.organization-governance/v1#S-55` | `invitation` ← `InvitationId`；`callerIdentityKind` · `account`／`tenant` ← 调用方身份的判别式 | 按判别式取认人所得 AccountId 或推导所得 TenantId（调用方） | `InvitationView` ← ⑤ |
| `capability.organization-governance/v1#S-56` | `affiliationRequest` ← `AffiliationRequestId` | 推导所得 TenantId（调用方） | `AffiliationRequestView` ← ⑤ |
| `capability.organization-governance/v1#S-57` | `includeConcluded?` · 布尔 ← 「连已终结的一起要」 | 认人所得 AccountId | `[InvitationView]` ← 邀请列表 |
| `capability.organization-governance/v1#S-58` | `includeConcluded?` | 推导所得 TenantId（调用方） | `{ invitations: [InvitationView], affiliationRequests: [AffiliationRequestView] }` ← 两段 |
| `capability.organization-governance/v1#S-59` | `includeIneffective?` · 布尔 ← 「连无效的一起要」 | 推导所得 TenantId（调用方） | `[MemberView]` ← 成员关系记录列表 |
| `capability.organization-governance/v1#S-60` | `includeConcluded?` | 推导所得 TenantId（调用方） | `[IncomingAffiliationRequestView]` ← 收到的隶属请求列表 |

| 共用形状 | 成员 | ← 出处 |
|---|---|---|
| `OrganizationView` | `organization`、`organizationKind`（IV `OrganizationKind`）、`parentOrganization?` | [OG S-22](../../../capabilities/organization-governance/v1/contract.md#s-22-读组织) ⑤；「无上级」⇒ 成员不出现 |
| `InvitationView` | `invitation`、`issuerOrganization`、`invitedAccount`、`role`、`offerTiming`（OE `OfferTiming`）、`offerState`（OE `OfferState`） | [OG S-55](../../../capabilities/organization-governance/v1/contract.md#s-55-读邀请) ⑤ `{ InvitationId, 发出它的组织, 被邀请的账号, 指定的角色, OfferTiming, 派生状态 }` |
| `AffiliationRequestView` | `affiliationRequest`、`issuerOrganization`、`recipientOrganization`、`direction`、`offerTiming`、`offerState` | [OG S-56](../../../capabilities/organization-governance/v1/contract.md#s-56-读隶属请求) ⑤ `{ AffiliationRequestId, 发起方组织, 接收方组织, 方向, OfferTiming, 派生状态 }` |
| `IncomingAffiliationRequestView` | 同上，没有 `recipientOrganization` | [OG S-60](../../../capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求) ⑤（接收方就是调用方自己，那一条不列它） |
| `MemberView` | `tenant`、`role`、`effective`（布尔） | [OG S-59](../../../capabilities/organization-governance/v1/contract.md#s-59-列出组织成员) ⑤ `{ TenantId, 角色, 有效性 }`；`effective` 是记录此刻的有效性，**不是**一次 `MembershipStanding` 判定 |

**散文推不出、或靠推导补上的地方**，逐条写明，不自造语义：

1. **`credential` 在线上是一个非空字符串**（Schema `CredentialMaterial`）；它的**内部格式**归凭据方案的 owner——与 [AI S-26](../../../capabilities/account-identity/v2/contract.md#s-26-credential_policy) `credential_policy` 同一个 owner（[AI S-8](../../../capabilities/account-identity/v2/contract.md#s-8-凭据材料)：结构、强度规则与比对方式属实现选择）。
   入口层的表示层校验**用该 owner 给出的同一条解析规则**，解析不过 ⇒ `invalid-input`（[S-19](#s-19-免认人的两条路由注册登录)）。入口层不自定第二套，也不对它做 Schema 之外的收紧。
2. **首次命名的取值**：`direction` 的两个取值 `recipientAsParent`／`recipientAsChild`。[OG S-11](../../../capabilities/organization-governance/v1/contract.md#s-11-隶属请求) 与 [OG S-30](../../../capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) ① 只有「请对方作自己的上级／下级」的散文，没有取值名。
3. **表示上的推导**：
   - `InvitationId`、`AffiliationRequestId`、`CreationKey`（创建键）是**本契约自定的三个值定义**，形状按 [`data.identity-values/v1#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文（非空、首尾不得是那张表里的空白码点、逐码点相等）——OG 只说它们不透明；
   - `offerTtl` 取整数毫秒——与部署参数的两个默认时长同一概念、同一表示。**线上只约束「是整数，且不大于 2⁵³−1」**（上界是 JSON 数在各实现里都能精确表示的最大整数）：不合这一条是入口的 `invalid-input`；
     合这一条但非正，**或者大到加上发出时刻就越过领域或 OE 能表示的时刻**，一律原样交给领域，按 [OG S-23](../../../capabilities/organization-governance/v1/contract.md#s-23-发出邀请) 的「非正或不合形状」一支得 `invalidOfferDuration`。
     线上「不是整数」这一支到不了 OG——线上的形状归本契约（[S-17](#s-17-路由表封闭每条路由的九件事从哪读)），所以它是 `invalid-input`，不与 OG 的字面冲突；
   - [OG S-34](../../../capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) 的一个操作两种返回，按载荷里组织的个数区分。

**答复不带 `operation`**：只看一个答复判不出它属于哪条路由，所以 Schema 的 `RouteSuccess.result` 是 27 个 `Result_<路由>` 的并；
按路由的核对用 Schema 的 `Exchange`（把请求的 `operation` 与它的答复放在一起，线上没有这个对象）。

### S-18 公开体检

本契约自有的操作，路由标识 `composition.governance-center-entry/v1#S-18`。

| 九件事 | 内容 |
|---|---|
| **1 输入与授权** | 请求是一个对象，其 `operation` 成员等于上述路由标识；**其余成员一律忽略**——包括 `protocolVersion` 与出示物。**无授权**：任何够得到中心的人在登录之前就能读（[§6.17](../../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)） |
| **2 前置** | 中心在应答。**不受版本那一关挡，不看出示物，不读存储，不读钟** |
| **3 提交点与原子性** | 无。纯读，读的全是启动时已载入的常量 |
| **4 返回与失败集合** | `{ reachable: true, centerId: GovernanceCenterId, version }`，恰此三样。**失败集合为空**：中心在应答就答得出；中心不在应答时来者什么都得不到（那是「问不到」，不是一个答复） |
| **5 幂等边界与重发** | 纯读，任意重复。三样在一次运行期间不变 |
| **6 事件** | 无 |
| **7 缺席时的默认答案** | 不适用：本操作没有输入。**`reachable` 只说「中心在应答」**，不说此刻能不能答别的事；数据所在够不着、钟倒退、中心自身故障时照样答 `true`，标识与版本照样读得出（[§4 中心体检](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)） |
| **8 在途归属** | 无 |
| **9 装配给／协议给** | 请求与答复形状**跨协议版本不变**（[S-8](#s-8-协议版本与跨版本不变的两样)）；`centerId` 是启动时载入的那一个（[S-28](#s-28-铸造存放与不变)） |

**不含**任何治理事实（账号数、组织、谁登录着）与任何秘密的值。`version` 是中心所装版本的标识；它与 `accepted_protocol_versions` 的对应关系归技术设计。

### S-19 免认人的两条路由：注册、登录

这两条**不经第 ② 步**，出示物带了也不看（[§6.2 例外的边界](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)）。
注册不设任何门槛，靠的是[部署前提](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署前提)：够得到中心的就是组织里的人。

**两条路由的载荷表示层校验相同**：`loginIdentifier` 按 IV `LoginIdentifier` 的形状判；`credential` 须是非空字符串，并**用凭据方案 owner 给出的那一条解析规则**判——
那个 owner 与 [AI S-26](../../../capabilities/account-identity/v2/contract.md#s-26-credential_policy) `credential_policy` 是同一个，入口层不自定第二套。
**解析不过 ⇒ `invalid-input`，从不把解析不过的值交给领域**。解析只判「它是不是那个方案下的一份凭据材料」，不判它可不可接受——可接受与否是 `credential_policy` 的事，在注册里收成 `credential-rejected`。
**那条解析规则的发布处**是凭据方案 owner 的实现映射节点 [`realization/packages/tenancy/credential-verification`](../../../../realization/packages/tenancy/credential-verification/README.md)；据点侧的客户端代理据它得知 `credential` 该送什么。
**换凭据方案会移动线上 `invalid-input` 的边界，须发本契约的新版本**——不得只换那个节点而让本契约的线上答复悄悄变样。

| 路由 | 身份怎么推 | 载荷 | 返回与映射 | 重发 | 第 9 件事（另读 S-36 的） |
|---|---|---|---|---|---|
| **注册** `composition.account-registration/v1#S-8` | 无身份可推 | 登录标识、凭据材料。**表示层校验归本组合**（[AR S-2「注册入口」一行](../../account-registration/v1/contract.md#s-2-参与方与精确承诺)）：不合格 ⇒ `invalid-input`，**不交进去**（交进去的收场是 `interrupted`） | [四个终结结果](../../account-registration/v1/contract.md#s-5-终结结果集合)：`registered`（[注册成功](../../account-registration/v1/contract.md#s-4-注册成功)）⇒ `{ result: "registered" }`；`identifier-taken`／`credential-rejected`／`interrupted` ⇒ `{ failure: <原名> }`。**`interrupted` 原样呈现，不改写**——不改成成功、不改成 `identifier-taken`，**也不改成 `unavailable`**：它已经含着「底层不可用」那一支（[AR S-6](../../account-registration/v1/contract.md#s-6-每个终结结果的含义与对应的存储状态)），其产品措辞就是「这次没有注册成功」。`identifier-held-by-expired-record` **结构上到不了**本组合（它在注册组合内部就地消化）；出现即缺陷 | 按 [AR S-12](../../account-registration/v1/contract.md#s-12-重试规则)：同一标识、同一凭据重来，接着走完或得 `identifier-taken`（激活已提交而回执丢失时） | 「注册入口的义务」「`identifier-held-by-expired-record` 只流向注册组合」 |
| **登录** `capability.account-identity/v2#S-15` | 无身份可推 | 登录标识、凭据材料（表示层校验同上） | 成功 ⇒ `{ result: { loginState, loginStateHandle } }`：`loginState` 是 AI S-15 交出的**出示物（它在全部输出里唯一出现的一处）**，`loginStateHandle` 是同一个登录状态的 `LoginStateId`，即它的列表句柄——客户端据后者在列表里认出自己、用它退出（[S-9](#s-9-列表句柄)）。`identifier-or-credential-rejected` 原样透传：**三种登录失败逐字相同**（[AI S-15](../../../capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态)）。`invalid-input` ⇒ `invalid-input`；`storage-unavailable` ⇒ `unavailable` | **不幂等**：重发会签发另一个登录状态；多出来的那个在列表里看得见、撤得掉（[AI S-15 在途归属](../../../capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态)） | 「出示物只交到调用方手里」「出示物猜不中」（新签发的那一个就是此后的出示物）「登录状态的效力不变」 |

提交点：注册是[激活那一次提交](../../account-registration/v1/contract.md#s-8-三步次序与责任交接)；登录是登录状态记录写入的那一次提交。

### S-20 登录状态的两条路由：撤销、列出

两条都经第 ② 步；交给领域的发起方、调用方 `LoginStateId` 是认人所得 `LoginStateId`（[S-12](#s-12-身份推导)；[PF-001 §4 登录状态](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#登录状态)：一台机器上的一个登录状态可以被列出、被撤销）。

| 路由 | 身份怎么推 | 载荷 | 返回与映射 | 重发 | 第 9 件事（另读 S-36 的） |
|---|---|---|---|---|---|
| **撤销（含退出）** `capability.account-identity/v2#S-16` | 发起方 = 认人所得 `LoginStateId`；**目标 = 载荷里的 `loginStateHandle`**，即目标登录状态的 `LoginStateId`（[S-9](#s-9-列表句柄)），原样交给 [AI S-16](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态)——它只作对象，**从不作认人依据**。AI S-16 明写目标可以来自线上载荷，按来源读的只是发起方 | `loginStateHandle`（必需，无默认值——**缺席不是「退出自己」**；退出就是带上自己那一个的句柄） | 成功 `ok`，含 AI S-16「已撤销 ⇒ `ok`」那一支（目标已被撤掉、发起方仍有效时）。`login-state-not-found` **原样透传**——AI S-16 把「不存在」「不是你的」并成的那一个值，产品反馈是[「这个登录已经不在有效之列」](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)。`not-authorized` ⇒ `login-state-rejected`（发起方在认人之后被撤，[S-33](#s-33-认出人之后登录状态被撤销)）；`invalid-input` ⇒ `invalid-input`（交进去的输入里有来自载荷的目标，[S-14](#s-14-失败映射)）；`storage-unavailable` ⇒ `unavailable` | 撤销已提交、答复丢了之后重发：**撤的是别的那一个** ⇒ AI S-16 幂等 ⇒ `ok`；**撤的是自己（退出）** ⇒ 第 ② 步就 `login-state-rejected`。两者都是「已经撤掉了」的可观察形式 | 「撤销之后立刻生效」 |
| **列出** `capability.account-identity/v2#S-37` | 调用方 = 认人所得 `LoginStateId` | 无（空对象） | 成功 ⇒ `{ result: [ … ] }`，每一项恰为 `{ loginStateHandle, issuedAt }`：`loginStateHandle` 是那一项的 `LoginStateId`，`issuedAt` 是签发时间（OE `Instant`）。**不含出示物**（AI 本来就不给，[AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态)）。空列表 ⇒ 缺陷（成功调用必含调用方自己那一个）。`login-state-rejected` ⇒ `login-state-rejected`；`storage-unavailable` ⇒ `unavailable`；`invalid-input` ⇒ 缺陷 | 纯读 | 「撤销之后立刻生效」（列表里不再有已撤销的） |

撤销路由只有一次领域调用，提交点就是 [AI S-16](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 那一次提交；入口层不先读列表、不做任何匹配。

### S-21 组织治理：写路由

全部经第 ② 步。「认人所得 `AccountId`」「推导所得 `TenantId`」见 [S-12](#s-12-身份推导)。
提交点一律是被投影条款 ④ 的单次提交。
**第 9 件事**：全部写路由另读 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「调用方身份已经核实过——写操作」；以推导所得 `TenantId` 行事的另读「捕获的当前租户身份不被重算」「当前租户身份的可见性」。下表末列只写此外的行。

| 路由 `capability.organization-governance/v1#…` | 交给领域的身份 | 载荷（该条款 ① 的哪几项） | 透传的具名值 | 重发 | 第 9 件事（此外另读的） |
|---|---|---|---|---|---|
| [`S-21`](../../../capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) 创建团队组织 | 认人所得 `AccountId`（创建者） | 创建键（可选） | 无。`accountNotActivated`、`accountDoesNotExist` 在这里说的是调用方本人，**出现即缺陷**（[S-14](#s-14-失败映射)） | 带创建键 ⇒ 认回同一个组织；**不带 ⇒ 每次一个新组织**。客户端要安全重发，就带创建键 | — |
| [`S-23`](../../../capabilities/organization-governance/v1/contract.md#s-23-发出邀请) 发出邀请 | 推导所得 `TenantId`（发起者） | 目标 `AccountId`、指定角色（可选）、时长（可选） | `issuerIsPersonalOrganization`、`notAuthorized`、`accountNotActivated`、`accountDoesNotExist`（说的是被邀请者）、`alreadyAnEffectiveMember`、`invalidOfferDuration` | 不幂等：重发多一份邀请（该条款 ⑦：不制造新状态）。**时长是否为正由领域判**，`invalidOfferDuration` 原样透传；入口层对 `offerTtl` 只校验它是不大于 2⁵³−1 的整数（毫秒），不合 ⇒ `invalid-input` | 「持有 `AccountId` 即可读账号」（残余暴露）、「邀约过期的钟与存储同源」、「每一类的默认 `offer_ttl` 取值为正」、「运行中钟往回倒」 |
| [`S-24`](../../../capabilities/organization-governance/v1/contract.md#s-24-撤回邀请) 撤回邀请 | 推导所得 `TenantId`（发起者） | `InvitationId` | `invitationDoesNotExist`、`notAuthorized`、`alreadyConcluded` | 幂等：已撤回 ⇒ `ok` | 「成员资格的可见性」 |
| [`S-25`](../../../capabilities/organization-governance/v1/contract.md#s-25-接受邀请) 接受邀请 | 认人所得 `AccountId`（接受者） | `InvitationId` | `invitationDoesNotExist`、`offerNoLongerValid`、`notTheInvitedAccount`、`alreadyAnEffectiveMember`。`accountNotActivated`、`accountDoesNotExist` 说的是调用方本人，**出现即缺陷** | 已接受、答复丢了之后重发 ⇒ `offerNoLongerValid`；客户端据「我的租户」确认自己已在其中 | 「邀约过期的钟与存储同源」、「运行中钟往回倒」、「成员资格的可见性」 |
| [`S-28`](../../../capabilities/organization-governance/v1/contract.md#s-28-调整角色) 调整角色 | 推导所得 `TenantId`（发起者） | 目标 `TenantId`、目标角色 | `notAuthorized`、`membershipNotEffective`、`wouldLeaveNoSuperAdministrator` | 幂等 | 「成员资格的可见性」、「`TenantId` 的规范形式」 |
| [`S-29`](../../../capabilities/organization-governance/v1/contract.md#s-29-解除成员) 解除成员 | 推导所得 `TenantId`（发起者） | 目标 `TenantId` | `personalOrganizationMemberCannotLeave`、`notAuthorized`、`membershipNotEffective`、`wouldLeaveNoSuperAdministrator` | 已解除后重发 ⇒ `membershipNotEffective` | 「成员资格的可见性」、「`TenantId` 的规范形式」 |
| [`S-30`](../../../capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) 发出隶属请求 | 推导所得 `TenantId`（发起者） | 接收方 `OrganizationId`、方向、时长（可选） | `personalOrganizationTakesNoPartInAffiliation`、`notAuthorized`、`organizationDoesNotExist`、`wouldFormACycle`、`invalidOfferDuration` | 不幂等，同 [OG S-23](../../../capabilities/organization-governance/v1/contract.md#s-23-发出邀请) 一行 | 「邀约过期的钟与存储同源」、「每一类的默认 `offer_ttl` 取值为正」、「运行中钟往回倒」 |
| [`S-31`](../../../capabilities/organization-governance/v1/contract.md#s-31-撤回隶属请求) 撤回隶属请求 | 推导所得 `TenantId`（发起者） | `AffiliationRequestId` | `affiliationRequestDoesNotExist`、`notAuthorized`、`alreadyConcluded` | 幂等 | — |
| [`S-32`](../../../capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) 接受隶属请求 | 推导所得 `TenantId`（接受者） | `AffiliationRequestId` | `affiliationRequestDoesNotExist`、`offerNoLongerValid`、`notAuthorized`、`alreadyHasAParentOrganization`、`wouldFormACycle`、`personalOrganizationTakesNoPartInAffiliation` | 已接受后重发 ⇒ `offerNoLongerValid` | 「邀约过期的钟与存储同源」、「运行中钟往回倒」 |
| [`S-33`](../../../capabilities/organization-governance/v1/contract.md#s-33-解除隶属) 解除隶属 | 推导所得 `TenantId`（发起者） | 下级 `OrganizationId` | `noSuchAffiliation`、`notAuthorized` | 已解除后重发 ⇒ `noSuchAffiliation` | — |

**邀请的对象按 `AccountId` 指认**，不按登录标识——按登录标识指认被邀请者本版没有承载，见 [G-3](#十三已知缺口)。

### S-22 组织治理：读路由与补授权

全部经第 ② 步；标「补授权」的四条先过 [S-13](#s-13-补授权)。全部纯读，无提交；可任意重复。
**第 9 件事**：全部读路由另读 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「调用方身份——读面」；以推导所得 `TenantId` 行事的另读「捕获的当前租户身份不被重算」「当前租户身份的可见性」。下表末列只写此外的行。

| 路由 `capability.organization-governance/v1#…` | 交给领域的身份 | 补授权 | 载荷 | 透传的具名值与例外 | 第 9 件事（此外另读的） |
|---|---|---|---|---|---|
| [`S-22`](../../../capabilities/organization-governance/v1/contract.md#s-22-读组织) 读组织 | 无 | 有 | `OrganizationId` | `notAuthorized`（补授权给出）；`organizationDoesNotExist` 经补授权到不了 | 「成员资格的可见性」（补授权那次现读） |
| [`S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 成员资格判定 | 无 | 有 | `TenantId` | `notAuthorized`（补授权给出）。成功 ⇒ 一个 `MembershipStanding`；`{ failure: "unavailable" }` ⇒ `unavailable` | 「成员资格的可见性」、「`TenantId` 的规范形式」 |
| [`S-27`](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) 我的租户 | 认人所得 `AccountId` | 无 | 无 | 无具名值。`invalidInput` ⇒ 缺陷。**空列表 ⇒ 缺陷**：认得出的来者是已激活的账号，而已激活的账号[本版不可能一个有效租户都没有](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) | 「成员资格的可见性」、「`TenantId` 的规范形式」 |
| [`S-34`](../../../capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) 上级链／有共同上级 | 无 | 有（每一个组织，不短路） | 一个或两个 `OrganizationId` | `notAuthorized`（补授权给出）；`organizationDoesNotExist` 经补授权到不了 | 「成员资格的可见性」（补授权那次现读） |
| [`S-35`](../../../capabilities/organization-governance/v1/contract.md#s-35-层身份) 层身份 | 无 | 有 | `TenantId` | `notAuthorized`（补授权给出）。返回的两个 `ScopeLayerIdentity` 按 [`data.identity-values/v1#S-11`](../../../data/identity-values/v1/contract.md#s-11-scopelayeridentity) 带判别式原样给出 | 「归属层身份带判别式到达」、「`TenantId` 的规范形式」 |
| [`S-55`](../../../capabilities/organization-governance/v1/contract.md#s-55-读邀请) 读邀请 | 调用方身份按载荷里的判别式：`account` ⇒ 认人所得 `AccountId`；`tenant` ⇒ 推导所得 `TenantId` | 无 | `InvitationId`、调用方身份的判别式 `callerIdentityKind`（`account`／`tenant`，不含身份值本身） | `invitationDoesNotExist`。判别式缺席或不在集合内 ⇒ `invalid-input`，**入口层不替它猜是哪一支** | 「邀约过期的钟与存储同源」、「运行中钟往回倒」 |
| [`S-56`](../../../capabilities/organization-governance/v1/contract.md#s-56-读隶属请求) 读隶属请求 | 推导所得 `TenantId`（调用方） | 无 | `AffiliationRequestId` | `affiliationRequestDoesNotExist` | 同上 |
| [`S-57`](../../../capabilities/organization-governance/v1/contract.md#s-57-列出账号收到的待接受邀请) 列出账号收到的待接受邀请 | 认人所得 `AccountId` | 无 | 过滤开关（可选） | 无具名值 | 同上 |
| [`S-58`](../../../capabilities/organization-governance/v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 列出组织发出的邀请与隶属请求 | 推导所得 `TenantId`（调用方） | 无 | 过滤开关（可选） | `notAuthorized` | 同上 |
| [`S-59`](../../../capabilities/organization-governance/v1/contract.md#s-59-列出组织成员) 列出组织成员 | 推导所得 `TenantId`（调用方） | 无 | 过滤开关（可选） | `notAuthorized` | 「成员资格的可见性」 |
| [`S-60`](../../../capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求) 列出组织收到的隶属请求 | 推导所得 `TenantId`（调用方） | 无 | 过滤开关（可选） | `notAuthorized` | 「邀约过期的钟与存储同源」、「运行中钟往回倒」 |

**读成员名单、邀约、隶属请求时的组织是当前租户身份的那个组织**（[OG S-56](../../../capabilities/organization-governance/v1/contract.md#s-56-读隶属请求)、[OG S-58](../../../capabilities/organization-governance/v1/contract.md#s-58-列出组织发出的邀请与隶属请求)～[S-60](../../../capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求) 的调用方是推导所得 `TenantId`）；要读另一个组织的，先切过去。

### S-23 当前租户身份的两条路由

| 路由 `capability.organization-governance/v1#…` | 交给领域的身份 | 载荷 | 返回与映射 | 提交与重发 | 第 9 件事（另读 S-36 的） |
|---|---|---|---|---|---|
| [`S-36`](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 当前租户身份查询 | 认人所得 `LoginStateId` | 无 | 成功 ⇒ `{ result: TenantId }`（规范形式）。`loginStateNotValid` ⇒ `login-state-rejected`；`invalidInput` ⇒ 缺陷；返回的 `account` 分量不等于认人所得 `AccountId` ⇒ 缺陷 | 纯读 | 「当前租户身份的可见性」、「`TenantId` 的规范形式」 |
| [`S-37`](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份) 切换当前租户身份 | 认人所得 `LoginStateId` | 目标 `TenantId` | `ok`；透传 `notOwnTenant`、`membershipNotEffective`；`loginStateNotValid` ⇒ `login-state-rejected` | 单次提交；幂等 | 「当前租户身份的可见性」、「成员资格的可见性」、「`TenantId` 的规范形式」 |

**切换提交之后，下一个请求的身份推导就读到新值**（[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)；[PF-001 §4 当前租户身份](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#当前租户身份)）。本路由**不是**[三类现读](../../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)的放行者——那一侧归据点；本契约只保证中心此刻的答案是现读的。

### S-24 有意不投影

下列操作**没有路由**。路由表是封闭的，不在表里就是没有这扇门，不是「有门但被拒」
（[§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)；谁能做什么见 [flows §4 角色与操作](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#四角色与操作)）。

| 不投影的 | 为什么 |
|---|---|
| [AI S-13](../../../capabilities/account-identity/v2/contract.md#s-13-产生账号未激活)、[AI S-14](../../../capabilities/account-identity/v2/contract.md#s-14-激活账号)、[AI S-38](../../../capabilities/account-identity/v2/contract.md#s-38-清除到期的未激活账号记录) | 只归注册组合（它们的唯一调用方）；从线上直接够到，`identifier-held-by-expired-record` 就流向了终端（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的对应行） |
| [AI S-18](../../../capabilities/account-identity/v2/contract.md#s-18-读账号)（读账号） | 它以「持有 `AccountId` 即可读」为授权；上线等于让任何拿到一个 `AccountId` 的人读它的激活与过期状态 |
| [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)、[AI S-17](../../../capabilities/account-identity/v2/contract.md#s-17-校验登录状态) 作为路由 | AI S-44 是每个经 ② 的请求的第 ② 步，不另开一条；AI S-17 按 `LoginStateId` 认人，**只对进程内调用方开放**（AI S-30 的「只有 S-44 认出示物」行），上线就等于让任何读到列表的人认成别人 |
| [OG S-20](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)（创建个人组织） | 只归注册组合的动作链 |
| [OG S-53](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)（清除个人组织） | 它没有授权前置，只能由注册组合的清除链调用；上线就是一条直接删任何账号个人组织的入口 |
| AR 的清除链 | 由清扫与注册主链发起，不是来者的动作 |
| 任何存储级、时钟级、部署级的面 | 中心的两张面没有第三张（[§5.1](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)）；客户端一面**没有任何写部署事实的操作**，也读不到完整体检 |
| 任何会话操作 | 中心不知道任何会话 |

## 五、运维面

### S-25 运维面只在中心所在的机器上，且没有治理路由

- **运维面**（无词条）是运行中的中心上属于[运维者](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)那一面的**唯一**部分，**只在中心所在的机器上可达**，与客户端一面**不共用任何通道**
（[PF-017 §4 运维者](../../../../product/PF-017-governance-center-as-deployable-application/design.md#运维者)、[§5.1 两张面](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)）。
  「只在本机可达」是部署边界（谁握着那台机器），**不是任何治理判定的输入**；客户端一面从不按对端地址放行（[S-16](#s-16-不记住来访不区别对待来者)）。
- **运维面上恰有一个操作：读[完整体检](#s-26-完整体检)。**没有任何路由映射到 `capability.account-identity`、`capability.organization-governance`、`composition.account-registration` 的任何操作——
  **不是「有但被拒」，是没有**（[§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)、[flows §4](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#四角色与操作)）。
- 它**不写任何持久事实**。部署事实（密钥、参数、版本、启停）的改动在中心停着时、在产品之外做，不经运维面。
- **这一条靠什么成立要说实话**：进程内没有访问边界可依（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「运维者没有门」行），它靠三件事一起——通道分离、运维面所在的单元不引用任何治理能力、这条通道上没有治理路由；后两件由静态检查守（[SC-2](../verification.md#静态检查义务)）。
  **产品挡不住一个直接翻数据的人**，那归组织对那台机器的访问管理。

### S-26 完整体检

| 九件事 | 内容 |
|---|---|
| **1 输入与授权** | 无输入。无产品层授权：够得到运维面的就是握着那台机器的人——[运维者](../../../../product/PF-017-governance-center-as-deployable-application/design.md#运维者)（[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由)） |
| **2 前置** | 中心在应答 |
| **3 提交点与原子性** | 无。纯读 |
| **4 返回与失败集合** | `{ reachable, centerId, version, startedAt, storageReachable, deploymentKeyPresent, deploymentKeyComplete, clockSane, defectCount, deploymentParameters }`，恰此十项。**失败集合为空**：每一项读不到都是一个答案（`false`），不是一次失败 |
| **5 幂等边界与重发** | 纯读，任意重复 |
| **6 事件** | 无 |
| **7 缺席时的默认答案** | `storageReachable`：**本次读取时**现探数据所在，探不通 ⇒ `false`；`clockSane`：**本次读取时**现读钟，读不到或比中心用过的最晚时刻早 ⇒ `false`；`defectCount`：自本次启动以来**入口层自己**记过的缺陷数（[S-14](#s-14-失败映射)），非负整数，重启归零；「记过缺陷」即 `defectCount > 0`。**不以「上一次读到的」顶替** |
| **8 在途归属** | 无 |
| **9 装配给／协议给** | 见 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「运维者没有门」与「中心标识与治理事实同一存储」两行 |

| 项 | 含义 |
|---|---|
| `reachable`、`centerId`、`version` | 与[公开体检](#s-18-公开体检)同。**`reachable` 在这里恒为 `true`**：运维面与客户端一面同起同停（[S-34](#s-34-起来即整体停机时在途请求归谁)），运维面在应答，客户端一面就在应答 |
| `startedAt` | 这一次启动成功的时刻（中心的钟），形状是 OE `Instant`。**启动成功以钟可读为条件**（[S-34](#s-34-起来即整体停机时在途请求归谁)），所以中心在应答时它总有定义 |
| `deploymentKeyPresent`、`deploymentKeyComplete` | [部署密钥](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署密钥)**启动时载入的结果**，不是现在去看文件。缺了或不完整中心本来就起不来，所以中心在应答时两项都是 `true`；中心开着时机器上那份被删了，照旧是 `true`，下次启动才起不来（[§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)） |
| `defectCount` | 自本次启动以来**入口层自己记过的**缺陷数：恰计 [S-14](#s-14-失败映射) 列出的各缺陷情形（含那张表里的矛盾清单），非负整数，启动时为 0，重启归零。它说「中心自身出过故障」，不说是哪个请求、哪个人——缺陷的细节只在[工程记录](#s-30-工程记录)里。**参与方自己记的缺陷**（各参与契约在它们内部判出的）只在工程记录里，**本版不汇入这个数**——它为 0 不等于参与方没出过错 |
| `deploymentParameters` | 五项[部署参数](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署参数)此刻生效的值（启动时读入）：`unactivatedRetention`、`invitationTtlDefault`、`affiliationRequestTtlDefault`、`copyNoticeTtlDefault`、`sharingInvitationTtlDefault`。**五项缺一不可，不出厂默认**（[§6.15](../../../../product/PF-017-governance-center-as-deployable-application/design.md#615-部署参数由运维者给值起动时读缺一不可)）；每项是一个时长，以正整数毫秒表示。后两项本版**没有消费它们的契约**（[G-4](#十三已知缺口)）：照样要值、照样校验、照样在这里可见 |

**不含**：部署密钥的值、任何凭据的值、任何治理事实（账号有几个、组织有哪些、谁登录着、谁邀请了谁）——[中心体检](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)只说部署（[§6.17](../../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)）。
**也不含**与部署参数同类、但不属于部署参数的技术参数（例如创建键的保留期、凭据规则）——它们不是[部署参数](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署参数)。

## 六、治理中心标识

### S-27 GovernanceCenterId 的形状与相等

- **`GovernanceCenterId` 是[治理中心标识](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)的值类型**（产品定义见 [PF-017 §4 中心标识](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心标识)），随本契约 Schema 定义：一个 **128 位随机值**，
  规范形式**恰有一种**——32 个小写十六进制字符。**相等只在这个形式上定义**：逐字符相等；大写、带空白、带分隔符的都不是合法值。
  口径与 [`data.identity-values/v1#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式) 对 `TenantId` 的规定同形：一种形式、一个比较规则，不做任何规范化。
- **「是同一个中心」＝ 标识相等**；不同即另一个中心（[§6.12](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)）。
- 它**不是地址，不是秘密**，不由运维者起名，**不从部署密钥、地址或任何运行实例的身份派生**。
- 它**只管「是不是同一个」，不证明「真的是它」**——防冒充不在本契约（[S-3](#s-3-本契约明确不承诺什么)）。

### S-28 铸造、存放与不变

| 九件事 | 内容 |
|---|---|
| **1 输入与授权** | 无输入。不是一个线上操作：它是入口层**每次启动**时做的一件事，没有任何人能从任何一面触发它 |
| **2 前置** | 数据所在够得着，且**读得出**标识那一格的状态。**那一格与存储结构同时立起**：存储结构建立的那一次就带着它，状态是「未铸」（兑现方式归实现映射）。所以读或铸判「是不是第一次」时只看这一格本身，**不看别的 owner 的数据**——读或铸这一步不判「治理事实是否为空」；「那一格所在的表整个不在」由启动前的只读核对另行挡住（见下文前提） |
| **3 提交点与原子性** | **首次启动的提交点**：读到「未铸」⇒ 生成一个、写进那一格的那一次提交；那一格与治理事实在**同一个存储**。这次提交**不写任何治理事实**——中心生来是空的。之前任何一步失败，那一格仍是「未铸」，下一次启动仍然算第一次 |
| **4 返回与失败集合** | 启动成功 ⇒ 这次运行期间的 `centerId` 定下（公开体检与完整体检都读它）。**那一格只有三种读法**：读到「未铸」⇒ 铸造并写入（上一行）；读到已铸、且值合 [S-27](#s-27-governancecenterid-的形状与相等) ⇒ 用它；**那一格不存在，或值不合 S-27 ⇒ 启动失败**——这份数据不是一个中心从零立起来之后的样子（搬错了、截断了、恢复不全或被手改），铸一个新的只会给一份已有数据换一个身份，照用一个不合形状的值会在公开体检里交出不合 Schema 的 `centerId`。失败集合恰为四支，都让中心不起来、并告诉运维者是哪一支，不产生一个「没有标识的运行中的中心」：**读不到**；**写不进**；**那一格不存在**；**值不合 S-27** |
| **5 幂等边界** | **读到已铸的标识 ⇒ 用它，不再铸。**同一份数据上每次启动得到同一个值 |
| **6 事件** | 无 |
| **7 缺席时的默认答案** | **「读不到」绝不当作「未铸」**：存储此刻读不出那一格 ⇒ 启动失败，**绝不铸一个新的**——那会把一次抖动变成「另一个中心」，全组织的据点一夜之间认不出它。**「那一格不存在」也绝不当作「未铸」**：只有读到「未铸」这个状态才铸 |
| **8 在途归属** | 首次写入中途崩溃：那次提交要么成立（下次读到已铸），要么没有（下次仍读到「未铸」）；没有第三种 |
| **9 装配给／协议给** | 见 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「中心标识与治理事实同一存储」「那一格立起过就不被重建」两行 |

**前提（装配给，本组合不兑现）：那一格立起过，就不会在启动时被当作新建重新立起。**
恢复不全把那一格所在的表丢了时，若启动把它当成一份全新的存储、重新建立那张表，读到的就是「未铸」，中心会带着已有的账号与组织铸出另一个标识。
这一支由启动前的只读核对挡住：**存储里已有别的治理事实、却没有那一格所在的表 ⇒ 启动失败，不重建、不铸造**。
核对的机制归存储提供者（[`realization/packages/infra/storage-sql` 的迁移前只读核对](../../../../realization/packages/infra/storage-sql/design.md#迁移前只读核对)），
判据由本组合的实现映射给出并由承载装配接进那道核对；「已有别的治理事实」怎样判归实现映射。
一份只剩迁移登记、别的结构都丢了的存储不在这一支里：那时那一格读不到，按上表「读不到 ⇒ 启动失败」收场，同样不铸。

**性质**：

1. **一生不变**：此后没有任何写路径改它——客户端一面没有、运维面没有、部署动作也不改它。
   停机、重启、升级、换密钥、改参数、搬家、从备份恢复，都是同一个标识；**只有从零重立才换**。前提：用的是同一份数据（[§4 中心标识](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心标识)：跟着数据走）。
2. **跟着数据走**：它与治理事实在同一个存储里，备份治理事实就备份了它，恢复治理事实就恢复了它。放在存储之外的任何地方，「只备份了库」就会把它丢掉。
3. **两次从零首启得到不同的标识**：这是承诺，由 128 位随机兑现，是一个概率界。
   **碰撞的收场**：碰撞的两个仍是两个中心（中心的身份是它的数据，标识只是用来比较的那个值），**本契约不检测碰撞**；
   客户端据相等会把其中一个误判为「搬家了」——与「同一份数据在两处同时起来」同属[产品分不出、不检测](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)的一类后果。
4. **启动时载入，此后读的是载入的值**：数据所在中途够不着，公开体检照样答得出标识。

## 七、输出与观测

### S-29 秘密不进任何输出

中心的**任何输出**——客户端一面的每一种答复、公开体检、完整体检、工程记录、启动失败的说明——**都不含**：

| 不含 | 例外 |
|---|---|
| [部署密钥](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署密钥)的值 | 无（生成它的办法在交出时给过一次，那不是中心运行时的输出） |
| 账号的凭据材料 | 无 |
| [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)的值 | 无。**本契约对它只承诺「不进任何输出」**，不承诺「在数据里读不出来」（[§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)） |
| 出示物 | **恰一处**：登录路由成功时交出新签发的那一个（[S-19](#s-19-免认人的两条路由注册登录)）。线上交出去的其余东西都不能当登录状态用（[§8 不交出能直接用的凭证](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)） |

列表句柄（即 `LoginStateId`）不是秘密，可以出现（[S-9](#s-9-列表句柄)）。

### S-30 工程记录

入口层对每一个请求留一条可定位、可解释的工程记录（[SYS-OBSERVABILITY C1／C3](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)），至少分得出：
走到了判定次序的哪一步、给出了四种入口答复里的哪一种或哪一个路由结果、`unavailable` 是缺陷还是判不了、判不了时是**哪一次现读**给出的**哪一个失败值**、缺陷是哪条路由的哪个领域答复。

**记录的是入口层自己观察到的失败值，不多于它**：参与契约把钟读不到折进了它们各自的不可用值（AI 的 `storage-unavailable`、OG 的 `unavailable`），入口层从这些值里**分不出**存储与钟，记录里也就不写成分得出。
**只有入口层自己做的读**——启动时读中心标识那一次（[S-28](#s-28-铸造存放与不变)）与为 `startedAt` 读钟那一次（[S-34](#s-34-起来即整体停机时在途请求归谁)）、运维面为[完整体检](#s-26-完整体检)现探数据所在与现读钟——才区分存储不可用与时钟不可用。

**边界**（[flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来)、[C6](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)）：

- **不记对端地址**；
- **账号与租户只以不可逆的关联号出现**，从记录里还原不出 `AccountId`、`TenantId`；
- 不含 [S-29](#s-29-秘密不进任何输出) 列出的任何一样；
- 对来者逐字相同的那六种不认情形，记录里**可以**区分「没带／多个／表示层不合格」与「查过了、不认」——后者内部三种（从没签发、已撤销、别的中心签的），[AI S-44 本身就不区分](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)，记录里也分不出。

运维者读这些记录，与「握着磁盘的人」是同一类事，**不是产品开给他的一扇门**（[§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)）。

## 八、性质与前提

### S-31 不变量与安全性质

本表是 [acceptance §二「绝不能发生的事」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#二绝不能发生的事)里归本契约的那几行的落点；各行的兑现条款在「谁在何处保护」一列。
那一节另有两行归本契约、不在本表：「中心半开」由 [S-34](#s-34-起来即整体停机时在途请求归谁) 兑现，「工程记录里出现对端地址或可还原的账号、租户标识」由 [S-30](#s-30-工程记录) 兑现。

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **版本先于一切**：版本对不上时，除公开体检外只答 `version-mismatch`，出示物没被看过，那件事没发生 | [S-10](#s-10-判定次序) ① | — | [§6.4 ①](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)、[§6.16](../../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说) |
| **只认自己签发的、此刻有效的** | [S-11](#s-11-认人)：每请求凭出示物现读 [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) | 出示物猜不中——本组合的前提，是 AI 的提供者义务（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「出示物猜不中」行） | [§6.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数) |
| **判不了不下结论**：任何一步判不了 ⇒ `unavailable`；永不说成 `login-state-rejected`，永不放行，永不拿旧答案或空清单顶 | [S-10](#s-10-判定次序)、[S-14](#s-14-失败映射)、[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存) | 领域契约把判不了收成各自的不可用值。**例外是注册组合**：它把底层的判不了收进 `interrupted`，本组合原样呈现、不改成 `unavailable`（[S-19](#s-19-免认人的两条路由注册登录)）；那条路由上「判不了」对来者是 `interrupted`，仍不是放行，也不是 `login-state-rejected` | [§6.4 ②](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复) |
| **拒绝不泄漏**：六种不认情形同一个线上答复；认出人之后才读到的撤销也是这一个 | [S-11](#s-11-认人)、[S-14](#s-14-失败映射)、[S-33](#s-33-认出人之后登录状态被撤销)、[S-6](#s-6-四种入口答复) 的逐字相同 | 时序侧信道不在范围 | [§6.5](../../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说) |
| **此刻有效才认**（中心一侧 δ = 0） | [S-15](#s-15-δ--0每个请求现读入口不跨请求缓存) | — | [§6.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)、[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) |
| **没有替身担保，不区别对待来者** | [S-11](#s-11-认人)、[S-16](#s-16-不记住来访不区别对待来者) | — | [§6.2](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端) |
| **认出来者不削弱隔离**：交给领域的身份只从认人推出；隔离判定仍在各 owner 的数据访问层 | [S-12](#s-12-身份推导)、[S-13](#s-13-补授权) | 各 owner 兑现 `data.identity-values` v1 的隔离义务 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) |
| **两张面，没有第三张**：客户端一面只有路由表里的路由；运维面只有完整体检；没有「内部」「管理」「脚本专用」入口 | [S-17](#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](#s-24-有意不投影)、[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由) | 静态检查 [SC-1](../verification.md#静态检查义务)～[SC-3](../verification.md#静态检查义务) 落地 | [§5.1](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张) |
| **运维者没有门，超管没有部署的门** | [S-24](#s-24-有意不投影)、[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由) | 同上；直接翻数据的人挡不住 | [§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)、[flows §4](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#四角色与操作) |
| **秘密不进任何输出；体检不越界** | [S-18](#s-18-公开体检)、[S-26](#s-26-完整体检)、[S-29](#s-29-秘密不进任何输出) | 模型凭据只到「不进输出」 | [§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)、[§6.17](../../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁) |
| **中心标识一生不变；两次从零首启不同** | [S-28](#s-28-铸造存放与不变) | 同一份数据；碰撞按概率界；那一格立起过就不被重建（装配给，[S-36](#s-36-装配给的保证-vs-协议须给的保证)）；首启那次提交跨 OS 崩溃的耐久按 [S-36](#s-36-装配给的保证-vs-协议须给的保证)「已提交事实跨 OS 崩溃」行 | [§4 中心标识](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心标识)、[§6.12](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来) |
| **过期只量中心的钟** | [S-4](#s-4-请求信封)：信封不含时间 | — | [§5.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#54-中心自己的时间) |
| **来往里没有会话；中心从不主动发** | [S-3](#s-3-本契约明确不承诺什么)、[S-24](#s-24-有意不投影) | — | [PF-016 §4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)、[§5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧) |
| **登录状态的效力只由退出与撤销改变**（重启、升级、换密钥、改参数都不改） | 登录状态记录在存储里（[`capability.account-identity/v2#S-10`](../../../capabilities/account-identity/v2/contract.md#s-10-撤销是持久记录不是内存生命周期) 的既有性质）＋ 本组合不缓存、不另存 | **不经备份恢复**（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「效力不变」行；[G-7](#十三已知缺口)） | [§6.7](../../../../product/PF-017-governance-center-as-deployable-application/design.md#67-重启不让任何人退出登录) |

### S-32 进展性质与前提

前提编号只在本表内作行标：**P1** 中心在运行且够得到；**P2** 数据所在够得着；**P3** 时钟读得到且未倒退；**P4** 版本对得上；
**P6** 其间没有从备份恢复；**P8** 未激活记录在留存期限内；**P9** 账号已激活、来者持有凭据。

**进展表「P3 不成立 ⇒ `unavailable`」这条映射有一条例外：跨 OS 崩溃或断电，「时钟不后退」不在本契约的承诺内。**按 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 接受的持久性政策，OS 崩溃或断电可能丢掉最后一段已提交事务，时钟判回拨所依据的最近那次记录可能随之丢失；
那之后的一次倒退可能检不出，要看时间的判定按倒退之后的时刻做出。
这是**装配给的边界**，本契约的协议补不了；判定与失败集合不因此改变。**同一边界也及于本契约其他依赖已提交事实的承诺**——中心标识的首次铸造（[S-28](#s-28-铸造存放与不变)）、撤销后的效力不变（[S-31](#s-31-不变量与安全性质)）、停机时「已确认的都在」（[S-34](#s-34-起来即整体停机时在途请求归谁)）：崩溃前最后一段已提交事务丢失时，那些事实退回到崩溃前更早的状态。它在 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 以「已提交事实跨 OS 崩溃」一行统一登记，不逐条改写各承诺；产品负责人已裁把这条边界写进产品正文（PF-017 rev 2 的 [§6.7](../../../../product/PF-017-governance-center-as-deployable-application/design.md#67-重启不让任何人退出登录)、[§6.8](../../../../product/PF-017-governance-center-as-deployable-application/design.md#68-停机已确认的都在没确认的等于没发生)、[§6.10](../../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走)、[§6.12](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)），本契约与之同口径。

| 进展 | 前提 | 前提不成立时来者看到什么 | 前提由谁负责 |
|---|---|---|---|
| 带着有效登录状态来的请求，**这一次**就得到领域的答复（做成了，或按 PF-001 的理由没做成） | P1、P2、P3、P4 | P1 不成立：什么都得不到（问不到）；P2／P3：`unavailable`；P4：`version-mismatch`——**三者都不是 `login-state-rejected`** | P1～P3 归运维者（钟的运行中回拨检出归时钟的提供者，见 [S-36](#s-36-装配给的保证-vs-协议须给的保证)）；P4 归运维者与客户端一起升级 |
| 答过 `unavailable` 之后，P2、P3 一恢复，**同一个登录状态的下一个请求**就照常，不需要重新登录 | P1 | 同上 | 同上 |
| 重启或升级成功之后，此前有效的登录状态**不重新登录就能用** | 启动成功；P6 | P6 不成立：备份之后签发的得 `login-state-rejected`，备份之后撤销的**又能用了**（[flows §1.6](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#16-从备份恢复)） | 恢复在产品之外做，归运维者；读法待 PF-001 owner 认（[G-7](#十三已知缺口)） |
| 登录状态失效的人重新登录，得到一个新的登录状态，当前租户身份从个人组织起算 | P1～P4、P9 | P9 不成立：`identifier-or-credential-rejected` | 账号能力 |
| 停机时注册走到一半的人，起来之后用同一标识同一凭据接着走完 | P1、P8 | P8 不成立：那条记录已清，名字按新注册走 | 注册组合 |
| 空中心上，任何够得到它的人都能注册、登录、建组织并成为那个组织的超管（无害靠[部署前提](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署前提)） | P1～P4 | 同第一行 | 同第一行 |

**上界**：每一行都是「这一次」「下一个请求」这种有界形式——入口层不排队、不重试、不等待前提恢复；前提成立时，一个请求在它自己的处理里得到答复
（形式证据：[EntryDecision.tla](formal/EntryDecision.tla) 的 `EventuallyAnswered`，前提写在 [formal 入口](formal/README.md)）。
中心起不来之后运维者补上被点名的那一样就能起、丢了密钥换一套就能起、改了参数下次启动生效——这几条归承载装配，不在本契约。

## 九、并发、撤除与替换

### S-33 认出人之后登录状态被撤销

第 ② 步认出人之后、第 ③ 步提交之前，出示的那个登录状态可能在别处被撤销：

- **领域操作照常执行**，除非它自己又读了那个登录状态——[撤销只影响下一道尚未通过的准入](../../../capabilities/account-identity/v2/contract.md#s-29-撤销不等于强制停止)，这一次的准入已经在第 ② 步通过了。
- **身份推导或领域操作读到「出示的登录状态已不作数」**（[OG S-36](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)／[OG S-37](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份) 的 `loginStateNotValid`、[AI S-37](../../../capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) 的 `login-state-rejected`、[AI S-16](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 的 `not-authorized`）⇒ **`login-state-rejected`**，与在第 ② 步被拒逐字相同（[S-14](#s-14-失败映射)；[§6.5](../../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说)：拒绝的时候什么都不多说）。
- 无论哪一支，**下一个请求**在第 ② 步就被拒（[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)：撤销向后生效）。

### S-34 起来即整体；停机时在途请求归谁

- **起来即整体。**客户端一面要么以**整张路由表**开始应答，要么根本不应答；不存在「一部分路由在服务、另一部分不在」的中心（[§6.6](../../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）。
  入口层所依赖的任一参与方的面缺席，客户端一面就不应答——来者看到的是「问不到」，不是某些路由答 `unavailable`、某些照常。
- **起来即整体覆盖两张面：运维面与客户端一面同起同停。**两张面一起开始应答、一起停止应答新请求；不存在「运维面已可用、客户端一面还没起来」或反过来的中间态。
  所以运维面在应答时，客户端一面也在应答——[完整体检](#s-26-完整体检)的 `reachable` 恒为 `true` 由此成立。
- **「面缺席」只有三种时候**：启动（还没起来）、停机、某个参与方的提供者**换代**。
  **存储或时钟不可用只能表现为返回值上的不可用**（[IV S-19](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)），**不得表现为面缺席**——由存储与时钟的提供者兑现（实现映射）；否则一次读不到就会让整个中心问不到，而「答不出」本该是一个答复（[S-6](#s-6-四种入口答复)）。
- **换代期间**：在途请求跑完，各按它自己那一次提交收场；换代中到达的新请求**两张面都不应答**（来者看到的是「问不到」）；**换代不计缺陷**，不进 `defectCount`。
  **前提（装配给）：本版运行中不换代存储与时钟的提供者。**两张面都依赖它们；它们一换代，两张面各自重来、谁先谁后不由装配定，「同起同停」与「换代之后两张面都恢复应答」在那一刻都没有保证。
  所以本条的「换代」在本版只指参与方能力（账号、组织治理、注册）的提供者；存储与时钟要在运行中换代，须先给出两张面恢复的保证，并作为本契约的新版本发布。
- **启动成功以钟可读为条件**：启动时读不到中心的钟，就还没有启动成功——等到读到为止；超过承载装配定的界仍读不到 ⇒ **启动失败，并告诉运维者原因是钟**。
  完整体检的 `startedAt` 就是启动成功那一刻读到的时刻（[S-26](#s-26-完整体检)），所以它总有定义。
- **中心开始应答的那一刻就是它「起来了」的那一刻**；在那之前的任何失败，外面看到的只是「问不到」。
- **升级整体性与 §6.10 第 1 行的启动前核对不归本契约**（S-28 前提依赖的那道启动前核对是另一回事，归 S-36）：[§6.9 升级要么整体成、要么整体不成](../../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成)，与 [§6.10](../../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走) 第 1 行的启动前只读核对，本契约不兑现。
  它们没有契约家，本版由承载装配直接承接，登记为 [G-12](#十三已知缺口)；本契约对它们只有上一条：升级不成或核对不过发生在「起来」之前，外面看到的只是「问不到」。
- **停机**：先停止接受新请求，再在有界的时间内等在途请求答完，然后关闭。在途的领域操作按它自己那一次提交收场；
  来者可能收不到答复——那件事要么已提交、要么没发生，**没有半个**（[§6.8](../../../../product/PF-017-governance-center-as-deployable-application/design.md#68-停机已确认的都在没确认的等于没发生)）。等待的上界归承载装配。
- **撤除之后仍然为真的**：全部治理事实与中心标识都在存储里；入口层没有任何需要交接的在途状态，也没有需要恢复的东西。

## 十、内核不提供的部分

### S-35 内核不提供、由本契约兑现的表

| 内核不提供 | 需要吗 | 怎么兑现 |
|---|---|---|
| **跨进程的身份与可见性** | **需要，这是本契约的核心** | 出示物、每请求重验（[S-11](#s-11-认人)）、身份推导（[S-12](#s-12-身份推导)）、补授权（[S-13](#s-13-补授权)） |
| 权限边界 | 需要：运维者对治理事实没有门 | 通道分离 ＋ 路由表封闭 ＋ 运维面不引用治理能力（[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由)），由静态检查守 |
| 有序的异步清理 | 需要：停止接收 → 等在途 → 关闭 | [S-34](#s-34-起来即整体停机时在途请求归谁)：三步是一个有序过程，不是三件各自并发的收尾 |
| 持久化与崩溃恢复 | 需要：中心标识跨重启、跟着数据走 | [S-28](#s-28-铸造存放与不变)：存在治理事实同一个存储里 |
| 时序保证 | 需要：入口在所依赖的面都可用之后才应答 | [S-34](#s-34-起来即整体停机时在途请求归谁) |
| 可靠投递 | 不需要 | 不承诺送达（[S-3](#s-3-本契约明确不承诺什么)） |
| 背压与流控 | 不需要 | 非目标（[S-3](#s-3-本契约明确不承诺什么)） |
| 跨 owner 事务、外部效应回滚 | 不需要 | 每个请求至多落在一个领域操作的一次提交里；入口层自己的现读（认人、推导、补授权）都是纯读 |

## 十一、装配给 vs 协议给

### S-36 装配给的保证 vs 协议须给的保证

**这条边把「调用方」搬到了进程外，领域没有被拆开**：各领域能力仍在同一个进程、同一个存储、同一口钟里。
所以左列靠「同一存储、同一提交、同一时钟」的保证**在这条边上不失效**，仍由装配给；要由**本契约的协议条款**重新兑现的，
是**和调用方身份有关、和流向调用方的值有关**的那几行。右列写：这条边上它由谁兑现；中心自身将来也被拆开时还要补什么。
每一行都写做不到会怎样。

| 保证（来源） | 本版单机：由谁给 | 这条边上／跨进程之后：谁兑现 | 做不到会怎样 |
|---|---|---|---|
| **撤销之后立刻生效**（[`capability.account-identity/v2#S-30`](../../../capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) 第 3 行） | 装配：入口层与账号能力读同一个存储 | **协议给**：[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存) 的中心一侧 δ = 0。中心被拆开之后，账号能力那一行的 δ 须定义，本条的 0 随之变成那个 δ | 退出或被撤销的登录状态在缓存窗口里还能用——[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) 被破 |
| **持有 `AccountId` 即可读账号**（同上第 6 行） | 装配：只有进程内调用方 | **靠不暴露兑现**：[S-24](#s-24-有意不投影) 不投影 [AI S-18](../../../capabilities/account-identity/v2/contract.md#s-18-读账号)；线上任何 `AccountId` 都不作行事依据（[S-12](#s-12-身份推导)）。只要线上不出现 AI S-18，本版不需要账号能力的新版本。**残余暴露**：对已知 `AccountId` 可探知存在与激活状态（须先成为某组织超管并发一次邀请——[OG S-23](../../../capabilities/organization-governance/v1/contract.md#s-23-发出邀请) 透传 `accountNotActivated`／`accountDoesNotExist`）；**接受**（[PF-017 INT-012](../../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-23-rulings.md#int-012)），理由：`AccountId` 不透明（[IV S-31](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)），且被邀请者会看到这次邀请。**「`AccountId` 猜不出、枚举不了」是前提，不由本组合兑现**：它归 AI [G-2](../../../capabilities/account-identity/v2/contract.md#九已知缺口) 的 `AccountId` 那一半（提供者设计给出形式并说明是否不可猜测）；那一半若裁成可猜测，这条残余暴露的范围随之扩大，须回到 INT-012 重新确认 | 任何拿到一个 `AccountId` 的人读得到它的激活与过期状态 |
| **`identifier-held-by-expired-record` 只流向注册组合**（同上第 8 行） | 装配：只有注册组合调 [AI S-13](../../../capabilities/account-identity/v2/contract.md#s-13-产生账号未激活) | **结构上兑现**：[S-24](#s-24-有意不投影) 不投影 AI S-13；注册路由只给[四个终结结果](#s-19-免认人的两条路由注册登录)；限定调用点的静态检查覆盖入口层（[SC-1](../verification.md#静态检查义务)） | 「某个名字上挂着一条已过期记录、它的 `AccountId` 是这个」开放给任何人 |
| **OG S-53 只由清除链调用**（[`capability.organization-governance/v1#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 4 行；[`composition.account-registration/v1#S-25`](../../account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 第 7 行） | 装配 | **结构上兑现**：不投影 [OG S-53](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)，入口层不引用清除个人组织那一面（[SC-1](../verification.md#静态检查义务)） | 一条直接删任何账号个人组织的入口 |
| **成员资格的可见性**（[OG S-42](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 5 行） | 装配：写入即被下一次读看到 | **协议给**：中心一侧 δ = 0，入口层不缓存（[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)） | 被移出的人在缓存窗口里仍被放行 |
| **当前租户身份的可见性**（[OG S-42](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 6 行） | 装配 | **协议给**：同上；切换提交之后，下一个请求的身份推导读到新值（[S-23](#s-23-当前租户身份的两条路由)）。据点建会话前的现读归 PF-016 | 切换之后新建的东西落到旧的租户身份上 |
| **调用方身份已经核实过——写操作**（[OG S-42](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 8 行） | 装配：「入口层（apps 装配）先核实」 | **协议给，这条边的核心**：每个请求带出示物，第 ② 步重验；交给治理能力的身份值按 [S-12](#s-12-身份推导) 推出。**不得只凭「上游已经验过了」**（[`data.identity-values/v1#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 谁拿到一个 `TenantId` 就能以它的身份做任何写操作 |
| **调用方身份——读面**（[OG S-42](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 9 行） | 同上 | 同上；另对没有授权前置的四条读面补授权（[S-13](#s-13-补授权)） | 任意组织的类型、任意租户的效力、上级链对任何人可读 |
| **注册入口的义务**（[`composition.account-registration/v1#S-2`](../../account-registration/v1/contract.md#s-2-参与方与精确承诺)「注册入口」一行） | —（本组合就是那个入口） | [S-19](#s-19-免认人的两条路由注册登录)：表示层校验在此；四个终结结果原样呈现；`interrupted` 不改写 | 不合格的输入被交进去收成 `interrupted`，入口缺陷被记成一次普通失败；或 `interrupted` 被说成成功 |
| **`TenantId` 的规范形式，一个部署一条规则**（[`data.identity-values/v1#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式)） | **不变**：规范形式由 IV S-7 给出，进程内外同一条；[IV G-05](../../../data/identity-values/v1/contract.md#十已知缺口) 的标量键编码与本契约无关——线上传的是带判别式的规范形式，不是标量键 | **协议给**：线上的 `TenantId` 按规范形式原样传（[S-12](#s-12-身份推导)） | 同一个租户在线上有两种写法，比较与去重各算各的 |
| **归属层身份带判别式到达**（[`#S-16`](../../../data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)） | 装配 | **协议给**：`TenantId` 与 `ScopeLayerIdentity` 不压平成两个可空字段（[S-12](#s-12-身份推导)） | 「这份东西归哪一层」在线上有两个答案，或两格都空 |
| **读不到即明确失败，以返回值到达**（[`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)） | 装配：读失败就是那次调用的返回值 | **协议给**：`unavailable` 是一个显式的线上答复（[S-6](#s-6-四种入口答复)）。**客户端代理须把传输层故障（超时、断连、解析不了）映射到与「问不到」同一个分支**，不得折成空结果或默认值——那一侧不在本程实施边界，义务写在这里 | 一次读不到在客户端被显示成「没有」或「无效」 |
| **六条路径同一判定；不得冒充隔离**（[`#S-20`](../../../data/identity-values/v1/contract.md#s-20-六条路径同一判定)、[`#S-23`](../../../data/identity-values/v1/contract.md#s-23-不得冒充隔离)） | 装配：同进程同一判定函数 | **协议给**：入口层是远端接收边界，每个请求重新鉴别；**判定仍在各 owner 的数据访问层**，入口层不替它们判，也**不声称自己提供了隔离**；路由表封闭、没有泛化分派 | 「入口验过一次」被当成全链成立，数据访问层的判定被省掉 |
| **判定依据不含物理位置**（[`#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)） | 静态检查 | **协议给**：对端地址、机器、程序一律不作资格（[S-16](#s-16-不记住来访不区别对待来者)） | 出现「可信机器」，人能做的脚本做不了或反之 |
| **每道准入现读、缓存须写失效条件**（[`#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)） | 装配：进程内失效即时 | **协议给**：[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)，本版不缓存 | 说不出什么时候失效的授权缓存 |
| **捕获的当前租户身份不被重算**（[`#S-28`](../../../data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)） | 装配：沿调用栈传下去 | **协议给**：每个请求推导一次、随请求交下去，领域不就地重取（[S-12](#s-12-身份推导)） | 同一次工作的前后两步算到两个租户头上 |
| **跨边界须重新验证**（[`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 装配 | **协议给**：本组合就是那个接收边界（[S-11](#s-11-认人)） | 只带身份值、不带授权依据的请求被照办 |
| **表示层校验与判定分开**（[`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)） | — | **协议给**：`invalid-input` 与三种判定结论分开（[S-6](#s-6-四种入口答复)）；出示物是身份不是输入（[S-5](#s-5-出示物)） | 一次参数错误被读成一次授权或存在性结论 |
| **邀约过期的钟与存储同源**（[OE S-17](../../../data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 第 1、2、3、5 行） | 装配 | **这条边不触发**：钟与存储都没有拆开，客户端的钟不参与任何判定、时间不进信封（[S-4](#s-4-请求信封)）。那份契约的右列只在中心自身被拆开时才需要兑现 | 若有人把客户端带来的时刻当成「现在」，过期的邀约会在客户端拨慢了钟的机器上复活、在拨快的机器上提前作废——这正是 S-4 让时间不进信封所挡住的 |
| **每一类的默认 `offer_ttl` 取值为正**（[OE S-17](../../../data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 第 4 行）。**单列一行的理由**：它是 OE 那张表里唯一一条**在这个可部署应用上触发**的——两类默认时长就是完整体检里的 `invitationTtlDefault`、`affiliationRequestTtlDefault` | **装配给**：承载装配在启动加载部署参数时校验，非正或不合形状即启动失败、说明是哪一项（[起来即整体](#s-34-起来即整体停机时在途请求归谁)）；本契约的完整体检据此只会显示正值 | 这条边不改变它：默认值不经线上，线上的 `offerTtl` 是**这一份**的时长、由领域判正值（[S-21](#s-21-组织治理写路由)）。中心被拆开之后按 OE S-17 右列，每个承载发出操作的节点各自校验 | 非正的默认值让所有没填时长的邀约发出即不可接受，而发出看起来是成功的 |
| **只有 AI S-44 认出示物；进程外来的身份一律先过它**（[`capability.account-identity/v2#S-30`](../../../capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) 第 10 行） | 装配：用来认人的那个 `LoginStateId`——AI S-17 的输入、AI S-16 的发起方、AI S-37 的调用方——都来自 AI 自己的结果；AI S-16 的目标不在此列 | **协议给，本组合就是那个接收边界**：第 ② 步只把出示物交给 [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（[S-11](#s-11-认人)）；AI S-16 的发起方、AI S-37 的调用方、OG S-36／S-37 的那个 `LoginStateId` 一律是认人所得 `LoginStateId`（[S-12](#s-12-身份推导)）；线上来的 `LoginStateId` 只作 AI S-16 的目标（[S-20](#s-20-登录状态的两条路由撤销列出)），从不据以认人 | 谁读到一个 `LoginStateId`（列表里、存储里）就能以它的主人行事——出示物与标识的区分形同虚设 |
| **出示物猜不中**（同上第 11 行；[AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 的熵下限；本组合的前提，见 [S-2](#s-2-参与方与精确承诺) 账号能力一行） | **前提，本组合不兑现**：安全性在出示物的熵上，是账号能力的**提供者义务**（AI 那一行标的就是提供者义务，不是装配给）。`LoginStateId` 不承担任何安全性——它是出示物的不可逆形式，可以被看见（[S-9](#s-9-列表句柄)） | 不变——它本来就是跨进程的前提 | 出示物可被猜中，任何人能以任何人的身份行事 |
| **出示物只交到调用方手里**（同上第 13 行） | —（本组合就是把出示物送过进程边界的那一方） | **协议给**：出示物只在登录成功的那一次答复里出现（[S-19](#s-19-免认人的两条路由注册登录)），其余答复与观测记录都不带它（[S-29](#s-29-秘密不进任何输出)）；途中不被旁人读到、交给的是真正的对端，归传输层（[G-10](#十三已知缺口)、[G-11](#十三已知缺口)） | 出示物在交出途中被截走，截走的人与持有者此后无从区分 |
| **登录状态的效力不变**（本契约；[S-31](#s-31-不变量与安全性质) 末行） | 装配：登录状态记录在存储里、入口不另存 | 不变。**前提是「不经备份恢复」**：恢复把中心带回备份那一刻，备份之后撤销的登录状态随之又有效（[G-7](#十三已知缺口)） | 恢复之后一个已撤销的登录状态又能用，而持有者以为它早已失效 |
| **中心一侧 δ = 0 只是中心一侧**（本契约） | 装配 | 据点上的副本与陈旧窗口归 PF-016，不在本契约 | 把据点副本的陈旧误读成中心放行了已撤销的登录状态 |
| **起来即整体**（本契约 [S-34](#s-34-起来即整体停机时在途请求归谁)） | **装配给**：入口层对它消费的每一个面都是必需依赖，任一缺席就不应答（[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）；启动中任一步失败即整体失败、不留半个面（[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；运维面与客户端一面同起同停。**前提**：存储或时钟不可用只能表现为返回值上的不可用（[IV S-19](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)），不得表现为面缺席——由存储与时钟的提供者兑现（实现映射）；面缺席只在启动、停机、换代三种时候。**又一前提**：本版运行中不换代存储与时钟的提供者（装配保证）——它们一换代，两张面各自重来、先后不定，同起同停与换代后恢复应答都没有保证（[S-34](#s-34-起来即整体停机时在途请求归谁)）；「换代」在本版只指参与方能力的提供者 | **协议给**：中心被拆开之后，入口够不着某个领域时对那条路由答 `unavailable`，**绝不以部分成功或空结果顶替** | 能登录却答不出成员资格、能建组织却记不下邀请的半开中心 |
| **运维者没有门**（本契约 [S-25](#s-25-运维面只在中心所在的机器上且没有治理路由)） | **装配给**：通道分离、运维面不引用治理能力。进程内**没有**访问边界可依——同一棵上下文树里任何插件都解析得到兄弟插件提供的面（[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），可见性隔离也不隔数据（[`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)）；所以这一条由静态检查守（[SC-2](../verification.md#静态检查义务)） | 不变：运维面仍须与治理能力分开，拆进程不改变这一条 | 运维面引用了一个治理能力，就出现了一扇不经登录状态的门，而且没人看得见 |
| **中心标识与治理事实同一存储**（本契约 [S-28](#s-28-铸造存放与不变)） | 装配：一个存储 | **协议给**：存储被拆开之后，标识须仍与治理事实的权威副本同在、同备份、同恢复 | 只备份治理事实的那份备份恢复出来是「另一个中心」 |
| **已提交事实跨 OS 崩溃**——中心标识的首次铸造（[S-28](#s-28-铸造存放与不变)）、撤销后效力不变（[S-31](#s-31-不变量与安全性质)、[S-17](#s-17-路由表封闭每条路由的九件事从哪读)）、停机时「已确认的都在」（[S-34](#s-34-起来即整体停机时在途请求归谁)）在 OS 崩溃或断电后仍成立 | **装配给的边界，本版不承诺**：按 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)，崩溃前最后一段已提交事务可能丢失，那些事实退回到更早的状态（已撤销的又能用、已铸的标识消失而下次首启另铸、已答复的登录状态不在）。进程崩溃（非 OS）不在此列 | **协议给**：无——跨进程后这条仍归每个存储提供者的持久性政策；分布式时须由协调域各自给出耐久边界 | 已撤销的登录状态在崩溃后又能用（与 G-7 同形）；客户端已见过的中心标识在崩溃后消失，全组织据点把它认成另一个中心 |
| **那一格立起过就不被重建**（本契约 [S-28](#s-28-铸造存放与不变) 的前提） | **装配给**：启动前的只读核对里判「存储里已有别的治理事实、却没有那一格所在的表」⇒ 启动失败、不重建、不铸造——机制归存储提供者（[storage-sql 的迁移前只读核对](../../../../realization/packages/infra/storage-sql/design.md#迁移前只读核对)），判据归本组合的实现映射，承载装配把判据接进核对 | **协议给**：存储被拆开之后，每一处存放那一格的节点都须有同一道核对，结构的建立不得绕过它 | 恢复不全丢了那一格所在的表，启动时被当成全新存储重建，读到「未铸」，带着已有账号与组织铸出另一个标识——全组织的据点把它认成另一个中心 |
| **停机时先停收、再等在途、再关闭**（本契约 [S-34](#s-34-起来即整体停机时在途请求归谁)） | **装配给**：三步放在同一个装载效应的收尾里依次执行——不同效应的收尾彼此并发、不保序（[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)） | 不变 | 先关闭后等待：在途请求被截断，来者收不到答复（事实仍是要么在、要么不在，但不必要地多丢答复） |
| **运行中钟往回倒 ⇒ 要看时间的答 `unavailable`**（[§6.10](../../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走)） | **装配给**：时钟的提供者在运行中检出回拨并让时间读面给出「不可用」；本契约按 [S-14](#s-14-失败映射) 把它映射成 `unavailable`。**例外（装配给的边界，协议补不了）**：跨 OS 崩溃或断电，「时钟不后退」不在本契约承诺内——存储的持久性政策可丢最后一段已提交事务，时钟判回拨所依据的记录可能随之丢失（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)；[S-32](#s-32-进展性质与前提) 的 P3 例外） | 不变 | 倒退的钟上做出的判定让过期的邀约复活，而每一步都显示成功。跨 OS 崩溃或断电之后这正是可能发生的情形，本版接受（D-027） |

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要求领域语义在分布式演化中不变，
因此右列不是「以后再说」，而是本契约已经记下的待兑现项；中心自身被拆开时要补的部分登记在 [G-8](#十三已知缺口)。

## 十二、规范表达与证据义务

### S-37 本版选用的形式工件

本契约**触发了行为模型的义务**：它新增的是一条**跨 owner 的整体性质**——判定次序 × 四种入口答复 × 「判不了优先于无效」，
横跨三份契约的操作与它们各自的失败集合。局部契约各自正确，不蕴含这张映射在每一种交错下都对。

选用：**TLA+ 行为模型 [`formal/EntryDecision.tla`](formal/EntryDecision.tla)**，登记为 formal task 的配置恰一个：[`EntryDecision.cfg`](formal/EntryDecision.cfg)；
有效性核对与变异核对的否定配置 `formal/Validity_*.cfg` **不登记为 formal task**。条款到断言的映射、前提与未建模部分在 [formal/README.md](formal/README.md)。

**不选 Alloy**：本契约要检查的是次序与映射，是行为；「路由表封闭」「运维面不引用治理能力」是代码结构的事实，由静态检查守，不需要结构模型。

**建 Schema**：[`governance-center-entry.schema.json`](governance-center-entry.schema.json)——信封（按 `operation` 判别到 27 条路由各自的载荷）、四种入口答复、路由结果（27 条路由各自的成功返回；按路由核对用 `Exchange`）、公开与完整体检、`GovernanceCenterId`、出示物的交换表示（列表句柄直接引用 `data.identity-values` v1 的 `LoginStateId`），以及本契约自定的三个不透明标识、凭据材料与这一份的时长；
正反实例在 [examples.md](examples.md)。

### 规范场景

场景约束来者可观察的结果，检查真实组合；执行状态在[验证入口](../verification.md)，不写进本版本目录。

### S-38 规范场景：答复的先后

版本对不上的客户端带着有效、已撤销、别的中心签的、什么都没带四种来：**四次都只得 `version-mismatch`**，同一客户端读公开体检照常读得到三样。
版本对得上时让数据所在够不着：带已撤销的得 `unavailable`；什么都不带的得 `login-state-rejected`。
数据所在够得着时：有效登录状态配格式不对的载荷得 `invalid-input`；已撤销的配同一份载荷得 `login-state-rejected`。
依据：[acceptance §三「答复的先后」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

### S-39 规范场景：拒绝逐字相同

版本对得上、判得了时，分别以没带、多个、表示层不合格、从没签发过、已撤销、别的中心签的六种来者做同一件事：
**六次线上答复逐字节相同**（状态、头、体一并比较）。再让一次撤销恰好落在认人与办事之间：答复与前六次逐字节相同。
依据：[acceptance §三「拒绝逐字相同」「只认自己签发且此刻有效的」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

### S-40 规范场景：三个出口不合并

让数据所在够不着，用一个**有效**登录状态来问事：得 `unavailable`；修好之后同一个登录状态照常能用，**不需要重新登录**。
让领域操作给出一个失败集合之外的值：得 `unavailable`，完整体检的 `defectCount` 随之加一。
在两个组织之一读不到成员资格、另一个读出「无效」时读它们的上级链：得 `unavailable`，不是 `notAuthorized`；换一个读的先后，答复不变。
依据：[acceptance §三「三个出口不合并」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

### S-41 规范场景：列表不给能直接用的东西

在一台机器上列出本账号的登录状态，把列表里的每一项拿到另一台机器上当出示物用：**每一次都得 `login-state-rejected`**。
用列表里另一项的句柄撤销它：成功；再撤一次：仍是成功（[AI S-16](../../../capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 的幂等）；用一个从没签发过的句柄撤销：`login-state-not-found`；用自己的句柄撤销（退出）之后，带着它再来：`login-state-rejected`。
先登录三次、撤销其中一次，再停机做一份数据备份：把备份里的**每一个字符串值**都放进信封当出示物来问事：**每一次都得 `login-state-rejected`**，与没带时的答复逐字相同；**同一次里两个仍有效的出示物照常能用**（正对照，缺了它一个恒拒的入口也会让前一半看起来成立）。
依据：[acceptance §三「不交出能直接用的凭证」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)的两半；备份那一半在账号能力一侧的形式是 [AI S-46](../../../capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物)，这里从线上再验一次。
**分工**：本场景只核「拿来用，用不了」这一半；「三个出示物以原样、base64url、十六进制三种形式都不出现在持久内容里」那一搜归 AI S-46 第 1 支，本场景不重复，也不以本场景的通过代替它。

### S-42 规范场景：只认登录状态，不认客户端

同一个有效登录状态，先后从两台机器、用人用的客户端与一段脚本做同一件事：**答复逐字相同**。
撤销一个登录状态后**立刻**用它问事：`login-state-rejected`。
依据：[acceptance §三「只认登录状态，不认客户端」「只认自己签发且此刻有效的」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

### S-43 规范场景：身份推导与补授权

切换当前租户身份到组织 A 后发出邀请：邀请由 A 发出；载荷里夹带一个「以组织 B 的租户身份」的成员：`invalid-input`，没有邀请被发出。
读一个自己不在的组织：`notAuthorized`；读一个不存在的组织：同样 `notAuthorized`；让成员资格读面读不到时再读：`unavailable`。

### S-44 规范场景：中心标识

从零立两个中心：标识不同。同一份数据先后在两个地址上启动：标识相同。停机、重启、升级、换密钥之后：标识不变。
**让标识那一格在启动时读不出来**：中心起不来，**没有铸出新的标识**；修好后再启动，是原来那个标识。
**拿一份那一格所在的表还在、那一格却不在的数据启动**：中心起不来、说明原因，**没有铸出新的标识**。
**把那一格的值改成不合 [S-27](#s-27-governancecenterid-的形状与相等) 的形状再启动**：中心起不来、说明原因，**没有铸出新的标识**，公开体检里从没出现过那个值。
**恢复一份已有账号与组织、却丢了那一格所在的表的数据再启动**：中心起不来（启动前的只读核对以「已有治理事实却没有那一格所在的表」拒绝），**没有重建那张表、没有铸出新的标识**——这一支检查的是 S-28 的前提，由承载装配、存储提供者与本组合的实现映射一起演练。
数据所在中途够不着时读公开体检：三样照样都在。
依据：[acceptance §三「同一个中心换地址还是它」「体检只说部署」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

### S-45 规范场景：两张面没有第三张

在中心所在的机器上，找不到任何一条不带登录状态就能注册、建组织、邀请、移除、改角色、撤销他人登录状态、看谁在里面的操作——**不是有但被拒，是没有**。
从客户端一面，找不到读完整体检或改任何部署事实的操作。
依据：[acceptance §三「运维者没有门」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

### S-46 规范场景：输出里搜不到秘密

生成密钥、启动、跑完上面各场景之后，在全部答复、两种体检、工程记录与启动失败说明里搜部署密钥的值、凭据材料、模型凭据的值、出示物；
出示物按 [AI S-46](../../../capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物) 的同一套搜法，以原样、UTF-8 字节的 base64url（带填充与不带填充）、UTF-8 字节的十六进制（大小写）三种形式逐一搜：
**除登录成功答复里那一处出示物之外，一处都搜不到**；工程记录里搜不到对端地址、搜不到任何 `AccountId` 与 `TenantId`。
依据：[acceptance §三「秘密不经产品的任何呈现与输出交出去」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)。

## 十三、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。
**已闭合的号保留在表里、标「已闭合」、不复用**，并留一句是怎样闭合的。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合（2026-09-23）**：存储里的登录状态可以被直接冒用（原来出示物就是 `LoginStateId`，存储里存的也是它）。闭合方式：本契约改钉 `capability.account-identity` v2——出示物与 `LoginStateId` 分开，存储与备份里只有出示物的不可逆形式，没有任何东西能过 [AI S-44](../../../capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（[AI S-45](../../../capabilities/account-identity/v2/contract.md#s-45-登录状态出示物)、[AI S-46](../../../capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物)）；本契约的 [S-5](#s-5-出示物)、[S-9](#s-9-列表句柄)、[S-11](#s-11-认人) 随之改写，[S-41](#s-41-规范场景列表不给能直接用的东西) 覆盖两半。账号能力 v2 与本契约同为 `candidate`，本闭合随它一并待接受 | — | 已闭合 |
| G-2 | **请求显式携带的「以哪个租户身份行事」与登录状态上当前选中的不一致时怎么答。**本版信封与载荷没有这一格，一律按当前选中的行事（[S-12](#s-12-身份推导)） | PF-001 owner（[PF-017 §9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#九未决项)） | PF-001 定语义；本契约发新版本加上这一格与它的答复 |
| G-3 | **按登录标识指认被邀请者，线上没有承载。**本版邀请路由收目标 `AccountId`；据点侧怎么拿到它不在本程实施边界。另有一个产品问题：那个标识上挂着一条**未激活**记录时，发邀请的人该看到什么 | `capability.account-identity` 的 spec owner（新版本加一个解析面，授权条件：调用方已过第 ② 步）；未激活记录的呈现归 PF-001／PF-016 owner | 解析面发布，本契约加一条路由 |
| G-4 | **部署参数里 PF-003 的两项（`copyNoticeTtlDefault`、`sharingInvitationTtlDefault`）没有消费它们的契约。**本版照样要值、校验、在完整体检里可见，但没有任何判定用到它们 | 复制通知与分享邀请的契约（尚未立） | 那两份契约立起来并消费它们 |
| G-5 | **已闭合（2026-09-23）**：线上的表示名与交换表示。闭合方式：主线裁定信封成员名、路由标识、登录成功答复与列表项的成员、各交换表示并认进命名账本，[S-4](#s-4-请求信封)、[S-9](#s-9-列表句柄)、[S-17](#s-17-路由表封闭每条路由的九件事从哪读)、[S-27](#s-27-governancecenterid-的形状与相等) 据此定稿 | — | 已闭合 |
| G-6 | **已闭合（2026-09-23）**：完整体检里「记过缺陷」那一项的字段名。闭合方式：主线裁定为 `defectCount`，[S-26](#s-26-完整体检) 据此定稿 | — | 已闭合 |
| G-7 | **「登录状态效力不变」以「不经备份恢复」为前提。**恢复会带回备份之后撤销的登录状态；[PF-001 flows §3.2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态) 的「已失效不可回到有效」没有写这个限定 | PF-001 owner（[PF-017 §9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#九未决项) 已登记） | PF-001 owner 认这个读法，或把「恢复后仍保住撤销」提成对备份与恢复的新要求 |
| G-8 | **中心自身被拆成多个进程之后**，[S-36](#s-36-装配给的保证-vs-协议须给的保证) 各行右列里的新鲜度界、δ 与「够不着某个领域时的收场」未定义 | 架构设计（本版单机，不阻断） | 分布式演化启动时给出，并作为本契约的新版本发布 |
| G-9 | **已闭合（2026-09-23）**：[S-17 命名表](#路由的线上成员命名表)是本契约首次命名，待主线认可。闭合方式：主线通读并认可进命名账本 | — | 已闭合 |
| G-10 | **传输绑定（路径、状态码、帧）没有版本化的工件。**本契约只约束落地必须保持的性质（[S-4](#s-4-请求信封) 的承载位置与重复成员、[S-6](#s-6-四种入口答复) 的整个线上答复逐字相同、[S-8](#s-8-协议版本与跨版本不变的两样) 跨版本不变的两样）；具体绑定没有可冻结、可按版本引用的工件，客户端代理与规范场景 [S-39](#s-39-规范场景拒绝逐字相同) 的逐字节比较都没有可对照的那一版 | 入口层的实现映射节点（[`realization/packages/tenancy/governance-center-entry`](../../../../realization/packages/tenancy/governance-center-entry/README.md)，`candidate`） | 该节点发布传输绑定，并作为冻结资源登记 |
| G-11 | **防冒充的具体手段。**「客户端确认连上的真是那个中心」是[产品交给技术设计的硬要求](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)，归传输那一层；本契约不以它为前提（[S-3](#s-3-本契约明确不承诺什么)），但它没有落点就没有人兑现 | 入口层的实现映射节点 | 节点给出机制与它的验证义务 |
| G-12 | **升级整体成或整体不成（[PF-017 §6.9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成)）与启动前只读核对（[§6.10](../../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走) 第 1 行）没有契约家。**本版由承载装配直接承接（[`realization/apps/tenancy-host`「升级的整体性」](../../../../realization/apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)）；它的残余（例如某一种存储方言上不满足整体性）只登记在那个节点里，在契约层与 registry 上看不见（[S-34](#s-34-起来即整体停机时在途请求归谁)） | 架构主线 | 立一份部署级契约，或并入本契约的新版本 |

## 十四、版本差异与规范工件

### S-47 本版是首版

没有被采用的旧版本，没有语义或表示差异可记。`realization/apps/cli` 节点里的拟议名「治理契约线上投影协议」**由本契约取代**，它从未成稿、未登记，不构成前身，不建立 lineage。

### S-48 本版的规范工件

本文件、[`governance-center-entry.schema.json`](governance-center-entry.schema.json)、[`examples.md`](examples.md)、
[`formal/EntryDecision.tla`](formal/EntryDecision.tla)、[`formal/EntryDecision.cfg`](formal/EntryDecision.cfg) 与九个 `formal/Validity_*.cfg`；与 catalog 登记的 `resources` 一致。
[`formal/README.md`](formal/README.md) 是导航页，随版本目录一并登记为资源。

**检查配置本身是规范工件**：它们固定了模型的常量与断言集合，也就固定了每条性质被检查的范围；改变范围须发新版本（接受之后）。
接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。
