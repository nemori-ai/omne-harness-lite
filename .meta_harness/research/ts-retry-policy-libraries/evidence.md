# 可复核的来源与观察

本页按来源分条：每条记精确对象与版本、URL、取证日期（全部 **2026-09-25**）、取得方式、来源立场、实际观察与支持范围。
结论只在 [research.md](research.md)；本页不复制结论，只让每条结论能指回这里的 `E-n`。

**字节钉住的来源**在 [sources/](sources/) 随包保存，校验：`cd sources && sha256sum -c SHA256SUMS`；逐文件的上游 URL、取得方式与是否经过加工见 `sources/provenance.json`。

- `sources/registry/`：npm 注册表 `…/<包>/latest` 与下载 API 的原样 JSON；`version-history-derived-*.json` 是从完整 packument 抽出的版本、发布时间、依赖、`engines` 子集（加工过，不是原样字节）。
- `sources/lib/`：各包 tarball 解出的关键源文件原样复制（扩展名加 `.txt`，路径里的 `/` 写成 `_`）；与 tarball 的对应以 `registry/*-latest-*.json` 里的 `dist.integrity` 为准。
- `sources/github/`：`gh api` 抽取的仓库状态、最近提交、未关 issue／PR（jq 字段子集），以及 cockatiel `master` 上的 changelog 原文。
- `sources/probe/`：本轮自写的探针、锁文件与输出。复跑：把 `package.json`、`package-lock.json`、`probe.mjs`、`typeprobe.mts`、`tsconfig.json` 拷到空目录，`npm ci && node probe.mjs && npx tsc -p tsconfig.json`。
- `sources/tenacity/`：`tenacity-9.1.4-py3-none-any.whl` 里 `wait.py`、`stop.py`、`retry.py` 原样（wheel 的 sha256 `6095a360c919085f28c6527de529e76a06ad89b23659fa881ae0649b867a9d55`）。

**版本 token**（上游升级时 grep 本页与 `sources/`）：`cockatiel 4.0.0`、`p-retry 8.0.1`、`retry 0.13.1`、`exponential-backoff 3.1.3`、`async-retry 1.3.3`、`ts-retry-promise 0.8.1`、`@lifeomic/attempt 3.1.0`、`promise-retry 2.0.1`、
`is-network-error 1.3.2`、`effect 3.22.2`、`tenacity 9.1.4`；Node `v24.18.0`、npm `11.16.0`、TypeScript `6.0.3`、`@types/node 24.13.6`、`@types/retry 0.12.5`、`@types/async-retry 1.4.9`、`@types/promise-retry 1.1.6`。

---

## E1 本项目对重试件的约束：契约、节点与裁决

