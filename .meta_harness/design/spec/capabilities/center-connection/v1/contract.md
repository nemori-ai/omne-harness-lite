# capability.center-connection v1

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.center-connection, 1)`——
  `family = capabilities`、`topic = center-connection`、规范路径 `spec/capabilities/center-connection/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：已由 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 接受；精确资源冻结与采用状态由版本外入口及 registry 维护。
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-016 rev 6**、**PF-017 rev 2** 为准
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · composition.governance-center-entry · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · composition.governance-center-entry-https-json · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（accepted，只取时间点 `Instant`）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如
  `capability.center-connection/v1#S-9`；缺口 `G-n` 同理。编号在本版本内只追加、不重排

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 治理中心问不到时，已经开着的会话照常干活；屏上标明此刻连不上中心；再连上时按新读到的重新算 | [PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活) · [flows §二](../../../../product/PF-016-cli-tui-delivery-surface/flows.md#二分支与异常)「在会话里干活」一行 | S-1、S-6、S-7、S-9 |
| 「问不到」不等于「无效」，也不等于「有效」 | [PF-016 §5.6「哪几件事必须现读」](../../../../product/PF-016-cli-tui-delivery-surface/design.md#哪几件事必须现读) | S-3、S-5 |
| 公开体检的「在不在」只说「中心在应答」，不说此刻能不能答别的事 | [PF-017 §4 中心体检](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检) | S-5 |
| 据点的身份里有「哪个治理中心」；中心的身份不是它的地址 | [PF-016 §4 会话据点](../../../../product/PF-016-cli-tui-delivery-surface/design.md#会话据点) · [§4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心) | S-2、S-3（中心标识的比较不收，[G-2](#八已知缺口)） |
| 单机交付、语义不变地可拆 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-10 |
| 统一语言 | [治理中心](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center) · [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) · [治理中心体检](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-governance-center-health-check--治理中心体检--governance-center-health-check) | 全部正式名。**无词条的规格层名字**：中心连接（本能力）、可达性、三态的名字、「进入可达的次数」——只在本契约里有定义，不另立，已报主线 |

> **这张表里没有产品行、或产品行不足以单独支撑的条款**：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约作为一份**窄口**能力存在：只收据点上唯一消费者已列出的「可达性与断线重连」观察面；向中心发请求、中心标识比较、推送都不收 | 产品负责人裁定 [D-043 R-1](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)（替身改为「接口契约 ＋ 最小提供者」，接口按消费者的需要定窄口）；真承接者留给下一程见 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |
> | [S-7](#s-7-在场不随可达性变) 本能力的在场不随可达性变 | **规格层推导**：唯一的消费者必需依赖本能力，本能力一撤除，它与它的下游（模型请求运行时、全部 agent runtime）连带重跑、在途模型调用被放弃（`capability.model-request-runtime` v1 的 S-36）——中心问不到不能是这件事的理由（PF-016 §6.17） |
> | [S-5](#s-5-可达性三态) 的三态与 `undetermined`、[S-6](#s-6-自己探自己重连) 的探测上界 | **规格层推导**：还没有任何往来结果时既不说可达也不说不可达（缺席不填初值）；上界是让「再连上」这条进展写得出会失败的断言 |
> | 操作名 `reachability`、三态名、成员名 `since`／`reachCount`、具名参数 `probeInterval`／`probeTimeout` | 起草时的候选名（账本未给），**主线已接受**（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ①） |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**据点上关于「这个据点所属的治理中心此刻在不在应答」的观察，以及让这份观察不过时的义务。**它住在[会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)一侧，每个据点一份。

| # | 拥有的事实或义务 | 正文 |
|---|---|---|
| 1 | **可达性**：三态之一、进入这一态的时刻、这一次在场里进入可达的次数 | [S-5](#s-5-可达性三态) |
| 2 | **自己探、自己重连**：没有别的往来时自己去问，问不到之后照常再问 | [S-6](#s-6-自己探自己重连) |
| 3 | **在场不随可达性变**：问不到是一个观察值，不是本能力的缺席 | [S-7](#s-7-在场不随可达性变) |

**一个操作**：读可达性（`reachability`），见[第三节](#三操作)。没有事件。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| **经这条连接向中心发请求**：路由、信封、出示物、答复的读法与投影 | 入口组合的线上投影（`composition.governance-center-entry` v1 与它的传输绑定 `composition.governance-center-entry-https-json` v1）；据点这一侧的请求面归入口组合 v2 的据点客户端（下一程，[G-1](#八已知缺口)） |
| **连到的是不是这个据点所属的那个中心**：中心标识的比较，「中心搬家了」与「另一个中心」的区分与呈现 | PF-016 那一程（[§4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)「怎么确认两个地址后面是同一个中心，本 rev 未定」）与入口 v2 的据点客户端（[G-2](#八已知缺口)） |
| **客户端怎样确认对端**（证书、指纹） | 传输绑定（`composition.governance-center-entry-https-json/v1#S-4`）与据点客户端的信任规则；本契约只要求「确认不了就是问不到」（[S-5](#s-5-可达性三态)） |
| **中心事实的副本与它的新鲜度** | 据点上的中心事实副本读面与入口 v2（下一程） |
| **可达性变化怎样呈现给人**（屏上怎样标明） | 交付面呈现契约（未立）；推送不在本版（[G-4](#八已知缺口)） |
| **登录状态**：用哪一个、它还作不作数 | `capability.account-identity` 与入口组合；**可达性与登录状态无关**（[S-5](#s-5-可达性三态)） |

### S-3 本契约明确不承诺什么

- **不承诺「读到可达，下一次请求就问得到」。**可达性是**观察**，不是预约：两次往来之间什么都可能变。每一次请求仍须自己按「问不到」收场（`composition.governance-center-entry/v1#S-36`「读不到即明确失败」那一行交给客户端的那一半）。
- **可达性不作任何准入依据。**它不说成员资格有效、不说登录状态作数、不说某件事做不做得了——那些各有权威（[PF-016 §5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#哪几件事必须现读)）。
- **不说中心此刻能不能答别的事。**中心的数据所在够不着、钟倒退、中心自身故障时，中心照样在应答（[PF-017 §4 中心体检](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)）——这时本契约答「可达」。
- **不说连到的是不是这个据点所属的那个中心**（[G-2](#八已知缺口)）。
- **不推送可达性的变化**：本版没有事件，读的一方自己读（[S-9](#s-9-reachability) ⑨）。

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 入口组合、传输绑定、过期语义里的时间点。**本契约的消费者（据点上的模型档案读提供者等）依赖本契约，本契约不依赖它们。

**下表每个 `#S-n` 前缀省去了坐标 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1`；catalog 的 `clauses` 以它为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `composition.governance-center-entry` [`#S-6`](../../../compositions/governance-center-entry/v1/contract.md#s-6-四种入口答复) 四种入口答复：`unavailable` 也是中心给出的一个答复 | [S-5](#s-5-可达性三态)：任何一种入口答复都算「在应答」 |
| `composition.governance-center-entry` [`#S-18`](../../../compositions/governance-center-entry/v1/contract.md#s-18-公开体检) 公开体检：不看出示物、不读存储，`reachable` 只说中心在应答 | [S-5](#s-5-可达性三态) 可达的含义；[S-6](#s-6-自己探自己重连) 探测不带出示物 |
| `composition.governance-center-entry` [`#S-36`](../../../compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「读不到即明确失败，以返回值到达」一行：客户端把传输层故障映射到「问不到」 | [S-5](#s-5-可达性三态) 不可达的含义；[S-3](#s-3-本契约明确不承诺什么) |
| `composition.governance-center-entry-https-json` [`#S-4`](../../../compositions/governance-center-entry-https-json/v1/contract.md#s-4-客户端一面的连接只有-tls服务端认证) 只有 TLS、服务端认证 | [S-5](#s-5-可达性三态)：确认不了对端就是问不到 |
| `composition.governance-center-entry-https-json` [`#S-17`](../../../compositions/governance-center-entry-https-json/v1/contract.md#s-17-客户端怎样读答复) 客户端怎样读答复：哪些情形按「问不到」处理 | [S-5](#s-5-可达性三态) 可达与不可达的分界 |
| `data.offer-expiry` [`#S-22`](../../../data/offer-expiry/v1/contract.md#s-22-schema-的范围) 末句的时间点规范形式（`Instant`） | [S-5](#s-5-可达性三态) 的 `since` |

---

## 二、概念、身份与必要状态

### S-5 可达性：三态

**可达性 = `{ state, since, reachCount }`，只属于本能力这一次在场。**

| `state` | 含义 |
|---|---|
| `undetermined` | 本能力这一次在场以来，**还没有一次与中心的往来有结果** |
| `reachable` | **最近一次有结果的往来得到了中心的一份答复**：按 `composition.governance-center-entry-https-json/v1#S-17` 读得成的一份——四种入口答复之一、一份路由结果、或一份公开体检答复——且对端经那份绑定的 [S-4](../../../compositions/governance-center-entry-https-json/v1/contract.md#s-4-客户端一面的连接只有-tls服务端认证) 确认过 |
| `unreachable` | **最近一次有结果的往来落在「问不到」**：`composition.governance-center-entry-https-json/v1#S-17` 第 1、4 步列的那些情形——答复读完之前连接关闭、超时、TLS 失败（含确认不了对端）、读到的不是一份答复、读成的值不属于这次请求应得的那一类 |

- **闭合**：恰这三个值，没有「其他」，也没有「部分可达」。
- **「在应答」不看答复说了什么**：`unavailable`、`login-state-rejected`、`version-mismatch`、`invalid-input` 都是中心给出的答复（`composition.governance-center-entry/v1#S-6`），**都算可达**；同 [PF-017 §4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检) 公开体检的「在不在」、`composition.governance-center-entry/v1#S-18` 的 `reachable` 同一个含义。
- **可达性与登录状态无关**：出示物被拒（`login-state-rejected`）照样是可达——那是登录状态的事，不是连接的事。
- **`since`**：进入当前 `state` 的时刻（`data.offer-expiry/v1#S-22` 的 `Instant`，据点的同一时间源）。`undetermined` 的 `since` 是这一次在场里**第一次读得到时间源**的时刻；**在那之前 `since` 缺席**，`state`（`undetermined`）与 `reachCount`（0）照答——不拿在场开始的某个编出来的时刻顶上（[S-6](#s-6-自己探自己重连) 第 1 条的前提段；主线裁定，[D-040 §八 N-44](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。缺席只出现在这一次在场开头、时间源一直读不出的那一段；时间源读得到之后 `since` 恒在。
- **`reachCount`**：这一次在场里**由不是 `reachable` 变为 `reachable`** 的次数，从 0 起；只在这种转移上加一，别处不动。**读的一方据它看得出「其间再连上过」**：两次读之间它变大了，其间至少有一次再连上。
- **只属于这一次在场**：本能力撤除又装上（含进程重启），从 `undetermined`、`reachCount = 0` 重新开始；**跨在场比较 `reachCount` 没有意义**。

### S-6 自己探、自己重连

**这份观察不靠消费者去维持：本能力自己与中心往来。**

1. **有界不过时**：本能力在场期间，**最近一次有结果的往来距今不超过具名参数 `probeInterval`**——没有别的往来时，本能力自己探一次。每一次探以具名参数 `probeTimeout` 封顶：到点没有读成一份答复即「问不到」（`unreachable`）。两个参数的值本契约不填（[G-3](#八已知缺口)）。
   **前提：时间源可读**（主线裁定，[D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。时间源此刻读不出（例如据点的钟回拨、答「不可用」）时，一次有结果的往来拿不到可信的时刻：**这份观察不更新**——`state`、`since`、`reachCount` 都照旧，不拿一个编出来的时刻去写 `since`；**探的节拍由本地定时器保持**，两次探之间照样按 `probeInterval` 走，不因观察没更新就立刻再探。这段时间里第 1 条的上界不成立：观察停在钟不可读之前最后一次算数的往来上，读的一方看到的是一份如实变旧的观察，不是一份拿编出来的时刻冒充的新鲜观察。
2. **探不带任何出示物、不问任何治理事实**：它只问「中心在不在应答」——与公开体检（`composition.governance-center-entry/v1#S-18`）同一个问题。本契约不规定探用哪一条路由；公开体检恰是这样一条。
3. **断线重连就是照常再探**：`unreachable` 期间仍按第 1 条的上界再探，探到答复即回到 `reachable`、`reachCount` 加一。**重连是本能力自己的事**：消费者不必、本版也没有办法叫它重连。
4. **经同一条连接的其他往来有结果时同样更新这份观察**——那些往来（入口 v2 的请求）本版没有（[G-1](#八已知缺口)）。

### S-7 在场不随可达性变

**中心问不到是一个观察值，不是本能力的缺席。**

- **可达性的任何变化都不使本能力撤除、替换或重启**，也不要求它的任何消费者撤除、替换或重启；`unreachable` 期间 [`reachability`](#s-9-reachability) 照常答（答 `unreachable`）。
- **反过来：本能力不在场 ≠ 中心不可达。**没装、正在撤除时，消费者**不得**把「本能力不在」读成 `unreachable` 而照常服务——那是装配缺席，按消费者自己契约里「依赖不可用」的那一条收。
- **为什么是一条承诺而不是实现细节**：必需依赖本能力的消费者会随本能力的撤除连带重跑；据点上那条链一直连到每一次在途的模型调用（`capability.model-request-runtime` v1 的 S-36：模型请求运行时被撤除或替换时，手里每一次在途调用都被结算为 `interrupted{run_cancelled}`）。**中心问不到不是让据点上任何在途工作停下的理由**（[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)）。

---

## 三、操作

### S-8 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | 输入 |
| ② | 前置与授权 |
| ③ | 结构性禁止（不适用写「无」） |
| ④ | 提交点与原子性 |
| ⑤ | 成功返回 |
| ⑥ | 失败集合（闭合） |
| ⑦ | 幂等与重复 |
| ⑧ | 缺席时的默认答案 |
| ⑨ | 事件 |

### S-9 reachability

**读这个据点所属的治理中心此刻的可达性。**

| # | 内容 |
|---|---|
| ① | 无输入 |
| ② | **无授权前置**：返回里没有秘密、没有治理事实、没有任何租户的东西；据点进程里够得着本能力的消费者都可以读 |
| ③ | 无 |
| ④ | 只读，无提交；交出此刻的观察（[S-5](#s-5-可达性三态)） |
| ⑤ | `{ state, since?, reachCount }`——`since` 缺席**只**出现在这一次在场开头、时间源还一次都没读出来的那一段，那时 `state` 必是 `undetermined`（[S-5](#s-5-可达性三态)）；此后恒在 |
| ⑥ | **失败集合为空**：本能力在场就答得出（[S-7](#s-7-在场不随可达性变)），**时间源读不出也照答**——`since` 缺席、不以失败代替。本能力不在场不是本操作的一个返回值，见 S-7 第二条 |
| ⑦ | 只读，任意重复。两次读之间 `reachCount` 变大 ⇔ 其间至少有一次由不可达（或未定）进入可达 |
| ⑧ | **还没有一次往来有结果 ⇒ `undetermined`**——**不填 `unreachable`，也不填 `reachable`** |
| ⑨ | 不发。**本版没有可达性变化的通知**：读的一方自己读；要不要推送归交付面呈现契约（[G-4](#八已知缺口)） |

---

## 四、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| `state` 恰三值之一；`since` 在时不减、一旦在了就不再缺席（缺席只在开头时间源读不出的那一段，[S-5](#s-5-可达性三态)）；`reachCount` 不减，**恰在由非可达进入可达时加一** | [S-5](#s-5-可达性三态) | 同一时间源（[S-10](#s-10-装配给的保证-vs-协议须给的保证) 第 3 行） | 规格层推导 |
| `reachable` ⇒ 最近一次有结果的往来读成了一份答复，且对端经过确认 | [S-5](#s-5-可达性三态) | 传输绑定的服务端认证（`composition.governance-center-entry-https-json/v1#S-4`） | [PF-017 §4](../../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检) |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **没有任何往来结果时答 `reachable` 或 `unreachable`** | [S-9](#s-9-reachability) ⑧ | —— | 缺席不填初值 |
| **把「问不到」答成 `reachable`**：确认不了对端、读不成的答复、不属于应得那一类的值被当成在应答 | [S-5](#s-5-可达性三态) | —— | `composition.governance-center-entry/v1#S-36`、`composition.governance-center-entry-https-json/v1#S-17` |
| **把中心的一份答复答成 `unreachable`**：中心答了 `unavailable` 或 `login-state-rejected`，本能力却说连不上 | [S-5](#s-5-可达性三态) | —— | [PF-016 §5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#哪几件事必须现读)「问不到不等于无效」 |
| **可达性变化使本能力撤除、替换或重启** | [S-7](#s-7-在场不随可达性变) | 装配不因可达性换掉本能力（[S-10](#s-10-装配给的保证-vs-协议须给的保证) 第 1 行） | [PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 中心持续在应答、到它的路通：`state` 成为 `reachable` | 从那一刻起 `probeInterval + probeTimeout` 之内 | 本能力在场；时间源推进且可读（[S-6](#s-6-自己探自己重连) 第 1 条）；对端的确认材料有效 | [PF-016 flows §二](../../../../product/PF-016-cli-tui-delivery-surface/flows.md#二分支与异常)「再连上时按新读到的重新算」 |
| 中心持续问不到：`state` 成为 `unreachable` | 从那一刻起 `probeInterval + probeTimeout` 之内 | 本能力在场；时间源推进且可读（[S-6](#s-6-自己探自己重连) 第 1 条） | [PF-016 flows §二](../../../../product/PF-016-cli-tui-delivery-surface/flows.md#二分支与异常)「屏上标明此刻连不上中心」 |

---

## 五、装配给的保证 vs 协议须给的保证

### S-10 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版单机，语义不变地可拆。**本能力本身就是据点一侧、跨进程那条边上的一端**——右列写的是这条边已经由协议给的部分，与据点自己被拆开时要补的部分。

| 保证 | 单机由谁给（装配给） | 跨进程之后谁兑现（协议给） | 做不到会怎样 |
|---|---|---|---|
| **可达性变化不使本能力撤除或替换**（[S-7](#s-7-在场不随可达性变)） | 装配：据点不因中心问不到而换掉本能力的提供者；提供者把断线与重连留在自己这一次在场之内 | 不变：据点被拆成多个进程之后，每个持有这份观察的进程各自守这一条 | 一次中心断线连带放弃据点上每一次在途的模型调用 |
| **可达只认确认过的对端**（[S-5](#s-5-可达性三态)） | —— | **协议给**：传输绑定的服务端认证（`composition.governance-center-entry-https-json/v1#S-4`）；确认不了按问不到 | 把一个冒充的对端当成「中心在应答」，读的一方据此去问它 |
| **`since` 取同一时间源**（[S-5](#s-5-可达性三态)） | 装配：据点根作用域恰一份时间源 | 据点被拆开之后，读这份观察的一方与写它的一方要么同一时间源，要么 `since` 只作显示 | `since` 倒退，「连不上多久了」算错 |
| **可达性不作准入依据**（[S-3](#s-3-本契约明确不承诺什么)） | —— | **不变**：任何部署形态下它都只是观察 | 有人拿「可达」放行一件本该现读中心的事 |

---

## 六、交接、缺席与恢复

### S-11 撤除、重启与在途

- **本能力没有耐久事实**：可达性只活在这一次在场里；撤除即丢，再装上从 `undetermined`、`reachCount = 0` 起（[S-5](#s-5-可达性三态)）。**没有要交接的东西**，也没有定时器承担正确性——探测只维持观察的新鲜度（[S-6](#s-6-自己探自己重连)）。
- **撤除时在途的那一次探**：结果丢弃，不更新任何观察（已不在场）。
- **进程重启**：同撤除再装上。
- **必需依赖本能力的消费者**本来就随本能力的撤除一起撤除；不必需依赖的消费者在本能力不在时按 [S-7](#s-7-在场不随可达性变) 第二条收，**不把「不在」读成 `unreachable`**。

---

## 七、规范表达与验证义务

### S-12 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| 三态、`reachCount` 只在进入可达时加一、`since` 不减 | **规范场景**（[S-13](#s-13-断线与重连)） | 一个进程内的三态观察，没有跨方交错；模型里每一步都是原子更新，**计数规则会被建模方式吸收**，写不出一条在条款被违反时失败的断言。对真实的脚本化对端观察更强 |
| 可达只认确认过的对端；在应答不看答复内容 | **规范场景**（[S-14](#s-14-在应答就是可达判不了也算)、[S-15](#s-15-确认不了对端就是问不到)） | 分界落在传输读法上，只有对真实字节核得出 |
| 在场不随可达性变 | **规范场景**（[S-13](#s-13-断线与重连) 的在场一支） | 要观察的是装配里的撤除与重跑，模型给不出比真实装配演练更强的证据 |
| 有界进展 | **规范场景**（[S-13](#s-13-断线与重连) 计时一支） | 上界是具名参数，对脚本化对端按参数值核 |

**不建 TLA+、不建 Alloy、不建 Schema。**线上形状归入口组合与传输绑定；capability 不发布 Schema（[规格入口](../../../README.md#准入门槛与停止条件)）；返回值的三个成员以散文定义，交换表示随把本操作送过进程边界的那份组合契约定（本版没有：本操作只在据点进程内）。
执行状态与结果在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

#### S-13 断线与重连

脚本化的对端：先正常应答 → 切断 → 恢复 → 再切断 → 再恢复。一个消费者在全程每隔一小段读一次 [`reachability`](#s-9-reachability)，另有一次模型调用在途（验收装配）。

**必须观察到**：起来后第一次往来有结果之前读到 `undetermined`、`reachCount = 0`；之后 `reachable`、`reachCount = 1`；切断之后 `probeInterval + probeTimeout` 之内 `unreachable`、`reachCount` 仍是 1；恢复之后同一上界之内 `reachable`、`reachCount = 2`；再一轮之后 `reachCount = 3`。`since` 全程不减。**在场一支**：全程本能力没有被撤除或替换，必需依赖它的消费者没有重跑，在途的模型调用没有被放弃。
**绝不能观察到**：起来之后还没有结果就读到 `unreachable`；`reachable` 之间没有经过非可达却 `reachCount` 加了一；切断使本能力或任何消费者撤除、重跑。

#### S-14 在应答就是可达，判不了也算

对端对一切请求都答 `unavailable`；再换成都答 `version-mismatch`；再换成对出示物都答 `login-state-rejected`。

**必须观察到**：三种情形下都是 `reachable`。
**绝不能观察到**：因为中心「判不了」或「登录状态不作数」就答 `unreachable`——那会把「中心在、但答不了」说成「连不上」。

#### S-15 确认不了对端就是问不到

对端在应答，但证书对不上配置的中心（或读到的不是一份按传输绑定读得成的答复）。

**必须观察到**：`unreachable`。
**绝不能观察到**：`reachable`。

---

## 八、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **与真承接者那一程的关系**：本契约是据点到中心那条连接的**观察面窄口**，真承接者是入口组合 v2 的据点客户端——下一程（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：本程不补、留给下一程；同节 N-37 ⑨ 勘误确认真承接者是 C-4）。**真承接者未到，接口已定**（[D-043 R-1](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。**本版不收**：经这条连接向中心发请求（资产与模型目录各面、凭据送达、中心事实副本的读取），它们的线上形状归入口组合 v2。那一程要更多时，本契约出新版本；本版的三态、`reachCount` 与 [S-7](#s-7-在场不随可达性变) 在新版本里保留 | 主线 → 入口组合 v2 那一程 | 入口组合 v2 成立、它的据点客户端立节点；本契约新版本把请求面并进来或指向它 |
| G-2 | **连到的是不是这个据点所属的那个中心**：中心标识的比较、「搬家」与「另一个中心」的区分。本版的「可达」只说配置的地址后面、经过确认的那个对端在应答 | PF-016 的 owner（[§4 治理中心](../../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)已记「本 rev 未定」）＋ 入口 v2 的据点客户端 | 产品定下怎样确认；比较落在客户端，本契约要不要多一态随之定 |
| G-3 | **具名参数的取值**：`probeInterval`、`probeTimeout` | 主线／装配（部署配置，缺值即启动失败） | 装配给值 |
| G-4 | **可达性变化要不要推送**：交付面「屏上标明此刻连不上中心」目前只能读 | 交付面呈现契约（未立） | 那份契约定下；需要时本契约新版本加一个通知 |

---

## 九、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **据点上的模型档案读提供者**（`capability.model-profile-directory` v1 在据点一侧的兑现；取值先读本地副本、中心可达时刷新） | 此刻去不去问中心；再连上之后刷新副本；中心问不到时自己不被连带重跑 | [S-9](#s-9-reachability) 的 `state` 与 `reachCount`（再连上可见）；[S-7](#s-7-在场不随可达性变) | **观察够**。**「问中心」本身不在本版**（[G-1](#八已知缺口)）：读到可达也仍要按 [S-3](#s-3-本契约明确不承诺什么) 第一条处理每一次请求的问不到 |
| **据点验收装配的最小提供者**（按测试脚本模拟断线与重连；取代原先的替身，[D-043 R-1](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)） | 回放一段合法的观察序列 | [S-5](#s-5-可达性三态) 的三态与计数规则、[S-7](#s-7-在场不随可达性变) | **够**：满足 S-5 不变量的序列都是合法回放；它不判对端、不连中心，**没有做本契约未定义的判断** |
| **交付面**（将来：屏上标明此刻连不上中心） | 此刻连得上连不上、连不上多久了 | [S-9](#s-9-reachability) 的 `state` 与 `since` | **读得出**；变化推送不在本版（[G-4](#八已知缺口)） |

---

## 十、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)。接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
