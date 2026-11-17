# @omne-harness/pqw-adapter

## 总体架构

pqw-adapter 是收口读数的适配层。它按 omne 的成员、阈值与测试分层调用 pqw `slice-closeout` 自带的两个脚本 `metrics.mjs` 与 `mutation.mjs`，并按改动路径推出风险级别。本成员不发布。

| 命令 | 根脚本 | 回答什么 |
| --- | --- | --- |
| `metrics` | `pnpm run closeout:metrics` | 改动成员的圈复杂度、覆盖率与 CRAP |
| `mutation` | `pnpm run closeout:mutation` | 这次改动的行有没有被测试守住 |
| `risk` | `pnpm run risk` | 这次改动的风险级别下限 |

每个命令的参数与退出码见 `cli.ts --help`。

## 领域边界

本成员拥有：改动文件怎样归到成员、每个成员怎样构建与跑测试、把哪些线与断言写法交给 pqw、风险级别的路径规则。

本成员不拥有：

- 圈复杂度、CRAP、基线配对、TypeScript 解析与 Stryker 配置：归 pqw。
- 成员预算、重复代码、依赖方向与环：归 repo-toolchain 与 `pnpm run lint:deps`。
- 风险级别的定义：归[质量论证](../../docs/architecture/assurance.md#按风险选择接受实现的看法)。
- 工具链路径清单：归 `github-gate` 分支的 `gate/toolchain-paths.txt`。
- 线与断言写法的取值：归 `repo-toolchain.config.json`。

## 心智模型

- 差分变异回答「这次的改动有没有被测试守住」。函数里没改的行测的是改动之前的代码，那是整仓健康读数的事。
- 适配层只组织调用，读数本身全部出自 pqw。

## 应然设计

### 基线与改动

`<起点>` 是基线提交。基线不是 HEAD 的祖先时，三个命令都改用它与 HEAD 的合并点，与 pqw 的取法一致。改动文件是合并点到工作树的全部改动，含未提交与未跟踪的文件。

### metrics

- 改动文件按成员分组。命令先用 turbo 构建有 `test` 脚本的改动成员及其上游，再在每个成员目录跑一遍 vitest 覆盖率（lcov），然后对每个成员调一次 `metrics.mjs`。
- 不归任何成员的改动文件另调一次，只量复杂度，不跑覆盖率。
- 缺省只跑快层。`--full` 快慢两层都跑，pqw 对两份 lcov 取并。
- 圈复杂度与 CRAP 用同一对线，取自 `metrics.thresholds`。断言写法取自 `loop.sensors.assertions.assertionPattern`。
- 输出不超过 12 行的摘要，再列出每个成员的 JSON 路径。

### mutation

- 范围是改动的行本身，不扩到改动行所在的整个函数，适配层不传 `--whole-units`。
- 命令先对每个改动成员调 `mutation.mjs --plan-only` 列出范围。范围合计超过 `--max-lines` 时拒绝运行，退出 2。
- 没给 `--plan-only` 时，命令构建成员的上游，再对每个成员调一次 `mutation.mjs --project`。范围为空的成员不构建、不跑，只打印一行。
- 命令可用的 CPU 数：经仓库的令牌池起时是拿到的令牌数（`OMNE_WORKER_BUDGET`），直接起时是本机的逻辑核数。读数与变异的进程数都从这个数分。
- 范围行数大的成员先开跑，按范围行数的占比分到更多 Stryker 进程。同时在跑的进程数之和不超过 CPU 数，一个成员跑完，它的进程立刻给下一个成员。
- 变异只跑快层，配置是 `resources/vitest-fast.config.mts`，每条用例的时限是 60 秒。
- 带 `source-text` 标签的用例不参加变异。这类用例按源码文本下结论（例如按源码字节算发布摘要），变异工具给源码插桩之后文本必然不同，初跑就红。
- 一个变异体的时限由 pqw 定：系数乘以它要跑的用例在初跑里的用时，再加一个常数。`--timeout-factor` 与 `--timeout` 原样交给 `mutation.mjs`，没给时用 pqw 的缺省。超时记杀死。
- 缺省只跑一轮。给了 `--recheck` 时，`mutation.mjs` 对超时的变异体再起一轮串行复核，`--recheck-limit` 是这一轮最多复核的位点数。
- 存活不影响退出码。测量无效时退出 1。

### risk

按改动路径推出风险级别的下限，并打印命中的路径规则。工具链路径从 `origin/github-gate`（没有时读本地 `github-gate`）的 `gate/toolchain-paths.txt` 读，由 git 按 pathspec 匹配。读不到这份清单时，命令照样打印级别并标「不完整」，然后退出 1。

### 读哪一版 pqw 脚本

`.meta_harness/.vendor-float/pqw-skills` 的接入约定版本等于项目钉的版本时读它，否则读子模块 `.meta_harness/agents/vendor/pqw-skills`。适配层与技能正文读同一处。

### 产物与退出码

- 产物缺省写在系统临时目录的 `omne-closeout/<提交>[-dirty]/` 下，在工作树之外。
- 退出 0 正常。1 构建失败、读数失败、变异测量无效，或风险规则没判全。2 用法错误，或变异范围超过上限。

## 原则与约束

- 适配层不计算圈复杂度与 CRAP，不做基线配对或 TypeScript 解析，也不拼 Stryker 配置。这些归 pqw。
- 变异时机器负载高，离 5 秒缺省时限近的用例会超时，判定就随负载变，所以变异配置把每条用例的时限放到 60 秒。
- 负载让墙钟成倍变慢，所以变异体时限的余量加在系数上。适配层不自己定系数，也不改写 pqw 的裁定。
- 产物不写进工作树。

## 不变式

- 变异范围超过上限时，命令不起任何 Stryker 进程。
- 同时在跑的 Stryker 进程数之和不超过 CPU 数。
- 风险规则没判全时，命令不以 0 退出。