- 消费对象：research.md「问题与区分条件」、[C-1](research.md#c-1-候选的执行器与契约里重试件的位置对不上)、[C-3](research.md#c-3-退避序号要从事实里推出来库里的计数不跨进程)、[C-4](research.md#c-4-换家没有一个库能表达s-35-的产品规则全落在本项目代码里)。
- 来源：本工作树 `panqiwei/assets-runtimes`，2026-09-25 读取。
  - [契约 `capability.model-request-runtime` v2](../../design/spec/capabilities/model-request-runtime/v2/contract.md)：S-29、S-30、S-35、G-8、S-41。
  - [节点 model-request-runtime 设计](../../design/realization/packages/model/model-request-runtime/design.md)：P-5 一行与「S-35 默认重试件」操作落点一行。
  - [D-063](../../design/record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-6；D-060 N-33（`record/decisions/mainline-self-rulings-2026-09/decision.md`）。
- 来源立场：本项目自己的候选契约与裁决，不是上游事实。
- 实际观察（原文摘录）：
  - S-30 ④：「`after` 给出时**由 loop 在退避到期之后才调用本操作**——本能力不替它计时」。
  - S-29 末条：「**传输层不得在一次发出之内隐藏重试**……重试只能是下一次 `dispatchAgain`。」
  - S-30 守卫表：`already_spoke`、`fact_class`、`provider_not_allowed`；`plan` 只许 `provider`、`after` 两个成员。
  - S-35 的五条：只对 `upstream_unavailable`／`unrecognized` 出手；逐家一遍、每家至多一次；不允许回退时同家至多再试一次；`after` 取 `default_retry_backoff`；没有下一家即试尽。
  - 节点 P-5：「`defaultRetryBackoff`（逐次取值、超出列表取最后一值，停止只由 S-35 决定，N-33）……**默认 `[1000, 2000, 4000]` ms**」；S-35 落点：「P-5 登记的实现：纯函数（快照里的供应商次序、允不允许回退、已试过的家、最近成因）→ `retry { provider, after }` 或 `observed`」「零依赖」。
  - D-063 R-6：「重试是**可配置策略**（次数、退避种类、基数、倍率、上限、抖动、哪些失败才重试），默认值只是配置初值；调度复用成熟 TS 库（候选 `cockatiel`、`p-retry`，按 research 取证后钉版）；产品规则（同家至多一次、逐家一遍才停）仍由契约 S-35 与 S16-g 约束策略」。
- 支持范围：重试件在本项目里的角色是「给结论」，不是「执行」；这是候选契约当前正文，契约改分工则 C-1 的前提变。

## E2 npm 注册表元数据与周下载量

- 消费对象：对照表一、[C-8](research.md#c-8-维护与包形态)。
- 来源：`https://registry.npmjs.org/<包>/latest`、`https://registry.npmjs.org/<包>`（完整 packument）、`https://api.npmjs.org/downloads/point/2026-09-18:2026-09-24/<包>`；2026-09-25 `curl -s`，全部 HTTP 200。原样 JSON 在 `sources/registry/`。
- 来源立场：注册表事实（发布者自填的 `license`、`engines` 等字段未经独立核验，许可另读了包内 LICENSE 文件）。
- 实际观察：

| 包 | `version` | 发布时间（`time[version]`） | `license` | `type` | `engines.node` | `dependencies` | `dist.unpackedSize` | 周下载 | `dist.integrity`（前 20 字符） |
|---|---|---|---|---|---|---|---|---|---|
| cockatiel | 4.0.0 | 2026-05-26T17:42:49Z | MIT | module | >=22 | — | 262,069 | 1,020,380 | `sha512-XpUZJnogsd03BGB1` |
| p-retry | 8.0.1 | 2026-09-01T13:15:38Z | MIT | module | >=22 | is-network-error ^1.3.0 | 25,762 | 30,658,644 | `sha512-NAigyu8hfvJe7MsS` |
| retry | 0.13.1 | 2021-06-21T07:45:32Z | MIT | — | >= 4 | — | 18,852 | 61,490,579 | `sha512-XQBQ3I8W1Cge0Seh` |
| exponential-backoff | 3.1.3 | 2025-10-10T23:10:07Z | Apache-2.0 | — | — | — | 55,183 | 20,284,414 | `sha512-ZgEeZXj30q+I0EN+` |
| async-retry | 1.3.3 | 2021-08-17T02:10:33Z | MIT | — | — | retry 0.13.1 | 5,215 | 16,080,239 | `sha512-wfr/jstw9xNi/0te` |
| ts-retry-promise | 0.8.1 | 2024-05-19T07:37:45Z | MIT | — | >=6 | — | 33,528 | 365,421 | `sha512-+AHPUmAhr5bSRRK5` |
| @lifeomic/attempt | 3.1.0 | 2024-03-21T15:17:01Z | MIT | — | — | — | 33,525 | 621,903 | `sha512-QZqem4QuAnAyzfz+` |
| promise-retry | 2.0.1 | 2020-06-14T13:09:02Z | MIT | — | >=10 | retry ^0.12.0, err-code ^2.0.2 | 15,556 | 14,768,728 | `sha512-y+WKFlBR8BGXnsNl` |
| effect | 3.22.2 | 2026-09-09T06:35:32Z | MIT | — | — | fast-check ^3.23.1, @standard-schema/spec ^1.0.0 | 27,163,958 | 19,743,548 | 见原样 JSON |

  - 完整 integrity 在 `sources/registry/*-latest-2026-09-25.json` 的 `dist.integrity`；只有 exponential-backoff 的 `dist.attestations` 存在（npm 来源证明）。
  - 均无 `deprecated` 字段。`retry` 的 GitHub 仓库许可显示 `NOASSERTION`（GitHub 未识别），包内 `License` 文件为 MIT 文本。`exponential-backoff` 包内只有 `LICENSE`，无 `NOTICE`。
- 支持范围：版本、日期、许可、依赖声明与一周下载量。**不支持**：直接采用度（下载量含传递依赖，无法拆分）。

## E3 版本史：p-retry 何时离开 retry，cockatiel 何时变成 ESM

- 消费对象：[C-8](research.md#c-8-维护与包形态)。
- 来源：完整 packument（同 E2），抽取结果在 `sources/registry/version-history-derived-2026-09-25.json`（加工过的字段子集）；cockatiel changelog 原文 `sources/github/connor4312_cockatiel-changelog-master-2026-09-25.md.txt`（`https://github.com/connor4312/cockatiel/blob/master/changelog.md`，`master` 当日 SHA 记在同目录 `…-master-sha-…txt`）。
- 实际观察：
  - p-retry：1.0.0～6.2.1 依赖 `retry`（6.x 为 `^0.13.1`）；**7.0.0-0（2025-05-06）与 7.0.0（2025-08-21）起只依赖 `is-network-error`**；`engines`：7.x `>=20`，8.x `>=22`；5.0.0（2021-11-03）起 `type: module`。
  - cockatiel：0.1.0～3.2.1 均无运行时依赖；3.x `engines >=16`、CJS；4.0.0（2026-05-26）`type: module`、`engines >=22`。changelog 4.0.0 节原文：「**breaking:** updated minimum Node version to 22, and cockatiel is now built as an ES module」「errors surfaced from policies are no longer cast via `as Error`; callback and result types now reflect `unknown` for thrown values」。
  - changelog 3.2.0：「provide the attempt number to retry's context」；3.1.3：「decorrelatedJitter backoff returning NaN after many iterations」已修。
- 支持范围：依赖关系与模块形态的时间点。

## E4 GitHub 仓库状态与未关问题

- 消费对象：对照表一、[C-6](research.md#c-6-几处名字和行为不一致的坑实测确认)、[C-7](research.md#c-7-取消只有-p-retry-的睡眠能被打断node-24-自带可打断的睡眠)、[C-8](research.md#c-8-维护与包形态)。
- 来源：`gh api repos/<owner>/<repo>`、`…/commits?per_page=3`、`…/issues?state=open&per_page=50`，2026-09-25；快照在 `sources/github/<owner>_<repo>-2026-09-25.json`；另取单条 issue：ts-retry-promise #57、#59，exponential-backoff #69，async-retry #109。
- 来源立场：仓库元数据是平台事实；issue 正文是报告者自述，本轮对其中三条做了实测复现（见 E12）。
- 实际观察：

| 仓库 | 最近推送 | 最近一次提交（主题） | 开着的 issue + PR | star |
|---|---|---|---|---|
| connor4312/cockatiel | 2026-09-06 | `80b5ed6` chore(deps): bump js-yaml | 3（#120 PR、#111、#80） | 1824 |
| sindresorhus/p-retry | 2026-09-18 | `1472907` Meta tweaks | 1 | 1034 |
| tim-kos/node-retry | 2023-09-13 | `11efd6e`（2022-01-20）Adding "keywords" | 23（#93、#95 与 PR #94、#96 为 2026 年新开） | 1258 |
| coveooss/exponential-backoff | 2025-10-10 | `5622170` chore: release v3.1.3 | 6（#69 Accept signal、PR #70 Add Abort Signal，均 2024） | 408 |
| vercel/async-retry | 2023-07-19 | `9505be1`（2021-08-17）1.3.3 | 30（含 #109「randomize default is true not false」） | 1919 |
| normartin/ts-retry-promise | 2024-10-31 | `d75544d`（2024-10-08）Bump elliptic | 5（#57、#59） | 63 |
| lifeomic/attempt | 2026-09-13 | `a1a7579`（2026-04-10）bump lodash | 8（PR #69 AbortSignal support、#70，均 2024-10） | 197 |
| IndigoUnited/node-promise-retry | 2022-12-30 | — | 11 | 319 |

  - ts-retry-promise #57（2025-02-11）标题原文：「Between last error and actual throwing we have the useless backoff applied.」；#59（2025-08-26）：「Exponential backoff grows surprisingly fast」，正文列出默认 `delay` 下第 2 次 10 s、第 3 次约 17 min，并指出默认 60 s 总超时下只会有三次调用。
  - cockatiel 贡献者：connor4312 96 次，dependabot 15 次，其余 ≤4 次。
- 支持范围：维护活跃度与已知缺陷是否被上游承认。**不支持**：维护者对未关问题的态度（未读评论）。

## E5 cockatiel 4.0.0

- 消费对象：对照表二「cockatiel」列、[C-2](research.md#c-2-能单独交出延迟计算的只有三个)、[C-3](research.md#c-3-退避序号要从事实里推出来库里的计数不跨进程)、[C-5](research.md#c-5-配置面没有一个候选同时覆盖-r-6-列出的全部维度)、[C-6](research.md#c-6-几处名字和行为不一致的坑实测确认)。
- 来源：tarball `https://registry.npmjs.org/cockatiel/-/cockatiel-4.0.0.tgz`（integrity 见 E2），`npm install` 解出；原样文件 `sources/lib/cockatiel-4.0.0__*`（`RetryPolicy.js`、`backoff/ExponentialBackoff.js`、`backoff/ExponentialBackoffGenerators.js`、`backoff/DelegateBackoff.js`、`common/Executor.js`、`readme.md`）。
- 来源立场：作者代码与作者文档；文档与实现不一致处照实分列。
- 实际观察：
  - 退避接口：`IBackoffFactory<T>.next(context: T): IBackoff<T>`，`IBackoff` 带只读 `duration` 与 `next`；README：「Backoff algorithms are immutable.」
  - `ExponentialBackoff` 默认 `{ generator: decorrelatedJitterGenerator, maxDelay: 30000, exponent: 2, initialDelay: 128 }`。
  - `noJitterGenerator = (attempts = 0, options) => [Math.min(options.maxDelay, options.initialDelay * 2 ** attempts), attempts + 1]`——**底数写死 2，不读 `options.exponent`**；`fullJitterGenerator`、`halfJitterGenerator` 都调用它。只有 `decorrelatedJitterGenerator` 读 `options.exponent`，其状态为 `[attempt, prev]`，下一值依赖 `prev` 与 `Math.random()`。
  - `DelegateBackoff(fn)`：`fn(context, state?) → number | {delay, state}`；README 示例在函数里 `throw` 以终止重试。`IterableBackoff(list)`：到末尾后一直取末值。`ConstantBackoff(ms)`。
  - `RetryPolicy.execute(fn, signal)`：`for (let retries = 0;; retries++)`，失败且 `!signal.aborted && retries < maxAttempts` 才退避；`delay(duration, unref)` 只是 `setTimeout`，**不监听 signal**；`onRetry` 在睡前触发，带 `delay`、`attempt`。
  - 策略谓词：`handleAll`、`handleType(cls, pred?)`、`handleWhen(pred)`、`handleResultType`、`handleWhenResult`；`Executor.invoke` 对未被谓词接住的错误直接抛出。
  - README 对 `maxAttempts` 的描述：「the number of attempts to make before giving up」；示例注释「retry three times」。实现是重试次数（见 E12 P3）。
  - `fallback(policy, valueOrFactory)` 返回替代值；README 与类型里没有「下一个目标」一类概念（读遍导出面未见）。
- 支持范围：退避计算可单独调用、`exponent` 的作用范围、睡眠不响应取消、没有换目标概念（后者为「读遍未见」级）。

## E6 p-retry 8.0.1

- 消费对象：对照表二「p-retry」列、[C-2](research.md#c-2-能单独交出延迟计算的只有三个)、[C-6](research.md#c-6-几处名字和行为不一致的坑实测确认)、[C-7](research.md#c-7-取消只有-p-retry-的睡眠能被打断node-24-自带可打断的睡眠)。
- 来源：tarball `https://registry.npmjs.org/p-retry/-/p-retry-8.0.1.tgz`；原样 `sources/lib/p-retry-8.0.1__index.js.txt`、`…__index.d.ts.txt`。
- 来源立场：作者代码。
- 实际观察：
  - 导出只有 `default pRetry`、`makeRetriable`、`AbortError` 与类型；`calculateDelay(retriesConsumed, options)` 是模块内函数，**未导出**。
  - 延迟：`Math.round(random * minTimeout * factor ** (attempt - 1))`，`random = randomize ? Math.random() + 1 : 1`，再 `Math.min(…, maxTimeout)`。
  - 默认：`retries 10`、`factor 2`、`minTimeout 1000`、`maxTimeout ∞`、`maxRetryTime ∞`（`performance.now()` 单调时钟）、`randomize false`。
  - `if (normalizedError instanceof TypeError && !isNetworkError(normalizedError)) throw normalizedError;` 排在 `shouldRetry` 之前。
  - `delayForRetry` 监听 `signal` 的 `abort`，触发即 `reject(options.signal.reason)`；循环前后多处 `signal?.throwIfAborted()`。
  - `input(attemptNumber)` 收到从 1 起的尝试序号；上下文 `RetryContext{error, attemptNumber, retriesLeft, retriesConsumed, retryDelay}` 只给钩子与谓词。
- 支持范围：计算不可单独调用、取消语义、`TypeError` 短路。

## E7 retry 0.13.1

- 消费对象：对照表二「retry」列、[C-2](research.md#c-2-能单独交出延迟计算的只有三个)、[C-6](research.md#c-6-几处名字和行为不一致的坑实测确认)。
- 来源：tarball `https://registry.npmjs.org/retry/-/retry-0.13.1.tgz`；原样 `sources/lib/retry-0.13.1__lib_retry.js.txt`、`…__lib_retry_operation.js.txt`。
- 实际观察：
  - 导出 `operation(opts)`、`timeouts(opts)`、`createTimeout(attempt, opts)`、`wrap(obj, opts, methods)`。
  - `createTimeout`：`Math.round(random * Math.max(minTimeout, 1) * Math.pow(factor, attempt))`，`random = randomize ? Math.random() + 1 : 1`，再 `Math.min(…, maxTimeout)`。
  - `timeouts()` 生成全部等待后执行 `timeouts.sort((a, b) => a - b)`。
  - `RetryOperation` 以 `new Date().getTime()` 计 `maxRetryTime`（墙钟）；无 `AbortSignal`，只有 `stop()`。
- 支持范围：计算可单独调用、随机后重排、墙钟。

## E8 exponential-backoff 3.1.3

- 消费对象：对照表二、[C-2](research.md#c-2-能单独交出延迟计算的只有三个)。
- 来源：tarball `https://registry.npmjs.org/exponential-backoff/-/exponential-backoff-3.1.3.tgz`；原样 `sources/lib/exponential-backoff-3.1.3__dist_options.d.ts.txt`、`…__dist_backoff.d.ts.txt`、`…__dist_delay_delay.base.js.txt`。
- 实际观察：
  - `backoff.d.ts` 只导出 `backOff(request: () => Promise<T>, options?)` 与选项类型；`package.json` 无 `exports` 字段，`DelayFactory` 在 `dist/delay/delay.factory.js`。
  - 选项默认：`delayFirstAttempt false`、`jitter "none"`、`maxDelay Infinity`、`numOfAttempts 10`（「The maximum number of times to attempt the function」）、`retry () => true`、`startingDelay 100`、`timeMultiple 2`。
  - 延迟：`startingDelay * timeMultiple ** attempt`，`Math.min(…, maxDelay)`；full jitter 为 `Math.round(Math.random() * delay)`。
  - 无 `signal` 选项（issue #69、PR #70 未合，见 E4）。
- 支持范围：计算不在公开接口、无取消。

## E9 async-retry 1.3.3 与 promise-retry 2.0.1

- 消费对象：对照表二、排序表第 7 行。
- 来源：tarball `https://registry.npmjs.org/async-retry/-/async-retry-1.3.3.tgz`，原样 `sources/lib/async-retry-1.3.3__lib_index.js.txt`；promise-retry 只读了注册表元数据（E2）与探针行为（E12 P3）。
- 实际观察：
  - async-retry 整个实现是 `retrier.operation(options)` 的 Promise 包装：`if (!('randomize' in options)) options.randomize = true;`；`fn(bail, num)`；`onRetry(err, num)`。
  - promise-retry 依赖 `retry ^0.12.0`（安装解析为 0.12.0）与 `err-code`；探针以 `promiseRetry((retry) => f().catch(retry), {retries: 1, minTimeout: 300})` 跑通。
- 支持范围：二者是 `retry` 的执行器包装，不增加计算面。promise-retry 源码本轮未逐行读。

## E10 ts-retry-promise 0.8.1

- 消费对象：对照表二、[C-6](research.md#c-6-几处名字和行为不一致的坑实测确认)。
- 来源：tarball `https://registry.npmjs.org/ts-retry-promise/-/ts-retry-promise-0.8.1.tgz`；原样 `sources/lib/ts-retry-promise-0.8.1__dist_retry-promise.js.txt`、`…d.ts.txt`；issue 见 E4。
- 实际观察：
  - `exponentialBackoff = (attempt, delay) => Math.pow(delay, attempt)`；`linearBackoff = attempt * delay`；三者都是模块内变量，未导出。
  - 默认 `{ backoff: "FIXED", delay: 100, maxBackOff: 300000, retries: 10, timeout: 60000, until: () => true, retryIf: () => true }`。
  - 循环：失败后先 `wait(millisToWait)`，再判 `done()`，再 `i++` 判 `i <= retries`——最后一次失败后仍会睡一次。
  - 被包函数签名 `f: () => Promise<T>`，不收序号。
- 支持范围：「指数」语义、最后多睡一次、无取消。

## E11 @lifeomic/attempt 3.1.0

- 消费对象：对照表二、[C-2](research.md#c-2-能单独交出延迟计算的只有三个)、[C-5](research.md#c-5-配置面没有一个候选同时覆盖-r-6-列出的全部维度)。
- 来源：tarball `https://registry.npmjs.org/@lifeomic/attempt/-/attempt-3.1.0.tgz`；原样 `sources/lib/lifeomic-attempt-3.1.0__dist_src_index.js.txt`、`…d.ts.txt`。
- 实际观察：
  - 导出 `sleep`、`defaultCalculateDelay`、`retry` 与类型。
  - `defaultCalculateDelay(context, options)`：`delay === 0` 返回 0；`factor` 非 0 时 `delay *= factor ** (attemptNum - 1)`，`maxDelay !== 0` 时封顶；`jitter` 时取 `[ceil(minDelay), floor(delay)]` 上的均匀整数（注释：「We're using the "full jitter" strategy」）。
  - 默认：`delay 200`、`initialDelay 0`、`minDelay 0`、`maxDelay 0`、`factor 0`、`maxAttempts 3`、`timeout 0`、`jitter false`。
  - 取消只有合作式 `context.abort()`；`sleep` 是裸 `setTimeout`。
  - `package.json`：`main ./dist/src/`、`module ./dist/es6/src/`、`types ./dist/src/index.d.ts`，无 `exports`。
- 支持范围：计算可单独调用、配置面、无 `AbortSignal`。

## E12 行为探针（Node v24.18.0）

- 消费对象：对照表一「Node 24」列、对照表二多格、[C-2](research.md#c-2-能单独交出延迟计算的只有三个)、[C-4](research.md#c-4-换家没有一个库能表达s-35-的产品规则全落在本项目代码里)、[C-6](research.md#c-6-几处名字和行为不一致的坑实测确认)、[C-7](research.md#c-7-取消只有-p-retry-的睡眠能被打断node-24-自带可打断的睡眠)。
- 来源：`sources/probe/probe.mjs`，依赖版本由同目录 `package-lock.json` 钉住；输出 `sources/probe/probe-output.txt`（2026-09-25 本机实跑，另复跑一次结论相同，随机值不同）。
- 来源立场：本轮构造的反例与测量。计时有 ±几 ms 的调度抖动。
- 实际观察（输出原文节选）：
  - P1 `cockatiel noJitter exponent=2 initial=100 max=10000: [100,200,400,800,1600,3200]`；`exponent=3` 时**同一序列**；`retry.createTimeout factor=3 …: [100,300,900,2700,8100,10000]`；`attempt.defaultCalculateDelay factor=3 …: [100,300,900,2700,8100,10000]`；`retry.timeouts randomize=true: [1766,2788,7800,13367,21310,43199]`（升序）。
  - P2 `cockatiel retry constant 1500ms maxAttempts 3: {"settledAfterMs":1501,"calls":2,"result":"rejected(boom)"}`（100 ms 时已取消）；`p-retry …: {"settledAfterMs":100,"calls":1,"result":"rejected(user-abort)"}`。
  - P3 `ts-retry-promise retries=1 delay=300 FIXED: {"totalMs":602,"calls":2}`；`cockatiel maxAttempts=1 constant 300: {"totalMs":301,"calls":2}`；`@lifeomic/attempt maxAttempts=2 …: {"calls":2}`；`exponential-backoff numOfAttempts=2 …: {"calls":2}`；`p-retry retries=1 …: {"totalMs":301,"calls":2}`。
  - P4 `p-retry non-network TypeError calls (shouldRetry=>true): 1`。
  - P5 `cockatiel per-attempt provider; stops on non-handled cause: {"seen":["A","B"],"finalError":"B",…}`；`p-retry per-attempt provider via attemptNumber: {"seen":["A","B","C"],"finalError":"C"}`。
  - P6 `node:timers/promises setTimeout 1500ms aborted at 100ms: {"settledAfterMs":101,"result":"rejected(AbortError; cause=user-abort)"}`。
- 支持范围：上述版本在本机 Node 上的实际行为。**不支持**：其他 Node 版本、浏览器、Bun/Deno。

## E13 类型探针：TypeScript 6.0.3，按仓库的严格 NodeNext 选项

- 消费对象：对照表一「Node 24」列与「模块形态 / 类型」列。
- 来源：`sources/probe/typeprobe.mts` 与 `sources/probe/tsconfig.json`；选项取自本仓库 `tsconfig.base.json`（`module/moduleResolution: NodeNext`、`strict`、`exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`、`isolatedModules`），另把 `skipLibCheck` 改为 `false` 以检查各包自带声明。
- 实际观察：`npx tsc -p tsconfig.json` 退出码 0，无诊断；覆盖八个包的默认／具名导入与各自主要选项。`retry`、`async-retry`、`promise-retry` 需要 `@types/*`（版本见页首）。
- 支持范围：在该配置下可编译。**不支持**：类型是否与运行时完全一致（未逐一核对）。

## E14 安装体积

- 消费对象：对照表一末列、[C-8](research.md#c-8-维护与包形态)、[C-9](research.md#c-9-tenacity-的形状是判定者ts-里最接近的是-cockatiel-的退避对象)。
- 来源：`sources/probe/footprint-2026-09-25.txt`：每个候选单独 `npm install --ignore-scripts` 到空目录后 `du -sb node_modules`。
- 实际观察：cockatiel 291,196 B（1 个包）；p-retry 44,345 B（2）；retry 35,678 B（1）；exponential-backoff 121,170 B（1）；async-retry 49,441 B（2）；ts-retry-promise 50,394 B（1）；@lifeomic/attempt 70,815 B（1）；promise-retry 102,177 B（3）；effect 30,273,953 B（4：effect、fast-check、pure-rand、@standard-schema/spec）。
- 支持范围：磁盘占用与传递依赖个数。**不支持**：打包后体积（未做摇树测量）。

## E15 tenacity 9.1.4 的策略形状

- 消费对象：[C-9](research.md#c-9-tenacity-的形状是判定者ts-里最接近的是-cockatiel-的退避对象)。
- 来源：PyPI `https://pypi.org/pypi/tenacity/json`（最新 9.1.4，上传 2026-02-07，许可 Apache 2.0）；wheel `https://files.pythonhosted.org/packages/d7/c1/eb8f9debc45d3b7918a32ab756658a0904732f75e555402972246b0b8e71/tenacity-9.1.4-py3-none-any.whl`；原样 `sources/tenacity/tenacity-9.1.4__{wait,stop,retry}.py.txt`；`RetryCallState` 读自同 wheel 的 `__init__.py`（未另存）。
- 实际观察：
  - `wait_base.__call__(self, retry_state) -> float`；`wait_exponential(multiplier=1, max=MAX_WAIT, exp_base=2, min=0)` 算 `multiplier * exp_base ** (attempt_number - 1)` 并夹在 `[min, max]`；`wait_random_exponential` 在 `[min, 上值]` 均匀取（docstring：对应 AWS「Full Jitter」）；`wait_exponential_jitter(initial=1, max, exp_base=2, jitter=1)` 为 `initial * exp_base ** (n-1) + uniform(0, jitter)` 封顶；另有 `wait_fixed`、`wait_random`、`wait_incrementing`、`wait_combine`、`wait_chain`、`wait_exception`。
  - 停止：`stop_after_attempt`、`stop_after_delay`、`stop_before_delay`、`stop_when_event_set`、`stop_any`、`stop_all`。是否重试：`retry_if_exception(_type)`、`retry_if_result`、`retry_if_exception_message`、`retry_any`、`retry_all` 等。
  - `RetryCallState` 字段：`attempt_number`、`outcome`、`outcome_timestamp`、`idle_for`、`next_action`、`upcoming_sleep`、`start_time`。
- 支持范围：tenacity 把「等多久」写成状态的函数、与「停不停」「重不重试」分开。**不支持**：其执行器（`Retrying`）的细节，本轮未读。

## E16 effect 3.22.2 的 Schedule（只核签名）

- 消费对象：[C-9](research.md#c-9-tenacity-的形状是判定者ts-里最接近的是-cockatiel-的退避对象)。
- 来源：`effect@3.22.2` 安装后的 `node_modules/effect/dist/dts/Schedule.d.ts`（未随包保存，版本与 integrity 见 `sources/registry/effect-latest-2026-09-25.json`）。
- 实际观察：导出 `exponential(base, factor?)`、`fibonacci`、`spaced`、`recurs(n)`、`jittered`、`jitteredWith`、`upTo`、`whileInput`、`union`、`intersect`、`andThen`、`addDelay`、`modifyDelay`、`delays`、`tapInput`、`driver`（返回 `Effect.Effect<ScheduleDriver>`）、`run`。
- 支持范围：组合面存在。**不支持**：行为（未跑）；在 Effect 运行时之外能否单独步进（`driver` 与 `run` 都返回 `Effect`，推断需要运行时，未验证）。
