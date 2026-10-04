> N4 迁移读法：retryDelay 函数与 local 公开入口；其他运行时协议/投影未迁已采用[模块旁现行源](../../../../architecture/pilots/n4-ownership.md)。
> 下文原当前投影不再约束已迁任务。未迁协议、未来增量与证据义务保持原精确范围；历史实现/运行坐标不改写。

# model-request-runtime 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`capability.model-request-runtime` v2](../../../../spec/capabilities/model-request-runtime/v2/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的服务名、方法名、列名、日志事件名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**自建两个插件，其余全部复用。**

- **复用的纯模块**（同批 core 节点，由那边定接口；本页只写用法）：`packages/core/stream-assembly`（到达装配器——本节点就是契约 S-51 说的模型侧宿主）、[`packages/core/model-profile`](../../core/model-profile/README.md) 与 [`packages/core/model-response`](../../core/model-response/README.md)（档案与响应体的形状与校验）、[`packages/core/messages`](../../core/messages/README.md) 与 [`packages/core/content-blocks`](../../core/content-blocks/README.md)（五种记录、`AssistantMessage`、块）、[`packages/core/tool-definition`](../../core/tool-definition/README.md)（`ModelToolName`、`Duration`）——一契约一包（D-060 §八 M41）、`packages/core/asset-evaluation`（「用哪个模型」这一项与两个时限的求值——输入来路见[依赖表](#依赖作用域与绑定)）；已实现的 [`identity-values`](../../core/identity-values/README.md) 与 [`offer-expiry`](../../core/offer-expiry/README.md)（`Instant`）。
- **模态投影的两个纯函数** `project`、`compatible` 从 [`packages/model/modality-projection`](../modality-projection/README.md) 按包 import，**不 inject**（草图 Y-2）。
- **插件层共用件**取 [kernel-basis](../../core/kernel-basis/README.md)：`definePlugin`（config 由内核在插件体之前校验）、`resolveOptional`（调用时取用可选依赖）、`Outcome`（闭合的失败字面联合）。存储走 [core/storage 协议](../../core/storage/design.md#协议)。
- **传输**：pi-ai 定向 fork（D-019）。基线与托管已定（[D-063 R-5](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)，[D-019 追加 2026-09-25](../../../../record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-25.md)）：pi 0.86.1 提交 `3390bd9`（2026-10-02 改锚到 1.0.0 `a13d35a`，见 [D-019 追加 2026-10-02](../../../../record/decisions/model-provider-pi-ai-fork/rebase-1.0.0-2026-10-02.md)），只取传输一层，许可随包记；**fork 节点 [`pi-ai-transport`](../pi-ai-transport/README.md) 已立（candidate，尚未建包，D-019 比较门未过，MRR-N4）**。**P-2 必需 inject `modelTransport`**：那个节点的插件以这个服务键登记它造出的传输对象，验收装配以脚本化传输登记同一个键即可替换（[与装配草图不同的四处](#与装配草图不同的四处)之四）。传输的形状是三段——`plan`（纯：出网前定下线上请求、改值与丢项）→ `send`（发一次）→ `read`（译成到达增量，返回收尾事实），见[公开面](#公开面)。契约 S-38 的十一条由那个节点逐条兑现（它的 T-1～T-11）；其中第 1、2、4、5、7 条依赖研究假设（契约 G-10），**本节点不据研究推导上游行为**。
- **值不在本节点**：成因表、脱敏三参数、两个时限的取值都是契约开放缺口（G-5、G-6、G-9），代码里不放默认值。**重试策略例外**：默认重试件的退避是一个策略对象，默认初值放在配置层（[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；契约 G-8 已按此闭合：`default_retry_backoff` 是策略对象 `kind`／`base`／`factor`／`max`／`jitter`，契约 S-35），见 [P-5 的策略对象](#p-5重试策略是一个可配置对象)。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：调用模型是一个可公开、独立的函数闭包 `invokeModel`，不依赖 Cordis、会话、租户或存储即可单独使用；P-2 的 `modelRuntime` 是它的**一种**消费者（harness 用的那一种），传输适配也是可单独取用的构件（[D-063 R-5](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。名字全部**候选**，**全部尚未实现**。

**公开函数面**（包入口导出；不 import Cordis、不读日志与存储、不带会话与租户身份）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `invokeModel(request, parts, signal) → ModelInvocation` | 对**一个**档案快照做**一次发出**：`parts.transport.plan` 按快照、参数、消息与这一次的 `ModelToolEntry[]` 组请求（改值与丢项在出网前定下）→ `parts.transport.send(planned, parts.credential, signal)` → `parts.transport.read` 的到达事件逐个进一份装配状态、它交回的收尾事实进收场分类（成因查 `parts.statusCauseTable`，表外 `unrecognized`）→ 经 `parts.redact` 脱敏 → 交回响应体与（有回复时）`AssistantMessage`。首个内容出现时先 `await parts.beforeFirstContent?.()`、再让内容进装配状态的可见快照。句柄：`outcome`、`snapshot()`、`abort()`。**一次调用恰一次发出：不重试、不回退、不续接**；凭据值由调用方交，函数层不取 | 档案快照 `data.model-profile/v2`；消息与块 `data.messages/v2`、`data.content-blocks/v2`；到达与装配 `data.arrival-events/v2`、`capability.stream-assembly/v2`；响应体、收场与成因 `data.model-response/v2`；账 `data.call-accounts/v2`；收场与成因的**词汇**借本契约 [S-17](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-17-结算一处按序幂等先到者赢)、[S-18](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现)——**函数层的行为本身没有契约条款**（缺口 MRR-N12） |
| `TransportAdapter`（接口）、脚本化传输 | 三段：`plan(input) → { planned } \| { rejected }`（纯；输入带 `target`（`{ callId, dispatch }`）、路由名、这一次的那一家、档案快照、合并后的参数、消息与 **`ModelToolEntry[]`**；出网前定下改值与丢项，`data.messages/v2#S-35` 我们自己那两种消息的翻译落在这里）→ `send(planned, 凭据值, 中止信号)`（发一次，交回响应或带来源的失败、原样状态码）→ `read(response, 中止信号)`（到达增量序列，返回值是收尾事实：实际执行方、用量与费用来源）；本据点能承载的模态作为常量交出。**`openCall` 手里只有模型面名字**（契约 S-28 ① `tools` 是 `ModelToolName[]`）；名字到 `ModelToolEntry`（`data.tool-definition/v2#S-6`）由服务面在 `openCall` 时经会话资产注册表的 `lookup` 取（S-28 ①④，MRR-N14 已闭合）。**`report` 只进服务面的 `openCall`**（S-28 ①：属于某个 Run 的调用必带，与 `run` 同在同缺）；`invokeModel` 不收它——函数面收的是已经解析好的条目 `ModelToolEntry[]`，不读注册表、不带会话身份（SYS-OPEN），外面单独用它的人自己交条目。**生产实现是 fork 节点 [`pi-ai-transport`](../pi-ai-transport/README.md) 的 `planRequest`／`sendRequest`／`readStream`**（D-063 R-5；节点已立、尚未建包）；脚本化传输是验收装配的另一件，登记同一个服务键 `modelTransport` | 本契约 [S-38](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 左列传输适配十一条（那个节点的 T-1～T-11）；`data.messages/v2` S-35、S-36 |
| `classifyCause(failure, statusCauseTable)` | S-18：按失败来源分支，状态码只查表 | S-18 |
| `redact(value, params)` | S-20：写入之前的同一个脱敏函数 | [S-20](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-20-写入之前脱敏) |
| `legalTargets(rows, allowed, projection, compatible)`、`displayList(…)`、`effectiveModel(selection, lock, rows, allowed)` | S-10～S-12 的纯判定；链上各格的行、允许集合、投影、选择与锁都由调用方交 | [S-10](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-10-有效模型四步每步来源可查)～[S-12](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-12-展示列表) |
| `dispatchGuard(facts, plan)` | S-22、S-30 的守卫与计划约束（`dispatchAgain`／`canDispatchAgain` 共用） | [S-22](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-22-同一次调用的发出序列)、S-30、S-50 |
| `decideRetry(input, policy)`、`retryDelay(policy, n, seed)` | 默认重试件的判定（S-35 的五条）与退避算术（[P-5 的策略对象](#p-5重试策略是一个可配置对象)） | [S-35](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-35-默认重试件可替换)；[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |

**Cordis 服务面**：P-2 `modelRuntime`（十三个操作）与 P-5（向 runner 登记默认重试件），[下节](#插件服务键与配置)。**P-2 的每一次发出都调同一个 `invokeModel`**：核心在它外面加——「已出门」确认之后才调它（S-15）；`beforeFirstContent` 由核心给，写「已开口」、确认之后内容才推给观察者（S-15 第二条）；凭据值由核心每次现取后交入（S-19）；结算走同一个 `settle`（S-17）；撤除时先 `abort()` 再按 S-36 定收场。P-5 登记的实现就是 `decideRetry` ＋ `retryDelay`。

**只在运行时层成立、函数层不承诺**（外面另包 `invokeModel` 的人拿不到这些，要就自己补）：`callId` 会话内唯一与调用跨尝试延续（S-5、S-6）；绑定与发起租户来自会话（S-7）；六种记录（S-8）；两个锚点先写后行（S-15）；同一次发出至多一条响应体、先到者赢（S-17）；凭据每次发出从目录现取、来源如实（S-19）；发出序列跨尝试的守卫（S-22、S-30，函数层只给判定函数，事实要调用方从日志读）；中断意图先落（S-31）；对账（S-33）；宿主停止与撤除的结算（S-36）；投影追到日志尾（S-13）；**所有模型请求经 OpenRouter**（[SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm)）——由装配给的传输兑现（[cli](../../../apps/cli/README.md) A-15：base URL 是构建内常量），函数层用调用方交来的哪个传输就发到哪里。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **`invokeModel` 恰一次发出**（选）；落选：函数层就做完一次调用（含逐家回退、续接、重试），服务面只加持久化 | 外部使用者最想要的是「给我一个答复」，回退与重试写在函数层才真正开箱可用 | 外部要回退就得自己按 `dispatchGuard` 与 `decideRetry` 编排；函数面比「一次调用」低一层 | 中：跨发出的守卫（开口之后不再发、只在策略类故障之后再发）要读耐久事实才成立（S-22），函数层没有日志，写进去只能靠进程内记忆——停机一次就会再发，正是契约要挡的那一种；拆成「一次发出 ＋ 纯判定」让两层各自诚实 |
| **服务面复用同一个 `invokeModel`**（选）；落选：服务面自有一套发出循环 | 锚点先写后行、撤除结算的次序由服务面自己的循环握着最直接，不必在函数句柄上开 `beforeFirstContent` 与 `abort` 两个口 | 函数句柄的形状被运行时层的需要塑形；两个口的语义与 S-15、S-36 的次序不合时两层一起错 | 中：同一传输适配、同一收场分类只有一份权威（品味「同一概念一个权威定义」） |

## 契约到 Cordis 的投影

### 插件、服务键与配置

| 单元 | 插件与服务键（候选） | 必需 inject | 调用时取用（`resolveOptional`） | 配置（`definePlugin` 的 `Config`） |
|---|---|---|---|---|
| **P-2** | 插件 `model-request-runtime`；provide `modelRuntime` | `modelCatalogRead`、`credentialLookup`（[model-profile-directory](../model-profile-directory/README.md) 的 P-1r；只有尚无节点的开发装配由 P-1 经 `serveBaseFaces` 提供，D-060 §八 M65）；`sessionLog`（`capability.session-log/v2`：[S-17](../../../../spec/capabilities/session-log/v2/contract.md#s-17-append追加一批条目)、[S-18](../../../../spec/capabilities/session-log/v2/contract.md#s-18-readbykey按读取键读)、[S-19](../../../../spec/capabilities/session-log/v2/contract.md#s-19-readsince从某个位置往后读)）；`storage`；`clock`（[infra/clock](../../infra/clock/README.md)）；**`modelTransport`**（[`pi-ai-transport`](../pi-ai-transport/README.md) 的插件；验收装配为脚本化传输，同一个键） | `assemblyManifest`（`capability.assembly-manifest/v2` [S-16](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-16-readhead读头与每一类最后一条) `readHead`）：本节点从换表记录里取求值结果——**从记录内容里怎样取选中模型初值、层锁、两个时限未约定**（那份契约 [G-4](../../../../spec/capabilities/assembly-manifest/v2/contract.md#十已知缺口)，MRR-N3）；`sessionTenancy`（`capability.session-tenancy/v2` [S-8](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-8-holdingtenant读会话持有的租户身份) `holdingTenant`）：发起租户的来路（D-060 §八 M66；与 runner 解析执行环境句柄同一读面）；`assetRegistry`（`capability.asset-registry/v2` [S-25](../../../../spec/capabilities/asset-registry/v2/contract.md#s-25-lookup查一条) `lookup`）：`openCall` 从模型面名字取工具条目（S-28 ①） | `statusCauseTable`（契约 S-18 的 `status_cause_table`，G-5；初值用 `pi-ai-transport` 包导出的 `openRouterStatusCauseTable`）；脱敏三参数（契约 S-20，G-6）。传输自己的配置（固定 base URL、拒绝重定向：S-38 第 9 条）归 `pi-ai-transport` |
| **P-5** | 插件 `model-default-retry`；不 provide | runner 的实现登记面 `loopExtensionImplementations`（[loop-extension-runner](../../agent-loop/loop-extension-runner/README.md)） | — | `retryPolicy`：`{ kind, base, factor, max, jitter }`（契约 S-35 的 `default_retry_backoff` 的落法，N-36）；**缺席取配置层的默认初值** `{ kind: exponential, base: 1000 ms, factor: 2, max: 4000 ms, jitter: none }`——与原候选列表 `[1000, 2000, 4000]` 逐次相同；**没有「次数」这一项**，停止只由 S-35 决定（[下节](#p-5重试策略是一个可配置对象)） |

**配置错误一个政策**（与 tenancy 各节点、[kernel-basis](../../core/kernel-basis/design.md#依赖作用域与绑定) 同一条）：config 缺项或不合形状 ⇒ 内核让 fiber `FAILED`、什么都不 provide（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）⇒ 装配启动失败。
本节点**不在代码里放契约开放值的默认值**：`statusCauseTable` 与脱敏三参数没有值，P-2 就不启动——没有脱敏参数时「凭据不出现在任何记录里」的前提不成立（契约第八节安全性质那一行）。**`statusCauseTable` 的初值用 `pi-ai-transport` 包导出的 `openRouterStatusCauseTable`**（只是数据、分类仍由本节点的 `classifyCause` 做；它的每一行未取证，那个节点的 PAT-N3），由装配交进 P-2 的 `Config`；脱敏三参数由测试配置自带、产品装配由据点给（D-060 §八 N-33）。**`retryPolicy` 是唯一例外**：它的默认初值在 P-5 的 `Config` 里（配置层，N-36），不在退避算术里；[cli](../../../apps/cli/README.md) 照常装 P-5，装配给出别的值即覆盖，给出不合形状的值仍按上一条启动失败。
**两个时限不是配置**：它们是运行时设置项（契约 S-21），每一次发出之前从装配清单的求值结果现取，取不到 ⇒ 这一次 `unavailable`。

### P-5：重试策略是一个可配置对象

依据 [D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：契约里的重试件是**判定者**——只交回 `retry { provider, after }`，等待与再发归 loop（[S-30](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-30-dispatchagain) ④、[S-35](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-35-默认重试件可替换)）；所以这里只有一个策略对象与一段纯算术，**不引执行器库**（它们包住函数自己循环，会绕过 S-30 的三道守卫与「已出门」留痕）。词汇对齐 cockatiel 的退避对象，熟悉它的人不必学新词。

| 成员 | 取值 | 默认初值（配置层） |
|---|---|---|
| `kind` | `constant` · `linear` · `exponential` | `exponential` |
| `base` | 正整数毫秒 | `1000` |
| `factor` | ≥ 1 的数（`kind = exponential` 时用） | `2` |
| `max` | 正整数毫秒，≥ `base` | `4000` |
| `jitter` | `none` · `full` · `half` · `decorrelated` | `none` |

- **第 n 次重试（n ≥ 1）的延迟** `retryDelay(policy, n, seed)`：先算无抖动的 `d`——`constant`：`base`；`linear`：`base · n`；`exponential`：`base · factor^(n−1)`；再 `d ← min(d, max)`；再按 `jitter`：`none` 取 `d`；`full` 取 `[0, d]` 上均匀；`half` 取 `d/2 + [0, d/2]` 上均匀；`decorrelated` 取 `d_n = min(max, [base, 3 · d_(n−1)] 上均匀)`、`d_0 = base`。结果取整到毫秒。
- **随机数来自以 (`callId`, n) 为种子的伪随机数**：`retryDelay` 是纯函数，`decorrelated` 要的上一次延迟从 n = 1 起按同一种子重算得出，不存状态。
- **次数不是参数**：`decideRetry` 按 S-35 的五条判——只对 `upstream_unavailable`／`unrecognized` 出手、允许回退时逐家一遍每家至多一次、不允许回退时同家至多一次、没有下一家即试尽；第几次由「已试过的家」数出。
- **配置错误一个政策**：`kind`／`jitter` 不在枚举里、`base` 或 `max` 不是正整数、`max < base`、`factor < 1` ⇒ `Config` 校验不过 ⇒ P-5 `FAILED`、装配启动失败。**缺席不是错误**：取上表默认初值。
- **性质测试**（[verification](verification.md#证据义务)）：结果 ∈ `[0, max]`；`none` 时 `linear`／`exponential` 对 n 单调不减；`full` ∈ `[0, d]`、`half` ∈ `[d/2, d]`、`decorrelated` ∈ `[base, max]`；同一 (策略, n, 种子) 同一结果；默认初值下 n = 1, 2, 3, 4 依次为 1000、2000、4000、4000。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **自写十余行算术配性质测试，不加依赖**（选）；落选：引 cockatiel（或只取它的退避对象） | 成熟库、已有人测过；只借它的 `ExponentialBackoff` 一类对象就够，不必用它的执行器 | 自写的算术要自己证对，边界（上限、取整、`decorrelated` 的递推）全靠性质测试 | 高：N-36 已裁；能单独交出延迟计算的三家各有语义坑（cockatiel `exponent` 大多不生效、`maxAttempts` 实为重试次数），为十余行算术加一个依赖得不偿失 |
| **抖动的随机数以 (`callId`, n) 为种子**（选）；落选：`Math.random()`，`decorrelated` 的上一次延迟记在重试件的状态里 | 真随机、不必把 `callId` 接进重试件；最常见的写法 | 同一次调用的抖动可预测（不同调用的 `callId` 不同，仍去相关）；重试件的输入要带 `callId` | 中：重试件是系统自带的拓展件，runner 要求它不持有运行实例里的状态（runner S-8），记「上一次延迟」就违背；有种子也让回放与测试得同一个 `after`——虽然正确性不靠它（结论已落日志） |

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5 `callId` 会话内唯一；调用跨尝试延续 | `modelRuntime.openCall` 铸 `callId`：128 位随机、交换表示按 `data.identity-values/v1#S-31` | 尚未实现 | 唯一性**不靠随机**：一次调用的首条耐久记录（「已出门」第 1 次，或调用终结）在会话日志上有唯一键（[L-6](#存储要求)），撞了即拒、那一边 `unavailable`；在途表按 (会话, `callId`) 为键 |
| S-6 调用状态 | P-2 的在途表，只在进程内；终态与「已开口」从日志判 | 同上 | 状态不另存为权威；在途表随实例丢，由对账重建 |
| S-7 绑定 | `openCall`：`modelCatalogRead.readProfile` 取快照、合并参数、出门前检查；`dispatch` 把绑定写进「已出门」；续接只从最近一条「已出门」读。**工具条目**：`openCall` 按交来的 `tools` 逐个经 `assetRegistry.lookup`（`tool` 类）取——带 `report` 的在 `within = run{report}`、不带的在 `within = session`；取到「没有」⇒ `invalidInput{unknownTool}`，读不到 ⇒ `unavailable`（S-28 ⑧）；`report` 与 `run` 同在同缺、核会话／运行／尝试三者，对不上即 `invalidInput`（S-28 ③）；续接按这一次交来的 `tools` 与 `report` 重取（S-28 ④）。**发起租户**经 `sessionTenancy` 读会话持有的那一个（D-060 §八 M66）：不进 `openCall` 输入、不从调用方或进程上下文补；会话持有的租户不随会话变（PF-015 §6.12），所以每次要用时现读得到的是同一个；读不到 ⇒ 这一次操作 `unavailable`，不给默认 | 同上 | 续接与追补**不读内存、不重读档案**；读面**接口已定、真承接者未到**（`capability.session-tenancy` v2；产品装配里没有写入方 ⇒ 恒 `sessionNotFound` ⇒ `unavailable`，MRR-N10） |
| S-8 六种记录 | 带栅栏的四种（已出门、已开口、中断意图、调用终结）经调用方随 `openCall` 交来的追加口写；不带栅栏的结算（响应体）与会话级写入（模型切换、对账追补）经 `sessionLog` 写 | 同上 | 形状归 `packages/core/messages`（`data.messages/v2#S-49`、`#S-50`）；两条路都落在 `capability.session-log` v2 的 [S-17](../../../../spec/capabilities/session-log/v2/contract.md#s-17-append追加一批条目)：调用方的口带 `fenced{run, attempt}`，`sessionLog` 的写 `unfenced`；为什么同时要两条路见[与草图不同的四处](#与装配草图不同的四处) |
| S-9～S-12 选中、有效、合法、展示 | `effectiveModel`、`legalTargets`、`displayList` 每次现算：日志尾的最后一条 `model_selection_changed` → 装配清单里的求值结果（层锁；从没切换过时的选中初值归契约 G-20，本版无来路）→ `modelCatalogRead.listProfiles(T)` → 本地按 `落点(T, r, A)` 求 → `compatible` | 同上 | **允许集合 `A`：契约 G-19 已闭合**（[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）——本版 `A` 就是这个范围里登记的全部档案，由目录读面直接给（`listProfiles`，契约 [S-11](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-11-合法目标集合)），不经求值结果。由此 `legalTargets`、`selectModel` 与写过模型切换记录的会话的 `displayList` 不需要装配清单。**「用哪个模型」这项设置的产出方未定（契约 [G-20](../../../../spec/capabilities/model-request-runtime/v2/contract.md#十二已知缺口)）**：从没切换过的会话选中模型判不出 ⇒ 它的 `displayList` 与 `effectiveModel` 一律 `unavailable`，不拿链上某个名字当初值；写过切换记录的会话，第 2 步按契约 [S-10](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-10-有效模型四步每步来源可查) 第 2 步：**求值读不到（求值失败）⇒ `unavailable`；求值成功而 `values` 里没有这一项 ⇒ 没有锁**（[`asset-evaluation/v2#S-12`](../../../../spec/capabilities/asset-evaluation/v2/contract.md#s-12-缺席时的默认答案)：未声明的项不进 `values`；主线 2026-09-25 裁定）——**判「没有这一项」仍要读到求值结果，读法挡在 assembly-manifest G-4**（MRR-N3）：产品装配里这一支仍 `unavailable`，验收装配由最小提供者 ＋ 测试种子给出（有前提）。`openCall` 按契约 S-28 ④ 用交来的 `target`、不重算，不读层级求值；胜出行不按 (T, r) 缓存 |
| S-13 投影追到日志尾 | P-2 的投影缓存（[R-1](#存储要求)）；每次读先从水位追到日志尾，逐条套 `project` 的可分解一步 | 同上 | 缓存不是权威；缓存行读不到就从日志头重算（答案相同，代价随历史长度；记一条 info 日志）；性质测试与伸缩测量是证据义务 |
| S-14 失败集合与判定次序 | 各方法返回闭合字面联合（`Outcome`），判定次序照各操作 ⑥ | 同上 | **没有 catch-all**：`StorageUnavailable`／日志不可用映射为 `unavailable`，其余异常上抛（缺陷） |
| S-15 两个锚点先写后行 | `dispatch`：`await` 「已出门」追加确认 → 才调 `invokeModel`（它里面才 `send`）；首个内容：`invokeModel` 的 `beforeFirstContent` 里 `await` 「已开口」追加确认 → 才推给观察者 | 同上 | 绑 formal；两支写不进照契约 S-15 末条 |
| S-16 首 token | 看装配状态第一次出现的 `firstContentAt`（`capability.stream-assembly/v2#S-16`），不看传输库的「开始」事件 | 同上 | 传输适配第 4 条 |
| S-17 结算 | 全部结算只走一个函数（候选 `settle`）：按 `ResponseId` 追加响应体，唯一冲突 ⇒ 已有先到者，空操作、不报错；撤除的结算在同一个撤除函数里按「中止 → 定收场 → 写 → 释放」 | 同上 | 绑 formal；与 loop 的共同存储对象见[下文](#跨-owner-的共同存储对象与三条交错) |
| S-18 成因 | 按失败来源分支；状态码 → 成因只查 `statusCauseTable`，表外 ⇒ `unrecognized`；本地错误 ⇒ `unrecognized` 带留痕。**传输交回的两种事实与中止原因一起分**（[下文](#传输交回的事实怎样分成因)） | 同上 | 表的内容 G-5 |
| S-19 凭据现取 | 每一次发出之前 `credentialLookup.value(发起租户, 绑定的有效模型引用的 origin)`；值只作为 `send` 的实参，不进任何对象、记录、日志事件。据点上这一问由 P-1r 答：先读保管方里的本地副本、中心可达时刷新（D-060 §八 M47）；**保管方缺席的本版离线即 `credentialUnavailable` ⇒ 首次发出 `undispatched{credential_unavailable}`、续接或再发 `released{cause: credential_unavailable}`**，如实收场，不假装照常 | 同上 | 静态检查候选：`credentialLookup` 的调用点只许在「发出」那一个模块；保管方缺席是 MRR-N2 |
| S-20 脱敏 | 写入之前一律经同一个脱敏函数（三参数来自配置）；原始响应存附件之前同样过一遍 | 同上 | 原始响应留存这一支受阻于附件存储未定义（`data.content-blocks` 的 G-1），**不挡响应体本身** |
| S-21 两个时限 | 每一次发出两个计时器，挂在那次调用的 effect 上，收场即清 | 同上 | 项名与默认值 G-9；取不到 ⇒ `unavailable` |
| S-22 发出序列 | 守卫与计划约束是 `dispatchAgain`／`canDispatchAgain` 共用的同一个判定函数；续接取失联那次的那一家 | 同上 | 绑 formal |
| S-51 模型侧装配宿主 | 每一次发出一份装配状态，按 (会话, 目标) 为键；逐个 `accept`；被拒 ⇒ 紧接着交一个 `reason: rejected` 的 `trim`，并记一条结构化日志事件；收场 `closeOut`，撤除与失联 `abandon` | 同上 | 日志事件（候选名）`model_call.increment_rejected` 记 error 级、`model_call.event_after_finish` 记 info 级——**不用 warn**：缺省只导出到 info（basis [`logger-level-order-error-lowest`](../../../../basis/cordis/logger-level-order-error-lowest.md)），warn 会被丢 |
| S-24～S-34、S-49、S-50 十三个操作 | `modelRuntime` 上同名方法；`openCall` 的输入照 S-28 ① 带 `report?`（取工具条目，见 S-7 行） | 同上 | 九件事照契约 |
| S-35 默认重试件 | P-5 登记的实现：`decideRetry`（快照里的供应商次序、允不允许回退、已试过的家、最近成因）→ `retry { provider, after }` 或 `observed`；`after = retryDelay(retryPolicy, n, (callId, n))`（[策略对象](#p-5重试策略是一个可配置对象)） | 同上 | 零依赖；结论照样过契约 S-30（runner 经 `canDispatchAgain` 判） |
| S-36 宿主停止与撤除 | 每次调用在宿主上一个 effect；P-2 自己的在途表 effect | 同上 | [装卸表](#成对的装载与撤除) |
| S-37 不发事件 | 不 `emit`、不监听 | — | [事件一节](#事件派发过滤与边界) |
| S-38 左列、S-39 | 见[装配给 vs 协议给](#装配给-vs-协议给)与[依赖表](#依赖作用域与绑定) | — | 右列不在本版 |

### 传输交回的事实怎样分成因

服务面上中止一次发出的只有本节点自己——两个时限之一到点（[S-21](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-21-两个时限是运行时设置项)），或撤除（S-36）；**这一次为什么中止由发起中止的那一方记下**（候选：随中止信号带原因），收场先看原因、再看传输交回的来源（`pi-ai-transport` 的[失败映射](../pi-ai-transport/design.md#状态并发与失败映射)；它的 PAT-N18 ①）：

| 中止原因 | 传输交回 | 收场 | 依据 |
| --- | --- | --- | --- |
| `first_token_wait_limit` 到点 | `local`，带 `queued` 留痕（在连接池里排队、还没拿到连接就被中止——上游零请求） | 按 S-18「传输本地」行：**`unrecognized`**，`localError` 里的排队时长作留痕；**不**因中止原因是超时而折成 `upstream_unavailable` | S-18 表第 2 行与首条说明（本地故障不报成「上游给不出」，否则重试件拿本机排队去换家、退避直到试尽）；S-21 已明确限定上游被触达的前提，D-060 §八 N-44 ④；MRR-N15 已闭合 |
| `first_token_wait_limit` 到点 | `aborted`（已拿到连接，请求已发往上游） | `upstream_unavailable` | S-21 第 1 行；S-18 表第 3 行 |
| `post_first_token_stall_limit` 到点 | `aborted` | `interrupted_mid_reply` | S-21 第 2 行；S-18 表第 6 行 |
| 撤除 | `aborted` 或 `local{queued}` | 都按撤除收场：`interrupted{run_cancelled}`、没有回复，**不进成因分类** | S-36 |

**`httpStatus` 只进诊断**：带内错误那一次，传输把流开始时的 HTTP 状态另放 `httpStatus`；本节点只把它写进结构化日志的诊断字段，**不写进 `failure.statusCode`**——`statusCode` 取带内 `code` 并标 `inBand: true`（S-38 传输适配第 2 条；把 `httpStatus` 当状态码正是那一条右列点名的误读）。带内错误没有整数 `code`（首 token 之前）⇒ `unrecognized`、不带状态码、留痕是 `upstreamError`（S-18 表第 5 行）——**这时同样不拿 `httpStatus` 顶上**（它是流开始时的成功状态）。

### inject 边与换代时收掉的在途事实

`inject` 的含义是「提供者换代或不可用，我就卸载重跑」（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；没有可选形式，可选依赖一律调用时取用（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）。

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| P-2 → `modelCatalogRead` | 必需 | P-2 插件体重跑：旧实例的在途表 effect 被撤，每一次在途调用按契约 S-36 末条结算（在途的流 `abandon`、收场 `interrupted{run_cancelled}`、释放）；inject `modelRuntime` 的 agent runtime 随之重跑。P-1r 须在实例内部处理断线重连，不以换代表达断线（草图 inject 表） | S-36 末条、S-39 |
| P-2 → `credentialLookup` | 必需 | 同上；**值轮换不触发**——值是每次现取的数据（草图 N-9） | S-19 |
| P-2 → `sessionLog`（`capability.session-log` v2） | 必需 | 同上；撤除时的结算写可能因旧日志服务已撤而写不进——**不补写**，由下一次对账追补（契约 S-36「权威的收口是下一次尝试的对账」）；回执丢了（`unavailable`）按日志 S-22 以同一判重键重交认回 | S-36、S-33 |
| P-2 → `storage` | 必需 | 同上；缓存行留在存储里，它不是权威 | S-13 |
| P-2 → `clock` | 必需 | 同上 | — |
| P-2 → `modelTransport`（[`pi-ai-transport`](../pi-ai-transport/README.md)；验收装配为脚本化传输） | 必需 | 同上：P-2 重跑、在途调用按契约 S-36 末条结算（先中止，在途的流 `abandon`、`interrupted{run_cancelled}`）；已拿到旧传输对象的在途发出跑完——那个插件撤除时只关接纳、**不关在途连接**（它的[装卸](../pi-ai-transport/design.md#成对的装载与撤除)与交错 X-1），所以两条 fiber 谁先撤结局相同 | S-36、S-38 |
| P-2 ⇢ `assemblyManifest`（`readHead`） | 调用时取用 | 不重跑；缺席或 `readHead` 答 `unavailable` ⇒ 依赖它的操作（`effectiveModel` 第 2 步的锁判、`dispatch` 的两个时限）`unavailable`；`legalTargets`、`selectModel`、写过切换记录的会话的 `displayList`、`openCall` 不依赖它（G-19 闭合；S-28 ④ 不重算）；从没切换过的会话要的选中初值不经它——契约 G-20 闭合之前那一支恒 `unavailable` | S-14、S-39 |
| P-2 ⇢ `assetRegistry`（`lookup`，`tool` 类） | 调用时取用 | 不重跑；缺席或答 `unavailable` ⇒ `openCall` `unavailable`，不写任何记录、不打开调用（S-28 ⑧）；报告所依的快照取不回同样 `unavailable`（`capability.asset-registry/v2#S-25` ⑧）；**不 inject**：注册表换代不该让 P-2 与全部 agent runtime 连带重跑 | S-28 ①③④⑧ |
| P-2 ⇢ `sessionTenancy`（`holdingTenant`） | 调用时取用 | 不重跑；缺席、`sessionNotFound`、`unavailable` ⇒ 要发起租户的操作 `unavailable`，**不以「没有租户」或别的租户去取凭据、记账** | S-7、S-14、S-19 |
| P-5 → `loopExtensionImplementations` | 必需 | P-5 重跑并重新登记；其间 runner 看它「此刻不在」，由指定挂件顶上（一律不重试） | runner S-17 |
| agent runtime → `modelRuntime`（loop 那一程，尚无节点） | 必需 | 在途调用随 P-2 撤而结算；没开口的在下一次尝试续接，开口的记失联 | S-33 |
| runner ⇢ `modelRuntime`（`legalTargets`、`canDispatchAgain`） | 调用时取用（在 runner 节点） | runner 不重跑；缺席 ⇒ 那一件判不出 ⇒ 那一次 `dispatch` `unavailable` | runner S-14、S-33 |

**有意不设的边**：P-2 不 inject runner（草图 N-7：否则依赖成环）；不 inject 模态投影（纯函数，Y-2）；不 inject 保管方（经 `credentialLookup` 间接）；P-5 不 inject P-2；**P-2 不 inject 会话资产注册表**，`lookup` 调用时取用（下表）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **`assetRegistry` 调用时取用**（选）；落选：必需 inject | 注册表缺席时 P-2 根本不起，比每次 `openCall` 答 `unavailable` 更早暴露装配错误；不用在调用时处理「取不到」 | 注册表缺席或换代之间，每一次 `openCall` 答 `unavailable`（不写记录、不打开调用，调用方重试即可）；装配漏装它只在第一次带工具的调用时才看得出 | 高：换代时在途怎么收决定了这一格——inject 让注册表每一次换代（它随装配清单重建缓存）都把 P-2 连同 inject `modelRuntime` 的全部 agent runtime 卸载重跑、在途调用一律 `interrupted{run_cancelled}`（S-36），而 P-2 只在 `openCall` 这一步读它一次；调用时取用下，在途的发出不读注册表、不受换代影响，正在 `openCall` 的那一次握着旧实例：答得出就用它的答复，已撤即 `unavailable`、什么都没写；换代之后新实例取不回报告所依的快照同样 `unavailable`（`capability.asset-registry/v2#S-25` ⑧），不拿当前快照代读 |

### 与装配草图不同的四处

**一、P-2 必需 inject 会话日志服务**（草图写「P-2 不 inject 会话日志服务，追加口随调用交进来」）。契约里有五个操作没有调用方的追加口却要读或写日志：`selectModel` 写切换事实（契约 S-27 ① 只收会话与路由名）、`effectiveModel`／`legalTargets`／`displayList` 读选中模型与投影、`reconcile` 为**上一个进程**里的调用追补（那时的追加口已随进程没了）、`readAttempts` 读发出记录。带栅栏的锚点写仍走调用方交来的追加口——栅栏属于调用方那一次尝试。

| | 只用调用方交来的读写口（草图） | 可选取用 `sessionLog` | **必需 inject `sessionLog`（本方）** |
|---|---|---|---|
| 覆盖契约 | 上面五个操作要在输入里多一个口：改契约的操作输入 | 覆盖 | 覆盖 |
| 日志缺席时 | — | P-2 活着、每个操作 `unavailable` | P-2 `PENDING`、`modelRuntime` 不可见，消费者 `PENDING` |
| 日志提供者换代 | 不牵动 P-2 | 不牵动 P-2 | P-2 重跑、在途调用结算——**但 agent runtime 本来就 inject 日志、同样会重跑，在途调用照样被结算**，多付的代价为零 |
| 落选方最强论证 | 草图：P-2 不持有日志句柄，读写口带着栅栏，谁在写一目了然 | 日志换代时 P-2 不重跑，已开口的流不被打断 | — |
| 本方弱点 | — | — | 多一条 inject 边；「带栅栏的写走调用方的口、不带栅栏的走服务」这条分工要在代码里守住（静态检查候选：锚点写只许经调用方交来的口） |

置信度：中高。依据是契约 S-27 ①、S-33 ① 的输入里没有追加口；若 loop 契约把会话级写入也做成调用方交口，本条可退回草图。

**二、P-2 inject `storage` 与 `clock`**。草图的存储表写了「模态投影缓存：P-2、缓存行写入」，inject 列没写存储；本节点补上这条边。`clock` 给「已开口」时刻、切换事实的时刻与响应体时序用不后退的时间源（infra/clock 的 `now` 不后退），若会话日志的条目壳自带时间点，改由它给、去掉这条边（记在缺口 MRR-N9）。

| | 进程内缓存 | 每次从日志头重算 | **持久缓存（本方）** |
|---|---|---|---|
| 伸缩义务（契约 S-13「代价与历史长度无关」） | 重启后第一次读随历史长度 | 每次随历史长度 | 追补只随新增条目 |
| 落选方最强论证 | D-026 只禁内存**存储提供者**，缓存不是存储；少一条 inject 边 | 零状态、零一致性问题 | — |
| 本方弱点 | — | — | 多一份持久小状态与一条 inject 边；缓存与它追的那本日志必须位置可比（[R-2](#存储要求)） |

置信度：中。缓存丢了从日志重算必得同一答案（`capability.modality-projection/v2#S-6`），所以这一选择只关伸缩，不关正确性。

**三、P-2 只有一个 effect 管在途表，连接池不在 P-2**（草图列为 P-2 的两个 effect：在途表与传输连接池）。连接池归 [`pi-ai-transport`](../pi-ai-transport/README.md) 的插件，它撤除时先关接纳、不关在途连接；P-2 的撤除函数：置「停止中」→ 逐个结算在途调用。这样两条 fiber 谁先撤、同一 fiber 里各 effect 怎样并发（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），在途的流都只会因 P-2 的中止或自然收尾而结束，结算读到的是契约 S-36 要的 `interrupted{run_cancelled}`、不是一次上游故障。落选方（连接池仍在 P-2、与在途表合成一个撤除函数、次序由代码写死）的最强论证是次序只由本节点一处握着；本方弱点是这条结论依赖另一个节点兑现「撤除不关在途连接」（那个节点的 X-1），它改了这一条，本节点就要回到落选方。置信度：中高。

**四、P-2 必需 inject `modelTransport`**（草图 N-2：传输是构造参数级的内部依赖、P-2 不 inject 传输）。

| | 构造参数级内部依赖（草图 N-2） | 一个传输登记表服务，P-2 每次发出时从表里取 | **必需 inject `modelTransport`（本方）** |
|---|---|---|---|
| 落选方最强论证 | 消费者只有 P-2；换一次传输不连带重跑 P-2 与全部 agent runtime；构造参数就能注入脚本化实现 | 换传输不必重跑 P-2 | —— |
| 本方弱点 | —— | —— | 换传输（含改那个插件的配置）⇒ P-2 与 inject `modelRuntime` 的 agent runtime 重跑，在途调用按契约 S-36 收成 `interrupted{run_cancelled}` |
| 为什么选它 | 传输被定为可替换的公开构件（D-063 R-2、R-5），它有自己的包、配置与撤除（连接池）；构造参数级就要由 P-2 持有它的生命周期，配置也跟着进 P-2 的 `Config` | 多一个登记面与「此刻登记的是哪一个」的读，换来的「换传输不重跑」本版用不上（运行期不换传输） | 验收装配以脚本化传输登记同一个键即可替换；传输的配置与撤除留在它自己的插件里 |

置信度：中（取自 fork 节点 [`pi-ai-transport`](../pi-ai-transport/README.md) 的选择表，主线 2026-09-25 采纳）。

### 一次调用是宿主上的一个 effect

照草图 N-1，理由不重复（调用失败是一个值、不是插件失败；调用身份要跨尝试稳定，只能落在日志里；一条会换代的 inject 边会让调用 fiber 重跑、重跑就是再发一次）。机制：

- **宿主显式交进来**：`openCall` 的「宿主」参数是宿主交出的一个句柄（候选形状：`effect(撤除函数) → 提前撤除函数`，以及宿主的中止信号与「停止中」读面）——本节点**不从服务方法里摸调用方的上下文**（草图 H-5）。这个句柄是对尚不存在的 agent runtime 的接口要求，形状登为缺口 MRR-N11（owner C-8，D-060 §八 M67）。
- **何时登记**：出门前检查通过、调用进入 `open` 时在宿主上登记一个 effect；`undispatched` 的调用不登记（它已在终态）。撤除函数 = 对这次调用做契约 S-36 的结算。
- **正常收场时注销**：调用进入终态（或 `reply_pending` 被收口）时调提前撤除函数。**这依赖假设 H-1**（`ctx.effect` 返回的撤除函数可以提前单独调用），kernel-basis 里**没有这条 probe**（缺口 MRR-N5）；它不成立时改为「在宿主下开一个子作用域承载调用的资源」，契约条款与本节其余部分不变。
- **两处结算只有一个先到**：宿主撤除与 P-2 自身撤除可能同时结算同一次调用（草图 H-2：内核重载会不会等旧 fiber 的异步撤除完成，未核实，**本节点不依赖它**）。同一个实例里两条路径调用同一个 `settle`、同一个调用对象上的「已结算」标记先挡一次；跨实例由会话日志上的唯一键挡（[L-2](#存储要求)）——**正确性只在后者**。
- **撤除时不取消在途的方法调用**：内核不取消在途调用。机制是「停止中」标记：P-2 自身撤除或宿主进入停止时置位；`openCall`、`dispatch`、`dispatchAgain` 在入口与每个提交步骤之前（写「已出门」之前、调 `send` 之前）检查它，已置位 ⇒ `runtimeStopped`，不再出网。检查与写之间的窗口由在途表兜住：写「已出门」之前先入表，所以撤除时的结算一定看得到它；它若已写下「已出门」而没出网，结算写下 `interrupted{run_cancelled}`、账全未知——如实，不是编造。
- **每次发出的两个计时器、装配状态、中止句柄**都挂在这一次调用的 effect 上，收场即清。

### 事件：派发、过滤与边界

- **P-2、P-5 不发、也不监听任何 Cordis 事件**（契约 S-37）；控制全是直接调用。本版**不消费**会话日志的追加通知来提前推进投影——正确性靠读时追到日志尾，提前推进只是性能，没有测量就不加。
- **F② 依赖消失时谁被卸载**：见上表；范围是 P-2 实例与 inject `modelRuntime` 的 agent runtime。一次调用的宿主本来就是 agent runtime，两者一起重跑，范围不比契约要的大。
- **F③ 有没有一条事件能越过租户或会话边界**：没有 Cordis 事件，所以没有派发模式与过滤器可选。两条非事件的外送通道各自守住边界：
  - **推给观察者**：观察者端口由宿主随 `openCall` 交进来（与追加口一起，候选），**按 (会话, 目标) 路由**、只推给这次调用所在会话的观察者（契约 S-51 第 1、9 条）；两个会话里同一个 `callId` 各进各的装配状态。观察者端口的形状归会话出站流（块 D，无契约，缺口 MRR-N6）。
  - **结构化日志事件**：进 JSONL 运行日志，只带会话、`callId`、目标、被拒的值——**不带内容、不带凭据**；它是运维面的记录，不是租户可见的通道。

### 存储要求

**A. 对会话日志提供者的要求**。会话日志的窄口接口 2026-09-25 起**已定**：`capability.session-log` v2（candidate；它的[消费者核对](../../../../spec/capabilities/session-log/v2/contract.md#十二消费者核对)已逐条对过下表，右列是对上的条款）；真承接者 loop 与会话那一程未到（那份契约 G-1；MRR-N1），**最小提供者节点 [`session-log-jsonl`](../../session/session-log-jsonl/design.md#消费者要求的承接互指) 已立（candidate）**：L-1～L-8 由它「消费者要求的承接」一节逐条接住（确认落盘才返回、`judgeAppend` 的判定次序、`readSince` 以内存尾为界、读失败答 `unavailable`），**两边互指**。与 [loop-extension-runner](../../agent-loop/loop-extension-runner/design.md#存储要求) 的 RL 系列落在**同一本日志、同一个栅栏判法**上（日志 S-10），两边各写一条、互指。

| # | 要求 | 对应契约条款 | 接口契约兑现条款 |
|---|---|---|---|
| L-1 | 追加以「确认落盘」为返回；确认之后跨进程重启仍在 | S-15「写下指追加口确认落盘」 | [S-13](../../../../spec/capabilities/session-log/v2/contract.md#s-13-提交与持久) 第 2 条；断电边界是那份契约的 G-3 |
| L-2 | **响应体按 `ResponseId` 至多一条**（判重键，带写入方前缀 `mrr/`）；第二条被拒，失败**分得出**是「已有」而不是不可用 | S-17、S-38 第 2 行 | [S-8](../../../../spec/capabilities/session-log/v2/contract.md#s-8-判重键)（`alreadyRecorded{keys}` 与 `unavailable` 分开）；键的名字空间是那份契约的 G-5 |
| L-3 | **多条目原子追加，且可带「这个 `ResponseId` 还没有响应体」的前置**：违反即整批拒（loop 的「回复消息 ＋ 它的响应体」一次写下，或一起不写） | S-17、S-38 第 1 行 | [S-17](../../../../spec/capabilities/session-log/v2/contract.md#s-17-append追加一批条目) ④、S-13 第 1 条（整批全成全不成）＋ S-8 第 3 条（批里任一条的判重键已在即整批不写）——前置就是响应体那一条的判重键 |
| L-4 | **尝试栅栏在日志的写入边界上判**：带栅栏的追加 `fenced{run, attempt}`，日志在提交点上看已提交条目壳上的 `(run, attempt)`，同一运行有更大序号即拒——**不另存尝试行**；结算类记录（响应体、账）`unfenced`、照写并带 `late` | S-17、S-38 第 8、11 行 | [S-10](../../../../spec/capabilities/session-log/v2/contract.md#s-10-尝试栅栏)（第 3 条：结算不带栅栏）、[S-14](../../../../spec/capabilities/session-log/v2/contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步) |
| L-5 | 读到的尾就是读那一刻已确认的最新位置；读不到返回可识别的失败，**不返回空** | S-9、S-13、S-14 | [S-19](../../../../spec/capabilities/session-log/v2/contract.md#s-19-readsince从某个位置往后读)、[S-15](../../../../spec/capabilities/session-log/v2/contract.md#s-15-缺席时的默认答案)末条 |
| L-6 | 锚点与终结记录至多一条：「已出门」按 (`callId`, 发出序号)、「已开口」同上、「中断意图」与「调用终结」各按 `callId`，都拼成判重键 | S-5（发号唯一）、S-31 ⑦、S-38 第 8 行 | S-8 |
| L-7 | 一个会话内的日志位置可比、单调，缓存的水位用它 | S-13 | [S-7](../../../../spec/capabilities/session-log/v2/contract.md#s-7-日志位置与尾位置) |
| L-8 | 五种记录作为不是消息的记录条目存下，条目壳带会话、运行、尝试与租户 | S-8（形状归 `data.messages/v2#S-49`、`#S-50`） | [S-6](../../../../spec/capabilities/session-log/v2/contract.md#s-6-条目与它的壳)（壳上租户恒有；租户取自 `sessionTenancy`，日志 S-12 只保证「不混」） |

**B. 对存储提供者的要求**（[core/storage](../../core/storage/design.md#协议)，协议已有这些能力）。

| # | 要求 | 对应契约条款 |
|---|---|---|
| R-1 | 投影缓存表（候选 `model_projection_cache`）：主键会话；列：无 transcript 的模态集合、水位、它所追的那本日志的标识。唯一写入者 P-2。写在一次写事务里 `lockRow` 那一行、**只在新水位大于旧水位时更新**（只增不减） | S-13 |
| R-2 | 水位与会话日志位置可比：行上记着日志标识，与当前日志对不上即整行作废、从日志头重算 | S-13、S-38「投影 = 从日志重算」 |
| R-3 | 不可用可识别：`StorageUnavailable` 时从日志头重算（答案相同），不把「缓存读不到」说成「投影为空」 | S-13、S-14 |

### 跨 owner 的共同存储对象与三条交错

本节点自己的每一次写都是一次追加，**没有「同一提交」要跨 owner**；需要排序的是它与 loop 对**同一次发出**的并发写。三处共同对象：

1. **响应体的唯一键**（L-2）——loop 的「回复消息 ＋ 响应体」一次追加（L-3）与本节点的结算（撤除、对账、`settleReply`）都要落在它上面。
2. **日志的提交点与条目壳上的 `(run, attempt)`**（L-4；日志 S-10、S-14）——带栅栏的锚点写与新尝试的尝试开始记录排在同一本日志的提交序列里，比较对象就是已提交的条目，不另存尝试行。
3. **锚点的唯一键**（L-6）——两个写入者对同一次调用的同一个发出序号各写一条「已出门」时，后者被拒。

**三条交错，逐条排除不算数的替身**：

| # | 交错 | 没有共同对象会怎样 | 三个替身为什么挡不住 | 共同对象怎样排序 |
|---|---|---|---|---|
| X-1 | 宿主停止：P-2 的撤除写 `interrupted{run_cancelled}`（`ResponseId` R） ‖ loop 同时把回复与它的响应体 R 一次写下 | 两条响应体、两笔账；日志里有一条回复消息，而它的响应体说「没有回复」 | **进程内锁**只在 P-2 实例里，loop 的追加不取它；**时间谓词**（「收场后 N 毫秒内以 loop 为准」）不参与冲突检测；**没落盘的「已结算」标记**在 loop 那边看不见 | L-2：后到者被拒。本节点那一支是空操作；loop 那一支整批不落（L-3），回复不成为消息——与契约 S-17 兜底一致（已交付的块在响应体的 `delivered` 里） |
| X-2 | 旧尝试里半死不活的协程写「已出门」D2 ‖ 新尝试推进序号并对账 | 对账没看到 D2 → 续接又发一个 D2：同号两条、两副协程各发一次 | **时间谓词**（「旧尝试超时即视为死」）挡不住一个恰好醒来的旧协程；**进程内锁**随 P-2 实例生灭，重跑后新旧实例互不相知 | L-4：新尝试的尝试开始记录先提交 ⇒ 旧写被拒（`attemptSuperseded`）⇒ 旧协程不出网、得 `unavailable`；旧写先提交 ⇒ 对账看得到 D2，照契约 S-33 收它 |
| X-3 | 不属于任何运行的调用：旧 P-2 实例里一个撤除前已开始的 `dispatchAgain` 写「已出门」D2 ‖ 新实例在会话重新承载后对账并续接，同样写 D2 | 同 X-2，且没有尝试可比 | 同上；「停止中」标记只缩小窗口，检查与写之间仍可交错 | L-6：(`callId`, 2) 的判重键至多一条，后写的被拒、不出网 |

这三条在本契约的形式模型里**被吸收**（模型只有一次调用、一个原子的「写下」）。**日志那一侧**的两条判法有会失败的模型证据（会话日志契约的 formal task `session-log-v2-appends`：`UniqueDedupeKey`、`FenceHolds`），**它证的是接口，不证本节点真的给每次写带了判重键与栅栏**，所以不绑到本节点；本节点这一侧的证据只能是真并发演练（[verification](verification.md#证据义务) 的 C-1～C-3），受阻于会话日志最小提供者节点尚无。

`selectModel` 的判定与写入**不在同一提交**是契约 S-27 ④ 有意接受的窗口，不需要共同对象。

### 装配给 vs 协议给

契约 S-38 左列，本版单机怎样兑现（右列不在本版）：

| 契约 S-38 的保证 | 本节点单机的兑现 |
|---|---|
| 回复消息与它的响应体同一提交 | 本节点把带回复的响应体**交回、不写**（`reply_pending`）；loop 用 L-3 一次写下 |
| 追加按 `ResponseId` 幂等 | L-2；本节点的 `settle` 把唯一冲突当成「已有先到者」 |
| 「已开口」先于内容被看见 | 同进程：`await` 「已开口」追加确认之后才推给观察者；此前交出的快照不含内容 |
| 「已出门」先于出网 | 同进程：`await` 「已出门」追加确认之后才调传输的 `send`；请求的字节只在 `sendRequest` 里离开进程由 `pi-ai-transport` 保证（它的 SC-3） |
| 在册状态变化之后按新状态准入 | 每次 `openCall`、`legalTargets` 都现读 `modelCatalogRead`，不缓存。**产品装配（cli）：协议给**——中心可达时经 P-1r 读中心，据点副本经保管方；新鲜度上界是契约 G-12，**受阻**。`serveBaseFaces: true` 的同一存储直读只供尚无节点的开发装配（D-060 §八 M65） |
| 凭据值只在发出时出现；来源如实 | 进程内把值作为 `send` 的实参交给适配层；`origin` 取自绑定的有效模型引用，调用方交不进来；发起租户经 `sessionTenancy` 取（M66）。据点上的值是 P-1r 经保管方落地的副本（M47），保管方缺席的本版离线如实 `undispatched{credential_unavailable}` |
| 一次调用内各次发出用同一份档案快照 | 打开时绑定进调用对象；每条「已出门」带着它；续接从日志读 |
| 投影 = 从日志重算 | R-1～R-3：读时追到日志尾 |
| 同一次调用只有一个写入者、发号唯一 | 一个 P-2 实例一张在途表；跨实例、跨尝试由 L-4、L-6 挡（会话日志 S-8、S-10） |
| 调用方身份已核实 | **归装配**：`modelRuntime` 是能力间内部面，据点装配（[apps/cli](../../../apps/cli/README.md)）的入口层核身份、会话打开时核归属；本节点不核实 |
| 结算写入不被尝试栅栏拒收 | L-4 的豁免：结算经 `sessionLog` 的 `unfenced` 追加写、带 `late`（会话日志 S-10 第 3 条） |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.model-profile-directory/v2` S-16、S-17、S-20 | 必需 inject `modelCatalogRead`、`credentialLookup`：产品装配由 P-1r 提供（**受阻**，见那个节点）；只有尚无节点的开发装配由 P-1 经 `serveBaseFaces` 直接提供（M65） | 每次准入现读；凭据每次发出现取 | 读不到 ⇒ `unavailable`；不回退到缓存或别的范围 |
| `capability.modality-projection/v2` S-6、S-15、S-16 | 包依赖，纯函数 | 随包版本 | — |
| `capability.stream-assembly/v2` S-16、S-18～S-23、S-28 | 包依赖 `packages/core/stream-assembly`（纯计算） | 每一次发出一份状态 | 装配器交回的失败值原样记进结构化日志 |
| `capability.asset-evaluation/v2` S-8、S-12（未声明的项不进 `values`：「没有这一项」与「读不到」分开）、S-22 | 纯计算包依赖；**输入**取自会话装配清单（`assemblyManifest.readHead`，`capability.assembly-manifest/v2` [S-16](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-16-readhead读头与每一类最后一条)；记录内容里怎样取是那份契约 G-4） | 每次现取 | 缺席或读不到 ⇒ `unavailable`；求值成功而没有「用哪个模型」这一项 ⇒ 第 2 步没有锁（契约 S-10、G-20）；允许集合 `A` 不再经它，原消费的 S-23 随 G-19 闭合撤下 |
| `capability.session-log/v2` [S-8](../../../../spec/capabilities/session-log/v2/contract.md#s-8-判重键)～[S-10](../../../../spec/capabilities/session-log/v2/contract.md#s-10-尝试栅栏)、[S-17](../../../../spec/capabilities/session-log/v2/contract.md#s-17-append追加一批条目)～[S-19](../../../../spec/capabilities/session-log/v2/contract.md#s-19-readsince从某个位置往后读) | 必需 inject `sessionLog`；带栅栏的写走调用方随 `openCall` 交来的追加口；L-1～L-8 | 每次操作现读 | `unavailable` ⇒ `unavailable`，不回退到在途表（契约 S-34 ⑧）；`alreadyRecorded` ⇒ 已有先到者（L-2 空操作）或这一次不出网（L-6）；`attemptSuperseded` ⇒ `unavailable`、不出网；`tenantMismatch`、`invalidInput` ⇒ 缺陷 |
| `capability.session-tenancy/v2` [S-8](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-8-holdingtenant读会话持有的租户身份) | 调用时取用 `sessionTenancy`（与 runner 解析执行环境句柄、执行宿主 `submit`、注册表会话事实同一读面，D-060 §八 M48、M66） | 每次要用发起租户时现读 | `sessionNotFound`、`unavailable`、缺席 ⇒ `unavailable`，不给默认、不从进程上下文补（契约 S-14） |
| 数据契约（`data.model-profile`、`data.model-response`、`data.messages`、`data.content-blocks`、`data.call-accounts`、`data.loop-extension`、`data.tool-definition`、`data.arrival-events` v2） | 包依赖同批 core 纯模块 | 随包版本 | — |
| `data.identity-values/v1`、`data.offer-expiry/v1` | 包依赖 | 随包版本 | — |
| 本契约 S-38 左列的传输适配（服务 `modelTransport`，无独立契约） | 必需 inject；生产与开发装配为 [`pi-ai-transport`](../pi-ai-transport/README.md)，验收装配为脚本化传输（同一个键） | 换代 ⇒ P-2 重跑 | 缺席 ⇒ P-2 `PENDING` |
| 存储（无契约，`storage`） | 必需 inject；要求 R-1～R-3 | 换代 ⇒ 重跑 | 不可用 ⇒ 从日志重算 |
| 时间源（`clock`） | 必需 inject | 装配启动时 provide | 缺席 ⇒ `PENDING` |

**被谁消费**：agent runtime（loop 那一程，尚无节点）、runner（调用时取用两个判定）、交付面的切换命令与停止按钮（经 [apps/cli](../../../apps/cli/README.md)）。

## 状态、并发与失败映射

**写权**全在 P-2；P-5 没有写。**提交点**逐操作：`openCall` 只在检查不过时写调用终结；`dispatch`／`dispatchAgain` 是「已出门」；首 token 是「已开口」；收场是响应体（本节点写）或交回（调用方写）；`interrupt` 是中断意图；`releaseCall` 是调用终结；`settleReply` 是带处置的响应体；`reconcile` 每一行各自一次；`selectModel` 是切换事实。

**不加进程内锁作为正确性机制**：在途表与调用对象上的标记只让同一实例里的重复路径少走一步；两个写入者之间的次序全部落在 L-2、L-4、L-6 上。理由同 tenancy 各节点：锁的实例随插件实例生灭，重跑后新旧实例互不相知。

**失败映射**：日志或存储 `StorageUnavailable` ⇒ `unavailable`；L-2 冲突 ⇒ 空操作；L-6 冲突 ⇒ 这一次不出网、`unavailable`，调用停在原状态；L-4 拒收（带栅栏的写）⇒ `unavailable`，不出网；传输错误按契约 S-18 分类；凭据取不到按契约 S-19、S-29 ⑧；缓存行形状不对 ⇒ 作废重算、记 error 日志；存储里读出的日志记录形状不对 ⇒ 缺陷，上抛。没有 catch-all。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（P-2：成因表、脱敏三参数；P-5：`retryPolicy`；传输的配置归 `pi-ai-transport`） | 内核在插件体之前校验（kernel-basis `definePlugin`） | 不过 ⇒ `FAILED`、不 provide、装配启动失败（basis `plugin-throw-fails-fiber`） | — |
| P-2 的一个 effect：在途表 | P-2 fiber；插件体里建，建成之后才 `provide` | 建不起 ⇒ 插件体抛出 ⇒ `FAILED`，没有半个服务；传输对象与连接池归 `pi-ai-transport`，不在这里构造 | 撤除函数按序：置「停止中」→ 逐个结算在途调用（中止 → 在途的流 `abandon` → `interrupted{run_cancelled}` 或调用终结 → 释放）；连接池由传输插件自己收（不关在途连接，[关键差异三](#与装配草图不同的四处)）。撤除函数里的异常只进日志（basis `effect-disposal-concurrent-not-ordered`），所以每一步自己记 error 级结构化日志；写不进的结算留给对账。**保留**：日志里的六种记录——没有一条正确性依赖在途表（契约 S-39） |
| `ctx.provide('modelRuntime')` | P-2 fiber；`ACTIVE` 后可解析 | provide 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`，未升格为 basis 条目） | 服务消失，消费者重跑或 `PENDING`；已开始的方法调用**跑完**，靠「停止中」标记在下一个提交步骤前停下 |
| 每次调用在宿主上的 effect（含两个计时器、装配状态、中止句柄） | 宿主（agent runtime）fiber；`openCall` 通过检查时登记 | 登记本身失败 ⇒ `openCall` `unavailable`，调用不打开 | 宿主撤除 ⇒ 契约 S-36 的结算；正常收场 ⇒ 提前撤除（依赖 H-1）；已在 `reply_pending` 的那一次流已收尾、不再 `abandon`，只写没有回复的 `interrupted{run_cancelled}` |
| P-5 向 runner 登记系统自带实现 | P-5 fiber；拿回注销函数包进 `ctx.effect`（草图「贡献的统一形状」） | 同名已登记 ⇒ runner 拒绝 ⇒ P-5 插件体抛出 ⇒ `FAILED` | 注销；**正在求值的那一次跑完**，runner 按契约 runner S-34 把「实现在求值中途被撤下」记成报错；之后 runner 由指定挂件顶上 |

**没有定时器承担正确性**：退避计时归 loop（契约 S-30 ④ 「本能力不替它计时」）；每次发出的两个时限计时器随调用 effect 清。

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；下面是本节点的缺口。其中「本程不补、留给下一程」（owner 主线，[D-060 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）的是：MRR-N1（C-1 会话日志的真承接者）、MRR-N2（C-5 `infra/secrets`）、MRR-N3（C-2 装配清单的真承接者）、MRR-N8（C-6 附件存储）、MRR-N10（C-13 会话持有租户的写面）、MRR-N11（C-8 agent loop）。C-1、C-2、C-13 三处 2026-09-25 起**接口已定**（D-063 R-1），只剩真承接者，最小提供者节点 `session-log-jsonl`、`assembly-manifest-store`、`session-tenancy-table` 已立；MRR-N4 的 fork 节点 `pi-ai-transport` 已立。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| MRR-N1 | **会话日志：接口已定、真承接者未到**。L-1～L-8 已对到 `capability.session-log` v2 的条款（[存储要求](#存储要求)），三条交错的共同对象（L-2、L-6 的判重键，L-4 的日志提交点）有了家；**最小提供者节点 [`session-log-jsonl`](../../session/session-log-jsonl/design.md#消费者要求的承接互指) 已立（candidate）**，已逐条接住 L-1～L-8、两边互指，本版只进验收装配（它的 SLJ-8）；真承接者 loop 与会话那一程未到（那份契约 G-1） | loop 与会话那一程 | 产品装配里的全部十三个操作（服务面）；三条真并发演练待那个节点建包；函数面 `invokeModel` 不受挡 | 那一程的契约收下或取代 session-log v1 |
| MRR-N2 | **凭据：据点一侧保管方接口已定、真承接者未到**（`capability.credential-custodian` v2，经 P-1r 的 `credentialLookup` 间接用；中心一侧本版不收）：保管方最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#实施缺口与消费者影响) 已立（candidate，本版只进验收装配），产品装配里据点没有本地副本 ⇒ 离线如实 `undispatched{credential_unavailable}`；副本的来路（登录状态与值）在未来资产/据点入口（版本未分配）（D-060 §八 M47；PF-016 §6.17／§6.20「离线时用手上那份副本」在产品装配里没有兑现） | 主线（见 [model-profile-directory 的 MPD-N1](../model-profile-directory/design.md#实施缺口与消费者影响)） | `dispatch`、`dispatchAgain`；离线的据点 | 副本来路随未来资产/据点入口（版本未分配）（那个节点的 CCL-5） |
| MRR-N3 | **装配清单：接口已定、读法未约定**。`capability.assembly-manifest` v2 的 `readHead` 交得回换表记录，但层锁（「用哪个模型」这一项在不在、在哪一格上锁）与两个时限要从记录内容里怎样取、写入方是否记下了求值结果没有约定（那份契约 [G-4](../../../../spec/capabilities/assembly-manifest/v2/contract.md#十已知缺口)）——`effectiveModel` 的第 2 步与 `dispatch` 的时限在它闭合前 `unavailable`。**已不在这里的**：允许集合 `A`（契约 G-19 闭合，由目录读面直接给，`legalTargets`、`displayList` 解阻）；`openCall`（S-28 ④ 用交来的 `target`、不重算）；从没切换过时的选中初值（归契约 G-20：产出方未定，那一支恒 `unavailable`，与本缺口无关）。**真承接者 PF-004 那一程未到，最小提供者节点 [`assembly-manifest-store`](../../assets/assembly-manifest-store/design.md#实施缺口与消费者影响) 已立（candidate）**：原样交回写入方记下的 `content`，读法仍未约定（它的 AMS-3；与 runner 节点 RUN-N2 同一缺口） | 主线 → PF-004 那一程 | `effectiveModel`（写过切换记录的会话）、`dispatch` 的时限 | 那一程定下记录里求值那一部分的形状与这两项的读法，或给出专门的读 |
| MRR-N4 | **传输 fork 包：节点已立、尚未建包、比较门未过**。fork 节点 [`pi-ai-transport`](../pi-ai-transport/design.md#实施缺口与消费者影响) 已立（candidate；pi 0.86.1 `3390bd9`，D-063 R-5）：S-38 十一条落成它的 T-1～T-11，公开面是 `planRequest`／`sendRequest`／`readStream`，插件登记 `modelTransport`（P-2 必需 inject）；**尚未建包**（它的 PAT-N1），**D-019 比较门一项都没有在真实 OpenRouter 上过**（它的 PAT-N2，真实请求要产品负责人授权与预算）；它要本节点改的几处已改（它的 PAT-N14 ①）；**规划拒绝的落点已由契约闭合**（[S-28](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-28-opencall) 末条、[S-29](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-29-dispatch) ④、G-21；它的 PAT-N9）：三种拒绝都归出门前检查、不算已出门——模态送不出收 `undispatched{modality_mismatch}`，有调用没结果与 `ToolInternalMessage` 混进请求收 `invalidInput{reason}`、不写记录；`openCall` 已过而 `plan` 仍拒是两处判定不一致的缺陷，收场照同一张表（它的[规划拒绝](../pi-ai-transport/design.md#规划拒绝的三种值与收场)） | 主线 → 实施程；产品负责人（比较门的真实请求） | 全部真实发出（验收装配用脚本化传输，不受挡） | 那个包建起、T 系列跑通；比较门逐项有测试或实测记录 |
| MRR-N5 | **假设 H-1**（effect 提前撤除）无 probe；H-2 不依赖 | `packages/core/kernel-basis` | 一次调用的 effect 写法 | probe 在 4.0.4 上立起；不成立时改子作用域写法 |
| MRR-N6 | **会话出站流（观察者端口）没有契约** | 主线 → 块 D | 契约 S-51 第 8、9 条的兑现 | 出站流契约给出端口形状与按会话路由 |
| MRR-N7 | 「已开口」在首 token 热路径上多一次耐久写，**延迟未测量**；会话日志最小提供者每批 `datasync`，与它的 SLJ-2（verification V-13）**同一次测量** | 本节点 ＋ [`session-log-jsonl`](../../session/session-log-jsonl/design.md#实施缺口与消费者影响) 的实现者 | 无（不改设计） | 有实现后按验收装配测一次，两边的 verification 各记一行、互指 |
| MRR-N8 | 原始响应留存受阻于附件存储未定义（`data.content-blocks` 的 G-1） | 那份契约的 owner | 原始响应留存这一支（不挡响应体） | 附件存储有定义 |
| MRR-N9 | **据点装配要装 `storage` 与 `clock`**；若会话日志条目壳自带时间点，`clock` 这条边可去——`capability.session-log` v2 的壳上**没有时刻**（它的 G-4），这条边本版保留 | [apps/cli](../../../apps/cli/README.md)（装配）；loop 与会话那一程 | P-2 启动 | 装配节点写明；会话日志的完整契约定时间点的来源 |
| MRR-N10 | **发起租户：接口已定、真承接者未到**（`capability.session-tenancy` v2 S-8；D-060 §八 M66）：与 runner、执行宿主、注册表同一读面；**最小提供者节点 [`session-tenancy-table`](../../session/session-tenancy-table/design.md#实施缺口与消费者影响) 已立（candidate）**；**产品装配里它没有写入方**（那份契约 G-2，它的 STT-1）⇒ 每次读 `sessionNotFound` ⇒ 要发起租户的操作一律 `unavailable`；验收装配经它的 `./seed` 代写 | 会话那一程 PF-015（写面） | `openCall`、`dispatch`、`dispatchAgain`、`reconcile`——凡要取凭据、记账的；安全性质「不改用别的租户、组织层的凭据」的前提 | 会话创建的契约写出那一写（session-tenancy G-2） |
| MRR-N11 | **`openCall` 的宿主句柄形状没有人接**（D-060 §八 M67）：effect 登记函数、宿主的中止信号、「停止中」读面——是对 agent runtime 的接口要求，只在本页作候选 | 主线，下一程（C-8 agent loop） | 每一次调用的撤除与结算（契约 S-36） | loop 契约写明宿主交给 `openCall` 的句柄 |
| MRR-N12 | **函数层的行为没有契约条款**：`invokeModel`、`TransportAdapter`、`dispatchGuard`、`decideRetry`、`retryDelay` 借本契约的词汇与判定，契约写的是服务面（与 TER T-17 同题） | 主线 | 外部包装 `invokeModel` 的人 | 契约为函数面给出条款，或明写「函数面不受契约约束」 |
| MRR-N13 | **「用哪个模型」这项设置的产出方未定**（契约 [G-20](../../../../spec/capabilities/model-request-runtime/v2/contract.md#十二已知缺口)，从原 G-19 拆出）：从没切换过的会话，选中模型判不出 ⇒ `effectiveModel`、`displayList` 对它 `unavailable`，不拿链上某个名字当初值（契约 S-9、G-20 ②）；锁那一半已由契约 S-10 第 2 步定下（求值成功而没有这一项即没有锁），不在本缺口。**后果**：一个新会话在用户第一次切换之前，loop 拿不到 `target`、发不出第一次模型请求——产品装配里如此；验收装配以种子写一条模型切换记录（契约 S-9 末句） | 主线 → PF-004（Agent 定义的属性项）＋ `capability.asset-evaluation`（它的 G-21） | loop（新会话的第一次请求）；`displayList` 的消费者（交付面） | 契约 G-20 闭合：某份正文契约产出这一项、写明锁怎么判；或主线裁定本版没有这一项时初值从哪来 |
| MRR-N14 | **已闭合**（[D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④、N-43；契约 [S-28](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-28-opencall) ①③④⑧、G-24）：名字到条目由本能力经会话资产注册表的 `lookup` 解析，属于某个 Run 的调用随请求带 `report`（与 `run` 同在同缺）、在它所依的快照里取；落点见 S-7 行与依赖表 `assetRegistry` 一行。**受阻的只剩调用方**：带 `report` 调 `openCall` 的是 agent loop（C-8） | — | — | — |
| MRR-N15 | **已由契约闭合**：S-21 首行明确 `upstream_unavailable` 只在请求已到上游时成立；`local{queued}`、对上游零请求按 S-18 传输本地一行收 `unrecognized`（D-060 §八 N-44 ④）。节点分类与场景沿该条款，不再有两种未裁读法；实际测试仍未开始 | — | — | — |

**与草图的差异不改契约**：「P-2 不 inject 会话日志服务」只写在草图里，契约没有这一条；本节点改为必需 inject（[理由](#与装配草图不同的四处)）；「不 inject 传输」同理改为必需 inject `modelTransport`（之四）。若 loop 契约起草时把会话级写入也做成调用方交口，本节点可退回草图。
