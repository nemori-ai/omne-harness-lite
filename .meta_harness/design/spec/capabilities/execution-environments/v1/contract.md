# capability.execution-environments v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.execution-environments, 1)`——
  `family = capabilities`、`topic = execution-environments`、规范路径 `spec/capabilities/execution-environments/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-25 起草，未经独立评审）——未接受、未冻结
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-005 rev 6**、**PF-006 rev 19**、**PF-016 rev 6** 为准
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.messages · v1`（candidate；只取 `SessionRef`）
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1`（candidate；只取 `ToolDefinitionRef` 与执行环境句柄解析出的那一样）
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`（candidate；只取目标环境的含义）
  - 候选依赖改动时本契约须重核
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如
  `capability.execution-environments/v1#S-12`；缺口 `G-n` 同理。编号在本版本内只追加、不重排

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 宿主机始终在场；只要执行环境权限允许就可用，不存在「宿主机不可用」；落点每扇门每次执行现算 | [PF-005 §6.1](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配) | S-6、S-12 |
| 宿主机不提供租户隔离，作用能不能落在它上面必须被显式允许，不是缺省可用；授予与收回只走执行环境权限这一项 | [PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许) · [§4 宿主机](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#宿主机) | S-6 |
| 执行环境权限恰三态、按工具逐个授予；它不是 `never-allow`，这个工具就有用宿主机的资格；没声明要用执行环境的工具这一维不适用 | [PF-005 §4 执行环境权限](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#执行环境权限) · [§6.8](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#68-执行环境权限每个工具各配各的) | S-6、G-4 |
| 落点到不了位就是拒绝，不回退宿主机、不换更宽松的落点 | [PF-005 §6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) | S-6、S-12 ⑧ |
| 工具怎么提执行环境的要求：满足不了就不可用，绝不降级满足 | [PF-006 §6.8](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求) | S-6 第 3 条 |
| 一台机器上账号之间互不可见，但宿主机那一层不隔离 | [PF-016 §6.4](../../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离) | S-3、S-16 |
| 跨租户默认拒绝；身份参数显式携带 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | S-5、S-8 |
| 单机交付、语义不变地可拆 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-16 |
| 统一语言 | [执行环境](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment) · [宿主机](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) · [执行环境权限](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission) · [目标环境](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-target-environment--目标环境--target-environment) · [拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) · [工具](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-tool--工具--tool) · [会话](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session--会话--session) · [租户](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant) | 全部正式名。**无词条的规格层名字**：执行环境引用、进程组、落点判断、拓展件子进程的宿主机允许——只在本契约里有定义，不另立，已报主线 |

> **这张表里没有产品行、或产品行不足以单独支撑的条款**：
>
> | 条款 | 依据 |
> |---|---|
> | 本契约作为一份**窄口**能力存在：只收「宿主机是否允许、按进程组起停、引用」，PF-005 其余不收 | 产品负责人裁定 [D-043 R-1](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)（替身改为「接口契约 ＋ 最小提供者」，接口按消费者的需要定窄口）；真承接者见 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |
> | [S-6](#s-6-落点判断本版只有宿主机) 第 2 条：`auto_place` 在本版落宿主机 | **规格层推导**：它不是 `never-allow`，所以这个工具有用宿主机的资格（PF-005 §4）；本版没有任何沙箱实现在场（[S-2](#s-2-本契约不拥有什么)），宿主机是唯一的候选。**产品没有明说「没有沙箱时 `auto_place` 落哪」**；主线已接受这一读法（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑥） |
> | [S-6](#s-6-落点判断本版只有宿主机) 第 3 条：声明了目标环境的工具本版判为 `requirementNotJudged` | **规格层推导**：匹配规则未定（`data.tool-definition/v1` 的 G-5），判不出「满足」就不能落；「判不出来」与「判为不许」分成两个值 |
> | [S-6](#s-6-落点判断本版只有宿主机) 第 4 条：拓展件子进程要落宿主机，须另有一项显式允许，否则不落 | **产品依据已补**：PF-005 §6.10 允许 hooks 兼容件使用宿主机，装配须交入显式允许；工具权限只管工具（[G-3](#十已知缺口)）；缺席即不许 |
> | 进程组、[S-13](#s-13-startprocess)～[S-15](#s-15-stopprocessgroup) 的起停语义 | 消费者的要求（`capability.hooks-import` v1 的 S-18 起子进程四件事：新进程组、按进程组停、有界答复「确认退出／未确认」、未确认的留执行环境善后，[D-040 §八 M64](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）落成性质；**有界答复与善后是本契约承接的义务** |
> | 操作名、失败值名、`why` 的取值名、具名参数名 | 起草时的候选名（账本只给了服务键 `executionEnvironments`），**主线已接受**（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ①） |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**会话据点上「一次执行的作用能不能落在宿主机上」的判断，以及在宿主机上按进程组起、停进程并交回结果。**

| # | 拥有的事实或义务 | 正文 |
|---|---|---|
| 1 | **执行环境引用**：一个会话在本能力这里的执行环境，给消费者拿着去问落点、起进程 | [S-5](#s-5-执行环境引用) |
| 2 | **落点判断**：这一次落不落得了宿主机；本版只有宿主机这一个候选 | [S-6](#s-6-落点判断本版只有宿主机) |
| 3 | **进程组**：起一个进程就开一个新的组，按组停、有界地答「确认退出」或「未确认」，未确认的继续停 | [S-7](#s-7-进程组) |

**五个操作**：取会话的执行环境引用（`resolveSessionEnvironment`）、判一扇门这一次的落点（`placeExecution`）、起进程（`startProcess`）、取进程的结果（`processOutcome`）、停进程组（`stopProcessGroup`），见[第四节](#四操作)。**没有事件。**

### S-2 本契约不拥有什么

**PF-005 的其余部分本版不收，归 PF-005 那一程**（[G-1](#十已知缺口)）：

| 不拥有 | 归谁 |
|---|---|
| **沙箱**：沙箱实现的装配与声明、无状态／会话级／租户级沙箱的存活与数据（[PF-005 §5.1～§5.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#51-四种执行环境)、§6.3～§6.5） | PF-005 那一程。**本版没有任何沙箱实现在场** |
| **设施与目标环境的匹配**（「满足」是恰等还是至少、与三态怎么交互） | PF-005 那一程与 `data.tool-definition` v1 的 G-5（[G-5](#十已知缺口)） |
| **执行环境权限的取值**：组织级、租户级怎样授予、怎样求值 | 资产设置与求值那一侧（`capability.asset-evaluation` 与注册表），**来路本版没有契约**（[G-2](#十已知缺口)） |
| **落点变化的提醒**、agent 知道自己落在哪（[PF-005 §6.6](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#66-agent-要知道自己落在哪上次的东西还在不在)） | PF-005 那一程 |
| **「这个动作准不准」**（放行判断） | `capability.tool-admission`；执行环境权限只管落在哪 |
| **工具执行者自己怎样跑**（执行宿主本地实现的进程、MCP 对端进程） | `capability.tool-execution-runtime`、`capability.mcp-bridge`；本版的 [`startProcess`](#s-13-startprocess) 只为拓展件子进程 |
| **会话持有哪个租户** | 会话那一程（PF-015）；本契约只收调用方交来的租户（[S-11](#s-11-resolvesessionenvironment) ②） |
| **会话结束时它的执行环境怎样收** | PF-005 与 PF-015 那一程（[G-8](#十已知缺口)） |

### S-3 本契约明确不承诺什么

- **不提供租户隔离。**落在宿主机上的作用，另一个租户、同一台机器上的另一个账号看得见（[PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)、[PF-016 §6.4](../../../../product/PF-016-cli-tui-delivery-surface/design.md#64-一台机器上账号之间互不可见但宿主机那一层不隔离)）。本契约守的是「**没有被显式允许就不落宿主机**」，不是「落了也隔离」。
- **不核会话持有的租户**：`resolveSessionEnvironment` 收下调用方交来的 (租户, 会话) 对，不另读会话持有的是哪个租户——那是调用方的前提（[S-16](#s-16-装配给的保证-vs-协议须给的保证) 第 2 行）。
- **不限定进程在宿主机上够得着什么**：允许了，范围就是整台宿主机（[PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许) 末段）。工作目录只是起点，不是围栏。
- **不承诺进程的子孙离不开它的组**：一个进程主动把自己移出组（另开会话、另开组）之后，停组停不到它（[S-7](#s-7-进程组) 前提）。
- **不缓存落点**：每一次 `placeExecution` 现读现判（[S-12](#s-12-placeexecution) ④）。

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 身份值、会话引用、拓展点统一输入里的工具定义引用、工具定义的目标环境。**
本契约的消费者（执行宿主、派发器、兼容件）依赖本契约，本契约不依赖它们。

**下表每个 `#S-n` 前缀省去了坐标 `omne-harness-lite-design-2026-09-15 · <contract_id> · v1`；catalog 的 `clauses` 以它为准。**

| 被消费的条款 | 用在哪 |
|---|---|
| `data.identity-values` [`#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等) `TenantId` 的构成与相等 | 全部操作的 `tenant`；[S-5](#s-5-执行环境引用) 引用的归属 |
| `data.identity-values` [`#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值) · [`#S-18`](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝) · [`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) | [S-8](#s-8-缺席时的默认答案) 三类缺席 |
| `data.identity-values` [`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证) 跨边界须重新验证 | [S-16](#s-16-装配给的保证-vs-协议须给的保证) 右列 |
| `data.identity-values` [`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识的交换表示 | [S-5](#s-5-执行环境引用) 执行环境引用、[S-7](#s-7-进程组) 进程组引用 |
| `data.identity-values` [`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) 表示层校验与判定分开 | [S-9](#s-9-失败值) `invalidInput` |
| `data.messages` [`#S-24`](../../../data/messages/v1/contract.md#s-24-别的会话捎话与到点了) `SessionRef` | [S-11](#s-11-resolvesessionenvironment) ① |
| `data.loop-extension` [`#S-14`](../../../data/loop-extension/v1/contract.md#s-14-按位置的-subject) `ToolDefinitionRef` | [S-12](#s-12-placeexecution) ① 的 `tool` |
| `data.loop-extension` [`#S-41`](../../../data/loop-extension/v1/contract.md#s-41-执行环境句柄) 执行环境句柄解析出「这一会话的执行环境」 | [S-5](#s-5-执行环境引用)：本契约的执行环境引用就是那一样的值 |
| `data.tool-definition` [`#S-11`](../../../data/tool-definition/v1/contract.md#s-11-目标环境) 目标环境：不声明即没有特殊要求；匹配未定 | [S-6](#s-6-落点判断本版只有宿主机) 第 3 条 |

---

## 二、概念、身份与必要状态

### S-5 执行环境引用

**执行环境引用（无词条）= 一个会话在本能力这里的执行环境的不透明引用。**消费者拿着它问落点、起进程；它就是 `data.loop-extension/v1#S-41` 里执行环境句柄解析出的「这一会话的执行环境」那一样。

- **表示**：照 `data.identity-values/v1#S-31` 的不透明标识规则——非空、首尾不是空白、逐码点相等、**不解析**；消费者不得从串里读出会话或租户。
- **绑定**：每个引用绑定恰一对 (租户, 会话)。**同一次在场里，同一对得同一个引用**；不同的对得不同的引用。
- **只在本能力这一次在场里有效**：本能力撤除又装上（含进程重启）之后，旧引用一律 `referenceNotValid`（[S-17](#s-17-撤除重启与在途)）。
- **跨租户即无效**：拿着引用、交来的 `tenant` 却不是它绑定的那一个 ⇒ `referenceNotValid`，**与「这个引用从没发过」同一个值**——不透露它属于别的租户。
- **它不是一个落点**：本版一个会话只有宿主机可落，但引用不说「在宿主机上」；落点每次由 [S-6](#s-6-落点判断本版只有宿主机) 现判。

### S-6 落点判断：本版只有宿主机

**本版的落点判断只有两种答案：落宿主机，或不落。**「不落」恰分三种缘由，**判不出来与判为不许分开**。

**判一扇门（工具）的一次执行**（[`placeExecution`](#s-12-placeexecution)），读这个租户下这个工具此刻的两样——[执行环境权限](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)的求值、[目标环境](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-target-environment--目标环境--target-environment)的求值——按下面的次序判，第一条成立的就是答案：

1. **两样之一读不到** ⇒ `unavailable`。**不当成允许，也不当成不许。**读取的来路本版没有契约（[G-2](#十已知缺口)）。
2. **执行环境权限是 `never-allow`，或这个工具在这个租户下没有执行环境权限的值** ⇒ `noLanding{ why: hostNotAllowed }`。宿主机不是缺省可用的（[PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)）；`never-allow` 在别处也去不了隔离环境（本版没有沙箱），**没有第三条路**（[PF-005 §6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)）。
3. **目标环境声明了**（求值后的那一份在） ⇒ `noLanding{ why: requirementNotJudged }`。本版判不了宿主机满不满足它（`data.tool-definition/v1#S-11` 的匹配未定）；**满足不了不降级满足**（[PF-006 §6.8](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求)），判不出满足就不落。
4. **执行环境权限是 `always-allow` 或 `auto_place`** ⇒ **落宿主机**。`auto_place` 在本版落宿主机：它不是 `never-allow`，这个工具就有用宿主机的资格（[PF-005 §4](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#执行环境权限)），而本版没有别的候选（规格层推导，主线已接受：[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑥）。

**判一个拓展件子进程**（[`startProcess`](#s-13-startprocess)）：它不是工具，执行环境权限管不到它。**只有「拓展件子进程的宿主机允许」（无词条）这一项显式允许在场时才落宿主机**；那一项读不到 ⇒ `unavailable`；没有 ⇒ `noLanding{ why: hostNotAllowed }`。[PF-005 §6.10](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#610-hooks-子进程与环境变量传递) 已允许 hooks 兼容件落宿主机（[D-044 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)）；将该允许交给本能力的读面接线仍待落实（[G-3](#十已知缺口)），未交入时沿上述缺席规则拒绝。

- **没有第二处允许**：对工具，允许只来自执行环境权限（[PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)「没有第二处」）；本能力不另持一份「哪些工具可以落宿主机」的名单。
- **每次现判**：权限改了，下一次判按新值（[PF-005 §6.1](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#61-宿主机始终在场沙箱实现装配时可选装配)）；不缓存上一次的答案。
- **不回退**：任何一种「不落」都不换成宿主机，也不换成别的落点（[PF-005 §6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)）。

### S-7 进程组

**进程组（无词条）= 本能力起的一个进程，连同它的全部子孙进程。**[`startProcess`](#s-13-startprocess) 每次开一个**新的**组，交回它的**进程组引用**（不透明，照 `data.identity-values/v1#S-31`；只在本能力这一次在场里有效；绑定起它的那个执行环境引用）。

- **按组停**：停的是整组，不是只停起的那一个；组里起的进程先结束、子孙还在的，停组照样停到它们。
- **进程以本能力所在进程的操作系统身份跑**，不以别的身份——停得了它们的前提。
- **前提**：子孙没有主动把自己移出这个组（[S-3](#s-3-本契约明确不承诺什么)）。
- **引用的寿命**：从 `startProcess` 成功，到 [`stopProcessGroup`](#s-15-stopprocessgroup) 答 `confirmedGone` 为止；那之后同一个引用 `referenceNotValid`。**起的进程自己结束不使引用失效**——结果在那之前一直读得到（[S-14](#s-14-processoutcome)）。

---

## 三、贯穿全部操作的规矩

### S-8 缺席时的默认答案

| 缺席的是什么 | 答案 | 依据 |
|---|---|---|
| **身份参数**（`tenant`、`session`、`ref`、`processGroup`） | **`invalidInput`**——没有默认值，不补「当前租户」「当前会话」 | `data.identity-values/v1#S-17` |
| **判定要的东西**：执行环境权限的值、拓展件子进程的宿主机允许 | **不许**：`noLanding{ why: hostNotAllowed }`——**不当成允许** | `data.identity-values/v1#S-18`；[PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许) |
| **读不到**（判定要的东西此刻取不到） | **`unavailable`**——与「不许」是两个值 | `data.identity-values/v1#S-19` |

### S-9 失败值

**本契约的失败值恰六个，没有「其他」。**每个操作的 ⑥ 是它的子集，按判定次序从左到右。

| 失败值 | 含义 |
|---|---|
| `invalidInput` | 输入不合形状，或身份参数缺席（表示层拒绝值，与判定分开：`data.identity-values/v1#S-33`） |
| `environmentsWithdrawn` | 本能力正在撤除，这一次没有结论（[S-17](#s-17-撤除重启与在途)） |
| `referenceNotValid` | 引用不是本能力这一次在场发出的、已失效、或不属于交来的租户——**不分这几种** |
| `unavailable` | 判定要的东西此刻读不到 |
| `noLanding{ why }` | 这一次不落宿主机；`why` 恰一个，取自 `{ hostNotAllowed, requirementNotJudged }`（[S-6](#s-6-落点判断本版只有宿主机)） |
| `startFailed{ why }` | 落得了、却没起来，**起的进程从没跑过**；`why` 恰一个，取自 `{ programNotFound, launchRefused }`（[S-13](#s-13-startprocess)） |

---

## 四、操作

### S-10 这一节每个操作写全九件事

①输入 · ②前置与授权 · ③结构性禁止（不适用写「无」）· ④提交点与原子性 · ⑤成功返回 · ⑥失败集合（闭合枚举，按判定次序）· ⑦幂等与重复 · ⑧缺席时的默认答案 · ⑨事件。

### S-11 resolveSessionEnvironment

**取一个会话在本能力这里的执行环境引用。**

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`、`session: SessionRef`；都必带 |
| ② | **调用方保证 `tenant` 恰是这个会话持有的那个租户**（调用方从会话持有租户的读面取：`capability.session-tenancy/v1#S-8`；[S-3](#s-3-本契约明确不承诺什么)）。本能力不另核 |
| ③ | 无 |
| ④ | 只在本能力这一次在场里记下 (租户, 会话) → 引用；没有耐久写入 |
| ⑤ | `{ ref }`——执行环境引用（[S-5](#s-5-执行环境引用)） |
| ⑥ | `invalidInput` · `environmentsWithdrawn` |
| ⑦ | 同一次在场里同一对重复取，得同一个 `ref` |
| ⑧ | 身份参数缺席 ⇒ `invalidInput` |
| ⑨ | 不发 |

### S-12 placeExecution

**判一个工具这一次执行落不落得了宿主机。**执行宿主起执行者之前问它（`capability.tool-execution-runtime` v1 的 S-38 第 2 步）。

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`、`ref`（执行环境引用）、`tool: ToolDefinitionRef`（`data.loop-extension/v1#S-14`）；都必带 |
| ② | `ref` 须是本能力这一次在场发出、绑定这个 `tenant` 的 |
| ③ | 无 |
| ④ | 只读；**每次现读执行环境权限与目标环境、现判**（[S-6](#s-6-落点判断本版只有宿主机)），不缓存 |
| ⑤ | `{ landing: host }`——本版唯一的成功值 |
| ⑥ | `invalidInput` · `environmentsWithdrawn` · `referenceNotValid` · `unavailable` · `noLanding{ why }`——`why` 按 [S-6](#s-6-落点判断本版只有宿主机) 的次序：`hostNotAllowed` 先于 `requirementNotJudged` |
| ⑦ | 只读，任意重复；**两次之间权限变了，两次答案可以不同**——那是现判的本意 |
| ⑧ | 权限值没有 ⇒ `noLanding{ hostNotAllowed }`；读不到 ⇒ `unavailable`。**任何一种都不答 `host`** |
| ⑨ | 不发 |

- **判的是这一次**：答 `host` 不给之后的执行预约什么；下一次执行再问。
- **「没声明要用执行环境的工具，这一维不适用」本版不区分**（[G-4](#十已知缺口)）：交来的每个工具都按「这一维适用」判——多判一次不许，不少判一次允许。

### S-13 startProcess

**在一个会话的执行环境里起一个拓展件子进程，开一个新的进程组。**兼容件的外部命令执行器起子进程用它（`capability.hooks-import` v1 的 S-18）。

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`、`ref`（执行环境引用）、`launch`：`{ program, arguments, environment, workingDirectory, input }`——`program` 非空串；`arguments` 串的序列（可空）；`environment` 名到值的映射（可空）；`workingDirectory` 非空串；`input` 字节序列（可空）。**全部必带**，没有默认值 |
| ② | `ref` 须是本能力这一次在场发出、绑定这个 `tenant` 的；**落点判断对拓展件子进程答宿主机**（[S-6](#s-6-落点判断本版只有宿主机) 末段） |
| ③ | **不经命令解释器、不做任何插值**：`program` 与 `arguments` 原样交给操作系统，一个参数就是一个参数。**子进程的环境变量恰是 `launch.environment`**：不继承本能力所在进程的任何环境变量（那里可能有秘密）。`program` 按 `launch.environment` 里的程序搜索路径找——与子进程自己看到的一致 |
| ④ | **提交点是进程起来的那一刻**：起来了，进程组就在，引用即有效；没起来，什么都没有留下。`input` 在起来之后写进子进程的标准输入，写完即关 |
| ⑤ | `{ processGroup }`——进程组引用（[S-7](#s-7-进程组)） |
| ⑥ | `invalidInput` · `environmentsWithdrawn` · `referenceNotValid` · `unavailable` · `noLanding{ why: hostNotAllowed }` · `startFailed{ why }`——`programNotFound`：找不到这个程序；`launchRefused`：找得到、操作系统却不让它起来（工作目录不在、没有执行权限、资源不够） |
| ⑦ | **不幂等**：每次成功都是一个新的组、一个新的进程。调用方没拿到回执就重试，会多起一个；**在途的回执丢了由调用方收**（它本来就在同一个进程里） |
| ⑧ | 拓展件子进程的宿主机允许没有 ⇒ `noLanding{ hostNotAllowed }`；读不到 ⇒ `unavailable`。**不回退、不换落点** |
| ⑨ | 不发 |

- **`EnvAllowlist`（候选名，主线给，无词条）——从据点进程环境里挑变量只许按它挑**：一个有限的环境变量**名**集合（可空，每个名非空）。按它从据点进程环境取出的**恰是**：名字在集合里、且据点进程环境里此刻有的那几个，原名原值；集合外的一个都不取；集合里有、环境里没有的名字**不取、不补空值**。本能力不持有、不读任何一份——`launch.environment` 由调用方交全（③），调用方要带据点进程环境里的变量时，就按它自己的那一份 `EnvAllowlist` 取出再并进去。**形状只定在这里一次**：兼容件的 `hookEnvAllowlist`（`capability.hooks-import/v1#S-18`）与 MCP 桥的 `stdioEnvAllowlist`（`capability.mcp-bridge/v1#S-6`）是两个策略点、同一个形状，各自配值（主线裁定 [D-040 §八 N-39](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
- **`startFailed` 的进程从没跑过**：那是「开始之前」的失败（`capability.loop-extension-runner/v1#S-12` 的分界，兼容件据此报「起不来」）。**起来之后才因找不到某个子程序退出的，是那个进程自己的退出**，归 [`processOutcome`](#s-14-processoutcome)。

### S-14 processOutcome

**等一个进程组里起的那个进程结束，交回它的结果。**

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`、`ref`、`processGroup`；都必带 |
| ② | `processGroup` 须是经这个 `ref` 起的、仍有效的（[S-7](#s-7-进程组)） |
| ③ | 无 |
| ④ | 只读。**在起的那个进程结束时返回**；它已经结束的，立即返回 |
| ⑤ | `{ ended, stdout, stderr, truncated }`——`ended` 恰一种：`exited{ code }`（它自己退出，带退出码）或 `terminated`（被停下，含被 [`stopProcessGroup`](#s-15-stopprocessgroup) 停下）；`stdout`、`stderr` 是**起的进程所在管道上的字节**——起的进程与它的子孙共用这两条管道，分不开谁写的，所以子孙写的也在里面（主线裁定，D-040 §八 N-40 ③）——各以具名参数 `outputBound` 封顶，超出的丢弃；`truncated = { stdout: 布尔, stderr: 布尔 }` 说哪一路被截了 |
| ⑥ | `invalidInput` · `environmentsWithdrawn` · `referenceNotValid` |
| ⑦ | 只读；同一个组重复取，得同一份结果 |
| ⑧ | 身份参数缺席 ⇒ `invalidInput` |
| ⑨ | 不发 |

- **结果只说起的那一个进程**：组里别的进程还在不在，不在结果里；要它们也停，调用方停组。
- **输出多不使进程被停**：超出 `outputBound` 的输出丢弃，进程照跑。
- **调用方不再等，进程照跑**：放弃一次等待不停任何东西；要停，调用 [`stopProcessGroup`](#s-15-stopprocessgroup)。
- **等待没有自己的时限**：时限是调用方的（兼容件取 handler 的 `timeout`）；到点由调用方停组。

### S-15 stopProcessGroup

**停一个进程组，并在有界时间内答「确认退出」或「未确认」。**

| # | 内容 |
|---|---|
| ① | `tenant: TenantId`、`ref`、`processGroup`；都必带 |
| ② | `processGroup` 须是经这个 `ref` 起的、仍有效的 |
| ③ | 无 |
| ④ | 先请组里每个进程退出；过具名参数 `stopGrace` 仍有在的，强制结束；然后确认组里一个都不剩。**答复在具名参数 `stopReplyBound` 之内给出**，不论停没停完。**每一次发信号之前核对这个组仍是本能力起的那一个**（组长身份，主线裁定 [D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：核不上就不发——组号只在原来那个组一个不剩之后才会被再分配，所以核不上即原组已不在，按一个都不剩答；**判不出是不是同一个组时也不发**，这一次按 `notConfirmed` 答、之后再核 |
| ⑤ | 恰一种：`confirmedGone`——组里一个都不剩，此后这个进程组引用失效；`notConfirmed`——到 `stopReplyBound` 还没能确认 |
| ⑥ | `invalidInput` · `environmentsWithdrawn` · `referenceNotValid` |
| ⑦ | **幂等**：再停一次同一个组，照样有界答复；已经 `confirmedGone` 的组，引用已失效，再停得 `referenceNotValid`。**组里的进程已经全部自己结束的，立即 `confirmedGone`** |
| ⑧ | 身份参数缺席 ⇒ `invalidInput` |
| ⑨ | 不发 |

- **`notConfirmed` 之后本能力继续停这个组**，直到确认一个不剩、或本能力撤除（撤除时的收法见 [S-17](#s-17-撤除重启与在途)）——这就是「子进程留给执行环境善后」（[D-040 §八 M64](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。其间引用仍有效，调用方可以再停、再等结果。
- **「没确认就不算停下」**：`notConfirmed` 不是 `confirmedGone` 的一种，调用方不得把它当成停下了（兼容件据此在它那一次收场的说明里写「已请求停止、未确认退出」，`capability.hooks-import/v1#S-18`）。

---

## 五、事件

**本版不发任何事件。**进程结束、组被确认停下，都经 [`processOutcome`](#s-14-processoutcome)、[`stopProcessGroup`](#s-15-stopprocessgroup) 的返回交回调用方。

---

## 六、性质与前提

**编号只在本节作行标，不是可外部引用的条款号。**

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| 执行环境引用恰绑定一对 (租户, 会话)；同一次在场里同一对恰一个引用 | [S-5](#s-5-执行环境引用) | —— | 规格层推导 |
| 进程组引用恰绑定一个执行环境引用；从起来到 `confirmedGone` 有效 | [S-7](#s-7-进程组) | —— | 规格层推导 |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **没有显式允许却落宿主机**：权限是 `never-allow`、没有值、读不到，或拓展件子进程没有那一项允许，却答 `host` 或起了进程 | [S-6](#s-6-落点判断本版只有宿主机)、[S-12](#s-12-placeexecution) ⑧、[S-13](#s-13-startprocess) ⑧ | 权限值的来路给的是这个租户下这个工具此刻的值（[G-2](#十已知缺口)） | [PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许) |
| **「不落」被换成宿主机或别的落点** | [S-6](#s-6-落点判断本版只有宿主机) 末条 | —— | [PF-005 §6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) |
| **一个租户拿到或用上另一个租户的引用** | [S-5](#s-5-执行环境引用)、各操作 ② | 调用方交来的租户属实（[S-16](#s-16-装配给的保证-vs-协议须给的保证) 第 2 行） | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |
| **子进程继承本能力所在进程的环境变量**（其中的秘密因此进了第三方脚本） | [S-13](#s-13-startprocess) ③ | —— | [PF-005 §6.10](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#610-hooks-子进程与环境变量传递) |
| **`notConfirmed` 被当成停下** | [S-15](#s-15-stopprocessgroup) 末条 | —— | [D-040 §八 M64](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |
| **本能力发出的信号到达组外的进程**：信号只许到达本能力起的进程及其子孙；`notConfirmed` 之后继续停的那几轮同样不许 | [S-15](#s-15-stopprocessgroup) ④、[S-7](#s-7-进程组) | **组长身份在每一次发信号之前核对**（S-15 ④）；子孙没有离开这个组（离开的不在本能力够得着的范围里，[S-3](#s-3-本契约明确不承诺什么)） | 主线裁定 [D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：组号被操作系统再分配给无关进程时，按组号重复强制结束会停掉它 |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| `stopProcessGroup` 有答复 | `stopReplyBound` | 本能力在场 | `capability.hooks-import/v1#S-18` 第 3 条第 4 项（停组的答复不改结论，要有界） |
| 组里的进程都响应强制结束时，`stopProcessGroup` 答 `confirmedGone` | `stopGrace` 加确认所需的时间，不超过 `stopReplyBound` | 子孙没有离开这个组；操作系统执行强制结束 | 规格层推导 |
| 本能力撤除时，它起过、还没确认停下的每个组都被停 | 每组 `stopReplyBound` | 同上 | [S-17](#s-17-撤除重启与在途) |

---

## 七、装配给的保证 vs 协议须给的保证

### S-16 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版单机，语义不变地可拆。

| 保证 | 单机由谁给（装配给） | 跨进程之后谁兑现（协议给） | 做不到会怎样 |
|---|---|---|---|
| **只有显式允许才落宿主机**（[S-6](#s-6-落点判断本版只有宿主机)） | 装配：本能力从执行环境权限的来路读值；那条来路本版没有契约（[G-2](#十已知缺口)），验收装配里由测试种子顶上 | 执行环境在远端时，落点请求必须携带租户与工具身份，在接收边界重新验证（`data.identity-values/v1#S-30`）；读不到即 `unavailable` | 一个没被允许的工具在宿主机上写下另一个租户看得见的东西 |
| **交来的租户就是会话持有的租户**（[S-11](#s-11-resolvesessionenvironment) ②） | 装配：调用方（派发器、agent loop）从会话持有租户的读面取了再交来 | 跨进程之后，请求必须携带会话与租户身份并在接收边界重新验证（`capability.hooks-import` v1 的 S-26 第 1 行已记下同一件） | 一个租户的子进程在另一个租户的执行环境里跑 |
| **按组停得到整组**（[S-7](#s-7-进程组)） | 装配：进程与本能力在同一台机器、同一个操作系统身份下 | 执行环境在远端时，停组的请求与「确认退出」的答复都跨进程；**没确认就不算停下**不变 | 超时或取消之后脚本还在跑、继续写文件 |
| **有界答复**（[S-15](#s-15-stopprocessgroup) ④） | 本能力自己按 `stopReplyBound` 答 | 远端答不回来时，调用方那一侧按 `notConfirmed` 收，不无限等 | 一次经过挂住，整条 loop 停在一个 hook 上 |
| **子进程环境变量不带本进程的秘密**（[S-13](#s-13-startprocess) ③） | —— | **不变**：任何部署形态下子进程只拿到交来的那一份 | 模型凭据、登录状态之类进了第三方脚本的环境 |

---

## 八、交接、缺席与恢复

### S-17 撤除、重启与在途

- **本能力没有耐久事实**：引用、进程组、结果都只活在这一次在场里。
- **撤除时**：先不再接受新的请求（新来的得 `environmentsWithdrawn`）；对它起过、还没 `confirmedGone` 的每个组按 [S-15](#s-15-stopprocessgroup) 停，每组以 `stopReplyBound` 为界；**正在等的 `processOutcome` 与 `stopProcessGroup` 以 `environmentsWithdrawn` 收**。停不下来的组在这一次在场结束时仍在——**本版不承诺在下一次在场里回收它们**（[G-7](#十已知缺口)）。
- **重启**（含本能力所在进程崩溃）：旧的执行环境引用、进程组引用一律 `referenceNotValid`。崩溃时还在跑的进程不被本能力停下（[G-7](#十已知缺口)）。
- **消费者一侧**：兼容件撤除时经本能力停下它起过的组（`capability.hooks-import` v1 的 S-27 末行）；本能力比它先撤除时，那些组已由上面第二条停过，兼容件的停组请求得 `environmentsWithdrawn` 或 `referenceNotValid`，按「未确认」处置。

---

## 九、规范表达与验证义务

### S-18 本版选用哪些形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| 落点判断的次序与「判不出 ≠ 不许」 | **规范场景**（[S-19](#s-19-落点的四种答案)、[S-20](#s-20-拓展件子进程没有允许就不起)） | 一次纯判定，没有跨方交错；次序在模型里是一个 `IF` 链，**被建模方式吸收**，写不出比逐支演练更强的断言 |
| 按组停、有界答复、未确认之后继续停 | **规范场景**（[S-21](#s-21-孙进程随组停下)、[S-22](#s-22-停不下来有界答复之后继续停)） | 要观察的是真实的操作系统进程；模型给不出比对真实进程的演练更强的证据 |
| 环境变量不继承 | **规范场景**（[S-23](#s-23-环境变量不继承)） | 同上 |
| 跨租户、跨在场的引用 | **规范场景**（[S-24](#s-24-别人的引用旧的引用)） | 同上 |

**不建 TLA+、不建 Alloy、不建 Schema**：本能力只在据点进程内被调用，没有交换表示；capability 不发布 Schema（[规格入口](../../../README.md#准入门槛与停止条件)）。执行状态与结果在[验证入口](../verification.md)。

### 规范场景

#### S-19 落点的四种答案

同一个租户下四个工具，执行环境权限分别是 `always-allow`、`auto_place`、`never-allow`、没有值；再一个 `always-allow` 却声明了目标环境；再一个权限来路读失败。

**必须观察到**：`host` · `host` · `noLanding{hostNotAllowed}` · `noLanding{hostNotAllowed}` · `noLanding{requirementNotJudged}` · `unavailable`。把第一个改成 `never-allow` 之后再问，答 `noLanding{hostNotAllowed}`（不缓存）。
**绝不能观察到**：读失败答 `host` 或 `noLanding`；`never-allow` 答 `host`。

#### S-20 拓展件子进程没有允许就不起

装配里没有拓展件子进程的宿主机允许；再换成那一项读失败。

**必须观察到**：`startProcess` 分别得 `noLanding{hostNotAllowed}` 与 `unavailable`，**什么进程都没有起**。

#### S-21 孙进程随组停下

起一个进程，它再起一个孙进程后自己退出。

**必须观察到**：`processOutcome` 交回 `exited{ code }`；此时孙进程还在；`stopProcessGroup` 答 `confirmedGone`，孙进程不在了；之后同一个引用 `referenceNotValid`。

#### S-22 停不下来：有界答复之后继续停

组里一个进程在 `stopReplyBound` 之内确认不了退出（验收装配里以故障注入模拟）。

**必须观察到**：`stopProcessGroup` 在 `stopReplyBound` 之内答 `notConfirmed`；之后故障解除，本能力继续停，再停一次答 `confirmedGone`。
**绝不能观察到**：`stopProcessGroup` 超过 `stopReplyBound` 才答；`notConfirmed` 之后本能力不再管这个组。

#### S-23 环境变量不继承

本能力所在进程的环境里放一个哨兵变量；起一个把自己全部环境变量写到标准输出的进程，`launch.environment` 只给两项。

**必须观察到**：输出里恰是那两项，**没有哨兵**。

#### S-24 别人的引用，旧的引用

租户甲取到的执行环境引用，租户乙交来问落点、起进程；本能力重启之后，甲拿旧引用再问。

**必须观察到**：都是 `referenceNotValid`，与一个从没发过的串得同一个值。

---

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **与真承接者那一程的关系**：本契约是执行环境的**窄口**，真承接者是 PF-005 那一程（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：本程不补、留给下一程）。**本版不收**：沙箱与沙箱实现、设施匹配、落点变化的提醒、会话执行环境的存活（[S-2](#s-2-本契约不拥有什么)）。那一程出本契约的新版本；本版的三条——没有显式允许不落宿主机、判不出与不许分开、按组停有界答复——在新版本里保留 | 主线 → PF-005 那一程 | PF-005 那一程立契约；本契约新版本把沙箱并进来或指向它 |
| G-2 | **执行环境权限与目标环境的求值从哪读**：组织级、租户级怎样授予、按工具怎样求值，本契约只收「读得到的值」。`capability.tool-execution-runtime` v1 的 G-4（落点求值归谁判）在「宿主机那一半」由本契约接住，「到不了位由谁判」的沙箱那一半仍开着 | PF-005 的 owner ＋ 资产设置求值那一侧（`capability.asset-evaluation`、注册表） | 有一个读面给出「这个租户下这个工具此刻的执行环境权限与目标环境」 |
| G-3 | **产品允许已裁，读面接线未完成**：[D-044 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)、PF-005 §6.10 允许 hooks 子进程落宿主机。S-6 的显式允许仍须由装配交入；没有允许仍 `noLanding{hostNotAllowed}`，读不到仍 `unavailable`。工具权限不因此改变 | 执行环境与据点装配 owner | 实施计划 W-0j 核对允许读面；HI G-15 的工作目录与名单另行闭合 |
| G-4 | **「没声明要用执行环境的工具，这一维不适用」本版不区分**（[PF-005 §6.8](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#68-执行环境权限每个工具各配各的)）：工具定义里没有这一项声明，本契约对每个交来的工具都按「适用」判 | PF-005 与 `data.tool-definition` 的 owner | 工具定义有了这一项，本契约新版本对「不适用」的工具给出答案 |
| G-5 | **目标环境与宿主机怎样匹配**：本版声明了目标环境即 `requirementNotJudged` | `data.tool-definition` v1 的 G-5 ＋ PF-005 那一程 | 匹配规则定下 |
| G-6 | **具名参数的取值**：`stopGrace`、`stopReplyBound`、`outputBound` | 主线／装配（部署配置，缺值即启动失败） | 装配给值 |
| G-7 | **崩溃之后留下的进程**：本能力所在进程崩溃、或撤除时停不下来的组，下一次在场不知道它们，也不回收 | PF-005 那一程 | 定下是否要耐久地记下起过的组、下一次在场按身份核对后回收（核对不了不动别的进程） |
| G-8 | **会话结束时它的执行环境怎样收**：本版会话结束不使执行环境引用失效，也不停这个会话起过的组 | PF-005 ＋ PF-015 那一程 | 会话生命周期的契约定下触发 |

---

## 十一、消费者核对

本节不新增承诺，只走一遍具名消费者的路径。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **执行宿主**（`capability.tool-execution-runtime` v1 的 S-38 第 2 步、`AdmittedCall.environment`） | 这一次执行的执行环境到不到位；到不了位即 `failed{environment_unavailable}`、不降级 | [S-12](#s-12-placeexecution)：`host` 即到位；`noLanding`、`unavailable`、`referenceNotValid`、`environmentsWithdrawn` 都是到不了位 | **够**（宿主机那一半）。**`AdmittedCall.environment` 由调用方交来**——就是 [S-11](#s-11-resolvesessionenvironment) 发的引用，谁去取归 agent loop（C-8）。它的 S-38 第 2 步、G-4 已改指本契约；沙箱那一半仍在它的 G-4 |
| **派发器**（`capability.loop-extension-runner` v1 的 S-50：执行环境句柄解析出「这一会话的执行环境」） | 按会话解析，只及这个会话；取不到即失败、不回退宿主机 | [S-11](#s-11-resolvesessionenvironment)：(租户, 会话) → 引用 | **够，但多要一样**：取引用要带租户——派发器解析执行环境时也要先经会话持有租户的读面（`capability.session-tenancy/v1#S-8`；节点原写「两样分开解析」，那一分法不变，只是执行环境那一样也要先有租户）。主线已接受（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩），派发器契约 S-50 第 1 条已改指本契约与那份读面 |
| **兼容件**（`capability.hooks-import` v1 的 S-18、S-19、S-26、S-27） | 在这一会话的执行环境里起子进程、新进程组；程序不存在在开始之前判出；按组停、有界答「确认退出／未确认」；未确认的由执行环境善后；撤除时停下起过的 | [S-13](#s-13-startprocess)～[S-15](#s-15-stopprocessgroup)、[S-17](#s-17-撤除重启与在途) | **起停够**。三处要兼容件补：**起子进程要带租户**（节点原写「执行器从不调 `resolveTenant`」）；**来源产品的 hook 命令是给命令解释器的一行**，本契约不经解释器，由兼容件自己把解释器写成 `program`；**环境变量不继承**，兼容件要交全它要的变量——另加一处：**拿到结果之后停组**。四处主线已接受（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩），`capability.hooks-import` v1 的 S-18 已写进。**落点那一半**：本版没有会话级沙箱，兼容件子进程只能落宿主机、产品已允许、但允许读面尚未接线（[G-3](#十已知缺口)，闭合前 fail-closed） |
| **MCP 桥**（`capability.mcp-bridge` v1 的 S-6 第 3 条：stdio 服务端的环境里白名单那一部分） | 从据点进程环境里按名挑变量的规则 | [S-13](#s-13-startprocess) 表下 `EnvAllowlist` 一条 | **够**：桥只借形状与取法、配自己的 `stdioEnvAllowlist`；它**不经本能力起进程**，本契约的其余操作与它无关（主线裁定 [D-040 §八 N-39](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |
| **据点验收装配的替身**（「只答宿主机、已被显式允许；按进程组起停并确认退出；不判租户、不选落点」） | 回放契约允许的答复 | [S-6](#s-6-落点判断本版只有宿主机) 的 `host` 分支、[S-13](#s-13-startprocess)～[S-15](#s-15-stopprocessgroup) | **够**：替身的「已被显式允许」就是测试种子给出的权限值与拓展件子进程的允许；它答 `host` 走的是 S-6 第 4 条与末段，**没有做契约未定义的判断**。「不判租户」与本契约不冲突：引用跨租户即 `referenceNotValid` 是本契约的判定，替身照做即可 |

---

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)。接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
