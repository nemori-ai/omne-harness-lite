# TypeScript 里「可配置重试策略」的现成库：能拿来做什么、做不了什么

- 调查对象与日期：npm 上的 `cockatiel@4.0.0`、`p-retry@8.0.1`、`retry@0.13.1`、`exponential-backoff@3.1.3`、`async-retry@1.3.3`、`ts-retry-promise@0.8.1`、
  `@lifeomic/attempt@3.1.0`、`promise-retry@2.0.1`；参照 Python `tenacity@9.1.4` 与 `effect@3.22.2` 的 `Schedule`。全部取证于 **2026-09-25**，本机 Node `v24.18.0`、npm `11.16.0`、TypeScript `6.0.3`。
- 消费者：D-063 R-6 的三个落点——
  [model-request-runtime 节点](../../design/realization/packages/model/model-request-runtime/design.md) P-5 改写、
  [契约 G-8](../../design/spec/capabilities/model-request-runtime/v2/contract.md#十二已知缺口) 改成「策略配置项与默认初值」、实施边界 W-10b。
- 最近核对：2026-09-25 / 上述版本。
- 当前结论：**八个候选的主接口全是「执行器」**——包住一个函数，在进程里循环「调用→捕获→睡→再调用」；
  而本项目契约里的重试件是「判定者」——它只交回一条 `retry { provider, after }`，等待与再发归 loop（[S-30](../../design/spec/capabilities/model-request-runtime/v2/contract.md#s-30-dispatchagain) ④），
  一次发出之内不许藏重试（[S-29](../../design/spec/capabilities/model-request-runtime/v2/contract.md#s-29-dispatch) 末条）。
  所以候选的执行器原样放不进重试件；能搬过来的只剩**延迟怎么算**和**配置项怎么叫**。把延迟计算作为公开、无副作用接口交出来的只有
  `cockatiel`（不可变的退避对象链）、`retry`（`createTimeout`）和 `@lifeomic/attempt`（`defaultCalculateDelay`）三个；
  `p-retry` 的执行器最完整（睡眠可被 `AbortSignal` 打断、谓词与钩子齐全），但它的延迟计算是模块私有的。
  **没有一个候选有「换到下一个目标」的概念**：S-35 的逐家一遍、每家至多一次、不允许回退时同家至多一次，以及 S-30 的三道守卫，都表达不进任何库的配置，只能写在本项目代码里。

## 问题与区分条件

D-063 R-6 要的是：重试做成**可配置策略**（次数、退避种类、基数、倍率、上限、抖动、哪些失败才重试），默认值只是配置初值，
「调度复用成熟 TS 库」，产品规则仍由 [S-35](../../design/spec/capabilities/model-request-runtime/v2/contract.md#s-35-默认重试件可替换) 与 D-060 S16-g 约束。

一个重试库在这件事里可能扮演三种角色，要分开看：

1. **执行器**：包住一次操作，自己睡、自己再调用。
2. **延迟计算**：给定第 n 次（或上一步状态）算出该等多久。
3. **配置词汇与校验**：参数叫什么、默认值、非法值怎么报错。

契约与节点已经把第 1 种角色定给了别人（[E1](evidence.md#e1-本项目对重试件的约束契约节点与裁决)）：重试件在「调模型之后」失败那一维上下结论，loop 在 `after` 到期之后调 `dispatchAgain`，
守卫另在 `canDispatchAgain`（S-50）上判；P-5 节点把重试件写成「纯函数：快照里的供应商次序、允不允许回退、已试过的家、最近成因 → `retry { provider, after }` 或 `observed`」、零依赖。
所以本调查对每个候选问的是：**第 2、3 种角色它能不能单独交出来**，以及用它要付什么代价。

会改变边界的观察：某个候选提供「按失败原因换目标」的一等概念（本轮未发现）；契约把等待与再发移进重试件（那是设计变更，不归本调查）。

## 证据入口

- 本项目约束：[E1](evidence.md#e1-本项目对重试件的约束契约节点与裁决)。
- 注册表、下载量、版本史与仓库活跃度：[E2](evidence.md#e2-npm-注册表元数据与周下载量)、[E3](evidence.md#e3-版本史p-retry-何时离开-retrycockatiel-何时变成-esm)、[E4](evidence.md#e4-github-仓库状态与未关问题)。
- 逐库读源码：[E5](evidence.md#e5-cockatiel-400)（cockatiel）、[E6](evidence.md#e6-p-retry-801)（p-retry）、[E7](evidence.md#e7-retry-0131)（retry）、[E8](evidence.md#e8-exponential-backoff-313)（exponential-backoff）、
  [E9](evidence.md#e9-async-retry-133-与-promise-retry-201)（async-retry、promise-retry）、[E10](evidence.md#e10-ts-retry-promise-081)（ts-retry-promise）、[E11](evidence.md#e11-lifeomicattempt-310)（@lifeomic/attempt）。
- 实测：[E12](evidence.md#e12-行为探针node-v24180)（行为探针）、[E13](evidence.md#e13-类型探针typescript-603按仓库的严格-nodenext-选项)（类型探针）、[E14](evidence.md#e14-安装体积)（安装体积）。
- 参照：[E15](evidence.md#e15-tenacity-914-的策略形状)（tenacity）、[E16](evidence.md#e16-effect-3222-的-schedule只核签名)（Effect Schedule）。

## 对照表一：包形态、维护与采用

周下载 = npm 下载 API `2026-09-18:2026-09-24` 一周的点值；**`retry`、`async-retry`、`promise-retry` 等老包的数字大多是传递依赖带来的，不代表直接选用**（本轮无法拆分）。

| 候选 | 最新版本（发布日） | 许可 | 周下载 | 维护状态（2026-09-25） | 模块形态 / 类型 | Node 24 | 运行时依赖；安装体积 |
|---|---|---|---|---|---|---|---|
| `cockatiel` | 4.0.0（2026-05-26） | MIT | 1,020,380 | 单一主要维护者（connor4312 96 次提交）；最近推送 2026-09-06（依赖升级）；开着 1 PR + 2 issue | **仅 ESM**（`"type":"module"`），TS 编写、自带 `.d.ts`；`engines.node >=22` | 实测可用 | 0；291,196 B（整套韧性库：retry/breaker/timeout/bulkhead/fallback，`sideEffects:false`） |
| `p-retry` | 8.0.1（2026-09-01） | MIT | 30,658,644 | sindresorhus；最近推送 2026-09-18；开着 1 | **仅 ESM**，手写 `.d.ts`；`engines.node >=22` | 实测可用 | `is-network-error@1.3.2`；44,345 B |
| `retry` | 0.13.1（2021-06-21） | MIT（GitHub 显示 NOASSERTION，包内 License 为 MIT 文本） | 61,490,579 | 最近提交 2022-01-20；开着 23（含 2026 年新开的 4 个：ESM 讨论、选项默认值 issue 与两个 PR） | CJS；无自带类型（`@types/retry@0.12.5`） | 实测可用 | 0；35,678 B |
| `exponential-backoff` | 3.1.3（2025-10-10） | Apache-2.0 | 20,284,414 | Coveo；最近提交即 3.1.3 发布；AbortSignal 的 issue #69 与 PR #70 自 2024 开着 | CJS（ES5 下译），TS 编写、自带 `.d.ts`；无 `engines` | 实测可用 | 0；121,170 B |
| `async-retry` | 1.3.3（2021-08-17） | MIT | 16,080,239 | Vercel；最近提交 2021-08-17；开着 30 | CJS；无自带类型（`@types/async-retry@1.4.9`） | 实测可用 | `retry@0.13.1`；49,441 B |
| `ts-retry-promise` | 0.8.1（2024-05-19） | MIT | 365,421 | 单人；最近推送 2024-10-31；#57、#59 两个行为缺陷开着 | CJS（ES5 下译），TS 编写、自带 `.d.ts` | 实测可用 | 0；50,394 B |
| `@lifeomic/attempt` | 3.1.0（2024-03-21） | MIT | 621,903 | LifeOmic；2026 年只有依赖升级提交；AbortSignal 的 issue #70 与 PR #69 自 2024-10 开着 | CJS `main` + ES 构建（`module` 字段，无 `exports` 映射），TS 编写、自带 `.d.ts` | 实测可用 | 0；70,815 B |
| `promise-retry` | 2.0.1（2020-06-14） | MIT | 14,768,728 | 最近推送 2022-12；开着 11 | CJS；无自带类型（`@types/promise-retry@1.1.6`） | 实测可用 | `retry@0.12.0`、`err-code@2.0.3`；102,177 B |

「实测可用」= 在 Node v24.18.0 上 `import` 并跑通探针（[E12](evidence.md#e12-行为探针node-v24180)），且在 TypeScript 6.0.3、仓库同款严格 `NodeNext` 选项、`skipLibCheck: false` 下类型检查零报错（[E13](evidence.md#e13-类型探针typescript-603按仓库的严格-nodenext-选项)）。
所有候选都没有 `deprecated` 标记；只有 `exponential-backoff@3.1.3` 带 npm 来源证明（provenance attestation）。

## 对照表二：策略可配置面，对 R-6 的七个维度与本项目的形状

「—」= 读遍源码与类型未见；「执行器内」= 只在执行器的参数里、没有可单独调用的计算函数。

| 维度 | `cockatiel` | `p-retry` | `retry` | `exponential-backoff` | `async-retry` | `ts-retry-promise` | `@lifeomic/attempt` |
|---|---|---|---|---|---|---|---|
| **次数** | `maxAttempts`——**实为重试次数**：`1` 时共调用 2 次（文档写「attempts to make」） | `retries`（重试次数，默认 10）；另有 `maxRetryTime`（单调时钟） | `retries`（默认 10）；`forever`；`maxRetryTime`（墙钟） | `numOfAttempts`（**总调用次数**，默认 10） | 同 `retry` | `retries`（默认 10）；另有**总超时默认 60 s** | `maxAttempts`（**总调用次数**，默认 3）；另有单次 `timeout` |
| **退避种类** | 常数、列表（`IterableBackoff`，超出取末值）、指数、委托函数（`DelegateBackoff`） | 仅指数 | 仅指数（或直接给一个毫秒数组） | 仅指数 | 同 `retry` | 固定、线性、「指数」、自定义函数 | 指数（`factor` 为 0 即固定）、自定义 `calculateDelay` |
| **基数（首次等待）** | `initialDelay`（默认 128 ms） | `minTimeout`（默认 1000 ms） | `minTimeout`（默认 1000 ms） | `startingDelay`（默认 100 ms）；`delayFirstAttempt` | 同 `retry` | `delay`（默认 100 ms） | `delay`（默认 200 ms）；`initialDelay` 首次调用之前 |
| **倍率** | `exponent`（默认 2）——**只在 decorrelated 生成器里生效**；`noJitter`／`full`／`half` 三个生成器写死 2（实测 `exponent: 3` 仍得 100, 200, 400…） | `factor`（默认 2） | `factor`（默认 2） | `timeMultiple`（默认 2） | 同 `retry` | 「EXPONENTIAL」是 **`delay ^ 次数`**（默认 100 → 0.1 s, 10 s, 17 min…，issue #59），没有独立倍率 | `factor`（**默认 0 = 不增长**） |
| **上限** | `maxDelay`（默认 30 s） | `maxTimeout`（默认 ∞） | `maxTimeout`（默认 ∞） | `maxDelay`（默认 ∞） | 同 `retry` | `maxBackOff`（默认 5 min） | `maxDelay`（0 = 不设） |
| **下限** | — | — | `minTimeout` 兼作下限 | — | 同 `retry` | — | `minDelay`（只作抖动下界） |
| **抖动** | 无、full `[0,d)`、half `[d/2,d)`、decorrelated（Polly 算法，**默认**） | `randomize`：乘以 `[1,2)`（只会变长，不是 full jitter） | `randomize`：乘以 `[1,2)`；`timeouts()` 还会把随机后的序列**升序重排** | `jitter: "none" \| "full"` | 同 `retry`，但 **`randomize` 默认 `true`** | — | `jitter`：`[minDelay, d]` 均匀 |
| **按失败决定是否重试** | 策略级谓词 `handleWhen`／`handleType`／`handleWhenResult`，看不到次数；`DelegateBackoff` 的函数抛错即停 | `shouldRetry(ctx)`、`shouldConsumeRetry(ctx)`（该次失败不计入次数）、`AbortError` 立即停；**非网络 `TypeError` 一律不重试，谓词覆盖不了** | 调用方自己决定调不调 `op.retry(err)` | `retry(e, n)` | `bail(err)` | `retryIf(e)`、`until(result)`、`NotRetryableError` | `handleError` 里调 `context.abort()` |
| **取消（`AbortSignal`）** | `execute(fn, signal)`，但**退避睡眠不看信号**：实测中途取消仍等满 1.5 s、再调用一次，最后抛的是函数的错误而不是取消原因 | 睡眠可被打断：实测 100 ms 即以取消原因拒绝 | — | —（PR #70 未合） | — | — | —（PR #69 未合；只有合作式 `context.abort()`） |
| **事件／钩子** | `onRetry`（带 `delay`、`attempt`）、`onGiveUp`、`onSuccess`、`onFailure`（带耗时） | `onFailedAttempt(ctx)`（带 `retryDelay`） | 回调式 `attempt(fn)`；`errors()`、`mainError()` | `retry` 回调兼作钩子 | `onRetry(err, n)` | `logger(msg)` | `beforeAttempt`、`handleError`、`handleTimeout` |
| **延迟计算能否单独调用** | **能**：`new ExponentialBackoff(opts).next(ctx).duration`，不可变链；`DelegateBackoff` 收任意上下文 | **不能**（`calculateDelay` 模块私有） | **能**：`createTimeout(n, opts)`、`timeouts(opts)` | 不能（`DelayFactory` 只在 `dist/` 深路径，无 `exports` 映射） | 不能 | 不能（三种 backoff 函数模块私有） | **能**：`defaultCalculateDelay({attemptNum}, opts)` |
| **能否表达「按失败原因换目标」** | 无目标概念；被包函数可按 `context.attempt` 索引供应商表（上一次的错误只在 `onRetry` 里） | 无；被包函数可按 `attemptNumber` 索引 | 无；`attempt(fn)` 给次数 | 无；`request` 不收参数，要外部计数 | 无；`fn(bail, n)` 给次数 | 无；`f` 不收参数 | 无；`context.attemptNum` |

`promise-retry@2.0.1` 与 `async-retry` 同类：包一层 `retry@0.12.0`，配置面等同 `retry`，`retry(err)` 回调触发下一次；不单列一行。

## 结论

### C-1 候选的执行器与契约里重试件的位置对不上

- **观察**：八个候选的主接口都是执行器（[E5](evidence.md#e5-cockatiel-400)–[E11](evidence.md#e11-lifeomicattempt-310)）。契约里重试件只交回结论，`after` 到期后由 loop 调 `dispatchAgain`，本能力「不替它计时」；传输不得在一次发出之内藏重试；P-5 是零依赖的纯函数（[E1](evidence.md#e1-本项目对重试件的约束契约节点与裁决)）。
- **因此不可能**：把任何候选的执行器原样装进 P-5 而同时满足 S-30 ④（等待不在件里）与节点里「纯函数」的写法。执行器在自己的循环里再调用，这次再发就绕过了 S-30 的三道守卫、`canDispatchAgain` 与「已出门」留痕。
- **代价**：若把 R-6 的「调度复用成熟 TS 库」读成「让库执行等待与再发」，就要改契约的分工（那是设计变更）；若不改，库只能以「延迟计算 + 配置词汇」两种角色进来。
- 适用范围：上述八个包的当前版本；契约 `capability.model-request-runtime` v2 候选当前正文。

### C-2 能单独交出延迟计算的只有三个

- **观察**：`cockatiel` 的退避对象（`IBackoffFactory.next(ctx) → IBackoff{duration, next}`）、`retry.createTimeout(n, opts)`、`@lifeomic/attempt` 的 `defaultCalculateDelay(ctx, opts)` 是公开导出、无 I/O 的计算；
  其余把计算藏在模块里（[E6](evidence.md#e6-p-retry-801)、[E8](evidence.md#e8-exponential-backoff-313)、[E10](evidence.md#e10-ts-retry-promise-081)）。实测三者都能不经执行器算出序列（[E12](evidence.md#e12-行为探针node-v24180) P1）。
- **因此不可能**：在不引入执行器的前提下复用 `p-retry`、`exponential-backoff`、`ts-retry-promise`、`async-retry`、`promise-retry` 的退避算法；`exponential-backoff` 的 `dist/delay/delay.factory` 深路径 `require` 得到，但不在公开接口里，升级不受 semver 保护。
- 适用范围：上述版本的导出面。

### C-3 退避序号要从事实里推出来，库里的计数不跨进程

- **观察**：重试件只凭失败主体与 `readAttempts` 下结论（S-29 ⑤、S-34），进程重启之后仍要答对「这是第几次」。执行器的计数全在内存里（`p-retry` 的 `retriesConsumed`、`cockatiel` 的循环变量、`retry` 的 `_attempts`）。
  `retry.createTimeout(n)`、`defaultCalculateDelay({attemptNum: n})` 是 n 的纯函数；`cockatiel` 的 `noJitter` 需从头重放 n 步才得第 n 个值；`decorrelated`（cockatiel 默认）的下一步依赖上一步的随机值 `[attempt, prev]`，状态在闭包里、不可序列化（[E5](evidence.md#e5-cockatiel-400)）。
- **因此**：用任何执行器，重启后序号归零；用 `cockatiel` 的 decorrelated 抖动，重启后只能从头生成另一条随机序列，不能「接着上一次的那条」。带随机的策略本来就不可复现，这一条只在要求「同一次调用的退避可复算」时才是代价。
- 适用范围：上述版本；「要不要可复算」是设计选择，本处不判。

### C-4 「换家」没有一个库能表达，S-35 的产品规则全落在本项目代码里

- **观察**：没有候选有「目标／供应商／回退链」的概念；`cockatiel` 的 `fallback` 是返回替代值，不是换下一个目标。在执行器里换家只能让被包函数按尝试序号去索引一张供应商表（[E12](evidence.md#e12-行为探针node-v24180) P5：cockatiel 用 `context.attempt`、p-retry 用 `attemptNumber` 都能跑通；`exponential-backoff` 与 `ts-retry-promise` 的被包函数不收参数，要靠外部可变计数）。
- **因此不可能**：用任何库的配置表达 S-35 的「只对策略类成因出手」「按快照次序逐家一遍、每家至多一次」「不允许回退时同家至多一次」「没有下一家即试尽」，也不能表达 S-30 的三道守卫。R-6 七个维度里的「次数」在 S-35 下不是一个独立参数：停止只由 S-35 决定（D-060 N-33），次数由允许的供应商个数和回退声明推出。
- **代价**：库能接管的只有 `after` 的取值；下一家是谁、要不要再试，任何选择下都要自己写、自己测。
- 适用范围：上述版本。

### C-5 配置面：没有一个候选同时覆盖 R-6 列出的全部维度

- **观察**（对照表二）：
  - `cockatiel`：种类最全（常数、列表、指数、委托），抖动四种；但**倍率只在 decorrelated 里生效**，「指数 + 自定倍率 + 无抖动」要自己写生成器或用 `DelegateBackoff`；没有线性、没有下限。
  - `retry`／`p-retry`：基数、倍率、上限齐，抖动只有「乘 `[1,2)`」一种，不能 full jitter。
  - `@lifeomic/attempt`：基数、倍率、上限、下限、full jitter 齐；`factor` 默认 0（不增长）。
  - `exponential-backoff`：基数、倍率、上限、none/full 抖动齐，但只在执行器里。
  - `ts-retry-promise`：「指数」不是常见意义的指数（`delay ^ n`）。
- **因此**：选哪个都要在它之上补一层本项目自己的配置形状（至少要补 R-6 缺的那几维，且要把它们映射成库的参数名）；配置词汇无法原样沿用任何一家。
- 适用范围：上述版本。

### C-6 几处「名字和行为不一致」的坑，实测确认

- `cockatiel` 的 `maxAttempts` 是重试次数（`1` → 2 次调用），而 `@lifeomic/attempt` 的 `maxAttempts`、`exponential-backoff` 的 `numOfAttempts` 是总次数（[E12](evidence.md#e12-行为探针node-v24180) P3）。同一个词两种含义。
- `cockatiel` 的 `exponent` 对三个生成器无效（P1）。
- `ts-retry-promise` 最后一次失败之后还要再睡一个退避才抛（P3：`retries: 1, delay: 300` 用时 602 ms；issue #57 开着）。
- `retry.timeouts({randomize: true})` 把随机后的序列升序重排（P1），第 n 次拿到的不是按第 n 次算出的那个值。
- `async-retry` 的 `randomize` 默认 `true`，与它底层 `retry` 的默认 `false` 相反（issue #109 开着）。
- `p-retry` 对非网络 `TypeError` 一律不重试，`shouldRetry` 返回 `true` 也不行（P4）。
- 适用范围：上述版本，均为实测或源码直读。

### C-7 取消：只有 `p-retry` 的睡眠能被打断；Node 24 自带可打断的睡眠

- **观察**：`p-retry` 睡眠中途取消 100 ms 即以取消原因拒绝；`cockatiel` 的退避睡眠不看信号，等满之后还会多调用一次（P2）；其余候选没有 `AbortSignal`（两个相关 PR 自 2024 年未合）。
  `node:timers/promises` 的 `setTimeout(ms, v, {signal})` 在 Node v24.18.0 上 101 ms 即以 `AbortError` 拒绝（P6）。
- **因此**：在契约的分工下，等待属于 loop，取消语义由 loop 的睡眠兑现，候选的这一差别不进入重试件；只有在执行器被采用时，`cockatiel` 的这一点才会变成「运行被取消后仍多发一次」的风险。
- 适用范围：上述版本、Node v24.18.0。

### C-8 维护与包形态

- **观察**（对照表一、[E2](evidence.md#e2-npm-注册表元数据与周下载量)–[E4](evidence.md#e4-github-仓库状态与未关问题)）：2026 年内发过版的只有 `cockatiel`（4.0.0）与 `p-retry`（8.0.0、8.0.1）；二者都是仅 ESM、`engines.node >=22`。
  `retry`、`async-retry`、`promise-retry` 自 2020–2021 年未发版。`p-retry` 从 **7.0.0（2025-08-21）起不再依赖 `retry`**，自己计算延迟——「p-retry 的底层是 retry」只对 6.x 及以前成立。
- **代价**：`cockatiel` 的提交集中在一位维护者（96 次，第二名是 dependabot）；它是整套韧性库，只用退避也会装上 291 KB（`sideEffects:false`，按 ESM 摇树可只打进用到的模块）。
- 适用范围：2026-09-25 的注册表与 GitHub 快照。

### C-9 tenacity 的形状是「判定者」，TS 里最接近的是 cockatiel 的退避对象

- **观察**：tenacity 9.1.4 的等待策略是可调用对象 `wait(retry_state) -> 秒数`，`retry_state` 带 `attempt_number`、`outcome`（结果或异常）等；等待、停止（`stop_*`）、是否重试（`retry_if_*`）三类策略分开、可组合（`wait_combine`、`wait_chain`、`stop_any`、`retry_any`）；指数等待有 `multiplier`、`exp_base`、`min`、`max`，full jitter 与「指数 + 加性抖动」各有一个（[E15](evidence.md#e15-tenacity-914-的策略形状)）。
  TS 候选里能收到「上一次失败」再算等待的只有 `cockatiel` 的 `DelegateBackoff`（上下文带 `result`）；`retry`、`@lifeomic/attempt` 的计算只看序号。`effect` 的 `Schedule` 组合能力最强，但要 Effect 运行时，装上 30 MB（[E16](evidence.md#e16-effect-3222-的-schedule只核签名)）。
- **因此**：「像 tenacity 那样把等待、停止、是否重试分成三个可换的策略」在 TS 候选里没有现成对应；最近的是 cockatiel 的「策略谓词 + 退避对象」两件，停止条件仍要自己写（而且在本项目里本就归 S-35）。
- 适用范围：tenacity 9.1.4、effect 3.22.2（只核类型签名）。

## 按本项目约束的契合度排序

**这不是选型**：选型归 record 家族。下面只把上面的事实按一组写明的判据排成次序，判据变了次序就变。

判据（按权重从高到低）：① 能否在不引入执行器的前提下单独交出延迟计算（C-1、C-2 使它成为前提）；② 对 R-6 七维的覆盖（C-5）；③ 维护活跃、ESM 与自带类型（C-8）；④ 依赖与体积；⑤ 已知的语义坑（C-6）。

| 次序 | 候选 | 理由 | 代价 |
|---|---|---|---|
| 1 | `cockatiel@4.0.0` | ① 满足（不可变退避对象，`DelegateBackoff` 还能看上一次失败）；② 种类与抖动最全；③ 2026 年发版、ESM、TS 编写；④ 零依赖 | 倍率只在 decorrelated 里生效、无线性与下限；decorrelated 状态不可序列化；单一主要维护者；整套库 291 KB；执行器的睡眠不看取消信号（只在用执行器时相关） |
| 2 | `@lifeomic/attempt@3.1.0` | ① 满足（`defaultCalculateDelay` 是序号的纯函数）；② 基数、倍率、上限、下限、full jitter 齐；④ 零依赖、71 KB | ③ 最后发版 2024-03、CJS、AbortSignal PR 两年未合；`factor` 默认 0；计算只看序号，看不到失败原因 |
| 3 | `retry@0.13.1` | ① 满足（`createTimeout(n)`）；④ 零依赖、36 KB；下载基数最大 | ② 抖动只有乘 `[1,2)`；③ 2021 年后未发版、CJS、要装 `@types/retry`；`timeouts()` 的重排坑 |
| 4 | `p-retry@8.0.1` | ③ 最活跃、ESM；执行器最完整（可打断睡眠、`shouldRetry`／`shouldConsumeRetry`、单调时钟的总时限） | ① 不满足：延迟计算私有，在当前契约分工下只剩「参数名可参照」；非网络 `TypeError` 硬编码不重试 |
| 5 | `exponential-backoff@3.1.3` | ② 基数、倍率、上限、none/full 抖动齐；Apache-2.0、带来源证明 | ① 不满足（计算只在深路径）；无取消；CJS |
| 6 | `ts-retry-promise@0.8.1` | 有线性与自定义函数 | ① 不满足；「指数」是 `delay^n`；最后一次失败后多睡一次；总超时默认 60 s；2024 年后未发版 |
| 7 | `async-retry@1.3.3`（`promise-retry@2.0.1` 同档） | 只是 `retry` 的执行器包装 | ① 不满足；2021 年（2020 年）后未发版；`randomize` 默认相反 |

**若判据 ① 被拿掉**（即契约改成让重试件自己执行等待与再发），次序会变：`p-retry` 升到第一（取消、谓词、钩子、维护都最好），`cockatiel` 第二（但要先解决睡眠不看信号），`exponential-backoff` 第三。那一读法与 C-1 所列的 S-30 ④、S-29 末条冲突，是否改分工不归本调查。

另一个始终存在的参照点：P-5 当前是零依赖的纯函数，退避取 `[1000, 2000, 4000]` 列表（D-060 N-33、M67）。任何候选进来都把「零依赖」变成「一个依赖」；三个满足判据 ① 的候选里，被用到的部分都是十余行的算术（[E5](evidence.md#e5-cockatiel-400)、[E7](evidence.md#e7-retry-0131)、[E11](evidence.md#e11-lifeomicattempt-310) 的源码原样在 `sources/lib/`）。

## 局限与未决

- 周下载无法拆出直接依赖与传递依赖；「采用度」只作量级参考。
- 没有跑任何候选的自带测试套件，也没有压测；行为结论来自源码直读与本轮探针（`sources/probe/`，可复跑）。
- `effect` 只核了 `Schedule.d.ts` 的导出签名与安装体积，未跑。
- 负面结论（「没有换目标概念」「没有取消」）是「读遍导出面与源码没找到」级别；「睡眠不看取消信号」「倍率被忽略」「最后多睡一次」三条是构造反例实测过的。
- 未检索第三方评测与弃用迁移案例；短板取自各仓库的未关 issue／PR 与本轮实测。
