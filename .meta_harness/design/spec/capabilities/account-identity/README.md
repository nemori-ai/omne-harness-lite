# 账号身份与登录状态

**「来者是谁」这件事的权威事实**：一个[账号](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account)怎么产生、
怎么激活、怎么被读；一个[登录状态](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)怎么签发、
怎么撤销、怎么校验；以及**验证一份凭据并据此签发登录状态**这一件对外操作。

**凭据长什么样不在承诺里。**[产品正文明列「认证提供者的选型」为技术选择](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#非目标)，
所以本契约露出的是「有这么一件事」，不是「它拿什么去验」。

**这里没有组织、没有租户、没有成员资格。**账号[只管标识、鉴权、聚合](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)，
其中聚合是一个视图功能，那份答案的权威在治理契约。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.account-identity, 1)`
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **catalog 映射**：**已登记**（2026-09-22，状态 `candidate`）。`family=capabilities`、`topic=account-identity`、
  `contract_path=spec/capabilities/account-identity/v1/contract.md`；本版**没有其他规范资源**（不建 `formal/`、不发布 Schema，理由见下）；
  依赖一项：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`，
  消费 clauses **七条**：`S-1`、`S-2`、`S-9`、`S-30`（跨边界须重新验证）、`S-31`（不透明标识的交换表示）、
  `S-33`（表示层校验与判定分开）、`S-35`（交接凭证）——
  后四条是评审轮一、二、三累积出来的消费面（`S-30` 按评审轮三定的「引用即消费」判据补上：
  [S-30 的两行右列](v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)以坐标引用它），
  清单那一侧由主线同步，[G-5](v1/contract.md#九已知缺口) 记当前值。
  **[缺口 G-3](v1/contract.md#九已知缺口) 关的就是这一条登记，它已经闭合**（契约正文那一格也已改过）。
  `acceptance` 为 `null`，资源未冻结——**登记不是接受**。
  **本包入口原先写的 `family=capability` 是笔误**：检查器只接受
  `data` / `capabilities` / `compositions` 三个值，且 `family` 要与路径段一致
- **提供者/装配映射**：**尚无**。架构与提供者设计未开始，本包不预填目标设计

## 依赖方向：治理 → 本契约，单向

这是本包最要紧的一句话，因此放在最前面：
**本契约不消费 `capability.organization-governance` v1 的任何读面，一条也没有。**

它有两个后果，都写进了契约：

- 凡需要组织/租户/成员资格作前置的地方，依据必须由**调用方随操作带进来**——
  全契约两处：[S-14 激活账号](v1/contract.md#s-14-激活账号)的**激活依据**与
  [S-38 清除到期记录](v1/contract.md#s-38-清除到期的未激活账号记录)的**清除依据**，
  都由 `omne-harness-lite-design-2026-09-15 · composition.account-registration · v1` 带进来并负责，
  形状与不可伪造承诺归
  [`data.identity-values/v1#S-35`「交接凭证」](../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)。
- 换一套组织治理规则**不会**让本契约重新装载；反过来，本契约的提供者不可用时，
  治理契约的相关操作[明确失败，不静默降级](v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。账号事实与登录状态有**自己的授权前提、提交点与失败模式**，且[失效必须跨重启成立](v1/contract.md#s-10-撤销是持久记录不是内存生命周期)——这是一份有行为的责任，不是共享数据 |
| 稳定身份 | `capability.account-identity`，版本 1 |
| 适用范围 | 一个部署内的账号与登录状态。**不含**组织、租户、成员资格、[当前租户身份](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)这项选择，也不含账号承载的个人 context 内容 |
| 为什么是 capability 而不是 data | 它拥有**状态转移**（未激活→已激活、有效→已失效）与**授权判定**（撤销的发起方资格），两者都有失败模式。[data 只拥有共享含义与结构](../../README.md#准入门槛与停止条件) |
| 为什么凭据校验不单独立一份契约 | 它是[S-15](v1/contract.md#s-15-验证凭据并签发登录状态)一条操作的内部，**对消费者不构成独立的责任面**——没有任何消费者需要「只校验不签发」。把它拆成第二份契约，消费者要同时依赖两份才能完成一次登录，而两份之间又没有可独立演化的语义 |
| 精确依赖 | `data.identity-values` v1，取 AccountId、LoginStateId 与「登录标识不是引用键」这一区分 |
| 接受状态 | 未接受。本包不写 acceptance |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 八个操作各自的前置、提交点与失败集合 | [v1 契约 §三 操作](v1/contract.md#三操作) |
| 哪些保证是**单机装配给的**、跨进程后谁重新兑现 | [S-30](v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |
| 还有什么没定 | [§九 已知缺口](v1/contract.md#九已知缺口) |

## 版本包

`v1/` 是本契约的候选版本目录。**里面只有 `contract.md`**。

**不建 `formal/`。**登录状态的状态机只有一条不可逆转移；
账号的状态机有两条出口（激活、[到期清除](v1/contract.md#s-38-清除到期的未激活账号记录)），
但两条**互斥且都从「未激活」出发**，内部没有需要多方交错才能反驳的性质。
需要行为模型检查的两条动作链——**注册**与**未激活到期清除**——提交点都跨越本契约与治理契约，
所以模型归 `omne-harness-lite-design-2026-09-15 · composition.account-registration · v1`，
**不在这里建第二份平行模型**。[规格入口要求的「已触发的义务不因 optional 而消失」](../../README.md#按需展开形式化工件)
由**八条规范场景**与两条静态检查承接；**本包的全部证据义务以[验证入口](verification.md)的登记为准**——
还有若干条由条款直接触发、没有自己场景号的检查只登记在那里，
理由见[契约 §八](v1/contract.md#八规范表达与验证义务)。

**不发布 Schema。**本契约的对外形状只有身份值与枚举的失败集合：
前者的 Schema 归 `data.identity-values` v1，后者由
[S-36 的静态检查](v1/contract.md#s-36-静态检查失败集合闭合)守。另起一份只会与那两处重复。

**实施提示（归 realization，不是契约的一部分）**：
[S-15](v1/contract.md#s-15-验证凭据并签发登录状态) 的凭据校验与其余账号事实**可以分成两个 provider 节点**，
让认证方式换代时的重启半径收在登录入口之内，不波及账号事实的消费者；
这是提供者设计的选择，**契约不要求、也不禁止**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
