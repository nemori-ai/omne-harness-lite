# composition.governance-center-entry v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, composition.governance-center-entry, 1)`
- **状态**：`candidate`。**产品依据的主责一份是草稿**：[PF-017](../../../../product/PF-017-governance-center-as-deployable-application/README.md) **rev 1，`draft`**（2026-09-23 第二轮修订之后的正文）。
  依赖它的每一条都是候选依据；PF-017 被接受之前，本契约不进入接受。
- **设计依据**：
  - PF-017 rev 1（draft）：[§部署前提](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署前提)、
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
- **参与方契约**（坐标与消费 clauses 见 [S-2](#s-2-参与方与精确承诺)，全部 `accepted`）：
  `capability.account-identity` v1、`capability.organization-governance` v1、`composition.account-registration` v1
- **精确语义依赖**：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`——
  本契约**不复述**任何身份值的定义，线上用它们的规范形式原样传；消费 clauses 见 [S-2](#s-2-参与方与精确承诺)。
  `data.offer-expiry` v1 只在 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「不触发」那一行被提及，**不是消费**。
- **为什么是一份组合契约**：判定次序、四种入口答复与身份推导对**每一个**请求都一样，横跨三份契约，
  任何一个单项能力都拥有不了；理由的长期家是
  [提案 · 入口契约为什么是一份 composition 契约](../../../../record/proposals/governance-center-entry/alternatives.md#入口契约为什么是一份-composition-契约)
  与[为什么不拆、为什么不并](../../../../record/proposals/governance-center-entry/design.md#为什么不拆为什么不并)。
- **本契约用到的四个技术名**，都**没有词条**（无词条），只在本契约里当技术名用，不是统一语言的正式名：
  **入口层**（无词条：兑现本契约客户端那一面的提供者）、**运维面**（无词条：[运维者](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)那一面在运行中的中心上唯一的部分）、
  **出示物**（无词条：信封成员 `presentedLoginState` 里携带的那个值）、**列表句柄**（无词条：成员 `loginStateHandle` 的值）。
- **条款编号**：`S-n`，只在本契约本版本内有效；外部引用写全坐标，如 `composition.governance-center-entry/v1#S-10`。
  编号在本版本内只追加、不重排。缺口 `G-n`、证据义务 `V-n`、静态检查 `SC-n` 同此作用域。
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
| `capability.account-identity` | `omne-harness-lite-design-2026-09-15 · capability.account-identity · v1`；[`#S-3`](../../../capabilities/account-identity/v1/contract.md#s-3-明确不承诺什么)（时序侧信道不在范围）、[`#S-10`](../../../capabilities/account-identity/v1/contract.md#s-10-撤销是持久记录不是内存生命周期)（撤销是持久记录）、[`#S-15`](../../../capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态)（登录）、[`#S-16`](../../../capabilities/account-identity/v1/contract.md#s-16-撤销登录状态)（撤销）、[`#S-17`](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态)（第 ② 步认人）、[`#S-29`](../../../capabilities/account-identity/v1/contract.md#s-29-撤销不等于强制停止)（撤销只影响下一道准入）、[`#S-30`](../../../capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)（第 3、6、8 行）、[`#S-37`](../../../capabilities/account-identity/v1/contract.md#s-37-列出本账号有效登录状态)（列出） | S-17 的四个出口封闭、`login-state-rejected` 不区分原因、撤销提交之后必拒；S-15 三种登录失败逐字相同；S-37 列出此刻全部有效的、必含调用方自己那一个 | `LoginStateId` **不可猜测**（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「出示物不可伪造」行）——那是出示物安全的地基，由它的提供者兑现 |
| `capability.organization-governance` | `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`；[`#S-16`](../../../capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案)（拒绝／不可用／表示层三类收场）、[`#S-21`](../../../capabilities/organization-governance/v1/contract.md#s-21-创建团队组织)～[`#S-37`](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份)（十七个操作，其中 [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 兼作补授权、[`#S-36`](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 兼作身份推导）、[`#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)（第 4、5、6、8、9 行）、[`#S-55`](../../../capabilities/organization-governance/v1/contract.md#s-55-读邀请)～[`#S-60`](../../../capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求)（六个读面） | 每个操作的失败集合封闭；「判不出来」一律 `unavailable`、表示层一律 `invalidInput`，不与拒绝合并；S-36 给出当前租户身份或 `loginStateNotValid`／`unavailable` | **它的面是能力间内部面**，调用方身份由本组合核实后才交给它（[`#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 8、9 行）——本组合就是那道核实 |
| `composition.account-registration` | `omne-harness-lite-design-2026-09-15 · composition.account-registration · v1`；[`#S-2`](../../account-registration/v1/contract.md#s-2-参与方与精确承诺)（「注册入口」一行）、[`#S-4`](../../account-registration/v1/contract.md#s-4-注册成功)、[`#S-5`](../../account-registration/v1/contract.md#s-5-终结结果集合)、[`#S-6`](../../account-registration/v1/contract.md#s-6-每个终结结果的含义与对应的存储状态)、[`#S-8`](../../account-registration/v1/contract.md#s-8-三步次序与责任交接)（被投影的那条动作链）、[`#S-12`](../../account-registration/v1/contract.md#s-12-重试规则)（重发）、[`#S-25`](../../account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) | 一次注册尝试的终结结果恰为四个值；`identifier-held-by-expired-record` 在它内部就地消化 | **本组合就是它的「注册入口」**：表示层校验归本组合；四个终结结果原样呈现；`interrupted` 不改写 |
| `data.identity-values` | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`；[`#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式)、[`#S-9`](../../../data/identity-values/v1/contract.md#s-9-loginstateid)、[`#S-11`](../../../data/identity-values/v1/contract.md#s-11-scopelayeridentity)、[`#S-16`](../../../data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)～[`#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)、[`#S-23`](../../../data/identity-values/v1/contract.md#s-23-不得冒充隔离)、[`#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)、[`#S-28`](../../../data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)、[`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)、[`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 身份值的形状与规范形式；隔离义务 | — |

**消费者**（本契约的兑现者与使用者，不是参与方）：兑现客户端一面与运维面的**入口层**（无词条），实现映射节点待立（候选位置 `realization/packages/tenancy/governance-center-entry`）；
承载它的装配 [`realization/apps/tenancy-host`](../../../../realization/apps/tenancy-host/README.md)（待修订）；据点一侧的客户端代理（`realization/apps/cli`，不在本程实施边界）。

### S-3 本契约明确不承诺什么

- **送达。**请求—答复，答复丢了由客户端重发；本契约不承诺任何一次答复送达，也不提供按请求去重（各路由的重发语义见 [S-17](#s-17-路由表封闭每条路由的九件事从哪读) 的第 5 件事）。
- **推送。**中心从不主动向据点发任何东西（[PF-016 §5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)）。领域能力的通知事件**不上线**。
- **限流与背压。**[产品非目标](../../../../product/PF-017-governance-center-as-deployable-application/design.md#非目标)。
- **跨协议版本的兼容窗口。**对不上就明说（[S-8](#s-8-协议版本与跨版本不变的两样)），不承诺新中心配旧客户端或反之。
- **传输机制。**信封与答复怎样落到某种传输上（头、路径、体、帧）归实现映射；本契约只约束[那次落地必须保持的性质](#s-4-请求信封)。
- **防冒充的具体手段。**「客户端确认连上的真是那个中心」是[产品交给技术设计的硬要求](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)，归传输那一层；它用到的材料是部署配置输入，**不是**[部署密钥](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-deployment-key--部署密钥--deployment-key)。本契约既不兑现它，也不以它为任何条款的前提。
- **会话。**路由表里没有任何会话操作；中心不知道任何会话。
- **时序侧信道。**与 [`capability.account-identity/v1#S-3`](../../../capabilities/account-identity/v1/contract.md#s-3-明确不承诺什么) 同一口径：「逐字相同」只约束答复本身，不约束耗时。
- **客户端一侧。**标识比较、「问不到」的呈现、三类现读的放行归 PF-016；本契约只给它们判定依据。
- **存储里的登录状态不可被直接冒用。**本版**做不到**，见 [G-1](#十三已知缺口)。

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

**传输落地的两条约束**：信封的每个成员在传输上各有唯一的承载位置，**不丢、不并、不重排出第二份**；
同一成员在传输上出现不止一次（例如两份出示物），按[「多个出示物」](#s-5-出示物)那一支判，不由实现挑其中一个。

形状由 [Schema](governance-center-entry.schema.json) 的 `Envelope` 给出。**Schema 校验不过对应哪一种答复，由 [S-10](#s-10-判定次序) 按不过的是哪个成员决定**，不是一律 `invalid-input`。

### S-5 出示物

- **出示物就是一个 [`LoginStateId`](../../../data/identity-values/v1/contract.md#s-9-loginstateid)**，按持有者即被认的方式使用（bearer）：
  持有它本身就是 [`capability.account-identity/v1#S-17`](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 校验的那件事。
- **恰好一个。**一个请求带了不止一个出示物 ⇒ [S-11](#s-11-认人) 判「无效」。
- **出示物不是「输入」，是身份。**它在表示层就不合格（不满足 [`data.identity-values/v1#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的交换表示）时，
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
| `invalid-input` | 那件事的输入在表示层就不合格；判定没有开始 | 改输入 | [§6.4 ④](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复) |

- **四个值不得合并，不得互相冒充。**尤其：**判不了永远不说成 `login-state-rejected`**；`unavailable` 既不是放行，也不是拒绝。
- **`unavailable` 对来者不带原因。**原因只在[完整体检](#s-26-完整体检)与[工程记录](#s-30-工程记录)里。
- **同一个值的每一次答复逐字相同**，覆盖**整个线上答复**——传输层的状态、头与体一并算，不只是一句文案。
  实现为每个值固定一份字节序列；除此之外答复里没有任何随请求变化的部分（没有请求编号、时间戳、原因码）。
- `login-state-rejected` 沿用 [`capability.account-identity/v1#S-17`](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 的字面；四个值与领域失败值同形（kebab-case）。

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

### S-9 列表句柄

**列表句柄**（无词条，成员 `loginStateHandle`）是[登录状态列表](#s-20-登录状态的两条路由撤销列出)与[撤销](#s-20-登录状态的两条路由撤销列出)在线上指认某一个登录状态用的值。

| 性质 | 内容 |
|---|---|
| 由出示物派生 | `loginStateHandle = H(LoginStateId)`。在同一个中心上，对同一个 `LoginStateId` 恒得到同一个句柄 |
| 不可逆 | 从句柄**得不到** `LoginStateId`；句柄**不是出示物**——拿句柄去当出示物，按「从没签发过」答 `login-state-rejected` |
| 部署内单射 | 同一中心上两个不同的 `LoginStateId` 不得得到同一个句柄；**万一**撤销时匹配到不止一项，按缺陷收场（[S-20](#s-20-登录状态的两条路由撤销列出)），不撤销任何一个 |
| 不是秘密 | 它可以出现在答复里与工程记录里 |
| 不产生新的持久事实 | 入口层**不保存**句柄与登录状态的对照；每次都由现读的列表重新算 |
| 交换表示 | 恰一种：64 个小写十六进制字符（Schema `LoginStateHandle`）。比较逐字符，不做规范化 |

`H` 的具体构造归实现映射；本契约只要求上表六条。
**为什么要它**：列表若给出 `LoginStateId` 本身，同一账号的任何一台设备列一次，就收走了其余设备的出示物——
撤销失窃设备之前，窃取者已经拿到了其余几个（[§8 不交出能直接用的凭证](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)）。

## 三、判定次序

### S-10 判定次序

**一个请求到达中心，恰按下面的次序走；任何一步判不了，就停在那一步答 `unavailable`，不再往下，永不改说成 `login-state-rejected`。
不用查就判得了的，照判。**

| 步 | 做什么 | 要查吗 | 这一步的出口 |
|---|---|---|---|
| **0 公开体检** | 请求是[公开体检的形状](#s-18-公开体检) ⇒ 直接答公开体检 | 不查 | 公开体检答复。**不看版本，不看出示物，不读存储** |
| **① 版本** | 信封不可解析、缺 `protocolVersion`、或它不在 `accepted_protocol_versions` 内 | 不查 | `version-mismatch`。**出示物一眼都不看** |
| **①′ 信封** | `operation` 缺席或不在路由表内，或信封有表外成员。（`payload` 缺席或不是对象不在这一步，属于下面的「载荷」） | 不查 | `invalid-input` |
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
`invalid-input` 只在「看得懂是哪一版、是哪件事，但那件事的输入不合格」时给出。

### S-11 认人

第 ② 步只看两件事：**是不是本中心签发的**、**此刻是否仍有效**（[§6.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)）。

| 出示物的情形 | 要查吗 | 答复 |
|---|---|---|
| 没带 | 不查 | `login-state-rejected` |
| 带了不止一个 | 不查 | `login-state-rejected` |
| 表示层不合格 | 不查 | `login-state-rejected`（[S-5](#s-5-出示物)） |
| 恰一个、形状合格 | 现读 [`capability.account-identity/v1#S-17`](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态) | 见下 |

| S-17 的出口 | 本步的收场 |
|---|---|
| `AccountId` | **认出了人**，带着这个 `AccountId` 往下走 |
| `login-state-rejected`（查不到、已撤销、所属账号未激活——**从没签发过、已退出或撤销、别的中心签的**都落在这里） | `login-state-rejected` |
| `invalid-input` | `login-state-rejected`。**本版到不了**：入口层判出示物的表示层用的是同一条 [`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)；前提一旦不成立，收场已经写在这里——出示物是身份，不是输入 |
| `storage-unavailable` | `unavailable` |

**六种不认的情形——没带、带了不止一个、表示层不合格、从没签发过、已退出或撤销、别的中心签的——在版本对得上、判得了时，整个线上答复逐字相同。**
从中心的任何拒绝里，读不出一个名字存不存在，也读不出一个登录状态曾经有没有过。
「别的中心签的」在本中心看来就是「查不到」，本中心不去、也无从分辨它是别处签发的还是从没存在过。

**认人时没有第四个出口**：「客户端已经验过了」「刚才还有效」「这台机器可信」「运维者说放行」都不是本步的输入，信封里也没有能承载它们的成员。

### S-12 身份推导

**交给领域操作的每一个身份值，都只从认人的结果推出；线上载荷里的身份值从不作授权依据。**

| 交给领域的身份值 | 从哪来 | 读不到／读到不作数时 |
|---|---|---|
| 调用方的 `AccountId` | 第 ② 步 S-17 给出的那一个 | —（已在第 ② 步定下） |
| 行事的 `TenantId`（发起者、调用方、接受者 `TenantId`） | 现读 [`capability.organization-governance/v1#S-36`](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)，参数是出示的那个 `LoginStateId`——即登录状态上[当前选中的租户身份](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity) | `unavailable` ⇒ `unavailable`；`loginStateNotValid` ⇒ `login-state-rejected`（其间被撤销，见 [S-33](#s-33-认出人之后登录状态被撤销)）；`invalidInput` 本版到不了，出现即缺陷（[S-14](#s-14-失败映射)） |
| 被传给领域的 `LoginStateId`（S-36、S-37 两条路由，以及 AI S-16／S-37） | 就是出示的那一个 | — |

- **推导发生在请求到达的那一刻，每个请求推一次，随请求交下去**；领域操作不在使用点重取当前租户身份
  （[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`#S-28`](../../../data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)）。
  **请求到达就是流程开始**，所以在这里取一次当前租户身份不是「在使用点现取」。
- **只有需要行事 `TenantId` 的路由才现读 S-36**（逐条见路由表）；只需要 `AccountId` 的路由不读它。
- **载荷里出现的身份值只作「对象」**（邀请谁、切到哪个租户身份、读哪个组织），由领域操作自己判它能不能被这样用；
  **载荷里没有「以谁的身份」这一格**——发起者、调用方、接受者的身份一律推导，不收。
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

| 路由 | 「该组织」是哪个 | 补的那一道 |
|---|---|---|
| [`#S-22`](../../../capabilities/organization-governance/v1/contract.md#s-22-读组织) 读组织 | 载荷里的那个 `OrganizationId` | 现读 [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)`((该组织, 调用方 AccountId))` |
| [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 成员资格判定 | 载荷里那个 `TenantId` 的组织分量 | 同上 |
| [`#S-34`](../../../capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) 上级链／有共同上级 | 载荷里的**每一个** `OrganizationId`（一个或两个） | 对每一个都现读一次；**全部有效才过** |
| [`#S-35`](../../../capabilities/organization-governance/v1/contract.md#s-35-层身份) 层身份 | 载荷里那个 `TenantId` 的组织分量 | 同上 |

| 那次现读的结果 | 收场 |
|---|---|
| `effective`（任一角色） | 过，往下调被投影的操作 |
| `ineffective` | 路由结果 `{ failure: "notAuthorized" }`，**不调**被投影的操作。产品反馈是[「你不在这个组织里」](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)（[PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)） |
| `{ failure: "unavailable" }` | `unavailable`——**不得收成 `notAuthorized`**，那是把判不了说成失权 |

- 「调用方」是第 ② 步认出的那个账号；**不是**当前租户身份——读一个组织不需要先切过去。
- 因为补授权排在前面，**一个不存在的组织在线上得到的是 `notAuthorized`**（没有人在不存在的组织里有效），
  `organizationDoesNotExist` 在这两条路由上到不了；这不泄漏任何组织的存在性。
- 本组合给 [`#S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 路由补的这一道，使一个人**问自己在一个他不在的组织里的效力**得到 `notAuthorized` 而不是 `ineffective`。这是这一道补授权的直接后果。
- [`#S-27`](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) 与 [`#S-57`](../../../capabilities/organization-governance/v1/contract.md#s-57-列出账号收到的待接受邀请) 不在此列：它们以「输入的 `AccountId` 就是调用者本人」为界，本组合交给它们的正是 S-17 给出的那一个。

### S-14 失败映射

**第 ③ 步的共同映射**，每条路由照此办，路由表只写例外：

| 领域给出的 | 线上答复 |
|---|---|
| 成功返回（该条款 ⑤） | `{ result: … }` |
| `capability.account-identity` 的 `storage-unavailable`；`capability.organization-governance` 的 `unavailable`（[三类收场之一](../../../capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案)）；`MembershipStandingResult` 的 `{ failure: "unavailable" }` | `unavailable` |
| 表示层不合格：AI 的 `invalid-input`、OG 的 `invalidInput`（[同上](../../../capabilities/organization-governance/v1/contract.md#s-16-缺席时的默认答案)）——**当这条路由向领域传了载荷项** | `invalid-input` |
| 同上——**当这条路由交给领域的全部输入都由入口层推导**（载荷为空，或载荷项只用于入口层自己的匹配） | `unavailable`，**并记为缺陷**：入口层自己产出的值被领域判为不合形状，错不在来者 |
| **「出示的那个登录状态此刻不作数」**：AI S-37 的 `login-state-rejected`、AI S-16 的 `not-authorized`、OG S-36／S-37 的 `loginStateNotValid` | `login-state-rejected`（[S-33](#s-33-认出人之后登录状态被撤销)） |
| 该条款失败集合里的其余具名值 | `{ failure: <原名> }`，**原样透传**，不改名、不合并、不加原因 |
| **失败集合之外的任何东西**（未列出的值、没有返回、抛出、返回了与该条款承诺矛盾的结果） | `unavailable`，**并记为缺陷**，在[完整体检](#s-26-完整体检)（`defectCount`）与[工程记录](#s-30-工程记录)里可见 |

- **缺陷答 `unavailable`**，不答 `login-state-rejected`（人会白白重新登录），也不答成功（在出错的地方给出看起来对的答案）。
  代价照实写：人被叫「稍后再试」，而缺陷不会自己好，要等运维者处理（[§6.6](../../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）。
- **「出示的登录状态不作数」为什么不原样透传**：那三个值只可能出自第 ② 步之后、第 ③ 步读到之前的一次撤销。
  透传出去，同一个「已撤销」就有了两种线上答复，[S-11](#s-11-认人) 的逐字相同在这个窗口里被打破。
- **结果为什么是封闭的**：路由结果的具名值全集就是各被投影条款失败集合的并，减去上表映射掉的那些；Schema 的 `RouteFailure` 把它枚举出来，没有「其他」。

### S-15 δ = 0：每个请求现读，入口不跨请求缓存

- **每个请求都现读**：第 ② 步现读 S-17，身份推导现读 S-36，补授权现读 S-26；领域操作按各自契约现读成员资格与角色。
- **入口层不跨请求缓存任何认人结果、授权判定、推导出的身份或成员资格效力**——一条都不缓存。
  撤销、退出、解除、降级、切换在提交之后，**下一个到达中心的请求**就看得到（[`data.identity-values/v1#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)、[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）。
- **这是中心一侧的承诺。**据点上的副本与它们的陈旧窗口归 PF-016（[§6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)：撤销在一台机器上生效的时刻，是它再连上中心的那一刻）。
- **将来要缓存，须发新版本**，并在其中写明失效条件与最大陈旧窗口；读面以「不可用」失败时不写入缓存。

### S-16 不记住来访，不区别对待来者

- **中心不因一次来访改变此后的任何判定**，也不登记来者是哪台机器、哪个程序（[flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来)）。入口层没有任何按来者保存的状态。
- **对端地址、机器、客户端程序一律不作资格**，不进任何判定（[`data.identity-values/v1#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)、[§6.2](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)）。
  同一个有效登录状态、同一件事，从哪里来都得到同一个答复；人用的那份客户端与一段脚本走同一条路（[PF-016 §6.5](../../../../product/PF-016-cli-tui-delivery-surface/design.md#65-人能做的脚本能做脚本能做的人能做)）。
- **中心上不存在「可信机器」「可信程序」的登记，也不存在接受外部担保的成员。**

## 四、路由表

### S-17 路由表封闭；每条路由的九件事从哪读

**路由表是一张封闭的、逐条写明的映射**：每条路由对应一个被投影的操作，**没有泛化的分派**
（没有「按名字调用某个能力的某个操作」这种路由）。表外的 `operation` ⇒ `invalid-input`（[S-10](#s-10-判定次序) ①′）。

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
| **9 装配给／协议给** | 见 [S-36](#s-36-装配给的保证-vs-协议须给的保证) | 相关的那一行 |

**成员名规则**：各路由载荷项与成功返回的线上成员名，**沿被投影条款所在契约的 Schema 里的成员名，入口层不改名、不另起别名**；
身份值按 `data.identity-values` v1 的规范形式。路由表按被投影条款 ① 的项与 ⑤ 的返回指认它们，形状以那份契约为准。
本契约自己定名的只有两处：登录成功的返回 `{ loginState, loginStateHandle }`（[S-19](#s-19-免认人的两条路由注册登录)），
登录状态列表的每一项 `{ loginStateHandle, issuedAt }`（[S-20](#s-20-登录状态的两条路由撤销列出)）。

> **这条规则此刻只在有 Schema 的地方有着落**：身份值与邀约时效的成员名来自 `data.identity-values` v1 与 `data.offer-expiry` v1 的 Schema；
> 而三份参与方契约 v1 都明文不发布 Schema，它们 ① 的项与 ⑤ 的返回在正文里是描述，不是成员名。
> 那些成员在参与方发布 Schema 之前没有可引用的名字，入口层不替它们取。

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

| 路由 | 身份怎么推 | 载荷 | 返回与映射 | 重发 |
|---|---|---|---|---|
| **注册** `composition.account-registration/v1#S-8` | 无身份可推 | 登录标识、凭据材料。**表示层校验归本组合**（[该组合 S-2「注册入口」一行](../../account-registration/v1/contract.md#s-2-参与方与精确承诺)）：不合格 ⇒ `invalid-input`，**不交进去**（交进去的收场是 `interrupted`）。登录标识按 `data.identity-values` v1 的登录标识形状判；凭据材料的表示层规则与账号能力提供者判「凭据材料」的规则**同源**，入口层不自定第二套 | [四个终结结果](../../account-registration/v1/contract.md#s-5-终结结果集合)：`registered`（[注册成功](../../account-registration/v1/contract.md#s-4-注册成功)）⇒ `{ result: "registered" }`；`identifier-taken`／`credential-rejected`／`interrupted` ⇒ `{ failure: <原名> }`。**`interrupted` 原样呈现，不改写**——不改成成功、不改成 `identifier-taken`，**也不改成 `unavailable`**：它已经含着「底层不可用」那一支（[该组合 S-6](../../account-registration/v1/contract.md#s-6-每个终结结果的含义与对应的存储状态)），其产品措辞就是「这次没有注册成功」。`identifier-held-by-expired-record` **结构上到不了**本组合（它在注册组合内部就地消化）；出现即缺陷 | 按[该组合 S-12](../../account-registration/v1/contract.md#s-12-重试规则)：同一标识、同一凭据重来，接着走完或得 `identifier-taken`（激活已提交而回执丢失时） |
| **登录** `capability.account-identity/v1#S-15` | 无身份可推 | 登录标识、凭据材料（表示层校验同上一行） | 成功 ⇒ `{ result: { loginState, loginStateHandle } }`：`loginState` 是**新签发的 `LoginStateId`（出示物在全部输出里唯一出现的一处）**，`loginStateHandle` 是它的列表句柄——客户端据后者在列表里认出自己、用它退出。`identifier-or-credential-rejected` 原样透传：**三种登录失败逐字相同**（[S-15](../../../capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态)）。`invalid-input` ⇒ `invalid-input`；`storage-unavailable` ⇒ `unavailable` | **不幂等**：重发会签发另一个登录状态；多出来的那个在列表里看得见、撤得掉（[S-15 在途归属](../../../capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态)） |

提交点：注册是[激活那一次提交](../../account-registration/v1/contract.md#s-8-三步次序与责任交接)；登录是登录状态记录写入的那一次提交。

### S-20 登录状态的两条路由：撤销、列出

两条都经第 ② 步；交给领域的 `LoginStateId` 就是出示的那一个。

| 路由 | 身份怎么推 | 载荷 | 返回与映射 | 重发 |
|---|---|---|---|---|
| **撤销（含退出）** `capability.account-identity/v1#S-16` | 发起方 = 出示的 `LoginStateId`；**目标由句柄匹配得出**：现读 [`#S-37`](../../../capabilities/account-identity/v1/contract.md#s-37-列出本账号有效登录状态)`(出示的那一个)`，在列表里找句柄等于载荷里那一个的项，恰一项 ⇒ 以它的 `LoginStateId` 为目标调 [`#S-16`](../../../capabilities/account-identity/v1/contract.md#s-16-撤销登录状态) | `loginStateHandle`（必需，无默认值——**缺席不是「退出自己」**；退出就是带上自己那一个的句柄） | 成功 `ok`。**匹配不到 ⇒ `{ failure: "login-state-not-found" }`**——与 S-16 把「不存在」「不是你的」并成的那一个值逐字相同，产品反馈是[「这个登录已经不在有效之列」](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)。**匹配到不止一项 ⇒ 缺陷**，`unavailable`，一个都不撤。S-37 那次现读：`login-state-rejected` ⇒ `login-state-rejected`，`storage-unavailable` ⇒ `unavailable`，`invalid-input` ⇒ 缺陷。S-16：`login-state-not-found` 透传，`not-authorized` ⇒ `login-state-rejected`，`invalid-input` ⇒ 缺陷，`storage-unavailable` ⇒ `unavailable` | 撤销已提交、答复丢了之后重发：**撤的是别的那一个** ⇒ 它已不在列表里 ⇒ `login-state-not-found`；**撤的是自己（退出）** ⇒ 第 ② 步就 `login-state-rejected`。**两者都是「已经撤掉了」的可观察形式**；线上**没有** S-16「已撤销 ⇒ `ok`」那一支，因为入口层拿不到已撤销那个的 `LoginStateId` |
| **列出** `capability.account-identity/v1#S-37` | 调用方 = 出示的 `LoginStateId` | 无（空对象） | 成功 ⇒ `{ result: [ … ] }`，每一项恰为 `{ loginStateHandle, issuedAt }`（签发时间，RFC 3339），**不含 `LoginStateId`**。空列表 ⇒ 缺陷（成功调用必含调用方自己那一个）。`login-state-rejected` ⇒ `login-state-rejected`；`storage-unavailable` ⇒ `unavailable`；`invalid-input` ⇒ 缺陷 | 纯读 |

撤销路由的提交点是 S-16 那一次提交；它之前的 S-37 是纯读。**在两次调用之间目标被别处撤掉**，S-16 按它自己的幂等返回 `ok`——这次撤销想要的状态已经成立。

### S-21 组织治理：写路由

全部经第 ② 步。「S-36」指[身份推导](#s-12-身份推导)现读得到的当前租户身份；「S-17」指第 ② 步认出的 `AccountId`。
提交点一律是被投影条款 ④ 的单次提交。

| 路由 `capability.organization-governance/v1#…` | 交给领域的身份 | 载荷（该条款 ① 的哪几项） | 透传的具名值 | 重发 |
|---|---|---|---|---|
| [`S-21`](../../../capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) 创建团队组织 | 创建者 `AccountId` ← S-17 | 创建键（可选） | `accountNotActivated`、`accountDoesNotExist` | 带创建键 ⇒ 认回同一个组织；**不带 ⇒ 每次一个新组织**。客户端要安全重发，就带创建键 |
| [`S-23`](../../../capabilities/organization-governance/v1/contract.md#s-23-发出邀请) 发出邀请 | 发起者 `TenantId` ← S-36 | 目标 `AccountId`、指定角色（可选）、时长（可选） | `issuerIsPersonalOrganization`、`notAuthorized`、`accountNotActivated`、`accountDoesNotExist`、`alreadyAnEffectiveMember`、`invalidOfferDuration` | 不幂等：重发多一份邀请（该条款 ⑦：不制造新状态）。**时长是否为正由领域判**，`invalidOfferDuration` 原样透传；入口层对时长只校验「它是一个时段的交换表示」 |
| [`S-24`](../../../capabilities/organization-governance/v1/contract.md#s-24-撤回邀请) 撤回邀请 | 发起者 `TenantId` ← S-36 | `InvitationId` | `invitationDoesNotExist`、`notAuthorized`、`alreadyConcluded` | 幂等：已撤回 ⇒ `ok` |
| [`S-25`](../../../capabilities/organization-governance/v1/contract.md#s-25-接受邀请) 接受邀请 | 接受者 `AccountId` ← S-17 | `InvitationId` | `invitationDoesNotExist`、`offerNoLongerValid`、`notTheInvitedAccount`、`accountNotActivated`、`accountDoesNotExist`、`alreadyAnEffectiveMember` | 已接受、答复丢了之后重发 ⇒ `offerNoLongerValid`；客户端据「我的租户」确认自己已在其中 |
| [`S-28`](../../../capabilities/organization-governance/v1/contract.md#s-28-调整角色) 调整角色 | 发起者 `TenantId` ← S-36 | 目标 `TenantId`、目标角色 | `notAuthorized`、`membershipNotEffective`、`wouldLeaveNoSuperAdministrator` | 幂等 |
| [`S-29`](../../../capabilities/organization-governance/v1/contract.md#s-29-解除成员) 解除成员 | 发起者 `TenantId` ← S-36 | 目标 `TenantId` | `personalOrganizationMemberCannotLeave`、`notAuthorized`、`membershipNotEffective`、`wouldLeaveNoSuperAdministrator` | 已解除后重发 ⇒ `membershipNotEffective` |
| [`S-30`](../../../capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) 发出隶属请求 | 发起者 `TenantId` ← S-36 | 接收方 `OrganizationId`、方向、时长（可选） | `personalOrganizationTakesNoPartInAffiliation`、`notAuthorized`、`organizationDoesNotExist`、`wouldFormACycle`、`invalidOfferDuration` | 不幂等，同 S-23 |
| [`S-31`](../../../capabilities/organization-governance/v1/contract.md#s-31-撤回隶属请求) 撤回隶属请求 | 发起者 `TenantId` ← S-36 | `AffiliationRequestId` | `affiliationRequestDoesNotExist`、`notAuthorized`、`alreadyConcluded` | 幂等 |
| [`S-32`](../../../capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) 接受隶属请求 | 接受者 `TenantId` ← S-36 | `AffiliationRequestId` | `affiliationRequestDoesNotExist`、`offerNoLongerValid`、`notAuthorized`、`alreadyHasAParentOrganization`、`wouldFormACycle`、`personalOrganizationTakesNoPartInAffiliation` | 已接受后重发 ⇒ `offerNoLongerValid` |
| [`S-33`](../../../capabilities/organization-governance/v1/contract.md#s-33-解除隶属) 解除隶属 | 发起者 `TenantId` ← S-36 | 下级 `OrganizationId` | `noSuchAffiliation`、`notAuthorized` | 已解除后重发 ⇒ `noSuchAffiliation` |

**邀请的对象按 `AccountId` 指认**，不按登录标识——按登录标识指认被邀请者本版没有承载，见 [G-3](#十三已知缺口)。

### S-22 组织治理：读路由与补授权

全部经第 ② 步；标「补授权」的四条先过 [S-13](#s-13-补授权)。全部纯读，无提交；可任意重复。

| 路由 `capability.organization-governance/v1#…` | 交给领域的身份 | 补授权 | 载荷 | 透传的具名值与例外 |
|---|---|---|---|---|
| [`S-22`](../../../capabilities/organization-governance/v1/contract.md#s-22-读组织) 读组织 | 无 | 有 | `OrganizationId` | `notAuthorized`（补授权给出）；`organizationDoesNotExist` 经补授权到不了 |
| [`S-26`](../../../capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) 成员资格判定 | 无 | 有 | `TenantId` | `notAuthorized`（补授权给出）。成功 ⇒ 一个 `MembershipStanding`；`{ failure: "unavailable" }` ⇒ `unavailable` |
| [`S-27`](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) 我的租户 | `AccountId` ← S-17 | 无 | 无 | 无具名值。`invalidInput` ⇒ 缺陷。**空列表 ⇒ 缺陷**：认得出的来者是已激活的账号，而已激活的账号[本版不可能一个有效租户都没有](../../../capabilities/organization-governance/v1/contract.md#s-27-我的租户) |
| [`S-34`](../../../capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) 上级链／有共同上级 | 无 | 有（每一个组织） | 一个或两个 `OrganizationId` | `notAuthorized`（补授权给出）；`organizationDoesNotExist` 经补授权到不了 |
| [`S-35`](../../../capabilities/organization-governance/v1/contract.md#s-35-层身份) 层身份 | 无 | 有 | `TenantId` | `notAuthorized`（补授权给出）。返回的两个 `ScopeLayerIdentity` 按 [`data.identity-values/v1#S-11`](../../../data/identity-values/v1/contract.md#s-11-scopelayeridentity) 带判别式原样给出 |
| [`S-55`](../../../capabilities/organization-governance/v1/contract.md#s-55-读邀请) 读邀请 | 调用方身份按载荷里的判别式：`account` ⇒ `AccountId` ← S-17；`tenant` ⇒ `TenantId` ← S-36 | 无 | `InvitationId`、调用方身份的判别式（`account`／`tenant`，不含身份值本身） | `invitationDoesNotExist`。判别式缺席或不在集合内 ⇒ `invalid-input`，**入口层不替它猜是哪一支** |
| [`S-56`](../../../capabilities/organization-governance/v1/contract.md#s-56-读隶属请求) 读隶属请求 | 调用方 `TenantId` ← S-36 | 无 | `AffiliationRequestId` | `affiliationRequestDoesNotExist` |
| [`S-57`](../../../capabilities/organization-governance/v1/contract.md#s-57-列出账号收到的待接受邀请) 列出账号收到的待接受邀请 | `AccountId` ← S-17 | 无 | 过滤开关（可选） | 无具名值 |
| [`S-58`](../../../capabilities/organization-governance/v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 列出组织发出的邀请与隶属请求 | 调用方 `TenantId` ← S-36 | 无 | 过滤开关（可选） | `notAuthorized` |
| [`S-59`](../../../capabilities/organization-governance/v1/contract.md#s-59-列出组织成员) 列出组织成员 | 调用方 `TenantId` ← S-36 | 无 | 过滤开关（可选） | `notAuthorized` |
| [`S-60`](../../../capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求) 列出组织收到的隶属请求 | 调用方 `TenantId` ← S-36 | 无 | 过滤开关（可选） | `notAuthorized` |

**读成员名单、邀约、隶属请求时的组织是当前租户身份的那个组织**（S-58～S-60 与 S-56 的调用方 `TenantId` 来自 S-36）；要读另一个组织的，先切过去。

### S-23 当前租户身份的两条路由

| 路由 `capability.organization-governance/v1#…` | 交给领域的身份 | 载荷 | 返回与映射 | 提交与重发 |
|---|---|---|---|---|
| [`S-36`](../../../capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 当前租户身份查询 | `LoginStateId` = 出示的那一个 | 无 | 成功 ⇒ `{ result: TenantId }`（规范形式）。`loginStateNotValid` ⇒ `login-state-rejected`；`invalidInput` ⇒ 缺陷 | 纯读 |
| [`S-37`](../../../capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份) 切换当前租户身份 | `LoginStateId` = 出示的那一个 | 目标 `TenantId` | `ok`；透传 `notOwnTenant`、`membershipNotEffective`；`loginStateNotValid` ⇒ `login-state-rejected` | 单次提交；幂等 |

**切换提交之后，下一个请求的身份推导就读到新值**（[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)）。本路由**不是**[三类现读](../../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)的放行者——那一侧归据点；本契约只保证中心此刻的答案是现读的。

### S-24 有意不投影

下列操作**没有路由**。路由表是封闭的，不在表里就是没有这扇门，不是「有门但被拒」。

| 不投影的 | 为什么 |
|---|---|
| `capability.account-identity/v1` 的 S-13、S-14、S-38 | 只归注册组合（它们的唯一调用方）；从线上直接够到，`identifier-held-by-expired-record` 就流向了终端（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的对应行） |
| `capability.account-identity/v1` 的 S-18（读账号） | 它以「持有 `AccountId` 即可读」为授权；上线等于让任何拿到一个 `AccountId` 的人读它的激活与过期状态 |
| `capability.account-identity/v1` 的 S-17 作为一条路由 | 它是每个经 ② 的请求的第 ② 步，不另开一条 |
| `capability.organization-governance/v1` 的 S-20（创建个人组织） | 只归注册组合的动作链 |
| `capability.organization-governance/v1` 的 S-53（清除个人组织） | 它没有授权前置，只能由注册组合的清除链调用；上线就是一条直接删任何账号个人组织的入口 |
| `composition.account-registration/v1` 的清除链 | 由清扫与注册主链发起，不是来者的动作 |
| 任何存储级、时钟级、部署级的面 | 中心的两张面没有第三张（[§5.1](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)）；客户端一面**没有任何写部署事实的操作**，也读不到完整体检 |
| 任何会话操作 | 中心不知道任何会话 |

## 五、运维面

### S-25 运维面只在中心所在的机器上，且没有治理路由

- **运维面**（无词条）是运行中的中心上属于[运维者](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)那一面的**唯一**部分，**只在中心所在的机器上可达**，与客户端一面**不共用任何通道**。
  「只在本机可达」是部署边界（谁握着那台机器），**不是任何治理判定的输入**；客户端一面从不按对端地址放行（[S-16](#s-16-不记住来访不区别对待来者)）。
- **运维面上恰有一个操作：读[完整体检](#s-26-完整体检)。**没有任何路由映射到 `capability.account-identity`、`capability.organization-governance`、`composition.account-registration` 的任何操作——
  **不是「有但被拒」，是没有**（[§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)）。
- 它**不写任何持久事实**。部署事实（密钥、参数、版本、启停）的改动在中心停着时、在产品之外做，不经运维面。
- **这一条靠什么成立要说实话**：进程内没有访问边界可依（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「运维者没有门」行），它靠三件事一起——通道分离、运维面所在的单元不引用任何治理能力、这条通道上没有治理路由；后两件由静态检查守（[SC-2](../verification.md#静态检查义务)）。
  **产品挡不住一个直接翻数据的人**，那归组织对那台机器的访问管理。

### S-26 完整体检

| 九件事 | 内容 |
|---|---|
| **1 输入与授权** | 无输入。无产品层授权：够得到运维面的就是握着那台机器的人（[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由)） |
| **2 前置** | 中心在应答 |
| **3 提交点与原子性** | 无。纯读 |
| **4 返回与失败集合** | `{ reachable, centerId, version, startedAt, storageReachable, deploymentKeyPresent, deploymentKeyComplete, clockSane, defectCount, deploymentParameters }`，恰此十项。**失败集合为空**：每一项读不到都是一个答案（`false`），不是一次失败 |
| **5 幂等边界与重发** | 纯读，任意重复 |
| **6 事件** | 无 |
| **7 缺席时的默认答案** | `storageReachable`：**本次读取时**现探数据所在，探不通 ⇒ `false`；`clockSane`：**本次读取时**现读钟，读不到或比中心用过的最晚时刻早 ⇒ `false`；`defectCount`：自本次启动以来记过的缺陷数（[S-14](#s-14-失败映射)），非负整数，重启归零；「记过缺陷」即 `defectCount > 0`。**不以「上一次读到的」顶替** |
| **8 在途归属** | 无 |
| **9 装配给／协议给** | 见 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「运维者没有门」与「中心标识与治理事实同一存储」两行 |

| 项 | 含义 |
|---|---|
| `reachable`、`centerId`、`version` | 与[公开体检](#s-18-公开体检)同 |
| `startedAt` | 这一次启动成功的时刻（中心的钟） |
| `deploymentKeyPresent`、`deploymentKeyComplete` | [部署密钥](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-deployment-key--部署密钥--deployment-key)**启动时载入的结果**，不是现在去看文件。缺了或不完整中心本来就起不来，所以中心在应答时两项都是 `true`；中心开着时机器上那份被删了，照旧是 `true`，下次启动才起不来（[§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)） |
| `defectCount` | 自本次启动以来记过的缺陷数（[S-14](#s-14-失败映射)）：非负整数，启动时为 0，重启归零。它说「中心自身出过故障」，不说是哪个请求、哪个人——缺陷的细节只在[工程记录](#s-30-工程记录)里 |
| `deploymentParameters` | 五项[部署参数](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-deployment-parameter--部署参数--deployment-parameter)此刻生效的值（启动时读入）：`unactivatedRetention`、`invitationTtlDefault`、`affiliationRequestTtlDefault`、`copyNoticeTtlDefault`、`sharingInvitationTtlDefault`。**五项缺一不可，不出厂默认**；每项是一个时长，以正整数毫秒表示。后两项本版**没有消费它们的契约**（[G-4](#十三已知缺口)）：照样要值、照样校验、照样在这里可见 |

**不含**：部署密钥的值、任何凭据的值、任何治理事实（账号有几个、组织有哪些、谁登录着、谁邀请了谁）。
**也不含**与部署参数同类、但不属于部署参数的技术参数（例如创建键的保留期、凭据规则）——它们不是[部署参数](../../../../product/PF-017-governance-center-as-deployable-application/design.md#部署参数)。

## 六、治理中心标识

### S-27 GovernanceCenterId 的形状与相等

- **`GovernanceCenterId` 是[治理中心标识](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)的值类型**，随本契约 Schema 定义：一个 **128 位随机值**，
  规范形式**恰有一种**——32 个小写十六进制字符。**相等只在这个形式上定义**：逐字符相等；大写、带空白、带分隔符的都不是合法值。
  口径与 [`data.identity-values/v1#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式) 对 `TenantId` 的规定同形：一种形式、一个比较规则，不做任何规范化。
- **「是同一个中心」＝ 标识相等**；不同即另一个中心（[§6.12](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来)）。
- 它**不是地址，不是秘密**，不由运维者起名，**不从部署密钥、地址或任何运行实例的身份派生**。
- 它**只管「是不是同一个」，不证明「真的是它」**——防冒充不在本契约（[S-3](#s-3-本契约明确不承诺什么)）。

### S-28 铸造、存放与不变

| 九件事 | 内容 |
|---|---|
| **1 输入与授权** | 无输入。不是一个线上操作：它是入口层**每次启动**时做的一件事，没有任何人能从任何一面触发它 |
| **2 前置** | 数据所在够得着，且**读得出**标识那一格的状态 |
| **3 提交点与原子性** | **首次启动的提交点**：读出「这份数据里还没有标识」⇒ 生成一个、写进**与治理事实同一个存储**的那一次提交。这次提交**不写任何治理事实**——中心生来是空的。之前任何一步失败，就还没有标识，下一次启动仍然算第一次 |
| **4 返回与失败集合** | 启动成功 ⇒ 这次运行期间的 `centerId` 定下（公开体检与完整体检都读它）。**读不到 ⇒ 启动失败**；**写不进 ⇒ 启动失败**。失败集合恰为这两支，都让中心不起来，不产生一个「没有标识的运行中的中心」 |
| **5 幂等边界** | **读到已有的标识 ⇒ 用它，不再铸。**同一份数据上每次启动得到同一个值 |
| **6 事件** | 无 |
| **7 缺席时的默认答案** | **「读不到」绝不当作「还没有」**：存储此刻读不出那一格 ⇒ 启动失败，**绝不铸一个新的**——那会把一次抖动变成「另一个中心」，全组织的据点一夜之间认不出它 |
| **8 在途归属** | 首次写入中途崩溃：那次提交要么成立（下次读到它），要么没有（下次仍是第一次）；没有第三种 |
| **9 装配给／协议给** | 见 [S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「中心标识与治理事实同一存储」行 |

**性质**：

1. **一生不变**：此后没有任何写路径改它——客户端一面没有、运维面没有、部署动作也不改它。
   停机、重启、升级、换密钥、改参数、搬家、从备份恢复，都是同一个标识；**只有从零重立才换**。前提：用的是同一份数据。
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
| 部署密钥的值 | 无（生成它的办法在交出时给过一次，那不是中心运行时的输出） |
| 账号的凭据材料 | 无 |
| [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)的值 | 无。**本契约对它只承诺「不进任何输出」**，不承诺「在数据里读不出来」（[§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)） |
| 出示物（`LoginStateId`） | **恰一处**：登录路由成功时交出新签发的那一个（[S-19](#s-19-免认人的两条路由注册登录)） |

列表句柄不是秘密，可以出现。

### S-30 工程记录

入口层对每一个请求留一条可定位、可解释的工程记录（[SYS-OBSERVABILITY C1／C3](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)），至少分得出：
走到了判定次序的哪一步、给出了四种入口答复里的哪一种或哪一个路由结果、`unavailable` 是哪一类判不了（存储、钟、缺陷）、缺陷是哪条路由的哪个领域答复。

**边界**（[flows §1.3](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#13-一个客户端带着登录状态来)、[C6](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)）：

- **不记对端地址**；
- **账号与租户只以不可逆的关联号出现**，从记录里还原不出 `AccountId`、`TenantId`；
- 不含 [S-29](#s-29-秘密不进任何输出) 列出的任何一样；
- 对来者逐字相同的那六种不认情形，记录里**可以**区分「没带／多个／表示层不合格」与「查过了、不认」——后者内部三种（从没签发、已撤销、别的中心签的），[S-17 本身就不区分](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态)，记录里也分不出。

运维者读这些记录，与「握着磁盘的人」是同一类事，**不是产品开给他的一扇门**（[§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)）。

## 八、性质与前提

### S-31 不变量与安全性质

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **版本先于一切**：版本对不上时，除公开体检外只答 `version-mismatch`，出示物没被看过，那件事没发生 | [S-10](#s-10-判定次序) ① | — | [§6.4 ①](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)、[§6.16](../../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说) |
| **只认自己签发的、此刻有效的** | [S-11](#s-11-认人)：每请求现读 S-17 | `LoginStateId` 不可猜测（[S-36](#s-36-装配给的保证-vs-协议须给的保证)） | [§6.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数) |
| **判不了不下结论**：任何一步判不了 ⇒ `unavailable`；永不说成 `login-state-rejected`，永不放行，永不拿旧答案或空清单顶 | [S-10](#s-10-判定次序)、[S-14](#s-14-失败映射)、[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存) | 领域契约把判不了收成各自的不可用值（它们都是） | [§6.4 ②](../../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复) |
| **拒绝不泄漏**：六种不认情形同一个线上答复；认出人之后才读到的撤销也是这一个 | [S-11](#s-11-认人)、[S-14](#s-14-失败映射)、[S-33](#s-33-认出人之后登录状态被撤销)、[S-6](#s-6-四种入口答复) 的逐字相同 | 时序侧信道不在范围 | [§6.5](../../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说) |
| **此刻有效才认**（中心一侧 δ = 0） | [S-15](#s-15-δ--0每个请求现读入口不跨请求缓存) | — | [§6.3](../../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)、[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) |
| **没有替身担保，不区别对待来者** | [S-11](#s-11-认人)、[S-16](#s-16-不记住来访不区别对待来者) | — | [§6.2](../../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端) |
| **认出来者不削弱隔离**：交给领域的身份只从认人推出；隔离判定仍在各 owner 的数据访问层 | [S-12](#s-12-身份推导)、[S-13](#s-13-补授权) | 各 owner 兑现 `data.identity-values` v1 的隔离义务 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) |
| **两张面，没有第三张**：客户端一面只有路由表里的路由；运维面只有完整体检；没有「内部」「管理」「脚本专用」入口 | [S-17](#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](#s-24-有意不投影)、[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由) | 静态检查 [SC-1](../verification.md#静态检查义务)～[SC-3](../verification.md#静态检查义务) 落地 | [§5.1](../../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张) |
| **运维者没有门，超管没有部署的门** | [S-24](#s-24-有意不投影)、[S-25](#s-25-运维面只在中心所在的机器上且没有治理路由) | 同上；直接翻数据的人挡不住 | [§6.13](../../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)、[flows §4](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#四角色与操作) |
| **秘密不进任何输出；体检不越界** | [S-18](#s-18-公开体检)、[S-26](#s-26-完整体检)、[S-29](#s-29-秘密不进任何输出) | 模型凭据只到「不进输出」 | [§6.14](../../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)、[§6.17](../../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁) |
| **中心标识一生不变；两次从零首启不同** | [S-28](#s-28-铸造存放与不变) | 同一份数据；碰撞按概率界 | [§4 中心标识](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心标识)、[§6.12](../../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来) |
| **过期只量中心的钟** | [S-4](#s-4-请求信封)：信封不含时间 | — | [§5.4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#54-中心自己的时间) |
| **来往里没有会话；中心从不主动发** | [S-3](#s-3-本契约明确不承诺什么)、[S-24](#s-24-有意不投影) | — | [PF-016 §4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)、[§5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧) |
| **登录状态的效力只由退出与撤销改变**（重启、升级、换密钥、改参数都不改） | 登录状态记录在存储里（[`capability.account-identity/v1#S-10`](../../../capabilities/account-identity/v1/contract.md#s-10-撤销是持久记录不是内存生命周期) 的既有性质）＋ 本组合不缓存、不另存 | **不经备份恢复**（[S-36](#s-36-装配给的保证-vs-协议须给的保证) 的「效力不变」行；[G-5](#十三已知缺口)） | [§6.7](../../../../product/PF-017-governance-center-as-deployable-application/design.md#67-重启不让任何人退出登录) |

### S-32 进展性质与前提

前提编号只在本表内作行标：**P1** 中心在运行且够得到；**P2** 数据所在够得着；**P3** 时钟读得到且未倒退；**P4** 版本对得上；
**P6** 其间没有从备份恢复；**P8** 未激活记录在留存期限内；**P9** 账号已激活、来者持有凭据。

| 进展 | 前提 | 前提不成立时来者看到什么 | 前提由谁负责 |
|---|---|---|---|
| 带着有效登录状态来的请求，**这一次**就得到领域的答复（做成了，或按 PF-001 的理由没做成） | P1、P2、P3、P4 | P1 不成立：什么都得不到（问不到）；P2／P3：`unavailable`；P4：`version-mismatch`——**三者都不是 `login-state-rejected`** | P1～P3 归运维者（钟的运行中回拨检出归时钟的提供者，见 [S-36](#s-36-装配给的保证-vs-协议须给的保证)）；P4 归运维者与客户端一起升级 |
| 答过 `unavailable` 之后，P2、P3 一恢复，**同一个登录状态的下一个请求**就照常，不需要重新登录 | P1 | 同上 | 同上 |
| 重启或升级成功之后，此前有效的登录状态**不重新登录就能用** | 启动成功；P6 | P6 不成立：备份之后签发的得 `login-state-rejected`，备份之后撤销的**又能用了**（[flows §1.6](../../../../product/PF-017-governance-center-as-deployable-application/flows.md#16-从备份恢复)） | 恢复在产品之外做，归运维者；读法待 PF-001 owner 认（[G-5](#十三已知缺口)） |
| 登录状态失效的人重新登录，得到一个新的登录状态，当前租户身份从个人组织起算 | P1～P4、P9 | P9 不成立：`identifier-or-credential-rejected` | 账号能力 |
| 停机时注册走到一半的人，起来之后用同一标识同一凭据接着走完 | P1、P8 | P8 不成立：那条记录已清，名字按新注册走 | 注册组合 |
| 空中心上，任何够得到它的人都能注册、登录、建组织并成为那个组织的超管 | P1～P4 | 同第一行 | 同第一行 |

**上界**：每一行都是「这一次」「下一个请求」这种有界形式——入口层不排队、不重试、不等待前提恢复；前提成立时，一个请求在它自己的处理里得到答复
（形式证据：[EntryDecision.tla](formal/EntryDecision.tla) 的 `EventuallyAnswered`，前提写在 [formal 入口](formal/README.md)）。
中心起不来之后运维者补上被点名的那一样就能起、丢了密钥换一套就能起、改了参数下次启动生效——这几条归承载装配，不在本契约。

## 九、并发、撤除与替换

### S-33 认出人之后登录状态被撤销

第 ② 步认出人之后、第 ③ 步提交之前，出示的那个登录状态可能在别处被撤销：

- **领域操作照常执行**，除非它自己又读了那个登录状态——[撤销只影响下一道尚未通过的准入](../../../capabilities/account-identity/v1/contract.md#s-29-撤销不等于强制停止)，这一次的准入已经在第 ② 步通过了。
- **身份推导或领域操作读到「出示的登录状态已不作数」**（OG S-36／S-37 的 `loginStateNotValid`、AI S-37 的 `login-state-rejected`、AI S-16 的 `not-authorized`）⇒ **`login-state-rejected`**，与在第 ② 步被拒逐字相同（[S-14](#s-14-失败映射)）。
- 无论哪一支，**下一个请求**在第 ② 步就被拒。

### S-34 起来即整体；停机时在途请求归谁

- **起来即整体。**客户端一面要么以**整张路由表**开始应答，要么根本不应答；不存在「一部分路由在服务、另一部分不在」的中心（[§6.6](../../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）。
  入口层所依赖的任一参与方的面缺席，客户端一面就不应答——来者看到的是「问不到」，不是某些路由答 `unavailable`、某些照常。
  运维面在客户端一面开始应答之前已可用，在它停止之后才停止。
- **中心开始应答的那一刻就是它「起来了」的那一刻**；在那之前的任何失败，外面看到的只是「问不到」。
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
| 跨 owner 事务、外部效应回滚 | 不需要 | 每个请求至多落在一个领域操作的一次提交里；撤销路由的第一步是纯读 |

## 十一、装配给 vs 协议给

### S-36 装配给的保证 vs 协议须给的保证

**这条边把「调用方」搬到了进程外，领域没有被拆开**：各领域能力仍在同一个进程、同一个存储、同一口钟里。
所以左列靠「同一存储、同一提交、同一时钟」的保证**在这条边上不失效**，仍由装配给；要由**本契约的协议条款**重新兑现的，
是**和调用方身份有关、和流向调用方的值有关**的那几行。右列写：这条边上它由谁兑现；中心自身将来也被拆开时还要补什么。
每一行都写做不到会怎样。

| 保证（来源） | 本版单机：由谁给 | 这条边上／跨进程之后：谁兑现 | 做不到会怎样 |
|---|---|---|---|
| **撤销之后立刻生效**（[`capability.account-identity/v1#S-30`](../../../capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) 第 3 行） | 装配：入口层与账号能力读同一个存储 | **协议给**：[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存) 的中心一侧 δ = 0。中心被拆开之后，账号能力那一行的 δ 须定义，本条的 0 随之变成那个 δ | 退出或被撤销的登录状态在缓存窗口里还能用——[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) 被破 |
| **持有 `AccountId` 即可读账号**（同上第 6 行） | 装配：只有进程内调用方 | **靠不暴露兑现**：[S-24](#s-24-有意不投影) 不投影 S-18；线上任何 `AccountId` 都不作行事依据（[S-12](#s-12-身份推导)）。只要线上不出现 S-18，本版不需要账号能力的新版本 | 任何拿到一个 `AccountId` 的人读得到它的激活与过期状态 |
| **`identifier-held-by-expired-record` 只流向注册组合**（同上第 8 行） | 装配：只有注册组合调 S-13 | **结构上兑现**：[S-24](#s-24-有意不投影) 不投影 S-13；注册路由只给[四个终结结果](#s-19-免认人的两条路由注册登录)；限定调用点的静态检查覆盖入口层（[SC-1](../verification.md#静态检查义务)） | 「某个名字上挂着一条已过期记录、它的 `AccountId` 是这个」开放给任何人 |
| **S-53 只由清除链调用**（[`capability.organization-governance/v1#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 4 行；[`composition.account-registration/v1#S-25`](../../account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 第 7 行） | 装配 | **结构上兑现**：不投影 S-53，入口层不引用清除个人组织那一面（[SC-1](../verification.md#静态检查义务)） | 一条直接删任何账号个人组织的入口 |
| **成员资格的可见性**（`#S-42` 第 5 行） | 装配：写入即被下一次读看到 | **协议给**：中心一侧 δ = 0，入口层不缓存（[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)） | 被移出的人在缓存窗口里仍被放行 |
| **当前租户身份的可见性**（`#S-42` 第 6 行） | 装配 | **协议给**：同上；切换提交之后，下一个请求的身份推导读到新值（[S-23](#s-23-当前租户身份的两条路由)）。据点建会话前的现读归 PF-016 | 切换之后新建的东西落到旧的租户身份上 |
| **调用方身份已经核实过——写操作**（`#S-42` 第 8 行） | 装配：「入口层（apps 装配）先核实」 | **协议给，这条边的核心**：每个请求带出示物，第 ② 步重验；交给治理能力的身份值按 [S-12](#s-12-身份推导) 推出。**不得只凭「上游已经验过了」**（[`data.identity-values/v1#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 谁拿到一个 `TenantId` 就能以它的身份做任何写操作 |
| **调用方身份——读面**（`#S-42` 第 9 行） | 同上 | 同上；另对没有授权前置的四条读面补授权（[S-13](#s-13-补授权)） | 任意组织的类型、任意租户的效力、上级链对任何人可读 |
| **注册入口的义务**（[`composition.account-registration/v1#S-2`](../../account-registration/v1/contract.md#s-2-参与方与精确承诺)「注册入口」一行） | —（本组合就是那个入口） | [S-19](#s-19-免认人的两条路由注册登录)：表示层校验在此；四个终结结果原样呈现；`interrupted` 不改写 | 不合格的输入被交进去收成 `interrupted`，入口缺陷被记成一次普通失败；或 `interrupted` 被说成成功 |
| **`TenantId` 的规范形式，一个部署一条规则**（[`data.identity-values/v1#S-7`](../../../data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式)） | 装配：进程内传值 | **协议给**：线上的 `TenantId` 按规范形式原样传（[S-12](#s-12-身份推导)） | 同一个租户在线上有两种写法，比较与去重各算各的 |
| **归属层身份带判别式到达**（[`#S-16`](../../../data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)） | 装配 | **协议给**：`TenantId` 与 `ScopeLayerIdentity` 不压平成两个可空字段（[S-12](#s-12-身份推导)） | 「这份东西归哪一层」在线上有两个答案，或两格都空 |
| **读不到即明确失败，以返回值到达**（[`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)） | 装配：读失败就是那次调用的返回值 | **协议给**：`unavailable` 是一个显式的线上答复（[S-6](#s-6-四种入口答复)）。**客户端代理须把传输层故障（超时、断连、解析不了）映射到与「问不到」同一个分支**，不得折成空结果或默认值——那一侧不在本程实施边界，义务写在这里 | 一次读不到在客户端被显示成「没有」或「无效」 |
| **六条路径同一判定；不得冒充隔离**（[`#S-20`](../../../data/identity-values/v1/contract.md#s-20-六条路径同一判定)、[`#S-23`](../../../data/identity-values/v1/contract.md#s-23-不得冒充隔离)） | 装配：同进程同一判定函数 | **协议给**：入口层是远端接收边界，每个请求重新鉴别；**判定仍在各 owner 的数据访问层**，入口层不替它们判，也**不声称自己提供了隔离**；路由表封闭、没有泛化分派 | 「入口验过一次」被当成全链成立，数据访问层的判定被省掉 |
| **判定依据不含物理位置**（[`#S-21`](../../../data/identity-values/v1/contract.md#s-21-判定依据的构成封闭)） | 静态检查 | **协议给**：对端地址、机器、程序一律不作资格（[S-16](#s-16-不记住来访不区别对待来者)） | 出现「可信机器」，人能做的脚本做不了或反之 |
| **每道准入现读、缓存须写失效条件**（[`#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读)） | 装配：进程内失效即时 | **协议给**：[S-15](#s-15-δ--0每个请求现读入口不跨请求缓存)，本版不缓存 | 说不出什么时候失效的授权缓存 |
| **捕获的当前租户身份不被重算**（[`#S-28`](../../../data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)） | 装配：沿调用栈传下去 | **协议给**：每个请求推导一次、随请求交下去，领域不就地重取（[S-12](#s-12-身份推导)） | 同一次工作的前后两步算到两个租户头上 |
| **跨边界须重新验证**（[`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 装配 | **协议给**：本组合就是那个接收边界（[S-11](#s-11-认人)） | 只带身份值、不带授权依据的请求被照办 |
| **表示层校验与判定分开**（[`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)） | — | **协议给**：`invalid-input` 与三种判定结论分开（[S-6](#s-6-四种入口答复)）；出示物是身份不是输入（[S-5](#s-5-出示物)） | 一次参数错误被读成一次授权或存在性结论 |
| **邀约过期的钟与存储同源**（`data.offer-expiry/v1#S-17` 全部五行） | 装配 | **这条边不触发**：钟与存储都没有拆开，客户端的钟不参与任何判定、时间不进信封（[S-4](#s-4-请求信封)）。那份契约的右列只在中心自身被拆开时才需要兑现 | 若有人把客户端带来的时刻当成「现在」，过期的邀约会在客户端拨慢了钟的机器上复活、在拨快的机器上提前作废——这正是 S-4 让时间不进信封所挡住的 |
| **出示物不可伪造**（本契约；闭合 `capability.account-identity` v1 G-2 与 `data.identity-values` v1 G-04 中「`LoginStateId` 不可猜测」那一半） | **装配给**：账号能力的提供者以 128 位密码学安全随机数生成 `LoginStateId`（实现映射兑现） | 不变——它本来就是跨进程的前提 | 出示物可被猜中，任何人能以任何人的身份行事 |
| **登录状态的效力不变**（本契约；[S-31](#s-31-不变量与安全性质) 末行） | 装配：登录状态记录在存储里、入口不另存 | 不变。**前提是「不经备份恢复」**：恢复把中心带回备份那一刻，备份之后撤销的登录状态随之又有效（[G-5](#十三已知缺口)） | 恢复之后一个已撤销的登录状态又能用，而持有者以为它早已失效 |
| **中心一侧 δ = 0 只是中心一侧**（本契约） | 装配 | 据点上的副本与陈旧窗口归 PF-016，不在本契约 | 把据点副本的陈旧误读成中心放行了已撤销的登录状态 |
| **起来即整体**（本契约 [S-34](#s-34-起来即整体停机时在途请求归谁)） | **装配给**：入口层对它消费的每一个面都是必需依赖，任一缺席就不应答（[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）；启动中任一步失败即整体失败、不留半个面（[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)） | **协议给**：中心被拆开之后，入口够不着某个领域时对那条路由答 `unavailable`，**绝不以部分成功或空结果顶替** | 能登录却答不出成员资格、能建组织却记不下邀请的半开中心 |
| **运维者没有门**（本契约 [S-25](#s-25-运维面只在中心所在的机器上且没有治理路由)） | **装配给**：通道分离、运维面不引用治理能力。进程内**没有**访问边界可依——同一棵上下文树里任何插件都解析得到兄弟插件提供的面（[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），可见性隔离也不隔数据（[`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)）；所以这一条由静态检查守（[SC-2](../verification.md#静态检查义务)） | 不变：运维面仍须与治理能力分开，拆进程不改变这一条 | 运维面引用了一个治理能力，就出现了一扇不经登录状态的门，而且没人看得见 |
| **中心标识与治理事实同一存储**（本契约 [S-28](#s-28-铸造存放与不变)） | 装配：一个存储 | **协议给**：存储被拆开之后，标识须仍与治理事实的权威副本同在、同备份、同恢复 | 只备份治理事实的那份备份恢复出来是「另一个中心」 |
| **停机时先停收、再等在途、再关闭**（本契约 [S-34](#s-34-起来即整体停机时在途请求归谁)） | **装配给**：三步放在同一个装载效应的收尾里依次执行——不同效应的收尾彼此并发、不保序（[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)） | 不变 | 先关闭后等待：在途请求被截断，来者收不到答复（事实仍是要么在、要么不在，但不必要地多丢答复） |
| **运行中钟往回倒 ⇒ 要看时间的答 `unavailable`**（[§6.10](../../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走)） | **装配给**：时钟的提供者在运行中检出回拨并让时间读面给出「不可用」；本契约按 [S-14](#s-14-失败映射) 把它映射成 `unavailable` | 不变 | 倒退的钟上做出的判定让过期的邀约复活，而每一步都显示成功 |

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要求领域语义在分布式演化中不变，
因此右列不是「以后再说」，而是本契约已经记下的待兑现项；中心自身被拆开时要补的部分登记在 [G-6](#十三已知缺口)。

## 十二、规范表达与证据义务

### S-37 本版选用的形式工件

本契约**触发了行为模型的义务**：它新增的是一条**跨 owner 的整体性质**——判定次序 × 四种入口答复 × 「判不了优先于无效」，
横跨三份契约的操作与它们各自的失败集合。局部契约各自正确，不蕴含这张映射在每一种交错下都对。

选用：**TLA+ 行为模型 [`formal/EntryDecision.tla`](formal/EntryDecision.tla)**，登记为 formal task 的配置恰一个：[`EntryDecision.cfg`](formal/EntryDecision.cfg)；
有效性核对与变异核对的否定配置 `formal/Validity_*.cfg` **不登记为 formal task**。条款到断言的映射、前提与未建模部分在 [formal/README.md](formal/README.md)。

**不选 Alloy**：本契约要检查的是次序与映射，是行为；「路由表封闭」「运维面不引用治理能力」是代码结构的事实，由静态检查守，不需要结构模型。

**建 Schema**：[`governance-center-entry.schema.json`](governance-center-entry.schema.json)——信封、四种入口答复、路由结果、登录成功的返回与登录状态列表的项、公开与完整体检、`GovernanceCenterId`、列表句柄；
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

### S-40 规范场景：三个出口不合并

让数据所在够不着，用一个**有效**登录状态来问事：得 `unavailable`；修好之后同一个登录状态照常能用，**不需要重新登录**。
让领域操作给出一个失败集合之外的值：得 `unavailable`，完整体检的 `defectCount` 随之加一。

### S-41 规范场景：列表不给能直接用的东西

在一台机器上列出本账号的登录状态，把列表里的每一项拿到另一台机器上当出示物用：**每一次都得 `login-state-rejected`**。
用列表里另一项的句柄撤销它：成功；再撤一次：`login-state-not-found`；用自己的句柄撤销（退出）之后，带着它再来：`login-state-rejected`。
依据：[acceptance §三「不交出能直接用的凭证」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)的第一半；**第二半（备份里的登录状态用不了）本版不满足**，见 [G-1](#十三已知缺口)。

### S-42 规范场景：只认登录状态，不认客户端

同一个有效登录状态，先后从两台机器、用人用的客户端与一段脚本做同一件事：**答复逐字相同**。
撤销一个登录状态后**立刻**用它问事：`login-state-rejected`。

### S-43 规范场景：身份推导与补授权

切换当前租户身份到组织 A 后发出邀请：邀请由 A 发出；载荷里夹带一个「以组织 B 的租户身份」的成员：`invalid-input`，没有邀请被发出。
读一个自己不在的组织：`notAuthorized`；读一个不存在的组织：同样 `notAuthorized`；让成员资格读面读不到时再读：`unavailable`。

### S-44 规范场景：中心标识

从零立两个中心：标识不同。同一份数据先后在两个地址上启动：标识相同。停机、重启、升级、换密钥之后：标识不变。
**让标识那一格在启动时读不出来**：中心起不来，**没有铸出新的标识**；修好后再启动，是原来那个标识。
数据所在中途够不着时读公开体检：三样照样都在。

### S-45 规范场景：两张面没有第三张

在中心所在的机器上，找不到任何一条不带登录状态就能注册、建组织、邀请、移除、改角色、撤销他人登录状态、看谁在里面的操作——**不是有但被拒，是没有**。
从客户端一面，找不到读完整体检或改任何部署事实的操作。

### S-46 规范场景：输出里搜不到秘密

生成密钥、启动、跑完上面各场景之后，在全部答复、两种体检、工程记录与启动失败说明里搜部署密钥的值、凭据材料、模型凭据的值、出示物：
**除登录成功答复里那一处出示物之外，一处都搜不到**；工程记录里搜不到对端地址、搜不到任何 `AccountId` 与 `TenantId`。

## 十三、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **存储里的登录状态可以被直接冒用。**本版出示物就是 `LoginStateId`（[`capability.account-identity/v1#S-17`](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 把「持有它」当作被校验的那件事），存储里存的也是它。**本版备份或数据外泄的实际后果**：外泄那一刻有效的每一个登录状态都可被冒用，直到被撤销；**处置是持有者用任一有效登录状态列出全部、逐个撤销**。这不满足 [PF-017 §8](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)「中心存下来的登录状态，读到数据或备份的人不能直接拿去用」与 [acceptance §三「不交出能直接用的凭证」](../../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#三判据)的第二半；**列表那一半本版已由[列表句柄](#s-9-列表句柄)兑现** | `capability.account-identity` 的 spec owner；PF-017 owner 知情 | 账号能力发布 v2「出示物与登录状态标识分离」（存储只存出示物的不可逆形式），本契约随之发新版本 |
| G-2 | **请求显式携带的「以哪个租户身份行事」与登录状态上当前选中的不一致时怎么答。**本版信封与载荷没有这一格，一律按当前选中的行事（[S-12](#s-12-身份推导)） | PF-001 owner（[PF-017 §9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#九未决项)） | PF-001 定语义；本契约发新版本加上这一格与它的答复 |
| G-3 | **按登录标识指认被邀请者，线上没有承载。**本版邀请路由收目标 `AccountId`；据点侧怎么拿到它不在本程实施边界。另有一个产品问题：那个标识上挂着一条**未激活**记录时，发邀请的人该看到什么 | `capability.account-identity` 的 spec owner（新版本加一个解析面，授权条件：调用方已过第 ② 步）；未激活记录的呈现归 PF-001／PF-016 owner | 解析面发布，本契约加一条路由 |
| G-4 | **部署参数里 PF-003 的两项（`copyNoticeTtlDefault`、`sharingInvitationTtlDefault`）没有消费它们的契约。**本版照样要值、校验、在完整体检里可见，但没有任何判定用到它们 | 复制通知与分享邀请的契约（尚未立） | 那两份契约立起来并消费它们 |
| G-5 | **「登录状态效力不变」以「不经备份恢复」为前提。**恢复会带回备份之后撤销的登录状态；[PF-001 flows §3.2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#32-登录状态) 的「已失效不可回到有效」没有写这个限定 | PF-001 owner（[PF-017 §9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#九未决项) 已登记） | PF-001 owner 认这个读法，或把「恢复后仍保住撤销」提成对备份与恢复的新要求 |
| G-6 | **中心自身被拆成多个进程之后**，[S-36](#s-36-装配给的保证-vs-协议须给的保证) 各行右列里的新鲜度界、δ 与「够不着某个领域时的收场」未定义 | 架构设计（本版单机，不阻断） | 分布式演化启动时给出，并作为本契约的新版本发布 |

## 十四、版本差异与规范工件

### S-47 本版是首版

没有被采用的旧版本，没有语义或表示差异可记。`realization/apps/cli` 节点里的拟议名「治理契约线上投影协议」**由本契约取代**，它从未成稿、未登记，不构成前身，不建立 lineage。

### S-48 本版的规范工件

本文件、[`governance-center-entry.schema.json`](governance-center-entry.schema.json)、[`examples.md`](examples.md)、
[`formal/EntryDecision.tla`](formal/EntryDecision.tla)、[`formal/EntryDecision.cfg`](formal/EntryDecision.cfg) 与七个 `formal/Validity_*.cfg`；与 catalog 登记的 `resources` 一致。
[`formal/README.md`](formal/README.md) 是导航页，随版本目录一并登记为资源。

**检查配置本身是规范工件**：它们固定了模型的常量与断言集合，也就固定了每条性质被检查的范围；改变范围须发新版本（接受之后）。
接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。
